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
        console.log(`[AttendanceRuleEngine] 加载 ${this.companyKey} 规则配置`);
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
                console.log(`[AttendanceRuleEngine] 已从数据库加载 ${this.companyKey} 规则`);
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
     * 获取当前规则配置
     */
    public getRules(): AttendanceRuleConfig {
        return { ...this.rules }; // 返回副本避免外部修改
    }

    /**
     * 计算迟到分钟数（基于新的复杂规则）
     */
    public calculateLateMinutes(
        record: PunchRecord,
        workDate: Date,
        previousDayCheckoutTime?: Date
    ): number {
        if (record.checkType !== 'OnDuty' || record.timeResult !== 'Late') {
            return 0;
        }

        const checkInTime = new Date(record.userCheckTime);
        
        // 应用复杂迟到规则 - 基于绝对时间阈值
        if (this.rules.lateRules && this.rules.lateRules.length > 0 && previousDayCheckoutTime) {
            for (const rule of this.rules.lateRules) {
                // 处理24:00的特殊情况
                let ruleHour: number, ruleMinute: number;
                if (rule.previousDayCheckoutTime === "24:00") {
                    ruleHour = 24;
                    ruleMinute = 0;
                } else {
                    [ruleHour, ruleMinute] = rule.previousDayCheckoutTime.split(':').map(Number);
                }
                
                const ruleTime = new Date(previousDayCheckoutTime);
                if (ruleHour === 24) {
                    // 24:00表示次日0:00
                    ruleTime.setDate(ruleTime.getDate() + 1);
                    ruleTime.setHours(0, 0, 0, 0);
                } else {
                    ruleTime.setHours(ruleHour, ruleMinute, 0, 0);
                }

                // 如果前一天打卡时间符合规则条件
                if (previousDayCheckoutTime.getTime() >= ruleTime.getTime()) {
                    // 使用该规则的绝对时间阈值
                    const [thresholdHour, thresholdMinute] = rule.lateThresholdTime.split(':').map(Number);
                    const thresholdTime = new Date(workDate);
                    thresholdTime.setHours(thresholdHour, thresholdMinute, 0, 0);
                    
                    // 计算相对于阈值时间的迟到分钟数
                    return Math.max(0, Math.floor((checkInTime.getTime() - thresholdTime.getTime()) / 60000));
                }
            }
        }

        // 如果没有匹配的规则，使用默认的工作开始时间
        const workStartTime = new Date(workDate);
        const [startHour, startMinute] = this.rules.workStartTime.split(':').map(Number);
        workStartTime.setHours(startHour, startMinute, 0, 0);

        return Math.max(0, Math.floor((checkInTime.getTime() - workStartTime.getTime()) / 60000));
    }

    /**
     * 计算豁免后的迟到分钟数
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
     * 计算绩效扣款（基于灵活的扣款规则）
     */
    public calculatePerformancePenalty(exemptedLateMinutes: number): number {
        if (exemptedLateMinutes <= 0) return 0;

        // 使用新的灵活扣款规则
        if (this.rules.performancePenaltyRules && this.rules.performancePenaltyRules.length > 0) {
            for (const rule of this.rules.performancePenaltyRules) {
                // 检查是否在当前规则的范围内 [minMinutes, maxMinutes)
                if (exemptedLateMinutes >= rule.minMinutes && 
                    (rule.maxMinutes === 999 || exemptedLateMinutes < rule.maxMinutes)) {
                    const penalty = Math.min(rule.penalty, this.rules.maxPerformancePenalty);
                    return penalty;
                }
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