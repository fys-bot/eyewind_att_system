
export type Page = 'attendanceEmployee' | 'attendanceAdmin' | 'attendanceManagement' | 'parameterSettings' | 'attendanceRules' | 'help' | 'dashboard' | 'adminAccount' | 'modelManagement' | 'logManagement';

// --- Audit Log ---
export interface AuditLog {
    id: string;
    userId: string;
    userName: string;
    userRole: string;
    action: 'LOGIN' | 'DOWNLOAD' | 'EDIT' | 'SEND' | 'RECALL' | 'ARCHIVE';
    target?: string; // e.g., "June Report" or "John Doe's Record"
    details?: string; // e.g., "Changed Status: Normal -> Late"
    timestamp: number;
}

// --- AI & Settings ---
export interface AiModuleConfig {
    modelName: string;
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens?: number;
    thinkingBudget?: number;
    systemInstruction?: string;
}

export interface CustomerServiceAiModuleConfig extends AiModuleConfig {
    enthusiasmLevel: number;
}

export interface AdminSettings {
    translation: AiModuleConfig;
    reporting: AiModuleConfig;
    customerService: CustomerServiceAiModuleConfig;
}

// --- Attendance Rules ---
export interface LateRule {
    previousDayCheckoutTime: string; // "18:00" or "20:30" or "24:00"
    lateThresholdTime: string; // "09:01" or "13:31" (absolute time when late starts)
    description: string; // "前一天18:00打卡，9:01算迟到" (auto-generated from above fields)
}

export interface LeaveDisplayRule {
    leaveType: string; // "病假"
    shortTermHours: number; // 24
    shortTermLabel: string; // "病假<=24小时"
    longTermLabel: string; // "病假>24小时"
}

export interface PerformancePenaltyRule {
    minMinutes: number; // 0 (包含)
    maxMinutes: number; // 5 (不包含，即 [0, 5))
    penalty: number; // 50 (扣款金额)
    description: string; // "0-5分钟扣50元"
}

export interface FullAttendanceRule {
    type: 'trip' | 'compTime' | 'late' | 'missing' | 'absenteeism' | 'annual' | 'sick' | 'personal' | 'bereavement' | 'paternity' | 'maternity' | 'parental' | 'marriage'; // 考勤类型
    displayName: string; // "迟到"、"缺卡"、"病假"等显示名称
    enabled: boolean; // 是否启用此规则（true表示此类型会影响全勤）
    threshold: number; // 阈值（次数或小时数，0表示任何情况都影响全勤）
    unit: 'count' | 'hours'; // 单位：次数或小时数
}

export interface AttendanceRuleConfig {
    // 基础作息时间
    workStartTime: string; // "09:00"
    workEndTime: string;   // "18:30"
    lunchStartTime: string; // "12:00"
    lunchEndTime: string;   // "13:30"
    
    // 迟到规则
    lateRules: LateRule[]; // 支持多种迟到判定规则
    lateExemptionCount: number; // 3 (月度豁免次数)
    lateExemptionMinutes: number; // 15 (单次豁免时长)
    lateExemptionEnabled: boolean; // true (是否启用豁免功能)
    
    // 绩效扣款规则
    performancePenaltyMode: 'unlimited' | 'capped'; // unlimited=上不封顶模式, capped=封顶模式
    // 上不封顶模式配置
    unlimitedPenaltyThresholdTime?: string; // 超过此时间开始扣款，如 "09:01"
    unlimitedPenaltyCalcType?: 'perMinute' | 'fixed'; // perMinute=按分钟计算, fixed=固定扣款
    unlimitedPenaltyPerMinute?: number; // 按分钟计算：每分钟扣款金额
    unlimitedPenaltyFixedAmount?: number; // 固定扣款：一次性扣款金额
    // 封顶模式配置
    cappedPenaltyType?: 'ladder' | 'fixedCap'; // ladder=阶梯扣款, fixedCap=固定封顶（按分钟计算但设上限）
    cappedPenaltyPerMinute?: number; // 固定封顶模式：每分钟扣款金额
    maxPerformancePenalty: number; // 250 (绩效扣款封顶金额)
    performancePenaltyRules: PerformancePenaltyRule[]; // 阶梯扣款规则（仅capped+ladder模式使用）
    performancePenaltyEnabled: boolean; // true (是否启用绩效考核功能，关闭后隐藏"考勤绩效"列)
    
