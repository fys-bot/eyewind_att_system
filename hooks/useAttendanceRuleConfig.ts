/**
 * 考勤规则配置 Hook
 * 从数据库加载规则配置，并提供给整个应用使用
 */

import { useState, useEffect, useCallback } from 'react';
import { attendanceRuleApiService, type CompanyId, type FullAttendanceRuleConfig } from '../services/attendanceRuleApiService';
import type { CompanyConfig, AttendanceRuleConfig } from '../database/schema';
import { DEFAULT_CONFIGS } from '../components/attendance/utils';

// 规则配置缓存
interface RuleConfigCache {
  eyewind: CompanyConfig | null;
  hydodo: CompanyConfig | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number;
  initialized: boolean; // 新增：标记是否已初始化
}

// 全局缓存（模块级别）
let globalRuleCache: RuleConfigCache = {
  eyewind: null,
  hydodo: null,
  loading: false,
  error: null,
  lastUpdated: 0,
  initialized: false, // 新增：初始化标志
};

// 缓存有效期（5分钟）
const CACHE_TTL = 5 * 60 * 1000;

/**
 * 将数据库格式转换为前端格式
 * 新的数据库设计：rules 字段直接存储前端格式的 JSONB，无需复杂转换
 */
function convertDbToFrontend(dbConfig: FullAttendanceRuleConfig, companyKey: 'eyewind' | 'hydodo'): CompanyConfig {
  const defaultConfig = DEFAULT_CONFIGS[companyKey];
  
  // 新的数据库设计：rules 字段已经是前端格式，直接使用
  // 使用可选链操作符处理可能不存在的 rules 属性
  const rules = (dbConfig as any).rules || defaultConfig.rules;
  
  return {
    ...defaultConfig,
    rules: rules as AttendanceRuleConfig
  };
}

/**
 * 从数据库加载规则配置
 */
async function loadRuleConfigFromDb(companyId: CompanyId): Promise<CompanyConfig | null> {
  try {
    const dbConfig = await attendanceRuleApiService.getFullConfig(companyId, true);
    if (dbConfig) {
      return convertDbToFrontend(dbConfig, companyId);
    }
    return null;
  } catch (error) {
    console.error(`[loadRuleConfigFromDb] 加载 ${companyId} 配置失败:`, error);
    return null;
  }
}

/**
 * 获取规则配置（同步方法，从缓存获取）
 * 如果缓存为空，返回默认配置
 */
export function getRuleConfigSync(companyKey: string): CompanyConfig {
  const key = (companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind';
  const cached = globalRuleCache[key];
  
  if (cached) {
    return cached;
  }
  
  // 返回默认配置
  return DEFAULT_CONFIGS[key];
}

/**
 * 刷新规则配置缓存
 */
export async function refreshRuleConfigCache(companyKey?: string): Promise<void> {
  // 防止并发调用
  if (globalRuleCache.loading) {
    // console.log('[refreshRuleConfigCache] 正在加载中，跳过重复调用');
    return;
  }

  const companies: CompanyId[] = companyKey 
    ? [(companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind']
    : ['eyewind', 'hydodo'];

  // console.log(`[refreshRuleConfigCache] 开始刷新规则配置缓存: ${companies.join(', ')}`);
  
  globalRuleCache.loading = true;
  globalRuleCache.error = null;

  try {
    for (const company of companies) {
      const config = await loadRuleConfigFromDb(company);
      if (config) {
        globalRuleCache[company] = config;
        // console.log(`[refreshRuleConfigCache] 已从数据库加载 ${company} 配置, fixed_should_attendance_days:`, config.rules?.attendanceDaysRules?.fixedShouldAttendanceDays);
      }
    }
    globalRuleCache.lastUpdated = Date.now();
  } catch (error) {
    globalRuleCache.error = String(error);
    console.error('[refreshRuleConfigCache] 刷新缓存失败:', error);
  } finally {
    globalRuleCache.loading = false;
  }
}

/**
 * 初始化规则配置（应用启动时调用）
 */
export async function initRuleConfigCache(): Promise<void> {
  // 如果已经初始化过，直接返回
  if (globalRuleCache.initialized) {
    // console.log('[initRuleConfigCache] 已经初始化过，跳过');
    return;
  }
  
  // 如果缓存有效，标记为已初始化并返回
  if (globalRuleCache.lastUpdated > 0 && Date.now() - globalRuleCache.lastUpdated < CACHE_TTL) {
    // console.log('[initRuleConfigCache] 缓存仍然有效，标记为已初始化');
    globalRuleCache.initialized = true;
    return;
  }
  
  // 如果正在加载中，等待加载完成
  if (globalRuleCache.loading) {
    // console.log('[initRuleConfigCache] 正在加载中，等待完成...');
    // 等待加载完成
    while (globalRuleCache.loading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }
  
  // console.log('[initRuleConfigCache] 开始初始化规则配置缓存');
  await refreshRuleConfigCache();
  globalRuleCache.initialized = true;
}

/**
 * React Hook: 使用考勤规则配置
 */
export function useAttendanceRuleConfig(companyKey: string) {
  const key = (companyKey === '海多多' || companyKey === 'hydodo') ? 'hydodo' : 'eyewind';
  const [config, setConfig] = useState<CompanyConfig>(getRuleConfigSync(companyKey));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshRuleConfigCache(companyKey);
      setConfig(getRuleConfigSync(companyKey));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [companyKey]);

  useEffect(() => {
    // 首次加载时，如果缓存为空或过期，从数据库加载
    const cached = globalRuleCache[key];
    const isCacheValid = cached && Date.now() - globalRuleCache.lastUpdated < CACHE_TTL;
    
    // 🔥 修复：每次 companyKey 变化时都重新加载，确保切换公司时获取最新配置
    // console.log(`[useAttendanceRuleConfig] companyKey 变化为 ${companyKey}，缓存有效: ${isCacheValid}`);
    
    // 只有在未初始化且缓存无效时才加载
    if (!globalRuleCache.initialized && !isCacheValid && !globalRuleCache.loading) {
      // console.log(`[useAttendanceRuleConfig] 缓存无效或为空，开始加载 ${companyKey} 规则配置`);
      refresh();
    } else if (cached) {
      // console.log(`[useAttendanceRuleConfig] 使用缓存的 ${companyKey} 规则配置`);
      setConfig(cached);
    } else if (!cached && !globalRuleCache.loading) {
      // 🔥 新增：如果缓存中没有该公司的配置，立即加载
      // console.log(`[useAttendanceRuleConfig] 缓存中没有 ${companyKey} 的配置，立即加载`);
      refresh();
    }

    // 监听规则更新事件
    const handleRulesUpdated = (event: CustomEvent) => {
      const eventCompanyKey = event.detail?.companyKey;
      if (eventCompanyKey === key || eventCompanyKey === companyKey) {
        // console.log(`[useAttendanceRuleConfig] 收到规则更新事件，刷新 ${companyKey} 配置`);
        refresh();
      }
    };

    window.addEventListener('attendanceRulesUpdated', handleRulesUpdated as EventListener);
    return () => {
      window.removeEventListener('attendanceRulesUpdated', handleRulesUpdated as EventListener);
    };
  }, [key, companyKey, refresh]);

  return { config, loading, error, refresh };
}

export default useAttendanceRuleConfig;
