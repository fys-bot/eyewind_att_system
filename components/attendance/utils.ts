
import type { PunchRecord, DingTalkUser, CompanyCounts, CompanyConfig, AttendanceRuleConfig, LateRule, PerformancePenaltyRule, FullAttendanceRule, LeaveDisplayRule } from '../../database/schema.ts';
import { attendanceRuleApiService, type FullAttendanceRuleConfig, type AttRuleDetail, type CompanyId } from '../../services/attendanceRuleApiService.ts';

// --- Configuration Management ---
const CACHE_PREFIX = 'LINGOSYNC_CACHE_';
const CONFIG_KEY = 'COMPANY_CONFIGS';
const DB_RULE_CACHE_PREFIX = 'DB_RULE_CONFIG_';

export const DEFAULT_CONFIGS: Record<string, CompanyConfig> = {
    eyewind: {
        appkey: 'ding3hfhrwlg5o2v9fih',
        appsecret: 'DP3lexEcc62pYYAStOaPk7KogqXeerlXcgGsFewpGfntJLomIs6ojJC154R-9ucn',
        agent_id: '3097072449',
        rules: {
            workStartTime: "09:00",
            workEndTime: "18:30",
            lunchStartTime: "12:00",
            lunchEndTime: "13:30",
            lateRules: [
                {
                    previousDayCheckoutTime: "18:30",
                    lateThresholdTime: "09:01",
                    description: "前一天18:30打卡，9:01算迟到"
                },
                {
                    previousDayCheckoutTime: "20:30",
                    lateThresholdTime: "09:31",
                    description: "前一天20:30打卡，9:31算迟到"
                },
                {
                    previousDayCheckoutTime: "24:00",
                    lateThresholdTime: "13:31",
                    description: "前一天24:00打卡，13:31算迟到"
                }
            ],
            lateExemptionCount: 3,
            lateExemptionMinutes: 15,
            lateExemptionEnabled: true,
            performancePenaltyMode: 'capped', // 封顶模式
            unlimitedPenaltyThresholdTime: '09:01', // 上不封顶模式：超过9:01开始扣款
            unlimitedPenaltyCalcType: 'perMinute', // 按分钟计算
            unlimitedPenaltyPerMinute: 5, // 每分钟5元
            unlimitedPenaltyFixedAmount: 50, // 固定扣款50元
            cappedPenaltyType: 'ladder', // 封顶模式子类型：阶梯扣款
            cappedPenaltyPerMinute: 5, // 固定封顶模式：每分钟5元
            maxPerformancePenalty: 250,
            performancePenaltyRules: [
                {
                    minMinutes: 0,
                    maxMinutes: 5,
                    penalty: 50,
                    description: "0-5分钟扣50元"
                },
                {
                    minMinutes: 5,
                    maxMinutes: 15,
                    penalty: 100,
                    description: "5-15分钟扣100元"
                },
                {
                    minMinutes: 15,
                    maxMinutes: 30,
                    penalty: 150,
                    description: "15-30分钟扣150元"
                },
                {
                    minMinutes: 30,
                    maxMinutes: 45,
                    penalty: 200,
                    description: "30-45分钟扣200元"
                },
                {
                    minMinutes: 45,
                    maxMinutes: 999,
                    penalty: 250,
                    description: "大于45分钟扣250元"
                }
            ],
            performancePenaltyEnabled: true, // 启用绩效考核功能
            leaveDisplayRules: [
                {
                    leaveType: "病假",
                    shortTermHours: 24,
                    shortTermLabel: "病假<=24小时",
                    longTermLabel: "病假>24小时"
                }
            ],
            fullAttendanceBonus: 200,
            fullAttendanceAllowAdjustment: true,
            fullAttendanceEnabled: true, // 启用全勤功能
            fullAttendanceRules: [
                { type: 'trip', displayName: '出差', enabled: false, threshold: 0, unit: 'hours' },
                { type: 'compTime', displayName: '调休', enabled: false, threshold: 0, unit: 'hours' },
                { type: 'late', displayName: '迟到', enabled: true, threshold: 0, unit: 'count' },
                { type: 'missing', displayName: '缺卡', enabled: true, threshold: 0, unit: 'count' },
                { type: 'absenteeism', displayName: '旷工', enabled: true, threshold: 0, unit: 'count' },
                { type: 'annual', displayName: '年假', enabled: true, threshold: 0, unit: 'hours' },
                { type: 'sick', displayName: '病假', enabled: true, threshold: 0, unit: 'hours' },
                { type: 'personal', displayName: '事假', enabled: true, threshold: 0, unit: 'hours' },
                { type: 'bereavement', displayName: '丧假', enabled: true, threshold: 0, unit: 'hours' },
                { type: 'paternity', displayName: '陪产假', enabled: true, threshold: 0, unit: 'hours' },
                { type: 'maternity', displayName: '产假', enabled: true, threshold: 0, unit: 'hours' },
                { type: 'parental', displayName: '育儿假', enabled: true, threshold: 0, unit: 'hours' },
                { type: 'marriage', displayName: '婚假', enabled: true, threshold: 0, unit: 'hours' }
            ],
            overtimeCheckpoints: ["19:30", "20:30", "22:00", "24:00"],
            weekendOvertimeThreshold: 8,
            attendanceDaysRules: {
                enabled: true,
                shouldAttendanceCalcMethod: 'workdays',
                includeHolidaysInShould: true, // 应出勤天数包含法定节假日
                actualAttendanceRules: {
                    countLateAsAttendance: true,
                    countMissingAsAttendance: false,
                    countHalfDayLeaveAsHalf: true,
                    minWorkHoursForFullDay: 4,
                    // 以下类型算正常出勤
                    countHolidayAsAttendance: true, // 法定节假日算出勤
                    countCompTimeAsAttendance: true, // 调休算出勤
                    countPaidLeaveAsAttendance: true, // 带薪福利假算出勤
                    countTripAsAttendance: true, // 出差算出勤
                    countOutAsAttendance: true, // 外出算出勤
                    // 以下类型不算正常出勤
                    countSickLeaveAsAttendance: false, // 病假不算出勤
                    countPersonalLeaveAsAttendance: false // 事假不算出勤
                }
            },
            workdaySwapRules: {
                enabled: true,
                autoFollowNationalHoliday: true,
                customDays: []
            },
            remoteWorkRules: {
                enabled: true,
                requireApproval: false,
                countAsNormalAttendance: true,
                allowedDaysOfWeek: [1, 2, 3, 4, 5],
                remoteDays: []
            },
            crossDayCheckout: {
                enabled: true,
                rules: [
                    {
                        checkoutTime: "20:30",
                        nextDayCheckinTime: "09:30", 
                        description: "晚上8点半打卡，第二天可以早上9点半打卡"
                    }
                ],
                maxCheckoutTime: "24:00",
                nextDayCheckinTime: "13:30"
            }
        }
    },
    hydodo: {
        appkey: 'dingwc2n7wi2fsznv7zz',
        appsecret: 'EmBdzIYhaLhgUz5g0szAxkNUHQoB2CLKJrS-YKdIKx1hy56KVQq7atbu6FC9hqV8',
        agent_id: '4066062115',
        rules: {
            workStartTime: "09:10",
            workEndTime: "19:00",
            lunchStartTime: "12:00",
            lunchEndTime: "13:30",
            lateRules: [], // 空数组，不设置迟到规则
            lateExemptionCount: 0, // 不设置豁免
            lateExemptionMinutes: 0, // 不设置豁免时长
            lateExemptionEnabled: true, // 启用豁免功能
            performancePenaltyMode: 'capped', // 封顶模式
            unlimitedPenaltyThresholdTime: '09:11', // 上不封顶模式：超过9:11开始扣款
            unlimitedPenaltyCalcType: 'perMinute', // 按分钟计算
            unlimitedPenaltyPerMinute: 5, // 每分钟5元
            unlimitedPenaltyFixedAmount: 50, // 固定扣款50元
            cappedPenaltyType: 'ladder', // 封顶模式子类型：阶梯扣款
            cappedPenaltyPerMinute: 5, // 固定封顶模式：每分钟5元
            maxPerformancePenalty: 0, // 不设置绩效扣款
            performancePenaltyRules: [], // 海多多不设置绩效扣款规则
            performancePenaltyEnabled: true, // 启用绩效考核功能
            leaveDisplayRules: [], // 空数组，不设置请假展示规则
            fullAttendanceBonus: 0, // 不设置全勤奖
            fullAttendanceAllowAdjustment: false, // 不允许调休算全勤
            fullAttendanceEnabled: true, // 启用全勤功能
            fullAttendanceRules: [], // 海多多不设置全勤规则
            overtimeCheckpoints: ["19:30", "20:30", "22:00", "24:00"], // 与风眼相同的加班统计节点
            weekendOvertimeThreshold: 8, // 设置周末加班阈值，与风眼相同
            attendanceDaysRules: {
                enabled: true,
                shouldAttendanceCalcMethod: 'workdays',
                includeHolidaysInShould: true, // 应出勤天数包含法定节假日
                actualAttendanceRules: {
                    countLateAsAttendance: true,
                    countMissingAsAttendance: false,
                    countHalfDayLeaveAsHalf: true,
                    minWorkHoursForFullDay: 4,
                    countHolidayAsAttendance: true,
                    countCompTimeAsAttendance: true,
                    countPaidLeaveAsAttendance: true,
                    countTripAsAttendance: true,
                    countOutAsAttendance: true,
                    countSickLeaveAsAttendance: false,
                    countPersonalLeaveAsAttendance: false
                }
            },
            workdaySwapRules: {
                enabled: true,
                autoFollowNationalHoliday: true,
                customDays: []
            },
            remoteWorkRules: {
                enabled: true,
                requireApproval: false,
                countAsNormalAttendance: true,
                allowedDaysOfWeek: [1, 2, 3, 4, 5],
                remoteDays: []
            },
            crossDayCheckout: {
                enabled: false, // 禁用跨天打卡
                rules: [], // 空数组，不设置跨天规则
                maxCheckoutTime: "24:00",
                nextDayCheckinTime: "13:30"
            }
        }
    }
};