    // 请假规则
    leaveDisplayRules: LeaveDisplayRule[]; // 特殊展示规则
    
    // 全勤规则
    fullAttendanceBonus: number; // 200 (全勤奖金额)
    fullAttendanceAllowAdjustment: boolean; // true (调休是否算全勤)
    fullAttendanceRules: FullAttendanceRule[]; // 灵活的全勤判定规则
    fullAttendanceEnabled: boolean; // true (是否启用全勤功能，关闭后隐藏"是否全勤"列)
    
    // 出勤天数规则
    attendanceDaysRules: {
        enabled: boolean; // 是否启用出勤天数统计
        
        // 应出勤天数计算规则
        shouldAttendanceCalcMethod: 'workdays' | 'fixed' | 'custom'; // 工作日自动计算 | 固定天数 | 自定义
        fixedShouldAttendanceDays?: number; // 固定应出勤天数（当 calcMethod 为 fixed 时使用）
        includeHolidaysInShould: boolean; // 应出勤天数是否包含法定节假日（默认true）
        
        // 正常出勤天数计算规则
        actualAttendanceRules: {
            countLateAsAttendance: boolean; // 迟到是否算出勤
            countMissingAsAttendance: boolean; // 缺卡是否算出勤
            countHalfDayLeaveAsHalf: boolean; // 半天假是否算0.5天出勤
            minWorkHoursForFullDay: number; // 满足多少小时算一天出勤（默认4小时）
            // 以下类型算正常出勤
            countHolidayAsAttendance: boolean; // 法定节假日算出勤（默认true）
            countCompTimeAsAttendance: boolean; // 调休算出勤（默认true）
            countPaidLeaveAsAttendance: boolean; // 带薪福利假算出勤（年假、婚假、产假等，默认true）
            countTripAsAttendance: boolean; // 出差算出勤（默认true）
            countOutAsAttendance: boolean; // 外出算出勤（默认true）
            // 以下类型不算正常出勤
            countSickLeaveAsAttendance: boolean; // 病假是否算出勤（默认false）
            countPersonalLeaveAsAttendance: boolean; // 事假是否算出勤（默认false）
        };
    };
    
    // 法定调班规则
    workdaySwapRules: {
        enabled: boolean; // 是否启用法定调班
        autoFollowNationalHoliday: boolean; // 是否自动跟随国家法定调休安排
        // 自定义日期调整（覆盖默认规则）
        customDays: Array<{
            date: string; // 日期，如 "2024-02-04"
            type: 'workday' | 'holiday'; // workday=需要上班, holiday=不需要上班
            reason: string; // 原因，如 "春节调休补班" 或 "公司周年庆放假"
        }>;
    };
    
    // 居家办公规则
    remoteWorkRules: {
        enabled: boolean; // 是否启用居家办公
        requireApproval: boolean; // 是否需要审批
        countAsNormalAttendance: boolean; // 是否算正常出勤
        maxDaysPerMonth?: number; // 每月最多居家办公天数（可选）
        allowedDaysOfWeek: number[]; // 允许居家办公的星期几 (0=周日, 1=周一, ..., 6=周六)
        remoteDays: Array<{
            date: string; // 居家办公日期
            reason: string; // 原因，如 "全员居家办公"、"恶劣天气"
            timeMode: 'day' | 'hour'; // 时间模式：day=按天(整天), hour=按小时(指定时段)
            startTime?: string; // 开始时间（timeMode=hour时必填），如 "09:00"
            endTime?: string; // 结束时间（timeMode=hour时必填），如 "12:00"
            scope: 'all' | 'department' | 'individual'; // 范围：全员/部门/个人
            departmentIds?: string[]; // 部门ID列表（当 scope 为 department 时）
            userIds?: string[]; // 员工ID列表（当 scope 为 individual 时）
        }>;
    };
    
    // 加班规则
    overtimeCheckpoints: string[]; // ["19:30", "20:30", "22:00", "24:00"]
    weekendOvertimeThreshold: number; // 8 (周末加班影响周一的时长阈值)
    
