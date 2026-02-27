
import { useMemo, useEffect, useState } from 'react';
// Fix: Import all necessary types from the centralized schema file.
import type {
    DingTalkUser,
    AttendanceMap,
    PunchRecord,
    EmployeeStats,
    HolidayMap,
    DailyAttendanceStatus
} from '../../../database/schema.ts';
import { getLeaveDuration, calculateDailyLeaveDuration, checkTimeInLeaveRange, getAppConfig } from '../utils.ts';
import { AttendanceRuleManager } from '../AttendanceRuleEngine.ts';
import { getRuleConfigSync, initRuleConfigCache } from '../../../hooks/useAttendanceRuleConfig.ts';

// 获取当月最后一个工作日
const getLastWorkDayOfMonth = (year: number, month: number, holidays: Record<string, any>): number | null => {
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = lastDayOfMonth; day >= 1; day--) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        const dateKey = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        // 检查是否为工作日（非周末且非法定节假日）
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const holidayInfo = holidays[dateKey];
        
        let isWorkDay = !isWeekend;
        if (holidayInfo) {
            if (holidayInfo.holiday === false) isWorkDay = true; // 补班日
            else if (holidayInfo.holiday === true) isWorkDay = false; // 法定节假日
        }
        
        if (isWorkDay) {
            return day;
        }
    }
    
    return null; // 如果整个月都没有工作日（理论上不可能）
};

/**
 * 根据规则配置获取应出勤天数
 * 应出勤天数 = 当月工作日 + 法定节假日（不包含周末）
 * @param companyKey - 公司标识
 * @param workdaysCount - 计算出的工作日数量
 * @param holidaysCount - 法定节假日数量
 * @returns 应出勤天数
 */
function getShouldAttendanceDays(companyKey: string, workdaysCount: number, holidaysCount: number = 0): number {
    // 优先从数据库缓存获取配置
    const config = getRuleConfigSync(companyKey);
    const rules = config.rules?.attendanceDaysRules;
    
    // console.log(`[getShouldAttendanceDays] ${companyKey} 配置:`, {
    //     method: rules?.shouldAttendanceCalcMethod,
    //     fixedDays: rules?.fixedShouldAttendanceDays,
    //     workdaysCount,
    //     holidaysCount
    // });
    
    if (!rules?.enabled) {
        return workdaysCount;
    }
    
    // 根据计算方法返回应出勤天数
    switch (rules.shouldAttendanceCalcMethod) {
        case 'fixed':
            // 使用固定天数，如果没有设置则使用22天作为默认值
            const fixedDays = rules.fixedShouldAttendanceDays ?? 22;
            // console.log(`[getShouldAttendanceDays] 使用固定天数: ${fixedDays}`);
            return fixedDays;
        case 'custom':
            // 自定义逻辑（暂时使用计算值）
            return workdaysCount;
        case 'workdays':
        default:
            // 应出勤天数 = 工作日 + 法定节假日（如果配置了包含法定节假日）
            if (rules.includeHolidaysInShould) {
                return workdaysCount + holidaysCount;
            }
            return workdaysCount;
    }
}

// --- Type Definitions (can be moved to a shared types file) ---

interface CompanyEmployeeStats {
    [companyName: string]: {
        user: DingTalkUser;
        stats: EmployeeStats;
    }[];
}

interface CompanyAggregateStats {
    [companyName: string]: {
        totalLateMinutes: number;
        abnormalUserCount: number;
        totalRecords: number;
        abnormalRecords: number;
    };
}

interface DailyTrend {
    day: string;
    late: number;
    missing: number;
    annual: number;
    sick: number;
    personal: number;
    trip: number;
    compTime: number;
    bereavement?: number;
    paternity?: number;
    maternity?: number;
    parental?: number;
    marriage?: number;
}

interface DailyTrendMap {
    [companyName: string]: DailyTrend[];
}


// --- Helper Functions ---

// 解析 workDate，避免时区问题和类型错误
const parseWorkDate = (workDateValue: any): Date => {
    if (typeof workDateValue === 'string' && workDateValue.includes('-')) {
        const [y, m, d] = workDateValue.split('T')[0].split('-').map(Number);
        return new Date(y, m - 1, d); // 月份从0开始
    } else {
        return new Date(workDateValue);
    }
};

const isFullDayLeave = (processData: any, mainCompany): boolean => {
    if (!processData || !processData.formValues) return false;
    const { duration, durationUnit, unit } = processData.formValues;
    const d = parseFloat(duration);
    if (isNaN(d)) return false;

    const u = durationUnit || unit || '';
    if (u.includes('day') || u.includes('天')) return d >= 1;
    if (u.includes('hour') || u.includes('小时')) return d >= (mainCompany.includes('成都') ? 8.5 : 8);
    return false;
};