/**
 * 将数据库格式的规则配置转换为前端格式
 */
function convertDbConfigToFrontend(dbConfig: FullAttendanceRuleConfig, companyKey: string): CompanyConfig | null {
    try {
        const defaultConfig = DEFAULT_CONFIGS[companyKey as 'eyewind' | 'hydodo'];
        if (!defaultConfig) return null;

        // 转换迟到规则
        const lateRules: LateRule[] = (dbConfig.lateRules || []).map((r: AttRuleDetail) => ({
            previousDayCheckoutTime: r.time_start || '18:00',
            lateThresholdTime: r.time_end || '09:01',
            description: r.description || ''
        }));

        // 转换绩效扣款规则
        const performancePenaltyRules: PerformancePenaltyRule[] = (dbConfig.penaltyRules || []).map((r: AttRuleDetail) => ({
            minMinutes: r.min_value ?? 0,
            maxMinutes: r.max_value ?? 999,
            penalty: r.amount ?? 0,
            description: r.description || ''
        }));

        // 转换全勤规则
        const fullAttendanceRules: FullAttendanceRule[] = (dbConfig.fullAttendRules || []).map((r: AttRuleDetail) => ({
            type: (r.rule_key || 'personal') as FullAttendanceRule['type'],
            displayName: r.rule_name || '',
            enabled: r.enabled ?? true,
            threshold: r.threshold_hours ?? 0,
            unit: (r.unit || 'count') as 'count' | 'hours'
        }));

        // 转换请假展示规则
        const leaveDisplayRules: LeaveDisplayRule[] = (dbConfig.leaveDisplayRules || []).map((r: AttRuleDetail) => ({
            leaveType: r.rule_key || '',
            shortTermHours: r.threshold_hours ?? 24,
            shortTermLabel: r.label_short || '',
            longTermLabel: r.label_long || ''
        }));

        // 转换跨天打卡规则
        const crossDayRules = (dbConfig.crossDayRules || []).map((r: AttRuleDetail) => ({
            checkoutTime: r.time_start || '20:30',
            nextDayCheckinTime: r.time_end || '09:30',
            description: r.description || ''
        }));

        // 构建完整的规则配置
        const rules: AttendanceRuleConfig = {
            // 基础作息时间
            workStartTime: dbConfig.work_start_time || defaultConfig.rules!.workStartTime,
            workEndTime: dbConfig.work_end_time || defaultConfig.rules!.workEndTime,
            lunchStartTime: dbConfig.lunch_start_time || defaultConfig.rules!.lunchStartTime,
            lunchEndTime: dbConfig.lunch_end_time || defaultConfig.rules!.lunchEndTime,

            // 迟到规则
            lateRules: lateRules.length > 0 ? lateRules : defaultConfig.rules!.lateRules,
            lateExemptionCount: dbConfig.late_exemption_count ?? defaultConfig.rules!.lateExemptionCount,
            lateExemptionMinutes: dbConfig.late_exemption_minutes ?? defaultConfig.rules!.lateExemptionMinutes,
            lateExemptionEnabled: dbConfig.late_exemption_enabled ?? defaultConfig.rules!.lateExemptionEnabled,

            // 绩效扣款规则
            performancePenaltyMode: dbConfig.perf_penalty_mode || 'capped',
            unlimitedPenaltyThresholdTime: dbConfig.unlimited_threshold_time || '09:01',
            unlimitedPenaltyCalcType: dbConfig.unlimited_calc_type || 'perMinute',
            unlimitedPenaltyPerMinute: dbConfig.unlimited_per_minute ?? 5,
            unlimitedPenaltyFixedAmount: dbConfig.unlimited_fixed_amount ?? 50,
            cappedPenaltyType: dbConfig.capped_penalty_type || 'ladder',
            cappedPenaltyPerMinute: dbConfig.capped_per_minute ?? 5,
            maxPerformancePenalty: dbConfig.max_perf_penalty ?? 250,
            performancePenaltyRules: performancePenaltyRules.length > 0 ? performancePenaltyRules : defaultConfig.rules!.performancePenaltyRules,
            performancePenaltyEnabled: dbConfig.perf_penalty_enabled ?? defaultConfig.rules!.performancePenaltyEnabled,

            // 请假规则
            leaveDisplayRules: leaveDisplayRules.length > 0 ? leaveDisplayRules : defaultConfig.rules!.leaveDisplayRules,

            // 全勤规则
            fullAttendanceBonus: dbConfig.full_attend_bonus ?? defaultConfig.rules!.fullAttendanceBonus,
            fullAttendanceAllowAdjustment: dbConfig.full_attend_allow_adj ?? defaultConfig.rules!.fullAttendanceAllowAdjustment,
            fullAttendanceRules: fullAttendanceRules.length > 0 ? fullAttendanceRules : defaultConfig.rules!.fullAttendanceRules,
            fullAttendanceEnabled: dbConfig.full_attend_enabled ?? defaultConfig.rules!.fullAttendanceEnabled,

            // 出勤天数规则
            attendanceDaysRules: {
                enabled: dbConfig.attend_days_enabled ?? defaultConfig.rules!.attendanceDaysRules.enabled,
                shouldAttendanceCalcMethod: dbConfig.should_attend_calc || 'workdays',
                fixedShouldAttendanceDays: dbConfig.fixed_should_days ?? undefined,
                includeHolidaysInShould: dbConfig.include_holidays_in_should ?? true,
                actualAttendanceRules: {
                    countLateAsAttendance: dbConfig.count_late_as_attend ?? true,
                    countMissingAsAttendance: dbConfig.count_missing_as_attend ?? false,
                    countHalfDayLeaveAsHalf: dbConfig.count_half_leave_as_half ?? true,
                    minWorkHoursForFullDay: dbConfig.min_hours_for_full_day ?? 4,
                    countHolidayAsAttendance: dbConfig.count_holiday_as_attend ?? true,
                    countCompTimeAsAttendance: dbConfig.count_comp_time_as_attend ?? true,
                    countPaidLeaveAsAttendance: dbConfig.count_paid_leave_as_attend ?? true,
                    countTripAsAttendance: dbConfig.count_trip_as_attend ?? true,
                    countOutAsAttendance: dbConfig.count_out_as_attend ?? true,
                    countSickLeaveAsAttendance: dbConfig.count_sick_as_attend ?? false,
                    countPersonalLeaveAsAttendance: dbConfig.count_personal_as_attend ?? false
                }
            },

            // 法定调班规则
            workdaySwapRules: {
                enabled: dbConfig.workday_swap_enabled ?? true,
                autoFollowNationalHoliday: dbConfig.auto_follow_national ?? true,
                customDays: (dbConfig.swapDates || []).map((d: any) => ({
                    date: d.target_date,
                    type: d.swap_type || 'workday',
                    reason: d.reason || ''
                }))
            },

            // 居家办公规则
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

            // 加班规则
            overtimeCheckpoints: dbConfig.overtime_checkpoints || defaultConfig.rules!.overtimeCheckpoints,
            weekendOvertimeThreshold: dbConfig.weekend_overtime_threshold ?? defaultConfig.rules!.weekendOvertimeThreshold,

            // 跨天打卡规则
            crossDayCheckout: {
                enabled: dbConfig.cross_day_enabled ?? false,
                rules: crossDayRules,
                maxCheckoutTime: dbConfig.cross_day_max_checkout || '24:00',
                nextDayCheckinTime: dbConfig.cross_day_next_checkin || '13:30'
            }
        };

        return {
            ...defaultConfig,
            rules
        };
    } catch (e) {
        console.error('[convertDbConfigToFrontend] 转换失败:', e);
        return null;
    }
}

