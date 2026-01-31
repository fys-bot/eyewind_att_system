/**
 * 考勤规则配置 Hook
 * 从数据库加载规则配置，并提供给整个应用使用
 */

import { useState, useEffect, useCallback } from 'react';
import { attendanceRuleApiService, type CompanyId, type FullAttendanceRuleConfig } from '../services/attendanceRuleApiService';
import type { CompanyConfig, AttendanceRuleConfig } from '../database/schema';
import { DEFAULT_CONFIGS } from '../components/attendance/utils';

// 规则配置缓存
interface RuleConfigCache {
  eyewind: CompanyConfig | null;
  hydodo: CompanyConfig | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number;
  initialized: boolean; // 新增：标记是否已初始化
}

// 全局缓存（模块级别）
let globalRuleCache: RuleConfigCache = {
  eyewind: null,
  hydodo: null,
  loading: false,
  error: null,
  lastUpdated: 0,
  initialized: false, // 新增：初始化标志
};

// 缓存有效期（5分钟）
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 将数据库格式转换为前端格式
 */
function convertDbToFrontend(dbConfig: FullAttendanceRuleConfig, companyKey: 'eyewind' | 'hydodo'): CompanyConfig {
  const defaultConfig = DEFAULT_CONFIGS[companyKey];
  
  // 转换迟到规则
  const lateRules = (dbConfig.lateRules || []).map((r: any) => ({
    previousDayCheckoutTime: r.time_start?.replace(':00', '') || '18:00',
    lateThresholdTime: r.time_end?.replace(':00', '') || '09:01',
    description: r.description || ''
  }));

  // 转换绩效扣款规则
  const performancePenaltyRules = (dbConfig.penaltyRules || []).map((r: any) => ({
    minMinutes: r.min_value ?? 0,
    maxMinutes: r.max_value ?? 999,
    penalty: parseFloat(r.amount) || 0,
    description: r.description || ''
  }));

  // 转换全勤规则
  const fullAttendanceRules = (dbConfig.fullAttendRules || []).map((r: any) => ({
    type: r.rule_key || 'personal',
    displayName: r.rule_name || '',
    enabled: r.enabled ?? true,
    threshold: r.threshold_hours ?? 0,
    unit: r.unit || 'count'
  }));

  // 转换请假展示规则
  const leaveDisplayRules = (dbConfig.leaveDisplayRules || []).map((r: any) => ({
    leaveType: r.rule_key || '',
    shortTermHours: r.threshold_hours ?? 24,
    shortTermLabel: r.label_short || '',
    longTermLabel: r.label_long || ''
  }));

  // 转换跨天打卡规则
  const crossDayRules = (dbConfig.crossDayRules || []).map((r: any) => ({
    checkoutTime: r.time_start?.replace(':00', '') || '20:30',
    nextDayCheckinTime: r.time_end?.replace(':00', '') || '09:30',
    description: r.description || ''
  }));

  const rules: AttendanceRuleConfig = {
    workStartTime: dbConfig.work_start_time?.substring(0, 5) || defaultConfig.rules!.workStartTime,
    workEndTime: dbConfig.work_end_time?.substring(0, 5) || defaultConfig.rules!.workEndTime,
    lunchStartTime: dbConfig.lunch_start_time?.substring(0, 5) || defaultConfig.rules!.lunchStartTime,
    lunchEndTime: dbConfig.lunch_end_time?.substring(0, 5) || defaultConfig.rules!.lunchEndTime,

    lateRules: lateRules.length > 0 ? lateRules : defaultConfig.rules!.lateRules,
    lateExemptionCount: dbConfig.late_exemption_count ?? defaultConfig.rules!.lateExemptionCount,
    lateExemptionMinutes: dbConfig.late_exemption_minutes ?? defaultConfig.rules!.lateExemptionMinutes,
    lateExemptionEnabled: dbConfig.late_exemption_enabled ?? defaultConfig.rules!.lateExemptionEnabled,

    performancePenaltyMode: dbConfig.perf_penalty_mode || 'capped',
    unlimitedPenaltyThresholdTime: dbConfig.unlimited_threshold_time?.substring(0, 5) || '09:01',
    unlimitedPenaltyCalcType: dbConfig.unlimited_calc_type || 'perMinute',
    unlimitedPenaltyPerMinute: parseFloat(dbConfig.unlimited_per_minute as any) || 5,
    unlimitedPenaltyFixedAmount: parseFloat(dbConfig.unlimited_fixed_amount as any) || 50,
    cappedPenaltyType: dbConfig.capped_penalty_type || 'ladder',
    cappedPenaltyPerMinute: parseFloat(dbConfig.capped_per_minute as any) || 5,
    maxPerformancePenalty: parseFloat(dbConfig.max_perf_penalty as any) || 250,
    performancePenaltyRules: performancePenaltyRules.length > 0 ? performancePenaltyRules : defaultConfig.rules!.performancePenaltyRules,
    performancePenaltyEnabled: dbConfig.perf_penalty_enabled ?? defaultConfig.rules!.performancePenaltyEnabled,

    leaveDisplayRules: leaveDisplayRules.length > 0 ? leaveDisplayRules : defaultConfig.rules!.leaveDisplayRules,

    fullAttendanceBonus: parseFloat(dbConfig.full_attend_bonus as any) || defaultConfig.rules!.fullAttendanceBonus,
    fullAttendanceAllowAdjustment: dbConfig.full_attend_allow_adj ?? defaultConfig.rules!.fullAttendanceAllowAdjustment,
    fullAttendanceRules: fullAttendanceRules.length > 0 ? fullAttendanceRules : defaultConfig.rules!.fullAttendanceRules,
    fullAttendanceEnabled: dbConfig.full_attend_enabled ?? defaultConfig.rules!.fullAttendanceEnabled,

    attendanceDaysRules: {
      enabled: dbConfig.attend_days_enabled ?? true,
      shouldAttendanceCalcMethod: dbConfig.should_attend_calc || 'workdays',
      fixedShouldAttendanceDays: dbConfig.fixed_should_days ?? undefined,
      includeHolidaysInShould: dbConfig.include_holidays_in_should ?? true,
      actualAttendanceRules: {
        countLateAsAttendance: dbConfig.count_late_as_attend ?? true,
        countMissingAsAttendance: dbConfig.count_missing_as_attend ?? false,
        countHalfDayLeaveAsHalf: dbConfig.count_half_leave_as_half ?? true,
        minWorkHoursForFullDay: parseFloat(dbConfig.min_hours_for_full_day as any) || 4,
        countHolidayAsAttendance: dbConfig.count_holiday_as_attend ?? true,
        countCompTimeAsAttendance: dbConfig.count_comp_time_as_attend ?? true,
        countPaidLeaveAsAttendance: dbConfig.count_paid_leave_as_attend ?? true,
        countTripAsAttendance: dbConfig.count_trip_as_attend ?? true,
        countOutAsAttendance: dbConfig.count_out_as_attend ?? true,
        countSickLeaveAsAttendance: dbConfig.count_sick_as_attend ?? false,
        countPersonalLeaveAsAttendance: dbConfig.count_personal_as_attend ?? false
      }
    },

    workdaySwapRules: {
      enabled: dbConfig.workday_swap_enabled ?? true,
      autoFollowNationalHoliday: dbConfig.auto_follow_national ?? true,
      customDays: (dbConfig.swapDates || []).map((d: any) => ({
        date: d.target_date,
        type: d.swap_type || 'workday',
        reason: d.reason || ''
      }))
    },

    remoteWorkRules: {
      enabled: dbConfig.remote_work_enabled ?? true,
      requireApproval: dbConfig.remote_require_approval ?? false,
      countAsNormalAttendance: dbConfig.remote_count_as_attend ?? true,
      maxDaysPerMonth: dbConfig.remote_max_days_month ?? undefined,
      allowedDaysOfWeek: dbConfig.remote_allowed_weekdays || [1, 2, 3, 4, 5],
      remoteDays: (dbConfig.remoteDates || []).map((d: any) => ({
        date: d.target_date,
        reason: d.reason || '',
        timeMode: d.time_mode || 'day',
        startTime: d.start_time,
        endTime: d.end_time,
        scope: d.scope || 'all',
        departmentIds: d.scope_ids,
        userIds: d.scope_ids
      }))
    },

    overtimeCheckpoints: dbConfig.overtime_checkpoints || defaultConfig.rules!.overtimeCheckpoints,
    weekendOvertimeThreshold: dbConfig.weekend_overtime_threshold ?? defaultConfig.rules!.weekendOvertimeThreshold,

    crossDayCheckout: {
      enabled: dbConfig.cross_day_enabled ?? false,
      rules: crossDayRules,
      maxCheckoutTime: dbConfig.cross_day_max_checkout?.substring(0, 5) || '24:00',
      nextDayCheckinTime: dbConfig.cross_day_next_checkin?.substring(0, 5) || '13:30'
    }
  };

  return {
    ...defaultConfig,
    rules
  };
}

