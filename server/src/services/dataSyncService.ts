import db from '../db/index';
import type { CompanyId } from '../types/index';
import { employeeService } from './employeeService';
import { monthSnapshotService } from './monthSnapshotService';

/**
 * 数据同步服务
 * 负责将钉钉API获取的数据持久化到数据库
 * 包括：员工数据、打卡记录、审批单
 */
export class DataSyncService {

  /**
   * 同步员工数据到 att_employees 表
   * 在每次从钉钉获取员工列表后调用
   */
  async syncEmployees(
    companyId: CompanyId,
    employees: any[]
  ): Promise<{ upserted: number; resigned: number }> {
    // 1. 批量 upsert 员工
    const { upserted } = await employeeService.batchUpsertEmployees(companyId, employees);

    // 2. 标记不在列表中的员工为离职
    const activeUserIds = employees.map((e: any) => e.userid);
    const resigned = await employeeService.markResignedEmployees(companyId, activeUserIds);

    console.log(`[DataSync] 员工同步完成: company=${companyId}, upserted=${upserted}, resigned=${resigned}`);
    return { upserted, resigned };
  }

  /**
   * 同步打卡数据到 att_daily + att_punch_record 表
   * 在每次从钉钉获取打卡详情后调用
   */
  async syncPunchData(
    companyId: CompanyId,
    yearMonth: string,
    punchRecords: any[],
    employees: any[]
  ): Promise<{ dailyUpserted: number; punchInserted: number }> {
    if (!punchRecords || punchRecords.length === 0) {
      return { dailyUpserted: 0, punchInserted: 0 };
    }

    // 构建员工名称映射
    const employeeMap = new Map<string, any>();
    employees.forEach((e: any) => employeeMap.set(e.userid, e));

    // 按 userId + workDate 分组打卡记录
    const groupedRecords = new Map<string, any[]>();
    for (const record of punchRecords) {
      // 跳过上月数据（仅用于跨天规则，不需要入库到当月）
      if (record.isPreviousMonthData) continue;

      const userId = record.userId;
      const workDate = this.parseWorkDate(record.workDate);
      if (!workDate) continue;

      const dateStr = workDate.toISOString().split('T')[0];
      const key = `${userId}|${dateStr}`;

      if (!groupedRecords.has(key)) {
        groupedRecords.set(key, []);
      }
      groupedRecords.get(key)!.push(record);
    }

    let dailyUpserted = 0;
    let punchInserted = 0;

    // 分批处理，每批50条
    const entries = Array.from(groupedRecords.entries());
    const BATCH_SIZE = 50;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);

