import db from '../db/index';
import type { CompanyId, AttRuleConfig, AttRuleDetail, AttRuleSpecialDate, FullAttendanceRuleConfig } from '../types/index';

export class RuleService {
  // 获取公司完整配置
  async getFullConfig(companyId: CompanyId): Promise<FullAttendanceRuleConfig | null> {
    const config = await db('att_rule_config')
      .where({ company_id: companyId, is_active: true })
      .first();

    if (!config) return null;

    // 获取所有规则明细
    const details = await db('att_rule_detail')
      .where({ config_id: config.id })
      .orderBy('sort_order');

    // 获取所有特殊日期
    const specialDates = await db('att_rule_special_date')
      .where({ config_id: config.id })
      .orderBy('target_date');

    // 按类型分组
    const lateRules = details.filter((d: AttRuleDetail) => d.rule_type === 'late');
    const penaltyRules = details.filter((d: AttRuleDetail) => d.rule_type === 'penalty');
    const fullAttendRules = details.filter((d: AttRuleDetail) => d.rule_type === 'full_attend');
    const leaveDisplayRules = details.filter((d: AttRuleDetail) => d.rule_type === 'leave_display');
    const crossDayRules = details.filter((d: AttRuleDetail) => d.rule_type === 'cross_day');
    const swapDates = specialDates.filter((d: AttRuleSpecialDate) => d.date_type === 'swap');
    const remoteDates = specialDates.filter((d: AttRuleSpecialDate) => d.date_type === 'remote');

    return {
      ...config,
      lateRules,
      penaltyRules,
      fullAttendRules,
      leaveDisplayRules,
      crossDayRules,
      swapDates,
      remoteDates,
    };
  }

  // 更新完整配置
  async updateFullConfig(
    companyId: CompanyId,
    data: Partial<AttRuleConfig> & {
      lateRules?: Partial<AttRuleDetail>[];
      penaltyRules?: Partial<AttRuleDetail>[];
      fullAttendRules?: Partial<AttRuleDetail>[];
      leaveDisplayRules?: Partial<AttRuleDetail>[];
      crossDayRules?: Partial<AttRuleDetail>[];
      swapDates?: Partial<AttRuleSpecialDate>[];
      remoteDates?: Partial<AttRuleSpecialDate>[];
      changeReason?: string;
    },
    updatedBy: string
  ): Promise<{ id: number; version: number }> {
    return await db.transaction(async (trx) => {
      // 获取当前配置
      const currentConfig = await trx('att_rule_config')
        .where({ company_id: companyId, is_active: true })
        .first();

      if (!currentConfig) {
        throw new Error('配置不存在');
      }

      const configId = currentConfig.id;
      const newVersion = currentConfig.version + 1;

      // 保存变更前快照
      const snapshot = await this.getFullConfig(companyId);
      await trx('att_rule_change_log').insert({
        config_id: configId,
        change_type: 'update',
        snapshot: JSON.stringify(snapshot),
        change_reason: data.changeReason || null,
        changed_by: updatedBy,
      });

      // 更新主配置
      const { lateRules, penaltyRules, fullAttendRules, leaveDisplayRules, crossDayRules, swapDates, remoteDates, changeReason, ...configData } = data;
      
      // 处理 JSONB 字段 - 需要序列化为 JSON 字符串
      const processedConfigData: Record<string, any> = { ...configData };
      if (processedConfigData.remote_allowed_weekdays !== undefined) {
        processedConfigData.remote_allowed_weekdays = JSON.stringify(processedConfigData.remote_allowed_weekdays);
      }
      if (processedConfigData.overtime_checkpoints !== undefined) {
        processedConfigData.overtime_checkpoints = JSON.stringify(processedConfigData.overtime_checkpoints);
      }
      
      await trx('att_rule_config')
        .where({ id: configId })
        .update({
          ...processedConfigData,
          version: newVersion,
          updated_by: updatedBy,
          updated_at: trx.fn.now(),
        });

      // 更新规则明细
      if (lateRules) await this.updateRuleDetails(trx, configId, 'late', lateRules);
      if (penaltyRules) await this.updateRuleDetails(trx, configId, 'penalty', penaltyRules);
      if (fullAttendRules) await this.updateRuleDetails(trx, configId, 'full_attend', fullAttendRules);
      if (leaveDisplayRules) await this.updateRuleDetails(trx, configId, 'leave_display', leaveDisplayRules);
      if (crossDayRules) await this.updateRuleDetails(trx, configId, 'cross_day', crossDayRules);

      // 更新特殊日期
      if (swapDates) await this.updateSpecialDates(trx, configId, 'swap', swapDates);
      if (remoteDates) await this.updateSpecialDates(trx, configId, 'remote', remoteDates);

      return { id: configId, version: newVersion };
    });
  }

