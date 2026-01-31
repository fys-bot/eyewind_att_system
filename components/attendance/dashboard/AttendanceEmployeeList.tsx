
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { DingTalkUser } from '../../../database/schema.ts';
import { ArrowLeftIcon, SearchIcon, ChevronUpIcon, ChevronDownIcon, ChevronRightIcon, ChevronsUpDownIcon, FilterIcon, CalendarIcon, XCircleIcon, BarChartIcon, PieChartIcon, UsersIcon, TrendingUpIcon, UserIcon, NetworkIcon, XIcon, ClockIcon } from '../../Icons.tsx';
import { Avatar } from './AttendanceShared.tsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, AreaChart, Area, CartesianGrid } from 'recharts';
import { Modal } from '../../Modal.tsx';

// --- Shared Logic ---
const getTenureBucket = (entryDateStr: string | number | undefined): string => {
    if (!entryDateStr) return 'Unknown';
    const now = new Date();
    const joinDate = new Date(entryDateStr);
    const days = (now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24);
    const years = days / 365;

    if (years < 0.5) return '< 6个月';
    if (years < 1) return '6个月-1年';
    if (years < 3) return '1-3年';
    if (years < 5) return '3-5年';
    return '> 5年';
};

// --- Org Tree Modal Component ---
const OrgTreeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    departmentName: string;
    users: DingTalkUser[];
    onSelectUser: (user: DingTalkUser) => void;
}> = ({ isOpen, onClose, departmentName, users, onSelectUser }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg" title={`${departmentName} - 组织架构`}>
            <div className="p-2">
                <div className="border-l-2 border-slate-200 dark:border-slate-700 ml-4 space-y-4">
                    {/* Root Node: Department */}
                    <div className="relative pl-6">
                        <div className="absolute top-0 left-0 -ml-[9px] w-4 h-4 bg-white dark:bg-slate-800 border-2 border-sky-500 rounded-full flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-sky-500 rounded-full"></div>
                        </div>
                        <div className="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                            <NetworkIcon className="w-5 h-5 text-sky-500" />
                            {departmentName}
                            <span className="text-sm font-normal text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{users.length}人</span>
                        </div>
                        
                        {/* Users List (Leaf Nodes) */}
                        <div className="mt-4 space-y-2">
                            {users.map(user => (
                                <div 
                                    key={user.userid} 
                                    onClick={() => onSelectUser(user)}
                                    className="relative pl-8 py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors group"
                                >
                                    {/* Tree Connector */}
                                    <div className="absolute left-0 top-1/2 -mt-px w-6 h-px bg-slate-300 dark:bg-slate-600"></div>
                                    <div className="absolute left-0 top-0 bottom-1/2 w-px bg-slate-300 dark:bg-slate-600 -ml-px group-last:bottom-auto group-last:h-1/2"></div>
                                    
                                    <div className="relative">
                                        <Avatar name={user.name} avatarUrl={user.avatar} size="sm" />
                                        {!user.active && <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-slate-400 border-2 border-white dark:border-slate-800 rounded-full" title="离职"></div>}
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                            {user.name}
                                        </div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400">{user.title || '员工'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

// --- Data Visualization Component (Senior Admin View) ---
const EmployeeInsights: React.FC<{ 
    users: DingTalkUser[], // Fully filtered (for Overview & Dept)
    trendContextUsers: DingTalkUser[], // For Hiring Trend (ignores Date filter)
    tenureContextUsers: DingTalkUser[], // For Tenure (ignores Tenure filter)
    onUserSelect: (user: DingTalkUser) => void,
    onMonthSelect: (monthStr: string) => void,
    onTenureSelect: (bucket: string) => void
}> = ({ users, trendContextUsers, tenureContextUsers, onUserSelect, onMonthSelect, onTenureSelect }) => {
    const [selectedDeptTree, setSelectedDeptTree] = useState<string | null>(null);

    // 1. Department Distribution (Uses Fully Filtered Users)
    const deptData = useMemo(() => {
        const counts: Record<string, number> = {};
        users.forEach(u => {
            if (!u.active) return;
            const dept = u.department?.split(',')[0] || '未分配'; 
            counts[dept] = (counts[dept] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5); 
    }, [users]);

    // 2. Tenure Distribution (Uses Context Users that ignore Tenure Filter)
    const { tenureData, avgTenure } = useMemo(() => {
        const now = new Date();
        const buckets = { '< 6个月': 0, '6个月-1年': 0, '1-3年': 0, '3-5年': 0, '> 5年': 0 };
        let totalDays = 0;
        let activeCount = 0;
        
        // Calculate average using the filtered list (users) to reflect current view accurately
        users.forEach(u => {
            if (!u.active) return;
            const entryDate = u.hired_date || u.create_time;
            if (!entryDate) return;
            const joinDate = new Date(entryDate);
            const days = (now.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24);
            totalDays += days;
            activeCount++;
        });
        const avg = activeCount > 0 ? (totalDays / 365 / activeCount).toFixed(1) : '0';

        // Calculate distribution using context users (so the chart doesn't shrink to 1 bar)
        tenureContextUsers.forEach(u => {
            if (!u.active) return;
            const entryDate = u.hired_date || u.create_time;
            if (!entryDate) return;
            const bucket = getTenureBucket(entryDate);
            // @ts-ignore
            if (buckets[bucket] !== undefined) buckets[bucket]++;
        });

        return {
            tenureData: Object.entries(buckets).map(([name, value]) => ({ name, value })),
            avgTenure: avg
        };
    }, [users, tenureContextUsers]);

    // 3. Hiring Trend (Uses Context Users that ignore Date Filter)
    const hiringTrend = useMemo(() => {
        const months: Record<string, number> = {};
        const now = new Date();
        // Init last 12 months
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            months[key] = 0;
        }

        trendContextUsers.forEach(u => {
            const entryDate = u.hired_date || u.create_time;
            if (!entryDate) return;
            const d = new Date(entryDate);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (months[key] !== undefined) months[key]++;
        });

        return Object.entries(months).map(([name, value]) => ({ name, value }));
    }, [trendContextUsers]);

    const TENURE_COLORS = ['#3b82f6', '#0ea5e9', '#10b981', '#f59e0b', '#6366f1'];

    const handleBarClick = (data: any) => {
        if (data && data.activeLabel) {
            setSelectedDeptTree(data.activeLabel);
        }
    };

    const getDeptUsers = (deptName: string) => {
        return users.filter(u => u.active && (u.department?.includes(deptName) || u.department === deptName));
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 flex-shrink-0">
            {/* Card 1: Overview */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between h-40">
                <div>
                    <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
                        <UsersIcon className="w-4 h-4" /> 人才概览
                    </h4>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-slate-900 dark:text-white">{users.filter(u => u.active).length}</span>
                        <span className="text-xs text-slate-500">在职员工</span>
                    </div>
                </div>
                <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500">平均司龄</span>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{avgTenure} 年</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-slate-500">部门总数</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{deptData.length}</span>
                    </div>
                </div>
            </div>

            {/* Card 2: Hiring Trend (Clickable) */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm h-40 group cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <TrendingUpIcon className="w-4 h-4 text-emerald-500" /> 人才引进趋势
                </h4>
                <div className="h-28 -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart 
                            data={hiringTrend} 
                            onClick={(data) => {
                                if (data && data.activeLabel) onMonthSelect(String(data.activeLabel));
                            }}
                        >
                            <defs>
                                <linearGradient id="colorHiring" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="name" hide />
                            <RechartsTooltip 
                                contentStyle={{borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                                labelStyle={{color: '#64748b', marginBottom: '4px'}}
                                formatter={(value: number) => [`${value} 人`, '入职']}
                            />
                            <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#colorHiring)" strokeWidth={2} activeDot={{ r: 6, cursor: 'pointer' }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Card 3: Department Distribution (Clickable) */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm h-40 relative group cursor-pointer hover:border-sky-300 dark:hover:border-sky-700 transition-colors">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <BarChartIcon className="w-4 h-4 text-sky-500" /> 组织架构分布 (Top 5)
                </h4>
                <div className="absolute top-4 right-4 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">点击查看架构</div>
                <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={deptData} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }} barCategoryGap={2} onClick={handleBarClick}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={60} tick={{fontSize: 9, fill: '#64748b'}} interval={0} />
                            <RechartsTooltip cursor={{fill: 'rgba(59, 130, 246, 0.1)'}} contentStyle={{borderRadius: '8px', fontSize: '12px'}} />
                            <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={8} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Card 4: Tenure Structure (Clickable) */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm h-40 group cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-indigo-500" /> 司龄结构
                </h4>
                <div className="h-28 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie 
                                data={tenureData} 
                                cx="50%" 
                                cy="50%" 
                                innerRadius={25} 
                                outerRadius={40} 
                                paddingAngle={2} 
                                dataKey="value"
                                onClick={(data) => onTenureSelect(data.name)}
                            >
                                {tenureData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={TENURE_COLORS[index % TENURE_COLORS.length]} style={{ outline: 'none' }} className="hover:opacity-80 transition-opacity" />
                                ))}
                            </Pie>
                            <RechartsTooltip contentStyle={{borderRadius: '8px', fontSize: '12px'}} />
                            <Legend layout="vertical" verticalAlign="middle" align="right" iconSize={6} wrapperStyle={{fontSize: '9px', right: -10}} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Org Tree Modal */}
            {selectedDeptTree && (
                <OrgTreeModal 
                    isOpen={!!selectedDeptTree} 
                    onClose={() => setSelectedDeptTree(null)} 
                    departmentName={selectedDeptTree}
                    users={getDeptUsers(selectedDeptTree)}
                    onSelectUser={(u) => {
                        setSelectedDeptTree(null);
                        onUserSelect(u);
                    }}
                />
            )}
        </div>
    );
};

export const EmployeeTableView: React.FC<{ 
    users: DingTalkUser[]; 
    onBack?: () => void; 
    onViewDetails: (user: DingTalkUser) => void; 
    showBackButton?: boolean;
    companyName?: string; 
}> = ({ users, onBack, onViewDetails, showBackButton = true, companyName }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]); // 选中的员工ID列表
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
    const [selectedTenures, setSelectedTenures] = useState<string[]>([]); // 改为数组支持多选
    const [sortConfig, setSortConfig] = useState<{ key: keyof DingTalkUser, direction: 'asc' | 'desc' } | null>(null);
    const [showDeptDropdown, setShowDeptDropdown] = useState(false); // 控制部门下拉框显示
    const [showTenureDropdown, setShowTenureDropdown] = useState(false); // 控制司龄下拉框显示
    const [employeeSearch, setEmployeeSearch] = useState(''); // 部门/员工搜索
    const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set()); // 展开的部门
    const dropdownRef = useRef<HTMLDivElement>(null);
    const tenureDropdownRef = useRef<HTMLDivElement>(null);

    // 点击外部关闭下拉框
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDeptDropdown(false);
            }
            if (tenureDropdownRef.current && !tenureDropdownRef.current.contains(event.target as Node)) {
                setShowTenureDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // 提取独立部门列表（去重，拆分组合部门）
    const uniqueDepartments = useMemo(() => {
        const deptSet = new Set<string>();
        users.forEach(u => {
            if (u.department) {
                // 拆分组合部门（如"策划部、运营部"）
                const depts = u.department.split('、');
                depts.forEach(dept => {
                    const trimmed = dept.trim();
                    if (trimmed) deptSet.add(trimmed);
                });
            }
        });
        return Array.from(deptSet).sort();
    }, [users]);

    // 按部门分组员工
    const employeesByDept = useMemo(() => {
        const grouped: Record<string, DingTalkUser[]> = {};
        uniqueDepartments.forEach(dept => {
            grouped[dept] = users.filter(u => 
                u.department?.split('、').map(d => d.trim()).includes(dept)
            );
        });
        return grouped;
    }, [users, uniqueDepartments]);

    // 过滤后的部门和员工（根据搜索词）
    const filteredDeptData = useMemo(() => {
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
        const allSelected = deptEmployeeIds.every(id => selectedEmployeeIds.includes(id));
        
        if (allSelected) {
            // 取消选中该部门所有员工
            setSelectedEmployeeIds(selectedEmployeeIds.filter(id => !deptEmployeeIds.includes(id)));
        } else {
            // 选中该部门所有员工
            const newSelected = new Set([...selectedEmployeeIds, ...deptEmployeeIds]);
            setSelectedEmployeeIds(Array.from(newSelected));
        }
    };

    // 检查部门是否全选
    const isDeptFullySelected = (dept: string) => {
        const deptEmployees = employeesByDept[dept] || [];
        if (deptEmployees.length === 0) return false;
        return deptEmployees.every(u => selectedEmployeeIds.includes(u.userid));
    };

    // 检查部门是否部分选中
    const isDeptPartiallySelected = (dept: string) => {
        const deptEmployees = employeesByDept[dept] || [];
        if (deptEmployees.length === 0) return false;
        const selectedCount = deptEmployees.filter(u => selectedEmployeeIds.includes(u.userid)).length;
        return selectedCount > 0 && selectedCount < deptEmployees.length;
    };

    // 员工多选处理
    const handleEmployeeToggle = (userId: string) => {
        if (selectedEmployeeIds.includes(userId)) {
            setSelectedEmployeeIds(selectedEmployeeIds.filter(id => id !== userId));
        } else {
            setSelectedEmployeeIds([...selectedEmployeeIds, userId]);
        }
    };

    // 获取选中员工的显示文本
    const selectedDisplay = useMemo(() => {
        if (selectedEmployeeIds.length === 0) return '全部员工';
        if (selectedEmployeeIds.length === 1) {
            const user = users.find(u => u.userid === selectedEmployeeIds[0]);
            return user?.name || '1 人';
        }
        // 检查是否选中了完整的部门
        for (const dept of uniqueDepartments) {
            const deptEmployees = employeesByDept[dept] || [];
            if (deptEmployees.length > 0 && deptEmployees.length === selectedEmployeeIds.length) {
                const allInDept = deptEmployees.every(u => selectedEmployeeIds.includes(u.userid));
                if (allInDept) {
                    return dept;
                }
            }
        }
        return `已选 ${selectedEmployeeIds.length} 人`;
    }, [selectedEmployeeIds, users, uniqueDepartments, employeesByDept]);

    // 司龄选项
    const tenureOptions = [
        '< 6个月',
        '6个月-1年', 
        '1-3年',
        '3-5年',
        '> 5年'
    ];

    // 1. Search & Employee Filter (Global Context)
    const contextUsers = useMemo(() => {
        return users.filter(user => {
            const lowerTerm = searchTerm.toLowerCase();
            const matchesSearch = 
                !lowerTerm ||
                user.name.toLowerCase().includes(lowerTerm) ||
                (user.job_number && user.job_number.toLowerCase().includes(lowerTerm)) ||
                (user.mobile && user.mobile.includes(lowerTerm)) ||
                (user.userid && user.userid.toLowerCase().includes(lowerTerm)) ||
                (user.unionid && user.unionid.toLowerCase().includes(lowerTerm)) ||
                (user.department && user.department.toLowerCase().includes(lowerTerm));

            // 员工筛选逻辑：如果选中了员工，则只显示选中的员工
            const matchesEmployee = selectedEmployeeIds.length === 0 || selectedEmployeeIds.includes(user.userid);
            return matchesSearch && matchesEmployee;
        });
    }, [users, searchTerm, selectedEmployeeIds]);

    // 2. Trend Context (Ignores Date Range, Respects Tenure)
    const trendContextUsers = useMemo(() => {
        return contextUsers.filter(user => {
            let matchesTenure = true;
            if (selectedTenures.length > 0) {
                const joinTime = user.hired_date || user.create_time;
                if (!joinTime) {
                    matchesTenure = false;
                } else {
                    const bucket = getTenureBucket(joinTime);
                    matchesTenure = selectedTenures.includes(bucket);
                }
            }
            return matchesTenure;
        });
    }, [contextUsers, selectedTenures]);

    // 3. Tenure Context (Ignores Tenure, Respects Date Range)
    const tenureContextUsers = useMemo(() => {
        return contextUsers.filter(user => {
            let matchesDate = true;
            if (dateRange.start || dateRange.end) {
                const joinTime = user.hired_date || user.create_time;
                if (!joinTime) {
                    matchesDate = false;
                } else {
                    const joinDate = new Date(joinTime).getTime();
                    if (dateRange.start) {
                        matchesDate = matchesDate && joinDate >= new Date(dateRange.start).getTime();
                    }
                    if (dateRange.end) {
                        const endDate = new Date(dateRange.end);
                        endDate.setHours(23, 59, 59, 999);
                        matchesDate = matchesDate && joinDate <= endDate.getTime();
                    }
                }
            }
            return matchesDate;
        });
    }, [contextUsers, dateRange]);

    // 4. Fully Filtered Users (For Table, Overview, Dept Chart)
    const filteredUsers = useMemo(() => {
        // Intersection of trendUsers and tenureUsers logic (or simplified)
        return contextUsers.filter(user => {
            // Date Check
            let matchesDate = true;
            if (dateRange.start || dateRange.end) {
                const joinTime = user.hired_date || user.create_time;
                if (!joinTime) {
                    matchesDate = false;
                } else {
                    const joinDate = new Date(joinTime).getTime();
                    if (dateRange.start) {
                        matchesDate = matchesDate && joinDate >= new Date(dateRange.start).getTime();
                    }
                    if (dateRange.end) {
                        const endDate = new Date(dateRange.end);
                        endDate.setHours(23, 59, 59, 999);
                        matchesDate = matchesDate && joinDate <= endDate.getTime();
                    }
                }
            }

            // Tenure Check
            let matchesTenure = true;
            if (selectedTenures.length > 0) {
                const joinTime = user.hired_date || user.create_time;
                if (!joinTime) {
                    matchesTenure = false;
                } else {
                    const bucket = getTenureBucket(joinTime);
                    matchesTenure = selectedTenures.includes(bucket);
                }
            }

            return matchesDate && matchesTenure;
        });
    }, [contextUsers, dateRange, selectedTenures]);

    const sortedUsers = useMemo(() => {
        let sortableItems = [...filteredUsers];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key] || '';
                const bVal = b[sortConfig.key] || '';
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [filteredUsers, sortConfig]);

    const requestSort = (key: keyof DingTalkUser) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleChartDateSelect = (monthStr: string) => {
        // monthStr ex: "2023-10"
        const [y, m] = monthStr.split('-').map(Number);
        const start = `${monthStr}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const end = `${monthStr}-${lastDay}`;
        setDateRange({ start, end });
    };

    const handleChartTenureSelect = (bucket: string) => {
        setSelectedTenures(prev => {
            if (prev.includes(bucket)) {
                return prev.filter(t => t !== bucket);
            } else {
                return [...prev, bucket];
            }
        });
    };

    // 处理司龄多选
    const handleTenureToggle = (tenure: string) => {
        setSelectedTenures(prev => {
            if (prev.includes(tenure)) {
                return prev.filter(t => t !== tenure);
            } else {
                return [...prev, tenure];
            }
        });
    };

    // 清除所有筛选条件
    const clearAllFilters = () => {
        setSearchTerm('');
        setSelectedEmployeeIds([]);
        setDateRange({ start: '', end: '' });
        setSelectedTenures([]);
        setSortConfig(null);
    };

    // 检查是否有任何筛选条件
    const hasActiveFilters = searchTerm || selectedEmployeeIds.length > 0 || dateRange.start || dateRange.end || selectedTenures.length > 0;

    const SortableHeader: React.FC<{ sortKey: keyof DingTalkUser, label: string, className?: string }> = ({ sortKey, label, className = "" }) => (
        <th className={`px-4 py-3 cursor-pointer group whitespace-nowrap bg-slate-100 dark:bg-slate-800 z-20 sticky top-0 ${className}`} onClick={() => requestSort(sortKey)}>
            <div className="flex items-center gap-1">
                {label}
                <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                    {sortConfig?.key === sortKey ? (sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />) : <ChevronsUpDownIcon className="w-3.5 h-3.5 opacity-30" />}
                </span>
            </div>
        </th>
    );

    const formatDate = (ts?: string | number) => {
        if (!ts) return '-';
        return new Date(ts).toLocaleDateString('zh-CN');
    };

    const titleText = companyName ? `${companyName}员工列表` : '员工列表';

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] w-full">
            {/* Top Fixed Section: Header, Charts, Filters */}
            <div className="flex-shrink-0 bg-slate-50 dark:bg-slate-900 pb-2 z-30">
                <div className="flex justify-between items-center mb-4">
                    {showBackButton && onBack ? (
                        <div className="flex items-center gap-4">
                            <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                                <ArrowLeftIcon className="w-4 h-4" />
                                返回仪表盘
                            </button>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{titleText}</h2>
                        </div>
                    ) : (
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{titleText}</h2>
                    )}
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                        共 {sortedUsers.length} 位员工
                    </div>
                </div>

                {/* Insights Section with Callbacks */}
                <EmployeeInsights 
                    users={filteredUsers}
                    trendContextUsers={trendContextUsers}
                    tenureContextUsers={tenureContextUsers} 
                    onUserSelect={onViewDetails} 
                    onMonthSelect={handleChartDateSelect}
                    onTenureSelect={handleChartTenureSelect}
                />

                {/* Filter Bar */}
                <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-wrap gap-4 items-center">
                    {/* 返回全部列表按钮 - 只在有筛选条件时显示 */}
                    {hasActiveFilters && (
                        <button
                            onClick={clearAllFilters}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors border border-slate-200 dark:border-slate-600"
                        >
                            <XIcon className="w-3.5 h-3.5" />
                            返回全部列表
                        </button>
                    )}

                    {/* Search */}
                    <div className="relative w-full max-w-md">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="搜索姓名、工号、ID 或 UnionID..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md pl-9 pr-8 py-1.5 text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-sky-500 outline-none" 
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <XCircleIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Department-Employee Hierarchical Multi-Select Filter */}
                    <div className="relative" ref={dropdownRef}>
                        <div className="flex items-center gap-2">
                            <FilterIcon className="w-4 h-4 text-slate-400" />
                            <button
                                onClick={() => setShowDeptDropdown(!showDeptDropdown)}
                                className="flex items-center gap-2 min-w-[180px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-sky-500 outline-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <UsersIcon className="w-4 h-4 text-slate-400" />
                                <span className="flex-1 truncate text-left">{selectedDisplay}</span>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showDeptDropdown ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                        
                        {/* Hierarchical Dropdown */}
                        {showDeptDropdown && (
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
                                        onClick={() => setSelectedEmployeeIds(users.map(u => u.userid))}
                                        className="flex-1 text-xs py-1 bg-sky-50 text-sky-600 rounded hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400"
                                    >
                                        全选
                                    </button>
                                    <button
                                        onClick={() => setSelectedEmployeeIds([])}
                                        className="flex-1 text-xs py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400"
                                    >
                                        清空
                                    </button>
                                    <button
                                        onClick={() => setExpandedDepts(new Set(uniqueDepartments))}
                                        className="flex-1 text-xs py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400"
                                    >
                                        展开
                                    </button>
                                    <button
                                        onClick={() => setExpandedDepts(new Set())}
                                        className="flex-1 text-xs py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400"
                                    >
                                        收起
                                    </button>
                                </div>
                                {/* 部门-员工树形列表 */}
                                <div className="overflow-y-auto flex-1 p-2">
                                    {filteredDeptData.departments.map(dept => {
                                        const deptEmployees = filteredDeptData.employeesByDept[dept] || [];
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
                                                                    checked={selectedEmployeeIds.includes(user.userid)}
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
                                    {filteredDeptData.departments.length === 0 && (
                                        <div className="text-center py-4 text-slate-400 text-sm">
                                            未找到匹配的部门或员工
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Tenure Multi-Select Filter */}
                    <div className="relative" ref={tenureDropdownRef}>
                        <div className="flex items-center gap-2">
                            <ClockIcon className="w-4 h-4 text-slate-400" />
                            <button
                                onClick={() => setShowTenureDropdown(!showTenureDropdown)}
                                className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-sky-500 outline-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <span>
                                    {selectedTenures.length === 0 
                                        ? '所有司龄' 
                                        : selectedTenures.length === 1 
                                            ? selectedTenures[0] 
                                            : `已选择 ${selectedTenures.length} 个司龄`
                                    }
                                </span>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showTenureDropdown ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                        
                        {/* Dropdown */}
                        {showTenureDropdown && (
                            <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                                <div className="p-2">
                                    {tenureOptions.map(tenure => (
                                        <label key={tenure} className="flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedTenures.includes(tenure)}
                                                onChange={() => handleTenureToggle(tenure)}
                                                className="w-4 h-4 text-sky-600 bg-slate-100 border-slate-300 rounded focus:ring-sky-500 focus:ring-2"
                                            />
                                            <span className="text-sm text-slate-700 dark:text-slate-300">{tenure}</span>
                                        </label>
                                    ))}
                                </div>
                                {selectedTenures.length > 0 && (
                                    <div className="border-t border-slate-200 dark:border-slate-700 p-2">
                                        <button
                                            onClick={() => setSelectedTenures([])}
                                            className="w-full text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                                        >
                                            清除所有选择
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Date Range Filter */}
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5">
                        <CalendarIcon className="w-4 h-4 text-slate-400" />
                        <span className="text-xs text-slate-500">入职:</span>
                        <input 
                            type="date" 
                            value={dateRange.start}
                            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="bg-transparent text-sm text-slate-900 dark:text-white outline-none w-28" 
                        />
                        <span className="text-slate-400">-</span>
                        <input 
                            type="date" 
                            value={dateRange.end}
                            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="bg-transparent text-sm text-slate-900 dark:text-white outline-none w-28" 
                        />
                        {(dateRange.start || dateRange.end) && (
                            <button onClick={() => setDateRange({ start: '', end: '' })} className="ml-1 text-slate-400 hover:text-slate-600">
                                <XCircleIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Scrollable Table Section */}
            <div className="flex-1 overflow-hidden border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm relative">
                <div className="absolute inset-0 overflow-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800 sticky top-0 z-20 shadow-sm">
                            <tr>
                                <SortableHeader sortKey="name" label="姓名" className="pl-6" />
                                <SortableHeader sortKey="job_number" label="工号" />
                                <SortableHeader sortKey="department" label="部门" />
                                <SortableHeader sortKey="title" label="职位" />
                                <SortableHeader sortKey="hired_date" label="入职日期" />
                                <SortableHeader sortKey="active" label="状态" />
                                <SortableHeader sortKey="mobile" label="手机号" />
                                <SortableHeader sortKey="userid" label="系统 ID" className="text-slate-400" />
                                <th className="px-4 py-3 text-right pr-6 bg-slate-100 dark:bg-slate-800 sticky top-0 z-20">操作</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800/50 divide-y divide-slate-200 dark:divide-slate-700">
                            {sortedUsers.map(user => (
                                <tr
                                    onClick={() => onViewDetails(user)}
                                    key={user.userid}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer group"
                                >
                                    <td className="px-4 py-3 pl-6">
                                        <div className="flex items-center gap-3">
                                            <Avatar name={user.name} avatarUrl={user.avatar} size="sm" />
                                            <span className="font-semibold text-slate-900 dark:text-white">{user.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {user.job_number ? (
                                            <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded">
                                                {user.job_number}
                                            </span>
                                        ) : <span className="text-slate-300">-</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                                            {user.department || '未分配'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                        {user.title || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 font-mono text-xs">
                                        {formatDate(user.hired_date || user.create_time)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${user.active 
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' 
                                            : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${user.active ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                                            {user.active ? '在职' : '离职'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">
                                        {user.mobile || '-'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="font-mono text-xs text-slate-400 dark:text-slate-600 truncate max-w-[100px] block" title={`UserID: ${user.userid}\nUnionID: ${user.unionid}`}>
                                            {user.userid}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right pr-6">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onViewDetails(user); }}
                                            className="text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-medium text-xs transition-colors"
                                        >
                                            查看详情
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {sortedUsers.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                        未找到匹配的员工
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
