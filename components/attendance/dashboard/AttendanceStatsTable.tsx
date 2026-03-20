
import React, { useMemo, useState } from 'react';
import type { DingTalkUser, EmployeeStats } from '../../../database/schema.ts';
import { Avatar } from './AttendanceShared.tsx';
import { AlertTriangleIcon, CheckCircleIcon } from '../../Icons.tsx';

interface AttendanceStatsTableProps {
    employees: { user: DingTalkUser; stats: EmployeeStats }[];
    onRowClick?: (employee: { user: DingTalkUser; stats: EmployeeStats }) => void;
    companyName?: string; // 新增：用于判断是否为全体员工视图
    lateExemptionEnabled?: boolean; // 新增：是否启用豁免功能
    fullAttendanceEnabled?: boolean; // 新增：是否启用全勤功能
    performancePenaltyEnabled?: boolean; // 新增：是否启用绩效考核功能
}

// 格式化小时数，避免浮点精度问题
const fmtHours = (v: number | undefined) => v ? (Math.round(v * 100) / 100) + ' 小时' : '-';

// 样式辅助函数：用于非零值突出显示 (主要用于风险/假期类)
const getCellClass = (value: number | string | undefined, color: string) => {
    if (value && (typeof value === 'number' ? value > 0 : parseInt(value as string) > 0)) {
        // 使用颜色和字体加粗突出显示非零值
        return `font-bold text-${color}-700 dark:text-${color}-400 bg-${color}-50/50 dark:bg-${color}-900/10`;
    }
    // 零或空值使用柔和的灰色
    return 'text-slate-400';
};

// 样式辅助函数：用于加班数据列 (区分不同的加班强度)
const getOvertimeCellClass = (value: number | undefined, color: string) => {
    const baseClasses = `px-3 py-3 text-center whitespace-nowrap bg-${color}-50/50 dark:bg-${color}-900/10 border-b border-r border-slate-200 dark:border-slate-700`;
    if (value && value > 0) {
        return `${baseClasses} font-bold text-${color}-700 dark:text-${color}-400`;
    }
    return `${baseClasses} text-slate-400 dark:text-slate-500`; // 暗处理
};

