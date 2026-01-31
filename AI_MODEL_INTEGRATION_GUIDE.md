# AI 模型集成指南

## 概述

本指南说明如何将模型管理功能集成到现有的 AI 功能中，让用户可以在使用 AI 功能时选择和切换模型。

## 集成步骤

### 1. 替换 API 端点

将现有的 `geminiService.ts` 中的 Google GenAI 调用替换为统一的 ChatGPT API：

```typescript
// 旧代码（geminiService.ts）
const response = await ai.models.generateContent({
    model: config.modelName,
    contents: prompt,
    config: buildGenaiConfig(config),
});

// 新代码 - 使用 aiChatService
import { chatWithAI } from './aiChatService';

const response = await chatWithAI(prompt, {
    mainModule: 'attendance',
    subModule: 'insights',  // 或 'csv', 'report'
    settings: {
        temperature: config.temperature,
        max_tokens: config.maxOutputTokens,
        top_p: config.topP
    }
});
```

### 2. 在员工详情弹窗中添加 AI 建议

在员工详情弹窗组件中添加 AI 智能管理建议功能：

```typescript
import React, { useState } from 'react';
import { analyzeAttendanceInsights } from '../../services/aiChatService';
import { SparklesIcon, LoaderIcon } from '../Icons';

interface AIInsightSectionProps {
    employeeName: string;
    stats: EmployeeStats;
    user?: DingTalkUser;
}

export const AIInsightSection: React.FC<AIInsightSectionProps> = ({ 
    employeeName, 
    stats, 
    user 
}) => {
    const [loading, setLoading] = useState(false);
    const [insight, setInsight] = useState('');
    const [error, setError] = useState('');

    const generateInsight = async () => {
        setLoading(true);
        setError('');
        
        try {
            // 构建提示词
            const prompt = `
请为员工"${employeeName}"提供考勤管理建议：

考勤数据：
- 迟到次数：${stats.late}
- 缺卡次数：${stats.missing}
- 旷工次数：${stats.absenteeism}
- 迟到时长：${stats.exemptedLateMinutes} 分钟
- 加班时长：${stats.overtimeTotalMinutes} 分钟
${user?.title ? `- 职位：${user.title}` : ''}
${user?.department ? `- 部门：${user.department}` : ''}

请提供：
1. 考勤情况评估
2. 存在的问题分析
3. 具体改进建议
            `.trim();

            const response = await analyzeAttendanceInsights(prompt);
            setInsight(response.content);
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    <h4 className="font-semibold text-slate-900 dark:text-white">
                        AI 智能管理建议
                    </h4>
                </div>
                <button
                    onClick={generateInsight}
                    disabled={loading}
                    className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <LoaderIcon className="w-4 h-4 animate-spin" />
                            分析中...
                        </span>
                    ) : (
                        '生成建议'
                    )}
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {insight && (
                <div className="p-3 bg-white dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {insight}
                </div>
            )}

            {!insight && !loading && !error && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    点击"生成建议"按钮，AI 将分析该员工的考勤情况并提供管理建议
                </p>
            )}
        </div>
    );
};
```

### 3. 在仪表盘中添加 AI 洞察

在考勤仪表盘页面添加整体洞察功能：

```typescript
import React, { useState } from 'react';
import { analyzeAttendanceInsights } from '../../services/aiChatService';
import { SparklesIcon } from '../Icons';

interface DashboardAIInsightProps {
    companyName: string;
    summary: {
        totalEmployees: number;
        attendanceScore: number;
        riskCount: number;
        totalLateMinutes: number;
        abnormalRecords: number;
    };
    abnormalEmployees: any[];
}

export const DashboardAIInsight: React.FC<DashboardAIInsightProps> = ({
    companyName,
    summary,
    abnormalEmployees
}) => {
    const [loading, setLoading] = useState(false);
    const [insight, setInsight] = useState('');

    const generateInsight = async () => {
        setLoading(true);
        
        try {
            const prompt = `
请分析 ${companyName} 的整体考勤情况：

整体数据：
- 总人数：${summary.totalEmployees}
- 考勤健康分：${summary.attendanceScore}
- 风险人数：${summary.riskCount}
- 总迟到时长：${summary.totalLateMinutes} 分钟
- 异常记录数：${summary.abnormalRecords}