function getFirstWorkdayDate(year: number, month: number, holidaysObj: any): Date | null {
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

/**
 * 获取月度工作日统计
 * @param {number} year - 年份
 * @param {number} month - 月份 (0-11)
 * @param {any} holidaysObj - 节假日配置对象
 * @param {any} joinTime - 入职时间 (支持 Date 对象、时间戳或可解析字符串)
 * @param {number} targetYear - 目标年份（用于判断是否是当前月）
 * @param {number} targetMonth - 目标月份（用于判断是否是当前月）
 * @returns {{ totalWorkdays: number, workdaysUntilToday: number, holidaysCount: number }}
 */
function getWorkdaysOfMonth(year: number, month: number, holidaysObj: any, joinTime?: any, targetYear?: number, targetMonth?: number) {
    const holidayMap = holidaysObj?.holiday || holidaysObj || {}; // 兼容两种格式
    const daysInMonth = new Date(year, month + 1, 0).getDate(); // 获取当月天数
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 只取日期部分

    // 解析入职时间
    const joinDate = joinTime ? new Date(joinTime) : null;
    const joinDateOnly = joinDate ? new Date(joinDate.getFullYear(), joinDate.getMonth(), joinDate.getDate()) : null;

    // 判断是否是当前月份
    const isCurrentMonth = (targetYear || year) === now.getFullYear() && (targetMonth !== undefined ? targetMonth : month) === now.getMonth();

    let totalWorkdays = 0; // 整个月的工作日数量（不含周末，除非是补班）
    let workdaysUntilToday = 0; // 截至今天（或月末）的工作日数量
    let holidaysCount = 0; // 法定节假日数量（不含周末）

    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dateOnly = new Date(year, month, d);

        const weekday = date.getDay(); // 获取星期几（0=日, 1=一, ..., 6=六）
        const isWeekend = weekday === 0 || weekday === 6;
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        const mmdd = `${mm}-${dd}`;

        const info = holidayMap[mmdd]; // 获取当天的节假日信息

        let isWorkday = false;
        let isHoliday = false; // 是否是法定节假日（非周末）

        // 1. 如果是补班（holiday=false），则计算为工作日
        if (info?.holiday === false) {
            isWorkday = true;
        }
        // 2. 如果是法定节假日（holiday=true）
        else if (info?.holiday === true) {
            isWorkday = false;
            // 只有非周末的法定节假日才计入 holidaysCount
            // 因为周末本来就不上班，不需要额外计算
            if (!isWeekend) {
                isHoliday = true;
            }
        }
        // 3. 如果是周一到周五，计算为工作日
        else if (weekday >= 1 && weekday <= 5) {
            isWorkday = true;
        }

        // 统计工作日（考虑入职时间）
        if (isWorkday) {
            if (!joinDateOnly || dateOnly >= joinDateOnly) {
                totalWorkdays++;
            }

            if (!joinDateOnly || dateOnly >= joinDateOnly) {
                if (isCurrentMonth) {
                    if (dateOnly <= today) {
                        workdaysUntilToday++;
                    }
                } else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth())) {
                    workdaysUntilToday++;
                }
            }
        }

        // 统计法定节假日（非周末）
        if (isHoliday) {
            if (!joinDateOnly || dateOnly >= joinDateOnly) {
                holidaysCount++;
            }
        }
    }

    return { totalWorkdays, workdaysUntilToday, holidaysCount };
}

const getLateMinutes = (
    record: PunchRecord | undefined,
    processDetail: any | undefined,
    lastFridayOffDutyTime: Date | null | undefined,
    yesterdayApprove2030: boolean,
    isFirstDayOnJob: boolean,
    holidays: any
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
        const isFirstWorkday = firstWorkday && firstWorkday.getFullYear() === year && firstWorkday.getMonth() === month && firstWorkday.getDate() === day;
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
                targetTime = leaveEndTime < afternoonStart ? afternoonStart : leaveEndTime;
            }
        }
    }

    if (yesterdayApprove2030) {
        targetTime = new Date(year, month, day, 9, 30, 0).getTime();
    }

    if (isFirstDayOnJob && checkInDate.getFullYear() === new Date(userTime).getFullYear() && checkInDate.getMonth() === new Date(userTime).getMonth()) {
        return 0;
    }

    return Math.max(0, Math.floor((userTime - targetTime) / 60000));
};

