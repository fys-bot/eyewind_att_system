/**
 * 数据同步 API 服务
 * 负责与后端 /api/v1/sync 路由对接
 * 实现：员工同步、打卡数据入库、月度统计回写、月度快照管理
 */

// @ts-ignore
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';

type CompanyId = 'eyewind' | 'hydodo';

interface ApiResponse<T = any> {
  code: number;
  message?: string;
  data?: T;
}

class DataSyncApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    const json: ApiResponse<T> = await response.json();
    if (!response.ok || json.code !== 0) {
      throw new Error(json.message || `HTTP error ${response.status}`);
    }
    return json.data as T;
  }

  // ============================================================
  // 员工同步
  // ============================================================

  /** 同步员工数据到数据库 */
  async syncEmployees(companyId: CompanyId, employees: any[]): Promise<{ upserted: number; resigned: number }> {
    return this.request(`/api/v1/sync/employees/${companyId}`, {
      method: 'POST',
      body: JSON.stringify({ employees }),
    });
  }

  /** 从数据库获取员工列表 */
  async getEmployees(companyId: CompanyId, includeResigned = false): Promise<{ employees: any[]; total: number }> {
    const params = includeResigned ? '?includeResigned=true' : '';
    return this.request(`/api/v1/sync/employees/${companyId}${params}`);
  }

  /** 获取某月参与考勤的员工 */
  async getMonthlyEmployees(companyId: CompanyId, yearMonth: string): Promise<{ employees: any[]; total: number }> {
    return this.request(`/api/v1/sync/employees/${companyId}/${yearMonth}`);
  }

  // ============================================================
  // 打卡数据同步
  // ============================================================

  /** 同步打卡数据到数据库 */
  async syncPunchData(
    companyId: CompanyId,
    yearMonth: string,
    punchRecords: any[],
    employees: any[]
  ): Promise<{ dailyUpserted: number; punchInserted: number }> {
    return this.request(`/api/v1/sync/punch/${companyId}/${yearMonth}`, {
      method: 'POST',
      body: JSON.stringify({ punchRecords, employees }),
    });
  }

  // ============================================================
  // 月度统计同步
  // ============================================================

  /** 同步月度统计数据到数据库 */
  async syncMonthlyStats(
    companyId: CompanyId,
    yearMonth: string,
    statsData: Array<{ userId: string; userName?: string; department?: string; stats: any }>,
    companyAggregates?: Record<string, any>,
    employeeCounts?: Record<string, number>,
    fullAttendanceCounts?: Record<string, number>
  ): Promise<void> {
    await this.request(`/api/v1/sync/stats/${companyId}/${yearMonth}`, {
      method: 'POST',
      body: JSON.stringify({ statsData, companyAggregates, employeeCounts, fullAttendanceCounts }),
    });
  }

  // ============================================================
  // 月度快照管理
  // ============================================================

  /** 检查某月数据是否已定稿（可从数据库读取） */
  async checkMonthFinalized(
    companyId: CompanyId,
    yearMonth: string
  ): Promise<{ isFinalized: boolean; canReadFromDb: boolean; snapshot: any }> {
    return this.request(`/api/v1/sync/snapshot/${companyId}/${yearMonth}/check`);
  }

  /** 定稿月度数据 */
  async finalizeMonth(
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
    await this.request(`/api/v1/sync/finalize/${companyId}/${yearMonth}`, {
      method: 'POST',
      body: JSON.stringify({ employeeUserIds, summaryStats }),
    });
  }

  /** 获取所有已定稿月份 */
  async getFinalizedMonths(companyId: CompanyId): Promise<string[]> {
    return this.request(`/api/v1/sync/finalized-months/${companyId}`);
  }

  /** 从数据库获取完整月度数据（替代钉钉API调用） */
  async getMonthDataFromDb(
    companyId: CompanyId,
    yearMonth: string
  ): Promise<{
    employees: any[];
    companyCounts: Record<string, number>;
    attendanceMap: Record<string, any>;
    processDataMap: Record<string, any>;
    monthlyStats: any;
    companyAggregates: Record<string, any>;
    snapshot: any;
    syncTime: string | null;
  }> {
    return this.request(`/api/v1/sync/month-data/${companyId}/${yearMonth}`);
  }
}

export const dataSyncApiService = new DataSyncApiService();
export default dataSyncApiService;
