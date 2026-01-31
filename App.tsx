
import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage.tsx';
import { AttendancePage } from './components/attendance/AttendancePage.tsx';
import { AttendanceDashboardPage } from './components/attendance/dashboard/AttendanceDashboardPage.tsx';
import { EmployeeListPage } from './components/attendance/employee/EmployeeListPage.tsx';
import { ParameterSettingsPage } from './components/settings/ParameterSettings';
import { AttendanceRulesPage } from './components/settings/AttendanceRules.tsx';
import { AdminPage } from './components/admin/AdminPage.tsx';
import { ModelManagementPage } from './components/admin/ModelManagementPage.tsx';
import { LogManagementPage } from './components/admin/LogManagementPage.tsx';
import { DirectMonthPicker } from './components/DirectMonthPicker.tsx';
import useLocalStorage from './hooks/useLocalStorage.ts';
import type { User, Page, EmployeeAttendanceRecord } from './database/schema.ts';
import {
    AttendanceLogoIcon,
    LogOutIcon,
    PanelLeftCloseIcon,
    PanelLeftOpenIcon,
    MenuIcon,
    ClipboardListIcon,
    UsersIcon,
    SettingsIcon,
    BarChartIcon,
    ShieldCheckIcon,
    RulesIcon,
    BrainIcon,
    DatabaseIcon
} from './components/Icons.tsx';
import { getDefaultMonth, SmartCache } from './components/attendance/utils.ts';

// A simple media query hook to detect screen size
const useMediaQuery = (query: string) => {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mediaQueryList = window.matchMedia(query);
        const listener = (event: MediaQueryListEvent) => setMatches(event.matches);
        mediaQueryList.addEventListener('change', listener);
        return () => mediaQueryList.removeEventListener('change', listener);
    }, [query]);
    return matches;
};

const SidebarItem: React.FC<{ icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void, isCollapsed: boolean }> = ({ icon, label, isActive, onClick, isCollapsed }) => (
    <button
        onClick={onClick}
        title={isCollapsed ? label : ""}
        className={`w-full flex items-center gap-3 py-3 text-sm font-medium rounded-lg transition-colors ${isCollapsed ? 'justify-center px-3' : 'px-4'
            } ${isActive ? 'bg-sky-100 text-sky-600 dark:bg-sky-600/20 dark:text-sky-300' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white'
            }`}
    >
        {icon}
        {!isCollapsed && <span className="whitespace-nowrap">{label}</span>}
    </button>
);

