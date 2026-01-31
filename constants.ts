
// Fix: Import types from schema.ts to avoid duplication and circular dependency issues.
import type { Language, LanguageCategory } from './database/schema.ts';

// This categorized list is now the single source of truth.
export const SUPPORTED_LANGUAGES_CATEGORIZED: LanguageCategory[] = [
    {
        name: '亚太地区',
        languages: [
            { code: 'zh-CN', name: '简体中文', englishName: 'Simplified Chinese', flag: '🇨🇳' },
            { code: 'zh-TW', name: '繁體中文 (台灣)', englishName: 'Traditional Chinese (Taiwan)', flag: '🇨🇳' },
            { code: 'zh-HK', name: '繁體中文 (香港)', englishName: 'Traditional Chinese (Hong Kong)', flag: '🇭🇰' },
            { code: 'ja-JP', name: '日语', englishName: 'Japanese', flag: '🇯🇵' },
            { code: 'ko-KR', name: '韩语', englishName: 'Korean', flag: '🇰🇷' },
            { code: 'vi-VN', name: '越南语', englishName: 'Vietnamese', flag: '🇻🇳' },
            { code: 'th-TH', name: '泰语', englishName: 'Thai', flag: '🇹🇭' },
            { code: 'id-ID', name: '印度尼西亚语', englishName: 'Indonesian', flag: '🇮🇩' },
            { code: 'ms-MY', name: '马来语', englishName: 'Malay', flag: '🇲🇾' },
            { code: 'fil-PH', name: '菲律宾语', englishName: 'Filipino', flag: '🇵🇭' },
            { code: 'en-AU', name: '英语 (澳大利亚)', englishName: 'English (Australia)', flag: '🇦🇺' },
            { code: 'km-KH', name: '高棉语', englishName: 'Khmer', flag: '🇰🇭' },
            { code: 'lo-LA', name: '老挝语', englishName: 'Lao', flag: '🇱🇦' },
            { code: 'my-MM', name: '缅甸语', englishName: 'Burmese', flag: '🇲🇲' },
        ]
    },
    {
        name: '欧洲',
        languages: [
            { code: 'en-GB', name: '英语 (英国)', englishName: 'English (UK)', flag: '🇬🇧' },
            { code: 'fr-FR', name: '法语 (法国)', englishName: 'French (France)', flag: '🇫🇷' },
            { code: 'de-DE', name: '德语', englishName: 'German', flag: '🇩🇪' },
            { code: 'es-ES', name: '西班牙语 (西班牙)', englishName: 'Spanish (Spain)', flag: '🇪🇸' },
            { code: 'it-IT', name: '意大利语', englishName: 'Italian', flag: '🇮🇹' },
            { code: 'pt-PT', name: '葡萄牙语 (葡萄牙)', englishName: 'Portuguese (Portugal)', flag: '🇵🇹' },
            { code: 'ru-RU', name: '俄语', englishName: 'Russian', flag: '🇷🇺' },
            { code: 'nl-NL', name: '荷兰语', englishName: 'Dutch', flag: '🇳🇱' },
            { code: 'pl-PL', name: '波兰语', englishName: 'Polish', flag: '🇵🇱' },
            { code: 'sv-SE', name: '瑞典语', englishName: 'Swedish', flag: '🇸🇪' },
            { code: 'no-NO', name: '挪威语', englishName: 'Norwegian', flag: '🇳🇴' },
            { code: 'da-DK', name: '丹麦语', englishName: 'Danish', flag: '🇩🇰' },
            { code: 'fi-FI', name: '芬兰语', englishName: 'Finnish', flag: '🇫🇮' },
            { code: 'uk-UA', name: '乌克兰语', englishName: 'Ukrainian', flag: '🇺🇦' },
            { code: 'cs-CZ', name: '捷克语', englishName: 'Czech', flag: '🇨🇿' },
            { code: 'hu-HU', name: '匈牙利语', englishName: 'Hungarian', flag: '🇭🇺' },
            { code: 'ro-RO', name: '罗马尼亚语', englishName: 'Romanian', flag: '🇷🇴' },
            { code: 'el-GR', name: '希腊语', englishName: 'Greek', flag: '🇬🇷' },
            { code: 'bg-BG', name: '保加利亚语', englishName: 'Bulgarian', flag: '🇧🇬' },
            { code: 'sr-RS', name: '塞尔维亚语', englishName: 'Serbian', flag: '🇷🇸' },
            { code: 'hr-HR', name: '克罗地亚语', englishName: 'Croatian', flag: '🇭🇷' },
            { code: 'sk-SK', name: '斯洛伐克语', englishName: 'Slovak', flag: '🇸🇰' },
            { code: 'sl-SI', name: '斯洛文尼亚语', englishName: 'Slovenian', flag: '🇸🇮' },
            { code: 'ca-ES', name: '加泰罗尼亚语', englishName: 'Catalan', flag: '🇪🇸' },
            { code: 'eu-ES', name: '巴斯克语', englishName: 'Basque', flag: '🇪🇸' },
            { code: 'gl-ES', name: '加利西亚语', englishName: 'Galician', flag: '🇪🇸' },
            { code: 'is-IS', name: '冰岛语', englishName: 'Icelandic', flag: '🇮🇸' },
            { code: 'lt-LT', name: '立陶宛语', englishName: 'Lithuanian', flag: '🇱🇹' },
            { code: 'lv-LV', name: '拉脱维亚语', englishName: 'Latvian', flag: '🇱🇻' },
            { code: 'et-EE', name: '爱沙尼亚语', englishName: 'Estonian', flag: '🇪🇪' },
        ]
    },
    {
        name: '美洲',
        languages: [
            { code: 'en-US', name: '英语 (美国)', englishName: 'English (US)', flag: '🇺🇸' },
            { code: 'es-419', name: '西班牙语 (拉丁美洲)', englishName: 'Spanish (Latin America)', flag: '🌎' },
            { code: 'es-MX', name: '西班牙语 (墨西哥)', englishName: 'Spanish (Mexico)', flag: '🇲🇽' },
            { code: 'pt-BR', name: '葡萄牙语 (巴西)', englishName: 'Portuguese (Brazil)', flag: '🇧🇷' },
            { code: 'en-CA', name: '英语 (加拿大)', englishName: 'English (Canada)', flag: '🇨🇦' },
            { code: 'fr-CA', name: '法语 (加拿大)', englishName: 'French (Canada)', flag: '🇨🇦' },
        ]
    },
    {
        name: '中东及非洲',
        languages: [
            { code: 'ar', name: '阿拉伯语', englishName: 'Arabic', flag: '🇸🇦' },
            { code: 'he-IL', name: '希伯来语', englishName: 'Hebrew', flag: '🇮🇱' },
            { code: 'tr-TR', name: '土耳其语', englishName: 'Turkish', flag: '🇹🇷' },
            { code: 'fa-IR', name: '波斯语', englishName: 'Persian', flag: '🇮🇷' },
            { code: 'af-ZA', name: '南非荷兰语', englishName: 'Afrikaans', flag: '🇿🇦' },
            { code: 'sw-KE', name: '斯瓦希里语', englishName: 'Swahili', flag: '🇰🇪' },
            { code: 'zu-ZA', name: '祖鲁语', englishName: 'Zulu', flag: '🇿🇦' },
        ]
    },
    {
        name: '南亚',
        languages: [
            { code: 'hi-IN', name: '印地语', englishName: 'Hindi', flag: '🇮🇳' },
            { code: 'en-IN', name: '英语 (印度)', englishName: 'English (India)', flag: '🇮🇳' },
            { code: 'bn-BD', name: '孟加拉语', englishName: 'Bengali', flag: '🇧🇩' },
            { code: 'ur-PK', name: '乌尔都语', englishName: 'Urdu', flag: '🇵🇰' },
            { code: 'ta-IN', name: '泰米尔语', englishName: 'Tamil', flag: '🇮🇳' },
            { code: 'te-IN', name: '泰卢固语', englishName: 'Telugu', flag: '🇮🇳' },
            { code: 'mr-IN', name: '马拉地语', englishName: 'Marathi', flag: '🇮🇳' },
            { code: 'gu-IN', name: '古吉拉特语', englishName: 'Gujarati', flag: '🇮🇳' },
            { code: 'kn-IN', name: '卡纳达语', englishName: 'Kannada', flag: '🇮🇳' },
            { code: 'ne-NP', name: '尼泊尔语', englishName: 'Nepali', flag: '🇳🇵' },
            { code: 'si-LK', name: '僧伽罗语', englishName: 'Sinhala', flag: '🇱🇰' },
        ]
    }
];

// We still export a flat list for other components that might not need categorization.
export const SUPPORTED_LANGUAGES: Language[] = SUPPORTED_LANGUAGES_CATEGORIZED.flatMap(category => category.languages);
