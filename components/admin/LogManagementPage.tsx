import React from 'react';
import { LogManagement } from './LogManagement.tsx';
import type { CompanyId } from '../../services/attendanceApiService.ts';

interface LogManagementPageProps {
  companyId?: CompanyId;
}

export const LogManagementPage: React.FC<LogManagementPageProps> = ({ companyId = 'eyewind' }) => {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">系统日志管理</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          查看和管理系统操作日志，包括考勤编辑记录和审计日志。
        </p>
      </header>

      <LogManagement companyId={companyId} isModal={false} />
    </div>
  );
};

export default LogManagementPage;