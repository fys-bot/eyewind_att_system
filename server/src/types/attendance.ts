import type { CompanyId } from './index';

// 考勤状态
export type AttendanceStatus = 'normal' | 'abnormal' | 'incomplete' | 'noRecord';

// 打卡类型
export type CheckType = 'OnDuty' | 'OffDuty';

// 时间结果
export type TimeResult = 'Normal' | 'Late' | 'Early' | 'NotSigned' | 'SeriousLate' | 'Absenteeism';

// 位置结果
export type LocationResult = 'Normal' | 'Outside' | 'NotSigned';

// 数据来源
export type DataSource = 'dingtalk' | 'manual' | 'import';

// 编辑类型
export type EditType = 'status' | 'time' | 'leave' | 'clear' | 'batch';

// 每日考勤记录
export interface AttDaily {
  id: number;
  company_id: CompanyId;
  user_id: string;
  user_name: string | null;
  department: string | null;
  attendance_date: string;
  year_month: string;
  day_of_week: number | null;
  is_workday: boolean;
  is_holiday: boolean;
  holiday_name: string | null;
  status: AttendanceStatus;
  has_abnormality: boolean;
  has_on_duty_approve: boolean;
  has_off_duty_approve: boolean;
  on_duty_time: string | null;
  off_duty_time: string | null;
  on_duty_timestamp: number | null;
  off_duty_timestamp: number | null;
  late_minutes: number;
  is_late: boolean;
  is_missing: boolean;
  is_absenteeism: boolean;
  leave_type: string | null;
  leave_hours: number;
  leave_proc_inst_id: string | null;
  overtime_minutes: number;
  overtime_checkpoint: string | null;
  data_source: DataSource;
  sync_time: Date | null;
  created_at: Date;
  updated_at: Date;
}

// 打卡记录
export interface AttPunchRecord {
  id: number;
  daily_id: number;
  company_id: CompanyId;
  user_id: string;
  work_date: string;
  work_date_timestamp: number;
  check_type: CheckType;
  source_type: string;
  user_check_time: number;
  base_check_time: number;
  check_time: string | null;
  time_result: TimeResult;
  location_result: LocationResult;
  proc_inst_id: string | null;
  group_id: string | null;
  plan_id: string | null;
  approve_id: string | null;
  corp_id: string | null;
  source_type_desc: string | null;
  check_type_desc: string | null;
  time_result_desc: string | null;
  created_at: Date;
}

// 月度统计
export interface AttMonthlyStats {
  id: number;
  company_id: CompanyId;
  user_id: string;
  user_name: string | null;
  department: string | null;
  year_month: string;
  should_attendance_days: number;
  actual_attendance_days: number;
  is_full_attendance: boolean;
  late_count: number;
  late_minutes: number;
  exempted_late_count: number;
  exempted_late_minutes: number;
  missing_count: number;
  absenteeism_count: number;
  performance_penalty: number;
  full_attendance_bonus: number;
  // 请假次数
  annual_count: number;
  sick_count: number;
  serious_sick_count: number;
  personal_count: number;
  trip_count: number;
  comp_time_count: number;
  bereavement_count: number;
  paternity_count: number;
  maternity_count: number;
  parental_count: number;
  marriage_count: number;
  // 请假小时数
  annual_hours: number;
  sick_hours: number;
  serious_sick_hours: number;
  personal_hours: number;
  trip_hours: number;
  comp_time_hours: number;
  bereavement_hours: number;
  paternity_hours: number;
  maternity_hours: number;
  parental_hours: number;
  marriage_hours: number;
  // 加班统计
  overtime_total_minutes: number;
  overtime_19_5_minutes: number;
  overtime_20_5_minutes: number;
  overtime_22_minutes: number;
  overtime_24_minutes: number;
  overtime_19_5_count: number;
  overtime_20_5_count: number;
  overtime_22_count: number;
  overtime_24_count: number;
  remarks: string | null;
  calc_time: Date | null;
  created_at: Date;
  updated_at: Date;
}

// 审批单缓存
export interface AttApprovalRecord {
  id: number;
  proc_inst_id: string;
  company_id: CompanyId;
  title: string | null;
  biz_type: string | null;
  status: string | null;
  applicant_user_id: string | null;
  applicant_name: string | null;
  form_values: Record<string, any> | null;
  leave_type: string | null;
  start_time: Date | null;
  end_time: Date | null;
  duration: number | null;
  duration_unit: string | null;
  reason: string | null;
  fetch_time: Date | null;
  raw_data: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

// 编辑日志
export interface AttEditLog {
  id: number;
  company_id: CompanyId;
  user_id: string;
  user_name: string | null;
  attendance_date: string;
  edit_type: EditType;
  old_status: string | null;
  new_status: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  linked_proc_inst_id: string | null;
  edit_reason: string | null;
  editor_id: string;
  editor_name: string | null;
  edit_time: Date;
  client_ip: string | null;
  user_agent: string | null;
}

// API 请求/响应类型
export interface DailyAttendanceStatus {
  status: AttendanceStatus;
  records: PunchRecordInput[];
  onDutyTime?: string;
  offDutyTime?: string;
  hasAbnormality: boolean;
  hasOffDutyApprove: boolean;
  hasOnDutyApprove: boolean;
}

export interface PunchRecordInput {
  userId: string;
  workDate: number;
  checkType: CheckType;
  sourceType: string;
  timeResult: TimeResult;
  locationResult: LocationResult;
  userCheckTime: number;
  baseCheckTime: number;
  procInstId?: string;
  groupId?: string;
  planId?: string;
  approveId?: string;
  corpId?: string;
  sourceType_Desc?: string;
  checkType_Desc?: string;
  timeResult_Desc?: string;
}

export interface AttendanceMapResponse {
  companyId: CompanyId;
  yearMonth: string;
  daysInMonth: number;
  attendanceMap: Record<string, Record<string, DailyAttendanceStatus>>;
  processDataMap: Record<string, any>;
  syncTime: string | null;
}

export interface MonthlyStatsResponse {
  companyId: CompanyId;
  yearMonth: string;
  totalEmployees: number;
  fullAttendanceCount: number;
  stats: AttMonthlyStats[];
  calcTime: string | null;
}

export interface UpdateDailyRequest {
  userId: string;
  date: string;
  status?: AttendanceStatus;
  onDutyTime?: string;
  offDutyTime?: string;
  records?: PunchRecordInput[];
  linkedProcInstId?: string;
  editReason?: string;
}

export interface BatchUpdateDailyRequest {
  updates: UpdateDailyRequest[];
}

export interface SyncRequest {
  syncType: 'full' | 'incremental';
  userIds?: string[];
  forceRefresh?: boolean;
}

export interface SyncTaskResponse {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalUsers: number;
  processedUsers: number;
  estimatedTime?: number;
  error?: string;
}

export interface EditLogQuery {
  userId?: string;
  startDate?: string;
  endDate?: string;
  editType?: EditType;
  editorId?: string;
  page?: number;
  size?: number;
}