const Sidebar: React.FC<{
    user: User,
    currentPage: Page,
    onNavigate: (page: Page) => void,
    onLogout: () => void,
    isCollapsed: boolean,
    onToggle: () => void,
    isMobile?: boolean,
    currentCompany: string,
    onCompanyChange: (company: string) => void,
    isDisabled?: boolean,
    globalMonth: string,
    onGlobalMonthChange: (month: string) => void
}> = ({ user, currentPage, onNavigate, onLogout, isCollapsed, onToggle, isMobile, currentCompany, onCompanyChange, isDisabled, globalMonth, onGlobalMonthChange }) => {

    // Permission Checks
    const hasPermission = (key: string) => user.permissions?.includes(key);

    return (
        <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 p-4 flex flex-col transition-all duration-300 h-full`}>
            <div className={`flex items-center gap-3 mb-6 transition-all duration-300 ${isCollapsed ? 'justify-center' : ''}`}>
                <AttendanceLogoIcon className="w-8 h-8 flex-shrink-0 text-sky-600 dark:text-sky-400" />
                {!isCollapsed && <h1 className="text-xl font-bold text-slate-900 dark:text-white whitespace-nowrap overflow-hidden">考勤管理系统</h1>}
            </div>

            {/* Global Company Selector */}
            {!isCollapsed && (
                <div className="mb-4 px-1">
                    <div className="relative">
                        <select
                            value={currentCompany}
                            onChange={(e) => onCompanyChange(e.target.value)}
                            disabled={isDisabled}
                            className={`w-full appearance-none bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 py-2 pl-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-opacity ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <option value="eyewind">风眼 (Eyewind)</option>
                            <option value="hydodo">海多多 (Hydodo)</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Month Picker - 直接展示月份选择器，无需点击 */}
            {!isCollapsed && (
                <div className="mb-6 px-1">
                    <DirectMonthPicker
                        value={globalMonth}
                        onChange={onGlobalMonthChange}
                        disabled={isDisabled}
                        className="w-full"
                    />
                </div>
            )}

            <nav className="flex-1 space-y-2 overflow-y-auto">
                {hasPermission('employee_list:view') && (
                    <SidebarItem icon={<UsersIcon className="w-5 h-5" />} label="员工列表" isActive={currentPage === 'attendanceEmployee'} onClick={() => onNavigate('attendanceEmployee')} isCollapsed={isCollapsed} />
                )}

                {hasPermission('attendance_dashboard:view') && (
                    <SidebarItem icon={<BarChartIcon className="w-5 h-5" />} label="考勤仪表盘" isActive={currentPage === 'attendanceAdmin'} onClick={() => onNavigate('attendanceAdmin')} isCollapsed={isCollapsed} />
                )}

                {hasPermission('attendance_verification:view') && (
                    <SidebarItem icon={<ClipboardListIcon className="w-5 h-5" />} label="考勤确认" isActive={currentPage === 'attendanceManagement'} onClick={() => onNavigate('attendanceManagement')} isCollapsed={isCollapsed} />
                )}

                <div className="my-4 border-t border-slate-100 dark:border-slate-700/50"></div>

                {hasPermission('admin:settings') && (
                    <SidebarItem icon={<RulesIcon className="w-5 h-5" />} label="考勤规则" isActive={currentPage === 'attendanceRules'} onClick={() => onNavigate('attendanceRules')} isCollapsed={isCollapsed} />
                )}

                {(hasPermission('admin:users') || hasPermission('admin:roles')) && (
                    <SidebarItem icon={<ShieldCheckIcon className="w-5 h-5" />} label="账号管理" isActive={currentPage === 'adminAccount'} onClick={() => onNavigate('adminAccount')} isCollapsed={isCollapsed} />
                )}

                {hasPermission('admin:settings') && (
                    <SidebarItem icon={<SettingsIcon className="w-5 h-5" />} label="参数管理" isActive={currentPage === 'parameterSettings'} onClick={() => onNavigate('parameterSettings')} isCollapsed={isCollapsed} />
                )}

                {hasPermission('admin:settings') && (
                    <SidebarItem icon={<BrainIcon className="w-5 h-5" />} label="模型管理" isActive={currentPage === 'modelManagement'} onClick={() => onNavigate('modelManagement')} isCollapsed={isCollapsed} />
                )}

                {hasPermission('admin:settings') && (
                    <SidebarItem icon={<DatabaseIcon className="w-5 h-5" />} label="日志管理" isActive={currentPage === 'logManagement'} onClick={() => onNavigate('logManagement')} isCollapsed={isCollapsed} />
                )}

            </nav>

            <div className="mt-auto pt-2">
                <SidebarItem icon={<LogOutIcon className="w-5 h-5" />} label="登出" isActive={false} onClick={onLogout} isCollapsed={isCollapsed} />

                <button
                    onClick={onToggle}
                    aria-label={isMobile ? "关闭菜单" : (isCollapsed ? "展开侧边栏" : "收起侧边栏")}
                    className={`w-full flex items-center gap-3 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white mt-4 border-t border-slate-200 dark:border-slate-700 py-3 transition-colors ${isCollapsed ? 'justify-center px-3' : 'px-4'
                        }`}
                >
                    {isCollapsed ? <PanelLeftOpenIcon className="w-5 h-5" /> : <PanelLeftCloseIcon className="w-5 h-5" />}
                    {!isCollapsed && <span className="whitespace-nowrap">{isMobile ? "关闭" : "收起"}</span>}
                </button>
            </div>
        </aside>
    );
};

type Theme = 'light' | 'dark' | 'system';

export interface AttendanceDashboardState {
    view: { type: 'dashboard' | 'employeeList' | 'calendar' | 'allEmployees'; companyName?: string };
    month: string;
    targetEmployee?: { userId: string; name: string }; // 用于跳转到特定员工
}

