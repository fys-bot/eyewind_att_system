
import React, { useState, useEffect, useMemo } from 'react';
import type { DingTalkUser, EmployeeStats } from '../../../database/schema.ts';
import { Loader2Icon, RefreshCwIcon, SparklesIcon, ChevronRightIcon, XIcon } from '../../Icons.tsx';
import { EmployeeTableView } from '../dashboard/AttendanceEmployeeList.tsx';
import { EmployeeDetailModal } from '../dashboard/AttendanceModals.tsx';
import { fetchCompanyData, SmartCache, getDateRangeForDefaultMonth } from '../utils.ts';
import { analyzeTeamAttendance } from '../../../services/aiChatService.ts';
import { getCachedAnalysis, setCachedAnalysis, getTeamAnalysisCacheKey } from '../../../services/aiCacheService.ts';
import { Modal } from '../../Modal.tsx';
import { MarkdownRenderer } from '../dashboard/MarkdownRenderer.tsx';

export const EmployeeListPage: React.FC<{ currentCompany: string; onLoadingChange?: (loading: boolean) => void }> = ({ currentCompany, onLoadingChange }) => {
    const [allUsers, setAllUsers] = useState<DingTalkUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // For Detail Modal
    const [detailUserStack, setDetailUserStack] = useState<DingTalkUser[]>([]);

    // AI Team Analysis
    const [showTeamAnalysis, setShowTeamAnalysis] = useState(false);
    const [teamAnalysis, setTeamAnalysis] = useState<string | null>(null);
    const [isAnalysing, setIsAnalysing] = useState(false);
    const [selectedDepartment, setSelectedDepartment] = useState<string>('全部');

    const handleSelectUserForDetail = (user: DingTalkUser) => setDetailUserStack(prev => [...prev, user]);
    const handleDetailModalBack = () => setDetailUserStack(prev => prev.slice(0, -1));
    const handleDetailModalClose = () => setDetailUserStack([]);

    // 当切换公司主体时，清空 AI 分析结果和部门选择
    useEffect(() => {
        setTeamAnalysis(null);
        setShowTeamAnalysis(false);
        setSelectedDepartment('全部');
    }, [currentCompany]);

    // 获取部门列表（去重，提取独立部门名称）
    const departments = useMemo(() => {
        const deptSet = new Set<string>();
        allUsers.forEach(user => {
            if (user.department) {
                // 如果部门名称包含"、"，则拆分为独立部门
                const depts = user.department.split('、');
                depts.forEach(dept => {
                    const trimmed = dept.trim();
                    if (trimmed) deptSet.add(trimmed);
                });
            }
        });
        return ['全部', ...Array.from(deptSet).sort()];
    }, [allUsers]);

    // 部门统计数据
    const departmentStats = useMemo(() => {
        const targetUsers = selectedDepartment === '全部' 
            ? allUsers 
            : allUsers.filter(u => u.department?.split('、').map(d => d.trim()).includes(selectedDepartment));
        
        return {
            totalCount: targetUsers.length,
            activeCount: targetUsers.filter(u => u.active).length,
            departments: selectedDepartment === '全部' ? departments.length - 1 : 1
        };
    }, [allUsers, selectedDepartment, departments]);

    // Effect to notify parent about loading state
    useEffect(() => {
        const loading = isLoading || isRefreshing;
        onLoadingChange?.(loading);
    }, [isLoading, isRefreshing, onLoadingChange]);

    // AI 团队分析
    const handleTeamAnalysis = async (forceRefresh = false) => {
        // 先显示弹框和加载状态
        setShowTeamAnalysis(true);
        setIsAnalysing(true);
        
        const { year, month } = getDateRangeForDefaultMonth();
        const cacheKey = getTeamAnalysisCacheKey(selectedDepartment + '_' + currentCompany, year, month);
        
        // 检查缓存（非强制刷新时）
        if (!forceRefresh) {
            const cachedContent = await getCachedAnalysis(cacheKey);
            if (cachedContent) {
                setTeamAnalysis(cachedContent);
                setIsAnalysing(false);
                return;
            }
        }
        
        // 没有缓存或强制刷新，清空之前的分析结果
        setTeamAnalysis(null);
        
        const targetUsers = selectedDepartment === '全部' 
            ? allUsers 
            : allUsers.filter(u => u.department?.split('、').map(d => d.trim()).includes(selectedDepartment));
        
        // 生成员工详细信息列表（包含职位）
        const memberDetails = targetUsers.map(u => {
            const isLeader = u.leader_in_dept?.some(l => l.leader);
            return `${u.name}（${u.title || '未设置职位'}${isLeader ? '，主管' : ''}）`;
        }).join('、');
        
        const prompt = `
请分析${selectedDepartment === '全部' ? '公司全体' : `"${selectedDepartment}"部门`}的团队情况：

基本信息：
- 公司：${currentCompany === 'eyewind' ? '风眼科技' : '海多多'}
- 分析范围：${selectedDepartment === '全部' ? '全公司' : selectedDepartment}
- 总人数：${targetUsers.length}
- 在职人数：${targetUsers.filter(u => u.active).length}

人员构成：
${selectedDepartment === '全部' 
    ? `- 部门数量：${departments.length - 1}\n- 各部门人数：${departments.slice(1).map(d => `${d}(${allUsers.filter(u => u.department?.split('、').map(dp => dp.trim()).includes(d)).length}人)`).join('、')}`
    : `- 部门主管：${targetUsers.filter(u => u.leader_in_dept?.some(l => l.leader)).map(u => `${u.name}（${u.title || '未设置职位'}）`).join('、') || '无'}
- 部门成员详情：${memberDetails}`
}

请提供：
1. 团队结构分析（基于每个成员的实际职位进行分析）
2. 人员配置建议（根据成员的实际职位给出建议）
3. 团队管理建议（2-3条）

注意：请严格根据每个成员的实际职位进行分析，不要臆测或更改成员的职位。
        `.trim();

        try {
            const response = await analyzeTeamAttendance(prompt);
            setTeamAnalysis(response.content);
            setCachedAnalysis(cacheKey, response.content, 'employee').catch(console.error);
        } catch (err) {
            console.error(err);
            setTeamAnalysis("AI 分析生成失败，请稍后重试。");
        } finally {
            setIsAnalysing(false);
        }
    };

    const loadData = async (forceRefresh = false) => {
        setIsLoading(true);
        if (forceRefresh) setIsRefreshing(true);
        setError(null);

        // Get standard date range based on 1-5th rule
        const { fromDate, toDate, year, month } = getDateRangeForDefaultMonth();

        if (forceRefresh) {
            const cacheKey = `ATTENDANCE_DATA_${currentCompany}_${fromDate}_${toDate}`;
            await SmartCache.remove(cacheKey);
        }

        try {
            // We use fetchCompanyData to get the employee list. 
            // It fetches punch data too, which is fine as it enriches the user object (for last punch etc if needed later)
            const data = await fetchCompanyData(currentCompany, fromDate, toDate, year, month);
            const uniqueUsers = Array.from(new Map(data.employees.map(u => [u.userid, u])).values());
            setAllUsers(uniqueUsers);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : "加载数据失败。");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [currentCompany]);

    const handleManualRefresh = () => {
        loadData(true);
    };

    if (isLoading && !isRefreshing) {
        return (
            <div className="flex flex-col justify-center items-center h-64">
                <Loader2Icon className="w-12 h-12 animate-spin text-sky-500" />
                <p className="mt-4 text-slate-500 dark:text-slate-400">正在加载员工名录...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 bg-red-100 dark:bg-red-900/50 rounded-lg text-red-700 dark:text-red-300">
                <p className="font-bold">加载失败</p>
                <p className="text-sm mt-1">{error}</p>
                <button onClick={() => loadData()} className="mt-4 px-4 py-2 bg-white dark:bg-red-800 rounded text-sm font-semibold shadow-sm">重试</button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <header className="flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 dark:text-white">员工列表</h2>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">
                        当前查看: <span className="font-semibold text-sky-600 dark:text-sky-400">{currentCompany === 'eyewind' ? '风眼 (Eyewind)' : '海多多 (Hydodo)'}</span>
                        <span className="mx-2">·</span>
                        <span className="text-slate-500">共 {allUsers.length} 人</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm"
                    >
                        {departments.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                        ))}
                    </select>
                    <button
                        onClick={handleTeamAnalysis}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
                    >
                        <SparklesIcon className="w-4 h-4" />
                        {selectedDepartment === '全部' ? 'AI 团队分析' : `AI 团队分析（${selectedDepartment}）`}
                    </button>
                    <button
                        onClick={handleManualRefresh}
                        disabled={isRefreshing}
                        className="p-2 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm transition-all"
                        title="刷新列表"
                    >
                        <RefreshCwIcon className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </header>

            {/* Removed internal padding/bg to let EmployeeTableView handle layout better with sticky headers */}
            <div className=""> 
                <EmployeeTableView 
                    users={allUsers} 
                    onBack={() => {}} 
                    onViewDetails={handleSelectUserForDetail} 
                    showBackButton={false}
                />
            </div>

            {detailUserStack.length > 0 && (
                <EmployeeDetailModal 
                    user={detailUserStack[detailUserStack.length - 1]} 
                    onClose={handleDetailModalClose} 
                    allUsers={allUsers} 
                    onSelectUser={handleSelectUserForDetail} 
                    onGoBack={handleDetailModalBack} 
                    stackDepth={detailUserStack.length} 
                />
            )}

            {/* AI 团队分析弹框 */}
            <Modal isOpen={showTeamAnalysis} onClose={() => setShowTeamAnalysis(false)} title={`AI 团队分析 - ${selectedDepartment}`} size="xl">
                <div className="space-y-4">
                    {/* 统计卡片 */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-slate-900 dark:text-white">{departmentStats.totalCount}</div>
                            <div className="text-xs text-slate-500">总人数</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-green-600">{departmentStats.activeCount}</div>
                            <div className="text-xs text-slate-500">在职人数</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-sky-600">{departmentStats.departments}</div>
                            <div className="text-xs text-slate-500">部门数</div>
                        </div>
                    </div>

                    {/* AI 分析内容 */}
                    <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-900 rounded-lg border border-indigo-100 dark:border-slate-700 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-indigo-500" />
                                <h4 className="font-bold text-indigo-900 dark:text-indigo-100">AI 分析报告</h4>
                            </div>
                            {teamAnalysis && !isAnalysing && (
                                <button
                                    onClick={() => handleTeamAnalysis(true)}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded transition-colors"
                                >
                                    <RefreshCwIcon className="w-3 h-3" />
                                    重新分析
                                </button>
                            )}
                        </div>
                        {isAnalysing ? (
                            <div className="flex items-center justify-center gap-2 py-12">
                                <Loader2Icon className="w-6 h-6 animate-spin text-indigo-500" />
                                <span className="text-slate-500">AI 正在分析团队数据...</span>
                            </div>
                        ) : teamAnalysis ? (
                            <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                <MarkdownRenderer text={teamAnalysis} />
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-400">
                                正在加载分析结果...
                            </div>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
};
