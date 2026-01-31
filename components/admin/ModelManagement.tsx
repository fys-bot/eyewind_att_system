import React, { useState, useEffect, useRef } from 'react';
import { BrainIcon, CheckIcon, ChevronDownIcon, XIcon } from '../Icons.tsx';

interface ModelConfig {
    name: string;
    main_module: string;
    sub_module: string;
    model: {
        value: string;
    };
    model_type: string;
    settings: {
        temperature: number;
        max_tokens: number;
        top_p: number;
        frequency_penalty: number;
        presence_penalty: number;
        logprobs: boolean;
        n: number;
        stream: boolean;
    };
    created_by?: string;
    uid?: string;
}

interface AIModule {
    id: string;
    name: string;
    description: string;
    main_module: string;
    sub_module: string;
}

// 定义项目中使用AI的模块
const AI_MODULES: AIModule[] = [
    {
        id: 'employee_advice',
        name: 'AI 智能管理建议',
        description: '为员工提供个性化的考勤管理建议和改进方案',
        main_module: 'attendance',
        sub_module: 'employee_advice'
    },
    {
        id: 'monthly_diagnosis',
        name: 'AI 智能月度诊断',
        description: '分析公司整体考勤情况，提供月度诊断报告和管理建议',
        main_module: 'attendance',
        sub_module: 'monthly_diagnosis'
    },
    {
        id: 'calendar_analysis',
        name: 'AI 考勤异常分析',
        description: '分析员工考勤日历中的异常模式和规律',
        main_module: 'attendance',
        sub_module: 'calendar_analysis'
    },
    {
        id: 'team_analysis',
        name: 'AI 团队分析',
        description: '分析部门或团队的整体考勤健康度',
        main_module: 'attendance',
        sub_module: 'team_analysis'
    },
    {
        id: 'rule_analysis',
        name: 'AI 规则分析',
        description: '从HR专家视角分析考勤规则配置的合理性、员工体验和管理效能',
        main_module: 'attendance',
        sub_module: 'rule_analysis'
    }
];

