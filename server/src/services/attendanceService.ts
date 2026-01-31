import db from '../db/index';
import type { CompanyId } from '../types/index';
import type {
  AttDaily,
  AttPunchRecord,
  AttMonthlyStats,
  AttApprovalRecord,
  AttEditLog,
  DailyAttendanceStatus,
  PunchRecordInput,
  AttendanceMapResponse,
  MonthlyStatsResponse,
  UpdateDailyRequest,
  BatchUpdateDailyRequest,
  EditLogQuery,
  EditType,
} from '../types/attendance';

export class AttendanceService {
  // 获取月度考勤日历数据
  async getMonthlyCalendar(
    companyId: CompanyId,
    yearMonth: string,
    userIds?: string[]
  ): Promise<AttendanceMapResponse> {
    // 获取每日考勤数据
    let query = db('att_daily')
      .where({ company_id: companyId, year_month: yearMonth });
    
    if (userIds && userIds.length > 0) {
      query = query.whereIn('user_id', userIds);
    }
    
    const dailyRecords: AttDaily[] = await query.orderBy(['user_id', 'attendance_date']);
    
    // 获取所有相关的打卡记录
    const dailyIds = dailyRecords.map(d => d.id);
    const punchRecords: AttPunchRecord[] = dailyIds.length > 0
      ? await db('att_punch_record').whereIn('daily_id', dailyIds)
      : [];
    
    // 按 daily_id 分组打卡记录
    const punchMap = new Map<number, AttPunchRecord[]>();
    for (const punch of punchRecords) {
      const list = punchMap.get(punch.daily_id) || [];
      list.push(punch);
      punchMap.set(punch.daily_id, list);
    }
    
    // 构建 attendanceMap
    const attendanceMap: Record<string, Record<string, DailyAttendanceStatus>> = {};
    let latestSyncTime: Date | null = null;
    
    for (const daily of dailyRecords) {
      if (!attendanceMap[daily.user_id]) {
        attendanceMap[daily.user_id] = {};
      }
      
      const day = new Date(daily.attendance_date).getDate().toString();
      const punches = punchMap.get(daily.id) || [];
      
      attendanceMap[daily.user_id][day] = {
        status: daily.status,
        onDutyTime: daily.on_duty_time || undefined,
        offDutyTime: daily.off_duty_time || undefined,
        hasAbnormality: daily.has_abnormality,
        hasOnDutyApprove: daily.has_on_duty_approve,
        hasOffDutyApprove: daily.has_off_duty_approve,
        records: punches.map(p => this.punchRecordToInput(p)),
      };
      
      if (daily.sync_time && (!latestSyncTime || daily.sync_time > latestSyncTime)) {
        latestSyncTime = daily.sync_time;
      }
    }
    
    // 获取相关审批单
    const procInstIds = new Set<string>();
    for (const punch of punchRecords) {
      if (punch.proc_inst_id) procInstIds.add(punch.proc_inst_id);
    }
    for (const daily of dailyRecords) {
      if (daily.leave_proc_inst_id) procInstIds.add(daily.leave_proc_inst_id);
    }
    
    const approvals: AttApprovalRecord[] = procInstIds.size > 0
      ? await db('att_approval_record').whereIn('proc_inst_id', Array.from(procInstIds))
      : [];
    
    const processDataMap: Record<string, any> = {};
    for (const approval of approvals) {
      processDataMap[approval.proc_inst_id] = {
        title: approval.title,
        formValues: approval.form_values,
        leaveType: approval.leave_type,
        startTime: approval.start_time,
        endTime: approval.end_time,
        duration: approval.duration,
        durationUnit: approval.duration_unit,
      };
    }
    
    // 计算月份天数
    const [year, month] = yearMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    return {
      companyId,
      yearMonth,
      daysInMonth,
      attendanceMap,
      processDataMap,
      syncTime: latestSyncTime?.toISOString() || null,
    };
  }

  // 获取单个员工月度数据
  async getEmployeeMonthlyData(
    companyId: CompanyId,
    yearMonth: string,
    userId: string
  ): Promise<AttendanceMapResponse> {
    return this.getMonthlyCalendar(companyId, yearMonth, [userId]);
  }

