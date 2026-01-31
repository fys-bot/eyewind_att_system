
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { AttendanceSheet, EmployeeAttendanceRecord, DingTalkUser } from '../../../database/schema.ts';
import { AlertTriangleIcon, ArrowRightIcon, XIcon, SendIcon, Loader2Icon, ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from '../../Icons.tsx';
import { Modal } from '../../Modal.tsx';
import { Avatar } from './Shared.tsx';
import { AttendancePhonePreview } from './PhonePreview.tsx';
import { generateDingTalkMarkdown } from './api.ts';

// --- Confirm Changes Modal ---
export const ConfirmChangesModal: React.FC<{
    isOpen: boolean;
    changes: { label: string; oldValue: string; newValue: string }[];
    onConfirm: () => void;
    onClose: () => void;
}> = ({ isOpen, changes, onConfirm, onClose }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md">
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/50 sm:mx-0 sm:h-10 sm:w-10">
                    <AlertTriangleIcon className="h-6 w-6 text-yellow-500 dark:text-yellow-400" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-white">是否确定修改考勤明细？</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">请确认以下修改内容：</p>
                </div>
            </div>
            <div className="my-6 border-t border-slate-200 dark:border-slate-700" />
            <div className="max-h-60 overflow-y-auto pr-2 space-y-3">
                {changes.length > 0 ? changes.map((change, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                        <span className="font-medium text-slate-600 dark:text-slate-400">{change.label}</span>
                        <div className="flex items-center gap-2 font-mono text-base">
                            <span className="text-slate-500 dark:text-slate-500 line-through">{change.oldValue || '—'}</span>
                            <ArrowRightIcon className="w-4 h-4 text-slate-400 dark:text-slate-600 flex-shrink-0" />
                            <strong className="text-slate-900 dark:text-white">{change.newValue || '—'}</strong>
                        </div>
                    </div>
                )) : (
                    <p className="text-sm text-slate-500 text-center py-4">没有检测到任何更改。</p>
                )}
            </div>
            <div className="bg-slate-100 dark:bg-slate-700/50 -mx-6 -mb-6 mt-6 px-6 py-4 flex justify-end gap-3 rounded-b-lg">
                <button onClick={onClose} className="px-6 py-2 text-sm font-semibold bg-white dark:bg-slate-600 hover:bg-slate-50 dark:hover:bg-slate-500 border border-slate-300 dark:border-slate-500 rounded-md transition-colors">取消</button>
                <button onClick={onConfirm} className="px-6 py-2 text-sm font-semibold bg-sky-600 text-white rounded-md hover:bg-sky-500 transition-colors">确定</button>
            </div>
        </Modal>
    );
};

// --- Calendar Editor ---
const getStatusStyles = (status: string | undefined): string => {
    if (!status) return '';
    if (status === '√') return 'text-green-600 dark:text-green-400 text-2xl font-bold';
    const baseStyle = 'px-2 py-0.5 rounded-md inline-block';
    const statusStyles: Record<string, string> = {
        '病假': 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
        '事假': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
        '年假': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
        '陪产假': 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
        '外出': 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200',
        '调休': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
        '加班': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
        '丧假': 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200',
        '婚假': 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
        '产假': 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300',
    };
    if (statusStyles[status]) return `${baseStyle} ${statusStyles[status]} text-sm font-semibold`;
    return `${baseStyle} bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 text-xs font-semibold`;
};

