
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
    
    console.log(`[getShouldAttendanceDays] ${companyKey} 配置:`, {
        method: rules?.shouldAttendanceCalcMethod,
        fixedDays: rules?.fixedShouldAttendanceDays,
        workdaysCount,
        holidaysCount
    });
    
    if (!rules?.enabled) {
        return workdaysCount;
    }
    
    // 根据计算方法返回应出勤天数
    switch (rules.shouldAttendanceCalcMethod) {
        case 'fixed':
            // 使用固定天数
            const fixedDays = rules.fixedShouldAttendanceDays ?? workdaysCount;
            console.log(`[getShouldAttendanceDays] 使用固定天数: ${fixedDays}`);
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
    month?: number
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
                // Fix: Iterate using entries to get the day even if records are missing, though usually attendanceMap has entries
                Object.values(userAttendance).forEach((daily: DailyAttendanceStatus) => {
                    const workDate = new Date(daily.records[0]?.workDate || 0);
                    // Fallback if records are empty is tricky, assuming data integrity or we rely on what's present
                    if (daily.records.length === 0) return;

                    const day = workDate.getDate();
                    const year = workDate.getFullYear();
                    const month = workDate.getMonth();

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

                        let yesterdayApprove2030 = false;
                        const yesterday = new Date(workDate);
                        yesterday.setDate(workDate.getDate() - 1);
                        const yesterdayAttendance = userAttendance[String(yesterday.getDate())];
                        if (yesterdayAttendance) {
                            const approveOffDuty = yesterdayAttendance.records.find(r => r.checkType === 'OffDuty' && r.sourceType === 'APPROVE');
                            if (approveOffDuty) {
                                const offTime = new Date(approveOffDuty.userCheckTime);
                                offTime.setHours(20, 30, 0, 0);
                                if (new Date(approveOffDuty.userCheckTime).getTime() >= offTime.getTime()) yesterdayApprove2030 = true;
                            }
                        }

                        const isFirstDayOnJob = new Date(user.hired_date as number).toDateString() === workDate.toDateString();

                        const findLastOffDuty = (currentDate: Date): Date | null => {
                            for (let d = currentDate.getDate() - 1; d >= 1; d--) {
                                const attendance = userAttendance[String(d)];
                                if (attendance) {
                                    const offRecord = attendance.records.find(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');
                                    if (offRecord) return new Date(offRecord.userCheckTime);
                                }
                            }
                            return null;
                        };

                        const minutes = getLateMinutes(record, processDetail, findLastOffDuty(workDate), yesterdayApprove2030, isFirstDayOnJob, holidays);
                        if (record.timeResult === 'Late' && minutes > 0) {
                            stats.late++;
                            stats.lateMinutes += minutes;
                            dailyTrendMapByCompany[company][day].late++;

                            // 🔥 使用规则引擎计算豁免
                            const currentRecordDate = new Date(year, month, day);
                            const dayOfWeek = currentRecordDate.getDay();
                            const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5; // 仅工作日参与豁免

                            const exemptionResult = ruleEngine.calculateExemptedLateMinutes(
                                minutes,
                                stats.monthlyExemptionUsed || 0,
                                isWorkday
                            );

                            stats.exemptedLateMinutes = (stats.exemptedLateMinutes || 0) + exemptionResult.exemptedMinutes;
                            stats.monthlyExemptionUsed = exemptionResult.exemptionUsed;
                            
                            // Fix: Cast to any to bypass missing property in schema, as we cannot edit schema file.
                            (stats as any).exemptedLate = ((stats as any).exemptedLate || 0) + 1;
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
            
            // 🔥 计算实际出勤天数：从截至今天的工作日中减去请假天数
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
            
            const totalLeaveDays = sickDays + seriousSickDays + personalDays + annualDays + 
                                   bereavementDays + maternityDays + paternityDays + parentalDays + marriageDays;
            
            stats.actualAttendanceDays = Math.max(0, (stats.actualAttendanceDays || 0) - totalLeaveDays);

            // 🔥 使用规则引擎计算绩效扣款（在所有日期处理完成后）
            stats.performancePenalty = ruleEngine.calculatePerformancePenalty(stats.exemptedLateMinutes || 0);

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


        // 优化排序逻辑：按照新的排序规则
        // 1. 纪律危险人员 - 豁免后迟到分钟数倒序 - 无考勤风险（全勤候选）- 全勤 - 其他
        Object.keys(statsByCompany).forEach(company => {
            statsByCompany[company].sort((a, b) => {
                // 1. 纪律危险人员（有绩效扣款的）排在最前面
                const aHasRisk = (a.stats.performancePenalty || 0) > 0;
                const bHasRisk = (b.stats.performancePenalty || 0) > 0;
                
                if (aHasRisk && !bHasRisk) return -1;
                if (!aHasRisk && bHasRisk) return 1;
                
                // 2. 如果都是纪律风险人员，按豁免后迟到分钟数倒序
                if (aHasRisk && bHasRisk) {
                    return (b.stats.exemptedLateMinutes || 0) - (a.stats.exemptedLateMinutes || 0);
                }
                
                // 3. 对于非风险人员，区分无考勤风险（全勤候选）、全勤、其他
                if (!aHasRisk && !bHasRisk) {
                    const aIsFullAttendance = a.stats.isFullAttendance;
                    const bIsFullAttendance = b.stats.isFullAttendance;
                    
                    // 无考勤风险（全勤候选）：没有迟到、缺卡、请假等问题，但可能因为最后工作日等原因未达到全勤
                    const aIsCandidate = !aIsFullAttendance && 
                        (a.stats.exemptedLateMinutes || 0) === 0 && 
                        (a.stats.missing || 0) === 0 && 
                        (a.stats.absenteeism || 0) === 0 &&
                        (a.stats.annual || 0) === 0 &&
                        (a.stats.sick || 0) === 0 &&
                        (a.stats.personal || 0) === 0;
                    
                    const bIsCandidate = !bIsFullAttendance && 
                        (b.stats.exemptedLateMinutes || 0) === 0 && 
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
                    
                    // 同级别内按豁免后迟到分钟数倒序
                    return (b.stats.exemptedLateMinutes || 0) - (a.stats.exemptedLateMinutes || 0);
                }
                
                // 4. 其他情况按豁免后迟到分钟数倒序
                return (b.stats.exemptedLateMinutes || 0) - (a.stats.exemptedLateMinutes || 0);
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

    }, [allUsers, attendanceMap, processDataMap, holidays]);
};
