import db from '../db/index';
import type { CompanyId, AttendanceRuleConfig, AttendanceRuleHistory, FullAttendanceRuleConfig, AttRuleDetail, AttRuleSpecialDate } from '../types/index';
import { auditLogService } from './auditLogService';

/**
 * 考勤规则服务
 * 使用简化的数据库结构，规则存储为 JSONB
 */
export class RuleService {
  /**
   * 获取公司的完整配置
   * 返回格式兼容前端和旧API
   */
  async getFullConfig(companyId: CompanyId): Promise<FullAttendanceRuleConfig | null> {
    const config = await db('attendance_rule_configs')
      .where({ company_id: companyId, is_active: true })
      .first();

    if (!config) return null;

    // 解析 JSONB 字段
    const rules = typeof config.rules === 'string' 
      ? JSON.parse(config.rules) 
      : config.rules;

    // 构建兼容旧API的响应格式
    const result: FullAttendanceRuleConfig = {
      id: config.id,
      company_id: config.company_id,
      config_name: config.config_name,
      version: config.version,
      is_active: config.is_active,
      created_at: config.created_at,
      updated_at: config.updated_at,
      created_by: config.created_by,
      updated_by: config.updated_by,
      rules: rules,
      
      // 兼容旧API：从 rules 中提取字段
      work_start_time: rules.workStartTime,
      work_end_time: rules.workEndTime,
      lunch_start_time: rules.lunchStartTime,
      lunch_end_time: rules.lunchEndTime,
      late_exemption_enabled: rules.lateExemptionEnabled,
      late_exemption_count: rules.lateExemptionCount,
      late_exemption_minutes: rules.lateExemptionMinutes,
      perf_penalty_enabled: rules.performancePenaltyEnabled,
      perf_penalty_mode: rules.performancePenaltyMode,
      unlimited_threshold_time: rules.unlimitedPenaltyThresholdTime,
      unlimited_calc_type: rules.unlimitedPenaltyCalcType,
      unlimited_per_minute: rules.unlimitedPenaltyPerMinute,
      unlimited_fixed_amount: rules.unlimitedPenaltyFixedAmount,
      capped_penalty_type: rules.cappedPenaltyType,
      capped_per_minute: rules.cappedPenaltyPerMinute,
      max_perf_penalty: rules.maxPerformancePenalty,
      full_attend_enabled: rules.fullAttendanceEnabled,
      full_attend_bonus: rules.fullAttendanceBonus,
      full_attend_allow_adj: rules.fullAttendanceAllowAdjustment,
      attend_days_enabled: rules.attendanceDaysRules?.enabled,
      should_attend_calc: rules.attendanceDaysRules?.shouldAttendanceCalcMethod,
      fixed_should_attendance_days: rules.attendanceDaysRules?.fixedShouldAttendanceDays,
      exclude_holidays: !rules.attendanceDaysRules?.includeHolidaysInShould,
      count_late_as_attend: rules.attendanceDaysRules?.actualAttendanceRules?.countLateAsAttendance,
      count_missing_as_attend: rules.attendanceDaysRules?.actualAttendanceRules?.countMissingAsAttendance,
      count_half_leave_as_half: rules.attendanceDaysRules?.actualAttendanceRules?.countHalfDayLeaveAsHalf,
      min_hours_for_full_day: rules.attendanceDaysRules?.actualAttendanceRules?.minWorkHoursForFullDay,
      workday_swap_enabled: rules.workdaySwapRules?.enabled,
      auto_follow_national: rules.workdaySwapRules?.autoFollowNationalHoliday,
      remote_work_enabled: rules.remoteWorkRules?.enabled,
      remote_require_approval: rules.remoteWorkRules?.requireApproval,
      remote_count_as_attend: rules.remoteWorkRules?.countAsNormalAttendance,
      remote_max_days_month: rules.remoteWorkRules?.maxDaysPerMonth,
      remote_allowed_weekdays: rules.remoteWorkRules?.allowedDaysOfWeek,
      overtime_checkpoints: rules.overtimeCheckpoints,
      weekend_overtime_threshold: rules.weekendOvertimeThreshold,
      cross_day_enabled: rules.crossDayCheckout?.enabled,
      cross_day_max_checkout: rules.crossDayCheckout?.maxCheckoutTime,
      cross_day_next_checkin: rules.crossDayCheckout?.nextDayCheckinTime,
      // 🔥 跨周打卡规则
      cross_week_enabled: rules.crossWeekCheckout?.enabled,
      // 🔥 跨月打卡规则
      cross_month_enabled: rules.crossMonthCheckout?.enabled,
      
      // 兼容旧API：转换数组格式
      lateRules: this.convertToDetailArray(rules.lateRules, 'late'),
      penaltyRules: this.convertToDetailArray(rules.performancePenaltyRules, 'penalty'),
      fullAttendRules: this.convertToDetailArray(rules.fullAttendanceRules, 'full_attend'),
      leaveDisplayRules: this.convertToDetailArray(rules.leaveDisplayRules, 'leave_display'),
      crossDayRules: this.convertToDetailArray(rules.crossDayCheckout?.rules, 'cross_day'),
      // 🔥 跨周和跨月规则
      crossWeekRules: this.convertToDetailArray(rules.crossWeekCheckout?.rules, 'cross_week'),
      crossMonthRules: this.convertToDetailArray(rules.crossMonthCheckout?.rules, 'cross_month'),
      swapDates: this.convertToSpecialDateArray(rules.workdaySwapRules?.customDays, 'swap'),
      remoteDates: this.convertToSpecialDateArray(rules.remoteWorkRules?.remoteDays, 'remote'),
    };

    return result;
  }

