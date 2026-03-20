
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import type { DingTalkUser, CompanyCounts, DailyAttendanceStatus, HolidayMap, AttendanceMap, EmployeeAttendanceRecord, EmployeeStats, User } from '../../../database/schema.ts';
import { Loader2Icon, RefreshCwIcon, DownloadIcon, UsersIcon, CalendarIcon, SendIcon, XIcon, CheckCircleIcon, AlertTriangleIcon, SlidersHorizontalIcon, HistoryIcon, BarChartIcon } from '../../Icons.tsx';
import { useAttendanceStats } from './useAttendanceStats.ts';
import { useAttendanceRuleSync } from '../../../hooks/useAttendanceRuleSync.ts';
import { AttendanceRuleManager } from '../AttendanceRuleEngine.ts';
import useAttendanceRuleConfig, { initRuleConfigCache, refreshRuleConfigCache } from '../../../hooks/useAttendanceRuleConfig.ts';
import { CompanyDashboardView } from './AttendanceDashboard.tsx';
import { AttendanceCalendarView } from './AttendanceCalendar.tsx';
import { EmployeeTableView } from './AttendanceEmployeeList.tsx';
import { EmployeeDetailModal, PunchDetailModal, EmployeeAttendanceAnalysisModal } from './AttendanceModals.tsx';
import { AttendanceEditLogs } from './AttendanceEditLogs.tsx';
import { fetchCompanyData, fetchProcessDetail, SmartCache, HolidayCache, DashboardCache, getLateMinutes, calculateDailyLeaveDuration, checkTimeInLeaveRange, DEFAULT_CONFIGS } from '../utils.ts';
import { sendDingTalkMessage, validateDingTalkWebhook, type AtUser } from '../../../services/pushApiService.ts';
import type { AttendanceDashboardState } from '../../../App.tsx';
import { db } from '../../../database/mockDb.ts';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { saveReportSnapshot, getLatestSnapshot, getSnapshots, getSnapshotById, getEditLogs } from '../../../services/reportSnapshotApiService.ts';

interface AttendanceDashboardPageProps {
  onNavigateToConfirmation: (data: EmployeeAttendanceRecord[], month: string, mainCompany: string, source?: 'dashboard' | 'calendar', holidays?: Record<string, { holiday: boolean; name?: string }>) => void;
  initialState: AttendanceDashboardState;
  onStateChange: (state: AttendanceDashboardState) => void;
  currentCompany: string; // New Prop
  onLoadingChange?: (loading: boolean) => void;
  userPermissions?: string[]; // New Prop
  currentUserInfo?: User; // New Prop for logging
  globalMonth: string; // 🔥 使用全局月份，不再使用initialState.month
  onGlobalMonthChange: (month: string) => void; // 🔥 全局月份变更回调
}