const App: React.FC = () => {
    const [user, setUser] = useState<User | null>(null);
    const [page, setPage] = useState<Page>('attendanceEmployee'); // Default to Employee List
    const [theme] = useLocalStorage<Theme>('theme', 'system');

    // Global Company State (Persisted)
    const [currentCompany, setCurrentCompany] = useLocalStorage<string>('currentCompany', 'eyewind');

    // 🔥 Global Month State (Persisted) - 全局月份状态
    const [globalMonth, setGlobalMonth] = useLocalStorage<string>('globalMonth', getDefaultMonth());

    // Global Loading State for Sidebar
    const [isGlobalLoading, setGlobalLoading] = useState(false);

    // Attendance Preload State
    const [attendancePreloadData, setAttendancePreloadData] = useState<{ data: EmployeeAttendanceRecord[]; month: string; mainCompany: string } | null>(null);
    // Key to force reset AttendancePage when navigating from sidebar
    const [attendanceManagementKey, setAttendanceManagementKey] = useState(0);

    // Attendance Dashboard Persisted State
    const [attendanceDashboardState, setAttendanceDashboardState] = useState<AttendanceDashboardState>({
        view: { type: 'dashboard' },
        month: globalMonth // 🔥 使用全局月份状态初始化
    });

    // Responsive navigation state
    const isMobile = useMediaQuery('(max-width: 1023px)');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

    // 🔥 全局月份变更处理函数
    const handleGlobalMonthChange = (newMonth: string) => {
        console.log('[App] 全局月份变更:', newMonth);
        setGlobalMonth(newMonth);
        
        // 同步更新考勤仪表盘状态
        setAttendanceDashboardState(prev => ({
            ...prev,
            month: newMonth
        }));
        
        // 如果当前在考勤确认页面，重置预加载数据以触发重新加载
        if (page === 'attendanceManagement') {
            setAttendancePreloadData(null);
            setAttendanceManagementKey(prev => prev + 1);
        }
    };

    useEffect(() => {
        const root = window.document.documentElement;
        const applyTheme = () => {
            const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
            root.classList.toggle('dark', isDark);
        };
        applyTheme();
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', applyTheme);
            return () => mediaQuery.removeEventListener('change', applyTheme);
        }
    }, [theme]);

    useEffect(() => {
        if (!isMobile) setIsMobileNavOpen(false);
    }, [isMobile]);

    const handleLogin = (loggedInUser: User) => {
        setUser(loggedInUser);
        // Redirect logic based on permissions
        if (loggedInUser.permissions?.includes('employee_list:view')) setPage('attendanceEmployee');
        else if (loggedInUser.permissions?.includes('attendance_dashboard:view')) setPage('attendanceAdmin');
        else if (loggedInUser.permissions?.includes('attendance_verification:view')) setPage('attendanceManagement');
        else setPage('help'); // Fallback
    };
    const handleLogout = () => setUser(null);

    const handleNavigate = async (newPage: Page) => {
        if (newPage === 'attendanceManagement') {
            setAttendancePreloadData(null);
            await SmartCache.remove('ATTENDANCE_SHEETS_RAW');
            setAttendanceManagementKey(prev => prev + 1);
        }
        setPage(newPage);
        if (isMobile) setIsMobileNavOpen(false);
    };

    const handleNavigateToConfirmation = (data: EmployeeAttendanceRecord[], month: string, mainCompany: string) => {
        setAttendancePreloadData({ data, month, mainCompany });
        setAttendanceManagementKey(prev => prev + 1);
        setPage('attendanceManagement');
    };

    if (!user) {
        return <LoginPage onLogin={handleLogin} />;
    }

    const renderContent = () => {
        switch (page) {
            case 'attendanceEmployee':
                return user.permissions?.includes('employee_list:view') ? <EmployeeListPage currentCompany={currentCompany} onLoadingChange={setGlobalLoading} /> : <div>无权限访问</div>;
            case 'parameterSettings':
                return user.permissions?.includes('admin:settings') ? <ParameterSettingsPage /> : <div>无权限访问</div>;
            case 'attendanceRules':
                return user.permissions?.includes('admin:settings') ? <AttendanceRulesPage /> : <div>无权限访问</div>;
            case 'adminAccount':
                return (user.permissions?.includes('admin:users') || user.permissions?.includes('admin:roles')) ? <AdminPage /> : <div>无权限访问</div>;
            case 'modelManagement':
                return user.permissions?.includes('admin:settings') ? <ModelManagementPage /> : <div>无权限访问</div>;
            case 'logManagement':
                return user.permissions?.includes('admin:settings') ? <LogManagementPage companyId={currentCompany as 'eyewind' | 'hydodo'} /> : <div>无权限访问</div>;
            case 'attendanceManagement':
                return user.permissions?.includes('attendance_verification:view') ? <AttendancePage
                    key={attendanceManagementKey}
                    preloadedData={attendancePreloadData}
                    onBack={() => setPage('attendanceAdmin')}
                    currentCompany={currentCompany}
                    onLoadingChange={setGlobalLoading}
                    userPermissions={user.permissions} // Pass permissions
                    currentUserInfo={user} // Pass user info for audit logging
                    globalMonth={globalMonth} // 🔥 传递全局月份
                /> : <div>无权限访问</div>;
            case 'attendanceAdmin':
                return user.permissions?.includes('attendance_dashboard:view') ? <AttendanceDashboardPage
                    onNavigateToConfirmation={handleNavigateToConfirmation}
                    initialState={attendanceDashboardState}
                    onStateChange={setAttendanceDashboardState}
                    currentCompany={currentCompany}
                    onLoadingChange={setGlobalLoading}
                    userPermissions={user.permissions} // Pass permissions
                    currentUserInfo={user} // Pass user info for audit logging
                    globalMonth={globalMonth} // 🔥 传递全局月份
                    onGlobalMonthChange={handleGlobalMonthChange} // 🔥 传递月份变更回调
                /> : <div>无权限访问</div>;
            default:
                return <div>页面不存在</div>;
        }
    };

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans">
            <div className="hidden lg:block flex-shrink-0 sticky top-0 h-screen">
                <Sidebar
                    user={user}
                    currentPage={page}
                    onNavigate={handleNavigate}
                    onLogout={handleLogout}
                    isCollapsed={isSidebarCollapsed}
                    onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    isMobile={isMobile}
                    currentCompany={currentCompany}
                    onCompanyChange={setCurrentCompany}
                    isDisabled={isGlobalLoading}
                    globalMonth={globalMonth}
                    onGlobalMonthChange={handleGlobalMonthChange}
                />
            </div>

            {isMobile && (
                <>
                    <div
                        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 lg:hidden ${isMobileNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        onClick={() => setIsMobileNavOpen(false)}
                        aria-hidden="true"
                    ></div>
                    <div id="mobile-sidebar" className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                        <Sidebar
                            user={user}
                            currentPage={page}
                            onNavigate={handleNavigate}
                            onLogout={handleLogout}
                            isCollapsed={false}
                            onToggle={() => setIsMobileNavOpen(false)}
                            isMobile={isMobile}
                            currentCompany={currentCompany}
                            onCompanyChange={setCurrentCompany}
                            isDisabled={isGlobalLoading}
                            globalMonth={globalMonth}
                            onGlobalMonthChange={handleGlobalMonthChange}
                        />
                    </div>
                </>
            )}

            <main className="flex-1 min-w-0">
                <header className="sticky top-0 z-30 lg:hidden flex items-center justify-between p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                    <button
                        onClick={() => setIsMobileNavOpen(true)}
                        className="text-slate-600 dark:text-slate-300 p-1 -ml-1"
                        aria-label="打开导航菜单"
                    >
                        <MenuIcon className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-2">
                        <AttendanceLogoIcon className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                        <h1 className="text-lg font-bold text-slate-800 dark:text-white">考勤管理</h1>
                    </div>
                    <div className="w-8 h-8"></div>
                </header>

                <div className="p-6 lg:p-8">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default App;
