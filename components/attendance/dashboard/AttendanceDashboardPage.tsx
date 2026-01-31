
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { DingTalkUser, CompanyCounts, DailyAttendanceStatus, HolidayMap, AttendanceMap, EmployeeAttendanceRecord, EmployeeStats, User } from '../../../database/schema.ts';
import { Loader2Icon, RefreshCwIcon, DownloadIcon, UsersIcon, CalendarIcon, SendIcon, XIcon, CheckCircleIcon, AlertTriangleIcon, SlidersHorizontalIcon, HistoryIcon } from '../../Icons.tsx';
import { useAttendanceStats } from './useAttendanceStats.ts';
import { useAttendanceRuleSync } from '../../../hooks/useAttendanceRuleSync.ts';
import { AttendanceRuleManager } from '../AttendanceRuleEngine.ts';
import { initRuleConfigCache, refreshRuleConfigCache } from '../../../hooks/useAttendanceRuleConfig.ts';
import { CompanyDashboardView } from './AttendanceDashboard.tsx';
import { AttendanceCalendarView } from './AttendanceCalendar.tsx';
import { EmployeeTableView } from './AttendanceEmployeeList.tsx';
import { EmployeeDetailModal, PunchDetailModal, EmployeeAttendanceAnalysisModal } from './AttendanceModals.tsx';
import { AttendanceEditLogs } from './AttendanceEditLogs.tsx';
import { fetchCompanyData, fetchProcessDetail, SmartCache, getLateMinutes, calculateDailyLeaveDuration, checkTimeInLeaveRange } from '../utils.ts';
import { sendDingTalkMessage, validateDingTalkWebhook, type AtUser } from '../../../services/pushApiService.ts';
import type { AttendanceDashboardState } from '../../../App.tsx';
import { db } from '../../../database/mockDb.ts';
import JSZip from 'jszip';
import saveAs from 'file-saver';

interface AttendanceDashboardPageProps {
  onNavigateToConfirmation: (data: EmployeeAttendanceRecord[], month: string, mainCompany: string) => void;
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
  const [showPushModal, setShowPushModal] = useState(false);
  const [pushWebhook, setPushWebhook] = useState(() => {
    return localStorage.getItem('attendance_push_webhook') || '';
  });
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
  
  // 编辑日志弹窗状态
  const [showEditLogsModal, setShowEditLogsModal] = useState(false);
  
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
    
    // 迟到相关
    { key: 'late', label: '迟到次数', group: '迟到相关' },
    { key: 'lateMinutes', label: '迟到总分钟数', group: '迟到相关' },
    { key: 'exemptedLate', label: '豁免后迟到次数', group: '迟到相关' },
    { key: 'exemptedLateMinutes', label: '豁免后迟到分钟数', group: '迟到相关' },
    { key: 'performancePenalty', label: '绩效扣款金额', group: '迟到相关' },
    
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
    console.log('AttendanceRuleManager AttendanceRuleManager AttendanceRuleManager', AttendanceRuleManager.getEngine(companyKey).getRules().lateExemptionEnabled, newLateExemptionEnabled, companyKey)
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
  
