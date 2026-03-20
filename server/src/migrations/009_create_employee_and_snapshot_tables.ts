import type { Knex } from 'knex';

/**
 * 创建员工花名册表和月度数据快照表
 * 
 * 设计目标：
 * 1. att_employees — 持久化钉钉员工数据，员工离职后仍可查询历史考勤
 * 2. att_month_snapshot — 记录每月数据同步状态，非当前月可直接从数据库读取，减少钉钉API调用
 * 3. att_company_aggregate — 公司级月度汇总统计，对应前端 companyAggregate 数据
 */

export async function up(knex: Knex): Promise<void> {
  // ============================================================
  // 1. 员工花名册表 (att_employees)
  // 存储从钉钉获取的员工信息，即使员工离职也保留记录
  // ============================================================
  await knex.schema.createTable('att_employees', (table) => {
    table.bigIncrements('id').primary();
    
    // 钉钉基础信息
    table.string('userid', 64).notNullable().comment('钉钉用户ID');
    table.string('name', 128).notNullable().comment('姓名');
    table.string('avatar', 512).nullable().comment('头像URL');
    table.string('title', 128).nullable().comment('职位');
    table.string('department', 256).nullable().comment('部门名称');
    table.string('mobile', 32).nullable().comment('手机号');
    table.string('job_number', 64).nullable().comment('工号');
    table.string('unionid', 128).nullable().comment('钉钉unionid');
    table.string('main_company', 128).nullable().comment('主体公司名称');
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('所属公司标识');
    
    // 入职信息
    table.timestamp('hired_date').nullable().comment('入职日期');
    table.timestamp('create_time').nullable().comment('钉钉账号创建时间');
    
    // 钉钉扩展信息
    table.jsonb('dept_id_list').nullable().comment('部门ID列表');
    table.jsonb('leader_in_dept').nullable().comment('部门主管信息');
    table.jsonb('role_list').nullable().comment('角色列表');
    table.boolean('is_admin').defaultTo(false).comment('是否管理员');
    table.boolean('is_boss').defaultTo(false).comment('是否老板');
    table.boolean('is_senior').defaultTo(false).comment('是否高管');
    table.boolean('is_active').defaultTo(true).comment('钉钉账号是否激活');
    
    // 在职状态
    table.enum('employment_status', ['active', 'resigned', 'transferred']).defaultTo('active').comment('在职状态');
    table.timestamp('resignation_date').nullable().comment('离职日期');
    
    // 同步元数据
    table.timestamp('last_sync_time').nullable().comment('最后一次从钉钉同步的时间');
    table.timestamps(true, true);
    
    // 索引
    table.unique(['company_id', 'userid']);
    table.index('userid');
    table.index('company_id');
    table.index('main_company');
    table.index('employment_status');
    table.index('name');
    table.index('department');
  });

  // ============================================================
  // 2. 月度数据快照表 (att_month_snapshot)
  // 记录每个公司每个月的数据同步状态
  // 用于判断：切换到非当前月时，是否可以直接从数据库读取
  // ============================================================
  await knex.schema.createTable('att_month_snapshot', (table) => {
    table.bigIncrements('id').primary();
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司标识');
    table.string('year_month', 7).notNullable().comment('年月，如 2026-01');
    
    // 同步状态
    table.enum('status', ['syncing', 'synced', 'stale']).defaultTo('syncing').comment('同步状态');
    table.boolean('is_finalized').defaultTo(false).comment('是否已定稿（非当前月且数据完整）');
    
    // 数据统计摘要
    table.integer('total_employees').defaultTo(0).comment('当月员工总数');
    table.integer('full_attendance_count').defaultTo(0).comment('全勤人数');
    table.integer('abnormal_user_count').defaultTo(0).comment('异常人数');
    table.decimal('attendance_score', 5, 2).nullable().comment('考勤健康分');
    table.decimal('full_attendance_rate', 5, 2).nullable().comment('全勤率(%)');
    
    // 员工列表快照（JSONB存储当月的员工userid列表，用于关联查询）
    table.jsonb('employee_user_ids').nullable().comment('当月员工userid列表');
    
    // 同步时间
    table.timestamp('data_sync_time').nullable().comment('考勤数据最后同步时间');
    table.timestamp('stats_calc_time').nullable().comment('统计数据最后计算时间');
    table.timestamps(true, true);
    
    // 索引
    table.unique(['company_id', 'year_month']);
    table.index('year_month');
    table.index('status');
    table.index('is_finalized');
  });

  // ============================================================
  // 3. 公司级月度汇总表 (att_company_aggregate)
  // 对应前端 companyAggregate 数据，按公司名称（子公司）汇总
  // ============================================================
  await knex.schema.createTable('att_company_aggregate', (table) => {
    table.bigIncrements('id').primary();
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司标识');
    table.string('company_name', 128).notNullable().comment('子公司名称（如 深圳市风越科技有限公司）');
    table.string('year_month', 7).notNullable().comment('年月');
    
    // 汇总统计
    table.integer('total_employees').defaultTo(0).comment('员工总数');
    table.integer('total_late_minutes').defaultTo(0).comment('迟到总分钟数');
    table.integer('abnormal_user_count').defaultTo(0).comment('异常人数');
    table.integer('total_records').defaultTo(0).comment('总记录数');
    table.integer('abnormal_records').defaultTo(0).comment('异常记录数');
    table.integer('full_attendance_count').defaultTo(0).comment('全勤人数');
    
    // 元数据
    table.timestamp('calc_time').nullable().comment('计算时间');
    table.timestamps(true, true);
    
    // 索引
    table.unique(['company_id', 'company_name', 'year_month']);
    table.index(['company_id', 'year_month']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('att_company_aggregate');
  await knex.schema.dropTableIfExists('att_month_snapshot');
  await knex.schema.dropTableIfExists('att_employees');
}