/**
 * 异步获取公司配置（优先从数据库加载）
 * 这是推荐使用的方法，会先尝试从数据库获取最新配置
 */
export async function getAppConfigAsync(companyKey: string, forceRefresh = false): Promise<CompanyConfig> {
    const key = (companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind';
    const dbCacheKey = `${DB_RULE_CACHE_PREFIX}${key}`;

    try {
        // 尝试从数据库 API 获取配置
        const dbConfig = await attendanceRuleApiService.getFullConfig(key as CompanyId, forceRefresh);
        
        if (dbConfig) {
            // 缓存到 localStorage
            localStorage.setItem(dbCacheKey, JSON.stringify(dbConfig));
            
            // 转换为前端格式
            const converted = convertDbConfigToFrontend(dbConfig, key);
            if (converted) {
                console.log(`[getAppConfigAsync] 成功从数据库加载 ${key} 配置`);
                return converted;
            }
        }
    } catch (e) {
        console.warn(`[getAppConfigAsync] 从数据库加载配置失败，降级到本地缓存:`, e);
    }

    // 降级到同步方法
    return getAppConfig(companyKey);
}

/**
 * 刷新数据库规则缓存
 * 在规则保存后调用，确保所有组件使用最新规则
 */
export async function refreshDbRuleCache(companyKey: string): Promise<void> {
    const key = (companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind';
    
    try {
        // 清除 API 服务的内存缓存
        attendanceRuleApiService.clearCache(key as CompanyId);
        
        // 强制从数据库重新加载
        await getAppConfigAsync(companyKey, true);
        
        console.log(`[refreshDbRuleCache] 已刷新 ${key} 的规则缓存`);
    } catch (e) {
        console.error(`[refreshDbRuleCache] 刷新缓存失败:`, e);
    }
}

/**
 * 获取默认月份
 * 规则: 如果当前日期是1-5号，返回上个月；否则返回这个月。
 * 格式: YYYY-MM
 */
export function getDefaultMonth(): string {
    const now = new Date();
    const day = now.getDate();
    
    // 如果是1-5号，回退到上个月
    if (day <= 5) {
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const y = prevMonth.getFullYear();
        const m = String(prevMonth.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    } else {
        // 否则显示当前月
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }
}

/**
 * 获取默认月份对应的日期范围
 * 用于列表数据拉取，确保上下文统一
 */
export function getDateRangeForDefaultMonth(): { fromDate: string, toDate: string, monthStr: string; year: number; month: number } {
    const monthStr = getDefaultMonth();
    const [y, m] = monthStr.split('-').map(Number);
    
    // fromDate is the 1st of the month
    const fromDate = `${monthStr}-01`;
    
    // toDate should be the LAST day of the current month (e.g. 30th or 31st)
    // new Date(year, monthIndex + 1, 0) gives the last day of the previous month index.
    // 'm' is 1-based (1=Jan), so 'm' as monthIndex gives next month's 0th day relative to 0-based index.
    // Example: monthStr="2025-12", m=12. Date(2025, 12, 0) -> Jan 0th 2026 -> Dec 31st 2025.
    const lastDayDate = new Date(y, m, 0);
    const lastDay = lastDayDate.getDate();
    const toDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

    return { fromDate, toDate, monthStr, year: y, month: m };
}

/**
 * 获取公司配置（优先从缓存读取，否则使用默认值）
 * 注意：这是同步函数，用于兼容旧代码。新代码应使用 getAppConfigAsync
 */
export function getAppConfig(companyKey: string): CompanyConfig {
    // 首先检查是否有从数据库加载的规则缓存
    const normalizedKey = (companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind';
    const dbCacheKey = `DB_RULE_CONFIG_${normalizedKey}`;
    const dbCached = localStorage.getItem(dbCacheKey);
    
    if (dbCached) {
        try {
            const dbConfig = JSON.parse(dbCached);
            // 将数据库格式转换为前端格式
            const converted = convertDbConfigToFrontend(dbConfig, normalizedKey);
            if (converted) {
                return converted;
            }
        } catch (e) {
            console.error("[getAppConfig] 解析数据库缓存失败:", e);
        }
    }
    
    // 降级到本地存储
    try {
        const stored = localStorage.getItem(CONFIG_KEY);
        if (stored) {
            const configs = JSON.parse(stored);
            if (configs[normalizedKey]) {
                const merged = { ...DEFAULT_CONFIGS[normalizedKey], ...configs[normalizedKey] };
                // Ensure rules exist even if loaded from old config
                if (!merged.rules) merged.rules = DEFAULT_CONFIGS[normalizedKey].rules;
                // Deep merge rules to ensure all fields exist
                if (merged.rules) {
                    merged.rules = { ...DEFAULT_CONFIGS[normalizedKey].rules, ...merged.rules };
                    // Ensure maxPerformancePenalty exists in case of old data
                    if (merged.rules.maxPerformancePenalty === undefined) merged.rules.maxPerformancePenalty = 250;
                    // Ensure performancePenaltyRules exists in case of old data
                    if (!merged.rules.performancePenaltyRules) merged.rules.performancePenaltyRules = DEFAULT_CONFIGS[normalizedKey].rules!.performancePenaltyRules;
                    // Ensure fullAttendanceRules exists in case of old data
                    if (!merged.rules.fullAttendanceRules) merged.rules.fullAttendanceRules = DEFAULT_CONFIGS[normalizedKey].rules!.fullAttendanceRules;
                    // Ensure lateExemptionEnabled exists in case of old data
                    if (merged.rules.lateExemptionEnabled === undefined) merged.rules.lateExemptionEnabled = DEFAULT_CONFIGS[normalizedKey].rules!.lateExemptionEnabled;
                    // Ensure fullAttendanceEnabled exists in case of old data
                    if (merged.rules.fullAttendanceEnabled === undefined) merged.rules.fullAttendanceEnabled = DEFAULT_CONFIGS[normalizedKey].rules!.fullAttendanceEnabled;
                    // Ensure performancePenaltyEnabled exists in case of old data
                    if (merged.rules.performancePenaltyEnabled === undefined) merged.rules.performancePenaltyEnabled = DEFAULT_CONFIGS[normalizedKey].rules!.performancePenaltyEnabled;
                    // Ensure performancePenaltyMode exists in case of old data
                    if (merged.rules.performancePenaltyMode === undefined) merged.rules.performancePenaltyMode = 'capped';
                    if (merged.rules.unlimitedPenaltyThresholdTime === undefined) merged.rules.unlimitedPenaltyThresholdTime = '09:01';
                    if (merged.rules.unlimitedPenaltyCalcType === undefined) merged.rules.unlimitedPenaltyCalcType = 'perMinute';
                    if (merged.rules.unlimitedPenaltyPerMinute === undefined) merged.rules.unlimitedPenaltyPerMinute = 5;
                    if (merged.rules.unlimitedPenaltyFixedAmount === undefined) merged.rules.unlimitedPenaltyFixedAmount = 50;
                    // Ensure cappedPenaltyType exists in case of old data
                    if (merged.rules.cappedPenaltyType === undefined) merged.rules.cappedPenaltyType = 'ladder';
                    if (merged.rules.cappedPenaltyPerMinute === undefined) merged.rules.cappedPenaltyPerMinute = 5;
                }
                return merged;
            }
        }
    } catch (e) {
        console.error("Error reading company config", e);
    }
    return DEFAULT_CONFIGS[normalizedKey];
}

// 每天的固定更新时间点 (HH:mm)
const AUTO_REFRESH_TIMEPOINTS = [
    { h: 0, m: 30 }, // 24:30 (next day 00:30)
    { h: 9, m: 0 },
    { h: 9, m: 30 },
    { h: 18, m: 35 },
    { h: 20, m: 35 }
];

// --- IndexedDB Adapter for Large Data ---
const DB_NAME = 'LingoSyncDB';
const STORE_NAME = 'smart_cache';
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
        request.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });
};

export class SmartCache {
    /**
     * 判断缓存是否过期
     * 逻辑：如果当前时间与上次缓存时间之间跨越了任意一个“刷新时间点”，则视为过期。
     */
    static isExpired(lastUpdated: number): boolean {
        if (!lastUpdated) return true;
        const now = new Date();

        const getNextRefreshPoint = (fromTime: number): number => {
            const date = new Date(fromTime);
            // 找到当天所有时间点的时间戳
            const points = AUTO_REFRESH_TIMEPOINTS.map(tp => {
                const p = new Date(date);
                p.setHours(tp.h, tp.m, 0, 0);
                return p.getTime();
            }).sort((a, b) => a - b);

            // 找到第一个大于 fromTime 的点
            const nextPoint = points.find(p => p > fromTime);

            if (nextPoint) return nextPoint;

            // 如果当天都过了，找第二天的第一个点 (00:30)
            const tomorrow = new Date(date);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(AUTO_REFRESH_TIMEPOINTS[0].h, AUTO_REFRESH_TIMEPOINTS[0].m, 0, 0);
            return tomorrow.getTime();
        };

        const nextRefresh = getNextRefreshPoint(lastUpdated);
        return now.getTime() >= nextRefresh;
    }

    static async get<T>(key: string): Promise<T | null> {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(CACHE_PREFIX + key);
                
                request.onsuccess = () => {
                    const item = request.result;
                    if (!item || !item.timestamp || !item.data) {
                        resolve(null);
                        return;
                    }

                    if (this.isExpired(item.timestamp)) {
                        resolve(null);
                        return;
                    }
                    resolve(item.data as T);
                };
                request.onerror = () => {
                    console.warn(`[SmartCache] Failed to read ${key}`);
                    resolve(null);
                };
            });
        } catch (e) {
            console.error('[SmartCache] Error reading cache', e);
            return null;
        }
    }

    static async set(key: string, data: any) {
        try {
            const db = await openDB();
            const item = {
                data,
                timestamp: Date.now()
            };
            return new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(item, CACHE_PREFIX + key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('[SmartCache] Error writing cache', e);
        }
    }

    static async remove(key: string) {
        try {
            const db = await openDB();
            return new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(CACHE_PREFIX + key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('[SmartCache] Error removing cache', e);
        }
    }
}

// --- Token 管理器 (Updated to use localStorage) ---
type CompanyKey = 'eyewind' | 'hydodo';

class DingTalkTokenManager {
    private refreshTimers: Record<string, any> = {};

    async getToken(company: string, forceRefresh = false): Promise<string> {
        const key = (company === '海多多' || company === 'hydodo') ? 'hydodo' : 'eyewind';
        const cacheKey = `TOKEN_${key}`;

        const config = getAppConfig(key);
        if (config.token && config.token.length > 50) {
            // Manual token override could be handled here
        }

        if (!forceRefresh) {
            const itemStr = localStorage.getItem(CACHE_PREFIX + cacheKey);
            if (itemStr) {
                const item = JSON.parse(itemStr);
                if (item.data && item.expiresAt && Date.now() < item.expiresAt) {
                    return item.data;
                }
            }
        }

        return await this.fetchAndCacheToken(key as CompanyKey, cacheKey);
    }

    private async fetchAndCacheToken(company: CompanyKey, cacheKey: string): Promise<string> {
        try {
            const config = getAppConfig(company);
            if (!config) throw new Error(`Unknown company config for: ${company}`);

            if (this.refreshTimers[company]) clearTimeout(this.refreshTimers[company]);

            const response = await fetch("https://sg.api.eyewind.cn/etl/dingding/gettoken", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    appkey: config.appkey,
                    appsecret: config.appsecret
                }),
            });

            if (!response.ok) throw new Error(`获取 ${company} Token 失败: ${response.status}`);

            const data = await response.json();
            const token = data?.data?.access_token;
            const expiresIn = data?.data?.expires_in || 7200;

            if (!token) throw new Error(`响应中未包含 access_token`);

            const cachePayload = {
                data: token,
                timestamp: Date.now(),
                expiresAt: Date.now() + (expiresIn * 1000) - (10 * 60 * 1000) // Buffer 10 mins
            };
            localStorage.setItem(CACHE_PREFIX + cacheKey, JSON.stringify(cachePayload));

            return token;
        } catch (error) {
            console.error(`[DingTalkTokenManager] Error fetching token for ${company}:`, error);
            throw error;
        }
    }
}

