
import React from 'react';
import type { AttendanceSheet } from '../../../database/schema.ts';
import { PlusCircleIcon } from '../../Icons.tsx';

// 1. Dashboard View (Renamed to SheetList)
export const SheetList: React.FC<{
    sheets: AttendanceSheet[],
    mainCompany: string,
    onSelectSheet: (id: string) => void,
    onCreate: () => void,
    userPermissions?: string[]; // New Prop
}> = ({ sheets, onSelectSheet, onCreate, userPermissions = [] }) => {

    const canCreate = userPermissions.includes('attendance_verification:create');

    const getCompletionStats = (sheet: AttendanceSheet) => {
        const total = sheet.employeeRecords.length;
        if (total === 0) return { confirmed: 0, total: 0 };
        const confirmed = sheet.employeeRecords.filter(r => r.confirmStatus === 'confirmed' || r.confirmStatus === 'auto-confirmed').length;
        return { confirmed, total };
    };

    return (
        <div>
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">考勤确认</h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">创建和管理员工的月度考勤确认单。</p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-3">
                    {canCreate && (
                        <button
                            onClick={onCreate}
                            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white font-semibold rounded-md hover:bg-sky-500 transition-colors"
                        >
                            <PlusCircleIcon className="w-5 h-5" />
                            创建考勤确认
                        </button>
                    )}
                </div>
            </header>

            <div className="bg-white dark:bg-slate-800/50 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
                {sheets.length > 0 ? (
                    <div className="space-y-3">
                        {sheets.map(sheet => {
                            const stats = getCompletionStats(sheet);
                            const progress = stats.total > 0 ? (stats.confirmed / stats.total) * 100 : 0;
                            return (
                                <div key={sheet.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] items-center gap-4 p-4 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    <div>
                                        <h3 className="font-semibold text-slate-800 dark:text-white">{sheet.title}</h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">创建于: {new Date(sheet.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="w-48 text-right">
                                        <div className="flex justify-end items-baseline gap-1">
                                            <span className="text-lg font-bold text-slate-800 dark:text-white">{stats.confirmed}</span>
                                            <span className="text-sm text-slate-500 dark:text-slate-400">/ {stats.total} 人已确认</span>
                                        </div>
                                        <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-1.5 mt-1">
                                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${progress}%` }}></div>
                                        </div>
                                    </div>
                                    <button onClick={() => onSelectSheet(sheet.id)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-sm font-semibold text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600">
                                        查看详情
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <p className="text-slate-500 dark:text-slate-400">还没有任何考勤确认单。</p>
                    </div>
                )}
            </div>
        </div>
    );
};
