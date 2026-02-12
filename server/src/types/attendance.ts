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

// --- Attendance Rules ---
export interface LateRule {
  previousDayCheckoutTime: string; // "18:00" or "20:30" or "24:00"
  lateThresholdTime: string; // "09:01" or "13:31" (absolute time when late starts)
  description: string; // "前一天18:00打卡，9:01算迟到" (auto-generated from above fields)
}

export interface LeaveDisplayRule {
  leaveType: string; // "病假"
  shortTermHours: number; // 24
  shortTermLabel: string; // "病假<=24小时"
  longTermLabel: string; // "病假>24小时"
}

export interface PerformancePenaltyRule {
  minMinutes: number; // 0 (包含)
  maxMinutes: number; // 5 (不包含，即 [0, 5))
  penalty: number; // 50 (扣款金额)
  description: string; // "0-5分钟扣50元"
}

export interface FullAttendanceRule {
  type: 'trip' | 'compTime' | 'late' | 'missing' | 'absenteeism' | 'annual' | 'sick' | 'personal' | 'bereavement' | 'paternity' | 'maternity' | 'parental' | 'marriage'; // 考勤类型
  displayName: string; // "迟到"、"缺卡"、"病假"等显示名称
  enabled: boolean; // 是否启用此规则（true表示此类型会影响全勤）
  threshold: number; // 阈值（次数或小时数，0表示任何情况都影响全勤）
  unit: 'count' | 'hours'; // 单位：次数或小时数
}

export interface AttendanceRuleConfig {
  // 基础作息时间
  workStartTime: string; // "09:00"
  workEndTime: string;   // "18:30"
  lunchStartTime: string; // "12:00"
  lunchEndTime: string;   // "13:30"
  
  // 迟到规则
  lateRules: LateRule[]; // 支持多种迟到判定规则
  lateExemptionCount: number; // 3 (月度豁免次数)
  lateExemptionMinutes: number; // 15 (单次豁免时长)
  lateExemptionEnabled: boolean; // true (是否启用豁免功能)
  
  // 绩效扣款规则
  performancePenaltyMode: 'unlimited' | 'capped'; // unlimited=上不封顶模式, capped=封顶模式
  // 上不封顶模式配置
  unlimitedPenaltyThresholdTime?: string; // 超过此时间开始扣款，如 "09:01"
  unlimitedPenaltyCalcType?: 'perMinute' | 'fixed'; // perMinute=按分钟计算, fixed=固定扣款
  unlimitedPenaltyPerMinute?: number; // 按分钟计算：每分钟扣款金额
  unlimitedPenaltyFixedAmount?: number; // 固定扣款：一次性扣款金额
  // 封顶模式配置
  cappedPenaltyType?: 'ladder' | 'fixedCap'; // ladder=阶梯扣款, fixedCap=固定封顶（按分钟计算但设上限）
  cappedPenaltyPerMinute?: number; // 固定封顶模式：每分钟扣款金额
  maxPerformancePenalty: number; // 250 (绩效扣款封顶金额)
  performancePenaltyRules: PerformancePenaltyRule[]; // 阶梯扣款规则（仅capped+ladder模式使用）
  performancePenaltyEnabled: boolean; // true (是否启用绩效考核功能，关闭后隐藏"考勤绩效"列)
  
  // 请假规则
  leaveDisplayRules: LeaveDisplayRule[]; // 特殊展示规则
  
  // 全勤规则
  fullAttendanceBonus: number; // 200 (全勤奖金额)
  fullAttendanceAllowAdjustment: boolean; // true (调休是否算全勤)
  fullAttendanceRules: FullAttendanceRule[]; // 灵活的全勤判定规则
  fullAttendanceEnabled: boolean; // true (是否启用全勤功能，关闭后隐藏"是否全勤"列)
  