/**
 * 从数据库加载规则配置
 */
async function loadRuleConfigFromDb(companyId: CompanyId): Promise<CompanyConfig | null> {
  try {
    const dbConfig = await attendanceRuleApiService.getFullConfig(companyId, true);
    if (dbConfig) {
      return convertDbToFrontend(dbConfig, companyId);
    }
    return null;
  } catch (error) {
    console.error(`[loadRuleConfigFromDb] 加载 ${companyId} 配置失败:`, error);
    return null;
  }
}

/**
 * 获取规则配置（同步方法，从缓存获取）
 * 如果缓存为空，返回默认配置
 */
export function getRuleConfigSync(companyKey: string): CompanyConfig {
  const key = (companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind';
  const cached = globalRuleCache[key];
  
  if (cached) {
    return cached;
  }
  
  // 返回默认配置
  return DEFAULT_CONFIGS[key];
}

/**
 * 刷新规则配置缓存
 */
export async function refreshRuleConfigCache(companyKey?: string): Promise<void> {
  // 防止并发调用
  if (globalRuleCache.loading) {
    console.log('[refreshRuleConfigCache] 正在加载中，跳过重复调用');
    return;
  }

  const companies: CompanyId[] = companyKey 
    ? [(companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind']
    : ['eyewind', 'hydodo'];

  console.log(`[refreshRuleConfigCache] 开始刷新规则配置缓存: ${companies.join(', ')}`);
  
  globalRuleCache.loading = true;
  globalRuleCache.error = null;

  try {
    for (const company of companies) {
      const config = await loadRuleConfigFromDb(company);
      if (config) {
        globalRuleCache[company] = config;
        console.log(`[refreshRuleConfigCache] 已从数据库加载 ${company} 配置, fixed_should_days:`, config.rules?.attendanceDaysRules?.fixedShouldAttendanceDays);
      }
    }
    globalRuleCache.lastUpdated = Date.now();
  } catch (error) {
    globalRuleCache.error = String(error);
    console.error('[refreshRuleConfigCache] 刷新缓存失败:', error);
  } finally {
    globalRuleCache.loading = false;
  }
}

/**
 * 初始化规则配置（应用启动时调用）
 */
export async function initRuleConfigCache(): Promise<void> {
  // 如果已经初始化过，直接返回
  if (globalRuleCache.initialized) {
    console.log('[initRuleConfigCache] 已经初始化过，跳过');
    return;
  }
  
  // 如果缓存有效，标记为已初始化并返回
  if (globalRuleCache.lastUpdated > 0 && Date.now() - globalRuleCache.lastUpdated < CACHE_TTL) {
    console.log('[initRuleConfigCache] 缓存仍然有效，标记为已初始化');
    globalRuleCache.initialized = true;
    return;
  }
  
  // 如果正在加载中，等待加载完成
  if (globalRuleCache.loading) {
    console.log('[initRuleConfigCache] 正在加载中，等待完成...');
    // 等待加载完成
    while (globalRuleCache.loading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }
  
  console.log('[initRuleConfigCache] 开始初始化规则配置缓存');
  await refreshRuleConfigCache();
  globalRuleCache.initialized = true;
}

/**
 * React Hook: 使用考勤规则配置
 */
export function useAttendanceRuleConfig(companyKey: string) {
  const key = (companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind';
  const [config, setConfig] = useState<CompanyConfig>(getRuleConfigSync(companyKey));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshRuleConfigCache(companyKey);
      setConfig(getRuleConfigSync(companyKey));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [companyKey]);

  useEffect(() => {
    // 首次加载时，如果缓存为空或过期，从数据库加载
    const cached = globalRuleCache[key];
    const isCacheValid = cached && Date.now() - globalRuleCache.lastUpdated < CACHE_TTL;
    
    // 只有在未初始化且缓存无效时才加载
    if (!globalRuleCache.initialized && !isCacheValid && !globalRuleCache.loading) {
      console.log(`[useAttendanceRuleConfig] 缓存无效或为空，开始加载 ${companyKey} 规则配置`);
      refresh();
    } else if (cached) {
      console.log(`[useAttendanceRuleConfig] 使用缓存的 ${companyKey} 规则配置`);
      setConfig(cached);
    }

    // 监听规则更新事件
    const handleRulesUpdated = (event: CustomEvent) => {
      const eventCompanyKey = event.detail?.companyKey;
      if (eventCompanyKey === key || eventCompanyKey === companyKey) {
        console.log(`[useAttendanceRuleConfig] 收到规则更新事件，刷新 ${companyKey} 配置`);
        refresh();
      }
    };

    window.addEventListener('attendanceRulesUpdated', handleRulesUpdated as EventListener);
    return () => {
      window.removeEventListener('attendanceRulesUpdated', handleRulesUpdated as EventListener);
    };
  }, [key, companyKey, refresh]);

  return { config, loading, error, refresh };
}

export default useAttendanceRuleConfig;
