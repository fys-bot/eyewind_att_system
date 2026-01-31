
import type { User, Role, AttendanceSheet, EmployeeAttendanceRecord, AdminSettings, Project, AuditLog } from './schema.ts';

// --- DEFINED PERMISSIONS ---
export const ALL_PERMISSIONS = {
    '考勤确认': {
        'attendance_verification:view': '查看确认单列表',
        'attendance_verification:create': '创建/上传考勤表',
        'attendance_verification:edit': '编辑考勤明细',
        'attendance_verification:send': '发送钉钉通知/待办',
        'attendance_verification:recall': '撤回钉钉通知/待办',
        'attendance_verification:archive': '生成/下载存档',
    },
    '考勤仪表盘': {
        'attendance_dashboard:view': '查看仪表盘概览',
        'attendance_dashboard:export': '下载统计报表',
        'attendance_dashboard:calendar_view': '查看考勤日历',
        'attendance_dashboard:calendar_edit': '编辑日历 (补卡/修改状态)',
        'attendance_dashboard:ai_analysis': '查看AI智能分析',
    },
    '员工列表': {
        'employee_list:view': '查看员工列表',
        'employee_list:sync': '同步钉钉花名册',
    },
    '系统管理': {
        'admin:users': '用户账号管理',
        'admin:roles': '角色权限管理',
        'admin:settings': '全局参数配置',
    }
};

// --- MOCK DATA ---

let MOCK_AUDIT_LOGS: AuditLog[] = [
    {
        id: 'log_1',
        userId: 'user_2',
        userName: 'hr_manager',
        userRole: '人事经理',
        action: 'LOGIN',
        target: '系统',
        timestamp: Date.now() - 86400000
    },
    {
        id: 'log_2',
        userId: 'user_4',
        userName: 'finance_staff',
        userRole: '财务专员',
        action: 'DOWNLOAD',
        target: '2024年06月考勤报表',
        details: '下载了风眼(Eyewind)公司的考勤报表',
        timestamp: Date.now() - 43200000
    }
];

let MOCK_ROLES: Role[] = [
    { 
        id: 'role_admin', 
        name: '超级管理员', 
        description: '拥有系统所有权限', 
        permissions: [
            // 考勤确认
            'attendance_verification:view', 'attendance_verification:create', 'attendance_verification:edit', 
            'attendance_verification:send', 'attendance_verification:recall', 'attendance_verification:archive',
            // 考勤仪表盘
            'attendance_dashboard:view', 'attendance_dashboard:export', 'attendance_dashboard:calendar_view', 
            'attendance_dashboard:calendar_edit', 'attendance_dashboard:ai_analysis',
            // 员工列表
            'employee_list:view', 'employee_list:sync',
            // 系统管理
            'admin:users', 'admin:roles', 'admin:settings'
        ] 
    },
    { 
        id: 'role_hr_mgr', 
        name: '人事经理', 
        description: '负责考勤全流程管理，拥有编辑权限', 
        permissions: [
            'attendance_verification:view', 'attendance_verification:create', 'attendance_verification:edit', 
            'attendance_verification:send', 'attendance_verification:recall', 'attendance_verification:archive',
            'attendance_dashboard:view', 'attendance_dashboard:export', 'attendance_dashboard:calendar_view', 
            'attendance_dashboard:calendar_edit', 'attendance_dashboard:ai_analysis',
            'employee_list:view', 'employee_list:sync'
        ] 
    },
    { 
        id: 'role_finance', 
        name: '财务专员', 
        description: '仅能查看和下载数据，无编辑权限', 
        permissions: [
            'attendance_verification:view', 
            'attendance_dashboard:view', 'attendance_dashboard:export', 'attendance_dashboard:calendar_view',
            'employee_list:view'
        ] 
    },
    { 
        id: 'role_hr_clerk', 
        name: '考勤专员', 
        description: '仅能查看和编辑数据，无法发送通知或导出', 
        permissions: [
            'attendance_verification:view', 'attendance_verification:create', 'attendance_verification:edit',
            'attendance_dashboard:view', 'attendance_dashboard:calendar_view',
            'employee_list:view'
        ] 
    },
];

