
import type { PunchRecord, DingTalkUser, CompanyCounts, CompanyConfig, AttendanceRuleConfig, LateRule, PerformancePenaltyRule, FullAttendanceRule, LeaveDisplayRule, AttendanceMap } from '../../database/schema.ts';
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
                enableLookback: true, // 启用向前查询
                lookbackDays: 3, // 最多向前查询3天
                rules: [
                    // 跨天规则（前一天影响第二天）
                    {
                        checkoutTime: "20:30",
                        nextCheckinTime: "09:30", 
                        description: "晚上8点半后打卡，第二天可9点半上班",
                        applyTo: 'day'
                    },
                    {
                        checkoutTime: "24:00",
                        nextCheckinTime: "13:30",
                        description: "晚上12点后打卡，第二天可下午1点半上班",
                        applyTo: 'day'
                    },
                    // 跨周规则（周五/周末影响周一）
                    {
                        checkoutTime: "20:30",
                        nextCheckinTime: "09:30",
                        description: "周五晚上8点半后打卡，周一可9点半上班",
                        applyTo: 'week',
                        weekDays: ['friday']
                    },
                    {
                        checkoutTime: "24:00",
                        nextCheckinTime: "13:30",
                        description: "周五晚上12点后打卡，周一可下午1点半上班",
                        applyTo: 'week',
                        weekDays: ['friday']
                    },
                    // 跨月规则（上月最后一天影响本月第一天）
                    {
                        checkoutTime: "00:00",
                        nextCheckinTime: "09:30",
                        description: "本月第一天默认9点半上班",
                        applyTo: 'month'
                    },
                    {
                        checkoutTime: "24:00",
                        nextCheckinTime: "13:30",
                        description: "上月最后一天晚上12点后打卡，本月第一天可下午1点半上班",
                        applyTo: 'month'
                    }
                ]
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
                enableLookback: false,
                lookbackDays: 3,
                rules: [] // 空数组，不设置跨天规则
            }
        }
    }
};

/**
 * 将数据库格式的规则配置转换为前端格式
 * 新的数据库设计：rules 字段直接存储前端格式的 JSONB，无需复杂转换
 */