    // 跨天打卡规则
    crossDayCheckout: {
        enabled: boolean; // true
        rules: Array<{
            checkoutTime: string; // "20:30" (前一天打卡时间)
            nextDayCheckinTime: string; // "09:30" (次日最晚打卡时间)
            description: string; // "晚上8点半打卡，第二天可以早上9点半打卡"
        }>;
        // 保持向后兼容的字段
        maxCheckoutTime: string; // "24:00" (最晚打卡时间)
        nextDayCheckinTime: string; // "13:30" (次日最晚打卡时间)
    };
}

// --- Company Configuration ---
export interface CompanyConfig {
    appkey: string;
    appsecret: string;
    agent_id: string;
    token?: string; // Optional manual override or cached token
    rules?: AttendanceRuleConfig; // Flexible rules
}

export type CompanyConfigs = Record<string, CompanyConfig>;

// User & Role Types
export interface Role {
    id: string;
    name: string;
    description: string;
    permissions: string[]; // List of permission keys (e.g., 'attendance:send')
}

export interface User {
    id: string;
    name: string;
    email: string;
    roleId: string; // Link to Role ID
    roleName?: string; // Display name for convenience
    permissions?: string[]; // Flattened permissions for runtime check
    status: 'active' | 'inactive';
    createdAt: string;
    lastLogin: string;
    creator?: string;
    avatar?: string;
}

// Attendance Types
export type EmployeeSendStatus = 'pending' | 'sent';
export type EmployeeViewStatus = 'pending' | 'viewed';
export type EmployeeConfirmStatus = 'pending' | 'confirmed' | 'auto-confirmed';
export type AttendanceSheetStatus = 'draft' | 'sending' | 'completed';

export interface AttendanceSheetSettings {
    reminderText: string;
    showReminder: boolean;
    showColumns: string[];
    hideEmptyColumnsOption: 'none' | 'all' | 'zero';
    autoConfirmEnabled: boolean;
    autoConfirmDate: string;
    feedbackEnabled: boolean;
    feedbackContactPerson: string;
    notificationMethod: string;
    readAndBurn: boolean;
    employeeSignature: boolean;
}

export interface EmployeeAttendanceRecord {
    id: string;
    employeeId: string;
    employeeName: string;
    department: string;
    sendStatus: EmployeeSendStatus;
    viewStatus: EmployeeViewStatus;
    confirmStatus: EmployeeConfirmStatus;
    sent_at: string | null;
    confirmed_at: string | null;
    viewed_at: string | null;
    mainCompany: string | null;
    signatureBase64: string | null;
    isSigned: boolean;
    dailyData: Record<string, string>; // Keys are days (1-31) or summary fields
    isModifiedAfterSent?: boolean;
    corp_task_id?: string;
    todo_task_id?: string;
    confirm_typ?: 'auto' | 'manual';
}

export interface AttendanceSheet {
    id: string;
    title: string;
    month: string;
    status: AttendanceSheetStatus;
    settings: AttendanceSheetSettings;
    employeeRecords: EmployeeAttendanceRecord[];
    createdAt: string;
}

export interface PunchRecord {
    userId: string;
    workDate: number; // timestamp
    checkType: 'OnDuty' | 'OffDuty';
    sourceType: string; // e.g. 'ATM', 'APPROVE'
    timeResult: 'Normal' | 'Late' | 'Early' | 'NotSigned' | 'SeriousLate' | 'Absenteeism';
    locationResult: 'Normal' | 'Outside' | 'NotSigned';
    userCheckTime: number; // timestamp
    baseCheckTime: number; // timestamp
    procInstId?: string;
    groupId?: string;
    planId?: string;
    approveId?: string;
    corpId?: string;
    sourceType_Desc?: string;
    checkType_Desc?: string;
    timeResult_Desc?: string;
}

export interface DingTalkUser {
    userid: string;
    name: string;
    avatar?: string;
    title?: string;
    department?: string;
    dept_id_list?: number[];
    create_time: string | number;
    mainCompany?: string;
    mobile?: string;
    active?: boolean;
    unionid?: string;
    job_number?: string;
    hired_date?: number | string;
    admin?: boolean;
    boss?: boolean;
    senior?: boolean;
    hide_mobile?: boolean;
    exclusive_account?: boolean;
    real_authed?: boolean;
    leader_in_dept?: { dept_id: number; leader: boolean }[];
    role_list?: { id: number; name: string; group_name: string }[];
    punchData?: PunchRecord[];
}