export const dingTalkTokenManager = new DingTalkTokenManager();

// --- 业务辅助函数 ---

export const isFullDayLeave = (processData: any, mainCompany?: string): boolean => {
    if (!processData || !processData.formValues) return false;
    const { duration, durationUnit, unit } = processData.formValues;
    const d = parseFloat(duration);
    if (isNaN(d)) return false;

    const u = durationUnit || unit || '';
    if (u.includes('day') || u.includes('天')) return d >= 1;
    // 使用配置判断，而不是写死
    const companyKey = (mainCompany?.includes('海多多') || mainCompany === 'hydodo') ? 'hydodo' : 'eyewind';
    const config = getAppConfig(companyKey);
    const standardWorkHours = parseFloat(config.rules?.workEndTime.replace(':', '.')) - parseFloat(config.rules?.workStartTime.replace(':', '.')) - 1.5; // Rough estimate or hardcode 8/8.5 fallback
    const threshold = standardWorkHours > 0 ? standardWorkHours : (mainCompany?.includes('成都') ? 8.5 : 8);
    
    if (u.includes('hour') || u.includes('小时')) return d >= threshold;
    return false;
};

// Calculate duration in hours for a single process
export const getLeaveDuration = (processDetail: any, dateKey?: string, mainCompany?: any): number => {
    const form = processDetail?.formValues;
    if (!form) return 0;

    const duration = Number(form.duration) || 0;
    const unit = form.durationUnit || form.unit;
    
    // Get rules dynamically
    const companyKey = (mainCompany?.includes('海多多') || mainCompany === 'hydodo') ? 'hydodo' : 'eyewind';
    const config = getAppConfig(companyKey);
    const dailyHours = (mainCompany?.includes('成都') ? 8.5 : 8); // Fallback logic kept for safety, but could use config

    // Direct hour unit
    if (unit === 'hour' || unit === '小时') {
        if (duration > dailyHours && dateKey && form.start && form.end) {
            // 解析日期时使用本地时间，避免时区问题
            const [yearStr, monthStr, dayStr] = dateKey.split('-');
            const today = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
            today.setHours(0, 0, 0, 0);
            
            const start = new Date(form.start);  // 请假开始时间
            const end = new Date(form.end);  // 请假结束时间
            
            // 创建用于比较的日期（只比较日期部分）
            const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

            // 如果今天在请假时间范围内
            if (today >= startDate && today <= endDate) {
                // 判断是否是同一天的工作时长
                if (today.getTime() === startDate.getTime()) {
                    // 如果是开始日期，计算当天的工作时间
                    const workStart = new Date(start);

                    // 如果start的时间小于9点，按9点开始计算
                    if (workStart.getHours() < 9) {
                        workStart.setHours(9, 0, 0, 0);
                    }

                    const workEnd = new Date(start);
                    workEnd.setHours(18, 30, 0, 0); // 假设工作结束时间为18:30

                    // 计算当天的请假时长
                    const actualEnd = end < workEnd ? end : workEnd;
                    const todayDuration = (actualEnd.getTime() - workStart.getTime()) / 60000;  // 今日请假时长（分钟）
                    
                    // 如果跨越午休时间（12:00-13:30），需要减去1.5小时
                    let adjustedDuration = todayDuration;
                    if (workStart.getHours() < 12 && actualEnd.getHours() >= 13) {
                        adjustedDuration -= 90; // 减去午休1.5小时
                    }
                    
                    const hour = Math.min(adjustedDuration, dailyHours * 60) / 60;
                    return hour < 0 ? 0 : hour;  // 转换为小时，且不超过8小时
                } else if (today.getTime() === endDate.getTime()) {
                    // 如果是结束日期，计算当天的时间
                    const dayStart = new Date(today);
                    dayStart.setHours(9, 0, 0, 0);
                    
                    // 计算从9点到结束时间的时长
                    let remainingDuration = (end.getTime() - dayStart.getTime()) / 60000;  // 时长（分钟）

                    // 如果结束时间大于13:30，减去1.5小时（90分钟）午休
                    if (end.getHours() > 13 || (end.getHours() === 13 && end.getMinutes() >= 30)) {
                        remainingDuration -= 90;
                    }
                    
                    // 确保时长不小于0且不超过8小时
                    return Math.max(0, Math.min(remainingDuration / 60, dailyHours));
                } else {
                    // 如果是中间日期的完整请假，返回8小时
                    return dailyHours;  // 全日休假
                }
            }
            return 0;  // 如果今天不在请假时间范围内
        }
        return duration; // If duration <= 8, directly return the duration
    }

    // Day unit (Day * 8)
    if (unit === 'day' || unit === '天') {
        if (dateKey && form.start && form.end) {
            // 解析日期时使用本地时间
            const [yearStr, monthStr, dayStr] = dateKey.split('-');
            const today = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
            today.setHours(0, 0, 0, 0);
            
            // 解析开始和结束日期
            const startStr = form.start.split(' ')[0];
            const endStr = form.end.split(' ')[0];
            const [sy, sm, sd] = startStr.split('-').map(Number);
            const [ey, em, ed] = endStr.split('-').map(Number);
            const s = new Date(sy, sm - 1, sd);
            const e = new Date(ey, em - 1, ed);

            if (today >= s && today <= e) {
                return dailyHours;
            }
            return 0;
        }
        return duration * dailyHours; // For day units, multiply by 8 to get the number of hours
    }

    return 0;
};


