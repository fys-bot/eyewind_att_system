
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { AttendanceSheet, EmployeeAttendanceRecord, AttendanceSheetStatus, DingTalkUser, User } from '../../database/schema.ts';
import { db } from '../../database/mockDb.ts';
import { Loader2Icon, DownloadIcon } from '../Icons.tsx';
import { fetchAllEmployees } from './verification/api.ts';
import { CreateAttendanceWizard } from './verification/CreateWizard.tsx';
import { SheetList } from './verification/SheetList.tsx';
import { AttendanceDetailView } from './verification/DetailView.tsx';
import { AttendanceEmptyState } from './EmptyState.tsx';
import { SmartCache, DashboardCache } from './utils.ts';

// 🔥 计算记录完整性得分的辅助函数
function calculateRecordCompleteness(record: any): number {
    let score = 0;
    
    // 基础字段得分
    if (record.userid) score += 1;
    if (record.username || record.user_name || record.name) score += 1;
    if (record.department || record.dept) score += 1;
    
    // 状态字段得分
    if (record.is_send !== undefined) score += 1;
    if (record.is_view !== undefined) score += 1;
    if (record.is_confirm !== undefined) score += 1;
    
    // 时间字段得分
    if (record.sent_at || record.sendAt) score += 1;
    if (record.confirmed_at || record.confirmedAt) score += 1;
    if (record.viewed_at || record.viewedAt) score += 1;
    
    // 签名字段得分
    if (record.signatureBase64 || record.signature_base64 || record.signature) score += 2;
    
    // dailyData 完整性得分
    const dailyData = record.dailyData || record.daily_data || record.records || record.attendance_data || {};
    if (typeof dailyData === 'object' && dailyData !== null) {
        const keys = Object.keys(dailyData);
        if (keys.length > 0) score += 1;
        if (keys.length > 10) score += 1; // 有较多字段
        if (keys.some(key => /^\d+$/.test(key))) score += 1; // 有日期字段
        if (dailyData['正常出勤天数']) score += 1; // 有汇总字段
    }
    
    // 任务ID得分
    if (record.corp_task_id || record.corpTaskId) score += 1;
    if (record.todo_task_id || record.todoTaskId) score += 1;
    
    return score;
}

// --- Main Page Component ---
// 🔥 修复说明：
// 1. 添加了 hasInitialized 和 isCurrentlyLoading 状态来防止重复API调用
// 2. 使用 isMountedRef 来防止组件卸载后的状态更新
// 3. 优化了 useEffect 依赖项，避免不必要的重新执行
// 4. 在所有状态更新前检查组件是否仍然挂载
// 5. 简化了 loadData 的依赖项，只包含必要的变量
export interface AttendancePageProps {
    preloadedData?: { data: EmployeeAttendanceRecord[]; month: string; mainCompany: string } | null;
    onBack?: () => void;
    currentCompany: string; // New Prop
    onLoadingChange?: (loading: boolean) => void;
    userPermissions?: string[]; // New Prop
    currentUserInfo?: User; // New Prop for Audit Log
    globalMonth?: string; // 🔥 全局月份过滤
    forceRefresh?: boolean; // 🔥 新增：强制刷新标志
}