export type CompanyCounts = Record<string, number>;

export type DailyAttendanceStatusType = 'normal' | 'abnormal' | 'incomplete' | 'noRecord';

export interface DailyAttendanceStatus {
    status: DailyAttendanceStatusType;
    records: PunchRecord[];
    onDutyTime?: string;
    offDutyTime?: string;
    hasAbnormality: boolean;
    hasOffDutyApprove: boolean;
    hasOnDutyApprove: boolean;
}

export type AttendanceMap = Record<string, Record<string, DailyAttendanceStatus>>; // userId -> day (string) -> status

export interface EmployeeStats {
    late: number;
    missing: number;
    absenteeism: number; // 新增：旷工次数
    annual: number;
    sick: number;
    seriousSick: number; // 新增：病假(>24h)次数
    personal: number;
    trip: number;
    compTime: number;
    lateMinutes: number;
    exemptedLateMinutes: number;
    exemptedLate?: number;
    performancePenalty?: number;
    monthlyExemptionUsed?: number;
    annualHours: number;
    sickHours: number;
    seriousSickHours: number; // 新增：病假(>24h)小时数
    personalHours: number;
    tripHours: number;
    compTimeHours: number;
    isFullAttendance?: boolean;
    shouldAttendanceDays?: number;
    actualAttendanceDays?: number;
    bereavement?: number;
    paternity?: number;
    maternity?: number;
    parental?: number;
    marriage?: number;
    bereavementHours?: number;
    paternityHours?: number;
    maternityHours?: number;
    parentalHours?: number;
    marriageHours?: number;
    overtimeTotalMinutes?: number;
    overtime19_5Minutes?: number;
    overtime20_5Minutes?: number;
    overtime22Minutes?: number;
    overtime24Minutes?: number;
    overtime19_5Count?: number;
    overtime20_5Count?: number;
    overtime22Count?: number;
    overtime24Count?: number;
}

export interface HolidayData {
    holiday: boolean;
    name: string;
    wage: number;
    after: boolean;
    target: string;
}
export type HolidayMap = Record<string, HolidayData>;

// --- Languages ---
export interface Language {
    code: string;
    name: string;
    englishName: string;
    flag: string;
}

export interface LanguageCategory {
    name: string;
    languages: Language[];
}

// --- Project & State ---
export interface SceneScreenshot {
    id: string;
    name: string;
    dataUrl: string;
}

export type SceneOptimizationCategory = 'ACCURACY' | 'STYLE' | 'CULTURAL' | 'NO_CHANGE';

export interface SceneOptimizationResult {
    key: string;
    original: string;
    suggestion: string;
    category: SceneOptimizationCategory;
    reason: string;
}

export interface SceneLanguageData {
    configFile: { name: string; data: any } | null;
    screenshots: SceneScreenshot[];
    optimizationResults: SceneOptimizationResult[] | null;
}

export type SceneLibraryState = Record<string, SceneLanguageData>;

export type ProofreadCategory = 'SUGGESTION' | 'CORRECTION' | 'NO_CHANGE';

export interface ProofreadResult {
    key: string;
    original: string;
    corrected: string;
    category: ProofreadCategory;
    explanation?: string;
}

export interface TranslatorState {
    proofread: {
        file: { name: string; data: any } | null;
        results: ProofreadResult[] | null;
        adopted: Record<string, boolean>;
    };
    translate: {
        file: { name: string; data: any } | null;
        targetLanguages: Language[];
        results: Record<string, { status: 'pending' | 'done' | 'error'; data: any }>;
    };
}

export type AuditIssueType = 'missing' | 'empty' | 'placeholder' | 'formatMismatch' | 'inaccurate' | 'grammar' | 'style' | 'no_issue';

export interface AuditIssue {
    key: string;
    type: AuditIssueType;
}

export interface AuditResultItem {
    fileName: string;
    issues: AuditIssue[];
}

export interface LocalizationData {
    [key: string]: string;
}

export interface AuditHistoryItem {
    id: string;
    name: string;
    createdAt: string;
    masterFile: { name: string; data: any };
    reviewFiles: { name: string; data: any }[];
    results: AuditResultItem[];
    suggestions: Record<string, LocalizationData>;
    adopted: Record<string, Record<string, boolean>>;
}

