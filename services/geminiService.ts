
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import type {
    AdminSettings,
    AiModuleConfig,
    ProofreadResult,
    Language,
    SceneScreenshot,
    SceneOptimizationResult,
    ReportCreative,
    EmployeeStats,
    DingTalkUser
} from '../database/schema.ts';
import {
    getAttendanceAnalysisPrompt,
    getEmployeeSpecificAnalysisPrompt
} from './prompts.ts';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const buildGenaiConfig = (moduleConfig: AiModuleConfig) => {
    const config: any = {
        systemInstruction: moduleConfig.systemInstruction,
        temperature: moduleConfig.temperature,
        topP: moduleConfig.topP,
        topK: moduleConfig.topK,
    };

    if (moduleConfig.maxOutputTokens) {
        config.maxOutputTokens = moduleConfig.maxOutputTokens;
        
        const budget = moduleConfig.thinkingBudget !== undefined 
            ? moduleConfig.thinkingBudget 
            : Math.floor(moduleConfig.maxOutputTokens / 2);
        
        config.thinkingConfig = { thinkingBudget: Math.min(budget, moduleConfig.maxOutputTokens - 5) };
    } else if (moduleConfig.thinkingBudget !== undefined) {
         config.thinkingConfig = { thinkingBudget: moduleConfig.thinkingBudget };
    }

    return config;
};

export async function generateAttendanceAnalysis(companyName: string, summary: any, abnormalEmployees: any[], settings: AdminSettings): Promise<string> {
    const prompt = getAttendanceAnalysisPrompt(companyName, summary, abnormalEmployees);
    const config = settings.reporting; 
    
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: config.modelName,
        contents: prompt,
        config: buildGenaiConfig(config),
    });

    return response.text;
}

export async function generateEmployeeAnalysis(employeeName: string, stats: EmployeeStats, settings: AdminSettings, user?: DingTalkUser): Promise<string> {
    // Pass the user object to the prompt function to extract roles
    const prompt = getEmployeeSpecificAnalysisPrompt(employeeName, stats, user);
    const config = settings.reporting; 

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: config.modelName,
        contents: prompt,
        config: buildGenaiConfig(config),
    });

    return response.text;
}

// --- Stubbed Implementations for Missing Exports ---

export async function proofreadText(data: any, settings: AdminSettings): Promise<ProofreadResult[]> {
    const results: ProofreadResult[] = [];
    // Stub: Identify some keys as needing suggestion
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const val = data[key];
        if (typeof val === 'string' && val.length > 5 && Math.random() > 0.7) {
             results.push({
                 key,
                 original: val,
                 corrected: val + " (Optimized)",
                 category: 'SUGGESTION',
                 explanation: 'AI Suggestion for better flow.'
             });
        } else {
             results.push({
                 key,
                 original: val,
                 corrected: val,
                 category: 'NO_CHANGE'
             });
        }
    }
    return results;
}

export async function translateText(data: any, targetLang: string, settings: AdminSettings): Promise<any> {
    const translated: any = {};
    for (const key in data) {
        if (typeof data[key] === 'string') {
            translated[key] = `[${targetLang}] ${data[key]}`;
        } else {
            translated[key] = data[key];
        }
    }
    return translated;
}

export async function generateSuggestions(masterData: any, keys: string[], langHint: string, settings: AdminSettings): Promise<Record<string, string>> {
    const suggestions: Record<string, string> = {};
    keys.forEach(key => {
        suggestions[key] = `[AI Suggestion] Translation for ${key}`;
    });
    return suggestions;
}

export async function optimizeSceneText(data: any, screenshots: SceneScreenshot[], settings: AdminSettings): Promise<SceneOptimizationResult[]> {
    // Stub
    return Object.keys(data).map(key => ({
        key,
        original: data[key],
        suggestion: typeof data[key] === 'string' ? `${data[key]} (Scene Context Added)` : data[key],
        category: 'STYLE',
        reason: 'Better fits the UI context seen in screenshots.'
    }));
}

export async function translateSingleReleaseNote(text: string, history: string, lang: Language, settings: AdminSettings): Promise<{ translation: string, sourceLanguage: string }> {
    return {
        translation: `[${lang.name} Translation]\n${text}`,
        sourceLanguage: 'en-US'
    };
}

export async function generateReportSummary(
    title: string, 
    kpiData: any, 
    topCreatives: any[], 
    bottomCreatives: any[], 
    settings: AdminSettings
): Promise<string> {
    return `## ${title} Summary\n\nOverall performance metrics indicate stable growth. ROI is ${kpiData.weightedRoasD3.toFixed(2)}%. Top performing creative ID: ${topCreatives[0]?.creativeId || 'N/A'}. Recommendation: Increase budget for top performers.`;
}

export async function analyzeCreativePerformance(creative: ReportCreative, settings: AdminSettings): Promise<string> {
    return `### Analysis for ${creative.name}\n\n**Strengths:** High CTR of ${creative.ctr}% indicates strong visual appeal.\n**Weaknesses:** Retention could be improved.\n**Recommendation:** Test variations of the first 3 seconds.`;
}

export interface BusinessModel {
    keyPartners: string[];
    keyActivities: string[];
    valuePropositions: string[];
    customerRelationships: string[];
    customerSegments: string[];
    keyResources: string[];
    channels: string[];
    costStructure: string[];
    revenueStreams: string[];
}

export async function generateBusinessModel(productInfo: string, targetAudience: string, features: string, settings: AdminSettings): Promise<BusinessModel> {
    return {
        keyPartners: ["Game Publishers", "Ad Networks"],
        keyActivities: ["Game Design", "Live Ops"],
        valuePropositions: ["Unique Gameplay Experience", "High Fidelity Graphics"],
        customerRelationships: ["Community Management", "In-game Support"],
        customerSegments: ["Mid-core Players", "Strategy Enthusiasts"],
        keyResources: ["Development Team", "Game Engine License"],
        channels: ["App Stores", "Social Media Ads"],
        costStructure: ["Development Salaries", "Server Infrastructure"],
        revenueStreams: ["In-App Purchases", "Rewarded Video Ads"]
    };
}

export async function analyzeFacebookAdsData(data: any[], settings: AdminSettings): Promise<string> {
    return `### Facebook Ads Analysis\n\nAnalyzed ${data.length} rows of data. \n\n**Trends:**\n- CPC is trending downwards.\n- Video creatives are outperforming static images by 20%.\n\n**Actionable Insights:**\nScale up budget on 'Campaign A' and pause underperforming ad sets in 'Campaign B'.`;
}