      await db.transaction(async (trx) => {
        for (const [key, records] of batch) {
          const [userId, dateStr] = key.split('|');
          const workDate = new Date(dateStr);
          const emp = employeeMap.get(userId);

          // 判断考勤状态
          const onDutyRecords = records.filter((r: any) => r.checkType === 'OnDuty');
          const offDutyRecords = records.filter((r: any) => r.checkType === 'OffDuty');
          const hasOnDuty = onDutyRecords.some((r: any) => r.timeResult !== 'NotSigned');
          const hasOffDuty = offDutyRecords.some((r: any) => r.timeResult !== 'NotSigned');
          const hasLate = onDutyRecords.some((r: any) => r.timeResult === 'Late' || r.timeResult === 'SeriousLate');
          const hasAbsenteeism = records.some((r: any) => r.timeResult === 'Absenteeism');
          const hasMissing = (!hasOnDuty || !hasOffDuty) && !hasAbsenteeism;

          let status: string;
          if (hasAbsenteeism) {
            status = 'abnormal';
          } else if (hasMissing) {
            status = 'incomplete';
          } else if (hasLate) {
            status = 'abnormal';
          } else {
            status = 'normal';
          }

          // 获取打卡时间
          const onDutyTime = hasOnDuty
            ? this.timestampToTime(onDutyRecords.find((r: any) => r.timeResult !== 'NotSigned')?.userCheckTime)
            : null;
          const offDutyTime = hasOffDuty
            ? this.timestampToTime(offDutyRecords.find((r: any) => r.timeResult !== 'NotSigned')?.userCheckTime)
            : null;

          // 计算迟到分钟数
          const lateRecord = onDutyRecords.find((r: any) => r.timeResult === 'Late' || r.timeResult === 'SeriousLate');
          let lateMinutes = 0;
          if (lateRecord && lateRecord.userCheckTime && lateRecord.baseCheckTime) {
            lateMinutes = Math.max(0, Math.floor((lateRecord.userCheckTime - lateRecord.baseCheckTime) / 60000));
          }

          // 检查是否有审批
          const hasOnDutyApprove = onDutyRecords.some((r: any) => r.procInstId);
          const hasOffDutyApprove = offDutyRecords.some((r: any) => r.procInstId);

          // Upsert att_daily
          const dailyData = {
            company_id: companyId,
            user_id: userId,
            user_name: emp?.name || null,
            department: emp?.department || null,
            attendance_date: dateStr,
            year_month: yearMonth,
            day_of_week: workDate.getDay(),
            status,
            has_abnormality: status !== 'normal',
            has_on_duty_approve: hasOnDutyApprove,
            has_off_duty_approve: hasOffDutyApprove,
            on_duty_time: onDutyTime,
            off_duty_time: offDutyTime,
            late_minutes: lateMinutes,
            is_late: hasLate,
            is_missing: hasMissing,
            is_absenteeism: hasAbsenteeism,
            data_source: 'dingtalk' as const,
            sync_time: new Date(),
            updated_at: new Date(),
          };

          // 查找现有记录
          let existing = await trx('att_daily')
            .where({ company_id: companyId, user_id: userId, attendance_date: dateStr })
            .first();

          let dailyId: number;

          if (existing) {
            // 只更新钉钉来源的数据，不覆盖手动编辑的
            if (existing.data_source === 'manual') {
              dailyId = existing.id;
            } else {
              await trx('att_daily').where({ id: existing.id }).update(dailyData);
              dailyId = existing.id;
            }
          } else {
            const [result] = await trx('att_daily').insert({
              ...dailyData,
              created_at: new Date(),
            }).returning('id');
            dailyId = typeof result === 'object' ? result.id : result;
          }

          dailyUpserted++;

          // 删除旧的钉钉来源打卡记录，重新插入
          // 保留手动编辑的记录
          if (!existing || existing.data_source !== 'manual') {
            await trx('att_punch_record').where({ daily_id: dailyId }).delete();

            const punchInserts = records.map((r: any) => ({
              daily_id: dailyId,
              company_id: companyId,
              user_id: userId,
              work_date: dateStr,
              work_date_timestamp: r.workDate,
              check_type: r.checkType,
              source_type: r.sourceType || 'ATM',
              user_check_time: r.userCheckTime,
              base_check_time: r.baseCheckTime,
              check_time: this.timestampToTime(r.userCheckTime),
              time_result: r.timeResult,
              location_result: r.locationResult || 'Normal',
              proc_inst_id: r.procInstId || null,
              group_id: r.groupId || null,
              plan_id: r.planId || null,
              approve_id: r.approveId || null,
              corp_id: r.corpId || null,
              source_type_desc: r.sourceType_Desc || null,
              check_type_desc: r.checkType_Desc || null,
              time_result_desc: r.timeResult_Desc || null,
              created_at: new Date(),
            }));

            if (punchInserts.length > 0) {
              await trx('att_punch_record').insert(punchInserts);
              punchInserted += punchInserts.length;
            }
          }
        }
      });
    }

    console.log(`[DataSync] 打卡数据同步完成: company=${companyId}, month=${yearMonth}, daily=${dailyUpserted}, punch=${punchInserted}`);
    return { dailyUpserted, punchInserted };
  }

  /**
   * 同步月度统计数据到 att_monthly_stats 表
   * 在前端计算完成后调用
   */
  async syncMonthlyStats(
    companyId: CompanyId,
    yearMonth: string,
    statsData: Array<{ userId: string; userName?: string; department?: string; stats: any }>
  ): Promise<{ upserted: number }> {
    if (!statsData || statsData.length === 0) {
      return { upserted: 0 };
    }

    let upserted = 0;
    const BATCH_SIZE = 50;

    for (let i = 0; i < statsData.length; i += BATCH_SIZE) {
      const batch = statsData.slice(i, i + BATCH_SIZE);

      for (const item of batch) {
        const s = item.stats;
        const record = {
          company_id: companyId,
          user_id: item.userId,
          user_name: item.userName || null,
          department: item.department || null,
          year_month: yearMonth,
          should_attendance_days: s.shouldAttendanceDays || 0,
          actual_attendance_days: s.actualAttendanceDays || 0,
          is_full_attendance: s.isFullAttendance || false,
          late_count: s.late || 0,
          late_minutes: s.lateMinutes || 0,
          exempted_late_count: s.exemptedLate || 0,
          exempted_late_minutes: s.exemptedLateMinutes || 0,
          missing_count: s.missing || 0,
          absenteeism_count: s.absenteeism || 0,
          performance_penalty: s.performancePenalty || 0,
          full_attendance_bonus: s.isFullAttendance ? (s.fullAttendanceBonus || 0) : 0,
          annual_count: s.annual || 0,
          sick_count: s.sick || 0,
          serious_sick_count: s.seriousSick || 0,
          personal_count: s.personal || 0,
          trip_count: s.trip || 0,
          comp_time_count: s.compTime || 0,
          bereavement_count: s.bereavement || 0,
          paternity_count: s.paternity || 0,
          maternity_count: s.maternity || 0,
          parental_count: s.parental || 0,
          marriage_count: s.marriage || 0,
          annual_hours: s.annualHours || 0,
          sick_hours: s.sickHours || 0,
          serious_sick_hours: s.seriousSickHours || 0,
          personal_hours: s.personalHours || 0,
          trip_hours: s.tripHours || 0,
          comp_time_hours: s.compTimeHours || 0,
          bereavement_hours: s.bereavementHours || 0,
          paternity_hours: s.paternityHours || 0,
          maternity_hours: s.maternityHours || 0,
          parental_hours: s.parentalHours || 0,
          marriage_hours: s.marriageHours || 0,
          overtime_total_minutes: s.overtimeTotalMinutes || 0,
          overtime_19_5_minutes: s.overtime19_5Minutes || 0,
          overtime_20_5_minutes: s.overtime20_5Minutes || 0,
          overtime_22_minutes: s.overtime22Minutes || 0,
          overtime_24_minutes: s.overtime24Minutes || 0,
          overtime_19_5_count: s.overtime19_5Count || 0,
          overtime_20_5_count: s.overtime20_5Count || 0,
          overtime_22_count: s.overtime22Count || 0,
          overtime_24_count: s.overtime24Count || 0,
          calc_time: new Date(),
          updated_at: new Date(),
        };

        const existing = await db('att_monthly_stats')
          .where({ company_id: companyId, user_id: item.userId, year_month: yearMonth })
          .first();

        if (existing) {
          await db('att_monthly_stats').where({ id: existing.id }).update(record);
        } else {
          await db('att_monthly_stats').insert({ ...record, created_at: new Date() });
        }
        upserted++;
      }
    }

    console.log(`[DataSync] 月度统计同步完成: company=${companyId}, month=${yearMonth}, upserted=${upserted}`);
    return { upserted };
  }

  /**
   * 完成月度数据同步后，更新快照状态
   */
  async finalizeMonthData(
    companyId: CompanyId,
    yearMonth: string,
    employeeUserIds: string[],
    summaryStats: {
      totalEmployees: number;
      fullAttendanceCount: number;
      abnormalUserCount: number;
      attendanceScore?: number;
      fullAttendanceRate?: number;
    }
  ): Promise<void> {
    await monthSnapshotService.upsertSnapshot({
      company_id: companyId,
      year_month: yearMonth,
      status: 'synced',
      is_finalized: true,
      total_employees: summaryStats.totalEmployees,
      full_attendance_count: summaryStats.fullAttendanceCount,
      abnormal_user_count: summaryStats.abnormalUserCount,
      attendance_score: summaryStats.attendanceScore || null,
      full_attendance_rate: summaryStats.fullAttendanceRate || null,
      employee_user_ids: employeeUserIds,
      data_sync_time: new Date(),
      stats_calc_time: new Date(),
    });

    console.log(`[DataSync] 月度数据定稿: company=${companyId}, month=${yearMonth}`);
  }

  // --- 工具方法 ---

  private parseWorkDate(workDateValue: any): Date | null {
    if (!workDateValue) return null;
    if (typeof workDateValue === 'number') {
      return new Date(workDateValue);
    }
    if (typeof workDateValue === 'string') {
      const [datePart] = workDateValue.split('T');
      const [y, m, d] = datePart.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return null;
  }

  private timestampToTime(timestamp: any): string | null {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  }
}

export const dataSyncService = new DataSyncService();
