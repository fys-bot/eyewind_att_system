/**
 * 考勤规则 API 服务
 * 与后端 server/src/routes/rules.ts 对接
 */

// @ts-ignore
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000';

// 公司ID类型
export type CompanyId = 'eyewind' | 'hydodo';

// API 响应类型
interface ApiResponse<T = any> {
  code: number;
  message?: string;
  data?: T;
}

// 规则明细类型
export interface AttRuleDetail {
  id?: number;
  config_id?: number;
  rule_type: string;
  rule_key?: string;
  rule_name?: string;
  enabled: boolean;
  sort_order?: number;
  description?: string;
  time_start?: string;
  time_end?: string;
  min_value?: number;
  max_value?: number;
  amount?: number;
  threshold_hours?: number;
  unit?: 'count' | 'hours';
  label_short?: string;
  label_long?: string;
}

// 特殊日期类型
export interface AttRuleSpecialDate {
  id?: number;
  config_id?: number;
  date_type: 'swap' | 'remote';
  target_date: string;
  reason?: string;
  swap_type?: 'workday' | 'holiday';
  time_mode?: 'day' | 'hour';
  start_time?: string;
  end_time?: string;
  duration_hours?: number;
  scope?: 'all' | 'department' | 'individual';
  scope_ids?: string[];
}

// 完整规则配置类型
export interface FullAttendanceRuleConfig {
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
  include_holidays_in_should: boolean; // 应出勤天数是否包含法定节假日
  count_late_as_attend: boolean;
  count_missing_as_attend: boolean;
  count_half_leave_as_half: boolean;
  min_hours_for_full_day: number;
  // 正常出勤天数计算规则 - 以下类型算正常出勤
  count_holiday_as_attend: boolean; // 法定节假日算出勤
  count_comp_time_as_attend: boolean; // 调休算出勤
  count_paid_leave_as_attend: boolean; // 带薪福利假算出勤
  count_trip_as_attend: boolean; // 出差算出勤
  count_out_as_attend: boolean; // 外出算出勤
  // 正常出勤天数计算规则 - 以下类型不算正常出勤
  count_sick_as_attend: boolean; // 病假是否算出勤
  count_personal_as_attend: boolean; // 事假是否算出勤
  
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
  
  // 子规则
  lateRules: AttRuleDetail[];
  penaltyRules: AttRuleDetail[];
  fullAttendRules: AttRuleDetail[];
  leaveDisplayRules: AttRuleDetail[];
  crossDayRules: AttRuleDetail[];
  swapDates: AttRuleSpecialDate[];
  remoteDates: AttRuleSpecialDate[];
}

// 缓存
let ruleCache: Map<CompanyId, { data: FullAttendanceRuleConfig; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

class AttendanceRuleApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    // 添加用户信息到请求头
    const currentUser = localStorage.getItem('currentUser');
    if (currentUser) {
      try {
        const user = JSON.parse(currentUser);
        headers['x-user-id'] = user.id || 'anonymous';
        headers['x-user-name'] = user.name || '';
      } catch (e) {
        // ignore
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }

    return data;
  }

  /**
   * 获取公司完整配置
   */
  async getFullConfig(companyId: CompanyId, forceRefresh = false): Promise<FullAttendanceRuleConfig | null> {
    // 检查缓存
    if (!forceRefresh) {
      const cached = ruleCache.get(companyId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }
    }

    try {
      const response = await this.request<FullAttendanceRuleConfig>(
        `/api/v1/attendance/rules/${companyId}`
      );
      
      if (response.code === 0 && response.data) {
        // 更新缓存
        ruleCache.set(companyId, { data: response.data, timestamp: Date.now() });
        return response.data;
      }
      return null;
    } catch (error) {
      console.error(`[AttendanceRuleApiService] 获取配置失败:`, error);
      return null;
    }
  }

  /**
   * 更新完整配置
   */
  async updateFullConfig(
    companyId: CompanyId,
    data: Partial<FullAttendanceRuleConfig> & { changeReason?: string }
  ): Promise<{ id: number; version: number } | null> {
    try {
      const response = await this.request<{ id: number; version: number }>(
        `/api/v1/attendance/rules/${companyId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        }
      );
      
      if (response.code === 0 && response.data) {
        // 清除缓存
        ruleCache.delete(companyId);
        return response.data;
      }
      return null;
    } catch (error) {
      console.error(`[AttendanceRuleApiService] 更新配置失败:`, error);
      throw error;
    }
  }

  /**
   * 获取变更历史
   */
  async getChangeHistory(
    companyId: CompanyId,
    page = 1,
    size = 20
  ): Promise<{ total: number; list: any[] }> {
    try {
      const response = await this.request<{ total: number; list: any[] }>(
        `/api/v1/attendance/rules/${companyId}/history?page=${page}&size=${size}`
      );
      return response.data || { total: 0, list: [] };
    } catch (error) {
      console.error(`[AttendanceRuleApiService] 获取变更历史失败:`, error);
      return { total: 0, list: [] };
    }
  }

  /**
   * 回滚到指定版本
   */
  async rollback(
    companyId: CompanyId,
    historyId: number,
    reason: string
  ): Promise<{ version: number } | null> {
    try {
      const response = await this.request<{ version: number }>(
        `/api/v1/attendance/rules/${companyId}/rollback`,
        {
          method: 'POST',
          body: JSON.stringify({ historyId, reason }),
        }
      );
      
      if (response.code === 0 && response.data) {
        // 清除缓存
        ruleCache.delete(companyId);
        return response.data;
      }
      return null;
    } catch (error) {
      console.error(`[AttendanceRuleApiService] 回滚失败:`, error);
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(companyId?: CompanyId): void {
    if (companyId) {
      ruleCache.delete(companyId);
    } else {
      ruleCache.clear();
    }
  }

  /**
   * 检查服务器是否可用
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const attendanceRuleApiService = new AttendanceRuleApiService();
export default attendanceRuleApiService;