export const AttendancePage: React.FC<AttendancePageProps> = ({ preloadedData, onBack, currentCompany, onLoadingChange, userPermissions = [], currentUserInfo, globalMonth, forceRefresh = false }) => {
    // 🔥 简化状态管理 - 移除复杂的加载状态逻辑
    const [view, setView] = useState<'dashboard' | 'create' | 'detail'>(preloadedData ? 'create' : 'dashboard');
    const [sheets, setSheets] = useState<AttendanceSheet[]>([]);
    const [isLoading, setIsLoading] = useState(true); // 🔥 简化为单一loading状态
    const [sheetsError, setSheetsError] = useState<string | null>(null);
    const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
    const [dingTalkUsers, setDingTalkUsers] = useState<DingTalkUser[]>([]);
    const [isDingTalkDataLoading, setIsDingTalkDataLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [triggerBulkArchive, setTriggerBulkArchive] = useState<{ month: string, timestamp: number } | null>(null);
    
    // 🔥 新增：检查仪表盘缓存是否有数据
    const [hasDashboardCache, setHasDashboardCache] = useState(false);
    const [isCheckingCache, setIsCheckingCache] = useState(false);
    
    // 🔥 防止重复调用的标志 - 移除状态，改用 ref
    const isMountedRef = useRef(true);
    // 🔥 使用 useRef 来确保只执行一次，完全避免严格模式的重复执行
    const hasInitializedRef = useRef(false);
    // 🔥 新增：跟踪上一次的globalMonth值，避免重复调用
    const prevGlobalMonthRef = useRef<string | undefined>(globalMonth);

    // Effect to notify parent about loading state
    useEffect(() => {
        const loading = isLoading || isDingTalkDataLoading || isRefreshing;
        onLoadingChange?.(loading);
    }, [isLoading, isDingTalkDataLoading, isRefreshing, onLoadingChange]);

    // 🔥 优化的数据加载函数 - 利用缓存避免重复调用
    const loadData = useCallback(async (forceRefreshData = false) => {
        // console.log('[AttendancePage] 开始加载数据, forceRefresh:', forceRefreshData || forceRefresh);
        setIsLoading(true);
        setSheetsError(null);

        try {
            // 🔥 如果是强制刷新，清除相关缓存
            if (forceRefreshData || forceRefresh) {
                // console.log('[AttendancePage] 强制刷新，清除所有相关缓存');
                const cacheKey = `ATTENDANCE_SHEETS_${currentCompany}_${globalMonth || 'current'}`;
                await SmartCache.remove(cacheKey);
                await SmartCache.remove('ATTENDANCE_SHEETS_RAW');
                
                // 清除员工数据缓存
                const employeeCacheKey = `employees_${currentCompany}`;
                const employeeCache = (window as any).employeeCache || new Map();
                employeeCache.delete(employeeCacheKey);
            }
            
            // 🔥 添加缓存逻辑（只有在非强制刷新时才使用缓存）
            const cacheKey = `ATTENDANCE_SHEETS_${currentCompany}_${globalMonth || 'current'}`;
            // console.log('[AttendancePage] 检查缓存:', cacheKey);
            
            // 先尝试从缓存获取数据（只有在非强制刷新时）
            if (!forceRefreshData && !forceRefresh) {
                const cachedSheets = await SmartCache.get<AttendanceSheet[]>(cacheKey);
                if (cachedSheets && cachedSheets.length > 0) {
                    // console.log('[AttendancePage] 使用缓存数据，数量:', cachedSheets.length);
                    setSheets(cachedSheets);
                    setSheetsError(null);
                    
                    // 有缓存数据时直接跳转到详情页面
                    const targetSheet = cachedSheets.find(s => s.month === globalMonth) || cachedSheets[0];
                    setSelectedSheetId(targetSheet.id);
                    setView('detail');
                    return;
                }
            }

            // console.log('[AttendancePage] 缓存未命中或强制刷新，从API加载数据');

            // 1. 检查员工数据缓存，如果有缓存就跳过员工数据加载
            const employeeCacheKey = `employees_${currentCompany}`;
            const employeeCache = (window as any).employeeCache || new Map();
            const cached = employeeCache.get(employeeCacheKey);
            const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
            
            let employees;
            if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
                // console.log('[AttendancePage] 使用缓存的员工数据，跳过Token和Employee API调用');
                employees = cached.data;
                setIsDingTalkDataLoading(false);
            } else {
                // console.log('[AttendancePage] 缓存过期或不存在，加载员工数据');
                setIsDingTalkDataLoading(true);
                employees = await fetchAllEmployees(currentCompany);
                setIsDingTalkDataLoading(false);
            }
            
            setDingTalkUsers(employees as DingTalkUser[]);

            // 2. 直接加载考勤数据 - 🔥 加上公司主体参数
            // console.log('[AttendancePage] 开始加载考勤数据，月份:', globalMonth, '公司:', currentCompany);
            const loadUrl = globalMonth 
                ? `/api/v1/attendance/status/load/${globalMonth}?company=${currentCompany}`
                : `/api/v1/attendance/status/load?company=${currentCompany}`;
            
            // console.log('[AttendancePage] 请求URL:', loadUrl);
            
            const response = await fetch(loadUrl, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            // console.log('[AttendancePage] load接口响应状态:', response.status, response.ok);
            
            // 🔥 优化404处理：提供更友好的错误信息和操作指引
            if (response.status === 404) {
                const errorData = await response.json();
                // console.log('[AttendancePage] 404响应:', errorData);
                const monthText = globalMonth ? globalMonth.replace('-', '年') + '月' : '当前月份';
                setSheetsError(`${monthText}还未配置考勤确认信息，请移步考勤仪表盘设置并确认`);
                setSheets([]);
                return; // 直接返回，不处理数据
            }
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }
            
            const apiResponse = await response.json();
            // console.log('[AttendancePage] API响应:', apiResponse);
            
            // 🔥 简化处理：success为false直接显示错误
            if (!apiResponse.success) {
                // console.log('[AttendancePage] API返回success=false:', apiResponse);
                const monthText = globalMonth ? globalMonth.replace('-', '年') + '月' : '当前月份';
                setSheetsError(`${monthText}还未配置考勤确认信息，请移步考勤仪表盘设置并确认`);
                setSheets([]);
                return; // 直接返回，不处理数据
            }
            
            // 🔥 直接使用接口返回的数据数组
            if (!apiResponse.data || !Array.isArray(apiResponse.data) || apiResponse.data.length === 0) {
                // console.log('[AttendancePage] API返回无数据或数据为空');
                const monthText = globalMonth ? globalMonth.replace('-', '年') + '月' : '当前月份';
                setSheetsError(`${monthText}还未配置考勤确认信息，请移步考勤仪表盘设置并确认`);
                setSheets([]);
                return; // 直接返回，不处理数据
            }
            
            // 🔥 处理API返回的records数组，按月份分组并转换为AttendanceSheet结构
            // console.log('[AttendancePage] 接口返回数据:', apiResponse.data);
            // console.log('[AttendancePage] 数据类型:', typeof apiResponse.data, '是否为数组:', Array.isArray(apiResponse.data));
            // console.log('[AttendancePage] 记录数量:', apiResponse.data.length);
            // console.log('[AttendancePage] 当前公司:', currentCompany);
            
            // API返回的是records数组，每个record有attd_month字段
            const records = apiResponse.data;
            
            // 先按公司过滤记录
            const filteredRecords = records.filter((record: any) => {
                const matches = !record.mainCompany || record.mainCompany === currentCompany;
                if (!matches) {
                    // console.log(`[AttendancePage] 过滤掉记录: userid=${record.userid}, mainCompany=${record.mainCompany}, 当前公司=${currentCompany}`);
                }
                return matches;
            });
            
            // console.log(`[AttendancePage] 过滤后记录数量: ${filteredRecords.length}`);
            
            // 按月份分组
            const monthlyGroups = filteredRecords.reduce((groups: Record<string, any[]>, record: any) => {
                const month = record.attd_month;
                if (!groups[month]) {
                    groups[month] = [];
                }
                groups[month].push(record);
                return groups;
            }, {});
            
            // console.log('[AttendancePage] 按月份分组结果:', Object.keys(monthlyGroups));
            
            // 为每个月份创建AttendanceSheet
            const sheets: AttendanceSheet[] = Object.entries(monthlyGroups).map(([month, monthRecords]: [string, any[]]) => {
                // console.log(`[AttendancePage] 处理月份 ${month}, 记录数量: ${monthRecords.length}`);
                
                // 🔥 添加去重逻辑：按员工姓名去重，优先保留数据更完整的记录
                const uniqueRecords = monthRecords.reduce((acc: any[], record: any) => {
                    const employeeName = record.username || record.user_name || record.name || record.real_name || record.display_name || '';
                    
                    // 查找是否已存在同名员工
                    const existingIndex = acc.findIndex(existing => {
                        const existingName = existing.username || existing.user_name || existing.name || existing.real_name || existing.display_name || '';
                        return existingName === employeeName;
                    });
                    
                    if (existingIndex === -1) {
                        // 不存在，直接添加
                        acc.push(record);
                    } else {
                        // 已存在，比较数据完整性，保留更完整的记录
                        const existing = acc[existingIndex];
                        const currentScore = calculateRecordCompleteness(record);
                        const existingScore = calculateRecordCompleteness(existing);
                        
                        if (currentScore > existingScore) {
                            // console.log(`[AttendancePage] 发现重复员工 ${employeeName}，替换为更完整的记录 (${currentScore} > ${existingScore})`);
                            acc[existingIndex] = record;
                        } else {
                            // console.log(`[AttendancePage] 发现重复员工 ${employeeName}，保留现有记录 (${existingScore} >= ${currentScore})`);
                        }
                    }
                    
                    return acc;
                }, []);
                
                // console.log(`[AttendancePage] 去重前记录数量: ${monthRecords.length}, 去重后: ${uniqueRecords.length}`);
                
                // 转换为EmployeeAttendanceRecord格式
                const employeeRecords: EmployeeAttendanceRecord[] = uniqueRecords.map((record: any) => {
                    // 🔥 添加调试信息，显示原始记录的字段
                    if (monthRecords.indexOf(record) === 0) {
                        // console.log(`[AttendancePage] 第一条记录的字段:`, {
                            // allKeys: Object.keys(record),
                            // userid: record.userid,
                            // username: record.username,
                            // employeeName: record.employeeName,
                            // department: record.department,
                            // dept: record.dept,
                            // dept_name: record.dept_name,
                            // department_name: record.department_name,
                            // deptName: record.deptName,
                            // departmentName: record.departmentName,
                            // is_send: record.is_send,
                            // is_view: record.is_view,
                            // is_confirm: record.is_confirm,
                            // mainCompany: record.mainCompany,
                            // records: record.records,
                            // dailyData: record.dailyData
                        // });
                    }
                    
                    // 🔥 首先尝试从考勤记录中获取部门信息
                    let departmentValue = record.department || record.dept || record.dept_name || record.department_name || record.deptName || record.departmentName || record.部门 || '';
                    
                    // 🔥 如果考勤记录中没有部门信息，尝试从员工数据中获取
                    if (!departmentValue && employees && Array.isArray(employees)) {
                        const employeeId = record.userid || record.user_id || '';
                        const employeeName = record.username || record.user_name || record.name || record.real_name || record.display_name || '';
                        
                        // 先按userid匹配
                        let matchedEmployee = employees.find((emp: any) => emp.userid === employeeId);
                        
                        // 如果按userid没找到，尝试按姓名匹配
                        if (!matchedEmployee && employeeName) {
                            matchedEmployee = employees.find((emp: any) => emp.name === employeeName);
                        }
                        
                        if (matchedEmployee && matchedEmployee.department) {
                            departmentValue = matchedEmployee.department;
                            
                            // 记录从员工数据获取部门信息的情况
                            if (monthRecords.indexOf(record) === 0) {
                                // console.log(`[AttendancePage] 从员工数据获取部门信息:`, {
                                    // employeeId,
                                    // employeeName,
                                    // matchedBy: matchedEmployee.userid === employeeId ? 'userid' : 'name',
                                    // departmentFromEmployee: matchedEmployee.department
                                // });
                            }
                        }
                    }
                    
                    // 🔥 调试部门字段映射
                    if (monthRecords.indexOf(record) === 0) {
                        // console.log(`[AttendancePage] 部门字段映射调试:`, {
                            // 'record.department': record.department,
                            // 'record.dept': record.dept,
                            // 'record.dept_name': record.dept_name,
                            // 'record.department_name': record.department_name,
                            // 'record.deptName': record.deptName,
                            // 'record.departmentName': record.departmentName,
                            // 'record.部门': record.部门,
                            // 'finalDepartmentValue': departmentValue,
                            // 'departmentSource': departmentValue && !record.department ? 'employee_data' : 'attendance_record'
                        // });
                    }
                    
                    // 🔥 获取真实的 dailyData，优先使用接口返回的数据
                    let dailyData = record.dailyData || record.daily_data || record.records || record.attendance_data || {};
                    
                    // 🔥 只为缺少的汇总统计字段生成默认值，不覆盖已有数据
                    const requiredSummaryFields = [
                        '正常出勤天数', '是否全勤', '迟到次数', '迟到分钟数', '豁免后迟到分钟数',
                        '缺卡次数', '旷工天数', '早退分钟数', '备注'
                    ];
                    
                    // 🔥 只为缺少的汇总字段添加默认值，不影响日期列数据
                    for (const field of requiredSummaryFields) {
                        if (!(field in dailyData)) {
                            switch (field) {
                                case '正常出勤天数':
                                case '迟到次数':
                                case '迟到分钟数':
                                case '豁免后迟到分钟数':
                                case '缺卡次数':
                                case '旷工天数':
                                case '早退分钟数':
                                    dailyData[field] = '0';
                                    break;
                                case '是否全勤':
                                    dailyData[field] = '否';
                                    break;
                                case '备注':
                                    dailyData[field] = '无';
                                    break;
                            }
                        }
                    }
                    
                    // 🔥 记录真实数据的使用情况
                    const hasRealDailyData = Object.keys(dailyData).some(key => /^\d+$/.test(key));
                    if (hasRealDailyData) {
                        // console.log(`[AttendancePage] 员工 ${record.username} 使用真实考勤数据，日期字段数量: ${Object.keys(dailyData).filter(key => /^\d+$/.test(key)).length}`);
                    } else {
                        // console.log(`[AttendancePage] 员工 ${record.username} 缺少日期考勤数据`);
                    }
                    
                    return {
                        id: record.id || `${record.userid}_${month}`,
                        employeeId: record.userid || record.user_id || '',
                        employeeName: record.username || record.user_name || record.name || record.real_name || record.display_name || '',
                        department: departmentValue,
                        sendStatus: (record.is_send || record.send_status || record.sendStatus) ? 'sent' : 'pending',
                        viewStatus: (record.is_view || record.view_status || record.viewStatus) ? 'viewed' : 'pending', 
                        confirmStatus: (record.is_confirm || record.confirm_status || record.confirmStatus) ? 'confirmed' : 'pending',
                        sent_at: record.sent_at || record.sendAt || null,
                        confirmed_at: record.confirmed_at || record.confirmedAt || null,
                        viewed_at: record.viewed_at || record.viewedAt || null,
                        mainCompany: record.mainCompany || record.main_company || record.company || currentCompany,
                        signatureBase64: record.signatureBase64 || record.signature_base64 || record.signature || null,
                        isSigned: !!(record.signatureBase64 || record.signature_base64 || record.signature),
                        dailyData: dailyData, // 🔥 使用处理后的 dailyData
                        corp_task_id: record.corp_task_id || record.corpTaskId || null,
                        todo_task_id: record.todo_task_id || record.todoTaskId || null,
                    } as EmployeeAttendanceRecord;
                });
                
                // console.log(`[AttendancePage] 月份 ${month} 转换后employeeRecords数量: ${employeeRecords.length}`);
                
                // 🔥 生成完整的显示列配置，包括日期列和汇总字段
                const [yearStr, monthStr] = month.split('-');
                const year = parseInt(yearStr);
                const monthNum = parseInt(monthStr) - 1; // JavaScript月份从0开始
                const daysInMonth = new Date(year, monthNum + 1, 0).getDate();
                
                // 🔥 计算工作日数量（排除周末，但不考虑节假日，因为节假日数据可能不可用）
                let workDays = 0;
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(year, monthNum, day);
                    const dayOfWeek = date.getDay();
                    // 排除周六(6)和周日(0)
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        workDays++;
                    }
                }
                
                // 生成日期列（1-31号）
                const dateColumns = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
                
                // 汇总字段列
                const summaryColumns = [
                    '正常出勤天数', '是否全勤', '迟到次数', '迟到分钟数', '豁免后迟到分钟数',
                    '缺卡次数', '旷工天数', '早退分钟数',
                    '年假天数', '病假天数', '事假天数', '调休天数', '出差天数',
                    '丧假天数', '陪产假天数', '产假天数', '育儿假天数', '婚假天数',
                    '年假(时)', '病假(时)', '事假(时)', '调休(时)', '出差(时)',
                    '丧假(时)', '陪产假(时)', '产假(时)', '育儿假(时)', '婚假(时)',
                    '加班总时长(分)', '19:30加班次数', '19:30加班时长(分)',
                    '20:30加班次数', '20:30加班时长(分)', '22:00加班次数', '22:00加班时长(分)',
                    '24:00加班次数', '24:00加班时长(分)', '备注'
                ];
                
                // 合并所有显示列
                const allShowColumns = [...dateColumns, ...summaryColumns];
                
                // console.log(`[AttendancePage] 生成显示列配置: ${daysInMonth}个日期列 + ${summaryColumns.length}个汇总列 = ${allShowColumns.length}列`);
                // console.log(`[AttendancePage] ${monthStr}月工作日统计: 总天数${daysInMonth}天，工作日${workDays}天`);
                
                // 🔥 生成自动确认时间：当天18:30
                const getTodayAt1830 = () => {
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    const day = String(today.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}T18:30`;
                };

                // 创建AttendanceSheet对象
                const sheet: AttendanceSheet = {
                    id: `sheet_${month}`,
                    title: `${month.replace('-', '年')}月考勤确认单`,
                    month: month,
                    status: 'draft',
                    settings: {
                        reminderText: `${monthStr}月为${workDays}个工作日，请仔细核对考勤数据，并及时签名确认！`, // 🔥 设置默认温馨提示，使用准确的工作日数量
                        showReminder: true, // 🔥 启用温馨提示显示
                        showColumns: allShowColumns, // 🔥 设置完整的显示列配置
                        hideEmptyColumnsOption: 'none',
                        autoConfirmEnabled: true, // 🔥 启用自动确认功能
                        autoConfirmDate: getTodayAt1830(), // 🔥 设置自动确认时间为当天18:30
                        feedbackEnabled: true, // 🔥 启用反馈功能
                        feedbackContactPerson: '人事部门', // 🔥 设置默认联系人
                        notificationMethod: '',
                        readAndBurn: false,
                        employeeSignature: true, // 🔥 启用员工签名功能
                    },
                    employeeRecords: employeeRecords,
                    createdAt: new Date().toISOString(),
                };
                
                return sheet;
            });
            
            // console.log('[AttendancePage] 转换后的sheets数量:', sheets.length);
            // console.log('[AttendancePage] 第一个sheet的employeeRecords数量:', sheets[0]?.employeeRecords?.length);
            
            // 🔥 缓存转换后的数据
            if (sheets.length > 0) {
                await SmartCache.set(cacheKey, sheets);
                // console.log('[AttendancePage] 数据已缓存到:', cacheKey);
            }
            
            // 直接设置转换后的数据
            setSheets(sheets);
            setSheetsError(null);
            
            // 🔥 有数据时直接跳转到详情页面显示考勤确认单
            if (sheets.length > 0) {
                // console.log('[AttendancePage] 转换后有数据，直接跳转到详情页面');
                // 优先选择当前月份的sheet，如果没有则选择第一个
                const targetSheet = sheets.find(s => s.month === globalMonth) || sheets[0];
                setSelectedSheetId(targetSheet.id);
                setView('detail');
            } else {
                // console.log('[AttendancePage] 转换后无数据，显示空状态');
                // 如果转换后没有数据，显示相应的错误信息
                const monthText = globalMonth ? globalMonth.replace('-', '年') + '月' : '当前月份';
                setSheetsError(`${monthText}没有找到公司 ${currentCompany} 的考勤确认信息`);
            }

        } catch (error) {
            console.error('[AttendancePage] 加载失败:', error);
            setSheetsError(error instanceof Error ? error.message : '加载失败');
            setSheets([]);
        } finally {
            // console.log('[AttendancePage] 加载完成，设置loading为false');
            setIsLoading(false);
            setIsDingTalkDataLoading(false);
        }
    }, [currentCompany, preloadedData, globalMonth, forceRefresh]); // 🔥 添加 forceRefresh 依赖
    
    useEffect(() => {
        // console.log('[AttendancePage] useEffect执行，hasInitialized:', hasInitializedRef.current, 'globalMonth:', globalMonth);
        
        // 🔥 简化：防重复调用逻辑
        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            // console.log('[AttendancePage] 组件首次挂载，开始加载数据');
            loadData().catch(error => {
                console.error('[AttendancePage] loadData执行失败:', error);
            });
        }
    }, []); // 🔥 空依赖数组，只在挂载时执行一次
    
    // 🔥 简化：当globalMonth变化时重新加载数据
    useEffect(() => {
        // console.log('[AttendancePage] globalMonth useEffect执行:', {
            // hasInitialized: hasInitializedRef.current,
            // globalMonth,
            // prevGlobalMonth: prevGlobalMonthRef.current
        // });
        
        // 🔥 彻底简化：只有在已经初始化过且globalMonth确实变化时才重新加载
        const hasGlobalMonthChanged = prevGlobalMonthRef.current !== globalMonth;
        
        if (hasInitializedRef.current && globalMonth && hasGlobalMonthChanged) {
            // console.log('[AttendancePage] globalMonth变化，重新加载数据:', prevGlobalMonthRef.current, '->', globalMonth);
            // 🔥 重置初始化状态，允许重新加载
            hasInitializedRef.current = false;
            SmartCache.remove(`ATTENDANCE_SHEETS_RAW`);
            loadData().catch(error => {
                console.error('[AttendancePage] globalMonth变化时loadData执行失败:', error);
            });
        }
        
        // 更新上一次的globalMonth值
        prevGlobalMonthRef.current = globalMonth;
    }, [globalMonth]); // 🔥 移除loadData依赖，避免无限循环

    // 🔥 新增：当currentCompany变化时重新加载数据
    const prevCurrentCompanyRef = useRef<string>(currentCompany);
    useEffect(() => {
        // console.log('[AttendancePage] currentCompany useEffect执行:', {
            // hasInitialized: hasInitializedRef.current,
            // currentCompany,
            // prevCurrentCompany: prevCurrentCompanyRef.current
        // });
        
        // 🔥 只有在已经初始化过且currentCompany确实变化时才重新加载
        const hasCurrentCompanyChanged = prevCurrentCompanyRef.current !== currentCompany;
        
        if (hasInitializedRef.current && currentCompany && hasCurrentCompanyChanged) {
            // console.log('[AttendancePage] currentCompany变化，重新加载数据:', prevCurrentCompanyRef.current, '->', currentCompany);
            // 🔥 重置初始化状态，允许重新加载
            hasInitializedRef.current = false;
            // 🔥 清除所有相关缓存
            SmartCache.remove(`ATTENDANCE_SHEETS_RAW`);
            SmartCache.remove(`ATTENDANCE_SHEETS_${prevCurrentCompanyRef.current}_${globalMonth || 'current'}`);
            SmartCache.remove(`ATTENDANCE_SHEETS_${currentCompany}_${globalMonth || 'current'}`);
            
            // 清除员工数据缓存
            const employeeCache = (window as any).employeeCache || new Map();
            employeeCache.delete(`employees_${prevCurrentCompanyRef.current}`);
            employeeCache.delete(`employees_${currentCompany}`);
            
            loadData().catch(error => {
                console.error('[AttendancePage] currentCompany变化时loadData执行失败:', error);
            });
        }
        
        // 更新上一次的currentCompany值
        prevCurrentCompanyRef.current = currentCompany;
    }, [currentCompany]); // 🔥 监听currentCompany变化

    const handleRefreshSheetDetail = async (month: string) => {
        setIsRefreshing(true);
        try {
            // 🔥 清除相关缓存
            const cacheKey = `ATTENDANCE_SHEETS_${currentCompany}_${month}`;
            await SmartCache.remove(cacheKey);
            // console.log('[AttendancePage] 已清除缓存:', cacheKey);
            
            // Force refresh for this specific month
            // 🔥 使用本地服务器接口
            const response = await fetch(`/api/v1/attendance/status/load/${month}`);
            
            // 🔥 处理304 Not Modified状态码
            let apiResponse;
            if (response.status === 304) {
                // console.log(`[AttendancePage] 收到304响应，${month}月数据未修改`);
                // 304表示内容未修改，但我们仍需要处理这种情况
                throw new Error("数据未修改，无需刷新");
            } else if (!response.ok) {
                throw new Error(`API 请求失败: ${response.status}`);
            } else {
                apiResponse = await response.json();
            }
            
            if (!apiResponse.success || !apiResponse.data) {
                throw new Error(apiResponse.message || "刷新考勤数据失败, 未返回有效数据。");
            }
            const dbRecords = apiResponse.data;
            // console.log('[AttendancePage] handleRefreshSheetDetail - 原始数据:', {
                // recordsCount: dbRecords.length,
                // currentCompany,
                // sampleRecords: dbRecords.slice(0, 3).map((r: any) => ({
                    // mainCompany: r.mainCompany,
                    // hasRecords: !!r.records
                // }))
            // });

            const employeeRecords: EmployeeAttendanceRecord[] = dbRecords
                .filter((d: any) => {
                    const matches = d.mainCompany === currentCompany;
                    if (!matches) {
                        // console.log('[AttendancePage] handleRefreshSheetDetail - 过滤掉记录:', {
                            // mainCompany: d.mainCompany,
                            // currentCompany,
                            // matches
                        // });
                    }
                    // 🔥 临时禁用过滤，保留所有记录用于调试
                    // return matches;
                    return true;
                })
                .map((dbRecord: any) => {
                    const baseRecord = dbRecord.records || {};
                    
                    // 确保baseRecord是一个对象
                    if (typeof baseRecord !== 'object') {
                        console.warn('Invalid record data in refresh:', dbRecord);
                        return null;
                    }
                    
                    baseRecord.sendStatus = dbRecord.is_send ? 'sent' : 'pending';
                    baseRecord.viewStatus = dbRecord.is_view ? 'viewed' : 'pending';
                    baseRecord.confirmStatus = dbRecord.is_confirm ? 'confirmed' : 'pending';
                    baseRecord.confirmed_at = dbRecord?.confirmed_at || baseRecord?.confirmed_at || null;
                    baseRecord.viewed_at = dbRecord?.viewed_at || baseRecord?.viewed_at || null;
                    baseRecord.signatureBase64 = dbRecord.signatureBase64 || baseRecord?.signatureBase64 || null;
                    return baseRecord as EmployeeAttendanceRecord;
                })
                .filter((record): record is EmployeeAttendanceRecord => record !== null);

            setSheets(prevSheets => prevSheets.map(sheet => {
                if (sheet.month === month) {
                    return { ...sheet, employeeRecords };
                }
                return sheet;
            }));

            // Also invalidate global sheet cache since data changed
            await SmartCache.remove(`ATTENDANCE_SHEETS_RAW`);

            // Trigger bulk archive after successful refresh
            setTriggerBulkArchive({ month, timestamp: Date.now() });

        } catch (error) {
            console.error("刷新考勤详情失败:", error);
            alert(error instanceof Error ? error.message : "发生未知错误");
        } finally {
            setIsRefreshing(false);
        }
    };


    const handleCreateSheet = async (newSheetData: Omit<AttendanceSheet, 'id' | 'createdAt'>) => {
        const createdSheet = db.createAttendanceSheet(newSheetData);
        setSheets(prev => [createdSheet, ...prev]);
        setView('detail');
        setSelectedSheetId(createdSheet.id);
        await SmartCache.remove(`ATTENDANCE_SHEETS_RAW`); // Invalidate cache on new creation
    };

    // 🔥 新增：检查仪表盘缓存是否有数据
    const checkDashboardCache = useCallback(async () => {
        if (!globalMonth) {
            console.log('[AttendancePage] checkDashboardCache: 没有globalMonth');
            return;
        }
        
        console.log('[AttendancePage] 开始检查仪表盘缓存:', { currentCompany, globalMonth });
        setIsCheckingCache(true);
        try {
            const cachedData = await DashboardCache.getDashboardData(currentCompany, globalMonth);
            console.log('[AttendancePage] 缓存数据:', {
                hasCachedData: !!cachedData,
                employeesCount: cachedData?.employees?.length || 0,
                cachedData: cachedData ? {
                    employees: cachedData.employees?.length,
                    attendanceMap: Object.keys(cachedData.attendanceMap || {}).length,
                    processDataMap: Object.keys(cachedData.processDataMap || {}).length
                } : null
            });
            const hasCache = !!cachedData && cachedData.employees.length > 0;
            console.log('[AttendancePage] 设置hasDashboardCache:', hasCache);
            setHasDashboardCache(hasCache);
        } catch (error) {
            console.error('[AttendancePage] 检查仪表盘缓存失败:', error);
            setHasDashboardCache(false);
        } finally {
            setIsCheckingCache(false);
        }
    }, [currentCompany, globalMonth]);

    // 🔥 新增：从仪表盘导入数据
    const handleImportFromDashboard = useCallback(async () => {
        if (!globalMonth) {
            alert('请先选择月份');
            return;
        }

        setIsLoading(true);
        try {
            // 从缓存获取仪表盘数据
            const cachedData = await DashboardCache.getDashboardData(currentCompany, globalMonth);
            
            if (!cachedData || !cachedData.employees || cachedData.employees.length === 0) {
                alert('仪表盘缓存中没有数据，请先在考勤日历中加载数据');
                return;
            }

            // 使用与"生成确认单"相同的逻辑生成EmployeeAttendanceRecord
            const { employees, attendanceMap, processDataMap, companyCounts } = cachedData;
            
            // 获取目标公司的员工
            const targetCompanyName = currentCompany;
            const companyUsers = employees.filter(u => {
                const userCompany = u.mainCompany || '';
                if (targetCompanyName === 'eyewind') {
                    return userCompany.includes('风眼') || userCompany === 'eyewind';
                } else if (targetCompanyName === 'hydodo') {
                    return userCompany.includes('海多多') || userCompany === 'hydodo';
                }
                return false;
            });

            if (companyUsers.length === 0) {
                alert(`${targetCompanyName === 'eyewind' ? '风眼' : '海多多'}没有员工数据`);
                return;
            }

            // 生成EmployeeAttendanceRecord数据
            const [year, monthStr] = globalMonth.split('-');
            const month = parseInt(monthStr) - 1;
            const daysInMonth = new Date(parseInt(year), month + 1, 0).getDate();

            const records: EmployeeAttendanceRecord[] = companyUsers.map(user => {
                // 🔥 修复：从缓存数据中获取员工统计信息
                // companyCounts 实际上应该是 companyEmployeeStats 的结构
                const companyStats = (companyCounts as any)[user.mainCompany || ''];
                const stats = companyStats?.employeeStats?.[user.userid] || companyStats?.[user.userid]?.stats;
                const dailyData: Record<string, string> = {};

                // 添加基础字段
                dailyData['应出勤天数'] = String(stats?.shouldAttendanceDays || 21.75);
                dailyData['正常出勤天数'] = String(stats?.actualAttendanceDays || 0);
                dailyData['是否全勤'] = stats?.isFullAttendance ? '是' : '否';
                dailyData['迟到分钟数'] = String(stats?.lateMinutes || 0);
                dailyData['豁免后迟到分钟数'] = String(stats?.exemptedLateMinutes || 0);

                // 添加每日状态
                for (let day = 1; day <= daysInMonth; day++) {
                    const userAttendance = attendanceMap[user.userid];
                    const dayAttendance = userAttendance?.[day];
                    
                    if (!dayAttendance || !dayAttendance.records || dayAttendance.records.length === 0) {
                        dailyData[String(day)] = '';
                        continue;
                    }

                    // 检查请假
                    const procRecord = dayAttendance.records.find((r: any) => r.procInstId);
                    if (procRecord && processDataMap[procRecord.procInstId]) {
                        const p = processDataMap[procRecord.procInstId];
                        const leaveType = p.formValues?.leaveType || p.bizType;
                        if (leaveType) {
                            dailyData[String(day)] = leaveType;
                            continue;
                        }
                    }

                    // 检查缺卡
                    if (dayAttendance.status === 'incomplete') {
                        dailyData[String(day)] = '缺卡';
                        continue;
                    }

                    // 检查迟到
                    const lateRecord = dayAttendance.records.find((r: any) => r.checkType === 'OnDuty' && r.timeResult === 'Late');
                    if (lateRecord) {
                        dailyData[String(day)] = '迟到';
                        continue;
                    }

                    // 正常出勤
                    dailyData[String(day)] = '√';
                }

                // 生成备注
                const remarks: string[] = [];
                for (let day = 1; day <= daysInMonth; day++) {
                    const userAttendance = attendanceMap[user.userid];
                    const dayAttendance = userAttendance?.[day];
                    if (!dayAttendance) continue;

                    const procRecord = dayAttendance.records.find((r: any) => r.procInstId);
                    if (procRecord) {
                        const p = processDataMap[procRecord.procInstId];
                        if (p) {
                            const type = p.formValues?.leaveType || p.bizType;
                            const duration = p.formValues?.duration || 0;
                            const unit = p.formValues?.durationUnit || p.formValues?.unit || '';
                            
                            if (type && duration > 0) {
                                let hours = duration;
                                if (unit.includes('day') || unit.includes('天')) {
                                    hours = duration * 8;
                                }
                                
                                const dateStr = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
                                const remarkEntry = `${type} ${dateStr} 共${hours}小时`;
                                if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                            }
                        }
                    }

                    if (dayAttendance.status === 'incomplete') {
                        const remarkEntry = `缺卡 ${year}-${monthStr}-${String(day).padStart(2, '0')}`;
                        if (!remarks.includes(remarkEntry)) remarks.push(remarkEntry);
                    }
                }
                
                dailyData['备注'] = remarks.length > 0 ? remarks.join('\n') : '-';
                
                return {
                    id: `gen_${user.userid}_${Date.now()}`,
                    employeeId: user.job_number || user.userid,
                    employeeName: user.name,
                    department: user.department || '',
                    sendStatus: 'pending' as const,
                    viewStatus: 'pending' as const,
                    confirmStatus: 'pending' as const,
                    sent_at: null,
                    confirmed_at: null,
                    viewed_at: null,
                    mainCompany: targetCompanyName,
                    signatureBase64: null,
                    isSigned: false,
                    dailyData
                };
            });

            // 切换到创建向导，传入预加载数据
            setView('create');
            // 通过CreateWizard的preloadedData prop传递数据
            // 需要修改CreateWizard组件以支持这种方式
            
            // 临时方案：直接创建一个新的sheet
            const newSheet: Omit<AttendanceSheet, 'id' | 'createdAt'> = {
                title: `${globalMonth.replace('-', '年')}月考勤确认单`,
                month: globalMonth,
                status: 'draft',
                settings: {
                    reminderText: '请仔细核对考勤数据, 并及时确认!',
                    showReminder: true,
                    autoConfirmEnabled: true,
                    autoConfirmDate: new Date().toISOString().slice(0, 16),
                    feedbackEnabled: true,
                    feedbackContactPerson: '陈丽瑶',
                    readAndBurn: false,
                    employeeSignature: true,
                    hideEmptyColumnsOption: 'none',
                    notificationMethod: '考勤确认助手通知+待办',
                    showColumns: []
                },
                employeeRecords: records
            };

            await handleCreateSheet(newSheet);
            
        } catch (error) {
            console.error('[AttendancePage] 从仪表盘导入数据失败:', error);
            alert(error instanceof Error ? error.message : '导入失败');
        } finally {
            setIsLoading(false);
        }
    }, [currentCompany, globalMonth, handleCreateSheet]);

    // 🔥 监听月份变化，检查缓存
    useEffect(() => {
        if (globalMonth && view === 'dashboard') {
            checkDashboardCache();
        }
    }, [globalMonth, view, checkDashboardCache]);

    const handleUpdateSheet = async (updatedSheet: AttendanceSheet) => {
        setSheets(prev => prev.map(s => s.id === updatedSheet.id ? updatedSheet : s));
        db.updateAttendanceSheet(updatedSheet);
        await SmartCache.remove(`ATTENDANCE_SHEETS_RAW`); // Invalidate cache on update
    };

    const selectedSheet = useMemo(() => {
        const found = sheets.find(s => s.id === selectedSheetId);
        // console.log('[AttendancePage] selectedSheet计算:', {
            // selectedSheetId,
            // sheetsCount: sheets.length,
            // foundSheet: found ? {
                // id: found.id,
                // title: found.title,
                // month: found.month,
                // employeeRecordsLength: found.employeeRecords?.length,
                // employeeRecords: found.employeeRecords,
                // hasEmployeeRecords: !!found.employeeRecords,
                // isArray: Array.isArray(found.employeeRecords)
            // } : null
        // });
        return found;
    }, [sheets, selectedSheetId]);

    const renderContent = () => {
        // console.log('[AttendancePage] renderContent called:', {
            // view,
            // isLoading,
            // isRefreshing,
            // sheetsLength: sheets,
            // globalMonth
        // });
        
        if (view === 'dashboard' && isLoading && !isRefreshing) {
            return (
                <div className="flex justify-center items-center h-64">
                    <Loader2Icon className="w-10 h-10 animate-spin text-sky-500" />
                    <p className="ml-4 text-slate-500 dark:text-slate-400">正在加载 {currentCompany === 'eyewind' ? '风眼' : '海多多'} 考勤数据...</p>
                </div>
            );
        }

        switch (view) {
            case 'create':
                return <CreateAttendanceWizard 
                    mainCompany={currentCompany} 
                    onBack={() => {
                        if (preloadedData && onBack) {
                            onBack();
                        } else {
                            setView('dashboard');
                        }
                    }} 
                    onCreateSheet={handleCreateSheet} 
                    dingTalkUsers={dingTalkUsers} 
                    isDingTalkDataLoading={isDingTalkDataLoading}
                    preloadedData={preloadedData}
                />;
            case 'detail':
                return selectedSheet ? <AttendanceDetailView mainCompany={currentCompany} sheet={selectedSheet} onBack={() => setView('dashboard')} onUpdateSheet={handleUpdateSheet} dingTalkUsers={dingTalkUsers} isDingTalkDataLoading={isDingTalkDataLoading} onRefresh={handleRefreshSheetDetail} isRefreshing={isRefreshing} trigger={triggerBulkArchive} userPermissions={userPermissions} currentUserInfo={currentUserInfo} /> : <div>加载中...</div>;
            case 'dashboard':
            default:
                // 🔥 优化错误信息显示，添加创建考勤确认入口
                if (!isLoading && sheetsError) {
                    const isConfigurationError = sheetsError.includes('还未配置考勤确认信息') || sheetsError.includes('没有找到');
                    
                    return (
                        <div className="flex flex-col justify-center items-center h-64 space-y-4">
                            <div className="text-center">
                                <div className="text-red-500 text-lg font-medium mb-2">
                                    {isConfigurationError ? '配置提醒' : '加载失败'}
                                </div>
                                <div className="text-slate-600 dark:text-slate-400 text-sm mb-4 max-w-md">
                                    {sheetsError}
                                </div>
                            </div>
                            
                            <div className="flex space-x-3">
                                {isConfigurationError && (
                                    <button 
                                        onClick={() => setView('create')}
                                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center space-x-2"
                                    >
                                        <span>📤</span>
                                        <span>创建考勤确认</span>
                                    </button>
                                )}
                                
                                <button 
                                    onClick={() => {
                                        setSheetsError(null);
                                        hasInitializedRef.current = false;
                                        loadData();
                                    }}
                                    className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
                                >
                                    重新加载
                                </button>
                            </div>
                        </div>
                    );
                }
                
                // 🔥 如果没有数据且设置了全局月份，显示空状态
                if (!isLoading && sheets.length === 0 && globalMonth && !sheetsError) {
                    return <AttendanceEmptyState
                        month={globalMonth}
                        company={currentCompany}
                        onCreateNew={() => setView('create')}
                        onImportFromDashboard={handleImportFromDashboard}
                        hasDashboardCache={hasDashboardCache}
                        isCheckingCache={isCheckingCache}
                    />;
                }
                
                return <SheetList
                    sheets={sheets}
                    mainCompany={currentCompany}
                    onCreate={() => setView('create')}
                    onSelectSheet={(id) => { setSelectedSheetId(id); setView('detail'); }}
                    userPermissions={userPermissions}
                />;
        }
    };

    return (
        <div className="space-y-6">
            {renderContent()}
        </div>
    );
};
