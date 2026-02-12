import { Request, Response, NextFunction } from 'express';
import { auditLogService } from '../services/auditLogService';
import type { CompanyId } from '../types/index';

/**
 * 审计日志中间件
 * 自动记录所有API请求
 */

// 需要记录的路由配置
const AUDIT_ROUTES: Array<{
  pattern: RegExp;
  module: string;
  action: string;
  resourceType?: string;
  getResourceId?: (req: Request) => string | undefined;
  getResourceName?: (req: Request) => string | undefined;
  getDescription?: (req: Request, res: Response) => string;
}> = [
  // 考勤规则相关
  {
    pattern: /^\/api\/v1\/attendance\/rules\/(\w+)$/,
    module: 'attendance_rules',
    action: 'VIEW',
    resourceType: 'rule_config',
    getResourceId: (req) => req.params.companyId,
    getDescription: (req) => `查看 ${req.params.companyId} 的考勤规则配置`,
  },
  {
    pattern: /^\/api\/v1\/attendance\/rules\/(\w+)$/,
    module: 'attendance_rules',
    action: 'UPDATE',
    resourceType: 'rule_config',
    getResourceId: (req) => req.params.companyId,
    getResourceName: (req) => `${req.params.companyId} 考勤规则`,
    getDescription: (req) => {
      const reason = req.body?.changeReason || '未填写原因';
      return `修改 ${req.params.companyId} 的考勤规则：${reason}`;
    },
  },
  {
    pattern: /^\/api\/v1\/attendance\/rules\/(\w+)\/history$/,
    module: 'attendance_rules',
    action: 'VIEW_HISTORY',
    resourceType: 'rule_config',
    getResourceId: (req) => req.params.companyId,
    getDescription: (req) => `查看 ${req.params.companyId} 的规则变更历史`,
  },
  {
    pattern: /^\/api\/v1\/attendance\/rules\/(\w+)\/rollback$/,
    module: 'attendance_rules',
    action: 'ROLLBACK',
    resourceType: 'rule_config',
    getResourceId: (req) => req.params.companyId,
    getDescription: (req) => {
      const reason = req.body?.reason || '未填写原因';
      return `回滚 ${req.params.companyId} 的考勤规则：${reason}`;
    },
  },
  
  // 考勤数据相关
  {
    pattern: /^\/api\/v1\/attendance\/(\w+)\/data$/,
    module: 'attendance_data',
    action: 'VIEW',
    resourceType: 'attendance_data',
    getDescription: (req) => {
      const { fromDate, toDate } = req.query;
      return `查看 ${req.params.companyId} 的考勤数据 (${fromDate} ~ ${toDate})`;
    },
  },
  {
    pattern: /^\/api\/v1\/attendance\/(\w+)\/export$/,
    module: 'attendance_data',
    action: 'EXPORT',
    resourceType: 'attendance_data',
    getDescription: (req) => {
      const { fromDate, toDate, format } = req.query;
      return `导出 ${req.params.companyId} 的考勤数据 (${fromDate} ~ ${toDate}, 格式: ${format || 'excel'})`;
    },
  },
  {
    pattern: /^\/api\/v1\/attendance\/(\w+)\/edit$/,
    module: 'attendance_data',
    action: 'EDIT',
    resourceType: 'attendance_record',
    getDescription: (req) => {
      const { userId, date, reason } = req.body;
      return `修改 ${userId} 在 ${date} 的考勤数据：${reason || '未填写原因'}`;
    },
  },
  
  // 报表下载相关
  {
    pattern: /^\/api\/v1\/reports\/(\w+)\/download$/,
    module: 'reports',
    action: 'DOWNLOAD',
    resourceType: 'report',
    getResourceName: (req) => req.query.reportType as string,
    getDescription: (req) => {
      const { reportType, month } = req.query;
      return `下载 ${req.params.companyId} 的 ${reportType} 报表 (${month})`;
    },
  },
  
  // 用户管理相关
  {
    pattern: /^\/api\/v1\/users$/,
    module: 'user_management',
    action: 'CREATE',
    resourceType: 'user',
    getResourceName: (req) => req.body?.name,
    getDescription: (req) => `创建用户：${req.body?.name || req.body?.id}`,
  },
  {
    pattern: /^\/api\/v1\/users\/(\w+)$/,
    module: 'user_management',
    action: 'UPDATE',
    resourceType: 'user',
    getResourceId: (req) => req.params.userId,
    getResourceName: (req) => req.body?.name,
    getDescription: (req) => `更新用户信息：${req.params.userId}`,
  },
  {
    pattern: /^\/api\/v1\/users\/(\w+)$/,
    module: 'user_management',
    action: 'DELETE',
    resourceType: 'user',
    getResourceId: (req) => req.params.userId,
    getDescription: (req) => `删除用户：${req.params.userId}`,
  },
  
  // 角色权限相关
  {
    pattern: /^\/api\/v1\/roles$/,
    module: 'role_management',
    action: 'CREATE',
    resourceType: 'role',
    getResourceName: (req) => req.body?.name,
    getDescription: (req) => `创建角色：${req.body?.name}`,
  },
  {
    pattern: /^\/api\/v1\/roles\/(\w+)$/,
    module: 'role_management',
    action: 'UPDATE',
    resourceType: 'role',
    getResourceId: (req) => req.params.roleId,
    getDescription: (req) => `更新角色：${req.params.roleId}`,
  },
];

// 敏感字段，需要脱敏
const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'apiKey', 'accessToken'];

// 脱敏函数
function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  
  for (const key in sanitized) {
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '***';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }
  
  return sanitized;
}

