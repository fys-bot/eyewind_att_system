import db from '../db/index';
import type { CompanyId } from '../types/index';

export interface MonthSnapshot {
  id?: number;
  company_id: CompanyId;
  year_month: string;
  status: 'syncing' | 'synced' | 'stale';
  is_finalized: boolean;
  total_employees: number;
  full_attendance_count: number;
  abnormal_user_count: number;
  attendance_score: number | null;
  full_attendance_rate: number | null;
  employee_user_ids: string[] | null;
  data_sync_time: Date | null;
  stats_calc_time: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface CompanyAggregate {
  id?: number;
  company_id: CompanyId;
  company_name: string;
  year_month: string;
  total_employees: number;
  total_late_minutes: number;
  abnormal_user_count: number;
  total_records: number;
  abnormal_records: number;
  full_attendance_count: number;
  calc_time: Date | null;
}

export class MonthSnapshotService {
  /**
   * 获取月度快照
   */
  async getSnapshot(companyId: CompanyId, yearMonth: string): Promise<MonthSnapshot | null> {
    const row = await db('att_month_snapshot')
      .where({ company_id: companyId, year_month: yearMonth })
      .first();
    return row || null;
  }

  /**
   * 判断某月数据是否已定稿（可直接从数据库读取）
   */
  async isFinalized(companyId: CompanyId, yearMonth: string): Promise<boolean> {
    const snapshot = await this.getSnapshot(companyId, yearMonth);
    return snapshot?.is_finalized === true;
  }

  /**
   * 创建或更新月度快照
   */
  async upsertSnapshot(data: Partial<MonthSnapshot> & { company_id: CompanyId; year_month: string }): Promise<void> {
    const existing = await this.getSnapshot(data.company_id, data.year_month);

    if (existing) {
      await db('att_month_snapshot')
        .where({ id: existing.id })
        .update({
          ...data,
          employee_user_ids: data.employee_user_ids ? JSON.stringify(data.employee_user_ids) : existing.employee_user_ids,
          updated_at: new Date(),
        });
    } else {
      await db('att_month_snapshot').insert({
        ...data,
        employee_user_ids: data.employee_user_ids ? JSON.stringify(data.employee_user_ids) : null,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  /**
   * 标记月度数据为已定稿
   */
  async finalizeMonth(companyId: CompanyId, yearMonth: string): Promise<void> {
    await this.upsertSnapshot({
      company_id: companyId,
      year_month: yearMonth,
      status: 'synced',
      is_finalized: true,
    });
  }

  /**
   * 保存公司级月度汇总
   */
  async upsertCompanyAggregate(data: Omit<CompanyAggregate, 'id'>): Promise<void> {
    const existing = await db('att_company_aggregate')
      .where({
        company_id: data.company_id,
        company_name: data.company_name,
        year_month: data.year_month,
      })
      .first();

    if (existing) {
      await db('att_company_aggregate')
        .where({ id: existing.id })
        .update({ ...data, updated_at: new Date() });
    } else {
      await db('att_company_aggregate').insert({
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  /**
   * 批量保存公司级月度汇总
   */
  async batchUpsertCompanyAggregates(
    companyId: CompanyId,
    yearMonth: string,
    aggregates: Record<string, { totalLateMinutes: number; abnormalUserCount: number; totalRecords: number; abnormalRecords: number }>,
    employeeCounts: Record<string, number>,
    fullAttendanceCounts: Record<string, number>
  ): Promise<void> {
    for (const [companyName, agg] of Object.entries(aggregates)) {
      await this.upsertCompanyAggregate({
        company_id: companyId,
        company_name: companyName,
        year_month: yearMonth,
        total_employees: employeeCounts[companyName] || 0,
        total_late_minutes: agg.totalLateMinutes,
        abnormal_user_count: agg.abnormalUserCount,
        total_records: agg.totalRecords,
        abnormal_records: agg.abnormalRecords,
        full_attendance_count: fullAttendanceCounts[companyName] || 0,
        calc_time: new Date(),
      });
    }
  }

  /**
   * 获取某月的公司级汇总数据
   */
  async getCompanyAggregates(companyId: CompanyId, yearMonth: string): Promise<CompanyAggregate[]> {
    return await db('att_company_aggregate')
      .where({ company_id: companyId, year_month: yearMonth })
      .orderBy('company_name');
  }

  /**
   * 获取所有已定稿的月份列表
   */
  async getFinalizedMonths(companyId: CompanyId): Promise<string[]> {
    const rows = await db('att_month_snapshot')
      .where({ company_id: companyId, is_finalized: true })
      .select('year_month')
      .orderBy('year_month', 'desc');
    return rows.map((r: any) => r.year_month);
  }
}

export const monthSnapshotService = new MonthSnapshotService();