export const CalendarEditor: React.FC<{ month: string; data: Record<string, string>; onChange: (day: string, value: string) => void; }> = ({ month, data, onChange }) => {
    const [activeEditor, setActiveEditor] = useState<{ day: number; target: HTMLElement } | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    const { daysInMonth, firstDayOfMonth, year, monthIndex } = useMemo(() => {
        const [y, m] = month.split('-').map(Number);
        return { daysInMonth: new Date(y, m, 0).getDate(), firstDayOfMonth: new Date(y, m - 1, 1).getDay(), year: y, monthIndex: m - 1 };
    }, [month]);

    const formattedMonth = useMemo(() => {
        if (!month) return '';
        const [year, monthNum] = month.split('-');
        return `${year}年${monthNum}月`;
    }, [month]);

    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const predefinedStatuses = ['√', '年假', '病假', '事假', '加班', '调休', '外出', '婚假', '产假', '丧假', '陪产假'];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node) && activeEditor && event.target !== activeEditor.target && !activeEditor.target.contains(event.target as Node)) {
                setActiveEditor(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeEditor]);

    const popoverPosition = useMemo(() => {
        if (!activeEditor) return {};
        const rect = activeEditor.target.getBoundingClientRect();
        const popoverWidth = 224; 
        const popoverHeight = 250; 
        let top = rect.bottom + 8;
        let left = rect.left;
        if (left + popoverWidth > window.innerWidth - 16) left = rect.right - popoverWidth;
        if (top + popoverHeight > window.innerHeight - 16) top = rect.top - popoverHeight - 8;
        if (top < 8) top = 8;
        if (left < 8) left = 8;
        return { top: `${top}px`, left: `${left}px` };
    }, [activeEditor]);

    const handleDayClick = (day: number, e: React.MouseEvent<HTMLButtonElement>) => {
        setActiveEditor({ day, target: e.currentTarget });
    };

    const handleStatusSelect = (status: string) => {
        if (activeEditor) {
            onChange(String(activeEditor.day), status);
        }
        setActiveEditor(null);
    };

    let calendarDays = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
        calendarDays.push(<div key={`empty-${i}`} className="border-r border-b border-slate-200 dark:border-slate-700"></div>);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const dayOfWeek = new Date(year, monthIndex, day).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        calendarDays.push(
            <button
                key={day}
                onClick={(e) => handleDayClick(day, e)}
                className={`relative border-r border-b border-slate-200 dark:border-slate-700 p-2 text-left h-20 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 z-10 ${isWeekend ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}
            >
                <span className={`text-sm ${isWeekend ? 'text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>{day}</span>
                <div className={`mt-1 text-center leading-tight h-10 flex items-center justify-center ${getStatusStyles(data[String(day)])}`}>
                    {data[String(day)] || ''}
                </div>
            </button>
        );
    }

    return (
        <div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-4 text-center">{formattedMonth}考勤明细</h4>
            <div className="grid grid-cols-7 border-t border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {weekdays.map(day => (
                    <div key={day} className="text-center font-semibold text-xs py-2 border-r border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300">{day}</div>
                ))}
                {calendarDays}
            </div>
            {activeEditor && (
                <div ref={popoverRef} style={popoverPosition} className="fixed z-50 w-56 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-600 p-2">
                    <p className="text-sm font-semibold mb-2 px-1 text-slate-800 dark:text-slate-200">{month}-{String(activeEditor.day).padStart(2, '0')}</p>
                    <div className="grid grid-cols-3 gap-1">
                        {predefinedStatuses.map(status => (
                            <button key={status} onClick={() => handleStatusSelect(status)} className="p-2 text-sm rounded-md bg-slate-100 dark:bg-slate-700 hover:bg-sky-500 hover:text-white dark:hover:bg-sky-500 transition-colors">{status}</button>
                        ))}
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); handleStatusSelect((e.currentTarget.elements[0] as HTMLInputElement).value); }} className="mt-2 flex gap-1">
                        <input type="text" placeholder="自定义..." className="flex-1 w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 text-sm" />
                        <button type="submit" className="px-2 bg-sky-500 text-white rounded-md text-sm">✓</button>
                    </form>
                </div>
            )}
        </div>
    );
};

// --- Remarks Editor ---
export interface RemarkItem {
    id: number;
    type: string;
    range: string;
    duration: string;
    unit: string;
}

