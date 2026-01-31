// 公司ID类型
export type CompanyId = 'eyewind' | 'hydodo';

// 规则类型
export type RuleType = 'late' | 'penalty' | 'full_attend' | 'leave_display' | 'cross_day';

// 日期类型
export type DateType = 'swap' | 'remote';

// 主配置
export interface AttRuleConfig {
  id: number;
  company_id: CompanyId;
  config_name: string;
  
  // 作息时间
  work_start_time: string;
  work_end_time: string;
  lunch_start_time: string;
  lunch_end_time: string;
  
  // 豁免配置
  late_exemption_enabled: boolean;
  late_exemption_count: number;
  late_exemption_minutes: number;
  
  // 绩效扣款配置
  perf_penalty_enabled: boolean;
  perf_penalty_mode: 'unlimited' | 'capped';
  unlimited_threshold_time: string;
  unlimited_calc_type: 'perMinute' | 'fixed';
  unlimited_per_minute: number;
  unlimited_fixed_amount: number;
  capped_penalty_type: 'ladder' | 'fixedCap';
  capped_per_minute: number;
  max_perf_penalty: number;
  
  // 全勤配置
  full_attend_enabled: boolean;
  full_attend_bonus: number;
  full_attend_allow_adj: boolean;
  
  // 出勤天数配置
  attend_days_enabled: boolean;
  should_attend_calc: 'workdays' | 'fixed' | 'custom';
  fixed_should_days: number | null;
  exclude_holidays: boolean;
  exclude_weekends: boolean;
  count_late_as_attend: boolean;
  count_missing_as_attend: boolean;
  count_half_leave_as_half: boolean;
  min_hours_for_full_day: number;
  
  // 调班配置
  workday_swap_enabled: boolean;
  auto_follow_national: boolean;
  
  // 居家办公配置
  remote_work_enabled: boolean;
  remote_require_approval: boolean;
  remote_count_as_attend: boolean;
  remote_max_days_month: number | null;
  remote_max_hours_month: number | null;
  remote_allowed_weekdays: number[] | null;
  remote_default_time_mode: 'day' | 'hour';
  
  // 加班配置
  overtime_checkpoints: string[];
  weekend_overtime_threshold: number;
  
  // 跨天打卡配置
  cross_day_enabled: boolean;
  cross_day_max_checkout: string;
  cross_day_next_checkin: string;
  
  // 元数据
  version: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

// 规则明细
export interface AttRuleDetail {
  id: number;
  config_id: number;
  rule_type: RuleType;
  rule_key: string | null;
  rule_name: string | null;
  enabled: boolean;
  sort_order: number;
  description: string | null;
  time_start: string | null;
  time_end: string | null;
  min_value: number | null;
  max_value: number | null;
  amount: number | null;
  threshold_hours: number | null;
  unit: 'count' | 'hours' | null;
  label_short: string | null;
  label_long: string | null;
  created_at: Date;
}

// 特殊日期
export interface AttRuleSpecialDate {
  id: number;
  config_id: number;
  date_type: DateType;
  target_date: string;
  reason: string | null;
  swap_type: 'workday' | 'holiday' | null;
  time_mode: 'day' | 'hour';
  start_time: string | null;
  end_time: string | null;
  duration_hours: number | null;
  scope: 'all' | 'department' | 'individual';
  scope_ids: string[] | null;
  created_at: Date;
  created_by: string | null;
}

// 变更历史
export interface AttRuleChangeLog {
  id: number;
  config_id: number;
  change_type: 'create' | 'update' | 'delete' | 'rollback';
  change_field: string | null;
  old_value: string | null;
  new_value: string | null;
  snapshot: object | null;
  change_reason: string | null;
  changed_at: Date;
  changed_by: string;
}

// API 响应格式
export interface ApiResponse<T = any> {
  code: number;
  message?: string;
  data?: T;
}

// 完整配置（包含子规则）
export interface FullAttendanceRuleConfig extends AttRuleConfig {
  lateRules: AttRuleDetail[];
  penaltyRules: AttRuleDetail[];
  fullAttendRules: AttRuleDetail[];
  leaveDisplayRules: AttRuleDetail[];
  crossDayRules: AttRuleDetail[];
  swapDates: AttRuleSpecialDate[];
  remoteDates: AttRuleSpecialDate[];
}
