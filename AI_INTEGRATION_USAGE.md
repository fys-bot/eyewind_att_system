# AI 集成使用指南

## 概述

本项目已集成 AI 对话功能，可以根据不同的功能模块自动使用配置的 AI 模型。

## 功能模块

系统支持以下三个 AI 功能模块：

1. **CSV 数据分析** (`attendance/csv`)
   - 用于分析和处理考勤 CSV 文件
   
2. **考勤洞察分析** (`attendance/insights`)
   - 生成考勤数据的智能分析和建议
   
3. **报告生成** (`attendance/report`)
   - 自动生成考勤报告和总结

## 模型配置

在"模型管理"页面可以为每个模块配置使用的 AI 模型。配置后，调用相应模块的 AI 功能时会自动使用配置的模型。

## 使用方法

### 1. 基础用法

```typescript
import { chatWithAI } from './services/aiChatService';

// 调用 AI，自动使用模块配置的模型
const response = await chatWithAI('请分析这份考勤数据...', {
    mainModule: 'attendance',
    subModule: 'csv'
});

console.log(response.content); // AI 返回的内容
```

### 2. 使用便捷函数

```typescript
import { 
    analyzeCsvData, 
    analyzeAttendanceInsights, 
    generateAttendanceReport 
} from './services/aiChatService';

// CSV 数据分析
const csvAnalysis = await analyzeCsvData('请分析这份 CSV 文件...');

// 考勤洞察分析
const insights = await analyzeAttendanceInsights('请分析本月考勤情况...');

// 生成报告
const report = await generateAttendanceReport('请生成本月考勤报告...');
```

### 3. 自定义设置

```typescript
import { chatWithAI } from './services/aiChatService';

const response = await chatWithAI('你的问题...', {
    mainModule: 'attendance',
    subModule: 'csv',
    settings: {
        temperature: 0.5,      // 降低随机性
        max_tokens: 5000,      // 限制输出长度
        top_p: 0.9
    }
});
```

### 4. 手动指定模型

```typescript
import { chatWithAI } from './services/aiChatService';

// 不使用配置，直接指定模型
const response = await chatWithAI('你的问题...', {
    model: 'openai/gpt-4o'
});
```

## 在组件中使用

### React 组件示例

```typescript
import React, { useState } from 'react';
import { analyzeCsvData } from '../services/aiChatService';

export const CsvAnalyzer: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');

    const handleAnalyze = async (csvContent: string) => {
        setLoading(true);
        try {
            const response = await analyzeCsvData(
                `请分析以下 CSV 数据：\n${csvContent}`
            );
            setResult(response.content);
        } catch (error) {
            console.error('分析失败:', error);
            alert('分析失败，请重试');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <button onClick={() => handleAnalyze('...')} disabled={loading}>
                {loading ? '分析中...' : '开始分析'}
            </button>
            {result && <div>{result}</div>}
        </div>
    );
};
```

## API 参数说明

### chatWithAI 函数

```typescript
chatWithAI(content: string, options?: {
    mainModule?: string;    // 主模块名称（如 'attendance'）
    subModule?: string;     // 子模块名称（如 'csv', 'insights', 'report'）
    model?: string;         // 手动指定模型（可选）
    settings?: {            // ChatGPT 设置（可选）
        temperature?: number;        // 0-2，控制随机性，默认 0.7
        max_tokens?: number;         // 最大输出 token 数，默认 7000
        top_p?: number;              // 0-1，核采样，默认 1
        frequency_penalty?: number;  // -2 到 2，频率惩罚，默认 0
        presence_penalty?: number;   // -2 到 2，存在惩罚，默认 0
        logprobs?: boolean;          // 是否返回 log 概率，默认 false
        n?: number;                  // 生成几个回复，默认 1
        stream?: boolean;            // 是否流式返回，默认 false
    }
}): Promise<ChatResponse>
```

### 返回值

```typescript
interface ChatResponse {
    content: string;        // AI 返回的内容
    model?: string;         // 使用的模型
    usage?: {               // Token 使用情况
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
```

## 错误处理

```typescript
import { chatWithAI } from './services/aiChatService';

try {
    const response = await chatWithAI('你的问题...', {
        mainModule: 'attendance',
        subModule: 'csv'
    });
    console.log(response.content);
} catch (error) {
    if (error instanceof Error) {
        console.error('AI 调用失败:', error.message);
        // 处理错误，如显示错误提示
    }
}
```

## 注意事项

1. **认证**：确保用户已登录，系统会自动获取和刷新 token
2. **模型配置**：如果模块没有配置模型，API 会使用服务端默认模型
3. **Token 限制**：注意 `max_tokens` 设置，避免超出模型限制
4. **错误重试**：建议实现错误重试机制，处理网络波动
5. **加载状态**：调用 AI 可能需要几秒钟，建议显示加载状态

## 调试

在浏览器控制台可以看到详细的日志：

```
[AI Service] Model for attendance/csv: openai/gpt-4.1
[AI Service] Chat request: { model: 'openai/gpt-4.1', ... }
[AI Service] Chat response received
```

## 完整示例

```typescript
import React, { useState } from 'react';
import { generateAttendanceReport } from '../services/aiChatService';

export const ReportGenerator: React.FC<{ attendanceData: any }> = ({ attendanceData }) => {
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState('');
    const [error, setError] = useState('');

    const generateReport = async () => {
        setLoading(true);
        setError('');
        
        try {
            const prompt = `
请根据以下考勤数据生成月度报告：

总人数：${attendanceData.totalEmployees}
考勤健康分：${attendanceData.attendanceScore}
风险人数：${attendanceData.riskCount}
总迟到时长：${attendanceData.totalLateMinutes} 分钟

请生成一份包含以下内容的报告：
1. 整体考勤情况概述
2. 主要问题分析
3. 改进建议
            `.trim();

            const response = await generateAttendanceReport(prompt, {
                temperature: 0.7,
                max_tokens: 5000
            });

            setReport(response.content);
            
            // 可选：显示 token 使用情况
            if (response.usage) {
                console.log('Token 使用:', response.usage.total_tokens);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '生成报告失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <button
                onClick={generateReport}
                disabled={loading}
                className="px-4 py-2 bg-sky-600 text-white rounded-lg disabled:opacity-50"
            >
                {loading ? '生成中...' : '生成报告'}
            </button>

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg">
                    {error}
                </div>
            )}

            {report && (
                <div className="p-4 bg-white border rounded-lg">
                    <h3 className="font-semibold mb-2">AI 生成的报告</h3>
                    <div className="whitespace-pre-wrap">{report}</div>
                </div>
            )}
        </div>
    );
};
```
