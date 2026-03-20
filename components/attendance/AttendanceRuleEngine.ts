import type { AttendanceRuleConfig, PunchRecord, DingTalkUser } from '../../database/schema.ts';
import { getAppConfig, getAppConfigAsync } from './utils.ts';
import { getRuleConfigSync } from '../../hooks/useAttendanceRuleConfig.ts';

/**
 * 考勤规则引擎 - 统一处理所有考勤计算逻辑
 * 所有考勤相关的计算都应该通过这个引擎，确保规则的全局一致性
 */
export class AttendanceRuleEngine {
    private rules: AttendanceRuleConfig;
    private companyKey: string;
    private isInitialized: boolean = false;

    constructor(companyKey: string) {
        this.companyKey = companyKey;
        this.rules = this.loadRules();
    }

    /**
     * 加载考勤规则配置（同步方法，用于初始化）
     */
    private loadRules(): AttendanceRuleConfig {
        // 🔥 优先使用最新的规则配置缓存
        const config = getRuleConfigSync(this.companyKey);
        if (!config.rules) {
            throw new Error(`No attendance rules found for company: ${this.companyKey}`);
        }
        
        return config.rules;
    }

    /**
     * 异步加载规则（优先从数据库加载）
     */
    public async loadRulesAsync(): Promise<void> {
        try {
            const config = await getAppConfigAsync(this.companyKey);
            if (config.rules) {
                this.rules = config.rules;
                this.isInitialized = true;
            }
        } catch (e) {
            console.warn(`[AttendanceRuleEngine] 异步加载规则失败，使用同步加载的规则:`, e);
        }
    }

    /**
     * 重新加载规则（当规则更新时调用）
     */
    public reloadRules(): void {
        this.rules = this.loadRules();
    }

    /**
     * 异步重新加载规则
     */
    public async reloadRulesAsync(): Promise<void> {
        await this.loadRulesAsync();
    }

