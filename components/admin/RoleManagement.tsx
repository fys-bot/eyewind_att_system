
import React, { useState, useEffect } from 'react';
import { db, ALL_PERMISSIONS } from '../../database/mockDb.ts';
import type { Role } from '../../database/schema.ts';
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon } from '../Icons.tsx';
import { Modal } from '../Modal.tsx';

export const RoleManagement: React.FC = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    
    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [formData, setFormData] = useState<{ name: string; description: string; permissions: string[] }>({ name: '', description: '', permissions: [] });

    useEffect(() => {
        setRoles(db.getRoles());
    }, []);

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setFormData({ name: role.name, description: role.description, permissions: role.permissions || [] });
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingRole(null);
        setFormData({ name: '', description: '', permissions: [] });
        setIsModalOpen(true);
    };

    const handleDelete = (id: string) => {
        if (confirm('确定要删除此角色吗？关联的用户可能会失去权限。')) {
            db.deleteRole(id);
            setRoles(db.getRoles());
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
        const modulePerms = Object.keys(ALL_PERMISSIONS[moduleName as keyof typeof ALL_PERMISSIONS]);
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

    const handleSubmit = () => {
        if (!formData.name) {
            alert('角色名称为必填项');
            return;
        }

        if (editingRole) {
            db.updateRole(editingRole.id, formData);
        } else {
            db.addRole(formData);
        }
        setRoles(db.getRoles());
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end items-center">
                <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-semibold hover:bg-sky-500 transition-colors shadow-sm">
                    <PlusIcon className="w-4 h-4" /> 新增角色
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map(role => (
                    <div key={role.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="font-bold text-slate-900 dark:text-white text-lg">{role.name}</h3>
                            <div className="flex gap-1">
                                <button onClick={() => handleEdit(role)} className="p-1.5 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                                    <PencilIcon className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(role.id)} className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
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
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 pb-2 border-b border-slate-100 dark:border-slate-700">权限配置</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8 max-h-[400px] overflow-y-auto pr-2">
                            {Object.entries(ALL_PERMISSIONS).map(([moduleName, perms]) => {
                                const modulePermKeys = Object.keys(perms);
                                const selectedCount = modulePermKeys.filter(k => formData.permissions.includes(k)).length;
                                const isAllSelected = selectedCount === modulePermKeys.length;
                                const isIndeterminate = selectedCount > 0 && !isAllSelected;

                                return (
                                    <div key={moduleName} className="space-y-2">
                                        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-700">
                                            <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{moduleName}</h5>
                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${isAllSelected || isIndeterminate ? 'bg-sky-500 border-sky-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}>
                                                    {isAllSelected && <CheckIcon className="w-2.5 h-2.5 text-white" />}
                                                    {isIndeterminate && <div className="w-2 h-0.5 bg-white rounded-full" />}
                                                </div>
                                                <input 
                                                    type="checkbox" 
                                                    className="hidden" 
                                                    checked={isAllSelected} 
                                                    onChange={() => toggleModulePermissions(moduleName, isAllSelected)}
                                                />
                                                <span className="text-[10px] text-slate-400 select-none">全选</span>
                                            </label>
                                        </div>
                                        <div className="space-y-1">
                                            {Object.entries(perms).map(([key, label]) => {
                                                const isChecked = formData.permissions.includes(key);
                                                return (
                                                    <label key={key} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer group transition-colors">
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-sky-500 border-sky-500' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 group-hover:border-sky-400'}`}>
                                                            {isChecked && <CheckIcon className="w-3 h-3 text-white" />}
                                                        </div>
                                                        <input 
                                                            type="checkbox" 
                                                            className="hidden" 
                                                            checked={isChecked} 
                                                            onChange={() => togglePermission(key)}
                                                        />
                                                        <span className={`text-sm ${isChecked ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                                                            {label}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
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
