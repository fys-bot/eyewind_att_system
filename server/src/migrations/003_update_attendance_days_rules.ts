import type { Knex } from 'knex';

/**
 * 更新出勤天数规则字段
 * 
 * 应出勤天数 = 当月工作日 + 法定节假日（不包含周末）
 * 正常出勤天数 = 包含：法定节假日、调休、带薪福利假、外出、出差
 *              不包含：普通周末、请假、病假、事假
 */
export async function up(knex: Knex): Promise<void> {
  // 1. 删除旧字段
  await knex.schema.alterTable('att_rule_config', (table) => {
    table.dropColumn('exclude_holidays');
    table.dropColumn('exclude_weekends');
  });

  // 2. 添加新字段
  await knex.schema.alterTable('att_rule_config', (table) => {
    // 应出勤天数是否包含法定节假日（默认true）
    table.boolean('include_holidays_in_should').defaultTo(true).comment('应出勤天数是否包含法定节假日');
    
    // 正常出勤天数计算规则 - 以下类型算正常出勤
    table.boolean('count_holiday_as_attend').defaultTo(true).comment('法定节假日算出勤');
    table.boolean('count_comp_time_as_attend').defaultTo(true).comment('调休算出勤');
    table.boolean('count_paid_leave_as_attend').defaultTo(true).comment('带薪福利假算出勤');
    table.boolean('count_trip_as_attend').defaultTo(true).comment('出差算出勤');
    table.boolean('count_out_as_attend').defaultTo(true).comment('外出算出勤');
    
    // 正常出勤天数计算规则 - 以下类型不算正常出勤
    table.boolean('count_sick_as_attend').defaultTo(false).comment('病假是否算出勤');
    table.boolean('count_personal_as_attend').defaultTo(false).comment('事假是否算出勤');
  });

  // 3. 更新现有数据的默认值
  await knex('att_rule_config').update({
    include_holidays_in_should: true,
    count_holiday_as_attend: true,
    count_comp_time_as_attend: true,
    count_paid_leave_as_attend: true,
    count_trip_as_attend: true,
    count_out_as_attend: true,
    count_sick_as_attend: false,
    count_personal_as_attend: false,
  });
}

export async function down(knex: Knex): Promise<void> {
  // 1. 删除新字段
  await knex.schema.alterTable('att_rule_config', (table) => {
    table.dropColumn('include_holidays_in_should');
    table.dropColumn('count_holiday_as_attend');
    table.dropColumn('count_comp_time_as_attend');
    table.dropColumn('count_paid_leave_as_attend');
    table.dropColumn('count_trip_as_attend');
    table.dropColumn('count_out_as_attend');
    table.dropColumn('count_sick_as_attend');
    table.dropColumn('count_personal_as_attend');
  });

  // 2. 恢复旧字段
  await knex.schema.alterTable('att_rule_config', (table) => {
    table.boolean('exclude_holidays').defaultTo(true);
    table.boolean('exclude_weekends').defaultTo(true);
  });
}
