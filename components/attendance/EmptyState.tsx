import React from 'react';
import { CalendarIcon, ClipboardListIcon } from '../Icons.tsx';

interface EmptyStateProps {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    title = "暂无数据",
    description = "当前条件下没有找到相关数据",
    icon,
    action
}) => {
    const defaultIcon = (
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-700">
            <ClipboardListIcon className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        </div>
    );

    return (
        <div className="text-center py-12">
            {icon || defaultIcon}
            <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
                {title}
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {description}
            </p>
            {action && (
                <div className="mt-6">
                    <button
                        onClick={action.onClick}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors"
                    >
                        {action.label}
                    </button>
                </div>
            )}
        </div>
    );
};

// 专门用于考勤确认页面的空状态
export const AttendanceEmptyState: React.FC<{
    month: string;
    company: string;
    onCreateNew?: () => void;
    onImportFromDashboard?: () => void;
    hasDashboardCache?: boolean;
    isCheckingCache?: boolean;
}> = ({ month, company, onCreateNew, onImportFromDashboard, hasDashboardCache = false, isCheckingCache = false }) => {
    const formatMonth = (monthStr: string) => {
        try {
            const [year, month] = monthStr.split('-');
            return `${year}年${parseInt(month)}月`;
        } catch {
            return monthStr;
        }
    };

    const companyName = company === 'eyewind' ? '风眼科技' : '海多多';

    // 🔥 调试日志
    console.log('[AttendanceEmptyState] 渲染状态:', {
        month,
        company,
        hasDashboardCache,
        isCheckingCache,
        hasImportButton: !!onImportFromDashboard
    });

    return (
        <div className="text-center py-12">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-sky-100 dark:bg-sky-600/20">
                <CalendarIcon className="h-8 w-8 text-sky-500 dark:text-sky-400" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
                {`${formatMonth(month)}暂无考勤数据`}
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {`${companyName}在${formatMonth(month)}还没有考勤确认单数据。您可以创建新的考勤确认单或从考勤仪表盘导入数据。`}
            </p>
            <div className="mt-6 flex justify-center gap-3">
                {onCreateNew && (
                    <button
                        onClick={onCreateNew}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors"
                    >
                        创建考勤确认单
                    </button>
                )}
                {onImportFromDashboard && (
                    <button
                        onClick={onImportFromDashboard}
                        disabled={!hasDashboardCache || isCheckingCache}
                        className={`inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm transition-colors ${
                            hasDashboardCache && !isCheckingCache
                                ? 'border-transparent text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                                : 'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 cursor-not-allowed'
                        }`}
                        title={!hasDashboardCache ? '仪表盘缓存中没有数据，请先在考勤日历中加载数据' : '从考勤仪表盘导入数据'}
                    >
                        {isCheckingCache ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                检查中...
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                从仪表盘导入
                            </>
                        )}
                    </button>
                )}
            </div>
            {!hasDashboardCache && !isCheckingCache && onImportFromDashboard && (
                <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                    提示：请先在考勤日历中加载数据后，才能使用导入功能
                </p>
            )}
        </div>
    );
};