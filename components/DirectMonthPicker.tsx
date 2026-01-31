import React, { useState } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons.tsx';

interface DirectMonthPickerProps {
    value: string; // YYYY-MM format
    onChange: (month: string) => void;
    disabled?: boolean;
    className?: string;
}

export const DirectMonthPicker: React.FC<DirectMonthPickerProps> = ({ 
    value, 
    onChange, 
    disabled = false, 
    className = '' 
}) => {
    const [viewYear, setViewYear] = useState(() => {
        const year = parseInt(value.split('-')[0]);
        return isNaN(year) ? new Date().getFullYear() : year;
    });

    // 格式化显示文本
    const formatDisplayText = (monthStr: string) => {
        try {
            const [year, month] = monthStr.split('-');
            const monthNames = [
                '1月', '2月', '3月', '4月', '5月', '6月',
                '7月', '8月', '9月', '10月', '11月', '12月'
            ];
            const monthIndex = parseInt(month) - 1;
            return `${year}年${monthNames[monthIndex]}`;
        } catch {
            return monthStr;
        }
    };

    // 生成月份网格
    const generateMonthGrid = () => {
        const months = [];
        const monthNames = [
            '1月', '2月', '3月', '4月', '5月', '6月',
            '7月', '8月', '9月', '10月', '11月', '12月'
        ];

        for (let i = 0; i < 12; i++) {
            const monthValue = `${viewYear}-${String(i + 1).padStart(2, '0')}`;
            const isSelected = monthValue === value;
            const isCurrentMonth = monthValue === new Date().toISOString().slice(0, 7);

            months.push(
                <button
                    key={monthValue}
                    onClick={() => !disabled && onChange(monthValue)}
                    disabled={disabled}
                    className={`
                        p-2 text-xs font-medium rounded-md transition-colors
                        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                        ${isSelected 
                            ? 'bg-sky-500 text-white' 
                            : isCurrentMonth
                                ? 'bg-sky-100 text-sky-600 dark:bg-sky-600/20 dark:text-sky-300'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
                        }
                    `}
                >
                    {monthNames[i]}
                </button>
            );
        }

        return months;
    };

    return (
        <div className={`${className}`}>
            {/* 当前月份显示 */}
            <div className="px-1 mb-3">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    当前月份
                </div>
                <div className="flex items-center gap-2 p-2 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
                    <CalendarIcon className="w-4 h-4 text-sky-500 dark:text-sky-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-sky-700 dark:text-sky-300 truncate">
                        {formatDisplayText(value)}
                    </span>
                </div>
            </div>

            {/* 直接展示的月份选择器 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                {/* 年份导航 */}
                <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => !disabled && setViewYear(viewYear - 1)}
                        disabled={disabled}
                        className={`
                            p-1 rounded transition-colors
                            ${disabled 
                                ? 'opacity-50 cursor-not-allowed' 
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }
                        `}
                    >
                        <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {viewYear}年
                    </span>
                    <button
                        onClick={() => !disabled && setViewYear(viewYear + 1)}
                        disabled={disabled}
                        className={`
                            p-1 rounded transition-colors
                            ${disabled 
                                ? 'opacity-50 cursor-not-allowed' 
                                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }
                        `}
                    >
                        <ChevronRightIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* 月份网格 */}
                <div className="p-3 grid grid-cols-3 gap-2">
                    {generateMonthGrid()}
                </div>
            </div>
        </div>
    );
};