  // 🔥 统一的数据加载函数，避免重复调用
  const loadAllData = useCallback(async (forceRefresh = false, isSilent = false) => {
    // 🔥 防止重复调用，但允许规则配置加载完成后的首次调用
    // if (!isSilent) {
    //   console.log('[AttendanceDashboardPage] 数据正在加载中，跳过重复调用');
    //   return;
    // }
    
    // 🔥 如果是首次加载（规则配置完成后），允许执行即使isLoading为true
    // if (isLoading) {
    //   console.log('[AttendanceDashboardPage] 规则配置未完成，等待规则配置加载');
    //   return;
    // }
    
    console.log(`[AttendanceDashboardPage] 🚀 开始加载数据: 公司=${currentCompany}, 月份=${globalMonth}, 强制刷新=${forceRefresh}`);
    
    setLoadingDebounce(true);
    
    const fromDate = `${globalMonth}-01`;
    const [y, m] = globalMonth.split('-').map(Number);
    const lastDayDate = new Date(y, m, 0);
    const lastDay = lastDayDate.getDate();
    const toDate = `${globalMonth}-${String(lastDay).padStart(2, '0')}`;
    const cacheKey = `ATTENDANCE_DATA_${currentCompany}_${fromDate}_${toDate}`;

    let cachedData: { employees: DingTalkUser[]; companyCounts: CompanyCounts } | null = null;
    if (!forceRefresh) {
      cachedData = await SmartCache.get<{ employees: DingTalkUser[]; companyCounts: CompanyCounts }>(cacheKey);
    }

    if (!isSilent && !cachedData) setIsLoading(true);
    if (forceRefresh) setIsRefreshing(true);
    setError(null);

    if (forceRefresh) await SmartCache.remove(cacheKey);

    try {
      let data = cachedData;
      if (!data) {
        console.log(`[AttendanceDashboardPage] 从API加载数据: ${currentCompany}, ${fromDate} - ${toDate}`);
        data = await fetchCompanyData(currentCompany, fromDate, toDate, y, m);
      } else {
        console.log(`[AttendanceDashboardPage] 使用缓存数据: ${currentCompany}, ${fromDate} - ${toDate}`);
      }

      const uniqueUsers = Array.from(new Map(data.employees.map(u => [u.userid, u])).values());
      const neededIds = new Set<string>();
      uniqueUsers.forEach(user => { user.punchData?.forEach(record => { if (record.procInstId) neededIds.add(record.procInstId); }); });

      const idsToFetch = Array.from(neededIds);
      const newProcessData: Record<string, any> = {};
      if (idsToFetch.length > 0) {
          const BATCH_SIZE = 20;
          for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
              const chunk = idsToFetch.slice(i, i + BATCH_SIZE);
              await Promise.all(chunk.map(async (id) => {
                  const pData = await fetchProcessDetail(id, currentCompany);
                  if (pData) newProcessData[id] = pData;
              }));
          }
      }
      setAllUsers(uniqueUsers);
      setCompanyCounts(data.companyCounts);
      setProcessDataMap(prev => ({ ...prev, ...newProcessData }));
      
      console.log(`[AttendanceDashboardPage] 数据加载完成: ${uniqueUsers.length} 个用户`);
      console.log(`[AttendanceDashboardPage] 公司统计:`, data.companyCounts);
      console.log(`[AttendanceDashboardPage] 流程数据:`, Object.keys(newProcessData).length, '个流程');
    } catch (err) {
      console.error('[AttendanceDashboardPage] 数据加载失败:', err);
      if (!isSilent) setError(err instanceof Error ? err.message : "加载数据失败，请稍后重试。");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      // 🔥 延迟重置防抖状态，防止快速重复调用
      setTimeout(() => setLoadingDebounce(false), 1000);
    }
  }, [globalMonth, currentCompany, isLoading, loadingDebounce, ruleConfigLoaded]); // 🔥 添加ruleConfigLoaded依赖 

  // 🔥 更新ref引用
  useEffect(() => {
    loadAllDataRef.current = loadAllData;
  }, [loadAllData]);

  // 🔥 监听公司和月份变化，清理相关缓存
  useEffect(() => {
    const clearRelatedCaches = async () => {
      console.log(`[AttendanceDashboardPage] 🔥 公司或月份变化检测到，清理相关缓存: ${currentCompany}, ${globalMonth}`);
      
      // 清理考勤数据缓存
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
      
      console.log(`[AttendanceDashboardPage] ✅ 缓存清理完成，准备重新加载数据`);
    };
    
    clearRelatedCaches();
  }, [currentCompany, globalMonth]); // 🔥 监听公司和月份变化

  // 🔥 初始化规则配置缓存（在加载数据之前）
  useEffect(() => {
    const initRuleConfig = async () => {
      try {
        // 🔥 每次进入页面都强制刷新当前公司的规则配置
        console.log(`[AttendanceDashboardPage] 强制刷新 ${currentCompany} 的规则配置`);
        await refreshRuleConfigCache(currentCompany);
        
        // 🔥 刷新完成后，重新加载规则引擎
        AttendanceRuleManager.reloadAllRules();
        
        console.log('[AttendanceDashboardPage] 规则配置缓存已刷新，规则引擎已重新加载');
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
      console.log('[AttendanceDashboardPage] 规则配置已加载，开始加载数据');
      loadAllDataRef.current(); 
    }
  }, [ruleConfigLoaded, globalMonth, currentCompany]); // 🔥 添加globalMonth和currentCompany依赖，确保切换时重新加载数据

  useEffect(() => {
    const initMap = async () => {
        console.log(`[AttendanceDashboardPage] 开始初始化考勤地图: ${allUsers.length} 个用户`);
        const cacheKey = `ATTENDANCE_MAP_CACHE_${currentCompany}_${globalMonth}`;
        const cachedMap = await SmartCache.get<AttendanceMap>(cacheKey);
        if (cachedMap) { 
          console.log(`[AttendanceDashboardPage] 使用缓存的考勤地图`);
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
              const day = new Date(record.workDate).getDate();
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
                if (onDutyRecords.length > 0 && offDutyRecords.length > 0) {
                  status = hasAbnormality ? 'abnormal' : 'normal';
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
        
        console.log(`[AttendanceDashboardPage] 考勤地图初始化完成: ${Object.keys(map).length} 个用户`);
        setAttendanceMap(map); 
        setHistory([]); 
    };
    if (allUsers.length > 0) { 
      initMap(); 
    } else { 
      console.log(`[AttendanceDashboardPage] 没有用户数据，清空考勤地图`);
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
        const response = await fetch(`https://timor.tech/api/holiday/year/${year}`);
        if (!response.ok) throw new Error('Failed to fetch holidays');
        const data = await response.json();
        if (data.holiday) setHolidays(data.holiday);
      } catch (error) { console.warn('Failed to fetch holidays', error); }
    };
    fetchHolidays();
  }, [year]);

  const statsData = useAttendanceStats(allUsers, attendanceMap, processDataMap, holidays, year, monthIndex);
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
        console.log(`[AttendanceDashboardPage] 已加载员工列表: 预设 ${uniqueUsers.filter(u => u.company === '财务').length} 人, ${currentCompany === 'eyewind' ? '风眼' : '海多多'} ${uniqueUsers.filter(u => u.company !== '财务').length} 人, 共 ${uniqueUsers.length} 人`);
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
    console.log('[AttendanceDashboardPage] 检查数据加载状态:', {
      allUsersLength: allUsers.length,
      attendanceMapKeys: Object.keys(attendanceMap).length,
      companyEmployeeStats: companyEmployeeStats ? Object.keys(companyEmployeeStats).length : 'null',
      isLoading,
      isRefreshing,
      ruleConfigLoaded
    });
    
    // 1. 如果基础加载状态为true，直接返回true
    if (isLoading || isRefreshing) {
      console.log('[AttendanceDashboardPage] 基础加载状态为true');
      return true;
    }
    
    // 2. 如果规则配置未加载，返回true
    if (!ruleConfigLoaded) {
      console.log('[AttendanceDashboardPage] 规则配置未加载');
      return true;
    }
    
    // 3. 如果没有用户数据，说明还在初始加载
    if (allUsers.length === 0) {
      console.log('[AttendanceDashboardPage] 没有用户数据');
      return true;
    }
    
    // 4. 🔥 放宽考勤地图的检查条件 - 允许空的考勤地图（可能是新月份或无数据）
    // if (Object.keys(attendanceMap).length === 0) return true;
    
    // 5. 🔥 放宽统计数据的检查 - 如果有用户数据，就认为可以显示
    if (!companyEmployeeStats) {
      console.log('[AttendanceDashboardPage] 统计数据为null，但有用户数据，继续检查');
      // 不直接返回true，继续检查
    }
    
    // 6. 🔥 如果有统计数据，检查是否有实际的员工统计数据
    if (companyEmployeeStats && Object.keys(companyEmployeeStats).length > 0) {
      const hasEmployeeData = Object.values(companyEmployeeStats).some(employees => 
        Array.isArray(employees) && employees.length > 0
      );
      if (hasEmployeeData) {
        console.log('[AttendanceDashboardPage] 有完整的统计数据');
        return false;
      }
    }
    
    // 7. 🔥 如果有用户数据但没有统计数据，可能是统计计算中，给一个短暂的等待时间
    if (allUsers.length > 0) {
      console.log('[AttendanceDashboardPage] 有用户数据但统计数据不完整，允许显示');
      return false; // 🔥 允许显示，不要一直等待统计数据
    }
    
    console.log('[AttendanceDashboardPage] 默认返回加载中');
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
  const handleDownloadReports = async (companyName: string) => {
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
        
        // 为每个公司生成报表并打包
        for (const company of allCompanies) {
            await downloadSingleCompanyReport(company);
        }
        return;
    }
    
    await downloadSingleCompanyReport(companyName);
  };
  
  const downloadSingleCompanyReport = async (companyName: string) => {
    const employees = companyEmployeeStats[companyName] || [];
    if (employees.length === 0) { 
        if (companyName !== '全部') {
            alert('当前公司无数据可下载'); 
        }
        return; 
    }

    // Log Audit Event
    if (currentUserInfo) {
        db.addAuditLog({
            userId: currentUserInfo.id,
            userName: currentUserInfo.name,
            userRole: currentUserInfo.roleName || 'Unknown',
            action: 'DOWNLOAD',
            target: `${globalMonth}考勤报表`,
            details: `下载了${companyName === 'eyewind' ? '风眼' : '海多多'}的考勤统计报表`
        });
    }

    const zip = new JSZip();
    const monthStr = globalMonth.slice(5, 7);
    const fullMonthStr = `${year}年${parseInt(monthStr)}月`;
    
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
                                    const dateStr = `${year}-${monthStr}-${String(d).padStart(2, '0')}`;
                                    remarkEntry = `${type} ${dateStr} 共${hours}小时`;
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
                                remarkEntry = `${type} ${dateStr} 共${hours}小时`;
                            }
                        }
                        
                        if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                    }
                }
            }

            // 检查周末加班
            const dateKey = `${monthStr}-${String(d).padStart(2, '0')}`;
            const holidayInfo = holidays[dateKey];
            const dateObj = new Date(year, monthIndex, d);
            const dayOfWeek = dateObj.getDay();
            if ([0, 6].includes(dayOfWeek) && (!holidayInfo || holidayInfo.holiday !== false)) {
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

    // 1. 考勤表 (按照模板格式)
    const attendanceContent = [
        `${companyDisplayName}考勤表,${','.repeat(daysInMonth + 10)}`,
        `${fullMonthStr},${','.repeat(daysInMonth + 5)}本月记薪日 ${employees.filter(e => e.stats.actualAttendanceDays > 0).length}天,${','.repeat(4)}`,
        `序号,姓名,${dayHeaders.join(',')},正常出勤天数,是否全勤,豁免后迟到分钟数,迟到分钟数,备注,年假(小时),事假(小时),病假(小时 <24),病假(小时 >24),调休(小时),产假(小时),陪产假(小时),婚假(小时),丧假(小时)`,
        `,,${Array.from({ length: daysInMonth }, (_, i) => {
            const date = new Date(year, parseInt(monthStr) - 1, i + 1);
            const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
            return dayNames[date.getDay()];
        }).join(',')},本月合计,,,,,,,,,,,,,`,
        ...employees.map((emp, index) => {
            const { user, stats } = emp;
            // 🔧 修复每日考勤状态生成逻辑 - 使用正确的数据结构
            const dailyStatus = Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`;
                const currentDate = new Date();
                const targetDate = new Date(year, parseInt(monthStr) - 1, day);
                
                // 未来日期显示空白
                if (targetDate > currentDate) {
                    return '';
                }
                
                // 检查是否为假期
                const holidayInfo = holidays[dateKey];
                if (holidayInfo && holidayInfo.holiday === true) {
                    return '-';
                }
                
                // 检查是否为周末（但不是补班日）
                const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
                if (isWeekend && (!holidayInfo || holidayInfo.holiday !== false)) {
                    return '-';
                }
                
                // 🔧 使用正确的数据结构获取考勤数据
                const userAttendance = attendanceMap[user.userid]; // 使用 userid 而不是 id
                const dayAttendance = userAttendance?.[day]; // 使用 day 数字而不是 dateKey
                
                if (dayAttendance && dayAttendance.records) {
                    // 检查请假记录
                    const processRecord = dayAttendance.records.find(r => r.procInstId);
                    if (processRecord && processDataMap[processRecord.procInstId]) {
                        const processData = processDataMap[processRecord.procInstId];
                        const leaveType = processData.formValues?.leaveType || processData.bizType;
                        if (leaveType) {
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
                            return typeMapping[leaveType] || leaveType;
                        }
                    }
                    
                    // 检查加班（周末或节假日有打卡记录）
                    if (isWeekend || (holidayInfo && holidayInfo.holiday === true)) {
                        const onDutyRecord = dayAttendance.records.find(r => r.checkType === 'OnDuty');
                        const offDutyRecord = dayAttendance.records.find(r => r.checkType === 'OffDuty');
                        if (onDutyRecord && offDutyRecord) {
                            return '加班';
                        }
                    }
                    
                    // 正常出勤
                    return '√';
                }
                
                // 工作日无考勤记录
                return '√';
            });
            
            // 🔧 使用统一的备注生成函数，与考勤确认单保持一致
            const remarks = generateEmployeeRemarks(user, stats);
            
            return [
                index + 1,
                user.name,
                ...dailyStatus,
                stats.actualAttendanceDays || 0,
                stats.isFullAttendance ? '是' : '否',
                stats.exemptedLateMinutes || 0,
                stats.lateMinutes || 0,
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
    
    zip.file(`${parseInt(monthStr)}月考勤表.csv`, createCSV(attendanceContent));

    // 2. 迟到统计表 (按照模板格式)
    const lateContent = [
        `${companyDisplayName}迟到统计表,${','.repeat(daysInMonth + 15)}`,
        `${fullMonthStr},${','.repeat(daysInMonth + 15)}`,
        `序号,姓名,${dayHeaders.join(',')},豁免后迟到分钟数,豁免后迟到次数,迟到总分总数,迟到次数,加班到19:30累计时长,加班到20:30累计时长,加班到22:00累计时长,加班到24:00累计时长,加班总时长(19:30前不算),加班19:30次数,加班20:30次数,加班22:00次数,加班24:00次数,上午缺卡次数,下午缺卡次数`,
        ...employees.map((emp, index) => {
            const { user, stats } = emp;
            // 🔧 修复每日迟到状态生成逻辑 - 使用正确的数据结构
            const dailyLateStatus = Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`;
                const currentDate = new Date();
                const targetDate = new Date(year, parseInt(monthStr) - 1, day);
                
                // 未来日期显示空白
                if (targetDate > currentDate) {
                    return '';
                }
                
                // 检查是否为假期
                const holidayInfo = holidays[dateKey];
                if (holidayInfo && holidayInfo.holiday === true) {
                    return '-';
                }
                
                // 检查是否为周末（但不是补班日）
                const isWeekend = targetDate.getDay() === 0 || targetDate.getDay() === 6;
                if (isWeekend && (!holidayInfo || holidayInfo.holiday !== false)) {
                    return '-';
                }
                
                // 🔧 使用正确的数据结构获取考勤数据
                const userAttendance = attendanceMap[user.userid]; // 使用 userid 而不是 id
                const dayAttendance = userAttendance?.[day]; // 使用 day 数字而不是 dateKey
                
                if (dayAttendance && dayAttendance.records) {
                    // 检查请假记录
                    const processRecord = dayAttendance.records.find(r => r.procInstId);
                    if (processRecord && processDataMap[processRecord.procInstId]) {
                        const processData = processDataMap[processRecord.procInstId];
                        const leaveType = processData.formValues?.leaveType || processData.bizType;
                        if (leaveType) {
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
                            return typeMapping[leaveType] || leaveType;
                        }
                    }
                    
                    // 检查缺卡情况
                    const hasOnDuty = dayAttendance.records.some(r => r.checkType === 'OnDuty' && r.timeResult !== 'NotSigned');
                    const hasOffDuty = dayAttendance.records.some(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');
                    
                    if (!hasOnDuty && !hasOffDuty) {
                        return '上午缺卡\n下午缺卡';
                    } else if (!hasOnDuty) {
                        return '上午缺卡';
                    } else if (!hasOffDuty) {
                        return '下午缺卡';
                    }
                    
                    // 检查迟到情况 - 使用 getLateMinutes 函数
                    const lateRecord = dayAttendance.records.find(r => r.checkType === 'OnDuty' && r.timeResult === 'Late');
                    if (lateRecord) {
                        // 获取审批详情
                        const processRecord = dayAttendance.records.find(r => r.procInstId);
                        const processDetail = processRecord?.procInstId ? processDataMap[processRecord.procInstId] : undefined;
                        
                        // 查找前一天的下班打卡时间
                        const findLastOffDuty = (currentDay: number): Date | null => {
                            for (let d = currentDay - 1; d >= 1; d--) {
                                const prevDayAttendance = attendanceMap[user.userid]?.[d];
                                if (prevDayAttendance) {
                                    const offRecord = prevDayAttendance.records.find(r => r.checkType === 'OffDuty' && r.timeResult !== 'NotSigned');
                                    if (offRecord) return new Date(offRecord.userCheckTime);
                                }
                            }
                            return null;
                        };
                        const lastFridayOffDutyTime = findLastOffDuty(day);
                        
                        // 检查前一天是否有20:30后的审批
                        let yesterdayApprove2030 = false;
                        if (day > 1) {
                            const prevDayAttendance = attendanceMap[user.userid]?.[day - 1];
                            if (prevDayAttendance) {
                                const offRecord = prevDayAttendance.records.find(r => r.checkType === 'OffDuty');
                                if (offRecord) {
                                    const offTime = new Date(offRecord.userCheckTime);
                                    const limit2030 = new Date(offTime);
                                    limit2030.setHours(20, 30, 0, 0);
                                    if (offTime.getTime() >= limit2030.getTime()) yesterdayApprove2030 = true;
                                }
                            }
                        }
                        
                        // 检查是否为入职第一天
                        const firstDayOnJob = new Date(user.create_time).getDate();
                        const firstMonthOnJob = new Date(user.create_time).getMonth();
                        const firstYearOnJob = new Date(user.create_time).getFullYear();
                        const isFirstDayOnJob = year === firstYearOnJob && (parseInt(monthStr) - 1) === firstMonthOnJob && day === firstDayOnJob;
                        
                        // 使用 getLateMinutes 函数计算迟到分钟数
                        const lateMinutes = getLateMinutes(lateRecord, processDetail, lastFridayOffDutyTime, yesterdayApprove2030, isFirstDayOnJob, holidays);
                        
                        if (lateMinutes > 0) {
                            return `迟到${lateMinutes}分钟`;
                        }
                    }
                    
                    // 检查加班（周末或节假日有打卡记录）
                    if (isWeekend || (holidayInfo && holidayInfo.holiday === true)) {
                        const onDutyRecord = dayAttendance.records.find(r => r.checkType === 'OnDuty');
                        const offDutyRecord = dayAttendance.records.find(r => r.checkType === 'OffDuty');
                        if (onDutyRecord && offDutyRecord) {
                            const workHours = (new Date(offDutyRecord.userCheckTime).getTime() - new Date(onDutyRecord.userCheckTime).getTime()) / (1000 * 60 * 60);
                            if (workHours > 0) {
                                return `加班${workHours.toFixed(1)}小时`;
                            }
                        }
                    }
                    
                    // 正常出勤
                    return '√';
                }
                
                // 工作日无考勤记录，可能是旷工
                return '旷工';
            });
            
            return [
                index + 1,
                user.name,
                ...dailyLateStatus,
                stats.exemptedLateMinutes || 0,
                stats.late || 0,
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
    
    zip.file(`${parseInt(monthStr)}月迟到统计表.csv`, createCSV(lateContent));

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
    
    zip.file(`${parseInt(monthStr)}月考勤绩效统计.csv`, createCSV(performanceContent));

    try {
        const content = await zip.generateAsync({ type: "blob" });
        const companyPrefix = companyName === 'eyewind' ? '风眼' : companyName === 'hydodo' ? '海多多' : companyName;
        saveAs(content, `${companyPrefix}_${parseInt(monthStr)}月考勤报表.zip`);
    } catch (error) {
        console.error("Download failed:", error);
        alert("打包下载失败，请重试");
    }
  };

  const handleManualRefresh = async () => {
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
    
    // 获取所有公司名称
    const companyNames = Object.keys(companyEmployeeStats);
    const companyDisplayNames = companyNames.map(c => {
      if (c === 'eyewind' || c.includes('风眼')) return '风眼';
      if (c === 'hydodo' || c.includes('海多多')) return '海多多';
      if (c.includes('脑力')) return '脑力';
      if (c.includes('浅冰')) return '浅冰';
      return c;
    }).join('&');
    
    // 生成艾特人员文本
    const atUsersText = selectedAtUsers.length > 0 
      ? selectedAtUsers.map(u => `@${u.name}`).join(' ') + ' '
      : '';
    
    // 纯文本格式内容 - 新模板
    const content = `Hi，${atUsersText}

附件已提交为${y}年${monthStr}${companyDisplayNames}考勤、社保公积金相关资料，请予以核算。

其中需注意如下情况：

• ${companyDisplayNames}主体${monthStr}份考勤表已添加考勤信息；
• ${monthStr}社保账单已添加；
• 海多多主体社保、医保和公积金账单信息由美珍导出；
• 人事变动部分请关注【钉钉-人员月度变动审批】通过后再结算；
• ${monthStr}份加班人员都按调休折算；

考勤系统检阅可查阅：https://ai.studio/apps/drive/1XTwVrshmjL67QfjG0s4oXbtogfIrRunG

如有其他问题可随时沟通。`;

    return content;
  }, [globalMonth, companyEmployeeStats, selectedAtUsers]);

  // 打开自定义下载弹窗
  const handleOpenCustomDownload = (companyName: string) => {
    setCustomDownloadCompany(companyName);
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
  const handleCustomDownload = () => {
    if (!canExport) {
      alert("您没有权限下载报表。");
      return;
    }

    const targetCompany = customDownloadCompany === '全部' ? Object.keys(companyEmployeeStats) : [customDownloadCompany];
    const [y, m] = globalMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    
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

      // 生成数据行
      const rows = employees.map(({ user, stats }: { user: DingTalkUser; stats: EmployeeStats }) => {
        // 计算请假总时长
        const totalLeaveHours = (stats.annualHours || 0) + (stats.personalHours || 0) + 
          (stats.sickHours || 0) + (stats.seriousSickHours || 0) + (stats.compTimeHours || 0) +
          (stats.maternityHours || 0) + (stats.paternityHours || 0) + (stats.marriageHours || 0) + 
          (stats.bereavementHours || 0) + (stats.parentalHours || 0) + (stats.tripHours || 0);
        
        return selectedColumns.map(key => {
          switch (key) {
            // 基本信息
            case 'name': return user.name;
            case 'department': return user.department || '-';
            case 'jobNumber': return user.job_number || '-';
            case 'title': return user.title || '-';
            case 'mainCompany': return user.mainCompany || '-';
            case 'mobile': return user.mobile || '-';
            case 'hiredDate': 
              if (!user.hired_date) return '-';
              const hd = typeof user.hired_date === 'number' ? new Date(user.hired_date) : new Date(user.hired_date);
              return isNaN(hd.getTime()) ? '-' : hd.toLocaleDateString('zh-CN');
            case 'userid': return user.userid || '-';
            case 'active': return user.active === false ? '离职' : '在职';
            
            // 出勤统计
            case 'shouldAttendanceDays': return stats.shouldAttendanceDays || 0;
            case 'actualAttendanceDays': return stats.actualAttendanceDays || 0;
            case 'isFullAttendance': return stats.isFullAttendance ? '是' : '否';
            
            // 迟到相关
            case 'late': return stats.late || 0;
            case 'lateMinutes': return stats.lateMinutes || 0;
            case 'exemptedLate': return stats.exemptedLate || 0;
            case 'exemptedLateMinutes': return stats.exemptedLateMinutes || 0;
            case 'performancePenalty': return stats.performancePenalty?.toFixed(2) || '0.00';
            
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
      });

      // 生成 CSV 内容
      const csvContent = '\ufeff' + [
        headers.map(h => `"${h}"`).join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      // 下载文件
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${companyDisplayName}_${globalMonth}_自定义报表.csv`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

    // 记录审计日志
    if (currentUserInfo) {
      db.addAuditLog({
        userId: currentUserInfo.id,
        userName: currentUserInfo.name,
        userRole: currentUserInfo.roleName || 'Unknown',
        action: 'DOWNLOAD',
        target: `${globalMonth}自定义报表`,
        details: `下载了自定义考勤报表，包含字段：${selectedColumns.map(k => availableColumns.find(c => c.key === k)?.label).join('、')}`
      });
    }

    setShowCustomDownloadModal(false);
  };

  // 打开推送弹窗
  const handleOpenPushModal = () => {
    setPushContent(generateDefaultPushContent());
    setPushResult(null);
    setShowPushModal(true);
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
        if (currentUserInfo) {
          db.addAuditLog({
            userId: currentUserInfo.id,
            userName: currentUserInfo.name,
            userRole: currentUserInfo.roleName || 'Unknown',
            action: 'SEND',
            target: `${globalMonth}考勤推送`,
            details: `通过 Webhook 推送了考勤统计报告${selectedAtUsers.length > 0 ? `，@了${selectedAtUsers.map(u => u.name).join('、')}` : ''}`
          });
        }
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

  const handleConfirmAttendance = (targetCompanyName: string) => {
    const targetStats = Object.values(companyEmployeeStats).flat() || [];
    if (!targetStats || targetStats.length === 0) { alert('没有数据可用于生成考勤确认单。'); return; }
    
    const records: EmployeeAttendanceRecord[] = targetStats.map(({ user, stats }) => {
        // 构建dailyData字段
        const dailyData: Record<string, string> = {};
        
        // 1. 生成每日考勤状态 (1-31号)
        const [yearStr, monthStr] = globalMonth.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr) - 1; // JavaScript月份从0开始
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`;
            
            // 检查是否为法定工作日
            const holidayInfo = holidays[dateKey];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            let isWorkDay = !isWeekend;
            
            if (holidayInfo) {
                if (holidayInfo.holiday === false) isWorkDay = true; // 补班日
                else if (holidayInfo.holiday === true) isWorkDay = false; // 法定节假日
            }
            
            // 非工作日标记为-
            if (!isWorkDay) {
                dailyData[String(day)] = '-';
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
                // 检查是否有异常（迟到、缺卡等）
                const hasLate = dayAttendance.records.some(r => r.timeResult === 'Late');
                const hasMissing = dayAttendance.records.some(r => r.timeResult === 'NotSigned');
                const hasAbsenteeism = dayAttendance.records.length === 0 || 
                    dayAttendance.records.every(r => r.timeResult === 'NotSigned');
                
                if (hasAbsenteeism) {
                    dailyData[String(day)] = '旷工';
                } else if (hasLate || hasMissing) {
                    dailyData[String(day)] = '√'; // 有异常但仍标记为出勤
                } else {
                    dailyData[String(day)] = '√'; // 正常出勤
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
            const holidayInfo = holidays[dateKey];
            const dateObj = new Date(year, month, day);
            const dayOfWeek = dateObj.getDay();
            if ([0, 6].includes(dayOfWeek) && (!holidayInfo || holidayInfo.holiday !== false)) {
                const onTime = dayAttendance.records.find((r: any) => r.checkType === 'OnDuty')?.userCheckTime;
                const offTime = dayAttendance.records.find((r: any) => r.checkType === 'OffDuty')?.userCheckTime;
                if (onTime && offTime) {
                    const hours = ((new Date(offTime).getTime() - new Date(onTime).getTime()) / 3600 / 1000).toFixed(1);
                    const remarkEntry = `加班 ${year}-${monthStr}-${String(day).padStart(2, '0')} 共${hours}小时`;
                    if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                }
            }

            // 检查缺卡
            if (dayAttendance.status === 'incomplete') {
                const remarkEntry = `缺卡 ${year}-${monthStr}-${String(day).padStart(2, '0')}`;
                if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
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
            mainCompany: targetCompanyName, 
            signatureBase64: null, 
            isSigned: false, 
            dailyData
        };
    });

    onNavigateToConfirmation(records, globalMonth, targetCompanyName);
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
            onConfirm={() => handleConfirmAttendance(view.companyName === '全部' ? currentCompany : view.companyName || '')} 
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
              <div className="flex justify-between items-end border-b border-slate-200 dark:border-slate-700 pb-1 mb-4">
                <div className="flex flex-wrap gap-2">
                  {companyNames.map(name => (
                    <button key={name} onClick={() => setActiveCompany(name)} className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${activeCompany === name ? 'border-sky-500 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{name}</button>
                  ))}
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
                companyEmployeeStats={companyEmployeeStats} companyAggregate={companyAggregate} dailyTrend={dailyTrend}
                onSelectEmployeeForAnalysis={setAnalysisEmployee} activeCompany={activeCompany}
                canViewAiAnalysis={canViewAiAnalysis}
                lateExemptionEnabled={lateExemptionEnabled}
                fullAttendanceEnabled={fullAttendanceEnabled}
                performancePenaltyEnabled={performancePenaltyEnabled}
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
          <p className="text-slate-600 dark:text-slate-400 mt-1">当前查看: <span className="font-semibold text-sky-600 dark:text-sky-400">{currentCompany === 'eyewind' ? '风眼' : '海多多'}</span></p>
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
                <input
                  type="url"
                  value={pushWebhook}
                  onChange={(e) => handleWebhookChange(e.target.value)}
                  placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                  className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all ${
                    webhookError 
                      ? 'border-red-400 dark:border-red-500' 
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                />
                {webhookError && (
                  <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {webhookError}
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
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setPushContent(e.currentTarget.innerText)}
                  className="w-full min-h-[300px] max-h-[400px] overflow-y-auto px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-b-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all whitespace-pre-wrap"
                  style={{ lineHeight: '1.6' }}
                  dangerouslySetInnerHTML={{ __html: pushContent.replace(/\n/g, '<br>') }}
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
                onClick={() => setShowCustomDownloadModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* 全选/取消全选 */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  已选择 {selectedColumns.length} / {availableColumns.length} 个字段
                </span>
                <button
                  onClick={toggleAllColumns}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {selectedColumns.length === availableColumns.length ? '取消全选' : '全选'}
                </button>
              </div>

              {/* 按分组显示字段 */}
              {['基本信息', '出勤统计', '迟到相关', '缺卡相关', '请假统计', '加班统计', '其他'].map(groupName => {
                const groupColumns = availableColumns.filter(col => col.group === groupName);
                if (groupColumns.length === 0) return null;
                
                return (
                  <div key={groupName} className="mb-4">
                    <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">{groupName}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {groupColumns.map(col => (
                        <label
                          key={col.key}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
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
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-50"
                          />
                          <span className={`text-xs ${
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
            </div>

            {/* 弹窗底部 */}
            <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
              <button
                onClick={() => setShowCustomDownloadModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCustomDownload}
                disabled={selectedColumns.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
              >
                <DownloadIcon className="w-4 h-4" />
                <span>下载报表</span>
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
    </div>
  );
};
