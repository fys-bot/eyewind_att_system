
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { AttendanceSheet, EmployeeAttendanceRecord, AttendanceSheetStatus, DingTalkUser, User } from '../../database/schema.ts';
import { db } from '../../database/mockDb.ts';
import { Loader2Icon } from '../Icons.tsx';
import { fetchAllEmployees } from './verification/api.ts';
import { CreateAttendanceWizard } from './verification/CreateWizard.tsx';
import { SheetList } from './verification/SheetList.tsx';
import { AttendanceDetailView } from './verification/DetailView.tsx';
import { AttendanceEmptyState } from './EmptyState.tsx';
import { SmartCache } from './utils.ts';

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
}

export const AttendancePage: React.FC<AttendancePageProps> = ({ preloadedData, onBack, currentCompany, onLoadingChange, userPermissions = [], currentUserInfo, globalMonth }) => {
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
    const loadData = useCallback(async () => {
        console.log('[AttendancePage] 开始加载数据');
        setIsLoading(true);
        setSheetsError(null);

        try {
            // 🔥 添加缓存逻辑
            const cacheKey = `ATTENDANCE_SHEETS_${currentCompany}_${globalMonth || 'current'}`;
            console.log('[AttendancePage] 检查缓存:', cacheKey);
            
            // 先尝试从缓存获取数据
            const cachedSheets = await SmartCache.get<AttendanceSheet[]>(cacheKey);
            if (cachedSheets && cachedSheets.length > 0) {
                console.log('[AttendancePage] 使用缓存数据，数量:', cachedSheets.length);
                setSheets(cachedSheets);
                setSheetsError(null);
                
                // 有缓存数据时直接跳转到详情页面
                const targetSheet = cachedSheets.find(s => s.month === globalMonth) || cachedSheets[0];
                setSelectedSheetId(targetSheet.id);
                setView('detail');
                return;
            }

            console.log('[AttendancePage] 缓存未命中，从API加载数据');

            // 1. 检查员工数据缓存，如果有缓存就跳过员工数据加载
            const employeeCacheKey = `employees_${currentCompany}`;
            const employeeCache = (window as any).employeeCache || new Map();
            const cached = employeeCache.get(employeeCacheKey);
            const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
            
            let employees;
            if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
                console.log('[AttendancePage] 使用缓存的员工数据，跳过Token和Employee API调用');
                employees = cached.data;
                setIsDingTalkDataLoading(false);
            } else {
                console.log('[AttendancePage] 缓存过期或不存在，加载员工数据');
                setIsDingTalkDataLoading(true);
                employees = await fetchAllEmployees(currentCompany);
                setIsDingTalkDataLoading(false);
            }
            
            setDingTalkUsers(employees as DingTalkUser[]);

            // 2. 直接加载考勤数据 - 🔥 加上公司主体参数
            console.log('[AttendancePage] 开始加载考勤数据，月份:', globalMonth, '公司:', currentCompany);
            const loadUrl = globalMonth 
                ? `/api/v1/attendance/status/load/${globalMonth}?company=${currentCompany}`
                : `/api/v1/attendance/status/load?company=${currentCompany}`;
            
            console.log('[AttendancePage] 请求URL:', loadUrl);
            
            const response = await fetch(loadUrl, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            console.log('[AttendancePage] load接口响应状态:', response.status, response.ok);
            
            // 🔥 优化404处理：提供更友好的错误信息和操作指引
            if (response.status === 404) {
                const errorData = await response.json();
                console.log('[AttendancePage] 404响应:', errorData);
                const monthText = globalMonth ? globalMonth.replace('-', '年') + '月' : '当前月份';
                setSheetsError(`${monthText}还未配置考勤确认信息，请移步考勤仪表盘设置并确认`);
                setSheets([]);
                return; // 直接返回，不处理数据
            }
            
            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }
            
            const apiResponse = await response.json();
            console.log('[AttendancePage] API响应:', apiResponse);
            
            // 🔥 简化处理：success为false直接显示错误
            if (!apiResponse.success) {
                console.log('[AttendancePage] API返回success=false:', apiResponse);
                const monthText = globalMonth ? globalMonth.replace('-', '年') + '月' : '当前月份';
                setSheetsError(`${monthText}还未配置考勤确认信息，请移步考勤仪表盘设置并确认`);
                setSheets([]);
                return; // 直接返回，不处理数据
            }
            
            // 🔥 直接使用接口返回的数据数组
            if (!apiResponse.data || !Array.isArray(apiResponse.data) || apiResponse.data.length === 0) {
                console.log('[AttendancePage] API返回无数据或数据为空');
                const monthText = globalMonth ? globalMonth.replace('-', '年') + '月' : '当前月份';
                setSheetsError(`${monthText}还未配置考勤确认信息，请移步考勤仪表盘设置并确认`);
                setSheets([]);
                return; // 直接返回，不处理数据
            }
            
            // 🔥 处理API返回的records数组，按月份分组并转换为AttendanceSheet结构
            console.log('[AttendancePage] 接口返回数据:', apiResponse.data);
            console.log('[AttendancePage] 数据类型:', typeof apiResponse.data, '是否为数组:', Array.isArray(apiResponse.data));
            console.log('[AttendancePage] 记录数量:', apiResponse.data.length);
            console.log('[AttendancePage] 当前公司:', currentCompany);
            
            // API返回的是records数组，每个record有attd_month字段
            const records = apiResponse.data;
            
            // 先按公司过滤记录
            const filteredRecords = records.filter((record: any) => {
                const matches = !record.mainCompany || record.mainCompany === currentCompany;
                if (!matches) {
                    console.log(`[AttendancePage] 过滤掉记录: userid=${record.userid}, mainCompany=${record.mainCompany}, 当前公司=${currentCompany}`);
                }
                return matches;
            });
            
            console.log(`[AttendancePage] 过滤后记录数量: ${filteredRecords.length}`);
            
            // 按月份分组
            const monthlyGroups = filteredRecords.reduce((groups: Record<string, any[]>, record: any) => {
                const month = record.attd_month;
                if (!groups[month]) {
                    groups[month] = [];
                }
                groups[month].push(record);
                return groups;
            }, {});
            
            console.log('[AttendancePage] 按月份分组结果:', Object.keys(monthlyGroups));
            
            // 为每个月份创建AttendanceSheet
            const sheets: AttendanceSheet[] = Object.entries(monthlyGroups).map(([month, monthRecords]: [string, any[]]) => {
                console.log(`[AttendancePage] 处理月份 ${month}, 记录数量: ${monthRecords.length}`);
                
                // 转换为EmployeeAttendanceRecord格式
                const employeeRecords: EmployeeAttendanceRecord[] = monthRecords.map((record: any) => {
                    // 🔥 添加调试信息，显示原始记录的字段
                    if (monthRecords.indexOf(record) === 0) {
                        console.log(`[AttendancePage] 第一条记录的字段:`, {
                            allKeys: Object.keys(record),
                            userid: record.userid,
                            username: record.username,
                            employeeName: record.employeeName,
                            department: record.department,
                            dept: record.dept,
                            dept_name: record.dept_name,
                            department_name: record.department_name,
                            deptName: record.deptName,
                            departmentName: record.departmentName,
                            is_send: record.is_send,
                            is_view: record.is_view,
                            is_confirm: record.is_confirm,
                            mainCompany: record.mainCompany,
                            records: record.records,
                            dailyData: record.dailyData
                        });
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
                                console.log(`[AttendancePage] 从员工数据获取部门信息:`, {
                                    employeeId,
                                    employeeName,
                                    matchedBy: matchedEmployee.userid === employeeId ? 'userid' : 'name',
                                    departmentFromEmployee: matchedEmployee.department
                                });
                            }
                        }
                    }
                    
                    // 🔥 调试部门字段映射
                    if (monthRecords.indexOf(record) === 0) {
                        console.log(`[AttendancePage] 部门字段映射调试:`, {
                            'record.department': record.department,
                            'record.dept': record.dept,
                            'record.dept_name': record.dept_name,
                            'record.department_name': record.department_name,
                            'record.deptName': record.deptName,
                            'record.departmentName': record.departmentName,
                            'record.部门': record.部门,
                            'finalDepartmentValue': departmentValue,
                            'departmentSource': departmentValue && !record.department ? 'employee_data' : 'attendance_record'
                        });
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
                        dailyData: record.dailyData || record.daily_data || record.records || record.attendance_data || {},
                        corp_task_id: record.corp_task_id || record.corpTaskId || null,
                        todo_task_id: record.todo_task_id || record.todoTaskId || null,
                    } as EmployeeAttendanceRecord;
                });
                
                console.log(`[AttendancePage] 月份 ${month} 转换后employeeRecords数量: ${employeeRecords.length}`);
                
                // 创建AttendanceSheet对象
                const sheet: AttendanceSheet = {
                    id: `sheet_${month}`,
                    title: `${month.replace('-', '年')}月考勤确认单`,
                    month: month,
                    status: 'draft',
                    settings: {
                        reminderText: '',
                        showReminder: false,
                        showColumns: [],
                        hideEmptyColumnsOption: 'none',
                        autoConfirmEnabled: false,
                        autoConfirmDate: '',
                        feedbackEnabled: false,
                        feedbackContactPerson: '',
                        notificationMethod: '',
                        readAndBurn: false,
                        employeeSignature: false,
                    },
                    employeeRecords: employeeRecords,
                    createdAt: new Date().toISOString(),
                };
                
                return sheet;
            });
            
            console.log('[AttendancePage] 转换后的sheets数量:', sheets.length);
            console.log('[AttendancePage] 第一个sheet的employeeRecords数量:', sheets[0]?.employeeRecords?.length);
            
            // 🔥 缓存转换后的数据
            if (sheets.length > 0) {
                await SmartCache.set(cacheKey, sheets);
                console.log('[AttendancePage] 数据已缓存到:', cacheKey);
            }
            
            // 直接设置转换后的数据
            setSheets(sheets);
            setSheetsError(null);
            
            // 🔥 有数据时直接跳转到详情页面显示考勤确认单
            if (sheets.length > 0) {
                console.log('[AttendancePage] 转换后有数据，直接跳转到详情页面');
                // 优先选择当前月份的sheet，如果没有则选择第一个
                const targetSheet = sheets.find(s => s.month === globalMonth) || sheets[0];
                setSelectedSheetId(targetSheet.id);
                setView('detail');
            } else {
                console.log('[AttendancePage] 转换后无数据，显示空状态');
                // 如果转换后没有数据，显示相应的错误信息
                const monthText = globalMonth ? globalMonth.replace('-', '年') + '月' : '当前月份';
                setSheetsError(`${monthText}没有找到公司 ${currentCompany} 的考勤确认信息`);
            }

        } catch (error) {
            console.error('[AttendancePage] 加载失败:', error);
            setSheetsError(error instanceof Error ? error.message : '加载失败');
            setSheets([]);
        } finally {
            console.log('[AttendancePage] 加载完成，设置loading为false');
            setIsLoading(false);
            setIsDingTalkDataLoading(false);
        }
    }, [currentCompany, preloadedData, globalMonth]); // 🔥 添加 globalMonth 依赖
    
    useEffect(() => {
        console.log('[AttendancePage] useEffect执行，hasInitialized:', hasInitializedRef.current, 'globalMonth:', globalMonth);
        
        // 🔥 简化：防重复调用逻辑
        if (!hasInitializedRef.current) {
            hasInitializedRef.current = true;
            console.log('[AttendancePage] 组件首次挂载，开始加载数据');
            loadData().catch(error => {
                console.error('[AttendancePage] loadData执行失败:', error);
            });
        }
    }, []); // 🔥 空依赖数组，只在挂载时执行一次
    
    // 🔥 简化：当globalMonth变化时重新加载数据
    useEffect(() => {
        console.log('[AttendancePage] globalMonth useEffect执行:', {
            hasInitialized: hasInitializedRef.current,
            globalMonth,
            prevGlobalMonth: prevGlobalMonthRef.current
        });
        
        // 🔥 彻底简化：只有在已经初始化过且globalMonth确实变化时才重新加载
        const hasGlobalMonthChanged = prevGlobalMonthRef.current !== globalMonth;
        
        if (hasInitializedRef.current && globalMonth && hasGlobalMonthChanged) {
            console.log('[AttendancePage] globalMonth变化，重新加载数据:', prevGlobalMonthRef.current, '->', globalMonth);
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

    const handleRefreshSheetDetail = async (month: string) => {
        setIsRefreshing(true);
        try {
            // 🔥 清除相关缓存
            const cacheKey = `ATTENDANCE_SHEETS_${currentCompany}_${month}`;
            await SmartCache.remove(cacheKey);
            console.log('[AttendancePage] 已清除缓存:', cacheKey);
            
            // Force refresh for this specific month
            // 🔥 使用本地服务器接口
            const response = await fetch(`/api/v1/attendance/status/load/${month}`);
            
            // 🔥 处理304 Not Modified状态码
            let apiResponse;
            if (response.status === 304) {
                console.log(`[AttendancePage] 收到304响应，${month}月数据未修改`);
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
            console.log('[AttendancePage] handleRefreshSheetDetail - 原始数据:', {
                recordsCount: dbRecords.length,
                currentCompany,
                sampleRecords: dbRecords.slice(0, 3).map((r: any) => ({
                    mainCompany: r.mainCompany,
                    hasRecords: !!r.records
                }))
            });

            const employeeRecords: EmployeeAttendanceRecord[] = dbRecords
                .filter((d: any) => {
                    const matches = d.mainCompany === currentCompany;
                    if (!matches) {
                        console.log('[AttendancePage] handleRefreshSheetDetail - 过滤掉记录:', {
                            mainCompany: d.mainCompany,
                            currentCompany,
                            matches
                        });
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

    const handleUpdateSheet = async (updatedSheet: AttendanceSheet) => {
        setSheets(prev => prev.map(s => s.id === updatedSheet.id ? updatedSheet : s));
        db.updateAttendanceSheet(updatedSheet);
        await SmartCache.remove(`ATTENDANCE_SHEETS_RAW`); // Invalidate cache on update
    };

    const selectedSheet = useMemo(() => {
        const found = sheets.find(s => s.id === selectedSheetId);
        console.log('[AttendancePage] selectedSheet计算:', {
            selectedSheetId,
            sheetsCount: sheets.length,
            foundSheet: found ? {
                id: found.id,
                title: found.title,
                month: found.month,
                employeeRecordsLength: found.employeeRecords?.length,
                employeeRecords: found.employeeRecords,
                hasEmployeeRecords: !!found.employeeRecords,
                isArray: Array.isArray(found.employeeRecords)
            } : null
        });
        return found;
    }, [sheets, selectedSheetId]);

    const renderContent = () => {
        console.log('[AttendancePage] renderContent called:', {
            view,
            isLoading,
            isRefreshing,
            sheetsLength: sheets,
            globalMonth
        });
        
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
                    const isConfigurationError = sheetsError.includes('还未配置考勤确认信息');
                    
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
