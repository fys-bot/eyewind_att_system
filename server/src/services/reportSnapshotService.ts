import db from '../db/index';

export interface SaveSnapshotInput {
  companyId: string;
  companyDisplayName: string;
  yearMonth: string;
  reportType: 'attendance' | 'late' | 'performance';
  tabName: string;
  headers: string[];
  rows: string[][];
  redFrameCount: number;
  editCount: number;
  editLogs: Array<{
    rowIndex: number;
    colIndex: number;
    employeeName: string;
    columnName: string;
    oldValue: string;
    newValue: string;
  }>;
  savedBy?: string;
  savedByName?: string;
  remarks?: string;
}

export async function saveReportSnapshot(input: SaveSnapshotInput) {
  return db.transaction(async (trx) => {
    // 1. 获取当前最大版本号
    const maxVersionResult = await trx('att_report_snapshot')
      .where({
        company_id: input.companyId,
        year_month: input.yearMonth,
        report_type: input.reportType,
      })
      .max('version as max_version')
      .first();

    const nextVersion = (maxVersionResult?.max_version || 0) + 1;

    // 2. 插入快照
    const [snapshot] = await trx('att_report_snapshot')
      .insert({
        company_id: input.companyId,
        company_display_name: input.companyDisplayName,
        year_month: input.yearMonth,
        report_type: input.reportType,
        tab_name: input.tabName,
        version: nextVersion,
        headers: JSON.stringify(input.headers),
        rows: JSON.stringify(input.rows),
        row_count: input.rows.length,
        column_count: input.headers.length,
        red_frame_count: input.redFrameCount,
        edit_count: input.editCount,
        status: 'draft',
        saved_by: input.savedBy || null,
        saved_by_name: input.savedByName || null,
        remarks: input.remarks || null,
      })
      .returning('*');

    // 3. 批量插入编辑日志
    if (input.editLogs.length > 0) {
      const logRows = input.editLogs.map((log) => ({
        snapshot_id: snapshot.id,
        company_id: input.companyId,
        year_month: input.yearMonth,
        report_type: input.reportType,
        row_index: log.rowIndex,
        col_index: log.colIndex,
        employee_name: log.employeeName,
        column_name: log.columnName,
        old_value: log.oldValue,
        new_value: log.newValue,
        edited_by: input.savedBy || null,
        edited_by_name: input.savedByName || null,
      }));

      await trx('att_report_edit_log').insert(logRows);
    }

    return { id: snapshot.id, version: nextVersion };
  });
}

export async function getSnapshots(companyId: string, yearMonth: string, reportType?: string) {
  const query = db('att_report_snapshot')
    .where({ company_id: companyId, year_month: yearMonth })
    .orderBy('version', 'desc');

  if (reportType) {
    query.where({ report_type: reportType });
  }

  return query.select('id', 'company_id', 'company_display_name', 'year_month', 'report_type', 'tab_name', 'version', 'row_count', 'column_count', 'red_frame_count', 'edit_count', 'status', 'saved_by_name', 'remarks', 'created_at');
}

export async function getSnapshotById(id: number) {
  return db('att_report_snapshot').where({ id }).first();
}

export async function getEditLogs(snapshotId: number) {
  return db('att_report_edit_log')
    .where({ snapshot_id: snapshotId })
    .orderBy('edited_at', 'desc');
}

export async function getEditLogsByCompanyMonth(companyId: string, yearMonth: string, reportType?: string) {
  const query = db('att_report_edit_log')
    .where({ company_id: companyId, year_month: yearMonth })
    .orderBy('edited_at', 'desc');

  if (reportType) {
    query.where({ report_type: reportType });
  }

  return query;
}

export async function getLatestSnapshot(companyId: string, yearMonth: string, reportType: string) {
  return db('att_report_snapshot')
    .where({ company_id: companyId, year_month: yearMonth, report_type: reportType })
    .orderBy('version', 'desc')
    .first();
}
