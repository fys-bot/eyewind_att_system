/**
 * 考勤数据分析工具函数
 * 独立模块，不修改现有逻辑
 */
import type { DingTalkUser, EmployeeStats, AttendanceMap, HolidayMap, DailyAttendanceStatus } from '../../../database/schema.ts';

// ============ 类型定义 ============

export interface WorkHoursUtilization {
  userId: string;
  name: string;
  rate: number; // 百分比
}

export interface RiskScoreItem {
  user: DingTalkUser;
  stats: EmployeeStats;
  score: number;
}

export interface WeekdayAnomaly {
  weekday: string; // 周一~周五
  weekdayIndex: number;
  lateCount: number;
  missingCount: number;
  workdayCount: number; // 当月该星期几实际有多少个工作日
}

export interface LeaveTypeData {
  name: string;
  value: number; // 小时数
  color: string;
}

export interface ConsecutiveAbsenceItem {
  user: DingTalkUser;
  days: number;
  startDate: string;
  endDate: string;
  type: 'leave' | 'absence'; // 请假 or 缺勤
}

export interface OvertimeComplianceItem {
  user: DingTalkUser;
  hours: number;
  status: 'ok' | 'warning' | 'danger';
}

export interface OvertimeComplianceSummary {
  okCount: number;
  warningCount: number;
  dangerCount: number;
  items: OvertimeComplianceItem[];
}

export interface CrossCompanyMetric {
  company: string;
  attendanceRate: number;
  lateRate: number;
  fullAttendanceRate: number;
  avgLeaveHours: number;
}

export interface LeaveCostResult {
  userId: string;
  name: string;
  monthlySalary: number | null;
  hourlyRate: number | null;
  personalCost: number | null;
  sickCost: number | null;
  annualCost: number | null;
  totalCost: number | null;
}

// ============ 工具函数 ============

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const LEAVE_COLORS: Record<string, string> = {
  '年假': '#22c55e',
  '病假': '#ef4444',
  '事假': '#f59e0b',
  '调休': '#06b6d4',
  '出差': '#6366f1',
  '丧假': '#64748b',
  '陪产假': '#8b5cf6',
  '产假': '#ec4899',
  '育儿假': '#14b8a6',
  '婚假': '#f97316',
};

/**
 * 计算单个员工的工时利用率
 * 公式: (应出勤天数×8×60 - 迟到分钟数 + 加班分钟数) / (应出勤天数×8×60) × 100%
 */
export function calcWorkHoursUtilization(stats: EmployeeStats): number {
  const totalMinutes = (stats.shouldAttendanceDays || 0) * 8 * 60;
  if (totalMinutes <= 0) return 0;
  const effectiveMinutes = totalMinutes - (stats.lateMinutes || 0) + (stats.overtimeTotalMinutes || 0);
  return Math.min(200, Math.max(0, (effectiveMinutes / totalMinutes) * 100));
}

/**
 * 计算员工风险评分
 * 公式: 迟到分钟数×0.3 + 缺卡次数×10×0.3 + 旷工次数×50×0.4
 */
export function calcRiskScore(stats: EmployeeStats, useLateExemption: boolean): number {
  const lateMinutes = useLateExemption ? (stats.exemptedLateMinutes || 0) : (stats.lateMinutes || 0);
  return lateMinutes * 0.3 + (stats.missing || 0) * 10 * 0.3 + (stats.absenteeism || 0) * 50 * 0.4;
}

/**
 * 按星期聚合迟到和缺卡人次
 */