export const RemarksEditor: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
    const parseRemarks = (str: string): RemarkItem[] => {
        if (!str) return [];
        return str.split('\n').filter(s => s.trim()).map((line, idx) => {
            // Attempt to parse: Type Range 共 Duration Unit
            const match = line.match(/^(\S+)\s+(.+?)\s+(?:共\s*)?([\d\.]+)\s*([^\s\d]+)$/);
            if (match) {
                return { id: Date.now() + idx, type: match[1], range: match[2], duration: match[3], unit: match[4] };
            }
            // Fallback parsing
            const parts = line.split(/\s+/);
            if (parts.length >= 3) {
                const type = parts[0];
                const unit = parts[parts.length - 1];
                const duration = parts[parts.length - 2];
                const range = parts.slice(1, parts.length - 2).join(' ').replace(/共/g, '').trim();
                return { id: Date.now() + idx, type, range, duration, unit };
            }
            return { id: Date.now() + idx, type: '其他', range: line, duration: '0', unit: '-' };
        });
    };

    const [items, setItems] = useState<RemarkItem[]>(parseRemarks(value));

    // Effect to push changes back to parent
    useEffect(() => {
        const newValue = items.map(item => `${item.type} ${item.range} 共 ${item.duration} ${item.unit}`).join('\n');
        if (newValue !== value) {
            onChange(newValue);
        }
    }, [items]);

    const handleItemChange = (id: number, field: keyof RemarkItem, val: string) => {
        setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
    };

    const handleDelete = (id: number) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    const handleAdd = () => {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        setItems(prev => [...prev, { id: Date.now(), type: '事假', range: `${dateStr} 至 ${dateStr}`, duration: '0', unit: '小时' }]);
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">备注明细</label>
                <button onClick={handleAdd} className="text-xs flex items-center gap-1 text-sky-600 hover:text-sky-700 font-medium">
                    <PlusIcon className="w-3 h-3" /> 添加条目
                </button>
            </div>
            {items.length === 0 && <p className="text-sm text-slate-400 italic">无备注信息</p>}
            <div className="space-y-2">
                {items.map((item) => (
                    <div key={item.id} className="flex gap-2 items-center bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                        <div className="w-24 flex-shrink-0">
                            <input 
                                type="text" 
                                value={item.type} 
                                onChange={e => handleItemChange(item.id, 'type', e.target.value)} 
                                placeholder="类型"
                                className="w-full text-xs border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 bg-transparent"
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <input 
                                type="text" 
                                value={item.range} 
                                onChange={e => handleItemChange(item.id, 'range', e.target.value)} 
                                placeholder="日期范围"
                                className="w-full text-xs border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 bg-transparent"
                            />
                        </div>
                        <div className="w-16 flex-shrink-0">
                            <input 
                                type="number" 
                                value={item.duration} 
                                onChange={e => handleItemChange(item.id, 'duration', e.target.value)} 
                                placeholder="时长"
                                className="w-full text-xs border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 bg-transparent"
                            />
                        </div>
                        <div className="w-16 flex-shrink-0">
                             <select 
                                value={item.unit} 
                                onChange={e => handleItemChange(item.id, 'unit', e.target.value)}
                                className="w-full text-xs border border-slate-300 dark:border-slate-600 rounded px-1 py-1 bg-transparent"
                             >
                                 <option value="小时">小时</option>
                                 <option value="天">天</option>
                             </select>
                        </div>
                        <button onClick={() => handleDelete(item.id)} className="p-1 text-slate-400 hover:text-red-500">
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Edit Attendance Modal ---
export const EditAttendanceModal: React.FC<{
    record: EmployeeAttendanceRecord | null;
    sheet: AttendanceSheet;
    onClose: () => void;
    onSave: (updatedRecord: EmployeeAttendanceRecord) => void;
    viewMode: 'preview' | 'edit';
    onSwitchToEdit: () => void;
    onResend: (recordId: string) => void;
    dingTalkUsers: DingTalkUser[];
    isDingTalkDataLoading: boolean;
    lateExemptionEnabled?: boolean;
    fullAttendanceEnabled?: boolean;
}> = ({ record, sheet, onClose, onSave, viewMode, onSwitchToEdit, onResend, dingTalkUsers, isDingTalkDataLoading, lateExemptionEnabled = true, fullAttendanceEnabled = true }) => {
    const [localRecord, setLocalRecord] = useState<EmployeeAttendanceRecord | null>(null);

    useEffect(() => {
        if (record) {
            setLocalRecord(JSON.parse(JSON.stringify(record))); 
        } else {
            setLocalRecord(null);
        }
    }, [record]);

    const dingTalkUser = useMemo(() => dingTalkUsers.find(u => u.name === record?.employeeName), [dingTalkUsers, record?.employeeName]);

    if (!record || !localRecord) return null;

    const handleDailyDataChange = (field: string, value: string) => {
        setLocalRecord(prev => {
            if (!prev) return null;
            const newDailyData = { ...prev.dailyData, [field]: value };
            const dayNumber = parseInt(field, 10);
            const isDayField = !isNaN(dayNumber) && dayNumber >= 1 && dayNumber <= 31 && String(dayNumber) === field;

            if (isDayField) {
                const normalDays = Object.keys(newDailyData)
                    .filter(key => {
                        const dayNum = parseInt(key, 10);
                        return !isNaN(dayNum) && dayNum >= 1 && dayNum <= 31 && String(dayNum) === key;
                    })
                    .reduce((count, dayKey) => (newDailyData[dayKey] === '√' ? count + 1 : count), 0);
                newDailyData['正常出勤天数'] = String(normalDays);
            }
            return { ...prev, dailyData: newDailyData };
        });
    };

    const handleSaveChanges = () => {
        if (localRecord) onSave(localRecord);
    };

    // 根据规则开关过滤优先字段
    const allPriorityFields = ['是否全勤', '正常出勤天数', '迟到分钟数', '豁免后迟到分钟数'];
    const priorityFields = allPriorityFields.filter(field => {
        if (field === '是否全勤' && !fullAttendanceEnabled) return false;
        if (field === '豁免后迟到分钟数' && !lateExemptionEnabled) return false;
        return true;
    });
    const remarksKey = '备注';
    
    // Filter out priority fields and remarks from the "rest" list
    const otherSummaryHeaders = sheet.settings.showColumns.filter(h => 
        isNaN(parseInt(h)) && 
        !['姓名', '序号'].includes(h) && 
        !priorityFields.includes(h) && 
        h !== remarksKey
    );

    const renderFieldInput = (header: string, commonInputClass: string) => {
        const label = <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{header}</label>;
        if (header === '正常出勤天数') return <div key={header}>{label}<input type="number" value={localRecord.dailyData[header] || '0'} readOnly disabled className={`${commonInputClass} bg-slate-100 dark:bg-slate-700/50 cursor-not-allowed`} /></div>;
        if (header === '是否全勤') return <div key={header}>{label}<select value={localRecord.dailyData[header] || '否'} onChange={e => handleDailyDataChange(header, e.target.value)} className={`${commonInputClass} h-[34px]`}><option value="是">是</option><option value="否">否</option></select></div>;
        if (header.includes('分钟') || header.includes('天数') || header.includes('次数') || header.includes('(时)')) {
             return <div key={header}>{label}<input type="number" value={localRecord.dailyData[header] || ''} onChange={e => handleDailyDataChange(header, e.target.value)} className={commonInputClass} /></div>;
        }
        return <div key={header}>{label}<input type="text" value={localRecord.dailyData[header] || ''} onChange={e => handleDailyDataChange(header, e.target.value)} className={commonInputClass} /></div>;
    };

    const commonInputClass = "w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 text-sm";

    return (
        <Modal
            isOpen={!!record}
            onClose={onClose}
            title={record.employeeName}
            size="4xl"
            footer={
                viewMode === 'edit' ? (
                    <>
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md">取消</button>
                        <button onClick={handleSaveChanges} className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-md">保存修改</button>
                    </>
                ) : (
                    <button onClick={onClose} className="px-6 py-2 bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold rounded-md">关闭</button>
                )
            }
        >
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <Avatar name={record.employeeName} avatarUrl={dingTalkUser?.avatar} size="xl" isLoading={isDingTalkDataLoading} />
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{record.employeeName}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{dingTalkUser?.department || record.department}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {record.isModifiedAfterSent && (
                        <button onClick={() => onResend(record.id)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-md hover:bg-amber-200 dark:hover:bg-amber-900">
                            <SendIcon className="w-4 h-4" />
                            重新发送
                        </button>
                    )}
                    <button onClick={onSwitchToEdit} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500">
                        <PencilIcon className="w-4 h-4" />
                        {viewMode === 'edit' ? '返回预览' : '编辑明细'}
                    </button>
                </div>
            </div>

            {viewMode === 'preview' ? (
                <div className="flex justify-center">
                    <AttendancePhonePreview sheet={sheet} record={record} signatureBase64={record.signatureBase64} dingTalkUsers={dingTalkUsers} isDingTalkDataLoading={isDingTalkDataLoading} lateExemptionEnabled={lateExemptionEnabled} fullAttendanceEnabled={fullAttendanceEnabled} />
                </div>
            ) : (
                <div className="max-h-[70vh] overflow-y-auto pr-2">
                    <div className="space-y-6">
                        <CalendarEditor
                            month={sheet.month}
                            data={localRecord.dailyData}
                            onChange={handleDailyDataChange}
                        />
                        
                        <div>
                            <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 mt-6 border-b border-slate-200 dark:border-slate-700 pb-2">月度汇总</h4>
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-6">
                                {/* Priority Fields Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {priorityFields.map(header => renderFieldInput(header, commonInputClass))}
                                </div>

                                {/* Remarks Editor Section */}
                                {sheet.settings.showColumns.includes(remarksKey) && (
                                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                        <RemarksEditor 
                                            value={localRecord.dailyData[remarksKey] || ''} 
                                            onChange={val => handleDailyDataChange(remarksKey, val)} 
                                        />
                                    </div>
                                )}

                                {/* Other Summary Headers Grid */}
                                {otherSummaryHeaders.length > 0 && (
                                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {otherSummaryHeaders.map(header => renderFieldInput(header, commonInputClass))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};

// --- DingTalk Preview Modal ---
export const DingTalkPreviewModal: React.FC<{
    records: EmployeeAttendanceRecord[];
    sheet: AttendanceSheet;
    mainCompany: string | null,
    currentIndex: number;
    onNavigate: (newIndex: number) => void;
    onClose: () => void;
    onSend: (records: EmployeeAttendanceRecord[]) => Promise<void>;
    isSending: boolean;
}> = ({ records, sheet, mainCompany, currentIndex, onNavigate, onClose, onSend, isSending }) => {

    const currentRecord = records[currentIndex];
    const markdown = useMemo(() => {
        if (!currentRecord) return '';
        return generateDingTalkMarkdown(currentRecord, sheet, mainCompany);
    }, [currentRecord, sheet]);

    const MarkdownPreview: React.FC<{ markdown: string }> = ({ markdown }) => {
        const lines = markdown.split('\n').filter(line => line.trim() !== '');
        return (
            <div className="text-sm text-slate-300 space-y-1">
                {lines.map((line, i) => {
                    if (line.startsWith('### ')) return <h3 key={i} className="text-base font-bold text-white pb-1">{line.substring(4)}</h3>;
                    if (line.startsWith('---')) return <hr key={i} className="border-slate-600 !my-2" />;
                    if (line.startsWith('* **')) {
                        const content = line.substring(2).replace(/<br>$/, '').trim();
                        if (content.includes('<font')) {
                            const statusMatch = content.match(/\*\*(.*?：)\*\*.*<font.*?>(.*?)<\/font>/);
                            if (statusMatch) {
                                const label = statusMatch[1];
                                let value = statusMatch[2].replace(/\*\*/g, '');
                                const statusColor = content.includes('#FF0000') ? 'text-red-400' : 'text-green-400';
                                return <div key={i} className="flex items-baseline"><span className="mr-1.5">•</span><div><strong>{label}</strong> <span className={`${statusColor} font-bold`}>{value}</span></div></div>;
                            }
                        }
                        const regularMatch = content.match(/\*\*(.*?：)\*\*\s*(.*)/);
                        if (regularMatch) return <div key={i} className="flex items-baseline"><span className="mr-1.5">•</span><div><strong>{regularMatch[1]}</strong>{regularMatch[2]}</div></div>;
                        return <p key={i}>{line}</p>;
                    }
                    return <p key={i} className="!mt-2">{line.replace(/【|】/g, '')}</p>;
                })}
            </div>
        );
    };

    if (!currentRecord) return null;

    return (
        <Modal isOpen={true} onClose={onClose} title={`${currentRecord.employeeName} - 钉钉发送预览`} size="md">
            <div className="bg-slate-700 p-4 rounded-lg">
                <MarkdownPreview markdown={markdown} />
                <div className="mt-4 pt-4 border-t border-slate-600 text-sky-400 text-sm">点击查看考勤确认单详情</div>
            </div>
            {records.length > 1 && (
                <div className="flex justify-between items-center mt-4">
                    <button onClick={() => onNavigate(currentIndex - 1)} disabled={currentIndex === 0} className="p-2 disabled:opacity-50"><ChevronLeftIcon /></button>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{currentIndex + 1} / {records.length}</span>
                    <button onClick={() => onNavigate(currentIndex + 1)} disabled={currentIndex === records.length - 1} className="p-2 disabled:opacity-50"><ChevronRightIcon /></button>
                </div>
            )}
            <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-slate-200 dark:border-slate-700">
                <button onClick={onClose} disabled={isSending} className="px-6 py-2 text-sm font-medium border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md">取消</button>
                <button onClick={() => onSend(records)} disabled={isSending} className="px-6 py-2 bg-sky-600 text-white text-sm font-medium rounded-md flex items-center gap-2">
                    {isSending ? <Loader2Icon className="animate-spin w-5 h-5" /> : <SendIcon className="w-5 h-5" />}
                    {isSending ? `发送中...` : `确认并发送 (${records.length})`}
                </button>
            </div>
        </Modal>
    );
};
