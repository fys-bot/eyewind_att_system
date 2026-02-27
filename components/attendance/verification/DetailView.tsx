
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { AttendanceSheet, EmployeeAttendanceRecord, DingTalkUser, EmployeeSendStatus, EmployeeConfirmStatus, EmployeeViewStatus, User } from '../../../database/schema.ts';
import { ChevronLeftIcon, Loader2Icon, RefreshCwIcon, SendIcon, PencilIcon, DownloadIcon, ChevronUpIcon, ChevronDownIcon, ChevronsUpDownIcon, SearchIcon, Undo2Icon, AlertTriangleIcon } from '../../Icons.tsx';
import { Avatar, StatusBadge } from './Shared.tsx';
import { EditAttendanceModal, DingTalkPreviewModal, ConfirmChangesModal } from './Modals.tsx';
import { ArchivableDetailView } from './ArchiveView.tsx';
import { upsertAttendanceDataToDb, sendDingTalkNotifications, recallDingTalkNotifications, getEyewindToken } from './api.ts';
import { Modal } from '../../Modal.tsx';
import { db } from '../../../database/mockDb.ts';
import saveAs from 'file-saver';
import { AttendanceRuleManager } from '../AttendanceRuleEngine.ts';

// ... (StatCard Component remains same) ...
const StatCard: React.FC<{ label: string; value: number | string; icon: React.ReactNode; color: string; onClick?: () => void; isActive?: boolean }> = ({ label, value, icon, color, onClick, isActive }) => (
    <div 
        onClick={onClick}
        className={`relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl p-5 border shadow-sm transition-all group ${onClick ? 'cursor-pointer hover:shadow-md' : ''} ${isActive ? 'ring-2 ring-sky-500 border-sky-500 dark:border-sky-500' : 'border-slate-100 dark:border-slate-700'}`}
    >
        <div className={`absolute top-0 right-0 p-4 opacity-10 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform ${color}`}>
            {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-16 h-16' }) : icon}
        </div>
        <div className="relative z-10 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('500', '100')} dark:bg-opacity-20`}>
                {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: `w-6 h-6 ${color}` }) : icon}
            </div>
            <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white mt-0.5 font-mono">{value}</p>
            </div>
        </div>
    </div>
);

type SortableEmployeeRecordKeys = 'employeeName' | 'department' | 'sendStatus' | 'viewStatus' | 'confirmStatus';