// 可用的模型列表 - 按提供商分组
const MODEL_LIST = [
    'xai/grok-code-fast-1', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash-lite',
    'openai/gpt-5.2', 'google/gemini-3-flash', 'anthropic/claude-haiku-4.5',
    'minimax/minimax-m2.1', 'anthropic/claude-opus-4.5', 'anthropic/claude-3.7-sonnet',
    'alibaba/qwen3-next-80b-a3b-instruct', 'google/gemini-3-pro-preview',
    'xai/grok-4.1-fast-non-reasoning', 'anthropic/claude-sonnet-4', 'openai/gpt-4.1-mini',
    'google/gemini-2.5-flash', 'openai/gpt-5-mini', 'minimax/minimax-m2',
    'openai/gpt-5', 'deepseek/deepseek-v3.2', 'openai/gpt-5-nano',
    'zai/glm-4.7', 'openai/gpt-5-codex', 'google/gemini-2.5-pro',
    'openai/gpt-4o-mini', 'google/gemini-2.0-flash', 'openai/gpt-oss-120b',
    'xai/grok-4-fast-non-reasoning', 'openai/gpt-5.1-instant', 'zai/glm-4.6',
    'openai/gpt-oss-safeguard-20b', 'openai/gpt-5.1-thinking', 'mistral/devstral-2',
    'openai/gpt-4o', 'openai/gpt-5-chat', 'xai/grok-4.1-fast-reasoning',
    'openai/text-embedding-3-small', 'anthropic/claude-opus-4.1', 'openai/o3',
    'deepseek/deepseek-v3.2-thinking', 'mistral/ministral-3b', 'mistral/devstral-small-2',
    'mistral/mistral-embed', 'openai/gpt-4.1-nano', 'mistral/ministral-14b',
    'xai/grok-4-fast-reasoning', 'openai/gpt-4.1', 'openai/gpt-oss-20b',
    'openai/gpt-5.2-chat', 'xai/grok-4', 'minimax/minimax-m2.1-lightning',
    'openai/gpt-5.1-codex-max', 'mistral/mistral-small', 'google/gemini-3-pro-image',
    'google/gemini-2.5-flash-image', 'perplexity/sonar', 'moonshotai/kimi-k2-0905',
    'amazon/nova-lite', 'openai/text-embedding-3-large', 'openai/gpt-5.1-codex-mini',
    'google/gemini-embedding-001', 'openai/o4-mini', 'google/gemini-2.0-flash-lite',
    'xai/grok-3-mini', 'xiaomi/mimo-v2-flash', 'google/gemini-2.5-flash-preview-09-2025',
    'moonshotai/kimi-k2-turbo', 'deepseek/deepseek-v3.2-exp', 'google/gemini-2.5-flash-lite-preview-09-2025',
    'openai/gpt-5.1-codex', 'perplexity/sonar-pro', 'deepseek/deepseek-v3',
    'meta/llama-3.3-70b', 'deepseek/deepseek-r1', 'anthropic/claude-3.5-haiku',
    'alibaba/qwen3-max', 'moonshotai/kimi-k2', 'openai/o3-mini',
    'mistral/mistral-large-3', 'meta/llama-3.1-8b', 'anthropic/claude-3.5-sonnet',
    'deepseek/deepseek-v3.1-terminus', 'mistral/pixtral-12b', 'anthropic/claude-opus-4',
    'xai/grok-2-vision', 'meta/llama-4-scout', 'alibaba/qwen-3-32b',
    'alibaba/qwen3-next-80b-a3b-thinking', 'cohere/embed-v4.0', 'moonshotai/kimi-k2-thinking',
    'alibaba/qwen-3-235b', 'moonshotai/kimi-k2-thinking-turbo', 'google/text-embedding-005',
    'mistral/codestral', 'mistral/ministral-8b', 'zai/glm-4.6v',
    'zai/glm-4.6v-flash', 'amazon/nova-micro', 'openai/text-embedding-ada-002',
    'vercel/v0-1.0-md', 'alibaba/qwen3-vl-instruct', 'mistral/pixtral-large',
    'meituan/longcat-flash-chat', 'anthropic/claude-3-haiku', 'meta/llama-4-maverick',
    'zai/glm-4.5-air', 'openai/gpt-4-turbo', 'kwaipilot/kat-coder-pro-v1',
    'perplexity/sonar-reasoning-pro', 'zai/glm-4.5v', 'xai/grok-3',
    'google/text-multilingual-embedding-002', 'alibaba/qwen3-coder-plus',
    'nvidia/nemotron-nano-9b-v2', 'openai/codex-mini', 'voyage/voyage-3.5',
    'nvidia/nemotron-nano-12b-v2-vl', 'xai/grok-3-fast', 'meta/llama-3.2-3b',
    'nvidia/nemotron-3-nano-30b-a3b', 'mistral/magistral-medium', 'alibaba/qwen3-coder-30b-a3b',
    'cohere/command-a', 'alibaba/qwen3-embedding-8b', 'xai/grok-3-mini-fast',
    'prime-intellect/intellect-3', 'anthropic/claude-3.5-sonnet-20240620', 'voyage/voyage-3-large',
    'mistral/mistral-medium', 'openai/gpt-5-pro', 'openai/o3-deep-research',
    'alibaba/qwen3-coder', 'amazon/titan-embed-text-v2', 'zai/glm-4.5',
    'xai/grok-2', 'anthropic/claude-3-opus', 'amazon/nova-2-lite',
    'meta/llama-3.2-1b', 'mistral/mistral-nemo', 'meta/llama-3.1-70b',
    'alibaba/qwen3-embedding-0.6b', 'alibaba/qwen3-embedding-4b', 'alibaba/qwen-3-30b',
    'amazon/nova-pro', 'openai/o1', 'voyage/voyage-3.5-lite',
    'stealth/sonoma-sky-alpha', 'stealth/sonoma-dusk-alpha', 'mistral/devstral-small',
    'morph/morph-v3-large', 'mistral/codestral-embed', 'google/imagen-4.0-generate-001',
    'bfl/flux-2-pro', 'bfl/flux-pro-1.1-ultra', 'bfl/flux-2-flex',
    'perplexity/sonar-reasoning', 'bfl/flux-kontext-pro', 'google/imagen-4.0-fast-generate-001',
    'bfl/flux-kontext-max', 'bfl/flux-pro-1.1', 'google/imagen-4.0-ultra-generate-001',
    'bfl/flux-pro-1.0-fill', 'meituan/longcat-flash-thinking', 'alibaba/qwen3-235b-a22b-thinking',
    'alibaba/qwen3-max-preview', 'arcee-ai/trinity-mini', 'bfl/flux-2-max',
    'bytedance/seed-1.6', 'inception/mercury-coder-small', 'meta/llama-3.2-11b',
    'meta/llama-3.2-90b', 'mistral/magistral-small', 'mistral/mixtral-8x22b-instruct',
    'openai/gpt-3.5-turbo-instruct', 'openai/o3-pro', 'voyage/voyage-code-2',
    'voyage/voyage-code-3', 'voyage/voyage-finance-2', 'voyage/voyage-law-2'
];

