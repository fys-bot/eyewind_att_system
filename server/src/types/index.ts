// 公司ID类型
export type CompanyId = 'eyewind' | 'hydodo';

// 新的数据库配置结构（简化版，使用JSONB存储完整规则）
export interface AttendanceRuleConfig {
  id: number;
  company_id: CompanyId;
  config_name: string;
  rules: any; // JSONB 字段，存储完整的 AttendanceRuleConfig（前端格式）
  version: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  change_reason: string | null;
}

// 变更历史
export interface AttendanceRuleHistory {
  id: number;
  config_id: number;
  company_id: CompanyId;
  change_type: 'create' | 'update' | 'rollback';
  snapshot: any; // JSONB 字段，存储配置快照
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

// ===== 以下是旧的类型定义，保留用于兼容性 =====

// 规则类型
export type RuleType = 'late' | 'penalty' | 'full_attend' | 'leave_display' | 'cross_day';

// 日期类型
export type DateType = 'swap' | 'remote';

// 规则明细（旧结构，已废弃）
export interface AttRuleDetail {
  id?: number;
  config_id?: number;
  rule_type?: RuleType;
  rule_key?: string | null;
  rule_name?: string | null;
  enabled?: boolean;
  sort_order?: number;
  description?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  amount?: number | null;
  threshold_hours?: number | null;
  unit?: 'count' | 'hours' | null;
  label_short?: string | null;
  label_long?: string | null;
  // 🔥 新增：统一跨天规则的额外字段
  apply_to?: 'day' | 'week' | 'month' | 'all' | null;
  week_days?: ('friday' | 'saturday' | 'sunday')[] | null;
  created_at?: Date;
}

// 特殊日期（旧结构，已废弃）
export interface AttRuleSpecialDate {
  id?: number;
  config_id?: number;
  date_type?: DateType;
  target_date?: string;
  reason?: string | null;
  swap_type?: 'workday' | 'holiday' | null;
  time_mode?: 'day' | 'hour';
  start_time?: string | null;
  end_time?: string | null;
  duration_hours?: number | null;
  scope?: 'all' | 'department' | 'individual';
  scope_ids?: string[] | null;
  created_at?: Date;
  created_by?: string | null;
}

// 完整配置（用于API响应，兼容旧接口）
export interface FullAttendanceRuleConfig {
  id?: number;
  company_id?: CompanyId;
  config_name?: string;
  rules?: any; // 完整的前端格式规则
  version?: number;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
  created_by?: string | null;
  updated_by?: string | null;
  
  // 以下字段用于兼容旧的API格式
  lateRules?: AttRuleDetail[];
  penaltyRules?: AttRuleDetail[];
  fullAttendRules?: AttRuleDetail[];
  leaveDisplayRules?: AttRuleDetail[];
  crossDayRules?: AttRuleDetail[];
  // 🔥 跨周和跨月规则
  crossWeekRules?: AttRuleDetail[];
  crossMonthRules?: AttRuleDetail[];
  swapDates?: AttRuleSpecialDate[];
  remoteDates?: AttRuleSpecialDate[];
  
  // 兼容旧的字段名
  work_start_time?: string;
  work_end_time?: string;
  lunch_start_time?: string;
  lunch_end_time?: string;
  late_exemption_enabled?: boolean;
  late_exemption_count?: number;
  late_exemption_minutes?: number;
  perf_penalty_enabled?: boolean;
  perf_penalty_mode?: 'unlimited' | 'capped';
  unlimited_threshold_time?: string;
  unlimited_calc_type?: 'perMinute' | 'fixed';
  unlimited_per_minute?: number;
  unlimited_fixed_amount?: number;
  capped_penalty_type?: 'ladder' | 'fixedCap';
  capped_per_minute?: number;
  max_perf_penalty?: number;
  full_attend_enabled?: boolean;
  full_attend_bonus?: number;
  full_attend_allow_adj?: boolean;
  attend_days_enabled?: boolean;
  should_attend_calc?: 'workdays' | 'fixed' | 'custom';
  fixed_should_attendance_days?: number | null;
  exclude_holidays?: boolean;
  count_late_as_attend?: boolean;
  count_missing_as_attend?: boolean;
  count_half_leave_as_half?: boolean;
  min_hours_for_full_day?: number;
  workday_swap_enabled?: boolean;
  auto_follow_national?: boolean;
  remote_work_enabled?: boolean;
  remote_require_approval?: boolean;
  remote_count_as_attend?: boolean;
  remote_max_days_month?: number | null;
  remote_allowed_weekdays?: number[] | null;
  overtime_checkpoints?: string[];
  weekend_overtime_threshold?: number;
  cross_day_enabled?: boolean;
  cross_day_max_checkout?: string;
  cross_day_next_checkin?: string;
  // 🔥 跨周和跨月打卡规则
  cross_week_enabled?: boolean;
  cross_month_enabled?: boolean;
}