  /**
   * 转换为旧的 AttRuleDetail 格式（用于兼容）
   */
  private convertToDetailArray(items: any[], ruleType: string): AttRuleDetail[] {
    if (!items || !Array.isArray(items)) return [];
    
    return items.map((item, index) => {
      const detail: AttRuleDetail = {
        rule_type: ruleType as any,
        sort_order: index,
        enabled: item.enabled ?? true,
      };

      // 根据不同类型转换字段
      if (ruleType === 'late') {
        detail.time_start = item.previousDayCheckoutTime;
        detail.time_end = item.lateThresholdTime;
        detail.description = item.description;
      } else if (ruleType === 'penalty') {
        detail.min_value = item.minMinutes;
        detail.max_value = item.maxMinutes;
        detail.amount = item.penalty;
        detail.description = item.description;
      } else if (ruleType === 'full_attend') {
        detail.rule_key = item.type;
        detail.rule_name = item.displayName;
        detail.threshold_hours = item.threshold;
        detail.unit = item.unit;
      } else if (ruleType === 'leave_display') {
        detail.rule_key = item.leaveType;
        detail.threshold_hours = item.shortTermHours;
        detail.label_short = item.shortTermLabel;
        detail.label_long = item.longTermLabel;
      } else if (ruleType === 'cross_day') {
        // 🔥 统一的跨天打卡规则（支持跨天、跨周、跨月）
        detail.time_start = item.checkoutTime;
        // 兼容新旧字段名
        detail.time_end = item.nextCheckinTime || item.nextDayCheckinTime;
        detail.description = item.description;
        detail.apply_to = item.applyTo;
        detail.week_days = item.weekDays;
      } else if (ruleType === 'cross_week') {
        // 🔥 跨周打卡规则（已废弃，保留用于向后兼容）
        detail.time_start = item.checkoutTime;
        detail.time_end = item.nextCheckinTime || item.nextMondayCheckinTime;
        detail.description = item.description;
      } else if (ruleType === 'cross_month') {
        // 🔥 跨月打卡规则（已废弃，保留用于向后兼容）
        detail.time_start = item.checkoutTime;
        detail.time_end = item.nextCheckinTime || item.nextMonthCheckinTime;
        detail.description = item.description;
      }

      return detail;
    });
  }

  /**
   * 转换为旧的 AttRuleSpecialDate 格式（用于兼容）
   */
  private convertToSpecialDateArray(items: any[], dateType: string): AttRuleSpecialDate[] {
    if (!items || !Array.isArray(items)) return [];
    
    return items.map(item => {
      const date: AttRuleSpecialDate = {
        date_type: dateType as any,
        target_date: item.date,
        reason: item.reason,
      };

      if (dateType === 'swap') {
        date.swap_type = item.type;
      } else if (dateType === 'remote') {
        date.time_mode = item.timeMode || 'day';
        date.start_time = item.startTime;
        date.end_time = item.endTime;
        date.scope = item.scope || 'all';
        date.scope_ids = item.departmentIds || item.userIds;
      }

      return date;
    });
  }

