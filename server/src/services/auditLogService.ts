import db from '../db/index';
import type { CompanyId } from '../types/index';

/**
 * 审计日志服务
 * 用于记录所有系统操作日志
 */

export interface AuditLogEntry {
  company_id: CompanyId;
  user_id: string;
  user_name?: string;
  user_role?: string;
  module: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  description?: string;
  old_value?: any;
  new_value?: any;
  changed_fields?: string[];
  change_summary?: string;
  request_method?: string;
  request_path?: string;
  request_params?: any;
  request_body?: any;
  status?: 'success' | 'failure' | 'partial';
  error_message?: string;
  response_code?: number;
  client_ip?: string;
  user_agent?: string;
  device_type?: string;
  browser?: string;
  os?: string;
  duration_ms?: number;
  metadata?: any;
  tags?: string;
}

export interface AuditLogQuery {
  page?: number;
  size?: number;
  user_id?: string;
  module?: string;
  action?: string;
  resource_type?: string;
  status?: 'success' | 'failure' | 'partial';
  start_date?: string;
  end_date?: string;
  search_term?: string;
}

export class AuditLogService {
  /**
   * 记录审计日志
   */
  async log(entry: AuditLogEntry): Promise<number> {
    try {
      // 简单处理：只保留有值的字段
      const data: any = {
        company_id: entry.company_id,
        user_id: entry.user_id,
        module: entry.module,
        action: entry.action,
        status: entry.status || 'success',
      };

      // 可选字段：只在有值时添加
      if (entry.user_name) data.user_name = entry.user_name;
      if (entry.user_role) data.user_role = entry.user_role;
      if (entry.resource_type) data.resource_type = entry.resource_type;
      if (entry.resource_id) data.resource_id = entry.resource_id;
      if (entry.resource_name) data.resource_name = entry.resource_name;
      if (entry.description) data.description = entry.description;
      if (entry.change_summary) data.change_summary = entry.change_summary;
      if (entry.request_method) data.request_method = entry.request_method;
      if (entry.request_path) data.request_path = entry.request_path;
      if (entry.error_message) data.error_message = entry.error_message;
      if (entry.response_code) data.response_code = entry.response_code;
      if (entry.client_ip) data.client_ip = entry.client_ip;
      if (entry.user_agent) data.user_agent = entry.user_agent;
      if (entry.device_type) data.device_type = entry.device_type;
      if (entry.browser) data.browser = entry.browser;
      if (entry.os) data.os = entry.os;
      if (entry.duration_ms) data.duration_ms = entry.duration_ms;
      if (entry.tags) data.tags = entry.tags;

      // JSONB 字段：使用 JSON.stringify 转换
      if (entry.old_value) data.old_value = JSON.stringify(entry.old_value);
      if (entry.new_value) data.new_value = JSON.stringify(entry.new_value);
      if (entry.changed_fields && Array.isArray(entry.changed_fields)) {
        data.changed_fields = JSON.stringify(entry.changed_fields);
      }
      if (entry.request_params) data.request_params = JSON.stringify(entry.request_params);
      if (entry.request_body) data.request_body = JSON.stringify(entry.request_body);
      if (entry.metadata) data.metadata = JSON.stringify(entry.metadata);

      const [id] = await db('system_audit_logs').insert(data).returning('id');
      
      const logId = typeof id === 'object' ? id.id : id;
      // console.log('[AuditLogService] ✅ 日志记录成功，ID:', logId);
      return logId;
    } catch (error: any) {
      console.error('[AuditLogService] ❌ 记录审计日志失败:', error.message);
      // 不抛出错误，避免影响主业务流程
      return -1;
    }
  }

  /**
   * 批量记录审计日志
   */
  async logBatch(entries: AuditLogEntry[]): Promise<void> {
    try {
      const records = entries.map(entry => ({
        company_id: entry.company_id,
        user_id: entry.user_id,
        user_name: entry.user_name,
        user_role: entry.user_role,
        module: entry.module,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        resource_name: entry.resource_name,
        description: entry.description,
        old_value: entry.old_value || null,
        new_value: entry.new_value || null,
        changed_fields: entry.changed_fields || null,
        change_summary: entry.change_summary,
        request_method: entry.request_method,
        request_path: entry.request_path,
        request_params: entry.request_params || null,
        request_body: entry.request_body || null,
        status: entry.status || 'success',
        error_message: entry.error_message,
        response_code: entry.response_code,
        client_ip: entry.client_ip,
        user_agent: entry.user_agent,
        device_type: entry.device_type,
        browser: entry.browser,
        os: entry.os,
        duration_ms: entry.duration_ms,
        metadata: entry.metadata || null,
        tags: entry.tags,
      }));
      
      await db('system_audit_logs').insert(records);
    } catch (error) {
      console.error('[AuditLogService] 批量记录审计日志失败:', error);
    }
  }

