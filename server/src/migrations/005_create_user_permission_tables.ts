import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. 角色表
  await knex.schema.createTable('att_sys_roles', (table) => {
    table.bigIncrements('id').primary();
    table.string('role_id', 64).notNullable().unique().comment('角色ID');
    table.string('name', 128).notNullable().comment('角色名称');
    table.string('description', 512).nullable().comment('角色描述');
    table.jsonb('permissions').notNullable().defaultTo('[]').comment('权限列表（JSON数组）');
    table.boolean('is_system').defaultTo(false).comment('是否系统内置角色（不可删除）');
    table.timestamps(true, true);
    
    table.index('role_id');
    table.index('name');
  });

  // 2. 用户表
  await knex.schema.createTable('att_sys_users', (table) => {
    table.bigIncrements('id').primary();
    table.string('user_id', 64).notNullable().unique().comment('用户ID');
    table.string('name', 128).notNullable().comment('用户名');
    table.string('email', 256).nullable().comment('邮箱');
    table.string('password_hash', 256).notNullable().comment('密码哈希');
    table.string('avatar', 512).nullable().comment('头像URL');
    table.string('role_id', 64).notNullable().comment('角色ID');
    table.enum('status', ['active', 'inactive']).defaultTo('active').comment('账号状态');
    table.string('creator', 64).nullable().comment('创建人');
    table.timestamp('last_login').nullable().comment('最后登录时间');
    table.timestamps(true, true);
    
    table.index('user_id');
    table.index('name');
    table.index('email');
    table.index('role_id');
    table.index('status');
    table.foreign('role_id').references('role_id').inTable('att_sys_roles').onDelete('RESTRICT');
  });

  // 3. 操作日志表
  await knex.schema.createTable('att_sys_operation_logs', (table) => {
    table.bigIncrements('id').primary();
    table.string('user_id', 64).notNullable().comment('操作人ID');
    table.string('user_name', 128).nullable().comment('操作人姓名');
    table.string('user_role', 128).nullable().comment('操作人角色');
    table.enum('action', ['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'DOWNLOAD', 'UPLOAD', 'SEND', 'RECALL', 'ARCHIVE', 'EDIT', 'VIEW']).notNullable().comment('操作类型');
    table.string('module', 64).notNullable().comment('操作模块');
    table.string('target', 256).nullable().comment('操作对象');
    table.text('details').nullable().comment('操作详情');
    table.string('ip_address', 64).nullable().comment('IP地址');
    table.string('user_agent', 512).nullable().comment('用户代理');
    table.timestamp('created_at').defaultTo(knex.fn.now()).comment('操作时间');
    
    table.index('user_id');
    table.index('action');
    table.index('module');
    table.index('created_at');
  });

  // 4. 插入默认角色
  await knex('att_sys_roles').insert([
    {
      role_id: 'role_admin',
      name: '超级管理员',
      description: '拥有系统所有权限',
      permissions: JSON.stringify([
        // 考勤确认
        'attendance_verification:view', 'attendance_verification:create', 'attendance_verification:edit',
        'attendance_verification:send', 'attendance_verification:recall', 'attendance_verification:archive',
        'attendance_verification:delete', 'attendance_verification:export',
        // 考勤仪表盘
        'attendance_dashboard:view', 'attendance_dashboard:export', 'attendance_dashboard:calendar_view',
        'attendance_dashboard:calendar_edit', 'attendance_dashboard:ai_analysis', 'attendance_dashboard:statistics',
        'attendance_dashboard:charts',
        // 员工列表
        'employee_list:view', 'employee_list:sync', 'employee_list:edit', 'employee_list:delete', 'employee_list:export',
        // 考勤规则
        'attendance_rules:view', 'attendance_rules:edit', 'attendance_rules:create', 'attendance_rules:delete',
        // 日志管理
        'logs:view', 'logs:export', 'logs:delete', 'logs:statistics',
        // 系统管理
        'admin:users', 'admin:roles', 'admin:settings', 'admin:backup', 'admin:restore',
        // 钉钉集成
        'dingtalk:config', 'dingtalk:sync_employees', 'dingtalk:sync_attendance', 'dingtalk:send_notification',
        // 数据导入导出
        'data:import', 'data:export', 'data:batch_operation'
      ]),
      is_system: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      role_id: 'role_hr_mgr',
      name: '人事经理',
      description: '负责考勤全流程管理，拥有编辑权限',
      permissions: JSON.stringify([
        // 考勤确认
        'attendance_verification:view', 'attendance_verification:create', 'attendance_verification:edit',
        'attendance_verification:send', 'attendance_verification:recall', 'attendance_verification:archive',
        'attendance_verification:export',
        // 考勤仪表盘
        'attendance_dashboard:view', 'attendance_dashboard:export', 'attendance_dashboard:calendar_view',
        'attendance_dashboard:calendar_edit', 'attendance_dashboard:ai_analysis', 'attendance_dashboard:statistics',
        'attendance_dashboard:charts',
        // 员工列表
        'employee_list:view', 'employee_list:sync', 'employee_list:edit', 'employee_list:export',
        // 考勤规则
        'attendance_rules:view', 'attendance_rules:edit',
        // 日志管理
        'logs:view', 'logs:export', 'logs:statistics',
        // 钉钉集成
        'dingtalk:sync_employees', 'dingtalk:sync_attendance', 'dingtalk:send_notification',
        // 数据导入导出
        'data:import', 'data:export', 'data:batch_operation'
      ]),
      is_system: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      role_id: 'role_finance',
      name: '财务专员',
      description: '仅能查看和下载数据，无编辑权限',
      permissions: JSON.stringify([
        // 考勤确认
        'attendance_verification:view', 'attendance_verification:export',
        // 考勤仪表盘
        'attendance_dashboard:view', 'attendance_dashboard:export', 'attendance_dashboard:calendar_view',
        'attendance_dashboard:statistics', 'attendance_dashboard:charts',
        // 员工列表
        'employee_list:view', 'employee_list:export',
        // 考勤规则
        'attendance_rules:view',
        // 数据导入导出
        'data:export'
      ]),
      is_system: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      role_id: 'role_hr_clerk',
      name: '考勤专员',
      description: '仅能查看和编辑数据，无法发送通知或导出',
      permissions: JSON.stringify([
        // 考勤确认
        'attendance_verification:view', 'attendance_verification:create', 'attendance_verification:edit',
        // 考勤仪表盘
        'attendance_dashboard:view', 'attendance_dashboard:calendar_view', 'attendance_dashboard:calendar_edit',
        'attendance_dashboard:statistics',
        // 员工列表
        'employee_list:view', 'employee_list:edit',
        // 考勤规则
        'attendance_rules:view'
      ]),
      is_system: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }
  ]);

  // 5. 插入默认管理员用户（密码: admin）
  // 使用简单的哈希方式，实际生产环境应使用 bcrypt
  await knex('att_sys_users').insert({
    user_id: 'user_1',
    name: 'admin',
    email: 'admin@lingosync.ai',
    password_hash: 'admin', // TODO: 在实际使用时应该使用 bcrypt 加密
    role_id: 'role_admin',
    status: 'active',
    creator: 'System',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('att_sys_operation_logs');
  await knex.schema.dropTableIfExists('att_sys_users');
  await knex.schema.dropTableIfExists('att_sys_roles');
}