export const AttendanceDashboardPage: React.FC<AttendanceDashboardPageProps> = ({ onNavigateToConfirmation, initialState, onStateChange, currentCompany, onLoadingChange, userPermissions = [], currentUserInfo, globalMonth, onGlobalMonthChange }) => {
  const [view, setView] = useState<{ type: 'dashboard' | 'employeeList' | 'calendar' | 'allEmployees'; companyName?: string }>(initialState.view);
  // 🔥 移除本地的globalMonth状态，直接使用全局月份
  // const [globalMonth, setSelectedMonth] = useState(initialState.month);

  const [allUsers, setAllUsers] = useState<DingTalkUser[]>([]);
  const [companyCounts, setCompanyCounts] = useState<CompanyCounts>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // For manual/silent refresh
  const [error, setError] = useState<string | null>(null);
  
  // 🔥 规则配置加载状态
  const [ruleConfigLoaded, setRuleConfigLoaded] = useState(false);

  const [detailUserStack, setDetailUserStack] = useState<DingTalkUser[]>([]);
  const [holidays, setHolidays] = useState<HolidayMap>({});
  const [processDataMap, setProcessDataMap] = useState<Record<string, any>>({});
  const [punchDetail, setPunchDetail] = useState<{ user: DingTalkUser; day: number; status: DailyAttendanceStatus } | null>(null);
  const [analysisEmployee, setAnalysisEmployee] = useState<{ user: DingTalkUser; stats: EmployeeStats } | null>(null);

  // 推送功能状态
  const DEFAULT_WEBHOOK = 'https://oapi.dingtalk.com/robot/send?access_token=0601fe473c98d2900349a9f93bd86c799b4446d0456acb15ce0b2ea61f9d818d';
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushWebhook, setPushWebhook] = useState(() => {
    return localStorage.getItem('attendance_push_webhook') || DEFAULT_WEBHOOK;
  });
  const [isWebhookEditable, setIsWebhookEditable] = useState(false);

  // 🔥 操作日志状态
  const [showSnapshotLogsModal, setShowSnapshotLogsModal] = useState(false);
  const [snapshotLogs, setSnapshotLogs] = useState<any[]>([]);
  const [isLoadingSnapshotLogs, setIsLoadingSnapshotLogs] = useState(false);
  const [snapshotDetail, setSnapshotDetail] = useState<any>(null);
  const [isLoadingSnapshotDetail, setIsLoadingSnapshotDetail] = useState(false);
  const [snapshotDetailEditLogs, setSnapshotDetailEditLogs] = useState<any[]>([]);
  const [showWebhookConfirmModal, setShowWebhookConfirmModal] = useState(false);
  const [pushContent, setPushContent] = useState('');
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);
  const [webhookError, setWebhookError] = useState<string>('');
  
  // 艾特人选择器状态
  const [selectedAtUsers, setSelectedAtUsers] = useState<{ name: string; mobile: string; avatar?: string; userid?: string; company?: string }[]>(() => {
    const saved = localStorage.getItem('attendance_push_at_users');
    return saved ? JSON.parse(saved) : [];
  });
  const [atUserInput, setAtUserInput] = useState('');
  const [showAtUserDropdown, setShowAtUserDropdown] = useState(false);

  // 自定义下载功能状态
  const [showCustomDownloadModal, setShowCustomDownloadModal] = useState(false);
  const [customDownloadCompany, setCustomDownloadCompany] = useState<string>('');
  
  // CSV预览功能状态
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewTabs, setPreviewTabs] = useState<Array<{ name: string; headers: string[]; rows: string[][] }>>([]);
  const [activePreviewTab, setActivePreviewTab] = useState(0);
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [previewDownloadCallback, setPreviewDownloadCallback] = useState<(() => void) | null>(null);
  
  // 🔥 编辑功能状态
  const [editedData, setEditedData] = useState<Map<string, string>>(new Map());
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());
  
  // 🔥 使用 ref 存储最新的编辑数据和当前tab，避免闭包问题
  const editedDataRef = useRef<Map<string, string>>(new Map());
  const editedCellsRef = useRef<Set<string>>(new Set());
  const activePreviewTabRef = useRef<number>(0);
  const previewTabsRef = useRef<Array<{ name: string; headers: string[]; rows: string[][] }>>([]);
  
  // 🔥 同步 state 到 ref
  useEffect(() => {
    editedDataRef.current = editedData;
    editedCellsRef.current = editedCells;
  }, [editedData, editedCells]);
  
  useEffect(() => {
    activePreviewTabRef.current = activePreviewTab;
  }, [activePreviewTab]);
  
  useEffect(() => {
    previewTabsRef.current = previewTabs;
  }, [previewTabs]);
  
  // 🔥 弹窗打开时加载当前 tab 的最新快照信息
  useEffect(() => {
    if (showPreviewModal && previewTabs.length > 0) {
      loadCurrentTabSnapshotInfo(activePreviewTab);
    }
    if (!showPreviewModal) {
      setCurrentSnapshotInfo(null);
    }
  }, [showPreviewModal, previewTabs.length]);
  
  // 编辑日志弹窗状态
  const [showEditLogsModal, setShowEditLogsModal] = useState(false);
  
  // 进阶数据分析面板状态（提升到页面级，供 header 按钮控制）
  const [analyticsPanelOpen, setAnalyticsPanelOpen] = useState(false);
  
  // 🔥 报表保存状态
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const [snapshotRemarks, setSnapshotRemarks] = useState('');
  
  // 🔥 快照历史查看状态
  const [showSnapshotHistory, setShowSnapshotHistory] = useState(false);
  const [snapshotHistoryList, setSnapshotHistoryList] = useState<any[]>([]);
  const [snapshotHistoryLoading, setSnapshotHistoryLoading] = useState(false);
  const [selectedSnapshotLogs, setSelectedSnapshotLogs] = useState<any[] | null>(null);
  const [selectedSnapshotDetail, setSelectedSnapshotDetail] = useState<any | null>(null);
  
  // 🔥 当前 tab 最新快照版本信息
  const [currentSnapshotInfo, setCurrentSnapshotInfo] = useState<{ version: number; savedAt: string; savedByName: string } | null>(null);
  
  // 字段搜索状态
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  
  // 日期列模式：'none' | 'attendance' | 'late'
  const [dateColumnMode, setDateColumnMode] = useState<'none' | 'attendance' | 'late'>(() => {
    const saved = localStorage.getItem('attendance_date_column_mode');
    return (saved as 'none' | 'attendance' | 'late') || 'none';
  });
  
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    const saved = localStorage.getItem('attendance_custom_columns');
    return saved ? JSON.parse(saved) : ['name', 'actualAttendanceDays', 'isFullAttendance', 'exemptedLateMinutes', 'lateMinutes', 'performancePenalty'];
  });

  // 可选的列字段配置
  const availableColumns = [
    // 基本信息
    { key: 'name', label: '姓名', required: true, group: '基本信息' },
    { key: 'department', label: '部门', group: '基本信息' },
    { key: 'jobNumber', label: '工号', group: '基本信息' },
    { key: 'title', label: '职位', group: '基本信息' },
    { key: 'mainCompany', label: '所属公司', group: '基本信息' },
    { key: 'mobile', label: '手机号', group: '基本信息' },
    { key: 'hiredDate', label: '入职日期', group: '基本信息' },
    { key: 'userid', label: '用户ID', group: '基本信息' },
    { key: 'active', label: '在职状态', group: '基本信息' },
    
    // 出勤统计
    { key: 'shouldAttendanceDays', label: '应出勤天数', group: '出勤统计' },
    { key: 'actualAttendanceDays', label: '实际出勤天数', group: '出勤统计' },
    { key: 'isFullAttendance', label: '是否全勤', group: '出勤统计' },
    { key: 'attendanceDates', label: '考勤日期', group: '出勤统计' },
    
    // 迟到相关
    { key: 'late', label: '迟到次数', group: '迟到相关' },
    { key: 'lateMinutes', label: '迟到总分钟数', group: '迟到相关' },
    { key: 'exemptedLate', label: '豁免后迟到次数', group: '迟到相关' },
    { key: 'exemptedLateMinutes', label: '豁免后迟到分钟数', group: '迟到相关' },
    { key: 'performancePenalty', label: '绩效扣款金额', group: '迟到相关' },
    { key: 'lateDates', label: '迟到日期', group: '迟到相关' },
    
    // 缺卡相关
    { key: 'missing', label: '缺卡次数', group: '缺卡相关' },
    { key: 'absenteeism', label: '旷工次数', group: '缺卡相关' },
    
    // 请假统计
    { key: 'annualHours', label: '年假(小时)', group: '请假统计' },
    { key: 'personalHours', label: '事假(小时)', group: '请假统计' },
    { key: 'sickHours', label: '病假(小时)', group: '请假统计' },
    { key: 'seriousSickHours', label: '重病假(小时)', group: '请假统计' },
    { key: 'compTimeHours', label: '调休(小时)', group: '请假统计' },
    { key: 'tripHours', label: '出差(小时)', group: '请假统计' },
    { key: 'maternityHours', label: '产假(小时)', group: '请假统计' },
    { key: 'paternityHours', label: '陪产假(小时)', group: '请假统计' },
    { key: 'marriageHours', label: '婚假(小时)', group: '请假统计' },
    { key: 'bereavementHours', label: '丧假(小时)', group: '请假统计' },
    { key: 'parentalHours', label: '育儿假(小时)', group: '请假统计' },
    { key: 'totalLeaveHours', label: '请假总时长(小时)', group: '请假统计' },
    
    // 加班统计
    { key: 'overtime19_5Minutes', label: '加班到19:30(分钟)', group: '加班统计' },
    { key: 'overtime20_5Minutes', label: '加班到20:30(分钟)', group: '加班统计' },
    { key: 'overtime22Minutes', label: '加班到22:00(分钟)', group: '加班统计' },
    { key: 'overtime24Minutes', label: '加班到24:00(分钟)', group: '加班统计' },
    { key: 'overtimeTotalMinutes', label: '加班总时长(分钟)', group: '加班统计' },
    { key: 'overtime19_5Count', label: '加班19:30次数', group: '加班统计' },
    { key: 'overtime20_5Count', label: '加班20:30次数', group: '加班统计' },
    { key: 'overtime22Count', label: '加班22:00次数', group: '加班统计' },
    { key: 'overtime24Count', label: '加班24:00次数', group: '加班统计' },
    
    // 其他
    { key: 'remarks', label: '备注', group: '其他' },
  ];

  // 处理 webhook 输入变化
  const handleWebhookChange = (value: string) => {
    setPushWebhook(value);
    const validation = validateDingTalkWebhook(value);
    setWebhookError(validation.valid ? '' : validation.message);
  };

  // Attendance Map & History
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>({});
  const [history, setHistory] = useState<AttendanceMap[]>([]);

  const canExport = userPermissions.includes('attendance_dashboard:export');
  const canEditCalendar = userPermissions.includes('attendance_dashboard:calendar_edit');
  const canViewAiAnalysis = userPermissions.includes('attendance_dashboard:ai_analysis');

  // 🔥 获取豁免功能开关状态
  const [lateExemptionEnabled, setLateExemptionEnabled] = useState(() => {
    const companyKey = currentCompany === 'eyewind' ? 'eyewind' : 'hydodo';
    return !!AttendanceRuleManager.getEngine(companyKey).getRules().lateExemptionEnabled;
  });

  // 🔥 获取全勤功能开关状态
  const [fullAttendanceEnabled, setFullAttendanceEnabled] = useState(() => {
    const companyKey = currentCompany === 'eyewind' ? 'eyewind' : 'hydodo';
    return AttendanceRuleManager.getEngine(companyKey).getRules().fullAttendanceEnabled ?? true;
  });

  // 🔥 获取绩效考核功能开关状态
  const [performancePenaltyEnabled, setPerformancePenaltyEnabled] = useState(() => {
    const companyKey = currentCompany === 'eyewind' ? 'eyewind' : 'hydodo';
    return AttendanceRuleManager.getEngine(companyKey).getRules().performancePenaltyEnabled ?? true;
  });

  // 🔥 使用考勤规则同步Hook
  const { reloadRules } = useAttendanceRuleSync((companyKey) => {
    // 无论哪个公司的规则更新，都重新获取当前公司的豁免开关状态
    const normalizedCurrentCompany = currentCompany === 'eyewind' ? 'eyewind' : 'hydodo';
    const newLateExemptionEnabled = !!AttendanceRuleManager.getEngine(normalizedCurrentCompany).getRules().lateExemptionEnabled;
    setLateExemptionEnabled(newLateExemptionEnabled);
    const newFullAttendanceEnabled = AttendanceRuleManager.getEngine(normalizedCurrentCompany).getRules().fullAttendanceEnabled ?? true;
    setFullAttendanceEnabled(newFullAttendanceEnabled);
    const newPerformancePenaltyEnabled = AttendanceRuleManager.getEngine(normalizedCurrentCompany).getRules().performancePenaltyEnabled ?? true;
    setPerformancePenaltyEnabled(newPerformancePenaltyEnabled);
  });

  // 🔥 当 currentCompany 变化时，重新获取豁免开关状态
  useEffect(() => {
    const companyKey = currentCompany === 'eyewind' ? 'eyewind' : 'hydodo';
    const newLateExemptionEnabled = !!AttendanceRuleManager.getEngine(companyKey).getRules().lateExemptionEnabled;
    // console.log('AttendanceRuleManager AttendanceRuleManager AttendanceRuleManager', AttendanceRuleManager.getEngine(companyKey).getRules().lateExemptionEnabled, newLateExemptionEnabled, companyKey)
    setLateExemptionEnabled(newLateExemptionEnabled);
    const newFullAttendanceEnabled = AttendanceRuleManager.getEngine(companyKey).getRules().fullAttendanceEnabled ?? true;
    setFullAttendanceEnabled(newFullAttendanceEnabled);
    const newPerformancePenaltyEnabled = AttendanceRuleManager.getEngine(companyKey).getRules().performancePenaltyEnabled ?? true;
    setPerformancePenaltyEnabled(newPerformancePenaltyEnabled);
  }, [currentCompany]);

  // Effect to notify parent about loading state
  useEffect(() => {
      const loading = isLoading || isRefreshing;
      onLoadingChange?.(loading);
  }, [isLoading, isRefreshing, onLoadingChange]);

  const setAttendanceMapWithHistory: React.Dispatch<React.SetStateAction<AttendanceMap>> = useCallback((value) => {
    const newState = typeof value === 'function' ? (value as (prev: AttendanceMap) => AttendanceMap)(attendanceMap) : value;
    if (newState !== attendanceMap) {
      setHistory(h => [...h, attendanceMap]);
      setAttendanceMap(newState);
    }
  }, [attendanceMap]);

  useEffect(() => {
    // 清除targetEmployee，避免重复触发自动定位
    const newState: AttendanceDashboardState = { view, month: globalMonth };
    if (initialState.targetEmployee) {
      // 如果当前状态有targetEmployee，在状态更新时清除它
      newState.targetEmployee = undefined;
    }
    onStateChange(newState);
  }, [view, globalMonth, onStateChange]);

  const handleSetView = (newView: typeof view) => {
    setView(newView);
  };

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const newHistory = [...history];
    const prevState = newHistory.pop();
    if (prevState) {
      setAttendanceMap(prevState);
      setHistory(newHistory);
    }
  }, [history]);

  // 🔥 添加防抖机制防止重复调用
  const [loadingDebounce, setLoadingDebounce] = useState(false);
  
  // 🔥 使用ref避免循环依赖
  const loadAllDataRef = useRef<(() => Promise<void>) | null>(null);
  
  // 🔥 统一的数据加载函数，智能使用多层缓存
  // 三层缓存策略：
  // 1. 完整仪表盘缓存 (DashboardCache) - 包含员工、公司统计、审批详情的完整数据
  // 2. 员工打卡数据缓存 (SmartCache) - 只包含员工和打卡数据，用于跨页面共享
  // 3. API调用 - 最后的数据源
  // 
  // 缓存协调逻辑：
  // - 如果有完整仪表盘缓存，直接使用，无需任何API调用
  // - 如果有员工打卡数据缓存，复用该数据，只获取审批详情
  // - 如果都没有，从API获取所有数据
  const loadAllData = useCallback(async (forceRefresh = false, isSilent = false) => {
    // console.log(`[AttendanceDashboardPage] 🚀 开始加载数据: 公司=${currentCompany}, 月份=${globalMonth}, 强制刷新=${forceRefresh}`);
    
    setLoadingDebounce(true);
    
    // 🔥 第一层：检查仪表盘完整缓存
    let cachedDashboardData = null;
    if (!forceRefresh) {
      cachedDashboardData = await DashboardCache.getDashboardData(currentCompany, globalMonth);
      if (cachedDashboardData) {
        // console.log(`[AttendanceDashboardPage] ✅ 使用完整仪表盘缓存: ${currentCompany} - ${globalMonth}`);
        setAllUsers(cachedDashboardData.employees);
        setCompanyCounts(cachedDashboardData.companyCounts);
        setProcessDataMap(cachedDashboardData.processDataMap);
        setIsLoading(false);
        setIsRefreshing(false);
        setTimeout(() => setLoadingDebounce(false), 500);
        return;
      }
    }

    if (!isSilent) setIsLoading(true);
    if (forceRefresh) setIsRefreshing(true);
    setError(null);

    // 🔥 如果强制刷新，清除相关缓存
    if (forceRefresh) {
      await DashboardCache.clearDashboardData(currentCompany, globalMonth);
    }

    try {
      // 🔥 第二层：检查员工和打卡数据缓存
      // 🔥 修复跨月/跨周规则：需要获取上个月最后几天的数据
      // 原因：
      // 1. 跨月规则需要上月最后一个工作日的下班打卡时间
      // 2. 跨周规则需要上周末（周五/周六/周日）的下班打卡时间
      // 3. 如果本月第一天是周一，上周末可能在上个月
      const [y, m] = globalMonth.split('-').map(Number);
      
      // 获取本月第一天是星期几
      const firstDayOfMonth = new Date(y, m - 1, 1);
      const firstDayOfWeek = firstDayOfMonth.getDay(); // 0=周日, 1=周一, ..., 6=周六
      
      // 🔥 修复：计算需要回溯多少天，确保能获取到上月最后一个工作日的数据
      // 最坏情况：上月最后3天都是周末+节假日，需要回溯到上月28号左右
      let daysToGoBack = 5; // 默认回溯5天，确保能覆盖大部分情况
      
      if (firstDayOfWeek === 1) {
        // 如果本月第一天是周一，需要获取上周五/六/日（回溯至少3天）
        // 但上周五可能也不是工作日，所以回溯7天更保险
        daysToGoBack = 7;
      } else if (firstDayOfWeek === 0) {
        // 如果本月第一天是周日，需要获取上周五/六（回溯至少2天）
        daysToGoBack = 7;
      }
      
      // 计算起始日期
      const startDate = new Date(y, m - 1, 1 - daysToGoBack);
      const fromDate = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      
      // 🔥 修复：toDate设置为下个月第一天，避免时区问题导致上个月数据被错误归类
      const nextMonth = new Date(y, m, 1); // 下个月第一天
      const toDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
      
      // 🔥 调试：记录数据加载范围
      // console.log(`[AttendanceDashboardPage] 数据加载范围: ${fromDate} 至 ${toDate}, 回溯${daysToGoBack}天`);
      // console.log(`[AttendanceDashboardPage] 本月第一天: ${globalMonth}-01, 星期${firstDayOfWeek === 0 ? '日' : firstDayOfWeek}`);

      
      const employeePunchCacheKey = `ATTENDANCE_DATA_${currentCompany}_${fromDate}_${toDate}`;
      let employeePunchData = null;
      
      if (!forceRefresh) {
        employeePunchData = await SmartCache.get<{ employees: DingTalkUser[]; companyCounts: CompanyCounts }>(employeePunchCacheKey);
        if (employeePunchData) {
          // console.log(`[AttendanceDashboardPage] 🎯 发现员工打卡数据缓存: ${employeePunchCacheKey}`);
        } else {
          // console.log(`[AttendanceDashboardPage] ❌ 未发现员工打卡数据缓存: ${employeePunchCacheKey}`);
        }
      }

      let uniqueUsers: DingTalkUser[];
      let companyCounts: CompanyCounts;

      if (employeePunchData) {
        // 🔥 使用员工和打卡数据缓存
        // console.log(`[AttendanceDashboardPage] ✅ 使用员工打卡数据缓存，只需获取审批详情`);
        // console.log(`[AttendanceDashboardPage] 📊 缓存数据统计: ${employeePunchData.employees.length} 个员工, ${Object.keys(employeePunchData.companyCounts).length} 个公司`);
        uniqueUsers = Array.from(new Map((employeePunchData.employees as DingTalkUser[]).map((u: DingTalkUser) => [u.userid, u])).values());
        companyCounts = employeePunchData.companyCounts;
      } else {
        // 🔥 从API获取员工和打卡数据
        // console.log(`[AttendanceDashboardPage] 📡 从API获取员工和打卡数据: ${currentCompany}, ${globalMonth}`);
        // console.log(`[AttendanceDashboardPage] 🔄 缓存未命中，需要重新请求员工和打卡接口`);
        const data = await fetchCompanyData(currentCompany, fromDate, toDate, y, m);
        uniqueUsers = Array.from(new Map(data.employees.map((u: DingTalkUser) => [u.userid, u])).values());
        companyCounts = data.companyCounts;
        // console.log(`[AttendanceDashboardPage] 📊 API数据统计: ${uniqueUsers.length} 个员工, ${Object.keys(companyCounts).length} 个公司`);
      }

      // 🔥 第三层：获取审批详情数据（这部分总是需要检查的）
      // console.log(`[AttendanceDashboardPage] 📋 检查审批详情数据...`);
      const neededIds = new Set<string>();
      uniqueUsers.forEach(user => { 
        user.punchData?.forEach(record => { 
          if (record.procInstId) neededIds.add(record.procInstId); 
        }); 
      });

      const idsToFetch = Array.from(neededIds);
      const newProcessData: Record<string, any> = {};
      
      if (idsToFetch.length > 0) {
        // console.log(`[AttendanceDashboardPage] 📋 获取 ${idsToFetch.length} 个审批详情...`);
        const BATCH_SIZE = 20;
        for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
          const chunk = idsToFetch.slice(i, i + BATCH_SIZE);
          await Promise.all(chunk.map(async (id) => {
            const pData = await fetchProcessDetail(id, currentCompany);
            if (pData) newProcessData[id] = pData;
          }));
        }
        // console.log(`[AttendanceDashboardPage] ✅ 审批详情获取完成: ${Object.keys(newProcessData).length} 个`);
      } else {
        // console.log(`[AttendanceDashboardPage] ℹ️ 无需获取审批详情`);
      }

      // 设置状态
      setAllUsers(uniqueUsers);
      setCompanyCounts(companyCounts);
      setProcessDataMap(newProcessData);

      // 🔥 调试：记录加载的数据统计
      // console.log(`[AttendanceDashboardPage] 数据加载完成统计:`, {
      //   员工总数: uniqueUsers.length,
      //   审批详情数: Object.keys(newProcessData).length,
      //   查询月份: globalMonth,
      //   数据范围: `${fromDate} 至 ${toDate}`
      // });
      
      // 🔥 调试：检查冯永森和徐怡的打卡数据范围
      // const debugUsers = ['冯永森', '徐怡'];
      // debugUsers.forEach(userName => {
      //   const user = uniqueUsers.find(u => u.name === userName);
      //   if (user && user.punchData) {
      //     const dates = user.punchData.map(r => r.workDate).sort();
      //     console.log(`[AttendanceDashboardPage] ${userName} 打卡数据:`, {
      //       总记录数: user.punchData.length,
      //       最早日期: dates[0],
      //       最晚日期: dates[dates.length - 1],
      //       上月记录数: user.punchData.filter(r => {
      //         const d = new Date(r.workDate);
      //         return d.getMonth() === (m - 2 + 12) % 12;
      //       }).length
      //     });
      //   }
      // });

      // 🔥 缓存完整的仪表盘数据到IndexedDB
      const dashboardData = {
        employees: uniqueUsers,
        companyCounts: companyCounts,
        processDataMap: newProcessData,
        attendanceMap: {} as AttendanceMap // 这个会通过 useAttendanceStats 计算
      };
      
      await DashboardCache.setDashboardData(currentCompany, globalMonth, dashboardData);
      // console.log(`[AttendanceDashboardPage] 💾 仪表盘数据已缓存`);
      
      // 🔥 如果使用了缓存的员工打卡数据，说明缓存协调工作正常
      if (employeePunchData) {
        // console.log(`[AttendanceDashboardPage] ✅ 缓存协调成功：复用员工打卡数据，仅获取审批详情`);
      }
      
      // console.log(`[AttendanceDashboardPage] ✅ 数据加载完成: ${uniqueUsers.length} 个用户, ${Object.keys(newProcessData).length} 个审批详情`);
    } catch (err) {
      console.error('[AttendanceDashboardPage] 数据加载失败:', err);
      if (!isSilent) setError(err instanceof Error ? err.message : "加载数据失败，请稍后重试。");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      // 🔥 延迟重置防抖状态，防止快速重复调用
      setTimeout(() => setLoadingDebounce(false), 1000);
    }
  }, [globalMonth, currentCompany, isLoading, loadingDebounce, ruleConfigLoaded]); 

  // 🔥 更新ref引用
  useEffect(() => {
    loadAllDataRef.current = loadAllData;
  }, [loadAllData]);

  // 🔥 监听公司和月份变化，清理相关缓存（只在真正变化时清理）
  const [lastCompanyMonth, setLastCompanyMonth] = useState<string>(`${currentCompany}_${globalMonth}`);
  
  useEffect(() => {
    const currentKey = `${currentCompany}_${globalMonth}`;
    
    // 🔥 只有在公司或月份真正发生变化时才清理缓存（跳过初始化）
    if (lastCompanyMonth !== currentKey && lastCompanyMonth !== `${currentCompany}_${globalMonth}`) {
      const clearRelatedCaches = async () => {
        // console.log(`[AttendanceDashboardPage] 🔥 公司或月份变化检测到，清理相关缓存: ${lastCompanyMonth} -> ${currentKey}`);
        
        // 🔥 使用新的仪表盘缓存清理系统
        await DashboardCache.clearDashboardData(currentCompany, globalMonth);
        
        // 清理旧的缓存键（兼容性）
        const fromDate = `${globalMonth}-01`;
        const [y, m] = globalMonth.split('-').map(Number);
        const lastDayDate = new Date(y, m, 0);
        const lastDay = lastDayDate.getDate();
        const toDate = `${globalMonth}-${String(lastDay).padStart(2, '0')}`;
        const attendanceDataCacheKey = `ATTENDANCE_DATA_${currentCompany}_${fromDate}_${toDate}`;
        const attendanceMapCacheKey = `ATTENDANCE_MAP_CACHE_${currentCompany}_${globalMonth}`;
        
        await SmartCache.remove(attendanceDataCacheKey);
        await SmartCache.remove(attendanceMapCacheKey);
        
        // 重置状态
        setAllUsers([]);
        setCompanyCounts({});
        setAttendanceMap({});
        setProcessDataMap({});
        setError(null);
        
        // console.log(`[AttendanceDashboardPage] ✅ 缓存清理完成，准备重新加载数据`);
      };
      
      clearRelatedCaches();
    } else if (lastCompanyMonth === currentKey) {
      // console.log(`[AttendanceDashboardPage] ℹ️ 公司和月份未变化，保持缓存: ${currentKey}`);
    } else {
      // console.log(`[AttendanceDashboardPage] 🚀 初始化加载，不清理缓存: ${currentKey}`);
    }
    
    // 🔥 更新最后的公司月份组合
    setLastCompanyMonth(currentKey);
  }, [currentCompany, globalMonth]); // 🔥 监听公司和月份变化

  // 🔥 初始化规则配置缓存（在加载数据之前）
  useEffect(() => {
    const initRuleConfig = async () => {
      try {
        // 🔥 每次进入页面都强制刷新当前公司的规则配置
        // console.log(`[AttendanceDashboardPage] 强制刷新 ${currentCompany} 的规则配置`);
        await refreshRuleConfigCache(currentCompany);
        
        // 🔥 刷新完成后，重新加载规则引擎
        AttendanceRuleManager.reloadAllRules();
        
        // console.log('[AttendanceDashboardPage] 规则配置缓存已刷新，规则引擎已重新加载');
        setRuleConfigLoaded(true);
      } catch (error) {
        console.error('[AttendanceDashboardPage] 刷新规则配置失败:', error);
        setRuleConfigLoaded(true); // 即使失败也继续，使用默认配置
      }
    };
    
    // 🔥 重置规则配置加载状态，确保每次公司变化时都重新加载
    setRuleConfigLoaded(false);
    initRuleConfig();
  }, [currentCompany, globalMonth]); // 🔥 同时依赖currentCompany和globalMonth，确保月份变化时也重新加载规则

  // 🔥 规则配置加载完成后再加载数据，同时监听公司和月份变化
  useEffect(() => { 
    if (ruleConfigLoaded && loadAllDataRef.current) {
      // console.log('[AttendanceDashboardPage] 规则配置已加载，开始加载数据');
      
      // 🔥 调试：打印海多多的迟到规则配置
      if (currentCompany === 'hydodo') {
        const hydodoEngine = AttendanceRuleManager.getEngine('hydodo');
        const rules = hydodoEngine.getRules();
        console.log('=== 海多多迟到规则配置 ===');
        console.log('上班时间:', rules.workStartTime);
        console.log('迟到规则:', rules.lateRules);
        console.log('豁免功能:', rules.lateExemptionEnabled);
        console.log('豁免次数:', rules.lateExemptionCount);
        console.log('豁免时长:', rules.lateExemptionMinutes);
        console.log('绩效扣款模式:', rules.performancePenaltyMode);
        console.log('上不封顶-固定金额:', rules.unlimitedPenaltyFixedAmount);
        console.log('========================');
      }
      
      loadAllDataRef.current(); 
    }
  }, [ruleConfigLoaded, globalMonth, currentCompany]); // 🔥 添加globalMonth和currentCompany依赖，确保切换时重新加载数据

  useEffect(() => {
    const initMap = async () => {
        // console.log(`[AttendanceDashboardPage] 开始初始化考勤地图: ${allUsers.length} 个用户`);
        const cacheKey = `ATTENDANCE_MAP_CACHE_${currentCompany}_${globalMonth}`;
        const cachedMap = await SmartCache.get<AttendanceMap>(cacheKey);
        if (cachedMap) { 
          // console.log(`[AttendanceDashboardPage] 使用缓存的考勤地图`);
          setAttendanceMap(cachedMap); 
          setHistory([]); 
          return; 
        }

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentDay = now.getDate();
        const isCurrentMonthSelected = parseInt(globalMonth.slice(0, 4)) === currentYear && parseInt(globalMonth.slice(5, 7)) === currentMonth;

        const map = allUsers.reduce((acc, user) => {
          if (user.punchData) {
            const userMap: { [day: number]: DailyAttendanceStatus } = {};
            const recordsByDay = user.punchData.reduce((dayAcc, record) => {
              // 🔥 严格按照全局月份过滤数据
              const workDate = new Date(record.workDate);
              const recordYear = workDate.getFullYear();
              const recordMonth = workDate.getMonth() + 1; // getMonth() 返回0-11，需要+1
              const day = workDate.getDate();
              
              // 🔥 关键修复：只处理属于当前查询月份的数据
              const [globalYear, globalMonthNum] = globalMonth.split('-').map(Number);
              
              // 严格验证：记录的年月必须与全局年月完全匹配
              if (recordYear !== globalYear || recordMonth !== globalMonthNum) {
                // console.log(`[FILTER] 过滤掉不属于${globalMonth}的数据:`, {
                //   userName: user.name,
                //   recordDate: `${recordYear}-${recordMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
                //   globalMonth: globalMonth,
                //   reason: `记录属于${recordYear}-${recordMonth.toString().padStart(2, '0')}，不属于查询月份${globalMonth}`
                // });
                return dayAcc; // 跳过这条记录
              }
              
              // 🔥 添加调试信息，确认数据正确性
              if (day === 31) {
                // console.log(`[DEBUG] 确认31号数据属于${globalMonth}:`, {
                //   userName: user.name,
                //   originalWorkDate: record.workDate,
                //   parsedDate: `${recordYear}-${recordMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
                //   globalMonth: globalMonth,
                //   checkType: record.checkType,
                //   userCheckTime: record.userCheckTime
                // });
              }
              
              if (!dayAcc[day]) dayAcc[day] = [];
              dayAcc[day].push(record);
              return dayAcc;
            }, {} as Record<number, any[]>);

            for (const dayStr in recordsByDay) {
              const day = Number(dayStr);
              const records = recordsByDay[day];
              const onDutyRecords = records.filter(r => r.checkType === 'OnDuty').sort((a, b) => new Date(a.userCheckTime).getTime() - new Date(b.userCheckTime).getTime());
              const offDutyRecords = records.filter(r => r.checkType === 'OffDuty').sort((a, b) => new Date(b.userCheckTime).getTime() - new Date(a.userCheckTime).getTime());
              const onDutyTime = onDutyRecords.length > 0 ? new Date(onDutyRecords[0].userCheckTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : undefined;
              const offDutyTime = offDutyRecords.length > 0 ? new Date(offDutyRecords[0].userCheckTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : undefined;
              const hasAbnormality = records.some(r => r.locationResult !== 'Normal');
              const hasOffDutyApprove = records.some(r => r.checkType === 'OffDuty' && r.sourceType === 'APPROVE');
              const hasOnDutyApprove = records.some(r => r.checkType === 'OnDuty' && r.sourceType === 'APPROVE');

              let status: any = 'noRecord';
              const isToday = isCurrentMonthSelected && day === currentDay;

              if (records.length > 0) {
                // 🔥 修复：过滤掉 NotSigned 记录后再判断是否有有效的上下班打卡
                const validOnDuty = onDutyRecords.filter(r => r.timeResult !== 'NotSigned');
                const validOffDuty = offDutyRecords.filter(r => r.timeResult !== 'NotSigned');
                
                if (validOnDuty.length > 0 && validOffDuty.length > 0) {
                  status = hasAbnormality ? 'abnormal' : 'normal';
                } else if (onDutyRecords.length > 0 && offDutyRecords.length > 0 && validOnDuty.length > 0) {
                  // 有有效上班打卡但下班全是 NotSigned
                  if (isToday) {
                    status = 'normal';
                  } else {
                    status = 'incomplete';
                  }
                } else if (onDutyRecords.length > 0 && offDutyRecords.length > 0 && validOffDuty.length > 0) {
                  // 有有效下班打卡但上班全是 NotSigned
                  status = 'incomplete';
                } else if (onDutyRecords.length > 0 && offDutyRecords.length > 0) {
                  // 上下班都有记录（可能都是 NotSigned 或混合）
                  if (validOnDuty.length > 0 || validOffDuty.length > 0) {
                    status = 'incomplete';
                  } else {
                    status = 'incomplete'; // 都是 NotSigned
                  }
                } else {
                  if (isToday && onDutyRecords.length > 0 && offDutyRecords.length === 0) {
                    status = 'normal';
                  } else {
                    status = 'incomplete';
                  }
                }
              }
              userMap[day] = { status, records, onDutyTime, offDutyTime, hasAbnormality, hasOffDutyApprove, hasOnDutyApprove };
            }
            acc[user.userid] = userMap;
          }
          return acc;
        }, {} as AttendanceMap);
        
        // console.log(`[AttendanceDashboardPage] 考勤地图初始化完成: ${Object.keys(map).length} 个用户`);
        setAttendanceMap(map); 
        setHistory([]); 
    };
    if (allUsers.length > 0) { 
      initMap(); 
    } else { 
      // console.log(`[AttendanceDashboardPage] 没有用户数据，清空考勤地图`);
      setAttendanceMap({}); 
    }
  }, [allUsers, globalMonth, currentCompany]);

  const { daysInMonth, year, monthIndex } = useMemo(() => {
    const [y, m] = globalMonth.split('-').map(Number);
    return { daysInMonth: new Date(y, m, 0).getDate(), year: y, monthIndex: m - 1 };
  }, [globalMonth]);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        // 🔥 使用新的节假日缓存系统
        const holidayData = await HolidayCache.getHolidays(year);
        console.log('[AttendanceDashboardPage] 加载节假日数据:', year, holidayData);
        console.log('[AttendanceDashboardPage] 节假日数据示例:', {
          '2026-02-01': holidayData['2026-02-01'],
          '2026-02-14': holidayData['2026-02-14'],
          '2026-02-15': holidayData['2026-02-15'],
          '2026-02-28': holidayData['2026-02-28']
        });
        setHolidays(holidayData);
      } catch (error) { 
        console.warn('Failed to fetch holidays', error); 
      }
    };
    fetchHolidays();
  }, [year]);

  // 🔥 添加规则更新触发器，确保规则更新后重新计算统计数据
  const [ruleUpdateTrigger, setRuleUpdateTrigger] = useState(0);
  
  useEffect(() => {
    const handleRulesUpdate = () => {
      setRuleUpdateTrigger(prev => prev + 1);
    };
    
    window.addEventListener('attendanceRulesUpdated', handleRulesUpdate);
    return () => window.removeEventListener('attendanceRulesUpdated', handleRulesUpdate);
  }, []);

  const statsData = useAttendanceStats(allUsers, attendanceMap, processDataMap, holidays, year, monthIndex, ruleUpdateTrigger);
  const { companyEmployeeStats, companyAggregate, dailyTrend } = statsData;

  // 预设的可艾特人员列表（从所有公司的员工统计中获取）
  const [allCompanyUsers, setAllCompanyUsers] = useState<{ name: string; mobile: string; avatar?: string; userid: string; company: string }[]>([]);
  
  // 预设的常用联系人（确保这些人始终在列表中）
  const presetContacts = [
    { name: '肖美珍', mobile: '13288491558', avatar: '', userid: '16663346968647767', company: '财务' },
    { name: '潘永冰', mobile: '13751027068', avatar: '', userid: '196235692328272080', company: '财务' },
  ];
  
  // 🔥 优化员工列表加载，避免重复API调用
  useEffect(() => {
    const loadAllCompanyUsers = async () => {
      try {
        const users: { name: string; mobile: string; avatar?: string; userid: string; company: string }[] = [];
        
        // 先添加预设的常用联系人
        presetContacts.forEach(contact => {
          users.push(contact);
        });
        
        // 🔥 优化：直接使用已加载的用户数据，避免重复API调用
        if (allUsers.length > 0) {
          // 使用当前已加载的用户数据
          allUsers.forEach(user => {
            if (user.name) {
              users.push({
                name: user.name,
                mobile: user.mobile || '',
                avatar: user.avatar,
                userid: user.userid,
                company: currentCompany === 'eyewind' ? '风眼' : '海多多'
              });
            }
          });
        } else {
          // 🔥 只有在没有用户数据时才从缓存获取，避免重复API调用
          const cacheKey = `EMPLOYEES_LIST_${currentCompany}`;
          const cachedEmployees = await SmartCache.get<DingTalkUser[]>(cacheKey);
          
          if (cachedEmployees && cachedEmployees.length > 0) {
            cachedEmployees.forEach(user => {
              if (user.name) {
                users.push({
                  name: user.name,
                  mobile: user.mobile || '',
                  avatar: user.avatar,
                  userid: user.userid,
                  company: currentCompany === 'eyewind' ? '风眼' : '海多多'
                });
              }
            });
          }
        }
        
        // 去重：优先使用 API 返回的完整数据（有 userid 的），预设联系人作为补充
        const uniqueUsers = users
          .reduce((acc, user) => {
            // 检查是否已存在同名用户
            const existingIndex = acc.findIndex(u => u.name === user.name);
            if (existingIndex === -1) {
              // 不存在，直接添加
              acc.push(user);
            } else {
              // 已存在，如果新数据有更完整的信息（有真实 userid），则替换
              const existing = acc[existingIndex];
              if (user.userid && !user.userid.includes('preset_') && 
                  (!existing.userid || existing.userid.includes('preset_'))) {
                acc[existingIndex] = user;
              }
            }
            return acc;
          }, [] as typeof users)
          // .sort((a, b) => {
          //   // 预设联系人（财务）排在最前面
          //   if (a.company === '财务' && b.company !== '财务') return -1;
          //   if (a.company !== '财务' && b.company === '财务') return 1;
          //   // 然后按公司排序（风眼在前）
          //   if (a.company !== b.company) {
          //     return a.company === '风眼' ? -1 : 1;
          //   }
          //   // 最后按姓名排序
          //   return a.name.localeCompare(b.name, 'zh-CN');
          // });
        
        setAllCompanyUsers(uniqueUsers);
        // console.log(`[AttendanceDashboardPage] 已加载员工列表: 预设 ${uniqueUsers.filter(u => u.company === '财务').length} 人, ${currentCompany === 'eyewind' ? '风眼' : '海多多'} ${uniqueUsers.filter(u => u.company !== '财务').length} 人, 共 ${uniqueUsers.length} 人`);
      } catch (error) {
        console.error('[AttendanceDashboardPage] 加载员工列表失败:', error);
      }
    };
    
    // 🔥 只有在用户数据变化时才重新加载员工列表
    if (allUsers.length > 0 || !isLoading) {
      loadAllCompanyUsers();
    }
  }, [allUsers, currentCompany]); // 🔥 移除globalMonth依赖，避免月份变化时重复调用

  // 可艾特人员列表
  const availableAtUsers = allCompanyUsers;

  // 🔥 更完善的数据加载状态检测，添加详细调试信息
  const isDataLoading = useMemo(() => {
    // console.log('[AttendanceDashboardPage] 检查数据加载状态:', {
    //   allUsersLength: allUsers.length,
    //   attendanceMapKeys: Object.keys(attendanceMap).length,
    //   companyEmployeeStats: companyEmployeeStats ? Object.keys(companyEmployeeStats).length : 'null',
    //   isLoading,
    //   isRefreshing,
    //   ruleConfigLoaded
    // });
    
    // 1. 如果基础加载状态为true，直接返回true
    if (isLoading || isRefreshing) {
      // console.log('[AttendanceDashboardPage] 基础加载状态为true');
      return true;
    }
    
    // 2. 如果规则配置未加载，返回true
    if (!ruleConfigLoaded) {
      // console.log('[AttendanceDashboardPage] 规则配置未加载');
      return true;
    }
    
    // 3. 如果没有用户数据，说明还在初始加载
    if (allUsers.length === 0) {
      // console.log('[AttendanceDashboardPage] 没有用户数据');
      return true;
    }
    
    // 4. 🔥 放宽考勤地图的检查条件 - 允许空的考勤地图（可能是新月份或无数据）
    // if (Object.keys(attendanceMap).length === 0) return true;
    
    // 5. 🔥 放宽统计数据的检查 - 如果有用户数据，就认为可以显示
    if (!companyEmployeeStats) {
      // console.log('[AttendanceDashboardPage] 统计数据为null，但有用户数据，继续检查');
      // 不直接返回true，继续检查
    }
    
    // 6. 🔥 如果有统计数据，检查是否有实际的员工统计数据
    if (companyEmployeeStats && Object.keys(companyEmployeeStats).length > 0) {
      const hasEmployeeData = Object.values(companyEmployeeStats).some(employees => 
        Array.isArray(employees) && employees.length > 0
      );
      if (hasEmployeeData) {
        // console.log('[AttendanceDashboardPage] 有完整的统计数据');
        return false;
      }
    }
    
    // 7. 🔥 如果有用户数据但没有统计数据，可能是统计计算中，给一个短暂的等待时间
    if (allUsers.length > 0) {
      // console.log('[AttendanceDashboardPage] 有用户数据但统计数据不完整，允许显示');
      return false; // 🔥 允许显示，不要一直等待统计数据
    }
    
    // console.log('[AttendanceDashboardPage] 默认返回加载中');
    return true;
  }, [allUsers, attendanceMap, companyEmployeeStats, isLoading, isRefreshing, ruleConfigLoaded]);

  // 添加数据加载状态监听
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());
  
  useEffect(() => {
    if (!isDataLoading && isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [isDataLoading, isInitialLoad]);

  // 监听数据变化，实时更新
  useEffect(() => {
    const handleDataUpdate = () => {
      setLastUpdateTime(Date.now());
    };

    // 监听考勤规则更新事件
    window.addEventListener('attendanceRulesUpdated', handleDataUpdate);
    
    // 监听数据变化
    const dataChangeHandler = () => {
      handleDataUpdate();
    };
    
    // 当关键数据发生变化时触发更新
    if (companyEmployeeStats && Object.keys(companyEmployeeStats).length > 0) {
      handleDataUpdate();
    }

    return () => {
      window.removeEventListener('attendanceRulesUpdated', handleDataUpdate);
    };
  }, [companyEmployeeStats, companyAggregate, allUsers, attendanceMap]);

  // 🔥 数据同步：当统计数据计算完成后，自动同步到数据库
  const syncTriggeredRef = useRef<string>('');
  useEffect(() => {
    if (!companyEmployeeStats || Object.keys(companyEmployeeStats).length === 0) return;
    if (!allUsers || allUsers.length === 0) return;

    const syncKey = `${currentCompany}_${globalMonth}`;
    if (syncTriggeredRef.current === syncKey) return; // 避免重复触发
    syncTriggeredRef.current = syncKey;

    // 异步同步统计数据到数据库
    const syncStatsToDb = async () => {
      try {
        const companyId = (currentCompany?.includes('海多多') || currentCompany === 'hydodo') ? 'hydodo' : 'eyewind';
        const [y, m] = globalMonth.split('-');
        const yearMonth = `${y}-${m}`;

        // 构建 statsData
        const statsData: Array<{ userId: string; userName?: string; department?: string; stats: any }> = [];
        const employeeCounts: Record<string, number> = {};
        const fullAttendanceCounts: Record<string, number> = {};

        for (const [companyName, employees] of Object.entries(companyEmployeeStats)) {
          const empList = employees as Array<{ user: DingTalkUser; stats: EmployeeStats }>;
          employeeCounts[companyName] = empList.length;
          fullAttendanceCounts[companyName] = empList.filter(e => e.stats.isFullAttendance).length;
          for (const { user, stats } of empList) {
            statsData.push({
              userId: user.userid,
              userName: user.name,
              department: user.department,
              stats,
            });
          }
        }

        // 同步统计数据
        await fetch(`http://localhost:5001/api/v1/sync/stats/${companyId}/${yearMonth}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            statsData,
            companyAggregates: companyAggregate,
            employeeCounts,
            fullAttendanceCounts,
          }),
        });

        // 判断是否为历史月份，如果是则定稿
        const now = new Date();
        const isCurrentMonth = parseInt(y) === now.getFullYear() && parseInt(m) === (now.getMonth() + 1);
        if (!isCurrentMonth) {
          const employeeUserIds = allUsers.map(u => u.userid);
          const totalEmployees = allUsers.length;
          const fullAttendanceCount = statsData.filter(s => s.stats.isFullAttendance).length;
          const abnormalUserCount = Object.values(companyAggregate || {}).reduce((sum: number, a: any) => sum + (a.abnormalUserCount || 0), 0);

          await fetch(`http://localhost:5001/api/v1/sync/finalize/${companyId}/${yearMonth}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeUserIds,
              summaryStats: { totalEmployees, fullAttendanceCount, abnormalUserCount },
            }),
          });
          console.log(`[DataSync] 历史月份 ${yearMonth} 已定稿`);
        }

        console.log(`[DataSync] 统计数据已同步: ${yearMonth}, ${statsData.length} 条`);
      } catch (err) {
        console.warn('[DataSync] 同步统计数据失败:', err);
      }
    };

    // 延迟执行，确保统计数据稳定
    const timer = setTimeout(syncStatsToDb, 3000);
    return () => clearTimeout(timer);
  }, [companyEmployeeStats, companyAggregate, allUsers, globalMonth, currentCompany]);

  const companyUsers = useMemo(() => {
    if (view.type === 'employeeList') {
      if (view.companyName === '全部') {
        return allUsers; // 返回所有员工
      } else if (view.companyName) {
        return allUsers.filter(u => u.mainCompany === view.companyName);
      }
    } else if (view.type === 'calendar') {
      if (view.companyName === '全部') {
        return allUsers; // 返回所有员工
      } else if (view.companyName) {
        return allUsers.filter(u => u.mainCompany === view.companyName);
      }
    } else if (view.type === 'allEmployees') {
      return allUsers; // Return all employees regardless of company
    }
    return allUsers;
  }, [allUsers, view]);

  const handleSelectUserForDetail = (user: DingTalkUser) => setDetailUserStack(prev => [...prev, user]);
  const handleDetailModalBack = () => setDetailUserStack(prev => prev.slice(0, -1));
  const handleDetailModalClose = () => setDetailUserStack([]);

  const companyNames = useMemo(() => {
    const names = Object.keys(companyCounts);
    return ['全部', ...names]; // 在公司列表前添加"全部"选项
  }, [companyCounts]);
  const [activeCompany, setActiveCompany] = useState<string>('全部'); // 默认选择"全部"

  useEffect(() => {
    if (companyNames.length > 0) {
      // 如果当前选择的公司不在列表中，默认选择"全部"
      if (!companyNames.includes(activeCompany)) {
        setActiveCompany('全部');
      }
    }
  }, [companyNames, activeCompany]);

  // Handle Download Logic
  const handleDownloadReports = async (companyName: string, isPreview = false) => {
    if (!canExport) {
        alert("您没有权限下载报表。");
        return;
    }
    
    if (companyName === '全部') {
        // 下载所有公司的报表
        const allCompanies = Object.keys(companyEmployeeStats);
        if (allCompanies.length === 0) {
            alert('暂无公司数据可下载');
            return;
        }
        
        if (isPreview) {
            // 🔥 预览模式：收集所有公司的tabs数据，合并后一次性设置
            const allTabs: Array<{ name: string; headers: string[]; rows: string[][] }> = [];
            const allContentsMap: Array<{ companyPrefix: string; companyDisplayName: string; originalContents: { attendance: string; late: string; performance: string }; monthStr: string; tabStartIndex: number }> = [];
            
            for (const company of allCompanies) {
                // 🔥 跳过未知公司
                if (company === 'Unknown' || company === 'unknown' || company === '未知') continue;
                const result = await downloadSingleCompanyReport(company, true, true);
                if (result) {
                    const tabStartIndex = allTabs.length;
                    // 给每个tab名称加上公司前缀以区分
                    result.tabs.forEach(tab => {
                        allTabs.push({ ...tab, name: `${result.companyDisplayName}-${tab.name}` });
                    });
                    allContentsMap.push({
                        companyPrefix: result.companyPrefix,
                        companyDisplayName: result.companyDisplayName,
                        originalContents: result.originalContents,
                        monthStr: result.monthStr,
                        tabStartIndex
                    });
                }
            }
            
            if (allTabs.length === 0) {
                alert('暂无公司数据可预览');
                return;
            }
            
            const firstMonthStr = allContentsMap[0].monthStr;
            setPreviewFileName(`全部公司-${globalMonth}-考勤表.csv`);
            setPreviewTabs(allTabs);
            setActivePreviewTab(0);
            
            // 🔥 设置下载回调，支持多公司
            setPreviewDownloadCallback(() => () => {
                try {
                    const currentEditedData = editedDataRef.current;
                    const currentTab = activePreviewTabRef.current;
                    const currentPreviewTabs = previewTabsRef.current;
                    
                    const currentTabData = currentPreviewTabs[currentTab];
                    if (!currentTabData) {
                        alert('无法找到当前表格数据');
                        return;
                    }
                    
                    // 🔥 找到当前tab属于哪个公司
                    let matchedCompany = allContentsMap[0];
                    for (const cm of allContentsMap) {
                        if (currentTab >= cm.tabStartIndex && currentTab < cm.tabStartIndex + 3) {
                            matchedCompany = cm;
                            break;
                        }
                    }
                    
                    const localTabIndex = currentTab - matchedCompany.tabStartIndex;
                    
                    // 应用编辑后的数据
                    const editedRows = currentTabData.rows.map((row, rowIdx) => {
                        return row.map((cell, cellIdx) => {
                            const cellKey = `${currentTab}-${rowIdx}-${cellIdx}`;
                            const editedValue = currentEditedData.get(cellKey);
                            return editedValue !== undefined ? editedValue : cell;
                        });
                    });
                    
                    let originalContent = '';
                    if (localTabIndex === 0) {
                        originalContent = matchedCompany.originalContents.attendance;
                    } else if (localTabIndex === 1) {
                        originalContent = matchedCompany.originalContents.late;
                    } else if (localTabIndex === 2) {
                        originalContent = matchedCompany.originalContents.performance;
                    }
                    
                    const originalLines = originalContent.split('\n');
                    const headerOffset = localTabIndex === 0 ? 4 : (localTabIndex === 1 ? 4 : 2);
                    const headerLines = originalLines.slice(0, headerOffset);
                    
                    const csvRows = editedRows.map(row => 
                        row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
                    );
                    
                    const csvContent = '\ufeff' + [
                        ...headerLines,
                        ...csvRows
                    ].join('\n');
                    
                    let fileName = '';
                    if (localTabIndex === 0) {
                        fileName = `${matchedCompany.companyDisplayName}-${globalMonth}-考勤表.csv`;
                    } else if (localTabIndex === 1) {
                        fileName = `${matchedCompany.companyDisplayName}-${globalMonth}-迟到统计表.csv`;
                    } else if (localTabIndex === 2) {
                        fileName = `${matchedCompany.companyDisplayName}-${globalMonth}-考勤绩效统计.csv`;
                    }
                    
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    saveAs(blob, fileName);
                } catch (error) {
                    console.error("[下载] 下载失败:", error);
                    alert("下载失败，请重试: " + error);
                }
            });
            
            setShowPreviewModal(true);
            return;
        }
        
        // 为每个公司生成报表并打包
        for (const company of allCompanies) {
            // 🔥 跳过未知公司
            if (company === 'Unknown' || company === 'unknown' || company === '未知') continue;
            await downloadSingleCompanyReport(company, false);
        }
        return;
    }
    
    await downloadSingleCompanyReport(companyName, isPreview);
  };
  
  const downloadSingleCompanyReport = async (companyName: string, isPreview = false, collectOnly = false): Promise<{ tabs: Array<{ name: string; headers: string[]; rows: string[][] }>; companyPrefix: string; companyDisplayName: string; originalContents: { attendance: string; late: string; performance: string }; monthStr: string } | void> => {
    const employees = companyEmployeeStats[companyName] || [];
    if (employees.length === 0) { 
        if (companyName !== '全部') {
            alert('当前公司无数据可下载'); 
        }
        return; 
    }

    // 🔥 获取带薪福利假配置（从规则引擎获取）
    const downloadCompanyKey = (companyName === 'hydodo' || companyName.includes('海多多')) ? 'hydodo' : 'eyewind';
    const downloadRuleEngine = AttendanceRuleManager.getEngine(downloadCompanyKey);
    const downloadRuleConfig = (downloadRuleEngine as any).rules; // 访问内部配置
    
    const benefitHolidayMap = new Map<string, string>(); // 日期 -> 原因的映射
    const customDayMap = new Map<string, { type: string; reason: string }>(); // 🔥 所有自定义日期调整
    const customDays = downloadRuleConfig?.workdaySwapRules?.customDays || [];
    
    customDays.forEach((day: any) => {
      customDayMap.set(day.date, { type: day.type, reason: day.reason });
      if (day.type === 'holiday' && day.reason?.includes('福利假')) {
        benefitHolidayMap.set(day.date, day.reason);
      }
    });
    console.log({ benefitHolidayMap, customDays, customDayMap })

    // Log Audit Event
    // if (currentUserInfo) {
    //     db.addAuditLog({
    //         userId: currentUserInfo.id,
    //         userName: currentUserInfo.name,
    //         userRole: currentUserInfo.roleName || 'Unknown',
    //         action: 'DOWNLOAD',
    //         target: `${globalMonth}考勤报表`,
    //         details: `下载了${companyName === 'eyewind' ? '风眼' : '海多多'}的考勤统计报表`
    //     });
    // }

    const zip = new JSZip();
    const monthStr = globalMonth.slice(5, 7);
    const fullMonthStr = `${year}年${parseInt(monthStr)}月`;
    
    // 🔥 获取规则配置
    const ruleConfig = downloadRuleConfig || DEFAULT_CONFIGS[companyName === 'hydodo' ? 'hydodo' : 'eyewind'].rules!;
    
    // 🔧 修复公司名称映射逻辑
    let companyDisplayName = '';
    if (companyName === 'eyewind' || companyName === '深圳市风眼科技有限公司' || companyName === '风眼') {
        companyDisplayName = '深圳市风眼科技有限公司';
    } else if (companyName === 'hydodo' || companyName === '深圳市海多多科技有限公司' || companyName === '海多多') {
        companyDisplayName = '深圳市海多多科技有限公司';
    } else if (companyName === '深圳市海科科技有限公司' || companyName === '海科') {
        companyDisplayName = '深圳市海科科技有限公司';
    } else {
        // 如果是其他公司名称，直接使用原名称
        companyDisplayName = companyName;
    }

    // 🔧 创建统一的备注生成函数，与考勤确认单保持一致
    const generateEmployeeRemarks = (user: DingTalkUser, stats: EmployeeStats): string[] => {
        const userId = user.userid;
        const userAttendance = attendanceMap[userId];
        if (!userAttendance) return [];
        const remarks: string[] = [];
        const [y, m] = globalMonth.split('-').map(Number);
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
                    const unit = p.formValues?.durationUnit || p.formValues?.unit || '';
                    if (type && duration > 0) {
                        const start = p.formValues?.start || p.formValues?.startTime;
                        const end = p.formValues?.end || p.formValues?.endTime;
                        
                        let remarkEntry = '';
                        
                        // 🔥 海多多特殊处理：所有假期统一显示为 09:00-19:00，8.5小时
                        const isHydodo = currentCompany === 'hydodo' || currentCompany === '海多多';
                        
                        // 计算小时数
                        let hours = duration;
                        if (unit.includes('day') || unit.includes('天')) {
                            hours = isHydodo ? duration * 8.5 : duration * 8; // 海多多：1天 = 8.5小时，其他：1天 = 8小时
                        }
                        
                        // 🔥 海多多：强制使用固定时间
                        if (isHydodo) {
                            hours = 8.5; // 固定为8.5小时
                        }
                        
                        if (start && end) {
                            const startDate = start.split(' ')[0];
                            const endDate = end.split(' ')[0];
                            
                            if (startDate === endDate) {
                                // 同一天内的请假
                                // 🔥 海多多：强制使用 09:00-19:00
                                const startTime = isHydodo ? '09:00' : (start.includes(' ') ? start.split(' ')[1].substring(0, 5) : '09:00');
                                const endTime = isHydodo ? '19:00' : (end.includes(' ') ? end.split(' ')[1].substring(0, 5) : '18:30');
                                remarkEntry = `${type} ${startDate} ${startTime} 至 ${endTime} 共${hours}小时`;
                            } else {
                                // 跨天请假，显示开始日期到结束日期
                                remarkEntry = `${type} ${startDate} 至 ${endDate} 共${hours}小时`;
                            }
                        } else {
                            // 没有具体时间，判断是否为整天假期
                            if (unit.includes('day') || unit.includes('天')) {
                                if (duration === 1) {
                                    // 1天假期，只显示日期
                                    const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
                                    // 🔥 海多多：添加时间范围
                                    if (isHydodo) {
                                        remarkEntry = `${type} ${dateStr} 09:00 至 19:00 共${hours}小时`;
                                    } else {
                                        remarkEntry = `${type} ${dateStr} 共${hours}小时`;
                                    }
                                } else {
                                    // 多天假期，显示日期范围
                                    const startDate = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
                                    const endDay = d + duration - 1;
                                    const endDate = `${year}-${monthStr}-${String(endDay).padStart(2, '0')}`;
                                    remarkEntry = `${type} ${startDate} 至 ${endDate} 共${hours}小时`;
                                }
                            } else {
                                // 按小时请假
                                const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
                                // 🔥 海多多：添加时间范围
                                if (isHydodo) {
                                    remarkEntry = `${type} ${dateStr} 09:00 至 19:00 共${hours}小时`;
                                } else {
                                    remarkEntry = `${type} ${dateStr} 共${hours}小时`;
                                }
                            }
                        }
                        
                        if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                    }
                }
            }

            // 检查周末加班
            const dateKey = `${monthStr}-${String(d).padStart(2, '0')}`;
            const fullDateKeyForRemarks = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
            const holidayInfo = holidays[dateKey];
            const customDayForRemarks = customDayMap.get(fullDateKeyForRemarks);
            const dateObj = new Date(year, monthIndex, d);
            const dayOfWeek = dateObj.getDay();
            // 🔥 判断是否为非工作日：考虑 customDays
            const isNonWorkday = customDayForRemarks 
                ? customDayForRemarks.type === 'holiday'
                : ([0, 6].includes(dayOfWeek) && (!holidayInfo || holidayInfo.holiday !== false));
            if (isNonWorkday) {
                const onTime = daily.records.find((r: any) => r.checkType === 'OnDuty')?.userCheckTime;
                const offTime = daily.records.find((r: any) => r.checkType === 'OffDuty')?.userCheckTime;
                if (onTime && offTime) {
                    const hours = ((new Date(offTime).getTime() - new Date(onTime).getTime()) / 3600 / 1000).toFixed(1);
                    const remarkEntry = `加班 ${year}-${monthStr}-${String(d).padStart(2, '0')} 共${hours}小时`;
                    if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                }
            }

            // 检查缺卡
            if (daily.status === 'incomplete') {
                const remarkEntry = `缺卡 ${year}-${monthStr}-${String(d).padStart(2, '0')}`;
                if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
            }
        }
        return remarks;
    };

    // --- CSV Helper ---
    const createCSV = (content: string) => {
        return '\ufeff' + content; // Add BOM for Excel utf-8
    };

    // 获取当月天数
    const daysInMonth = new Date(year, parseInt(monthStr), 0).getDate();
    const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString());

    // 🔥 根据豁免功能配置决定显示哪一列
    const lateMinutesColumn = ruleConfig.lateExemptionEnabled ? '豁免后迟到分钟数' : '迟到分钟数';

    // 1. 考勤表 (按照模板格式)
    const attendanceContent = [
        `${companyDisplayName}考勤表,${','.repeat(daysInMonth + 10)}`,
        `${fullMonthStr},${','.repeat(daysInMonth + 5)}本月记薪日 ${employees.filter(e => e.stats.actualAttendanceDays > 0).length}天,${','.repeat(4)}`,
        `序号,姓名,${dayHeaders.join(',')},正常出勤天数,是否全勤,${lateMinutesColumn},备注,年假(小时),事假(小时),病假(小时 <24),病假(小时 >24),调休(小时),产假(小时),陪产假(小时),婚假(小时),丧假(小时)`,
        `,,${Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            
            // 否则显示星期
            const date = new Date(year, parseInt(monthStr) - 1, day);
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            return dayNames[date.getDay()];
        }).join(',')},本月合计,,,,,,,,,,,,,`,
        ...employees.map((emp, index) => {
            const { user, stats } = emp;
            // 🔥 完全按照考勤日历的逻辑生成每日状态
            const dailyStatus = Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`;
                const fullDateKey = `${year}-${String(parseInt(monthStr)).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const currentDate = new Date();
                const targetDate = new Date(year, parseInt(monthStr) - 1, day);
                
                // 未来日期显示空白
                if (targetDate > currentDate) {
                    return '';
                }

               // 🔥 优先检查是否为带薪福利假
                const benefitHolidayReason = benefitHolidayMap.get(fullDateKey);
                if (benefitHolidayReason) {
                    return benefitHolidayReason;
                }
                
                // 🔥 检查自定义日期调整（customDays 优先于 holidays）
                const customDay = customDayMap.get(fullDateKey);
                
                // 检查是否为法定节假日
                const holidayInfo = holidays[dateKey];
                const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
                let isWorkday = !isWeekend;
                
                // 🔥 优先级：customDays > holidays > 默认周末判断
                if (customDay) {
                    isWorkday = customDay.type === 'workday';
                    if (!isWorkday) {
                        const userAttendance = attendanceMap[user.userid];
                        const statusData = userAttendance?.[day];
                        if (!statusData || !statusData.records || statusData.records.length === 0) {
                            return customDay.reason || '-';
                        }
                    }
                } else if (holidayInfo) {
                    if (holidayInfo.holiday === false) {
                        isWorkday = true; // 补班日
                    } else if (holidayInfo.holiday === true) {
                        isWorkday = false; // 法定节假日
                    }
                }
                
                // 获取考勤数据
                const userAttendance = attendanceMap[user.userid];
                const statusData = userAttendance?.[day];
                
                // 如果是非工作日且没有打卡记录，显示'-'
                if (!isWorkday && (!statusData || !statusData.records || statusData.records.length === 0)) {
                    return '-';
                }
                
                // 如果没有考勤数据
                if (!statusData || !statusData.records) {
                    return isWorkday ? '√' : '-';
                }
                
                // 检查请假类型
                const processRecord = statusData.records.find(r => r.procInstId);
                let leaveType = '';
                if (processRecord && processDataMap[processRecord.procInstId]) {
                    const processData = processDataMap[processRecord.procInstId];
                    leaveType = processData.formValues?.leaveType || processData.bizType || '';
                }
                
                // 如果有请假类型，优先显示
                if (leaveType) {
                    return leaveType;
                }
                
                // 检查是否为加班（非工作日有打卡记录）
                if (!isWorkday && statusData.records.length > 0) {
                    return '加班';
                }
                
                // 检查缺卡
                const hasOnDuty = statusData.records.some(r => r.checkType === 'OnDuty' && r.timeResult !== 'NotSigned');
                const hasOffDuty = statusData.records.some(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');
                
                if (!hasOnDuty && !hasOffDuty) {
                    return '旷工';
                } else if (!hasOnDuty) {
                    return '缺卡-上班卡';
                } else if (!hasOffDuty && day !== currentDate.getDate()) {
                    return '缺卡-下班卡';
                }
                
                // 正常出勤
                // 🔥 检查是否为法定补班日
                if (customDay && customDay.type === 'workday') {
                    return customDay.reason || '法定补班';
                }
                return '√';
            });
            
            // 🔧 使用统一的备注生成函数，与考勤确认单保持一致
            const remarks = generateEmployeeRemarks(user, stats);
            
            // 🔥 根据豁免功能配置决定显示哪个迟到分钟数
            const lateMinutesValue = ruleConfig.lateExemptionEnabled 
                ? (stats.exemptedLateMinutes || 0)
                : (stats.lateMinutes || 0);
            
            return [
                index + 1,
                user.name,
                ...dailyStatus,
                stats.actualAttendanceDays || 0,
                stats.isFullAttendance ? '是' : '否',
                lateMinutesValue,
                remarks.length > 0 ? remarks.join('\n') : '-', // 使用统一的备注格式
                stats.annualHours || 0,
                stats.personalHours || 0,
                stats.sickHours || 0,
                stats.seriousSickHours || 0,
                stats.compTimeHours || 0,
                stats.maternityHours || 0,
                stats.paternityHours || 0,
                stats.marriageHours || 0,
                stats.bereavementHours || 0
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        })
    ].join('\n');
    
    zip.file(`${companyDisplayName}-${globalMonth}-考勤表.csv`, createCSV(attendanceContent));

    // 2. 迟到统计表 (按照模板格式)
    const lateContent = [
        `${companyDisplayName}迟到统计表,${','.repeat(daysInMonth + 15)}`,
        `${fullMonthStr},${','.repeat(daysInMonth + 15)}`,
        `序号,姓名,${dayHeaders.join(',')},${lateMinutesColumn},${ruleConfig.lateExemptionEnabled ? '豁免后迟到次数,' : ''}迟到总分钟数,迟到次数,加班到19:30累计时长,加班到20:30累计时长,加班到22:00累计时长,加班到24:00累计时长,加班总时长(19:30前不算),加班19:30次数,加班20:30次数,加班22:00次数,加班24:00次数,上午缺卡次数,下午缺卡次数`,
        `,,${Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            
            // 否则显示星期
            const date = new Date(year, parseInt(monthStr) - 1, day);
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            return dayNames[date.getDay()];
        }).join(',')},,,,,,,,,,,,,,,`,
        ...employees.map((emp, index) => {
            const { user, stats } = emp;
            // 🔥 完全按照考勤日历的逻辑生成每日迟到状态
            const dailyLateStatus = Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`;
                const fullDateKey = `${year}-${String(parseInt(monthStr)).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const currentDate = new Date();
                const targetDate = new Date(year, parseInt(monthStr) - 1, day);
                
                // 未来日期显示空白
                if (targetDate > currentDate) {
                    return '';
                }
                
                // 🔥 优先检查是否为带薪福利假
                const benefitHolidayReason = benefitHolidayMap.get(fullDateKey);
                if (benefitHolidayReason) {
                    return benefitHolidayReason;
                }
                
                // 🔥 检查自定义日期调整（customDays 优先于 holidays）
                const customDay = customDayMap.get(fullDateKey);
                
                // 检查是否为法定节假日
                const holidayInfo = holidays[dateKey];
                const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
                let isWorkday = !isWeekend;
                
                // 🔥 优先级：customDays > holidays > 默认周末判断
                if (customDay) {
                    isWorkday = customDay.type === 'workday';
                    if (!isWorkday) {
                        const userAttendance = attendanceMap[user.userid];
                        const statusData = userAttendance?.[day];
                        if (!statusData || !statusData.records || statusData.records.length === 0) {
                            return customDay.reason || '-';
                        }
                    }
                } else if (holidayInfo) {
                    if (holidayInfo.holiday === false) {
                        isWorkday = true; // 补班日
                    } else if (holidayInfo.holiday === true) {
                        isWorkday = false; // 法定节假日
                    }
                }
                
                // 获取考勤数据
                const userAttendance = attendanceMap[user.userid];
                const statusData = userAttendance?.[day];
                
                // 如果是非工作日且没有打卡记录，显示'-'
                if (!isWorkday && (!statusData || !statusData.records || statusData.records.length === 0)) {
                    return '-';
                }
                
                // 如果没有考勤数据
                if (!statusData || !statusData.records) {
                    return isWorkday ? '√' : '-';
                }
                
                // 检查请假类型
                const processRecord = statusData.records.find(r => r.procInstId);
                let leaveType = '';
                if (processRecord && processDataMap[processRecord.procInstId]) {
                    const processData = processDataMap[processRecord.procInstId];
                    leaveType = processData.formValues?.leaveType || processData.bizType || '';
                }
                
                // 如果有请假类型，优先显示
                if (leaveType) {
                    return leaveType;
                }
                
                // 检查是否为加班（非工作日有打卡记录）
                if (!isWorkday && statusData.records.length > 0) {
                    const onDutyRecord = statusData.records.find(r => r.checkType === 'OnDuty');
                    const offDutyRecord = statusData.records.find(r => r.checkType === 'OffDuty');
                    if (onDutyRecord && offDutyRecord) {
                        const workHours = (new Date(offDutyRecord.userCheckTime).getTime() - new Date(onDutyRecord.userCheckTime).getTime()) / (1000 * 60 * 60);
                        if (workHours > 0) {
                            return `加班${workHours.toFixed(1)}小时`;
                        }
                    }
                    return '加班';
                }
                
                // 检查缺卡
                const hasOnDuty = statusData.records.some(r => r.checkType === 'OnDuty' && r.timeResult !== 'NotSigned');
                const hasOffDuty = statusData.records.some(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');
                
                if (!hasOnDuty && !hasOffDuty) {
                    return '上午缺卡\n下午缺卡';
                } else if (!hasOnDuty) {
                    return '上午缺卡';
                } else if (!hasOffDuty && day !== currentDate.getDate()) {
                    return '下午缺卡';
                }
                
                // 检查迟到
                const lateRecord = statusData.records.find(r => r.checkType === 'OnDuty' && r.timeResult === 'Late');
                if (lateRecord) {
                    // 🔥 使用规则引擎计算迟到分钟数
                    const companyKey = (user.mainCompany?.includes('海多多') || user.mainCompany === 'hydodo') ? 'hydodo' : 'eyewind';
                    const ruleEngine = AttendanceRuleManager.getEngine(companyKey);
                    
                    // 获取前一天的下班打卡时间（用于跨天规则）
                    const previousDay = day - 1;
                    let previousDayCheckoutTime: Date | undefined;
                    if (previousDay > 0) {
                        const prevDayData = userAttendance?.[previousDay];
                        if (prevDayData && prevDayData.records) {
                            const offDutyRecords = prevDayData.records
                                .filter(r => r.checkType === 'OffDuty')
                                .sort((a, b) => new Date(b.userCheckTime).getTime() - new Date(a.userCheckTime).getTime());
                            if (offDutyRecords.length > 0) {
                                previousDayCheckoutTime = new Date(offDutyRecords[0].userCheckTime);
                            }
                        }
                    }
                    
                    // 获取请假详情
                    const processRecord = statusData.records.find(r => r.procInstId);
                    const processDetail = processRecord && processDataMap[processRecord.procInstId] 
                        ? processDataMap[processRecord.procInstId] 
                        : undefined;
                    
                    const lateMinutes = ruleEngine.calculateLateMinutes(
                        lateRecord,
                        targetDate,
                        previousDayCheckoutTime,
                        undefined, // previousWeekendCheckoutTime
                        undefined, // previousMonthCheckoutTime
                        holidays,
                        processDetail,
                        user.name
                    );
                    
                    return lateMinutes > 0 ? `迟到${lateMinutes}分钟` : '迟到';
                }
                
                // 正常出勤
                return '√';
            });
            
            // 🔥 根据豁免功能配置决定显示哪个迟到分钟数
            const lateMinutesValue = ruleConfig.lateExemptionEnabled 
                ? (stats.exemptedLateMinutes || 0)
                : (stats.lateMinutes || 0);
            
            return [
                index + 1,
                user.name,
                ...dailyLateStatus,
                lateMinutesValue,
                ...(ruleConfig.lateExemptionEnabled ? [stats.late || 0] : []), // 只在启用豁免时显示豁免后迟到次数
                stats.lateMinutes || 0,
                stats.late || 0,
                stats.overtime19_5Minutes || 0,
                stats.overtime20_5Minutes || 0,
                stats.overtime22Minutes || 0,
                stats.overtime24Minutes || 0,
                stats.overtimeTotalMinutes || 0,
                stats.overtime19_5Count || 0,
                stats.overtime20_5Count || 0,
                stats.overtime22Count || 0,
                stats.overtime24Count || 0,
                Math.floor((stats.missing || 0) / 2), // 上午缺卡
                Math.ceil((stats.missing || 0) / 2)   // 下午缺卡
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        })
    ].join('\n');
    
    zip.file(`${companyDisplayName}-${globalMonth}-迟到统计表.csv`, createCSV(lateContent));

    // 3. 考勤绩效统计表 (按照模板格式)
    const fullAttendanceEmployees = employees.filter(emp => emp.stats.isFullAttendance);
    const lateEmployees = employees.filter(emp => emp.stats.exemptedLateMinutes > 0);
    
    // 🔥 获取全勤奖金额（从规则引擎）
    const companyKey = (companyName.includes('海多多') || companyName === 'hydodo') ? 'hydodo' : 'eyewind';
    const ruleEngine = AttendanceRuleManager.getEngine(companyKey);
    const fullAttendanceBonus = ruleEngine.getRules().fullAttendanceBonus;
    
    const performanceContent = [
        `${companyDisplayName}${parseInt(monthStr)}月全勤人员,${','.repeat(30)}`,
        `序号,姓名,项目,全勤奖,签名,${','.repeat(25)}`,
        ...fullAttendanceEmployees.map((emp, index) => {
            return [
                index + 1,
                emp.user.name,
                '全勤',
                fullAttendanceBonus,
                '',
                ...Array(25).fill('')
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        }),
        ...Array(Math.max(0, 20 - fullAttendanceEmployees.length)).fill(Array(30).fill('').map(val => `"${val}"`).join(',')),
        `合计,,,${fullAttendanceEmployees.length * fullAttendanceBonus},${','.repeat(26)}`,
        '',
        `${companyDisplayName}${parseInt(monthStr)}月迟到人员,${','.repeat(30)}`,
        `序号,姓名,原迟到时长,豁免迟到后迟到时长,其他绩效分数,其他绩效对应金额,签名,${','.repeat(24)}`,
        ...lateEmployees.map((emp, index) => {
            const penalty = emp.stats.performancePenalty || 0;
            const score = penalty > 0 ? -Math.ceil(penalty / 50) : 0; // 假设每50元扣1分
            return [
                index + 1,
                emp.user.name,
                emp.stats.lateMinutes || 0,
                emp.stats.exemptedLateMinutes || 0,
                score,
                penalty > 0 ? -penalty : 0,
                '',
                ...Array(24).fill('')
            ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
        }),
        ...Array(Math.max(0, 25 - lateEmployees.length)).fill(Array(31).fill('').map(val => `"${val}"`).join(',')),
        `合计,,,,,-${lateEmployees.reduce((sum, emp) => sum + (emp.stats.performancePenalty || 0), 0)},${','.repeat(25)}`
    ].join('\n');
    
    zip.file(`${companyDisplayName}-${globalMonth}-考勤绩效统计.csv`, createCSV(performanceContent));

    // 🔥 预览模式：解析三个CSV文件并显示预览
    if (isPreview) {
        const tabs = [];
        
        // 将CSV内容中引号内的换行符替换为特殊标记，便于后续处理
        const NEWLINE_PLACEHOLDER = '<<<NEWLINE>>>';
        
        const cleanCsvContent = (content: string): string => {
            let result = '';
            let inQuotes = false;
            
            for (let i = 0; i < content.length; i++) {
                const char = content[i];
                
                if (char === '"') {
                    if (inQuotes && content[i + 1] === '"') {
                        // 双引号转义
                        result += '""';
                        i++;
                    } else {
                        // 切换引号状态
                        inQuotes = !inQuotes;
                        result += char;
                    }
                } else if ((char === '\n' || char === '\r') && inQuotes) {
                    // 引号内的换行符替换为占位符
                    if (char === '\n') {
                        result += NEWLINE_PLACEHOLDER;
                    }
                    // 忽略 \r
                } else {
                    result += char;
                }
            }
            
            return result;
        };
        
        // 清理CSV内容
        const cleanedAttendance = cleanCsvContent(attendanceContent);
        const cleanedLate = cleanCsvContent(lateContent);
        const cleanedPerformance = cleanCsvContent(performanceContent);
        
        // 解析考勤表
        const attendanceLines = cleanedAttendance.split('\n');
        const attendanceHeaders = attendanceLines[2].split(',').map(h => h.replace(/^"|"$/g, ''));
        const attendanceRows = attendanceLines.slice(4) // 🔥 移除50行限制，显示全部数据
            .filter(line => line.trim())
            .map(line => {
                const cells: string[] = [];
                let currentCell = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        if (inQuotes && line[i + 1] === '"') {
                            currentCell += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        // 将占位符转换回换行符
                        cells.push(currentCell.replace(new RegExp(NEWLINE_PLACEHOLDER, 'g'), '\n'));
                        currentCell = '';
                    } else {
                        currentCell += char;
                    }
                }
                // 将占位符转换回换行符
                cells.push(currentCell.replace(new RegExp(NEWLINE_PLACEHOLDER, 'g'), '\n'));
                return cells;
            });
        tabs.push({ name: '考勤表', headers: attendanceHeaders, rows: attendanceRows });
        
        // 解析迟到统计表
        const lateLines = cleanedLate.split('\n');
        const lateHeaders = lateLines[2].split(',').map(h => h.replace(/^"|"$/g, ''));
        const lateRows = lateLines.slice(4) // 🔥 移除50行限制，显示全部数据
            .filter(line => line.trim())
            .map(line => {
                const cells: string[] = [];
                let currentCell = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        if (inQuotes && line[i + 1] === '"') {
                            currentCell += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        cells.push(currentCell.replace(new RegExp(NEWLINE_PLACEHOLDER, 'g'), '\n'));
                        currentCell = '';
                    } else {
                        currentCell += char;
                    }
                }
                cells.push(currentCell.replace(new RegExp(NEWLINE_PLACEHOLDER, 'g'), '\n'));
                return cells;
            });
        tabs.push({ name: '迟到统计表', headers: lateHeaders, rows: lateRows });
        
        // 解析考勤绩效统计表
        const performanceLines = cleanedPerformance.split('\n');
        const performanceHeaders = performanceLines[1].split(',').map(h => h.replace(/^"|"$/g, ''));
        const performanceRows = performanceLines.slice(2) // 🔥 移除50行限制，显示全部数据
            .filter(line => line.trim())
            .map(line => {
                const cells: string[] = [];
                let currentCell = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        if (inQuotes && line[i + 1] === '"') {
                            currentCell += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (char === ',' && !inQuotes) {
                        cells.push(currentCell.replace(new RegExp(NEWLINE_PLACEHOLDER, 'g'), '\n'));
                        currentCell = '';
                    } else {
                        currentCell += char;
                    }
                }
                cells.push(currentCell.replace(new RegExp(NEWLINE_PLACEHOLDER, 'g'), '\n'));
                return cells;
            });
        tabs.push({ name: '考勤绩效统计', headers: performanceHeaders, rows: performanceRows });
        
        const companyPrefix = companyName === 'eyewind' ? '风眼' : companyName === 'hydodo' ? '海多多' : companyName;
        
        // 🔥 保存原始内容到变量，供下载时使用
        const originalContents = {
          attendance: attendanceContent,
          late: lateContent,
          performance: performanceContent
        };
        
        // 🔥 collectOnly模式：返回数据而不设置state（用于"全部"预览）
        if (collectOnly) {
            return { tabs, companyPrefix, companyDisplayName, originalContents, monthStr };
        }
        
        setPreviewFileName(`${companyDisplayName}-${globalMonth}-考勤表.csv`); // 🔥 初始显示考勤表的文件名
        setPreviewTabs(tabs);
        setActivePreviewTab(0);
        
        // 保存下载回调 - 🔥 使用 ref 获取最新的编辑数据和当前tab
        setPreviewDownloadCallback(() => () => {
            try {
                console.log('[下载] 开始下载');
                
                // 🔥 从 ref 获取最新的编辑数据和当前tab
                const currentEditedData = editedDataRef.current;
                const currentEditedCells = editedCellsRef.current;
                const currentTab = activePreviewTabRef.current;
                const currentPreviewTabs = previewTabsRef.current;
                
                console.log('[下载] 当前编辑数据:', currentEditedData);
                console.log('[下载] 当前编辑单元格:', currentEditedCells);
                console.log('[下载] 编辑数据大小:', currentEditedData.size);
                console.log('[下载] 编辑单元格数量:', currentEditedCells.size);
                console.log(`[下载] 当前Tab索引: ${currentTab}`);
                
                // 🔥 获取当前tab的数据
                const currentTabData = currentPreviewTabs[currentTab];
                if (!currentTabData) {
                    console.error('[下载] 错误：无法找到当前表格数据');
                    console.error('[下载] currentTab:', currentTab);
                    console.error('[下载] currentPreviewTabs:', currentPreviewTabs);
                    alert('无法找到当前表格数据');
                    return;
                }
                
                console.log(`[下载] 表头: ${currentTabData.headers.length} 列`);
                console.log(`[下载] 原始数据行: ${currentTabData.rows.length} 行`);
                
                // 🔥 应用编辑后的数据
                const editedRows = currentTabData.rows.map((row, rowIdx) => {
                    return row.map((cell, cellIdx) => {
                        const cellKey = `${currentTab}-${rowIdx}-${cellIdx}`;
                        // 如果有编辑值，使用编辑值；否则使用原始值
                        const editedValue = currentEditedData.get(cellKey);
                        const finalValue = editedValue !== undefined ? editedValue : cell;
                        
                        // 调试：如果这个单元格被编辑过，打印信息
                        if (editedValue !== undefined) {
                            console.log(`[下载] 单元格 [${rowIdx},${cellIdx}] 已编辑: "${cell}" -> "${editedValue}"`);
                        }
                        
                        return finalValue;
                    });
                });
                
                console.log(`[下载] 应用编辑后的数据行: ${editedRows.length} 行`);
                
                // 🔥 根据当前tab获取原始CSV的标题行
                let originalContent = '';
                if (currentTab === 0) {
                    originalContent = originalContents.attendance;
                } else if (currentTab === 1) {
                    originalContent = originalContents.late;
                } else if (currentTab === 2) {
                    originalContent = originalContents.performance;
                }
                
                const originalLines = originalContent.split('\n');
                const headerOffset = currentTab === 0 ? 4 : (currentTab === 1 ? 4 : 2);
                
                // 保留原始的标题行
                const headerLines = originalLines.slice(0, headerOffset);
                
                console.log(`[下载] 保留标题行: ${headerLines.length} 行`);
                
                // 生成CSV内容
                const csvRows = editedRows.map(row => 
                    row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
                );
                
                const csvContent = '\ufeff' + [
                    ...headerLines,
                    ...csvRows
                ].join('\n');
                
                // 确定文件名
                let fileName = '';
                if (currentTab === 0) {
                    fileName = `${companyDisplayName}-${globalMonth}-考勤表.csv`;
                } else if (currentTab === 1) {
                    fileName = `${companyDisplayName}-${globalMonth}-迟到统计表.csv`;
                } else if (currentTab === 2) {
                    fileName = `${companyDisplayName}-${globalMonth}-考勤绩效统计.csv`;
                }
                
                console.log(`[下载] 下载文件: ${fileName}`);
                console.log(`[下载] CSV内容前200字符:`, csvContent.substring(0, 200));
                
                // 下载文件
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                saveAs(blob, fileName);
                
                console.log('[下载] 下载完成');
            } catch (error) {
                console.error("[下载] 下载失败:", error);
                alert("下载失败，请重试: " + error);
            }
        });
        
        setShowPreviewModal(true);
        return;
    }

    try {
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `${companyDisplayName}-${globalMonth}-考勤报表.zip`);
    } catch (error) {
        console.error("Download failed:", error);
        alert("打包下载失败，请重试");
    }
  };

  const handleManualRefresh = async () => {
    // 🔥 使用新的缓存清理系统
    await DashboardCache.clearDashboardData(currentCompany, globalMonth);
    
    // 清理旧的缓存键（兼容性）
    const cacheKey = `ATTENDANCE_MAP_CACHE_${currentCompany}_${globalMonth}`;
    await SmartCache.remove(cacheKey); 
    
    loadAllData(true);
  };

  // 更新推送内容中的艾特人员
  const updatePushContentAtUsers = useCallback((users: { name: string; mobile: string }[]) => {
    const atUsersText = users.length > 0 
      ? users.map(u => `@${u.name}`).join(' ') + ' '
      : '';
    
    // 替换 "Hi，" 后面的艾特人员部分
    setPushContent(prev => {
      // 匹配 "Hi，" 后面可能存在的 @xxx @yyy 格式
      const hiMatch = prev.match(/^(Hi，)(@[^\n]*\s*)?\n/);
      if (hiMatch) {
        return prev.replace(/^Hi，(@[^\n]*\s*)?\n/, `Hi，${atUsersText}\n`);
      }
      return prev;
    });
  }, []);

  // 生成默认推送内容
  const generateDefaultPushContent = useCallback(() => {
    const [y, m] = globalMonth.split('-').map(Number);
    const monthStr = `${m}月`;
    
    // 生成艾特人员文本
    const atUsersText = selectedAtUsers.length > 0 
      ? selectedAtUsers.map(u => `@${u.name}`).join(' ') + ' '
      : '';
    
    // 保持原有文案格式，将链接嵌入到关键词中
    const content = `Hi，${atUsersText}

风眼&脑力&浅冰&海多多主体${monthStr}份考勤表确认完毕，可进行核算；

其中需注意如下情况：

1. 风眼&脑力&浅冰 ${monthStr}社保账单已添加至知识库，可点击链接 [社保公积金账单](https://alidocs.dingtalk.com/i/nodes/G1DKw2zgV22jwNBkFRZy7MLBVB5r9YAn?utm_scene=team_space)；
2. 海多多主体社保、医保和公积金账单信息由美珍导出；
3. 人事变动部分请关注【钉钉-人员月度变动审批】通过后再结算
4. ${monthStr}份加班人员都按调休折算

考勤系统检阅可查阅：${window.location.origin}/；

如有其他问题可随时沟通。`;

    return content;
  }, [globalMonth, selectedAtUsers]);

  // 打开自定义下载弹窗
  const handleOpenCustomDownload = (companyName: string) => {
    setCustomDownloadCompany(companyName);
    setColumnSearchQuery(''); // 重置搜索框
    setShowCustomDownloadModal(true);
  };

  // 切换列选择
  const toggleColumn = (key: string) => {
    const column = availableColumns.find(c => c.key === key);
    if (column?.required) return; // 必选列不能取消
    
    setSelectedColumns(prev => {
      const newColumns = prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key];
      localStorage.setItem('attendance_custom_columns', JSON.stringify(newColumns));
      return newColumns;
    });
  };

  // 全选/取消全选
  const toggleAllColumns = () => {
    const allKeys = availableColumns.map(c => c.key);
    const allSelected = allKeys.every(k => selectedColumns.includes(k));
    const newColumns = allSelected 
      ? availableColumns.filter(c => c.required).map(c => c.key)
      : allKeys;
    setSelectedColumns(newColumns);
    localStorage.setItem('attendance_custom_columns', JSON.stringify(newColumns));
  };

  // 执行自定义下载
  const handleCustomDownload = (isPreview = false) => {
    if (!canExport) {
      alert("您没有权限下载报表。");
      return;
    }

    const targetCompany = customDownloadCompany === '全部' ? Object.keys(companyEmployeeStats) : [customDownloadCompany];
    const [y, m] = globalMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    
    // 🔥 获取带薪福利假配置（从规则引擎获取）
    const downloadCompanyKey = (customDownloadCompany === 'hydodo' || customDownloadCompany.includes('海多多')) ? 'hydodo' : 'eyewind';
    const downloadRuleEngine = AttendanceRuleManager.getEngine(downloadCompanyKey);
    const downloadRuleConfig = (downloadRuleEngine as any).rules;
    
    const benefitHolidayMap = new Map<string, string>();
    const customDayMap = new Map<string, { type: string; reason: string }>(); // 🔥 所有自定义日期调整
    const customDays = downloadRuleConfig?.workdaySwapRules?.customDays || [];
    
    customDays.forEach((day: any) => {
      customDayMap.set(day.date, { type: day.type, reason: day.reason });
      if (day.type === 'holiday' && day.reason?.includes('福利假')) {
        benefitHolidayMap.set(day.date, day.reason);
      }
    });
    
    // 生成员工备注的辅助函数
    const generateRemarks = (user: DingTalkUser, stats: EmployeeStats): string => {
      const userId = user.userid;
      const userAttendance = attendanceMap[userId];
      if (!userAttendance) return '-';
      
      const remarks: string[] = [];
      const monthStr = String(m).padStart(2, '0');

      for (let d = 1; d <= daysInMonth; d++) {
        const daily = userAttendance[d];
        if (!daily) continue;

        // 检查请假记录
        const procRecord = daily.records?.find((r: any) => r.procInstId);
        if (procRecord && processDataMap[procRecord.procInstId]) {
          const p = processDataMap[procRecord.procInstId];
          const type = p.formValues?.leaveType || p.bizType;
          const duration = p.formValues?.duration || 0;
          const unit = p.formValues?.durationUnit || p.formValues?.unit || '';
          if (type && duration > 0) {
            let hours = duration;
            if (unit.includes('day') || unit.includes('天')) {
              hours = duration * 8;
            }
            const remarkEntry = `${type} ${y}-${monthStr}-${String(d).padStart(2, '0')} ${hours}小时`;
            if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
          }
        }

        // 检查缺卡
        if (daily.status === 'incomplete') {
          const remarkEntry = `缺卡 ${y}-${monthStr}-${String(d).padStart(2, '0')}`;
          if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
        }
      }
      
      return remarks.length > 0 ? remarks.join('; ') : '-';
    };
    
    targetCompany.forEach(company => {
      const employees = companyEmployeeStats[company] || [];
      if (employees.length === 0) return;

      // 获取公司显示名称
      let companyDisplayName = '';
      if (company === 'eyewind' || company === '深圳市风眼科技有限公司' || company === '风眼') {
        companyDisplayName = '风眼';
      } else if (company === 'hydodo' || company === '深圳市海多多科技有限公司' || company === '海多多') {
        companyDisplayName = '海多多';
      } else {
        companyDisplayName = company;
      }

      // 生成表头
      const headers = selectedColumns.map(key => {
        const col = availableColumns.find(c => c.key === key);
        return col?.label || key;
      });
      
      // 根据日期列模式添加日期列表头
      if (dateColumnMode !== 'none') {
        for (let d = 1; d <= daysInMonth; d++) {
          if (dateColumnMode === 'attendance') {
            headers.push(`${d}号考勤`);
          } else if (dateColumnMode === 'late') {
            headers.push(`${d}号`); // 迟到模式只显示日期
          }
        }
      }

      // 生成数据行
      const rows = employees.map(({ user, stats }: { user: DingTalkUser; stats: EmployeeStats }) => {
        // 计算请假总时长
        const totalLeaveHours = (stats.annualHours || 0) + (stats.personalHours || 0) + 
          (stats.sickHours || 0) + (stats.seriousSickHours || 0) + (stats.compTimeHours || 0) +
          (stats.maternityHours || 0) + (stats.paternityHours || 0) + (stats.marriageHours || 0) + 
          (stats.bereavementHours || 0) + (stats.parentalHours || 0) + (stats.tripHours || 0);
        
        const userId = user.userid;
        const userAttendance = attendanceMap[userId];
        
        // 生成基础列数据
        const row = selectedColumns.map(key => {
          switch (key) {
            // 基本信息
            case 'name': return user.name;
            case 'department': return user.department || '-';
            case 'jobNumber': return user.job_number || '-';
            case 'title': return user.title || '-';
            case 'mainCompany': return user.mainCompany || '-';
            case 'mobile': return user.mobile || '-';
            case 'hiredDate': 
                const hd = new Date(user.hired_date);
                return isNaN(hd.getTime()) ? '-' : hd.toLocaleDateString('zh-CN');
            case 'userid': return user.userid || '-';
            case 'active': return user.active === false ? '离职' : '在职';
            
            // 出勤统计
            case 'shouldAttendanceDays': return stats.shouldAttendanceDays || 0;
            case 'actualAttendanceDays': return stats.actualAttendanceDays || 0;
            case 'isFullAttendance': return stats.isFullAttendance ? '是' : '否';
            case 'attendanceDates': {
              // 生成考勤日期列表
              const userId = user.userid;
              const userAttendance = attendanceMap[userId];
              if (!userAttendance) return '-';
              
              const attendanceDates: string[] = [];
              const monthStr = String(m).padStart(2, '0');
              
              for (let d = 1; d <= daysInMonth; d++) {
                const daily = userAttendance[d];
                if (daily && (daily.status === 'normal' || daily.status === 'abnormal')) {
                  attendanceDates.push(`${y}-${monthStr}-${String(d).padStart(2, '0')}`);
                }
              }
              
              return attendanceDates.length > 0 ? attendanceDates.join('; ') : '-';
            }
            
            // 迟到相关
            case 'late': return stats.late || 0;
            case 'lateMinutes': return stats.lateMinutes || 0;
            case 'exemptedLate': return stats.exemptedLate || 0;
            case 'exemptedLateMinutes': return stats.exemptedLateMinutes || 0;
            case 'performancePenalty': return stats.performancePenalty?.toFixed(2) || '0.00';
            case 'lateDates': {
              // 生成迟到日期列表
              const userId = user.userid;
              const userAttendance = attendanceMap[userId];
              if (!userAttendance) return '-';
              
              const lateDates: string[] = [];
              const monthStr = String(m).padStart(2, '0');
              
              for (let d = 1; d <= daysInMonth; d++) {
                const daily = userAttendance[d];
                if (!daily || !daily.records) continue;
                
                // 检查是否有迟到记录
                const onDutyRecords = daily.records.filter((r: any) => r.checkType === 'OnDuty');
                if (onDutyRecords.length > 0) {
                  const firstOnDuty = onDutyRecords.sort((a: any, b: any) => 
                    new Date(a.userCheckTime).getTime() - new Date(b.userCheckTime).getTime()
                  )[0];
                  
                  // 检查是否迟到（timeResult === 'Late'）
                  if (firstOnDuty.timeResult === 'Late') {
                    lateDates.push(`${y}-${monthStr}-${String(d).padStart(2, '0')}`);
                  }
                }
              }
              
              return lateDates.length > 0 ? lateDates.join('; ') : '-';
            }
            
            // 缺卡相关
            case 'missing': return stats.missing || 0;
            case 'absenteeism': return stats.absenteeism || 0;
            
            // 请假统计
            case 'annualHours': return stats.annualHours || 0;
            case 'personalHours': return stats.personalHours || 0;
            case 'sickHours': return stats.sickHours || 0;
            case 'seriousSickHours': return stats.seriousSickHours || 0;
            case 'compTimeHours': return stats.compTimeHours || 0;
            case 'tripHours': return stats.tripHours || 0;
            case 'maternityHours': return stats.maternityHours || 0;
            case 'paternityHours': return stats.paternityHours || 0;
            case 'marriageHours': return stats.marriageHours || 0;
            case 'bereavementHours': return stats.bereavementHours || 0;
            case 'parentalHours': return stats.parentalHours || 0;
            case 'totalLeaveHours': return totalLeaveHours;
            
            // 加班统计
            case 'overtime19_5Minutes': return stats.overtime19_5Minutes || 0;
            case 'overtime20_5Minutes': return stats.overtime20_5Minutes || 0;
            case 'overtime22Minutes': return stats.overtime22Minutes || 0;
            case 'overtime24Minutes': return stats.overtime24Minutes || 0;
            case 'overtimeTotalMinutes': return stats.overtimeTotalMinutes || 0;
            case 'overtime19_5Count': return stats.overtime19_5Count || 0;
            case 'overtime20_5Count': return stats.overtime20_5Count || 0;
            case 'overtime22Count': return stats.overtime22Count || 0;
            case 'overtime24Count': return stats.overtime24Count || 0;
            
            // 其他
            case 'remarks': return generateRemarks(user, stats);
            
            default: return '-';
          }
        });
        
        // 根据日期列模式添加每日数据
        if (dateColumnMode !== 'none') {
          for (let d = 1; d <= daysInMonth; d++) {
            const daily = userAttendance?.[d];
            
            if (dateColumnMode === 'attendance') {
              // 考勤模式：显示考勤状态和请假信息
              if (!daily) {
                row.push('-');
              } else {
                const monthStr = String(m).padStart(2, '0');
                const fullDateKey = `${y}-${monthStr}-${String(d).padStart(2, '0')}`;
                
                // 🔥 优先检查是否为带薪福利假
                const benefitHolidayReason = benefitHolidayMap.get(fullDateKey);
                if (benefitHolidayReason) {
                  row.push(benefitHolidayReason);
                } else {
                  // 🔥 检查自定义日期调整
                  const customDay = customDayMap.get(fullDateKey);
                  const isCustomHoliday = customDay && customDay.type === 'holiday';
                  
                  if (isCustomHoliday && (!daily.records || daily.records.length === 0)) {
                    row.push(customDay.reason || '-');
                  } else {
                  // 检查是否有请假记录
                  const procRecord = daily.records?.find((r: any) => r.procInstId);
                  let leaveInfo = '';
                  
                  if (procRecord && processDataMap[procRecord.procInstId]) {
                    const p = processDataMap[procRecord.procInstId];
                    const leaveType = p.formValues?.leaveType || p.bizType;
                    const duration = p.formValues?.duration || 0;
                    const unit = p.formValues?.durationUnit || p.formValues?.unit || '';
                    
                    if (leaveType && duration > 0) {
                      let hours = duration;
                      if (unit.includes('day') || unit.includes('天')) {
                        hours = duration * 8;
                      }
                      leaveInfo = `${leaveType}${hours}h`;
                    }
                  }
                  
                  // 优先显示请假信息，其次显示考勤状态
                  if (leaveInfo) {
                    row.push(leaveInfo);
                  } else if (daily.status === 'normal') {
                    // 🔥 正常出勤：检查是否为法定补班日
                    const customDayWork = customDayMap.get(fullDateKey);
                    if (customDayWork && customDayWork.type === 'workday') {
                      row.push(customDayWork.reason || '法定补班');
                    } else {
                      row.push('✓');
                    }
                  } else if (daily.status === 'abnormal') {
                    // 🔥 异常出勤：也检查法定补班日
                    const customDayWork = customDayMap.get(fullDateKey);
                    if (customDayWork && customDayWork.type === 'workday') {
                      row.push(customDayWork.reason || '法定补班');
                    } else {
                      row.push('异常');
                    }
                  } else if (daily.status === 'incomplete') {
                    row.push('缺卡');
                  } else if (daily.status === 'noRecord') {
                    row.push('-');
                  } else {
                    row.push('-');
                  }
                  }
                }
              }
            } else if (dateColumnMode === 'late') {
              // 迟到模式：显示迟到分钟数
              if (!daily || !daily.records) {
                row.push('-');
              } else {
                const onDutyRecords = daily.records.filter((r: any) => r.checkType === 'OnDuty');
                if (onDutyRecords.length === 0) {
                  row.push('-');
                } else {
                  const firstOnDuty = onDutyRecords.sort((a: any, b: any) => 
                    new Date(a.userCheckTime).getTime() - new Date(b.userCheckTime).getTime()
                  )[0];
                  
                  if (firstOnDuty.timeResult === 'Late') {
                    // 计算迟到分钟数
                    const userTime = new Date(firstOnDuty.userCheckTime);
                    const baseTime = firstOnDuty.baseCheckTime ? new Date(firstOnDuty.baseCheckTime) : null;
                    
                    if (baseTime) {
                      const diffMs = userTime.getTime() - baseTime.getTime();
                      const diffMinutes = Math.floor(diffMs / (1000 * 60));
                      row.push(diffMinutes > 0 ? `迟到${diffMinutes}分钟` : '-');
                    } else {
                      row.push('迟到');
                    }
                  } else {
                    row.push('-');
                  }
                }
              }
            }
          }
        }
        
        return row;
      });

      // 🔥 预览模式：显示预览弹窗
      if (isPreview) {
        const fileName = `${companyDisplayName}-${globalMonth}-自定义报表.csv`;
        setPreviewFileName(fileName);
        setPreviewTabs([{ 
          name: '自定义报表',
          headers, 
          rows: rows.map(row => row.map(val => String(val))) // 🔥 显示全部数据，保留换行符
        }]);
        setActivePreviewTab(0);
        
        // 保存下载回调 - 🔥 使用编辑后的数据
        setPreviewDownloadCallback(() => () => {
          // 🔥 应用编辑后的数据
          const editedRows = rows.map((row, rowIdx) => {
            return row.map((cell, colIdx) => {
              const cellKey = `0-${rowIdx}-${colIdx}`; // 自定义报表只有一个tab，索引为0
              return editedData.get(cellKey) ?? cell;
            });
          });
          
          // 生成 CSV 内容
          const csvContent = '\ufeff' + [
            headers.map(h => `"${h}"`).join(','),
            ...editedRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
          ].join('\n');

          // 下载文件
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = previewFileName || fileName;
          link.click();
          URL.revokeObjectURL(link.href);
        });
        
        setShowPreviewModal(true);
        return;
      }

      // 生成 CSV 内容
      const csvContent = '\ufeff' + [
        headers.map(h => `"${h}"`).join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // 下载文件
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${companyDisplayName}-${globalMonth}-自定义报表.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

    // 记录审计日志
    // if (currentUserInfo) {
    //   db.addAuditLog({
    //     userId: currentUserInfo.id,
    //     userName: currentUserInfo.name,
    //     userRole: currentUserInfo.roleName || 'Unknown',
    //     action: 'DOWNLOAD',
    //     target: `${globalMonth}自定义报表`,
    //     details: `下载了自定义考勤报表，包含字段：${selectedColumns.map(k => availableColumns.find(c => c.key === k)?.label).join('、')}`
    //   });
    // }

    if (!isPreview) {
      setShowCustomDownloadModal(false);
    }
  };

  // 打开推送弹窗
  const handleOpenPushModal = () => {
    setPushContent(generateDefaultPushContent());
    setPushResult(null);
    setIsWebhookEditable(false); // 重置为锁定状态
    setShowPushModal(true);
  };

  // 🔥 打开操作日志弹窗
  const handleViewSnapshotLogs = async () => {
    setShowSnapshotLogsModal(true);
    setIsLoadingSnapshotLogs(true);
    setSnapshotLogs([]);
    try {
      const resolveId = (name: string): string => {
        if (name === 'eyewind' || name.includes('风眼')) return 'eyewind';
        if (name === 'hydodo' || name.includes('海多多')) return 'hydodo';
        if (name.includes('脑力')) return 'naoli';
        if (name.includes('海科')) return 'haike';
        if (name.includes('浅冰')) return 'qianbing';
        return name;
      };
      // 确定需要查询的公司列表
      const isAllMode = activeCompany === '全部';
      const companyIds: string[] = isAllMode
        ? Object.keys(companyEmployeeStats)
            .filter(k => k && k !== 'Unknown' && k !== 'unknown' && k !== '未知')
            .map(k => resolveId(k))
        : [resolveId(activeCompany)];
      // 去重
      const uniqueIds = [...new Set(companyIds)];
      // 并行查询所有公司的快照记录
      const allLogs = await Promise.all(
        uniqueIds.map(cid => getSnapshots(cid, globalMonth).catch(() => []))
      );
      const merged = allLogs.flat().sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSnapshotLogs(merged);
    } catch (err) {
      console.error('[操作日志] 加载失败:', err);
    } finally {
      setIsLoadingSnapshotLogs(false);
    }
  };

  // 发送推送
  const handlePush = async () => {
    if (!pushWebhook.trim()) {
      setPushResult({ success: false, message: 'Webhook 地址不能为空' });
      return;
    }
    if (!pushContent.trim()) {
      setPushResult({ success: false, message: '推送内容不能为空' });
      return;
    }

    setIsPushing(true);
    setPushResult(null);

    try {
      // 保存 webhook 地址到本地存储
      localStorage.setItem('attendance_push_webhook', pushWebhook);

      // 构建艾特用户列表
      const atUsers: AtUser[] = selectedAtUsers.map(user => ({
        name: user.name,
        mobile: user.mobile,
        userid: user.userid
      }));

      // 调用推送服务
      const result = await sendDingTalkMessage({
        webhook: pushWebhook,
        content: pushContent,
        atUsers: atUsers
      });

      if (result.success) {
        setPushResult({ success: true, message: result.message });
        // 记录审计日志
        // if (currentUserInfo) {
        //   db.addAuditLog({
        //     userId: currentUserInfo.id,
        //     userName: currentUserInfo.name,
        //     userRole: currentUserInfo.roleName || 'Unknown',
        //     action: 'SEND',
        //     target: `${globalMonth}考勤推送`,
        //     details: `通过 Webhook 推送了考勤统计报告${selectedAtUsers.length > 0 ? `，@了${selectedAtUsers.map(u => u.name).join('、')}` : ''}`
        //   });
        // }
      } else {
        setPushResult({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Push failed:', error);
      setPushResult({ success: false, message: error instanceof Error ? error.message : '推送失败，请检查网络连接' });
    } finally {
      setIsPushing(false);
    }
  };

  // 🔥 从 tab 名称解析公司ID和报表类型
  const parseTabInfo = (tabName: string): { companyId: string; reportType: 'attendance' | 'late' | 'performance'; companyDisplayName: string } => {
    let companyId = currentCompany === 'eyewind' ? 'eyewind' : 'hydodo';
    let companyDisplayName = currentCompany === 'eyewind' ? '深圳市风眼科技有限公司' : '深圳市海多多科技有限公司';
    let reportType: 'attendance' | 'late' | 'performance' = 'attendance';
    
    const dashIdx = tabName.lastIndexOf('-');
    if (dashIdx > 0) {
      const tabCompany = tabName.substring(0, dashIdx);
      const tabType = tabName.substring(dashIdx + 1);
      companyDisplayName = tabCompany;
      // 公司名 → companyId 映射
      if (tabCompany.includes('风眼')) companyId = 'eyewind';
      else if (tabCompany.includes('海多多')) companyId = 'hydodo';
      else if (tabCompany.includes('脑力')) companyId = 'naoli';
      else if (tabCompany.includes('海科')) companyId = 'haike';
      else if (tabCompany.includes('浅冰')) companyId = 'qianbing';
      else companyId = tabCompany; // 兜底：用全称作为 ID
      // 报表类型
      if (tabType.includes('迟到')) reportType = 'late';
      else if (tabType.includes('绩效')) reportType = 'performance';
    } else {
      if (tabName.includes('迟到')) reportType = 'late';
      else if (tabName.includes('绩效')) reportType = 'performance';
    }
    
    return { companyId, reportType, companyDisplayName };
  };

  // 🔥 加载当前 tab 的最新快照信息
  const loadCurrentTabSnapshotInfo = async (tabIndex?: number) => {
    const idx = tabIndex ?? activePreviewTab;
    const tabData = previewTabs[idx];
    if (!tabData) { setCurrentSnapshotInfo(null); return; }
    
    try {
      const { companyId, reportType } = parseTabInfo(tabData.name);
      
      const snapshot = await getLatestSnapshot(companyId, globalMonth, reportType);
      if (snapshot) {
        setCurrentSnapshotInfo({
          version: snapshot.version,
          savedAt: snapshot.created_at,
          savedByName: snapshot.saved_by_name || '未知',
        });
        
        // 🔥 用数据库中的最新快照数据覆盖当前 tab 的 rows
        const snapshotHeaders: string[] = typeof snapshot.headers === 'string' ? JSON.parse(snapshot.headers) : snapshot.headers;
        const snapshotRows: string[][] = typeof snapshot.rows === 'string' ? JSON.parse(snapshot.rows) : snapshot.rows;
        
        setPreviewTabs(prev => {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], headers: snapshotHeaders, rows: snapshotRows };
          return updated;
        });
        // 清空该 tab 的编辑状态（快照数据已经是最新的）
        setEditedData(prev => {
          const newMap = new Map(prev);
          for (const key of Array.from(newMap.keys())) {
            if ((key as string).startsWith(`${idx}-`)) newMap.delete(key);
          }
          return newMap;
        });
        setEditedCells(prev => {
          const newSet = new Set(prev);
          for (const key of Array.from(newSet)) {
            if ((key as string).startsWith(`${idx}-`)) newSet.delete(key);
          }
          return newSet;
        });
      } else {
        setCurrentSnapshotInfo(null);
      }
    } catch {
      setCurrentSnapshotInfo(null);
    }
  };

  // 🔥 加载快照历史列表
  const loadSnapshotHistory = async () => {
    const tabData = previewTabs[activePreviewTab];
    if (!tabData) return;
    
    setSnapshotHistoryLoading(true);
    setShowSnapshotHistory(true);
    try {
      const { companyId, reportType } = parseTabInfo(tabData.name);
      const list = await getSnapshots(companyId, globalMonth, reportType);
      setSnapshotHistoryList(list);
    } catch (err) {
      console.error('[加载快照历史] 失败:', err);
      setSnapshotHistoryList([]);
    } finally {
      setSnapshotHistoryLoading(false);
    }
  };

  // 🔥 查看某个快照的编辑日志
  const loadSnapshotEditLogs = async (snapshotId: number) => {
    try {
      const logs = await getEditLogs(snapshotId);
      setSelectedSnapshotLogs(logs);
    } catch (err) {
      console.error('[加载编辑日志] 失败:', err);
      setSelectedSnapshotLogs([]);
    }
  };

  // 🔥 保存当前预览tab的报表快照到数据库
  const handleSaveSnapshot = async (reportType?: 'attendance' | 'late' | 'performance') => {
    const currentTab = activePreviewTabRef.current;
    const currentPreviewTabs = previewTabsRef.current;
    const currentTabData = currentPreviewTabs[currentTab];
    if (!currentTabData) { alert('无法找到当前表格数据'); return; }

    setIsSavingSnapshot(true);
    try {
      // 解析tab名称获取公司信息和报表类型
      const tabName = currentTabData.name;
      const parsed = parseTabInfo(tabName);
      let companyId = parsed.companyId;
      let companyDisplayName = parsed.companyDisplayName;
      let detectedReportType = reportType || parsed.reportType;

      // 构建rows（应用编辑后的值）
      const currentEditedData = editedDataRef.current;
      const finalRows = currentTabData.rows.map((row, rowIdx) =>
        row.map((cell, cellIdx) => {
          const cellKey = `${currentTab}-${rowIdx}-${cellIdx}`;
          return currentEditedData.get(cellKey) ?? cell;
        })
      );

      // 构建编辑日志
      const editLogs: Array<{ rowIndex: number; colIndex: number; employeeName: string; columnName: string; oldValue: string; newValue: string }> = [];
      currentEditedData.forEach((newValue, key) => {
        const parts = key.split('-').map(Number);
        if (parts[0] !== currentTab) return;
        const rowIdx = parts[1];
        const colIdx = parts[2];
        const oldValue = currentTabData.rows[rowIdx]?.[colIdx] ?? '';
        if (oldValue === newValue) return;
        editLogs.push({
          rowIndex: rowIdx,
          colIndex: colIdx,
          employeeName: currentTabData.rows[rowIdx]?.[1] ?? '', // 姓名通常在第2列
          columnName: currentTabData.headers[colIdx] ?? '',
          oldValue,
          newValue,
        });
      });

      // 计算红框数
      let redFrameCount = 0;
      finalRows.forEach(row => {
        row.forEach(cell => {
          if (cell.includes('缺卡') || cell === '旷工') redFrameCount++;
        });
      });

      const result = await saveReportSnapshot({
        companyId,
        companyDisplayName,
        yearMonth: globalMonth,
        reportType: detectedReportType,
        tabName,
        headers: currentTabData.headers,
        rows: finalRows,
        redFrameCount,
        editCount: editLogs.length,
        editLogs,
        savedBy: currentUserInfo?.id?.toString(),
        savedByName: currentUserInfo?.name,
        remarks: snapshotRemarks.trim() || undefined,
      });

      alert(`保存成功（第 ${result.version} 版）`);
      setSnapshotRemarks(''); // 清空备注
      // 🔥 保存成功后：先把编辑后的数据写入 previewTabs，再清空编辑状态
      setPreviewTabs(prev => {
        const updated = [...prev];
        updated[currentTab] = { ...updated[currentTab], rows: finalRows };
        return updated;
      });
      setCurrentSnapshotInfo({
        version: result.version,
        savedAt: new Date().toISOString(),
        savedByName: currentUserInfo?.name || '未知',
      });
      setEditedData(new Map());
      setEditedCells(new Set());
    } catch (err: any) {
      console.error('[保存快照] 失败:', err);
      alert('保存失败: ' + (err.message || '未知错误'));
    } finally {
      setIsSavingSnapshot(false);
    }
  };

  const handleConfirmAttendance = async (targetCompanyName: string, source: 'dashboard' | 'calendar' = 'dashboard') => {
    // 🔥 构建带公司名的员工统计列表，保留每个员工所属的公司名
    const targetStatsWithCompany: Array<{ user: DingTalkUser; stats: EmployeeStats; companyName: string }> = [];
    for (const [companyName, employees] of Object.entries(companyEmployeeStats) as [string, { user: DingTalkUser; stats: EmployeeStats }[]][]) {
      if (!companyName || companyName === 'Unknown' || companyName === 'unknown' || companyName === '未知') continue;
      for (const emp of employees) {
        targetStatsWithCompany.push({ ...emp, companyName });
      }
    }
    if (targetStatsWithCompany.length === 0) { alert('没有数据可用于生成考勤确认单。'); return; }
    const targetStats = targetStatsWithCompany;
    
    // 🔥 清除考勤确认相关的缓存，确保每次点击都重新拉取数据
    
    // 清除考勤表单缓存
    const cacheKey = `ATTENDANCE_SHEETS_${targetCompanyName}_${globalMonth}`;
    await SmartCache.remove(cacheKey);
    await SmartCache.remove('ATTENDANCE_SHEETS_RAW');
    
    // 清除仪表盘缓存，确保数据是最新的
    await DashboardCache.clearDashboardData(targetCompanyName, globalMonth);
    
    // 🔥 加载快照数据，用于覆盖考勤确认单的每日状态（快照优先级最高）
    const resolveConfirmCompanyId = (name: string): string => {
      if (name === 'eyewind' || name.includes('风眼')) return 'eyewind';
      if (name === 'hydodo' || name.includes('海多多')) return 'hydodo';
      if (name.includes('脑力')) return 'naoli';
      if (name.includes('海科')) return 'haike';
      if (name.includes('浅冰')) return 'qianbing';
      return name;
    };
    // 确定需要加载快照的公司列表
    const isAllMode = targetCompanyName === '全部' || targetCompanyName === currentCompany;
    const snapshotCompanyIds: string[] = isAllMode
      ? Object.keys(companyEmployeeStats)
          .filter(k => k && k !== 'Unknown' && k !== 'unknown' && k !== '未知')
          .map(k => resolveConfirmCompanyId(k))
      : [resolveConfirmCompanyId(targetCompanyName)];
    
    // 并行加载所有公司的考勤表快照
    const snapshotOverrideMap: Record<string, Record<number, string>> = {}; // employeeName -> { day -> status }
    await Promise.all(snapshotCompanyIds.map(async (cid) => {
      try {
        const snapshot = await getLatestSnapshot(cid, globalMonth, 'attendance');
        if (snapshot) {
          const headers: string[] = typeof snapshot.headers === 'string' ? JSON.parse(snapshot.headers) : snapshot.headers;
          const rows: string[][] = typeof snapshot.rows === 'string' ? JSON.parse(snapshot.rows) : snapshot.rows;
          if (headers && rows) {
            for (const row of rows) {
              const name = row[1]; // 姓名在第2列
              if (!name) continue;
              if (!snapshotOverrideMap[name]) snapshotOverrideMap[name] = {};
              for (let i = 2; i < row.length && i < headers.length; i++) {
                const dayNum = parseInt(headers[i]);
                if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31 && row[i]) {
                  snapshotOverrideMap[name][dayNum] = row[i];
                }
              }
            }
          }
        }
      } catch { /* 静默 */ }
    }));
    
    const records: EmployeeAttendanceRecord[] = targetStats.map(({ user, stats, companyName: empCompanyName }) => {
        // 构建dailyData字段
        const dailyData: Record<string, string> = {};
        
        // 1. 生成每日考勤状态 (1-31号)
        const [yearStr, monthStr] = globalMonth.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr) - 1; // JavaScript月份从0开始
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        // 🔥 获取自定义日期调整（法定调班规则）
        const confirmCompanyKey = (targetCompanyName === 'hydodo' || targetCompanyName.includes('海多多')) ? 'hydodo' : 'eyewind';
        const confirmRuleEngine = AttendanceRuleManager.getEngine(confirmCompanyKey);
        const confirmRuleConfig = (confirmRuleEngine as any).rules;
        const confirmCustomDays = confirmRuleConfig?.workdaySwapRules?.customDays || [];
        const confirmCustomDayMap = new Map<string, { type: string; reason: string }>();
        confirmCustomDays.forEach((day: any) => {
            confirmCustomDayMap.set(day.date, { type: day.type, reason: day.reason });
        });
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`;
            const fullDateKey = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
            
            // 🔥 检查自定义日期调整（customDays 优先于 holidays）
            const customDay = confirmCustomDayMap.get(fullDateKey);
            
            // 检查是否为法定工作日
            const holidayInfo = holidays[dateKey];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            let isWorkDay = !isWeekend;
            
            // 🔥 优先级：customDays > holidays > 默认周末判断
            if (customDay) {
                isWorkDay = customDay.type === 'workday';
            } else if (holidayInfo) {
                if (holidayInfo.holiday === false) isWorkDay = true; // 补班日
                else if (holidayInfo.holiday === true) isWorkDay = false; // 法定节假日
            }
            
            // 非工作日标记
            if (!isWorkDay) {
                // 🔥 自定义假日显示原因（如"春节假期"、"带薪福利假"）
                if (customDay && customDay.type === 'holiday') {
                    dailyData[String(day)] = customDay.reason || '-';
                } else {
                    dailyData[String(day)] = '-';
                }
                continue;
            }
            
            // 获取该员工当天的考勤状态
            const userAttendance = attendanceMap[user.userid];
            const dayAttendance = userAttendance?.[day];
            
            if (!dayAttendance || !dayAttendance.records || dayAttendance.records.length === 0) {
                // 无打卡记录，标记为【√】
                dailyData[String(day)] = '√';
                continue;
            }
            
            // 检查是否有请假记录
            let hasLeave = false;
            let leaveType = '';
            
            const processedProcInstIds = new Set();
            for (const record of dayAttendance.records) {
                if (record.procInstId && !processedProcInstIds.has(record.procInstId)) {
                    processedProcInstIds.add(record.procInstId);
                    const processDetail = processDataMap[record.procInstId];
                    if (processDetail) {
                        const type = processDetail.formValues?.leaveType || processDetail.bizType;
                        if (type) {
                            hasLeave = true;
                            // 映射请假类型
                            const typeMapping: Record<string, string> = {
                                '年假': '年假',
                                '病假': '病假', 
                                '事假': '事假',
                                '出差': '出差',
                                '外出': '外出',
                                '调休': '调休',
                                '丧假': '丧假',
                                '陪产假': '陪产假',
                                '产假': '产假',
                                '育儿假': '育儿假',
                                '婚假': '婚假'
                            };
                            leaveType = typeMapping[type] || type;
                            break;
                        }
                    }
                }
            }
            
            if (hasLeave) {
                dailyData[String(day)] = leaveType;
            } else {
                // 🔥 额外检查：如果打卡记录中有 APPROVE 类型（审批/请假），不算缺卡
                const hasApproveRecord = dayAttendance.records.some(r => r.sourceType === 'APPROVE' || r.procInstId);
                
                // 🔥 法定补班日：只要不是请假，都显示法定补班
                if (customDay && customDay.type === 'workday') {
                    dailyData[String(day)] = customDay.reason || '法定补班';
                } else {
                    // 检查是否有异常（迟到、缺卡等）
                    const hasAbsenteeism = dayAttendance.records.length === 0 || 
                        dayAttendance.records.every(r => r.timeResult === 'NotSigned');
                    
                    if (hasAbsenteeism) {
                        // 🔥 如果全是 NotSigned 但有审批记录，说明是请假不是旷工
                        if (hasApproveRecord) {
                            dailyData[String(day)] = '√';
                        } else {
                            dailyData[String(day)] = '旷工';
                        }
                    } else {
                        // 🔥 检查缺卡（只有一边打卡）
                        const hasValidOnDuty = dayAttendance.records.some(r => r.checkType === 'OnDuty' && r.timeResult !== 'NotSigned');
                        const hasValidOffDuty = dayAttendance.records.some(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');
                        const isMissing = dayAttendance.status === 'incomplete' || (!hasValidOnDuty && hasValidOffDuty) || (hasValidOnDuty && !hasValidOffDuty);
                        if (isMissing && !hasApproveRecord) {
                            dailyData[String(day)] = '缺卡';
                        } else {
                            // 检查迟到
                            const lateRecord = dayAttendance.records.find(r => r.timeResult === 'Late' || r.timeResult === 'SeriousLate');
                            if (lateRecord) {
                                const lateMinutes = lateRecord.baseCheckTime && lateRecord.userCheckTime
                                    ? Math.round((new Date(lateRecord.userCheckTime).getTime() - new Date(lateRecord.baseCheckTime).getTime()) / 60000)
                                    : 0;
                                dailyData[String(day)] = lateMinutes > 0 ? `迟到${lateMinutes}分钟` : '迟到';
                            } else {
                                dailyData[String(day)] = '√';
                            }
                        }
                    }
                }
            }
        }
        
        // 🔥 快照数据覆盖：如果有已保存的快照数据，以快照为最高优先级
        const employeeSnapshot = snapshotOverrideMap[user.name];
        if (employeeSnapshot) {
            for (const [dayStr, snapshotStatus] of Object.entries(employeeSnapshot)) {
                if (snapshotStatus && snapshotStatus !== '') {
                    dailyData[dayStr] = snapshotStatus;
                }
            }
        }
        
        // 2. 生成汇总统计字段
        dailyData['正常出勤天数'] = String(stats.actualAttendanceDays || 0);
        dailyData['是否全勤'] = stats.isFullAttendance ? '是' : '否';
        dailyData['迟到次数'] = String(stats.late || 0);
        dailyData['迟到分钟数'] = String(stats.lateMinutes || 0);
        dailyData['豁免后迟到分钟数'] = String(stats.exemptedLateMinutes || 0);
        dailyData['缺卡次数'] = String(stats.missing || 0);
        dailyData['旷工天数'] = String((stats as any).absenteeism || 0);
        dailyData['早退分钟数'] = '0'; // 系统暂未统计早退
        
        // 假期统计（天数）
        dailyData['年假天数'] = String(stats.annual || 0);
        dailyData['病假天数'] = String((stats.sick || 0) + (stats.seriousSick || 0));
        dailyData['事假天数'] = String(stats.personal || 0);
        dailyData['调休天数'] = String(stats.compTime || 0);
        dailyData['出差天数'] = String(stats.trip || 0);
        dailyData['丧假天数'] = String(stats.bereavement || 0);
        dailyData['陪产假天数'] = String(stats.paternity || 0);
        dailyData['产假天数'] = String(stats.maternity || 0);
        dailyData['育儿假天数'] = String(stats.parental || 0);
        dailyData['婚假天数'] = String(stats.marriage || 0);
        
        // 假期统计（小时）
        dailyData['年假(时)'] = String(stats.annualHours || 0);
        dailyData['病假(时)'] = String((stats.sickHours || 0) + (stats.seriousSickHours || 0));
        dailyData['事假(时)'] = String(stats.personalHours || 0);
        dailyData['调休(时)'] = String(stats.compTimeHours || 0);
        dailyData['出差(时)'] = String(stats.tripHours || 0);
        dailyData['丧假(时)'] = String(stats.bereavementHours || 0);
        dailyData['陪产假(时)'] = String(stats.paternityHours || 0);
        dailyData['产假(时)'] = String(stats.maternityHours || 0);
        dailyData['育儿假(时)'] = String(stats.parentalHours || 0);
        dailyData['婚假(时)'] = String(stats.marriageHours || 0);
        
        // 加班统计
        dailyData['加班总时长(分)'] = String(stats.overtimeTotalMinutes || 0);
        dailyData['19:30加班次数'] = String(stats.overtime19_5Count || 0);
        dailyData['19:30加班时长(分)'] = String(stats.overtime19_5Minutes || 0);
        dailyData['20:30加班次数'] = String(stats.overtime20_5Count || 0);
        dailyData['20:30加班时长(分)'] = String(stats.overtime20_5Minutes || 0);
        dailyData['22:00加班次数'] = String(stats.overtime22Count || 0);
        dailyData['22:00加班时长(分)'] = String(stats.overtime22Minutes || 0);
        dailyData['24:00加班次数'] = String(stats.overtime24Count || 0);
        dailyData['24:00加班时长(分)'] = String(stats.overtime24Minutes || 0);
        
        // 3. 生成备注信息（假期与异常明细）- 简化版本
        const remarks: string[] = [];
        
        // 遍历每一天，生成详细的假期与异常明细
        for (let day = 1; day <= daysInMonth; day++) {
            const userAttendance = attendanceMap[user.userid];
            const dayAttendance = userAttendance?.[day];
            if (!dayAttendance) continue;

            // 检查请假记录
            const procRecord = dayAttendance.records.find((r: any) => r.procInstId);
            if (procRecord) {
                const p = processDataMap[procRecord.procInstId];
                if (p) {
                    const type = p.formValues?.leaveType || p.bizType;
                    const duration = p.formValues?.duration || 0;
                    const unit = p.formValues?.durationUnit || p.formValues?.unit || '';
                    
                    if (type && duration > 0) {
                        const start = p.formValues?.start || p.formValues?.startTime;
                        const end = p.formValues?.end || p.formValues?.endTime;
                        
                        let remarkEntry = '';
                        
                        // 计算小时数
                        let hours = duration;
                        if (unit.includes('day') || unit.includes('天')) {
                            hours = duration * 8; // 1天 = 8小时
                        }
                        
                        if (start && end) {
                            const startDate = start.split(' ')[0];
                            const endDate = end.split(' ')[0];
                            
                            if (startDate === endDate) {
                                // 同一天内的请假
                                const startTime = start.includes(' ') ? start.split(' ')[1].substring(0, 5) : '09:00';
                                const endTime = end.includes(' ') ? end.split(' ')[1].substring(0, 5) : '18:30';
                                remarkEntry = `${type} ${startDate} ${startTime} 至 ${endTime} 共${hours}小时`;
                            } else {
                                // 跨天请假，显示开始日期到结束日期
                                remarkEntry = `${type} ${startDate} 至 ${endDate} 共${hours}小时`;
                            }
                        } else {
                            // 没有具体时间，判断是否为整天假期
                            if (unit.includes('day') || unit.includes('天')) {
                                if (duration === 1) {
                                    // 1天假期，只显示日期
                                    const dateStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
                                    remarkEntry = `${type} ${dateStr} 共${hours}小时`;
                                } else {
                                    // 多天假期，显示日期范围
                                    const startDate = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
                                    const endDay = day + duration - 1;
                                    const endDate = `${year}-${monthStr}-${String(endDay).padStart(2, '0')}`;
                                    remarkEntry = `${type} ${startDate} 至 ${endDate} 共${hours}小时`;
                                }
                            } else {
                                // 按小时请假
                                const dateStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
                                remarkEntry = `${type} ${dateStr} 共${hours}小时`;
                            }
                        }
                        
                        if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                    }
                }
            }

            // 检查周末加班
            const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`;
            const fullDateKeyForRemarks = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
            const holidayInfo = holidays[dateKey];
            const customDayForRemarks = confirmCustomDayMap.get(fullDateKeyForRemarks);
            const dateObj = new Date(year, month, day);
            const dayOfWeek = dateObj.getDay();
            // 🔥 判断是否为非工作日：考虑 customDays
            const isNonWorkday = customDayForRemarks 
                ? customDayForRemarks.type === 'holiday'
                : ([0, 6].includes(dayOfWeek) && (!holidayInfo || holidayInfo.holiday !== false));
            if (isNonWorkday) {
                const onTime = dayAttendance.records.find((r: any) => r.checkType === 'OnDuty')?.userCheckTime;
                const offTime = dayAttendance.records.find((r: any) => r.checkType === 'OffDuty')?.userCheckTime;
                if (onTime && offTime) {
                    const hours = ((new Date(offTime).getTime() - new Date(onTime).getTime()) / 3600 / 1000).toFixed(1);
                    const remarkEntry = `加班 ${year}-${monthStr}-${String(day).padStart(2, '0')} 共${hours}小时`;
                    if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                }
            }
        }
        
        // 使用换行符连接备注，无异常时显示-
        dailyData['备注'] = remarks.length > 0 ? remarks.join('\n') : '-';
        
        return {
            id: `gen_${user.userid}_${Date.now()}`,
            employeeId: user.job_number || user.userid,
            employeeName: user.name,
            department: user.department || '',
            sendStatus: 'pending', 
            viewStatus: 'pending', 
            confirmStatus: 'pending',
            sent_at: null, 
            confirmed_at: null, 
            viewed_at: null, 
            mainCompany: empCompanyName || targetCompanyName, 
            signatureBase64: null, 
            isSigned: false, 
            dailyData
        };
    });

    onNavigateToConfirmation(records, globalMonth, targetCompanyName, 'dashboard', holidays);
  };

  const renderContent = () => {
    if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2Icon className="w-12 h-12 animate-spin text-sky-500" /><p className="ml-4 text-slate-500 dark:text-slate-400">正在加载 {currentCompany === 'eyewind' ? '风眼' : '海多多'} 员工数据及审批详情...</p></div>;
    if (error) return <div className="p-6 bg-red-100 dark:bg-red-900/50 rounded-lg text-red-700 dark:text-red-300"><p className="font-bold">加载失败</p><p className="text-sm mt-1">{error}</p></div>;

    switch (view.type) {
      case 'employeeList':
        return <EmployeeTableView users={companyUsers} onBack={() => handleSetView({ type: 'dashboard' })} onViewDetails={handleSelectUserForDetail} companyName={view.companyName || '全部'} />;
      case 'allEmployees':
        return <EmployeeTableView users={companyUsers} onBack={() => handleSetView({ type: 'dashboard' })} onViewDetails={handleSelectUserForDetail} companyName="全体员工" />;
      case 'calendar':
        return <AttendanceCalendarView 
            users={companyUsers} 
            attendanceMap={attendanceMap} 
            setAttendanceMap={setAttendanceMapWithHistory} 
            month={globalMonth} 
            onBack={() => handleSetView({ type: 'dashboard' })} 
            onCellClick={(val) => setPunchDetail(val)} 
            processDataMap={processDataMap} 
            setProcessDataMap={setProcessDataMap} 
            holidays={holidays} 
            companyName={view.companyName || '全部'} 
            currentCompany={currentCompany} 
            onConfirm={() => handleConfirmAttendance(view.companyName === '全部' ? currentCompany : view.companyName || '', 'calendar')} 
            onUndo={handleUndo} 
            canUndo={history.length > 0} 
            canEdit={canEditCalendar} 
            onViewDetails={handleSelectUserForDetail} // Pass the handler
            targetEmployee={initialState.targetEmployee} // 传递目标员工信息
            lateExemptionEnabled={lateExemptionEnabled}
            fullAttendanceEnabled={fullAttendanceEnabled}
            performancePenaltyEnabled={performancePenaltyEnabled}
        />;
      case 'dashboard':
      default:
        return (
          <div className="space-y-8">
            {/* 🔥 移除重复的月份选择器，使用菜单栏的全局月份选择器 */}
            {companyNames.length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2 pb-2 px-1">
                  <span>当前公司主体：</span>
                  <span className="font-semibold text-sky-600 dark:text-sky-400">{currentCompany === 'eyewind' ? '风眼' : '海多多'}</span>
                  <span className="text-slate-400 dark:text-slate-500 font-medium">&gt;</span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium">{activeCompany}</span>
                </div>
                <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700 pb-1 mb-4">
                <div className="flex flex-wrap gap-2">
                  {companyNames.map(name => (
                    <button key={name} onClick={() => setActiveCompany(name)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${activeCompany === name ? 'border-sky-500 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{name}</button>
                  ))}
                </div>
              </div>
              </div>
            )}
            {isDataLoading ? (
              <div className="bg-white dark:bg-slate-900/80 rounded-lg shadow-sm flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300 h-[calc(100vh-180px)]">
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 mb-4"></div>
                    <p className="text-slate-600 dark:text-slate-400">正在加载考勤数据...</p>
                  </div>
                </div>
              </div>
            ) : (
              <CompanyDashboardView
                holidays={holidays} month={monthIndex} year={year} companyCounts={companyCounts} allUsers={allUsers} attendanceMap={attendanceMap} processDataMap={processDataMap}
                onViewEmployeeList={(name) => handleSetView({ type: 'employeeList', companyName: name })}
                onViewCalendar={(name) => handleSetView({ type: 'calendar', companyName: name })}
                onDownloadReports={handleDownloadReports}
                onCustomDownload={handleOpenCustomDownload}
                onPushReport={handleOpenPushModal}
                onViewSnapshotLogs={handleViewSnapshotLogs}
                onConfirmAttendance={handleConfirmAttendance}
                companyEmployeeStats={companyEmployeeStats} companyAggregate={companyAggregate} dailyTrend={dailyTrend}
                onSelectEmployeeForAnalysis={setAnalysisEmployee} activeCompany={activeCompany}
                canViewAiAnalysis={canViewAiAnalysis}
                lateExemptionEnabled={lateExemptionEnabled}
                fullAttendanceEnabled={fullAttendanceEnabled}
                performancePenaltyEnabled={performancePenaltyEnabled}
                analyticsSectionOpen={analyticsPanelOpen}
                onAnalyticsSectionToggle={setAnalyticsPanelOpen}
              />
            )}
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">{view.type === 'dashboard' ? '考勤仪表盘' : view.type === 'calendar' ? '考勤日历' : view.type === 'allEmployees' ? '全体员工列表' : '考勤员工列表'}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEditLogsModal(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm transition-all" title="查看编辑日志"><HistoryIcon className="w-4 h-4" /><span className="hidden sm:inline">编辑日志</span></button>
          <button onClick={handleManualRefresh} disabled={isLoading || isRefreshing} className="p-2 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm transition-all" title="刷新数据"><RefreshCwIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} /></button>
        </div>
      </header>
      {renderContent()}
      {detailUserStack.length > 0 && <EmployeeDetailModal user={detailUserStack[detailUserStack.length - 1]} onClose={handleDetailModalClose} allUsers={allUsers} onSelectUser={handleSelectUserForDetail} onGoBack={handleDetailModalBack} stackDepth={detailUserStack.length} />}
      <PunchDetailModal attendanceMap={attendanceMap} detail={punchDetail} month={globalMonth} onClose={() => setPunchDetail(null)} mainCompany={view.companyName} processDataMap={processDataMap} holidays={holidays} />
      <EmployeeAttendanceAnalysisModal employee={analysisEmployee} year={year} month={monthIndex + 1} onClose={() => setAnalysisEmployee(null)} onVerify={() => { 
        if (analysisEmployee) { 
          // 传递员工信息到状态中，用于在日历视图中定位
          const newState = {
            view: { type: 'calendar' as const, companyName: analysisEmployee.user.mainCompany },
            month: globalMonth,
            targetEmployee: { userId: analysisEmployee.user.userid, name: analysisEmployee.user.name }
          };
          onStateChange(newState);
          handleSetView({ type: 'calendar', companyName: analysisEmployee.user.mainCompany }); 
          setAnalysisEmployee(null); 
        } 
      }} />

      {/* 🔥 报表操作日志弹窗 */}
      {showSnapshotLogsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                {snapshotDetail && (
                  <button onClick={() => { setSnapshotDetail(null); setSnapshotDetailEditLogs([]); }} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors mr-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                )}
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {snapshotDetail ? `${snapshotDetail.company_display_name || ''} - v${snapshotDetail.version} 详情` : '报表操作日志'}
                </h3>
              </div>
              <button onClick={() => { setShowSnapshotLogsModal(false); setSnapshotDetail(null); setSnapshotDetailEditLogs([]); }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {snapshotDetail ? (
                // 详情视图
                isLoadingSnapshotDetail ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2Icon className="w-6 h-6 animate-spin text-sky-500" />
                    <span className="ml-2 text-slate-500">加载详情...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: '公司', value: snapshotDetail.company_display_name || snapshotDetail.company_id },
                        { label: '报表类型', value: ({ attendance: '考勤表', late: '迟到统计', performance: '绩效统计' } as any)[snapshotDetail.report_type] || snapshotDetail.report_type },
                        { label: '版本', value: `v${snapshotDetail.version}` },
                        { label: '操作人', value: snapshotDetail.saved_by_name || '-' },
                        { label: '行数', value: snapshotDetail.row_count || '-' },
                        { label: '红框数', value: snapshotDetail.red_frame_count || 0 },
                        { label: '编辑数', value: snapshotDetail.edit_count || 0 },
                        { label: '备注', value: snapshotDetail.remarks || '-' },
                        { label: '时间', value: snapshotDetail.created_at ? new Date(snapshotDetail.created_at).toLocaleString('zh-CN') : '-' },
                      ].map((item, i) => (
                        <div key={i} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                          <div className="text-xs text-slate-500 dark:text-slate-400">{item.label}</div>
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">{String(item.value)}</div>
                        </div>
                      ))}
                    </div>

                    {/* 编辑日志 */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">编辑记录 ({snapshotDetailEditLogs.length})</h4>
                      {snapshotDetailEditLogs.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                          本次保存无编辑修改
                        </div>
                      ) : (
                        <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-100 dark:bg-slate-700">
                                <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-300 text-left whitespace-nowrap">#</th>
                                <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-300 text-left whitespace-nowrap">员工</th>
                                <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-300 text-left whitespace-nowrap">修改列</th>
                                <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-300 text-left whitespace-nowrap">修改前</th>
                                <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-300 text-center whitespace-nowrap"></th>
                                <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-300 text-left whitespace-nowrap">修改后</th>
                                <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-300 text-left whitespace-nowrap">操作人</th>
                                <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-300 text-left whitespace-nowrap">时间</th>
                              </tr>
                            </thead>
                            <tbody>
                              {snapshotDetailEditLogs.map((log: any, i: number) => (
                                <tr key={log.id || i} className="border-t border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                  <td className="py-2 px-3 text-slate-400 text-xs">{i + 1}</td>
                                  <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{log.employee_name || '-'}</td>
                                  <td className="py-2 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{log.column_name || '-'}</td>
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <span className="inline-block px-2 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs line-through">
                                      {log.old_value || '(空)'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-center text-slate-400">→</td>
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <span className="inline-block px-2 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs font-medium">
                                      {log.new_value || '(空)'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{log.edited_by_name || '-'}</td>
                                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{log.edited_at ? new Date(log.edited_at).toLocaleString('zh-CN') : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                // 列表视图
                isLoadingSnapshotLogs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2Icon className="w-6 h-6 animate-spin text-sky-500" />
                    <span className="ml-2 text-slate-500">加载中...</span>
                  </div>
                ) : snapshotLogs.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">暂无操作记录</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">公司</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">报表类型</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">版本</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">行数</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">红框</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">编辑数</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">备注</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">操作人</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400">时间</th>
                        <th className="py-2 px-3 font-medium text-slate-600 dark:text-slate-400"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshotLogs.map((log: any, idx: number) => {
                        const reportTypeMap: Record<string, string> = { attendance: '考勤表', late: '迟到统计', performance: '绩效统计' };
                        return (
                          <tr key={log.id || idx} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={async () => {
                            setIsLoadingSnapshotDetail(true);
                            setSnapshotDetail(log);
                            setSnapshotDetailEditLogs([]);
                            try {
                              const [detail, editLogs] = await Promise.all([
                                getSnapshotById(log.id),
                                getEditLogs(log.id)
                              ]);
                              if (detail) setSnapshotDetail(detail);
                              setSnapshotDetailEditLogs(editLogs || []);
                            } catch { /* keep log as fallback */ }
                            finally { setIsLoadingSnapshotDetail(false); }
                          }}>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{log.company_display_name || log.company_id}</td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                log.report_type === 'attendance' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' :
                                log.report_type === 'late' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                                'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                              }`}>
                                {reportTypeMap[log.report_type] || log.report_type}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">v{log.version}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{log.row_count || '-'}</td>
                            <td className="py-2.5 px-3">{log.red_frame_count > 0 ? <span className="text-red-600 font-medium">{log.red_frame_count}</span> : <span className="text-slate-400">0</span>}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{log.edit_count || 0}</td>
                            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 text-xs max-w-[200px] truncate" title={log.remarks || ''}>{log.remarks || <span className="text-slate-300 dark:text-slate-600">-</span>}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{log.saved_by_name || '-'}</td>
                            <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 text-xs">{log.created_at ? new Date(log.created_at).toLocaleString('zh-CN') : '-'}</td>
                            <td className="py-2.5 px-3">
                              <span className="text-sky-500 hover:text-sky-600 text-xs">查看</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* 推送弹窗 */}
      {showPushModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <SendIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">推送考勤报告</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">通过 Webhook 推送考勤统计到钉钉群</p>
                </div>
              </div>
              <button onClick={() => setShowPushModal(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Webhook 输入 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Webhook 地址
                  <span className="text-slate-400 font-normal ml-2">(支持钉钉机器人)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={pushWebhook}
                    onChange={(e) => handleWebhookChange(e.target.value)}
                    placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                    disabled={!isWebhookEditable}
                    className={`flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all ${
                      webhookError 
                        ? 'border-red-400 dark:border-red-500' 
                        : 'border-slate-200 dark:border-slate-700'
                    } ${!isWebhookEditable ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                  <button
                    onClick={() => {
                      if (!isWebhookEditable) {
                        // 开启编辑模式，显示确认对话框
                        setShowWebhookConfirmModal(true);
                      } else {
                        // 关闭编辑模式
                        setIsWebhookEditable(false);
                      }
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      isWebhookEditable
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {isWebhookEditable ? '锁定' : '编辑'}
                  </button>
                </div>
                {webhookError && (
                  <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {webhookError}
                  </p>
                )}
                {!isWebhookEditable && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Webhook 地址已锁定，点击"编辑"按钮可修改
                  </p>
                )}
              </div>

              {/* 艾特人选择器 */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  @提醒人员
                  <span className="text-slate-400 font-normal ml-2">(可多选，推送时会@这些人)</span>
                </label>
                
                {/* 已选择的人员标签 */}
                <div className="flex flex-wrap gap-2 min-h-[32px]">
                  {selectedAtUsers.map((user, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs rounded-full"
                    >
                      @{user.name}
                      <button
                        onClick={() => {
                          const newUsers = selectedAtUsers.filter((_, i) => i !== index);
                          setSelectedAtUsers(newUsers);
                          localStorage.setItem('attendance_push_at_users', JSON.stringify(newUsers));
                          updatePushContentAtUsers(newUsers);
                        }}
                        className="p-0.5 hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded-full transition-colors"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* 搜索输入框 */}
                <div className="relative">
                  <input
                    type="text"
                    value={atUserInput}
                    onChange={(e) => {
                      setAtUserInput(e.target.value);
                      setShowAtUserDropdown(true);
                    }}
                    onFocus={() => setShowAtUserDropdown(true)}
                    placeholder="搜索并添加要@的人员..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  />
                  
                  {/* 下拉选择列表 */}
                  {showAtUserDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {availableAtUsers
                        .filter(user => 
                          !selectedAtUsers.some(s => s.name === user.name) &&
                          (user.name.toLowerCase().includes(atUserInput.toLowerCase()) || 
                           (user.mobile && user.mobile.includes(atUserInput)) ||
                           (user.userid && user.userid.toLowerCase().includes(atUserInput.toLowerCase())))
                        )
                        .slice(0, 20)
                        .map((user, index) => (
                          <button
                            key={index}
                            onClick={() => {
                              const newUsers = [...selectedAtUsers, user];
                              setSelectedAtUsers(newUsers);
                              localStorage.setItem('attendance_push_at_users', JSON.stringify(newUsers));
                              setAtUserInput('');
                              setShowAtUserDropdown(false);
                              updatePushContentAtUsers(newUsers);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-3"
                          >
                            {/* 头像 */}
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs text-slate-500 dark:text-slate-400">{user.name.charAt(0)}</span>
                              </div>
                            )}
                            {/* 信息 */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-700 dark:text-slate-300 font-medium">{user.name}</span>
                                <span className="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded">{user.company}</span>
                              </div>
                              <div className="text-xs text-slate-400 truncate">
                                ID: {user.userid}
                                {user.mobile && user.mobile.length >= 11 && ` · ${user.mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}`}
                              </div>
                            </div>
                          </button>
                        ))}
                      {availableAtUsers.filter(user => 
                        !selectedAtUsers.some(s => s.name === user.name) &&
                        (user.name.toLowerCase().includes(atUserInput.toLowerCase()) || 
                         (user.mobile && user.mobile.includes(atUserInput)) ||
                         (user.userid && user.userid.toLowerCase().includes(atUserInput.toLowerCase())))
                      ).length === 0 && (
                        <div className="px-3 py-4 text-sm text-slate-400 text-center">
                          {atUserInput ? '未找到匹配的人员' : (allCompanyUsers.length === 0 ? '正在加载员工列表...' : '暂无可选人员')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* 点击外部关闭下拉框 */}
                {showAtUserDropdown && (
                  <div 
                    className="fixed inset-0 z-0" 
                    onClick={() => setShowAtUserDropdown(false)}
                  />
                )}
              </div>

              {/* 富文本编辑器 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    推送内容
                  </label>
                  <button
                    onClick={() => setPushContent(generateDefaultPushContent())}
                    className="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    重新生成
                  </button>
                </div>
                
                {/* 工具栏 */}
                <div className="flex items-center gap-1 p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-t-lg border-b-0">
                  <button
                    type="button"
                    onClick={() => document.execCommand('bold')}
                    className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    title="加粗"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => document.execCommand('italic')}
                    className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    title="斜体"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 4h4m-2 0v16m-4 0h8" /></svg>
                  </button>
                  <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />
                  <button
                    type="button"
                    onClick={() => document.execCommand('insertUnorderedList')}
                    className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    title="无序列表"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => document.execCommand('insertOrderedList')}
                    className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                    title="有序列表"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" /></svg>
                  </button>
                </div>
                
                {/* 编辑区域 */}
                <textarea
                  value={pushContent}
                  onChange={(e) => setPushContent(e.target.value)}
                  className="w-full min-h-[300px] max-h-[400px] resize-none px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-b-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  style={{ lineHeight: '1.6' }}
                  placeholder="请输入推送内容..."
                />
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  提示：编辑内容将以纯文本格式发送到钉钉群
                </p>
              </div>

              {/* 推送结果提示 */}
              {pushResult && (
                <div className={`flex items-center gap-2 p-3 rounded-lg ${pushResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
                  {pushResult.success ? (
                    <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertTriangleIcon className="w-5 h-5 flex-shrink-0" />
                  )}
                  <span className="text-sm">{pushResult.message}</span>
                </div>
              )}
            </div>

            {/* 弹窗底部 */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <button
                onClick={() => setShowPushModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handlePush}
                disabled={isPushing || !pushWebhook.trim() || !pushContent.trim() || !!webhookError}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
              >
                {isPushing ? (
                  <>
                    <Loader2Icon className="w-4 h-4 animate-spin" />
                    <span>推送中...</span>
                  </>
                ) : (
                  <>
                    <SendIcon className="w-4 h-4" />
                    <span>发送推送</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook 编辑确认对话框 */}
      {showWebhookConfirmModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700">
            {/* 头部 */}
            <div className="flex items-start gap-4 p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                  修改 Webhook 地址
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  请确认以下信息后再继续操作
                </p>
              </div>
            </div>

            {/* 内容 */}
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                    <p className="font-semibold mb-2">重要提示</p>
                    <ul className="space-y-1.5 list-disc list-inside">
                      <li>请确认 Webhook 地址指向<span className="font-bold">财务群</span>的机器人</li>
                      <li>配置错误可能导致考勤报告推送到其他群组</li>
                      <li>建议先在测试群验证后再修改正式地址</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">当前 Webhook 地址</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-mono break-all">
                  {pushWebhook}
                </p>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 rounded-b-xl">
              <button
                onClick={() => setShowWebhookConfirmModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setIsWebhookEditable(true);
                  setShowWebhookConfirmModal(false);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-sm"
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自定义下载弹窗 */}
      {showCustomDownloadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <SlidersHorizontalIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">自定义报表下载</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">选择需要导出的字段</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCustomDownloadModal(false);
                  setColumnSearchQuery(''); // 重置搜索框
                }}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 弹窗内容 - 左右布局 */}
            <div className="flex-1 overflow-hidden flex gap-4 p-4">
              {/* 左侧：已选字段列表 - 支持拖拽排序 */}
              <div className="w-2/5 flex flex-col border-r border-slate-200 dark:border-slate-700 pr-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    已选字段 ({selectedColumns.length})
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  拖拽调整顺序，点击 × 移除
                </p>
                
                <div className="flex-1 overflow-y-auto space-y-2">
                  {selectedColumns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
                      <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-sm">请从右侧选择字段</p>
                    </div>
                  ) : (
                    selectedColumns.map((colKey, index) => {
                      const col = availableColumns.find(c => c.key === colKey);
                      if (!col) return null;
                      
                      return (
                        <div
                          key={colKey}
                          draggable={!col.required}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', index.toString());
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                            const toIndex = index;
                            
                            if (fromIndex !== toIndex) {
                              const newColumns = [...selectedColumns];
                              const [movedItem] = newColumns.splice(fromIndex, 1);
                              newColumns.splice(toIndex, 0, movedItem);
                              setSelectedColumns(newColumns);
                              localStorage.setItem('attendance_custom_columns', JSON.stringify(newColumns));
                            }
                          }}
                          className={`flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 ${
                            col.required ? 'opacity-75' : 'cursor-move hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md'
                          } transition-all group`}
                        >
                          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                          <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-semibold">
                            {index + 1}
                          </span>
                          <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">
                            {col.label}
                            {col.required && <span className="text-xs text-slate-400 ml-1">(必选)</span>}
                          </span>
                          {!col.required && (
                            <button
                              onClick={() => toggleColumn(colKey)}
                              className="flex-shrink-0 p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100"
                              title="移除"
                            >
                              <XIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 右侧：可选字段 */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    可选字段
                  </h4>
                  <button
                    onClick={toggleAllColumns}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                  >
                    {selectedColumns.length === availableColumns.length ? '取消全选' : '全选'}
                  </button>
                </div>
                
                {/* 搜索框 */}
                <div className="mb-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={columnSearchQuery}
                      onChange={(e) => setColumnSearchQuery(e.target.value)}
                      placeholder="搜索字段..."
                      className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                    <svg 
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {columnSearchQuery && (
                      <button
                        onClick={() => setColumnSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  {['基本信息', '出勤统计', '迟到相关', '缺卡相关', '请假统计', '加班统计', '其他'].map(groupName => {
                    const groupColumns = availableColumns.filter(col => {
                      // 先按分组过滤
                      if (col.group !== groupName) return false;
                      // 再按搜索关键词过滤
                      if (columnSearchQuery) {
                        const query = columnSearchQuery.toLowerCase();
                        return col.label.toLowerCase().includes(query) || col.key.toLowerCase().includes(query);
                      }
                      return true;
                    });
                    if (groupColumns.length === 0) return null;
                    
                    return (
                      <div key={groupName} className="mb-4">
                        <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 sticky top-0 bg-white dark:bg-slate-800 py-1">
                          {groupName}
                        </h5>
                        <div className="grid grid-cols-2 gap-2">
                          {groupColumns.map(col => (
                            <label
                              key={col.key}
                              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                                selectedColumns.includes(col.key)
                                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                              } ${col.required ? 'opacity-75' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedColumns.includes(col.key)}
                                onChange={() => toggleColumn(col.key)}
                                disabled={col.required}
                                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-50 flex-shrink-0"
                              />
                              <span className={`text-xs flex-1 ${
                                selectedColumns.includes(col.key)
                                  ? 'text-blue-700 dark:text-blue-300 font-medium'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}>
                                {col.label}
                                {col.required && <span className="text-slate-400 ml-1">(必选)</span>}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* 日期列选项 */}
                  <div className="mb-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <h5 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 sticky top-0 bg-white dark:bg-slate-800 py-1">
                      日期列
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      选择是否添加每日详细数据列（1号-31号）
                    </p>
                    <div className="space-y-2">
                      <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        dateColumnMode === 'none'
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}>
                        <input
                          type="radio"
                          name="dateColumnMode"
                          checked={dateColumnMode === 'none'}
                          onChange={() => {
                            setDateColumnMode('none');
                            localStorage.setItem('attendance_date_column_mode', 'none');
                          }}
                          className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1">
                          <span className={`text-sm font-medium ${
                            dateColumnMode === 'none'
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}>
                            无
                          </span>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            不添加日期列
                          </p>
                        </div>
                      </label>
                      
                      <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        dateColumnMode === 'attendance'
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}>
                        <input
                          type="radio"
                          name="dateColumnMode"
                          checked={dateColumnMode === 'attendance'}
                          onChange={() => {
                            setDateColumnMode('attendance');
                            localStorage.setItem('attendance_date_column_mode', 'attendance');
                          }}
                          className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1">
                          <span className={`text-sm font-medium ${
                            dateColumnMode === 'attendance'
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}>
                            考勤
                          </span>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            添加每日考勤状态列（✓=正常，带薪福利假，年假/事假等）
                          </p>
                        </div>
                      </label>
                      
                      <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        dateColumnMode === 'late'
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}>
                        <input
                          type="radio"
                          name="dateColumnMode"
                          checked={dateColumnMode === 'late'}
                          onChange={() => {
                            setDateColumnMode('late');
                            localStorage.setItem('attendance_date_column_mode', 'late');
                          }}
                          className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 flex-shrink-0"
                        />
                        <div className="flex-1">
                          <span className={`text-sm font-medium ${
                            dateColumnMode === 'late'
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}>
                            迟到
                          </span>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            添加每日迟到分钟数列（如：迟到15分钟）
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 弹窗底部 */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <button
                onClick={() => {
                  setShowCustomDownloadModal(false);
                  setColumnSearchQuery(''); // 重置搜索框
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleCustomDownload(true)}
                disabled={selectedColumns.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>预览</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑日志弹窗 */}
      {showEditLogsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
            <AttendanceEditLogs 
              companyId={currentCompany === 'eyewind' ? 'eyewind' : 'hydodo'} 
              onClose={() => setShowEditLogsModal(false)}
              isModal={true}
            />
          </div>
        </div>
      )}

      {/* CSV预览弹窗 */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[90vh] flex flex-col">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                  <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">CSV报表预览（可编辑）</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">预览全部数据，支持左右滑动查看完整内容，点击单元格可编辑</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {currentSnapshotInfo && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                    v{currentSnapshotInfo.version} · {currentSnapshotInfo.savedByName} · {new Date(currentSnapshotInfo.savedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button
                  onClick={loadSnapshotHistory}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                >
                  <HistoryIcon className="w-4 h-4" />
                  历史版本
                </button>
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setEditedData(new Map());
                    setEditedCells(new Set());
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tab切换 */}
            {previewTabs.length > 1 && (
              <div className="flex items-center gap-2 px-4 pt-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                {previewTabs.map((tab, index) => (
                  <button
                    key={index}
                    role="tab"
                    aria-selected={activePreviewTab === index}
                    onClick={() => {
                      setActivePreviewTab(index);
                      // 🔥 切换tab时加载最新快照信息
                      loadCurrentTabSnapshotInfo(index);
                      // 🔥 切换tab时更新文件名 - 使用tab名称解析公司和报表类型
                      const tabName = tab.name;
                      // tab名称格式可能是 "考勤表" 或 "深圳市XX公司-考勤表"
                      const dashIdx = tabName.lastIndexOf('-');
                      if (dashIdx > 0) {
                        // 全部模式：tab名称包含公司名
                        const tabCompany = tabName.substring(0, dashIdx);
                        const tabType = tabName.substring(dashIdx + 1);
                        setPreviewFileName(`${tabCompany}-${globalMonth}-${tabType}.csv`);
                      } else {
                        // 单公司模式
                        const companyPrefix = currentCompany === 'eyewind' ? '深圳市风眼科技有限公司' : currentCompany === 'hydodo' ? '深圳市海多多科技有限公司' : currentCompany;
                        setPreviewFileName(`${companyPrefix}-${globalMonth}-${tabName}.csv`);
                      }
                    }}
                    className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all ${
                      activePreviewTab === index
                        ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 border-b-2 border-sky-600 dark:border-sky-400'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            )}

            {/* 文件名编辑 */}
            <div className="px-4 pt-4 pb-2 flex-shrink-0">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                文件名
              </label>
              <input
                type="text"
                value={previewFileName}
                onChange={(e) => setPreviewFileName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all"
              />
            </div>

            {/* 表格预览 - 支持横向和纵向滚动及编辑 */}
            <div className="flex-1 p-4 min-h-0 overflow-hidden flex flex-col">
              <div className="flex-1 border border-slate-200 dark:border-slate-700 rounded-lg overflow-auto">
                {previewTabs[activePreviewTab] && (() => {
                  // 🔥 计算周末日期（用于高亮显示）
                  const [y, m] = globalMonth.split('-').map(Number);
                  const weekendDays = new Set<number>();
                  const daysInMonth = new Date(y, m, 0).getDate();
                  
                  for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(y, m - 1, day);
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                      weekendDays.add(day);
                    }
                  }

                  // 🔥 计算每个日期列需要的最小宽度（根据内容动态调整）
                  const dateColWidths = new Map<number, number>();
                  const currentTab = previewTabs[activePreviewTab];
                  currentTab.headers.forEach((header, idx) => {
                    const isDateColumn = /^\d+$/.test(header) && parseInt(header) >= 1 && parseInt(header) <= 31;
                    if (isDateColumn) {
                      let maxLen = 1; // 默认1个字符（如 √）
                      for (const row of currentTab.rows) {
                        const cellVal = row[idx] || '';
                        if (cellVal.length > maxLen) maxLen = cellVal.length;
                      }
                      // 每个中文字符约14px，加上padding
                      dateColWidths.set(idx, maxLen <= 1 ? 50 : Math.max(50, maxLen * 14 + 16));
                    }
                  });
                  
                  return (
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                      <tr>
                        {previewTabs[activePreviewTab].headers.map((header, idx) => {
                          // 判断是否为日期列（1-31的数字）
                          const isDateColumn = /^\d+$/.test(header) && parseInt(header) >= 1 && parseInt(header) <= 31;
                          const isWeekend = isDateColumn && weekendDays.has(parseInt(header));
                          
                          return (
                            <th
                              key={idx}
                              className={`px-3 py-2 text-center font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap border-r border-slate-200 dark:border-slate-700 last:border-r-0 ${
                                isWeekend ? 'bg-slate-100 dark:bg-slate-700/50' : ''
                              }`}
                              style={
                                header.includes('备注')
                                  ? { minWidth: '300px', maxWidth: '500px' }
                                  : idx === 0 || idx === 1 || header === '姓名' || header === '序号'
                                  ? { minWidth: '80px', maxWidth: '120px' }
                                  : isDateColumn
                                  ? { minWidth: `${dateColWidths.get(idx) || 50}px`, width: `${dateColWidths.get(idx) || 50}px` }
                                  : {}
                              }
                            >
                              {header}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                      {previewTabs[activePreviewTab].rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          {row.map((cell, cellIdx) => {
                            // 检查是否是备注列（通常在第7或第8列，包含"备注"关键字）
                            const isRemarkColumn = previewTabs[activePreviewTab].headers[cellIdx]?.includes('备注');
                            // 判断是否为日期列（1-31的数字）
                            const header = previewTabs[activePreviewTab].headers[cellIdx];
                            const isDateColumn = /^\d+$/.test(header) && parseInt(header) >= 1 && parseInt(header) <= 31;
                            const isWeekend = isDateColumn && weekendDays.has(parseInt(header));
                            
                            const cellKey = `${activePreviewTab}-${rowIdx}-${cellIdx}`;
                            const isEdited = editedCells.has(cellKey);
                            const displayValue = editedData.get(cellKey) ?? cell;
                            const isMissingCell = displayValue.includes('缺卡') || displayValue === '旷工';
                            
                            return (
                              <td
                                key={cellIdx}
                                className={`px-1 py-1 border-r border-slate-100 dark:border-slate-700 last:border-r-0 ${
                                  isMissingCell ? 'ring-2 ring-inset ring-red-400 bg-red-50 dark:bg-red-900/20' : isEdited ? 'bg-blue-100 dark:bg-blue-900/40' : isWeekend ? 'bg-slate-100/70 dark:bg-slate-700/30' : ''
                                }`}
                                style={
                                  isRemarkColumn 
                                    ? { maxWidth: '500px', minWidth: '300px', verticalAlign: 'top' }
                                    : cellIdx === 0 || cellIdx === 1 // 序号和姓名列
                                    ? { minWidth: '80px', maxWidth: '120px' }
                                    : isDateColumn
                                    ? { minWidth: `${dateColWidths.get(cellIdx) || 50}px`, width: `${dateColWidths.get(cellIdx) || 50}px`, textAlign: 'center' as const, whiteSpace: 'nowrap' as const }
                                    : {}
                                }
                              >
                                {isRemarkColumn ? (
                                  <textarea
                                    value={displayValue}
                                    onChange={(e) => {
                                      const newValue = e.target.value;
                                      const newEditedData = new Map(editedData);
                                      const newEditedCells = new Set(editedCells);
                                      
                                      if (newValue !== cell) {
                                        newEditedData.set(cellKey, newValue);
                                        newEditedCells.add(cellKey);
                                      } else {
                                        newEditedData.delete(cellKey);
                                        newEditedCells.delete(cellKey);
                                      }
                                      
                                      setEditedData(newEditedData);
                                      setEditedCells(newEditedCells);
                                    }}
                                    className="w-full px-2 py-1 text-slate-600 dark:text-slate-400 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded resize-none"
                                    style={{ minHeight: '60px', lineHeight: '1.5' }}
                                    rows={Math.max(3, displayValue.split('\n').length)}
                                    title={displayValue}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={displayValue}
                                    onChange={(e) => {
                                      const newValue = e.target.value;
                                      const newEditedData = new Map(editedData);
                                      const newEditedCells = new Set(editedCells);
                                      
                                      if (newValue !== cell) {
                                        newEditedData.set(cellKey, newValue);
                                        newEditedCells.add(cellKey);
                                      } else {
                                        newEditedData.delete(cellKey);
                                        newEditedCells.delete(cellKey);
                                      }
                                      
                                      setEditedData(newEditedData);
                                      setEditedCells(newEditedCells);
                                    }}
                                    className={`w-full px-2 py-1 text-slate-600 dark:text-slate-400 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded whitespace-nowrap ${
                                      isDateColumn ? 'text-center' : ''
                                    }`}
                                    title={displayValue}
                                  />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  );
                })()}
              </div>
              {(() => {
                // 🔥 统计当前表格的红框数据（缺卡/旷工）
                const currentTabData = previewTabs[activePreviewTab];
                let redFrameCount = 0;
                if (currentTabData) {
                  currentTabData.rows.forEach((row, rowIdx) => {
                    row.forEach((cell, cellIdx) => {
                      const cellKey = `${activePreviewTab}-${rowIdx}-${cellIdx}`;
                      const displayValue = editedData.get(cellKey) ?? cell;
                      if (displayValue.includes('缺卡') || displayValue === '旷工') {
                        redFrameCount++;
                      }
                    });
                  });
                }
                
                // 统计当前表格的编辑数量
                const currentTabEdits = Array.from(editedCells).filter(key => {
                  const [tabIndex] = (key as string).split('-').map(Number);
                  return tabIndex === activePreviewTab;
                }).length;
                
                const parts: string[] = [];
                if (redFrameCount > 0) {
                  parts.push(`${redFrameCount} 个异常数据（缺卡/旷工，红框显示）`);
                }
                if (currentTabEdits > 0) {
                  parts.push(`已编辑 ${currentTabEdits} 个单元格（蓝色高亮显示）`);
                  if (previewTabs.length > 1) {
                    parts.push(`总计编辑 ${editedCells.size} 个单元格`);
                  }
                }
                
                if (parts.length === 0) return null;
                
                return (
                  <p className="text-xs mt-2 text-center">
                    {redFrameCount > 0 && <span className="text-red-500 dark:text-red-400">{parts[0]}</span>}
                    {redFrameCount > 0 && currentTabEdits > 0 && <span className="text-slate-400"> · </span>}
                    {currentTabEdits > 0 && <span className="text-blue-600 dark:text-blue-400">
                      【{currentTabData?.name || '未知'}】{parts[redFrameCount > 0 ? 1 : 0]}
                      {previewTabs.length > 1 && ` · ${parts[parts.length - 1]}`}
                    </span>}
                  </p>
                );
              })()}
            </div>

            {/* 弹窗底部 */}
            <div className="flex flex-col gap-2 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex-shrink-0">
              {/* 编辑备注输入 */}
              {editedCells.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">📝 编辑备注：</span>
                  <input
                    type="text"
                    value={snapshotRemarks}
                    onChange={e => setSnapshotRemarks(e.target.value)}
                    placeholder="简要说明本次修改内容，如：修正了所有缺卡记录、调整了张三的迟到时长等"
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setEditedData(new Map());
                  setEditedCells(new Set());
                }}
                disabled={editedCells.size === 0}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                重置编辑
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowPreviewModal(false);
                    setEditedData(new Map());
                    setEditedCells(new Set());
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => handleSaveSnapshot()}
                  disabled={isSavingSnapshot || editedCells.size === 0}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition-all ${
                    editedCells.size === 0
                      ? 'bg-slate-300 dark:bg-slate-600 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                      : 'text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  {isSavingSnapshot ? <Loader2Icon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                  <span>{isSavingSnapshot ? '保存中...' : '保存'}</span>
                </button>
                <button
                  onClick={() => {
                    if (previewDownloadCallback) {
                      previewDownloadCallback();
                      setShowPreviewModal(false);
                      setEditedData(new Map());
                      setEditedCells(new Set());
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm transition-all"
                >
                  <DownloadIcon className="w-4 h-4" />
                  <span>下载</span>
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 快照历史弹窗 */}
      {showSnapshotHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                  <HistoryIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">快照历史版本</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">共 {snapshotHistoryList.length} 个版本</p>
                </div>
              </div>
              <button onClick={() => { setShowSnapshotHistory(false); setSelectedSnapshotLogs(null); setSelectedSnapshotDetail(null); }} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {snapshotHistoryLoading ? (
                <div className="flex items-center justify-center h-40"><Loader2Icon className="w-6 h-6 animate-spin text-slate-400" /></div>
              ) : snapshotHistoryList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                  <HistoryIcon className="w-10 h-10 mb-2 opacity-40" />
                  <span>暂无保存记录</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {snapshotHistoryList.map((snap: any) => (
                    <div key={snap.id} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-0.5 text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">v{snap.version}</span>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{snap.tab_name}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {snap.report_type === 'attendance' ? '考勤表' : snap.report_type === 'late' ? '迟到统计表' : '考勤绩效统计'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {snap.edit_count > 0 && (
                            <button
                              onClick={() => loadSnapshotEditLogs(snap.id)}
                              className="px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                            >
                              查看编辑日志 ({snap.edit_count})
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              try {
                                const detail = await getSnapshotById(snap.id);
                                setSelectedSnapshotDetail(detail);
                              } catch { alert('加载失败'); }
                            }}
                            className="px-2 py-1 text-xs font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 rounded hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                          >
                            查看数据
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{snap.row_count} 行 × {snap.column_count} 列</span>
                        {snap.red_frame_count > 0 && <span className="text-red-500">红框: {snap.red_frame_count}</span>}
                        {snap.edit_count > 0 && <span className="text-blue-500">编辑: {snap.edit_count}</span>}
                        <span>保存人: {snap.saved_by_name || '未知'}</span>
                        <span>{new Date(snap.created_at).toLocaleString('zh-CN')}</span>
                      </div>
                      {snap.remarks && (
                        <div className="mt-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1 border border-amber-200 dark:border-amber-800">
                          💬 备注: {snap.remarks}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 编辑日志详情弹窗 */}
      {selectedSnapshotLogs !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">编辑日志详情</h3>
              <button onClick={() => setSelectedSnapshotLogs(null)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {selectedSnapshotLogs.length === 0 ? (
                <div className="text-center text-slate-500 py-8">暂无编辑日志</div>
              ) : (
                <table className="w-full text-sm border-collapse table-fixed">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700 w-16">员工</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700 w-14">列名</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700">修改前</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700">修改后</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700 w-16">操作人</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700 w-28">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSnapshotLogs.map((log: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-2 text-slate-900 dark:text-white whitespace-nowrap">{log.employee_name || '-'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{log.column_name || '-'}</td>
                        <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded text-xs whitespace-nowrap">{log.old_value || '(空)'}</span></td>
                        <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded text-xs whitespace-nowrap">{log.new_value || '(空)'}</span></td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.edited_by_name || '-'}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">{log.edited_at ? new Date(log.edited_at).toLocaleString('zh-CN') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 快照数据详情弹窗 */}
      {selectedSnapshotDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-[90vw] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {selectedSnapshotDetail.tab_name} - v{selectedSnapshotDetail.version}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedSnapshotDetail.row_count} 行 × {selectedSnapshotDetail.column_count} 列 · {new Date(selectedSnapshotDetail.created_at).toLocaleString('zh-CN')}
                </p>
              </div>
              <button onClick={() => setSelectedSnapshotDetail(null)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                  <tr>
                    {(typeof selectedSnapshotDetail.headers === 'string' ? JSON.parse(selectedSnapshotDetail.headers) : selectedSnapshotDetail.headers).map((h: string, i: number) => (
                      <th key={i} className="px-2 py-1.5 text-xs font-medium text-slate-500 border border-slate-200 dark:border-slate-700 whitespace-nowrap text-center">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(typeof selectedSnapshotDetail.rows === 'string' ? JSON.parse(selectedSnapshotDetail.rows) : selectedSnapshotDetail.rows).map((row: string[], ri: number) => (
                    <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                      {row.map((cell: string, ci: number) => (
                        <td key={ci} className={`px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 whitespace-nowrap text-center ${
                          cell.includes('缺卡') || cell === '旷工' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 ring-1 ring-red-300 dark:ring-red-700' : 'text-slate-700 dark:text-slate-300'
                        }`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
