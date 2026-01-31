
import React, { useState, useEffect } from 'react';
import { db } from '../../database/mockDb.ts';
import type { AuditLog } from '../../database/schema.ts';
import { RefreshCwIcon, SearchIcon, FilterIcon } from '../Icons.tsx';

export const AuditLogViewer: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterAction, setFilterAction] = useState<string>('ALL');

    const loadLogs = () => {
        setLogs(db.getAuditLogs());
    };

    useEffect(() => {
        loadLogs();
    }, []);

    const filteredLogs = logs.filter(log => {
        const matchesSearch = 
            log.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
            (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (log.target && log.target.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesAction = filterAction === 'ALL' || log.action === filterAction;

        return matchesSearch && matchesAction;
    });

    const getActionBadge = (action: string) => {
        const styles: Record<string, string> = {
            'LOGIN': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
            'DOWNLOAD': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
            'EDIT': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
            'SEND': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
            'RECALL': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
            'ARCHIVE': 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
        };
        return <span className={`px-2 py-0.5 rounded text-xs font-bold ${styles[action] || 'bg-gray-100'}`}>{action}</span>;
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex gap-4 items-center">
                    <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="搜索用户、详情..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <FilterIcon className="w-4 h-4 text-slate-400" />
                        <select 
                            value={filterAction} 
                            onChange={e => setFilterAction(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                            <option value="ALL">所有操作</option>
                            <option value="LOGIN">登录</option>
                            <option value="DOWNLOAD">下载</option>
                            <option value="EDIT">编辑</option>
                            <option value="SEND">发送通知</option>
                            <option value="RECALL">撤回通知</option>
                            <option value="ARCHIVE">存档</option>
                        </select>
                    </div>
                </div>
                <button onClick={loadLogs} className="p-2 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm transition-all" title="刷新日志">
                    <RefreshCwIcon className="w-4 h-4" />
                </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
                <div className="max-h-[600px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 w-48">时间</th>
                                <th className="px-6 py-3 w-40">操作人</th>
                                <th className="px-6 py-3 w-32">角色</th>
                                <th className="px-6 py-3 w-24">动作</th>
                                <th className="px-6 py-3 w-48">对象</th>
                                <th className="px-6 py-3">详情内容</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filteredLogs.length > 0 ? filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs whitespace-nowrap">
                                        {new Date(log.timestamp).toLocaleString('zh-CN')}
                                    </td>
                                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{log.userName}</td>
                                    <td className="px-6 py-3 text-slate-500 dark:text-slate-400 text-xs">{log.userRole}</td>
                                    <td className="px-6 py-3">{getActionBadge(log.action)}</td>
                                    <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-medium truncate max-w-xs" title={log.target}>{log.target || '-'}</td>
                                    <td className="px-6 py-3 text-slate-600 dark:text-slate-400 break-all">{log.details || '-'}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">暂无日志记录</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