export const AttendanceStatsTable: React.FC<AttendanceStatsTableProps> = ({ employees, onRowClick, companyName, lateExemptionEnabled = true, fullAttendanceEnabled = true, performancePenaltyEnabled = true }) => {
    // 🔥 新增：视图模式状态（全部数据 / 仅异常数据 / 仅全勤数据）
    const [viewMode, setViewMode] = useState<'all' | 'abnormal' | 'fullAttendance'>('all');
    
    // 🔥 修复：统一使用累计迟到分钟数（lateMinutes），与考勤日历保持一致
    // 不再根据豁免开关切换显示值，始终显示累计迟到
    const getLateMinutesValue = (stats: EmployeeStats) => {
        return stats.lateMinutes || 0;
    };
    
    // 🔥 新增：过滤和排序逻辑
    const filteredAndSortedEmployees = useMemo(() => {
        // 第一步：根据视图模式过滤
        let filtered = [...employees];
        
        if (viewMode === 'abnormal') {
            // 只显示异常数据：有旷工、有迟到、有缺卡的员工
            filtered = filtered.filter(({ stats }) => {
                const hasAbsenteeism = (stats.absenteeism || 0) > 0;
                const hasLate = getLateMinutesValue(stats) > 0;
                const hasMissing = (stats.missing || 0) > 0;
                return hasAbsenteeism || hasLate || hasMissing;
            });
        } else if (viewMode === 'fullAttendance') {
            // 只显示全勤数据
            filtered = filtered.filter(({ stats }) => stats.isFullAttendance);
        }
        
        // 🔥 第二步：排序 - 旷工次数 → 豁免后迟到 → 累计迟到 → 缺卡次数 → 全勤
        return filtered.sort((a, b) => {
            const aAbsenteeism = a.stats.absenteeism || 0;
            const bAbsenteeism = b.stats.absenteeism || 0;
            const aExemptedLate = a.stats.exemptedLateMinutes || 0;
            const bExemptedLate = b.stats.exemptedLateMinutes || 0;
            const aLateMinutes = a.stats.lateMinutes || 0;
            const bLateMinutes = b.stats.lateMinutes || 0;
            const aMissing = a.stats.missing || 0;
            const bMissing = b.stats.missing || 0;
            const aIsFullAttendance = a.stats.isFullAttendance;
            const bIsFullAttendance = b.stats.isFullAttendance;
            
            // 1. 旷工次数从高到低
            if (aAbsenteeism !== bAbsenteeism) {
                return bAbsenteeism - aAbsenteeism;
            }
            
            // 2. 豁免后迟到从高到低
            if (aExemptedLate !== bExemptedLate) {
                return bExemptedLate - aExemptedLate;
            }
            
            // 3. 累计迟到从高到低
            if (aLateMinutes !== bLateMinutes) {
                return bLateMinutes - aLateMinutes;
            }
            
            // 4. 缺卡次数从高到低
            if (aMissing !== bMissing) {
                return bMissing - aMissing;
            }
            
            // 5. 全勤排在最后
            if (aIsFullAttendance && !bIsFullAttendance) return 1;
            if (!aIsFullAttendance && bIsFullAttendance) return -1;
            
            // 6. 其他情况保持原顺序
            return 0;
        });
    }, [employees, viewMode, lateExemptionEnabled]);
    
    // 统计数据
    const stats = useMemo(() => {
        const total = employees.length;
        const abnormal = employees.filter(({ stats }) => {
            const hasAbsenteeism = (stats.absenteeism || 0) > 0;
            const hasLate = getLateMinutesValue(stats) > 0;
            const hasMissing = (stats.missing || 0) > 0;
            return hasAbsenteeism || hasLate || hasMissing;
        }).length;
        const fullAttendance = employees.filter(({ stats }) => stats.isFullAttendance).length;
        
        return { total, abnormal, fullAttendance };
    }, [employees, lateExemptionEnabled]);
    return (
        <div className="h-full overflow-hidden flex flex-col border-t-2 border-sky-500 rounded-lg shadow-sm">
            {/* 🔥 新增：切换按钮 */}
            <div className="flex-shrink-0 bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        显示 {filteredAndSortedEmployees.length} / {stats.total} 人
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        异常 {stats.abnormal} 人 · 全勤 {stats.fullAttendance} 人
                    </span>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1">
                    <button
                        onClick={() => setViewMode('all')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            viewMode === 'all'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        全部数据
                    </button>
                    <button
                        onClick={() => setViewMode('abnormal')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            viewMode === 'abnormal'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        仅异常数据
                    </button>
                    <button
                        onClick={() => setViewMode('fullAttendance')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            viewMode === 'fullAttendance'
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        仅全勤数据
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 border-x border-b border-slate-200 dark:border-slate-700 rounded-b-lg">
                <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-[1400px] text-slate-700 dark:text-slate-300">
                    {/* 表头：更深的背景色，Z-index 确保粘性头浮于内容之上 */}
                    <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 font-bold uppercase">
                        <tr>
                            {/* 基础信息 (Sticky Col 1) */}
                            <th
                                style={{ minWidth: 200, width: 200, left: 0, zIndex: 30, backgroundColor: 'rgb(248 250 252)' }}
                                className="sticky top-0 px-4 py-3 whitespace-nowrap dark:bg-slate-800 border-b border-r border-slate-300 dark:border-slate-600 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]"
                            >
                                姓名
                            </th>
                            {fullAttendanceEnabled && (
                                <th
                                    style={{ minWidth: 80, width: 80, left: 200, zIndex: 30, backgroundColor: 'rgb(248 250 252)' }} // left offset = 200 (prev col width)
                                    className="sticky top-0 px-3 py-3 whitespace-nowrap text-center dark:bg-slate-800 border-b border-r border-slate-300 dark:border-slate-600 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]"
                                >
                                    是否全勤
                                </th>
                            )}
                            
                            {/* 绩效考核 */}
                            {performancePenaltyEnabled && (
                                <th className="px-3 py-3 whitespace-nowrap text-center text-slate-700 dark:text-slate-300 border-b border-r border-slate-300 dark:border-slate-600">考勤绩效</th>
                            )}

                            {/* 出勤天数 */}
                            <th className="px-3 py-3 whitespace-nowrap text-center text-slate-700 dark:text-slate-300 border-b border-r border-slate-300 dark:border-slate-600">应出勤天数</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center text-slate-700 dark:text-slate-300 border-b border-r border-slate-300 dark:border-slate-600">实际出勤天数</th>

                            {/* 迟到（轻度风险 - 琥珀色/黄色） */}
                            {lateExemptionEnabled && (
                                <th className="px-3 py-3 whitespace-nowrap text-center bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 border-b border-r border-yellow-200 dark:border-yellow-800">迟到次数</th>
                            )}
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 border-b border-r border-yellow-200 dark:border-yellow-800">累计迟到(分)</th>
                            {lateExemptionEnabled && (
                                <th className="px-3 py-3 whitespace-nowrap text-center bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 border-b border-r border-yellow-200 dark:border-yellow-800">豁免后迟到(分)</th>
                            )}

                            {/* 缺卡（高度风险 - 红色） */}
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-amber-50 dark:bg-amber-900/20 text-amber-700 border-b border-r border-amber-200 dark:border-amber-800">缺卡次数</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-amber-50 dark:bg-amber-900/20 text-amber-700 border-b border-r border-amber-200 dark:border-amber-800">旷工次数</th>

                            {/* 假期类 (绿色背景) */}
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">调休(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">事假(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">病假(≤24h)(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">病假(&gt;24h)(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">年假(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">婚假(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">产假(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">陪产假(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">育儿假(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-green-50 dark:bg-green-900/20 text-green-700 border-b border-r border-green-200 dark:border-green-800">丧假(时)</th>

                            {/* 加班（蓝色背景） */}
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-b border-r border-blue-200 dark:border-blue-800">19:30 时长(分钟)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-b border-r border-blue-200 dark:border-blue-800">19:30 次数</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-b border-r border-blue-200 dark:border-blue-800">20:30 时长(分钟)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-b border-r border-blue-200 dark:border-blue-800">20:30 次数</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-b border-r border-blue-200 dark:border-blue-800">22:00 时长(分钟)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-b border-r border-blue-200 dark:border-blue-800">22:00 次数</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-b border-r border-blue-200 dark:border-blue-800">24:00 时长(时)</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-b border-r border-blue-200 dark:border-blue-800">24:00 次数</th>
                            <th className="px-3 py-3 whitespace-nowrap text-center bg-blue-100 dark:bg-blue-900/30 text-blue-800 font-extrabold border-b border-r border-blue-300 dark:border-blue-700">加班总时长(分钟)</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {filteredAndSortedEmployees.map(({ user, stats }) => {
                            // 使用纯色背景以确保 sticky 列不透明
                            const stickyBgClass = 'bg-white dark:bg-slate-900';
                            
                            // 🔥 修复：风险判定始终使用累计迟到分钟数（lateMinutes），与考勤日历保持一致
                            const lateMinutesValue = stats.lateMinutes || 0;
                            const isRisk = lateMinutesValue > 30 || (stats as any).absenteeism >= 1 || stats.missing > 3;
                            
                            const trStyle = isRisk ? "bg-red-50/30 dark:bg-red-900/10" : "hover:bg-slate-50/50 dark:hover:bg-slate-700/70";

                            return (
                                <tr 
                                    key={user.userid} 
                                    className={`${trStyle} transition-colors group cursor-pointer`}
                                    onClick={() => onRowClick && onRowClick({ user, stats })}
                                >
                                    {/* 名字 (Sticky Col 1) - Opaque Background */}
                                    <td
                                        style={{ minWidth: 120, width: 200, left: 0, zIndex: 10 }}
                                        className={`sticky px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap flex items-center gap-2 border-b border-r border-slate-200 dark:border-slate-700 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)] ${stickyBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800`}
                                    >
                                        <div className="relative">
                                            <Avatar name={user.name} avatarUrl={user.avatar} size="sm" />
                                            {isRisk && (
                                                <div className="absolute -top-1 -right-1 bg-white dark:bg-slate-800 rounded-full p-0.5 shadow-sm">
                                                    <AlertTriangleIcon className="w-3.5 h-3.5 text-red-500" />
                                                </div>
                                            )}
                                        </div>
                                        <span className="truncate max-w-[100px]">{user.name}</span>
                                    </td>

                                    {/* 全勤 (Sticky Col 2) - Opaque Background - 根据fullAttendanceEnabled条件渲染 */}
                                    {fullAttendanceEnabled && (
                                        <td
                                            style={{ minWidth: 80, width: 80, left: 200, zIndex: 10 }}
                                            className={`sticky px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)] ${stickyBgClass} group-hover:bg-slate-50 dark:group-hover:bg-slate-800`}
                                        >
                                            {stats.isFullAttendance ? (
                                                <div className="flex items-center justify-center gap-1">
                                                    <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                                    <span className="font-extrabold text-green-600 dark:text-green-400">是</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400">否</span>
                                            )}
                                        </td>
                                    )}

                                    {/* 绩效考核 */}
                                    {performancePenaltyEnabled && (
                                        <td className={`px-3 py-3 text-center whitespace-nowrap font-extrabold border-b border-r border-slate-200 dark:border-slate-700
                                            ${fullAttendanceEnabled && stats.isFullAttendance
                                                ? 'text-green-600 dark:text-green-400'
                                                : (stats.performancePenalty || 0) > 0
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : 'text-slate-600 dark:text-slate-400'
                                            }`}>
                                            {fullAttendanceEnabled && stats.isFullAttendance 
                                                ? `+${(stats as any).fullAttendanceBonus || 0}` 
                                                : (stats.performancePenalty || 0) > 0 
                                                    ? `- ${stats.performancePenalty}` 
                                                    : '0'}
                                        </td>
                                    )}

                                    {/* 出勤天数 */}
                                    <td className="px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700">
                                        {stats.shouldAttendanceDays || '-'}
                                    </td>
                                    <td className="px-3 py-3 text-center whitespace-nowrap font-medium border-b border-r border-slate-200 dark:border-slate-700">
                                        {(stats.actualAttendanceDays || 0) || '-'}
                                    </td>

                                    {/* 迟到 */}
                                    {lateExemptionEnabled && (
                                        <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.late, 'yellow')}`}>{stats.late || '-'}</td>
                                    )}
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.lateMinutes, 'yellow')}`}>{stats.lateMinutes || '0'}分钟</td>
                                    {lateExemptionEnabled && (
                                        <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.exemptedLateMinutes, 'yellow')}`}>{stats.exemptedLateMinutes || '0'}分钟</td>
                                    )}

                                    {/* 缺卡 */}
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.missing, 'amber')}`}>{stats.missing || '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass((stats as any).absenteeism, 'amber')}`}>{(stats as any).absenteeism || '-'}</td>

                                    {/* 假期 */}
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.compTimeHours, 'green')}`}>{fmtHours(stats.compTimeHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.personalHours, 'green')}`}>{fmtHours(stats.personalHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.sickHours, 'green')}`}>{fmtHours(stats.sickHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.seriousSickHours, 'green')}`}>{fmtHours(stats.seriousSickHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.annualHours, 'green')}`}>{fmtHours(stats.annualHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.marriageHours, 'green')}`}>{fmtHours(stats.marriageHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.maternityHours, 'green')}`}>{fmtHours(stats.maternityHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.paternityHours, 'green')}`}>{fmtHours(stats.paternityHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.parentalHours, 'green')}`}>{fmtHours(stats.parentalHours)}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.bereavementHours, 'green')}`}>{fmtHours(stats.bereavementHours)}</td>

                                    {/* 加班 */}
                                    <td className={getOvertimeCellClass(stats.overtime19_5Minutes, 'blue')}>
                                        {stats.overtime19_5Minutes || 0} 分钟
                                    </td>
                                    <td className={getOvertimeCellClass(stats.overtime19_5Count, 'blue')}>
                                        {stats.overtime19_5Count || 0}
                                    </td>
                                    <td className={getOvertimeCellClass(stats.overtime20_5Minutes, 'blue')}>
                                        {stats.overtime20_5Minutes || 0} 分钟
                                    </td>
                                    <td className={getOvertimeCellClass(stats.overtime20_5Count, 'blue')}>
                                        {stats.overtime20_5Count || 0}
                                    </td>
                                    <td className={getOvertimeCellClass(stats.overtime22Minutes, 'blue')}>
                                        {stats.overtime22Minutes || 0} 分钟
                                    </td>
                                    <td className={getOvertimeCellClass(stats.overtime22Count, 'blue')}>
                                        {stats.overtime22Count || 0}
                                    </td>
                                    <td className={getOvertimeCellClass(stats.overtime24Minutes, 'blue')}>
                                        {stats.overtime24Minutes || 0} 分钟
                                    </td>
                                    <td className={getOvertimeCellClass(stats.overtime24Count, 'blue')}>
                                        {stats.overtime24Count || 0}
                                    </td>

                                    {/* 加班总时长 */}
                                    <td className={`px-3 py-3 text-center whitespace-nowrap bg-blue-50/50 dark:bg-blue-900/30 border-b border-r border-slate-200 dark:border-slate-700 font-extrabold ${(stats.overtimeTotalMinutes || 0) > 0 ? 'text-blue-800 dark:text-blue-300' : 'text-slate-400 dark:text-slate-500'}`}>
                                        {stats.overtimeTotalMinutes || 0} 分钟
                                    </td>
                                </tr>
                            );
                        })}

                        {filteredAndSortedEmployees.length === 0 && (
                            <tr>
                                <td colSpan={lateExemptionEnabled ? 30 : 29} className="border-b border-slate-200 dark:border-slate-700">
                                    <div className="flex flex-col items-center justify-center text-center py-16">
                                        {viewMode === 'abnormal' ? (
                                            <>
                                                <CheckCircleIcon className="w-16 h-16 text-green-400 dark:text-green-500 mb-4" />
                                                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">太棒了！没有异常数据</p>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">所有员工考勤正常，继续保持！</p>
                                            </>
                                        ) : viewMode === 'fullAttendance' ? (
                                            <>
                                                <AlertTriangleIcon className="w-16 h-16 text-amber-400 dark:text-amber-500 mb-4" />
                                                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">暂无全勤员工</p>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">本月还没有达到全勤标准的员工</p>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                                                    <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                    </svg>
                                                </div>
                                                <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">暂无员工数据</p>
                                                <p className="text-sm text-slate-500 dark:text-slate-400">请检查筛选条件或数据加载状态</p>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
