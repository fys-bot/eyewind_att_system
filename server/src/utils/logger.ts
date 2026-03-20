/**
 * 服务器端日志工具
 * 提供统一的日志格式和日志级别
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogContext {
  api?: string;
  method?: string;
  params?: any;
  query?: any;
  body?: any;
  dataCount?: number;
  dataStructure?: string;
  duration?: number;
  error?: any;
  [key: string]: any;
}

/**
 * 格式化日志输出
 */
const formatLog = (level: LogLevel, message: string, context?: LogContext): string => {
  const timestamp = new Date().toLocaleString('zh-CN', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
  
  const prefix = `[${timestamp}] [${level}]`;
  
  if (!context) {
    return `${prefix} ${message}`;
  }
  
  const contextStr = Object.entries(context)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'object') {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${value}`;
    })
    .join(', ');
  
  return `${prefix} ${message} | ${contextStr}`;
};

/**
 * 记录API请求信息
 */
export const logApiRequest = (api: string, method: string, params?: any, query?: any, body?: any) => {
  console.log(formatLog('INFO', `API请求`, {
    api,
    method,
    params: params ? JSON.stringify(params) : undefined,
    query: query && Object.keys(query).length > 0 ? JSON.stringify(query) : undefined,
    body: body && Object.keys(body).length > 0 ? `${Object.keys(body).join(', ')}` : undefined
  }));
};

/**
 * 记录数据库查询结果
 */
export const logDbQuery = (operation: string, dataCount: number, dataStructure?: string, duration?: number) => {
  console.log(formatLog('INFO', `数据库查询`, {
    operation,
    dataCount,
    dataStructure,
    ...(duration !== undefined && { duration })
  }));
};

/**
 * 记录API响应信息
 */
export const logApiResponse = (api: string, statusCode: number, dataCount?: number, duration?: number) => {
  console.log(formatLog('INFO', `API响应`, {
    api,
    statusCode,
    dataCount,
    ...(duration !== undefined && { duration })
  }));
};

/**
 * 记录错误信息
 */
export const logError = (message: string, error: any, context?: LogContext) => {
  console.error(formatLog('ERROR', message, {
    ...context,
    error: error.message || error,
    stack: error.stack?.split('\n').slice(0, 3).join(' | ')
  }));
};

/**
 * 记录警告信息
 */
export const logWarning = (message: string, context?: LogContext) => {
  console.warn(formatLog('WARN', message, context));
};

/**
 * 记录调试信息
 */
export const logDebug = (message: string, context?: LogContext) => {
  console.log(formatLog('DEBUG', message, context));
};

/**
 * 获取数据结构描述
 */
export const getDataStructure = (data: any): string => {
  if (!data) return 'null';
  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    const sample = data[0];
    return `Array<{${Object.keys(sample).join(', ')}}>`;
  }
  if (typeof data === 'object') {
    return `{${Object.keys(data).join(', ')}}`;
  }
  return typeof data;
};
