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
}> = ({ month, company, onCreateNew }) => {
    const formatMonth = (monthStr: string) => {
        try {
            const [year, month] = monthStr.split('-');
            return `${year}年${parseInt(month)}月`;
        } catch {
            return monthStr;
        }
    };

    const companyName = company === 'eyewind' ? '风眼科技' : '海多多';

    return (
        <EmptyState
            icon={
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-sky-100 dark:bg-sky-600/20">
                    <CalendarIcon className="h-8 w-8 text-sky-500 dark:text-sky-400" />
                </div>
            }
            title={`${formatMonth(month)}暂无考勤数据`}
            description={`${companyName}在${formatMonth(month)}还没有考勤确认单数据。您可以创建新的考勤确认单或切换到其他月份查看。`}
            action={onCreateNew ? {
                label: "创建考勤确认单",
                onClick: onCreateNew
            } : undefined}
        />
    );
};