/**
 * Check if a specific time point is covered by ANY leave process.
 * This is crucial for verifying if a missing punch is justified.
 */
export const checkTimeInLeaveRange = (
    processDataMap: Record<string, any>,
    records: PunchRecord[],
    targetTime: Date
): { isCovered: boolean, type: string | null } => {
    const targetTs = targetTime.getTime();

    // Iterate through all records that might be associated with a process
    // Note: Sometimes records don't link to process explicitly if they are 'NotSigned',
    // so we might need to iterate ALL processes for the user/day, but here we assume
    // we are checking coverage based on the daily records' context or passed processes.
    // Ideally, we iterate all processes available in processDataMap that match the user.
    // However, for performance, we usually only have IDs linked in daily records.
    // If a day has *any* leave record, we check if *that* leave covers this time.

    // Strategy: Look at all procInstIds present in the day's records.
    const procInstIds = new Set<string>();
    records.forEach(r => { if (r.procInstId) procInstIds.add(r.procInstId); });

    for (const procId of procInstIds) {
        const process = processDataMap[procId];
        if (!process || !process.formValues) continue;

        const form = process.formValues;
        // Normalize Start/End times
        // Formats: "2023-12-01 09:00" or "2023-12-01" (if day unit)

        let startTime = -1;
        let endTime = -1;

        const startStr = form.start || form.startTime;
        const endStr = form.end || form.endTime;
        const unit = form.durationUnit || form.unit || '';

        if (!startStr || !endStr) continue;

        if (unit.includes('day') || unit.includes('天')) {
            // Day granularity: 2023-12-01 implies 00:00:00 to 23:59:59 of that day
            // Or range: 2023-12-01 to 2023-12-05
            const sDate = new Date(startStr.split(' ')[0]);
            sDate.setHours(0, 0, 0, 0);
            const eDate = new Date(endStr.split(' ')[0]);
            eDate.setHours(23, 59, 59, 999);

            startTime = sDate.getTime();
            endTime = eDate.getTime();
        } else {
            // Hour/Time granularity
            startTime = new Date(startStr).getTime();
            endTime = new Date(endStr).getTime();
        }

        // Check intersection
        if (targetTs >= startTime && targetTs <= endTime) {
            return { isCovered: true, type: form.leaveType || process.bizType };
        }
    }

    return { isCovered: false, type: null };
};