  /**
   * 更新完整配置
   * 接受前端格式的 AttendanceRuleConfig
   */
  async updateFullConfig(
    companyId: CompanyId,
    rules: any, // 前端格式的完整规则配置
    updatedBy: string,
    changeReason?: string
  ): Promise<{ id: number; version: number }> {
    return await db.transaction(async (trx) => {
      // 获取当前配置
      const currentConfig = await trx('attendance_rule_configs')
        .where({ company_id: companyId, is_active: true })
        .first();

      if (!currentConfig) {
        throw new Error('配置不存在');
      }

      const configId = currentConfig.id;
      const newVersion = currentConfig.version + 1;

      // 保存变更历史
      const currentRules = typeof currentConfig.rules === 'string'
        ? JSON.parse(currentConfig.rules)
        : currentConfig.rules;

      await trx('attendance_rule_history').insert({
        config_id: configId,
        company_id: companyId,
        change_type: 'update',
        snapshot: JSON.stringify(currentRules),
        change_reason: changeReason || null,
        changed_by: updatedBy,
      });

      // 更新配置
      await trx('attendance_rule_configs')
        .where({ id: configId })
        .update({
          rules: JSON.stringify(rules),
          version: newVersion,
          updated_by: updatedBy,
          updated_at: trx.fn.now(),
          change_reason: changeReason || null,
        });

      // 🔥 记录审计日志
      try {
        // console.log('[RuleService] 📝 记录考勤规则修改的审计日志');
        
        // 深度比较变更字段，支持嵌套对象
        const changedFields: string[] = [];
        const changedFieldsReadable: string[] = [];
        const changedFieldsDetail: Record<string, { old: any; new: any }> = {};
        
        // 字段名称映射（英文 -> 中文）
        const fieldNameMap: Record<string, string> = {
          'workStartTime': '上班时间',
          'workEndTime': '下班时间',
          'lunchStartTime': '午休开始时间',
          'lunchEndTime': '午休结束时间',
          'fullAttendanceBonus': '全勤奖金额',
          'performancePenaltyEnabled': '绩效扣款启用状态',
          'lateExemptionEnabled': '迟到豁免启用状态',
          'lateExemptionCount': '迟到豁免次数',
          'lateExemptionMinutes': '迟到豁免分钟数',
          'attendanceDaysRules': '出勤天数规则',
          'attendanceDaysRules.shouldAttendanceCalcMethod': '应出勤天数计算方式',
          'attendanceDaysRules.fixedShouldAttendanceDays': '固定应出勤天数',
          'attendanceDaysRules.includeHolidaysInShould': '应出勤是否包含节假日',
          'workdaySwapRules': '调班规则',
          'remoteWorkRules': '居家办公规则',
          'lateRules': '迟到规则',
          'performancePenaltyRules': '绩效扣款规则',
          'fullAttendanceRules': '全勤规则',
          'overtimeCheckpoints': '加班时间点',
          'crossDayCheckout': '跨天打卡规则',
        };
        
        // 递归比较对象，只记录变更字段的前后值
        const compareObjects = (oldObj: any, newObj: any, prefix = '') => {
          const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
          
          for (const key of allKeys) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const oldVal = oldObj?.[key];
            const newVal = newObj?.[key];
            
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
              // 如果是对象且不是数组，递归比较
              if (typeof oldVal === 'object' && typeof newVal === 'object' && 
                  !Array.isArray(oldVal) && !Array.isArray(newVal) &&
                  oldVal !== null && newVal !== null) {
                compareObjects(oldVal, newVal, fullKey);
              } else {
                changedFields.push(fullKey);
                const readableName = fieldNameMap[fullKey] || fullKey;
                changedFieldsReadable.push(readableName);
                
                // 🔥 只记录变更字段的前后值
                changedFieldsDetail[readableName] = {
                  old: oldVal,
                  new: newVal
                };
              }
            }
          }
        };
        
        compareObjects(currentRules, rules);
        
        // console.log('[RuleService] 变更的字段:', changedFields);
        // console.log('[RuleService] 变更的字段(中文):', changedFieldsReadable);
        // console.log('[RuleService] 变更详情:', changedFieldsDetail);
        
        // 生成变更摘要
        let changeSummary = '';
        if (changedFieldsReadable.length > 0) {
          changeSummary = `修改了 ${changedFieldsReadable.length} 个字段: ${changedFieldsReadable.slice(0, 3).join('、')}${changedFieldsReadable.length > 3 ? '等' : ''}`;
        } else {
          changeSummary = '无变更';
        }
        
        await auditLogService.log({
          company_id: companyId,
          user_id: updatedBy,
          user_name: updatedBy,
          module: 'attendance_rules',
          action: 'UPDATE',
          resource_type: 'rule_config',
          resource_id: String(configId),
          resource_name: `${companyId} 考勤规则`,
          description: `修改 ${companyId} 的考勤规则${changeReason ? `：${changeReason}` : ''}`,
          old_value: changedFieldsDetail, // 🔥 只记录变更字段的详情 {字段名: {old, new}}
          new_value: null, // 🔥 不需要单独的new_value，都在old_value里了
          changed_fields: changedFieldsReadable.length > 0 ? changedFieldsReadable : undefined,
          change_summary: changeSummary,
          status: 'success',
        });
        
        // console.log('[RuleService] ✅ 审计日志记录成功');
      } catch (auditError) {
        console.error('[RuleService] ⚠️  审计日志记录失败（不影响主流程）:', auditError);
      }

      return { id: configId, version: newVersion };
    });
  }

  /**
   * 获取变更历史
   */
  async getChangeHistory(companyId: CompanyId, page = 1, size = 20): Promise<{ total: number; list: any[] }> {
    const config = await db('attendance_rule_configs')
      .where({ company_id: companyId, is_active: true })
      .first();

    if (!config) {
      return { total: 0, list: [] };
    }

    const total = await db('attendance_rule_history')
      .where({ config_id: config.id })
      .count('id as count')
      .first();

    const list = await db('attendance_rule_history')
      .where({ config_id: config.id })
      .orderBy('changed_at', 'desc')
      .offset((page - 1) * size)
      .limit(size);

    return {
      total: Number(total?.count || 0),
      list,
    };
  }

  /**
   * 回滚到指定版本
   */
  async rollback(companyId: CompanyId, historyId: number, reason: string, rolledBy: string): Promise<{ version: number }> {
    return await db.transaction(async (trx) => {
      const config = await trx('attendance_rule_configs')
        .where({ company_id: companyId, is_active: true })
        .first();

      if (!config) {
        throw new Error('配置不存在');
      }

      const history = await trx('attendance_rule_history')
        .where({ id: historyId, config_id: config.id })
        .first();

      if (!history || !history.snapshot) {
        throw new Error('历史记录不存在或无快照');
      }

      const snapshot = typeof history.snapshot === 'string'
        ? JSON.parse(history.snapshot)
        : history.snapshot;

      // 记录回滚操作
      const currentRules = typeof config.rules === 'string'
        ? JSON.parse(config.rules)
        : config.rules;

      await trx('attendance_rule_history').insert({
        config_id: config.id,
        company_id: companyId,
        change_type: 'rollback',
        snapshot: JSON.stringify(currentRules),
        change_reason: reason,
        changed_by: rolledBy,
      });

      // 恢复配置
      const newVersion = config.version + 1;
      await trx('attendance_rule_configs')
        .where({ id: config.id })
        .update({
          rules: JSON.stringify(snapshot),
          version: newVersion,
          updated_by: rolledBy,
          updated_at: trx.fn.now(),
          change_reason: `回滚到版本 ${history.id}`,
        });

      // 🔥 记录审计日志
      try {
        // console.log('[RuleService] 📝 记录考勤规则回滚的审计日志');
        
        await auditLogService.log({
          company_id: companyId,
          user_id: rolledBy,
          user_name: rolledBy,
          module: 'attendance_rules',
          action: 'ROLLBACK',
          resource_type: 'rule_config',
          resource_id: String(config.id),
          resource_name: `${companyId} 考勤规则`,
          description: `回滚 ${companyId} 的考勤规则到历史版本 ${historyId}${reason ? `：${reason}` : ''}`,
          old_value: currentRules,
          new_value: snapshot,
          status: 'success',
        });
        
        // console.log('[RuleService] ✅ 审计日志记录成功');
      } catch (auditError) {
        console.error('[RuleService] ⚠️  审计日志记录失败（不影响主流程）:', auditError);
      }

      return { version: newVersion };
    });
  }
}

export const ruleService = new RuleService();
