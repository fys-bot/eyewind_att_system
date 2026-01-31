import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. 每日考勤主表
  await knex.schema.createTable('att_daily', (table) => {
    table.bigIncrements('id').primary();
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司标识');
    table.string('user_id', 64).notNullable().comment('员工ID');
    table.string('user_name', 128).nullable().comment('员工姓名');
    table.string('department', 256).nullable().comment('部门');
    
    // 日期信息
    table.date('attendance_date').notNullable().comment('考勤日期');
    table.string('year_month', 7).notNullable().comment('年月，如 2026-01');
    table.integer('day_of_week').nullable().comment('星期几 (0=周日, 1-6)');
    table.boolean('is_workday').defaultTo(true).comment('是否工作日');
    table.boolean('is_holiday').defaultTo(false).comment('是否法定节假日');
    table.string('holiday_name', 64).nullable().comment('节假日名称');
    
    // 考勤状态
    table.enum('status', ['normal', 'abnormal', 'incomplete', 'noRecord']).notNullable().defaultTo('noRecord').comment('考勤状态');
    table.boolean('has_abnormality').defaultTo(false).comment('是否有异常');
    table.boolean('has_on_duty_approve').defaultTo(false).comment('上班是否有审批');
    table.boolean('has_off_duty_approve').defaultTo(false).comment('下班是否有审批');
    
    // 打卡时间
    table.time('on_duty_time').nullable().comment('上班打卡时间');
    table.time('off_duty_time').nullable().comment('下班打卡时间');
    table.bigInteger('on_duty_timestamp').nullable().comment('上班打卡时间戳');
    table.bigInteger('off_duty_timestamp').nullable().comment('下班打卡时间戳');
    
    // 异常信息
    table.integer('late_minutes').defaultTo(0).comment('迟到分钟数');
    table.boolean('is_late').defaultTo(false).comment('是否迟到');
    table.boolean('is_missing').defaultTo(false).comment('是否缺卡');
    table.boolean('is_absenteeism').defaultTo(false).comment('是否旷工');
    
    // 请假信息
    table.string('leave_type', 32).nullable().comment('请假类型');
    table.decimal('leave_hours', 4, 2).defaultTo(0).comment('请假时长（小时）');
    table.string('leave_proc_inst_id', 64).nullable().comment('请假审批单ID');
    
    // 加班信息
    table.integer('overtime_minutes').defaultTo(0).comment('加班分钟数');
    table.string('overtime_checkpoint', 16).nullable().comment('加班节点');
    
    // 元数据
    table.enum('data_source', ['dingtalk', 'manual', 'import']).defaultTo('dingtalk').comment('数据来源');
    table.timestamp('sync_time').nullable().comment('最后同步时间');
    table.timestamps(true, true);
    
    // 索引
    table.unique(['company_id', 'user_id', 'attendance_date']);
    table.index(['company_id', 'year_month']);
    table.index(['user_id', 'year_month']);
    table.index('attendance_date');
    table.index('status');
  });

  // 2. 打卡记录表
  await knex.schema.createTable('att_punch_record', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('daily_id').notNullable().comment('关联每日考勤ID');
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司标识');
    table.string('user_id', 64).notNullable().comment('员工ID');

    // 打卡信息
    table.date('work_date').notNullable().comment('工作日期');
    table.bigInteger('work_date_timestamp').notNullable().comment('工作日期时间戳');
    table.enum('check_type', ['OnDuty', 'OffDuty']).notNullable().comment('打卡类型');
    table.string('source_type', 32).notNullable().comment('来源类型：ATM/APPROVE/MANUAL_EDIT');
    
    // 时间信息
    table.bigInteger('user_check_time').notNullable().comment('实际打卡时间戳');
    table.bigInteger('base_check_time').notNullable().comment('基准打卡时间戳');
    table.time('check_time').nullable().comment('打卡时间');
    
    // 结果信息
    table.enum('time_result', ['Normal', 'Late', 'Early', 'NotSigned', 'SeriousLate', 'Absenteeism']).notNullable().comment('时间结果');
    table.enum('location_result', ['Normal', 'Outside', 'NotSigned']).defaultTo('Normal').comment('位置结果');
    
    // 关联信息
    table.string('proc_inst_id', 64).nullable().comment('审批实例ID');
    table.string('group_id', 64).nullable().comment('考勤组ID');
    table.string('plan_id', 64).nullable().comment('排班ID');
    table.string('approve_id', 64).nullable().comment('审批ID');
    table.string('corp_id', 64).nullable().comment('企业ID');
    
    // 描述信息
    table.string('source_type_desc', 64).nullable().comment('来源类型描述');
    table.string('check_type_desc', 32).nullable().comment('打卡类型描述');
    table.string('time_result_desc', 32).nullable().comment('时间结果描述');
    
    // 元数据
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // 索引
    table.index('daily_id');
    table.index(['company_id', 'user_id', 'work_date']);
    table.index('proc_inst_id');
    table.foreign('daily_id').references('id').inTable('att_daily').onDelete('CASCADE');
  });

  // 3. 月度统计表
  await knex.schema.createTable('att_monthly_stats', (table) => {
    table.bigIncrements('id').primary();
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司标识');
    table.string('user_id', 64).notNullable().comment('员工ID');
    table.string('user_name', 128).nullable().comment('员工姓名');
    table.string('department', 256).nullable().comment('部门');
    table.string('year_month', 7).notNullable().comment('年月');
    
    // 出勤统计
    table.integer('should_attendance_days').defaultTo(0).comment('应出勤天数');
    table.integer('actual_attendance_days').defaultTo(0).comment('实际出勤天数');
    table.boolean('is_full_attendance').defaultTo(false).comment('是否全勤');
    
    // 异常统计
    table.integer('late_count').defaultTo(0).comment('迟到次数');
    table.integer('late_minutes').defaultTo(0).comment('迟到总分钟数');
    table.integer('exempted_late_count').defaultTo(0).comment('豁免迟到次数');
    table.integer('exempted_late_minutes').defaultTo(0).comment('豁免后迟到分钟数');
    table.integer('missing_count').defaultTo(0).comment('缺卡次数');
    table.integer('absenteeism_count').defaultTo(0).comment('旷工次数');
    
    // 绩效
    table.decimal('performance_penalty', 10, 2).defaultTo(0).comment('绩效扣款');
    table.decimal('full_attendance_bonus', 10, 2).defaultTo(0).comment('全勤奖金');
    
    // 请假统计（次数）
    table.integer('annual_count').defaultTo(0).comment('年假次数');
    table.integer('sick_count').defaultTo(0).comment('病假次数');
    table.integer('serious_sick_count').defaultTo(0).comment('病假(>24h)次数');
    table.integer('personal_count').defaultTo(0).comment('事假次数');
    table.integer('trip_count').defaultTo(0).comment('出差次数');
    table.integer('comp_time_count').defaultTo(0).comment('调休次数');
    table.integer('bereavement_count').defaultTo(0).comment('丧假次数');
    table.integer('paternity_count').defaultTo(0).comment('陪产假次数');
    table.integer('maternity_count').defaultTo(0).comment('产假次数');
    table.integer('parental_count').defaultTo(0).comment('育儿假次数');
    table.integer('marriage_count').defaultTo(0).comment('婚假次数');
    
    // 请假统计（小时数）
    table.decimal('annual_hours', 6, 2).defaultTo(0).comment('年假小时数');
    table.decimal('sick_hours', 6, 2).defaultTo(0).comment('病假小时数');
    table.decimal('serious_sick_hours', 6, 2).defaultTo(0).comment('病假(>24h)小时数');
    table.decimal('personal_hours', 6, 2).defaultTo(0).comment('事假小时数');
    table.decimal('trip_hours', 6, 2).defaultTo(0).comment('出差小时数');
    table.decimal('comp_time_hours', 6, 2).defaultTo(0).comment('调休小时数');
    table.decimal('bereavement_hours', 6, 2).defaultTo(0).comment('丧假小时数');
    table.decimal('paternity_hours', 6, 2).defaultTo(0).comment('陪产假小时数');
    table.decimal('maternity_hours', 6, 2).defaultTo(0).comment('产假小时数');
    table.decimal('parental_hours', 6, 2).defaultTo(0).comment('育儿假小时数');
    table.decimal('marriage_hours', 6, 2).defaultTo(0).comment('婚假小时数');
    
    // 加班统计
    table.integer('overtime_total_minutes').defaultTo(0).comment('加班总分钟数');
    table.integer('overtime_19_5_minutes').defaultTo(0).comment('19:30加班分钟数');
    table.integer('overtime_20_5_minutes').defaultTo(0).comment('20:30加班分钟数');
    table.integer('overtime_22_minutes').defaultTo(0).comment('22:00加班分钟数');
    table.integer('overtime_24_minutes').defaultTo(0).comment('24:00加班分钟数');
    table.integer('overtime_19_5_count').defaultTo(0).comment('19:30加班次数');
    table.integer('overtime_20_5_count').defaultTo(0).comment('20:30加班次数');
    table.integer('overtime_22_count').defaultTo(0).comment('22:00加班次数');
    table.integer('overtime_24_count').defaultTo(0).comment('24:00加班次数');
    
    // 备注
    table.text('remarks').nullable().comment('备注信息（JSON格式）');
    
    // 元数据
    table.timestamp('calc_time').nullable().comment('统计计算时间');
    table.timestamps(true, true);
    
    // 索引
    table.unique(['company_id', 'user_id', 'year_month']);
    table.index(['company_id', 'year_month']);
    table.index(['user_id', 'year_month']);
    table.index('is_full_attendance');
  });

  // 4. 审批单缓存表
  await knex.schema.createTable('att_approval_record', (table) => {
    table.bigIncrements('id').primary();
    table.string('proc_inst_id', 64).notNullable().comment('审批实例ID');
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司标识');
    
    // 审批基本信息
    table.string('title', 256).nullable().comment('审批标题');
    table.string('biz_type', 64).nullable().comment('业务类型');
    table.string('status', 32).nullable().comment('审批状态');
    
    // 申请人信息
    table.string('applicant_user_id', 64).nullable().comment('申请人ID');
    table.string('applicant_name', 128).nullable().comment('申请人姓名');
    
    // 表单数据
    table.jsonb('form_values').nullable().comment('表单值');
    
    // 请假相关字段
    table.string('leave_type', 32).nullable().comment('请假类型');
    table.timestamp('start_time').nullable().comment('开始时间');
    table.timestamp('end_time').nullable().comment('结束时间');
    table.decimal('duration', 6, 2).nullable().comment('时长');
    table.string('duration_unit', 16).nullable().comment('时长单位');
    table.text('reason').nullable().comment('请假原因');
    
    // 元数据
    table.timestamp('fetch_time').nullable().comment('获取时间');
    table.jsonb('raw_data').nullable().comment('原始API响应');
    table.timestamps(true, true);
    
    // 索引
    table.unique('proc_inst_id');
    table.index('company_id');
    table.index('applicant_user_id');
    table.index('leave_type');
    table.index(['start_time', 'end_time']);
  });

  // 5. 编辑日志表
  await knex.schema.createTable('att_edit_log', (table) => {
    table.bigIncrements('id').primary();
    table.enum('company_id', ['eyewind', 'hydodo']).notNullable().comment('公司标识');
    table.string('user_id', 64).notNullable().comment('被修改员工ID');
    table.string('user_name', 128).nullable().comment('被修改员工姓名');
    table.date('attendance_date').notNullable().comment('考勤日期');
    
    // 修改信息
    table.enum('edit_type', ['status', 'time', 'leave', 'clear', 'batch']).notNullable().comment('修改类型');
    table.string('old_status', 32).nullable().comment('修改前状态');
    table.string('new_status', 32).nullable().comment('修改后状态');
    table.jsonb('old_value').nullable().comment('修改前完整数据');
    table.jsonb('new_value').nullable().comment('修改后完整数据');
    
    // 关联审批单
    table.string('linked_proc_inst_id', 64).nullable().comment('关联的审批单ID');
    
    // 操作信息
    table.string('edit_reason', 512).nullable().comment('修改原因');
    table.string('editor_id', 64).notNullable().comment('操作人ID');
    table.string('editor_name', 128).nullable().comment('操作人姓名');
    table.timestamp('edit_time').defaultTo(knex.fn.now()).comment('修改时间');
    
    // IP和设备信息
    table.string('client_ip', 64).nullable().comment('客户端IP');
    table.string('user_agent', 512).nullable().comment('用户代理');
    
    // 索引
    table.index(['company_id', 'attendance_date']);
    table.index(['user_id', 'attendance_date']);
    table.index('editor_id');
    table.index('edit_time');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('att_edit_log');
  await knex.schema.dropTableIfExists('att_approval_record');
  await knex.schema.dropTableIfExists('att_monthly_stats');
  await knex.schema.dropTableIfExists('att_punch_record');
  await knex.schema.dropTableIfExists('att_daily');
}
