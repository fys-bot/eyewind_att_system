
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { AttendanceSheet, EmployeeAttendanceRecord, AttendanceSheetSettings, DingTalkUser } from '../../../database/schema.ts';
import { UploadCloudIcon, GridIcon, SettingsIcon, AlertTriangleIcon, ChevronLeftIcon, Loader2Icon, InfoIcon, XIcon, SaveIcon } from '../../Icons.tsx';
import { FileUpload } from '../../FileUpload.tsx';
import { Modal } from '../../Modal.tsx';
import { AttendancePhonePreview } from './PhonePreview.tsx';
import { Stepper, SwitchToggle } from './Shared.tsx';
import { upsertAttendanceDataToDb } from './api.ts';
import { RemarksEditor } from './Modals.tsx';
import { getDefaultMonth } from '../utils.ts';
import { AttendanceRuleManager } from '../AttendanceRuleEngine.ts';

// --- Local Helper Components ---

const CellStatusEditor: React.FC<{
    position: { top: number, left: number };
    onClose: () => void;
    onSelect: (status: string) => void;
}> = ({ position, onClose, onSelect }) => {
    const statuses = ['√', '年假', '病假', '事假', '加班', '调休', '外出', '婚假', '产假', '丧假', '迟到', '缺卡', '育儿假'];
    const [customInput, setCustomInput] = useState('');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.cell-status-editor')) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div style={{ top: position.top, left: position.left }} className="cell-status-editor fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-3 w-64 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-sm font-bold text-slate-800 dark:text-white">修改状态</span>
                <button onClick={onClose}><XIcon className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
                {statuses.map(status => (
                    <button
                        key={status}
                        onClick={() => onSelect(status)}
                        className={`text-xs py-1.5 rounded-md border transition-colors ${
                            status === '√' ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' :
                            ['迟到', '缺卡'].includes(status) ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' :
                            'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200'
                        }`}
                    >
                        {status}
                    </button>
                ))}
            </div>
            <div className="flex gap-2">
                <input 
                    type="text" 
                    value={customInput} 
                    onChange={e => setCustomInput(e.target.value)}
                    placeholder="自定义..." 
                    className="flex-1 text-xs px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md"
                />
                <button 
                    onClick={() => { if(customInput) onSelect(customInput) }}
                    className="px-3 py-1 bg-sky-600 text-white text-xs rounded-md hover:bg-sky-500"
                >
                    确认
                </button>
            </div>
        </div>
    );
};

const NumberEditor: React.FC<{
    position: { top: number, left: number };
    initialValue: string;
    onClose: () => void;
    onConfirm: (value: string) => void;
    title: string;
}> = ({ position, initialValue, onClose, onConfirm, title }) => {
    const [val, setVal] = useState(initialValue);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.number-editor')) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div style={{ top: position.top, left: position.left }} className="number-editor fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-3 w-64 animate-in fade-in zoom-in-95 duration-100">
             <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-sm font-bold text-slate-800 dark:text-white">{title}</span>
                <button onClick={onClose}><XIcon className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="flex gap-2">
                <input 
                    type="number" 
                    value={val} 
                    onChange={e => setVal(e.target.value)}
                    className="flex-1 text-sm px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md"
                    autoFocus
                />
                <button 
                    onClick={() => onConfirm(val)}
                    className="px-3 py-1 bg-sky-600 text-white text-xs rounded-md hover:bg-sky-500"
                >
                    确认
                </button>
            </div>
        </div>
    );
};

const BooleanEditor: React.FC<{
    position: { top: number, left: number };
    onClose: () => void;
    onSelect: (value: string) => void;
}> = ({ position, onClose, onSelect }) => {
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.boolean-editor')) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div style={{ top: position.top, left: position.left }} className="boolean-editor fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-2 w-24 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-1">
            <button onClick={() => onSelect('是')} className="px-3 py-1.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-green-600 font-bold transition-colors">是</button>
            <button onClick={() => onSelect('否')} className="px-3 py-1.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-red-600 font-bold transition-colors">否</button>
        </div>
    );
};