    /**
     * 判断指定日期是否是本月第一个工作日
     * @param date 要检查的日期
     * @param holidayMap 节假日映射（可选）
     * @returns 是否是本月第一个工作日
     */
    private isFirstWorkdayOfMonth(date: Date, holidayMap?: Record<string, any>): boolean {
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const dayOfWeek = date.getDay();
        
        // 首先检查当前日期是否是工作日
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const dateKey = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        let isCurrentDayWorkday = !isWeekend;
        if (holidayMap && holidayMap[dateKey]) {
            if (holidayMap[dateKey].holiday === false) {
                isCurrentDayWorkday = true; // 补班日
            } else if (holidayMap[dateKey].holiday === true) {
                isCurrentDayWorkday = false; // 法定节假日
            }
        }
        
        // 🔥 调试：记录判断过程
        if (month === 1 && day <= 3) {
            // console.log(`[isFirstWorkdayOfMonth] 检查 ${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}, 星期${dayOfWeek}, isWeekend=${isWeekend}, isCurrentDayWorkday=${isCurrentDayWorkday}`);
        }
        
        // 如果当前日期不是工作日，直接返回 false
        if (!isCurrentDayWorkday) {
            if (month === 1 && day <= 3) {
                // console.log(`[isFirstWorkdayOfMonth] 当前日期不是工作日，返回 false`);
            }
            return false;
        }
        
        // 检查当前日期之前是否有工作日
        for (let d = 1; d < day; d++) {
            const checkDate = new Date(year, month, d);
            const checkDayOfWeek = checkDate.getDay();
            const checkIsWeekend = checkDayOfWeek === 0 || checkDayOfWeek === 6;
            const checkDateKey = `${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            
            let isWorkday = !checkIsWeekend;
            if (holidayMap && holidayMap[checkDateKey]) {
                if (holidayMap[checkDateKey].holiday === false) {
                    isWorkday = true; // 补班日
                } else if (holidayMap[checkDateKey].holiday === true) {
                    isWorkday = false; // 法定节假日
                }
            }
            
            // 如果找到了更早的工作日，说明当前日期不是第一个工作日
            if (isWorkday) {
                if (month === 1 && day <= 3) {
                    // console.log(`[isFirstWorkdayOfMonth] 找到更早的工作日: ${d}日，返回 false`);
                }
                return false;
            }
        }
        
        // 当前日期之前没有工作日，说明是本月第一个工作日
        if (month === 1 && day <= 3) {
            // console.log(`[isFirstWorkdayOfMonth] 当前日期是本月第一个工作日，返回 true`);
        }
        return true;
    }

    /**
     * 获取当前规则配置
     */
    public getRules(): AttendanceRuleConfig {
        return { ...this.rules }; // 返回副本避免外部修改
    }

    /**
     * 计算迟到分钟数（基于统一的跨天打卡规则）
     * 
     * @param record 打卡记录
     * @param workDate 工作日期
     * @param previousDayCheckoutTime 前一天的下班打卡时间（用于跨天规则）
     * @param previousWeekendCheckoutTime 周五/周六/周日的下班打卡时间（用于跨周规则）
     * @param previousMonthCheckoutTime 上月最后一个工作日的下班打卡时间（用于跨月规则）
     * @param holidayMap 节假日映射（可选，用于判断工作日）
     * @param processDetail 请假/调休审批详情（可选，用于判断请假时段）
     * @param userName 员工姓名（用于日志）
     * @param lookbackCheckoutFinder 向前查询下班打卡的回调函数（可选，用于启用向前查询功能）
     */
    public calculateLateMinutes(
        record: PunchRecord,
        workDate: Date,
        previousDayCheckoutTime?: Date,
        previousWeekendCheckoutTime?: Date,
        previousMonthCheckoutTime?: Date,
        holidayMap?: Record<string, any>,
        processDetail?: any,
        userName?: string,
        lookbackCheckoutFinder?: (daysBack: number) => Date | undefined
    ): number {
        // // 🔥 调试：记录所有调用（不限用户）
        // console.log(`[AttendanceRuleEngine.calculateLateMinutes] 被调用`, {
        //     用户: userName,
        //     日期: workDate.toISOString().split('T')[0],
        //     checkType: record.checkType,
        //     timeResult: record.timeResult,
        //     打卡时间: record.userCheckTime
        // });
        
        // // 基础校验：只处理上班打卡且迟到的记录
        // if (record.checkType !== 'OnDuty' || record.timeResult !== 'Late') {
        //     console.log(`[AttendanceRuleEngine.calculateLateMinutes] 跳过: checkType=${record.checkType}, timeResult=${record.timeResult}`);
        //     return 0;
        // }

        // // 🔥 调试：记录规则引擎的配置
        // const debugMonth = workDate.getMonth();
        // const debugDay = workDate.getDate();
        // if (debugMonth === 1 && debugDay === 1) {
        //     console.log(`[AttendanceRuleEngine] 规则引擎配置:`, {
        //         enabled: this.rules.crossDayCheckout?.enabled,
        //         rulesCount: this.rules.crossDayCheckout?.rules?.length,
        //         rules: this.rules.crossDayCheckout?.rules?.map(r => ({ 
        //             checkoutTime: r.checkoutTime, 
        //             nextCheckinTime: r.nextCheckinTime, 
        //             applyTo: r.applyTo,
        //             description: r.description 
        //         }))
        //     });
        // }

        const checkInTime = new Date(record.userCheckTime);
        const dayOfWeek = workDate.getDay(); // 0=周日, 1=周一, ..., 6=周六
        
        // 🔥 优先级1: 判断是否是本月第一个工作日 → 应用跨月规则
        const isFirstWorkdayOfMonth = this.isFirstWorkdayOfMonth(workDate, holidayMap);
        
        const month = workDate.getMonth();
        const day = workDate.getDate();
        
        if (isFirstWorkdayOfMonth && previousMonthCheckoutTime) {
            const lateMinutes = this.applyLateRulesForCrossDay(
                checkInTime, 
                workDate, 
                previousMonthCheckoutTime, 
                'month', 
                processDetail, 
                userName
            );
            if (lateMinutes !== null) {
                return lateMinutes;
            }
        }
        
        // 🔥 优先级2: 判断是否是周一 → 应用跨周规则
        if (dayOfWeek === 1 && previousWeekendCheckoutTime) {
            const lateMinutes = this.applyLateRulesForCrossDay(
                checkInTime, 
                workDate, 
                previousWeekendCheckoutTime, 
                'week', 
                processDetail, 
                userName
            );
            if (lateMinutes !== null) {
                return lateMinutes;
            }
        }
        
        // 🔥 优先级3: 普通工作日 → 应用跨天规则（支持向前查询）
        let effectivePreviousDayCheckoutTime = previousDayCheckoutTime;
        
        // 🔥 向前查询功能：如果启用了向前查询且昨天没有下班打卡，继续查找前几天
        if (!effectivePreviousDayCheckoutTime && 
            this.rules.crossDayCheckout?.enableLookback && 
            lookbackCheckoutFinder) {
            
            const maxLookbackDays = this.rules.crossDayCheckout.lookbackDays || 10;
            
            for (let daysBack = 30; daysBack <= maxLookbackDays; daysBack++) {
                const foundCheckoutTime = lookbackCheckoutFinder(daysBack);
                if (foundCheckoutTime) {
                    effectivePreviousDayCheckoutTime = foundCheckoutTime;
                    break;
                }
            }
        }
        
        if (effectivePreviousDayCheckoutTime) {
            const lateMinutes = this.applyLateRulesForCrossDay(
                checkInTime, 
                workDate, 
                effectivePreviousDayCheckoutTime, 
                'day', 
                processDetail, 
                userName
            );
            if (lateMinutes !== null) {
                return lateMinutes;
            }
        }
        
        // 🔥 默认：使用标准工作开始时间计算迟到
        const defaultMinutes = this.calculateDefaultLateMinutes(checkInTime, workDate, processDetail);
        
        // // 🔥 调试：记录最终结果
        // console.log(`[AttendanceRuleEngine] 计算完成`, {
        //     用户: userName,
        //     工作日期: workDate.toISOString().split('T')[0],
        //     迟到分钟数: defaultMinutes
        // });
        
        return defaultMinutes;
    }

    /**
     * 🔥 新的跨天打卡规则应用方法 - 使用 lateRules 配置
     * 根据场景（day/week/month）和前一时段的下班时间，从 lateRules 中查找匹配的规则
     */
    private applyLateRulesForCrossDay(
        checkInTime: Date,
        workDate: Date,
        previousCheckoutTime: Date,
        scenario: 'day' | 'week' | 'month',
        processDetail?: any,
        userName?: string
    ): number | null {
        // 检查规则是否启用
        if (!this.rules.crossDayCheckout?.enabled) {
            return null;
        }
        
        // 🔥 提取实际下班时间的小时和分钟（不考虑日期）
        const checkoutHour = previousCheckoutTime.getHours();
        const checkoutMinute = previousCheckoutTime.getMinutes();
        const checkoutTimeInMinutes = checkoutHour * 60 + checkoutMinute;
        
        // 🔥 按 previousDayCheckoutTime 从晚到早排序（确保优先匹配最晚的规则）
        const sortedRules = [...this.rules.lateRules].sort((a, b) => 
            this.parseTime(b.previousDayCheckoutTime) - this.parseTime(a.previousDayCheckoutTime)
        );
        
        // 🔥 特殊处理：如果实际下班时间是次日凌晨（即超过24:00），直接使用24:00规则
        // 判断标准：如果下班时间的小时数在0-6之间，认为是次日凌晨
        const isNextDayMorning = checkoutHour >= 0 && checkoutHour < 6;
        
        if (isNextDayMorning) {
            // 查找24:00规则
            const rule24 = this.rules.lateRules.find(r => r.previousDayCheckoutTime === '24:00');
            
            if (rule24) {
                let thresholdTime = this.parseThresholdTime(workDate, rule24.lateThresholdTime);
                
                // 🔥 如果有请假/调休，检查请假结束时间
                if (processDetail && processDetail.formValues) {
                    const leaveEndTime = processDetail.formValues.endTime || processDetail.formValues.end;
                    if (leaveEndTime) {
                        const leaveEnd = new Date(leaveEndTime);
                        const adjustedThreshold = this.adjustThresholdForLunchBreak(leaveEnd, workDate);
                        
                        if (adjustedThreshold.getTime() > thresholdTime.getTime()) {
                            thresholdTime = adjustedThreshold;
                        }
                    }
                }
                
                const lateMinutes = Math.max(0, Math.floor((checkInTime.getTime() - thresholdTime.getTime()) / 60000));
                
                return lateMinutes;
            }
        }
        
        // 🔥 正常流程：找到第一个匹配的规则（从最晚的规则开始）
        for (const rule of sortedRules) {
            const ruleTimeInMinutes = this.parseTime(rule.previousDayCheckoutTime);
            
            // 🔥 修复：只比较时间（小时:分钟），不考虑日期
            // 如果实际下班时间（时分） >= 规则阈值时间（时分）
            if (checkoutTimeInMinutes >= ruleTimeInMinutes) {
                let thresholdTime = this.parseThresholdTime(workDate, rule.lateThresholdTime);
                
                // 🔥 如果有请假/调休，检查请假结束时间
                if (processDetail && processDetail.formValues) {
                    const leaveEndTime = processDetail.formValues.endTime || processDetail.formValues.end;
                    if (leaveEndTime) {
                        const leaveEnd = new Date(leaveEndTime);
                        const adjustedThreshold = this.adjustThresholdForLunchBreak(leaveEnd, workDate);
                        
                        if (adjustedThreshold.getTime() > thresholdTime.getTime()) {
                            thresholdTime = adjustedThreshold;
                        }
                    }
                }
                
                const lateMinutes = Math.max(0, Math.floor((checkInTime.getTime() - thresholdTime.getTime()) / 60000));
                
                return lateMinutes;
            }
        }
        
        return null;
    }

    /**
     * 应用传统迟到规则（兼容旧逻辑）
     * @deprecated 已废弃，现在使用 applyLateRulesForCrossDay 方法
     */
    private applyLegacyLateRule(
        checkInTime: Date,
        workDate: Date,
        previousDayCheckoutTime: Date,
        processDetail?: any
    ): number | null {
        for (const rule of this.rules.lateRules) {
            const ruleTime = this.parseRuleTime(previousDayCheckoutTime, rule.previousDayCheckoutTime);
            
            // 如果前一天打卡时间符合规则条件
            if (previousDayCheckoutTime.getTime() >= ruleTime.getTime()) {
                let thresholdTime = this.parseThresholdTime(workDate, rule.lateThresholdTime);
                
                // 🔥 新增：如果有请假/调休，检查请假结束时间
                if (processDetail && processDetail.formValues) {
                    const leaveEndTime = processDetail.formValues.endTime || processDetail.formValues.end;
                    if (leaveEndTime) {
                        const leaveEnd = new Date(leaveEndTime);
                        
                        // 🔥 智能判断：如果请假结束时间在午休时间范围内，使用午休结束时间
                        const adjustedThreshold = this.adjustThresholdForLunchBreak(leaveEnd, workDate);
                        
                        // 如果调整后的时间晚于规则阈值时间，使用调整后的时间作为基准
                        if (adjustedThreshold.getTime() > thresholdTime.getTime()) {
                            thresholdTime = adjustedThreshold;
                            // console.log(`[AttendanceRuleEngine] 检测到请假结束时间: ${leaveEndTime}, 调整后的迟到基准: ${thresholdTime.toISOString()}`);
                        }
                    }
                }
                
                const lateMinutes = Math.max(0, Math.floor((checkInTime.getTime() - thresholdTime.getTime()) / 60000));
                
                // console.log(`[AttendanceRuleEngine] 应用传统规则: ${rule.previousDayCheckoutTime}→${rule.lateThresholdTime}, 迟到${lateMinutes}分钟`);
                return lateMinutes;
            }
        }
        
        return null;
    }

    /**
     * 计算默认迟到分钟数（使用标准工作开始时间或默认迟到阈值时间）
     */
    private calculateDefaultLateMinutes(checkInTime: Date, workDate: Date, processDetail?: any): number {
        let workStartTime = new Date(workDate);
        
        // 🔥 优先使用 defaultLateThresholdTime（如果配置了）
        if (this.rules.defaultLateThresholdTime) {
            const [thresholdHour, thresholdMinute] = this.rules.defaultLateThresholdTime.split(':').map(Number);
            workStartTime.setHours(thresholdHour, thresholdMinute, 0, 0);
            console.log(`[AttendanceRuleEngine] ✅ 使用 defaultLateThresholdTime: ${this.rules.defaultLateThresholdTime}, 公司: ${this.companyKey}`);
        } else {
            // 否则使用标准工作开始时间
            const [startHour, startMinute] = this.rules.workStartTime.split(':').map(Number);
            workStartTime.setHours(startHour, startMinute, 0, 0);
            console.log(`[AttendanceRuleEngine] ⚠️ 使用 workStartTime: ${this.rules.workStartTime}, 公司: ${this.companyKey} (未配置 defaultLateThresholdTime)`);
        }

        // 🔥 新增：如果有请假/调休，检查请假结束时间
        if (processDetail && processDetail.formValues) {
            const leaveEndTime = processDetail.formValues.endTime || processDetail.formValues.end;
            if (leaveEndTime) {
                const leaveEnd = new Date(leaveEndTime);
                const adjustedThreshold = this.adjustThresholdForLunchBreak(leaveEnd, workDate);
                
                // 如果调整后的时间晚于标准工作开始时间，使用调整后的时间
                if (adjustedThreshold.getTime() > workStartTime.getTime()) {
                    workStartTime = adjustedThreshold;
                }
            }
        }

        const lateMinutes = Math.max(0, Math.floor((checkInTime.getTime() - workStartTime.getTime()) / 60000));
        
        // 🔥 调试：记录默认规则计算结果
        if (lateMinutes > 0) {
            console.log(`[AttendanceRuleEngine] 计算结果: 打卡时间 ${checkInTime.toLocaleTimeString('zh-CN')}, 基准时间 ${workStartTime.toLocaleTimeString('zh-CN')}, 迟到 ${lateMinutes} 分钟`);
        }
        
        return lateMinutes;
    }

    /**
     * 解析规则时间（处理24:00等特殊情况）
     */
    private parseRuleTime(baseDate: Date, timeStr: string): Date {
        const [hour, minute] = timeStr.split(':').map(Number);
        const ruleTime = new Date(baseDate);
        
        if (hour === 24) {
            // 🔥 修复：24:00 应该表示当天的24点（即次日0点），但不应该再加一天
            // 因为 baseDate (previousCheckoutTime) 可能已经是UTC时间的次日了
            // 例如：北京时间 2026-02-01 00:00:22 = UTC 2026-01-31 16:00:22
            // 我们应该将规则时间设置为 UTC 2026-01-31 16:00:00（北京时间 2026-02-01 00:00:00）
            ruleTime.setHours(0, minute || 0, 0, 0);
        } else {
            ruleTime.setHours(hour, minute || 0, 0, 0);
        }
        
        return ruleTime;
    }

    /**
     * 解析阈值时间
     */
    private parseThresholdTime(baseDate: Date, timeStr: string): Date {
        // 🔥 防御性检查
        if (!timeStr) {
            console.error('[AttendanceRuleEngine] parseThresholdTime: timeStr is undefined or null');
            // 返回默认的工作开始时间
            const defaultTime = new Date(baseDate);
            const [hour, minute] = this.rules.workStartTime.split(':').map(Number);
            defaultTime.setHours(hour, minute || 0, 0, 0);
            return defaultTime;
        }
        
        const [hour, minute] = timeStr.split(':').map(Number);
        const thresholdTime = new Date(baseDate);
        thresholdTime.setHours(hour, minute || 0, 0, 0);
        return thresholdTime;
    }

    /**
     * 🔥 智能调整请假结束时间：如果请假结束时间在午休时间范围内，使用午休结束时间
     * 
     * 场景：员工请假上午9:00-12:00
     * - 请假结束时间：12:00
     * - 午休时间：12:00-13:30
     * - 应该使用：13:30（午休结束时间）作为迟到基准
     * 
     * @param leaveEndTime 请假结束时间
     * @param workDate 工作日期
     * @returns 调整后的阈值时间
     */
    private adjustThresholdForLunchBreak(leaveEndTime: Date, workDate: Date): Date {
        // 获取午休时间配置
        const [lunchStartHour, lunchStartMinute] = this.rules.lunchStartTime.split(':').map(Number);
        const [lunchEndHour, lunchEndMinute] = this.rules.lunchEndTime.split(':').map(Number);
        
        const lunchStart = new Date(workDate);
        lunchStart.setHours(lunchStartHour, lunchStartMinute, 0, 0);
        
        const lunchEnd = new Date(workDate);
        lunchEnd.setHours(lunchEndHour, lunchEndMinute, 0, 0);
        
        // 检查请假结束时间是否在午休时间范围内（包括边界）
        if (leaveEndTime.getTime() >= lunchStart.getTime() && leaveEndTime.getTime() <= lunchEnd.getTime()) {
            // console.log(`[AttendanceRuleEngine] 请假结束时间 ${leaveEndTime.toISOString()} 在午休时间范围内 [${this.rules.lunchStartTime}-${this.rules.lunchEndTime}]，使用午休结束时间`);
            return lunchEnd;
        }
        
        // 如果不在午休时间范围内，直接返回请假结束时间
        return leaveEndTime;
    }

    /**
     * 计算豁免后的迟到分钟数（单次迟到）
     * @deprecated 建议使用 calculateMonthlyExemption 进行月度豁免计算
     */
    public calculateExemptedLateMinutes(
        lateMinutes: number,
        currentExemptionUsed: number,
        isWorkday: boolean
    ): { exemptedMinutes: number; exemptionUsed: number } {
        if (lateMinutes <= 0) {
            return { exemptedMinutes: 0, exemptionUsed: currentExemptionUsed };
        }

        const maxExemptions = this.rules.lateExemptionCount;
        const exemptionThreshold = this.rules.lateExemptionMinutes;

        if (currentExemptionUsed >= maxExemptions) {
            return { exemptedMinutes: lateMinutes, exemptionUsed: currentExemptionUsed };
        }

        if (isWorkday && lateMinutes <= exemptionThreshold) {
            // 完全豁免
            return { exemptedMinutes: 0, exemptionUsed: currentExemptionUsed + 1 };
        } else if (lateMinutes > exemptionThreshold) {
            // 部分豁免
            return { 
                exemptedMinutes: lateMinutes - exemptionThreshold, 
                exemptionUsed: currentExemptionUsed + 1 
            };
        }

        return { exemptedMinutes: lateMinutes, exemptionUsed: currentExemptionUsed };
    }

    /**
     * 计算月度豁免（支持按日期或按迟到时长排序）
     * @param lateRecords 迟到记录数组 [{day: number, minutes: number, isWorkday: boolean}]
     * @returns { exemptedLateMinutes: number, exemptionUsed: number }
     */
    public calculateMonthlyExemption(
        lateRecords: Array<{ day: number; minutes: number; isWorkday: boolean }>
    ): { exemptedLateMinutes: number; exemptionUsed: number } {
        if (!lateRecords || lateRecords.length === 0) {
            return { exemptedLateMinutes: 0, exemptionUsed: 0 };
        }

        const exemptionMode = this.rules.lateExemptionMode || 'byDate';
        const maxExemptions = this.rules.lateExemptionCount;
        const exemptionThreshold = this.rules.lateExemptionMinutes;

        // 根据豁免模式排序迟到记录
        let sortedLateRecords = [...lateRecords];
        if (exemptionMode === 'byMinutes') {
            // 按迟到分钟数从大到小排序
            sortedLateRecords.sort((a, b) => b.minutes - a.minutes);
        } else {
            // 按日期从月初到月末排序（默认）
            sortedLateRecords.sort((a, b) => a.day - b.day);
        }

        // 应用豁免
        let exemptionUsed = 0;
        let exemptedLateMinutes = 0;

        sortedLateRecords.forEach(record => {
            if (exemptionUsed < maxExemptions && record.isWorkday) {
                if (record.minutes <= exemptionThreshold) {
                    // 完全豁免
                    exemptionUsed++;
                } else {
                    // 部分豁免
                    exemptedLateMinutes += (record.minutes - exemptionThreshold);
                    exemptionUsed++;
                }
            } else {
                // 不豁免
                exemptedLateMinutes += record.minutes;
            }
        });

        return { exemptedLateMinutes, exemptionUsed };
    }

    /**
     * 计算绩效扣款（基于灵活的扣款规则）
     */
    public calculatePerformancePenalty(exemptedLateMinutes: number): number {
        if (exemptedLateMinutes <= 0) return 0;

        // 🔥 检查绩效扣款模式
        const penaltyMode = this.rules.performancePenaltyMode || 'capped';
        
        // 🔥 上不封顶模式
        if (penaltyMode === 'unlimited') {
            const calcType = this.rules.unlimitedPenaltyCalcType || 'fixed';
            
            if (calcType === 'perMinute') {
                // 按分钟计算：每分钟N元
                const perMinute = this.rules.unlimitedPenaltyPerMinute || 5;
                const penalty = exemptedLateMinutes * perMinute;
                console.log(`[calculatePerformancePenalty] 上不封顶-按分钟，豁免后迟到${exemptedLateMinutes}分钟 × ${perMinute}元/分钟 = ${penalty}元`);
                return penalty;
            } else {
                // 固定金额：只要迟到就扣固定金额
                const fixedAmount = this.rules.unlimitedPenaltyFixedAmount || 50;
                console.log(`[calculatePerformancePenalty] 上不封顶-固定金额，豁免后迟到${exemptedLateMinutes}分钟 → 扣款${fixedAmount}元`);
                return fixedAmount;
            }
        }

        // 🔥 封顶模式（原有逻辑）
        // 使用新的灵活扣款规则
        if (this.rules.performancePenaltyRules && this.rules.performancePenaltyRules.length > 0) {
            // 按照 minMinutes 从小到大排序
            const sortedRules = [...this.rules.performancePenaltyRules].sort((a, b) => a.minMinutes - b.minMinutes);
            
            // 🔥 修复：找到最合适的规则（minMinutes <= exemptedLateMinutes < maxMinutes）
            let matchedRule = null;
            for (const rule of sortedRules) {
                // 检查是否在范围内：minMinutes <= exemptedLateMinutes < maxMinutes
                if (exemptedLateMinutes >= rule.minMinutes && exemptedLateMinutes < rule.maxMinutes) {
                    matchedRule = rule;
                    break; // 找到精确匹配，立即返回
                }
            }
            
            // 🔥 如果没有精确匹配，找到最后一个 minMinutes <= exemptedLateMinutes 的规则
            // 这种情况通常是最后一个规则（如 [45, 999)）
            if (!matchedRule) {
                for (let i = sortedRules.length - 1; i >= 0; i--) {
                    if (exemptedLateMinutes >= sortedRules[i].minMinutes) {
                        matchedRule = sortedRules[i];
                        break;
                    }
                }
            }
            
            if (matchedRule) {
                const penalty = Math.min(matchedRule.penalty, this.rules.maxPerformancePenalty);
                
                // 🔥 调试日志：记录匹配的规则
                console.log(`[calculatePerformancePenalty] 封顶模式，豁免后迟到${exemptedLateMinutes}分钟，匹配规则: [${matchedRule.minMinutes}, ${matchedRule.maxMinutes}) → ${matchedRule.penalty}元，最终扣款: ${penalty}元`);
                
                return penalty;
            } else {
                // 🔥 调试日志：没有匹配的规则
                console.warn(`[calculatePerformancePenalty] 豁免后迟到${exemptedLateMinutes}分钟，没有匹配的规则！规则列表:`, sortedRules);
            }
        }

        // 如果没有匹配的规则，使用旧的固定逻辑作为后备
        let penalty = 0;
        if (exemptedLateMinutes <= 5) penalty = 50;
        else if (exemptedLateMinutes <= 15) penalty = 100;
        else if (exemptedLateMinutes <= 30) penalty = 150;
        else if (exemptedLateMinutes <= 45) penalty = 200;
        else penalty = this.rules.maxPerformancePenalty;

        const finalPenalty = Math.min(penalty, this.rules.maxPerformancePenalty);
        
        console.log(`[calculatePerformancePenalty] 使用默认规则，豁免后迟到${exemptedLateMinutes}分钟 → ${finalPenalty}元`);
        
        return finalPenalty;
    }

    /**
     * 计算加班时长和次数
     */
    public calculateOvertime(checkoutTime: Date, workDate: Date): {
        totalMinutes: number;
        checkpoints: Record<string, { minutes: number; count: number }>;
    } {
        const result = {
            totalMinutes: 0,
            checkpoints: {} as Record<string, { minutes: number; count: number }>
        };

        if (!this.rules.overtimeCheckpoints || this.rules.overtimeCheckpoints.length === 0) {
            return result;
        }

        const baseDate = new Date(workDate);
        
        for (const checkpoint of this.rules.overtimeCheckpoints) {
            // 处理可能的12小时制格式转换
            let timeStr = checkpoint;
            if (checkpoint.includes('上午') || checkpoint.includes('下午')) {
                // 转换12小时制到24小时制
                console.warn(`[AttendanceRuleEngine] 检测到12小时制格式: ${checkpoint}`);
                
                const isAM = checkpoint.includes('上午');
                const isPM = checkpoint.includes('下午');
                
                // 提取时间部分，去掉上午/下午
                const timeMatch = checkpoint.match(/(\d{1,2}):(\d{2})/);
                if (!timeMatch) {
                    console.error(`[AttendanceRuleEngine] 无法解析时间格式: ${checkpoint}`);
                    continue;
                }
                
                let hour = parseInt(timeMatch[1]);
                const minute = parseInt(timeMatch[2]);
                
                // 转换为24小时制
                if (isPM && hour !== 12) {
                    hour += 12;
                } else if (isAM && hour === 12) {
                    hour = 0;
                }
                
                timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            }
            
            const [hour, minute] = timeStr.split(':').map(Number);
            
            const checkpointTime = new Date(baseDate);
            
            // 处理跨天情况（如24:00）
            if (hour === 0 || hour === 24) {
                checkpointTime.setDate(checkpointTime.getDate() + 1);
                checkpointTime.setHours(0, minute || 0, 0, 0);
            } else {
                checkpointTime.setHours(hour, minute || 0, 0, 0);
            }

            if (checkoutTime >= checkpointTime) {
                const diffMs = checkoutTime.getTime() - checkpointTime.getTime();
                const minutes = Number((diffMs / 60000).toFixed(2)); // 保留两位小数
                
                // 使用转换后的24小时制时间生成键名
                const key = timeStr.replace(':', '_');
                
                result.checkpoints[key] = {
                    minutes: Math.max(0, minutes),
                    count: 1
                };
                
                result.totalMinutes += minutes;
            }
        }

        result.totalMinutes = Number(result.totalMinutes.toFixed(2));
        return result;
    }

    /**
     * 判断是否全勤（基于灵活的全勤规则）
     */
    public isFullAttendance(stats: {
        late: number;
        missing: number;
        absenteeism: number;
        annual: number;
        sick: number;
        personal: number;
        bereavement: number;
        paternity: number;
        maternity: number;
        parental: number;
        marriage: number;
        trip: number;
        compTime: number;
        annualHours: number;
        sickHours: number;
        personalHours: number;
        bereavementHours: number;
        paternityHours: number;
        maternityHours: number;
        parentalHours: number;
        marriageHours: number;
        tripHours: number;
        compTimeHours: number;
    }): boolean {
        // 使用新的灵活全勤规则
        if (this.rules.fullAttendanceRules && this.rules.fullAttendanceRules.length > 0) {
            for (const rule of this.rules.fullAttendanceRules) {
                if (!rule.enabled) {
                    continue; // 跳过未启用的规则
                }
                
                let actualValue = 0;
                
                // 根据规则类型获取对应的统计值
                switch (rule.type) {
                    case 'late':
                        actualValue = rule.unit === 'count' ? stats.late : 0; // 迟到通常按次数计算
                        break;
                    case 'missing':
                        actualValue = rule.unit === 'count' ? stats.missing : 0; // 缺卡通常按次数计算
                        break;
                    case 'absenteeism':
                        actualValue = rule.unit === 'count' ? stats.absenteeism : 0; // 旷工通常按次数计算
                        break;
                    case 'annual':
                        actualValue = rule.unit === 'count' ? stats.annual : stats.annualHours;
                        break;
                    case 'sick':
                        actualValue = rule.unit === 'count' ? stats.sick : stats.sickHours;
                        break;
                    case 'personal':
                        actualValue = rule.unit === 'count' ? stats.personal : stats.personalHours;
                        break;
                    case 'bereavement':
                        actualValue = rule.unit === 'count' ? stats.bereavement : stats.bereavementHours;
                        break;
                    case 'paternity':
                        actualValue = rule.unit === 'count' ? stats.paternity : stats.paternityHours;
                        break;
                    case 'maternity':
                        actualValue = rule.unit === 'count' ? stats.maternity : stats.maternityHours;
                        break;
                    case 'parental':
                        actualValue = rule.unit === 'count' ? stats.parental : stats.parentalHours;
                        break;
                    case 'marriage':
                        actualValue = rule.unit === 'count' ? stats.marriage : stats.marriageHours;
                        break;
                    case 'trip':
                        actualValue = rule.unit === 'count' ? stats.trip : stats.tripHours;
                        break;
                    case 'compTime':
                        actualValue = rule.unit === 'count' ? stats.compTime : stats.compTimeHours;
                        break;
                    default:
                        console.warn(`[AttendanceRuleEngine] 未知的全勤规则类型: ${rule.type}`);
                        continue;
                }
                
                // 检查是否超过阈值
                if (actualValue > rule.threshold) {
                    return false;
                }
            }
            
            return true;
        }

        // 如果没有配置灵活规则，使用旧的固定逻辑作为后备
        
        // 基础全勤判定：无迟到、缺卡、旷工、请假
        const hasAttendanceIssues = stats.late > 0 || stats.missing > 0 || stats.absenteeism > 0;
        const hasLeave = stats.annual > 0 || stats.sick > 0 || stats.personal > 0 || 
                        stats.bereavement > 0 || stats.paternity > 0 || stats.maternity > 0 || 
                        stats.parental > 0 || stats.marriage > 0;

        if (hasAttendanceIssues || hasLeave) {
            // 检查是否允许调休算全勤
            if (this.rules.fullAttendanceAllowAdjustment && 
                !hasAttendanceIssues && 
                stats.annual === 0 && stats.sick === 0 && stats.personal === 0 &&
                stats.bereavement === 0 && stats.paternity === 0 && stats.maternity === 0 &&
                stats.parental === 0 && stats.marriage === 0) {
                // 只有调休，且允许调休算全勤
                return true;
            }
            return false;
        }

        return true;
    }

    /**
     * 计算全勤奖金额
     */
    public calculateFullAttendanceBonus(isFullAttendance: boolean): number {
        return isFullAttendance ? this.rules.fullAttendanceBonus : 0;
    }

    /**
     * 格式化请假展示
     */
    public formatLeaveDisplay(leaveType: string, hours: number): string {
        const rule = this.rules.leaveDisplayRules?.find(r => r.leaveType === leaveType);
        if (!rule) return `${leaveType} ${hours}小时`;

        if (hours <= rule.shortTermHours) {
            return `${rule.shortTermLabel} ${hours}小时`;
        } else {
            return `${rule.longTermLabel} ${hours}小时`;
        }
    }

    /**
     * 检查是否启用跨天打卡
     */
    public isCrossDayCheckoutEnabled(): boolean {
        return this.rules.crossDayCheckout?.enabled || false;
    }
    
    /**
     * 🔥 检查是否启用跨周打卡
     */
    public isCrossWeekCheckoutEnabled(): boolean {
        return this.rules.crossDayCheckout?.enabled || false;
    }
    
    /**
     * 🔥 检查是否启用跨月打卡
     */
    public isCrossMonthCheckoutEnabled(): boolean {
        return this.rules.crossDayCheckout?.enabled || false;
    }
    
    /**
     * 🔥 获取前一个工作日的日期
     * @param currentDate 当前日期
     * @param holidayMap 节假日映射（可选）
     * @returns 前一个工作日的日期
     */
    public getPreviousWorkday(currentDate: Date, holidayMap?: Record<string, any>): Date {
        const previousDay = new Date(currentDate);
        previousDay.setDate(previousDay.getDate() - 1);
        
        // 如果前一天是周末，继续往前找
        while (previousDay.getDay() === 0 || previousDay.getDay() === 6) {
            previousDay.setDate(previousDay.getDate() - 1);
        }
        
        // 如果提供了节假日映射，检查是否是节假日
        if (holidayMap) {
            const dateStr = previousDay.toISOString().split('T')[0];
            if (holidayMap[dateStr]?.holiday) {
                // 递归查找前一个工作日
                return this.getPreviousWorkday(previousDay, holidayMap);
            }
        }
        
        return previousDay;
    }
    
    /**
     * 🔥 获取上周末（周六或周日）的日期
     * @param currentDate 当前日期（应该是周一）
     * @returns 上周末的日期（优先返回周日，如果周日没有打卡则返回周六）
     */
    public getPreviousWeekend(currentDate: Date): { saturday: Date; sunday: Date } {
        const dayOfWeek = currentDate.getDay();
        
        // 如果不是周一，返回null
        if (dayOfWeek !== 1) {
            throw new Error('getPreviousWeekend should only be called on Monday');
        }
        
        const sunday = new Date(currentDate);
        sunday.setDate(sunday.getDate() - 1); // 周一 - 1 = 周日
        
        const saturday = new Date(currentDate);
        saturday.setDate(saturday.getDate() - 2); // 周一 - 2 = 周六
        
        return { saturday, sunday };
    }
    
    /**
     * 🔥 获取上个月最后一天的日期
     * @param currentDate 当前日期（应该是本月第一天）
     * @returns 上个月最后一天的日期
     */
    public getPreviousMonthLastDay(currentDate: Date): Date {
        const lastDayOfPreviousMonth = new Date(currentDate);
        lastDayOfPreviousMonth.setDate(0); // 设置为上个月最后一天
        return lastDayOfPreviousMonth;
    }
    
    /**
     * 🔥 获取上个月最后一个工作日的日期
     * @param currentDate 当前日期（应该是本月第一天或第一个工作日）
     * @param holidayMap 节假日映射（可选）
     * @returns 上个月最后一个工作日的日期，如果没有则返回null
     */
    public getPreviousMonthLastWorkday(currentDate: Date, holidayMap?: Record<string, any>): Date | null {
        const lastDayOfPreviousMonth = this.getPreviousMonthLastDay(currentDate);
        const year = lastDayOfPreviousMonth.getFullYear();
        const month = lastDayOfPreviousMonth.getMonth();
        const lastDay = lastDayOfPreviousMonth.getDate();
        
        // 从上月最后一天开始往前找，找到第一个工作日
        for (let d = lastDay; d >= 1; d--) {
            const checkDate = new Date(year, month, d);
            const dayOfWeek = checkDate.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const dateKey = `${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            
            let isWorkday = !isWeekend;
            if (holidayMap && holidayMap[dateKey]) {
                if (holidayMap[dateKey].holiday === false) {
                    isWorkday = true; // 补班日
                } else if (holidayMap[dateKey].holiday === true) {
                    isWorkday = false; // 法定节假日
                }
            }
            
            if (isWorkday) {
                return checkDate;
            }
        }
        
        return null; // 如果整个月都没有工作日（理论上不可能）
    }
    
    /**
     * 🔥 从打卡记录中查找指定日期的下班打卡
     * @param records 所有打卡记录
     * @param userId 用户ID
     * @param targetDate 目标日期
     * @returns 下班打卡时间，如果没有则返回undefined
     */
    public findCheckoutTime(
        records: PunchRecord[], 
        userId: string, 
        targetDate: Date
    ): Date | undefined {
        const targetDateStr = targetDate.toISOString().split('T')[0];
        
        // 查找该日期的所有下班打卡记录
        const checkoutRecords = records.filter(r => {
            const recordDate = new Date(r.workDate);
            const recordDateStr = recordDate.toISOString().split('T')[0];
            return r.userId === userId && 
                   r.checkType === 'OffDuty' && 
                   recordDateStr === targetDateStr;
        });
        
        if (checkoutRecords.length === 0) {
            return undefined;
        }
        
        // 如果有多条记录，返回最晚的一条
        const latestCheckout = checkoutRecords.reduce((latest, current) => {
            const latestTime = new Date(latest.userCheckTime);
            const currentTime = new Date(current.userCheckTime);
            return currentTime > latestTime ? current : latest;
        });
        
        return new Date(latestCheckout.userCheckTime);
    }

    /**
     * 获取工作时间配置
     */
    public getWorkHours(): {
        startTime: string;
        endTime: string;
        lunchStart: string;
        lunchEnd: string;
    } {
        return {
            startTime: this.rules.workStartTime,
            endTime: this.rules.workEndTime,
            lunchStart: this.rules.lunchStartTime,
            lunchEnd: this.rules.lunchEndTime
        };
    }

    /**
     * 计算标准工作时长（小时）
     */
    public getStandardWorkHours(): number {
        const start = this.parseTime(this.rules.workStartTime);
        const end = this.parseTime(this.rules.workEndTime);
        const lunchStart = this.parseTime(this.rules.lunchStartTime);
        const lunchEnd = this.parseTime(this.rules.lunchEndTime);
        
        const workMinutes = (end - start) - (lunchEnd - lunchStart);
        return workMinutes / 60;
    }

    /**
     * 解析时间字符串为分钟数
     */
    private parseTime(timeStr: string): number {
        const [hour, minute] = timeStr.split(':').map(Number);
        return hour * 60 + minute;
    }
}

/**
 * 全局考勤规则引擎管理器
 */
export class AttendanceRuleManager {
    private static engines: Map<string, AttendanceRuleEngine> = new Map();

    /**
     * 获取指定公司的考勤规则引擎
     */
    public static getEngine(companyKey: string): AttendanceRuleEngine {
        if (!this.engines.has(companyKey)) {
            this.engines.set(companyKey, new AttendanceRuleEngine(companyKey));
        }
        return this.engines.get(companyKey)!;
    }

    /**
     * 重新加载所有引擎的规则（当规则更新时调用）
     */
    public static reloadAllRules(): void {
        this.engines.forEach(engine => engine.reloadRules());
    }

    /**
     * 清除指定公司的引擎缓存
     */
    public static clearEngine(companyKey: string): void {
        this.engines.delete(companyKey);
    }

    /**
     * 清除所有引擎缓存
     */
    public static clearAllEngines(): void {
        this.engines.clear();
    }
}