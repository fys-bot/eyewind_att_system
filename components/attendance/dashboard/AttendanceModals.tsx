
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { DingTalkUser, DailyAttendanceStatus, PunchRecord, AttendanceMap, EmployeeStats } from '../../../database/schema.ts';
import { Modal } from '../../Modal.tsx';
import { Avatar, ProcessDetailCard } from './AttendanceShared.tsx';
import { ArrowLeftIcon, XIcon, Loader2Icon, ChevronRightIcon, LinkIcon, FileTextIcon, ChevronUpIcon, ChevronDownIcon, SparklesIcon, RefreshCwIcon, BarChartIcon, PieChartIcon, CalendarIcon, CheckCircleIcon, AlertTriangleIcon, ClockIcon, DollarSignIcon, TrendingUpIcon, UserIcon, NetworkIcon, ShieldCheckIcon } from '../../Icons.tsx';
import { getLateMinutes, isFullDayLeave, calculateDailyLeaveDuration, checkTimeInLeaveRange } from '../utils.ts';
import { analyzeAttendanceInsights } from '../../../services/aiChatService.ts';
import { db } from '../../../database/mockDb.ts';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { getCachedAnalysis, setCachedAnalysis, getEmployeeAnalysisCacheKey } from '../../../services/aiCacheService.ts';

// ... (MarkdownRenderer, InfoRow, BooleanBadge, DepartmentMembersModal, EmployeeDetailModal remain unchanged) ...
// Re-inserting helper components for completeness.

