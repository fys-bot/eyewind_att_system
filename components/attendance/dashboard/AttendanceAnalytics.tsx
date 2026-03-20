/**
 * 考勤高级数据分析模块
 * 独立组件，不修改现有逻辑，仅通过 props 接收数据
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';
import type { DingTalkUser, EmployeeStats, AttendanceMap, HolidayMap } from '../../../database/schema.ts';
import { AccordionSection } from './AttendanceShared.tsx';
import { Modal } from '../../Modal.tsx';
import {
  AlertTriangleIcon, ClockIcon, TrendingUpIcon, UsersIcon,
  ActivityIcon, CheckCircleIcon, XCircleIcon, BarChartIcon, XIcon
} from '../../Icons.tsx';
import {
  calcWorkHoursUtilization,
  calcRiskScore,
  calcWeekdayAnomalies,
  calcLeaveTypeDistribution,
  detectConsecutiveAbsence,
  calcOvertimeCompliance,
  filterNewEmployees,
  calcCrossCompanyMetrics,
  calcLeaveCost,
  getSalaryFromStorage,
  setSalaryToStorage,
  type WeekdayAnomaly,
  type LeaveTypeData,
  type ConsecutiveAbsenceItem,
  type OvertimeComplianceSummary,
  type CrossCompanyMetric,
  type RiskScoreItem,
} from './analyticsUtils.ts';
import { getLatestSnapshot } from '../../../services/reportSnapshotApiService.ts';
import { DashboardCache } from './utils.ts';

// ============ Props ============

interface AttendanceAnalyticsProps {
  companyEmployeeStats: Record<string, Array<{ user: DingTalkUser; stats: EmployeeStats }>>;
  companyAggregate: Record<string, { totalLateMinutes: number; abnormalUserCount: number }>;
  attendanceMap: AttendanceMap;
  processDataMap: Record<string, any>;
  holidays: HolidayMap;
  activeCompany: string;
  year: number;
  month: number;
  allUsers: DingTalkUser[];
  dailyTrend: Record<string, any[]>;
  lateExemptionEnabled?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

// ============ 小型子组件 ============

const MiniCard: React.FC<{ title: string; value: string; sub?: string; summary?: React.ReactNode; detail?: React.ReactNode; icon: React.ReactNode; color?: string; onClick?: () => void }> = ({ title, value, sub, summary, detail, icon, color = 'text-slate-700', onClick }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 ${onClick ? 'cursor-pointer hover:border-sky-300 dark:hover:border-sky-600 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2 text-slate-500 dark:text-slate-400 text-xs font-medium">
        {icon}
        <span>{title}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      {(summary || detail) && (
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          {summary && <div className="text-[10px] leading-relaxed whitespace-pre-line">{summary}</div>}
          {detail && (
            <>
              <button
                onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
                className="text-[10px] text-sky-500 hover:text-sky-600 dark:text-sky-400 mt-1.5 flex items-center gap-0.5"
              >
                {expanded ? '收起' : '展开详情'}
                <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {expanded && <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed whitespace-pre-line">{detail}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">{children}</h4>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">{text}</div>
);

const LegalArticle: React.FC<{ number: string; title: string; content: string; highlight: string; isKey?: boolean }> = ({ number, title, content, highlight, isKey }) => (
  <div className={`rounded-lg p-4 border ${isKey ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
    <div className="flex items-center gap-2 mb-1.5">
      <span className={`text-xs font-bold px-2 py-0.5 rounded ${isKey ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>{number}</span>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</span>
    </div>
    <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-2">{content}</div>
    <div className={`text-xs font-bold px-2.5 py-1 rounded-md inline-block ${isKey ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'}`}>
      💡 {highlight}
    </div>
  </div>
);

// ============ 请假成本估算弹窗 ============

const LeaveCostModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  employees: Array<{ user: DingTalkUser; stats: EmployeeStats }>;
  yearMonth: string;
}> = ({ isOpen, onClose, employees, yearMonth }) => {
  const [salaries, setSalaries] = useState<Record<string, string>>({});

  // 初始化从 localStorage 读取
  useEffect(() => {
    if (!isOpen) return;
    const init: Record<string, string> = {};
    employees.forEach(({ user }) => {
      const saved = getSalaryFromStorage(user.userid, yearMonth);
      if (saved) init[user.userid] = String(saved);
    });
    setSalaries(init);
  }, [isOpen, employees, yearMonth]);

  const handleSalaryChange = (userId: string, val: string) => {
    setSalaries(prev => ({ ...prev, [userId]: val }));
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setSalaryToStorage(userId, yearMonth, num);
    }
  };

  // 只展示有请假记录的员工
  const leaveEmployees = useMemo(() =>
    employees.filter(({ stats }) =>
      (stats.personalHours || 0) > 0 || (stats.sickHours || 0) > 0 || (stats.annualHours || 0) > 0 || (stats.seriousSickHours || 0) > 0
    ), [employees]);

  const totalCost = useMemo(() => {
    return leaveEmployees.reduce((sum, { user, stats }) => {
      const salary = parseFloat(salaries[user.userid] || '');
      if (isNaN(salary) || salary <= 0) return sum;
      const result = calcLeaveCost(stats, salary);
      return sum + (result.totalCost || 0);
    }, 0);
  }, [leaveEmployees, salaries]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="请假工时成本估算" size="2xl">
      <div className="max-h-[65vh] overflow-y-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 sticky top-0">
            <tr>
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">月薪 (元)</th>
              <th className="px-3 py-2 text-right">时薪</th>
              <th className="px-3 py-2 text-right">事假成本</th>
              <th className="px-3 py-2 text-right">病假成本</th>
              <th className="px-3 py-2 text-right">年假成本</th>
              <th className="px-3 py-2 text-right">总成本</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {leaveEmployees.map(({ user, stats }) => {
              const salary = parseFloat(salaries[user.userid] || '');
              const hasSalary = !isNaN(salary) && salary > 0;
              const result = hasSalary ? calcLeaveCost(stats, salary) : null;
              return (
                <tr key={user.userid} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{user.name}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={salaries[user.userid] || ''}
                      onChange={e => handleSalaryChange(user.userid, e.target.value)}
                      placeholder="输入月薪"
                      className="w-24 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400">{result?.hourlyRate ?? '-'}</td>
                  <td className="px-3 py-2 text-right font-mono">{result?.personalCost != null ? `¥${result.personalCost}` : '-'}</td>
                  <td className="px-3 py-2 text-right font-mono">{result?.sickCost != null ? `¥${result.sickCost}` : '-'}</td>
                  <td className="px-3 py-2 text-right font-mono">{result?.annualCost != null ? `¥${result.annualCost}` : '-'}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-red-600 dark:text-red-400">{result?.totalCost != null ? `¥${result.totalCost}` : '-'}</td>
                </tr>
              );
            })}
            {leaveEmployees.length === 0 && (
              <tr><td colSpan={7} className="text-center py-6 text-slate-400">当月无请假记录</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {leaveEmployees.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-500">已输入月薪的员工请假总成本</span>
            <span className="text-lg font-bold text-red-600 dark:text-red-400">¥{Math.round(totalCost * 100) / 100}</span>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={() => {
                const BOM = '\uFEFF';
                const header = ['姓名', '月薪(元)', '时薪(元)', '事假成本(元)', '病假成本(元)', '年假成本(元)', '总成本(元)'];
                const rows = leaveEmployees.map(({ user, stats }) => {
                  const salary = parseFloat(salaries[user.userid] || '');
                  const hasSalary = !isNaN(salary) && salary > 0;
                  const result = hasSalary ? calcLeaveCost(stats, salary) : null;
                  return [
                    user.name,
                    hasSalary ? String(salary) : '',
                    result?.hourlyRate != null ? String(result.hourlyRate) : '',
                    result?.personalCost != null ? String(result.personalCost) : '',
                    result?.sickCost != null ? String(result.sickCost) : '',
                    result?.annualCost != null ? String(result.annualCost) : '',
                    result?.totalCost != null ? String(result.totalCost) : '',
                  ].join(',');
                });
                rows.push(['', '', '', '', '', '总计', String(Math.round(totalCost * 100) / 100)]);
                const csv = BOM + [header.join(','), ...rows].join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `请假工时成本估算_${yearMonth}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5"
            >
              📥 导出 CSV
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ============ 主组件 ============

export const AttendanceAnalytics: React.FC<AttendanceAnalyticsProps> = (props) => {
  const {
    companyEmployeeStats, companyAggregate, attendanceMap, processDataMap,
    holidays, activeCompany, year, month, allUsers, dailyTrend,
    lateExemptionEnabled = true, isOpen: controlledOpen, onToggle,
  } = props;

  const [showCostModal, setShowCostModal] = useState(false);
  const [showOvertimeDetail, setShowOvertimeDetail] = useState(false);
  const [showRiskDetail, setShowRiskDetail] = useState(false);
  const [showLeaveDetail, setShowLeaveDetail] = useState<{ name: string; color: string } | null>(null);
  const [expandedLeaveEmployee, setExpandedLeaveEmployee] = useState<string | null>(null);
  const [showAbsenceDetail, setShowAbsenceDetail] = useState<ConsecutiveAbsenceItem | null>(null);
  const [newEmployeeDetailModal, setNewEmployeeDetailModal] = useState<string | null>(null);
  const [momData, setMomData] = useState<any>(null);
  const [momLoading, setMomLoading] = useState(false);
  const [contractTab, setContractTab] = useState<number>(0); // 0=全部, 1/2/3/5/8=具体年限

  // 当前公司的员工列表
  const employees = useMemo(() => {
    if (activeCompany === '全部') {
      return Object.values(companyEmployeeStats).flat();
    }
    return companyEmployeeStats[activeCompany] || [];
  }, [companyEmployeeStats, activeCompany]);

  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  // ---- 计算各项分析数据 ----

  // 工时利用率
  const utilizationDetail = useMemo(() => {
    if (employees.length === 0) return { avg: 0, totalStandardMin: 0, totalLateMin: 0, totalOvertimeMin: 0 };
    let totalStandardMin = 0, totalLateMin = 0, totalOvertimeMin = 0, totalRate = 0;
    employees.forEach(({ stats }) => {
      const std = (stats.shouldAttendanceDays || 0) * 8 * 60;
      totalStandardMin += std;
      totalLateMin += (stats.lateMinutes || 0);
      totalOvertimeMin += (stats.overtimeTotalMinutes || 0);
      totalRate += calcWorkHoursUtilization(stats);
    });
    return {
      avg: Math.round((totalRate / employees.length) * 10) / 10,
      totalStandardMin,
      totalLateMin: Math.round(totalLateMin),
      totalOvertimeMin: Math.round(totalOvertimeMin),
    };
  }, [employees]);
  const avgUtilization = utilizationDetail.avg;

  // 加班合规
  const overtimeCompliance = useMemo(() => calcOvertimeCompliance(employees), [employees]);

  // 风险评分
  const riskItems = useMemo<RiskScoreItem[]>(() => {
    return employees
      .map(({ user, stats }) => ({ user, stats, score: calcRiskScore(stats, lateExemptionEnabled) }))
      .filter(i => i.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [employees, lateExemptionEnabled]);

  const highRiskCount = useMemo(() => riskItems.filter(i => i.score >= 50).length, [riskItems]);

  // 请假类型占比
  const leaveDistribution = useMemo(() => calcLeaveTypeDistribution(employees), [employees]);

  // 请假类型员工明细（按类型分组）
  const leaveDetailByType = useMemo(() => {
    const typeFieldMap: Record<string, (s: EmployeeStats) => number> = {
      '年假': s => s.annualHours || 0,
      '病假': s => (s.sickHours || 0) + (s.seriousSickHours || 0),
      '事假': s => s.personalHours || 0,
      '调休': s => s.compTimeHours || 0,
      '出差': s => s.tripHours || 0,
      '丧假': s => s.bereavementHours || 0,
      '陪产假': s => s.paternityHours || 0,
      '产假': s => s.maternityHours || 0,
      '育儿假': s => s.parentalHours || 0,
      '婚假': s => s.marriageHours || 0,
    };
    const result: Record<string, Array<{ name: string; hours: number; userId: string }>> = {};
    Object.entries(typeFieldMap).forEach(([type, getter]) => {
      const items = employees
        .map(({ user, stats }) => ({ name: user.name, hours: Math.round(getter(stats) * 10) / 10, userId: user.userid }))
        .filter(i => i.hours > 0)
        .sort((a, b) => b.hours - a.hours);
      if (items.length > 0) result[type] = items;
    });
    return result;
  }, [employees]);

  // 获取某员工的请假审批详情
  const getEmployeeLeaveApprovals = useCallback((userId: string, leaveType?: string) => {
    const userDays = attendanceMap[userId];
    if (!userDays) return [];
    const approvals: Array<{ procInstId: string; date: string; detail: any }> = [];
    const seenProcIds = new Set<string>();
    
    Object.entries(userDays).forEach(([dayKey, daily]: [string, any]) => {
      const day = parseInt(dayKey);
      if (isNaN(day)) return;
      daily.records?.forEach((r: any) => {
        if (r.procInstId && !seenProcIds.has(r.procInstId)) {
          const proc = processDataMap[r.procInstId];
          if (proc) {
            const procType = proc.formValues?.leaveType || proc.bizType || '';
            // 如果指定了假期类型，只返回匹配的
            if (leaveType && !procType.includes(leaveType) && leaveType !== procType) {
              // 特殊处理：病假包含重大病假
              if (leaveType === '病假' && !procType.includes('病')) return;
              if (leaveType !== '病假') return;
            }
            seenProcIds.add(r.procInstId);
            approvals.push({
              procInstId: r.procInstId,
              date: `${month + 1}/${day}`,
              detail: proc,
            });
          }
        }
      });
    });
    return approvals;
  }, [attendanceMap, processDataMap, month]);

  // 星期维度异常
  const weekdayAnomalies = useMemo(() =>
    calcWeekdayAnomalies(attendanceMap, holidays, year, month),
    [attendanceMap, holidays, year, month]);

  // 连续缺勤预警
  const consecutiveAbsences = useMemo(() =>
    detectConsecutiveAbsence(attendanceMap, processDataMap, holidays, allUsers, year, month),
    [attendanceMap, processDataMap, holidays, allUsers, year, month]);

  // 新员工（基于考勤月份计算，而非当前日期）
  const newEmployees = useMemo(() => {
    const refDate = new Date(year, month + 1, 0); // 当月最后一天
    return filterNewEmployees(employees, refDate);
  }, [employees, year, month]);

  // 新员工加班档位统计（基于下班打卡时间，累计关系：19:30后包含20:30后，20:30后包含22:00后）
  const newEmployeeOvertimeStats = useMemo(() => {
    if (!attendanceMap || newEmployees.length === 0) return {};
    const result: Record<string, { after1930: number; after2030: number; after2200: number; totalOvertimeMin: number }> = {};
    newEmployees.forEach(({ user }) => {
      const userDays = attendanceMap[user.userid];
      if (!userDays) { result[user.userid] = { after1930: 0, after2030: 0, after2200: 0, totalOvertimeMin: 0 }; return; }
      let after1930 = 0, after2030 = 0, after2200 = 0, totalOtMin = 0;
      Object.values(userDays).forEach((daily: any) => {
        if (!daily.records) return;
        daily.records.forEach((r: any) => {
          if (r.checkType === 'OffDuty' && r.userCheckTime && r.timeResult !== 'NotSigned') {
            const d = new Date(r.userCheckTime);
            const h = d.getHours(), m = d.getMinutes();
            const timeVal = h * 60 + m;
            if (timeVal >= 19 * 60 + 30) {
              after1930++;
              totalOtMin += timeVal - 18 * 60;
              if (timeVal >= 20 * 60 + 30) after2030++;
              if (timeVal >= 22 * 60) after2200++;
            }
          }
        });
      });
      result[user.userid] = { after1930, after2030, after2200, totalOvertimeMin: Math.max(0, totalOtMin) };
    });
    return result;
  }, [newEmployees, attendanceMap]);

  // 跨公司对比
  const crossCompanyMetrics = useMemo<CrossCompanyMetric[]>(() => {
    if (activeCompany !== '全部') return [];
    return calcCrossCompanyMetrics(companyEmployeeStats);
  }, [companyEmployeeStats, activeCompany]);

  // 部门加班分析
  const [deptDetailModal, setDeptDetailModal] = useState<string | null>(null);
  const [showAllDepts, setShowAllDepts] = useState(false);
  const [deptOtTab, setDeptOtTab] = useState<'total' | 'avg'>('total');
  const deptOvertimeAnalysis = useMemo(() => {
    if (employees.length === 0) return [];
    const deptMap: Record<string, { totalMinutes: number; members: Array<{ name: string; minutes: number; userId: string; counts: { c1930: number; c2030: number; c2200: number }; durations: { d1930: number; d2030: number; d2200: number } }> }> = {};
    employees.forEach(({ user, stats }) => {
      // 复合部门名只取第一个（如 "创意中台、创意视频组" → "创意中台"）
      const rawDept = user.department || '未分配部门';
      const dept = rawDept.split('、')[0].split(',')[0].trim();
      if (!deptMap[dept]) deptMap[dept] = { totalMinutes: 0, members: [] };
      const otMin = stats.overtimeTotalMinutes || 0;
      deptMap[dept].totalMinutes += otMin;
      deptMap[dept].members.push({
        name: user.name,
        minutes: otMin,
        userId: user.userid,
        counts: {
          c1930: stats.overtime19_5Count || 0,
          c2030: stats.overtime20_5Count || 0,
          c2200: stats.overtime22Count || 0,
        },
        durations: {
          d1930: stats.overtime19_5Minutes || 0,
          d2030: stats.overtime20_5Minutes || 0,
          d2200: stats.overtime22Minutes || 0,
        },
      });
    });
    return Object.entries(deptMap)
      .map(([dept, data]) => ({
        dept,
        totalHours: Math.round(data.totalMinutes / 60 * 10) / 10,
        avgHours: Math.round((data.totalMinutes / data.members.length) / 60 * 10) / 10,
        headcount: data.members.length,
        topPerson: data.members.sort((a, b) => b.minutes - a.minutes)[0],
        members: data.members.sort((a, b) => b.minutes - a.minutes),
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [employees]);

  // 加班时段分布（全公司汇总）
  const overtimeSlotDistribution = useMemo(() => {
    let total1930 = 0, total2030 = 0, total2200 = 0, total2400 = 0;
    let count1930 = 0, count2030 = 0, count2200 = 0, count2400 = 0;
    employees.forEach(({ stats }) => {
      count1930 += stats.overtime19_5Count || 0;
      count2030 += stats.overtime20_5Count || 0;
      count2200 += stats.overtime22Count || 0;
      count2400 += stats.overtime24Count || 0;
      total1930 += stats.overtime19_5Minutes || 0;
      total2030 += stats.overtime20_5Minutes || 0;
      total2200 += stats.overtime22Minutes || 0;
      total2400 += stats.overtime24Minutes || 0;
    });
    return [
      { slot: '19:30后', count: count1930, hours: Math.round(total1930 / 60 * 10) / 10, color: '#3b82f6' },
      { slot: '20:30后', count: count2030, hours: Math.round(total2030 / 60 * 10) / 10, color: '#8b5cf6' },
      { slot: '22:00后', count: count2200, hours: Math.round(total2200 / 60 * 10) / 10, color: '#f97316' },
      { slot: '24:00后', count: count2400, hours: Math.round(total2400 / 60 * 10) / 10, color: '#ef4444' },
    ];
  }, [employees]);

  // 加班 Top 10 个人排行
  const overtimeTopPersons = useMemo(() => {
    return employees
      .map(({ user, stats }) => ({
        name: user.name,
        dept: (user.department || '未分配').split('、')[0].split(',')[0].trim(),
        totalHours: Math.round((stats.overtimeTotalMinutes || 0) / 60 * 10) / 10,
        c1930: stats.overtime19_5Count || 0,
        c2030: stats.overtime20_5Count || 0,
        c2200: stats.overtime22Count || 0,
        userId: user.userid,
      }))
      .filter(p => p.totalHours > 0)
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, 10);
  }, [employees]);

  // 加班强度指标
  const overtimeIntensity = useMemo(() => {
    const totalOtMinutes = employees.reduce((s, { stats }) => s + (stats.overtimeTotalMinutes || 0), 0);
    const totalOtHours = Math.round(totalOtMinutes / 60 * 10) / 10;
    const otEmployees = employees.filter(({ stats }) => (stats.overtimeTotalMinutes || 0) > 0);
    const otRate = employees.length > 0 ? Math.round(otEmployees.length / employees.length * 1000) / 10 : 0;
    const avgPerPerson = employees.length > 0 ? Math.round(totalOtMinutes / employees.length / 60 * 10) / 10 : 0;
    const avgPerOtPerson = otEmployees.length > 0 ? Math.round(totalOtMinutes / otEmployees.length / 60 * 10) / 10 : 0;
    // 应出勤天数取第一个有数据的员工
    const shouldDays = employees.find(e => e.stats.shouldAttendanceDays)?.stats.shouldAttendanceDays || 22;
    const avgPerDay = employees.length > 0 ? Math.round(totalOtMinutes / employees.length / shouldDays * 10) / 10 : 0;
    return { totalOtHours, otRate, otEmployees: otEmployees.length, avgPerPerson, avgPerOtPerson, avgPerDay, shouldDays };
  }, [employees]);

  // 人员关注 - 迟到频次排行
  const lateFrequencyRanking = useMemo(() => {
    return employees
      .map(({ user, stats }) => ({
        name: user.name,
        dept: (user.department || '未分配').split('、')[0].split(',')[0].trim(),
        count: stats.late || 0,
        minutes: lateExemptionEnabled ? (stats.exemptedLateMinutes || 0) : (stats.lateMinutes || 0),
        userId: user.userid,
      }))
      .filter(p => p.count > 0)
      .sort((a, b) => b.count - a.count || b.minutes - a.minutes)
      .slice(0, 10);
  }, [employees, lateExemptionEnabled]);

  // 人员关注 - 缺卡频次排行
  const missingFrequencyRanking = useMemo(() => {
    return employees
      .map(({ user, stats }) => ({
        name: user.name,
        dept: (user.department || '未分配').split('、')[0].split(',')[0].trim(),
        count: stats.missing || 0,
        userId: user.userid,
      }))
      .filter(p => p.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [employees]);

  // 人员关注 - 请假时长排行
  const leaveHoursRanking = useMemo(() => {
    return employees
      .map(({ user, stats }) => {
        const total = Math.round(((stats.personalHours || 0) + (stats.sickHours || 0) + (stats.annualHours || 0) + (stats.compTimeHours || 0) + (stats.bereavementHours || 0) + (stats.paternityHours || 0) + (stats.maternityHours || 0) + (stats.parentalHours || 0) + (stats.marriageHours || 0)) * 10) / 10;
        return {
          name: user.name,
          dept: (user.department || '未分配').split('、')[0].split(',')[0].trim(),
          totalHours: total,
          personalH: Math.round((stats.personalHours || 0) * 10) / 10,
          sickH: Math.round(((stats.sickHours || 0) + (stats.seriousSickHours || 0)) * 10) / 10,
          annualH: Math.round((stats.annualHours || 0) * 10) / 10,
          userId: user.userid,
        };
      })
      .filter(p => p.totalHours > 0)
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, 10);
  }, [employees]);

  // 人员关注 - 全勤之星
  const fullAttendanceStars = useMemo(() => {
    return employees
      .filter(({ stats }) => stats.isFullAttendance)
      .map(({ user, stats }) => ({
        name: user.name,
        dept: (user.department || '未分配').split('、')[0].split(',')[0].trim(),
        overtimeH: Math.round((stats.overtimeTotalMinutes || 0) / 60 * 10) / 10,
        userId: user.userid,
      }))
      .sort((a, b) => b.overtimeH - a.overtimeH);
  }, [employees]);

  // 人员关注 - 概览统计
  const peopleSummary = useMemo(() => {
    const total = employees.length;
    const lateCount = employees.filter(({ stats }) => (stats.late || 0) > 0).length;
    const missingCount = employees.filter(({ stats }) => (stats.missing || 0) > 0).length;
    const fullCount = fullAttendanceStars.length;
    const leaveCount = employees.filter(({ stats }) => {
      const h = (stats.personalHours || 0) + (stats.sickHours || 0) + (stats.annualHours || 0);
      return h > 0;
    }).length;
    const absentCount = employees.filter(({ stats }) => (stats.absenteeism || 0) > 0).length;
    return { total, lateCount, missingCount, fullCount, leaveCount, absentCount };
  }, [employees, fullAttendanceStars]);

  // 人员关注 - 待转正提醒（入职60~100天，试用期3个月即将到期）
  const probationReminders = useMemo(() => {
    const refDate = new Date(); // 以当前时间为基准
    return allUsers
      .map(user => {
        const joinDate = user.hired_date ? new Date(user.hired_date) : new Date(user.create_time);
        if (isNaN(joinDate.getTime())) return null;
        const daysSinceJoin = Math.floor((refDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
        // 试用期3个月 = ~90天，提前30天提醒（60~100天之间）
        const probationEndDate = new Date(joinDate);
        probationEndDate.setMonth(probationEndDate.getMonth() + 3);
        const daysUntilEnd = Math.floor((probationEndDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        // 只显示试用期内且即将到期（剩余≤30天）或已过期但不超过7天的
        if (daysUntilEnd > 30 || daysUntilEnd < -7) return null;
        return {
          user,
          joinDate: `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}-${String(joinDate.getDate()).padStart(2, '0')}`,
          probationEnd: `${probationEndDate.getFullYear()}-${String(probationEndDate.getMonth() + 1).padStart(2, '0')}-${String(probationEndDate.getDate()).padStart(2, '0')}`,
          daysUntilEnd,
          daysSinceJoin,
          dept: (user.department || '未分配').split('、')[0].split(',')[0].trim(),
        };
      })
      .filter(Boolean) as Array<{ user: DingTalkUser; joinDate: string; probationEnd: string; daysUntilEnd: number; daysSinceJoin: number; dept: string }>;
  }, [allUsers, year, month]);

  // 人员关注 - 合同续签提醒（入职满1年/2年/3年前后30天）
  const contractRenewals = useMemo(() => {
    const refDate = new Date(); // 以当前时间为基准
    const milestones = [1, 2, 3, 5, 8]; // 常见合同周期
    const results: Array<{ user: DingTalkUser; joinDate: string; milestone: number; renewDate: string; daysUntilRenew: number; dept: string }> = [];
    allUsers.forEach(user => {
      const joinDate = user.hired_date ? new Date(user.hired_date) : new Date(user.create_time);
      if (isNaN(joinDate.getTime())) return;
      milestones.forEach(m => {
        const renewDate = new Date(joinDate);
        renewDate.setFullYear(renewDate.getFullYear() + m);
        const daysUntil = Math.floor((renewDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
        // 提前60天到过期后7天
        if (daysUntil <= 60 && daysUntil >= -7) {
          results.push({
            user,
            joinDate: `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}-${String(joinDate.getDate()).padStart(2, '0')}`,
            milestone: m,
            renewDate: `${renewDate.getFullYear()}-${String(renewDate.getMonth() + 1).padStart(2, '0')}-${String(renewDate.getDate()).padStart(2, '0')}`,
            daysUntilRenew: daysUntil,
            dept: (user.department || '未分配').split('、')[0].split(',')[0].trim(),
          });
        }
      });
    });
    return results.sort((a, b) => a.daysUntilRenew - b.daysUntilRenew);
  }, [allUsers, year, month]);

  // 人员关注 - 离职风险信号（综合迟到+缺卡+请假异常高的员工）
  const turnoverRiskSignals = useMemo(() => {
    return employees
      .map(({ user, stats }) => {
        const signals: string[] = [];
        const lateMin = lateExemptionEnabled ? (stats.exemptedLateMinutes || 0) : (stats.lateMinutes || 0);
        if (lateMin >= 60) signals.push(`迟到${lateMin}min`);
        if ((stats.missing || 0) >= 3) signals.push(`缺卡${stats.missing}次`);
        if ((stats.absenteeism || 0) > 0) signals.push(`旷工${stats.absenteeism}次`);
        const personalH = stats.personalHours || 0;
        if (personalH >= 16) signals.push(`事假${personalH}h`);
        // 连续缺勤也是信号
        const hasConsecutive = consecutiveAbsences.some(a => a.user.userid === user.userid && a.type === 'absence');
        if (hasConsecutive) signals.push('连续缺勤');
        if (signals.length < 2) return null; // 至少2个信号才算
        return {
          name: user.name,
          dept: (user.department || '未分配').split('、')[0].split(',')[0].trim(),
          signals,
          score: calcRiskScore(stats, lateExemptionEnabled),
          userId: user.userid,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.score - a.score) as Array<{ name: string; dept: string; signals: string[]; score: number; userId: string }>;
  }, [employees, lateExemptionEnabled, consecutiveAbsences]);

  // 月度环比 - 异步加载上月数据
  useEffect(() => {
    if (!activeCompany) return;
    setMomData(null);

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const prevYearMonth = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;

    const companyIdMap: Record<string, string> = {
      '脑力智能': 'naoli', '眼风科技': 'eyewind', '海多多': 'hydodo',
      '海客': 'haike', '千兵': 'qianbing',
    };

    // 从 IndexedDB 缓存的 employees.punchData 中提取基础环比指标
    // 注意：缓存中 attendanceMap 为空（在 useAttendanceStats 中才计算），所以直接从 punchData 提取
    // 迟到只统计 OnDuty 记录，缺卡统计 OnDuty + OffDuty，且只统计目标月份的记录
    const extractMetricsFromCache = (cached: { employees: DingTalkUser[]; processDataMap: Record<string, any> }, targetYearMonth: string) => {
      const { employees: cachedEmployees, processDataMap: cachedProc } = cached;
      if (!cachedEmployees?.length) return null;

      const [tYear, tMonth] = targetYearMonth.split('-').map(Number); // e.g. 2026, 2
      let lateCount = 0, missingCount = 0, fullCount = 0;
      let totalPersonalH = 0, totalSickH = 0, totalAnnualH = 0;
      const seenProc = new Set<string>();

      cachedEmployees.forEach(user => {
        const records = user.punchData;
        if (!records || records.length === 0) return;
        let userLate = 0, userMissing = 0;

        // 按日期分组，每天只统计一次迟到和缺卡
        const dayRecords = new Map<string, { hasOnDutyLate: boolean; onDutyMissing: boolean; offDutyMissing: boolean }>();

        records.forEach((r: any) => {
          // 过滤只统计目标月份的记录
          const d = new Date(r.workDate);
          if (d.getFullYear() !== tYear || (d.getMonth() + 1) !== tMonth) return;

          const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          if (!dayRecords.has(dayKey)) {
            dayRecords.set(dayKey, { hasOnDutyLate: false, onDutyMissing: false, offDutyMissing: false });
          }
          const dayInfo = dayRecords.get(dayKey)!;

          if (r.checkType === 'OnDuty') {
            if (r.timeResult === 'Late' || r.timeResult === 'SeriousLate') dayInfo.hasOnDutyLate = true;
            if (r.timeResult === 'NotSigned') dayInfo.onDutyMissing = true;
          } else if (r.checkType === 'OffDuty') {
            if (r.timeResult === 'NotSigned') dayInfo.offDutyMissing = true;
          }

          // 从审批记录中提取请假时长
          if (r.procInstId && !seenProc.has(r.procInstId) && cachedProc?.[r.procInstId]) {
            seenProc.add(r.procInstId);
            const proc = cachedProc[r.procInstId];
            const leaveType = proc.formValues?.leaveType || proc.bizType || '';
            const dur = parseFloat(proc.formValues?.duration || proc.formValues?.days || '0');
            const unit = proc.formValues?.durationUnit || proc.formValues?.unit || '';
            const hours = (unit.toUpperCase() === 'DAY' || unit === '天') ? dur * 8 : dur;
            if (leaveType.includes('事假')) totalPersonalH += hours;
            else if (leaveType.includes('病假')) totalSickH += hours;
            else if (leaveType.includes('年假')) totalAnnualH += hours;
          }
        });

        // 按天汇总
        dayRecords.forEach(dayInfo => {
          if (dayInfo.hasOnDutyLate) { userLate++; lateCount++; }
          if (dayInfo.onDutyMissing) { userMissing++; missingCount++; }
          if (dayInfo.offDutyMissing) { userMissing++; missingCount++; }
        });

        if (userLate === 0 && userMissing === 0) fullCount++;
      });

      const total = cachedEmployees.length;
      return {
        lateCount,
        missingCount,
        fullAttendanceRate: Math.round((fullCount / total) * 1000) / 10,
        avgLeaveHours: Math.round(((totalPersonalH + totalSickH + totalAnnualH) / total) * 10) / 10,
        totalEmployees: total,
      };
    };

    const loadMom = async () => {
      setMomLoading(true);
      try {
        // 策略：优先从 IndexedDB 缓存获取完整数据（有 attendanceMap 可精确计算），snapshot 作为备选
        const ids = activeCompany === '全部'
          ? Object.values(companyIdMap)
          : [companyIdMap[activeCompany] || activeCompany];

        // 1. 先尝试 IndexedDB 缓存（忽略过期，因为是读取历史月份数据）
        const cacheResults = await Promise.all(ids.map(id => DashboardCache.getDashboardDataIgnoreExpiry(id, prevYearMonth).catch(() => null)));
        const validCaches = cacheResults.filter(Boolean);
        if (validCaches.length > 0) {
          const merged = { employees: [] as DingTalkUser[], processDataMap: {} as Record<string, any> };
          validCaches.forEach((c: any) => {
            if (c.employees) merged.employees.push(...c.employees);
            if (c.processDataMap) Object.assign(merged.processDataMap, c.processDataMap);
          });
          const metrics = extractMetricsFromCache(merged, prevYearMonth);
          if (metrics) { setMomData({ type: 'cache', metrics }); setMomLoading(false); return; }
        }

        // 2. IndexedDB 无数据，回退到 snapshot
        if (activeCompany === '全部') {
          const results = await Promise.all(ids.map(id => getLatestSnapshot(id, prevYearMonth, 'attendance').catch(() => null)));
          const hasData = results.some(r => r != null);
          if (hasData) setMomData({ type: 'multi', snapshots: results.filter(Boolean) });
        } else {
          const snapshot = await getLatestSnapshot(ids[0], prevYearMonth, 'attendance').catch(() => null);
          if (snapshot) setMomData({ type: 'single', snapshot });
        }
      } catch { /* ignore */ }
      setMomLoading(false);
    };
    loadMom();
  }, [activeCompany, year, month]);

  // ---- Tab 状态 ----
  const [activeTab, setActiveTab] = useState<'overview' | 'overtime' | 'people' | 'legal'>('overview');

  const tabs = [
    { key: 'overview' as const, label: '📊 数据概览', desc: '工时利用率、请假分布、异常分析、对比' },
    { key: 'overtime' as const, label: '⏱️ 工时效能', desc: '加班深度分析、时段分布、效能洞察' },
    { key: 'people' as const, label: '⚠️ 人员关注', desc: '缺勤预警、新员工、风险评分' },
    { key: 'legal' as const, label: '⚖️ 法律法规', desc: '劳动法相关条款速查' },
  ];

  // ---- 渲染 ----

  const isDrawerOpen = controlledOpen ?? false;
  const handleClose = () => onToggle?.(false);
  const handleOpen = () => onToggle?.(true);

  try {
    return (
      <>
        {/* 右侧抽屉面板 */}
        {isDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* 遮罩层 */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={handleClose} />
            {/* 抽屉内容 */}
            <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              {/* 抽屉头部 */}
              <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between px-6 py-4">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3">
                    <BarChartIcon className="w-5 h-5 text-violet-500" /> 进阶数据分析
                    <span className="text-sm font-normal text-slate-400 ml-1">{year}年{month + 1}月</span>
                  </h3>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-500 dark:text-slate-400"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
                {/* Tab 导航 */}
                <div className="flex px-6 gap-1 -mb-px">
                  {tabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                        activeTab === tab.key
                          ? 'border-violet-500 text-violet-700 dark:text-violet-400 bg-white dark:bg-slate-900'
                          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }`}
                      title={tab.desc}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* 抽屉主体 - 可滚动 */}
              <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">

          {/* ========== Tab: 数据概览 ========== */}
          {activeTab === 'overview' && <>
          {/* 第一行：概览卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniCard
              title="平均工时利用率"
              value={`${avgUtilization}%`}
              sub={`${employees.length} 名员工`}
              summary={avgUtilization >= 100
                ? <span className="font-bold text-emerald-600 dark:text-emerald-400">⚡ ≥100%：团队加班投入 ≥ 迟到损耗，工时利用充分</span>
                : <span className="font-bold text-amber-600 dark:text-amber-400">⚠️ &lt;100%：迟到损耗 &gt; 加班补偿，工时存在缺口</span>
              }
              detail={<>
                这个指标反映的是：员工的实际有效工作时间与应出勤标准工时的比值。{'\n'}
                它受三个因素影响：{'\n'}
                · 标准工时：应出勤天数 × 8小时/天{'\n'}
                · 迟到损耗：所有员工迟到分钟数之和（减少有效工时）{'\n'}
                · 加班补偿：所有员工加班分钟数之和（增加有效工时）{'\n\n'}
                公式：(标准工时 - 迟到 + 加班) / 标准工时 × 100%{'\n'}
                本月：标准 {Math.round(utilizationDetail.totalStandardMin / 60)}h - 迟到 {Math.round(utilizationDetail.totalLateMin / 60 * 10) / 10}h + 加班 {Math.round(utilizationDetail.totalOvertimeMin / 60 * 10) / 10}h ≈ {avgUtilization}%{'\n\n'}
                简单说：{avgUtilization >= 100 ? '加班时间弥补了迟到损失还有富余，团队整体工时投入充足' : '迟到造成的工时损失超过了加班的补偿，需要关注出勤纪律'}
              </>}
              icon={<ClockIcon className="w-4 h-4" />}
              color={avgUtilization >= 95 ? 'text-emerald-600' : avgUtilization >= 85 ? 'text-amber-600' : 'text-red-600'}
            />
            <MiniCard
              title="加班合规"
              value={`${overtimeCompliance.dangerCount > 0 ? overtimeCompliance.dangerCount + ' 人超标' : '全部合规'}`}
              sub={`预警 ${overtimeCompliance.warningCount} 人 · 合规 ${overtimeCompliance.okCount} 人`}
              summary={overtimeCompliance.dangerCount > 0
                ? <span className="font-bold text-red-600 dark:text-red-400">🚨 存在违反劳动法第41条的员工，需立即调整排班</span>
                : overtimeCompliance.warningCount > 0
                  ? <span className="font-bold text-amber-600 dark:text-amber-400">⚠️ 部分员工接近法定加班上限，建议提醒注意休息</span>
                  : <span className="font-bold text-emerald-600 dark:text-emerald-400">✅ 全员加班时长均在法定范围内</span>
              }
              detail={<>
                这个指标监控的是：每位员工当月的加班总时长是否超出法定上限。{'\n'}
                法律依据：《劳动法》第41条规定，每月加班不得超过36小时。{'\n\n'}
                它通过统计每人当月所有加班分钟数，换算为小时后判定合规状态：{'\n'}
                · ≤30h 绿色合规，加班量正常，无需干预{'\n'}
                · 30~36h 黄色预警，接近法定上限，建议提醒员工注意休息{'\n'}
                · &gt;36h 红色违规，已超出法定上限，存在劳动纠纷风险{'\n\n'}
                本月：合规 {overtimeCompliance.okCount}人 · 预警 {overtimeCompliance.warningCount}人 · 超标 {overtimeCompliance.dangerCount}人{'\n\n'}
                简单说：{overtimeCompliance.dangerCount > 0 ? '有员工加班超过法定36小时，需要立即调整排班避免法律风险' : overtimeCompliance.warningCount > 0 ? '部分员工加班接近上限，建议关注并合理安排工作量' : '全员加班时长都在安全范围内，无需担心'}
                {'\n\n'}点击卡片查看各员工加班时长明细 →
              </>}
              icon={<AlertTriangleIcon className="w-4 h-4" />}
              color={overtimeCompliance.dangerCount > 0 ? 'text-red-600' : overtimeCompliance.warningCount > 0 ? 'text-amber-600' : 'text-emerald-600'}
              onClick={() => setShowOvertimeDetail(true)}
            />
            <MiniCard
              title="高风险员工"
              value={`${highRiskCount} 人`}
              sub={`风险评分 ≥ 50 分`}
              summary={highRiskCount > 0
                ? <span className="font-bold text-red-600 dark:text-red-400">🚨 {highRiskCount}人风险评分≥50，需重点关注并介入</span>
                : riskItems.length > 0
                  ? <span className="font-bold text-amber-600 dark:text-amber-400">⚠️ {riskItems.length}人存在轻微异常，持续观察</span>
                  : <span className="font-bold text-emerald-600 dark:text-emerald-400">✅ 全员出勤良好，无风险</span>
              }
              detail={<>
                这个指标综合评估的是：每位员工当月的出勤异常严重程度。{'\n'}
                它受三个因素影响，权重不同：{'\n'}
                · 迟到分钟数（权重30%）：反映时间观念{'\n'}
                · 缺卡次数 × 10（权重30%）：反映打卡习惯{'\n'}
                · 旷工次数 × 50（权重40%）：最严重的出勤问题{'\n\n'}
                公式：迟到分钟×30% + 缺卡×10×30% + 旷工×50×40%{'\n\n'}
                风险等级划分：{'\n'}
                · 0分：出勤良好，无异常{'\n'}
                · 1~19分：轻微异常，持续观察即可{'\n'}
                · 20~49分：中等风险，建议主管约谈了解情况{'\n'}
                · ≥50分：高风险，需重点关注并及时介入{'\n\n'}
                简单说：{highRiskCount > 0 ? `${highRiskCount}人评分≥50，说明迟到、缺卡或旷工情况较严重，建议尽快了解原因` : riskItems.length > 0 ? '有轻微异常但整体可控，保持关注即可' : '全员出勤表现良好，无需额外关注'}
                {'\n\n'}点击卡片查看风险评分排行 →
              </>}
              icon={<ActivityIcon className="w-4 h-4" />}
              color={highRiskCount > 0 ? 'text-red-600' : 'text-emerald-600'}
              onClick={() => setShowRiskDetail(true)}
            />
          </div>

          {/* 第二行：图表 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 请假类型占比 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>📊 请假类型占比 <span className="text-[10px] font-normal text-slate-400 ml-1">点击扇区查看员工明细</span></SectionTitle>
              {leaveDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={leaveDistribution}
                      cx="50%" cy="45%"
                      innerRadius={55} outerRadius={90}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent, cx, cy, midAngle, outerRadius: or }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = (or as number) + 25;
                        const x = (cx as number) + radius * Math.cos(-midAngle * RADIAN);
                        const y = (cy as number) + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text x={x} y={y} fill="#64748b" textAnchor={x > (cx as number) ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
                            {name} {(percent * 100).toFixed(0)}%
                          </text>
                        );
                      }}
                      labelLine={true}
                      style={{ cursor: 'pointer' }}
                      onClick={(data) => {
                        if (data?.name) setShowLeaveDetail({ name: data.name, color: data.color || '#64748b' });
                      }}
                    >
                      {leaveDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `${value} 小时`} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyState text="当月无请假记录" />}
            </div>

            {/* 星期维度异常 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>📅 星期维度异常分布</SectionTitle>
              {/* 说明 */}
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">
                统计当月所有工作日中，按星期几汇总的迟到和缺卡累计人次。每个星期几的实际工作日天数已标注在下方。
              </div>
              {/* 每日人次汇总 */}
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mb-1 px-1">
                {weekdayAnomalies.map(w => {
                  const total = w.lateCount + w.missingCount;
                  return (
                    <div key={w.weekday} className="flex-1 text-center">
                      <span className="font-medium">{w.weekday}</span>
                      <span className="ml-1 text-slate-400">{w.workdayCount}个工作日</span>
                      <span className="ml-1 text-slate-400">共{total}人次</span>
                    </div>
                  );
                })}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weekdayAnomalies} barGap={2}>
                  <XAxis dataKey="weekday" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} width={30} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const late = payload.find(p => p.dataKey === 'lateCount')?.value as number || 0;
                      const missing = payload.find(p => p.dataKey === 'missingCount')?.value as number || 0;
                      const total = late + missing;
                      const allTotal = weekdayAnomalies.reduce((s, w) => s + w.lateCount + w.missingCount, 0);
                      const pct = allTotal > 0 ? ((total / allTotal) * 100).toFixed(1) : '0';
                      return (
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs">
                          <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">{label}</div>
                          <div className="text-orange-600">迟到人次：{late}</div>
                          <div className="text-red-600">缺卡人次：{missing}</div>
                          <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                            合计 {total} 人次 · 占全周 {pct}%
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="lateCount" name="迟到人次" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="missingCount" name="缺卡人次" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </BarChart>
              </ResponsiveContainer>
              {/* 底部汇总 */}
              <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-1">
                全周合计：迟到 {weekdayAnomalies.reduce((s, w) => s + w.lateCount, 0)} 人次 · 缺卡 {weekdayAnomalies.reduce((s, w) => s + w.missingCount, 0)} 人次 · 总计 {weekdayAnomalies.reduce((s, w) => s + w.lateCount + w.missingCount, 0)} 人次
              </div>
            </div>
          </div>

          {/* 跨公司对比（仅"全部"tab） */}
          {activeCompany === '全部' && crossCompanyMetrics.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>🏢 跨公司横向对比</SectionTitle>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={crossCompanyMetrics} barGap={4}>
                  <XAxis dataKey="company" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={35} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="attendanceRate" name="出勤率%" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lateRate" name="迟到率%" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="fullAttendanceRate" name="全勤率%" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgLeaveHours" name="人均请假(h)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 月度环比 */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <SectionTitle>📈 月度环比对比 <span className="text-[10px] font-normal text-slate-400 ml-1">{year}年{month + 1}月 vs {month === 0 ? `${year - 1}年12月` : `${year}年${month}月`}</span></SectionTitle>
            {momLoading ? (
              <div className="text-center py-6 text-slate-400 text-sm">正在加载上月数据...</div>
            ) : momData ? (
              <MonthOverMonthView
                currentEmployees={employees}
                momData={momData}
                lateExemptionEnabled={lateExemptionEnabled}
                year={year}
                month={month}
              />
            ) : (
              <div className="text-center py-6">
                <div className="text-slate-400 text-sm mb-2">暂无上月数据，无法进行环比对比</div>
                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 inline-block max-w-md">
                  💡 请先切换到 <span className="font-bold">{month === 0 ? `${year - 1}年12月` : `${year}年${month}月`}</span>，加载该月考勤数据（数据会自动缓存到本地），然后回到当前月即可查看环比对比。
                </div>
              </div>
            )}
          </div>

          {/* 请假工时成本估算按钮 */}
          <div className="flex justify-center">
            <button
              onClick={() => setShowCostModal(true)}
              className="px-6 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 transition-colors shadow-sm flex items-center gap-2"
            >
              💰 请假工时成本估算
            </button>
          </div>
          </>}

          {/* ========== Tab: 工时效能 ========== */}
          {activeTab === 'overtime' && <>
          {/* 加班合规 + 强度指标 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-3 text-center border border-violet-200 dark:border-violet-800">
              <div className="text-2xl font-bold text-violet-600">{overtimeIntensity.totalOtHours}h</div>
              <div className="text-xs text-violet-700 dark:text-violet-400">全员加班总时长</div>
            </div>
            <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 text-center border border-sky-200 dark:border-sky-800">
              <div className="text-2xl font-bold text-sky-600">{overtimeIntensity.otRate}%</div>
              <div className="text-xs text-sky-700 dark:text-sky-400">加班参与率 ({overtimeIntensity.otEmployees}/{employees.length}人)</div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center border border-amber-200 dark:border-amber-800">
              <div className="text-2xl font-bold text-amber-600">{overtimeIntensity.avgPerDay}min</div>
              <div className="text-xs text-amber-700 dark:text-amber-400">人均日加班 ({overtimeIntensity.shouldDays}个工作日)</div>
            </div>
            <div className={`rounded-lg p-3 text-center border cursor-pointer hover:ring-2 transition-all ${
              overtimeCompliance.dangerCount > 0
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 hover:ring-red-300'
                : overtimeCompliance.warningCount > 0
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:ring-amber-300'
                  : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 hover:ring-emerald-300'
            }`} onClick={() => setShowOvertimeDetail(true)}>
              <div className={`text-2xl font-bold ${overtimeCompliance.dangerCount > 0 ? 'text-red-600' : overtimeCompliance.warningCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {overtimeCompliance.dangerCount > 0 ? `${overtimeCompliance.dangerCount}人超标` : overtimeCompliance.warningCount > 0 ? `${overtimeCompliance.warningCount}人预警` : '全部合规'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">法定36h合规 →</div>
            </div>
          </div>

          {/* 加班时段分布 + 个人排行 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 加班时段分布 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>🌙 加班时段分布</SectionTitle>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-3">
                统计下班后不同时段的加班人次和累计时长（累计关系：19:30后包含20:30后）
              </div>
              {overtimeSlotDistribution.some(s => s.count > 0) ? (
                <div className="space-y-3">
                  {overtimeSlotDistribution.map(slot => {
                    const maxCount = Math.max(...overtimeSlotDistribution.map(s => s.count), 1);
                    const pct = Math.round(slot.count / maxCount * 100);
                    return (
                      <div key={slot.slot}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{slot.slot}</span>
                          <span className="text-slate-500">{slot.count}人次 · {slot.hours}h</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2.5">
                          <div className="h-2.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: slot.color }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                    {(() => {
                      const deep = overtimeSlotDistribution[2].count + overtimeSlotDistribution[3].count;
                      const total = overtimeSlotDistribution[0].count;
                      const deepPct = total > 0 ? Math.round(deep / total * 100) : 0;
                      return total > 0 ? `深度加班(22:00后)占比 ${deepPct}%，${deepPct > 30 ? '⚠️ 深夜加班比例偏高，建议关注员工健康' : '整体加班时段分布合理'}` : '';
                    })()}
                  </div>
                </div>
              ) : <EmptyState text="当月无加班记录" />}
            </div>

            {/* 加班 Top 10 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>🏆 加班时长 Top 10</SectionTitle>
              {overtimeTopPersons.length > 0 ? (
                <div className="space-y-2">
                  {overtimeTopPersons.map((p, i) => {
                    const maxH = overtimeTopPersons[0].totalHours || 1;
                    const pct = Math.round(p.totalHours / maxH * 100);
                    return (
                      <div key={p.userId} className="flex items-center gap-2 text-xs">
                        <span className={`w-6 text-center font-bold ${i < 3 ? 'text-base' : 'text-[10px] text-slate-400'}`}>
                          {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                        </span>
                        <span className="w-16 truncate font-medium text-slate-700 dark:text-slate-300">{p.name}</span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                          <div className="h-2 rounded-full bg-gradient-to-r from-violet-400 to-violet-600" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-12 text-right font-mono text-slate-600 dark:text-slate-400">{p.totalHours}h</span>
                        <span className="w-16 text-right text-slate-400 truncate" title={p.dept}>{p.dept}</span>
                      </div>
                    );
                  })}
                  <div className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                    {(() => {
                      const top = overtimeTopPersons[0];
                      const avg = overtimeIntensity.avgPerOtPerson;
                      return top ? `最高 ${top.name} (${top.totalHours}h) · 加班员工人均 ${avg}h · ${top.totalHours > avg * 2 ? '⚠️ 头部加班集中度高，注意工作分配均衡' : '加班分布相对均匀'}` : '';
                    })()}
                  </div>
                </div>
              ) : <EmptyState text="当月无加班记录" />}
            </div>
          </div>

          {/* 工作生活平衡指标 */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <SectionTitle>⚖️ 工作生活平衡洞察</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{overtimeIntensity.avgPerPerson}h</div>
                <div className="text-[10px] text-slate-500">全员人均加班</div>
                <div className={`text-[10px] mt-1 font-medium ${overtimeIntensity.avgPerPerson > 36 ? 'text-red-500' : overtimeIntensity.avgPerPerson > 20 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {overtimeIntensity.avgPerPerson > 36 ? '🚨 严重超标' : overtimeIntensity.avgPerPerson > 20 ? '⚠️ 偏高' : '✅ 健康'}
                </div>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{overtimeIntensity.avgPerOtPerson}h</div>
                <div className="text-[10px] text-slate-500">加班员工人均</div>
                <div className={`text-[10px] mt-1 font-medium ${overtimeIntensity.avgPerOtPerson > 36 ? 'text-red-500' : overtimeIntensity.avgPerOtPerson > 25 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {overtimeIntensity.avgPerOtPerson > 36 ? '🚨 超法定上限' : overtimeIntensity.avgPerOtPerson > 25 ? '⚠️ 接近上限' : '✅ 合理范围'}
                </div>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{employees.length - overtimeIntensity.otEmployees}人</div>
                <div className="text-[10px] text-slate-500">零加班员工</div>
                <div className="text-[10px] mt-1 font-medium text-sky-500">
                  占比 {employees.length > 0 ? Math.round((employees.length - overtimeIntensity.otEmployees) / employees.length * 100) : 0}%
                </div>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {overtimeSlotDistribution[2].count + overtimeSlotDistribution[3].count}次
                </div>
                <div className="text-[10px] text-slate-500">深夜加班(22:00后)</div>
                <div className={`text-[10px] mt-1 font-medium ${(overtimeSlotDistribution[2].count + overtimeSlotDistribution[3].count) > 20 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {(overtimeSlotDistribution[2].count + overtimeSlotDistribution[3].count) > 20 ? '⚠️ 频次偏高' : '✅ 可控范围'}
                </div>
              </div>
            </div>
          </div>

          {/* 部门加班分析 */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>🏢 部门加班分析 <span className="text-[10px] font-normal text-slate-400 ml-1">按部门汇总加班时长，点击柱子查看成员明细</span></SectionTitle>
              <div className="flex bg-slate-100 dark:bg-slate-700 rounded-md p-0.5 text-xs">
                <button
                  onClick={() => setDeptOtTab('total')}
                  className={`px-3 py-1 rounded transition-colors ${deptOtTab === 'total' ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm font-medium' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                >累计</button>
                <button
                  onClick={() => setDeptOtTab('avg')}
                  className={`px-3 py-1 rounded transition-colors ${deptOtTab === 'avg' ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm font-medium' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
                >人均</button>
              </div>
            </div>
            {deptOvertimeAnalysis.length > 0 && deptOvertimeAnalysis.some(d => d.totalHours > 0) ? (
              (() => {
                const withOt = deptOvertimeAnalysis.filter(d => d.totalHours > 0);
                const sorted = deptOtTab === 'avg' ? [...withOt].sort((a, b) => b.avgHours - a.avgHours) : withOt;
                const visibleDepts = showAllDepts ? sorted : sorted.slice(0, 5);
                const hasMore = sorted.length > 5;
                const dataKey = deptOtTab === 'avg' ? 'avgHours' : 'totalHours';
                const barLabel = deptOtTab === 'avg' ? '人均加班(h)' : '总加班(h)';
                return (
                  <>
                    {/* 部门柱状图 - 默认前5 */}
                    <ResponsiveContainer width="100%" height={Math.max(180, visibleDepts.length * 36)}>
                      <BarChart data={visibleDepts} layout="vertical" barSize={18}>
                        <XAxis type="number" tick={{ fontSize: 11 }} unit="h" />
                        <YAxis type="category" dataKey="dept" tick={{ fontSize: 11 }} width={120} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload;
                            return (
                              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-3 text-xs">
                                <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">{d.dept}</div>
                                <div>总加班：<span className="font-mono font-bold text-violet-600">{d.totalHours}h</span></div>
                                <div>人均：<span className="font-mono">{d.avgHours}h</span> · {d.headcount}人</div>
                                <div className="mt-1 pt-1 border-t border-slate-100 dark:border-slate-700 text-slate-500">
                                  加班最多：{d.topPerson.name} ({Math.round(d.topPerson.minutes / 60 * 10) / 10}h)
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey={dataKey} name={barLabel} fill="#8b5cf6" radius={[0, 4, 4, 0]} cursor="pointer"
                          onClick={(data: any) => setDeptDetailModal(data.dept)}
                        >
                          {visibleDepts.map((d, i) => (
                            <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f97316' : i === 2 ? '#a855f7' : '#8b5cf6'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {/* 展开全部按钮 */}
                    {hasMore && (
                      <div className="text-center mt-2">
                        <button
                          onClick={() => setShowAllDepts(!showAllDepts)}
                          className="text-xs text-sky-500 hover:text-sky-600 dark:text-sky-400 flex items-center gap-1 mx-auto"
                        >
                          {showAllDepts ? '收起' : `展开全部 (共${sorted.length}个部门)`}
                          <svg className={`w-3.5 h-3.5 transition-transform ${showAllDepts ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </button>
                      </div>
                    )}

                    {/* 底部汇总 */}
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 text-center">
                      {(() => {
                        const totalAll = withOt.reduce((s, d) => s + d.totalHours, 0);
                        const top = withOt[0];
                        return top ? `全公司加班总计 ${Math.round(totalAll * 10) / 10}h · ${top.dept} 加班最多 (${top.totalHours}h，占 ${Math.round(top.totalHours / totalAll * 100)}%) · 加班最多个人：${top.topPerson.name} (${Math.round(top.topPerson.minutes / 60 * 10) / 10}h)` : '';
                      })()}
                    </div>
                  </>
                );
              })()
            ) : <EmptyState text="当月无加班记录" />}
          </div>
          </>}

          {/* ========== Tab: 人员关注 ========== */}
          {activeTab === 'people' && <>
          {/* 数据统计截止时间 */}
          <div className="text-[11px] text-slate-400 dark:text-slate-500 text-right mb-2">
            数据统计截止于 {new Date().getFullYear()}-{String(new Date().getMonth() + 1).padStart(2, '0')}-{String(new Date().getDate()).padStart(2, '0')} {String(new Date().getHours()).padStart(2, '0')}:{String(new Date().getMinutes()).padStart(2, '0')}:{String(new Date().getSeconds()).padStart(2, '0')}
          </div>
          {/* 人员概览卡片 */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">👥 总人数</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{peopleSummary.total}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 text-center">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-1">⭐ 全勤</div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{peopleSummary.fullCount}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-center">
              <div className="text-xs text-orange-600 dark:text-orange-400 mb-1">🕐 有迟到</div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{peopleSummary.lateCount}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
              <div className="text-xs text-red-600 dark:text-red-400 mb-1">❌ 有缺卡</div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">{peopleSummary.missingCount}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
              <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">📋 有请假</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{peopleSummary.leaveCount}</div>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center cursor-pointer hover:border-red-400 transition-colors" onClick={() => setShowRiskDetail(true)}>
              <div className="text-xs text-red-600 dark:text-red-400 mb-1">🚨 高风险→</div>
              <div className="text-lg font-bold text-red-600 dark:text-red-400">{highRiskCount}</div>
            </div>
          </div>

          {/* HR 提醒行 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* 待转正提醒 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>📝 待转正提醒</SectionTitle>
              {probationReminders.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {probationReminders.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{item.user.name}</span>
                        <span className="text-slate-400 ml-1.5">{item.dept}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold ${item.daysUntilEnd <= 0 ? 'text-red-600' : item.daysUntilEnd <= 7 ? 'text-orange-600' : 'text-amber-600'}`}>
                          {item.daysUntilEnd <= 0 ? `已过期${Math.abs(item.daysUntilEnd)}天` : `剩${item.daysUntilEnd}天`}
                        </span>
                        <div className="text-slate-400 text-[10px]">转正日 {item.probationEnd}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="当前无待转正人员" />}
            </div>

            {/* 合同续签提醒 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">📄 合同续签</h4>
                <div className="flex gap-0.5 bg-slate-100 dark:bg-slate-700 rounded-md p-0.5">
                  {[0, 1, 2, 3, 5, 8].map(m => {
                    const count = m === 0 ? contractRenewals.length : contractRenewals.filter(r => r.milestone === m).length;
                    if (m !== 0 && count === 0) return null;
                    return (
                      <button
                        key={m}
                        onClick={() => setContractTab(m)}
                        className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${contractTab === m ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      >
                        {m === 0 ? '全部' : `${m}年`}{count > 0 ? ` ${count}` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(() => {
                const filtered = contractTab === 0 ? contractRenewals : contractRenewals.filter(r => r.milestone === contractTab);
                return filtered.length > 0 ? (
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {filtered.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
                        <div>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{item.user.name}</span>
                          <span className="text-slate-400 ml-1.5">{item.dept}</span>
                          <div className="text-[10px] text-slate-400 mt-0.5">入职 {item.joinDate}</div>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold ${item.daysUntilRenew <= 0 ? 'text-red-600' : item.daysUntilRenew <= 14 ? 'text-orange-600' : 'text-blue-600'}`}>
                            {item.daysUntilRenew <= 0 ? `已到期${Math.abs(item.daysUntilRenew)}天` : `剩${item.daysUntilRenew}天`}
                          </span>
                          <div className="text-[10px] text-slate-400">{item.milestone}年合同 · 到期 {item.renewDate}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState text={contractTab === 0 ? '当前无合同续签提醒' : `无${contractTab}年合同续签提醒`} />;
              })()}
            </div>

            {/* 离职风险信号 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>🔔 离职风险信号</SectionTitle>
              {turnoverRiskSignals.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {turnoverRiskSignals.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{item.name}</span>
                        <span className="text-slate-400 ml-1.5">{item.dept}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end max-w-[55%]">
                        {item.signals.map((s, j) => (
                          <span key={j} className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-[10px]">{s}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="当前无离职风险信号 ✅" />}
            </div>
          </div>

          {/* 连续缺勤预警 */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4">
            <SectionTitle>🚨 连续请假/缺勤预警 (≥3天)</SectionTitle>
            {consecutiveAbsences.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {consecutiveAbsences.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                    onClick={() => setShowAbsenceDetail(item)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{item.user.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${item.type === 'leave' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {item.type === 'leave' ? '连续请假' : '连续缺勤'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <span className="font-bold text-amber-700 dark:text-amber-400">{item.days}天</span>
                      <span className="ml-2">{item.startDate} ~ {item.endDate}</span>
                      <svg className="w-3.5 h-3.5 text-slate-400 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState text="当月无员工连续请假或缺勤达3天及以上 ✅" />}
          </div>

          {/* 迟到频次 + 缺卡频次 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>🕐 迟到频次 Top 10</SectionTitle>
              {lateFrequencyRanking.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {lateFrequencyRanking.map((p, i) => {
                    const maxCount = lateFrequencyRanking[0]?.count || 1;
                    return (
                      <div key={p.userId} className="flex items-center gap-2 text-xs">
                        <span className={`w-6 h-6 flex items-center justify-center font-bold ${i < 3 ? 'text-base' : 'text-[10px]'}`}>{i < 3 ? ['🥇','🥈','🥉'][i] : <span className="w-5 h-5 rounded-full bg-slate-400 text-white flex items-center justify-center">{i + 1}</span>}</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 w-16 truncate">{p.name}</span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                          <div className="bg-orange-400 dark:bg-orange-500 h-full rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-bold" style={{ width: `${Math.max((p.count / maxCount) * 100, 15)}%` }}>
                            {p.count}次
                          </div>
                        </div>
                        <span className="text-slate-400 text-[10px] w-14 text-right">{p.minutes}min</span>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState text="当月无迟到记录 ✅" />}
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>❌ 缺卡频次 Top 10</SectionTitle>
              {missingFrequencyRanking.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {missingFrequencyRanking.map((p, i) => {
                    const maxCount = missingFrequencyRanking[0]?.count || 1;
                    return (
                      <div key={p.userId} className="flex items-center gap-2 text-xs">
                        <span className={`w-6 h-6 flex items-center justify-center font-bold ${i < 3 ? 'text-base' : 'text-[10px]'}`}>{i < 3 ? ['🥇','🥈','🥉'][i] : <span className="w-5 h-5 rounded-full bg-slate-400 text-white flex items-center justify-center">{i + 1}</span>}</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 w-16 truncate">{p.name}</span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                          <div className="bg-red-400 dark:bg-red-500 h-full rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-bold" style={{ width: `${Math.max((p.count / maxCount) * 100, 15)}%` }}>
                            {p.count}次
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState text="当月无缺卡记录 ✅" />}
            </div>
          </div>

          {/* 请假时长 + 全勤之星 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>📋 请假时长 Top 10</SectionTitle>
              {leaveHoursRanking.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {leaveHoursRanking.map((p, i) => {
                    const maxH = leaveHoursRanking[0]?.totalHours || 1;
                    return (
                      <div key={p.userId} className="flex items-center gap-2 text-xs">
                        <span className={`w-6 h-6 flex items-center justify-center font-bold ${i < 3 ? 'text-base' : 'text-[10px]'}`}>{i < 3 ? ['🥇','🥈','🥉'][i] : <span className="w-5 h-5 rounded-full bg-slate-400 text-white flex items-center justify-center">{i + 1}</span>}</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 w-16 truncate">{p.name}</span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                          <div className="bg-blue-400 dark:bg-blue-500 h-full rounded-full flex items-center justify-end pr-1.5 text-[10px] text-white font-bold" style={{ width: `${Math.max((p.totalHours / maxH) * 100, 15)}%` }}>
                            {p.totalHours}h
                          </div>
                        </div>
                        <span className="text-slate-400 text-[10px] w-20 text-right">事{p.personalH} 病{p.sickH} 年{p.annualH}</span>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState text="当月无请假记录" />}
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <SectionTitle>🏅 全勤标兵 <span className="text-[10px] font-normal text-slate-400">({fullAttendanceStars.length}人)</span></SectionTitle>
              {fullAttendanceStars.length > 0 ? (
                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                  {fullAttendanceStars.map((p, i) => (
                    <div key={p.userId} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ${i < 3 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'}`}>
                      <span>{i < 3 ? ['🥇','🥈','🥉'][i] : '✅'}</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                      {p.overtimeH > 0 && <span className="text-slate-400 text-[10px]">加班{p.overtimeH}h</span>}
                    </div>
                  ))}
                </div>
              ) : <EmptyState text="当月无全勤员工" />}
            </div>
          </div>

          {/* 新员工考勤关注 */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <SectionTitle>👤 新员工考勤关注 <span className="text-[10px] font-normal text-slate-400">(入职≤3个月，共{newEmployees.length}人)</span></SectionTitle>
              <div className="text-[10px] text-slate-400">截止 {year}年{month + 1}月{new Date(year, month + 1, 0).getDate()}日</div>
            </div>
            {newEmployees.length > 0 ? (
              <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5">姓名</th>
                      <th className="px-2 py-1.5 text-center">入职天数</th>
                      <th className="px-2 py-1.5 text-center text-emerald-600">全勤</th>
                      <th className="px-2 py-1.5 text-center text-blue-600">加班(19:30后)</th>
                      <th className="px-2 py-1.5 text-center text-orange-600">迟到</th>
                      <th className="px-2 py-1.5 text-center text-red-600">缺卡</th>
                      <th className="px-2 py-1.5 text-center text-slate-600">请假(h)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {newEmployees.map(({ user, stats, daysSinceJoin }) => {
                      const ot = newEmployeeOvertimeStats[user.userid] || { after1930: 0, after2030: 0, after2200: 0, totalOvertimeMin: 0 };
                      const totalLeave = Math.round(((stats.personalHours || 0) + (stats.sickHours || 0) + (stats.annualHours || 0) + (stats.compTimeHours || 0) + (stats.tripHours || 0) + (stats.bereavementHours || 0) + (stats.paternityHours || 0) + (stats.maternityHours || 0) + (stats.parentalHours || 0) + (stats.marriageHours || 0)) * 10) / 10;
                      return (
                        <tr
                          key={user.userid}
                          className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          onClick={() => setNewEmployeeDetailModal(user.userid)}
                        >
                          <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                            {user.name}
                            <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          </td>
                          <td className="px-2 py-1.5 text-center text-slate-500">{daysSinceJoin}天</td>
                          <td className="px-2 py-1.5 text-center">
                            {stats.isFullAttendance ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-slate-300">-</span>}
                          </td>
                          <td className={`px-2 py-1.5 text-center ${ot.after1930 > 0 ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>{ot.after1930}次</td>
                          <td className={`px-2 py-1.5 text-center ${(stats.late || 0) > 0 ? 'text-orange-600 font-bold' : 'text-slate-400'}`}>{stats.late || 0}</td>
                          <td className={`px-2 py-1.5 text-center ${(stats.missing || 0) > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{stats.missing || 0}</td>
                          <td className={`px-2 py-1.5 text-center ${totalLeave > 0 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>{totalLeave}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState text={`${year}年${month + 1}月无入职3个月内的新员工（基于入职日期计算）`} />}
          </div>
          </>}

          {/* ========== Tab: 法律法规 ========== */}
          {activeTab === 'legal' && <>
          <div className="space-y-4">
            {/* 劳动法核心条款 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-5">
              <SectionTitle>📜 《中华人民共和国劳动法》核心条款</SectionTitle>
              <div className="space-y-4 text-sm">
                <LegalArticle
                  number="第三十六条"
                  title="标准工时制度"
                  content="国家实行劳动者每日工作时间不超过八小时、平均每周工作时间不超过四十四小时的工时制度。"
                  highlight="每日≤8小时，每周≤44小时"
                />
                <LegalArticle
                  number="第三十八条"
                  title="每周休息"
                  content="用人单位应当保证劳动者每周至少休息一日。"
                  highlight="每周至少休息1天"
                />
                <LegalArticle
                  number="第四十一条"
                  title="加班时间限制"
                  content="用人单位由于生产经营需要，经与工会和劳动者协商后可以延长工作时间，一般每日不得超过一小时；因特殊原因需要延长工作时间的，在保障劳动者身体健康的条件下延长工作时间每日不得超过三小时，但是每月不得超过三十六小时。"
                  highlight="每日加班≤3小时，每月加班≤36小时"
                  isKey
                />
                <LegalArticle
                  number="第四十四条"
                  title="加班工资标准"
                  content="有下列情形之一的，用人单位应当按照下列标准支付高于劳动者正常工作时间工资的工资报酬：（一）安排劳动者延长工作时间的，支付不低于工资的百分之一百五十的工资报酬；（二）休息日安排劳动者工作又不能安排补休的，支付不低于工资的百分之二百的工资报酬；（三）法定休假日安排劳动者工作的，支付不低于工资的百分之三百的工资报酬。"
                  highlight="工作日1.5倍 · 休息日2倍 · 法定假日3倍"
                />
              </div>
            </div>

            {/* 劳动合同法相关 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-5">
              <SectionTitle>📋 《劳动合同法》相关条款</SectionTitle>
              <div className="space-y-4 text-sm">
                <LegalArticle
                  number="第三十九条"
                  title="用人单位单方解除（过失性辞退）"
                  content="劳动者有下列情形之一的，用人单位可以解除劳动合同：（一）在试用期间被证明不符合录用条件的；（二）严重违反用人单位的规章制度的；（三）严重失职，营私舞弊，给用人单位造成重大损害的……"
                  highlight="严重违反规章制度可解除合同"
                />
                <LegalArticle
                  number="第四十条"
                  title="用人单位单方解除（非过失性辞退）"
                  content="有下列情形之一的，用人单位提前三十日以书面形式通知劳动者本人或者额外支付劳动者一个月工资后，可以解除劳动合同：（一）劳动者患病或者非因工负伤，在规定的医疗期满后不能从事原工作，也不能从事由用人单位另行安排的工作的……"
                  highlight="医疗期满不能胜任 → 提前30天通知或+1个月工资"
                />
              </div>
            </div>

            {/* 带薪年休假条例 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-5">
              <SectionTitle>🏖️ 《职工带薪年休假条例》</SectionTitle>
              <div className="space-y-4 text-sm">
                <LegalArticle
                  number="第三条"
                  title="年假天数标准"
                  content="职工累计工作已满1年不满10年的，年休假5天；已满10年不满20年的，年休假10天；已满20年的，年休假15天。国家法定休假日、休息日不计入年休假的假期。"
                  highlight="1~10年→5天 · 10~20年→10天 · 20年+→15天"
                  isKey
                />
                <LegalArticle
                  number="第五条"
                  title="未休年假补偿"
                  content="单位确因工作需要不能安排职工休年休假的，经职工本人同意，可以不安排职工休年休假。对职工应休未休的年休假天数，单位应当按照该职工日工资收入的300%支付年休假工资报酬。"
                  highlight="未休年假按日工资300%补偿"
                />
              </div>
            </div>

            {/* 病假与医疗期 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-5">
              <SectionTitle>🏥 病假与医疗期规定</SectionTitle>
              <div className="space-y-4 text-sm">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-2">医疗期标准（企业职工患病或非因工负伤医疗期规定）</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-slate-500 bg-blue-100/50 dark:bg-blue-900/30">
                        <tr>
                          <th className="px-3 py-1.5">实际工作年限</th>
                          <th className="px-3 py-1.5">本单位工作年限</th>
                          <th className="px-3 py-1.5">医疗期</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-100 dark:divide-blue-800 text-slate-700 dark:text-slate-300">
                        <tr><td className="px-3 py-1.5">10年以下</td><td className="px-3 py-1.5">5年以下</td><td className="px-3 py-1.5 font-bold">3个月</td></tr>
                        <tr><td className="px-3 py-1.5">10年以下</td><td className="px-3 py-1.5">5年以上</td><td className="px-3 py-1.5 font-bold">6个月</td></tr>
                        <tr><td className="px-3 py-1.5">10年以上</td><td className="px-3 py-1.5">5年以下</td><td className="px-3 py-1.5 font-bold">6个月</td></tr>
                        <tr><td className="px-3 py-1.5">10年以上</td><td className="px-3 py-1.5">5~10年</td><td className="px-3 py-1.5 font-bold">9个月</td></tr>
                        <tr><td className="px-3 py-1.5">10年以上</td><td className="px-3 py-1.5">10~15年</td><td className="px-3 py-1.5 font-bold">12个月</td></tr>
                        <tr><td className="px-3 py-1.5">10年以上</td><td className="px-3 py-1.5">15~20年</td><td className="px-3 py-1.5 font-bold">18个月</td></tr>
                        <tr><td className="px-3 py-1.5">10年以上</td><td className="px-3 py-1.5">20年以上</td><td className="px-3 py-1.5 font-bold">24个月</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <LegalArticle
                  number="病假工资"
                  title="病假期间工资标准"
                  content="病假工资不得低于当地最低工资标准的80%。各地具体规定可能有所不同，建议参照当地人社局发布的标准执行。"
                  highlight="病假工资 ≥ 最低工资标准的80%"
                />
              </div>
            </div>

            {/* 婚假、产假、丧假等 */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-5">
              <SectionTitle>👨‍👩‍👧 婚假、产假、陪产假、丧假</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-pink-700 dark:text-pink-400 mb-1">💒 婚假</div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">法定婚假3天（各地可能有额外奖励假）</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-purple-700 dark:text-purple-400 mb-1">🤱 产假</div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">法定产假98天（难产+15天，多胞胎每多1个+15天）。各省另有奖励假30~90天不等</div>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">👨‍🍼 陪产假</div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">各省规定不同，一般15~30天。广东省为15天</div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-400 mb-1">🕯️ 丧假</div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">直系亲属去世1~3天，需要到外地料理丧事可酌情给予路程假</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">👶 育儿假</div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">子女3周岁以下，夫妻每年各享受10天育儿假（各省规定不同）</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">⏰ 哺乳假</div>
                  <div className="text-xs text-slate-700 dark:text-slate-300">婴儿1周岁内，每天哺乳时间1小时（含往返路途时间）</div>
                </div>
              </div>
            </div>

            {/* 免责声明 */}
            <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
              ⚠️ 以上内容仅供参考，不构成法律建议。各地政策可能存在差异，具体请以当地最新法规为准。如有劳动争议，建议咨询专业律师或当地劳动仲裁部门。
            </div>
          </div>
          </>}

        </div>
        </div>
        </div>
        </div>
        )}

        {/* 弹窗 - 渲染在抽屉外部，使用 Portal 自动定位 */}
        <LeaveCostModal
          isOpen={showCostModal}
          onClose={() => setShowCostModal(false)}
          employees={employees}
          yearMonth={yearMonth}
        />

        {/* 加班合规详情弹窗 */}
        <Modal isOpen={showOvertimeDetail} onClose={() => setShowOvertimeDetail(false)} title="加班合规监控详情" size="lg">
          <div className="max-h-[60vh] overflow-y-auto">
            {/* 法律依据说明 */}
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
              <span className="font-bold">📜 法律依据：</span>《中华人民共和国劳动法》第四十一条规定，用人单位由于生产经营需要，经与工会和劳动者协商后可以延长工作时间，一般每日不得超过一小时；因特殊原因需要延长工作时间的，在保障劳动者身体健康的条件下延长工作时间每日不得超过三小时，但是<span className="font-bold text-red-600 dark:text-red-400">每月不得超过三十六小时</span>。
            </div>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-600">{overtimeCompliance.okCount}</div>
                <div className="text-xs text-emerald-700 dark:text-emerald-400">合规 (≤36h)</div>
              </div>
              <div className="flex-1 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{overtimeCompliance.warningCount}</div>
                <div className="text-xs text-amber-700 dark:text-amber-400">预警 (&gt;30h)</div>
              </div>
              <div className="flex-1 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{overtimeCompliance.dangerCount}</div>
                <div className="text-xs text-red-700 dark:text-red-400">违规 (&gt;36h)</div>
              </div>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 sticky top-0">
                <tr>
                  <th className="px-3 py-2">姓名</th>
                  <th className="px-3 py-2 text-right">加班时长 (h)</th>
                  <th className="px-3 py-2 text-center">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {overtimeCompliance.items.map(item => (
                  <tr key={item.user.userid}>
                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{item.user.name}</td>
                    <td className="px-3 py-2 text-right font-mono">{item.hours}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.status === 'danger' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        item.status === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                        {item.status === 'danger' ? '违反劳动法第41条' : item.status === 'warning' ? '接近法定上限' : '合规'}
                      </span>
                    </td>
                  </tr>
                ))}
                {overtimeCompliance.items.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-4 text-slate-400">当月无加班记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>

        {/* 风险评分详情弹窗 */}
        <Modal isOpen={showRiskDetail} onClose={() => setShowRiskDetail(false)} title="累计风险评分排行" size="lg">
          <div className="mb-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
            评分公式：迟到分钟数 × 30% + 缺卡次数 × 10 × 30% + 旷工次数 × 50 × 40%
          </div>
          <div className="max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-12 text-center">#</th>
                  <th className="px-3 py-2">姓名</th>
                  <th className="px-3 py-2 text-right">迟到(分)</th>
                  <th className="px-3 py-2 text-right">缺卡(次)</th>
                  <th className="px-3 py-2 text-right">旷工(次)</th>
                  <th className="px-3 py-2 text-right">风险评分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {riskItems.slice(0, 30).map((item, idx) => {
                  const lateVal = lateExemptionEnabled ? (item.stats.exemptedLateMinutes || 0) : (item.stats.lateMinutes || 0);
                  return (
                    <tr key={item.user.userid} className={item.score >= 50 ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                      <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{item.user.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400">{lateVal}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400">{item.stats.missing || 0}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600 dark:text-slate-400">{item.stats.absenteeism || 0}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${item.score >= 50 ? 'text-red-600' : item.score >= 20 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {Math.round(item.score * 10) / 10}
                      </td>
                    </tr>
                  );
                })}
                {riskItems.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-4 text-slate-400">所有员工风险评分为 0 ✅</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>

        {/* 请假类型员工明细弹窗 */}
        <Modal isOpen={!!showLeaveDetail} onClose={() => { setShowLeaveDetail(null); setExpandedLeaveEmployee(null); }} title={showLeaveDetail ? `${showLeaveDetail.name}员工明细` : ''} size="lg">
          {showLeaveDetail && leaveDetailByType[showLeaveDetail.name] ? (
            <div className="max-h-[55vh] overflow-y-auto">
              <div className="mb-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg flex items-center gap-2">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: showLeaveDetail.color }} />
                共 {leaveDetailByType[showLeaveDetail.name].length} 人使用{showLeaveDetail.name}，合计 {leaveDetailByType[showLeaveDetail.name].reduce((s, i) => s + i.hours, 0)} 小时
                <span className="ml-auto text-[10px] text-slate-400">点击员工查看请假详情</span>
              </div>
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 w-12 text-center">#</th>
                    <th className="px-3 py-2">姓名</th>
                    <th className="px-3 py-2 text-right">{showLeaveDetail.name}时长 (小时)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {leaveDetailByType[showLeaveDetail.name].map((item, idx) => {
                    const isExpanded = expandedLeaveEmployee === item.userId;
                    const approvals = isExpanded ? getEmployeeLeaveApprovals(item.userId, showLeaveDetail.name) : [];
                    return (
                      <React.Fragment key={idx}>
                        <tr
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                          onClick={() => setExpandedLeaveEmployee(isExpanded ? null : item.userId)}
                        >
                          <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            {item.name}
                            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          </td>
                          <td className="px-3 py-2 text-right font-mono" style={{ color: showLeaveDetail.color }}>{item.hours}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={3} className="px-3 py-0">
                              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-lg p-3 mb-2 mt-1 border border-slate-200 dark:border-slate-700">
                                {approvals.length > 0 ? (
                                  <div className="space-y-2">
                                    {approvals.map((a, ai) => (
                                      <div key={ai} className="text-xs bg-white dark:bg-slate-900 rounded-md p-2.5 border border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <span className="font-bold text-slate-700 dark:text-slate-300">{a.detail.formValues?.leaveType || a.detail.bizType || '请假'}</span>
                                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            a.detail.result === 'agree' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                            a.detail.result === 'refuse' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                          }`}>
                                            {a.detail.result === 'agree' ? '已通过' : a.detail.result === 'refuse' ? '已拒绝' : a.detail.status === 'RUNNING' ? '审批中' : '已完成'}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600 dark:text-slate-400">
                                          {a.detail.formValues?.start && <div>开始：<span className="font-mono">{a.detail.formValues.start || a.detail.formValues.startTime}</span></div>}
                                          {a.detail.formValues?.end && <div>结束：<span className="font-mono">{a.detail.formValues.end || a.detail.formValues.endTime}</span></div>}
                                          {(a.detail.formValues?.duration || a.detail.formValues?.days) && (
                                            <div>时长：<span className="font-mono">
                                              {(() => {
                                                const dur = parseFloat(a.detail.formValues?.duration || a.detail.formValues?.days || '0');
                                                const unit = a.detail.formValues?.durationUnit || a.detail.formValues?.unit || '';
                                                if (unit.toUpperCase() === 'DAY' || unit === '天') return `${dur}天 (${dur * 8}小时)`;
                                                return `${dur}小时`;
                                              })()}
                                            </span></div>
                                          )}
                                        </div>
                                        {(a.detail.formValues?.reason || a.detail.formValues?.remark) && (
                                          <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                                            事由：{(a.detail.formValues?.reason || a.detail.formValues?.remark || '').replace(/\\n/g, '\n')}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-400 text-center py-2">未找到该员工的{showLeaveDetail.name}审批记录</div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-400 text-sm">暂无数据</div>
          )}
        </Modal>

        {/* 连续请假/缺勤详情弹窗 */}
        <Modal isOpen={!!showAbsenceDetail} onClose={() => setShowAbsenceDetail(null)} title={showAbsenceDetail ? `${showAbsenceDetail.user.name} - ${showAbsenceDetail.type === 'leave' ? '连续请假' : '连续缺勤'}详情` : ''} size="lg">
          {showAbsenceDetail && (() => {
            const approvals = getEmployeeLeaveApprovals(showAbsenceDetail.user.userid);
            return (
              <div className="max-h-[55vh] overflow-y-auto">
                <div className="mb-3 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-amber-800 dark:text-amber-300">
                  {showAbsenceDetail.user.name} 在 {showAbsenceDetail.startDate} ~ {showAbsenceDetail.endDate} 期间{showAbsenceDetail.type === 'leave' ? '连续请假' : '连续缺勤'} {showAbsenceDetail.days} 天
                </div>
                {approvals.length > 0 ? (
                  <div className="space-y-3">
                    {approvals.map((a, ai) => (
                      <div key={ai} className="text-sm bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-slate-700 dark:text-slate-300">{a.detail.formValues?.leaveType || a.detail.bizType || '审批'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            a.detail.result === 'agree' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                            a.detail.result === 'refuse' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}>
                            {a.detail.result === 'agree' ? '已通过' : a.detail.result === 'refuse' ? '已拒绝' : a.detail.status === 'RUNNING' ? '审批中' : '已完成'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                          {(a.detail.formValues?.start || a.detail.formValues?.startTime) && <div>开始时间：<span className="font-mono">{a.detail.formValues.start || a.detail.formValues.startTime}</span></div>}
                          {(a.detail.formValues?.end || a.detail.formValues?.endTime) && <div>结束时间：<span className="font-mono">{a.detail.formValues.end || a.detail.formValues.endTime}</span></div>}
                          {(a.detail.formValues?.duration || a.detail.formValues?.days) && (
                            <div>时长：<span className="font-mono">
                              {(() => {
                                const dur = parseFloat(a.detail.formValues?.duration || a.detail.formValues?.days || '0');
                                const unit = a.detail.formValues?.durationUnit || a.detail.formValues?.unit || '';
                                if (unit.toUpperCase() === 'DAY' || unit === '天') return `${dur}天 (${dur * 8}小时)`;
                                return `${dur}小时`;
                              })()}
                            </span></div>
                          )}
                        </div>
                        {(a.detail.formValues?.reason || a.detail.formValues?.remark) && (
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-600 dark:text-slate-300">请假事由：</span>
                            {(a.detail.formValues?.reason || a.detail.formValues?.remark || '').replace(/\\n/g, '\n')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-sm">
                    {showAbsenceDetail.type === 'absence' ? '该员工为连续缺勤（无审批记录）' : '未找到相关审批记录'}
                  </div>
                )}
              </div>
            );
          })()}
        </Modal>

        {/* 部门加班成员明细弹窗 */}
        <Modal isOpen={!!deptDetailModal} onClose={() => setDeptDetailModal(null)} title={deptDetailModal ? `${deptDetailModal} - 加班明细` : ''} size="2xl">
          {deptDetailModal && (() => {
            const dept = deptOvertimeAnalysis.find(d => d.dept === deptDetailModal);
            if (!dept) return <div className="text-center py-6 text-slate-400">未找到部门数据</div>;
            return (
              <div>
                <div className="mb-3 text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                  <span className="text-slate-600 dark:text-slate-300">{dept.headcount}人</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="text-violet-600 dark:text-violet-400 font-bold">总计 {dept.totalHours}h</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="text-slate-600 dark:text-slate-300">人均 {dept.avgHours}h</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="text-red-500">🔥 {dept.topPerson.name} ({Math.round(dept.topPerson.minutes / 60 * 10) / 10}h)</span>
                </div>
                <div className="max-h-[55vh] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-700 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 w-10">#</th>
                        <th className="px-3 py-2">姓名</th>
                        <th className="px-3 py-2 text-right">总加班(h)</th>
                        <th className="px-3 py-2 text-center">19:30后</th>
                        <th className="px-3 py-2 text-center">20:30后</th>
                        <th className="px-3 py-2 text-center">22:00后</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {dept.members.map((m, idx) => {
                        const hours = Math.round(m.minutes / 60 * 10) / 10;
                        return (
                          <tr key={m.userId} className={idx === 0 && hours > 0 ? 'bg-red-50/50 dark:bg-red-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}>
                            <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                              {m.name}
                              {idx === 0 && hours > 0 && <span className="ml-1.5 text-[10px] text-red-500 font-normal">🔥 最高</span>}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono ${hours > 36 ? 'text-red-600 font-bold' : hours > 30 ? 'text-amber-600 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
                              {hours}
                            </td>
                            <td className="px-3 py-2 text-center text-slate-500">
                              <div>{m.counts.c1930}次</div>
                              <div className="text-[10px] text-slate-400">{Math.round(m.durations.d1930 / 60 * 10) / 10}h</div>
                            </td>
                            <td className="px-3 py-2 text-center text-slate-500">
                              <div>{m.counts.c2030}次</div>
                              <div className="text-[10px] text-slate-400">{Math.round(m.durations.d2030 / 60 * 10) / 10}h</div>
                            </td>
                            <td className="px-3 py-2 text-center text-slate-500">
                              <div>{m.counts.c2200}次</div>
                              <div className="text-[10px] text-slate-400">{Math.round(m.durations.d2200 / 60 * 10) / 10}h</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </Modal>

        {/* 新员工考勤详情弹窗 */}
        <Modal isOpen={!!newEmployeeDetailModal} onClose={() => setNewEmployeeDetailModal(null)} title={(() => {
          const emp = newEmployees.find(e => e.user.userid === newEmployeeDetailModal);
          return emp ? `${emp.user.name} - 新员工考勤详情` : '';
        })()} size="lg">
          {newEmployeeDetailModal && (() => {
            const emp = newEmployees.find(e => e.user.userid === newEmployeeDetailModal);
            if (!emp) return <div className="text-center py-6 text-slate-400">未找到员工数据</div>;
            const { user, stats, daysSinceJoin } = emp;
            const ot = newEmployeeOvertimeStats[user.userid] || { after1930: 0, after2030: 0, after2200: 0, totalOvertimeMin: 0 };
            const joinDate = user.hired_date ? new Date(user.hired_date) : new Date(user.create_time);
            const joinDateStr = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}-${String(joinDate.getDate()).padStart(2, '0')}`;
            // 需关注的请假（不含调休、出差）
            const concernLeave = (stats.personalHours || 0) + (stats.sickHours || 0) + (stats.annualHours || 0) + (stats.bereavementHours || 0) + (stats.paternityHours || 0) + (stats.maternityHours || 0) + (stats.parentalHours || 0) + (stats.marriageHours || 0);
            const hasConcern = (stats.late || 0) > 0 || (stats.missing || 0) > 0 || concernLeave > 0;
            return (
              <div className="space-y-4">
                {/* 基本信息 - 一行展示 */}
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-2.5 border border-slate-200 dark:border-slate-700">
                  <span className="text-sky-600 dark:text-sky-400 font-medium whitespace-nowrap">📅 {joinDateStr} 入职 · {daysSinceJoin}天</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="whitespace-nowrap">🏢 {user.department || '-'}</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="truncate">🏠 {user.mainCompany || '-'}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 items-stretch">
                  {/* 积极表现 */}
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                    <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 pb-2 border-b border-emerald-200 dark:border-emerald-700 flex items-center gap-1.5">✅ 积极表现</div>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span>全勤</span>
                        <span className={stats.isFullAttendance ? 'text-emerald-600 font-bold' : 'text-slate-400'}>{stats.isFullAttendance ? '是 ✓' : '否'}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span>加班 (19:30后)</span>
                        <span className={ot.after1930 > 0 ? 'text-blue-600 font-bold' : 'text-slate-400'}>{ot.after1930}次</span>
                      </div>
                      {ot.after1930 > 0 && (
                        <>
                          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 pl-4 text-xs">
                            <span>└ 其中 20:30后</span>
                            <span className={ot.after2030 > 0 ? 'text-blue-600 font-medium' : 'text-slate-400'}>{ot.after2030}次</span>
                          </div>
                          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 pl-4 text-xs">
                            <span>└ 其中 22:00后</span>
                            <span className={ot.after2200 > 0 ? 'text-indigo-600 font-bold' : 'text-slate-400'}>{ot.after2200}次</span>
                          </div>
                        </>
                      )}
                      {ot.totalOvertimeMin > 0 && (
                        <div className="flex justify-between items-center text-slate-700 dark:text-slate-300 pt-2 mt-1 border-t border-emerald-200 dark:border-emerald-700">
                          <span>累计加班时长</span>
                          <span className="text-blue-600 font-bold">{Math.round(ot.totalOvertimeMin / 60 * 10) / 10}h</span>
                        </div>
                      )}
                      {(stats.compTimeHours || 0) > 0 && (
                        <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                          <span>调休</span>
                          <span className="text-slate-600">{stats.compTimeHours}h</span>
                        </div>
                      )}
                      {(stats.tripHours || 0) > 0 && (
                        <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                          <span>出差</span>
                          <span className="text-slate-600">{stats.tripHours}h</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 需关注 */}
                  <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-4 border border-red-200 dark:border-red-800">
                    <div className="text-sm font-bold text-red-600 dark:text-red-400 mb-3 pb-2 border-b border-red-200 dark:border-red-700 flex items-center gap-1.5">⚠️ 需关注</div>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span>迟到</span>
                        <span className={(stats.late || 0) > 0 ? 'text-orange-600 font-bold' : 'text-slate-400'}>{stats.late || 0}次 / {stats.lateMinutes || 0}分钟</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span>缺卡</span>
                        <span className={(stats.missing || 0) > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}>{stats.missing || 0}次</span>
                      </div>
                      {(stats.personalHours || 0) > 0 && <div className="flex justify-between items-center text-slate-700 dark:text-slate-300"><span>事假</span><span className="text-amber-600">{stats.personalHours}h</span></div>}
                      {(stats.sickHours || 0) > 0 && <div className="flex justify-between items-center text-slate-700 dark:text-slate-300"><span>病假</span><span className="text-rose-600">{stats.sickHours}h</span></div>}
                      {(stats.annualHours || 0) > 0 && <div className="flex justify-between items-center text-slate-700 dark:text-slate-300"><span>年假</span><span>{stats.annualHours}h</span></div>}
                      {(stats.bereavementHours || 0) > 0 && <div className="flex justify-between items-center text-slate-700 dark:text-slate-300"><span>丧假</span><span>{stats.bereavementHours}h</span></div>}
                      {(stats.paternityHours || 0) > 0 && <div className="flex justify-between items-center text-slate-700 dark:text-slate-300"><span>陪产假</span><span>{stats.paternityHours}h</span></div>}
                      {(stats.maternityHours || 0) > 0 && <div className="flex justify-between items-center text-slate-700 dark:text-slate-300"><span>产假</span><span>{stats.maternityHours}h</span></div>}
                      {(stats.parentalHours || 0) > 0 && <div className="flex justify-between items-center text-slate-700 dark:text-slate-300"><span>育儿假</span><span>{stats.parentalHours}h</span></div>}
                      {(stats.marriageHours || 0) > 0 && <div className="flex justify-between items-center text-slate-700 dark:text-slate-300"><span>婚假</span><span>{stats.marriageHours}h</span></div>}
                      {!hasConcern && (
                        <div className="text-emerald-500 text-center py-3 font-medium">表现良好，无异常 ✅</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      </>
    );
  } catch (error) {
    console.error('[AttendanceAnalytics] Error:', error);
    return (
      <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 text-sm">
        数据分析模块加载异常，不影响主功能使用。
      </div>
    );
  }
};

// ============ 月度环比子组件 ============

const MonthOverMonthView: React.FC<{
  currentEmployees: Array<{ user: DingTalkUser; stats: EmployeeStats }>;
  momData: any;
  lateExemptionEnabled?: boolean;
  year: number;
  month: number;
}> = ({ currentEmployees, momData, lateExemptionEnabled, year, month }) => {
  // 判断当前考勤月份是否已结束
  const isCurrentMonthFinished = useMemo(() => {
    const now = new Date();
    const lastDayOfMonth = new Date(year, month + 1, 0);
    return now > lastDayOfMonth;
  }, [year, month]);

  // 当前月指标
  const currentMetrics = useMemo(() => {
    const total = currentEmployees.length;
    if (total === 0) return null;
    const lateCount = currentEmployees.reduce((s, e) => s + (e.stats.late || 0), 0);
    const missingCount = currentEmployees.reduce((s, e) => s + (e.stats.missing || 0), 0);
    const fullCount = currentEmployees.filter(e => e.stats.isFullAttendance).length;
    const totalLeaveHours = currentEmployees.reduce((s, e) =>
      s + (e.stats.personalHours || 0) + (e.stats.sickHours || 0) + (e.stats.annualHours || 0), 0);
    return {
      lateCount,
      missingCount,
      fullAttendanceRate: Math.round((fullCount / total) * 1000) / 10,
      avgLeaveHours: Math.round((totalLeaveHours / total) * 10) / 10,
      totalEmployees: total,
    };
  }, [currentEmployees]);

  if (!currentMetrics) return <EmptyState text="当前月无数据" />;

  // 从缓存或快照中提取上月指标
  const prevMetrics = useMemo(() => {
    try {
      if (momData.type === 'cache' && momData.metrics) return momData.metrics;
      // 快照类型：数据有限，仅返回人数
      const snapshots = momData.type === 'multi' ? momData.snapshots : [momData.snapshot];
      let totalRows = 0;
      snapshots.forEach((s: any) => { if (s?.rows) totalRows += s.rows.length; });
      if (totalRows === 0) return null;
      return { totalEmployees: totalRows, available: true };
    } catch { return null; }
  }, [momData]);

  const indicators = [
    {
      label: '迟到总人次', current: currentMetrics.lateCount, isNegative: true,
      formula: '统计所有员工当月迟到次数之和（含严重迟到）',
      ongoingNote: '当月未结束，数据仍在累计中',
    },
    {
      label: '缺卡总次数', current: currentMetrics.missingCount, isNegative: true,
      formula: '统计所有员工当月未打卡（NotSigned）次数之和',
      ongoingNote: '当月未结束，数据仍在累计中',
    },
    {
      label: '全勤率', current: currentMetrics.fullAttendanceRate, unit: '%', isNegative: false,
      formula: '全勤人数 / 总人数 × 100%',
      ongoingNote: '当月未结束，全勤尚无法核算，月末结算后更新',
    },
    {
      label: '人均请假时长', current: currentMetrics.avgLeaveHours, unit: 'h', isNegative: true,
      formula: '(事假 + 病假 + 年假) 总时长 / 总人数',
      ongoingNote: '当月未结束，数据仍在累计中',
    },
  ];

  // 判断上月数据是否有具体指标（来自 IndexedDB 缓存）
  const hasDetailedPrev = prevMetrics?.lateCount != null;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {indicators.map(ind => {
          const keyMap: Record<string, string> = {
            '迟到总人次': 'lateCount', '缺卡总次数': 'missingCount',
            '全勤率': 'fullAttendanceRate', '人均请假时长': 'avgLeaveHours',
          };
          const prevVal = hasDetailedPrev ? (prevMetrics as any)[keyMap[ind.label]] : undefined;
          const hasPrev = prevVal != null;
          const diff = hasPrev ? Math.round((ind.current - prevVal) * 10) / 10 : 0;
          const isImproved = ind.isNegative ? diff < 0 : diff > 0;
          const isWorse = ind.isNegative ? diff > 0 : diff < 0;
          return (
            <div key={ind.label} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 text-center group relative">
              <div className="text-xs text-slate-500 mb-1">{ind.label}</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                {ind.current}{ind.unit || ''}
              </div>
              {/* 当月未结束提示 */}
              {!isCurrentMonthFinished && (
                <div className="text-[10px] text-amber-500 dark:text-amber-400 mt-0.5">⏳ {ind.ongoingNote}</div>
              )}
              {hasPrev ? (
                <div className="text-xs mt-1.5 space-y-0.5">
                  <div className="text-slate-400">上月 {prevVal}{ind.unit || ''}</div>
                  {diff !== 0 ? (
                    <div className={`font-medium ${diff > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {diff > 0 ? '↑' : '↓'} {Math.abs(diff)}{ind.unit || ''}
                      {prevVal !== 0 && <span className="ml-1 text-[10px]">({diff > 0 ? '+' : ''}{Math.round((diff / prevVal) * 100)}%)</span>}
                    </div>
                  ) : (
                    <div className="text-slate-400">持平</div>
                  )}
                </div>
              ) : prevMetrics ? (
                <div className="text-xs text-slate-400 mt-1">上月有 {prevMetrics.totalEmployees} 人（快照数据，无明细）</div>
              ) : (
                <div className="text-xs text-slate-400 mt-1">无上月对比数据</div>
              )}
              {/* 悬浮提示：计算说明 */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-[10px] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {ind.formula}
              </div>
            </div>
          );
        })}
      </div>
      {/* 数据来源说明 */}
      <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2">
        {hasDetailedPrev
          ? `上月数据来源：本地缓存（${prevMetrics.totalEmployees}人），基于考勤打卡记录精确计算`
          : prevMetrics
            ? '上月数据来源：报表快照（仅有人数，无明细指标）'
            : ''}
      </div>
    </div>
  );
};