  // 批量更新每日考勤
  async batchUpdateDaily(
    companyId: CompanyId,
    data: BatchUpdateDailyRequest,
    editorId: string,
    editorName?: string,
    clientIp?: string,
    userAgent?: string
  ): Promise<{ updated: number; editLogIds: number[] }> {
    const editLogIds: number[] = [];
    let updated = 0;

    await db.transaction(async (trx) => {
      for (const update of data.updates) {
        const result = await this.updateSingleDaily(
          trx,
          companyId,
          update,
          editorId,
          editorName,
          clientIp,
          userAgent
        );
        if (result.dailyId) {
          updated++;
          if (result.editLogId) editLogIds.push(result.editLogId);
        }
      }
    });

    return { updated, editLogIds };
  }

  // 更新单条每日考勤
  async updateDaily(
    companyId: CompanyId,
    dailyId: number,
    data: Partial<UpdateDailyRequest>,
    editorId: string,
    editorName?: string,
    clientIp?: string,
    userAgent?: string
  ): Promise<{ dailyId: number; editLogId: number | null; updatedAt: string }> {
    return await db.transaction(async (trx) => {
      // 获取现有记录
      const existing = await trx('att_daily').where({ id: dailyId, company_id: companyId }).first();
      if (!existing) {
        throw new Error('记录不存在');
      }

      const updateData: Partial<UpdateDailyRequest> = {
        userId: existing.user_id,
        date: existing.attendance_date,
        ...data,
      };

      return this.updateSingleDaily(
        trx,
        companyId,
        updateData as UpdateDailyRequest,
        editorId,
        editorName,
        clientIp,
        userAgent
      );
    });
  }

  // 内部方法：更新单条记录
  private async updateSingleDaily(
    trx: any,
    companyId: CompanyId,
    data: UpdateDailyRequest,
    editorId: string,
    editorName?: string,
    clientIp?: string,
    userAgent?: string
  ): Promise<{ dailyId: number; editLogId: number | null; updatedAt: string }> {
    const { userId, date, status, onDutyTime, offDutyTime, records, linkedProcInstId, editReason } = data;
    
    // 解析日期
    const attendanceDate = new Date(date);
    const yearMonth = `${attendanceDate.getFullYear()}-${String(attendanceDate.getMonth() + 1).padStart(2, '0')}`;
    
    // 查找或创建每日记录
    let daily = await trx('att_daily')
      .where({ company_id: companyId, user_id: userId, attendance_date: date })
      .first();
    
    const oldValue = daily ? { ...daily } : null;
    const now = new Date();
    
    if (daily) {
      // 更新现有记录
      const updateFields: any = { updated_at: now };
      if (status !== undefined) updateFields.status = status;
      if (onDutyTime !== undefined) updateFields.on_duty_time = onDutyTime;
      if (offDutyTime !== undefined) updateFields.off_duty_time = offDutyTime;
      if (linkedProcInstId !== undefined) updateFields.leave_proc_inst_id = linkedProcInstId;
      
      // 计算异常标记
      if (status) {
        updateFields.has_abnormality = status === 'abnormal' || status === 'incomplete';
      }
      
      await trx('att_daily').where({ id: daily.id }).update(updateFields);
    } else {
      // 创建新记录
      const [id] = await trx('att_daily').insert({
        company_id: companyId,
        user_id: userId,
        attendance_date: date,
        year_month: yearMonth,
        day_of_week: attendanceDate.getDay(),
        status: status || 'noRecord',
        has_abnormality: status === 'abnormal' || status === 'incomplete',
        on_duty_time: onDutyTime || null,
        off_duty_time: offDutyTime || null,
        leave_proc_inst_id: linkedProcInstId || null,
        data_source: 'manual',
        created_at: now,
        updated_at: now,
      }).returning('id');
      
      daily = { id: typeof id === 'object' ? id.id : id };
    }
    
    // 更新打卡记录
    if (records && records.length > 0) {
      // 删除旧记录
      await trx('att_punch_record').where({ daily_id: daily.id }).delete();
      
      // 插入新记录
      const punchInserts = records.map(r => ({
        daily_id: daily.id,
        company_id: companyId,
        user_id: userId,
        work_date: date,
        work_date_timestamp: r.workDate,
        check_type: r.checkType,
        source_type: r.sourceType,
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
      }));
      
      await trx('att_punch_record').insert(punchInserts);
    }
    
    // 记录编辑日志
    let editLogId: number | null = null;
    const editType: EditType = !oldValue ? 'status' : (records ? 'time' : 'status');
    
    const [logId] = await trx('att_edit_log').insert({
      company_id: companyId,
      user_id: userId,
      attendance_date: date,
      edit_type: editType,
      old_status: oldValue?.status || null,
      new_status: status || oldValue?.status || null,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: JSON.stringify(data),
      linked_proc_inst_id: linkedProcInstId || null,
      edit_reason: editReason || null,
      editor_id: editorId,
      editor_name: editorName || null,
      client_ip: clientIp || null,
      user_agent: userAgent || null,
    }).returning('id');
    
    editLogId = typeof logId === 'object' ? logId.id : logId;
    
    return {
      dailyId: daily.id,
      editLogId,
      updatedAt: now.toISOString(),
    };
  }

