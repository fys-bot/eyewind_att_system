import React, { useState, useRef, useEffect } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './Icons.tsx';

interface MonthPickerProps {
    value: string; // YYYY-MM format
    onChange: (month: string) => void;
    disabled?: boolean;
    className?: string;
}

export const MonthPicker: React.FC<MonthPickerProps> = ({ 
    value, 
    onChange, 
    disabled = false, 
    className = '' 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewYear, setViewYear] = useState(() => {
        const year = parseInt(value.split('-')[0]);
        return isNaN(year) ? new Date().getFullYear() : year;
    });
    
    const dropdownRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // 关闭下拉菜单
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

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
                        setIsOpen(false);
                    }}
                    className={`
                        p-3 text-sm font-medium rounded-lg transition-colors
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
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                ref={buttonRef}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
                    w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium
                    bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600
                    text-slate-700 dark:text-slate-200 rounded-lg
                    transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500
                    ${disabled 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'hover:bg-slate-200 dark:hover:bg-slate-600'
                    }
                `}
            >
                <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{formatDisplayText(value)}</span>
                </div>
                <svg 
                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
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