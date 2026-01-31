
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { DingTalkUser, AttendanceMap, DailyAttendanceStatus, DailyAttendanceStatusType, PunchRecord, EmployeeStats } from '../../../database/schema.ts';
import { 
    ArrowLeftIcon, SearchIcon, FilterIcon, Loader2Icon, AlertTriangleIcon, DownloadIcon, 
    PencilIcon, CheckIcon, XIcon, UndoIcon, SaveIcon, ArrowRightIcon, LinkIcon, TrashIcon, 
    ClockIcon, DollarSignIcon, CalendarIcon, CheckCircleIcon, UserMinusIcon, UserIcon, 
    SparklesIcon, ChevronRightIcon, ChevronDownIcon, RefreshCwIcon, UsersIcon 
} from '../../Icons.tsx';
import { Avatar } from './AttendanceShared.tsx';
import { getLateMinutes, isFullDayLeave, fetchProcessDetail, calculateDailyLeaveDuration, checkTimeInLeaveRange, SmartCache } from '../utils.ts';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { useAttendanceStats } from './useAttendanceStats.ts';
import { Modal } from '../../Modal.tsx';
import { analyzeCalendarPattern } from '../../../services/aiChatService.ts';
import { getCachedAnalysis, setCachedAnalysis, getCalendarAnalysisCacheKey } from '../../../services/aiCacheService.ts';
import { MarkdownRenderer } from './MarkdownRenderer.tsx';

const LEAVE_TYPE_STYLES: Record<string, string> = {
    '年假': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800',
    '事假': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800',
    '病假': 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
    '调休': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800',
    '外出': 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600',
    '加班': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
    '产假': 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800',
    '育儿假': 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800',
    '婚假': 'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300 border border-pink-200 dark:border-pink-800',
    '丧假': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600',
    '缺卡': 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border border-red-200 dark:border-red-800',
    '迟到': 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 border border-orange-200 dark:border-orange-800',
    'default': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800'
};

const cellClasses: Record<string, string> = {
    'normal': 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700',
    'abnormal': 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30',
    'incomplete': 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30',
    'noRecord': 'bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700/50'
};

