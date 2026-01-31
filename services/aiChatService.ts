/**
 * AI Chat Service
 * 用于调用 ChatGPT API 并根据模块配置使用相应的模型
 */

const CHAT_API_URL = 'https://sg.api.eyewind.cn/etl/chatgpt/chat';
const TOKEN_API_URL = 'https://eyewind.cn/admin/token';
const MODEL_QUERY_API_URL = 'https://eyewind.cn/admin/chatgpt/model/query';

interface ChatSettings {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    logprobs?: boolean;
    n?: number;
    stream?: boolean;
}

interface ChatRequest {
    content: string;
    model?: string;
    settings?: ChatSettings;
}

interface ChatResponse {
    content: string;
    model?: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// 默认设置
const DEFAULT_SETTINGS: ChatSettings = {
    temperature: 0.7,
    max_tokens: 7000,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    logprobs: false,
    n: 1,
    stream: false
};

/**
 * 获取认证 Token
 */
async function fetchAuthToken(): Promise<string> {
    try {
        const credentials = JSON.parse(localStorage.getItem('loginCredentials') || '{}');
        const bearerToken = localStorage.getItem('bearerToken') || '';

        const response = await fetch(TOKEN_API_URL, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'authorization': `Bearer ${bearerToken}`
            },
            body: JSON.stringify({
                name: credentials.name || 'yongsen',
                password: credentials.password || 'fengyongsen'
            }),
            // credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('获取 token 失败');
        }

        const data = await response.json();
        const token = data.token || data.data?.token || '';
        
        if (token) {
            localStorage.setItem('authToken', token);
        }
        
        return token;
    } catch (err) {
        console.error('Failed to fetch auth token:', err);
        throw err;
    }
}

/**
 * 获取指定模块的模型配置
 */
async function getModuleModelConfig(mainModule: string, subModule: string): Promise<string | null> {
    try {
        const token = await fetchAuthToken();
        const user = JSON.parse(localStorage.getItem('currentUser') || '{}');

        const response = await fetch(MODEL_QUERY_API_URL, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                main_module: mainModule,
                sub_module: subModule,
                uid: user.uid || 'admin',
                model_type: 'single'
            }),
            // credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            const configData = data.data || data;
            const modelValue = configData.model?.value || configData.model_name;
            console.log(`[AI Service] Model config for ${mainModule}/${subModule}:`, modelValue);
            return modelValue || null;
        }
        
        console.warn(`[AI Service] Failed to get model config: ${response.status} ${response.statusText}`);
        return null;
    } catch (err) {
        console.error(`[AI Service] Failed to get model config for ${mainModule}/${subModule}:`, err);
        return null;
    }
}

/**
 * 调用 ChatGPT API
 * @param content - 要发送的内容
 * @param options - 可选配置
 * @param options.mainModule - 主模块名称（如 'attendance'）
 * @param options.subModule - 子模块名称（如 'csv', 'insights', 'report'）
 * @param options.model - 手动指定模型（如果不指定，会从配置中获取）
 * @param options.settings - ChatGPT 设置（如果不指定，使用默认值）
 */
export async function chatWithAI(
    content: string,
    options?: {
        mainModule?: string;
        subModule?: string;
        model?: string;
        settings?: ChatSettings;
    }
): Promise<ChatResponse> {
    try {
        // 获取认证 token
        const token = await fetchAuthToken();

        // 确定使用的模型
        let model = options?.model;
        
        // 如果没有手动指定模型，且提供了模块信息，则从配置中获取
        if (!model && options?.mainModule && options?.subModule) {
            model = await getModuleModelConfig(options.mainModule, options.subModule);
        }

        // 合并设置
        const settings = {
            ...DEFAULT_SETTINGS,
            ...options?.settings
        };

        // 构建请求体
        const requestBody: any = {
            content,
            settings
        };

        // 如果有模型配置，添加到请求体
        if (model) {
            requestBody.model = model;
        }

        // 调用 API
        const response = await fetch(CHAT_API_URL, {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'content-type': 'application/json',
                'authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody),
            // credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`API 调用失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        return {
            content: data.data.choices[0].message.content || data.data.message || '',
            model: data.data.model,
            usage: data.data.usage
        };
    } catch (err) {
        console.error('[AI Service] Chat failed:', err);
        throw err;
    }
}

/**
 * CSV 数据分析 - 已废弃，保留兼容性
 * @deprecated 使用 analyzeEmployeeAdvice 或 analyzeMonthlyDiagnosis 代替
 */
export async function analyzeCsvData(content: string, settings?: ChatSettings): Promise<ChatResponse> {
    return chatWithAI(content, {
        mainModule: 'attendance',
        subModule: 'employee_advice',
        settings
    });
}

/**
 * 考勤洞察分析 - 已废弃，保留兼容性
 * @deprecated 使用 analyzeEmployeeAdvice 或 analyzeMonthlyDiagnosis 代替
 */
export async function analyzeAttendanceInsights(content: string, settings?: ChatSettings): Promise<ChatResponse> {
    return chatWithAI(content, {
        mainModule: 'attendance',
        subModule: 'employee_advice',
        settings
    });
}

/**
 * 生成考勤报告 - 已废弃，保留兼容性
 * @deprecated 使用 analyzeEmployeeAdvice 或 analyzeMonthlyDiagnosis 代替
 */
export async function generateAttendanceReport(content: string, settings?: ChatSettings): Promise<ChatResponse> {
    return chatWithAI(content, {
        mainModule: 'attendance',
        subModule: 'monthly_diagnosis',
        settings
    });
}

/**
 * AI 智能管理建议 - 为员工提供个性化的考勤管理建议
 */
export async function analyzeEmployeeAdvice(content: string, settings?: ChatSettings): Promise<ChatResponse> {
    return chatWithAI(content, {
        mainModule: 'attendance',
        subModule: 'employee_advice',
        settings
    });
}

/**
 * AI 智能月度诊断 - 分析公司整体考勤情况
 */
export async function analyzeMonthlyDiagnosis(content: string, settings?: ChatSettings): Promise<ChatResponse> {
    return chatWithAI(content, {
        mainModule: 'attendance',
        subModule: 'monthly_diagnosis',
        settings
    });
}

/**
 * AI 考勤异常分析 - 分析员工考勤日历中的异常模式
 */
export async function analyzeCalendarPattern(content: string, settings?: ChatSettings): Promise<ChatResponse> {
    return chatWithAI(content, {
        mainModule: 'attendance',
        subModule: 'calendar_analysis',
        settings
    });
}

/**
 * AI 团队分析 - 分析部门或团队的整体考勤健康度
 */
export async function analyzeTeamAttendance(content: string, settings?: ChatSettings): Promise<ChatResponse> {
    return chatWithAI(content, {
        mainModule: 'attendance',
        subModule: 'team_analysis',
        settings
    });
}
