import React, { useState, useEffect } from 'react';
import { SaveIcon, AlertTriangleIcon, LockIcon, UnlockIcon, LinkIcon } from '../Icons.tsx';
import useLocalStorage from '../../hooks/useLocalStorage.ts';
import { DEFAULT_CONFIGS } from '../attendance/utils.ts';
import type { CompanyConfigs } from '../../database/schema.ts';

const CONFIG_KEY = 'COMPANY_CONFIGS';
const CACHE_PREFIX = 'LINGOSYNC_CACHE_';

export const ParameterSettingsPage: React.FC = () => {
    // We store the full config object in local storage
    const [storedConfigs, setStoredConfigs] = useLocalStorage<CompanyConfigs>(CONFIG_KEY, DEFAULT_CONFIGS);
    
    const [selectedCompany, setSelectedCompany] = useState<'eyewind' | 'hydodo'>('eyewind');
    
    const [formData, setFormData] = useState({
        appkey: '',
        appsecret: '',
        agent_id: '',
        token: ''
    });
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [isTokenLocked, setIsTokenLocked] = useState(true);

    // Load initial data for selected company
    useEffect(() => {
        // Merge stored config with defaults to ensure all keys exist
        const currentConfig = storedConfigs[selectedCompany] || DEFAULT_CONFIGS[selectedCompany];
        
        // Try to fetch the cached active token for this company
        let activeToken = currentConfig.token || '';
        if (!activeToken) {
            try {
                const cacheKey = `${CACHE_PREFIX}TOKEN_${selectedCompany}`;
                const cachedTokenItem = localStorage.getItem(cacheKey);
                if (cachedTokenItem) {
                    const parsed = JSON.parse(cachedTokenItem);
                    if (parsed && parsed.data) {
                        activeToken = parsed.data;
                    }
                }
            } catch (e) {
                console.error("Error reading cached token", e);
            }
        }

        setFormData({
            appkey: currentConfig.appkey || '',
            appsecret: currentConfig.appsecret || '',
            agent_id: currentConfig.agent_id || '',
            token: activeToken
        });
        
        // Reset lock state when switching companies
        setIsTokenLocked(true);
    }, [selectedCompany, storedConfigs]);

    const handleSave = () => {
        try {
            setStoredConfigs(prev => ({
                ...prev,
                [selectedCompany]: { 
                    ...prev[selectedCompany],
                    appkey: formData.appkey,
                    appsecret: formData.appsecret,
                    agent_id: formData.agent_id
                    // Token is usually not saved back to config permanently unless manual override, keeping it as is from form data logic if needed
                }
            }));
            setStatusMessage({ type: 'success', text: '参数已保存并全局生效。' });
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (e) {
            setStatusMessage({ type: 'error', text: '保存失败。' });
        }
    };

    const handleReset = () => {
        if (confirm('确定要重置为系统默认值吗？这将覆盖您当前的修改。')) {
            const defaults = DEFAULT_CONFIGS[selectedCompany];
            setFormData({
                appkey: defaults.appkey,
                appsecret: defaults.appsecret,
                agent_id: defaults.agent_id,
                token: defaults.token || ''
            });
            setStatusMessage({ type: 'success', text: '已重置为默认值 (未保存，请点击保存以生效)。' });
        }
    };

    const handleToggleLock = () => {
        if (isTokenLocked) {
            const confirmUnlock = window.confirm("警告：手动修改 Access Token 可能导致系统无法正常拉取数据或推送消息，严重时会导致系统瘫痪。\n\n通常情况下，系统会自动管理 Token，无需人工干预。\n\n确定要解锁编辑吗？");
            if (confirmUnlock) {
                setIsTokenLocked(false);
            }
        } else {
            setIsTokenLocked(true);
        }
    };

    const DataCapabilityBadge: React.FC<{ label: string; active: boolean }> = ({ label, active }) => (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${active ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
            <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
            <span className="text-xs font-semibold">{label}</span>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <header className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">参数管理</h2>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">
                        管理钉钉接口连接参数和系统配置。
                    </p>
                </div>
                <div className="flex gap-2 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => setSelectedCompany('eyewind')}
                        className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${selectedCompany === 'eyewind' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    >
                        风眼 (Eyewind)
                    </button>
                    <button
                        onClick={() => setSelectedCompany('hydodo')}
                        className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${selectedCompany === 'hydodo' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    >
                        海多多 (Hydodo)
                    </button>
                </div>
            </header>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 min-h-[500px] flex flex-col">
                <div className="p-6 flex-1">
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <LinkIcon className="w-5 h-5 text-sky-500" /> 钉钉接口配置
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">AppKey</label>
                                    <input type="text" value={formData.appkey} onChange={e => setFormData({ ...formData, appkey: e.target.value })} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none font-mono" placeholder="请输入 AppKey" />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Agent ID</label>
                                    <input type="text" value={formData.agent_id} onChange={e => setFormData({ ...formData, agent_id: e.target.value })} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none font-mono" placeholder="请输入 Agent ID" />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">AppSecret</label>
                                    <input type="password" value={formData.appsecret} onChange={e => setFormData({ ...formData, appsecret: e.target.value })} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none font-mono" placeholder="请输入 AppSecret" />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Access Token (自动获取)</label>
                                        <button onClick={handleToggleLock} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" title={isTokenLocked ? "点击解锁编辑" : "点击锁定"}>
                                            {isTokenLocked ? <LockIcon className="w-4 h-4 text-slate-500" /> : <UnlockIcon className="w-4 h-4 text-red-500" />}
                                        </button>
                                    </div>
                                    <textarea value={formData.token} onChange={e => setFormData({ ...formData, token: e.target.value })} readOnly={isTokenLocked} className={`w-full px-3 py-2 border rounded-lg text-xs text-slate-500 focus:ring-2 focus:ring-sky-500 outline-none font-mono h-20 resize-none ${isTokenLocked ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-75' : 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`} placeholder="Token 将在此处显示..." />
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">数据能力透视</h4>
                            <div className="flex flex-wrap gap-4">
                                <DataCapabilityBadge label="员工花名册 (API)" active={!!formData.token} />
                                <DataCapabilityBadge label="原始打卡记录 (API)" active={!!formData.token} />
                                <DataCapabilityBadge label="审批单据详情 (API)" active={!!formData.token} />
                            </div>
                            <p className="text-xs text-slate-400 mt-2">只有当接口配置正确时，上述数据能力才能正常工作。绿色指示灯表示理论上已配置 Token。</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center rounded-b-xl">
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                        <AlertTriangleIcon className="w-3.5 h-3.5" />
                        <span>修改参数将影响系统与钉钉的连接状态。</span>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={handleReset} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">重置默认</button>
                        <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-500 transition-colors shadow-sm">
                            <SaveIcon className="w-4 h-4" /> 保存配置
                        </button>
                    </div>
                </div>
            </div>
            {statusMessage && (
                <div className={`fixed bottom-8 right-8 px-6 py-3 rounded-lg shadow-lg text-sm font-semibold animate-in slide-in-from-bottom-4 duration-300 ${statusMessage.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                    {statusMessage.text}
                </div>
            )}
        </div>
    );
};