  // 获取月度统计
  async getMonthlyStats(
    companyId: CompanyId,
    yearMonth: string,
    sortBy?: string,
    order?: 'asc' | 'desc'
  ): Promise<MonthlyStatsResponse> {
    let query = db('att_monthly_stats')
      .where({ company_id: companyId, year_month: yearMonth });
    
    if (sortBy) {
      query = query.orderBy(sortBy, order || 'desc');
    } else {
      query = query.orderBy('user_name');
    }
    
    const stats: AttMonthlyStats[] = await query;
    
    const fullAttendanceCount = stats.filter(s => s.is_full_attendance).length;
    const latestCalcTime = stats.length > 0 
      ? stats.reduce((latest, s) => {
          if (!s.calc_time) return latest;
          return !latest || s.calc_time > latest ? s.calc_time : latest;
        }, null as Date | null)
      : null;
    
    return {
      companyId,
      yearMonth,
      totalEmployees: stats.length,
      fullAttendanceCount,
      stats,
      calcTime: latestCalcTime?.toISOString() || null,
    };
  }

  // 重新计算月度统计
  async recalculateMonthlyStats(
    companyId: CompanyId,
    yearMonth: string
  ): Promise<{ recalculated: number; calcTime: string }> {
    // 获取该月所有每日考勤数据
    const dailyRecords = await db('att_daily')
      .where({ company_id: companyId, year_month: yearMonth });
    
    // 按用户分组
    const userDailyMap = new Map<string, AttDaily[]>();
    for (const daily of dailyRecords) {
      const list = userDailyMap.get(daily.user_id) || [];
      list.push(daily);
      userDailyMap.set(daily.user_id, list);
    }
    
    const calcTime = new Date();
    let recalculated = 0;
    
    await db.transaction(async (trx) => {
      for (const [userId, dailies] of userDailyMap) {
        const stats = this.calculateUserStats(dailies);
        
        // Upsert 统计数据
        const existing = await trx('att_monthly_stats')
          .where({ company_id: companyId, user_id: userId, year_month: yearMonth })
          .first();
        
        const statsData = {
          company_id: companyId,
          user_id: userId,
          year_month: yearMonth,
          user_name: dailies[0]?.user_name || null,
          department: dailies[0]?.department || null,
          ...stats,
          calc_time: calcTime,
          updated_at: calcTime,
        };
        
        if (existing) {
          await trx('att_monthly_stats').where({ id: existing.id }).update(statsData);
        } else {
          await trx('att_monthly_stats').insert({ ...statsData, created_at: calcTime });
        }
        
        recalculated++;
      }
    });
    
    return { recalculated, calcTime: calcTime.toISOString() };
  }