let MOCK_USERS: User[] = [
    { 
        id: 'user_1', 
        name: 'admin', 
        email: 'admin@lingosync.ai', 
        roleId: 'role_admin', 
        roleName: '超级管理员',
        status: 'active', 
        createdAt: '2023-01-01T10:00:00Z', 
        lastLogin: '2024-07-20T11:30:00Z', 
        creator: 'System' 
    },
    { 
        id: 'user_2', 
        name: 'hr_manager', 
        email: 'hr@lingosync.ai', 
        roleId: 'role_hr_mgr', 
        roleName: '人事经理',
        status: 'active', 
        createdAt: '2023-03-20T10:00:00Z', 
        lastLogin: '2024-07-20T14:00:00Z', 
        creator: 'admin' 
    },
    { 
        id: 'user_3', 
        name: 'clerk', 
        email: 'clerk@lingosync.ai', 
        roleId: 'role_hr_clerk', 
        roleName: '考勤专员',
        status: 'active', 
        createdAt: '2023-06-15T09:00:00Z', 
        lastLogin: '2024-07-21T09:00:00Z', 
        creator: 'hr_manager' 
    },
    { 
        id: 'user_4', 
        name: 'finance_staff', 
        email: 'finance@lingosync.ai', 
        roleId: 'role_finance', 
        roleName: '财务专员',
        status: 'active', 
        createdAt: '2024-01-10T09:00:00Z', 
        lastLogin: '2024-07-21T09:00:00Z', 
        creator: 'admin' 
    },
];

// In-memory password storage
const MOCK_PASSWORDS: Record<string, string> = {
    'user_1': 'admin',
    'user_2': '123456',
    'user_3': '123456',
    'user_4': '123456',
};

let MOCK_PROJECTS: Project[] = [
    {
        id: 'proj_1',
        name: 'Project Alpha',
        createdAt: '2024-01-01T00:00:00Z',
        state: {
            sceneLibraryState: {},
            translatorState: { proofread: { file: null, results: null, adopted: {} }, translate: { file: null, targetLanguages: [], results: {} } },
            auditState: { masterFile: null, reviewFiles: [], suggestions: {}, adopted: {}, history: [] },
            compareState: { oldFile: null, newFile: null, adopted: {}, history: [] }
        },
        members: ['user_1']
    }
];

let MOCK_SETTINGS: AdminSettings = {
    translation: {
        modelName: 'gemini-2.5-flash',
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 8192,
        thinkingBudget: 2048,
        systemInstruction: 'You are a professional translator.'
    },
    reporting: {
        modelName: 'gemini-2.5-flash',
        temperature: 0.5,
        topP: 0.8,
        topK: 40,
        systemInstruction: 'You are a data analyst.'
    },
    customerService: {
        modelName: 'gemini-2.5-flash',
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        systemInstruction: 'You are a helpful customer service agent.',
        enthusiasmLevel: 8
    }
};

export const MOCK_PRODUCTS = ['Puzzle Game A', 'RPG Game B', 'Casual Game C'];
export const MOCK_CHANNELS = ['Facebook', 'Google Ads', 'TikTok', 'AppLovin', 'Unity Ads'];

// --- Attendance Module Mock Data & Functions ---
const generateMockEmployeeAttendanceRecords = (count: number): EmployeeAttendanceRecord[] => {
    const records: EmployeeAttendanceRecord[] = [];
    const departments = ['研发部', '市场部', '人事部', '设计部'];
    const attendanceStatus = ['√', '√', '√', '√', '√', '√', '√', '√', '√', '√', '√', '√', '√', '√', '√', '迟到', '事假', '病假']; // Higher probability of normal attendance
    const firstNames = ['张', '李', '王', '赵', '刘', '陈', '杨'];
    const lastNames = ['伟', '芳', '娜', '强', '敏', '静', '磊'];

    for (let i = 0; i < count; i++) {
        const dailyData: Record<string, string> = {};
        for (let day = 1; day <= 31; day++) {
            dailyData[String(day)] = attendanceStatus[Math.floor(Math.random() * attendanceStatus.length)];
        }

        records.push({
            id: `emp_rec_${Date.now()}_${i}`,
            employeeId: `EMP${1000 + i}`,
            employeeName: `${firstNames[i % firstNames.length]}${lastNames[i % lastNames.length]}`,
            department: departments[i % departments.length],
            sendStatus: 'pending',
            sent_at: null,
            viewStatus: 'pending',
            viewed_at: null,
            confirmStatus: 'pending',
            confirmed_at: null,
            mainCompany: null,
            signatureBase64: null,
            isSigned: false,
            dailyData,
        });
    }
    return records;
};

