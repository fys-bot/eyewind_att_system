import React from 'react';
import { ModelManagement } from './ModelManagement.tsx';

export const ModelManagementPage: React.FC = () => {
    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">AI 模型管理</h2>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                    为不同的功能模块配置使用的 AI 模型，优化系统性能和成本。
                </p>
            </header>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[600px] p-6">
                <ModelManagement />
            </div>
        </div>
    );
};
