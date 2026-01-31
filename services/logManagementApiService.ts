/**
 * 日志管理 API 服务
 * 统一管理考勤编辑日志和系统审计日志
 */

// @ts-ignore
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5000';

// 公司ID类型
export type CompanyId = 'eyewind' | 'hydodo';

// 日志类型
export type LogType = 'attendance' | 'audit' | 'all';

// API 响应类型
interface ApiResponse<T = any> {
  code: number;
  message?: string;
  data?: T;
}

// 统一日志查询参数
export interface UnifiedLogQuery {
  page?: number;
  size?: number;
  userId?: string;
  startDate?: string;
  endDate?: string;
  logType?: LogType;
  searchTerm?: string;
  action?: string;
  editType?: string;
}

// 统一日志条目
export interface UnifiedLogEntry {
  id: string;
  type: 'attendance' | 'audit';
  timestamp: number;
  userId: string;
  userName?: string;
  userRole?: string;
  action: string;
  target?: string;
  details?: string;
  // 考勤日志特有字段
  attendanceDate?: string;
  editType?: string;
  oldStatus?: string;
  newStatus?: string;
  editReason?: string;
  clientIp?: string;
  userAgent?: string;
  oldValue?: any;
  newValue?: any;
  linkedProcInstId?: string;
}

// 日志列表响应
export interface LogListResponse {
  total: number;
  list: UnifiedLogEntry[];
  page: number;
  size: number;
}

class LogManagementApiService {
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
   * 获取考勤编辑日志
   */
  async getAttendanceLogs(
    companyId: CompanyId,
    query: Omit<UnifiedLogQuery, 'logType'> = {}
  ): Promise<LogListResponse> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.size) params.append('size', query.size.toString());
    if (query.userId) params.append('userId', query.userId);
    if (query.startDate) params.append('startDate', query.startDate);
    if (query.endDate) params.append('endDate', query.endDate);
    if (query.editType) params.append('editType', query.editType);
    if (query.searchTerm) params.append('searchTerm', query.searchTerm);

    const response = await this.request<LogListResponse>(
      `/api/v1/logs/attendance/${companyId}?${params.toString()}`
    );
    
    return response.data!;
  }

  /**
   * 获取系统审计日志
   */
  async getAuditLogs(query: Omit<UnifiedLogQuery, 'logType'> = {}): Promise<LogListResponse> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.size) params.append('size', query.size.toString());
    if (query.userId) params.append('userId', query.userId);
    if (query.startDate) params.append('startDate', query.startDate);
    if (query.endDate) params.append('endDate', query.endDate);
    if (query.action) params.append('action', query.action);
    if (query.searchTerm) params.append('searchTerm', query.searchTerm);

    const response = await this.request<LogListResponse>(
      `/api/v1/logs/audit?${params.toString()}`
    );
    
    return response.data!;
  }

  /**
   * 获取统一日志（考勤+审计）
   */
  async getUnifiedLogs(
    companyId: CompanyId,
    query: UnifiedLogQuery = {}
  ): Promise<LogListResponse> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', query.page.toString());
    if (query.size) params.append('size', query.size.toString());
    if (query.userId) params.append('userId', query.userId);
    if (query.startDate) params.append('startDate', query.startDate);
    if (query.endDate) params.append('endDate', query.endDate);
    if (query.logType) params.append('logType', query.logType);
    if (query.searchTerm) params.append('searchTerm', query.searchTerm);
    if (query.action) params.append('action', query.action);
    if (query.editType) params.append('editType', query.editType);

    const response = await this.request<LogListResponse>(
      `/api/v1/logs/unified/${companyId}?${params.toString()}`
    );
    
    return response.data!;
  }

  /**
   * 删除考勤编辑日志（管理员功能）
   */
  async deleteAttendanceLog(logId: string): Promise<{ message: string }> {
    const response = await this.request<{ message: string }>(
      `/api/v1/logs/attendance/${logId}`,
      {
        method: 'DELETE',
      }
    );
    
    return response.data!;
  }

  /**
   * 导出日志为CSV
   */
  async exportLogs(
    companyId: CompanyId,
    query: UnifiedLogQuery = {},
    filename?: string
  ): Promise<void> {
    try {
      // 获取所有日志数据（不分页）
      const allLogs = await this.getUnifiedLogs(companyId, {
        ...query,
        page: 1,
        size: 10000, // 获取大量数据
      });

      // 生成CSV内容
      const csvContent = [
        ['时间', '类型', '用户ID', '用户名', '角色', '操作', '对象', '详情'].join(','),
        ...allLogs.list.map(log => [
          new Date(log.timestamp).toLocaleString('zh-CN'),
          log.type === 'attendance' ? '考勤日志' : '审计日志',
          log.userId,
          log.userName || '',
          log.userRole || '',
          log.action,
          log.target || '',
          (log.details || '').replace(/,/g, '，') // 替换逗号避免CSV格式问题
        ].join(','))
      ].join('\n');

      // 下载文件
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename || `日志导出_${new Date().toISOString().slice(0, 19).replace(/[:\s]/g, '_')}.csv`;
      link.click();
    } catch (error) {
      console.error('导出日志失败:', error);
      throw error;
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

  /**
   * 获取日志统计信息
   */
  async getLogStats(
    companyId: CompanyId,
    startDate?: string,
    endDate?: string
  ): Promise<{
    totalLogs: number;
    attendanceLogs: number;
    auditLogs: number;
    topUsers: Array<{ userId: string; userName?: string; count: number }>;
    topActions: Array<{ action: string; count: number }>;
  }> {
    try {
      // 获取统计数据
      const allLogs = await this.getUnifiedLogs(companyId, {
        startDate,
        endDate,
        page: 1,
        size: 10000,
      });

      const attendanceLogs = allLogs.list.filter(log => log.type === 'attendance').length;
      const auditLogs = allLogs.list.filter(log => log.type === 'audit').length;

      // 统计用户操作次数
      const userStats = new Map<string, { userName?: string; count: number }>();
      allLogs.list.forEach(log => {
        const key = log.userId;
        const existing = userStats.get(key) || { count: 0 };
        userStats.set(key, {
          userName: log.userName || existing.userName,
          count: existing.count + 1,
        });
      });

      const topUsers = Array.from(userStats.entries())
        .map(([userId, data]) => ({ userId, userName: data.userName, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // 统计操作类型次数
      const actionStats = new Map<string, number>();
      allLogs.list.forEach(log => {
        actionStats.set(log.action, (actionStats.get(log.action) || 0) + 1);
      });

      const topActions = Array.from(actionStats.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalLogs: allLogs.total,
        attendanceLogs,
        auditLogs,
        topUsers,
        topActions,
      };
    } catch (error) {
      console.error('获取日志统计失败:', error);
      return {
        totalLogs: 0,
        attendanceLogs: 0,
        auditLogs: 0,
        topUsers: [],
        topActions: [],
      };
    }
  }
}

export const logManagementApiService = new LogManagementApiService();
export default logManagementApiService;