  // 计算用户统计数据
  private calculateUserStats(dailies: AttDaily[]): Partial<AttMonthlyStats> {
    let lateCount = 0;
    let lateMinutes = 0;
    let missingCount = 0;
    let absenteeismCount = 0;
    let actualAttendanceDays = 0;
    let shouldAttendanceDays = 0;
    
    for (const daily of dailies) {
      if (daily.is_workday) {
        shouldAttendanceDays++;
        
        if (daily.status === 'normal' || daily.status === 'abnormal') {
          actualAttendanceDays++;
        }
        
        if (daily.is_late) {
          lateCount++;
          lateMinutes += daily.late_minutes;
        }
        
        if (daily.is_missing) missingCount++;
        if (daily.is_absenteeism) absenteeismCount++;
      }
    }
    
    const isFullAttendance = lateCount === 0 && missingCount === 0 && absenteeismCount === 0 
      && actualAttendanceDays >= shouldAttendanceDays;
    
    return {
      should_attendance_days: shouldAttendanceDays,
      actual_attendance_days: actualAttendanceDays,
      is_full_attendance: isFullAttendance,
      late_count: lateCount,
      late_minutes: lateMinutes,
      missing_count: missingCount,
      absenteeism_count: absenteeismCount,
    };
  }

  // 获取编辑日志
  async getEditLogs(
    companyId: CompanyId,
    query: EditLogQuery
  ): Promise<{ total: number; list: AttEditLog[] }> {
    const { userId, startDate, endDate, editType, editorId, page = 1, size = 20 } = query;
    
    let baseQuery = db('att_edit_log').where({ company_id: companyId });
    
    if (userId) baseQuery = baseQuery.where({ user_id: userId });
    if (editType) baseQuery = baseQuery.where({ edit_type: editType });
    if (editorId) baseQuery = baseQuery.where({ editor_id: editorId });
    if (startDate) baseQuery = baseQuery.where('attendance_date', '>=', startDate);
    if (endDate) baseQuery = baseQuery.where('attendance_date', '<=', endDate);
    
    const countResult = await baseQuery.clone().count('id as count').first();
    const total = Number(countResult?.count || 0);
    
    const list = await baseQuery
      .orderBy('edit_time', 'desc')
      .offset((page - 1) * size)
      .limit(size);
    
    return { total, list };
  }

  // 获取审批单详情
  async getApprovalDetail(procInstId: string): Promise<AttApprovalRecord | null> {
    return await db('att_approval_record').where({ proc_inst_id: procInstId }).first();
  }

  // 保存审批单缓存
  async saveApprovalRecord(
    companyId: CompanyId,
    procInstId: string,
    data: Partial<AttApprovalRecord>
  ): Promise<number> {
    const existing = await db('att_approval_record').where({ proc_inst_id: procInstId }).first();
    
    const now = new Date();
    const recordData = {
      proc_inst_id: procInstId,
      company_id: companyId,
      ...data,
      fetch_time: now,
      updated_at: now,
    };
    
    if (existing) {
      await db('att_approval_record').where({ id: existing.id }).update(recordData);
      return existing.id;
    } else {
      const [id] = await db('att_approval_record').insert({ ...recordData, created_at: now }).returning('id');
      return typeof id === 'object' ? id.id : id;
    }
  }

  // 辅助方法：打卡记录转换为输入格式
  private punchRecordToInput(punch: AttPunchRecord): PunchRecordInput {
    return {
      userId: punch.user_id,
      workDate: punch.work_date_timestamp,
      checkType: punch.check_type,
      sourceType: punch.source_type,
      timeResult: punch.time_result,
      locationResult: punch.location_result,
      userCheckTime: punch.user_check_time,
      baseCheckTime: punch.base_check_time,
      procInstId: punch.proc_inst_id || undefined,
      groupId: punch.group_id || undefined,
      planId: punch.plan_id || undefined,
      approveId: punch.approve_id || undefined,
      corpId: punch.corp_id || undefined,
      sourceType_Desc: punch.source_type_desc || undefined,
      checkType_Desc: punch.check_type_desc || undefined,
      timeResult_Desc: punch.time_result_desc || undefined,
    };
  }

  // 辅助方法：时间戳转时间字符串
  private timestampToTime(timestamp: number): string | null {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  }
}

export const attendanceService = new AttendanceService();
