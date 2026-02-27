import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SaveIcon, AlertTriangleIcon, SettingsIcon, ClockIcon, InfoIcon, DollarSignIcon, PlusCircleIcon, TrashIcon, ChevronDownIcon, SparklesIcon, Loader2Icon, RefreshCwIcon } from '../Icons.tsx';
import useLocalStorage from '../../hooks/useLocalStorage.ts';
import { DEFAULT_CONFIGS, SmartCache, refreshDbRuleCache } from '../attendance/utils.ts';
import type { CompanyConfigs, AttendanceRuleConfig, LateRule, LeaveDisplayRule, PerformancePenaltyRule, FullAttendanceRule } from '../../database/schema.ts';
import { analyzeAttendanceInsights } from '../../services/aiChatService.ts';
import { getCachedAnalysis, setCachedAnalysis } from '../../services/aiCacheService.ts';
import { MarkdownRenderer } from '../attendance/dashboard/MarkdownRenderer.tsx';
import { attendanceRuleApiService, type CompanyId } from '../../services/attendanceRuleApiService.ts';

const CONFIG_KEY = 'COMPANY_CONFIGS';

// 规则分类定义
type RuleCategory = 'global' | 'admin' | 'finance' | 'special';

const RULE_CATEGORIES: { key: RuleCategory; label: string; icon: string; description: string; activeColor: string }[] = [
    { key: 'global', label: '全局通用', icon: '🌐', description: '基础作息、出勤天数等通用配置', activeColor: 'bg-indigo-500' },
    { key: 'admin', label: '行政管理', icon: '📋', description: '迟到、豁免、加班、跨天打卡等行政规则', activeColor: 'bg-blue-500' },
    { key: 'finance', label: '财务相关', icon: '💰', description: '全勤奖、绩效扣款等财务规则', activeColor: 'bg-emerald-500' },
    { key: 'special', label: '特殊规则', icon: '⚡', description: '调班、居家办公、请假展示等特殊规则', activeColor: 'bg-purple-500' },
];