// --- Main Hook ---
export const useAttendanceStats = (
    allUsers: DingTalkUser[],
    attendanceMap: AttendanceMap,
    processDataMap: Record<string, any>,
    holidays: HolidayMap,
    year?: number,
    month?: number,
    ruleUpdateTrigger?: number // 🔥 新增：规则更新触发器
) => {
    return useMemo(() => {

        const statsByCompany: CompanyEmployeeStats = {};
        const aggByCompany: CompanyAggregateStats = {};
        const dailyTrendMapByCompany: Record<string, Record<number, DailyTrend>> = {};
        
        // Cache configs to avoid repeated local storage reads
        const companyConfigs: Record<string, any> = {};

        const now = new Date();
        const currentYear = year || now.getFullYear();
        const currentMonth = month !== undefined ? month : now.getMonth();
        const currentDay = now.getDate();

        allUsers.forEach(user => {
            const company = user.mainCompany || 'Unknown';
            
            // 🔥 使用考勤规则引擎
            const companyKey = (company.includes('海多多') || company === 'hydodo') ? 'hydodo' : 'eyewind';
            const ruleEngine = AttendanceRuleManager.getEngine(companyKey);
            
            // Lazy load config for this company (保留用于其他用途)
            if (!companyConfigs[company]) {
                const config = getAppConfig(companyKey);
                companyConfigs[company] = {
                    maxPenalty: config.rules?.maxPerformancePenalty || 250 // Default to 250 if not set
                };
            }

            const stats: EmployeeStats = {
                late: 0, missing: 0, absenteeism: 0, annual: 0, sick: 0, seriousSick: 0, personal: 0, trip: 0, compTime: 0,
                lateMinutes: 0, exemptedLateMinutes: 0, performancePenalty: 0, monthlyExemptionUsed: 0,
                isFullAttendance: true, annualHours: 0, sickHours: 0, seriousSickHours: 0, personalHours: 0, tripHours: 0,
                compTimeHours: 0, shouldAttendanceDays: 0, actualAttendanceDays: 0,
                bereavement: 0, paternity: 0, maternity: 0, parental: 0, marriage: 0,
                bereavementHours: 0, paternityHours: 0, maternityHours: 0, parentalHours: 0, marriageHours: 0,
                overtimeTotalMinutes: 0, overtime19_5Minutes: 0, overtime20_5Minutes: 0, overtime22Minutes: 0,
                overtime24Minutes: 0, overtime19_5Count: 0, overtime20_5Count: 0, overtime22Count: 0, overtime24Count: 0,
            };

            if (!statsByCompany[company]) {
                statsByCompany[company] = [];
                aggByCompany[company] = { totalLateMinutes: 0, abnormalUserCount: 0, totalRecords: 0, abnormalRecords: 0 };
            }

            // 🔥 在用户级别计算应出勤天数（整个月的工作日，考虑入职时间）
            const workdaysInfo = getWorkdaysOfMonth(currentYear, currentMonth, holidays, user.create_time, currentYear, currentMonth);
            // 🔥 根据规则配置获取应出勤天数（支持固定天数设置）
            // 应出勤天数 = 工作日 + 法定节假日（如果配置了包含法定节假日）
            stats.shouldAttendanceDays = getShouldAttendanceDays(companyKey, workdaysInfo.totalWorkdays, workdaysInfo.holidaysCount);
            // 初始化实际出勤天数为截至今天的工作日数（后面会减去请假天数）
            stats.actualAttendanceDays = workdaysInfo.workdaysUntilToday;

            const userAttendance = attendanceMap[user.userid];
            if (userAttendance) {
                // 🔥 修复：使用 Object.entries 遍历，直接使用 key 作为工作日期的天数
                // attendanceMap 的结构是 {[day]: DailyAttendanceStatus}，key 就是正确的工作日期
                Object.entries(userAttendance).forEach(([dayKey, daily]: [string, DailyAttendanceStatus]) => {
                    // 🔥 修复：直接使用 attendanceMap 的 key 作为天数，而不是从 workDate 解析
                    const day = parseInt(dayKey);
                    const year = currentYear; // 使用查询参数中的年份
                    const month = currentMonth; // 使用查询参数中的月份
                    
                    // 🔥 构造正确的工作日期
                    const workDate = new Date(year, month, day);
                    
                    // 🔥 调试：记录 attendanceMap 的 key 和构造的工作日期
                    // if (user.name === '张棣苍' && day <= 10) {
                    //     console.log(`[调试-attendanceMap] ${user.name} dayKey=${dayKey}, day=${day}, 工作日期=${workDate.toISOString().split('T')[0]}, 打卡记录数=${daily.records.length}`);
                    //     if (daily.records.length > 0) {
                    //         console.log(`  第一条打卡记录: workDate=${daily.records[0].workDate}, userCheckTime=${daily.records[0].userCheckTime}`);
                    //     }
                    // }
                    
                    // 🔥 严格验证：只处理属于当前查询月份的数据
                    if (year !== currentYear || month !== currentMonth) {
                        return; // 跳过这条记录
                    }

                    const isToday = year === currentYear && month === currentMonth && day === currentDay;

                    // Determine if it is a working day based on holidays config
                    const dateKey = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const holidayInfo = holidays ? holidays[dateKey] : null;
                    const isWeekend = workDate.getDay() === 0 || workDate.getDay() === 6;
                    let isWorkDay = !isWeekend;
                    if (holidayInfo) {
                        if (holidayInfo.holiday === false) isWorkDay = true; // Shift (work on weekend)
                        else if (holidayInfo.holiday === true) isWorkDay = false; // Holiday
                    }

                    if (!dailyTrendMapByCompany[company]) dailyTrendMapByCompany[company] = {};
                    if (!dailyTrendMapByCompany[company][day]) {
                        dailyTrendMapByCompany[company][day] = {
                            day: `${month + 1}月${day}日`, late: 0, missing: 0, annual: 0, sick: 0,
                            personal: 0, trip: 0, compTime: 0, bereavement: 0, paternity: 0,
                            maternity: 0, parental: 0, marriage: 0
                        };
                    }
                    let hasFullDayLeave = false;
                    const processedProcInstIds = new Set();
                    let hasProcessedLate = false; // 🔥 新增：标记是否已处理过迟到（每天只计算一次）

                    // Calculate total daily leave duration to handle split leaves
                    const totalDailyLeaveHours = calculateDailyLeaveDuration(daily.records, processDataMap, year, dateKey, user.mainCompany);
                    if (totalDailyLeaveHours >= (user?.mainCompany?.includes('成都') ? 8.5 : 8)) {
                        hasFullDayLeave = true;
                    }

                    daily.records.forEach(record => {
                        let processDetail = null;
                        if (record.procInstId && !processedProcInstIds.has(record.procInstId)) {
                            processedProcInstIds.add(record.procInstId);
                            processDetail = processDataMap[record.procInstId];
                            if (processDetail) {
                                const hours = getLeaveDuration(processDetail, `${year}-${dateKey}`, user.mainCompany);
                
                                const type = processDetail.formValues?.leaveType || processDetail.bizType;
                                // Fix: Define a specific type for leave keys to ensure type safety and prevent symbol conversion errors.
                                type LeaveTypeKeys = 'annual' | 'sick' | 'personal' | 'trip' | 'compTime' | 'bereavement' | 'paternity' | 'maternity' | 'parental' | 'marriage';
                                const typeMappings: Record<string, LeaveTypeKeys> = {
                                    '年假': 'annual', '病假': 'sick', '事假': 'personal', '出差': 'trip', '外出': 'trip',
                                    '调休': 'compTime', '丧假': 'bereavement', '陪产假': 'paternity', '产假': 'maternity',
                                    '育儿假': 'parental', '婚假': 'marriage'
                                };
                                const statKey = typeMappings[type];

                                if (statKey) {
                                    // Special handling for Sick Leave: Split into normal and serious (>24h)
                                    if (type === '病假') {
                                        const totalDuration = parseFloat(processDetail.formValues?.duration || '0');
                                        const u = processDetail.formValues?.durationUnit || processDetail.formValues?.unit || '';
                                        let totalHours = totalDuration;
                                        if (u.includes('day') || u.includes('天')) {
                                            totalHours = totalDuration * (user?.mainCompany?.includes('成都') ? 8.5 : 8);
                                        }
                                        
                                        if (totalHours > (user?.mainCompany?.includes('成都') ? 25.5 : 24)) {
                                            // > 24 hours: Serious Sick
                                            stats.seriousSick = (stats.seriousSick || 0) + 1;
                                            stats.seriousSickHours = (stats.seriousSickHours || 0) + hours;
                                        } else {
                                            // <= 24 hours: Normal Sick
                                            stats.sick = (stats.sick || 0) + 1;
                                            stats.sickHours = (stats.sickHours || 0) + hours;
                                        }
                                        
                                        // Update Daily Trend (Keep both under 'sick' for chart continuity)
                                        if (dailyTrendMapByCompany[company][day].sick !== undefined) {
                                            dailyTrendMapByCompany[company][day].sick++;
                                        }
                                    } else {
                                        // Normal handling for other leaves
                                        (stats[statKey] as number) = ((stats[statKey] as number) || 0) + 1;
                                        const hourKey = `${statKey}Hours` as keyof EmployeeStats;
                                        (stats[hourKey] as number) = ((stats[hourKey] as number) || 0) + hours;
                                        
                                        if (dailyTrendMapByCompany[company][day][statKey] !== undefined) {
                                            (dailyTrendMapByCompany[company][day][statKey] as number)++;
                                        }
                                    }
                                }
                                if (isFullDayLeave(processDetail, user.mainCompany)) hasFullDayLeave = true;
                            }
                        }

                        // 🔥 使用规则引擎计算迟到分钟数（支持跨天/跨周/跨月规则）
                        // 🔥 修复：每天只计算一次迟到，避免重复计算（一天可能有多条上班打卡记录）
                        // 🔥 重要：不依赖 timeResult，对所有 OnDuty 记录都计算迟到分钟数
                        if (record.checkType === 'OnDuty' && !hasProcessedLate) {
                            hasProcessedLate = true; // 🔥 标记已处理，后续的迟到记录不再重复计算
                            
                            // 🔥 向前查询回调函数：查找前 N 天的下班打卡时间
                            const lookbackCheckoutFinder = (daysBack: number): Date | undefined => {
                                const targetDate = new Date(workDate);
                                targetDate.setDate(targetDate.getDate() - daysBack);
                                const targetDay = targetDate.getDate();
                                
                                // console.log(`[lookbackCheckoutFinder] 查找前${daysBack}天的下班打卡`, {
                                //     用户: user.name,
                                //     当前日期: workDate.toISOString().split('T')[0],
                                //     目标日期: targetDate.toISOString().split('T')[0],
                                //     目标天数: targetDay,
                                //     userAttendance可用天数: Object.keys(userAttendance)
                                // });
                                
                                // 🔥 简化：直接使用天数访问 userAttendance，与 previousDayCheckoutTime 的逻辑一致
                                const targetDayAttendance = userAttendance[String(targetDay)];
                                
                                // console.log(`[lookbackCheckoutFinder] targetDayAttendance:`, {
                                //     存在: !!targetDayAttendance,
                                //     记录数: targetDayAttendance?.records?.length || 0
                                // });
                                
                                if (targetDayAttendance) {
                                    const offDutyRecords = targetDayAttendance.records.filter(r => 
                                        r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned'
                                    );
                                    
                                    // console.log(`[lookbackCheckoutFinder] 下班打卡记录数: ${offDutyRecords.length}`);
                                    
                                    if (offDutyRecords.length > 0) {
                                        // 取最晚的下班打卡
                                        const latestOffDuty = offDutyRecords.reduce((latest, current) => {
                                            return new Date(current.userCheckTime) > new Date(latest.userCheckTime) ? current : latest;
                                        });
                                        const result = new Date(latestOffDuty.userCheckTime);
                                        // console.log(`[lookbackCheckoutFinder] 找到下班打卡: ${result.toISOString()}`);
                                        return result;
                                    }
                                }
                                
                                // console.log(`[lookbackCheckoutFinder] 未找到下班打卡，返回 undefined`);
                                return undefined;
                            };
                            
                            // 查找前一天的下班打卡时间（用于跨天规则）
                            let previousDayCheckoutTime: Date | undefined;
                            const previousDay = new Date(workDate);
                            previousDay.setDate(previousDay.getDate() - 1);
                            const previousDayAttendance = userAttendance[String(previousDay.getDate())];
                            if (previousDayAttendance) {
                                const offDutyRecords = previousDayAttendance.records.filter(r => 
                                    r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned'
                                );
                                if (offDutyRecords.length > 0) {
                                    // 取最晚的下班打卡
                                    const latestOffDuty = offDutyRecords.reduce((latest, current) => {
                                        return new Date(current.userCheckTime) > new Date(latest.userCheckTime) ? current : latest;
                                    });
                                    previousDayCheckoutTime = new Date(latestOffDuty.userCheckTime);
                                }
                            }
                            
                            // 🔥 查找上周末或周五的下班打卡时间（用于跨周规则，仅周一需要）
                            let previousWeekendCheckoutTime: Date | undefined;
                            const currentDayOfWeek = workDate.getDay(); // 0=周日, 1=周一, ..., 6=周六
                            
                            if (currentDayOfWeek === 1) { // 周一
                                const { saturday, sunday } = ruleEngine.getPreviousWeekend(workDate);
                                
                                // 🔥 修复：使用年月日直接构造周五日期，避免时区问题
                                const mondayYear = workDate.getFullYear();
                                const mondayMonth = workDate.getMonth();
                                const mondayDay = workDate.getDate();
                                
                                // 计算周五的日期（周一 - 3天）
                                const friday = new Date(mondayYear, mondayMonth, mondayDay - 3);
                                
                                // 🔥 跨周规则：按照优先级查找 周日 > 周六 > 周五
                                const sundayDay = sunday.getDate();
                                const sundayYear = sunday.getFullYear();
                                const sundayMonth = sunday.getMonth();
                                
                                // 遍历所有数据查找匹配的周日，不受月份限制
                                let sundayAttendance = null;
                                for (const [dayKey, dailyData] of Object.entries(userAttendance)) {
                                    if (dailyData.records.length > 0) {
                                        const recordWorkDate = dailyData.records[0].workDate;
                                        const recordDate = parseWorkDate(recordWorkDate);
                                        
                                        if (recordDate.getFullYear() === sundayYear && 
                                            recordDate.getMonth() === sundayMonth && 
                                            recordDate.getDate() === sundayDay) {
                                            sundayAttendance = dailyData;
                                            break;
                                        }
                                    }
                                }
                                
                                if (sundayAttendance) {
                                    const sundayOffDuty = sundayAttendance.records.filter(r => 
                                        r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned'
                                    );
                                    if (sundayOffDuty.length > 0) {
                                        const latestSundayOffDuty = sundayOffDuty.reduce((latest, current) => {
                                            return new Date(current.userCheckTime) > new Date(latest.userCheckTime) ? current : latest;
                                        });
                                        previousWeekendCheckoutTime = new Date(latestSundayOffDuty.userCheckTime);
                                    }
                                }
                                
                                // 如果周日没有打卡，查找周六
                                if (!previousWeekendCheckoutTime) {
                                    const saturdayDay = saturday.getDate();
                                    const saturdayYear = saturday.getFullYear();
                                    const saturdayMonth = saturday.getMonth();
                                    
                                    let saturdayAttendance = null;
                                    for (const [dayKey, dailyData] of Object.entries(userAttendance)) {
                                        if (dailyData.records.length > 0) {
                                            const recordWorkDate = dailyData.records[0].workDate;
                                            const recordDate = parseWorkDate(recordWorkDate);
                                            
                                            if (recordDate.getFullYear() === saturdayYear && 
                                                recordDate.getMonth() === saturdayMonth && 
                                                recordDate.getDate() === saturdayDay) {
                                                saturdayAttendance = dailyData;
                                                break;
                                            }
                                        }
                                    }
                                    
                                    if (saturdayAttendance) {
                                        const saturdayOffDuty = saturdayAttendance.records.filter(r => 
                                            r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned'
                                        );
                                        if (saturdayOffDuty.length > 0) {
                                            const latestSaturdayOffDuty = saturdayOffDuty.reduce((latest, current) => {
                                                return new Date(current.userCheckTime) > new Date(latest.userCheckTime) ? current : latest;
                                            });
                                            previousWeekendCheckoutTime = new Date(latestSaturdayOffDuty.userCheckTime);
                                        }
                                    }
                                }
                                
                                // 如果周末都没有打卡，查找周五
                                if (!previousWeekendCheckoutTime) {
                                    const fridayDay = friday.getDate();
                                    const fridayYear = friday.getFullYear();
                                    const fridayMonth = friday.getMonth();
                                    
                                    let fridayAttendance = null;
                                    for (const [dayKey, dailyData] of Object.entries(userAttendance)) {
                                        if (dailyData.records.length > 0) {
                                            const recordWorkDate = dailyData.records[0].workDate;
                                            const recordDate = parseWorkDate(recordWorkDate);
                                            
                                            if (recordDate.getFullYear() === fridayYear && 
                                                recordDate.getMonth() === fridayMonth && 
                                                recordDate.getDate() === fridayDay) {
                                                fridayAttendance = dailyData;
                                                break;
                                            }
                                        }
                                    }
                                    
                                    if (fridayAttendance) {
                                        const fridayOffDuty = fridayAttendance.records.filter(r => 
                                            r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned'
                                        );
                                        
                                        if (fridayOffDuty.length > 0) {
                                            const latestFridayOffDuty = fridayOffDuty.reduce((latest, current) => {
                                                return new Date(current.userCheckTime) > new Date(latest.userCheckTime) ? current : latest;
                                            });
                                            previousWeekendCheckoutTime = new Date(latestFridayOffDuty.userCheckTime);
                                        }
                                    }
                                }
                            }
                            
                            // 🔥 查找上月最后一个工作日的下班打卡时间（用于跨月规则）
                            let previousMonthCheckoutTime: Date | undefined;
                            
                            // 🔥 判断当前日期是否是本月第一个工作日（使用规则引擎的方法）
                            // 注意：不能简单使用 day === 1，因为1号可能是周末或节假日
                            const isFirstWorkdayOfMonth = (() => {
                                // 首先检查当前日期是否是工作日
                                if (!isWorkDay) return false;
                                
                                // 🔥 调试：记录2月1-3日的判断过程
                                // if (month === 1 && day <= 3) {
                                //     console.log(`[跨月规则调试] ${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}, 星期${workDate.getDay()}, isWorkDay=${isWorkDay}, 用户: ${user.name}`);
                                // }
                                
                                // 检查当前日期之前是否有工作日
                                for (let d = 1; d < day; d++) {
                                    const checkDate = new Date(year, month, d);
                                    const checkDayOfWeek = checkDate.getDay();
                                    const checkIsWeekend = checkDayOfWeek === 0 || checkDayOfWeek === 6;
                                    const checkDateKey = `${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                    const checkHolidayInfo = holidays?.[checkDateKey];
                                    
                                    let checkIsWorkday = !checkIsWeekend;
                                    if (checkHolidayInfo) {
                                        if (checkHolidayInfo.holiday === false) checkIsWorkday = true;
                                        else if (checkHolidayInfo.holiday === true) checkIsWorkday = false;
                                    }
                                    
                                    if (checkIsWorkday) return false; // 找到了更早的工作日
                                }
                                
                                // 🔥 调试：记录判断结果
                                // if (month === 1 && day <= 3) {
                                //     console.log(`[跨月规则调试] ${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')} 是本月第一个工作日！`);
                                // }
                                
                                return true; // 当前日期是本月第一个工作日
                            })();
                            
                            if (isFirstWorkdayOfMonth) {
                                // 🔥 调试：记录跨月规则检测
                                // console.log(`[跨月规则] 检测到本月第一个工作日: ${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}, 用户: ${user.name}`);
                                
                                // 🔥 从用户的所有打卡记录中找上个月的最后一条下班打卡
                                let lastMonthCheckouts: Array<{ date: Date; record: PunchRecord }> = [];
                                
                                const previousMonth = month === 0 ? 11 : month - 1;
                                const previousYear = month === 0 ? year - 1 : year;
                                
                                // console.log(`[跨月规则] ${user.name} - punchData总记录数: ${user.punchData?.length || 0}, 查找上月: ${previousYear}-${String(previousMonth+1).padStart(2,'0')}`);
                                
                                // 遍历用户的所有打卡记录
                                if (user.punchData && user.punchData.length > 0) {
                                    user.punchData.forEach(record => {
                                        const recordDate = parseWorkDate(record.workDate);
                                        const recordYear = recordDate.getFullYear();
                                        const recordMonth = recordDate.getMonth();
                                        
                                        // 只看上个月的下班打卡
                                        if (recordYear === previousYear && recordMonth === previousMonth) {
                                            if (record.checkType === 'OffDuty' && record.timeResult !== 'NotSigned') {
                                                lastMonthCheckouts.push({
                                                    date: new Date(record.userCheckTime),
                                                    record: record
                                                });
                                            }
                                        }
                                    });
                                }
                                
                                // console.log(`[跨月规则] ${user.name} - 上月下班打卡总数: ${lastMonthCheckouts.length}`);
                                
                                // 如果找到了上个月的下班打卡，取最晚的一条
                                if (lastMonthCheckouts.length > 0) {
                                    const latestCheckout = lastMonthCheckouts.reduce((latest, current) => {
                                        return current.date > latest.date ? current : latest;
                                    });
                                    
                                    previousMonthCheckoutTime = latestCheckout.date;
                                    // console.log(`[跨月规则] ${user.name} - 找到上月最后下班打卡: ${previousMonthCheckoutTime.toISOString()}`);
                                } else {
                                    // 🔥 如果上个月没有任何下班打卡记录，默认使用18:30
                                    const lastDayOfPreviousMonth = new Date(year, month, 0).getDate();
                                    previousMonthCheckoutTime = new Date(previousYear, previousMonth, lastDayOfPreviousMonth, 18, 30, 0);
                                    // console.log(`[跨月规则] ${user.name} - 上月无下班打卡记录，使用默认18:30`);
                                }
                            }
                            
                            // 🔥 使用规则引擎计算迟到分钟数（根据考勤规则配置）
                            // 构造正确的工作日期
                            const correctWorkDate = new Date(year, month, day);
                            
                            const minutes = ruleEngine.calculateLateMinutes(
                                record,
                                correctWorkDate,
                                previousDayCheckoutTime,
                                previousWeekendCheckoutTime,
                                previousMonthCheckoutTime,
                                holidays,
                                processDetail,
                                user.name,
                                lookbackCheckoutFinder
                            );
                            
                            // 🔥 重要：只有工作日才计算迟到，周末加班不计算迟到
                            if (minutes > 0 && isWorkDay) {
                                stats.late++;
                                stats.lateMinutes += minutes;
                                dailyTrendMapByCompany[company][day].late++;

                                // 🔥 调试：记录迟到累加过程
                                if (user.name === '岳可') {
                                    console.log(`[迟到累加] ${user.name} - ${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}: 本次迟到${minutes}分钟，累计迟到${stats.lateMinutes}分钟，isWorkDay=${isWorkDay}`);
                                }

                                // 🔥 收集迟到记录，稍后统一计算豁免
                                if (!stats.lateRecords) {
                                    stats.lateRecords = [];
                                }
                                stats.lateRecords.push({
                                    day: day,
                                    minutes: minutes,
                                    isWorkday: isWorkDay // 使用已经计算好的 isWorkDay 变量
                                });
                            } else if (minutes > 0 && !isWorkDay) {
                                // 🔥 调试：记录周末加班不计算迟到
                                if (user.name === '岳可') {
                                    console.log(`[迟到跳过] ${user.name} - ${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}: 周末加班，不计算迟到（原本会计算${minutes}分钟）`);
                                }
                            }
                        }
                    });


                    Object.keys(dailyTrendMapByCompany[company][day]).forEach(key => {
                        if (['annual', 'sick', 'personal', 'trip', 'compTime', 'bereavement', 'paternity', 'maternity', 'parental', 'marriage'].includes(key)) {
                            (dailyTrendMapByCompany[company][day][key as keyof DailyTrend] as number) = Math.round((dailyTrendMapByCompany[company][day][key as keyof DailyTrend] as number) / 2);
                        }
                    });

                    // Determine Missing (缺卡) or Absenteeism (旷工)
                    // Check if there are valid punches (not 'NotSigned')

                    const hasValidOnDuty = daily.records.find(r => r.checkType === 'OnDuty' && r.timeResult === 'NotSigned' && new Date(r.baseCheckTime).getHours() <= 10);
                    const hasValidOffDuty = daily.records.find(r => r.checkType === 'OffDuty' && r.timeResult === 'NotSigned');
                    
                    // -- New Logic: Check Coverage for Missing Punches --
                    const workStart = new Date(year, month, day, 9, 0, 0, 0);
                    const workEnd = new Date(year, month, day, 18, 30, 0, 0);
                    
                    let onDutyIsCovered = false;
                    let offDutyIsCovered = false;

                    if (hasValidOnDuty) {
                        onDutyIsCovered = checkTimeInLeaveRange(processDataMap, daily.records, workStart).isCovered;
                    }
                    if (hasValidOffDuty) {
                        offDutyIsCovered = checkTimeInLeaveRange(processDataMap, daily.records, workEnd).isCovered;
                    }

                    // A punch is "effectively valid" if it exists OR if it's missing but covered by leave
                    const effectivelyHasOn = !hasValidOnDuty || onDutyIsCovered; 
                    const effectivelyHasOff = !hasValidOffDuty || offDutyIsCovered;

                    // Logic update: Ensure we don't mark absent if aggregate leave hours are sufficient OR if specific times are covered
                    if (!effectivelyHasOn && !effectivelyHasOff && isWorkDay && !hasFullDayLeave) {
                        // No valid punches AND not covered by leave on a workday = Absenteeism
                        stats.absenteeism++;
                    }
                    
                    // Check for Missing Punches (Single Side)
                    if (!hasFullDayLeave && !isToday) {
                        // Check On Duty Missing
                        if (hasValidOnDuty && !onDutyIsCovered) {
                            stats.missing++;
                            dailyTrendMapByCompany[company][day].missing++;
                        }
                        // Check Off Duty Missing
                        if (hasValidOffDuty && !offDutyIsCovered) {
                            stats.missing++;
                            dailyTrendMapByCompany[company][day].missing++;
                        }
                    }

                    const validOffDutyRecords = daily.records.filter(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');
                    const offRecord = validOffDutyRecords[validOffDutyRecords.length - 1];
                    if (offRecord) {
                        const offTime = new Date(offRecord.userCheckTime);
                        
                        // 🔥 使用规则引擎计算加班
                        const overtimeResult = ruleEngine.calculateOvertime(offTime, workDate);
                        
                        stats.overtimeTotalMinutes = Number((stats.overtimeTotalMinutes + overtimeResult.totalMinutes).toFixed(2));
                        
                        // 更新各个时间段的加班统计
                        Object.entries(overtimeResult.checkpoints).forEach(([key, data]) => {
                            // 映射时间键名到字段名
                            let fieldSuffix = '';
                            switch(key) {
                                case '19_30':
                                    fieldSuffix = '19_5';
                                    break;
                                case '20_30':
                                    fieldSuffix = '20_5';
                                    break;
                                case '22_00':
                                    fieldSuffix = '22';
                                    break;
                                case '24_00':
                                case '00_00':
                                    fieldSuffix = '24';
                                    break;
                                default:
                                    return;
                            }
                            
                            const countKey = `overtime${fieldSuffix}Count` as keyof EmployeeStats;
                            const minutesKey = `overtime${fieldSuffix}Minutes` as keyof EmployeeStats;
                            
                            (stats[countKey] as number) += data.count;
                            (stats[minutesKey] as number) = Number(((stats[minutesKey] as number) + data.minutes).toFixed(2));
                        });
                    }

                    (stats[`overtimeTotalMinutes` as keyof EmployeeStats] as number) = Number(stats[`overtimeTotalMinutes`].toFixed(2))

                });
            }
            
            // 🔥 计算实际出勤天数：应出勤天数 - 各类请假天数（除了调休和出差）
            // 使用小时数除以每日工作时长来计算请假天数
            const dailyHours = (company?.includes('成都') ? 8.5 : 8);
            const sickDays = Math.ceil((stats.sickHours || 0) / dailyHours);
            const seriousSickDays = Math.ceil((stats.seriousSickHours || 0) / dailyHours);
            const personalDays = Math.ceil((stats.personalHours || 0) / dailyHours);
            const annualDays = Math.ceil((stats.annualHours || 0) / dailyHours);
            const bereavementDays = Math.ceil((stats.bereavementHours || 0) / dailyHours);
            const maternityDays = Math.ceil((stats.maternityHours || 0) / dailyHours);
            const paternityDays = Math.ceil((stats.paternityHours || 0) / dailyHours);
            const parentalDays = Math.ceil((stats.parentalHours || 0) / dailyHours);
            const marriageDays = Math.ceil((stats.marriageHours || 0) / dailyHours);
            
            // 🔥 修复：实际出勤天数 = 应出勤天数 - 各类请假天数（不包括调休和出差）
            // 调休(compTime)和出差(trip)不应该减少实际出勤天数，因为它们算作正常出勤
            const totalLeaveDays = sickDays + seriousSickDays + personalDays + annualDays + 
                                   bereavementDays + maternityDays + paternityDays + parentalDays + marriageDays;
            
            stats.actualAttendanceDays = Math.max(0, stats.shouldAttendanceDays - totalLeaveDays);

            // 🔥 注意：绩效扣款计算移到豁免计算之后（见下方）

            // 🔥 使用规则引擎判定全勤（在所有统计完成后）
            const fullAttendanceStats = {
                late: stats.late,
                missing: stats.missing,
                absenteeism: stats.absenteeism,
                annual: stats.annual,
                sick: stats.sick,
                personal: stats.personal,
                bereavement: stats.bereavement || 0,
                paternity: stats.paternity || 0,
                maternity: stats.maternity || 0,
                parental: stats.parental || 0,
                marriage: stats.marriage || 0,
                trip: stats.trip,
                compTime: stats.compTime,
                annualHours: stats.annualHours,
                sickHours: stats.sickHours,
                personalHours: stats.personalHours,
                bereavementHours: stats.bereavementHours || 0,
                paternityHours: stats.paternityHours || 0,
                maternityHours: stats.maternityHours || 0,
                parentalHours: stats.parentalHours || 0,
                marriageHours: stats.marriageHours || 0,
                tripHours: stats.tripHours,
                compTimeHours: stats.compTimeHours
            };
            
            // 先使用规则引擎的基础判定
            let engineFullAttendance = ruleEngine.isFullAttendance(fullAttendanceStats);
            
            // 然后应用额外的业务规则（最后工作日打卡检查等）
            if (engineFullAttendance) {
                // 🔥 优化全勤判定规则：检查当月最后一个工作日的下班打卡
                const lastWorkDay = getLastWorkDayOfMonth(currentYear, currentMonth, holidays);
                if (lastWorkDay) {
                    const lastWorkDayAttendance = attendanceMap[user.userid]?.[lastWorkDay];
                    if (lastWorkDayAttendance) {
                        const hasValidOffDuty = lastWorkDayAttendance.records?.some(r => 
                            r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned'
                        );
                        
                        // 如果最后一个工作日没有有效的下班打卡，取消全勤
                        if (!hasValidOffDuty) {
                            engineFullAttendance = false;
                        }
                    } else {
                        // 如果最后一个工作日没有考勤记录，取消全勤
                        engineFullAttendance = false;
                    }
                }
                
                // 额外检查：确保员工在当月最后一个工作日之前没有离职
                // 如果员工的最后打卡日期早于最后工作日，可能是月中离职
                if (lastWorkDay && engineFullAttendance) {
                    const userLastPunchDay = Math.max(...Object.keys(attendanceMap[user.userid] || {}).map(Number).filter(day => !isNaN(day)));
                    if (userLastPunchDay > 0 && userLastPunchDay < lastWorkDay) {
                        // 检查最后打卡日之后是否有请假记录
                        let hasLeaveAfterLastPunch = false;
                        for (let day = userLastPunchDay + 1; day <= lastWorkDay; day++) {
                            const dayAttendance = attendanceMap[user.userid]?.[day];
                            if (dayAttendance?.records?.some(r => r.procInstId)) {
                                hasLeaveAfterLastPunch = true;
                                break;
                            }
                        }
                        
                        if (!hasLeaveAfterLastPunch) {
                            engineFullAttendance = false;
                        }
                    }
                }
            }
            
            // 🔥 统一计算豁免（根据配置的豁免模式）
            if (stats.lateRecords && stats.lateRecords.length > 0) {
                const exemptionMode = ruleEngine.getRules().lateExemptionMode || 'byDate';
                const maxExemptions = ruleEngine.getRules().lateExemptionCount;
                const exemptionThreshold = ruleEngine.getRules().lateExemptionMinutes;
                
                // 🔥 调试：记录豁免计算前的状态
                if (user.name === '岳可') {
                    console.log(`[豁免计算] ${user.name} - 迟到记录:`, stats.lateRecords);
                    console.log(`[豁免计算] ${user.name} - 累计迟到: ${stats.lateMinutes}分钟，豁免模式: ${exemptionMode}，最大豁免次数: ${maxExemptions}，豁免阈值: ${exemptionThreshold}分钟`);
                }
                
                // 根据豁免模式排序迟到记录
                let sortedLateRecords = [...stats.lateRecords];
                if (exemptionMode === 'byMinutes') {
                    // 按迟到分钟数从大到小排序
                    sortedLateRecords.sort((a, b) => b.minutes - a.minutes);
                } else {
                    // 按日期从月初到月末排序（默认）
                    sortedLateRecords.sort((a, b) => a.day - b.day);
                }
                
                // 应用豁免
                let exemptionUsed = 0;
                stats.exemptedLateMinutes = 0;
                
                sortedLateRecords.forEach(record => {
                    if (exemptionUsed < maxExemptions && record.isWorkday) {
                        if (record.minutes <= exemptionThreshold) {
                            // 完全豁免
                            exemptionUsed++;
                        } else {
                            // 部分豁免
                            stats.exemptedLateMinutes += (record.minutes - exemptionThreshold);
                            exemptionUsed++;
                        }
                    } else {
                        // 不豁免
                        stats.exemptedLateMinutes += record.minutes;
                    }
                });
                
                stats.monthlyExemptionUsed = exemptionUsed;
                (stats as any).exemptedLate = exemptionUsed;
                
                // 🔥 调试：记录豁免计算后的结果
                if (user.name === '岳可') {
                    console.log(`[豁免计算] ${user.name} - 豁免后迟到: ${stats.exemptedLateMinutes}分钟，已使用豁免次数: ${exemptionUsed}`);
                }
                
                // 清理临时数据
                delete stats.lateRecords;
            }
            
            // 🔥 重要：在豁免计算完成后，再计算绩效扣款
            stats.performancePenalty = ruleEngine.calculatePerformancePenalty(stats.exemptedLateMinutes || 0);
            
            // 设置最终的全勤状态
            stats.isFullAttendance = engineFullAttendance;
            
            // 🔥 计算全勤奖金额
            (stats as any).fullAttendanceBonus = ruleEngine.calculateFullAttendanceBonus(engineFullAttendance);

            statsByCompany[company].push({ user, stats });

            aggByCompany[company].totalLateMinutes += stats.lateMinutes;
            // Update abnormal condition: Late > 30 OR Missing > 3 OR Absenteeism > 1
            if (stats.exemptedLateMinutes > 30 || stats.missing > 3 || stats.absenteeism >= 1) {
                aggByCompany[company].abnormalUserCount++;
            }
        });


        // 🔥 优化排序逻辑：按照新的排序规则
        // 排序优先级：旷工次数从高到低 → 豁免后迟到从高到低 → 累计迟到从高到低 → 缺卡次数从高到低 → 全勤
        Object.keys(statsByCompany).forEach(company => {
            statsByCompany[company].sort((a, b) => {
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
                
                // 1. 旷工次数从高到低（有旷工的排在最前面）
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
        });

        const dailyTrend: DailyTrendMap = {};
        for (const company in dailyTrendMapByCompany) {
            dailyTrend[company] = Object.values(dailyTrendMapByCompany[company]).sort((a, b) => {
                const dayA = parseInt(a.day.split('月')[1]);
                const dayB = parseInt(b.day.split('月')[1]);
                return dayA - dayB;
            });
        }

        return { 
            companyEmployeeStats: statsByCompany, 
            companyAggregate: aggByCompany, 
            dailyTrend
        };

    }, [allUsers, attendanceMap, processDataMap, holidays, ruleUpdateTrigger]);
};