interface ModelGroup {
    provider: string;
    models: string[];
}

// 将模型列表按提供商分组
const groupModelsByProvider = (): ModelGroup[] => {
    const groups: Record<string, string[]> = {};

    MODEL_LIST.forEach(model => {
        const [provider, ...modelParts] = model.split('/');
        const modelName = modelParts.join('/');

        if (!groups[provider]) {
            groups[provider] = [];
        }
        groups[provider].push(modelName);
    });

    // 转换为数组并排序
    return Object.entries(groups)
        .map(([provider, models]) => ({
            provider: provider.toUpperCase(),
            models: models.sort()
        }))
        .sort((a, b) => a.provider.localeCompare(b.provider));
};

const AVAILABLE_MODELS = groupModelsByProvider();

// 自定义可搜索的模型选择器组件
const ModelSelector: React.FC<{
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // 点击外部关闭下拉框
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            // 自动聚焦搜索框
            setTimeout(() => searchInputRef.current?.focus(), 0);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    // 过滤模型
    const filteredModels = AVAILABLE_MODELS.map(group => ({
        ...group,
        models: group.models.filter(model =>
            model.toLowerCase().includes(searchTerm.toLowerCase()) ||
            group.provider.toLowerCase().includes(searchTerm.toLowerCase())
        )
    })).filter(group => group.models.length > 0);

    // 获取当前选中的模型显示名称
    const getDisplayValue = () => {
        if (!value) return '选择模型...';
        return value;
    };

    const handleSelect = (modelValue: string) => {
        onChange(modelValue);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div ref={dropdownRef} className="relative flex-1 max-w-xs">
            {/* 选择器按钮 */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
            >
                <span className={`truncate ${!value ? 'text-slate-500 dark:text-slate-400' : ''}`}>
                    {getDisplayValue()}
                </span>
                <ChevronDownIcon className={`w-4 h-4 flex-shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* 下拉菜单 */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg">
                    {/* 搜索框 */}
                    <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="relative">
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="搜索模型..."
                                className="w-full px-3 py-2 pr-8 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                >
                                    <XIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 模型列表 */}
                    <div className="max-h-80 overflow-y-auto">
                        {filteredModels.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                                未找到匹配的模型
                            </div>
                        ) : (
                            filteredModels.map(group => (
                                <div key={group.provider}>
                                    {/* 提供商标题 */}
                                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 sticky top-0">
                                        {group.provider}
                                    </div>
                                    {/* 模型列表 */}
                                    {group.models.map(model => {
                                        const fullModelName = `${group.provider.toLowerCase()}/${model}`;
                                        const isSelected = value === fullModelName;
                                        return (
                                            <button
                                                key={fullModelName}
                                                onClick={() => handleSelect(fullModelName)}
                                                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between ${isSelected ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400' : 'text-slate-700 dark:text-slate-300'
                                                    }`}
                                            >
                                                <span className="truncate">{model}</span>
                                                {isSelected && <CheckIcon className="w-4 h-4 flex-shrink-0 ml-2" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const API_BASE_URL = 'https://eyewind.cn';
const TOKEN_API_URL = 'https://eyewind.cn/admin/token';

// 全局加载状态管理（防止StrictMode重复加载）
let globalLoadingState = {
    isLoading: false,
    loadPromise: null as Promise<Map<string, ModelConfig>> | null,
    lastLoadTime: 0,
    configs: new Map<string, ModelConfig>()
};

// 缓存有效期（5分钟）
const CONFIG_CACHE_TIME = 5 * 60 * 1000;

export const ModelManagement: React.FC = () => {
    const [modelConfigs, setModelConfigs] = useState<Map<string, ModelConfig>>(new Map());
    const [loading, setLoading] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [authToken, setAuthToken] = useState<string>('');
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    // Token缓存时间（5分钟）
    const TOKEN_CACHE_TIME = 5 * 60 * 1000;

    // 获取当前用户信息（从localStorage或其他地方）
    const getCurrentUser = () => {
        // 这里需要根据实际情况获取用户信息
        const userStr = localStorage.getItem('currentUser');
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch {
                return { name: '管理员', uid: 'admin' };
            }
        }
        return { name: '管理员', uid: 'admin' };
    };

    // 获取登录凭证
    const getLoginCredentials = () => {
        // 从 localStorage 或其他地方获取登录凭证
        const credentials = localStorage.getItem('loginCredentials');
        if (credentials) {
            try {
                return JSON.parse(credentials);
            } catch {
                return { name: 'yongsen', password: 'fengyongsen' };
            }
        }
        return { name: 'yongsen', password: 'fengyongsen' };
    };

    // 获取 Bearer Token（用于调用 token 接口）
    const getBearerToken = () => {
        return localStorage.getItem('bearerToken') || '';
    };

    // 检查Token是否有效
    const isTokenValid = () => {
        const token = localStorage.getItem('authToken');
        const tokenTime = localStorage.getItem('authTokenTime');
        
        if (!token || !tokenTime) {
            return false;
        }
        
        const now = Date.now();
        const tokenTimestamp = parseInt(tokenTime, 10);
        
        return (now - tokenTimestamp) < TOKEN_CACHE_TIME;
    };

    // 获取 Auth Token（从 token 接口返回，带缓存）
    const fetchAuthToken = async (): Promise<string> => {
        // 检查缓存的Token是否有效
        if (isTokenValid()) {
            const cachedToken = localStorage.getItem('authToken')!;
            console.log('[ModelManagement] 使用缓存的Token');
            setAuthToken(cachedToken);
            return cachedToken;
        }

        console.log('[ModelManagement] Token已过期或不存在，重新获取');
        
        try {
            const credentials = getLoginCredentials();
            const bearerToken = getBearerToken();

            const response = await fetch(TOKEN_API_URL, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json',
                    'authorization': `Bearer ${bearerToken}`
                },
                body: JSON.stringify({
                    name: credentials.name,
                    password: credentials.password
                }),
            });

            if (!response.ok) {
                throw new Error('获取 token 失败');
            }

            const data = await response.json();
            const token = data.token || data.data?.token || '';

            if (token) {
                setAuthToken(token);
                // 缓存 token 和时间戳
                localStorage.setItem('authToken', token);
                localStorage.setItem('authTokenTime', Date.now().toString());
                console.log('[ModelManagement] Token已更新并缓存');
            }

            return token;
        } catch (err) {
            console.error('Failed to fetch auth token:', err);
            throw err;
        }
    };

    // 全局加载配置函数（防止重复加载）
    const loadAllConfigsGlobal = async (): Promise<Map<string, ModelConfig>> => {
        // 检查缓存是否有效
        const now = Date.now();
        if (globalLoadingState.configs.size > 0 && 
            (now - globalLoadingState.lastLoadTime) < CONFIG_CACHE_TIME) {
            console.log('[ModelManagement] 使用缓存的配置数据');
            return globalLoadingState.configs;
        }

        // 如果正在加载，返回现有的Promise
        if (globalLoadingState.isLoading && globalLoadingState.loadPromise) {
            console.log('[ModelManagement] 正在加载中，等待现有请求完成');
            return globalLoadingState.loadPromise;
        }

        // 开始新的加载
        console.log('[ModelManagement] 开始新的加载请求');
        globalLoadingState.isLoading = true;
        
        const loadPromise = (async () => {
            try {
                const user = getCurrentUser();
                
                // 先获取 token（带缓存）
                const token = await fetchAuthToken();
                console.log('[ModelManagement] 开始加载所有模块配置');

                // 并发加载所有模块配置
                const loadPromises = AI_MODULES.map(async (module) => {
                    try {
                        console.log(`[ModelManagement] 加载模块配置: ${module.name}`);
                        const response = await fetch(`${API_BASE_URL}/admin/chatgpt/model/query`, {
                            method: 'POST',
                            headers: {
                                'accept': '*/*',
                                'content-type': 'application/json',
                                'authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                main_module: module.main_module,
                                sub_module: module.sub_module,
                                uid: user.uid,
                                model_type: 'single'
                            }),
                        });

                        const data = await response.json();

                        // 处理不同的返回数据结构
                        if (data) {
                            const configData = data.data || data;

                            if (configData.model || configData.model_name) {
                                const modelConfig = {
                                    ...configData,
                                    model: configData.model || { value: configData.model_name }
                                };
                                return { moduleId: module.id, config: modelConfig };
                            } else {
                                console.warn(`[${module.id}] No model data in response`);
                                return null;
                            }
                        }
                        return null;
                    } catch (err) {
                        console.error(`Failed to load config for ${module.name}:`, err);
                        return null;
                    }
                });

                // 等待所有请求完成
                const results = await Promise.all(loadPromises);
                
                // 构建配置Map
                const newConfigs = new Map<string, ModelConfig>();
                results.forEach(result => {
                    if (result) {
                        newConfigs.set(result.moduleId, result.config);
                    }
                });

                // 更新全局状态
                globalLoadingState.configs = newConfigs;
                globalLoadingState.lastLoadTime = Date.now();
                
                console.log('[ModelManagement] 所有模块配置加载完成');
                return newConfigs;
            } catch (err) {
                console.error('Failed to load model configs:', err);
                throw err;
            } finally {
                globalLoadingState.isLoading = false;
                globalLoadingState.loadPromise = null;
            }
        })();

        globalLoadingState.loadPromise = loadPromise;
        return loadPromise;
    };

    // 加载所有模块的模型配置
    useEffect(() => {
        let isCancelled = false;

        const loadConfigs = async () => {
            if (isCancelled) return;
            
            setIsInitialLoading(true);
            setError(null);

            try {
                const configs = await loadAllConfigsGlobal();
                
                if (!isCancelled) {
                    setModelConfigs(configs);
                }
            } catch (err) {
                if (!isCancelled) {
                    console.error('Failed to load model configs:', err);
                    setError('加载模型配置失败，请检查网络连接和登录状态');
                }
            } finally {
                if (!isCancelled) {
                    setIsInitialLoading(false);
                }
            }
        };

        loadConfigs();

        // 清理函数
        return () => {
            isCancelled = true;
            console.log('[ModelManagement] useEffect cleanup - 取消加载');
        };
    }, []);

    const handleModelChange = async (moduleId: string, modelValue: string) => {
        const module = AI_MODULES.find(m => m.id === moduleId);
        if (!module) return;

        const user = getCurrentUser();

        setLoading(prev => new Set(prev).add(moduleId));
        setError(null);
        setSuccessMessage(null);

        try {
            // 使用缓存的token，避免重复获取
            const token = await fetchAuthToken();
            console.log(`[ModelManagement] 更新模块 ${module.name} 的模型配置`);

            const config: ModelConfig = {
                name: user.name,
                main_module: module.main_module,
                sub_module: module.sub_module,
                model: {
                    value: modelValue
                },
                model_type: 'single',
                settings: {
                    temperature: 0.7,
                    max_tokens: 7000,
                    top_p: 1,
                    frequency_penalty: 0,
                    presence_penalty: 0,
                    logprobs: false,
                    n: 1,
                    stream: false
                },
                created_by: user.name,
                uid: user.uid
            };

            const response = await fetch(`${API_BASE_URL}/admin/chatgpt/model/upsert`, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json',
                    'authorization': `Bearer ${token}`
                },
                body: JSON.stringify(config),
            });

            if (!response.ok) {
                throw new Error('保存失败');
            }

            setModelConfigs(prev => new Map(prev).set(moduleId, config));
            setSuccessMessage(`${module.name} 的模型配置已更新`);
            setTimeout(() => setSuccessMessage(null), 3000);
            console.log(`[ModelManagement] 模块 ${module.name} 配置更新成功`);
        } catch (err) {
            console.error(`Failed to update config for ${module?.name}:`, err);
            setError(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`);
        } finally {
            setLoading(prev => {
                const newSet = new Set(prev);
                newSet.delete(moduleId);
                return newSet;
            });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">AI 模型管理</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    为不同的功能模块配置使用的 AI 模型
                </p>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {successMessage && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-2">
                    <CheckIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <p className="text-sm text-green-600 dark:text-green-400">{successMessage}</p>
                </div>
            )}

            {/* 初始加载状态 */}
            {isInitialLoading && (
                <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-sky-600"></div>
                        <span>正在加载模型配置...</span>
                    </div>
                </div>
            )}

            {/* 模块列表 */}
            {!isInitialLoading && (
                <div className="space-y-4">
                    {AI_MODULES.map(module => {
                        const config = modelConfigs.get(module.id);
                        const isLoading = loading.has(module.id);
                        // 尝试多种方式获取模型值
                        const currentModel = config?.model?.value || config?.model_name || '';

                        return (
                            <div
                                key={module.id}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-5 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 mt-1">
                                        <BrainIcon className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-base font-medium text-slate-900 dark:text-white mb-1">
                                            {module.name}
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                            {module.description}
                                        </p>
                                        <div className="flex items-center gap-3">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                                模型:
                                            </label>
                                            <ModelSelector
                                                value={currentModel}
                                                onChange={(modelValue) => handleModelChange(module.id, modelValue)}
                                                disabled={isLoading}
                                            />
                                            {isLoading && (
                                                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-sky-600"></div>
                                                    保存中...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