export const AttendanceRulesPage: React.FC = () => {
    // 🔥 修复说明：
    // 1. 添加了 hasInitialized 和 isCurrentlyLoading 状态来防止重复API调用
    // 2. 使用 isMountedRef 来防止组件卸载后的状态更新
    // 3. 将 loadConfigFromDatabase 包装为 useCallback，避免useEffect重复执行
    // 4. 在所有状态更新前检查组件是否仍然挂载
    // 5. 优化了 useEffect 依赖项和执行条件
    
    // We store the full config object in local storage
    const [storedConfigs, setStoredConfigs] = useLocalStorage<CompanyConfigs>(CONFIG_KEY, DEFAULT_CONFIGS);

    const [selectedCompany, setSelectedCompany] = useState<'eyewind' | 'hydodo'>('eyewind');
    const [selectedCategory, setSelectedCategory] = useState<RuleCategory>('global'); // 当前选中的分类

    const [formData, setFormData] = useState({
        rules: DEFAULT_CONFIGS['eyewind'].rules! // Init with default to avoid null
    });
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [hasChanges, setHasChanges] = useState(false); // 🔥 追踪是否有修改
    const [isLoadingConfig, setIsLoadingConfig] = useState(false); // 🔥 追踪配置加载状态
    const [expandedFullAttendanceRules, setExpandedFullAttendanceRules] = useState<Set<number>>(new Set()); // 全勤规则手风琴展开状态
    const [expandedPerformanceRules, setExpandedPerformanceRules] = useState<Set<number>>(new Set()); // 绩效规则手风琴展开状态

    // AI 规则分析状态
    const [showAiAnalysis, setShowAiAnalysis] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isAnalysing, setIsAnalysing] = useState(false);
    const currentCompanyRef = useRef<string | null>(null);

    // 🔥 添加加载状态管理，防止重复调用
    const [hasInitialized, setHasInitialized] = useState(false);
    const [isCurrentlyLoading, setIsCurrentlyLoading] = useState(false);
    const isMountedRef = useRef(true);

    // 🔥 组件挂载时立即设置 ref，并在卸载时清理
    useEffect(() => {
        // console.log('[AttendanceRules] 🟢 组件挂载');
        isMountedRef.current = true;
        
        return () => {
            // console.log('[AttendanceRules] 🔴 组件卸载');
            isMountedRef.current = false;
        };
    }, []);

    // 各模块手风琴展开状态
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['workSchedule', 'attendanceDays', 'workdaySwap', 'remoteWork', 'lateRules', 'flexibility', 'fullAttendance', 'performance', 'overtime', 'crossDay', 'crossWeek', 'crossMonth', 'leaveDisplay']));

    // 切换模块展开/收起
    const toggleSection = (section: string) => {
        const newExpanded = new Set(expandedSections);
        if (newExpanded.has(section)) {
            newExpanded.delete(section);
        } else {
            newExpanded.add(section);
        }
        setExpandedSections(newExpanded);
    };

    // 加载默认配置（从localStorage或默认值）
    const loadDefaultConfig = () => {
        // Merge stored config with defaults to ensure all keys exist
        const currentConfig = storedConfigs[selectedCompany] || DEFAULT_CONFIGS[selectedCompany];

        // Ensure rules exist and have all new fields
        const rules = currentConfig.rules || DEFAULT_CONFIGS[selectedCompany].rules!;

        // Migration for old data - ensure new fields exist
        const migratedRules: AttendanceRuleConfig = {
            ...rules,
            lateRules: (rules.lateRules || DEFAULT_CONFIGS[selectedCompany].rules!.lateRules).map(rule => {
                // 迁移旧的lateThresholdMinutes字段到新的lateThresholdTime字段
                if ('lateThresholdMinutes' in rule && !('lateThresholdTime' in rule)) {
                    const oldRule = rule as any;
                    const workStartTime = rules.workStartTime || DEFAULT_CONFIGS[selectedCompany].rules!.workStartTime;
                    const [startHour, startMinute] = workStartTime.split(':').map(Number);
                    
                    // 将分钟阈值转换为绝对时间
                    const thresholdMinutes = startMinute + oldRule.lateThresholdMinutes;
                    const thresholdHour = startHour + Math.floor(thresholdMinutes / 60);
                    const finalMinute = thresholdMinutes % 60;
                    
                    const lateThresholdTime = `${thresholdHour.toString().padStart(2, '0')}:${finalMinute.toString().padStart(2, '0')}`;
                    
                    return {
                        previousDayCheckoutTime: oldRule.previousDayCheckoutTime,
                        lateThresholdTime: lateThresholdTime,
                        description: oldRule.description
                    };
                }
                return rule as LateRule;
            }),
            lateExemptionMode: rules.lateExemptionMode || DEFAULT_CONFIGS[selectedCompany].rules!.lateExemptionMode || 'byDate',
            leaveDisplayRules: rules.leaveDisplayRules || DEFAULT_CONFIGS[selectedCompany].rules!.leaveDisplayRules,
            performancePenaltyRules: (rules.performancePenaltyRules || DEFAULT_CONFIGS[selectedCompany].rules!.performancePenaltyRules).map(rule => ({
                ...rule,
                description: rule.description || `${rule.minMinutes}-${rule.maxMinutes === 999 ? '∞' : rule.maxMinutes}分钟扣${rule.penalty}元`
            })),
            fullAttendanceRules: rules.fullAttendanceRules || DEFAULT_CONFIGS[selectedCompany].rules!.fullAttendanceRules,
            fullAttendanceBonus: rules.fullAttendanceBonus ?? DEFAULT_CONFIGS[selectedCompany].rules!.fullAttendanceBonus,
            fullAttendanceAllowAdjustment: rules.fullAttendanceAllowAdjustment ?? DEFAULT_CONFIGS[selectedCompany].rules!.fullAttendanceAllowAdjustment,
            fullAttendanceEnabled: rules.fullAttendanceEnabled ?? DEFAULT_CONFIGS[selectedCompany].rules!.fullAttendanceEnabled,
            performancePenaltyEnabled: rules.performancePenaltyEnabled ?? DEFAULT_CONFIGS[selectedCompany].rules!.performancePenaltyEnabled,
            weekendOvertimeThreshold: rules.weekendOvertimeThreshold ?? DEFAULT_CONFIGS[selectedCompany].rules!.weekendOvertimeThreshold,
            crossDayCheckout: rules.crossDayCheckout || DEFAULT_CONFIGS[selectedCompany].rules!.crossDayCheckout,
            maxPerformancePenalty: rules.maxPerformancePenalty ?? 250,
            attendanceDaysRules: rules.attendanceDaysRules || DEFAULT_CONFIGS[selectedCompany].rules!.attendanceDaysRules,
            workdaySwapRules: rules.workdaySwapRules || DEFAULT_CONFIGS[selectedCompany].rules!.workdaySwapRules,
            remoteWorkRules: rules.remoteWorkRules || DEFAULT_CONFIGS[selectedCompany].rules!.remoteWorkRules
        };

        setFormData({
            rules: { ...migratedRules } // Copy to avoid ref issues
        });
    };

    // 🔥 从数据库加载配置 - 使用 useCallback 避免不必要的重新创建
    const loadConfigFromDatabase = useCallback(async () => {
        // 🔥 防止重复调用
        if (isCurrentlyLoading) {
            // console.log('[AttendanceRules] 正在加载中，跳过重复调用');
            return;
        }
        
        // 🔥 检查组件是否仍然挂载
        if (!isMountedRef.current) {
            // console.log('[AttendanceRules] 组件已卸载，取消加载');
            return;
        }
        
        setIsCurrentlyLoading(true);
        setIsLoadingConfig(true);
        
        try {
            // console.log(`[AttendanceRules] 🔥 强制从数据库加载 ${selectedCompany} 的最新配置`);
            
            // 🔥 强制从数据库获取最新配置（不使用缓存）
            const dbConfig = await attendanceRuleApiService.getFullConfig(selectedCompany as CompanyId, true);
            
            if (!isMountedRef.current) return;
            
            if (dbConfig) {
                // console.log(`[AttendanceRules] ✅ 成功从数据库加载 ${selectedCompany} 配置，版本: ${dbConfig.version}`);
                // console.log(`[AttendanceRules] 🔍 原始数据库配置:`, dbConfig);
                
                // 将数据库配置转换为前端格式
                const frontendConfig = convertDbConfigToFrontend(dbConfig, selectedCompany);
                
                // console.log(`[AttendanceRules] 🔥 转换后的前端配置:`, frontendConfig);
                // console.log(`[AttendanceRules] 🔥 出勤天数规则:`, frontendConfig.attendanceDaysRules);
                
                // 🔥 确保设置到表单数据
                setFormData({
                    rules: { ...frontendConfig }
                });
                
                // console.log(`[AttendanceRules] ✅ 已设置表单数据`);
                
                // 同时更新localStorage作为备份
                setStoredConfigs(prev => ({
                    ...prev,
                    [selectedCompany]: {
                        ...prev[selectedCompany],
                        rules: frontendConfig
                    }
                }));
                
                // 🔥 重要：同步到规则引擎，确保全局规则立即生效
                try {
                    const { AttendanceRuleManager } = await import('../attendance/AttendanceRuleEngine.ts');
                    const { refreshDbRuleCache } = await import('../attendance/utils.ts');
                    
                    // 刷新规则配置缓存
                    await refreshDbRuleCache(selectedCompany);
                    
                    // 重新加载规则引擎
                    AttendanceRuleManager.reloadAllRules();
                    
                    // console.log(`[AttendanceRules] 🔥 规则引擎已同步更新 ${selectedCompany} 的规则`);
                } catch (engineError) {
                    console.warn('[AttendanceRules] 同步规则引擎时出错:', engineError);
                }
                
                // 显示成功消息
                setStatusMessage({ type: 'success', text: `✅ 已加载 ${selectedCompany === 'eyewind' ? '风眼' : '海多多'} 的配置 (版本 ${dbConfig.version})` });
                setTimeout(() => setStatusMessage(null), 3000);
            } else {
                // console.log(`[AttendanceRules] ⚠️ 数据库中没有 ${selectedCompany} 的配置，使用默认配置`);
                loadDefaultConfig();
                setStatusMessage({ type: 'error', text: '⚠️ 数据库中没有找到配置，已加载默认配置' });
                setTimeout(() => setStatusMessage(null), 3000);
            }
        } catch (error) {
            console.error(`[AttendanceRules] ❌ 从数据库加载 ${selectedCompany} 配置失败:`, error);
            // 如果数据库加载失败，回退到localStorage或默认配置
            if (isMountedRef.current) {
                loadDefaultConfig();
                setStatusMessage({ type: 'error', text: '❌ 从数据库加载配置失败，已加载本地配置' });
                setTimeout(() => setStatusMessage(null), 3000);
            }
        } finally {
            if (isMountedRef.current) {
                setIsLoadingConfig(false);
                setIsCurrentlyLoading(false);
                setHasInitialized(true);
            }
        }
        
        // 🔥 重置修改状态
        if (isMountedRef.current) {
            setHasChanges(false);
        }
    }, [selectedCompany]); // 🔥 只依赖 selectedCompany，移除 isCurrentlyLoading 避免循环

    // 🔥 主要初始化 useEffect - 每次进入页面或切换公司都强制从数据库加载规则
    useEffect(() => {
        // console.log(`[AttendanceRules] 🔥 触发数据加载 useEffect，公司: ${selectedCompany}`);
        
        // 🔥 重置初始化状态，强制重新加载
        setHasInitialized(false);
        setIsCurrentlyLoading(false);
        
        // 🔥 立即从数据库加载配置
        loadConfigFromDatabase();
        
        // 清理函数：组件卸载或公司切换时清理状态
        return () => {
            // console.log(`[AttendanceRules] 🧹 清理旧的 ${selectedCompany} 状态`);
        };
    }, [selectedCompany, loadConfigFromDatabase]); // 🔥 依赖 selectedCompany 和 loadConfigFromDatabase

    // 🔥 调试：监控 formData 变化
    useEffect(() => {
        // console.log('[AttendanceRules] 📊 formData 已更新:', {
            // shouldAttendanceCalcMethod: formData.rules.attendanceDaysRules?.shouldAttendanceCalcMethod,
            // fixedShouldAttendanceDays: formData.rules.attendanceDaysRules?.fixedShouldAttendanceDays,
            // workStartTime: formData.rules.workStartTime,
            // fullAttendanceBonus: formData.rules.fullAttendanceBonus
        // });
    }, [formData]);

    // 将数据库配置转换为前端格式
    const convertDbConfigToFrontend = (dbConfig: any, companyKey: string): AttendanceRuleConfig => {
        // console.log('[convertDbConfigToFrontend] 开始转换，dbConfig:', dbConfig);
        // console.log('[convertDbConfigToFrontend] dbConfig.rules 存在?', !!dbConfig.rules);
        
        const defaultConfig = DEFAULT_CONFIGS[companyKey as 'eyewind' | 'hydodo'];
        
        // 🔥 新的数据库设计：rules 字段已经是前端格式，直接使用
        if (dbConfig.rules) {
            // console.log('[convertDbConfigToFrontend] ✅ 使用新格式：直接返回 rules 对象');
            // console.log('[convertDbConfigToFrontend] rules.attendanceDaysRules:', dbConfig.rules.attendanceDaysRules);
            return dbConfig.rules as AttendanceRuleConfig;
        }
        
        // 🔥 兼容旧格式：如果没有 rules 字段，则从扁平字段转换
        // console.log('[convertDbConfigToFrontend] ⚠️ 使用旧格式：从扁平字段转换');
        // console.log('[convertDbConfigToFrontend] should_attend_calc:', dbConfig.should_attend_calc);
        // console.log('[convertDbConfigToFrontend] fixed_should_attendance_days:', dbConfig.fixed_should_attendance_days);
        
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

        // 🔥 转换统一的跨天打卡规则（支持跨天、跨周、跨月）
        // 注意：新版本不再使用 rules 数组，时间阈值从 lateRules 读取
        
        return {
            workStartTime: dbConfig.work_start_time?.substring(0, 5) || defaultConfig.rules!.workStartTime,
            workEndTime: dbConfig.work_end_time?.substring(0, 5) || defaultConfig.rules!.workEndTime,
            lunchStartTime: dbConfig.lunch_start_time?.substring(0, 5) || defaultConfig.rules!.lunchStartTime,
            lunchEndTime: dbConfig.lunch_end_time?.substring(0, 5) || defaultConfig.rules!.lunchEndTime,

            lateRules: lateRules.length > 0 ? lateRules : defaultConfig.rules!.lateRules,
            lateExemptionCount: dbConfig.late_exemption_count ?? defaultConfig.rules!.lateExemptionCount,
            lateExemptionMinutes: dbConfig.late_exemption_minutes ?? defaultConfig.rules!.lateExemptionMinutes,
            lateExemptionEnabled: dbConfig.late_exemption_enabled ?? defaultConfig.rules!.lateExemptionEnabled,
            lateExemptionMode: dbConfig.late_exemption_mode || defaultConfig.rules!.lateExemptionMode || 'byDate',

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
                fixedShouldAttendanceDays: (dbConfig.should_attend_calc === 'fixed') 
                    ? (dbConfig.fixed_should_attendance_days ?? 22) 
                    : undefined,
                includeHolidaysInShould: !(dbConfig.exclude_holidays ?? true), // 转换逻辑：exclude_holidays的反值
                actualAttendanceRules: {
                    countLateAsAttendance: dbConfig.count_late_as_attend ?? true,
                    countMissingAsAttendance: dbConfig.count_missing_as_attend ?? false,
                    countHalfDayLeaveAsHalf: dbConfig.count_half_leave_as_half ?? true,
                    minWorkHoursForFullDay: parseFloat(dbConfig.min_hours_for_full_day as any) || 4,
                    // 以下字段在后端不存在，使用默认值
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

            // 🔥 简化的跨天打卡规则（不再包含 rules 数组）
            crossDayCheckout: {
                enabled: dbConfig.cross_day_enabled ?? defaultConfig.rules!.crossDayCheckout.enabled,
                enableLookback: dbConfig.cross_day_enable_lookback ?? defaultConfig.rules!.crossDayCheckout.enableLookback,
                lookbackDays: dbConfig.cross_day_lookback_days ?? defaultConfig.rules!.crossDayCheckout.lookbackDays
            }
        };
    };

    const handleSave = async () => {
        // 🔥 添加保存确认提示
        const confirmMessage = `
⚠️ 重要提示：保存考勤规则将会影响全局考勤逻辑

此操作将会：
• 立即更新 ${selectedCompany === 'eyewind' ? '风眼' : '海多多'} 的考勤计算规则
• 影响所有考勤统计、绩效计算、全勤判定等逻辑
• 清除相关缓存数据，重新计算考勤结果
• 对正在使用系统的其他用户产生实时影响
• 同步保存到数据库，确保数据持久化

确定要保存这些规则更改吗？
        `.trim();

        if (!confirm(confirmMessage)) {
            return; // 用户取消保存
        }

        try {
            // 🔥 保存到数据库（新格式：直接发送前端格式的 rules）
            const rules = formData.rules;

            // 尝试保存到数据库
            let dbSaveSuccess = false;
            try {
                const result = await attendanceRuleApiService.updateFullConfig(
                    selectedCompany as CompanyId,
                    rules, // 直接发送前端格式的 rules
                    '通过考勤规则配置页面更新' // changeReason
                );
                if (result) {
                    dbSaveSuccess = true;
                    // console.log('[AttendanceRules] 规则已保存到数据库, version:', result.version);
                }
            } catch (dbError) {
                console.error('[AttendanceRules] 保存到数据库失败:', dbError);
                // 继续保存到本地存储作为备份
            }

            // 同时保存到本地存储（作为备份和兼容）
            setStoredConfigs(prev => ({
                ...prev,
                [selectedCompany]: {
                    ...prev[selectedCompany],
                    rules: formData.rules
                }
            }));

            // 🔥 刷新数据库规则缓存
            try {
                await refreshDbRuleCache(selectedCompany);
            } catch (cacheError) {
                console.warn('[AttendanceRules] 刷新数据库缓存失败:', cacheError);
            }

            // 🔥 全局同步：重新加载考勤规则引擎
            try {
                const { AttendanceRuleManager } = await import('../attendance/AttendanceRuleEngine.ts');
                AttendanceRuleManager.reloadAllRules();
            } catch (engineError) {
                console.warn('[AttendanceRules] 重新加载规则引擎时出错:', engineError);
            }

            // 清除相关缓存，确保新规则立即生效
            try {
                // 清除考勤数据缓存
                const currentDate = new Date();
                const currentYear = currentDate.getFullYear();
                const currentMonth = currentDate.getMonth() + 1;

                // 清除当前月份和上个月的缓存
                for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
                    const targetDate = new Date(currentYear, currentMonth - 1 - monthOffset, 1);
                    const year = targetDate.getFullYear();
                    const month = targetDate.getMonth() + 1;
                    const fromDate = `${year}-${month.toString().padStart(2, '0')}-01`;
                    const lastDay = new Date(year, month, 0).getDate();
                    const toDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

                    // 清除对应公司的缓存
                    const companyKey = selectedCompany === 'eyewind' ? '风眼' : '海多多';
                    const cacheKey = `ATTENDANCE_DATA_${companyKey}_${fromDate}_${toDate}`;
                    await SmartCache.remove(cacheKey);
                }

                // 清除员工列表缓存
                const companyKey = selectedCompany === 'eyewind' ? '风眼' : '海多多';
                await SmartCache.remove(`EMPLOYEES_LIST_${companyKey}`);

                // 清除考勤确认单缓存
                await SmartCache.remove('ATTENDANCE_SHEETS_RAW');
            } catch (cacheError) {
                console.warn('[AttendanceRules] 清除缓存时出错:', cacheError);
            }

            // 🔥 触发全局事件，通知其他组件规则已更新
            window.dispatchEvent(new CustomEvent('attendanceRulesUpdated', {
                detail: {
                    companyKey: selectedCompany,
                    rules: formData.rules,
                    timestamp: Date.now()
                }
            }));

            const successMsg = dbSaveSuccess 
                ? '✅ 考勤规则已保存到数据库并全局生效，相关缓存已清除。'
                : '⚠️ 考勤规则已保存到本地（数据库保存失败），相关缓存已清除。';
            setStatusMessage({ type: dbSaveSuccess ? 'success' : 'error', text: successMsg });
            setTimeout(() => setStatusMessage(null), 4000);
            
            // 弹窗提示
            if (dbSaveSuccess) {
                alert('考勤规则已成功保存到数据库并全局生效！');
            } else {
                alert('考勤规则已保存到本地，但数据库保存失败，请检查网络连接');
            }

            // 🔥 保存成功后重置修改状态
            setHasChanges(false);
        } catch (e) {
            console.error('[AttendanceRules] 保存失败:', e);
            setStatusMessage({ type: 'error', text: '❌ 保存失败，请重试。' });
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const handleReset = () => {
        if (confirm('确定要重置为系统默认值吗？这将覆盖您当前的修改。')) {
            const defaults = DEFAULT_CONFIGS[selectedCompany];
            setFormData({
                rules: { ...defaults.rules! }
            });
            setStatusMessage({ type: 'success', text: '已重置为默认值 (未保存，请点击保存以生效)。' });

            // 🔥 重置后标记为有修改
            setHasChanges(true);
        }
    };

    const updateRule = (key: keyof AttendanceRuleConfig, value: any) => {
        setFormData(prev => ({
            ...prev,
            rules: { ...prev.rules, [key]: value }
        }));

        // 🔥 标记为有修改
        setHasChanges(true);
    };

    const updateOvertimeCheckpoint = (index: number, val: string) => {
        const newCheckpoints = [...formData.rules.overtimeCheckpoints];
        newCheckpoints[index] = val;
        updateRule('overtimeCheckpoints', newCheckpoints);
    };

    const addOvertimeCheckpoint = () => {
        updateRule('overtimeCheckpoints', [...formData.rules.overtimeCheckpoints, "19:30"]);
    };

    const removeOvertimeCheckpoint = (index: number) => {
        const newCheckpoints = formData.rules.overtimeCheckpoints.filter((_, i) => i !== index);
        updateRule('overtimeCheckpoints', newCheckpoints);
    };

    // Late Rules Management
    const addLateRule = () => {
        const newRule: LateRule = {
            previousDayCheckoutTime: "18:00",
            lateThresholdTime: "09:01",
            description: "前一天18:00打卡，9:01算迟到"
        };
        updateRule('lateRules', [...formData.rules.lateRules, newRule]);
    };

    const updateLateRule = (index: number, field: keyof LateRule, value: any) => {
        const newRules = [...formData.rules.lateRules];
        newRules[index] = { ...newRules[index], [field]: value };
        
        // 如果修改了前一天打卡时间或迟到阈值时间，自动生成描述
        if (field === 'previousDayCheckoutTime' || field === 'lateThresholdTime') {
            const updatedRule = newRules[index];
            const checkoutTime = field === 'previousDayCheckoutTime' ? value : updatedRule.previousDayCheckoutTime;
            const thresholdTime = field === 'lateThresholdTime' ? value : updatedRule.lateThresholdTime;
            
            // 格式化时间显示
            const formatTime = (time: string) => {
                if (time === "24:00") return "24:00";
                return time;
            };
            
            newRules[index].description = `前一天${formatTime(checkoutTime)}打卡，${formatTime(thresholdTime)}算迟到`;
        }
        
        updateRule('lateRules', newRules);
    };

    const removeLateRule = (index: number) => {
        const newRules = formData.rules.lateRules.filter((_, i) => i !== index);
        updateRule('lateRules', newRules);
    };

    // Leave Display Rules Management
    const addLeaveDisplayRule = () => {
        const newRule: LeaveDisplayRule = {
            leaveType: "病假",
            shortTermHours: 24,
            shortTermLabel: "病假<=24小时",
            longTermLabel: "病假>24小时"
        };
        updateRule('leaveDisplayRules', [...formData.rules.leaveDisplayRules, newRule]);
    };

    const updateLeaveDisplayRule = (index: number, field: keyof LeaveDisplayRule, value: any) => {
        const newRules = [...formData.rules.leaveDisplayRules];
        newRules[index] = { ...newRules[index], [field]: value };
        updateRule('leaveDisplayRules', newRules);
    };

    const removeLeaveDisplayRule = (index: number) => {
        const newRules = formData.rules.leaveDisplayRules.filter((_, i) => i !== index);
        updateRule('leaveDisplayRules', newRules);
    };

    // Performance Penalty Rules Management
    const addPerformancePenaltyRule = () => {
        const newRule = {
            minMinutes: 0,
            maxMinutes: 5,
            penalty: 50,
            description: "0-5分钟扣50元"
        };
        updateRule('performancePenaltyRules', [...formData.rules.performancePenaltyRules, newRule]);
    };

    const updatePerformancePenaltyRule = (index: number, field: keyof PerformancePenaltyRule, value: any) => {
        const newRules = [...formData.rules.performancePenaltyRules];
        newRules[index] = { ...newRules[index], [field]: value };
        
        // 🔥 自动生成规则描述
        if (field === 'minMinutes' || field === 'maxMinutes' || field === 'penalty') {
            const updatedRule = newRules[index];
            const minMinutes = field === 'minMinutes' ? value : updatedRule.minMinutes;
            const maxMinutes = field === 'maxMinutes' ? value : updatedRule.maxMinutes;
            const penalty = field === 'penalty' ? value : updatedRule.penalty;
            
            // 生成描述文本
            const maxDisplay = maxMinutes === 999 ? '∞' : maxMinutes;
            newRules[index].description = `${minMinutes}-${maxDisplay}分钟扣${penalty}元`;
        }
        
        updateRule('performancePenaltyRules', newRules);
    };

    const removePerformancePenaltyRule = (index: number) => {
        const newRules = formData.rules.performancePenaltyRules.filter((_, i) => i !== index);
        updateRule('performancePenaltyRules', newRules);
    };

    // 验证绩效扣款规则是否有重叠
    const validatePerformancePenaltyRules = (rules: PerformancePenaltyRule[]): string[] => {
        const errors: string[] = [];

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];

            // 检查范围是否有效
            if (rule.minMinutes >= rule.maxMinutes && rule.maxMinutes !== 999) {
                errors.push(`规则 ${i + 1}: 最小分钟数不能大于等于最大分钟数`);
            }

            // 检查是否与其他规则重叠
            for (let j = i + 1; j < rules.length; j++) {
                const otherRule = rules[j];

                // 检查范围重叠
                const overlap = !(rule.maxMinutes <= otherRule.minMinutes || otherRule.maxMinutes <= rule.minMinutes);
                if (overlap && rule.maxMinutes !== 999 && otherRule.maxMinutes !== 999) {
                    errors.push(`规则 ${i + 1} 和规则 ${j + 1} 的时间范围重叠`);
                }
            }
        }

        return errors;
    };

    // Full Attendance Rules Management
    const addFullAttendanceRule = () => {
        const newRule: FullAttendanceRule = {
            type: 'personal',
            displayName: '新规则',
            enabled: true,
            threshold: 0,
            unit: 'count'
        };
        updateRule('fullAttendanceRules', [...formData.rules.fullAttendanceRules, newRule]);
    };

    const updateFullAttendanceRule = (index: number, field: keyof FullAttendanceRule, value: any) => {
        const newRules = [...formData.rules.fullAttendanceRules];
        newRules[index] = { ...newRules[index], [field]: value };
        updateRule('fullAttendanceRules', newRules);
    };

    const removeFullAttendanceRule = (index: number) => {
        const newRules = formData.rules.fullAttendanceRules.filter((_, i) => i !== index);
        updateRule('fullAttendanceRules', newRules);
    };

    // 全勤规则手风琴展开/折叠切换
    const toggleFullAttendanceRuleExpansion = (index: number) => {
        const newExpanded = new Set(expandedFullAttendanceRules);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedFullAttendanceRules(newExpanded);
    };

    // 绩效规则手风琴展开/折叠切换
    const togglePerformanceRuleExpansion = (index: number) => {
        const newExpanded = new Set(expandedPerformanceRules);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedPerformanceRules(newExpanded);
    };

    // AI 考勤规则分析
    const runRuleAnalysis = async (forceRefresh = false) => {
        const currentCompany = selectedCompany;
        currentCompanyRef.current = currentCompany;
        
        setShowAiAnalysis(true);
        setIsAnalysing(true);
        
        // 生成缓存 key（基于公司和规则配置的哈希）
        const rulesHash = JSON.stringify(formData.rules).slice(0, 100); // 简化的哈希
        const cacheKey = `RULE_ANALYSIS_${currentCompany}_${btoa(rulesHash).slice(0, 20)}`;
        
        // 检查缓存（非强制刷新时）
        if (!forceRefresh) {
            try {
                const cachedContent = await getCachedAnalysis(cacheKey);
                if (currentCompanyRef.current !== currentCompany) return;
                if (cachedContent) {
                    setAiAnalysis(cachedContent);
                    setIsAnalysing(false);
                    return;
                }
            } catch (err) {
                console.error("Cache check failed", err);
            }
        }
        
        setAiAnalysis(null);
        
        const companyName = currentCompany === 'eyewind' ? '风眼科技' : '海多多';
        const rules = formData.rules;
        
        // 构建详细的规则描述
        const lateRulesDesc = rules.lateRules.map((r, i) => 
            `  ${i + 1}. ${r.description}`
        ).join('\n');
        
        const fullAttendanceRulesDesc = rules.fullAttendanceRules
            .filter(r => r.enabled)
            .map(r => `  - ${r.displayName}: ${r.threshold === 0 ? '任何违规都影响全勤' : `超过${r.threshold}${r.unit === 'count' ? '次' : '小时'}影响全勤`}`)
            .join('\n') || '  无限制条件';
        
        const performanceRulesDesc = rules.performancePenaltyRules
            .map(r => `  - ${r.minMinutes}-${r.maxMinutes === 999 ? '∞' : r.maxMinutes}分钟: 扣款${r.penalty}元`)
            .join('\n');
        
        const prompt = `
作为一名资深的人力资源管理专家和劳动法律顾问，请对以下企业考勤规则配置进行全面、客观的专业分析。

【企业信息】
公司名称：${companyName}

【作息时间配置】
- 工作时间：${rules.workStartTime} - ${rules.workEndTime}
- 午休时间：${rules.lunchStartTime} - ${rules.lunchEndTime}

【迟到规则配置】
${lateRulesDesc}

【弹性豁免政策】
- 豁免功能：${rules.lateExemptionEnabled ? '已启用' : '已关闭'}
${rules.lateExemptionEnabled ? `- 月度豁免次数：${rules.lateExemptionCount}次
- 单次豁免时长上限：${rules.lateExemptionMinutes}分钟
- 豁免计算方式：${rules.lateExemptionMode === 'byMinutes' ? '按迟到时长（优先豁免迟到时间最长的记录）' : '按日期顺序（从月初到月末依次豁免）'}` : ''}

【全勤奖规则】
- 全勤功能：${rules.fullAttendanceEnabled ? '已启用' : '已关闭'}
${rules.fullAttendanceEnabled ? `- 全勤奖金额：${rules.fullAttendanceBonus}元
- 判定条件：
${fullAttendanceRulesDesc}` : ''}

【绩效扣款规则】
- 绩效考核功能：${rules.performancePenaltyEnabled ? '已启用' : '已关闭'}
${rules.performancePenaltyEnabled ? `- 扣款模式：${rules.performancePenaltyMode === 'unlimited' ? '上不封顶模式' : '封顶模式'}
${rules.performancePenaltyMode === 'unlimited' 
    ? `- 迟到起算时间：${rules.unlimitedPenaltyThresholdTime || '09:01'}
- 计算方式：${rules.unlimitedPenaltyCalcType === 'fixed' ? '固定扣款' : '按分钟计算'}
${rules.unlimitedPenaltyCalcType === 'fixed' 
    ? `- 固定扣款金额：${rules.unlimitedPenaltyFixedAmount || 50}元/次` 
    : `- 每分钟扣款：${rules.unlimitedPenaltyPerMinute || 5}元`}` 
    : `- 封顶子模式：${(rules.cappedPenaltyType || 'ladder') === 'ladder' ? '阶梯扣款' : '固定封顶'}
- 扣款上限：${rules.maxPerformancePenalty}元
${(rules.cappedPenaltyType || 'ladder') === 'ladder' 
    ? `- 扣款阶梯：
${performanceRulesDesc}` 
    : `- 每分钟扣款：${rules.cappedPenaltyPerMinute || 5}元`}`}` : ''}

【加班相关】
- 周末加班起算阈值：${rules.weekendOvertimeThreshold}分钟

请对每个规则模块进行**利弊分析**，格式如下：

## 1. 作息时间配置分析
### ✅ 优点与亮点
- （列出该配置的优点、合理之处、对企业和员工的好处）

### ⚠️ 潜在风险与改进空间
- （列出可能存在的问题、隐患或可优化的地方）

## 2. 迟到规则分析
### ✅ 优点与亮点
- （分析弹性上班机制的好处，如体现人性化管理、照顾加班员工等）

### ⚠️ 潜在风险与改进空间
- （分析可能的执行难点、争议点等）

## 3. 豁免政策分析
### ✅ 优点与亮点
- （分析豁免政策对员工体验、企业文化的正面影响）

### ⚠️ 潜在风险与改进空间
- （分析可能被滥用的风险等）

## 4. 全勤奖规则分析
### ✅ 优点与亮点
- （分析全勤奖对员工激励的作用）

### ⚠️ 潜在风险与改进空间
- （分析判定条件是否合理等）

## 5. 绩效扣款规则分析
### ✅ 优点与亮点
- （分析阶梯式扣款的合理性、对纪律的约束作用）

### ⚠️ 潜在风险与改进空间
- （分析是否过于严苛或宽松等）

## 6. 劳动法合规性审查
请结合以下法律法规进行合规性分析：
- 《中华人民共和国劳动法》
- 《中华人民共和国劳动合同法》
- 《工资支付暂行规定》
- 《企业职工带薪年休假实施办法》

重点审查：
- 工作时间是否符合法定标准（每日不超过8小时，每周不超过44小时）
- 加班规定是否合规（加班费计算标准）
- 扣款规则是否存在违法风险（不得克扣工资）
- 全勤奖设置是否可能构成变相克扣工资

## 7. 综合评价与建议
- 整体规则体系的优势总结
- 需要重点关注的法律风险
- 具体可落地的改进建议
- 行业最佳实践参考

请以专业、客观、平衡的角度进行分析，既要肯定规则设计的合理之处，也要指出潜在的法律风险和改进空间。
        `.trim();

        try {
            const response = await analyzeAttendanceInsights(prompt);
            if (currentCompanyRef.current !== currentCompany) return;
            setAiAnalysis(response.content);
            setCachedAnalysis(cacheKey, response.content, 'attendance').catch(console.error);
        } catch (err) {
            if (currentCompanyRef.current !== currentCompany) return;
            console.error(err);
            setAiAnalysis("AI 分析生成失败，请稍后重试。");
        } finally {
            if (currentCompanyRef.current === currentCompany) {
                setIsAnalysing(false);
            }
        }
    };

    // 当切换公司时，清空 AI 分析
    useEffect(() => {
        setAiAnalysis(null);
        setShowAiAnalysis(false);
    }, [selectedCompany]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">考勤规则配置</h2>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">
                        管理企业考勤计算规则，包括作息时间、弹性豁免、绩效规则等。
                    </p>
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-amber-800 dark:text-amber-200">
                                <strong>全局影响提醒：</strong>修改考勤规则将立即影响所有考勤计算逻辑，包括迟到统计、绩效扣款、全勤判定、加班计算等。保存前请确认规则设置正确。
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex gap-2 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                        <button
                            onClick={() => setSelectedCompany('eyewind')}
                            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${selectedCompany === 'eyewind' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                            风眼 (Eyewind)
                        </button>
                        <button
                            onClick={() => setSelectedCompany('hydodo')}
                            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${selectedCompany === 'hydodo' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                        >
                            海多多 (Hydodo)
                        </button>
                    </div>
                    <button
                        onClick={loadConfigFromDatabase}
                        disabled={isLoadingConfig}
                        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            isLoadingConfig 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                        title="从数据库重新加载配置"
                    >
                        <RefreshCwIcon className={`w-4 h-4 ${isLoadingConfig ? 'animate-spin' : ''}`} />
                        {isLoadingConfig ? '加载中...' : '刷新'}
                    </button>
                </div>
            </header>

            {/* AI 规则分析面板 - 放在最显眼的位置，带手风琴功能 */}
            <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-white dark:from-slate-800 dark:via-indigo-900/20 dark:to-slate-900 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 overflow-hidden shadow-lg">
                {/* 手风琴头部 - 可点击展开/收起 */}
                <div 
                    className="p-5 bg-gradient-to-r from-indigo-100/50 to-purple-100/50 dark:from-indigo-900/30 dark:to-purple-900/30 border-b border-indigo-200 dark:border-indigo-800 cursor-pointer hover:from-indigo-100 hover:to-purple-100 dark:hover:from-indigo-900/40 dark:hover:to-purple-900/40 transition-colors"
                    onClick={() => setShowAiAnalysis(!showAiAnalysis)}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md">
                                <SparklesIcon className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
                                    AI 规则分析
                                    <span className="text-xs font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 px-2 py-0.5 rounded-full">HR专家视角</span>
                                </h3>
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                                    基于《劳动法》《劳动合同法》及人力资源管理最佳实践，从合规性、员工体验、管理效能等维度分析
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    runRuleAnalysis(false);
                                }}
                                disabled={isAnalysing}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isAnalysing ? (
                                    <>
                                        <Loader2Icon className="w-4 h-4 animate-spin" />
                                        分析中...
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-4 h-4" />
                                        分析当前规则
                                    </>
                                )}
                            </button>
                            <ChevronDownIcon className={`w-5 h-5 text-indigo-500 transition-transform duration-200 ${showAiAnalysis ? 'rotate-180' : ''}`} />
                        </div>
                    </div>
                </div>
                
                {/* 手风琴内容区域 */}
                {showAiAnalysis && (
                    <div className="p-6 animate-in slide-in-from-top-2 duration-200">
                        {aiAnalysis && !isAnalysing && (
                            <div className="flex justify-end mb-4">
                                <button
                                    onClick={() => runRuleAnalysis(true)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                                >
                                    <RefreshCwIcon className="w-3 h-3" />
                                    重新分析
                                </button>
                            </div>
                        )}
                        {isAnalysing ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-2xl flex items-center justify-center mb-4">
                                    <Loader2Icon className="w-8 h-8 animate-spin text-indigo-500" />
                                </div>
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">AI 正在分析考勤规则配置...</span>
                                <span className="text-xs text-slate-400 mt-1">从劳动法合规性、员工体验、管理效能等多维度进行专业分析</span>
                            </div>
                        ) : aiAnalysis ? (
                            <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                <MarkdownRenderer text={aiAnalysis} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 rounded-2xl flex items-center justify-center mb-4">
                                    <SparklesIcon className="w-8 h-8 text-indigo-400" />
                                </div>
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">点击上方「分析当前规则」按钮</span>
                                <span className="text-xs text-slate-400 text-center max-w-md">
                                    AI 将从劳动法合规性、员工体验、管理效能等维度，对当前考勤规则配置进行专业分析，并给出优化建议
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[500px] flex flex-col">
                {/* 分类标签页 */}
                <div className="border-b border-slate-200 dark:border-slate-700">
                    <div className="flex">
                        {RULE_CATEGORIES.map((cat) => (
                            <button
                                key={cat.key}
                                onClick={() => setSelectedCategory(cat.key)}
                                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
                                    selectedCategory === cat.key
                                        ? 'text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-700/50'
                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                                }`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <span>{cat.icon}</span>
                                    <span>{cat.label}</span>
                                </div>
                                {selectedCategory === cat.key && (
                                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${cat.activeColor}`} />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 分类描述 */}
                <div className="px-6 py-3 bg-slate-50 dark:bg-slate-700/30 border-b border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        {RULE_CATEGORIES.find(c => c.key === selectedCategory)?.description}
                    </p>
                </div>

                <div className="p-6 flex-1">
                    <div className="space-y-4">
                        {/* ========== 全局通用分类 ========== */}
                        {selectedCategory === 'global' && (
                            <>
                        {/* Section 1: Work Schedule */}
                        <div className="border border-indigo-200 dark:border-indigo-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('workSchedule')}
                                className="w-full p-4 bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-between hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <ClockIcon className="w-5 h-5 text-indigo-500" /> 作息时间配置
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-indigo-500 transition-transform ${expandedSections.has('workSchedule') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('workSchedule') && (
                                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">常规班次</label>
                                        <div className="flex items-center gap-2">
                                            <input type="time" value={formData.rules.workStartTime} onChange={e => updateRule('workStartTime', e.target.value)} className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded px-3 py-1.5 text-sm font-mono min-w-[80px] text-center" />
                                            <span className="text-indigo-400">-</span>
                                            <input type="time" value={formData.rules.workEndTime} onChange={e => updateRule('workEndTime', e.target.value)} className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded px-3 py-1.5 text-sm font-mono min-w-[80px] text-center" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">午休时间 (扣除工时)</label>
                                        <div className="flex items-center gap-2">
                                            <input type="time" value={formData.rules.lunchStartTime} onChange={e => updateRule('lunchStartTime', e.target.value)} className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded px-3 py-1.5 text-sm font-mono min-w-[80px] text-center" />
                                            <span className="text-indigo-400">-</span>
                                            <input type="time" value={formData.rules.lunchEndTime} onChange={e => updateRule('lunchEndTime', e.target.value)} className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 rounded px-3 py-1.5 text-sm font-mono min-w-[80px] text-center" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section 1.5: Attendance Days Rules */}
                        <div className="border border-cyan-200 dark:border-cyan-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('attendanceDays')}
                                className="w-full p-4 bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-between hover:bg-cyan-100 dark:hover:bg-cyan-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <ClockIcon className="w-5 h-5 text-cyan-500" /> 出勤天数规则
                                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${formData.rules.attendanceDaysRules?.enabled ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-700'}`}>
                                        {formData.rules.attendanceDaysRules?.enabled ? '已启用' : '已关闭'}
                                    </span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-cyan-500 transition-transform ${expandedSections.has('attendanceDays') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('attendanceDays') && (
                                <div className="p-4 bg-cyan-50/50 dark:bg-cyan-900/10 space-y-4">
                                    {/* 功能开关 */}
                                    <div className="p-4 bg-cyan-100/50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800/50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-sm font-medium text-cyan-800 dark:text-cyan-200">启用出勤天数统计</label>
                                                <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
                                                    启用后，系统将显示"应出勤天数"和"正常出勤天数"列
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateRule('attendanceDaysRules', { 
                                                    ...formData.rules.attendanceDaysRules, 
                                                    enabled: !formData.rules.attendanceDaysRules?.enabled 
                                                })}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 ${
                                                    formData.rules.attendanceDaysRules?.enabled ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                        formData.rules.attendanceDaysRules?.enabled ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    <div className={`space-y-4 ${!formData.rules.attendanceDaysRules?.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {/* 应出勤天数计算规则 */}
                                        <div className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-lg border border-cyan-100 dark:border-cyan-800/50">
                                            <h4 className="text-sm font-semibold text-cyan-800 dark:text-cyan-200 mb-3">应出勤天数计算</h4>
                                            <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-3">
                                                应出勤天数 = 当月工作日 + 法定节假日（不包含周末）
                                            </p>
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-cyan-700 dark:text-cyan-300">计算方式</label>
                                                    <select
                                                        value={formData.rules.attendanceDaysRules?.shouldAttendanceCalcMethod || 'workdays'}
                                                        onChange={e => updateRule('attendanceDaysRules', {
                                                            ...formData.rules.attendanceDaysRules,
                                                            shouldAttendanceCalcMethod: e.target.value as 'workdays' | 'fixed' | 'custom'
                                                        })}
                                                        className="w-full max-w-[300px] px-3 py-2 bg-white dark:bg-slate-800 border border-cyan-200 dark:border-cyan-800 rounded-lg text-sm"
                                                    >
                                                        <option value="workdays">自动计算（工作日+法定节假日）</option>
                                                        <option value="fixed">固定天数</option>
                                                    </select>
                                                </div>

                                                {formData.rules.attendanceDaysRules?.shouldAttendanceCalcMethod === 'fixed' && (
                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-medium text-cyan-700 dark:text-cyan-300">固定应出勤天数</label>
                                                        <input
                                                            type="number"
                                                            value={formData.rules.attendanceDaysRules?.fixedShouldAttendanceDays || 22}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                fixedShouldAttendanceDays: parseInt(e.target.value) || 22
                                                            })}
                                                            className="w-full max-w-[150px] px-3 py-2 bg-white dark:bg-slate-800 border border-cyan-200 dark:border-cyan-800 rounded-lg text-sm"
                                                            min="1"
                                                            max="31"
                                                        />
                                                    </div>
                                                )}

                                                {formData.rules.attendanceDaysRules?.shouldAttendanceCalcMethod === 'workdays' && (
                                                    <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.rules.attendanceDaysRules?.includeHolidaysInShould ?? true}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                includeHolidaysInShould: e.target.checked
                                                            })}
                                                            className="rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                                                        />
                                                        包含法定节假日
                                                        <span className="text-xs text-cyan-500">(应出勤天数包含法定节假日)</span>
                                                    </label>
                                                )}
                                            </div>
                                        </div>

                                        {/* 正常出勤天数计算规则 */}
                                        <div className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-lg border border-cyan-100 dark:border-cyan-800/50">
                                            <h4 className="text-sm font-semibold text-cyan-800 dark:text-cyan-200 mb-3">正常出勤天数计算</h4>
                                            <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-3">
                                                正常出勤天数包含：法定节假日、调休、带薪福利假、外出、出差；不包含：普通周末、请假、病假、事假
                                            </p>
                                            
                                            {/* 基础规则 */}
                                            <div className="space-y-3 mb-4">
                                                <h5 className="text-xs font-medium text-cyan-700 dark:text-cyan-300 border-b border-cyan-200 dark:border-cyan-700 pb-1">基础规则</h5>
                                                <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countLateAsAttendance ?? true}
                                                        onChange={e => updateRule('attendanceDaysRules', {
                                                            ...formData.rules.attendanceDaysRules,
                                                            actualAttendanceRules: {
                                                                ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                countLateAsAttendance: e.target.checked
                                                            }
                                                        })}
                                                        className="rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                                                    />
                                                    迟到算出勤
                                                    <span className="text-xs text-cyan-500">(迟到当天仍计为1天出勤)</span>
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countMissingAsAttendance ?? false}
                                                        onChange={e => updateRule('attendanceDaysRules', {
                                                            ...formData.rules.attendanceDaysRules,
                                                            actualAttendanceRules: {
                                                                ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                countMissingAsAttendance: e.target.checked
                                                            }
                                                        })}
                                                        className="rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                                                    />
                                                    缺卡算出勤
                                                    <span className="text-xs text-cyan-500">(缺卡当天仍计为1天出勤)</span>
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countHalfDayLeaveAsHalf ?? true}
                                                        onChange={e => updateRule('attendanceDaysRules', {
                                                            ...formData.rules.attendanceDaysRules,
                                                            actualAttendanceRules: {
                                                                ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                countHalfDayLeaveAsHalf: e.target.checked
                                                            }
                                                        })}
                                                        className="rounded border-cyan-300 text-cyan-600 focus:ring-cyan-500"
                                                    />
                                                    半天假算0.5天出勤
                                                    <span className="text-xs text-cyan-500">(请半天假计为0.5天出勤)</span>
                                                </label>
                                            </div>

                                            {/* 算正常出勤的类型 */}
                                            <div className="space-y-3 mb-4">
                                                <h5 className="text-xs font-medium text-green-700 dark:text-green-300 border-b border-green-200 dark:border-green-700 pb-1">✅ 以下类型算正常出勤</h5>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countHolidayAsAttendance ?? true}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                actualAttendanceRules: {
                                                                    ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                    countHolidayAsAttendance: e.target.checked
                                                                }
                                                            })}
                                                            className="rounded border-green-300 text-green-600 focus:ring-green-500"
                                                        />
                                                        法定节假日
                                                    </label>
                                                    <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countCompTimeAsAttendance ?? true}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                actualAttendanceRules: {
                                                                    ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                    countCompTimeAsAttendance: e.target.checked
                                                                }
                                                            })}
                                                            className="rounded border-green-300 text-green-600 focus:ring-green-500"
                                                        />
                                                        调休
                                                    </label>
                                                    <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countPaidLeaveAsAttendance ?? true}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                actualAttendanceRules: {
                                                                    ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                    countPaidLeaveAsAttendance: e.target.checked
                                                                }
                                                            })}
                                                            className="rounded border-green-300 text-green-600 focus:ring-green-500"
                                                        />
                                                        带薪福利假
                                                        <span className="text-xs text-cyan-500">(年假、婚假、产假等)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countTripAsAttendance ?? true}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                actualAttendanceRules: {
                                                                    ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                    countTripAsAttendance: e.target.checked
                                                                }
                                                            })}
                                                            className="rounded border-green-300 text-green-600 focus:ring-green-500"
                                                        />
                                                        出差
                                                    </label>
                                                    <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countOutAsAttendance ?? true}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                actualAttendanceRules: {
                                                                    ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                    countOutAsAttendance: e.target.checked
                                                                }
                                                            })}
                                                            className="rounded border-green-300 text-green-600 focus:ring-green-500"
                                                        />
                                                        外出
                                                    </label>
                                                </div>
                                            </div>

                                            {/* 不算正常出勤的类型 */}
                                            <div className="space-y-3 mb-4">
                                                <h5 className="text-xs font-medium text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-700 pb-1">❌ 以下类型默认不算正常出勤</h5>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countSickLeaveAsAttendance ?? false}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                actualAttendanceRules: {
                                                                    ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                    countSickLeaveAsAttendance: e.target.checked
                                                                }
                                                            })}
                                                            className="rounded border-red-300 text-red-600 focus:ring-red-500"
                                                        />
                                                        病假算出勤
                                                    </label>
                                                    <label className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.rules.attendanceDaysRules?.actualAttendanceRules?.countPersonalLeaveAsAttendance ?? false}
                                                            onChange={e => updateRule('attendanceDaysRules', {
                                                                ...formData.rules.attendanceDaysRules,
                                                                actualAttendanceRules: {
                                                                    ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                                    countPersonalLeaveAsAttendance: e.target.checked
                                                                }
                                                            })}
                                                            className="rounded border-red-300 text-red-600 focus:ring-red-500"
                                                        />
                                                        事假算出勤
                                                    </label>
                                                </div>
                                            </div>

                                            {/* 工时规则 */}
                                            <div className="flex items-center gap-3 pt-2 border-t border-cyan-200 dark:border-cyan-700">
                                                <label className="text-sm text-cyan-700 dark:text-cyan-300">满足工时算全天出勤:</label>
                                                <input
                                                    type="number"
                                                    value={formData.rules.attendanceDaysRules?.actualAttendanceRules?.minWorkHoursForFullDay ?? 4}
                                                    onChange={e => updateRule('attendanceDaysRules', {
                                                        ...formData.rules.attendanceDaysRules,
                                                        actualAttendanceRules: {
                                                            ...formData.rules.attendanceDaysRules?.actualAttendanceRules,
                                                            minWorkHoursForFullDay: parseInt(e.target.value) || 4
                                                        }
                                                    })}
                                                    className="w-20 px-3 py-1.5 bg-white dark:bg-slate-800 border border-cyan-200 dark:border-cyan-800 rounded-lg text-sm text-center"
                                                    min="1"
                                                    max="12"
                                                />
                                                <span className="text-sm text-cyan-600 dark:text-cyan-400">小时</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                            </>
                        )}

                        {/* ========== 特殊规则分类 ========== */}
                        {selectedCategory === 'special' && (
                            <>
                        {/* Section 1.6: Workday Swap Rules (法定调班) */}
                        <div className="border border-amber-200 dark:border-amber-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('workdaySwap')}
                                className="w-full p-4 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <ClockIcon className="w-5 h-5 text-amber-500" /> 法定调班规则
                                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${formData.rules.workdaySwapRules?.enabled ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-700'}`}>
                                        {formData.rules.workdaySwapRules?.enabled 
                                            ? (formData.rules.workdaySwapRules?.autoFollowNationalHoliday 
                                                ? `自动 + ${formData.rules.workdaySwapRules?.customDays?.length || 0} 条自定义` 
                                                : `${formData.rules.workdaySwapRules?.customDays?.length || 0} 条自定义`) 
                                            : '已关闭'}
                                    </span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-amber-500 transition-transform ${expandedSections.has('workdaySwap') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('workdaySwap') && (
                                <div className="p-4 bg-amber-50/50 dark:bg-amber-900/10 space-y-4">
                                    {/* 功能开关 */}
                                    <div className="p-4 bg-amber-100/50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-sm font-medium text-amber-800 dark:text-amber-200">启用法定调班</label>
                                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                                    启用后，系统将根据调班规则调整应出勤天数计算
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateRule('workdaySwapRules', { 
                                                    ...formData.rules.workdaySwapRules, 
                                                    enabled: !formData.rules.workdaySwapRules?.enabled 
                                                })}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${
                                                    formData.rules.workdaySwapRules?.enabled ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                        formData.rules.workdaySwapRules?.enabled ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    <div className={`space-y-4 ${!formData.rules.workdaySwapRules?.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {/* 自动跟随国家安排 */}
                                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-800/50">
                                            <label className="flex items-center gap-3 text-sm text-amber-800 dark:text-amber-200">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.rules.workdaySwapRules?.autoFollowNationalHoliday ?? true}
                                                    onChange={e => updateRule('workdaySwapRules', {
                                                        ...formData.rules.workdaySwapRules,
                                                        autoFollowNationalHoliday: e.target.checked
                                                    })}
                                                    className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-5 h-5"
                                                />
                                                <div>
                                                    <span className="font-medium">自动跟随国家法定调休安排</span>
                                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                                        系统将自动识别春节、国庆等法定节假日的调休安排
                                                    </p>
                                                </div>
                                            </label>
                                        </div>

                                        {/* 自定义日期调整 */}
                                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-800/50">
                                            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">自定义日期调整</h4>
                                            <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
                                                设置特定日期是否需要上班，可覆盖默认规则（如公司周年庆放假、特殊补班等）
                                            </p>
                                            
                                            {/* 已配置的日期列表 */}
                                            <div className="space-y-2 mb-4">
                                                {(formData.rules.workdaySwapRules?.customDays || []).map((day, index) => (
                                                    <div key={index} className="flex items-center gap-3 bg-white dark:bg-slate-800 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                                                        <input
                                                            type="date"
                                                            value={day.date}
                                                            onChange={e => {
                                                                const newDays = [...(formData.rules.workdaySwapRules?.customDays || [])];
                                                                newDays[index] = { ...day, date: e.target.value };
                                                                updateRule('workdaySwapRules', { ...formData.rules.workdaySwapRules, customDays: newDays });
                                                            }}
                                                            className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 rounded-lg text-sm font-mono"
                                                        />
                                                        <select
                                                            value={day.type}
                                                            onChange={e => {
                                                                const newDays = [...(formData.rules.workdaySwapRules?.customDays || [])];
                                                                newDays[index] = { ...day, type: e.target.value as 'workday' | 'holiday' };
                                                                updateRule('workdaySwapRules', { ...formData.rules.workdaySwapRules, customDays: newDays });
                                                            }}
                                                            className={`px-3 py-1.5 border rounded-lg text-sm font-medium ${
                                                                day.type === 'workday' 
                                                                    ? 'bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300' 
                                                                    : 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300'
                                                            }`}
                                                        >
                                                            <option value="workday">📅 需要上班</option>
                                                            <option value="holiday">🏖️ 不需要上班</option>
                                                        </select>
                                                        <input
                                                            type="text"
                                                            value={day.reason}
                                                            placeholder="原因（如：春节调休补班）"
                                                            onChange={e => {
                                                                const newDays = [...(formData.rules.workdaySwapRules?.customDays || [])];
                                                                newDays[index] = { ...day, reason: e.target.value };
                                                                updateRule('workdaySwapRules', { ...formData.rules.workdaySwapRules, customDays: newDays });
                                                            }}
                                                            className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 rounded-lg text-sm"
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                const newDays = (formData.rules.workdaySwapRules?.customDays || []).filter((_, i) => i !== index);
                                                                updateRule('workdaySwapRules', { ...formData.rules.workdaySwapRules, customDays: newDays });
                                                            }}
                                                            className="p-1.5 text-amber-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* 添加按钮 */}
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        const today = new Date().toISOString().split('T')[0];
                                                        const newDays = [...(formData.rules.workdaySwapRules?.customDays || []), { date: today, type: 'workday' as const, reason: '' }];
                                                        updateRule('workdaySwapRules', { ...formData.rules.workdaySwapRules, customDays: newDays });
                                                    }}
                                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-dashed border-orange-300 transition-colors"
                                                >
                                                    <PlusCircleIcon className="w-4 h-4" /> 添加补班日
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const today = new Date().toISOString().split('T')[0];
                                                        const newDays = [...(formData.rules.workdaySwapRules?.customDays || []), { date: today, type: 'holiday' as const, reason: '' }];
                                                        updateRule('workdaySwapRules', { ...formData.rules.workdaySwapRules, customDays: newDays });
                                                    }}
                                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-600 bg-green-50 hover:bg-green-100 rounded-lg border border-dashed border-green-300 transition-colors"
                                                >
                                                    <PlusCircleIcon className="w-4 h-4" /> 添加放假日
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section 1.7: Remote Work Rules (居家办公) */}
                        <div className="border border-violet-200 dark:border-violet-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('remoteWork')}
                                className="w-full p-4 bg-violet-50 dark:bg-violet-900/20 flex items-center justify-between hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <SettingsIcon className="w-5 h-5 text-violet-500" /> 居家办公规则
                                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${formData.rules.remoteWorkRules?.enabled ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-700'}`}>
                                        {formData.rules.remoteWorkRules?.enabled ? (formData.rules.remoteWorkRules?.countAsNormalAttendance ? '算正常出勤' : '不算出勤') : '已关闭'}
                                    </span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-violet-500 transition-transform ${expandedSections.has('remoteWork') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('remoteWork') && (
                                <div className="p-4 bg-violet-50/50 dark:bg-violet-900/10 space-y-4">
                                    {/* 功能开关 */}
                                    <div className="p-4 bg-violet-100/50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800/50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-sm font-medium text-violet-800 dark:text-violet-200">启用居家办公</label>
                                                <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                                                    启用后，可配置居家办公日期和相关规则
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateRule('remoteWorkRules', { 
                                                    ...formData.rules.remoteWorkRules, 
                                                    enabled: !formData.rules.remoteWorkRules?.enabled 
                                                })}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                                                    formData.rules.remoteWorkRules?.enabled ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                        formData.rules.remoteWorkRules?.enabled ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    <div className={`space-y-4 ${!formData.rules.remoteWorkRules?.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {/* 基本设置 */}
                                        <div className="bg-violet-50 dark:bg-violet-900/20 p-4 rounded-lg border border-violet-100 dark:border-violet-800/50">
                                            <h4 className="text-sm font-semibold text-violet-800 dark:text-violet-200 mb-3">基本设置</h4>
                                            <div className="space-y-3">
                                                <label className="flex items-center gap-2 text-sm text-violet-700 dark:text-violet-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.rules.remoteWorkRules?.countAsNormalAttendance ?? true}
                                                        onChange={e => updateRule('remoteWorkRules', {
                                                            ...formData.rules.remoteWorkRules,
                                                            countAsNormalAttendance: e.target.checked
                                                        })}
                                                        className="rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                                                    />
                                                    居家办公算正常出勤
                                                    <span className="text-xs text-violet-500">(计入正常出勤天数)</span>
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-violet-700 dark:text-violet-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.rules.remoteWorkRules?.requireApproval ?? false}
                                                        onChange={e => updateRule('remoteWorkRules', {
                                                            ...formData.rules.remoteWorkRules,
                                                            requireApproval: e.target.checked
                                                        })}
                                                        className="rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                                                    />
                                                    需要审批
                                                    <span className="text-xs text-violet-500">(员工申请居家办公需经审批)</span>
                                                </label>
                                                <div className="flex items-center gap-3 pt-2">
                                                    <label className="text-sm text-violet-700 dark:text-violet-300">每月最多居家办公:</label>
                                                    <input
                                                        type="number"
                                                        value={formData.rules.remoteWorkRules?.maxDaysPerMonth ?? ''}
                                                        placeholder="不限"
                                                        onChange={e => updateRule('remoteWorkRules', {
                                                            ...formData.rules.remoteWorkRules,
                                                            maxDaysPerMonth: e.target.value ? parseInt(e.target.value) : undefined
                                                        })}
                                                        className="w-20 px-3 py-1.5 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded-lg text-sm text-center"
                                                        min="1"
                                                        max="31"
                                                    />
                                                    <span className="text-sm text-violet-600 dark:text-violet-400">天</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 全员居家办公日期 */}
                                        <div className="bg-violet-50 dark:bg-violet-900/20 p-4 rounded-lg border border-violet-100 dark:border-violet-800/50">
                                            <h4 className="text-sm font-semibold text-violet-800 dark:text-violet-200 mb-3">全员居家办公日期</h4>
                                            <p className="text-xs text-violet-600 dark:text-violet-400 mb-3">
                                                配置全员居家办公的日期，如恶劣天气、特殊情况等
                                            </p>
                                            <div className="space-y-3">
                                                {(formData.rules.remoteWorkRules?.remoteDays || []).filter(d => d.scope === 'all').map((remote, index) => {
                                                    const actualIndex = (formData.rules.remoteWorkRules?.remoteDays || []).findIndex(d => d === remote);
                                                    const timeMode = remote.timeMode || 'day';
                                                    return (
                                                        <div key={index} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-violet-200 dark:border-violet-800">
                                                            <div className="flex items-center gap-3 flex-wrap">
                                                                {/* 日期选择 */}
                                                                <input
                                                                    type="date"
                                                                    value={remote.date}
                                                                    onChange={e => {
                                                                        const newRemoteDays = [...(formData.rules.remoteWorkRules?.remoteDays || [])];
                                                                        newRemoteDays[actualIndex] = { ...remote, date: e.target.value };
                                                                        updateRule('remoteWorkRules', { ...formData.rules.remoteWorkRules, remoteDays: newRemoteDays });
                                                                    }}
                                                                    className="px-2 py-1.5 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded text-sm"
                                                                />
                                                                
                                                                {/* 时间模式选择 */}
                                                                <div className="flex items-center gap-1 bg-violet-100 dark:bg-violet-900/30 rounded-lg p-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const newRemoteDays = [...(formData.rules.remoteWorkRules?.remoteDays || [])];
                                                                            newRemoteDays[actualIndex] = { ...remote, timeMode: 'day', startTime: undefined, endTime: undefined };
                                                                            updateRule('remoteWorkRules', { ...formData.rules.remoteWorkRules, remoteDays: newRemoteDays });
                                                                        }}
                                                                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                                                            timeMode === 'day' 
                                                                                ? 'bg-violet-500 text-white' 
                                                                                : 'text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800'
                                                                        }`}
                                                                    >
                                                                        按天
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const newRemoteDays = [...(formData.rules.remoteWorkRules?.remoteDays || [])];
                                                                            newRemoteDays[actualIndex] = { ...remote, timeMode: 'hour', startTime: '09:00', endTime: '12:00' };
                                                                            updateRule('remoteWorkRules', { ...formData.rules.remoteWorkRules, remoteDays: newRemoteDays });
                                                                        }}
                                                                        className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                                                            timeMode === 'hour' 
                                                                                ? 'bg-violet-500 text-white' 
                                                                                : 'text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-800'
                                                                        }`}
                                                                    >
                                                                        按小时
                                                                    </button>
                                                                </div>

                                                                {/* 按小时模式：时间段选择 */}
                                                                {timeMode === 'hour' && (
                                                                    <div className="flex items-center gap-1">
                                                                        <input
                                                                            type="time"
                                                                            value={remote.startTime || '09:00'}
                                                                            onChange={e => {
                                                                                const newRemoteDays = [...(formData.rules.remoteWorkRules?.remoteDays || [])];
                                                                                newRemoteDays[actualIndex] = { ...remote, startTime: e.target.value };
                                                                                updateRule('remoteWorkRules', { ...formData.rules.remoteWorkRules, remoteDays: newRemoteDays });
                                                                            }}
                                                                            className="px-2 py-1 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded text-sm w-24"
                                                                        />
                                                                        <span className="text-violet-400">-</span>
                                                                        <input
                                                                            type="time"
                                                                            value={remote.endTime || '12:00'}
                                                                            onChange={e => {
                                                                                const newRemoteDays = [...(formData.rules.remoteWorkRules?.remoteDays || [])];
                                                                                newRemoteDays[actualIndex] = { ...remote, endTime: e.target.value };
                                                                                updateRule('remoteWorkRules', { ...formData.rules.remoteWorkRules, remoteDays: newRemoteDays });
                                                                            }}
                                                                            className="px-2 py-1 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded text-sm w-24"
                                                                        />
                                                                    </div>
                                                                )}

                                                                {/* 按天模式：显示"全天"标签 */}
                                                                {timeMode === 'day' && (
                                                                    <span className="px-2 py-1 text-xs font-medium text-violet-600 bg-violet-100 dark:bg-violet-900/30 rounded">
                                                                        全天
                                                                    </span>
                                                                )}

                                                                {/* 删除按钮 */}
                                                                <button
                                                                    onClick={() => {
                                                                        const newRemoteDays = (formData.rules.remoteWorkRules?.remoteDays || []).filter((_, i) => i !== actualIndex);
                                                                        updateRule('remoteWorkRules', { ...formData.rules.remoteWorkRules, remoteDays: newRemoteDays });
                                                                    }}
                                                                    className="ml-auto text-violet-400 hover:text-red-500 transition-colors"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                            
                                                            {/* 原因输入 */}
                                                            <div className="mt-2">
                                                                <input
                                                                    type="text"
                                                                    value={remote.reason}
                                                                    placeholder="原因（如：恶劣天气）"
                                                                    onChange={e => {
                                                                        const newRemoteDays = [...(formData.rules.remoteWorkRules?.remoteDays || [])];
                                                                        newRemoteDays[actualIndex] = { ...remote, reason: e.target.value };
                                                                        updateRule('remoteWorkRules', { ...formData.rules.remoteWorkRules, remoteDays: newRemoteDays });
                                                                    }}
                                                                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-violet-200 dark:border-violet-800 rounded text-sm"
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                <button
                                                    onClick={() => {
                                                        const newRemoteDays = [...(formData.rules.remoteWorkRules?.remoteDays || []), { date: '', reason: '', timeMode: 'day' as const, scope: 'all' as const }];
                                                        updateRule('remoteWorkRules', { ...formData.rules.remoteWorkRules, remoteDays: newRemoteDays });
                                                    }}
                                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-violet-600 bg-white hover:bg-violet-50 rounded-lg border border-dashed border-violet-300 transition-colors"
                                                >
                                                    <PlusCircleIcon className="w-4 h-4" /> 添加居家办公日期
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 请假展示规则 - 属于特殊规则分类 */}
                        {/* Section 8: Leave Display Rules */}
                        <div className="border border-purple-200 dark:border-purple-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('leaveDisplay')}
                                className="w-full p-4 bg-purple-50 dark:bg-purple-900/20 flex items-center justify-between hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <InfoIcon className="w-5 h-5 text-purple-500" /> 请假展示规则
                                    <span className="text-xs font-normal text-purple-500 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">{formData.rules.leaveDisplayRules.length} 条规则</span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-purple-500 transition-transform ${expandedSections.has('leaveDisplay') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('leaveDisplay') && (
                            <div className="p-4 bg-purple-50/50 dark:bg-purple-900/10 space-y-4">
                                    {formData.rules.leaveDisplayRules.map((rule, index) => (
                                        <div key={index} className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg border border-purple-100 dark:border-purple-800/50">
                                            <div className="flex justify-between items-start mb-3">
                                                <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-200">请假规则 {index + 1}</h4>
                                                <button onClick={() => removeLeaveDisplayRule(index)} className="text-purple-400 hover:text-purple-600 transition-colors">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-purple-700 dark:text-purple-300">请假类型</label>
                                                    <input
                                                        type="text"
                                                        value={rule.leaveType}
                                                        onChange={e => updateLeaveDisplayRule(index, 'leaveType', e.target.value)}
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-purple-700 dark:text-purple-300">分界时长 (小时)</label>
                                                    <input
                                                        type="number"
                                                        value={rule.shortTermHours}
                                                        onChange={e => updateLeaveDisplayRule(index, 'shortTermHours', parseInt(e.target.value))}
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-purple-700 dark:text-purple-300">短期标签</label>
                                                    <input
                                                        type="text"
                                                        value={rule.shortTermLabel}
                                                        onChange={e => updateLeaveDisplayRule(index, 'shortTermLabel', e.target.value)}
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-purple-700 dark:text-purple-300">长期标签</label>
                                                    <input
                                                        type="text"
                                                        value={rule.longTermLabel}
                                                        onChange={e => updateLeaveDisplayRule(index, 'longTermLabel', e.target.value)}
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-800 rounded-lg text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button onClick={addLeaveDisplayRule} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg border border-dashed border-purple-300 transition-colors">
                                        <PlusCircleIcon className="w-4 h-4" /> 添加请假展示规则
                                    </button>
                            </div>
                            )}
                        </div>
                            </>
                        )}

                        {/* ========== 行政管理分类 ========== */}
                        {selectedCategory === 'admin' && (
                            <>
                        {/* Section 2: Late Rules */}
                        <div className="border border-red-200 dark:border-red-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('lateRules')}
                                className="w-full p-4 bg-red-50 dark:bg-red-900/20 flex items-center justify-between hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <AlertTriangleIcon className="w-5 h-5 text-red-500" /> 迟到规则配置
                                    <span className="text-xs font-normal text-red-500 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">{formData.rules.lateRules.length} 条规则</span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-red-500 transition-transform ${expandedSections.has('lateRules') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('lateRules') && (
                                <div className="p-4 bg-red-50/50 dark:bg-red-900/10 space-y-4">
                                    {formData.rules.lateRules.map((rule, index) => (
                                        <div key={index} className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-800/50">
                                            <div className="flex justify-between items-start mb-3">
                                                <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">迟到规则 {index + 1}</h4>
                                                {formData.rules.lateRules.length > 1 && (
                                                    <button onClick={() => removeLateRule(index)} className="text-red-400 hover:text-red-600 transition-colors">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-red-700 dark:text-red-300">前一天打卡时间</label>
                                                    {rule.previousDayCheckoutTime === "24:00" ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="px-3 py-2 bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg text-sm font-mono text-center flex-1">
                                                                24:00
                                                            </div>
                                                            <button 
                                                                onClick={() => updateLateRule(index, 'previousDayCheckoutTime', '23:59')}
                                                                className="text-red-600 hover:text-red-800 text-xs"
                                                                title="改为时间选择器"
                                                            >
                                                                编辑
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="time"
                                                                value={rule.previousDayCheckoutTime}
                                                                onChange={e => updateLateRule(index, 'previousDayCheckoutTime', e.target.value)}
                                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg text-sm font-mono"
                                                            />
                                                            <button 
                                                                onClick={() => updateLateRule(index, 'previousDayCheckoutTime', '24:00')}
                                                                className="text-red-600 hover:text-red-800 text-xs whitespace-nowrap"
                                                                title="设为24:00"
                                                            >
                                                                24:00
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-red-700 dark:text-red-300">迟到阈值时间</label>
                                                    <input
                                                        type="time"
                                                        value={rule.lateThresholdTime}
                                                        onChange={e => updateLateRule(index, 'lateThresholdTime', e.target.value)}
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg text-sm font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-medium text-red-700 dark:text-red-300">规则描述</label>
                                                    <input
                                                        type="text"
                                                        value={rule.description}
                                                        readOnly
                                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg text-sm text-gray-600 dark:text-gray-400"
                                                        placeholder="自动生成"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <button onClick={addLateRule} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-dashed border-red-300 transition-colors">
                                        <PlusCircleIcon className="w-4 h-4" /> 添加迟到规则
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Section 3: Flexibility */}
                        <div className="border border-orange-200 dark:border-orange-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('flexibility')}
                                className="w-full p-4 bg-orange-50 dark:bg-orange-900/20 flex items-center justify-between hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <SettingsIcon className="w-5 h-5 text-orange-500" /> 考勤弹性与豁免
                                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${formData.rules.lateExemptionEnabled ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-700'}`}>
                                        {formData.rules.lateExemptionEnabled ? '已启用' : '已关闭'}
                                    </span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-orange-500 transition-transform ${expandedSections.has('flexibility') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('flexibility') && (
                                <div className="p-4 bg-orange-50/50 dark:bg-orange-900/10">
                                    {/* 豁免功能开关 */}
                                    <div className="mb-6 p-4 bg-orange-100/50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800/50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-sm font-medium text-orange-800 dark:text-orange-200">启用豁免功能</label>
                                                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                                                    启用后，系统将显示"豁免后迟到分钟数"列；关闭后，显示"迟到分钟数"列
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateRule('lateExemptionEnabled', !formData.rules.lateExemptionEnabled)}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                                                    formData.rules.lateExemptionEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                        formData.rules.lateExemptionEnabled ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${!formData.rules.lateExemptionEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">月度豁免次数</label>
                                            <input type="number" value={formData.rules.lateExemptionCount} onChange={e => updateRule('lateExemptionCount', parseInt(e.target.value))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm" />
                                            <p className="text-xs text-slate-400">超过此次数后的迟到将计入异常。</p>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">单次豁免时长 (分钟)</label>
                                            <input type="number" value={formData.rules.lateExemptionMinutes} onChange={e => updateRule('lateExemptionMinutes', parseInt(e.target.value))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm" />
                                            <p className="text-xs text-slate-400">仅当迟到时间小于此设定值时，才消耗豁免次数。</p>
                                        </div>
                                    </div>
                                    
                                    {/* 豁免方式选择 */}
                                    <div className={`mt-6 space-y-2 ${!formData.rules.lateExemptionEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">豁免计算方式</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <button
                                                type="button"
                                                onClick={() => updateRule('lateExemptionMode', 'byDate')}
                                                className={`p-4 rounded-lg border-2 transition-all ${
                                                    formData.rules.lateExemptionMode === 'byDate'
                                                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-300'
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                        formData.rules.lateExemptionMode === 'byDate'
                                                            ? 'border-orange-500 bg-orange-500'
                                                            : 'border-slate-300 dark:border-slate-600'
                                                    }`}>
                                                        {formData.rules.lateExemptionMode === 'byDate' && (
                                                            <div className="w-2 h-2 rounded-full bg-white"></div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <div className="font-medium text-slate-900 dark:text-white">按日期顺序</div>
                                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                            从月初到月末依次豁免迟到记录（默认方式）
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => updateRule('lateExemptionMode', 'byMinutes')}
                                                className={`p-4 rounded-lg border-2 transition-all ${
                                                    formData.rules.lateExemptionMode === 'byMinutes'
                                                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-orange-300'
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                                        formData.rules.lateExemptionMode === 'byMinutes'
                                                            ? 'border-orange-500 bg-orange-500'
                                                            : 'border-slate-300 dark:border-slate-600'
                                                    }`}>
                                                        {formData.rules.lateExemptionMode === 'byMinutes' && (
                                                            <div className="w-2 h-2 rounded-full bg-white"></div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 text-left">
                                                        <div className="font-medium text-slate-900 dark:text-white">按迟到时长</div>
                                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                            优先豁免迟到时间最长的记录
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2">
                                            💡 提示：选择"按迟到时长"可以最大化利用豁免次数，减少员工的迟到分钟数
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                            </>
                        )}

                        {/* ========== 财务相关分类 ========== */}
                        {selectedCategory === 'finance' && (
                            <>
                        {/* Section 4: Full Attendance Bonus */}
                        <div className="border border-green-200 dark:border-green-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('fullAttendance')}
                                className="w-full p-4 bg-green-50 dark:bg-green-900/20 flex items-center justify-between hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <DollarSignIcon className="w-5 h-5 text-green-500" /> 全勤奖规则
                                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${formData.rules.fullAttendanceEnabled ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-700'}`}>
                                        {formData.rules.fullAttendanceEnabled ? `¥${formData.rules.fullAttendanceBonus}` : '已关闭'}
                                    </span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-green-500 transition-transform ${expandedSections.has('fullAttendance') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('fullAttendance') && (
                                <div className="p-4 bg-green-50/50 dark:bg-green-900/10 space-y-4">
                                    {/* 全勤功能开关 */}
                                    <div className="p-4 bg-green-100/50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800/50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-sm font-medium text-green-800 dark:text-green-200">启用全勤功能</label>
                                                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                                    启用后，系统将显示"是否全勤"列；关闭后，隐藏"是否全勤"列
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateRule('fullAttendanceEnabled', !formData.rules.fullAttendanceEnabled)}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
                                                    formData.rules.fullAttendanceEnabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                        formData.rules.fullAttendanceEnabled ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    <div className={`bg-green-100/30 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800/50 ${!formData.rules.fullAttendanceEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-green-800 dark:text-green-200">全勤奖金额 (元)</label>
                                            <input
                                                type="number"
                                                value={formData.rules.fullAttendanceBonus}
                                                onChange={e => updateRule('fullAttendanceBonus', parseInt(e.target.value) || 0)}
                                                className="w-full max-w-[200px] px-3 py-2 bg-white dark:bg-slate-800 border border-green-200 dark:border-green-800 rounded-lg text-sm font-mono"
                                                min="0"
                                            />
                                        </div>
                                    </div>

                                    {/* 全勤判定规则 */}
                                    {selectedCompany === 'hydodo' && formData.rules.fullAttendanceRules.length === 0 ? (
                                        // 海多多的默认空状态显示
                                        <div className={`bg-green-100/30 dark:bg-green-900/20 p-6 rounded-lg border border-green-100 dark:border-green-800/50 text-center ${!formData.rules.fullAttendanceEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <div className="w-12 h-12 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <DollarSignIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                                            </div>
                                            <h4 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">全勤判定规则</h4>
                                            <p className="text-green-600 dark:text-green-300 text-sm mb-4 max-w-md mx-auto">
                                                海多多当前未配置全勤判定规则，默认所有员工都可获得全勤奖。<br />
                                                如需设置限制条件，请添加判定规则。
                                            </p>
                                            <button onClick={addFullAttendanceRule} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 bg-white hover:bg-green-50 rounded-lg border border-green-300 transition-colors shadow-sm">
                                                <PlusCircleIcon className="w-4 h-4" /> 添加判定规则
                                            </button>
                                        </div>
                                    ) : (
                                        // 完整的全勤规则编辑界面
                                        <div className={`bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800/50 ${!formData.rules.fullAttendanceEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="text-sm font-semibold text-green-800 dark:text-green-200">全勤判定规则</h4>
                                                <p className="text-xs text-green-600 dark:text-green-400">启用的规则将影响全勤奖发放</p>
                                            </div>

                                            {/* 规则列表容器 - 设置最大高度和滚动 */}
                                            <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                                                {formData.rules.fullAttendanceRules.map((rule, index) => (
                                                    <div key={index} className="bg-white dark:bg-slate-800 rounded-lg border border-green-200 dark:border-green-800 overflow-hidden">
                                                        {/* 手风琴头部 */}
                                                        <div className="p-4">
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-3 flex-1">
                                                                    {/* 开关样式 */}
                                                                    <div className="flex items-center">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => updateFullAttendanceRule(index, 'enabled', !rule.enabled)}
                                                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${rule.enabled ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                                                                                }`}
                                                                        >
                                                                            <span
                                                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-6' : 'translate-x-1'
                                                                                    }`}
                                                                            />
                                                                        </button>
                                                                    </div>
                                                                    <h5 className="text-sm font-semibold text-green-800 dark:text-green-200">{rule.displayName}</h5>

                                                                    {/* 状态描述 - 移到同一行 */}
                                                                    <div className="text-xs flex-1">
                                                                        {rule.enabled ? (
                                                                            <span className="text-green-600 dark:text-green-400">
                                                                                <span className="font-medium">✓ 已启用：</span>
                                                                                {rule.threshold === 0 ?
                                                                                    `任何${rule.displayName}都会影响全勤奖` :
                                                                                    `${rule.displayName}超过${rule.threshold}${rule.unit === 'count' ? '次' : '小时'}时影响全勤奖`
                                                                                }
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-gray-500 dark:text-gray-400">
                                                                                <span className="font-medium">✗ 已关闭：</span>
                                                                                {rule.displayName}不会影响全勤奖，员工可正常获得全勤
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* 手风琴展开按钮 */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleFullAttendanceRuleExpansion(index)}
                                                                        className="p-1 text-green-600 hover:text-green-800 transition-colors"
                                                                    >
                                                                        <ChevronDownIcon
                                                                            className={`w-4 h-4 transition-transform ${expandedFullAttendanceRules.has(index) ? 'rotate-180' : ''
                                                                                }`}
                                                                        />
                                                                    </button>
                                                                </div>
                                                                <button onClick={() => removeFullAttendanceRule(index)} className="text-green-400 hover:text-red-500 transition-colors ml-2">
                                                                    <TrashIcon className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* 手风琴内容 - 可展开的配置区域 */}
                                                        {expandedFullAttendanceRules.has(index) && (
                                                            <div className="px-4 pb-4 border-t border-green-100 dark:border-green-800">
                                                                <div className="pt-4">
                                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                                        <div className="space-y-2">
                                                                            <label className="block text-xs font-medium text-green-700 dark:text-green-300">考勤类型</label>
                                                                            <select
                                                                                value={rule.type}
                                                                                onChange={e => updateFullAttendanceRule(index, 'type', e.target.value)}
                                                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-green-200 dark:border-green-800 rounded-lg text-sm"
                                                                                disabled={!rule.enabled}
                                                                            >
                                                                                <option value="late">迟到</option>
                                                                                <option value="missing">缺卡</option>
                                                                                <option value="absenteeism">旷工</option>
                                                                                <option value="annual">年假</option>
                                                                                <option value="sick">病假</option>
                                                                                <option value="personal">事假</option>
                                                                                <option value="bereavement">丧假</option>
                                                                                <option value="paternity">陪产假</option>
                                                                                <option value="maternity">产假</option>
                                                                                <option value="parental">育儿假</option>
                                                                                <option value="marriage">婚假</option>
                                                                                <option value="trip">出差</option>
                                                                                <option value="compTime">调休</option>
                                                                            </select>
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <label className="block text-xs font-medium text-green-700 dark:text-green-300">显示名称</label>
                                                                            <input
                                                                                type="text"
                                                                                value={rule.displayName}
                                                                                onChange={e => updateFullAttendanceRule(index, 'displayName', e.target.value)}
                                                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-green-200 dark:border-green-800 rounded-lg text-sm"
                                                                                disabled={!rule.enabled}
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <label className="block text-xs font-medium text-green-700 dark:text-green-300">阈值</label>
                                                                            <input
                                                                                type="number"
                                                                                value={rule.threshold}
                                                                                onChange={e => updateFullAttendanceRule(index, 'threshold', parseInt(e.target.value) || 0)}
                                                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-green-200 dark:border-green-800 rounded-lg text-sm"
                                                                                min="0"
                                                                                disabled={!rule.enabled}
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <label className="block text-xs font-medium text-green-700 dark:text-green-300">单位</label>
                                                                            <select
                                                                                value={rule.unit}
                                                                                onChange={e => updateFullAttendanceRule(index, 'unit', e.target.value)}
                                                                                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-green-200 dark:border-green-800 rounded-lg text-sm"
                                                                                disabled={!rule.enabled}
                                                                            >
                                                                                <option value="count">次数</option>
                                                                                <option value="hours">小时</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* 添加规则按钮 */}
                                            {formData.rules.fullAttendanceRules.length > 0 && (
                                                <div className="mt-4">
                                                    <button onClick={addFullAttendanceRule} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 bg-white hover:bg-green-50 rounded-lg border border-dashed border-green-300 transition-colors">
                                                        <PlusCircleIcon className="w-4 h-4" /> 添加判定规则
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Section 5: Performance Penalty Rules */}
                        <div className="border border-emerald-200 dark:border-emerald-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('performance')}
                                className="w-full p-4 bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-between hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <DollarSignIcon className="w-5 h-5 text-emerald-600" /> 绩效扣款规则
                                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${formData.rules.performancePenaltyEnabled ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-700'}`}>
                                        {formData.rules.performancePenaltyEnabled 
                                            ? (formData.rules.performancePenaltyMode === 'unlimited' 
                                                ? (formData.rules.unlimitedPenaltyCalcType === 'fixed'
                                                    ? `上不封顶 ¥${formData.rules.unlimitedPenaltyFixedAmount || 50}/次`
                                                    : `上不封顶 ¥${formData.rules.unlimitedPenaltyPerMinute || 5}/分钟`)
                                                : ((formData.rules.cappedPenaltyType || 'ladder') === 'ladder'
                                                    ? `阶梯扣款 上限¥${formData.rules.maxPerformancePenalty}`
                                                    : `固定封顶 ¥${formData.rules.cappedPenaltyPerMinute || 5}/分钟 上限¥${formData.rules.maxPerformancePenalty}`)) 
                                            : '已关闭'}
                                    </span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-emerald-500 transition-transform ${expandedSections.has('performance') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('performance') && (
                            <div className="p-4 bg-emerald-50/50 dark:bg-emerald-900/10 space-y-4">
                                    {/* 绩效考核功能开关 */}
                                    <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200">启用绩效考核功能</label>
                                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                                                    启用后，系统将显示"考勤绩效"列；关闭后，隐藏"考勤绩效"列
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateRule('performancePenaltyEnabled', !formData.rules.performancePenaltyEnabled)}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                                                    formData.rules.performancePenaltyEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                                }`}
                                            >
                                                <span
                                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                        formData.rules.performancePenaltyEnabled ? 'translate-x-5' : 'translate-x-0'
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {selectedCompany === 'hydodo' && formData.rules.performancePenaltyRules.length === 0 ? (
                                        // 海多多的默认空状态显示
                                        <div className={`bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-lg border border-emerald-100 dark:border-emerald-800/50 text-center ${!formData.rules.performancePenaltyEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                            <DollarSignIcon className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                                            <h4 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200 mb-2">绩效扣款规则</h4>
                                            <p className="text-emerald-600 dark:text-emerald-300 text-sm mb-4">
                                                海多多当前未配置绩效扣款规则，默认不进行迟到扣款。<br />
                                                如需启用，请添加扣款规则。
                                            </p>
                                            <button onClick={addPerformancePenaltyRule} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-white hover:bg-emerald-50 rounded-lg border border-emerald-300 transition-colors mx-auto">
                                                <PlusCircleIcon className="w-4 h-4" /> 添加扣款规则
                                            </button>
                                        </div>
                                    ) : (
                                        // 风眼或海多多有规则时的完整界面
                                        <>
                                            {/* 扣款模式选择 */}
                                            <div className={`bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50 ${!formData.rules.performancePenaltyEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200 mb-3">扣款模式</label>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {/* 上不封顶模式 */}
                                                    <button
                                                        type="button"
                                                        onClick={() => updateRule('performancePenaltyMode', 'unlimited')}
                                                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                                                            formData.rules.performancePenaltyMode === 'unlimited'
                                                                ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40'
                                                                : 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300 dark:hover:border-emerald-700'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                                                formData.rules.performancePenaltyMode === 'unlimited'
                                                                    ? 'border-emerald-500 bg-emerald-500'
                                                                    : 'border-emerald-300 dark:border-emerald-600'
                                                            }`}>
                                                                {formData.rules.performancePenaltyMode === 'unlimited' && (
                                                                    <div className="w-2 h-2 rounded-full bg-white" />
                                                                )}
                                                            </div>
                                                            <span className="font-semibold text-emerald-800 dark:text-emerald-200">上不封顶模式</span>
                                                        </div>
                                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 ml-6">
                                                            按迟到分钟数 × 单价计算，无上限
                                                        </p>
                                                    </button>
                                                    
                                                    {/* 自定义封顶模式 */}
                                                    <button
                                                        type="button"
                                                        onClick={() => updateRule('performancePenaltyMode', 'capped')}
                                                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                                                            formData.rules.performancePenaltyMode === 'capped'
                                                                ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40'
                                                                : 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300 dark:hover:border-emerald-700'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                                                formData.rules.performancePenaltyMode === 'capped'
                                                                    ? 'border-emerald-500 bg-emerald-500'
                                                                    : 'border-emerald-300 dark:border-emerald-600'
                                                            }`}>
                                                                {formData.rules.performancePenaltyMode === 'capped' && (
                                                                    <div className="w-2 h-2 rounded-full bg-white" />
                                                                )}
                                                            </div>
                                                            <span className="font-semibold text-emerald-800 dark:text-emerald-200">封顶模式</span>
                                                        </div>
                                                        <p className="text-xs text-emerald-600 dark:text-emerald-400 ml-6">
                                                            支持阶梯扣款或固定封顶两种子模式
                                                        </p>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 上不封顶模式配置 */}
                                            {formData.rules.performancePenaltyMode === 'unlimited' && (
                                                <div className={`bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50 ${!formData.rules.performancePenaltyEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    <div className="space-y-4">
                                                        {/* 迟到起算时间 */}
                                                        <div className="space-y-2">
                                                            <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200">迟到起算时间</label>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm text-emerald-600 dark:text-emerald-400">超过</span>
                                                                <input
                                                                    type="time"
                                                                    value={formData.rules.unlimitedPenaltyThresholdTime || '09:01'}
                                                                    onChange={e => updateRule('unlimitedPenaltyThresholdTime', e.target.value)}
                                                                    className="px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                                                />
                                                                <span className="text-sm text-emerald-600 dark:text-emerald-400">开始计算迟到</span>
                                                            </div>
                                                        </div>

                                                        {/* 扣款计算方式选择 */}
                                                        <div className="space-y-2">
                                                            <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200">扣款计算方式</label>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                {/* 按分钟计算 */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateRule('unlimitedPenaltyCalcType', 'perMinute')}
                                                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                                                        formData.rules.unlimitedPenaltyCalcType === 'perMinute'
                                                                            ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40'
                                                                            : 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-3 h-3 rounded-full border-2 ${
                                                                            formData.rules.unlimitedPenaltyCalcType === 'perMinute'
                                                                                ? 'border-emerald-500 bg-emerald-500'
                                                                                : 'border-emerald-300'
                                                                        }`}>
                                                                            {formData.rules.unlimitedPenaltyCalcType === 'perMinute' && (
                                                                                <div className="w-full h-full rounded-full bg-white scale-50" />
                                                                            )}
                                                                        </div>
                                                                        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">按分钟计算</span>
                                                                    </div>
                                                                    <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1 ml-5">
                                                                        迟到分钟数 × 单价
                                                                    </p>
                                                                </button>
                                                                
                                                                {/* 固定扣款 */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateRule('unlimitedPenaltyCalcType', 'fixed')}
                                                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                                                        formData.rules.unlimitedPenaltyCalcType === 'fixed'
                                                                            ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40'
                                                                            : 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className={`w-3 h-3 rounded-full border-2 ${
                                                                            formData.rules.unlimitedPenaltyCalcType === 'fixed'
                                                                                ? 'border-emerald-500 bg-emerald-500'
                                                                                : 'border-emerald-300'
                                                                        }`}>
                                                                            {formData.rules.unlimitedPenaltyCalcType === 'fixed' && (
                                                                                <div className="w-full h-full rounded-full bg-white scale-50" />
                                                                            )}
                                                                        </div>
                                                                        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">固定扣款</span>
                                                                    </div>
                                                                    <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1 ml-5">
                                                                        超时即扣固定金额
                                                                    </p>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* 按分钟计算配置 */}
                                                        {formData.rules.unlimitedPenaltyCalcType === 'perMinute' && (
                                                            <div className="space-y-2 p-3 bg-white dark:bg-slate-800 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                                                <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200">每分钟扣款金额 (元)</label>
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="number"
                                                                        value={formData.rules.unlimitedPenaltyPerMinute || 5}
                                                                        onChange={e => updateRule('unlimitedPenaltyPerMinute', parseInt(e.target.value) || 0)}
                                                                        className="w-full max-w-[200px] px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-emerald-200 dark:border-emerald-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                                                        min="0"
                                                                        step="1"
                                                                    />
                                                                    <span className="text-sm text-emerald-600 dark:text-emerald-400">元/分钟</span>
                                                                </div>
                                                                <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                                                                    <p className="text-xs text-amber-700 dark:text-amber-300">
                                                                        <strong>示例：</strong>员工 09:31 打卡 = 迟到30分钟 = 30 × {formData.rules.unlimitedPenaltyPerMinute || 5} = <strong>{30 * (formData.rules.unlimitedPenaltyPerMinute || 5)}元</strong>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* 固定扣款配置 */}
                                                        {formData.rules.unlimitedPenaltyCalcType === 'fixed' && (
                                                            <div className="space-y-2 p-3 bg-white dark:bg-slate-800 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                                                <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200">固定扣款金额 (元)</label>
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="number"
                                                                        value={formData.rules.unlimitedPenaltyFixedAmount || 50}
                                                                        onChange={e => updateRule('unlimitedPenaltyFixedAmount', parseInt(e.target.value) || 0)}
                                                                        className="w-full max-w-[200px] px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-emerald-200 dark:border-emerald-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                                                        min="0"
                                                                    />
                                                                    <span className="text-sm text-emerald-600 dark:text-emerald-400">元/次</span>
                                                                </div>
                                                                <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                                                                    <p className="text-xs text-amber-700 dark:text-amber-300">
                                                                        <strong>示例：</strong>超过 {formData.rules.unlimitedPenaltyThresholdTime || '09:01'} 打卡，无论迟到多久，一次性扣款 <strong>{formData.rules.unlimitedPenaltyFixedAmount || 50}元</strong>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 封顶模式配置 */}
                                            {formData.rules.performancePenaltyMode === 'capped' && (
                                                <>
                                            {/* 封顶金额 - 最显眼位置 */}
                                            <div className={`bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50 ${!formData.rules.performancePenaltyEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                <div className="space-y-2">
                                                    <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200">绩效扣款封顶金额 (元)</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={formData.rules.maxPerformancePenalty}
                                                            onChange={e => updateRule('maxPerformancePenalty', parseInt(e.target.value) || 0)}
                                                            className="w-full max-w-[200px] px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                                            min="0"
                                                        />
                                                        <span className="text-sm text-emerald-600 dark:text-emerald-400">RMB</span>
                                                    </div>
                                                    <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                                                        当员工因迟到产生的绩效扣款超过此金额时，将按此封顶金额计算。
                                                    </p>
                                                </div>
                                            </div>

                                            {/* 封顶子模式选择 */}
                                            <div className={`bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50 ${!formData.rules.performancePenaltyEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200 mb-3">封顶计算方式</label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {/* 阶梯扣款 */}
                                                    <button
                                                        type="button"
                                                        onClick={() => updateRule('cappedPenaltyType', 'ladder')}
                                                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                                                            (formData.rules.cappedPenaltyType || 'ladder') === 'ladder'
                                                                ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40'
                                                                : 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full border-2 ${
                                                                (formData.rules.cappedPenaltyType || 'ladder') === 'ladder'
                                                                    ? 'border-emerald-500 bg-emerald-500'
                                                                    : 'border-emerald-300'
                                                            }`}>
                                                                {(formData.rules.cappedPenaltyType || 'ladder') === 'ladder' && (
                                                                    <div className="w-full h-full rounded-full bg-white scale-50" />
                                                                )}
                                                            </div>
                                                            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">阶梯扣款</span>
                                                        </div>
                                                        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1 ml-5">
                                                            按迟到时长分段扣款
                                                        </p>
                                                    </button>
                                                    
                                                    {/* 固定封顶 */}
                                                    <button
                                                        type="button"
                                                        onClick={() => updateRule('cappedPenaltyType', 'fixedCap')}
                                                        className={`p-3 rounded-lg border-2 text-left transition-all ${
                                                            formData.rules.cappedPenaltyType === 'fixedCap'
                                                                ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40'
                                                                : 'border-emerald-200 dark:border-emerald-800 hover:border-emerald-300'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-3 h-3 rounded-full border-2 ${
                                                                formData.rules.cappedPenaltyType === 'fixedCap'
                                                                    ? 'border-emerald-500 bg-emerald-500'
                                                                    : 'border-emerald-300'
                                                            }`}>
                                                                {formData.rules.cappedPenaltyType === 'fixedCap' && (
                                                                    <div className="w-full h-full rounded-full bg-white scale-50" />
                                                                )}
                                                            </div>
                                                            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">固定封顶</span>
                                                        </div>
                                                        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1 ml-5">
                                                            按分钟计算，设上限
                                                        </p>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 固定封顶模式配置 */}
                                            {formData.rules.cappedPenaltyType === 'fixedCap' && (
                                                <div className={`bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50 ${!formData.rules.performancePenaltyEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    <div className="space-y-2">
                                                        <label className="block text-sm font-medium text-emerald-800 dark:text-emerald-200">每分钟扣款金额 (元)</label>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                value={formData.rules.cappedPenaltyPerMinute || 5}
                                                                onChange={e => updateRule('cappedPenaltyPerMinute', parseInt(e.target.value) || 0)}
                                                                className="w-full max-w-[200px] px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                                                min="0"
                                                                step="1"
                                                            />
                                                            <span className="text-sm text-emerald-600 dark:text-emerald-400">元/分钟</span>
                                                        </div>
                                                        <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                                                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                                                <strong>示例：</strong>迟到30分钟 = 30 × {formData.rules.cappedPenaltyPerMinute || 5} = {30 * (formData.rules.cappedPenaltyPerMinute || 5)}元
                                                                {30 * (formData.rules.cappedPenaltyPerMinute || 5) > formData.rules.maxPerformancePenalty && formData.rules.maxPerformancePenalty > 0 && (
                                                                    <span className="text-red-600"> → 封顶 <strong>{formData.rules.maxPerformancePenalty}元</strong></span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* 阶梯扣款规则编辑区域 - 手风琴模式 */}
                                            {(formData.rules.cappedPenaltyType || 'ladder') === 'ladder' && (
                                            <div className={`bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg border border-emerald-100 dark:border-emerald-800/50 ${!formData.rules.performancePenaltyEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                                <div className="flex justify-between items-center mb-4">
                                                    <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">迟到扣款阶梯规则</h4>
                                                    <p className="text-xs text-emerald-600 dark:text-emerald-400">配置不同迟到时长的扣款金额</p>
                                                </div>

                                                {/* 规则列表容器 - 设置最大高度和滚动 */}
                                                <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                                                    {formData.rules.performancePenaltyRules.map((rule, index) => (
                                                        <div key={index} className="bg-white dark:bg-slate-800 rounded-lg border border-emerald-200 dark:border-emerald-800 overflow-hidden">
                                                            {/* 手风琴头部 */}
                                                            <div className="p-4">
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex items-center gap-3 flex-1">
                                                                        <h5 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">扣款规则 {index + 1}</h5>

                                                                        {/* 规则描述 - 移到同一行 */}
                                                                        <div className="text-xs flex-1">
                                                                            <span className="text-emerald-600 dark:text-emerald-400">
                                                                                <span className="font-medium">范围:</span>
                                                                                [{rule.minMinutes}, {rule.maxMinutes === 999 ? '∞' : rule.maxMinutes}) 分钟 → 扣款 {rule.penalty} 元
                                                                            </span>
                                                                        </div>

                                                                        {/* 手风琴展开按钮 */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => togglePerformanceRuleExpansion(index)}
                                                                            className="p-1 text-emerald-600 hover:text-emerald-800 transition-colors"
                                                                        >
                                                                            <ChevronDownIcon
                                                                                className={`w-4 h-4 transition-transform ${expandedPerformanceRules.has(index) ? 'rotate-180' : ''
                                                                                    }`}
                                                                            />
                                                                        </button>
                                                                    </div>
                                                                    <button onClick={() => removePerformancePenaltyRule(index)} className="text-emerald-400 hover:text-red-500 transition-colors ml-2">
                                                                        <TrashIcon className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* 手风琴内容 - 可展开的配置区域 */}
                                                            {expandedPerformanceRules.has(index) && (
                                                                <div className="px-4 pb-4 border-t border-emerald-100 dark:border-emerald-800">
                                                                    <div className="pt-4">
                                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                                            <div className="space-y-2">
                                                                                <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">最小分钟数 (包含)</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={rule.minMinutes}
                                                                                    onChange={e => updatePerformancePenaltyRule(index, 'minMinutes', parseInt(e.target.value) || 0)}
                                                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm"
                                                                                    min="0"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">最大分钟数 (不包含)</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={rule.maxMinutes}
                                                                                    onChange={e => updatePerformancePenaltyRule(index, 'maxMinutes', parseInt(e.target.value) || 0)}
                                                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm"
                                                                                    min="1"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">扣款金额 (元)</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={rule.penalty}
                                                                                    onChange={e => updatePerformancePenaltyRule(index, 'penalty', parseInt(e.target.value) || 0)}
                                                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm"
                                                                                    min="0"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <label className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">规则描述</label>
                                                                                <input
                                                                                    type="text"
                                                                                    value={rule.description}
                                                                                    readOnly
                                                                                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-gray-600 dark:text-gray-400"
                                                                                    placeholder="自动生成"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* 添加规则按钮 */}
                                                {formData.rules.performancePenaltyRules.length > 0 && (
                                                    <div className="mt-4">
                                                        <button onClick={addPerformancePenaltyRule} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-white hover:bg-emerald-50 rounded-lg border border-dashed border-emerald-300 transition-colors">
                                                            <PlusCircleIcon className="w-4 h-4" /> 添加扣款规则
                                                        </button>
                                                    </div>
                                                )}

                                                {/* 规则验证提示 */}
                                                {(() => {
                                                    const errors = validatePerformancePenaltyRules(formData.rules.performancePenaltyRules);
                                                    if (errors.length > 0) {
                                                        return (
                                                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mt-4">
                                                                <div className="flex items-start gap-2">
                                                                    <AlertTriangleIcon className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                                                    <div>
                                                                        <h6 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">规则配置错误</h6>
                                                                        <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
                                                                            {errors.map((error, index) => (
                                                                                <li key={index}>• {error}</li>
                                                                            ))}
                                                                        </ul>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                            )}
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                            </>
                        )}

                        {/* ========== 行政管理分类 - 加班和跨天打卡 ========== */}
                        {selectedCategory === 'admin' && (
                            <>
                        {/* Section 6: Overtime Rules */}
                        <div className="border border-blue-200 dark:border-blue-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('overtime')}
                                className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <ClockIcon className="w-5 h-5 text-blue-500" /> 加班统计规则
                                    <span className="text-xs font-normal text-blue-500 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">{formData.rules.overtimeCheckpoints.length} 个节点</span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-blue-500 transition-transform ${expandedSections.has('overtime') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('overtime') && (
                            <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 space-y-4">
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/50">
                                        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-3">加班统计节点</h4>
                                        <div className="flex flex-wrap gap-3 mb-4">
                                            {formData.rules.overtimeCheckpoints.map((time, index) => (
                                                <div key={index} className="flex items-center bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg p-2 pr-3">
                                                    {time === "24:00" ? (
                                                        <div className="text-sm font-mono text-blue-800 dark:text-blue-200 text-center min-w-[100px] px-2 py-1">
                                                            24:00
                                                        </div>
                                                    ) : (
                                                        <input
                                                            type="time"
                                                            value={time}
                                                            onChange={e => updateOvertimeCheckpoint(index, e.target.value)}
                                                            className="bg-transparent text-sm font-mono text-blue-800 dark:text-blue-200 border-none focus:ring-0 text-center min-w-[100px]"
                                                            style={{
                                                                width: '100px',
                                                                WebkitAppearance: 'none',
                                                                MozAppearance: 'textfield'
                                                            }}
                                                        />
                                                    )}
                                                    <button onClick={() => removeOvertimeCheckpoint(index)} className="text-blue-400 hover:text-red-500 transition-colors ml-2">
                                                        <span className="sr-only">Remove</span>
                                                        &times;
                                                    </button>
                                                </div>
                                            ))}
                                            <button onClick={addOvertimeCheckpoint} className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 bg-white hover:bg-blue-50 rounded-lg border border-dashed border-blue-300 transition-colors">
                                                + 添加节点
                                            </button>
                                            <button
                                                onClick={() => updateRule('overtimeCheckpoints', [...formData.rules.overtimeCheckpoints, "24:00"])}
                                                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 bg-white hover:bg-blue-50 rounded-lg border border-dashed border-blue-300 transition-colors"
                                            >
                                                + 添加24:00
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800/50">
                                        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-3">周末加班规则</h4>
                                        <div className="space-y-2">
                                            <label className="block text-xs font-medium text-blue-700 dark:text-blue-300">周末加班影响周一的时长阈值 (小时)</label>
                                            <input
                                                type="number"
                                                value={formData.rules.weekendOvertimeThreshold}
                                                onChange={e => updateRule('weekendOvertimeThreshold', parseInt(e.target.value))}
                                                className="w-full max-w-[200px] px-3 py-2 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg text-sm"
                                            />
                                            <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
                                                周末加班时长 ≥ 此值时，周末打卡时间影响周一；&lt; 此值时，周五晚上打卡时间影响周一。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section 7: Cross-day Checkout Rules - Simplified */}
                        <div className="border border-teal-200 dark:border-teal-800/50 rounded-lg overflow-hidden">
                            <button
                                onClick={() => toggleSection('crossDay')}
                                className="w-full p-4 bg-teal-50 dark:bg-teal-900/20 flex items-center justify-between hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                            >
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <ClockIcon className="w-5 h-5 text-teal-500" /> 跨天打卡规则
                                    <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${formData.rules.crossDayCheckout.enabled ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-slate-500 bg-slate-100 dark:bg-slate-700'}`}>
                                        {formData.rules.crossDayCheckout.enabled ? '已启用' : '已关闭'}
                                    </span>
                                </h3>
                                <ChevronDownIcon className={`w-5 h-5 text-teal-500 transition-transform ${expandedSections.has('crossDay') ? 'rotate-180' : ''}`} />
                            </button>
                            {expandedSections.has('crossDay') && (
                            <div className="p-4 bg-teal-50/50 dark:bg-teal-900/10 space-y-4">
                                {/* 功能开关 */}
                                <div className="p-4 bg-teal-100/50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800/50">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <label className="block text-sm font-medium text-teal-800 dark:text-teal-200">启用跨天打卡规则</label>
                                            <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                                                启用后，系统将根据"迟到规则配置"自动应用跨天/跨周/跨月打卡规则
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateRule('crossDayCheckout', { 
                                                ...formData.rules.crossDayCheckout, 
                                                enabled: !formData.rules.crossDayCheckout.enabled 
                                            })}
                                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                                                formData.rules.crossDayCheckout.enabled ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'
                                            }`}
                                        >
                                            <span
                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                    formData.rules.crossDayCheckout.enabled ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                </div>

                                <div className={`space-y-4 ${!formData.rules.crossDayCheckout.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {/* 向前查询配置 */}
                                    <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-lg border border-teal-100 dark:border-teal-800/50">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex-1">
                                                    <label className="block text-sm font-medium text-teal-800 dark:text-teal-200">启用向前查询</label>
                                                    <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                                                        如果昨天没有下班打卡，就查询前一天的下班打卡时间，依此类推
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => updateRule('crossDayCheckout', { 
                                                        ...formData.rules.crossDayCheckout, 
                                                        enableLookback: !formData.rules.crossDayCheckout.enableLookback 
                                                    })}
                                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                                                        formData.rules.crossDayCheckout.enableLookback ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-600'
                                                    }`}
                                                >
                                                    <span
                                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                            formData.rules.crossDayCheckout.enableLookback ? 'translate-x-5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                            
                                            {formData.rules.crossDayCheckout.enableLookback && (
                                                <div className="space-y-2 pt-2 border-t border-teal-200 dark:border-teal-700">
                                                    <label className="block text-sm font-medium text-teal-800 dark:text-teal-200">最多向前查询天数</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={formData.rules.crossDayCheckout.lookbackDays || 10}
                                                            onChange={e => updateRule('crossDayCheckout', { 
                                                                ...formData.rules.crossDayCheckout, 
                                                                lookbackDays: parseInt(e.target.value) || 10 
                                                            })}
                                                            className="w-20 px-3 py-2 bg-white dark:bg-slate-800 border border-teal-200 dark:border-teal-800 rounded-lg text-sm text-center"
                                                            min="1"
                                                            max="30"
                                                        />
                                                        <span className="text-sm text-teal-700 dark:text-teal-300">天</span>
                                                    </div>
                                                    <p className="text-xs text-teal-600/70 dark:text-teal-400/70">
                                                        系统将最多向前查询指定天数内的下班打卡记录
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 说明文字 */}
                                    <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-lg border border-teal-100 dark:border-teal-800/50">
                                        <h4 className="text-sm font-semibold text-teal-800 dark:text-teal-200 mb-2">规则说明</h4>
                                        <ul className="text-xs text-teal-600 dark:text-teal-400 space-y-1 list-disc list-inside">
                                            <li>跨天打卡规则的时间阈值从"迟到规则配置"中读取</li>
                                            <li>系统会自动识别跨天、跨周（周一）、跨月（本月第一个工作日）场景</li>
                                            <li>根据前一时段的下班打卡时间，匹配对应的迟到规则</li>
                                            <li>例如：前一天20:30打卡，次日9:30前打卡不算迟到</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            )}
                        </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center rounded-b-xl">
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                        <AlertTriangleIcon className="w-3.5 h-3.5" />
                        <span>⚠️ 修改规则将立即影响全局考勤计算逻辑，包括统计、绩效、全勤判定等。</span>
                    </div>
                    <div className="flex gap-4 items-center">
                        {hasChanges && (
                            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                                <span>有未保存的修改</span>
                            </div>
                        )}
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!hasChanges}
                        >
                            重置默认
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges}
                            className={`flex items-center gap-2 px-6 py-2 font-semibold rounded-lg transition-all shadow-sm border-2 ${hasChanges
                                    ? 'bg-orange-600 hover:bg-orange-500 text-white border-orange-700 hover:border-orange-600 cursor-pointer'
                                    : 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 border-slate-400 dark:border-slate-500 cursor-not-allowed'
                                }`}
                            title={hasChanges ? "保存后将立即影响全局考勤规则逻辑" : "没有修改需要保存"}
                        >
                            <SaveIcon className="w-4 h-4" />
                            <span>保存配置</span>
                            {hasChanges && <AlertTriangleIcon className="w-3.5 h-3.5 ml-1 opacity-80" />}
                        </button>
                    </div>
                </div>
            </div>
            {statusMessage && (
                <div className={`fixed bottom-8 right-8 px-6 py-3 rounded-lg shadow-lg text-sm font-semibold animate-in slide-in-from-bottom-4 duration-300 ${statusMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                    {statusMessage.text}
                </div>
            )}
        </div>
    );
};