
import React, { useState } from 'react';
import { UserIcon, ShieldCheckIcon, HistoryIcon } from '../Icons.tsx';
import { UserManagement } from './UserManagement.tsx';
import { RoleManagement } from './RoleManagement.tsx';
import { AuditLogViewer } from './AuditLogViewer.tsx';

export const AdminPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'audit'>('users');

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">账号与权限管理</h2>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                    管理系统后台账号、角色分配、功能权限控制及查看操作日志。
                </p>
            </header>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[600px] flex flex-col">
                {/* Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
                            activeTab === 'users'
                                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <UserIcon className="w-4 h-4" />
                        用户管理
                    </button>
                    <button
                        onClick={() => setActiveTab('roles')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
                            activeTab === 'roles'
                                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <ShieldCheckIcon className="w-4 h-4" />
                        角色权限
                    </button>
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
                            activeTab === 'audit'
                                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <HistoryIcon className="w-4 h-4" />
                        审计日志
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1">
                    {activeTab === 'users' ? (
                        <UserManagement />
                    ) : activeTab === 'roles' ? (
                        <RoleManagement />
                    ) : (
                        <AuditLogViewer />
                    )}
                </div>
            </div>
        </div>
    );
};
