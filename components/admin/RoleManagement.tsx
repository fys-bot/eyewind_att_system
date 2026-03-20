
import React, { useState, useEffect, useMemo } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon, SearchIcon, XIcon } from '../Icons.tsx';
import { Modal } from '../Modal.tsx';
import * as roleApi from '../../services/roleApiService.ts';

export const RoleManagement: React.FC = () => {
    const [roles, setRoles] = useState<roleApi.Role[]>([]);
    const [allPermissions, setAllPermissions] = useState<roleApi.PermissionsMap>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<roleApi.Role | null>(null);
    const [formData, setFormData] = useState<{ name: string; description: string; permissions: string[] }>({ name: '', description: '', permissions: [] });
    
    // 🔥 搜索功能
    const [searchQuery, setSearchQuery] = useState('');

    // 加载角色列表
    const loadRoles = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await roleApi.getRoles();
            setRoles(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载角色列表失败');
            console.error('加载角色列表失败:', err);
        } finally {
            setLoading(false);
        }
    };

    // 加载权限列表
    const loadPermissions = async () => {
        try {
            const data = await roleApi.getPermissions();
            setAllPermissions(data);
        } catch (err) {
            console.error('加载权限列表失败:', err);
        }
    };

    useEffect(() => {
        loadRoles();
        loadPermissions();
    }, []);

    const handleEdit = (role: roleApi.Role) => {
        setEditingRole(role);
        setFormData({ name: role.name, description: role.description, permissions: role.permissions || [] });
        setSearchQuery(''); // 🔥 重置搜索
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingRole(null);
        setFormData({ name: '', description: '', permissions: [] });
        setSearchQuery(''); // 🔥 重置搜索
        setIsModalOpen(true);
    };

    const handleDelete = async (roleId: string) => {
        if (confirm('确定要删除此角色吗？关联的用户可能会失去权限。')) {
            try {
                await roleApi.deleteRole(roleId);
                await loadRoles();
            } catch (err) {
                alert(err instanceof Error ? err.message : '删除角色失败');
            }
        }
    };

    const togglePermission = (key: string) => {
        setFormData(prev => {
            const hasPerm = prev.permissions.includes(key);
            return {
                ...prev,
                permissions: hasPerm 
                    ? prev.permissions.filter(p => p !== key)
                    : [...prev.permissions, key]
            };
        });
    };

    const toggleModulePermissions = (moduleName: string, allSelected: boolean) => {
        const modulePerms = Object.keys(allPermissions[moduleName] || {});
        setFormData(prev => {
            let newPermissions = [...prev.permissions];
            if (allSelected) {
                // Deselect all
                newPermissions = newPermissions.filter(p => !modulePerms.includes(p));
            } else {
                // Select all (add missing ones)
                const missing = modulePerms.filter(p => !newPermissions.includes(p));
                newPermissions = [...newPermissions, ...missing];
            }
            return { ...prev, permissions: newPermissions };
        });
    };

    const handleSubmit = async () => {
        if (!formData.name) {
            alert('角色名称为必填项');
            return;
        }

        try {
            if (editingRole) {
                await roleApi.updateRole(editingRole.role_id, formData);
                alert('角色配置已成功更新！');
            } else {
                await roleApi.createRole(formData);
                alert('角色已成功创建！');
            }
            await loadRoles();
            setIsModalOpen(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : '保存角色失败');
        }
    };
    
    // 🔥 过滤权限（根据搜索关键词）
    const filteredPermissions = useMemo(() => {
        if (!searchQuery.trim()) return allPermissions;
        
        const query = searchQuery.toLowerCase();
        const filtered: roleApi.PermissionsMap = {};
        
        Object.entries(allPermissions).forEach(([moduleName, perms]) => {
            const matchedPerms: { [key: string]: string } = {};
            
            // 检查模块名是否匹配
            const moduleMatches = moduleName.toLowerCase().includes(query);
            
            Object.entries(perms).forEach(([key, label]) => {
                // 如果模块名匹配，或者权限标签匹配，则包含该权限
                if (moduleMatches || label.toLowerCase().includes(query)) {
                    matchedPerms[key] = label;
                }
            });
            
            if (Object.keys(matchedPerms).length > 0) {
                filtered[moduleName] = matchedPerms;
            }
        });
        
        return filtered;
    }, [allPermissions, searchQuery]);

    return (
        <div className="space-y-4">
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}
            
            <div className="flex justify-end items-center">
                <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-500 transition-colors shadow-sm">
                    <PlusIcon className="w-4 h-4" /> 新增角色
                </button>
            </div>

            {loading ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    加载中...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {roles.map(role => (
                        <div key={role.role_id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-slate-900 dark:text-white text-lg">{role.name}</h3>
                                <div className="flex gap-1">
                                    <button onClick={() => handleEdit(role)} className="p-1.5 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(role.role_id)} className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 h-10 line-clamp-2">{role.description}</p>
                            
                            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg">
                                <CheckIcon className="w-3 h-3 text-green-500" />
                                包含 {role.permissions?.length || 0} 项权限
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingRole ? '配置角色权限' : '创建新角色'} size="2xl">
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">角色名称</label>
                            <input 
                                type="text" 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                placeholder="例如: 财务专员"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">描述</label>
                            <input 
                                type="text" 
                                value={formData.description} 
                                onChange={e => setFormData({...formData, description: e.target.value})}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                                placeholder="职责说明..."
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-700">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">权限配置</h4>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                已选 <span className="font-semibold text-sky-600 dark:text-sky-400">{formData.permissions.length}</span> 项
                            </div>
                        </div>
                        
                        {/* 🔥 搜索框 */}
                        <div className="relative mb-4">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="搜索权限..."
                                className="w-full pl-10 pr-10 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        
                        {/* 🔥 优化后的权限列表 */}
                        <div className="space-y-4 max-h-[450px] overflow-y-auto pr-2">
                            {Object.keys(filteredPermissions).length === 0 ? (
                                <div className="text-center py-8 text-slate-400 dark:text-slate-500">
                                    <SearchIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">未找到匹配的权限</p>
                                </div>
                            ) : (
                                Object.entries(filteredPermissions).map(([moduleName, perms]) => {
                                    const modulePermKeys = Object.keys(perms);
                                    const selectedCount = modulePermKeys.filter(k => formData.permissions.includes(k)).length;
                                    const isAllSelected = selectedCount === modulePermKeys.length;
                                    const isIndeterminate = selectedCount > 0 && !isAllSelected;

                                    return (
                                        <div key={moduleName} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                                            {/* 模块标题 */}
                                            <div className="flex items-center justify-between mb-3">
                                                <h5 className="text-sm font-bold text-slate-700 dark:text-slate-300">{moduleName}</h5>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <span className="text-xs text-slate-500 dark:text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">全选</span>
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isAllSelected || isIndeterminate ? 'bg-sky-500 border-sky-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-sky-400'}`}>
                                                        {isAllSelected && <CheckIcon className="w-3 h-3 text-white" />}
                                                        {isIndeterminate && <div className="w-2 h-0.5 bg-white rounded-full" />}
                                                    </div>
                                                    <input 
                                                        type="checkbox" 
                                                        className="hidden" 
                                                        checked={isAllSelected} 
                                                        onChange={() => toggleModulePermissions(moduleName, isAllSelected)}
                                                    />
                                                </label>
                                            </div>
                                            
                                            {/* 权限列表 - 使用网格布局 */}
                                            <div className="grid grid-cols-1 gap-1.5">
                                                {Object.entries(perms).map(([key, label]) => {
                                                    const isChecked = formData.permissions.includes(key);
                                                    return (
                                                        <label key={key} className="flex items-center gap-2.5 p-2 rounded-md hover:bg-white dark:hover:bg-slate-800 cursor-pointer group transition-colors">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${isChecked ? 'bg-sky-500 border-sky-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-sky-400'}`}>
                                                                {isChecked && <CheckIcon className="w-3 h-3 text-white" />}
                                                            </div>
                                                            <input 
                                                                type="checkbox" 
                                                                className="hidden" 
                                                                checked={isChecked} 
                                                                onChange={() => togglePermission(key)}
                                                            />
                                                            <span className={`text-sm flex-1 ${isChecked ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                                                                {label}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">取消</button>
                        <button onClick={handleSubmit} className="px-6 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors">保存配置</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