// 2. Create Wizard View
export const CreateAttendanceWizard: React.FC<{
    onBack: () => void;
    mainCompany: string | null;
    onCreateSheet: (sheet: Omit<AttendanceSheet, 'id' | 'createdAt'>) => void;
    dingTalkUsers: DingTalkUser[];
    isDingTalkDataLoading: boolean;
    preloadedData?: { data: EmployeeAttendanceRecord[]; month: string } | null;
}> = ({ onBack, mainCompany, onCreateSheet, dingTalkUsers, isDingTalkDataLoading, preloadedData }) => {
    const [step, setStep] = useState(preloadedData ? 2 : 1);
    const [fileName, setFileName] = useState<string | null>(preloadedData ? '从考勤管理导入' : null);
    const [parsedData, setParsedData] = useState<EmployeeAttendanceRecord[] | null>(preloadedData?.data || null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Modals state
    const [isChangeResponderModalOpen, setIsChangeResponderModalOpen] = useState(false);
    const [isCheckingForOverwrite, setIsCheckingForOverwrite] = useState(false);
    const [overwriteModalOpen, setOverwriteModalOpen] = useState(false);
    
    // Editing State
    const [editingCell, setEditingCell] = useState<{ id: string, field: string, anchor: HTMLElement } | null>(null);
    const [editingNumber, setEditingNumber] = useState<{ id: string, field: string, value: string, anchor: HTMLElement } | null>(null);
    const [editingBoolean, setEditingBoolean] = useState<{ id: string, field: string, anchor: HTMLElement } | null>(null);
    const [editingRemarks, setEditingRemarks] = useState<{ id: string, value: string } | null>(null);
    const [tempRemarks, setTempRemarks] = useState('');

    const phoneContentRef = useRef<HTMLDivElement>(null);

    const getTodayAt1830 = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}T18:30`;
    };

    const [title, setTitle] = useState('');
    // Use getDefaultMonth logic
    const [month, setMonth] = useState(preloadedData?.month || getDefaultMonth());
    
    const [settings, setSettings] = useState<Omit<AttendanceSheetSettings, 'showColumns'>>({
        reminderText: '请仔细核对考勤数据, 并及时确认!',
        showReminder: true,
        autoConfirmEnabled: true,
        autoConfirmDate: getTodayAt1830(),
        feedbackEnabled: true,
        feedbackContactPerson: '陈丽瑶',
        readAndBurn: false,
        employeeSignature: true,
        hideEmptyColumnsOption: 'none',
        notificationMethod: '考勤确认助手通知+待办'
    });
    const [showColumns, setShowColumns] = useState<string[]>([]);
    const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
    const availableResponders = ['陈丽瑶', '张秀秀', '李秋玲'];

    // 🔥 获取规则开关状态
    const companyKey = (mainCompany?.includes('海多多') || mainCompany === 'hydodo') ? 'hydodo' : 'eyewind';
    const rules = AttendanceRuleManager.getEngine(companyKey).getRules();
    const lateExemptionEnabled = rules.lateExemptionEnabled ?? true;
    const fullAttendanceEnabled = rules.fullAttendanceEnabled ?? true;

    // Restore Draft from LocalStorage on mount
    useEffect(() => {
        const key = `ATTENDANCE_DRAFT_${mainCompany}_${month}`;
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                const draft = JSON.parse(saved);
                // Check if draft belongs to current month to be relevant
                if (draft.employeeRecords && draft.month === month) {
                    setParsedData(draft.employeeRecords);
                    if (draft.settings) setSettings(draft.settings);
                    if (draft.showColumns) setShowColumns(draft.showColumns);
                    if (draft.title) setTitle(draft.title);
                    if (draft.fileName) setFileName(draft.fileName);
                    
                    // If we restore a draft, we are effectively "up to date" with the save
                    setHasUnsavedChanges(false);
                    // Force jump to step 2 if we found data
                    setStep(2);
                }
            }
        } catch(e) {
            console.error('Failed to load draft', e);
        }
    }, [mainCompany, month]); // Depend on mainCompany and month to switch drafts if they change

    const firstRecord = useMemo(() => parsedData?.[0] || null, [parsedData]);
    const { allHeaders, dayHeaders, editableSummaryHeaders } = useMemo(() => {
        if (!firstRecord) return { allHeaders: [], dayHeaders: [], editableSummaryHeaders: [] };
        
        // Days: Force generate all days of the month to include weekends/empty days
        const [y, m] = month.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const days = Array.from({length: daysInMonth}, (_, i) => String(i + 1));
        
        const allKeys = Object.keys(firstRecord.dailyData);
                            
        // Priority Summaries - 根据规则开关过滤
        const allPriorityFields = ['是否全勤', '正常出勤天数', '迟到分钟数', '豁免后迟到分钟数'];
        const priorityFields = allPriorityFields.filter(field => {
            if (field === '是否全勤' && !fullAttendanceEnabled) return false;
            if (field === '豁免后迟到分钟数' && !lateExemptionEnabled) return false;
            return true;
        });
        
        // Other Summaries (excluding days, priority, and special like name/id)
        const others = allKeys.filter(k => 
            !/^\d+$/.test(k) && 
            !priorityFields.includes(k) && 
            !['姓名', '序号', '工号', '部门', '备注', '应出勤天数'].includes(k)
        ).sort((a, b) => a.localeCompare(b));

        const finalHeaders = [
            '序号',
            '姓名',
            ...days,
            ...priorityFields,
            '备注', // Always show Remarks
            // ...others
        ].filter(Boolean) as string[];

        // Dedup in case '备注' was in others or any other duplication
        const uniqueHeaders = Array.from(new Set(finalHeaders));

        // 根据规则开关过滤可编辑的汇总字段
        const allEditableFields = ['迟到分钟数', '豁免后迟到分钟数', '是否全勤', '正常出勤天数'];
        const filteredEditableFields = allEditableFields.filter(field => {
            if (field === '是否全勤' && !fullAttendanceEnabled) return false;
            if (field === '豁免后迟到分钟数' && !lateExemptionEnabled) return false;
            return true;
        });

        return { 
            allHeaders: uniqueHeaders, 
            dayHeaders: days,
            editableSummaryHeaders: filteredEditableFields
        };
    }, [firstRecord, month, fullAttendanceEnabled, lateExemptionEnabled]);

    useEffect(() => {
        if (month && !title) setTitle(`${month.replace('-', '年')}月考勤确认单`);
    }, [month, title]);

    useEffect(() => {
        if (firstRecord && showColumns.length === 0) setShowColumns(allHeaders);
    }, [firstRecord, allHeaders, showColumns.length]);

    const handleFileUpload = (content: string, name: string) => {
        setFileError(null);
        try {
            const allRows: string[][] = [];
            let currentRow: string[] = [];
            let currentField = '';
            let inQuotes = false;
            const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

            for (let i = 0; i < normalizedContent.length; i++) {
                const char = normalizedContent[i];
                if (inQuotes) {
                    if (char === '"') {
                        if (i + 1 < normalizedContent.length && normalizedContent[i + 1] === '"') { currentField += '"'; i++; } else inQuotes = false;
                    } else currentField += char;
                } else {
                    if (char === '"') inQuotes = true;
                    else if (char === ',') { currentRow.push(currentField); currentField = ''; }
                    else if (char === '\n') { currentRow.push(currentField); allRows.push(currentRow); currentRow = []; currentField = ''; }
                    else currentField += char;
                }
            }
            if (currentField || currentRow.length > 0) { currentRow.push(currentField); allRows.push(currentRow); }
            if (allRows.length < 1) throw new Error("CSV 文件不合法或内容为空。");

            let headerRowIndex = -1;
            let headers: string[] = [];
            for (let i = 0; i < Math.min(allRows.length, 6); i++) {
                const potentialHeaders = allRows[i].map(h => h.trim());
                if (potentialHeaders.includes('姓名')) { headerRowIndex = i; headers = potentialHeaders; break; }
            }
            if (headerRowIndex === -1) throw new Error("CSV 文件必须包含一个带有 '姓名' 列的表头。");

            const nameIndex = headers.indexOf('姓名');
            const idIndex = headers.indexOf('序号') !== -1 ? headers.indexOf('序号') : headers.indexOf('工号');
            const records: EmployeeAttendanceRecord[] = [];
            for (let i = headerRowIndex + 1; i < allRows.length; i++) {
                const values = allRows[i];
                if (!values || values.length === 0 || values.every(v => !v.trim())) continue;
                const employeeName = values[nameIndex]?.trim();
                if (!employeeName) continue;
                const dingTalkUser = dingTalkUsers.find(u => u.name === employeeName);
                const allData: Record<string, string> = {};
                headers.forEach((header, index) => {
                    if (header && !['姓名', '部门', '序号', '工号'].includes(header.trim())) allData[header.trim()] = values[index] || '';
                });
                const record: EmployeeAttendanceRecord = {
                    id: `emp_rec_parsed_${Date.now()}_${i}`,
                    employeeId: idIndex !== -1 ? (values[idIndex]?.trim() || `EMP${1000 + i}`) : `EMP${1000 + i}`,
                    employeeName: employeeName,
                    department: dingTalkUser?.department || 'N/A',
                    sendStatus: 'pending', viewStatus: 'pending', confirmStatus: 'pending',
                    sent_at: null, confirmed_at: null, viewed_at: null, signatureBase64: null,
                    mainCompany, isSigned: false, dailyData: allData,
                };
                records.push(record);
            }
            if (records.length === 0) throw new Error("未能从文件中解析出任何有效的员工记录。");
            setParsedData(records); setFileName(name); setStep(2); setHasUnsavedChanges(true); // Treat upload as a change
        } catch (e) {
            setFileError(e instanceof Error ? e.message : "文件解析失败，请确保是有效的CSV格式。");
            setFileName(null); setParsedData(null);
        }
    };

    const handleCellClick = (record: EmployeeAttendanceRecord, header: string, e: React.MouseEvent<HTMLElement>) => {
        // Name and Index are NOT editable
        if (['姓名', '序号', '工号'].includes(header)) return;

        if (dayHeaders.includes(header)) {
            const rect = e.currentTarget.getBoundingClientRect();
            // Adjust position
            let top = rect.bottom + window.scrollY;
            let left = rect.left + window.scrollX;
            if (left + 256 > window.innerWidth) left = rect.right - 256 + window.scrollX; 
            if (top + 200 > window.innerHeight + window.scrollY) top = rect.top - 200 + window.scrollY; 

            setEditingCell({ id: record.id, field: header, anchor: e.currentTarget });
        } else if (header === '备注') {
            const currentRemarks = record.dailyData[header] || '';
            setEditingRemarks({ id: record.id, value: currentRemarks });
            setTempRemarks(currentRemarks);
        } else if (editableSummaryHeaders.includes(header)) {
            // Updated logic for '是否全勤' to use BooleanEditor
            if (header === '是否全勤') {
                const rect = e.currentTarget.getBoundingClientRect();
                let top = rect.bottom + window.scrollY;
                let left = rect.left + window.scrollX;
                if (left + 100 > window.innerWidth) left = rect.right - 100 + window.scrollX; 
                
                setEditingBoolean({ id: record.id, field: header, anchor: e.currentTarget });
            } else {
                const rect = e.currentTarget.getBoundingClientRect();
                let top = rect.bottom + window.scrollY;
                let left = rect.left + window.scrollX;
                if (left + 256 > window.innerWidth) left = rect.right - 256 + window.scrollX; 
                if (top + 200 > window.innerHeight + window.scrollY) top = rect.top - 200 + window.scrollY; 

                setEditingNumber({ 
                    id: record.id, 
                    field: header, 
                    value: record.dailyData[header] || '0', 
                    anchor: e.currentTarget 
                });
            }
        }
    };

    const getLeaveTypes = () => ['年假', '病假', '事假', '调休', '加班', '外出', '婚假', '产假', '丧假', '陪产假', '育儿假'];

    const handleUpdateCell = (id: string, field: string, value: string) => {
        setHasUnsavedChanges(true); // Mark as modified
        setParsedData(prev => {
            if (!prev) return null;
            return prev.map(rec => {
                if (rec.id === id) {
                    const newData = { ...rec.dailyData, [field]: value };
                    
                    // --- Logic for Day Cells ---
                    if (dayHeaders.includes(field)) {
                        // 1. Sync to Remarks if it's a leave type
                        const leaveTypes = getLeaveTypes();
                        const isLeave = leaveTypes.includes(value);
                        
                        // Parse existing remarks
                        const existingRemarks = (newData['备注'] || '').split('\n').filter(s => s.trim());
                        const dateStr = `${month}-${field.padStart(2, '0')}`;
                        
                        // Remove any existing entry for this specific date
                        const newRemarksList = existingRemarks.filter(r => !r.includes(dateStr));
                        
                        if (isLeave) {
                            // Add new entry: Type YYYY-MM-DD 共 8 小时 (Defaulting to 8 hours/1 day)
                            newRemarksList.push(`${value} ${dateStr} 共 8 小时`);
                        }
                        
                        newData['备注'] = newRemarksList.join('\n');

                        // 2. Recalculate Normal Attendance Days & Full Attendance
                        const shouldAttend = parseFloat(newData['应出勤天数'] || '0') || 21.75; // Default if missing
                        
                        // Count Leaves (Count days that are NOT '√' and NOT '缺卡' and NOT '迟到' and NOT '加班'?)
                        // "Normal Attendance = Should - Sick - Personal - ..."
                        // We count occurrences of leave types in the days 1-31
                        let leaveCount = 0;
                        let hasAbnormal = false;

                        dayHeaders.forEach(day => {
                            const val = newData[day];
                            if (leaveTypes.includes(val)) {
                                leaveCount += 1;
                                // Most leaves break full attendance
                                if (val !== '调休') hasAbnormal = true; 
                            } else if (val === '迟到' || val === '缺卡') {
                                hasAbnormal = true;
                            }
                        });

                        newData['正常出勤天数'] = String(Math.max(0, shouldAttend - leaveCount));
                        
                        // Only auto-update Full Attendance if it was previously calculated (simple heuristic)
                        // Or just enforce rule: If abnormal or leave -> No
                        // Note: User can manually override '是否全勤', so maybe don't force overwrite unless strict?
                        // Let's force it for consistency with "real-time calculation" request
                        newData['是否全勤'] = hasAbnormal ? '否' : '是';
                    }

                    // --- Logic for Manual Normal Attendance Days Update ---
                    if (field === '正常出勤天数') {
                        const shouldAttend = parseFloat(newData['应出勤天数'] || '0');
                        const normalAttend = parseFloat(value);
                        
                        // Link Full Attendance to Normal Attendance Days
                        if (!isNaN(shouldAttend) && shouldAttend > 0 && !isNaN(normalAttend)) {
                            // If normal attendance days equals or exceeds should attendance days, it's full attendance
                            newData['是否全勤'] = normalAttend >= shouldAttend ? '是' : '否';
                        }
                    }

                    return { ...rec, dailyData: newData };
                }
                return rec;
            });
        });
    };

    const handleCloseStatusEditor = () => setEditingCell(null);
    const handleCloseRemarksEditor = () => setEditingRemarks(null);

    const proceedToCreateSheet = () => {
        if (!parsedData) return;
        const newSheet: Omit<AttendanceSheet, 'id' | 'createdAt'> = {
            title, month, status: 'draft',
            settings: { ...settings, showColumns: showColumns },
            employeeRecords: parsedData,
        };
        upsertAttendanceDataToDb({ ...newSheet, id: 'temp-id', createdAt: '' }, parsedData, dingTalkUsers, mainCompany).catch(error => {
            console.error("Error during DB upsert from handleFinishSetup:", error);
            alert(`向数据库同步考勤数据时出错: ${error instanceof Error ? error.message : String(error)}`);
        });
        onCreateSheet(newSheet);
    };

    const handleFinishSetup = async () => {
        if (!parsedData) return;
        setIsCheckingForOverwrite(true);
        try {
            // 🔥 使用本地服务器接口
            const response = await fetch(`/api/v1/attendance/status/load/${month}`);
            
            // 🔥 处理304 Not Modified状态码
            if (response.status === 304) {
                console.log(`[CreateWizard] 收到304响应，${month}月数据未修改，继续创建`);
                proceedToCreateSheet(); 
                return;
            } else if (!response.ok) { 
                proceedToCreateSheet(); 
                return; 
            }
            
            const apiResponse = await response.json();
            if (apiResponse.success && apiResponse.data && Object.keys(apiResponse.data).length > 0 && apiResponse.data[0].mainCompany === mainCompany) {
                setOverwriteModalOpen(true);
            } else { proceedToCreateSheet(); }
        } catch (error) {
            console.error("Error checking for existing attendance data:", error);
            proceedToCreateSheet();
        } finally { setIsCheckingForOverwrite(false); }
    };

    const handleConfirmOverwrite = () => { setOverwriteModalOpen(false); proceedToCreateSheet(); };
    const handleUpdateFromDb = () => { setOverwriteModalOpen(false); onBack(); };

    const handleOpenPreview = () => {
        if (!firstRecord) { alert("没有可用于生成预览的员工数据。"); return; }
        try {
            const dingTalkUser = dingTalkUsers.find(u => u.name === firstRecord.employeeName) || null;
            const url = `https://cdn.eyewind.com/attendance/60c00d84330a20af8560661766c26e48.html?userid=${dingTalkUser?.userid}**${month}`;
            window.open(url, '_blank');
        } catch (error) { console.error("生成预览链接时出错:", error); alert("无法打开预览，请检查控制台以获取更多信息。"); }
    };

    const handleGeneratePdf = async () => {
        if (!phoneContentRef.current) { alert("预览组件尚未加载。"); return; }
        const html2canvas = (window as any).html2canvas;
        const jspdf = (window as any).jspdf;
        if (!html2canvas || !jspdf) { alert("PDF 生成库未加载。请检查您的网络连接。"); return; }
        const { jsPDF } = jspdf;
        try {
            const canvas = await html2canvas(phoneContentRef.current, { useCORS: true, scale: 2, backgroundColor: null });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save('考勤存档预览.pdf');
        } catch (error) { console.error("生成PDF存档失败:", error); alert("生成存档失败，请查看控制台获取更多信息。"); }
    };

    const handleSaveLocal = () => {
        if (!parsedData) return;
        const key = `ATTENDANCE_DRAFT_${mainCompany}_${month}`;
        const draftData = {
            title,
            month,
            settings,
            showColumns,
            employeeRecords: parsedData,
            fileName,
            timestamp: Date.now()
        };
        try {
            localStorage.setItem(key, JSON.stringify(draftData));
            setHasUnsavedChanges(false);
            alert(`已成功保存`);
        } catch (e) {
            console.error(e);
            alert('保存失败：本地存储空间不足');
        }
    };

    const wizardSteps = [
        { label: "上传考勤报表", icon: <UploadCloudIcon className="w-6 h-6" /> },
        { label: "预览表格数据", icon: <GridIcon className="w-6 h-6" /> },
        { label: "设置考勤确认", icon: <SettingsIcon className="w-6 h-6" /> },
    ];

    const getCellValue = (record: EmployeeAttendanceRecord, header: string) => {
        if (header === '姓名') return record.employeeName;
        // '序号' logic handled in render loop using index
        return record.dailyData[header] || '';
    };

    return (
        <div>
            {/* Popovers and Modals */}
            {editingCell && (
                <CellStatusEditor 
                    position={{ top: editingCell.anchor.getBoundingClientRect().bottom + window.scrollY, left: editingCell.anchor.getBoundingClientRect().left + window.scrollX }}
                    onClose={handleCloseStatusEditor}
                    onSelect={(status) => {
                        handleUpdateCell(editingCell.id, editingCell.field, status);
                        handleCloseStatusEditor();
                    }}
                />
            )}
            {editingNumber && (
                <NumberEditor
                    position={{ top: editingNumber.anchor.getBoundingClientRect().bottom + window.scrollY, left: editingNumber.anchor.getBoundingClientRect().left + window.scrollX }}
                    initialValue={editingNumber.value}
                    title={`修改${editingNumber.field}`}
                    onClose={() => setEditingNumber(null)}
                    onConfirm={(val) => {
                        handleUpdateCell(editingNumber.id, editingNumber.field, val);
                        setEditingNumber(null);
                    }}
                />
            )}
            {editingBoolean && (
                <BooleanEditor
                    position={{ top: editingBoolean.anchor.getBoundingClientRect().bottom + window.scrollY, left: editingBoolean.anchor.getBoundingClientRect().left + window.scrollX }}
                    onClose={() => setEditingBoolean(null)}
                    onSelect={(val) => {
                        handleUpdateCell(editingBoolean.id, editingBoolean.field, val);
                        setEditingBoolean(null);
                    }}
                />
            )}
            {editingRemarks && (
                <Modal isOpen={true} onClose={handleCloseRemarksEditor} title="编辑备注" size="lg">
                    <RemarksEditor 
                        value={tempRemarks} 
                        onChange={(val) => {
                            setTempRemarks(val);
                        }} 
                    />
                    <div className="flex justify-end mt-4">
                        <button onClick={() => {
                            handleUpdateCell(editingRemarks.id, '备注', tempRemarks);
                            handleCloseRemarksEditor();
                        }} className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm">完成</button>
                    </div>
                </Modal>
            )}

            <Modal isOpen={isChangeResponderModalOpen} onClose={() => setIsChangeResponderModalOpen(false)} title="更换答疑人员" size="sm">
                <div className="space-y-2">
                    {availableResponders.map(name => (
                        <button key={name} onClick={() => { setSettings(s => ({ ...s, feedbackContactPerson: name })); setIsChangeResponderModalOpen(false); }} className="w-full text-left p-3 rounded-md transition-colors text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50">{name}</button>
                    ))}
                </div>
            </Modal>
            <Modal isOpen={overwriteModalOpen} onClose={() => setOverwriteModalOpen(false)} size="md">
                <div className="flex items-start gap-4">
                    <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/50 sm:mx-0 sm:h-10 sm:w-10"><AlertTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" aria-hidden="true" /></div>
                    <div className="mt-1 text-center sm:ml-2 sm:text-left">
                        <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-white">数据已存在</h3>
                        <div className="mt-2">
                            <p className="text-sm text-slate-500 dark:text-slate-400">系统检测到 <strong className="font-semibold text-slate-700 dark:text-slate-300">{month}</strong> 的考勤数据已存在。</p>
                            <div className="text-sm text-slate-500 dark:text-slate-400 mt-3 space-y-2"><p>- <strong className="font-semibold text-slate-700 dark:text-slate-300">从数据库更新:</strong> 将放弃当前上传，返回列表页加载最新数据。</p><p>- <strong className="font-semibold text-slate-700 dark:text-slate-300">按现有设置继续:</strong> 将使用您当前上传和配置的数据创建确认单。</p></div>
                        </div>
                    </div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700/50 -mx-6 -mb-6 mt-6 px-6 py-3 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={() => setOverwriteModalOpen(false)} className="px-4 py-2 text-sm font-medium rounded-md">取消</button>
                    <button onClick={handleUpdateFromDb} className="px-4 py-2 text-sm font-medium bg-slate-200 dark:bg-slate-600 rounded-md">从数据库更新</button>
                    <button onClick={handleConfirmOverwrite} className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-md">按现有设置继续</button>
                </div>
            </Modal>

            <header className="mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-2">
                    <ChevronLeftIcon className="w-4 h-4" />
                    {preloadedData ? '返回考勤日历' : '返回'}
                </button>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">创建考勤确认</h2>
            </header>
            <div className="bg-white dark:bg-slate-800/50 p-8 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="mb-12"><Stepper currentStep={step} steps={wizardSteps} /></div>
                {step === 1 && (
                    <div className="max-w-xl mx-auto text-center">
                        <h3 className="text-lg font-semibold">上传 Excel 考勤报表 (CSV格式)</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6">直接上传你现有的CSV格式考勤报表，系统智能解析，无需模板。</p>
                        <FileUpload onFileUpload={handleFileUpload} accept=".csv" label="选择文件" />
                        {fileError && <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded-md text-sm text-left flex items-center gap-2"><AlertTriangleIcon className="w-5 h-5" /><span>{fileError}</span></div>}
                    </div>
                )}
                {step === 2 && parsedData && (
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">预览表格数据 ({fileName})</h3>
                            <span className="text-xs text-slate-500 dark:text-slate-400 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded text-yellow-700 dark:text-yellow-300">
                                点击单元格可修改考勤状态或备注
                            </span>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[50vh]">
                            <table className="w-full text-sm text-center">
                                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase z-10">
                                    <tr>
                                        {allHeaders.map(header => (
                                            <th key={header} className={`px-4 py-3 whitespace-nowrap ${header === '备注' ? 'min-w-[300px] text-left' : ''}`}>
                                                {header}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-slate-800/50 divide-y divide-slate-200 dark:divide-slate-700">
                                    {parsedData.map((record, index) => (
                                        <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
                                            {allHeaders.map(header => {
                                                const isEditableDate = dayHeaders.includes(header);
                                                const isEditableRemark = header === '备注';
                                                const isEditableSummary = editableSummaryHeaders.includes(header);
                                                
                                                // Handle '序号' column using index
                                                let value = getCellValue(record, header);
                                                if (header === '序号') {
                                                    value = String(index + 1);
                                                }

                                                // Status Styles logic derived from Modals/Calendar logic
                                                let cellStyle = '';
                                                if (isEditableDate) {
                                                    if (value === '√') cellStyle = 'text-green-600 font-bold';
                                                    else if (['迟到', '缺卡'].includes(value)) cellStyle = 'text-red-500 font-bold';
                                                    else if (['年假', '病假', '事假', '调休', '婚假', '产假', '丧假', '陪产假', '育儿假'].includes(value)) cellStyle = 'text-purple-600 font-medium';
                                                    else if (value === '加班') cellStyle = 'text-blue-600 font-medium';
                                                } else if (header === '是否全勤') {
                                                    cellStyle = value === '是' ? 'text-green-600 font-bold' : 'text-red-500 font-bold';
                                                }

                                                const isInteractive = isEditableDate || isEditableRemark || isEditableSummary;

                                                return (
                                                    <td 
                                                        key={`${record.id}-${header}`} 
                                                        className={`px-4 py-2 whitespace-nowrap ${header === '备注' ? 'text-left whitespace-pre-wrap' : ''} ${isInteractive ? 'cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/20' : ''}`}
                                                        onClick={(e) => handleCellClick(record, header, e)}
                                                    >
                                                        <span className={cellStyle}>{value}</span>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-center gap-4 mt-8">
                            <button onClick={() => preloadedData ? onBack() : setStep(1)} className="px-6 py-2 bg-slate-200 dark:bg-slate-600 rounded-md">
                                {preloadedData ? '返回考勤日历' : '重新上传'}
                            </button>
                            {/* New Save Button */}
                            <button 
                                onClick={handleSaveLocal} 
                                disabled={!hasUnsavedChanges}
                                className={`px-6 py-2 rounded-md flex items-center gap-2 transition-colors ${hasUnsavedChanges ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'}`}
                            >
                                <SaveIcon className="w-4 h-4" /> 保存
                            </button>
                            <button onClick={() => setStep(3)} className="px-6 py-2 bg-sky-600 text-white rounded-md">下一步</button>
                        </div>
                    </div>
                )}
                {step === 3 && (
                    <div>
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-12 items-start">
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h4 className="font-semibold border-l-4 border-sky-500 pl-3">基本设置</h4>
                                    <div><label className="block text-sm mb-1"><span className="text-red-500">*</span> 所属月份</label><input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 p-2 rounded-md border border-slate-300 dark:border-slate-600" /></div>
                                    <div><label className="block text-sm mb-1"><span className="text-red-500">*</span> 标题</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 p-2 rounded-md border border-slate-300 dark:border-slate-600" /></div>
                                    <div className="flex items-center justify-between"><label className="text-sm">温馨提示</label><SwitchToggle checked={settings.showReminder} onChange={c => setSettings(s => ({ ...s, showReminder: c }))} /></div>
                                    {settings.showReminder && <textarea value={settings.reminderText} onChange={e => setSettings(s => ({ ...s, reminderText: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-700 p-2 rounded-md border border-slate-300 dark:border-slate-600 h-20 text-sm" />}
                                </div>
                                <div className="space-y-4">
                                    <h4 className="font-semibold border-l-4 border-sky-500 pl-3">确认流程</h4>
                                    <div className="flex items-center justify-between"><label className="text-sm">超时自动确认</label><SwitchToggle checked={settings.autoConfirmEnabled} onChange={c => setSettings(s => ({ ...s, autoConfirmEnabled: c }))} /></div>
                                    {settings.autoConfirmEnabled && <input type="datetime-local" value={settings.autoConfirmDate} onChange={e => setSettings(s => ({ ...s, autoConfirmDate: e.target.value }))} className="w-full bg-slate-50 dark:bg-slate-700 p-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm" />}
                                    <div className="flex items-center justify-between"><label className="text-sm">允许员工反馈</label><SwitchToggle checked={settings.feedbackEnabled} onChange={c => setSettings(s => ({ ...s, feedbackEnabled: c }))} /></div>
                                    {settings.feedbackEnabled && <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-md border border-slate-200 dark:border-slate-700"><span className="text-sm">答疑负责人: <strong>{settings.feedbackContactPerson}</strong></span><button onClick={() => setIsChangeResponderModalOpen(true)} className="text-xs text-sky-600 hover:underline">更换</button></div>}
                                    <div className="flex items-center justify-between"><label className="text-sm">开启电子签名</label><SwitchToggle checked={settings.employeeSignature} onChange={c => setSettings(s => ({ ...s, employeeSignature: c }))} /></div>
                                </div>
                                <div className="space-y-4">
                                    <h4 className="font-semibold border-l-4 border-sky-500 pl-3">显示设置</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {allHeaders.map(col => (
                                            <button key={col} onClick={() => setShowColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])} className={`px-3 py-1 text-xs rounded-full border transition-colors ${showColumns.includes(col) ? 'bg-sky-100 border-sky-300 text-sky-800 dark:bg-sky-900/50 dark:border-sky-700 dark:text-sky-300' : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400'}`}>
                                                {col}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md text-blue-700 dark:text-blue-300 text-xs">
                                        <InfoIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                        <p>已选列将在员工端手机预览中显示。建议保留关键汇总数据和每日详情。</p>
                                    </div>
                                </div>
                            </div>
                            <div className="sticky top-8">
                                <h4 className="font-semibold mb-4 text-center">员工端预览</h4>
                                <AttendancePhonePreview
                                    ref={phoneContentRef}
                                    sheet={{ title, month, status: 'draft', settings: { ...settings, showColumns }, employeeRecords: [parsedData![0]], id: 'preview', createdAt: '' }}
                                    record={parsedData![0]}
                                    onConfirmSignature={(url) => setSignaturePreviewUrl(url)}
                                    signatureBase64={signaturePreviewUrl}
                                    dingTalkUsers={dingTalkUsers}
                                    isDingTalkDataLoading={isDingTalkDataLoading}
                                    lateExemptionEnabled={lateExemptionEnabled}
                                    fullAttendanceEnabled={fullAttendanceEnabled}
                                />
                                <div className="mt-4 flex justify-center gap-2">
                                    <button onClick={handleOpenPreview} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-xs rounded-md">在线预览</button>
                                    <button onClick={handleGeneratePdf} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-xs rounded-md">生成存档预览</button>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-center gap-4 mt-12 pt-6 border-t border-slate-200 dark:border-slate-700">
                            <button onClick={() => setStep(2)} className="px-6 py-2 bg-slate-200 dark:bg-slate-600 rounded-md">上一步</button>
                            <button onClick={handleFinishSetup} disabled={isCheckingForOverwrite} className="px-8 py-2 bg-sky-600 text-white font-bold rounded-md hover:bg-sky-500 disabled:opacity-70 flex items-center gap-2">
                                {isCheckingForOverwrite && <Loader2Icon className="w-4 h-4 animate-spin" />}
                                完成并生成
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