function convertDbConfigToFrontend(dbConfig: FullAttendanceRuleConfig, companyKey: string): CompanyConfig | null {
    try {
        const defaultConfig = DEFAULT_CONFIGS[companyKey as 'eyewind' | 'hydodo'];
        if (!defaultConfig) return null;

        // 新的数据库设计：rules 字段已经是前端格式，直接使用
        // 使用可选链操作符处理可能不存在的 rules 属性
        const rules = (dbConfig as any).rules || defaultConfig.rules;

        return {
            ...defaultConfig,
            rules: rules as AttendanceRuleConfig
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
        // 🔥 优先从数据库 API 获取最新配置（特别是在强制刷新时）
        // console.log(`[getAppConfigAsync] 开始加载 ${key} 配置，强制刷新: ${forceRefresh}`);
        
        const dbConfig = await attendanceRuleApiService.getFullConfig(key as CompanyId, forceRefresh);
        
        if (dbConfig) {
            // 🔥 更新本地缓存
            localStorage.setItem(dbCacheKey, JSON.stringify(dbConfig));
            
            // 转换为前端格式
            const converted = convertDbConfigToFrontend(dbConfig, key);
            if (converted) {
                // console.log(`[getAppConfigAsync] ✅ 成功从数据库加载 ${key} 配置`);
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
    const dbCacheKey = `${DB_RULE_CACHE_PREFIX}${key}`;
    
    try {
        // console.log(`[refreshDbRuleCache] 🔥 开始刷新 ${key} 的规则缓存`);
        
        // 1. 清除 API 服务的内存缓存
        attendanceRuleApiService.clearCache(key as CompanyId);
        
        // 2. 清除本地存储的数据库缓存
        localStorage.removeItem(dbCacheKey);
        
        // 3. 清除旧的本地配置缓存（如果存在）
        const oldConfigKey = CONFIG_KEY;
        const oldConfigs = localStorage.getItem(oldConfigKey);
        if (oldConfigs) {
            try {
                const configs = JSON.parse(oldConfigs);
                if (configs[key]) {
                    delete configs[key];
                    localStorage.setItem(oldConfigKey, JSON.stringify(configs));
                }
            } catch (e) {
                console.warn('[refreshDbRuleCache] 清除旧配置缓存失败:', e);
            }
        }
        
        // 4. 强制从数据库重新加载最新配置
        const freshConfig = await getAppConfigAsync(companyKey, true);
        
        // console.log(`[refreshDbRuleCache] ✅ 已刷新 ${key} 的规则缓存，新配置:`, {
            // workStartTime: freshConfig.rules?.workStartTime,
            // fullAttendanceBonus: freshConfig.rules?.fullAttendanceBonus,
            // performancePenaltyEnabled: freshConfig.rules?.performancePenaltyEnabled
        // });
        
        // 5. 触发全局配置更新事件（如果需要）
        window.dispatchEvent(new CustomEvent('configUpdated', { 
            detail: { company: key, config: freshConfig } 
        }));
        
    } catch (e) {
        console.error(`[refreshDbRuleCache] 刷新缓存失败:`, e);
        throw e; // 重新抛出错误，让调用方知道刷新失败
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
 * 
 * 🔥 fromDate 优化：设置为上个月最后一个工作日
 * - 如果上个月最后一个工作日有加班，需要获取该天的打卡数据用于跨月规则判断
 * - 例如：查询2026-02时，fromDate可能是2026-01-31（如果是工作日）或更早的工作日
 */
export function getDateRangeForDefaultMonth(): { fromDate: string, toDate: string, monthStr: string; year: number; month: number } {
    const monthStr = getDefaultMonth();
    const [y, m] = monthStr.split('-').map(Number);
    
    // 🔥 计算上个月最后一个工作日作为 fromDate
    // 这样可以获取跨月规则所需的上月最后一个工作日的打卡数据
    const firstDayOfMonth = new Date(y, m - 1, 1); // 当月第一天
    const lastDayOfPrevMonth = new Date(firstDayOfMonth);
    lastDayOfPrevMonth.setDate(0); // 设置为上个月最后一天
    
    // 从上个月最后一天开始往前找，找到最后一个工作日
    let lastWorkday = lastDayOfPrevMonth;
    while (lastWorkday.getDay() === 0 || lastWorkday.getDay() === 6) {
        // 如果是周末，继续往前找
        lastWorkday.setDate(lastWorkday.getDate() - 1);
    }
    
    // 格式化为 YYYY-MM-DD
    const fromDate = `${lastWorkday.getFullYear()}-${String(lastWorkday.getMonth() + 1).padStart(2, '0')}-${String(lastWorkday.getDate()).padStart(2, '0')}`;
    
    // console.log(`[getDateRangeForDefaultMonth] 查询月份: ${monthStr}, fromDate: ${fromDate} (上月最后一个工作日)`);
    
    // 🔥 修复：toDate设置为下个月第一天，避免时区问题导致上个月数据被错误归类
    // 例如：查询2026-01时，toDate设置为2026-02-01，避免2025-12-31被错认为2026-01-31
    const nextMonth = new Date(y, m, 1); // 下个月第一天
    const toDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

    return { fromDate, toDate, monthStr, year: y, month: m };
}

/**
 * 获取公司配置（优先从缓存读取，否则使用默认值）
 * 注意：这是同步函数，用于兼容旧代码。新代码应使用 getAppConfigAsync
 */
export function getAppConfig(companyKey: string): CompanyConfig {
    const normalizedKey = (companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind';
    const dbCacheKey = `DB_RULE_CONFIG_${normalizedKey}`;
    
    // 🔥 优先检查数据库缓存
    const dbCached = localStorage.getItem(dbCacheKey);
    if (dbCached) {
        try {
            const dbConfig = JSON.parse(dbCached);
            const converted = convertDbConfigToFrontend(dbConfig, normalizedKey);
            if (converted) {
                // console.log(`[getAppConfig] 使用数据库缓存配置: ${normalizedKey}`);
                return converted;
            }
        } catch (e) {
            console.error("[getAppConfig] 解析数据库缓存失败:", e);
            // 清除损坏的缓存
            localStorage.removeItem(dbCacheKey);
        }
    }
    
    // 🔥 如果没有数据库缓存，直接使用默认配置，不使用旧的本地存储
    // 这样可以避免使用过时的配置
    // console.log(`[getAppConfig] 使用默认配置: ${normalizedKey} (没有数据库缓存)`);
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

// --- Enhanced Cache System for Holidays and Dashboard Data ---

/**
 * 节假日数据缓存管理器
 * 节假日数据按年份缓存，长期有效
 */
export class HolidayCache {
    private static readonly CACHE_PREFIX = 'HOLIDAY_CACHE_';
    
    /**
     * 获取节假日数据，优先从缓存读取
     */
    static async getHolidays(year: number): Promise<any> {
        const cacheKey = `${this.CACHE_PREFIX}${year}`;
        
        try {
            // 1. 尝试从IndexedDB缓存读取
            const cached = await SmartCache.get<any>(cacheKey);
            if (cached) {
                // console.log(`[HolidayCache] 使用缓存的节假日数据: ${year}`);
                return cached;
            }
            
            // 2. 缓存未命中，从API获取
            // console.log(`[HolidayCache] 从API获取节假日数据: ${year}`);
            const response = await fetch(`https://timor.tech/api/holiday/year/${year}`);
            if (!response.ok) throw new Error('Failed to fetch holidays');
            
            const data = await response.json();
            const holidayData = data.holiday || {};
            
            // 3. 存储到缓存（节假日数据长期有效，不设置过期时间）
            await this.setHolidaysCache(year, holidayData);
            
            return holidayData;
        } catch (error) {
            console.warn(`[HolidayCache] 获取节假日数据失败: ${year}`, error);
            return {};
        }
    }
    
    /**
     * 设置节假日缓存（使用特殊的长期缓存）
     */
    private static async setHolidaysCache(year: number, data: any): Promise<void> {
        const cacheKey = `${this.CACHE_PREFIX}${year}`;
        
        try {
            const db = await openDB();
            const item = {
                data,
                timestamp: Date.now(),
                type: 'holiday', // 标记为节假日数据
                year: year,
                permanent: true // 标记为永久缓存
            };
            
            return new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(item, cacheKey);
                request.onsuccess = () => {
                    // console.log(`[HolidayCache] 节假日数据已缓存: ${year}`);
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('[HolidayCache] 缓存节假日数据失败', e);
        }
    }
    
    /**
     * 清除指定年份的节假日缓存
     */
    static async clearHolidays(year: number): Promise<void> {
        const cacheKey = `${this.CACHE_PREFIX}${year}`;
        await SmartCache.remove(cacheKey);
        // console.log(`[HolidayCache] 已清除节假日缓存: ${year}`);
    }
}

/**
 * 考勤仪表盘数据缓存管理器
 * 按公司+月份缓存，切换时自动清理
 */
export class DashboardCache {
    private static readonly CACHE_PREFIX = 'DASHBOARD_CACHE_';
    
    /**
     * 生成缓存键
     */
    private static getCacheKey(company: string, yearMonth: string): string {
        return `${this.CACHE_PREFIX}${company}_${yearMonth}`;
    }
    
    /**
     * 获取仪表盘数据
     */
    static async getDashboardData(company: string, yearMonth: string): Promise<{
        employees: DingTalkUser[];
        companyCounts: CompanyCounts;
        processDataMap: Record<string, any>;
        attendanceMap: AttendanceMap;
    } | null> {
        const cacheKey = this.getCacheKey(company, yearMonth);
        
        try {
            const cached = await SmartCache.get<any>(cacheKey);
            if (cached) {
                // console.log(`[DashboardCache] ✅ 使用月份仪表盘缓存: ${company} - ${yearMonth}`);
                // console.log(`[DashboardCache] 📅 缓存包含数据: ${cached.employees?.length || 0} 个员工, ${Object.keys(cached.processDataMap || {}).length} 个审批详情`);
                return cached;
            }
            return null;
        } catch (error) {
            console.error('[DashboardCache] 读取仪表盘缓存失败', error);
            return null;
        }
    }
    
    /**
     * 设置仪表盘数据缓存
     */
    static async setDashboardData(
        company: string, 
        yearMonth: string, 
        data: {
            employees: DingTalkUser[];
            companyCounts: CompanyCounts;
            processDataMap: Record<string, any>;
            attendanceMap: AttendanceMap;
        }
    ): Promise<void> {
        const cacheKey = this.getCacheKey(company, yearMonth);
        
        try {
            const cacheData = {
                ...data,
                cachedAt: Date.now(),
                company,
                yearMonth,
                type: 'dashboard'
            };
            
            await SmartCache.set(cacheKey, cacheData);
            // console.log(`[DashboardCache] 💾 仪表盘数据已缓存到IndexedDB: ${company} - ${yearMonth}`);
            // console.log(`[DashboardCache] 📅 缓存内容: ${data.employees.length} 个员工, ${Object.keys(data.processDataMap).length} 个审批详情`);
        } catch (error) {
            console.error('[DashboardCache] 缓存仪表盘数据失败', error);
        }
    }
    
    /**
     * 清除指定公司和月份的缓存
     */
    static async clearDashboardData(company: string, yearMonth: string): Promise<void> {
        const cacheKey = this.getCacheKey(company, yearMonth);
        await SmartCache.remove(cacheKey);
        // console.log(`[DashboardCache] 已清除仪表盘缓存: ${company} - ${yearMonth}`);
    }
    
    /**
     * 清除指定公司的所有缓存
     */
    static async clearCompanyData(company: string): Promise<void> {
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            // 获取所有键
            const keysRequest = store.getAllKeys();
            keysRequest.onsuccess = () => {
                const keys = keysRequest.result;
                const companyKeys = keys.filter(key => 
                    typeof key === 'string' && 
                    key.includes(`${this.CACHE_PREFIX}${company}_`)
                );
                
                // 删除匹配的键
                companyKeys.forEach(key => {
                    store.delete(key);
                });
                
                // console.log(`[DashboardCache] 已清除公司所有缓存: ${company}, 清除 ${companyKeys.length} 个缓存项`);
            };
        } catch (error) {
            console.error('[DashboardCache] 清除公司缓存失败', error);
        }
    }
    
    /**
     * 获取缓存统计信息
     */
    static async getCacheStats(): Promise<{
        totalItems: number;
        dashboardItems: number;
        holidayItems: number;
        totalSize: number;
    }> {
        try {
            const db = await openDB();
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            
            return new Promise((resolve) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const items = request.result;
                    let dashboardItems = 0;
                    let holidayItems = 0;
                    let totalSize = 0;
                    
                    items.forEach(item => {
                        const itemSize = JSON.stringify(item).length;
                        totalSize += itemSize;
                        
                        if (item.type === 'dashboard') dashboardItems++;
                        else if (item.type === 'holiday') holidayItems++;
                    });
                    
                    resolve({
                        totalItems: items.length,
                        dashboardItems,
                        holidayItems,
                        totalSize
                    });
                };
            });
        } catch (error) {
            console.error('[DashboardCache] 获取缓存统计失败', error);
            return { totalItems: 0, dashboardItems: 0, holidayItems: 0, totalSize: 0 };
        }
    }
}

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

            const response = await fetch("http://localhost:5001/etl/dingding/gettoken", {
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

// 🔥 全局请求管理器，防止重复调用
const pendingRequests = new Map<string, Promise<any>>();

export const fetchCompanyData = async (mainCompany: string, fromDate: string, toDate: string, year: number, month: number): Promise<{ employees: DingTalkUser[]; companyCounts: CompanyCounts }> => {
    // Cache Key includes company and date range
    const cacheKey = `ATTENDANCE_DATA_${mainCompany}_${fromDate}_${toDate}`;

    // 🔥 检查是否有正在进行的相同请求
    if (pendingRequests.has(cacheKey)) {
        // console.log(`[fetchCompanyData] ⏳ 等待进行中的请求: ${cacheKey}`);
        return await pendingRequests.get(cacheKey);
    }

    // 1. Try Cache First
    const cachedData = await SmartCache.get<{ employees: DingTalkUser[]; companyCounts: CompanyCounts }>(cacheKey);
    if (cachedData) {
        // console.log(`[fetchCompanyData] ✅ 使用月份缓存数据: ${cacheKey}, 员工数: ${cachedData.employees.length}`);
        // console.log(`[fetchCompanyData] 📅 缓存月份: ${fromDate} 至 ${toDate}`);
        return cachedData;
    }

    // console.log(`[fetchCompanyData] 🔄 缓存未命中，开始新的API请求: ${cacheKey}`);
    
    // 2. 创建新的请求Promise
    const requestPromise = (async () => {
        const doFetch = async (forceRefresh = false) => {
            const accessToken = await dingTalkTokenManager.getToken(mainCompany, forceRefresh);

            const employeesResponse = await fetch("http://localhost:5001/etl/dingding/employees", {
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

            const punchResponse = await fetch("http://localhost:5001/etl/dingding/punch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dingToken: accessToken,
                    employees: simplifiedEmployees, // Use the simplified list
                    fromDate: fromDate,
                    toDate: toDate,
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
            // console.log(`[fetchCompanyData] 💾 考勤数据已缓存到IndexedDB: ${cacheKey}`);
            // console.log(`[fetchCompanyData] 📅 缓存月份范围: ${fromDate} 至 ${toDate}`);
            
            // OPTIMIZATION: Also cache the raw employee list for other components (like AttendancePage) to reuse without re-fetching
            // AttendancePage uses this specific key to look for employees.
            await SmartCache.set(`EMPLOYEES_LIST_${mainCompany}`, employees);

            // console.log(`[fetchCompanyData] API请求完成: ${cacheKey}, 员工数: ${employees.length}`);
            return result;
        };

        try {
            const result = await doFetch(false);
            return result;
        } catch (error) {
            if (error instanceof Error && error.message === "401_RETRY") {
                return await doFetch(true);
            }
            throw error;
        }
    })();

    // 🔥 缓存请求Promise
    pendingRequests.set(cacheKey, requestPromise);

    try {
        const result = await requestPromise;
        return result;
    } finally {
        // 🔥 请求完成后清除缓存
        pendingRequests.delete(cacheKey);
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

        const response = await fetch(`http://localhost:5001/etl/dingding/processInstances/${procInstId}`, {
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