const CalendarEmployeeOverviewModal: React.FC<{
    employee: { user: DingTalkUser; stats: EmployeeStats } | null;
    onClose: () => void;
    remarks: string[];
    month: string;
    onViewArchive?: () => void;
    lateExemptionEnabled?: boolean;
    fullAttendanceEnabled?: boolean;
    performancePenaltyEnabled?: boolean;
}> = ({ employee, onClose, remarks, month, onViewArchive, lateExemptionEnabled = true, fullAttendanceEnabled = true, performancePenaltyEnabled = true }) => {
    const [isAvatarZoomed, setIsAvatarZoomed] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [isAnalysing, setIsAnalysing] = useState(false);
    const [showAiPanel, setShowAiPanel] = useState(false);

    // 解析月份获取 year 和 month
    const [year, monthNum] = useMemo(() => {
        const parts = month.split('-').map(Number);
        return parts.length === 2 ? parts : [new Date().getFullYear(), new Date().getMonth() + 1];
    }, [month]);

    // AI 异常分析函数
    const runAiAnalysis = async (forceRefresh = false) => {
        if (!employee) return;
        
        const cacheKey = getCalendarAnalysisCacheKey(employee.user.userid, year, monthNum);
        
        if (!forceRefresh) {
            const cachedContent = await getCachedAnalysis(cacheKey);
            if (cachedContent) {
                setAiAnalysis(cachedContent);
                return;
            }
        }
        
        setIsAnalysing(true);
        setAiAnalysis(null);
        
        const { user, stats } = employee;
        const prompt = `
请分析员工"${user.name}"的考勤异常模式：

基本信息：
- 部门：${user.department || '未分配'}
- 职位：${user.title || '员工'}
- 考勤月份：${month}

考勤统计：
- 迟到次数：${stats.late || 0} 次
- 迟到总时长：${stats.lateMinutes || 0} 分钟
- 豁免后迟到时长：${stats.exemptedLateMinutes || 0} 分钟
- 缺卡次数：${stats.missing || 0} 次
- 旷工次数：${(stats as any).absenteeism || 0} 次
- 加班时长：${stats.overtimeTotalMinutes || 0} 分钟
- 是否全勤：${stats.isFullAttendance ? '是' : '否'}

异常明细：
${remarks.length > 0 ? remarks.join('\n') : '无异常记录'}

请分析：
1. 考勤异常模式（如是否有周一迟到规律、连续迟到等）
2. 潜在问题识别
3. 简短的改进建议（2-3条）
        `.trim();

        try {
            const response = await analyzeCalendarPattern(prompt);
            setAiAnalysis(response.content);
            setCachedAnalysis(cacheKey, response.content, 'employee').catch(console.error);
        } catch (err) {
            console.error(err);
            setAiAnalysis("AI 分析生成失败，请稍后重试。");
        } finally {
            setIsAnalysing(false);
        }
    };

    // AI 异常分析 - 展开时自动触发
    useEffect(() => {
        if (employee && showAiPanel && !aiAnalysis && !isAnalysing) {
            runAiAnalysis();
        }
    }, [employee, showAiPanel]);

    // 当员工变化时，清空之前的 AI 分析结果
    useEffect(() => {
        setAiAnalysis(null);
        setShowAiPanel(false);
    }, [employee?.user?.userid]);

    if (!employee) return null;
    const { user, stats } = employee;

    return (
        <Modal isOpen={!!employee} onClose={onClose} title="月度考勤详情概览" size="lg">
            {isAvatarZoomed && (
                <div 
                    className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200" 
                    onClick={() => setIsAvatarZoomed(false)}
                >
                    {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="max-w-full max-h-full rounded-full shadow-2xl object-cover aspect-square w-[500px]" />
                    ) : (
                       <div className="w-64 h-64 rounded-full bg-sky-500 flex items-center justify-center text-8xl text-white font-bold">
                           {user.name.charAt(0)}
                       </div>
                    )}
                </div>
            )}

            <div className="space-y-6">
                {/* Header Profile */}
                <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div onClick={() => setIsAvatarZoomed(true)} className="cursor-zoom-in hover:opacity-80 transition-opacity">
                        <Avatar name={user.name} avatarUrl={user.avatar} size="lg" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {user.name}
                            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {user.department || '未分配部门'}
                            </span>
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">考勤月份: {month}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        {onViewArchive && (
                            <button 
                                onClick={onViewArchive}
                                className="flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 shadow-sm"
                            >
                                <UserIcon className="w-3 h-3" />
                                查看员工档案
                            </button>
                        )}
                        {fullAttendanceEnabled && (
                            stats.isFullAttendance ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
                                    <CheckCircleIcon className="w-4 h-4 mr-1" /> 全勤标兵
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-600">
                                    非全勤
                                </span>
                            )
                        )}
                    </div>
                </div>

                {/* Key Metrics Grid */}
                <div className={`grid grid-cols-2 ${performancePenaltyEnabled && lateExemptionEnabled ? 'sm:grid-cols-4' : performancePenaltyEnabled || lateExemptionEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
                    {performancePenaltyEnabled && (
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center">
                            <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">绩效扣费/奖励</span>
                            <div className={`text-2xl font-extrabold flex items-center ${fullAttendanceEnabled && stats.isFullAttendance ? 'text-green-600' : (stats.performancePenalty || 0) > 0 ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                <DollarSignIcon className="w-5 h-5 mr-1" />
                                {fullAttendanceEnabled && stats.isFullAttendance ? `+${(stats as any).fullAttendanceBonus || 0}` : stats.performancePenalty ? `-${stats.performancePenalty}` : '0'}
                            </div>
                        </div>
                    )}
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">出勤天数 (实/应)</span>
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">
                            <span className="text-sky-600">{stats.actualAttendanceDays || 0}</span>
                            <span className="text-slate-400 text-lg mx-1">/</span>
                            <span className="text-slate-500">{stats.shouldAttendanceDays || 0}</span>
                        </div>
                    </div>
                    <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center">
                        <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">累计迟到</span>
                        <div className="text-2xl font-bold text-slate-800 dark:text-white">
                            {stats.lateMinutes || 0} <span className="text-xs font-normal text-slate-500">分</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">次数: {stats.late || 0}</div>
                    </div>
                    {lateExemptionEnabled && (
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center">
                            <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">豁免后迟到</span>
                            <div className={`text-2xl font-bold ${stats.exemptedLateMinutes > 0 ? 'text-orange-600' : 'text-slate-800 dark:text-white'}`}>
                                {stats.exemptedLateMinutes || 0} <span className="text-xs font-normal text-slate-500">分</span>
                            </div>
                            {stats.exemptedLateMinutes > 0 && <span className="text-[10px] text-orange-500 px-1.5 py-0.5 bg-orange-50 dark:bg-orange-900/30 rounded mt-1">需关注</span>}
                        </div>
                    )}
                </div>

                {/* Remarks & Breakdown */}
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/50 flex items-center gap-2">
                        <UserMinusIcon className="w-4 h-4 text-slate-500" />
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">假期与异常明细 (备注)</h4>
                    </div>
                    <div className="p-4 max-h-[300px] overflow-y-auto">
                        {remarks.length > 0 ? (
                            <ul className="space-y-3">
                                {remarks.map((remark, idx) => {
                                    // Simple parsing for visual enhancement
                                    const isLeave = remark.includes('假') || remark.includes('调休');
                                    const isLate = remark.includes('迟到');
                                    const isOvertime = remark.includes('加班');
                                    const isMissing = remark.includes('缺卡');

                                    let borderClass = 'border-l-4 border-slate-300 dark:border-slate-600';

                                    if (isLeave) { borderClass = 'border-l-4 border-purple-400'; }
                                    else if (isLate) { borderClass = 'border-l-4 border-orange-400'; }
                                    else if (isOvertime) { borderClass = 'border-l-4 border-blue-400'; }
                                    else if (isMissing) { borderClass = 'border-l-4 border-red-400'; }

                                    return (
                                        <li key={idx} className={`bg-white dark:bg-slate-800 p-3 rounded-r-md shadow-sm text-sm text-slate-700 dark:text-slate-300 flex gap-3 ${borderClass}`}>
                                            {remark}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="text-center py-8 text-slate-400 text-sm">
                                本月无假期或异常记录，表现完美！
                            </div>
                        )}
                    </div>
                </div>

                {/* AI 异常分析面板 */}
                <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-xl border border-indigo-100 dark:border-slate-700 overflow-hidden">
                    <button 
                        onClick={() => setShowAiPanel(!showAiPanel)}
                        className="w-full px-4 py-3 flex items-center justify-between bg-indigo-50/50 dark:bg-slate-800/50 hover:bg-indigo-100/50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <SparklesIcon className="w-4 h-4 text-indigo-500" />
                            <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-100">AI 考勤异常分析</h4>
                        </div>
                        <ChevronDownIcon className={`w-4 h-4 text-indigo-500 transition-transform ${showAiPanel ? 'rotate-180' : ''}`} />
                    </button>
                    {showAiPanel && (
                        <div className="p-4">
                            {aiAnalysis && !isAnalysing && (
                                <div className="flex justify-end mb-2">
                                    <button
                                        onClick={() => runAiAnalysis(true)}
                                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded transition-colors"
                                    >
                                        <Loader2Icon className="w-3 h-3" />
                                        重新分析
                                    </button>
                                </div>
                            )}
                            {isAnalysing ? (
                                <div className="flex items-center justify-center gap-2 py-6">
                                    <Loader2Icon className="w-5 h-5 animate-spin text-indigo-500" />
                                    <span className="text-sm text-slate-500">AI 正在分析考勤模式...</span>
                                </div>
                            ) : aiAnalysis ? (
                                <div className="max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                    <MarkdownRenderer text={aiAnalysis} />
                                </div>
                            ) : (
                                <div className="text-center py-6 text-slate-400 text-sm">
                                    点击展开后自动开始分析
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

// ... (StatusEditor, ToggleSwitch, EditConfirmationModalContent, AttendanceToolbar omitted as they remain largely same) ...
// Re-exporting StatusEditor, ToggleSwitch, EditConfirmationModalContent for brevity as they are internal.
// Assuming they are present or will be re-added if I truncate too much. To be safe, I'll include them if file replacement is full.
// Yes, I should include full content.

const StatusEditor: React.FC<{
    position: { top: number, left: number };
    onClose: () => void;
    onSelect: (status: string, extra?: any) => void;
}> = ({ position, onClose, onSelect }) => {
    const statuses = ['√', '迟到', '缺卡', '事假', '病假', '年假', '调休', '加班', '外出', '婚假', '产假', '育儿假', '丧假'];
    const [customInput, setCustomInput] = useState('');

    return (
        <div style={{ top: position.top, left: position.left }} className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-3 w-64 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-sm font-bold text-slate-800 dark:text-white">修改状态</span>
                <button onClick={onClose}><XIcon className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
                {statuses.map(status => (
                    <button
                        key={status}
                        onClick={() => onSelect(status)}
                        className={`text-xs py-1.5 rounded-md border transition-colors ${status === '√' ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' :
                            status === '迟到' || status === '缺卡' ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' :
                                'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200'
                            }`}
                    >
                        {status}
                    </button>
                ))}
            </div>
            <div className="flex gap-2 mb-2">
                <input
                    type="text"
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    placeholder="自定义..."
                    className="flex-1 text-xs px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md"
                />
                <button
                    onClick={() => { if (customInput) onSelect(customInput) }}
                    className="px-3 py-1 bg-sky-600 text-white text-xs rounded-md hover:bg-sky-500"
                >
                    确认
                </button>
            </div>
            <button
                onClick={() => onSelect('清空')}
                className="w-full flex items-center justify-center gap-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs transition-colors"
            >
                <TrashIcon className="w-3 h-3" />
                清空当前状态
            </button>
        </div>
    );
};

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
    <label className="flex items-center cursor-pointer select-none">
        <div className="relative">
            <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
            <div className={`block w-9 h-5 rounded-full transition-colors ${checked ? 'bg-sky-600' : 'bg-slate-200 dark:bg-slate-600'}`}></div>
            <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${checked ? 'translate-x-4' : ''}`}></div>
        </div>
        <span className="ml-2 text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
    </label>
);

const EditConfirmationModalContent: React.FC<{
    user: DingTalkUser | undefined;
    date: string;
    newStatus: string;
    currentData: DailyAttendanceStatus | undefined;
    onConfirm: (details: { onTime?: string, offTime?: string, procId?: string, processData?: any }) => void;
    onCancel: () => void;
    companyName: string;
}> = ({ user, date, newStatus, currentData, onConfirm, onCancel, companyName }) => {
    const isClear = newStatus === '清空';
    const isTimeRelated = !isClear && (newStatus === '√' || newStatus === '迟到' || newStatus === '加班');
    const isLeave = !isClear && !isTimeRelated && newStatus !== '缺卡' && newStatus.length > 1;

    const [onTime, setOnTime] = useState(currentData?.onDutyTime || '09:00');
    const [offTime, setOffTime] = useState(currentData?.offDutyTime || '18:30');
    const [procId, setProcId] = useState('');
    const [fetchedProcess, setFetchedProcess] = useState<any>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [fetchError, setFetchError] = useState('');
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [isValidationEnabled, setIsValidationEnabled] = useState(true);

    const handleFetchProcess = async () => {
        if (!procId) return;
        setIsFetching(true);
        setFetchError('');
        setFetchedProcess(null);
        setValidationErrors([]);

        try {
            const data = await fetchProcessDetail(procId, companyName);
            if (data) {
                setFetchedProcess(data);
                const errors: string[] = [];
                if (user && data.title) {
                    let applicantName = '';
                    if (data.title.includes('提交的')) applicantName = data.title.split('提交的')[0];
                    else if (data.title.endsWith('的请假申请') || data.title.endsWith('的申请')) applicantName = data.title.split('的')[0];
                    if (applicantName && user.name && !applicantName.includes(user.name) && !user.name.includes(applicantName)) {
                        errors.push(`审批申请人 "${applicantName.trim()}" 与当前员工 "${user.name}" 不匹配`);
                    }
                }
                if (data.formValues) {
                    const startVal = data.formValues.start || data.formValues.startTime;
                    const endVal = data.formValues.end || data.formValues.endTime;
                    if (startVal && endVal) {
                        const cellDateStr = date;
                        const startDateStr = startVal.split(' ')[0];
                        const endDateStr = endVal.split(' ')[0];
                        if (cellDateStr < startDateStr || cellDateStr > endDateStr) {
                            errors.push(`审批日期范围 (${startDateStr} ~ ${endDateStr}) 不包含当前选中日期 (${cellDateStr})`);
                        } else {
                            let newOnTime = '09:00';
                            let newOffTime = '18:30';
                            if (cellDateStr === startDateStr && startVal.includes(' ')) newOnTime = startVal.split(' ')[1].substring(0, 5);
                            if (cellDateStr === endDateStr && endVal.includes(' ')) newOffTime = endVal.split(' ')[1].substring(0, 5);
                            setOnTime(newOnTime);
                            setOffTime(newOffTime);
                        }
                    }
                }
                const processType = data.formValues?.leaveType || data.bizType;
                if (processType && newStatus && newStatus !== processType) {
                    errors.push(`目标状态 "${newStatus}" 与审批单类型 "${processType}" 不一致`);
                }
                setValidationErrors(errors);
            } else {
                setFetchError('未找到该审批单或无法访问');
            }
        } catch (e) {
            setFetchError('获取失败');
        } finally {
            setIsFetching(false);
        }
    };

    const handleConfirm = () => {
        onConfirm({
            onTime: onTime,
            offTime: offTime,
            procId: (isLeave && isValidationEnabled) ? procId : undefined,
            processData: (isLeave && isValidationEnabled) ? fetchedProcess : undefined
        });
    };

    const hasError = validationErrors.length > 0;

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-4">
                <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 sm:mx-0 sm:h-10 sm:w-10"><PencilIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" /></div>
                <div>
                    <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-white">修改考勤状态</h3>
                    <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        <p>员工：<strong className="text-slate-900 dark:text-white">{user?.name}</strong></p>
                        <p>日期：{date}</p>
                        <p className="mt-1">将状态修改为：<span className={`inline-block px-2 py-0.5 rounded font-bold ${isClear ? 'bg-red-100 text-red-700' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white'}`}>{newStatus}</span></p>
                    </div>
                </div>
            </div>
            {(isTimeRelated || isLeave) && (
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-md border border-slate-200 dark:border-slate-700 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">{isLeave ? '补卡/考勤时间同步' : '调整打卡时间'}</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-medium text-slate-500 mb-1">上班打卡</label><input type="time" value={onTime} onChange={e => setOnTime(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm" /></div>
                        <div><label className="block text-xs font-medium text-slate-500 mb-1">下班打卡</label><input type="time" value={offTime} onChange={e => setOffTime(e.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm" /></div>
                    </div>
                    <p className="text-xs text-slate-400">{isLeave ? '若审批包含时间，将自动填入。此时间将作为补卡记录。' : '修改时间将同步更新打卡记录。'}</p>
                </div>
            )}
            {isLeave && (
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-md border border-slate-200 dark:border-slate-700 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">{isValidationEnabled ? '关联审批单 (必填)' : '关联审批单 (已禁用)'}</h4>
                    {isValidationEnabled && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                            <div className="flex gap-2">
                                <input type="text" placeholder="输入审批实例 ID" value={procId} onChange={e => setProcId(e.target.value)} className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-1.5 text-sm" />
                                <button onClick={handleFetchProcess} disabled={!procId || isFetching} className="px-3 py-1.5 bg-sky-600 text-white rounded text-xs font-medium hover:bg-sky-500 disabled:opacity-50">{isFetching ? <Loader2Icon className="w-3 h-3 animate-spin" /> : '获取'}</button>
                            </div>
                            {fetchError && <p className="text-xs text-red-500">{fetchError}</p>}
                            {hasError && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md"><ul className="list-disc list-inside text-xs text-red-600 dark:text-red-300 space-y-1 pl-1">{validationErrors.map((err, idx) => <li key={idx}>{err}</li>)}</ul></div>}
                            {fetchedProcess && <div className={`mt-2 p-2 rounded text-xs border ${hasError ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-75' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}><p className="font-bold">已获取审批详情：</p><p className="truncate mt-1">标题: {fetchedProcess.title}</p></div>}
                        </div>
                    )}
                    <div className="pt-2"><ToggleSwitch checked={isValidationEnabled} onChange={setIsValidationEnabled} label="启用强校验" /></div>
                </div>
            )}
            {isClear && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-600 dark:text-red-300">此操作将清除当天所有已标记的异常状态、迟到标记或关联审批单，重置为普通状态。</div>}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md hover:bg-slate-50 dark:hover:bg-slate-600">取消</button>
                <button onClick={handleConfirm} disabled={isLeave && isValidationEnabled && (!fetchedProcess || hasError)} className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed">确认修改</button>
            </div>
        </div>
    );
};

const AttendanceToolbar: React.FC<{
    showDetails: boolean;
    searchTerm: string;
    setSearchTerm: any;
    onToggleDetails: () => void;
    departments: string[];
    selectedDepartments: string[];
    onSelectDepartments: (depts: string[]) => void;
    selectedEmployees: string[];
    onSelectEmployees: (employees: string[]) => void;
    allUsers: DingTalkUser[];
    filterStatus: string;
    onFilterStatusChange: (status: string) => void;
    isEditing: boolean;
    onToggleEdit: () => void;
    onUndo: () => void;
    canUndo: boolean;
    onCancelEdit: () => void;
    onSave: () => void;
    hasChanges: boolean;
    canEdit: boolean; // Permission Prop
}> = ({ searchTerm, setSearchTerm, showDetails, onToggleDetails, departments, selectedDepartments, onSelectDepartments, selectedEmployees, onSelectEmployees, allUsers, filterStatus, onFilterStatusChange, isEditing, onToggleEdit, onUndo, canUndo, onCancelEdit, onSave, hasChanges, canEdit }) => {
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
    const employeeDropdownRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭下拉框
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target as Node)) {
                setShowEmployeeDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 提取独立部门列表（去重）
    const uniqueDepartments = useMemo(() => {
        const deptSet = new Set<string>();
        allUsers.forEach(user => {
            if (user.department) {
                // 拆分组合部门
                const depts = user.department.split('、');
                depts.forEach(dept => {
                    const trimmed = dept.trim();
                    if (trimmed) deptSet.add(trimmed);
                });
            }
        });
        return Array.from(deptSet).sort();
    }, [allUsers]);

    // 按部门分组员工
    const employeesByDept = useMemo(() => {
        const grouped: Record<string, DingTalkUser[]> = {};
        uniqueDepartments.forEach(dept => {
            grouped[dept] = allUsers.filter(u => 
                u.department?.split('、').map(d => d.trim()).includes(dept)
            );
        });
        return grouped;
    }, [allUsers, uniqueDepartments]);

    // 过滤后的部门和员工（根据搜索词）
    const filteredData = useMemo(() => {
        if (!employeeSearch) {
            return { departments: uniqueDepartments, employeesByDept };
        }
        const searchLower = employeeSearch.toLowerCase();
        const filteredDepts: string[] = [];
        const filteredEmployeesByDept: Record<string, DingTalkUser[]> = {};
        
        uniqueDepartments.forEach(dept => {
            // 部门名称匹配
            const deptMatch = dept.toLowerCase().includes(searchLower);
            // 部门下的员工匹配
            const matchedEmployees = employeesByDept[dept]?.filter(u => 
                u.name.toLowerCase().includes(searchLower)
            ) || [];
            
            if (deptMatch || matchedEmployees.length > 0) {
                filteredDepts.push(dept);
                filteredEmployeesByDept[dept] = deptMatch ? employeesByDept[dept] : matchedEmployees;
            }
        });
        
        return { departments: filteredDepts, employeesByDept: filteredEmployeesByDept };
    }, [employeeSearch, uniqueDepartments, employeesByDept]);

    // 切换部门展开/收起
    const toggleDeptExpand = (dept: string) => {
        const newExpanded = new Set(expandedDepts);
        if (newExpanded.has(dept)) {
            newExpanded.delete(dept);
        } else {
            newExpanded.add(dept);
        }
        setExpandedDepts(newExpanded);
    };

    // 选中/取消选中整个部门的所有员工
    const handleDeptToggle = (dept: string) => {
        const deptEmployees = employeesByDept[dept] || [];
        const deptEmployeeIds = deptEmployees.map(u => u.userid);
        const allSelected = deptEmployeeIds.every(id => selectedEmployees.includes(id));
        
        if (allSelected) {
            // 取消选中该部门所有员工
            onSelectEmployees(selectedEmployees.filter(id => !deptEmployeeIds.includes(id)));
        } else {
            // 选中该部门所有员工
            const newSelected = new Set([...selectedEmployees, ...deptEmployeeIds]);
            onSelectEmployees(Array.from(newSelected));
        }
    };

    // 检查部门是否全选
    const isDeptFullySelected = (dept: string) => {
        const deptEmployees = employeesByDept[dept] || [];
        if (deptEmployees.length === 0) return false;
        return deptEmployees.every(u => selectedEmployees.includes(u.userid));
    };

    // 检查部门是否部分选中
    const isDeptPartiallySelected = (dept: string) => {
        const deptEmployees = employeesByDept[dept] || [];
        if (deptEmployees.length === 0) return false;
        const selectedCount = deptEmployees.filter(u => selectedEmployees.includes(u.userid)).length;
        return selectedCount > 0 && selectedCount < deptEmployees.length;
    };

    // 员工多选处理
    const handleEmployeeToggle = (userId: string) => {
        if (selectedEmployees.includes(userId)) {
            onSelectEmployees(selectedEmployees.filter(id => id !== userId));
        } else {
            onSelectEmployees([...selectedEmployees, userId]);
        }
    };

    // 获取选中员工的显示文本
    const selectedDisplay = useMemo(() => {
        if (selectedEmployees.length === 0) return '全部员工';
        if (selectedEmployees.length === 1) {
            const user = allUsers.find(u => u.userid === selectedEmployees[0]);
            return user?.name || '1 人';
        }
        // 检查是否选中了完整的部门
        for (const dept of uniqueDepartments) {
            const deptEmployees = employeesByDept[dept] || [];
            if (deptEmployees.length > 0 && deptEmployees.length === selectedEmployees.length) {
                const allInDept = deptEmployees.every(u => selectedEmployees.includes(u.userid));
                if (allInDept) {
                    return dept;
                }
            }
        }
        return `已选 ${selectedEmployees.length} 人`;
    }, [selectedEmployees, allUsers, uniqueDepartments, employeesByDept]);

    return (
        <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            {/* 部门-员工层级多选 */}
            <div className="relative" ref={employeeDropdownRef}>
                <button
                    onClick={() => setShowEmployeeDropdown(!showEmployeeDropdown)}
                    className="flex items-center gap-2 min-w-[180px] bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm text-left hover:border-sky-500 transition-colors"
                >
                    <UsersIcon className="w-4 h-4 text-slate-400" />
                    <span className="flex-1 truncate">{selectedDisplay}</span>
                    <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${showEmployeeDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showEmployeeDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden flex flex-col">
                        {/* 搜索框 */}
                        <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                            <input
                                type="text"
                                placeholder="搜索部门或员工..."
                                value={employeeSearch}
                                onChange={e => setEmployeeSearch(e.target.value)}
                                className="w-full text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5"
                            />
                        </div>
                        {/* 快捷操作 */}
                        <div className="p-2 border-b border-slate-200 dark:border-slate-700 flex gap-2">
                            <button
                                onClick={() => onSelectEmployees(allUsers.map(u => u.userid))}
                                className="flex-1 text-xs py-1 bg-sky-50 text-sky-600 rounded hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400"
                            >
                                全选
                            </button>
                            <button
                                onClick={() => onSelectEmployees([])}
                                className="flex-1 text-xs py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400"
                            >
                                清空
                            </button>
                            <button
                                onClick={() => setExpandedDepts(new Set(uniqueDepartments))}
                                className="flex-1 text-xs py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400"
                            >
                                展开全部
                            </button>
                            <button
                                onClick={() => setExpandedDepts(new Set())}
                                className="flex-1 text-xs py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400"
                            >
                                收起全部
                            </button>
                        </div>
                        {/* 部门-员工树形列表 */}
                        <div className="overflow-y-auto flex-1 p-2">
                            {filteredData.departments.map(dept => {
                                const deptEmployees = filteredData.employeesByDept[dept] || [];
                                const isExpanded = expandedDepts.has(dept);
                                const isFullySelected = isDeptFullySelected(dept);
                                const isPartiallySelected = isDeptPartiallySelected(dept);
                                
                                return (
                                    <div key={dept} className="mb-1">
                                        {/* 部门行 */}
                                        <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-700">
                                            <button
                                                onClick={() => toggleDeptExpand(dept)}
                                                className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                                            >
                                                <ChevronRightIcon className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                            </button>
                                            <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isFullySelected}
                                                    ref={el => {
                                                        if (el) el.indeterminate = isPartiallySelected;
                                                    }}
                                                    onChange={() => handleDeptToggle(dept)}
                                                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                                />
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{dept}</span>
                                                <span className="text-xs text-slate-400 ml-auto">({deptEmployees.length}人)</span>
                                            </label>
                                        </div>
                                        {/* 员工列表 */}
                                        {isExpanded && (
                                            <div className="ml-6 border-l-2 border-slate-200 dark:border-slate-700 pl-2">
                                                {deptEmployees.map(user => (
                                                    <label
                                                        key={user.userid}
                                                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedEmployees.includes(user.userid)}
                                                            onChange={() => handleEmployeeToggle(user.userid)}
                                                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                                        />
                                                        <span className="text-sm text-slate-600 dark:text-slate-400">{user.name}</span>
                                                        {user.title && (
                                                            <span className="text-xs text-slate-400 ml-auto truncate max-w-[100px]">{user.title}</span>
                                                        )}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {filteredData.departments.length === 0 && (
                                <div className="text-center py-4 text-slate-400 text-sm">
                                    未找到匹配的部门或员工
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                <select value={filterStatus} onChange={(e) => onFilterStatusChange(e.target.value)} className="text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500">
                    <option value="all">所有状态</option>
                    <option value="abnormal">异常 (迟到/缺卡)</option>
                    <option value="leave">请假</option>
                    <option value="normal">正常</option>
                </select>
            </div>
            <div className="flex-grow"></div>
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 mr-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">显示详情</span>
                    <button onClick={onToggleDetails} className={`${showDetails ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-600'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2`}>
                        <span className={`${showDetails ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                    </button>
                </div>

                {canEdit && (
                    isEditing ? (
                        <>
                            <button onClick={onUndo} disabled={!canUndo} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed">
                                <UndoIcon className="w-4 h-4" /> 撤回
                            </button>
                            <button onClick={onCancelEdit} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-red-600 dark:text-red-400 hover:bg-slate-50 hover:border-red-300 dark:hover:border-red-700">
                                <XIcon className="w-4 h-4" /> 关闭编辑模式
                            </button>
                            <button onClick={onSave} disabled={!hasChanges} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-green-600 text-white hover:bg-green-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                                <SaveIcon className="w-4 h-4" /> 保存修改
                            </button>
                        </>
                    ) : (
                        <button onClick={onToggleEdit} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 hover:border-sky-500 hover:text-sky-600">
                            <PencilIcon className="w-4 h-4" /> 打开编辑模式
                        </button>
                    )
                )}
            </div>
        </div>
    );
};

export const AttendanceCalendarView: React.FC<{
    users: DingTalkUser[];
    attendanceMap: AttendanceMap;
    setAttendanceMap: React.Dispatch<React.SetStateAction<AttendanceMap>>;
    month: string;
    onBack: () => void;
    onCellClick: (detail: { user: DingTalkUser; day: number; status: DailyAttendanceStatus }) => void;
    processDataMap: Record<string, any>;
    setProcessDataMap: React.Dispatch<React.SetStateAction<Record<string, any>>>;
    holidays: any;
    companyName: string;
    currentCompany: string; // Add currentCompany prop for cache key
    onConfirm: () => void;
    onUndo: () => void;
    canUndo: boolean;
    canEdit?: boolean; // Permission Prop
    onViewDetails?: (user: DingTalkUser) => void;
    targetEmployee?: { userId: string; name: string }; // 目标员工信息，用于自动定位
    lateExemptionEnabled?: boolean; // 是否启用豁免功能
    fullAttendanceEnabled?: boolean; // 是否启用全勤功能
    performancePenaltyEnabled?: boolean; // 是否启用绩效考核功能
}> = ({ users, attendanceMap, setAttendanceMap, month, onBack, onCellClick, processDataMap, setProcessDataMap, holidays, companyName, currentCompany, onConfirm, onUndo, canUndo, canEdit = false, onViewDetails, targetEmployee, lateExemptionEnabled = true, fullAttendanceEnabled = true, performancePenaltyEnabled = true }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [loadingProcesses] = useState<Set<string>>(new Set());
    const [showDetails, setShowDetails] = useState(false);
    const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
    const [filterStatus, setFilterStatus] = useState('all');
    const [highlightedEmployee, setHighlightedEmployee] = useState<string | null>(null); // 高亮的员工ID

    // 自动定位到目标员工
    useEffect(() => {
        if (targetEmployee) {
            // 设置选中员工为目标员工
            setSelectedEmployees([targetEmployee.userId]);
            // 设置高亮
            setHighlightedEmployee(targetEmployee.userId);
            
            // 3秒后清除高亮效果
            const timer = setTimeout(() => {
                setHighlightedEmployee(null);
            }, 3000);
            
            return () => clearTimeout(timer);
        }
    }, [targetEmployee]);

    // Overview Modal State
    const [overviewEmployee, setOverviewEmployee] = useState<{ user: DingTalkUser; stats: EmployeeStats; remarks: string[] } | null>(null);

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    const [activeEditor, setActiveEditor] = useState<{ userId: string, day: number, top: number, left: number } | null>(null);

    // pendingChange now stores basic info, the detailed changes come from the modal callback
    const [pendingChange, setPendingChange] = useState<{ userId: string, day: number, newStatus: string } | null>(null);

    const snapshotRef = useRef<AttendanceMap | null>(null);

    // Calculate hasChanges to enable/disable Save button
    // Comparing large objects might be heavy, but necessary for the feature.
    // Memoizing based on attendanceMap and isEditing.
    const hasChanges = useMemo(() => {
        if (!isEditing || !snapshotRef.current) return false;
        return JSON.stringify(attendanceMap) !== JSON.stringify(snapshotRef.current);
    }, [attendanceMap, isEditing]);

    const { daysInMonth, year, monthIndex } = useMemo(() => {
        const [y, m] = month.split('-').map(Number);
        return { daysInMonth: new Date(y, m, 0).getDate(), year: y, monthIndex: m - 1 };
    }, [month]);

    // Calculate stats internally to support download with current (edited) data
    const statsData = useAttendanceStats(users, attendanceMap, processDataMap, holidays, year, monthIndex);
    const { companyEmployeeStats } = statsData;

    // 检查数据是否正在加载
    const isDataLoading = useMemo(() => {
        // 1. 如果没有用户数据，说明还在初始加载
        if (users.length === 0) return true;
        
        // 2. 如果有用户但没有考勤数据，说明考勤数据还在加载
        if (Object.keys(attendanceMap).length === 0) return true;
        
        // 3. 如果有考勤数据但没有统计数据，说明统计计算还在进行
        if (!companyEmployeeStats || Object.keys(companyEmployeeStats).length === 0) return true;
        
        // 4. 检查是否有实际的员工统计数据
        const hasEmployeeData = Object.values(companyEmployeeStats).some(employees => 
            Array.isArray(employees) && employees.length > 0
        );
        if (!hasEmployeeData) return true;
        
        return false;
    }, [users, attendanceMap, companyEmployeeStats]);

    const departments = useMemo(() => {
        const depts = new Set<string>();
        users.forEach(u => { if (u.department) depts.add(u.department); });
        return Array.from(depts).sort();
    }, [users]);

    // We need a lookup for sorting inside the calendar view
    const userStatsMap = useMemo(() => {
        const map = new Map<string, EmployeeStats>();
        Object.values(companyEmployeeStats).flat().forEach((item: any) => {
            map.set(item.user.userid, item.stats);
        });
        return map;
    }, [companyEmployeeStats]);

    const filteredUsers = useMemo(() => {
        const result = users.filter(user => {
            // 员工多选过滤
            const employeeMatch = selectedEmployees.length === 0 || selectedEmployees.includes(user.userid);
            let statusMatch = true;
            if (filterStatus !== 'all') {
                const userAttendance = attendanceMap[user.userid];
                if (!userAttendance) return false;
                const days = Object.values(userAttendance) as DailyAttendanceStatus[];
                if (filterStatus === 'abnormal') statusMatch = days.some(d => d.hasAbnormality || d.status === 'incomplete' || d.records.some(r => r.timeResult === 'Late'));
                else if (filterStatus === 'leave') statusMatch = days.some(d => d.records.some(r => r.procInstId));
                else if (filterStatus === 'normal') statusMatch = !days.some(d => d.hasAbnormality || d.status === 'incomplete' || d.records.some(r => r.timeResult === 'Late'));
            }
            return employeeMatch && statusMatch;
        });

        // Apply Sort based on user requirements:
        // 1. Performance Penalty (Descending - worst first)
        // 2. Full Attendance (True first)
        // 3. Accumulated Late Minutes (Descending - worst first for the remaining)
        return result.sort((a, b) => {
            const statsA = userStatsMap.get(a.userid) || {} as EmployeeStats;
            const statsB = userStatsMap.get(b.userid) || {} as EmployeeStats;

            // 1. Penalty
            const penaltyA = statsA.performancePenalty || 0;
            const penaltyB = statsB.performancePenalty || 0;
            if (penaltyA !== penaltyB) return penaltyB - penaltyA;

            // 2. Full Attendance
            const fullA = statsA.isFullAttendance ? 1 : 0;
            const fullB = statsB.isFullAttendance ? 1 : 0;
            if (fullA !== fullB) return fullB - fullA;

            // 3. Late Minutes
            const lateA = statsA.lateMinutes || 0;
            const lateB = statsB.lateMinutes || 0;
            return lateB - lateA;
        });
    }, [users, selectedEmployees, filterStatus, attendanceMap, userStatsMap]);

    const handleStartEdit = () => {
        snapshotRef.current = JSON.parse(JSON.stringify(attendanceMap)); // Deep copy to safely revert
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        if (snapshotRef.current) {
            setAttendanceMap(snapshotRef.current);
        }
        setIsEditing(false);
        snapshotRef.current = null;
        setPendingChange(null);
        setActiveEditor(null);
    };

    const handleSaveEdit = async () => {
        // 添加保存确认提示
        const confirmMessage = `
⚠️ 确认保存考勤数据修改？

此操作将会：
• 保存您对考勤日历的所有修改到数据库
• 更新本地缓存数据
• 记录修改日志和审计记录

确定要保存这些修改吗？
        `.trim();

        if (!confirm(confirmMessage)) {
            return; // 用户取消保存
        }

        try {
            // 🔥 收集所有修改的数据，准备入库
            const updates: any[] = [];
            const [year, monthNum] = month.split('-').map(Number);
            
            // 遍历考勤地图，收集所有修改的记录
            for (const [userId, userDays] of Object.entries(attendanceMap)) {
                for (const [dayStr, status] of Object.entries(userDays)) {
                    const day = parseInt(dayStr);
                    const date = `${month}-${String(day).padStart(2, '0')}`;
                    
                    // 构建更新记录
                    const updateRecord = {
                        userId,
                        date,
                        status: status.status,
                        onDutyTime: status.onDutyTime,
                        offDutyTime: status.offDutyTime,
                        records: status.records || [],
                        editReason: '考勤日历编辑修改',
                        // 如果有关联的审批单ID，也包含进去
                        linkedProcInstId: status.records?.find(r => r.procInstId)?.procInstId
                    };
                    
                    updates.push(updateRecord);
                }
            }
            
            if (updates.length === 0) {
                alert('没有需要保存的修改');
                return;
            }
            
            // 🔥 调用API进行入库
            const { attendanceApiService } = await import('../../../services/attendanceApiService.ts');
            const companyId = currentCompany === 'eyewind' || currentCompany === '风眼' ? 'eyewind' : 'hydodo';
            
            console.log(`[AttendanceCalendar] 开始保存 ${updates.length} 条考勤记录到数据库`);
            
            const result = await attendanceApiService.batchUpdateDaily(companyId, updates);
            
            console.log(`[AttendanceCalendar] 数据库保存成功:`, result);
            
            // 🔥 保存成功后，更新本地缓存
            const cacheKey = `ATTENDANCE_MAP_CACHE_${currentCompany}_${month}`;
            await SmartCache.set(cacheKey, attendanceMap);
            
            alert(`✅ 保存成功！已更新 ${result.updated} 条记录到数据库`);
            setIsEditing(false);
            snapshotRef.current = null;
            
        } catch (error) {
            console.error('[AttendanceCalendar] 保存失败:', error);
            
            // 🔥 如果数据库保存失败，提供降级选项
            const fallbackMessage = `
❌ 数据库保存失败：${error instanceof Error ? error.message : '未知错误'}

是否仅保存到本地缓存？
• 点击"确定"：保存到本地缓存（下次刷新可能丢失）
• 点击"取消"：放弃保存，继续编辑
            `.trim();
            
            if (confirm(fallbackMessage)) {
                try {
                    const cacheKey = `ATTENDANCE_MAP_CACHE_${currentCompany}_${month}`;
                    await SmartCache.set(cacheKey, attendanceMap);
                    alert('⚠️ 已保存到本地缓存，建议稍后重试数据库保存');
                    setIsEditing(false);
                    snapshotRef.current = null;
                } catch (cacheError) {
                    console.error('[AttendanceCalendar] 本地缓存保存也失败:', cacheError);
                    alert('❌ 保存完全失败，请检查网络连接后重试');
                }
            }
        }
    };

    const handleCellClick = (e: React.MouseEvent, user: DingTalkUser, day: number, statusData: DailyAttendanceStatus | undefined) => {
        if (isEditing) {
            const rect = e.currentTarget.getBoundingClientRect();
            // Adjust position to stay on screen
            let top = rect.bottom + window.scrollY;
            let left = rect.left + window.scrollX;
            if (left + 250 > window.innerWidth) left = rect.right - 250 + window.scrollX;
            if (top + 200 > window.innerHeight + window.scrollY) top = rect.top - 200 + window.scrollY;

            setActiveEditor({ userId: user.userid, day, top, left });
        } else if (statusData) {
            onCellClick({ user, day, status: statusData });
        }
    };

    const handleStatusSelect = (newStatus: string) => {
        if (!activeEditor) return;
        const { userId, day } = activeEditor;
        setPendingChange({ userId, day, newStatus });
        setActiveEditor(null);
    };

    const confirmModification = (details: { onTime?: string, offTime?: string, procId?: string, processData?: any }) => {
        if (!pendingChange) return;
        const { userId, day, newStatus } = pendingChange;
        const { onTime, offTime, procId, processData } = details;

        if (processData && procId) {
            setProcessDataMap(prev => ({
                ...prev,
                [procId]: processData
            }));
        }

        const dateObj = new Date(year, monthIndex, day);
        const dayStartTs = dateObj.getTime();

        const buildTimestamp = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            const d = new Date(dateObj);
            d.setHours(h, m, 0, 0);
            return d.getTime();
        };

        let records: PunchRecord[] = [];

        if (newStatus === '清空') {
            records = [];
            records.push({
                userId, workDate: dayStartTs,
                checkType: 'OnDuty', sourceType: 'MANUAL_EDIT',
                timeResult: 'Normal', locationResult: 'Normal',
                userCheckTime: 0, baseCheckTime: 0,
                checkType_Desc: '上班', sourceType_Desc: '管理员清除', timeResult_Desc: '正常'
            });
        }
        else if (newStatus === '√' || newStatus === '迟到' || newStatus === '加班') {
            if (onTime) {
                records.push({
                    userId,
                    workDate: dayStartTs,
                    userCheckTime: buildTimestamp(onTime),
                    baseCheckTime: buildTimestamp('09:00'),
                    checkType: 'OnDuty',
                    sourceType: 'MANUAL_EDIT',
                    timeResult: newStatus === '迟到' ? 'Late' : 'Normal',
                    locationResult: 'Normal',
                    checkType_Desc: '上班',
                    sourceType_Desc: '管理员修改',
                    timeResult_Desc: newStatus === '迟到' ? '迟到' : '正常'
                });
            }
            if (offTime) {
                records.push({
                    userId,
                    workDate: dayStartTs,
                    userCheckTime: buildTimestamp(offTime),
                    baseCheckTime: buildTimestamp('18:30'),
                    checkType: 'OffDuty',
                    sourceType: 'MANUAL_EDIT',
                    timeResult: 'Normal',
                    locationResult: 'Normal',
                    checkType_Desc: '下班',
                    sourceType_Desc: '管理员修改',
                    timeResult_Desc: '正常'
                });
            }
        } else if (newStatus === '缺卡') {
            records = [{
                userId, workDate: dayStartTs,
                checkType: 'OnDuty', sourceType: 'MANUAL_EDIT',
                timeResult: 'NotSigned', locationResult: 'NotSigned',
                userCheckTime: 0, baseCheckTime: 0,
                checkType_Desc: '上班', sourceType_Desc: '管理员修改', timeResult_Desc: '缺卡'
            }];
        } else if (procId) {
            const onTimeTs = onTime ? buildTimestamp(onTime) : dayStartTs + 9 * 3600 * 1000;
            const offTimeTs = offTime ? buildTimestamp(offTime) : dayStartTs + 18.5 * 3600 * 1000;

            records = [
                {
                    userId,
                    workDate: dayStartTs,
                    checkType: 'OnDuty',
                    sourceType: 'APPROVE',
                    timeResult: 'Normal',
                    locationResult: 'Normal',
                    userCheckTime: onTimeTs,
                    baseCheckTime: dayStartTs + 9 * 3600 * 1000,
                    procInstId: procId,
                    checkType_Desc: '上班',
                    sourceType_Desc: '审批',
                    timeResult_Desc: '正常'
                },
                {
                    userId,
                    workDate: dayStartTs,
                    checkType: 'OffDuty',
                    sourceType: 'APPROVE',
                    timeResult: 'Normal',
                    locationResult: 'Normal',
                    userCheckTime: offTimeTs,
                    baseCheckTime: dayStartTs + 18.5 * 3600 * 1000,
                    procInstId: procId,
                    checkType_Desc: '下班',
                    sourceType_Desc: '审批',
                    timeResult_Desc: '正常'
                }
            ];
        } else {
            records = [{
                userId, workDate: dayStartTs,
                checkType: 'OnDuty', sourceType: 'MANUAL_EDIT',
                timeResult: 'Normal', locationResult: 'Normal',
                userCheckTime: dayStartTs + 9 * 3600 * 1000, baseCheckTime: dayStartTs + 9 * 3600 * 1000,
                checkType_Desc: '上班', sourceType_Desc: '管理员修改', timeResult_Desc: newStatus
            }];
        }

        setAttendanceMap(prev => {
            const userMap = { ...(prev[userId] || {}) };

            let statusType: DailyAttendanceStatusType = 'normal';
            if (newStatus === '缺卡') statusType = 'incomplete';
            else if (newStatus === '迟到') statusType = 'abnormal';

            const newDailyStatus: DailyAttendanceStatus = {
                status: statusType,
                records: records,
                hasAbnormality: newStatus === '迟到' || newStatus === '缺卡',
                hasOffDutyApprove: false,
                hasOnDutyApprove: false,
                onDutyTime: (newStatus === '清空' || newStatus === '缺卡') ? undefined : (onTime || (newStatus === '√' ? '09:00' : undefined)),
                offDutyTime: (newStatus === '清空' || newStatus === '缺卡') ? undefined : (offTime || (newStatus === '√' ? '18:30' : undefined))
            };
            userMap[day] = newDailyStatus;
            return { ...prev, [userId]: userMap };
        });

        setPendingChange(null);
    };

    // --- Generate Remarks Logic (Reused for Modal) ---
    const generateEmployeeRemarks = (user: DingTalkUser, stats: EmployeeStats): string[] => {
        const userId = user.userid;
        const userAttendance = attendanceMap[userId];
        if (!userAttendance) return [];
        const remarks: string[] = [];
        const [y, m] = month.split('-').map(Number);
        const monthStr = String(m).padStart(2, '0');

        for (let d = 1; d <= daysInMonth; d++) {
            const daily = userAttendance[d];
            if (!daily) continue;

            const procRecord = daily.records.find((r: any) => r.procInstId);
            if (procRecord) {
                const p = processDataMap[procRecord.procInstId];
                if (p) {
                    const type = p.formValues?.leaveType || p.bizType;
                    const duration = p.formValues?.duration || 0;
                    const unit = p.formValues?.durationUnit === 'day' ? '天' : '小时';
                    if (type && duration > 0) {
                        const start = p.formValues?.start || p.formValues?.startTime;
                        const end = p.formValues?.end || p.formValues?.endTime;
                        const remarkEntry = `${type}: ${start} 至 ${end} (共${duration}${unit})`;
                        if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                    }
                }
            }

            const dateKey = `${monthStr}-${String(d).padStart(2, '0')}`;
            const holidayInfo = holidays[dateKey];
            const dateObj = new Date(year, m - 1, d);
            const dayOfWeek = dateObj.getDay();
            if ([0, 6].includes(dayOfWeek) && (!holidayInfo || holidayInfo.holiday !== false)) {
                const onTime = daily.records.find((r: any) => r.checkType === 'OnDuty')?.userCheckTime;
                const offTime = daily.records.find((r: any) => r.checkType === 'OffDuty')?.userCheckTime;
                if (onTime && offTime) {
                    const duration = ((new Date(offTime).getTime() - new Date(onTime).getTime()) / 3600 / 1000).toFixed(2);
                    const remarkEntry = `加班: ${year}-${monthStr}-${String(d).padStart(2, '0')} (共${duration}小时)`;
                    if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                }
            }

            if (daily.status === 'incomplete') {
                const remarkEntry = `缺卡: ${year}-${monthStr}-${String(d).padStart(2, '0')}`;
                if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
            }
        }
        return remarks;
    };

    const handleOverviewClick = (user: DingTalkUser) => {
        const stats = userStatsMap.get(user.userid);
        if (stats) {
            const remarks = generateEmployeeRemarks(user, stats);
            setOverviewEmployee({ user, stats, remarks });
        }
    };

    // 如果数据正在加载，显示loading状态
    if (isDataLoading) {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                        <ArrowLeftIcon className="w-4 h-4" />
                        返回仪表盘
                    </button>
                </div>
                
                <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-8">
                    <div className="flex flex-col items-center justify-center h-96">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mb-4"></div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">正在加载考勤日历</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-center">
                            {users.length === 0 ? '正在加载员工信息...' :
                             Object.keys(attendanceMap).length === 0 ? '正在加载考勤数据...' :
                             !companyEmployeeStats ? '正在计算考勤统计...' :
                             '正在准备日历数据...'}
                        </p>
                        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                            公司: {companyName} | 月份: {month}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    <ArrowLeftIcon className="w-4 h-4" />
                    返回仪表盘
                </button>
                <div className="flex gap-2">
                    {!isEditing && (
                        <>
                            <button onClick={onConfirm} className="px-3 py-1.5 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-500 transition-colors shadow-sm">
                                生成确认单
                            </button>
                        </>
                    )}
                </div>
            </div>

            <AttendanceToolbar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                showDetails={showDetails}
                onToggleDetails={() => setShowDetails(!showDetails)}
                departments={departments}
                selectedDepartments={[]}
                onSelectDepartments={() => {}}
                selectedEmployees={selectedEmployees}
                onSelectEmployees={setSelectedEmployees}
                allUsers={users}
                filterStatus={filterStatus}
                onFilterStatusChange={setFilterStatus}
                isEditing={isEditing}
                onToggleEdit={handleStartEdit}
                onUndo={onUndo}
                canUndo={canUndo}
                onCancelEdit={handleCancelEdit}
                onSave={handleSaveEdit}
                hasChanges={hasChanges}
                canEdit={canEdit}
            />

            {activeEditor && (
                <StatusEditor
                    position={activeEditor}
                    onClose={() => setActiveEditor(null)}
                    onSelect={handleStatusSelect}
                />
            )}

            {pendingChange && (
                <Modal isOpen={!!pendingChange} onClose={() => setPendingChange(null)} size="sm">
                    <EditConfirmationModalContent
                        user={users.find(u => u.userid === pendingChange.userId)}
                        date={`${month}-${String(pendingChange.day).padStart(2, '0')}`}
                        newStatus={pendingChange.newStatus}
                        currentData={attendanceMap[pendingChange.userId]?.[pendingChange.day]}
                        onConfirm={confirmModification}
                        onCancel={() => setPendingChange(null)}
                        companyName={companyName}
                    />
                </Modal>
            )}

            <CalendarEmployeeOverviewModal
                employee={overviewEmployee}
                onClose={() => setOverviewEmployee(null)}
                remarks={overviewEmployee?.remarks || []}
                month={month}
                onViewArchive={() => {
                    if (onViewDetails && overviewEmployee) {
                        onViewDetails(overviewEmployee.user);
                    }
                }}
                lateExemptionEnabled={lateExemptionEnabled}
                fullAttendanceEnabled={fullAttendanceEnabled}
                performancePenaltyEnabled={performancePenaltyEnabled}
            />

            <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[calc(100vh-252px)] overscroll-x-contain">
                <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-40 shadow-sm">
                        <tr>
                            <th className="sticky left-0 bg-slate-100 dark:bg-slate-800 p-4 font-semibold text-slate-900 dark:text-white border-b border-r border-slate-200 dark:border-slate-700 min-w-[200px] z-50">员工</th>
                            <th className="sticky left-[200px] bg-slate-100 dark:bg-slate-800 p-2 font-semibold text-slate-900 dark:text-white border-b border-r border-slate-200 dark:border-slate-700 min-w-[240px] text-center z-50 shadow-[4px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                月度绩效画像
                            </th>
                            {Array.from({ length: daysInMonth }, (_, i) => {
                                const day = i + 1;
                                const dayOfWeek = new Date(year, monthIndex, day).getDay();
                                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                return <th key={day} className={`p-2 font-semibold border-b border-r border-slate-200 dark:border-slate-700 w-28 min-w-[100px] text-center z-40 ${isWeekend ? 'bg-slate-200/60 dark:bg-slate-700/50' : 'bg-slate-100 dark:bg-slate-800'}`}>{day}</th>
                            })}
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800/50">
                        {filteredUsers.map(user => {
                            const stats = userStatsMap.get(user.userid) || {} as EmployeeStats;

                            const penalty = stats.performancePenalty || 0;
                            const isFullAttendance = stats.isFullAttendance;
                            const lateMinutes = stats.lateMinutes || 0;
                            const exemptedLateMinutes = stats.exemptedLateMinutes || 0;
                            const should = stats.shouldAttendanceDays || 0;
                            const actual = stats.actualAttendanceDays || 0;

                            const totalDays = should || 22;
                            const lateCount = stats.late || 0;
                            const missingCount = (stats.missing || 0) + ((stats as any).absenteeism || 0);

                            const leaveCount = (stats.sick || 0) + (stats.personal || 0) + (stats.annual || 0) + (stats.compTime || 0) + (stats.maternity || 0) + (stats.paternity || 0) + (stats.bereavement || 0) + (stats.marriage || 0) + (stats.parental || 0) + (stats.seriousSick || 0);

                            const normalCount = Math.max(0, actual - lateCount);

                            const pNormal = totalDays > 0 ? (normalCount / totalDays) * 100 : 0;
                            const pLate = totalDays > 0 ? (lateCount / totalDays) * 100 : 0;
                            const pLeave = totalDays > 0 ? (leaveCount / totalDays) * 100 : 0;
                            const pMissing = totalDays > 0 ? (missingCount / totalDays) * 100 : 0;

                            const scoreValue = isFullAttendance ? `+${(stats as any).fullAttendanceBonus || 0}` : (penalty > 0 ? `-${penalty}` : '0');
                            const scoreColor = isFullAttendance
                                ? 'text-emerald-500'
                                : (penalty > 0 ? 'text-rose-500' : 'text-slate-300 dark:text-slate-600');

                            return (
                                <tr key={user.userid} className={highlightedEmployee === user.userid ? 'bg-sky-100 dark:bg-sky-900/30' : ''}>
                                    <td className={`sticky z-20 left-0 p-2 border-b border-r border-slate-200 dark:border-slate-700 min-w-[200px] ${
                                        highlightedEmployee === user.userid 
                                            ? 'bg-sky-100 dark:bg-sky-900/30' 
                                            : 'bg-slate-100 dark:bg-slate-900'
                                    }`}>
                                        <div className="flex items-center gap-2">
                                            <Avatar name={user.name} avatarUrl={user.avatar} />
                                            <span className="font-medium text-slate-900 dark:text-white truncate">{user.name}</span>
                                            {highlightedEmployee === user.userid && (
                                                <span className="ml-2 px-2 py-1 text-xs bg-sky-600 text-white rounded-full">
                                                    校对目标
                                                </span>
                                            )}
                                        </div>
                                    </td>

                                    <td
                                        className="sticky z-30 left-[200px] bg-white dark:bg-slate-900 p-0 border-b border-r border-slate-200 dark:border-slate-700 min-w-[240px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-[4px_0_5px_-2px_rgba(0,0,0,0.05)] group align-top"
                                        onClick={() => handleOverviewClick(user)}
                                        title="点击查看详细概览"
                                    >
                                        <div className="h-28 p-3 flex flex-col justify-between box-border relative overflow-hidden">
                                            <div className="flex justify-between items-start">
                                                {performancePenaltyEnabled && (
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-slate-400 mb-0.5 transform scale-90 origin-left">绩效得分</span>
                                                        <div className={`text-xl font-black font-mono leading-none ${scoreColor}`}>
                                                            {scoreValue} <span className="text-xs font-normal text-slate-400">¥</span>
                                                        </div>
                                                    </div>
                                                )}
                                                {fullAttendanceEnabled && (
                                                    isFullAttendance ? (
                                                        <div className="px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                                            <CheckCircleIcon className="w-3 h-3" /> 全勤标兵
                                                        </div>
                                                    ) : (
                                                        <div className="px-2 py-1 bg-slate-100 text-slate-500 border border-slate-200 rounded-lg text-[10px] font-bold">
                                                            非全勤
                                                        </div>
                                                    )
                                                )}
                                            </div>

                                            <div className="flex flex-col justify-end gap-1 mt-2">
                                                <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
                                                    <span className="transform scale-90 origin-left">出勤构成</span>
                                                    <span className="font-mono">{actual}/{should} 天</span>
                                                </div>
                                                <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                                    {pNormal > 0 && <div style={{ width: `${pNormal}%` }} className="bg-emerald-400" title={`正常: ${normalCount}天`} />}
                                                    {pLate > 0 && <div style={{ width: `${pLate}%` }} className="bg-amber-400" title={`迟到: ${lateCount}天`} />}
                                                    {pLeave > 0 && <div style={{ width: `${pLeave}%` }} className="bg-indigo-400" title={`请假: ${leaveCount}天`} />}
                                                    {pMissing > 0 && <div style={{ width: `${pMissing}%` }} className="bg-rose-500" title={`缺卡/旷工: ${missingCount}次`} />}
                                                </div>
                                                <div className="flex gap-2 mt-0.5 h-3">
                                                    {lateCount > 0 && <span className="text-[9px] text-amber-600 flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" />迟 {lateCount}</span>}
                                                    {leaveCount > 0 && <span className="text-[9px] text-indigo-600 flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />假 {leaveCount}</span>}
                                                    {missingCount > 0 && <span className="text-[9px] text-rose-600 flex items-center gap-0.5"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" />缺 {missingCount}</span>}
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/50 mt-1">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] text-slate-400 transform scale-90 origin-left">累计迟到</span>
                                                    <span className={`text-xs font-bold ${lateMinutes > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-300'}`}>
                                                        {lateMinutes} <span className="font-normal text-[9px] text-slate-400">分</span>
                                                    </span>
                                                </div>
                                                {lateExemptionEnabled && (
                                                    <div className="flex flex-col text-right">
                                                        <span className="text-[9px] text-slate-400 transform scale-90 origin-right">豁免后</span>
                                                        <span className={`text-xs font-bold ${exemptedLateMinutes > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                                                            {exemptedLateMinutes} <span className="font-normal text-[9px] text-slate-400">分</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {Array.from({ length: daysInMonth }, (_, i) => {
                                        const day = i + 1;
                                        const dayDate = new Date(year, monthIndex, day);
                                        const dateKey = `${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                                        const holidayInfo = holidays?.[dateKey];
                                        let isWorkday = !isWeekend;
                                        if (holidayInfo) {
                                            if (holidayInfo.holiday === false) isWorkday = true;
                                            else if (holidayInfo.holiday === true) isWorkday = false;
                                        }

                                        const statusData = attendanceMap[user.userid]?.[day];
                                        const processRecord = statusData?.records.find(r => r.procInstId);
                                        const procId = processRecord?.procInstId;
                                        const isLoading = procId && loadingProcesses.has(procId);
                                        const processDetail = procId ? processDataMap[procId] : null;
                                        const leaveType = processDetail?.formValues?.leaveType || processDetail?.bizType;

                                        let lastFridayOffDutyTime: Date | null = null;
                                        let yesterdayApprove2030 = false;
                                        const yesterday = new Date(dayDate);
                                        yesterday.setDate(dayDate.getDate() - 1);
                                        const yesterdayAttendance = attendanceMap[user.userid]?.[yesterday.getDate()];
                                        if (yesterdayAttendance) {
                                            const approveOffDuty = yesterdayAttendance.records.find(r => r.checkType === 'OffDuty' && r.sourceType === 'APPROVE');
                                            if (approveOffDuty) {
                                                const offTime = new Date(approveOffDuty.userCheckTime);
                                                const limit2030 = new Date(offTime);
                                                limit2030.setHours(20, 30, 0, 0);
                                                if (offTime.getTime() >= limit2030.getTime()) yesterdayApprove2030 = true;
                                            }
                                        }

                                        const firstDayOnJob = new Date(user.create_time).getDate();
                                        const firstMonthOnJob = new Date(user.create_time).getMonth();
                                        const firstYearOnJob = new Date(user.create_time).getFullYear();
                                        const isFirstDayOnJob = year === firstYearOnJob && monthIndex === firstMonthOnJob && day === firstDayOnJob;

                                        const findLastOffDuty = (currentDate: Date): Date | null => {
                                            for (let d = currentDate.getDate() - 1; d >= 1; d--) {
                                                const attendance = attendanceMap[user.userid]?.[String(d)];
                                                if (attendance) {
                                                    const offRecord = attendance.records.find(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');
                                                    if (offRecord) return new Date(offRecord.userCheckTime);
                                                }
                                            }
                                            return null;
                                        }
                                        lastFridayOffDutyTime = findLastOffDuty(dayDate);

                                        const lateRecord = statusData?.records.find(r => r.timeResult === 'Late');
                                        const lateMinutes = lateRecord ? getLateMinutes(lateRecord, processDetail, lastFridayOffDutyTime, yesterdayApprove2030, isFirstDayOnJob, holidays) : 0;

                                        let isMissing = statusData?.status === 'incomplete' || statusData?.records.some(r => r.timeResult === 'NotSigned');

                                        const dailyLeaveHours = statusData ? calculateDailyLeaveDuration(statusData.records, processDataMap, year, dateKey, user.mainCompany) : 0;
                                        const isFullDayLeaveCombined = dailyLeaveHours >= (user.mainCompany?.includes('成都') ? 8.5 : 8);

                                        if (isFullDayLeaveCombined) {
                                            isMissing = false;
                                        } else if (processDetail && isFullDayLeave(processDetail, user.mainCompany)) {
                                            isMissing = false;
                                        }

                                        if (isMissing && statusData) {
                                            const missingOn = statusData.records.some(r => r.checkType === 'OnDuty' && r.timeResult === 'NotSigned' && new Date(r.baseCheckTime).getHours() <= 10);
                                            const missingOff = statusData.records.some(r => r.checkType === 'OffDuty' && r.timeResult === 'NotSigned');

                                            const workStart = new Date(dayDate); workStart.setHours(9, 0, 0, 0);
                                            const workEnd = new Date(dayDate); workEnd.setHours(18, 30, 0, 0);

                                            let onCovered = !missingOn;
                                            let offCovered = !missingOff;

                                            if (missingOn) {
                                                onCovered = checkTimeInLeaveRange(processDataMap, statusData.records, workStart).isCovered;
                                            }
                                            if (missingOff) {
                                                offCovered = checkTimeInLeaveRange(processDataMap, statusData.records, workEnd).isCovered;
                                            }

                                            if (onCovered && offCovered) {
                                                isMissing = false;
                                            }
                                        }

                                        const today = new Date();
                                        const isToday = (monthIndex === today.getMonth() && year === today.getFullYear()) && day === today.getDate();
                                        if (isToday) isMissing = false;

                                        const isOvertime = !isWorkday && statusData && statusData.records.length > 0 && !leaveType;

                                        const isNormal = !isMissing && !lateMinutes && !isOvertime && statusData;

                                        const badges = [];
                                        if (leaveType) {
                                            badges.push({ text: leaveType, className: LEAVE_TYPE_STYLES[leaveType] || LEAVE_TYPE_STYLES.default });
                                        } else if (isFullDayLeaveCombined) {
                                            const firstLeaveRec = statusData?.records.find(r => r.procInstId && processDataMap[r.procInstId]);
                                            if (firstLeaveRec) {
                                                const p = processDataMap[firstLeaveRec.procInstId];
                                                const type = p?.formValues?.leaveType || p?.bizType;
                                                if (type) badges.push({ text: type, className: LEAVE_TYPE_STYLES[type] || LEAVE_TYPE_STYLES.default });
                                            }
                                        } else if (!isMissing && !isNormal && !lateMinutes && !isOvertime && statusData) {
                                            const leaveRec = statusData.records.find(r => r.procInstId && processDataMap[r.procInstId]);
                                            if (leaveRec) {
                                                const p = processDataMap[leaveRec.procInstId];
                                                const type = p?.formValues?.leaveType || p?.bizType;
                                                if (type) badges.push({ text: type, className: LEAVE_TYPE_STYLES[type] || LEAVE_TYPE_STYLES.default });
                                            }
                                        }

                                        if (lateMinutes > 0) badges.push({ text: `迟到${lateMinutes}分`, className: LEAVE_TYPE_STYLES['迟到'] });

                                        const todayDay = (monthIndex === today.getMonth() && year === today.getFullYear()) ? today.getDate() : -1;

                                        if (isMissing) {
                                            const hasOnDuty = statusData?.records.some(r => r.checkType === 'OnDuty' && r.timeResult !== 'NotSigned');
                                            const hasOffDuty = statusData?.records.some(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');

                                            const workStart = new Date(dayDate); workStart.setHours(9, 0, 0, 0);
                                            const workEnd = new Date(dayDate); workEnd.setHours(18, 30, 0, 0);
                                            const onCovered = checkTimeInLeaveRange(processDataMap, statusData?.records || [], workStart).isCovered;
                                            const offCovered = checkTimeInLeaveRange(processDataMap, statusData?.records || [], workEnd).isCovered;

                                            if (!hasOnDuty && !onCovered) badges.push({ text: '缺卡-上班卡', className: LEAVE_TYPE_STYLES['缺卡'] });
                                            if (!hasOffDuty && !offCovered && day !== todayDay) badges.push({ text: '缺卡-下班卡', className: LEAVE_TYPE_STYLES['缺卡'] });
                                        }
                                        if (isOvertime) badges.push({ text: '加班', className: LEAVE_TYPE_STYLES['加班'] });
                                        if ((isNormal || (isFullDayLeaveCombined && !leaveType)) && !showDetails && badges.length === 0) {
                                            badges.push({ text: '√', className: 'text-green-600 font-bold text-lg border-none bg-transparent' });
                                        }

                                        let bgClass = statusData ? cellClasses[statusData.status] : cellClasses['noRecord'];
                                        if (isNormal || isFullDayLeaveCombined) {
                                            bgClass = 'bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50';
                                        }

                                        const showAbnormalIcon = statusData?.hasAbnormality && !isNormal && !isFullDayLeaveCombined;
                                        const showApproveIcon = statusData?.hasOffDutyApprove || statusData?.hasOnDutyApprove;
                                        const showIcon = showAbnormalIcon || showApproveIcon;

                                        if (lateMinutes > 0) {
                                            bgClass = 'bg-yellow-50 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/50';
                                        }

                                        if (isMissing) {
                                            bgClass = 'bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50';
                                        }

                                        return (
                                            <td key={day} className={`border-b border-r border-slate-200 dark:border-slate-700 p-0 text-center ${isWeekend && !statusData ? 'bg-slate-50/50 dark:bg-slate-700/20' : ''}`}>
                                                <button
                                                    onClick={(e) => handleCellClick(e, user, day, statusData)}
                                                    className={`relative w-full h-24 p-1 text-xs flex flex-col ${bgClass} ${isEditing ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-sky-500' : ''}`}
                                                >
                                                    <div className={`w-full flex flex-col gap-0.5 items-center ${showDetails ? 'pt-1' : 'h-full justify-center'}`}>
                                                        {isLoading && <div className="w-[90%] px-1 py-0.5 rounded text-[10px] font-bold truncate shadow-sm border bg-white border-slate-200 flex justify-center"><Loader2Icon className="w-3 h-3 animate-spin text-sky-500" /></div>}
                                                        {badges.map((badge, idx) => <div key={idx} className={`w-[90%] px-1 py-0.5 rounded text-[10px] font-bold truncate shadow-sm border ${badge.className}`}>{badge.text}</div>)}
                                                    </div>
                                                    {showIcon && (
                                                        <span
                                                            className="absolute top-1 right-1 cursor-help"
                                                            title={showAbnormalIcon ? "考勤异常 (迟到/早退/缺卡)" : "有补卡/审批记录"}
                                                        >
                                                            <AlertTriangleIcon className={`w-3.5 h-3.5 ${showAbnormalIcon ? 'text-yellow-500' : 'text-blue-500'}`} />
                                                        </span>
                                                    )}
                                                    {showDetails && (
                                                        <div className="flex-grow w-full flex flex-col justify-center items-center gap-0.5 z-0">
                                                            <span className="font-mono text-slate-800 dark:text-slate-200">{statusData?.onDutyTime || ' - '}</span>
                                                            <span className="font-mono text-slate-500 dark:text-slate-400">{statusData?.offDutyTime || ' - '}</span>
                                                        </div>
                                                    )}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                {filteredUsers.length === 0 && <div className="text-center py-20 text-slate-500 dark:text-slate-400">没有找到匹配的员工。</div>}
            </div>
        </div>
    );
};