export function calcWeekdayAnomalies(
  attendanceMap: AttendanceMap,
  holidays: HolidayMap,
  year: number,
  month: number
): WeekdayAnomaly[] {
  const weekdayData: Record<number, { late: number; missing: number }> = {};
  for (let i = 1; i <= 5; i++) weekdayData[i] = { late: 0, missing: 0 };

  // 计算当月每个星期几实际有多少个工作日
  const weekdayWorkdayCounts: Record<number, number> = {};
  for (let i = 1; i <= 5; i++) weekdayWorkdayCounts[i] = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const dateKey = `${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const holidayInfo = holidays?.[dateKey];
    let isWorkDay = !isWeekend;
    if (holidayInfo) {
      if (holidayInfo.holiday === false) isWorkDay = true;
      else if (holidayInfo.holiday === true) isWorkDay = false;
    }
    if (isWorkDay && weekday >= 1 && weekday <= 5) {
      weekdayWorkdayCounts[weekday]++;
    }
  }

  Object.values(attendanceMap).forEach(userDays => {
    Object.entries(userDays).forEach(([dayKey, daily]: [string, DailyAttendanceStatus]) => {
      const day = parseInt(dayKey);
      if (isNaN(day)) return;
      const date = new Date(year, month, day);
      const weekday = date.getDay();
      if (weekday < 1 || weekday > 5) return; // 只统计工作日

      // 检查是否为节假日
      const dateKey = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const holidayInfo = holidays?.[dateKey];
      if (holidayInfo?.holiday === true) return;

      // 迟到
      const hasLate = daily.records?.some(r => r.checkType === 'OnDuty' && r.timeResult === 'Late');
      if (hasLate) weekdayData[weekday].late++;

      // 缺卡
      if (daily.status === 'incomplete') weekdayData[weekday].missing++;
    });
  });

  return [1, 2, 3, 4, 5].map(i => ({
    weekday: WEEKDAY_NAMES[i],
    weekdayIndex: i,
    lateCount: weekdayData[i].late,
    missingCount: weekdayData[i].missing,
    workdayCount: weekdayWorkdayCounts[i],
  }));
}

/**
 * 汇总请假类型占比
 */
export function calcLeaveTypeDistribution(
  employees: Array<{ user: DingTalkUser; stats: EmployeeStats }>
): LeaveTypeData[] {
  const totals: Record<string, number> = {
    '年假': 0, '病假': 0, '事假': 0, '调休': 0, '出差': 0,
    '丧假': 0, '陪产假': 0, '产假': 0, '育儿假': 0, '婚假': 0,
  };

  employees.forEach(({ stats }) => {
    totals['年假'] += stats.annualHours || 0;
    totals['病假'] += (stats.sickHours || 0) + (stats.seriousSickHours || 0);
    totals['事假'] += stats.personalHours || 0;
    totals['调休'] += stats.compTimeHours || 0;
    totals['出差'] += stats.tripHours || 0;
    totals['丧假'] += stats.bereavementHours || 0;
    totals['陪产假'] += stats.paternityHours || 0;
    totals['产假'] += stats.maternityHours || 0;
    totals['育儿假'] += stats.parentalHours || 0;
    totals['婚假'] += stats.marriageHours || 0;
  });

  return Object.entries(totals)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value: Math.round(value * 10) / 10,
      color: LEAVE_COLORS[name] || '#94a3b8',
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * 检测连续请假/缺勤（≥ threshold 天）
 */
export function detectConsecutiveAbsence(
  attendanceMap: AttendanceMap,
  processDataMap: Record<string, any>,
  holidays: HolidayMap,
  allUsers: DingTalkUser[],
  year: number,
  month: number,
  threshold: number = 3
): ConsecutiveAbsenceItem[] {
  const results: ConsecutiveAbsenceItem[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const userMap = new Map(allUsers.map(u => [u.userid, u]));

  Object.entries(attendanceMap).forEach(([userId, userDays]) => {
    const user = userMap.get(userId);
    if (!user) return;

    let streak = 0;
    let streakStart = 0;
    let streakType: 'leave' | 'absence' | null = null;

    const flushStreak = (endDay: number) => {
      if (streak >= threshold && streakType) {
        results.push({
          user,
          days: streak,
          startDate: `${month + 1}/${streakStart}`,
          endDate: `${month + 1}/${endDay}`,
          type: streakType,
        });
      }
      streak = 0;
      streakType = null;
    };

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const weekday = date.getDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const dateKey = `${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const holidayInfo = holidays?.[dateKey];
      let isWorkDay = !isWeekend;
      if (holidayInfo) {
        if (holidayInfo.holiday === false) isWorkDay = true;
        else if (holidayInfo.holiday === true) isWorkDay = false;
      }
      if (!isWorkDay) continue; // 跳过非工作日

      const daily = userDays[String(d)];
      if (!daily) {
        flushStreak(d - 1);
        continue;
      }

      // 判断是否全天请假
      const hasLeaveApproval = daily.records?.some(r => r.procInstId && processDataMap[r.procInstId]);
      // 判断是否缺勤（无有效打卡且无审批）
      const hasValidPunch = daily.records?.some(r => r.timeResult !== 'NotSigned');
      const isAbsent = !hasValidPunch && !hasLeaveApproval;
      const isOnLeave = hasLeaveApproval && !hasValidPunch;

      if (isOnLeave) {
        if (streakType === 'leave') {
          streak++;
        } else {
          flushStreak(d - 1);
          streak = 1;
          streakStart = d;
          streakType = 'leave';
        }
      } else if (isAbsent) {
        if (streakType === 'absence') {
          streak++;
        } else {
          flushStreak(d - 1);
          streak = 1;
          streakStart = d;
          streakType = 'absence';
        }
      } else {
        flushStreak(d - 1);
      }
    }
    flushStreak(daysInMonth);
  });

  return results.sort((a, b) => b.days - a.days);
}

/**
 * 加班合规统计
 */
