
import React from 'react';
import type { AttendanceSheet, EmployeeAttendanceRecord, DingTalkUser } from '../../../database/schema.ts';
import { InfoIcon } from '../../Icons.tsx';

// Component for rendering the archivable content
export const ArchivableDetailView = React.forwardRef<HTMLDivElement, {
    sheet: AttendanceSheet;
    record: EmployeeAttendanceRecord;
    dingTalkUser: DingTalkUser | undefined;
}>(({ sheet, record, dingTalkUser }, ref) => {

    const formatTimestamp = (isoString: string | null): string => {
        if (!isoString) return 'N/A';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return 'N/A';
        return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日 ` +
            `${String(date.getHours()).padStart(2, '0')}时${String(date.getMinutes()).padStart(2, '0')}分${String(date.getSeconds()).padStart(2, '0')}秒`;
    };

    const monthFormatted = sheet.month.replace('-', '年') + '月';

    const dailyCols = Object.keys(record.dailyData)
        .filter(key => /^\d+$/.test(key))
        .sort((a, b) => parseInt(a) - parseInt(b));

    const visibleDailyCols = dailyCols.filter(day => sheet.settings.showColumns.includes(day));
    const halfIndex = Math.ceil(visibleDailyCols.length / 2);
    const leftColumnDays = visibleDailyCols.slice(0, halfIndex);
    const rightColumnDays = visibleDailyCols.slice(halfIndex);

    const summaryData = {
        "正常出勤天数": record.dailyData["正常出勤天数"] || 'N/A',
        "是否全勤": record.dailyData["是否全勤"] || 'N/A',
        "豁免后迟到分钟数": record.dailyData["豁免后迟到分钟数"] || '0',
        "迟到分钟数": record.dailyData["迟到分钟数"] || '0',
        "备注": record.dailyData["备注"] || '无'
    };

    const confirmationMethod = record.confirm_typ === 'auto' ? "系统自动确认" : record.signatureBase64?.startsWith('data:image') ? "员工手动确认" : "员工点击确认";

    return (
        <div ref={ref} className="font-sans" style={{ width: '800px', position: 'absolute', left: '-9999px', top: 0, backgroundColor: '#e0f2fe', color: '#333', padding: '40px' }}>
            <h1 className="text-4xl font-bold text-center text-slate-800">{record.employeeName}的考勤存证</h1>
            <p className="text-xl text-center text-slate-600 mt-2 mb-6">{monthFormatted}</p>

            <div className="bg-white rounded-2xl shadow-lg p-8 relative">
                <h2 className="text-2xl font-bold text-center text-slate-800 mb-4">{sheet.title}</h2>

                {sheet.settings.showReminder && sheet.settings.reminderText && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3 text-yellow-800 mb-6">
                        <div className="flex-shrink-0 mt-0.5"><InfoIcon className="w-5 h-5" /></div>
                        <div><h4 className="font-semibold">温馨提示</h4><p className="text-sm mt-1">{sheet.settings.reminderText}</p></div>
                    </div>
                )}

                <div className="absolute top-[220px] left-1/2 -translate-x-1/2 w-[500px] border-4 border-red-300 rounded-lg p-4 text-red-400 z-10 opacity-90 pointer-events-none">
                    <h3 className="text-center font-bold text-lg mb-3 border-b-2 border-red-300 pb-2">{monthFormatted}考勤确认单确认记录</h3>
                    <div className="space-y-1.5 text-base font-semibold">
                        <p><strong className="font-semibold w-24 inline-block">员工姓名:</strong> {record.employeeName}</p>
                        <p><strong className="font-semibold w-24 inline-block">UserID:</strong> {dingTalkUser?.userid || record.employeeId}</p>
                        <p><strong className="font-semibold w-24 inline-block">确认方式:</strong> {confirmationMethod}</p>
                        <p><strong className="font-semibold w-24 inline-block">查看时间:</strong> {formatTimestamp(record.viewed_at)}</p>
                        <p><strong className="font-semibold w-24 inline-block">确认时间:</strong> {formatTimestamp(record.confirmed_at)}</p>
                    </div>
                </div>

                <div className="flex gap-x-8 relative z-0">
                    <div className="flex-1 space-y-2 text-lg border-r border-gray-300 dark:border-gray-600 pr-10">
                        {leftColumnDays.map(day => {
                            const status = record.dailyData[day] || '-';
                            return (
                                <div key={day} className="flex justify-between items-baseline border-b border-dashed border-gray-300 py-2">
                                    <span className="text-gray-600">{day}号</span>
                                    <span className={`font-semibold ${status === '√' ? 'text-green-600' : 'text-gray-800'}`}>{status}</span>
                                </div>
                            )
                        })}
                    </div>
                    <div className="flex-1 space-y-2 text-lg ">
                        {rightColumnDays.map(day => {
                            const status = record.dailyData[day] || '-';
                            return (
                                <div key={day} className="flex justify-between items-baseline border-b border-dashed border-gray-300 py-2">
                                    <span className="text-gray-600">{day}号</span>
                                    <span className={`font-semibold ${status === '√' ? 'text-green-600' : 'text-gray-800'}`}>{status}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t-2 border-gray-200">
                    <div className="grid grid-cols-2 gap-x-8 text-lg">
                        {Object.entries(summaryData).map(([key, value]) => (
                            <div key={key} className="flex justify-between py-1">
                                <span className="text-gray-600 min-w-[80px]">{key}</span>
                                <span className="font-semibold text-gray-800">{String(value)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {record.signatureBase64 ? (
                    <div className="mt-8 pt-6 border-t-2 border-gray-200 flex justify-between items-end">
                        <div className="flex items-end gap-4">
                            <span className="text-lg text-gray-600">签名:</span>
                            {record.signatureBase64.startsWith('data:image') ? (
                                <img src={record.signatureBase64} alt="签名" className="h-12 w-auto" />
                            ) : (
                                <span className="text-base font-semibold text-gray-700 italic">-</span>
                            )}
                        </div>
                        <p className="text-base text-gray-500">{formatTimestamp(record.confirmed_at)}</p>
                    </div>
                ) : (
                    <div className="mt-8 pt-6 border-t-2 border-gray-200 flex justify-between items-end">
                        <div className="flex items-end gap-4"><span className="text-lg text-gray-600">签名: 系统自动确认</span></div>
                        <p className="text-base text-gray-500">{formatTimestamp(record.confirmed_at)}</p>
                    </div>
                )}
            </div>
        </div>
    );
});