// 解析User-Agent
function parseUserAgent(userAgent: string): { device_type?: string; browser?: string; os?: string } {
  if (!userAgent) return {};
  
  const ua = userAgent.toLowerCase();
  
  // 设备类型
  let device_type = 'desktop';
  if (ua.includes('mobile')) device_type = 'mobile';
  else if (ua.includes('tablet') || ua.includes('ipad')) device_type = 'tablet';
  
  // 浏览器
  let browser = 'unknown';
  if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('edge')) browser = 'Edge';
  
  // 操作系统
  let os = 'unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  
  return { device_type, browser, os };
}

// 比较对象差异
function getChangedFields(oldValue: any, newValue: any): string[] {
  if (!oldValue || !newValue) return [];
  
  const changed: string[] = [];
  const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
  
  for (const key of allKeys) {
    if (JSON.stringify(oldValue[key]) !== JSON.stringify(newValue[key])) {
      changed.push(key);
    }
  }
  
  return changed;
}

// 生成变更摘要
function generateChangeSummary(oldValue: any, newValue: any, changedFields: string[]): string {
  if (changedFields.length === 0) return '无变更';
  if (changedFields.length > 5) return `修改了 ${changedFields.length} 个字段`;
  
  const summaries: string[] = [];
  for (const field of changedFields.slice(0, 5)) {
    const oldVal = oldValue?.[field];
    const newVal = newValue?.[field];
    summaries.push(`${field}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`);
  }
  
  return summaries.join('; ');
}

/**
 * 审计日志中间件
 */
export function auditLogger() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // 保存原始的 res.json 方法
    const originalJson = res.json.bind(res);
    let responseBody: any;
    
    // 拦截 res.json 以获取响应数据
    res.json = function(body: any) {
      responseBody = body;
      return originalJson(body);
    };
    
    // 监听响应完成
    res.on('finish', async () => {
      try {
        const duration = Date.now() - startTime;
        const method = req.method;
        const path = req.path;
        
        // 只记录需要审计的路由
        if (method === 'GET' && !path.includes('/export') && !path.includes('/download')) {
          return; // 跳过普通的GET请求
        }
        
        // 匹配路由配置
        let matchedRoute: typeof AUDIT_ROUTES[0] | undefined;
        for (const route of AUDIT_ROUTES) {
          if (route.pattern.test(path) && (
            (method === 'GET' && route.action.includes('VIEW')) ||
            (method === 'POST' && (route.action === 'CREATE' || route.action.includes('DOWNLOAD') || route.action.includes('EXPORT'))) ||
            (method === 'PUT' && route.action === 'UPDATE') ||
            (method === 'DELETE' && route.action === 'DELETE')
          )) {
            matchedRoute = route;
            break;
          }
        }
        
        if (!matchedRoute) {
          return; // 不在审计范围内
        }
        
        // 获取用户信息
        const userId = req.headers['x-user-id'] as string || 'anonymous';
        const userName = req.headers['x-user-name'] as string || undefined;
        const userRole = req.headers['x-user-role'] as string || undefined;
        
        // 获取公司ID
        const companyId = (req.params.companyId || req.body?.companyId || 'eyewind') as CompanyId;
        
        // 获取客户端信息
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
                        req.socket.remoteAddress || 
                        'unknown';
        const userAgent = req.headers['user-agent'] || '';
        const { device_type, browser, os } = parseUserAgent(userAgent);
        
        // 获取资源信息
        const resourceId = matchedRoute.getResourceId?.(req);
        const resourceName = matchedRoute.getResourceName?.(req);
        
        // 获取描述
        const description = matchedRoute.getDescription?.(req, res) || 
                          `${matchedRoute.action} ${matchedRoute.resourceType || 'resource'}`;
        
        // 获取旧值和新值（仅对UPDATE操作）
        let oldValue: any;
        let newValue: any;
        let changedFields: string[] = [];
        let changeSummary: string | undefined;
        
        if (matchedRoute.action === 'UPDATE' && req.body) {
          oldValue = req.body.oldValue || req.body.old_value;
          newValue = req.body.newValue || req.body.new_value || req.body.rules;
          
          if (oldValue && newValue) {
            changedFields = getChangedFields(oldValue, newValue);
            changeSummary = generateChangeSummary(oldValue, newValue, changedFields);
          }
        }
        
        // 判断操作状态
        const status = res.statusCode >= 200 && res.statusCode < 300 ? 'success' : 'failure';
        const errorMessage = status === 'failure' ? responseBody?.message : undefined;
        
        // 记录审计日志
        await auditLogService.log({
          company_id: companyId,
          user_id: userId,
          user_name: userName,
          user_role: userRole,
          module: matchedRoute.module,
          action: matchedRoute.action,
          resource_type: matchedRoute.resourceType,
          resource_id: resourceId,
          resource_name: resourceName,
          description,
          old_value: oldValue ? sanitizeData(oldValue) : undefined,
          new_value: newValue ? sanitizeData(newValue) : undefined,
          changed_fields: changedFields.length > 0 ? changedFields : undefined,
          change_summary: changeSummary,
          request_method: method,
          request_path: path,
          request_params: Object.keys(req.query).length > 0 ? sanitizeData(req.query) : undefined,
          request_body: req.body && Object.keys(req.body).length > 0 ? sanitizeData(req.body) : undefined,
          status,
          error_message: errorMessage,
          response_code: res.statusCode,
          client_ip: clientIp,
          user_agent: userAgent,
          device_type,
          browser,
          os,
          duration_ms: duration,
        });
      } catch (error) {
        console.error('[AuditLogger] 记录审计日志失败:', error);
        // 不影响主流程
      }
    });
    
    next();
  };
}
