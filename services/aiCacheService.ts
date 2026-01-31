/**
 * AI 分析结果缓存服务
 * 使用 IndexedDB 存储 AI 分析结果，避免重复调用接口
 */

const DB_NAME = 'AIAnalysisCache';
const DB_VERSION = 1;
const STORE_NAME = 'analyses';

// 缓存有效期：24小时
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface CachedAnalysis {
  key: string;
  content: string;
  timestamp: number;
  type: 'monthly' | 'employee' | 'attendance' | 'rule_analysis'; // 月度诊断、员工建议、考勤分析、规则分析
}

let dbInstance: IDBDatabase | null = null;

/**
 * 初始化 IndexedDB
 */
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // 创建存储对象
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
  });
};


/**
 * 生成月度诊断的缓存 key
 * @param companyName 公司名称
 * @param year 年份
 * @param month 月份
 */
export const getMonthlyAnalysisCacheKey = (companyName: string, year: number, month: number): string => {
  return `monthly_${companyName}_${year}_${month}`;
};

/**
 * 生成员工建议的缓存 key
 * @param userId 员工ID
 * @param year 年份
 * @param month 月份
 */
export const getEmployeeAnalysisCacheKey = (userId: string, year: number, month: number): string => {
  return `employee_${userId}_${year}_${month}`;
};

/**
 * 生成日历异常分析的缓存 key
 * @param userId 员工ID
 * @param year 年份
 * @param month 月份
 */
export const getCalendarAnalysisCacheKey = (userId: string, year: number, month: number): string => {
  return `calendar_${userId}_${year}_${month}`;
};

/**
 * 生成团队分析的缓存 key
 * @param departmentName 部门名称
 * @param year 年份
 * @param month 月份
 */
export const getTeamAnalysisCacheKey = (departmentName: string, year: number, month: number): string => {
  return `team_${departmentName}_${year}_${month}`;
};

/**
 * 获取缓存的分析结果
 * @param key 缓存 key
 * @returns 缓存的内容，如果不存在或已过期则返回 null
 */
export const getCachedAnalysis = async (key: string): Promise<string | null> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => {
        console.error('Failed to get cached analysis:', request.error);
        resolve(null);
      };

      request.onsuccess = () => {
        const result = request.result as CachedAnalysis | undefined;
        
        if (!result) {
          resolve(null);
          return;
        }

        // 检查是否过期
        const now = Date.now();
        if (now - result.timestamp > CACHE_EXPIRY_MS) {
          // 缓存已过期，删除并返回 null
          deleteCachedAnalysis(key).catch(console.error);
          resolve(null);
          return;
        }

        resolve(result.content);
      };
    });
  } catch (error) {
    console.error('Error getting cached analysis:', error);
    return null;
  }
};

/**
 * 保存分析结果到缓存
 * @param key 缓存 key
 * @param content 分析内容
 * @param type 分析类型
 */
export const setCachedAnalysis = async (
  key: string, 
  content: string, 
  type: 'monthly' | 'employee' | 'attendance' | 'rule_analysis'
): Promise<void> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const data: CachedAnalysis = {
        key,
        content,
        timestamp: Date.now(),
        type
      };

      const request = store.put(data);

      request.onerror = () => {
        console.error('Failed to cache analysis:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.error('Error caching analysis:', error);
  }
};

/**
 * 删除缓存的分析结果
 * @param key 缓存 key
 */
export const deleteCachedAnalysis = async (key: string): Promise<void> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => {
        console.error('Failed to delete cached analysis:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.error('Error deleting cached analysis:', error);
  }
};

/**
 * 清除所有过期的缓存
 */
export const clearExpiredCache = async (): Promise<void> => {
  try {
    const db = await initDB();
    const now = Date.now();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onerror = () => {
        console.error('Failed to clear expired cache:', request.error);
        reject(request.error);
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const record = cursor.value as CachedAnalysis;
          if (now - record.timestamp > CACHE_EXPIRY_MS) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  } catch (error) {
    console.error('Error clearing expired cache:', error);
  }
};

/**
 * 清除所有缓存
 */
export const clearAllCache = async (): Promise<void> => {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => {
        console.error('Failed to clear all cache:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  } catch (error) {
    console.error('Error clearing all cache:', error);
  }
};
