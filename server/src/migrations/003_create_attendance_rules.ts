import type { Knex } from 'knex';

/**
 * 重新设计考勤规则数据库结构
 * 
 * 设计思路：
 * 1. 使用 JSONB 存储完整的规则配置，避免字段映射问题
 * 2. 支持多版本管理，不限于每个公司只有一条记录
 * 3. 简化表结构，只保留必要的表
 * 4. 确保与前端 AttendanceRuleConfig 接口完全对应
 */

export async function up(knex: Knex): Promise<void> {
  // 1. 删除旧表（如果存在）
  await knex.schema.dropTableIfExists('att_rule_change_log');
  await knex.schema.dropTableIfExists('att_rule_special_date');
  await knex.schema.dropTableIfExists('att_rule_detail');
  await knex.schema.dropTableIfExists('att_rule_config');

  // 2. 创建新的规则配置表
  await knex.schema.createTable('attendance_rule_configs', (table) => {
    table.bigIncrements('id').primary();
    
    // 公司标识
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司主体');
    table.string('config_name', 128).defaultTo('默认配置').comment('配置名称');
    
    // 完整的规则配置（JSONB格式，与前端 AttendanceRuleConfig 接口完全对应）
    table.jsonb('rules').notNullable().comment('完整的考勤规则配置');
    
    // 版本管理
    table.integer('version').defaultTo(1).comment('配置版本号');
    table.boolean('is_active').defaultTo(true).comment('是否为当前激活的配置');
    
    // 元数据
    table.timestamps(true, true);
    table.string('created_by', 64).nullable();
    table.string('updated_by', 64).nullable();
    table.text('change_reason').nullable().comment('变更原因');
    
    // 索引
    table.index('company_id');
    table.index(['company_id', 'is_active']);
    table.index('created_at');
  });

  // 3. 创建变更历史表（简化版）
  await knex.schema.createTable('attendance_rule_history', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('config_id').notNullable().comment('关联的配置ID');
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司主体');
    
    // 变更信息
    table.enum('change_type', ['create', 'update', 'rollback']).notNullable();
    table.jsonb('snapshot').notNullable().comment('配置快照');
    table.text('change_reason').nullable();
    
    // 元数据
    table.timestamp('changed_at').defaultTo(knex.fn.now());
    table.string('changed_by', 64).notNullable();
    
    // 索引
    table.index('config_id');
    table.index('company_id');
    table.index('changed_at');
  });

  // console.log('✅ 新的考勤规则表结构创建完成');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('attendance_rule_history');
  await knex.schema.dropTableIfExists('attendance_rule_configs');
}