// --- Helper for Markdown ---
const MarkdownRenderer: React.FC<{ text: string }> = ({ text }) => {
    const parseLineToReact = (line: string): React.ReactNode => {
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    // 解析表格
    const parseTable = (lines: string[], startIndex: number): { element: React.ReactNode; endIndex: number } | null => {
        const tableLines: string[] = [];
        let i = startIndex;
        
        // 收集连续的表格行
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
            tableLines.push(lines[i].trim());
            i++;
        }
        
        if (tableLines.length < 2) return null; // 至少需要表头和分隔行
        
        // 检查是否有分隔行 (|---|---|)
        const separatorIndex = tableLines.findIndex(line => /^\|[\s\-:|]+\|$/.test(line));
        if (separatorIndex === -1) return null;
        
        const headerLines = tableLines.slice(0, separatorIndex);
        const bodyLines = tableLines.slice(separatorIndex + 1);
        
        const parseRow = (line: string): string[] => {
            return line.split('|').slice(1, -1).map(cell => cell.trim());
        };
        
        const headers = headerLines.length > 0 ? parseRow(headerLines[0]) : [];
        const rows = bodyLines.map(line => parseRow(line));
        
        const element = (
            <div key={`table-${startIndex}`} className="my-3 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                            {headers.map((header, idx) => (
                                <th key={idx} className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                                    {parseLineToReact(header)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIdx) => (
                            <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
                                {row.map((cell, cellIdx) => (
                                    <td key={cellIdx} className="px-3 py-2 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                        {parseLineToReact(cell)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
        
        return { element, endIndex: i - 1 };
    };

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    
    while (i < lines.length) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // 检查是否是表格开始
        if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|')) {
            const tableResult = parseTable(lines, i);
            if (tableResult) {
                elements.push(tableResult.element);
                i = tableResult.endIndex + 1;
                continue;
            }
        }
        
        if (!trimmedLine) {
            elements.push(<div key={i} className="h-1" />);
            i++;
            continue;
        }

        if (trimmedLine === '---') {
            elements.push(<hr key={i} className="my-4 border-slate-200 dark:border-slate-700" />);
            i++;
            continue;
        }

        // Headers (Handling #, ##, ###, ####)
        const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
        if (headerMatch) {
            const level = headerMatch[1].length;
            const content = parseLineToReact(headerMatch[2]);
            const sizes = ['text-xl', 'text-lg', 'text-base', 'text-sm font-bold', 'text-sm', 'text-xs'];
            const sizeClass = sizes[level - 1] || 'text-base';
            const colorClass = level <= 2 ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200';
            elements.push(<h4 key={i} className={`font-bold ${sizeClass} ${colorClass} mt-3 mb-1`}>{content}</h4>);
            i++;
            continue;
        }

        // List items (bullets or numbers) with indentation support
        const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)/);
        if (listMatch) {
            const indentSpaces = listMatch[1].length;
            const indentLevel = Math.floor(indentSpaces / 2);
            const paddingLeftClass = indentLevel === 0 ? '' : indentLevel === 1 ? 'pl-4' : indentLevel === 2 ? 'pl-8' : 'pl-12';

            elements.push(
                <div key={i} className={`flex items-start gap-2 ${paddingLeftClass}`}>
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                    <div className="flex-1">{parseLineToReact(listMatch[3])}</div>
                </div>
            );
            i++;
            continue;
        }

        elements.push(<p key={i}>{parseLineToReact(line)}</p>);
        i++;
    }

    return (
        <div className="text-sm text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
            {elements}
        </div>
    );
};

const InfoRow: React.FC<{ label: string; value: React.ReactNode; fullWidth?: boolean }> = ({ label, value, fullWidth = false }) => (
    <div className={`flex flex-col ${fullWidth ? 'sm:col-span-2' : ''}`}>
        <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</span>
        <div className="text-sm font-medium text-slate-900 dark:text-white break-words">
            {value ?? <span className="text-slate-400 font-normal italic">N/A</span>}
        </div>
    </div>
);

const BooleanBadge: React.FC<{ value?: boolean, trueText?: string, falseText?: string }> = ({ value, trueText = '是', falseText = '否' }) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${value ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
        {value ? trueText : falseText}
    </span>
);

const DepartmentMembersModal: React.FC<any> = ({ departmentName, members, onClose, onSelectUser }) => {
    // Separate members into leaders and others
    const { leaders, others } = useMemo(() => {
        const leaders: DingTalkUser[] = [];
        const others: DingTalkUser[] = [];

        members.forEach(member => {
            const isLeader = member.leader_in_dept && member.leader_in_dept.some(d => d.leader);
            if (isLeader) {
                leaders.push(member);
            } else {
                others.push(member);
            }
        });
        return { leaders, others };
    }, [members]);

    const UserListItem: React.FC<{ user: DingTalkUser, isLeader?: boolean }> = ({ user, isLeader }) => (
        <div
            onClick={() => onSelectUser(user)}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-600"
        >
            <div className="relative">
                <Avatar name={user.name} avatarUrl={user.avatar} size="sm" />
                {isLeader && (
                    <div className="absolute -bottom-1 -right-1 bg-yellow-100 text-yellow-700 border border-yellow-200 text-[9px] px-1 rounded-full font-bold shadow-sm">
                        主管
                    </div>
                )}
            </div>
            <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    {user.name}
                    {!user.active && <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded">离职</span>}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{user.title || '员工'}</p>
            </div>
        </div>
    );

    return (
        <Modal isOpen={true} onClose={onClose} title={`${departmentName} - 成员列表`} size="lg">
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
                {leaders.length > 0 && (
                    <div>
                        <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 pl-1">
                            部门主管 ({leaders.length})
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {leaders.map(user => <UserListItem key={user.userid} user={user} isLeader />)}
                        </div>
                    </div>
                )}

                <div>
                    <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 pl-1">
                        部门员工 ({others.length})
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {others.map(user => <UserListItem key={user.userid} user={user} />)}
                    </div>
                    {others.length === 0 && <p className="text-sm text-slate-400 italic pl-1">暂无其他员工</p>}
                </div>
            </div>
        </Modal>
    );
};

export const EmployeeDetailModal: React.FC<any> = ({ user, onClose, allUsers, onSelectUser, onGoBack, stackDepth }) => {
    const [showDeptModal, setShowDeptModal] = useState(false);

    const manager = useMemo(() => {
        if (!user || !user.dept_id_list || user.dept_id_list.length === 0) return null;
        for (const deptId of user.dept_id_list) {
            const potentialManager = allUsers.find(u => u.userid !== user.userid && u.leader_in_dept?.some(d => d.dept_id === deptId && d.leader));
            if (potentialManager) return potentialManager;
        }
        return null;
    }, [user, allUsers]);

    // Calculate colleagues in the same department(s)
    const deptMembers = useMemo(() => {
        if (!user || !user.dept_id_list || !showDeptModal) return [];
        const userDeptIds = new Set(user.dept_id_list);

        return allUsers.filter(u => {
            return u.dept_id_list?.some(id => userDeptIds.has(id));
        });
    }, [user, allUsers, showDeptModal]);

    if (!user) return null;

    const formatDate = (dateInput?: string | number) => {
        if (!dateInput) return 'N/A';
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const isLeader = user.leader_in_dept?.some(d => d.leader) ?? false;
    const roles = user.role_list?.map(r => r.name).join(', ') || null;

    return (
        <>
            <Modal isOpen={!!user} onClose={onClose} size="xl" hideCloseButton={true}>
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        {stackDepth > 1 && (
                            <button onClick={onGoBack} title="返回" className="p-1.5 -ml-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                <ArrowLeftIcon className="w-5 h-5" />
                            </button>
                        )}
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">员工档案</h3>
                    </div>
                    <button onClick={onClose} title="关闭" className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Profile Card */}
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 mb-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-sky-100/50 dark:bg-sky-900/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

                    <Avatar name={user.name} avatarUrl={user.avatar} size="lg" />

                    <div className="flex-1 text-center sm:text-left space-y-2 z-10">
                        <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-3 justify-center sm:justify-start">
                            <h2 className="text-3xl font-bold text-slate-900 dark:text-white leading-none">{user.name}</h2>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${user.active ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900' : 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'}`}>
                                {user.active ? '在职' : '离职'}
                            </span>
                        </div>
                        {user.title && <p className="text-base text-slate-600 dark:text-slate-300 font-medium">{user.title}</p>}

                        <div className="flex flex-wrap gap-3 justify-center sm:justify-start pt-2">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 shadow-sm">
                                <span className="text-slate-400 dark:text-slate-500">工号</span>
                                <span className="font-mono font-semibold">{user.job_number || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 shadow-sm">
                                <span className="text-slate-400 dark:text-slate-500">入职</span>
                                <span className="font-medium">{formatDate(user.hired_date || user.create_time)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="space-y-8 px-1">
                    {/* Basic Info */}
                    <section>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <UserIcon className="w-4 h-4 text-sky-500" /> 基本信息
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
                            <InfoRow label="手机号" value={user.mobile} />
                            <InfoRow label="所属公司" value={user.mainCompany} />
                            <InfoRow label="用户ID (UserID)" value={user.userid} />
                            <InfoRow label="UnionID" value={user.unionid} />
                        </div>
                    </section>

                    {/* Organization */}
                    <section>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <NetworkIcon className="w-4 h-4 text-sky-500" /> 组织架构
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8">
                            <InfoRow
                                label="部门"
                                value={
                                    <button
                                        onClick={() => setShowDeptModal(true)}
                                        className="text-left font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 px-2 -ml-2 py-1 rounded transition-colors"
                                        title="点击查看部门成员"
                                    >
                                        {user.department || '未分配'}
                                    </button>
                                }
                            />
                            <InfoRow label="直属主管" value={manager ? <button onClick={() => onSelectUser(manager)} className="text-sky-600 dark:text-sky-400 hover:underline font-bold transition-colors">{manager.name}</button> : null} />
                            <InfoRow label="部门主管" value={<BooleanBadge value={isLeader} />} />
                            <InfoRow label="角色" value={roles} fullWidth />
                        </div>
                    </section>

                    {/* Permissions */}
                    <section>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <ShieldCheckIcon className="w-4 h-4 text-sky-500" /> 权限与设置
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-4">
                            <InfoRow label="管理员" value={<BooleanBadge value={user.admin} />} />
                            <InfoRow label="老板" value={<BooleanBadge value={user.boss} />} />
                            <InfoRow label="高管" value={<BooleanBadge value={user.senior} />} />
                            <InfoRow label="隐藏手机号" value={<BooleanBadge value={user.hide_mobile} />} />
                            <InfoRow label="专属账号" value={<BooleanBadge value={user.exclusive_account} />} />
                            <InfoRow label="实名认证" value={<BooleanBadge value={user.real_authed} />} />
                        </div>
                    </section>
                </div>
            </Modal>

            {/* Department Members Modal */}
            {showDeptModal && (
                <DepartmentMembersModal
                    departmentName={user.department || '未命名部门'}
                    members={deptMembers}
                    onClose={() => setShowDeptModal(false)}
                    onSelectUser={(u) => {
                        setShowDeptModal(false);
                        onSelectUser(u);
                    }}
                />
            )}
        </>
    );
};

export const EmployeeAttendanceAnalysisModal: React.FC<any> = ({
    employee, onClose, onVerify, attendanceData, processDataMap = {}, year, month
}) => {
    const [analysis, setAnalysis] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    
    // 使用 ref 跟踪当前员工 ID，防止异步请求竞态条件
    const currentEmployeeIdRef = useRef<string | null>(null);

    // AI 分析函数
    const runEmployeeAnalysis = async (forceRefresh = false) => {
        if (!employee || !year || !month) return;
        
        const currentUserId = employee.user.userid;
        // 更新当前员工 ID
        currentEmployeeIdRef.current = currentUserId;
        
        // 先清空之前的分析结果
        setAnalysis(null);
        
        // 生成缓存 key
        const cacheKey = getEmployeeAnalysisCacheKey(currentUserId, year, month);
        
        // 检查缓存（非强制刷新时）
        if (!forceRefresh) {
            try {
                const cachedContent = await getCachedAnalysis(cacheKey);
                // 检查是否仍然是同一个员工
                if (currentEmployeeIdRef.current !== currentUserId) {
                    return; // 员工已切换，丢弃结果
                }
                if (cachedContent) {
                    // 使用缓存的结果
                    setAnalysis(cachedContent);
                    return;
                }
            } catch (err) {
                console.error("Cache check failed", err);
            }
        }
        
        // 缓存不存在或强制刷新，调用 AI 接口
        setLoading(true);
        
        // 构建提示词
        const prompt = `
请为员工"${employee.user.name}"提供考勤管理建议：

考勤数据：
- 迟到次数：${employee.stats.late} 次
- 迟到原始时长：${employee.stats.lateMinutes || 0} 分钟
- 豁免后迟到时长：${employee.stats.exemptedLateMinutes} 分钟（说明：公司有迟到豁免政策，每月前3次且单次≤15分钟的迟到可豁免，豁免后时长=原始时长-已豁免时长）
- 缺卡次数：${employee.stats.missing} 次
- 旷工次数：${employee.stats.absenteeism || 0} 次
- 加班时长：${employee.stats.overtimeTotalMinutes || 0} 分钟
${employee.user.title ? `- 职位：${employee.user.title}` : ''}
${employee.user.department ? `- 部门：${employee.user.department}` : ''}

请提供：
1. 考勤情况评估（注意：分析迟到情况时请基于"豁免后迟到时长"，这是扣除豁免后的实际计入考核的迟到时长）
2. 存在的问题分析
3. 具体改进建议
        `.trim();

        try {
            const response = await analyzeAttendanceInsights(prompt);
            // 检查是否仍然是同一个员工
            if (currentEmployeeIdRef.current !== currentUserId) {
                return; // 员工已切换，丢弃结果
            }
            setAnalysis(response.content);
            // 保存到缓存
            setCachedAnalysis(cacheKey, response.content, 'employee').catch(console.error);
        } catch (err) {
            // 检查是否仍然是同一个员工
            if (currentEmployeeIdRef.current !== currentUserId) {
                return; // 员工已切换，丢弃错误
            }
            console.error(err);
            setAnalysis("AI 分析生成失败，请稍后重试。");
        } finally {
            // 检查是否仍然是同一个员工
            if (currentEmployeeIdRef.current === currentUserId) {
                setLoading(false);
            }
        }
    };

    // 当员工变化时，清空之前的分析结果并重新分析
    useEffect(() => {
        // 清空之前的分析结果
        setAnalysis(null);
        setLoading(false);
        
        if (employee && year && month) {
            runEmployeeAnalysis();
        }
    }, [employee?.user?.userid, year, month]);

    const leaveDetails = useMemo(() => {
        if (!attendanceData) return {};
        const details: Record<string, string[]> = {};

        Object.entries(attendanceData).forEach(([dayStr, daily]) => {
            (daily as DailyAttendanceStatus).records.forEach((record) => {
                if (record.procInstId && processDataMap[record.procInstId]) {
                    const p = processDataMap[record.procInstId];
                    const type = p.formValues?.leaveType || p.bizType;
                    if (!type) return;

                    if (!details[type]) details[type] = [];
                    const start = p.formValues?.start || p.formValues?.startTime;
                    const end = p.formValues?.end || p.formValues?.endTime;
                    const duration = p.formValues?.duration;
                    const unit = p.formValues?.durationUnit === 'day' ? '天' : '小时';

                    const detailStr = `${start} 至 ${end} (共${duration}${unit})`;
                    if (!details[type].includes(detailStr)) {
                        details[type].push(detailStr);
                    }
                }
            });
        });
        return details;
    }, [attendanceData, processDataMap]);

    if (!employee) return null;

    const { user, stats } = employee;

    const isRisk = stats.exemptedLateMinutes > 30 || stats.missing > 3 || (stats as any).absenteeism >= 1;

    const leaveData = [
        { name: '事假', value: stats.personalHours, color: '#fbbf24' },
        { name: '病假', value: stats.sickHours, color: '#f43f5e' },
        { name: '年假', value: stats.annualHours, color: '#818cf8' },
        { name: '调休', value: stats.compTimeHours, color: '#2dd4bf' },
        { name: '丧假', value: stats.bereavementHours, color: '#64748b' }, // Explicitly show Bereavement
        { name: '婚假', value: stats.marriageHours, color: '#ec4899' },
        { name: '产假', value: stats.maternityHours, color: '#d946ef' },
        { name: '陪产假', value: stats.paternityHours, color: '#a855f7' },
    ].filter(d => d.value > 0);

    const overtimeData = [
        { name: '19:30+', value: stats.overtime19_5Minutes },
        { name: '20:30+', value: stats.overtime20_5Minutes },
        { name: '22:00+', value: stats.overtime22Minutes },
        { name: '24:00+', value: stats.overtime24Minutes },
    ];

    const totalOvertime = stats.overtimeTotalMinutes || 0;
    const totalLeaveHours = leaveData.reduce((sum, item) => sum + (item.value || 0), 0);

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const { name, value, fill } = payload[0];
            const details = leaveDetails[name] || [];
            return (
                <div className="bg-white/95 backdrop-blur-sm dark:bg-slate-800/95 p-3 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl text-sm z-50 min-w-[200px] max-w-[300px]">
                    <p className="font-bold mb-2 flex items-center gap-2 text-slate-800 dark:text-slate-100">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: fill }}></span>
                        {name}: {value}小时
                    </p>
                    {details.length > 0 ? (
                        <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                            {details.map((d, i) => <li key={i} className="leading-snug flex items-start"><span className="mr-1">•</span>{d}</li>)}
                        </ul>
                    ) : (
                        <p className="text-xs text-slate-400">无详细记录</p>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <Modal isOpen={!!employee} onClose={onClose} size="2xl" hideCloseButton={true}>
            <div className="flex gap-5 mb-6">
                <div className="flex-shrink-0">
                    <Avatar name={user.name} avatarUrl={user.avatar} size="lg" />
                </div>
                <div className="flex-1 flex flex-col justify-center min-w-0">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{user.name}</h3>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {user.department || '未分配部门'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {onVerify && (
                                <button onClick={onVerify} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all text-sm font-bold">
                                    <CalendarIcon className="w-4 h-4" /> 去校对
                                </button>
                            )}
                            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"><XIcon className="w-6 h-6" /></button>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                        {stats.isFullAttendance ? (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50 text-xs font-bold"><CheckCircleIcon className="w-3.5 h-3.5" /><span>全勤</span></div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 text-xs font-bold"><span>非全勤</span></div>
                        )}
                        {(stats.performancePenalty || 0) > 0 ? (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50 text-xs font-bold"><DollarSignIcon className="w-3.5 h-3.5" /><span>绩效扣除: {stats.performancePenalty}</span></div>
                        ) : stats.isFullAttendance ? (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50 text-xs font-bold"><DollarSignIcon className="w-3.5 h-3.5" /><span>全勤奖: +{(stats as any).fullAttendanceBonus || 0}</span></div>
                        ) : null}
                        {isRisk && (
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50 text-xs font-bold animate-pulse"><AlertTriangleIcon className="w-3.5 h-3.5" /><span>纪律风险人员</span></div>
                        )}
                    </div>
                </div>
            </div>

            {/* High-level Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50 flex flex-col items-center justify-center">
                    <span className="text-xs text-blue-500 font-bold uppercase tracking-wider mb-1">加班总时长</span>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        {totalOvertime} <span className="text-sm font-normal">分</span>
                    </div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-100 dark:border-orange-800/50 flex flex-col items-center justify-center">
                    <span className="text-xs text-orange-500 font-bold uppercase tracking-wider mb-1">迟到 (豁免后)</span>
                    <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                        {stats.late} <span className="text-sm font-normal">次</span> / {stats.exemptedLateMinutes} <span className="text-sm font-normal">分</span>
                    </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-100 dark:border-purple-800/50 flex flex-col items-center justify-center">
                    <span className="text-xs text-purple-500 font-bold uppercase tracking-wider mb-1">请假/调休总计</span>
                    <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {totalLeaveHours} <span className="text-sm font-normal">小时</span>
                    </div>
                </div>
            </div>

            {/* Chart Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="h-64 bg-white dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2"><PieChartIcon className="w-4 h-4" /> 休假构成</h4>
                    {leaveData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={leaveData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={leaveData.length > 1 ? 5 : 0} dataKey="value">
                                    {leaveData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-2"><PieChartIcon className="w-8 h-8 opacity-50 text-slate-400 dark:text-slate-600" /></div>
                            本月无请假记录
                        </div>
                    )}
                </div>
                {/* Overtime Chart */}
                <div className="h-64 bg-white dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2"><BarChartIcon className="w-4 h-4" /> 加班分布 (分钟)</h4>
                    {totalOvertime > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={overtimeData}>
                                <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} formatter={(value: number) => [`${value} 分钟`, '加班时长']} />
                                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-2"><BarChartIcon className="w-8 h-8 opacity-50 text-slate-400 dark:text-slate-600" /></div>
                            本月无加班记录
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-800 dark:to-slate-900 p-6 rounded-xl border border-indigo-100 dark:border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><SparklesIcon className="w-24 h-24 text-indigo-500" /></div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                    <h4 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 flex items-center gap-2"><SparklesIcon className="w-5 h-5 text-indigo-500" />AI 智能管理建议</h4>
                    <div className="flex items-center gap-2">
                        {loading && <div className="flex items-center gap-2 text-xs text-indigo-500"><Loader2Icon className="w-3 h-3 animate-spin" /> 分析中...</div>}
                        {analysis && !loading && (
                            <button
                                onClick={() => runEmployeeAnalysis(true)}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded transition-colors"
                            >
                                <RefreshCwIcon className="w-3 h-3" />
                                重新分析
                            </button>
                        )}
                    </div>
                </div>
                <div className="relative z-10 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {loading ? (
                        <div className="space-y-3 animate-pulse">
                            <div className="h-4 bg-indigo-200/50 dark:bg-slate-700 rounded w-3/4"></div>
                            <div className="h-4 bg-indigo-200/50 dark:bg-slate-700 rounded w-full"></div>
                            <div className="h-4 bg-indigo-200/50 dark:bg-slate-700 rounded w-5/6"></div>
                        </div>
                    ) : (
                        <div>{analysis ? <MarkdownRenderer text={analysis} /> : <p className="text-slate-500 italic text-sm">无法生成分析结果。</p>}</div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

// --- Punch Detail Modal ---
export const PunchDetailModal: React.FC<{
    attendanceMap: AttendanceMap;
    detail: { user: DingTalkUser; day: number; status: DailyAttendanceStatus } | null;
    month: string;
    onClose: () => void;
    mainCompany?: string;
    processDataMap: Record<string, any>;
    holidays: any;
}> = ({ detail, onClose, processDataMap, month, holidays }) => {

    const [viewProcessId, setViewProcessId] = useState<string | null>(null);

    if (!detail) return null;
    const { user, day, status } = detail;

    // Filter OnDuty and OffDuty records
    const onDutyList = status.records.filter(r => r.checkType === 'OnDuty');
    const offDutyList = status.records.filter(r => r.checkType === 'OffDuty');

    // Sort helper
    const compareTime = (a: PunchRecord, b: PunchRecord) => {
        const tA = a.userCheckTime || a.baseCheckTime || 0;
        const tB = b.userCheckTime || b.baseCheckTime || 0;
        return tA - tB;
    };

    onDutyList.sort(compareTime);
    offDutyList.sort(compareTime);

    const sortedRecords: PunchRecord[] = [];
    if (onDutyList.length > 0) sortedRecords.push(onDutyList[0]);
    if (offDutyList.length > 0) sortedRecords.push(offDutyList[offDutyList.length - 1]);

    // Check aggregate daily leave duration
    // Parse month/year from input 'month' string (YYYY-MM) and 'day'
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const dateKey = `${monthStr}-${String(day).padStart(2, '0')}`;
    const totalDailyLeaveHours = calculateDailyLeaveDuration(status.records, processDataMap, year, dateKey, user.mainCompany);
    const isFullDayLeaveCombined = totalDailyLeaveHours >= 8;


    // Helper: Analyze missing punch time based on Leave process
    const getDisplayTime = (record: PunchRecord) => {
        if (record.userCheckTime) {
            return new Date(record.userCheckTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }

        // It's a missing punch (or NotSigned)
        if (record.timeResult === 'NotSigned' || !record.userCheckTime) {
            // Priority Check: Is this specific punch time covered by a leave?
            const workStart = new Date(year, parseInt(monthStr) - 1, day, 9, 0, 0, 0);
            const workEnd = new Date(year, parseInt(monthStr) - 1, day, 18, 30, 0, 0);

            let covered = false;
            let leaveType = null;

            if (record.checkType === 'OnDuty') {
                const check = checkTimeInLeaveRange(processDataMap, status.records, workStart);
                covered = check.isCovered;
                leaveType = check.type;
            } else if (record.checkType === 'OffDuty') {
                const check = checkTimeInLeaveRange(processDataMap, status.records, workEnd);
                covered = check.isCovered;
                leaveType = check.type;
            }

            if (covered) {
                return leaveType || '正常';
            }

            // Fallback: Check for aggregate full day leave (legacy logic support)
            if (isFullDayLeaveCombined) {
                if (record.procInstId && processDataMap[record.procInstId]) {
                    const proc = processDataMap[record.procInstId];
                    return proc.formValues?.leaveType || proc.bizType || '请假';
                }
                const anyProcessRec = status.records.find(r => r.procInstId);
                if (anyProcessRec && processDataMap[anyProcessRec.procInstId!]) {
                    const proc = processDataMap[anyProcessRec.procInstId!];
                    return proc.formValues?.leaveType || proc.bizType || '请假';
                }
                return '请假';
            }

            // Fallback to existing manual heuristic if above fails (e.g. data map inconsistency)
            if (record.procInstId && processDataMap[record.procInstId]) {
                const proc = processDataMap[record.procInstId];
                const { start, end, startTime, endTime } = proc.formValues || {};

                if (record.checkType === 'OffDuty') {
                    const s = start || startTime;
                    if (s && typeof s === 'string') {
                        const timePart = s.split(' ')[1];
                        if (timePart) return `缺卡 (${timePart})`;
                    }
                } else if (record.checkType === 'OnDuty') {
                    const e = end || endTime;
                    if (e && typeof e === 'string') {
                        const timePart = e.split(' ')[1];
                        if (timePart) return `缺卡 (${timePart})`;
                    }
                }
            }
            return '缺卡';
        }
        return '未打卡';
    };

    // Helper: Format base check time
    const formatBaseTime = (timestamp: number | undefined) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <>
            <Modal isOpen={!!detail} onClose={onClose} title={`${user.name} - ${day}日打卡详情`} size="lg">
                <div className="space-y-6">
                    <div>
                        <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                            <ClockIcon className="w-4 h-4" /> 打卡记录
                        </h4>
                        {sortedRecords.length === 0 ? (
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded text-center text-slate-500 text-sm">
                                无打卡记录
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {sortedRecords.map((record, idx) => {
                                    const displayTime = getDisplayTime(record);
                                    // Adjust style if it's treated as Leave instead of Missing or Late
                                    const isLeaveDisplay = displayTime !== '缺卡' && !displayTime.startsWith('缺卡') && !record.userCheckTime;
                                    const isLate = record.timeResult === 'Late';

                                    return (
                                        <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 text-sm shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <span className={`font-bold px-2 py-0.5 rounded text-xs ${record.checkType === 'OnDuty' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'}`}>
                                                    {record.checkType === 'OnDuty' ? '上班' : '下班'}
                                                </span>
                                                <div className="flex flex-col">
                                                    <span className={`font-mono text-base ${record.userCheckTime ? 'text-slate-800 dark:text-slate-200' : isLeaveDisplay ? 'text-slate-500 dark:text-slate-400 italic' : 'text-red-500 dark:text-red-400 font-bold'}`}>
                                                        {displayTime || ''}
                                                    </span>
                                                    {record.baseCheckTime > 0 && (
                                                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                                            基准: {formatBaseTime(record?.baseCheckTime)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded">
                                                    {record.sourceType_Desc || record.sourceType || ''}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${isLate ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                                                    record.timeResult === 'Normal' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' :
                                                        record.timeResult === 'Early' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                                            record.timeResult === 'NotSigned' ? (isLeaveDisplay ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400') :
                                                                'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                                    }`}>
                                                    {isLeaveDisplay ? displayTime : (isLate ? '迟到' : (record.timeResult_Desc || record.timeResult || ''))}
                                                </span>

                                                {/* Show Approval Link if exists */}
                                                {record.procInstId && processDataMap[record.procInstId] && (
                                                    <button
                                                        onClick={() => setViewProcessId(record.procInstId!)}
                                                        className="flex items-center gap-1 ml-2 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
                                                    >
                                                        <FileTextIcon className="w-3 h-3" />
                                                        关联审批
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            {/* Nested Modal for Process Details */}
            {viewProcessId && (
                <div className="relative z-[60]"> {/* Higher z-index to overlay previous modal if needed */}
                    <Modal isOpen={true} onClose={() => setViewProcessId(null)} title={'审批详情'} size="md">
                        <ProcessDetailCard processInfo={processDataMap[viewProcessId]} />
                        <div className="mt-4 flex justify-end">
                            <button onClick={() => setViewProcessId(null)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded text-sm text-slate-700 dark:text-slate-300">关闭</button>
                        </div>
                    </Modal>
                </div>
            )}
        </>
    );
};
