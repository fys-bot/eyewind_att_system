import React, { useState, useRef, useEffect } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from './Icons.tsx';

interface InlineMonthPickerProps {
    value: string; // YYYY-MM format
    onChange: (month: string) => void;
    disabled?: boolean;
    className?: string;
}

export const InlineMonthPicker: React.FC<InlineMonthPickerProps> = ({ 
    value, 
    onChange, 
    disabled = false, 
    className = '' 
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [viewYear, setViewYear] = useState(() => {
        const year = parseInt(value.split('-')[0]);
        return isNaN(year) ? new Date().getFullYear() : year;
    });
    
    const containerRef = useRef<HTMLDivElement>(null);

    // 关闭展开状态
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsExpanded(false);
            }
        };

        if (isExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isExpanded]);

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
                    onClick={() => {
                        onChange(monthValue);
                        setIsExpanded(false);
                    }}
                    className={`
                        p-2 text-xs font-medium rounded-md transition-colors
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
        <div className={`relative ${className}`} ref={containerRef}>
            {/* 直接显示的月份信息 */}
            <div className="px-1 mb-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span>当前月份</span>
                    <button
                        onClick={() => !disabled && setIsExpanded(!isExpanded)}
                        disabled={disabled}
                        className={`
                            p-1 rounded transition-colors
                            ${disabled 
                                ? 'opacity-50 cursor-not-allowed' 
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'
                            }
                        `}
                    >
                        <ChevronUpIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                </div>
                
                <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-700 rounded-lg">
                    <CalendarIcon className="w-4 h-4 text-sky-500 dark:text-sky-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {formatDisplayText(value)}
                    </span>
                </div>
            </div>

            {/* 展开的月份选择器 */}
            {isExpanded && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                    {/* 年份导航 */}
                    <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setViewYear(viewYear - 1)}
                            className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {viewYear}年
                        </span>
                        <button
                            onClick={() => setViewYear(viewYear + 1)}
                            className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                        >
                            <ChevronRightIcon className="w-4 h-4" />
                        </button>
                    </div>

                    {/* 月份网格 */}
                    <div className="p-3 grid grid-cols-3 gap-2">
                        {generateMonthGrid()}
                    </div>
                </div>
            )}
        </div>
    );
};