let MOCK_ATTENDANCE_SHEETS: AttendanceSheet[] = [
    {
        id: 'sheet_1',
        title: '2024年06月考勤确认单',
        month: '2024-06',
        status: 'completed',
        settings: {
            reminderText: '请仔细核对6月考勤数据, 并及时确认!',
            showReminder: true,
            showColumns: [],
            hideEmptyColumnsOption: 'none',
            autoConfirmEnabled: true,
            autoConfirmDate: '2024-07-10T18:30',
            feedbackEnabled: true,
            feedbackContactPerson: '陈丽瑶',
            notificationMethod: '考勤确认助手通知+待办',
            readAndBurn: false,
            employeeSignature: true,
        },
        employeeRecords: generateMockEmployeeAttendanceRecords(25).map(r => ({ ...r, sendStatus: 'sent', sent_at: '2024-07-02T10:00:00Z', viewStatus: 'viewed', viewed_at: '2024-07-02T14:30:00Z', confirmStatus: 'confirmed', confirmed_at: '2024-07-03T09:00:00Z' })),
        createdAt: '2024-07-01T10:00:00Z',
    },
    {
        id: 'sheet_2',
        title: '2024年07月考勤确认单',
        month: '2024-07',
        status: 'sending',
        settings: {
            reminderText: '请仔细核对7月考勤数据, 并及时确认!',
            showReminder: true,
            showColumns: [],
            hideEmptyColumnsOption: 'none',
            autoConfirmEnabled: true,
            autoConfirmDate: '2024-08-10T18:30',
            feedbackEnabled: true,
            feedbackContactPerson: '陈丽瑶',
            notificationMethod: '考勤确认助手通知+待办',
            readAndBurn: false,
            employeeSignature: true,
        },
        employeeRecords: generateMockEmployeeAttendanceRecords(30),
        createdAt: '2024-08-01T10:00:00Z',
    },
];

// --- PUBLIC DB API ---

