
import React, { useState, useMemo } from 'react';
import type { AttendanceSheet, EmployeeAttendanceRecord, DingTalkUser } from '../../../database/schema.ts';
import { MegaphoneIcon, ChevronUpIcon, ChevronDownIcon, CheckCircleIcon, PencilIcon } from '../../Icons.tsx';
import { Avatar } from './Shared.tsx';
import { SignaturePad } from './Shared.tsx';

export const AttendancePhonePreview = React.forwardRef<HTMLDivElement, {
    sheet: AttendanceSheet;
    record: EmployeeAttendanceRecord;
    onConfirmSignature?: (dataUrl: string) => void;
    signatureBase64?: string | null;
    dingTalkUsers: DingTalkUser[];
    isDingTalkDataLoading: boolean;
    lateExemptionEnabled?: boolean;
    fullAttendanceEnabled?: boolean;
}>(({ sheet, record, onConfirmSignature, signatureBase64, dingTalkUsers, isDingTalkDataLoading, lateExemptionEnabled = true, fullAttendanceEnabled = true }, ref) => {

    const [modal, setModal] = useState<'none' | 'feedback' | 'signature'>('none');
    const [isDailyDetailsOpen, setIsDailyDetailsOpen] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(true);

    const dingTalkUser = useMemo(() => dingTalkUsers.find(u => u.name === record.employeeName), [dingTalkUsers, record.employeeName]);

    const getPreviewValue = (rec: EmployeeAttendanceRecord, column: string) => {
        if (column === '序号') return rec.employeeId;
        if (column === '姓名') return rec.employeeName;
        return rec.dailyData[column] || '-';
    };

    // 根据规则开关过滤汇总字段
    const allSummaryFields = ["正常出勤天数", "是否全勤", "豁免后迟到分钟数", "迟到分钟数"];
    const summaryFields = allSummaryFields.filter(field => {
        if (field === '是否全勤' && !fullAttendanceEnabled) return false;
        if (field === '豁免后迟到分钟数' && !lateExemptionEnabled) return false;
        return true;
    });
    const remarksField = "备注";
    
    // Use fixed 1-31 range for days to ensure weekends are shown even if data is empty
    const dailyCols = Array.from({ length: 31 }, (_, i) => String(i + 1));
    
    const summaryCols = summaryFields.filter(col => sheet.settings.showColumns.includes(col));
    const remarksValue = sheet.settings.showColumns.includes(remarksField) ? record.dailyData[remarksField] : null;


    return (
        <div className="relative w-[360px] h-[720px] bg-slate-900 rounded-[40px] shadow-2xl p-2 border-2 border-slate-700">
            {/* Phone physical buttons */}
            <div className="absolute -right-1 top-[180px] h-20 w-1.5 bg-slate-700 rounded-r-md"></div>
            <div className="absolute -left-1 top-[120px] h-14 w-1.5 bg-slate-700 rounded-l-md"></div>
            <div className="absolute -left-1 top-[180px] h-14 w-1.5 bg-slate-700 rounded-l-md"></div>

            <div ref={ref} className="w-full h-full bg-slate-900 rounded-[32px] flex flex-col overflow-hidden relative">
                <div className="flex-shrink-0 sticky top-0 bg-slate-900 z-10">
                    <div className="pt-2 px-2"><div className="bg-slate-950 w-20 h-4 rounded-full mx-auto"></div></div>
                    <div className="text-center py-3"><h4 className="font-bold text-base text-white truncate px-4">{sheet.title}</h4></div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-4">
                    {/* Banners */}
                    {(sheet.settings.autoConfirmEnabled && sheet.settings.autoConfirmDate || sheet.settings.showReminder) && (
                        <div className="space-y-2">
                            {sheet.settings.autoConfirmEnabled && sheet.settings.autoConfirmDate && (
                                <div className="p-2 rounded-lg bg-rose-900/60 text-rose-300 text-sm font-semibold flex items-center gap-2">
                                    <MegaphoneIcon className="w-4 h-4 flex-shrink-0" />
                                    <span>{new Date(sheet.settings.autoConfirmDate).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 后自动确认</span>
                                </div>
                            )}
                            {sheet.settings.showReminder && (
                                <div className="p-3 rounded-lg bg-amber-900/60 text-amber-300">
                                    <p className="font-semibold text-sm">温馨提示</p>
                                    <p className="text-xs mt-1">{sheet.settings.reminderText}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Employee Info */}
                    <div className="flex items-center gap-4 z-30 sticky top-0 bg-slate-900 py-4 -mx-4 px-4">
                        <Avatar name={record.employeeName} avatarUrl={dingTalkUser?.avatar} size="xl" isLoading={isDingTalkDataLoading} />
                        <div>
                            <p className="font-bold text-lg text-white">{record.employeeName}</p>
                        </div>
                    </div>

                    {/* Summary Card */}
                    <div className="bg-slate-800 rounded-lg">
                        <button onClick={() => setIsSummaryOpen(!isSummaryOpen)} className="sticky top-[70px] z-20 bg-slate-800 w-full flex justify-between items-center p-4 rounded-t-lg">
                            <h5 className="font-bold text-white">月度汇总</h5>
                            {isSummaryOpen ? <ChevronUpIcon className="w-5 h-5 text-slate-400" /> : <ChevronDownIcon className="w-5 h-5 text-slate-400" />}
                        </button>
                        {isSummaryOpen && (
                            <div className="p-4">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    {summaryCols.map(col => (
                                        <div key={col}>
                                            <p className="text-xs text-slate-400">{col}</p>
                                            <p className="font-semibold text-lg text-slate-100">{getPreviewValue(record, col)}</p>
                                        </div>
                                    ))}
                                </div>
                                {remarksValue && (
                                    <div className="mt-4 pt-3 border-t border-slate-700">
                                        <p className="text-xs text-slate-400 mb-1">{remarksField}</p>
                                        <p className="text-sm text-slate-200 whitespace-pre-wrap">{remarksValue}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Daily Details Collapsible */}
                    <div className="bg-slate-800 rounded-lg">
                        <button onClick={() => setIsDailyDetailsOpen(!isDailyDetailsOpen)} className="sticky top-[70px] z-10 bg-slate-800 w-full flex justify-between items-center p-4 rounded-t-lg">
                            <h5 className="font-bold text-white">每日考勤详情</h5>
                            {isDailyDetailsOpen ? <ChevronUpIcon className="w-5 h-5 text-slate-400" /> : <ChevronDownIcon className="w-5 h-5 text-slate-400" />}
                        </button>
                        {isDailyDetailsOpen && (
                            <div className="px-4 pb-4 space-y-2">
                                {dailyCols.map(col => {
                                    if (!sheet.settings.showColumns.includes(col)) return null;
                                    return (
                                        <div key={col} className="flex justify-between items-center border-b border-slate-700 py-1.5 last:border-0 text-sm">
                                            <span className="text-slate-400">{col}号</span>
                                            <span className="font-medium text-slate-200">{getPreviewValue(record, col)}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Signature display */}
                    {signatureBase64 && (
                        <div className="bg-slate-800 p-4 rounded-lg">
                            <h5 className="font-bold text-white mb-2">我的签名</h5>
                            <div className="bg-slate-700 p-3 rounded-md border border-slate-600 text-center">
                                {signatureBase64.startsWith('data:image') ? (
                                    <img src={signatureBase64} alt="签名" className="mx-auto" style={{ maxHeight: '80px', filter: 'invert(1)' }} />
                                ) : (
                                    <p className="text-sm text-slate-300 italic">{signatureBase64}</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Footer Buttons */}
                <div className="p-4 bg-slate-900 flex-shrink-0 z-10">
                    {signatureBase64 ? (
                        <div className="w-full py-3 bg-green-600 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                            <CheckCircleIcon className="w-5 h-5" />
                            已签名确认
                        </div>
                    ) : sheet.settings.feedbackEnabled || sheet.settings.employeeSignature ? (
                        <div className="flex items-center gap-3">
                            {sheet.settings.feedbackEnabled && (
                                <button onClick={() => setModal('feedback')} className="flex-1 py-3 bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-sm font-semibold">
                                    对考勤有疑问
                                </button>
                            )}
                            {sheet.settings.employeeSignature ? (
                                <button onClick={() => setModal('signature')} className="flex-1 py-3 bg-sky-500 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
                                    <PencilIcon className="w-4 h-4" />
                                    签名确认
                                </button>
                            ) : (
                                <button className="flex-1 py-3 bg-sky-500 text-white rounded-lg text-sm font-semibold">确认</button>
                            )}
                        </div>
                    ) : (
                        <button className="w-full py-3 bg-sky-500 text-white rounded-lg text-sm font-semibold">确认</button>
                    )}
                </div>

                {/* Inner Modals */}
                {modal === 'feedback' && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-8 z-20">
                        <div className="bg-slate-700 p-6 rounded-lg text-center shadow-lg w-full space-y-4">
                            <MegaphoneIcon className="w-12 h-12 text-sky-500 mx-auto" />
                            <div>
                                <h5 className="font-bold text-lg text-white">联系答疑员</h5>
                                <p className="text-slate-300 mt-2 text-sm">
                                    如对考勤明细有疑问，请通过钉钉联系负责人 <strong className="text-slate-100">{sheet.settings.feedbackContactPerson}</strong> 进行沟通调整。
                                </p>
                            </div>
                            <button onClick={() => setModal('none')} className="w-full px-6 py-2 bg-sky-500 text-white rounded-md text-sm font-semibold">好的</button>
                        </div>
                    </div>
                )}
                {modal === 'signature' && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
                        <div className="bg-slate-800 w-full max-w-sm rounded-lg p-4 flex flex-col shadow-lg space-y-3">
                            <h5 className="text-center font-bold text-white flex-shrink-0">请在此处签名</h5>
                            <div className="w-full aspect-[2/1]">
                                <SignaturePad
                                    onConfirm={(dataUrl) => {
                                        onConfirmSignature?.(dataUrl);
                                        setModal('none');
                                    }}
                                    onCancel={() => setModal('none')}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