export const AttendanceDetailView: React.FC<{
    sheet: AttendanceSheet;
    onBack: () => void;
    mainCompany: string;
    onUpdateSheet: (updatedSheet: AttendanceSheet) => void;
    dingTalkUsers: DingTalkUser[];
    isDingTalkDataLoading: boolean;
    onRefresh: (month: string) => void;
    isRefreshing: boolean;
    trigger: { month: string, timestamp: number } | null;
    userPermissions?: string[]; // New Prop
    currentUserInfo?: User; // New Prop for logging
}> = ({ sheet, onBack, onUpdateSheet, mainCompany, dingTalkUsers, isDingTalkDataLoading, onRefresh, isRefreshing, trigger, userPermissions = [], currentUserInfo }) => {
    // 🔥 添加调试日志
    // console.log('[DetailView] 组件渲染，sheet数据:', {
        // sheetId: sheet?.id,
        // sheetTitle: sheet?.title,
        // sheetMonth: sheet?.month,
        // employeeRecordsLength: sheet?.employeeRecords?.length,
        // employeeRecords: sheet?.employeeRecords,
        // hasSettings: !!sheet?.settings,
        // mainCompany
    // });

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortableEmployeeRecordKeys; direction: 'asc' | 'desc' } | null>({ key: 'employeeName', direction: 'asc' });

    // ... (State definitions remain same) ...
    const [editingRecord, setEditingRecord] = useState<EmployeeAttendanceRecord | null>(null);
    const [editingViewMode, setEditingViewMode] = useState<'preview' | 'edit'>('preview');
    const [changesToConfirm, setChangesToConfirm] = useState<{ record: EmployeeAttendanceRecord; changes: { label: string; oldValue: string; newValue: string }[] } | null>(null);

    const [recordsForPreview, setRecordsForPreview] = useState<EmployeeAttendanceRecord[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [isSending, setIsSending] = useState(false);
    const [isRecalling, setIsRecalling] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [recallConfirmData, setRecallConfirmData] = useState<{ type: 'single'; record: EmployeeAttendanceRecord } | { type: 'bulk'; records: EmployeeAttendanceRecord[] } | null>(null);
    const [recordToCapture, setRecordToCapture] = useState<EmployeeAttendanceRecord | null>(null);
    const [archivingRecordId, setArchivingRecordId] = useState<string | null>(null);
    const captureRef = useRef<HTMLDivElement>(null);
    const [bulkArchiveQueue, setBulkArchiveQueue] = useState<EmployeeAttendanceRecord[]>([]);
    const [bulkArchiveProgress, setBulkArchiveProgress] = useState<{ current: number; total: number } | null>(null);
    const [autoConfirmationStatus, setAutoConfirmationStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

    // Permission Checks
    const canSend = userPermissions.includes('attendance_verification:send');
    const canRecall = userPermissions.includes('attendance_verification:recall');
    const canEdit = userPermissions.includes('attendance_verification:edit');
    const canArchive = userPermissions.includes('attendance_verification:archive');

    // 🔥 获取规则开关状态
    const companyKey = (mainCompany?.includes('海多多') || mainCompany === 'hydodo') ? 'hydodo' : 'eyewind';
    const rules = AttendanceRuleManager.getEngine(companyKey).getRules();
    const lateExemptionEnabled = rules.lateExemptionEnabled ?? true;
    const fullAttendanceEnabled = rules.fullAttendanceEnabled ?? true;

    const textToDataUrl = (text: string): string => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return text;
        const font = 'italic 16px sans-serif';
        ctx.font = font;
        const metrics = ctx.measureText(text);
        canvas.width = metrics.width + 20;
        canvas.height = 40;
        ctx.font = font;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        return canvas.toDataURL('image/png');
    };

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const runAutoConfirm = async () => {
            if (!sheet.settings || !sheet.settings.autoConfirmEnabled || !sheet.settings.autoConfirmDate) return;
            if (!sheet.employeeRecords || !Array.isArray(sheet.employeeRecords)) return;
            const recordsToConfirm = sheet.employeeRecords.filter(r => r.confirmStatus === 'pending');
            if (recordsToConfirm.length === 0) { setAutoConfirmationStatus('done'); return; }
            setAutoConfirmationStatus('running');
            const now = new Date();
            const dateString = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const signatureText = `系统已于 ${dateString} 自动确认`;
            const signatureImageBase64 = textToDataUrl(signatureText);
            const updatedRecords = recordsToConfirm.map(r => ({
                ...r,
                confirmStatus: 'auto-confirmed' as EmployeeConfirmStatus,
                confirmed_at: now.toISOString(),
                signatureBase64: signatureImageBase64,
                confirm_typ: 'auto' as const,
            }));
            try {
                await upsertAttendanceDataToDb(sheet, updatedRecords, dingTalkUsers, mainCompany);
                const newAllRecords = (sheet.employeeRecords || []).map(r => {
                    const updated = updatedRecords.find(ur => ur.id === r.id);
                    return updated ? updated : r;
                });
                onUpdateSheet({ ...sheet, employeeRecords: newAllRecords });
                setAutoConfirmationStatus('done');
                
                // TODO: 集成后端 API 后，操作日志将由后端自动记录

            } catch (error) {
                setAutoConfirmationStatus('error');
                console.error("Auto-confirmation failed:", error);
            }
        };
        if (autoConfirmationStatus === 'idle' && sheet.settings && sheet.settings.autoConfirmEnabled && sheet.settings.autoConfirmDate) {
            const targetTime = new Date(sheet.settings.autoConfirmDate).getTime();
            const now = Date.now();
            const delay = targetTime - now;
            if (delay <= 0) { runAutoConfirm(); } else {
                if (delay < 24 * 60 * 60 * 1000) { timer = setTimeout(runAutoConfirm, delay); }
            }
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [sheet, onUpdateSheet, dingTalkUsers, mainCompany, autoConfirmationStatus]);

    useEffect(() => {
        const checkAndStartArchiving = async () => {
            if (trigger && trigger.month === sheet.month) {
                if (!sheet.employeeRecords || !Array.isArray(sheet.employeeRecords)) return;
                const signedRecords = sheet.employeeRecords.filter(r => r.signatureBase64);
                if (signedRecords.length === 0) return;
                const token = await getEyewindToken();
                try {
                    const response = await fetch(`https://eyewind.cn/admin/uploads/cloud-storage?paths=attendance/signatures/${sheet.month}/&pageSize=1000`, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (!response.ok) throw new Error(`Failed to fetch archive list: ${response.status}`);
                    const result = await response.json();
                    if (!result.data || !Array.isArray(result.data)) throw new Error('Invalid data structure');
                    const existingFiles = new Set(result.data.map((file: { name: string }) => { try { return decodeURIComponent(file.name); } catch (e) { return file.name; } }));
                    const recordsToArchive = signedRecords.filter(record => !existingFiles.has(`${record.employeeName}-${sheet.month}-考勤存档.png`));
                    if (recordsToArchive.length > 0) {
                        if (!archivingRecordId && bulkArchiveQueue.length === 0) {
                            alert(`检测到 ${recordsToArchive.length} 个已签名但未存档的记录，即将开始批量存档...`);
                            setBulkArchiveQueue(recordsToArchive);
                            setBulkArchiveProgress({ current: 0, total: recordsToArchive.length });
                        }
                    }
                } catch (error) {
                    console.error(`Error checking archive for month ${sheet.month}:`, error);
                    const recordsToArchive = signedRecords;
                    if (recordsToArchive.length > 0 && !archivingRecordId && bulkArchiveQueue.length === 0) {
                        alert(`检查存档状态时出错，将尝试为 ${recordsToArchive.length} 个已签名记录创建存档...`);
                        setBulkArchiveQueue(recordsToArchive);
                        setBulkArchiveProgress({ current: 0, total: recordsToArchive.length });
                    }
                }
            }
        };
        checkAndStartArchiving();
    }, [trigger, sheet.month, sheet.employeeRecords, archivingRecordId, bulkArchiveQueue.length]);

    useEffect(() => {
        if (!archivingRecordId && bulkArchiveQueue.length > 0) {
            const nextRecord = bulkArchiveQueue[0];
            setBulkArchiveProgress(prev => prev ? { ...prev, current: prev.total - bulkArchiveQueue.length + 1 } : null);
            setArchivingRecordId(nextRecord.id);
            setRecordToCapture(nextRecord);
        } else if (archivingRecordId === null && bulkArchiveQueue.length === 0 && bulkArchiveProgress !== null) {
            alert(`批量存档完成！共处理 ${bulkArchiveProgress.total} 个文件。`);
            
            // TODO: 集成后端 API 后，操作日志将由后端自动记录

            setBulkArchiveProgress(null);
            onRefresh(sheet.month);
        }
    }, [bulkArchiveQueue, archivingRecordId, currentUserInfo, sheet.title]);

    useEffect(() => {
        if (recordToCapture && captureRef.current) {
            const html2canvas = (window as any).html2canvas;
            if (html2canvas) {
                html2canvas(captureRef.current, { useCORS: true, scale: 2, backgroundColor: '#e0f2fe' }).then((canvas: HTMLCanvasElement) => {
                    canvas.toBlob(async (blob) => {
                        if (blob) {
                            const fileName = `${recordToCapture.employeeName}-${sheet.month}-考勤存档.png`;
                            if (!bulkArchiveProgress) saveAs(blob, fileName);
                            try {
                                const formData = new FormData();
                                formData.append('files', new File([blob], fileName, { type: 'image/png' }));
                                formData.append('prefix', `attendance/signatures/${sheet.month}/`);
                                const fid = fileName.replace('.png', '');
                                formData.append('extras', JSON.stringify({ [fileName]: { fid, tags: ["uncategorized"] } }));
                                const token = await getEyewindToken();
                                const response = await fetch('https://eyewind.cn/admin/uploads/cloud-storage', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
                                if (!response.ok) throw new Error(`CDN upload failed: ${response.status}`);
                                if (!bulkArchiveProgress) alert('存档已成功上传至CDN！');
                            } catch (uploadError) {
                                console.error("Error uploading to CDN:", uploadError);
                                if (!bulkArchiveProgress) alert(`存档上传失败: ${(uploadError as Error).message}`);
                            }
                        }
                        setRecordToCapture(null);
                        setArchivingRecordId(null);
                        if (bulkArchiveProgress) setBulkArchiveQueue(prev => prev.slice(1));
                    });
                }).catch((err: any) => {
                    console.error("html2canvas failed:", err);
                    setRecordToCapture(null);
                    setArchivingRecordId(null);
                    if (bulkArchiveProgress) setBulkArchiveQueue(prev => prev.slice(1));
                });
            }
        }
    }, [recordToCapture, sheet.month, bulkArchiveProgress]);

    const handleArchive = (record: EmployeeAttendanceRecord) => {
        if (archivingRecordId) return;
        setArchivingRecordId(record.id);
        setRecordToCapture(record);
        
        // TODO: 集成后端 API 后，操作日志将由后端自动记录
    };

    const handleBulkSend = () => {
        const recordsToSend = sortedRecords.filter(r => {
            const dingTalkUser = dingTalkUsers.find(u => u.name === r.employeeName);
            return r.sendStatus !== 'sent' && !(!dingTalkUser || !dingTalkUser.department);
        });
        if (recordsToSend.length === 0) { alert("没有需要发送的考勤单。"); return; }
        setRecordsForPreview(recordsToSend);
        setPreviewIndex(0);
    };

    const handleSingleSend = (record: EmployeeAttendanceRecord) => {
        setRecordsForPreview([record]);
        setPreviewIndex(0);
    };

    const handleSmartSendClick = (e: React.MouseEvent, record: EmployeeAttendanceRecord) => {
        e.stopPropagation();
        if (record.sendStatus === 'sent') {
            const sentTimeStr = record.sent_at ? new Date(record.sent_at).toLocaleString('zh-CN') : '未知时间';
            const shouldResend = window.confirm(`系统检测到您已于【${sentTimeStr}】向 ${record.employeeName} 发送过确认单。\n\n是否确定要重新发送？`);
            if (!shouldResend) return;
        }
        handleSingleSend(record);
    };

    const handleSendNotifications = async (records: EmployeeAttendanceRecord[]) => {
        setIsSending(true);
        setSendError(null);
        try {
            const results = await sendDingTalkNotifications(records, sheet, dingTalkUsers, mainCompany);
            // ... (Process results)
            const successfulSends = new Map<string, { corp_task_id: string; todo_task_id: string }>();
            results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ success: boolean }>).value.success).forEach(r => {
                const { name, corp_task_id, todo_task_id } = (r as PromiseFulfilledResult<any>).value;
                if (name) successfulSends.set(name, { corp_task_id, todo_task_id });
            });
            // ... (Handle errors and update)
            if (successfulSends.size > 0) {
                const newRecords = (sheet.employeeRecords || []).map(r => {
                    if (successfulSends.has(r.employeeName)) {
                        const { corp_task_id, todo_task_id } = successfulSends.get(r.employeeName)!;
                        return { ...r, sendStatus: 'sent' as EmployeeSendStatus, isModifiedAfterSent: false, corp_task_id, todo_task_id, sent_at: new Date().toISOString() };
                    }
                    return r;
                });
                const successfullySentRecordsForDbUpdate = newRecords.filter(r => successfulSends.has(r.employeeName));
                await upsertAttendanceDataToDb(sheet, successfullySentRecordsForDbUpdate, dingTalkUsers, mainCompany);
                onUpdateSheet({ ...sheet, employeeRecords: newRecords });

                // TODO: 集成后端 API 后，操作日志将由后端自动记录
            }
            setRecordsForPreview([]);
        } catch (error) {
            console.error("Error sending notifications:", error);
            setSendError(error instanceof Error ? error.message : "发送时发生未知错误。");
        } finally { setIsSending(false); }
    };

    // ... (Recall handlers, filters, sorts remain same) ...
    const handleSingleRecall = (e: React.MouseEvent, record: EmployeeAttendanceRecord) => {
        e.stopPropagation();
        setRecallConfirmData({ type: 'single', record });
    };

    const handleBulkRecall = () => {
        const sentRecords = sortedRecords.filter(r => r.sendStatus === 'sent');
        if (sentRecords.length === 0) { alert("当前没有已发送的考勤单可撤回。"); return; }
        setRecallConfirmData({ type: 'bulk', records: sentRecords });
    };

    const confirmRecall = async () => {
        if (!recallConfirmData) return;
        setIsRecalling(true);
        const { type } = recallConfirmData;
        let recordsToRecall: EmployeeAttendanceRecord[] = [];
        if (type === 'single') { recordsToRecall = [(recallConfirmData as { record: EmployeeAttendanceRecord }).record]; } 
        else { recordsToRecall = (recallConfirmData as { records: EmployeeAttendanceRecord[] }).records; }
        setRecallConfirmData(null); 

        try {
            const results = await recallDingTalkNotifications(recordsToRecall, dingTalkUsers, mainCompany);
            const successfulRecalls = new Set<string>();
            results.forEach((r) => { if (r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ success: boolean, name: string }>).value.success) { successfulRecalls.add((r as PromiseFulfilledResult<{ success: boolean, name: string }>).value.name); } });

            if (successfulRecalls.size > 0) {
                const token = await getEyewindToken();
                const filesToDelete: string[] = [];
                recordsToRecall.forEach(r => { if (successfulRecalls.has(r.employeeName)) { const fileName = `${r.employeeName}-${sheet.month}-考勤存档.png`; filesToDelete.push(`attendance/signatures/${sheet.month}/${fileName}`); } });
                if (filesToDelete.length > 0) { fetch('https://eyewind.cn/admin/uploads/cloud-storage', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(filesToDelete) }).catch(err => console.warn('Failed to delete CDN archives:', err)); }

                const newRecords = (sheet.employeeRecords || []).map(r => {
                    if (successfulRecalls.has(r.employeeName)) {
                        return { ...r, sendStatus: 'pending' as EmployeeSendStatus, viewStatus: 'pending' as EmployeeViewStatus, confirmStatus: 'pending' as EmployeeConfirmStatus, sent_at: null, viewed_at: null, confirmed_at: null, signatureBase64: null, isSigned: false, corp_task_id: null, todo_task_id: null };
                    }
                    return r;
                });
                const recordsToUpsert = newRecords.filter(r => successfulRecalls.has(r.employeeName));
                await upsertAttendanceDataToDb(sheet, recordsToUpsert, dingTalkUsers, mainCompany);
                onUpdateSheet({ ...sheet, employeeRecords: newRecords });
                
                // TODO: 集成后端 API 后，操作日志将由后端自动记录

                if (type === 'bulk') { alert(`成功撤回 ${successfulRecalls.size} 条通知。`); }
            } else { alert('撤回请求失败'); }
        } catch (error) { alert(`撤回失败: ${error}`); } finally { setIsRecalling(false); }
    };

    const filteredRecords = useMemo(() => {
        // console.log('[DetailView] filteredRecords计算，输入数据:', {
            // hasEmployeeRecords: !!sheet.employeeRecords,
            // isArray: Array.isArray(sheet.employeeRecords),
            // length: sheet.employeeRecords?.length,
            // searchTerm,
            // filterStatus,
            // employeeRecords: sheet.employeeRecords
        // });

        if (!sheet.employeeRecords || !Array.isArray(sheet.employeeRecords)) {
            // console.log('[DetailView] employeeRecords为空或不是数组，返回空数组');
            return [];
        }
        
        const filtered = sheet.employeeRecords.filter(record => {
            const nameMatch = record.employeeName?.toLowerCase().includes(searchTerm?.toLowerCase());
            let statusMatch = true;
            switch (filterStatus) {
                case 'all': statusMatch = true; break;
                case 'sent': statusMatch = record.sendStatus === 'sent'; break;
                case 'viewed': statusMatch = record.viewStatus === 'viewed'; break;
                case 'confirmed_all': statusMatch = record.confirmStatus === 'confirmed' || record.confirmStatus === 'auto-confirmed'; break;
                default: statusMatch = record.confirmStatus === filterStatus;
            }
            return nameMatch && statusMatch;
        });
        
        // console.log('[DetailView] 过滤后的记录数量:', filtered.length);
        return filtered;
    }, [sheet.employeeRecords, searchTerm, filterStatus]);

    const sortedRecords = useMemo(() => {
        let sortableItems = [...filteredRecords];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filteredRecords, sortConfig]);

    const requestSort = (key: SortableEmployeeRecordKeys) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const handleOpenEditModal = (record: EmployeeAttendanceRecord) => { setEditingRecord(record); setEditingViewMode('edit'); };
    const handleOpenPreviewModal = (record: EmployeeAttendanceRecord) => { setEditingRecord(record); setEditingViewMode('preview'); };

    const handleSaveRecord = (updatedRecord: EmployeeAttendanceRecord) => {
        if (!sheet.employeeRecords || !Array.isArray(sheet.employeeRecords)) return;
        const originalRecord = sheet.employeeRecords.find(r => r.id === updatedRecord.id);
        if (!originalRecord) return;
        const changes: { label: string; oldValue: string; newValue: string }[] = [];
        const allKeys = new Set([...Object.keys(originalRecord.dailyData), ...Object.keys(updatedRecord.dailyData)]);
        allKeys.forEach(key => {
            const oldVal = originalRecord.dailyData[key] || '';
            const newVal = updatedRecord.dailyData[key] || '';
            if (oldVal !== newVal) changes.push({ label: key, oldValue: oldVal, newValue: newVal });
        });
        if (changes.length > 0) setChangesToConfirm({ record: updatedRecord, changes });
        else setEditingRecord(null);
    };

    const handleConfirmSave = async () => {
        if (!changesToConfirm) return;
        const { record, changes } = changesToConfirm;
        if (!sheet.employeeRecords || !Array.isArray(sheet.employeeRecords)) return;
        const originalRecord = sheet.employeeRecords.find(r => r.id === record.id);
        let finalRecord = { ...record };
        if (originalRecord && originalRecord.sendStatus === 'sent') finalRecord.isModifiedAfterSent = true;
        try {
            await upsertAttendanceDataToDb(sheet, [finalRecord], dingTalkUsers, mainCompany);
            const newRecords = sheet.employeeRecords.map(r => r.id === finalRecord.id ? finalRecord : r);
            onUpdateSheet({ ...sheet, employeeRecords: newRecords });
            
            // Audit Log Edit
            if (currentUserInfo) {
                const changeDetails = changes.map(c => `${c.label}: [${c.oldValue}] -> [${c.newValue}]`).join('; ');
                db.addAuditLog({
                    userId: currentUserInfo.id,
                    userName: currentUserInfo.name,
                    userRole: currentUserInfo.roleName || 'Unknown',
                    action: 'EDIT',
                    target: `${record.employeeName} 的考勤明细`,
                    details: changeDetails
                });
            }

            setChangesToConfirm(null);
            setEditingRecord(finalRecord);
            setEditingViewMode('preview');
            
            // 保存成功提示
            alert('考勤数据已成功保存！');
        } catch (error) { console.error("Update failed", error); alert("保存失败，请重试"); }
    };

    // ... (Remainder of render remains mostly the same, ensuring buttons use permissions)
    const handleResend = (recordId: string) => { 
        if (!sheet.employeeRecords || !Array.isArray(sheet.employeeRecords)) return;
        const r = sheet.employeeRecords.find(r => r.id === recordId); 
        if (r) handleSingleSend(r); 
    };

    const SortableHeader: React.FC<{ sortKey: SortableEmployeeRecordKeys, label: string }> = ({ sortKey, label }) => (
        <th scope="col" className="px-4 py-3 cursor-pointer select-none" onClick={() => requestSort(sortKey)}>
            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-semibold text-xs uppercase tracking-wider">
                {label}
                {sortConfig?.key === sortKey ? 
                    (sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-3.5 h-3.5 text-sky-500" /> : <ChevronDownIcon className="w-3.5 h-3.5 text-sky-500" />) 
                    : <ChevronsUpDownIcon className="w-3.5 h-3.5 opacity-30" />
                }
            </div>
        </th>
    );

    const stats = useMemo(() => {
        if (!sheet.employeeRecords || !Array.isArray(sheet.employeeRecords)) {
            return { total: 0, sent: 0, viewed: 0, confirmed: 0 };
        }
        const total = sheet.employeeRecords.length;
        const sent = sheet.employeeRecords.filter(r => r.sendStatus === 'sent').length;
        const viewed = sheet.employeeRecords.filter(r => r.viewStatus === 'viewed').length;
        const confirmed = sheet.employeeRecords.filter(r => r.confirmStatus === 'confirmed' || r.confirmStatus === 'auto-confirmed').length;
        return { total, sent, viewed, confirmed };
    }, [sheet.employeeRecords]);

    const hasSentRecords = useMemo(() => {
        if (!sheet.employeeRecords || !Array.isArray(sheet.employeeRecords)) {
            return false;
        }
        return sheet.employeeRecords.some(r => r.sendStatus === 'sent');
    }, [sheet.employeeRecords]);

    return (
        <div className="flex flex-col h-[calc(100vh-5rem)] space-y-4">
            {recordToCapture && (
                <ArchivableDetailView ref={captureRef} sheet={sheet} record={recordToCapture} dingTalkUser={dingTalkUsers.find(u => u.name === recordToCapture.employeeName)} />
            )}
            
            {/* Fixed Top Section: Header & StatCards */}
            <div className="flex-shrink-0 space-y-4">
                <header>
                    <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-3 transition-colors">
                        <ChevronLeftIcon className="w-4 h-4" />
                        返回考勤确认列表
                    </button>
                    <div className="flex justify-between items-center">
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{sheet.title}</h2>
                        <div className="flex items-center gap-3">
                            <button onClick={() => onRefresh(sheet.month)} disabled={isRefreshing || !!bulkArchiveProgress} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-wait transition-all shadow-sm">
                                {isRefreshing || bulkArchiveProgress ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <RefreshCwIcon className="w-4 h-4" />}
                                {isRefreshing ? '正在刷新...' : bulkArchiveProgress ? `存档中 (${bulkArchiveProgress.current}/${bulkArchiveProgress.total})` : '刷新列表（同步存档CDN）'}
                            </button>
                            
                            {canSend && (
                                <button className="px-4 py-2 text-sm font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all">
                                    一键提醒
                                </button>
                            )}
                            
                            {canRecall && (
                                <button 
                                    onClick={handleBulkRecall} 
                                    disabled={!hasSentRecords || isRecalling}
                                    className="px-4 py-2 text-sm font-semibold bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isRecalling ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <Undo2Icon className="w-4 h-4" />}
                                    一键撤回
                                </button>
                            )}
                            
                            {canSend && (
                                <button onClick={handleBulkSend} className="px-4 py-2 text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-lg flex items-center gap-2 shadow-md shadow-sky-200 dark:shadow-none transition-all">
                                    <SendIcon className="w-4 h-4" />全部发送
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                {/* High-end Stat Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard 
                        label="总人数" 
                        value={stats.total} 
                        icon={<div className="bg-blue-500 rounded-full"></div>} 
                        color="text-blue-500" 
                        onClick={() => setFilterStatus('all')}
                        isActive={filterStatus === 'all'}
                    />
                    <StatCard 
                        label="已发送" 
                        value={stats.sent} 
                        icon={<div className="bg-indigo-500 rounded-full"></div>} 
                        color="text-indigo-500" 
                        onClick={() => setFilterStatus('sent')}
                        isActive={filterStatus === 'sent'}
                    />
                    <StatCard 
                        label="已查看" 
                        value={stats.viewed} 
                        icon={<div className="bg-amber-500 rounded-full"></div>} 
                        color="text-amber-500" 
                        onClick={() => setFilterStatus('viewed')}
                        isActive={filterStatus === 'viewed'}
                    />
                    <StatCard 
                        label="已确认" 
                        value={stats.confirmed} 
                        icon={<div className="bg-emerald-500 rounded-full"></div>} 
                        color="text-emerald-500" 
                        onClick={() => setFilterStatus('confirmed_all')}
                        isActive={filterStatus === 'confirmed_all'}
                    />
                </div>
            </div>

            {/* Scrollable Table Section */}
            <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="flex-shrink-0 p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex flex-wrap items-center gap-4">
                    <div className="relative flex-grow max-w-md">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="搜索员工姓名..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all" 
                        />
                    </div>
                    <select 
                        value={filterStatus} 
                        onChange={e => setFilterStatus(e.target.value)} 
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
                    >
                        <option value="all">所有确认状态</option>
                        <option value="sent">已发送</option>
                        <option value="viewed">已查看</option>
                        <option value="confirmed_all">所有已确认</option>
                        <option value="pending">待确认</option>
                        <option value="confirmed">已确认</option>
                        <option value="auto-confirmed">自动确认</option>
                    </select>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-left text-slate-600 dark:text-slate-300">
                        <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur-sm sticky top-0 z-20 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-center w-16">状态</th>
                                <SortableHeader sortKey="employeeName" label="员工" />
                                <SortableHeader sortKey="department" label="部门" />
                                <SortableHeader sortKey="sendStatus" label="发送状态" />
                                <SortableHeader sortKey="viewStatus" label="查看状态" />
                                <SortableHeader sortKey="confirmStatus" label="确认状态" />
                                <th scope="col" className="px-4 py-3 text-center font-semibold tracking-wider">签名</th>
                                <th scope="col" className="px-4 py-3 text-center font-semibold tracking-wider">考勤存档</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold tracking-wider pr-6">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-800">
                            {sortedRecords.map(record => {
                                const dingTalkUser = dingTalkUsers.find(u => u.name === record.employeeName);
                                const hasResigned = !record.department;
                                return (
                                    <tr 
                                        key={record.id} 
                                        onClick={() => !hasResigned && handleOpenPreviewModal(record)} 
                                        className={`transition-colors group ${hasResigned ? 'opacity-50 bg-slate-50 dark:bg-slate-900/50' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                                    >
                                        <td className="px-4 py-3 align-middle">
                                            <div className="flex justify-center">
                                                {(() => {
                                                    const isFullAttendance = record.dailyData['是否全勤'] === '是';
                                                    const lateMinutesExempted = parseFloat(record.dailyData['豁免后迟到分钟数']);
                                                    if (isFullAttendance) return <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" title="全勤"></div>;
                                                    if (!isNaN(lateMinutesExempted) && lateMinutesExempted > 50) return <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" title={`严重迟到 (豁免后 ${lateMinutesExempted} 分钟)`}></div>;
                                                    return <div className="h-2.5 w-2.5 rounded-full bg-amber-400" title="有考勤异常 (如迟到、请假等)"></div>;
                                                })()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 min-w-[140px]">
                                            <div className="flex items-center gap-3">
                                                <Avatar name={record.employeeName} avatarUrl={dingTalkUser?.avatar} isLoading={isDingTalkDataLoading} />
                                                <span className={`font-semibold text-slate-900 dark:text-white ${hasResigned ? 'line-through decoration-slate-400' : ''}`}>{record.employeeName}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{hasResigned ? <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">已离职</span> : (dingTalkUser?.department || record.department)}</td>
                                        
                                        <td className="py-3 w-[110px]">
                                            <div className="flex justify-center">
                                                <StatusBadge status={record.sendStatus} type="send" timestamp={record.sent_at} />
                                            </div>
                                        </td>
                                        <td className="py-3 w-[110px]">
                                            <div className="flex justify-center">
                                                <StatusBadge status={record.viewStatus} type="view" timestamp={record.viewed_at} />
                                            </div>
                                        </td>
                                        <td className="py-3 w-[110px]">
                                            <div className="flex justify-center">
                                                <StatusBadge status={record.confirmStatus} type="confirm" timestamp={record.confirmed_at} />
                                            </div>
                                        </td>
                                        
                                        <td className="px-4 py-3 text-center align-middle">
                                            <div className="relative group/signature inline-flex justify-center items-center cursor-help">
                                                {record.signatureBase64 ? (
                                                    record.signatureBase64.startsWith('data:image') ? (
                                                        <>
                                                            <img src={record.signatureBase64} alt="签名" className="h-8 max-w-24 object-contain dark:invert opacity-80 group-hover/signature:opacity-100 transition-opacity" />
                                                            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] hidden group-hover/signature:block pointer-events-none drop-shadow-2xl">
                                                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-2xl">
                                                                    <img src={record.signatureBase64} alt="签名预览" className="max-h-[80vh] w-auto object-contain dark:invert rounded-lg bg-white dark:bg-transparent" />
                                                                    <div className="text-center text-sm text-slate-400 mt-2 font-mono">电子签名预览</div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : <span className="text-xs text-slate-400 italic font-mono select-all">System</span>
                                                ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 text-center align-middle">
                                            <div className="relative group/archive inline-flex justify-center items-center cursor-zoom-in">
                                                {record.signatureBase64 ? (
                                                    <>
                                                        <a 
                                                            href={`https://cdn.eyewind.com/attendance/signatures/${sheet.month}/${encodeURIComponent(record.employeeName)}-${sheet.month}-考勤存档.png`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            title="点击下载存档" 
                                                            className="block p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" 
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <img src={`https://cdn.eyewind.com/attendance/signatures/${sheet.month}/${encodeURIComponent(record.employeeName)}-${sheet.month}-考勤存档.png`} alt="存档" className="h-10 w-auto object-contain border border-slate-200 dark:border-slate-600 rounded-md bg-white" />
                                                        </a>
                                                        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] hidden group-hover/archive:block pointer-events-none drop-shadow-2xl">
                                                            <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-600 shadow-2xl">
                                                                <img src={`https://cdn.eyewind.com/attendance/signatures/${sheet.month}/${encodeURIComponent(record.employeeName)}-${sheet.month}-考勤存档.png`} alt="存档大图" className="max-h-[85vh] w-auto object-contain rounded-lg bg-white" />
                                                                <div className="text-center text-xs text-slate-400 mt-2 font-mono">考勤存档预览</div>
                                                            </div>
                                                        </div>
                                                    </>
                                                ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                            </div>
                                        </td>

                                        {/* Actions Column with Permission Checks */}
                                        <td className="px-4 py-3 text-right pr-6">
                                            <div className="flex items-center justify-end gap-1">
                                                {canRecall && record.sendStatus === 'sent' && (
                                                    <button
                                                        disabled={isRecalling}
                                                        onClick={(e) => handleSingleRecall(e, record)}
                                                        className="p-2 text-orange-600 bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 dark:text-orange-400 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                        title="撤回通知"
                                                    >
                                                        {isRecalling ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <Undo2Icon className="w-4 h-4" />}
                                                    </button>
                                                )}
                                                
                                                {canSend && (
                                                    <button 
                                                        disabled={hasResigned} 
                                                        onClick={(e) => handleSmartSendClick(e, record)} 
                                                        className={`p-2 rounded-lg transition-all ${
                                                            record.sendStatus === 'sent' 
                                                                ? 'text-slate-300 dark:text-slate-600 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-700' 
                                                                : 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50'
                                                        } disabled:opacity-30 disabled:cursor-not-allowed`} 
                                                        title={record.sendStatus === 'sent' ? `已发送。点击重新发送。` : "发送确认单"}
                                                    >
                                                        <SendIcon className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {canEdit && (
                                                    <button 
                                                        disabled={hasResigned} 
                                                        onClick={(e) => { e.stopPropagation(); handleOpenEditModal(record); }} 
                                                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed" 
                                                        title="编辑明细"
                                                    >
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {canArchive && (
                                                    <button 
                                                        disabled={hasResigned || archivingRecordId === record.id} 
                                                        onClick={(e) => { e.stopPropagation(); handleArchive(record); }} 
                                                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed" 
                                                        title="生成/下载存档"
                                                    >
                                                        {archivingRecordId === record.id ? <Loader2Icon className="w-4 h-4 animate-spin text-emerald-600" /> : <DownloadIcon className="w-4 h-4" />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <EditAttendanceModal record={editingRecord} sheet={sheet} onClose={() => setEditingRecord(null)} onSave={handleSaveRecord} viewMode={editingViewMode} onSwitchToEdit={() => setEditingViewMode(prev => prev === 'edit' ? 'preview' : 'edit')} onResend={handleResend} dingTalkUsers={dingTalkUsers} isDingTalkDataLoading={isDingTalkDataLoading} lateExemptionEnabled={lateExemptionEnabled} fullAttendanceEnabled={fullAttendanceEnabled} />
            {changesToConfirm && <ConfirmChangesModal isOpen={!!changesToConfirm} changes={changesToConfirm.changes} onConfirm={handleConfirmSave} onClose={() => setChangesToConfirm(null)} />}
            {recordsForPreview.length > 0 && <DingTalkPreviewModal records={recordsForPreview} mainCompany={mainCompany} sheet={sheet} currentIndex={previewIndex} onNavigate={setPreviewIndex} onClose={() => setRecordsForPreview([])} onSend={handleSendNotifications} isSending={isSending} />}
            {sendError && <Modal isOpen={!!sendError} onClose={() => setSendError(null)} title="发送失败" size="sm"><p className="text-red-500">{sendError}</p></Modal>}
            
            {recallConfirmData && (
                <Modal 
                    isOpen={!!recallConfirmData} 
                    onClose={() => setRecallConfirmData(null)} 
                    title="确认撤回" 
                    size="sm"
                >
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                            <AlertTriangleIcon className="w-6 h-6 flex-shrink-0" />
                            <p className="text-sm font-medium">
                                此操作将撤回已发送的钉钉工作通知和待办事项。
                            </p>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">
                            {recallConfirmData.type === 'single' 
                                ? `确定要撤回发送给 ${(recallConfirmData as any).record?.employeeName} 的考勤确认通知吗？`
                                : `确定要一键撤回所有已发送的 ${(recallConfirmData as any).records?.length} 条考勤确认通知吗？`
                            }
                        </p>
                        <div className="flex justify-end gap-3 mt-6">
                            <button 
                                onClick={() => setRecallConfirmData(null)} 
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                            >
                                取消
                            </button>
                            <button 
                                onClick={confirmRecall} 
                                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 transition-colors flex items-center gap-2"
                            >
                                {isRecalling ? <Loader2Icon className="w-4 h-4 animate-spin" /> : null}
                                确认撤回
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