  // 出勤天数规则
  attendanceDaysRules: {
    enabled: boolean; // 是否启用出勤天数统计
    
    // 应出勤天数计算规则
    shouldAttendanceCalcMethod: 'workdays' | 'fixed' | 'custom'; // 工作日自动计算 | 固定天数 | 自定义
    fixedShouldAttendanceDays?: number; // 固定应出勤天数（当 calcMethod 为 fixed 时使用）
    includeHolidaysInShould: boolean; // 应出勤天数是否包含法定节假日（默认true）
    
    // 正常出勤天数计算规则
    actualAttendanceRules: {
      countLateAsAttendance: boolean; // 迟到是否算出勤
      countMissingAsAttendance: boolean; // 缺卡是否算出勤
      countHalfDayLeaveAsHalf: boolean; // 半天假是否算0.5天出勤
      minWorkHoursForFullDay: number; // 满足多少小时算一天出勤（默认4小时）
      // 以下类型算正常出勤
      countHolidayAsAttendance: boolean; // 法定节假日算出勤（默认true）
      countCompTimeAsAttendance: boolean; // 调休算出勤（默认true）
      countPaidLeaveAsAttendance: boolean; // 带薪福利假算出勤（年假、婚假、产假等，默认true）
      countTripAsAttendance: boolean; // 出差算出勤（默认true）
      countOutAsAttendance: boolean; // 外出算出勤（默认true）
      // 以下类型不算正常出勤
      countSickLeaveAsAttendance: boolean; // 病假是否算出勤（默认false）
      countPersonalLeaveAsAttendance: boolean; // 事假是否算出勤（默认false）
    };
  };
  
  // 法定调班规则
  workdaySwapRules: {
    enabled: boolean; // 是否启用法定调班
    autoFollowNationalHoliday: boolean; // 是否自动跟随国家法定调休安排
    // 自定义日期调整（覆盖默认规则）
    customDays: Array<{
      date: string; // 日期，如 "2024-02-04"
      type: 'workday' | 'holiday'; // workday=需要上班, holiday=不需要上班
      reason: string; // 原因，如 "春节调休补班" 或 "公司周年庆放假"
    }>;
  };
  
  // 居家办公规则
  remoteWorkRules: {
    enabled: boolean; // 是否启用居家办公
    requireApproval: boolean; // 是否需要审批
    countAsNormalAttendance: boolean; // 是否算正常出勤
    maxDaysPerMonth?: number; // 每月最多居家办公天数（可选）
    allowedDaysOfWeek: number[]; // 允许居家办公的星期几 (0=周日, 1=周一, ..., 6=周六)
    remoteDays: Array<{
      date: string; // 居家办公日期
      reason: string; // 原因，如 "全员居家办公"、"恶劣天气"
      timeMode: 'day' | 'hour'; // 时间模式：day=按天(整天), hour=按小时(指定时段)
      startTime?: string; // 开始时间（timeMode=hour时必填），如 "09:00"
      endTime?: string; // 结束时间（timeMode=hour时必填），如 "12:00"
      scope: 'all' | 'department' | 'individual'; // 范围：全员/部门/个人
      departmentIds?: string[]; // 部门ID列表（当 scope 为 department 时）
      userIds?: string[]; // 员工ID列表（当 scope 为 individual 时）
    }>;
  };
  
  // 加班规则
  overtimeCheckpoints: string[]; // ["19:30", "20:30", "22:00", "24:00"]
  weekendOvertimeThreshold: number; // 8 (周末加班影响周一的时长阈值)
  
  // 跨天打卡规则
  crossDayCheckout: {
    enabled: boolean; // true
    rules: Array<{
      checkoutTime: string; // "20:30" (前一天打卡时间)
      nextDayCheckinTime: string; // "09:30" (次日最晚打卡时间)
      description: string; // "晚上8点半打卡，第二天可以早上9点半打卡"
    }>;
    // 保持向后兼容的字段
    maxCheckoutTime: string; // "24:00" (最晚打卡时间)
    nextDayCheckinTime: string; // "13:30" (次日最晚打卡时间)
  };
}