  /**
   * 查询审计日志
   */
  async query(company_id: CompanyId, query: AuditLogQuery): Promise<{ total: number; list: any[] }> {
    try {
      let queryBuilder = db('system_audit_logs')
        .where({ company_id });
      
      // 应用筛选条件
      if (query.user_id) {
        queryBuilder = queryBuilder.where('user_id', query.user_id);
      }
      
      if (query.module) {
        queryBuilder = queryBuilder.where('module', query.module);
      }
      
      if (query.action) {
        queryBuilder = queryBuilder.where('action', query.action);
      }
      
      if (query.resource_type) {
        queryBuilder = queryBuilder.where('resource_type', query.resource_type);
      }
      
      if (query.status) {
        queryBuilder = queryBuilder.where('status', query.status);
      }
      
      if (query.start_date) {
        queryBuilder = queryBuilder.where('created_at', '>=', query.start_date);
      }
      
      if (query.end_date) {
        const endDate = new Date(query.end_date);
        endDate.setHours(23, 59, 59, 999);
        queryBuilder = queryBuilder.where('created_at', '<=', endDate.toISOString());
      }
      
      if (query.search_term) {
        const searchTerm = `%${query.search_term}%`;
        queryBuilder = queryBuilder.where(function() {
          this.where('user_name', 'like', searchTerm)
            .orWhere('description', 'like', searchTerm)
            .orWhere('resource_name', 'like', searchTerm)
            .orWhere('change_summary', 'like', searchTerm);
        });
      }
      
      // 获取总数
      const countResult = await queryBuilder.clone().count('* as count').first();
      const total = Number(countResult?.count || 0);
      
      // 分页查询
      const page = query.page || 1;
      const size = query.size || 20;
      const offset = (page - 1) * size;
      
      const list = await queryBuilder
        .orderBy('created_at', 'desc')
        .limit(size)
        .offset(offset);
      
      // JSONB 字段已经是对象，不需要解析
      const parsedList = list.map(item => ({
        ...item,
        old_value: item.old_value || null,
        new_value: item.new_value || null,
        changed_fields: item.changed_fields || null,
        request_params: item.request_params || null,
        request_body: item.request_body || null,
        metadata: item.metadata || null,
      }));
      
      return { total, list: parsedList };
    } catch (error) {
      console.error('[AuditLogService] 查询审计日志失败:', error);
      return { total: 0, list: [] };
    }
  }

  /**
   * 获取日志统计信息
   */
  async getStats(company_id: CompanyId, start_date?: string, end_date?: string): Promise<{
    total: number;
    by_module: Array<{ module: string; count: number }>;
    by_action: Array<{ action: string; count: number }>;
    by_user: Array<{ user_id: string; user_name: string; count: number }>;
    by_status: Array<{ status: string; count: number }>;
  }> {
    try {
      let baseQuery = db('system_audit_logs').where({ company_id });
      
      if (start_date) {
        baseQuery = baseQuery.where('created_at', '>=', start_date);
      }
      
      if (end_date) {
        const endDate = new Date(end_date);
        endDate.setHours(23, 59, 59, 999);
        baseQuery = baseQuery.where('created_at', '<=', endDate.toISOString());
      }
      
      // 总数
      const totalResult = await baseQuery.clone().count('* as count').first();
      const total = Number(totalResult?.count || 0);
      
      // 按模块统计
      const by_module = await baseQuery.clone()
        .select('module')
        .count('* as count')
        .groupBy('module')
        .orderBy('count', 'desc')
        .limit(10);
      
      // 按操作统计
      const by_action = await baseQuery.clone()
        .select('action')
        .count('* as count')
        .groupBy('action')
        .orderBy('count', 'desc')
        .limit(10);
      
      // 按用户统计
      const by_user = await baseQuery.clone()
        .select('user_id', 'user_name')
        .count('* as count')
        .groupBy('user_id', 'user_name')
        .orderBy('count', 'desc')
        .limit(10);
      
      // 按状态统计
      const by_status = await baseQuery.clone()
        .select('status')
        .count('* as count')
        .groupBy('status')
        .orderBy('count', 'desc');
      
      return {
        total,
        by_module: by_module.map(item => ({ module: String(item.module), count: Number(item.count) })),
        by_action: by_action.map(item => ({ action: String(item.action), count: Number(item.count) })),
        by_user: by_user.map(item => ({ 
          user_id: String(item.user_id), 
          user_name: String(item.user_name || item.user_id), 
          count: Number(item.count) 
        })),
        by_status: by_status.map(item => ({ status: String(item.status), count: Number(item.count) })),
      };
    } catch (error) {
      console.error('[AuditLogService] 获取统计信息失败:', error);
      return {
        total: 0,
        by_module: [],
        by_action: [],
        by_user: [],
        by_status: [],
      };
    }
  }

  /**
   * 删除审计日志
   */
  async delete(id: number): Promise<boolean> {
    try {
      const deleted = await db('system_audit_logs')
        .where({ id })
        .delete();
      
      return deleted > 0;
    } catch (error) {
      console.error('[AuditLogService] 删除审计日志失败:', error);
      return false;
    }
  }

  /**
   * 批量删除审计日志
   */
  async deleteBatch(ids: number[]): Promise<number> {
    try {
      const deleted = await db('system_audit_logs')
        .whereIn('id', ids)
        .delete();
      
      // console.log(`[AuditLogService] 批量删除了 ${deleted} 条审计日志`);
      return deleted;
    } catch (error) {
      console.error('[AuditLogService] 批量删除审计日志失败:', error);
      return 0;
    }
  }

  /**
   * 清理旧日志（保留指定天数）
   */
  async cleanup(days: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const deleted = await db('system_audit_logs')
        .where('created_at', '<', cutoffDate.toISOString())
        .delete();
      
      // console.log(`[AuditLogService] 清理了 ${deleted} 条超过 ${days} 天的审计日志`);
      return deleted;
    } catch (error) {
      console.error('[AuditLogService] 清理审计日志失败:', error);
      return 0;
    }
  }
}

export const auditLogService = new AuditLogService();
