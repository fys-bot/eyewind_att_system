import React, { useState, useEffect, useCallback } from 'react';
import { 
  ClockIcon, UserIcon, CalendarIcon, FilterIcon, RefreshCwIcon, 
  ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon, FileTextIcon,
  Loader2Icon, AlertTriangleIcon, HistoryIcon
} from '../../Icons.tsx';
import { attendanceApiService, type AttEditLog, type EditLogQuery, type CompanyId, type EditType } from '../../../services/attendanceApiService.ts';
import { Modal } from '../../Modal.tsx';

interface AttendanceEditLogsProps {
  companyId: CompanyId;
  onClose?: () => void;
  isModal?: boolean;
}

// 编辑类型映射
const EDIT_TYPE_MAP: Record<EditType, { label: string; color: string; bgColor: string }> = {
  status: { label: '状态修改', color: 'text-blue-700', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  time: { label: '时间修改', color: 'text-emerald-700', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  leave: { label: '请假关联', color: 'text-purple-700', bgColor: 'bg-purple-100 dark:bg-purple-900/30' },
  clear: { label: '清除数据', color: 'text-red-700', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  batch: { label: '批量操作', color: 'text-orange-700', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
};

// 格式化日期时间
const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

// 格式化日期
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export const AttendanceEditLogs: React.FC<AttendanceEditLogsProps> = ({ 
  companyId, 
  onClose,
  isModal = false 
}) => {
  const [logs, setLogs] = useState<AttEditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 筛选条件
  const [filters, setFilters] = useState<EditLogQuery>({
    page: 1,
    size: 20,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [tempFilters, setTempFilters] = useState<EditLogQuery>({});
  
  // 详情弹窗
  const [selectedLog, setSelectedLog] = useState<AttEditLog | null>(null);

  // 加载日志数据
  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await attendanceApiService.getEditLogs(companyId, filters);
      setLogs(result.list);
      setTotal(result.total);
    } catch (err) {
      console.error('加载编辑日志失败:', err);
      setError(err instanceof Error ? err.message : '加载失败，请检查服务器连接');
    } finally {
      setIsLoading(false);
    }
  }, [companyId, filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // 分页
  const totalPages = Math.ceil(total / (filters.size || 20));
  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  // 应用筛选
  const applyFilters = () => {
    setFilters(prev => ({ ...prev, ...tempFilters, page: 1 }));
    setShowFilters(false);
  };

  // 重置筛选
  const resetFilters = () => {
    setTempFilters({});
    setFilters({ page: 1, size: 20 });
    setShowFilters(false);
  };

  const content = (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
            <FileTextIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              考勤编辑日志
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {companyId === 'eyewind' ? '风眼科技' : '海多多'} · 共 {total} 条记录
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              showFilters 
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' 
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <FilterIcon className="w-4 h-4" />
            筛选
          </button>
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCwIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                员工ID
              </label>
              <input
                type="text"
                value={tempFilters.userId || ''}
                onChange={(e) => setTempFilters(prev => ({ ...prev, userId: e.target.value || undefined }))}
                placeholder="输入员工ID"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                开始日期
              </label>
              <input
                type="date"
                value={tempFilters.startDate || ''}
                onChange={(e) => setTempFilters(prev => ({ ...prev, startDate: e.target.value || undefined }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                结束日期
              </label>
              <input
                type="date"
                value={tempFilters.endDate || ''}
                onChange={(e) => setTempFilters(prev => ({ ...prev, endDate: e.target.value || undefined }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                修改类型
              </label>
              <select
                value={tempFilters.editType || ''}
                onChange={(e) => setTempFilters(prev => ({ ...prev, editType: (e.target.value || undefined) as EditType | undefined }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">全部类型</option>
                {Object.entries(EDIT_TYPE_MAP).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={resetFilters}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              重置
            </button>
            <button
              onClick={applyFilters}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
            >
              应用筛选
            </button>
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <Loader2Icon className="w-8 h-8 animate-spin mb-2" />
            <span>加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-red-500">
            <AlertTriangleIcon className="w-8 h-8 mb-2" />
            <span>{error}</span>
            <button
              onClick={loadLogs}
              className="mt-4 px-4 py-2 text-sm font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
            >
              重试
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <FileTextIcon className="w-12 h-12 mb-2 opacity-50" />
            <span>暂无编辑日志</span>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const editTypeInfo = EDIT_TYPE_MAP[log.edit_type] || { label: log.edit_type, color: 'text-slate-700', bgColor: 'bg-slate-100' };
              
              return (
                <div
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                        <HistoryIcon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${editTypeInfo.bgColor} ${editTypeInfo.color}`}>
                            {editTypeInfo.label}
                          </span>
                          {log.old_status && log.new_status && log.old_status !== log.new_status && (
                            <span className="text-xs text-slate-500">
                              {log.old_status} → {log.new_status}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-900 dark:text-white font-medium">
                          员工: {log.user_name || log.user_id}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          考勤日期: {formatDate(log.attendance_date)}
                        </div>
                        {log.edit_reason && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 bg-slate-50 dark:bg-slate-700/50 px-2 py-1 rounded">
                            原因: {log.edit_reason}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(log.edit_time)}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        操作人: {log.editor_name || log.editor_id}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 分页 */}
      {total > 0 && (
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            第 {filters.page} 页，共 {totalPages} 页 ({total} 条记录)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange((filters.page || 1) - 1)}
              disabled={(filters.page || 1) <= 1}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="px-3 py-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              {filters.page || 1}
            </span>
            <button
              onClick={() => handlePageChange((filters.page || 1) + 1)}
              disabled={(filters.page || 1) >= totalPages}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {selectedLog && (
        <Modal
          isOpen={!!selectedLog}
          onClose={() => setSelectedLog(null)}
          title="编辑日志详情"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">员工</label>
                <div className="text-sm text-slate-900 dark:text-white">{selectedLog.user_name || selectedLog.user_id}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">考勤日期</label>
                <div className="text-sm text-slate-900 dark:text-white">{formatDate(selectedLog.attendance_date)}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">修改类型</label>
                <div className="text-sm">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${EDIT_TYPE_MAP[selectedLog.edit_type]?.bgColor || 'bg-slate-100'} ${EDIT_TYPE_MAP[selectedLog.edit_type]?.color || 'text-slate-700'}`}>
                    {EDIT_TYPE_MAP[selectedLog.edit_type]?.label || selectedLog.edit_type}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">操作时间</label>
                <div className="text-sm text-slate-900 dark:text-white">{formatDateTime(selectedLog.edit_time)}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">操作人</label>
                <div className="text-sm text-slate-900 dark:text-white">{selectedLog.editor_name || selectedLog.editor_id}</div>
              </div>
              {selectedLog.client_ip && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">客户端IP</label>
                  <div className="text-sm text-slate-900 dark:text-white">{selectedLog.client_ip}</div>
                </div>
              )}
            </div>
            
            {selectedLog.edit_reason && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">修改原因</label>
                <div className="text-sm text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  {selectedLog.edit_reason}
                </div>
              </div>
            )}

            {selectedLog.old_status && selectedLog.new_status && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">状态变更</label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                    {selectedLog.old_status}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                    {selectedLog.new_status}
                  </span>
                </div>
              </div>
            )}

            {selectedLog.old_value && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">修改前数据</label>
                <pre className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg overflow-auto max-h-40">
                  {JSON.stringify(selectedLog.old_value, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.new_value && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">修改后数据</label>
                <pre className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg overflow-auto max-h-40">
                  {JSON.stringify(selectedLog.new_value, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.linked_proc_inst_id && (
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">关联审批单</label>
                <div className="text-sm text-indigo-600 dark:text-indigo-400">{selectedLog.linked_proc_inst_id}</div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );

  if (isModal) {
    return content;
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 h-[calc(100vh-200px)] flex flex-col">
      {content}
    </div>
  );
};

export default AttendanceEditLogs;
