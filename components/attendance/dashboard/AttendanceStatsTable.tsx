
import React, { useMemo } from 'react';
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
    // 辅助函数：获取迟到分钟数（根据豁免开关）
    const getLateMinutesValue = (stats: EmployeeStats) => {
        return lateExemptionEnabled ? (stats.exemptedLateMinutes || 0) : (stats.lateMinutes || 0);
    };
    
    // 优化排序逻辑：当查看全体员工时应用特殊排序
    const sortedEmployees = useMemo(() => {
        if (companyName === '全体员工' || companyName === '全部') {
            return [...employees].sort((a, b) => {
                // 1. 纪律危险人员（有绩效扣款的）排在最前面
                const aHasRisk = (a.stats.performancePenalty || 0) > 0;
                const bHasRisk = (b.stats.performancePenalty || 0) > 0;
                
                if (aHasRisk && !bHasRisk) return -1;
                if (!aHasRisk && bHasRisk) return 1;
                
                // 2. 如果都是纪律风险人员，按迟到分钟数倒序
                if (aHasRisk && bHasRisk) {
                    return getLateMinutesValue(b.stats) - getLateMinutesValue(a.stats);
                }
                
                // 3. 对于非风险人员，区分无考勤风险（全勤候选）、全勤、其他
                if (!aHasRisk && !bHasRisk) {
                    const aIsFullAttendance = a.stats.isFullAttendance;
                    const bIsFullAttendance = b.stats.isFullAttendance;
                    
                    // 无考勤风险（全勤候选）：没有迟到、缺卡、请假等问题，但可能因为最后工作日等原因未达到全勤
                    const aIsCandidate = !aIsFullAttendance && 
                        getLateMinutesValue(a.stats) === 0 && 
                        (a.stats.missing || 0) === 0 && 
                        (a.stats.absenteeism || 0) === 0 &&
                        (a.stats.annual || 0) === 0 &&
                        (a.stats.sick || 0) === 0 &&
                        (a.stats.personal || 0) === 0;
                    
                    const bIsCandidate = !bIsFullAttendance && 
                        getLateMinutesValue(b.stats) === 0 && 
                        (b.stats.missing || 0) === 0 && 
                        (b.stats.absenteeism || 0) === 0 &&
                        (b.stats.annual || 0) === 0 &&
                        (b.stats.sick || 0) === 0 &&
                        (b.stats.personal || 0) === 0;
                    
                    // 排序优先级：无考勤风险（全勤候选） > 全勤 > 其他
                    if (aIsCandidate && !bIsCandidate && !bIsFullAttendance) return -1;
                    if (!aIsCandidate && bIsCandidate && !aIsFullAttendance) return 1;
                    
                    if (aIsFullAttendance && !bIsFullAttendance && !bIsCandidate) return -1;
                    if (!aIsFullAttendance && bIsFullAttendance && !aIsCandidate) return 1;
                    
                    // 同级别内按迟到分钟数倒序
                    return getLateMinutesValue(b.stats) - getLateMinutesValue(a.stats);
                }
                
                // 4. 其他情况按迟到分钟数倒序
                return getLateMinutesValue(b.stats) - getLateMinutesValue(a.stats);
            });
        }
        
        // 默认排序：保持原有顺序
        return employees;
    }, [employees, companyName, lateExemptionEnabled]);
    return (
        <div className="h-full overflow-hidden flex flex-col border-t-2 border-sky-500 rounded-lg shadow-sm">
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 border-x border-b border-slate-200 dark:border-slate-700 rounded-b-lg">
                <table className="w-full text-sm text-left border-separate border-spacing-0 min-w-[1400px] text-slate-700 dark:text-slate-300">
                    {/* 表头：更深的背景色，Z-index 确保粘性头浮于内容之上 */}
                    <thead className="sticky top-0 z-20 bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 font-bold uppercase">
                        <tr>
                            {/* 基础信息 (Sticky Col 1) */}
                            <th
                                style={{ minWidth: 100, width: 180, left: 0, zIndex: 30 }}
                                className="sticky top-0 px-4 py-3 whitespace-nowrap bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-300 dark:border-slate-600 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]"
                            >
                                姓名
                            </th>
                            {fullAttendanceEnabled && (
                                <th
                                    style={{ minWidth: 80, width: 80, left: 180, zIndex: 30 }} // left offset = 180 (prev col width)
                                    className="sticky top-0 px-3 py-3 whitespace-nowrap text-center bg-slate-50 dark:bg-slate-800 border-b border-r border-slate-300 dark:border-slate-600 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]"
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
                        {sortedEmployees.map(({ user, stats }) => {
                            // 使用纯色背景以确保 sticky 列不透明
                            const stickyBgClass = 'bg-white dark:bg-slate-900';
                            
                            const lateMinutesValue = lateExemptionEnabled ? stats.exemptedLateMinutes : stats.lateMinutes;
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
                                        style={{ minWidth: 100, width: 180, left: 0, zIndex: 10 }}
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
                                            style={{ minWidth: 80, width: 80, left: 180, zIndex: 10 }}
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
                                                ? 'text-green-600'
                                                : (stats.performancePenalty || 0) > 0
                                                    ? 'text-red-600'
                                                    : 'text-slate-400'
                                            }`}>
                                            {fullAttendanceEnabled && stats.isFullAttendance ? `+${(stats as any).fullAttendanceBonus || 0}` : stats.performancePenalty ? `- ${stats.performancePenalty}` : '-'}
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
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.compTimeHours, 'green')}`}>{stats.compTimeHours ? stats.compTimeHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.personalHours, 'green')}`}>{stats.personalHours ? stats.personalHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.sickHours, 'green')}`}>{stats.sickHours ? stats.sickHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.seriousSickHours, 'green')}`}>{stats.seriousSickHours ? stats.seriousSickHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.annualHours, 'green')}`}>{stats.annualHours ? stats.annualHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.marriageHours, 'green')}`}>{stats.marriageHours ? stats.marriageHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.maternityHours, 'green')}`}>{stats.maternityHours ? stats.maternityHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.paternityHours, 'green')}`}>{stats.paternityHours ? stats.paternityHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.parentalHours, 'green')}`}>{stats.parentalHours ? stats.parentalHours + ' 小时' : '-'}</td>
                                    <td className={`px-3 py-3 text-center whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-700 ${getCellClass(stats.bereavementHours, 'green')}`}>{stats.bereavementHours ? stats.bereavementHours + ' 小时' : '-'}</td>

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

                        {sortedEmployees.length === 0 && (
                            <tr>
                                <td colSpan={lateExemptionEnabled ? 30 : 29} className="px-4 py-8 text-center text-slate-500 dark:text-slate-400">
                                    暂无员工数据
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
