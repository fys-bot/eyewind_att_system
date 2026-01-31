
import React, { useState } from 'react';
import type { User } from '../database/schema.ts';
import { 
    UserIcon, 
    ShieldCheckIcon, 
    BellIcon, 
    SunIcon, 
    MoonIcon, 
    GlobeAltIcon, 
    SaveIcon, 
    AlertTriangleIcon,
    CreditCardIcon
} from './Icons.tsx';
import { db } from '../database/mockDb.ts';


const mockAvatars = [
    (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 36 36" fill="none" role="img" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" {...props}><mask id=":r1:" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"></rect></mask><g mask="url(#:r1:)"><rect width="36" height="36" fill="#ff7d10"></rect><rect x="0" y="0" width="36" height="36" transform="translate(4 4) rotate(340 18 18) scale(1.1)" fill="#0c8f8f" rx="36"></rect><g transform="translate(6 -1) rotate(0 18 18)"><path d="M15 21c2 1 4 1 6 0" stroke="#FFFFFF" fill="none" strokeLinecap="round"></path><rect x="11" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect><rect x="23" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect></g></g></svg>,
    (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 36 36" fill="none" role="img" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" {...props}><mask id=":r2:" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"></rect></mask><g mask="url(#:r2:)"><rect width="36" height="36" fill="#ffb238"></rect><rect x="0" y="0" width="36" height="36" transform="translate(0 0) rotate(268 18 18) scale(1)" fill="#7a2828" rx="36"></rect><g transform="translate(4.5 6.5) rotate(-8 18 18)"><path d="M13,21 a1,0.75 0 0,0 10,0" fill="#FFFFFF"></path><rect x="10" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect><rect x="24" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect></g></g></svg>,
    (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 36 36" fill="none" role="img" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" {...props}><mask id=":r3:" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"></rect></mask><g mask="url(#:r3:)"><rect width="36" height="36" fill="#0c8f8f"></rect><rect x="0" y="0" width="36" height="36" transform="translate(-4 4) rotate(350 18 18) scale(1.2)" fill="#ff7d10" rx="36"></rect><g transform="translate(2.5 -1.5) rotate(10 18 18)"><path d="M15 21c2 1 4 1 6 0" stroke="#FFFFFF" fill="none" strokeLinecap="round"></path><rect x="11" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect><rect x="23" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect></g></g></svg>,
    (props: React.SVGProps<SVGSVGElement>) => <svg viewBox="0 0 36 36" fill="none" role="img" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" {...props}><mask id=":r4:" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"></rect></mask><g mask="url(#:r4:)"><rect width="36" height="36" fill="#7a2828"></rect><rect x="0" y="0" width="36" height="36" transform="translate(9 9) rotate(20 18 18) scale(1.2)" fill="#ffb238" rx="6"></rect><g transform="translate(1.5 2.5) rotate(-10 18 18)"><path d="M15,19 a1,1 0 0,0 6,0" fill="#FFFFFF"></path><rect x="13" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect><rect x="21" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect></g></g></svg>,
];

const Section: React.FC<{ title: string; description: string; children: React.ReactNode; }> = ({ title, description, children }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-8">
        <div className="md:col-span-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
        </div>
        <div className="md:col-span-2 space-y-4">
            {children}
        </div>
    </div>
);

const TabButton: React.FC<{ label: string; icon: React.ReactNode; isActive: boolean; onClick: () => void; disabled?: boolean }> = ({ label, icon, isActive, onClick, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
            isActive
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
        {icon}
        {label}
    </button>
);

type Theme = 'light' | 'dark' | 'system';

interface AccountPageProps {
    user: User;
    theme: Theme;
    setTheme: (theme: Theme) => void;
    language: string;
    setLanguage: (language: string) => void;
    onLogout: () => void;
}

const AccountPage: React.FC<AccountPageProps> = ({ user, theme, setTheme, language, setLanguage, onLogout }) => {
    const [activeTab, setActiveTab] = useState('profile');

    // Profile state
    const [displayName, setDisplayName] = useState(user.name);
    const [selectedAvatarIndex, setSelectedAvatarIndex] = useState(user.id.charCodeAt(1) % mockAvatars.length);
    const [profileMessage, setProfileMessage] = useState<string | null>(null);

    // Security state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordMessage, setPasswordMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
    
    // Danger Zone state
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
    
    const userEmail = `${user.name.toLowerCase().replace(/\s/g, '.')}@lingosync.ai`;

     const handleSaveProfile = () => {
        setProfileMessage('个人资料已成功更新！');
        setTimeout(() => setProfileMessage(null), 3000);
    };
    
    const handleChangePassword = () => {
        setPasswordMessage(null);
        if (!currentPassword || !newPassword || !confirmPassword) {
            setPasswordMessage({ type: 'error', text: '所有字段均为必填项。' });
            return;
        }
        if (db.authenticate(user.name, currentPassword) === null) {
            setPasswordMessage({ type: 'error', text: '当前密码不正确。' });
            return;
        }
        if (newPassword.length < 6) {
            setPasswordMessage({ type: 'error', text: '新密码至少需要6个字符。' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMessage({ type: 'error', text: '新密码与确认密码不匹配。' });
            return;
        }

        // Update stored password
        db.updateUser(user.id, { password: newPassword });

        setPasswordMessage({ type: 'success', text: '密码已成功更新！' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordMessage(null), 3000);
    };

    const handleDeleteAccount = () => {
        if (deleteConfirmInput === user.name) {
            onLogout();
        }
    };

    const inputStyles = "w-full max-w-sm bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900 dark:text-white";
    const labelStyles = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2";

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">账号设置</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8">管理您的个人资料、安全设置和应用偏好。</p>
            
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex border-b border-slate-200 dark:border-slate-700 space-x-2 px-6">
                    <TabButton label="个人资料" icon={<UserIcon />} isActive={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
                    <TabButton label="安全" icon={<ShieldCheckIcon />} isActive={activeTab === 'security'} onClick={() => setActiveTab('security')} />
                    <TabButton label="偏好" icon={<BellIcon />} isActive={activeTab === 'preferences'} onClick={() => setActiveTab('preferences')} />
                    <TabButton label="账单" icon={<CreditCardIcon />} isActive={false} onClick={() => {}} disabled />
                </div>
                
                <div className="px-6 divide-y divide-slate-200 dark:divide-slate-700">
                    {activeTab === 'profile' && (
                       <>
                        <Section title="头像" description="选择一个您喜欢的头像。">
                             <div className="flex items-center gap-4">
                                {mockAvatars.map((AvatarComponent, index) => (
                                    <button 
                                        key={index} 
                                        onClick={() => setSelectedAvatarIndex(index)}
                                        className={`w-16 h-16 rounded-full transition-all duration-200 ${selectedAvatarIndex === index ? 'ring-2 ring-offset-2 ring-sky-500 dark:ring-offset-slate-800' : 'opacity-70 hover:opacity-100'}`}
                                    >
                                        <AvatarComponent />
                                    </button>
                                ))}
                            </div>
                        </Section>
                        <Section title="个人信息" description="更新您的公开资料信息。">
                            <div>
                                <label className={labelStyles}>用户名称</label>
                                <input 
                                    type="text" 
                                    value={displayName} 
                                    onChange={(e) => setDisplayName(e.target.value)} 
                                    className={inputStyles} 
                                />
                            </div>
                            <div>
                                <label className={labelStyles}>邮箱地址</label>
                                <input 
                                    type="email" 
                                    value={userEmail} 
                                    readOnly 
                                    className={`${inputStyles} bg-slate-100 dark:bg-slate-800 cursor-not-allowed`} 
                                />
                            </div>
                        </Section>
                        <div className="flex justify-end pt-6 pb-8">
                            <div>
                                {profileMessage && (
                                    <p className="text-sm text-green-600 dark:text-green-400 mb-4 text-right">{profileMessage}</p>
                                )}
                                <button onClick={handleSaveProfile} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md text-sm font-semibold hover:bg-sky-700 transition-colors">
                                    <SaveIcon className="w-4 h-4" />
                                    保存更改
                                </button>
                            </div>
                        </div>
                       </>
                    )}
                    
                    {activeTab === 'security' && (
                        <>
                            <Section title="更改密码" description="为了您的账户安全，建议您定期更换密码。">
                                <div>
                                    <label className={labelStyles}>当前密码</label>
                                    <input 
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className={inputStyles}
                                        placeholder="输入您当前的密码" 
                                    />
                                </div>
                                <div>
                                    <label className={labelStyles}>新密码</label>
                                    <input 
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className={inputStyles}
                                        placeholder="输入您的新密码" 
                                    />
                                </div>
                                <div>
                                    <label className={labelStyles}>确认新密码</label>
                                    <input 
                                        type="password" 
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className={inputStyles}
                                        placeholder="再次输入您的新密码" 
                                    />
                                </div>
                            </Section>
                             <div className="flex justify-end pt-6 pb-8">
                                <div>
                                     {passwordMessage && (
                                        <div className={`text-sm mb-4 text-right ${passwordMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                            {passwordMessage.text}
                                        </div>
                                    )}
                                    <button 
                                        onClick={handleChangePassword} 
                                        className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-md text-sm font-semibold hover:bg-sky-700 transition-colors"
                                    >
                                        <SaveIcon className="w-4 h-4" />
                                        更新密码
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'preferences' && (
                       <>
                        <Section title="主题" description="选择您喜欢的工作区外观。">
                            <div className="flex space-x-4">
                                 <button onClick={() => setTheme('light')} className={`flex flex-col items-center justify-center w-32 h-20 rounded-lg border-2 transition-colors ${theme === 'light' ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300'}`}>
                                    <SunIcon className="w-6 h-6 mb-1"/>
                                    <span className="text-sm">浅色</span>
                                </button>
                                 <button onClick={() => setTheme('dark')} className={`flex flex-col items-center justify-center w-32 h-20 rounded-lg border-2 transition-colors ${theme === 'dark' ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300'}`}>
                                    <MoonIcon className="w-6 h-6 mb-1"/>
                                    <span className="text-sm">深色</span>
                                </button>
                                <button onClick={() => setTheme('system')} className={`flex flex-col items-center justify-center w-32 h-20 rounded-lg border-2 transition-colors ${theme === 'system' ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300'}`}>
                                    <GlobeAltIcon className="w-6 h-6 mb-1"/>
                                    <span className="text-sm">跟随系统</span>
                                </button>
                            </div>
                        </Section>
                         <Section title="语言" description="选择应用界面的显示语言。">
                            <div className="relative w-full max-w-xs">
                                <GlobeAltIcon className="w-5 h-5 text-slate-500 dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md pl-10 pr-4 py-2 text-slate-900 dark:text-white">
                                    <option value="zh-CN">简体中文</option>
                                    <option value="en-US">English (US)</option>
                                </select>
                            </div>
                        </Section>
                       </>
                    )}

                    <div className="border-t border-red-500/30">
                        <Section title="危险区域" description="这些操作是不可逆的，请谨慎操作。">
                            <button onClick={() => setIsDeleteModalOpen(true)} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-semibold hover:bg-red-700 transition-colors">删除我的账户</button>
                        </Section>
                    </div>
                </div>
            </div>

            {isDeleteModalOpen && (
                 <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700" onClick={e => e.stopPropagation()}>
                        <div className="p-6 space-y-4">
                             <h3 className="text-lg font-bold text-slate-900 dark:text-white">确认删除账户</h3>
                             <p className="text-slate-500 dark:text-slate-400">此操作无法撤销。您的所有数据将被永久删除（在本演示中，您将被登出）。</p>
                             <div>
                                <label htmlFor="delete-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">请输入您的用户名 <strong className="text-slate-900 dark:text-white font-mono">{user.name}</strong> 以确认</label>
                                <input
                                    id="delete-confirm"
                                    type="text"
                                    value={deleteConfirmInput}
                                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                                    className={`w-full bg-slate-50 dark:bg-slate-700 border rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 ${
                                        deleteConfirmInput && deleteConfirmInput !== user.name ? 'border-red-500 focus:ring-red-500' : 'border-slate-300 dark:border-slate-600 focus:ring-sky-500'
                                    }`}
                                    autoFocus
                                />
                             </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-3 flex justify-end gap-3 rounded-b-lg">
                            <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-md border border-slate-300 dark:border-slate-600 transition-colors">取消</button>
                            <button onClick={handleDeleteAccount} disabled={deleteConfirmInput !== user.name} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed">
                                我理解后果，删除此账户
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountPage;