export const db = {
    authenticate: (username: string, password?: string): User | null => {
        if (password) {
            const user = MOCK_USERS.find(u => u.name === username);
            if (user) {
                // Check against stored password
                const storedPassword = MOCK_PASSWORDS[user.id];
                if (storedPassword === password) {
                    // Populate permissions based on role
                    const role = MOCK_ROLES.find(r => r.id === user.roleId);
                    return {
                        ...user,
                        permissions: role ? role.permissions : []
                    };
                }
            }
        }
        return null;
    },
    getAdminSettings: (): AdminSettings => MOCK_SETTINGS,
    updateAdminSettings: (settings: AdminSettings) => { MOCK_SETTINGS = settings; },
    getUsers: (): User[] => [...MOCK_USERS],
    
    // User Management
    updateUser: (id: string, updates: Partial<User> & { password?: string }) => {
        const index = MOCK_USERS.findIndex(u => u.id === id);
        if (index > -1) {
            const { password, ...userUpdates } = updates;
            MOCK_USERS[index] = { ...MOCK_USERS[index], ...userUpdates };
            
            // Update role name if role changed
            if (userUpdates.roleId) {
                const role = MOCK_ROLES.find(r => r.id === userUpdates.roleId);
                if (role) MOCK_USERS[index].roleName = role.name;
            }

            // Update password if provided
            if (password) {
                MOCK_PASSWORDS[id] = password;
            }
        }
    },
    addUser: (user: Omit<User, 'id' | 'createdAt' | 'lastLogin'> & { password?: string }) => {
        const role = MOCK_ROLES.find(r => r.id === user.roleId);
        const { password, ...userData } = user;
        const userId = `user_${Date.now()}`;

        const newUser: User = {
            ...userData,
            id: userId,
            roleName: role ? role.name : 'Unknown',
            createdAt: new Date().toISOString(),
            lastLogin: '-',
        };
        MOCK_USERS.push(newUser);
        // Default password if not provided
        MOCK_PASSWORDS[userId] = password || '123456';
    },
    deleteUser: (id: string) => {
        MOCK_USERS = MOCK_USERS.filter(u => u.id !== id);
        delete MOCK_PASSWORDS[id];
    },

    // Role Management
    getRoles: (): Role[] => [...MOCK_ROLES],
    updateRole: (id: string, updates: Partial<Role>) => {
        const index = MOCK_ROLES.findIndex(r => r.id === id);
        if (index > -1) {
            MOCK_ROLES[index] = { ...MOCK_ROLES[index], ...updates };
            // Also update users with this role if needed (name change)
            if (updates.name) {
                MOCK_USERS.forEach(u => {
                    if (u.roleId === id) u.roleName = updates.name;
                });
            }
        }
    },
    addRole: (role: Omit<Role, 'id'>) => {
        const newRole: Role = {
            ...role,
            id: `role_${Date.now()}`,
        };
        MOCK_ROLES.push(newRole);
        return newRole;
    },
    deleteRole: (id: string) => {
        MOCK_ROLES = MOCK_ROLES.filter(r => r.id !== id);
    },

    // Project Management
    getInitialProjects: () => [...MOCK_PROJECTS],
    createProject: (name: string) => {
        const newProject: Project = {
            id: `proj_${Date.now()}`,
            name,
            createdAt: new Date().toLocaleString(),
            state: {
                sceneLibraryState: {},
                translatorState: { proofread: { file: null, results: null, adopted: {} }, translate: { file: null, targetLanguages: [], results: {} } },
                auditState: { masterFile: null, reviewFiles: [], suggestions: {}, adopted: {}, history: [] },
                compareState: { oldFile: null, newFile: null, adopted: {}, history: [] }
            },
            members: []
        };
        MOCK_PROJECTS.push(newProject);
        return newProject;
    },
    addProjectMember: (projectId: string, userId: string) => {
        const project = MOCK_PROJECTS.find(p => p.id === projectId);
        if (project) {
            if (!project.members) project.members = [];
            if (!project.members.includes(userId)) project.members.push(userId);
        }
    },
    removeProjectMember: (projectId: string, userId: string) => {
        const project = MOCK_PROJECTS.find(p => p.id === projectId);
        if (project && project.members) {
            project.members = project.members.filter(id => id !== userId);
        }
    },
    
    // Attendance
    generateMockEmployeeAttendanceRecords,
    getAttendanceSheets: (): AttendanceSheet[] => [...MOCK_ATTENDANCE_SHEETS],
    createAttendanceSheet: (sheetData: Omit<AttendanceSheet, 'id' | 'createdAt'>): AttendanceSheet => {
        const newSheet: AttendanceSheet = {
            ...sheetData,
            id: `sheet_${Date.now()}`,
            createdAt: new Date().toLocaleString(),
        };
        MOCK_ATTENDANCE_SHEETS.unshift(newSheet);
        return newSheet;
    },
    updateAttendanceSheet: (updatedSheet: AttendanceSheet): AttendanceSheet | null => {
        const sheetIndex = MOCK_ATTENDANCE_SHEETS.findIndex(s => s.id === updatedSheet.id);
        if (sheetIndex > -1) {
            MOCK_ATTENDANCE_SHEETS[sheetIndex] = updatedSheet;
            return MOCK_ATTENDANCE_SHEETS[sheetIndex];
        }
        return null;
    },

    // Audit Logs
    getAuditLogs: (): AuditLog[] => {
        return [...MOCK_AUDIT_LOGS].sort((a, b) => b.timestamp - a.timestamp);
    },
    addAuditLog: (log: Omit<AuditLog, 'id' | 'timestamp'>) => {
        const newLog: AuditLog = {
            ...log,
            id: `log_${Date.now()}`,
            timestamp: Date.now()
        };
        MOCK_AUDIT_LOGS.unshift(newLog);
    }
};
