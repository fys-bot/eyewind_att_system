
import React, { useState, useEffect } from 'react';
import type { Role } from '../../database/schema.ts';
import { PlusIcon, PencilIcon, TrashIcon, SearchIcon } from '../Icons.tsx';
import { Modal } from '../Modal.tsx';
import * as userApi from '../../services/userApiService.ts';
import * as roleApi from '../../services/roleApiService.ts';

export const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<userApi.User[]>([]);
    const [roles, setRoles] = useState<roleApi.Role[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<userApi.User | null>(null);
    const [formData, setFormData] = useState({ name: '', email: '', roleId: '', status: 'active', password: '' });

    // 加载用户列表
    const loadUsers = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await userApi.getUsers();
            setUsers(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载用户列表失败');
            console.error('加载用户列表失败:', err);
        } finally {
            setLoading(false);
        }
    };

    // 加载角色列表
    const loadRoles = async () => {
        try {
            const data = await roleApi.getRoles();
            setRoles(data);
        } catch (err) {
            console.error('加载角色列表失败:', err);
        }
    };

    useEffect(() => {
        loadUsers();
        loadRoles();
    }, []);

    const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleEdit = (user: userApi.User) => {
        setEditingUser(user);
        setFormData({ name: user.name, email: user.email || '', roleId: user.roleId, status: user.status, password: '' });
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingUser(null);
        setFormData({ name: '', email: '', roleId: roles[0]?.role_id || '', status: 'active', password: '' });
        setIsModalOpen(true);
    };

    const handleDelete = async (userId: string) => {
        if (confirm('确定要删除此用户吗？此操作不可恢复。')) {
            try {
                await userApi.deleteUser(userId);
                await loadUsers();
            } catch (err) {
                alert(err instanceof Error ? err.message : '删除用户失败');
            }
        }
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.roleId) {
            alert('用户名和角色为必填项');
            return;
        }

        try {
            if (editingUser) {
                await userApi.updateUser(editingUser.user_id, {
                    name: formData.name,
                    email: formData.email || undefined,
                    roleId: formData.roleId,
                    status: formData.status as 'active' | 'inactive',
                    password: formData.password || undefined
                });
                alert('用户信息已成功更新！');
            } else {
                await userApi.createUser({
                    name: formData.name,
                    email: formData.email || undefined,
                    roleId: formData.roleId,
                    status: formData.status as 'active' | 'inactive',
                    password: formData.password || '123456'
                });
                alert('用户已成功创建！');
            }
            await loadUsers();
            setIsModalOpen(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : '保存用户失败');
        }
    };

    return (
        <div className="space-y-4">
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}
            
            <div className="flex justify-between items-center">
                <div className="relative max-w-xs">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="搜索用户..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                </div>
                <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-500 transition-colors shadow-sm">
                    <PlusIcon className="w-4 h-4" /> 新增用户
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    加载中...
                </div>
            ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                <th className="px-6 py-3">用户名</th>
                                <th className="px-6 py-3">角色</th>
                                <th className="px-6 py-3">状态</th>
                                <th className="px-6 py-3">最后登录</th>
                                <th className="px-6 py-3 text-right">操作</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                            {filteredUsers.map(user => (
                                <tr key={user.user_id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-white">{user.name}</td>
                                    <td className="px-6 py-3">
                                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded text-xs">
                                            {user.roleName || 'Unknown'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${
                                            user.status === 'active' 
                                                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' 
                                                : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                                            {user.status === 'active' ? '启用' : '禁用'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-slate-500 dark:text-slate-400 font-mono text-xs">
                                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '-'}
                                    </td>
                                    <td className="px-6 py-3 text-right flex justify-end gap-2">
                                        <button onClick={() => handleEdit(user)} className="p-1.5 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                                            <PencilIcon className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDelete(user.user_id)} className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? '编辑用户' : '新增用户'} size="md">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">用户名</label>
                        <input 
                            type="text" 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">邮箱</label>
                        <input 
                            type="email" 
                            value={formData.email} 
                            onChange={e => setFormData({...formData, email: e.target.value})}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {editingUser ? '密码 (留空则不修改)' : '密码'}
                        </label>
                        <input 
                            type="text" 
                            value={formData.password}
                            onChange={e => setFormData({...formData, password: e.target.value})}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                            placeholder={editingUser ? "若不修改请留空" : "默认为: 123456"}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">角色</label>
                        <select 
                            value={formData.roleId} 
                            onChange={e => setFormData({...formData, roleId: e.target.value})}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                        >
                            {roles.map(role => (
                                <option key={role.role_id} value={role.role_id}>{role.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">状态</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={formData.status === 'active'} onChange={() => setFormData({...formData, status: 'active'})} className="text-sky-600 focus:ring-sky-500" />
                                <span className="text-sm text-slate-700 dark:text-slate-300">启用</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={formData.status === 'inactive'} onChange={() => setFormData({...formData, status: 'inactive'})} className="text-sky-600 focus:ring-sky-500" />
                                <span className="text-sm text-slate-700 dark:text-slate-300">禁用</span>
                            </label>
                        </div>
                    </div>
                    
                    {!editingUser && !formData.password && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-xs">
                            提示: 未填写密码时，默认密码将设置为 <span className="font-mono font-bold">123456</span>。
                        </div>
                    )}

                    <div className="pt-4 flex justify-end gap-3">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">取消</button>
                        <button onClick={handleSubmit} className="px-6 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors">保存</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