export interface AuditState {
    masterFile: { name: string; data: any } | null;
    reviewFiles: { name: string; data: any }[];
    suggestions: Record<string, LocalizationData>;
    adopted: Record<string, Record<string, boolean>>;
    history: AuditHistoryItem[];
}

export type CompareStatus = 'added' | 'modified' | 'removed';

export interface CompareResult {
    key: string;
    status: CompareStatus;
    oldValue: string | null;
    newValue: string | null;
}

export interface CompareHistoryItem {
    id: string;
    oldVersionName: string;
    newVersionName: string;
    createdAt: string;
    oldFile: { name: string; data: any };
    newFile: { name: string; data: any };
    results: CompareResult[];
}

export interface CompareState {
    oldFile: { name: string; data: any } | null;
    newFile: { name: string; data: any } | null;
    adopted: Record<string, boolean>;
    history: CompareHistoryItem[];
}

export interface ProjectState {
    sceneLibraryState: SceneLibraryState;
    translatorState: TranslatorState;
    auditState: AuditState;
    compareState: CompareState;
}

export interface Project {
    id: string;
    name: string;
    createdAt: string;
    state: ProjectState;
    members?: string[];
}

// --- Reports ---
export type ReportMetricKey = string;

export interface SharedReportLink {
    id: string;
    reportId: string;
    token: string;
    createdBy: string;
    createdAt: string;
    expiresAt: string | null;
    viewCount: number;
    password?: string;
    includedColumns?: ReportMetricKey[];
}

export interface ReportCreative {
    creativeId: string;
    name: string;
    country: string;
    platform: string;
    os: string;
    position: string;
    creativeType: 'video' | 'image';
    aspectRatio: '1:1' | '9:16' | '16:9' | '4:5';
    previewUrl?: string;
    aiRating: number;
    impressions: number;
    spend: number;
    installs: number;
    ctr: number;
    cvr: number;
    roasD1: number;
    roasD3: number;
    roasD7: number;
    avgPlayTime: number;
    threeSecondPlayRate: number;
    completionRate: number;
    retention: number;
    duration?: number;
}

export interface AutomationReport {
    id: string;
    title: string;
    product: string;
    channel: string;
    startDate: string;
    endDate: string;
    createdAt: string;
    creatives: ReportCreative[];
    sharedLinks?: SharedReportLink[];
}

export interface VersionKpiData {
    userCount: number;
    kpis: {
        retention: { d1: number; d3: number; d7: number };
        monetization: { payingUserRate: number; arpu: number; arppu: number };
        engagement: { avgSessionDurationMinutes: number; avgLevelsCompleted: number };
    };
    featureEngagement: { featureName: string; engagementRate: number }[];
    firstPurchaseDistribution: { itemName: string; percentage: number; color: string }[];
}

export interface InAppABTestReport {
    id: string;
    title: string;
    testName: string;
    country: string;
    channel: string;
    startDate: string;
    endDate: string;
    createdAt: string;
    controlGroup: VersionKpiData;
    experimentalGroup: VersionKpiData;
    experimentalGroupC?: VersionKpiData;
    aiSummary?: string;
}

export interface VersionComparisonReport {
    id: string;
    title: string;
    oldVersion: string;
    newVersion: string;
    country: string;
    channel: string;
    startDate: string;
    endDate: string;
    createdAt: string;
    oldVersionData: VersionKpiData;
    newVersionData: VersionKpiData;
    aiSummary?: string;
}

// --- Admin / Accounts ---
export interface Application {
    id: string;
    name: string;
    platform: 'Android' | 'iOS' | 'H5';
    appStore: 'Google Play' | 'App Store' | 'Other';
    project: string;
    packageName: string;
    appId: string;
    appCode?: string;
    creator: string;
    createdAt: string;
    status: 'active' | 'inactive';
}

export interface AdAccount {
    id: string;
    appName: string;
    accountIds: string[];
    token?: string;
}

export interface AdjustAccount {
    id: string;
    appName: string;
    accountId: string;
}

export interface TikTokAccount {
    id: string;
    appName: string;
    accountIds: string[];
}
