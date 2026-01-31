import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. 主配置表
  await knex.schema.createTable('att_rule_config', (table) => {
    table.bigIncrements('id').primary();
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司主体');
    table.string('config_name', 128).defaultTo('默认配置');
    
    // 基础作息时间
    table.time('work_start_time').notNullable().defaultTo('09:00:00');
    table.time('work_end_time').notNullable().defaultTo('18:30:00');
    table.time('lunch_start_time').defaultTo('12:00:00');
    table.time('lunch_end_time').defaultTo('13:30:00');
    
    // 豁免配置
    table.boolean('late_exemption_enabled').defaultTo(true);
    table.integer('late_exemption_count').defaultTo(3);
    table.integer('late_exemption_minutes').defaultTo(15);
    
    // 绩效扣款配置
    table.boolean('perf_penalty_enabled').defaultTo(true);
    table.enum('perf_penalty_mode', ['unlimited', 'capped']).defaultTo('capped');
    table.time('unlimited_threshold_time').defaultTo('09:01:00');
    table.enum('unlimited_calc_type', ['perMinute', 'fixed']).defaultTo('perMinute');
    table.decimal('unlimited_per_minute', 10, 2).defaultTo(5.00);
    table.decimal('unlimited_fixed_amount', 10, 2).defaultTo(50.00);
    table.enum('capped_penalty_type', ['ladder', 'fixedCap']).defaultTo('ladder');
    table.decimal('capped_per_minute', 10, 2).defaultTo(5.00);
    table.decimal('max_perf_penalty', 10, 2).defaultTo(250.00);
    
    // 全勤配置
    table.boolean('full_attend_enabled').defaultTo(true);
    table.decimal('full_attend_bonus', 10, 2).defaultTo(200.00);
    table.boolean('full_attend_allow_adj').defaultTo(true);
    
    // 出勤天数配置
    table.boolean('attend_days_enabled').defaultTo(true);
    table.enum('should_attend_calc', ['workdays', 'fixed', 'custom']).defaultTo('workdays');
    table.integer('fixed_should_days').nullable();
    table.boolean('exclude_holidays').defaultTo(true);
    table.boolean('exclude_weekends').defaultTo(true);
    table.boolean('count_late_as_attend').defaultTo(true);
    table.boolean('count_missing_as_attend').defaultTo(true);
    table.boolean('count_half_leave_as_half').defaultTo(true);
    table.decimal('min_hours_for_full_day', 4, 2).defaultTo(4.00);
    
    // 法定调班配置
    table.boolean('workday_swap_enabled').defaultTo(false);
    table.boolean('auto_follow_national').defaultTo(true);
    
    // 居家办公配置
    table.boolean('remote_work_enabled').defaultTo(false);
    table.boolean('remote_require_approval').defaultTo(true);
    table.boolean('remote_count_as_attend').defaultTo(true);
    table.integer('remote_max_days_month').nullable();
    table.decimal('remote_max_hours_month', 5, 2).nullable();
    table.jsonb('remote_allowed_weekdays').nullable();
    table.enum('remote_default_time_mode', ['day', 'hour']).defaultTo('day');
    
    // 加班配置
    table.jsonb('overtime_checkpoints').defaultTo('["19:30","20:30","22:00","24:00"]');
    table.integer('weekend_overtime_threshold').defaultTo(8);
    
    // 跨天打卡配置
    table.boolean('cross_day_enabled').defaultTo(true);
    table.time('cross_day_max_checkout').defaultTo('24:00:00');
    table.time('cross_day_next_checkin').defaultTo('13:30:00');
    
    // 元数据
    table.integer('version').defaultTo(1);
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    table.string('created_by', 64).nullable();
    table.string('updated_by', 64).nullable();
    
    // 索引
    table.unique(['company_id', 'is_active']);
    table.index('company_id');
  });

  // 2. 通用规则明细表
  await knex.schema.createTable('att_rule_detail', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('config_id').notNullable().references('id').inTable('att_rule_config').onDelete('CASCADE');
    table.enum('rule_type', ['late', 'penalty', 'full_attend', 'leave_display', 'cross_day']).notNullable();
    
    table.string('rule_key', 64).nullable();
    table.string('rule_name', 128).nullable();
    table.boolean('enabled').defaultTo(true);
    table.integer('sort_order').defaultTo(0);
    table.string('description', 256).nullable();
    
    table.time('time_start').nullable();
    table.time('time_end').nullable();
    
    table.integer('min_value').nullable();
    table.integer('max_value').nullable();
    table.decimal('amount', 10, 2).nullable();
    table.integer('threshold_hours').nullable();
    
    table.enum('unit', ['count', 'hours']).nullable();
    table.string('label_short', 64).nullable();
    table.string('label_long', 64).nullable();
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index('config_id');
    table.index('rule_type');
    table.index(['config_id', 'rule_type']);
  });

  // 3. 特殊日期表
  await knex.schema.createTable('att_rule_special_date', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('config_id').notNullable().references('id').inTable('att_rule_config').onDelete('CASCADE');
    table.enum('date_type', ['swap', 'remote']).notNullable();
    table.date('target_date').notNullable();
    table.string('reason', 256).nullable();
    
    table.enum('swap_type', ['workday', 'holiday']).nullable();
    
    table.enum('time_mode', ['day', 'hour']).defaultTo('day');
    table.time('start_time').nullable();
    table.time('end_time').nullable();
    table.decimal('duration_hours', 4, 2).nullable();
    table.enum('scope', ['all', 'department', 'individual']).defaultTo('all');
    table.jsonb('scope_ids').nullable();
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.string('created_by', 64).nullable();
    
    table.index('config_id');
    table.index('date_type');
    table.index('target_date');
    table.unique(['config_id', 'target_date', 'date_type']);
  });

  // 4. 变更历史表
  await knex.schema.createTable('att_rule_change_log', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('config_id').notNullable().references('id').inTable('att_rule_config').onDelete('CASCADE');
    table.enum('change_type', ['create', 'update', 'delete', 'rollback']).notNullable();
    table.string('change_field', 128).nullable();
    table.text('old_value').nullable();
    table.text('new_value').nullable();
    table.jsonb('snapshot').nullable();
    table.string('change_reason', 512).nullable();
    table.timestamp('changed_at').defaultTo(knex.fn.now());
    table.string('changed_by', 64).notNullable();
    
    table.index('config_id');
    table.index('changed_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('att_rule_change_log');
  await knex.schema.dropTableIfExists('att_rule_special_date');
  await knex.schema.dropTableIfExists('att_rule_detail');
  await knex.schema.dropTableIfExists('att_rule_config');
}
