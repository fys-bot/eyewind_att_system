import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // 清空现有数据
  await knex('att_rule_change_log').del();
  await knex('att_rule_special_date').del();
  await knex('att_rule_detail').del();
  await knex('att_rule_config').del();

  // 插入风眼科技默认配置
  const [eyewindConfig] = await knex('att_rule_config').insert({
    company_id: 'eyewind',
    config_name: '风眼科技默认配置',
    work_start_time: '09:00:00',
    work_end_time: '18:30:00',
    lunch_start_time: '12:00:00',
    lunch_end_time: '13:30:00',
    late_exemption_enabled: true,
    late_exemption_count: 3,
    late_exemption_minutes: 15,
    perf_penalty_enabled: true,
    perf_penalty_mode: 'capped',
    capped_penalty_type: 'ladder',
    max_perf_penalty: 250.00,
    full_attend_enabled: true,
    full_attend_bonus: 200.00,
    created_by: 'system',
  }).returning('id');

  // 插入海多多默认配置
  const [hydodoConfig] = await knex('att_rule_config').insert({
    company_id: 'hydodo',
    config_name: '海多多默认配置',
    work_start_time: '09:10:00',
    work_end_time: '19:00:00',
    lunch_start_time: '12:00:00',
    lunch_end_time: '13:30:00',
    late_exemption_enabled: true,
    late_exemption_count: 0,
    late_exemption_minutes: 0,
    perf_penalty_enabled: true,
    perf_penalty_mode: 'capped',
    max_perf_penalty: 0,
    full_attend_enabled: true,
    full_attend_bonus: 0,
    created_by: 'system',
  }).returning('id');

  // 风眼科技迟到规则
  await knex('att_rule_detail').insert([
    { config_id: eyewindConfig.id, rule_type: 'late', time_start: '18:30:00', time_end: '09:01:00', description: '前一天18:30打卡，9:01算迟到', sort_order: 1 },
    { config_id: eyewindConfig.id, rule_type: 'late', time_start: '20:30:00', time_end: '09:31:00', description: '前一天20:30打卡，9:31算迟到', sort_order: 2 },
    { config_id: eyewindConfig.id, rule_type: 'late', time_start: '24:00:00', time_end: '13:31:00', description: '前一天24:00打卡，13:31算迟到', sort_order: 3 },
  ]);

  // 风眼科技绩效扣款阶梯规则
  await knex('att_rule_detail').insert([
    { config_id: eyewindConfig.id, rule_type: 'penalty', min_value: 0, max_value: 5, amount: 50.00, description: '迟到0-5分钟扣50元', sort_order: 1 },
    { config_id: eyewindConfig.id, rule_type: 'penalty', min_value: 5, max_value: 15, amount: 100.00, description: '迟到5-15分钟扣100元', sort_order: 2 },
    { config_id: eyewindConfig.id, rule_type: 'penalty', min_value: 15, max_value: 30, amount: 150.00, description: '迟到15-30分钟扣150元', sort_order: 3 },
    { config_id: eyewindConfig.id, rule_type: 'penalty', min_value: 30, max_value: 45, amount: 200.00, description: '迟到30-45分钟扣200元', sort_order: 4 },
    { config_id: eyewindConfig.id, rule_type: 'penalty', min_value: 45, max_value: 999, amount: 250.00, description: '迟到45分钟以上扣250元(封顶)', sort_order: 5 },
  ]);

  // 风眼科技全勤判定规则
  await knex('att_rule_detail').insert([
    { config_id: eyewindConfig.id, rule_type: 'full_attend', rule_key: 'late', rule_name: '迟到', enabled: true, min_value: 0, unit: 'count', sort_order: 1 },
    { config_id: eyewindConfig.id, rule_type: 'full_attend', rule_key: 'missing', rule_name: '缺卡', enabled: true, min_value: 0, unit: 'count', sort_order: 2 },
    { config_id: eyewindConfig.id, rule_type: 'full_attend', rule_key: 'absenteeism', rule_name: '旷工', enabled: true, min_value: 0, unit: 'count', sort_order: 3 },
    { config_id: eyewindConfig.id, rule_type: 'full_attend', rule_key: 'sick', rule_name: '病假', enabled: true, min_value: 0, unit: 'hours', sort_order: 4 },
    { config_id: eyewindConfig.id, rule_type: 'full_attend', rule_key: 'personal', rule_name: '事假', enabled: true, min_value: 0, unit: 'hours', sort_order: 5 },
    { config_id: eyewindConfig.id, rule_type: 'full_attend', rule_key: 'annual', rule_name: '年假', enabled: true, min_value: 0, unit: 'hours', sort_order: 6 },
  ]);

  // 风眼科技请假展示规则
  await knex('att_rule_detail').insert([
    { config_id: eyewindConfig.id, rule_type: 'leave_display', rule_key: '病假', threshold_hours: 24, label_short: '病假<=24小时', label_long: '病假>24小时', sort_order: 1 },
  ]);

  // 风眼科技跨天打卡规则
  await knex('att_rule_detail').insert([
    { config_id: eyewindConfig.id, rule_type: 'cross_day', time_start: '20:30:00', time_end: '09:30:00', description: '晚上8点半打卡，第二天可以早上9点半打卡', sort_order: 1 },
  ]);

  console.log('✅ 默认配置数据已插入');
}
