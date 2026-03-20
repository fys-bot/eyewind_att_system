/**
 * 考勤日历 API 服务
 * 与后端 server/src/routes/attendance.ts 对接
 */

// @ts-ignore
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';

// 公司ID类型
export type CompanyId = 'eyewind' | 'hydodo';

// API 响应类型
interface ApiResponse<T = any> {
  code: number;
  message?: string;
  data?: T;
}

// 考勤状态
export type AttendanceStatus = 'normal' | 'abnormal' | 'incomplete' | 'noRecord';

// 打卡类型
export type CheckType = 'OnDuty' | 'OffDuty';

// 时间结果
export type TimeResult = 'Normal' | 'Late' | 'Early' | 'NotSigned' | 'SeriousLate' | 'Absenteeism';

// 编辑类型
export type EditType = 'status' | 'time' | 'leave' | 'clear' | 'batch';

// 每日考勤状态
export interface DailyAttendanceStatus {
  status: AttendanceStatus;
  records: PunchRecordInput[];
  onDutyTime?: string;
  offDutyTime?: string;
  hasAbnormality: boolean;
  hasOffDutyApprove: boolean;
  hasOnDutyApprove: boolean;
}

// 打卡记录输入
export interface PunchRecordInput {
  userId: string;
  workDate: number;
  checkType: CheckType;
  sourceType: string;
  timeResult: TimeResult;
  locationResult: string;
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

// 月度日历响应
export interface AttendanceMapResponse {
  companyId: CompanyId;
  yearMonth: string;
  daysInMonth: number;
  attendanceMap: Record<string, Record<string, DailyAttendanceStatus>>;
  processDataMap: Record<string, any>;
  syncTime: string | null;
}

// 月度统计响应
export interface MonthlyStatsResponse {
  companyId: CompanyId;
  yearMonth: string;
  totalEmployees: number;
  fullAttendanceCount: number;
  stats: any[];
  calcTime: string | null;
}

// 更新请求
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
  edit_time: string;
  client_ip: string | null;
  user_agent: string | null;
}

// 编辑日志查询参数
export interface EditLogQuery {
  userId?: string;
  startDate?: string;
  endDate?: string;
  editType?: EditType;
  editorId?: string;
  page?: number;
  size?: number;
}

class AttendanceApiService {
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

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * 获取月度考勤日历数据
   */
  async getMonthlyCalendar(
    companyId: CompanyId,
    yearMonth: string,
    userIds?: string[]
  ): Promise<AttendanceMapResponse> {
    let endpoint = `/api/v1/attendance/calendar/${companyId}/${yearMonth}`;
    if (userIds && userIds.length > 0) {
      endpoint += `?userIds=${userIds.join(',')}`;
    }
    const response = await this.request<AttendanceMapResponse>(endpoint);
    return response.data!;
  }

  /**
   * 获取单个员工月度数据
   */
  async getEmployeeMonthlyData(
    companyId: CompanyId,
    yearMonth: string,
    userId: string
  ): Promise<AttendanceMapResponse> {
    const response = await this.request<AttendanceMapResponse>(
      `/api/v1/attendance/calendar/${companyId}/${yearMonth}/${userId}`
    );
    return response.data!;
  }

  /**
   * 批量更新每日考勤
   */
  async batchUpdateDaily(
    companyId: CompanyId,
    updates: UpdateDailyRequest[]
  ): Promise<{ updated: number; editLogIds: number[] }> {
    const response = await this.request<{ updated: number; editLogIds: number[] }>(
      `/api/v1/attendance/daily/${companyId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      }
    );
    return response.data!;
  }

  /**
   * 更新单条每日考勤
   */
  async updateDaily(
    dailyId: number,
    companyId: CompanyId,
    data: Partial<UpdateDailyRequest>
  ): Promise<{ dailyId: number; editLogId: number | null; updatedAt: string }> {
    const response = await this.request<{ dailyId: number; editLogId: number | null; updatedAt: string }>(
      `/api/v1/attendance/daily/${dailyId}?companyId=${companyId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
    return response.data!;
  }

  /**
   * 触发数据同步
   */
  async triggerSync(
    companyId: CompanyId,
    yearMonth: string,
    options?: { syncType?: 'full' | 'incremental'; userIds?: string[]; forceRefresh?: boolean }
  ): Promise<{ taskId: string; status: string; message?: string }> {
    const response = await this.request<{ taskId: string; status: string; message?: string }>(
      `/api/v1/attendance/sync/${companyId}/${yearMonth}`,
      {
        method: 'POST',
        body: JSON.stringify(options || {}),
      }
    );
    return response.data!;
  }

  /**
   * 获取月度统计
   */
  async getMonthlyStats(
    companyId: CompanyId,
    yearMonth: string,
    sortBy?: string,
    order?: 'asc' | 'desc'
  ): Promise<MonthlyStatsResponse> {
    let endpoint = `/api/v1/attendance/stats/${companyId}/${yearMonth}`;
    const params = new URLSearchParams();
    if (sortBy) params.append('sortBy', sortBy);
    if (order) params.append('order', order);
    if (params.toString()) endpoint += `?${params.toString()}`;
    
    const response = await this.request<MonthlyStatsResponse>(endpoint);
    return response.data!;
  }

  /**
   * 重新计算月度统计
   */
  async recalculateStats(
    companyId: CompanyId,
    yearMonth: string
  ): Promise<{ recalculated: number; calcTime: string }> {
    const response = await this.request<{ recalculated: number; calcTime: string }>(
      `/api/v1/attendance/stats/recalc/${companyId}/${yearMonth}`,
      { method: 'POST' }
    );
    return response.data!;
  }

  /**
   * 获取编辑日志
   */
  async getEditLogs(
    companyId: CompanyId,
    query?: EditLogQuery
  ): Promise<{ total: number; list: AttEditLog[] }> {
    let endpoint = `/api/v1/attendance/edit-logs/${companyId}`;
    if (query) {
      const params = new URLSearchParams();
      if (query.userId) params.append('userId', query.userId);
      if (query.startDate) params.append('startDate', query.startDate);
      if (query.endDate) params.append('endDate', query.endDate);
      if (query.editType) params.append('editType', query.editType);
      if (query.editorId) params.append('editorId', query.editorId);
      if (query.page) params.append('page', query.page.toString());
      if (query.size) params.append('size', query.size.toString());
      if (params.toString()) endpoint += `?${params.toString()}`;
    }
    
    const response = await this.request<{ total: number; list: AttEditLog[] }>(endpoint);
    return response.data!;
  }

  /**
   * 获取审批单详情
   */
  async getApprovalDetail(procInstId: string): Promise<any> {
    const response = await this.request<any>(`/api/v1/attendance/approval/${procInstId}`);
    return response.data;
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

export const attendanceApiService = new AttendanceApiService();
export default attendanceApiService;
