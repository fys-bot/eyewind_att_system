import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. 报表快照表
  await knex.schema.createTable('att_report_snapshot', (table) => {
    table.bigIncrements('id').primary();
    table.string('company_id', 64).notNullable().comment('公司标识，如 eyewind、hydodo');
    table.string('company_display_name', 128).nullable().comment('公司显示名，如 深圳市风眼科技有限公司');
    table.string('year_month', 7).notNullable().comment('所属月份，如 2026-02');
    table.string('report_type', 32).notNullable().comment('报表类型：attendance/late/performance');
    table.string('tab_name', 128).nullable().comment('tab原始名称，全部模式下带公司前缀');
    table.integer('version').defaultTo(1).comment('版本号，每次保存+1');
    table.jsonb('headers').notNullable().comment('表头数组');
    table.jsonb('rows').notNullable().comment('数据行二维数组（含编辑后的值）');
    table.integer('row_count').nullable().comment('数据行数');
    table.integer('column_count').nullable().comment('列数');
    table.integer('red_frame_count').defaultTo(0).comment('缺卡/旷工单元格数');
    table.integer('edit_count').defaultTo(0).comment('被编辑的单元格数');
    table.string('status', 16).defaultTo('draft').comment('状态：draft/confirmed');
    table.string('saved_by', 64).nullable().comment('保存人ID');
    table.string('saved_by_name', 128).nullable().comment('保存人姓名');
    table.text('remarks').nullable().comment('备注');
    table.timestamps(true, true);

    table.unique(['company_id', 'year_month', 'report_type', 'version']);
    table.index(['company_id', 'year_month']);
    table.index('status');
  });

  // 2. 报表编辑日志表
  await knex.schema.createTable('att_report_edit_log', (table) => {
    table.bigIncrements('id').primary();
    table.bigInteger('snapshot_id').notNullable().comment('关联的快照ID');
    table.string('company_id', 64).notNullable().comment('公司标识');
    table.string('year_month', 7).notNullable().comment('所属月份');
    table.string('report_type', 32).notNullable().comment('报表类型');
    table.integer('row_index').notNullable().comment('被编辑的行号（从0开始）');
    table.integer('col_index').notNullable().comment('被编辑的列号（从0开始）');
    table.string('employee_name', 128).nullable().comment('该行对应的员工姓名');
    table.string('column_name', 64).nullable().comment('该列的表头名称');
    table.text('old_value').nullable().comment('修改前的值');
    table.text('new_value').nullable().comment('修改后的值');
    table.string('edited_by', 64).nullable().comment('编辑人ID');
    table.string('edited_by_name', 128).nullable().comment('编辑人姓名');
    table.timestamp('edited_at').defaultTo(knex.fn.now()).comment('编辑时间');

    table.foreign('snapshot_id').references('id').inTable('att_report_snapshot').onDelete('CASCADE');
    table.index('snapshot_id');
    table.index(['company_id', 'year_month']);
    table.index('employee_name');
    table.index('edited_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('att_report_edit_log');
  await knex.schema.dropTableIfExists('att_report_snapshot');
}