// Sum up all leaves for a day
export const calculateDailyLeaveDuration = (
    records: PunchRecord[],
    processDataMap: Record<string, any>,
    year: number,
    dateKey: string, // MM-DD
    mainCompany?: string
): number => {
    let totalHours = 0;
    const processedIds = new Set<string>();

    records.forEach(record => {
        if (record.procInstId && !processedIds.has(record.procInstId)) {
            const process = processDataMap[record.procInstId];
            if (process) {
                processedIds.add(record.procInstId);
                const fullDateKey = `${year}-${dateKey}`;
                totalHours += getLeaveDuration(process, fullDateKey, mainCompany);
            }
        }
    });
    return totalHours;
};

export function getFirstWorkdayDate(year: number, month: number, holidaysObj: any): Date | null {
    const holidayMap = holidaysObj || {};
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        const mmdd = `${mm}-${dd}`;

        const info = holidayMap[mmdd];
        const weekday = date.getDay();
        const isWeekend = weekday === 0 || weekday === 6;

        let isWorkday = false;
        if (info) {
            if (info.holiday === false) isWorkday = true;
            else isWorkday = false;
        } else {
            isWorkday = !isWeekend;
        }

        if (isWorkday) return date;
    }
    return null;
}

export const getLateMinutes = (
    record?: PunchRecord,
    processDetail?: any,
    lastFridayOffDutyTime?: Date | null,
    yesterdayApprove2030?: boolean,
    isFirstDayOnJob?: boolean,
    holidays?: any
): number => {
    if (!record || record.timeResult !== 'Late' || !record.userCheckTime) return 0;
    if (record.checkType !== 'OnDuty') return 0;

    const userTime = new Date(record.userCheckTime).getTime();
    let targetTime = record.baseCheckTime ? new Date(record.baseCheckTime).getTime() : 0;

    const checkInDate = new Date(record.userCheckTime);
    const year = checkInDate.getFullYear();
    const month = checkInDate.getMonth();
    const day = checkInDate.getDate();

    let newTargetTime: number | null = null;

    if (lastFridayOffDutyTime) {
        const fridayOffTime = lastFridayOffDutyTime.getTime();
        const lastFriday2030 = new Date(lastFridayOffDutyTime);
        lastFriday2030.setHours(20, 30, 0, 0);
        if (fridayOffTime >= lastFriday2030.getTime()) {
            newTargetTime = new Date(year, month, day, 9, 30, 0).getTime();
        }
    }

    if (newTargetTime === null) {
        const firstWorkday = getFirstWorkdayDate(year, month, holidays);
        const isFirstWorkday = firstWorkday &&
            firstWorkday.getFullYear() === year &&
            firstWorkday.getMonth() === month &&
            firstWorkday.getDate() === day;

        if (isFirstWorkday) {
            newTargetTime = new Date(year, month, day, 9, 30, 0).getTime();
        }
    }

    if (newTargetTime !== null) {
        targetTime = newTargetTime;
    } else if (targetTime === 0) {
        return 0;
    }

    if (processDetail) {
        const endTimeStr = processDetail.formValues?.endTime || processDetail.formValues?.end;
        if (endTimeStr) {
            const leaveEndTime = new Date(endTimeStr).getTime();
            const afternoonStart = new Date(year, month, day, 13, 30, 0).getTime();
            if (leaveEndTime > targetTime) {
                if (leaveEndTime < afternoonStart) {
                    targetTime = afternoonStart;
                } else {
                    targetTime = leaveEndTime;
                }
            }
        }
    }

    if (yesterdayApprove2030) {
        const special930 = new Date(year, month, day, 9, 30, 0).getTime();
        targetTime = special930
    }

    if (isFirstDayOnJob) return 0;

    return Math.max(0, Math.floor((userTime - targetTime) / 60000));
};