风险员工TOP5：
${abnormalEmployees.slice(0, 5).map((emp, i) => 
    `${i + 1}. ${emp.name} - 迟到${emp.stats.late}次，缺卡${emp.stats.missing}次`
).join('\n')}

请提供：
1. 整体考勤情况评估
2. 主要问题和风险点
3. 管理改进建议
4. 针对性措施
            `.trim();

            const response = await analyzeAttendanceInsights(prompt);
            setInsight(response.content);
        } catch (err) {
            console.error('生成洞察失败:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6 text-purple-600" />
                    <h3 className="text-lg font-semibold">AI 智能洞察分析</h3>
                </div>
                <button
                    onClick={generateInsight}
                    disabled={loading}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
                >
                    {loading ? '分析中...' : '生成洞察'}
                </button>
            </div>

            {insight ? (
                <div className="prose dark:prose-invert max-w-none">
                    <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                        {insight}
                    </div>
                </div>
            ) : (
                <div className="text-center py-8 text-slate-500">
                    点击按钮生成 AI 智能分析
                </div>
            )}
        </div>
    );
};
```

### 4. 添加模型选择器（可选）

如果需要让用户在使用时临时选择模型，可以添加模型选择器：

```typescript
import React, { useState, useEffect } from 'react';
import { chatWithAI } from '../../services/aiChatService';

// 复用 ModelManagement 中的 ModelSelector 组件
import { ModelSelector } from '../admin/ModelManagement';

export const AIInsightWithModelSelector: React.FC = () => {
    const [selectedModel, setSelectedModel] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');

    const handleGenerate = async (prompt: string) => {
        setLoading(true);
        try {
            const response = await chatWithAI(prompt, {
                model: selectedModel,  // 使用用户选择的模型
                mainModule: 'attendance',
                subModule: 'insights'
            });
            setResult(response.content);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                    选择 AI 模型：
                </label>
                <ModelSelector
                    value={selectedModel}
                    onChange={setSelectedModel}
                    disabled={loading}
                />
            </div>
            
            <button
                onClick={() => handleGenerate('你的提示词...')}
                disabled={loading || !selectedModel}
            >
                生成分析
            </button>

            {result && <div>{result}</div>}
        </div>
    );
};
```

## 使用场景

### 场景 1：员工详情弹窗
在员工详情弹窗底部添加"AI 智能管理建议"区域，点击按钮后调用 `analyzeAttendanceInsights` 生成针对该员工的管理建议。

### 场景 2：考勤仪表盘
在仪表盘页面添加"AI 智能洞察分析"卡片，分析整体考勤情况并提供管理建议。

### 场景 3：CSV 数据分析
在上传 CSV 文件后，调用 `analyzeCsvData` 自动分析数据并提取关键信息。

### 场景 4：报告生成
在生成月度报告时，调用 `generateAttendanceReport` 自动生成报告内容。

## 模型配置流程

1. 管理员在"模型管理"页面为每个模块配置默认模型
2. 用户使用 AI 功能时，系统自动使用配置的模型
3. （可选）用户可以在使用时临时选择其他模型

## API 调用示例

```typescript
// 示例 1：使用默认配置的模型
const response = await analyzeAttendanceInsights('分析内容...');

// 示例 2：自定义设置
const response = await analyzeAttendanceInsights('分析内容...', {
    temperature: 0.5,
    max_tokens: 3000
});

// 示例 3：手动指定模型
const response = await chatWithAI('分析内容...', {
    model: 'openai/gpt-4.1',
    mainModule: 'attendance',
    subModule: 'insights'
});
```

## 注意事项

1. **认证**：确保用户已登录，系统会自动处理 token 获取
2. **错误处理**：建议添加 try-catch 处理 API 调用失败的情况
3. **加载状态**：AI 调用可能需要几秒钟，务必显示加载状态
4. **提示词优化**：根据实际需求优化提示词，获得更好的分析结果
5. **成本控制**：注意 `max_tokens` 设置，避免不必要的成本

## 下一步

1. 在员工详情弹窗组件中集成 `AIInsightSection`
2. 在仪表盘页面集成 `DashboardAIInsight`
3. 测试不同模型的效果
4. 根据用户反馈优化提示词和UI