export function calcOvertimeCompliance(
  employees: Array<{ user: DingTalkUser; stats: EmployeeStats }>
): OvertimeComplianceSummary {
  const items: OvertimeComplianceItem[] = employees.map(({ user, stats }) => {
    const hours = Math.round(((stats.overtimeTotalMinutes || 0) / 60) * 10) / 10;
    let status: 'ok' | 'warning' | 'danger' = 'ok';
    if (hours > 36) status = 'danger';
    else if (hours > 30) status = 'warning';
    return { user, hours, status };
  });

  return {
    okCount: items.filter(i => i.status === 'ok').length,
    warningCount: items.filter(i => i.status === 'warning').length,
    dangerCount: items.filter(i => i.status === 'danger').length,
    items: items.filter(i => i.hours > 0).sort((a, b) => b.hours - a.hours),
  };
}

/**
 * 筛选入职3个月内的新员工
 */
export function filterNewEmployees(
  employees: Array<{ user: DingTalkUser; stats: EmployeeStats }>,
  referenceDate?: Date
): Array<{ user: DingTalkUser; stats: EmployeeStats; daysSinceJoin: number }> {
  const ref = referenceDate || new Date();
  const threeMonthsAgo = new Date(ref);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return employees
    .filter(({ user }) => {
      const joinDate = user.hired_date ? new Date(user.hired_date) : new Date(user.create_time);
      return joinDate >= threeMonthsAgo;
    })
    .map(({ user, stats }) => {
      const joinDate = user.hired_date ? new Date(user.hired_date) : new Date(user.create_time);
      const daysSinceJoin = Math.floor((ref.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
      return { user, stats, daysSinceJoin };
    })
    .sort((a, b) => a.daysSinceJoin - b.daysSinceJoin);
}

/**
 * 跨公司指标计算
 */
export function calcCrossCompanyMetrics(
  companyEmployeeStats: Record<string, Array<{ user: DingTalkUser; stats: EmployeeStats }>>
): CrossCompanyMetric[] {
  return Object.entries(companyEmployeeStats)
    .filter(([company]) => company && company !== 'Unknown')
    .map(([company, employees]) => {
    const total = employees.length;
    if (total === 0) return { company, attendanceRate: 0, lateRate: 0, fullAttendanceRate: 0, avgLeaveHours: 0 };

    const lateCount = employees.filter(e => (e.stats.lateMinutes || 0) > 0).length;
    const fullCount = employees.filter(e => e.stats.isFullAttendance).length;
    const totalLeaveHours = employees.reduce((sum, e) => {
      return sum + (e.stats.personalHours || 0) + (e.stats.sickHours || 0) + (e.stats.annualHours || 0);
    }, 0);

    // 出勤率 = 平均(实际出勤天数/应出勤天数)
    const attendanceRates = employees.map(e => {
      const should = e.stats.shouldAttendanceDays || 1;
      const actual = e.stats.actualAttendanceDays || 0;
      return actual / should;
    });
    const avgAttendanceRate = attendanceRates.reduce((a, b) => a + b, 0) / total * 100;

    return {
      company,
      attendanceRate: Math.round(avgAttendanceRate * 10) / 10,
      lateRate: Math.round((lateCount / total) * 1000) / 10,
      fullAttendanceRate: Math.round((fullCount / total) * 1000) / 10,
      avgLeaveHours: Math.round((totalLeaveHours / total) * 10) / 10,
    };
  });
}

/**
 * 请假成本计算
 */
export function calcLeaveCost(
  stats: EmployeeStats,
  monthlySalary: number | null,
  shouldAttendanceDays?: number
): LeaveCostResult & { hourlyRate: number | null } {
  if (!monthlySalary || monthlySalary <= 0) {
    return { userId: '', name: '', monthlySalary: null, hourlyRate: null, personalCost: null, sickCost: null, annualCost: null, totalCost: null };
  }
  const days = shouldAttendanceDays || stats.shouldAttendanceDays || 22;
  const hourlyRate = monthlySalary / days / 8;
  const personalCost = (stats.personalHours || 0) * hourlyRate;
  const sickCost = ((stats.sickHours || 0) + (stats.seriousSickHours || 0)) * hourlyRate;
  const annualCost = (stats.annualHours || 0) * hourlyRate;
  const totalCost = personalCost + sickCost + annualCost;

  return {
    userId: '', name: '',
    monthlySalary,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    personalCost: Math.round(personalCost * 100) / 100,
    sickCost: Math.round(sickCost * 100) / 100,
    annualCost: Math.round(annualCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

// ============ localStorage 工具 ============

export function getSalaryFromStorage(userId: string, yearMonth: string): number | null {
  try {
    const key = `salary_${userId}_${yearMonth}`;
    const val = localStorage.getItem(key);
    return val ? parseFloat(val) : null;
  } catch { return null; }
}

export function setSalaryToStorage(userId: string, yearMonth: string, salary: number): void {
  try {
    localStorage.setItem(`salary_${userId}_${yearMonth}`, String(salary));
  } catch { /* ignore */ }
}