export const fetchCompanyData = async (mainCompany: string, fromDate: string, toDate: string, year: number, month: number): Promise<{ employees: DingTalkUser[]; companyCounts: CompanyCounts }> => {
    // Cache Key includes company and date range
    const cacheKey = `ATTENDANCE_DATA_${mainCompany}_${fromDate}_${toDate}`;

    // 1. Try Cache First
    const cachedData = await SmartCache.get<{ employees: DingTalkUser[]; companyCounts: CompanyCounts }>(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    // 2. Fetch if not cached or expired
    const doFetch = async (forceRefresh = false) => {
        const accessToken = await dingTalkTokenManager.getToken(mainCompany, forceRefresh);

        const employeesResponse = await fetch("https://sg.api.eyewind.cn/etl/dingding/employees", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dingToken: accessToken }),
        });

        if (employeesResponse.status === 401 && !forceRefresh) throw new Error("401_RETRY");
        if (!employeesResponse.ok) throw new Error(`获取 ${mainCompany} 员工列表失败: ${employeesResponse.status}`);

        const employeesData = await employeesResponse.json();
        if (employeesData.errcode === 40014) throw new Error("401_RETRY");

        const { employees, companyCounts } = employeesData;
        if (!employees || !Array.isArray(employees)) throw new Error(`${mainCompany} 员工API返回的数据格式不正确。`);

        // Optimization: Map employees to a lighter structure for the punch API request
        // Only send userid, name, and department as per requirements
        const simplifiedEmployees = employees.map((e: DingTalkUser) => ({
            userid: e.userid,
            name: e.name,
            department: e.department
        }));

        const punchResponse = await fetch("https://sg.api.eyewind.cn/etl/dingding/punch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                dingToken: accessToken,
                employees: simplifiedEmployees, // Use the simplified list
                year: year,
                month: month,
            }),
        });

        if (punchResponse.status === 401 && !forceRefresh) throw new Error("401_RETRY");

        let punchData = {};
        if (!punchResponse.ok) {
            console.warn(`获取 ${mainCompany} 的打卡数据请求失败`);
        } else {
            const punchResult = await punchResponse.json();
            if (punchResult.errcode === 40014 && !forceRefresh) throw new Error("401_RETRY");

            if (punchResult.success && Array.isArray(punchResult.data)) {
                punchData = punchResult.data.reduce((acc: Record<string, PunchRecord[]>, record: PunchRecord) => {
                    const uid = record.userId;
                    if (!acc[uid]) acc[uid] = [];
                    acc[uid].push(record);
                    return acc;
                }, {});
            }
        }

        const employeesWithPunchData = employees.map((employee: DingTalkUser) => ({
            ...employee,
            punchData: punchData[employee.userid] || [],
        }));

        const result = { employees: employeesWithPunchData as DingTalkUser[], companyCounts: companyCounts as CompanyCounts };

        // 3. Save to Cache
        await SmartCache.set(cacheKey, result);
        
        // OPTIMIZATION: Also cache the raw employee list for other components (like AttendancePage) to reuse without re-fetching
        // AttendancePage uses this specific key to look for employees.
        await SmartCache.set(`EMPLOYEES_LIST_${mainCompany}`, employees);

        return result;
    };

    try {
        return await doFetch(false);
    } catch (error) {
        if (error instanceof Error && error.message === "401_RETRY") {
            return await doFetch(true);
        }
        throw error;
    }
};

export const fetchProcessDetail = async (procInstId: string, mainCompany: string) => {
    const cacheKey = `PROCESS_${procInstId}`;

    // Process details are immutable usually, so standard cache is fine. 
    // If status changes, SmartCache will auto-expire based on daily timepoints which is acceptable.
    const cached = await SmartCache.get<any>(cacheKey);
    if (cached) return cached;

    try {
        const company = (mainCompany?.includes('海多多') || mainCompany === 'hydodo') ? 'hydodo' : 'eyewind';
        const accessToken = await dingTalkTokenManager.getToken(company);

        const response = await fetch(`https://sg.api.eyewind.cn/etl/dingding/processInstances/${procInstId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dingToken: accessToken })
        });

        const json = await response.json();
        if (json.success !== false) {
            await SmartCache.set(cacheKey, json.data);
            return json.data;
        }
        return null;
    } catch (error) {
        console.error(`Failed to fetch process ${procInstId}:`, error);
        return null;
    }
};
