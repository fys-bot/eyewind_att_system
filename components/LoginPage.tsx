
import React, { useState } from 'react';
import { AttendanceLogoIcon } from './Icons.tsx';
import type { User } from '../database/schema.ts';
import * as userApi from '../services/userApiService.ts';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError('');
      
      const response = await userApi.login({
        username: username.trim(),
        password: password
      });
      
      // 转换后端返回的数据为前端 User 类型
      const user: User = {
        id: response.user_id,
        name: response.name,
        email: response.email,
        roleId: response.roleId,
        roleName: response.roleName,
        permissions: response.permissions,
        status: response.status as 'active' | 'inactive',
        lastLogin: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '用户名或密码错误');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <AttendanceLogoIcon className="w-16 h-16 text-sky-500 mx-auto" />
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mt-4">考勤管理系统</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">欢迎回来，请登录您的账号</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              用户名
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="请输入用户名"
              required
            />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              密码
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="请输入密码"
              required
            />
          </div>
          {error && <p className="text-red-500 dark:text-red-400 text-sm text-center mb-4">{error}</p>}
          <button
            type="submit"
            className="w-full bg-sky-600 text-white font-bold py-2 px-4 rounded-md hover:bg-sky-500 transition-colors duration-200 disabled:bg-slate-400 dark:disabled:bg-slate-600"
            disabled={!username.trim() || !password.trim() || loading}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
};