  // 更新规则明细（删除旧的，插入新的）
  private async updateRuleDetails(
    trx: any,
    configId: number,
    ruleType: string,
    rules: Partial<AttRuleDetail>[]
  ): Promise<void> {
    await trx('att_rule_detail')
      .where({ config_id: configId, rule_type: ruleType })
      .delete();

    if (rules.length > 0) {
      const insertData = rules.map((rule, index) => ({
        config_id: configId,
        rule_type: ruleType,
        rule_key: rule.rule_key || null,
        rule_name: rule.rule_name || null,
        enabled: rule.enabled ?? true,
        sort_order: rule.sort_order ?? index,
        description: rule.description || null,
        time_start: rule.time_start || null,
        time_end: rule.time_end || null,
        min_value: rule.min_value ?? null,
        max_value: rule.max_value ?? null,
        amount: rule.amount ?? null,
        threshold_hours: rule.threshold_hours ?? null,
        unit: rule.unit || null,
        label_short: rule.label_short || null,
        label_long: rule.label_long || null,
      }));
      await trx('att_rule_detail').insert(insertData);
    }
  }

  // 更新特殊日期
  private async updateSpecialDates(
    trx: any,
    configId: number,
    dateType: string,
    dates: Partial<AttRuleSpecialDate>[]
  ): Promise<void> {
    await trx('att_rule_special_date')
      .where({ config_id: configId, date_type: dateType })
      .delete();

    if (dates.length > 0) {
      const insertData = dates.map((date) => ({
        config_id: configId,
        date_type: dateType,
        target_date: date.target_date,
        reason: date.reason || null,
        swap_type: date.swap_type || null,
        time_mode: date.time_mode || 'day',
        start_time: date.start_time || null,
        end_time: date.end_time || null,
        duration_hours: date.duration_hours ?? null,
        scope: date.scope || 'all',
        scope_ids: date.scope_ids ? JSON.stringify(date.scope_ids) : null,
        created_by: date.created_by || null,
      }));
      await trx('att_rule_special_date').insert(insertData);
    }
  }

  // 获取变更历史
  async getChangeHistory(companyId: CompanyId, page = 1, size = 20): Promise<{ total: number; list: any[] }> {
    const config = await db('att_rule_config')
      .where({ company_id: companyId, is_active: true })
      .first();

    if (!config) {
      return { total: 0, list: [] };
    }

    const total = await db('att_rule_change_log')
      .where({ config_id: config.id })
      .count('id as count')
      .first();

    const list = await db('att_rule_change_log')
      .where({ config_id: config.id })
      .orderBy('changed_at', 'desc')
      .offset((page - 1) * size)
      .limit(size);

    return {
      total: Number(total?.count || 0),
      list,
    };
  }

  // 回滚到指定版本
  async rollback(companyId: CompanyId, historyId: number, reason: string, rolledBy: string): Promise<{ version: number }> {
    return await db.transaction(async (trx) => {
      const config = await trx('att_rule_config')
        .where({ company_id: companyId, is_active: true })
        .first();

      if (!config) {
        throw new Error('配置不存在');
      }

      const history = await trx('att_rule_change_log')
        .where({ id: historyId, config_id: config.id })
        .first();

      if (!history || !history.snapshot) {
        throw new Error('历史记录不存在或无快照');
      }

      const snapshot = typeof history.snapshot === 'string' 
        ? JSON.parse(history.snapshot) 
        : history.snapshot;

      // 记录回滚操作
      await trx('att_rule_change_log').insert({
        config_id: config.id,
        change_type: 'rollback',
        change_reason: reason,
        changed_by: rolledBy,
      });

      // 恢复配置
      const newVersion = config.version + 1;
      await trx('att_rule_config')
        .where({ id: config.id })
        .update({
          ...snapshot,
          id: config.id,
          version: newVersion,
          updated_by: rolledBy,
          updated_at: trx.fn.now(),
        });

      // 恢复规则明细
      await trx('att_rule_detail').where({ config_id: config.id }).delete();
      const allRules = [
        ...(snapshot.lateRules || []),
        ...(snapshot.penaltyRules || []),
        ...(snapshot.fullAttendRules || []),
        ...(snapshot.leaveDisplayRules || []),
        ...(snapshot.crossDayRules || []),
      ];
      if (allRules.length > 0) {
        await trx('att_rule_detail').insert(
          allRules.map((r: any) => ({ ...r, config_id: config.id }))
        );
      }

      // 恢复特殊日期
      await trx('att_rule_special_date').where({ config_id: config.id }).delete();
      const allDates = [
        ...(snapshot.swapDates || []),
        ...(snapshot.remoteDates || []),
      ];
      if (allDates.length > 0) {
        await trx('att_rule_special_date').insert(
          allDates.map((d: any) => ({ ...d, config_id: config.id }))
        );
      }

      return { version: newVersion };
    });
  }
}

export const ruleService = new RuleService();
