
import type { AttendanceSheet, EmployeeAttendanceRecord, DingTalkUser } from '../../../database/schema.ts';
import { getAppConfig } from '../utils.ts';

// --- DINGTALK API INTEGRATION ---

// 🔥 添加 token 缓存来防止重复调用
const tokenCache = new Map<string, { data: any, timestamp: number, promise?: Promise<any> }>();
const TOKEN_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2小时缓存（钉钉token有效期通常是2小时）

/** 1、获取钉钉接口访问令牌 */
export async function fetchToken(mainCompany: string) {
    const config = getAppConfig(mainCompany);
    const cacheKey = `token_${mainCompany}`;
    const cached = tokenCache.get(cacheKey);
    
    // 如果有缓存且未过期，直接返回
    if (cached && (Date.now() - cached.timestamp) < TOKEN_CACHE_DURATION) {
        console.log(`[fetchToken] 使用缓存token: ${mainCompany}`);
        return cached.data;
    }
    
    // 如果正在请求中，返回同一个 Promise
    if (cached?.promise) {
        console.log(`[fetchToken] 等待进行中的token请求: ${mainCompany}`);
        return cached.promise;
    }

    // 创建新的请求 Promise
    const requestPromise = (async () => {
        try {
            console.log(`[fetchToken] 开始获取token: ${mainCompany}`);
            const response = await fetch("https://sg.api.eyewind.cn/etl/dingding/gettoken", {
                "method": "POST",
                "headers": {
                    "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJ6ZDAyOWY3Y2VzcnQiLCJ0eXAiOiJhZG1pbiIsImlhdCI6MTc2MDk0MjU0MiwiZXhwIjoxNzYwOTQ5NzQyfQ.GmxvDMsuQ-l6k55tHnLlLBomYuNA4bV2o2z-hwLVaX8",
                    "content-type": "application/json"
                },
                "body": JSON.stringify({
                    appkey: config.appkey,
                    appsecret: config.appsecret
                }),
            });
            
            const result = await response.json();
            
            // 🔥 缓存token结果
            tokenCache.set(cacheKey, { data: result, timestamp: Date.now() });
            console.log(`[fetchToken] 成功获取并缓存token: ${mainCompany}`);
            return result;
        } catch (error) {
            console.error(`[fetchToken] 获取token失败: ${mainCompany}`, error);
            throw error;
        } finally {
            // 🔥 请求完成后清除 promise 引用
            const currentCache = tokenCache.get(cacheKey);
            if (currentCache) {
                tokenCache.set(cacheKey, { 
                    data: currentCache.data, 
                    timestamp: currentCache.timestamp 
                });
            }
        }
    })();
    
    // 🔥 将 Promise 存储到缓存中，防止并发请求
    const currentCache = tokenCache.get(cacheKey);
    tokenCache.set(cacheKey, {
        data: currentCache?.data || null,
        timestamp: currentCache?.timestamp || 0,
        promise: requestPromise
    });
    
    return requestPromise;
}

function getMockEmployees() {
    return [
        { userid: 'user_1001', name: '张伟', department: '研发部', avatar: '', title: '工程师' },
        { userid: 'user_1002', name: '李芳', department: '市场部', avatar: '', title: '专员' },
        { userid: 'user_1003', name: '王强', department: '设计部', avatar: '', title: '设计师' },
        { userid: 'user_1004', name: '赵敏', department: '人事部', avatar: '', title: 'HRBP' },
        { userid: 'user_1005', name: '陈磊', department: '研发部', avatar: '', title: '前端开发' },
    ];
}

// 🔥 改进的内存缓存，增加更强的重复调用保护
const employeeCache = new Map<string, { data: any[], timestamp: number, promise?: Promise<any[]> }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

/** 2、获取所有员工id */
export async function fetchAllEmployees(mainCompany: string): Promise<any[]> {
    const userUrl = `http://localhost:5001/etl/dingding/employees`;
    
    // 🔥 检查缓存
    const cacheKey = `employees_${mainCompany}`;
    const cached = employeeCache.get(cacheKey);
    
    // 如果有缓存且未过期，直接返回
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        console.log(`[fetchAllEmployees] 使用缓存数据: ${mainCompany}`);
        return cached.data;
    }
    
    // 如果正在请求中，返回同一个 Promise
    if (cached?.promise) {
        console.log(`[fetchAllEmployees] 等待进行中的请求: ${mainCompany}`);
        return cached.promise;
    }

    // 创建新的请求 Promise
    const requestPromise = (async () => {
        try {
            console.log(`[fetchAllEmployees] 开始获取员工数据: ${mainCompany}`);
            const tokenResponse = await fetchToken(mainCompany).catch(() => null);
            const { access_token } = tokenResponse?.data || {};

            if (!access_token) {
                console.warn("Failed to fetch DingTalk access token, using mock data.");
                const mockData = getMockEmployees();
                // 🔥 缓存mock数据
                employeeCache.set(cacheKey, { data: mockData, timestamp: Date.now() });
                return mockData;
            }

            const response = await fetch(userUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dingToken: access_token }),
            });

            if (!response.ok) {
                 console.warn(`DingTalk API Error: ${response.status}, using mock data.`);
                 const mockData = getMockEmployees();
                 // 🔥 缓存mock数据
                 employeeCache.set(cacheKey, { data: mockData, timestamp: Date.now() });
                 return mockData;
            }

            const responseData = await response.json();
            const { employees } = responseData || {};

            if (!employees || !employees.length) {
                console.warn("Empty employee list from API, using mock data.");
                const mockData = getMockEmployees();
                // 🔥 缓存mock数据
                employeeCache.set(cacheKey, { data: mockData, timestamp: Date.now() });
                return mockData;
            }
            
            // 🔥 缓存真实数据
            employeeCache.set(cacheKey, { data: employees, timestamp: Date.now() });
            console.log(`[fetchAllEmployees] 成功获取并缓存员工数据: ${mainCompany}, 数量: ${employees.length}`);
            return employees;
        } catch (error) {
            console.error(`[${new Date().toLocaleString()}] 获取钉钉员工失败！使用模拟数据`, error);
            const mockData = getMockEmployees();
            // 🔥 缓存mock数据
            employeeCache.set(cacheKey, { data: mockData, timestamp: Date.now() });
            return mockData;
        } finally {
            // 🔥 请求完成后清除 promise 引用
            const currentCache = employeeCache.get(cacheKey);
            if (currentCache) {
                employeeCache.set(cacheKey, { 
                    data: currentCache.data, 
                    timestamp: currentCache.timestamp 
                });
            }
        }
    })();
    
    // 🔥 将 Promise 存储到缓存中，防止并发请求
    const currentCache = employeeCache.get(cacheKey);
    employeeCache.set(cacheKey, {
        data: currentCache?.data || [],
        timestamp: currentCache?.timestamp || 0,
        promise: requestPromise
    });
    
    return requestPromise;
}

/** 3、将考勤数据存储或更新到数据库 */
export async function upsertAttendanceDataToDb(sheet: AttendanceSheet, recordsToUpsert: (EmployeeAttendanceRecord & { corp_task_id?: string, todo_task_id?: string })[], dingTalkUsers: DingTalkUser[], mainCompany: string | null) {
    const dataForUpsert = recordsToUpsert.map(record => {
        const dingTalkUser = dingTalkUsers.find(u => u.name === record.employeeName);

        if (!dingTalkUser) {
            console.warn(`Could not find DingTalk user for ${record.employeeName}, skipping DB upsert for this record.`);
            return null;
        }

        const { userid, dept_id_list = [], unionid } = dingTalkUser;

        const detailsPayload = {
            record: record,
            title: sheet.title,
            month: sheet.month,
            settings: sheet.settings,
            user: dingTalkUser
        };

        return {
            userid,
            unionid,
            name: dingTalkUser.name,
            dept_ids: JSON.stringify(dept_id_list),
            attd_month: sheet.month,
            is_send: record.sendStatus === 'sent',
            is_view: record.viewStatus === 'viewed',
            is_confirm: record.confirmStatus === 'confirmed' || record.confirmStatus === 'auto-confirmed',
            mainCompany,
            signatureBase64: record.signatureBase64 || null,
            details: JSON.stringify(detailsPayload),
            records: JSON.stringify(record),
            corp_task_id: record.corp_task_id,
            todo_task_id: record.todo_task_id,
            confirmed_at: record.confirmed_at,
            viewed_at: record.viewed_at,
            confirm_typ: record.confirm_typ,
        };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    if (dataForUpsert.length === 0) {
        return;
    }

    try {
        // 🔥 使用本地服务器接口
        const response = await fetch("/api/v1/attendance/status/upsert", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: dataForUpsert }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to parse error response' }));
            throw new Error(`API Error ${response.status}: ${errorData.message || response.statusText}`);
        }
    } catch (error) {
        console.error("Batch upsert failed:", error);
        throw error;
    }
}

/** 4、发送钉钉通知 */
export const generateDingTalkMarkdown = (record: EmployeeAttendanceRecord, sheet: AttendanceSheet, mainCompany: any): string => {
    let markdown = `### ${sheet.title}\n\n---\n\n`;
    const data = record.dailyData;
    const columns = sheet.settings.showColumns;

    let fieldMapping: Record<string, string> = {
        '正常出勤天数': '正常出勤天数',
        '是否全勤': '是否全勤',
        '豁免后迟到分钟数': '豁免后迟到',
        '迟到分钟数': '迟到累计',
        '备注': '备注',
    };

    if (mainCompany === 'hydodo') {
        fieldMapping = {
            '正常出勤天数': '正常出勤天数',
            '是否全勤': '是否全勤',
            '迟到分钟数': '迟到累计',
            '备注': '备注',
        };
    }

    for (const key in fieldMapping) {
        if (columns.includes(key)) {
            markdown += `* **${fieldMapping[key]}：** ${data[key] || (key === '备注' ? '-' : '0')}\n`;
        }
    }

    markdown += `\n---\n\n【重要提示】请仔细核对以上数据，如有疑问请及时反馈HR。`;
    return markdown;
};

export async function sendDingTalkNotifications(records: EmployeeAttendanceRecord[], sheet: AttendanceSheet, allUsers: DingTalkUser[], mainCompany: string) {
    const tokenResponse = await fetchToken(mainCompany);
    const { access_token } = tokenResponse.data || {};
    if (!access_token) {
        throw new Error(`获取钉钉访问令牌失败。`);
    }

    const config = getAppConfig(mainCompany);
    const AGENT_ID = config.agent_id;

    const sendPromises = records.map(async record => {
        const user = allUsers.find(u => u.name === record.employeeName);
        if (!user || !user.userid || !user.unionid) {
            console.warn(`跳过为 ${record.employeeName} 发送钉钉通知/待办: 未找到用户、缺少用户ID或UnionID。`);
            return { success: false, name: record.employeeName, error: 'User not found or missing required IDs' };
        }

        const actionURL = `https://cdn.eyewind.com/attendance/60c00d84330a20af8560661766c26e48.html?userid=${user.userid}**${sheet.month}`;

        // --- 1. Corp Message (Action Card) ---
        let form = [
            { key: "正常出勤天数：", value: String(record.dailyData["正常出勤天数"]) },
            { key: "是否全勤：", value: record.dailyData["是否全勤"] },
            { key: "迟到累计：", value: `${record.dailyData["迟到分钟数"]} 分钟` },
            { key: "豁免后迟到：", value: `${record.dailyData["豁免后迟到分钟数"]} 分钟` },
            { key: "备注：", value: record.dailyData["备注"] || "-" }
        ]
        if (mainCompany === 'hydodo') {
            form = [
            { key: "正常出勤天数：", value: String(record.dailyData["正常出勤天数"]) },
            { key: "是否全勤：", value: record.dailyData["是否全勤"] },
            { key: "迟到累计：", value: `${record.dailyData["迟到分钟数"]} 分钟` },
            { key: "备注：", value: record.dailyData["备注"] || "-" }
        ]
        }
        const corpMessagePayload = {
            dingToken: access_token,
            agent_id: AGENT_ID,
            userid_list: user.userid,
            msg: {
                msgtype: "oa",
                oa: {
                    message_url: actionURL, // ✅ PC / 手机都能点
                    head: {
                        bgcolor: "FFBBBBBB",
                        text: `${sheet.month}考勤确认单`
                    },
                    body: {
                        title: "请确认您的考勤信息",
                        // 🔹 OA 推荐用 form，而不是 markdown
                        form,
                        content: "【重要提示】请仔细核对以上数据，如有疑问请及时反馈 HR。",
                        author: `考勤系统`
                    }
                },

                // ✅ 状态栏（移动端强提醒）
                status_bar: {
                    status_value: "待确认",
                    status_bg: "0xFFFFC107",
                    action_url: actionURL
                }
            }
        };
        const corpMessagePromise = fetch("https://sg.api.eyewind.cn/etl/dingding/corp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corpMessagePayload)
        });

        // --- 2. Todo Item ---
        let dueTime: any = new Date();
        dueTime.setHours(18, 30, 0, 0); // 当天 18 点

        if (sheet.settings.autoConfirmDate) dueTime = new Date(sheet.settings.autoConfirmDate).getTime()
        const contentFieldList = [];
        const fieldMapping = {
            '正常出勤天数': '正常出勤天数',
            '是否全勤': '是否全勤',
            '豁免后迟到分钟数': '豁免后迟到',
        };
        for (const [dataKey, fieldKey] of Object.entries(fieldMapping)) {
            if (record.dailyData[dataKey] && String(record.dailyData[dataKey]).trim()) {
                let fieldValue = String(record.dailyData[dataKey]);
                if ((dataKey === '迟到分钟数' || dataKey === '豁免后迟到分钟数') && !fieldValue.includes('分钟')) {
                    fieldValue += ' 分钟';
                }
                contentFieldList.push({ fieldKey, fieldValue });
            }
        }

        const todoPayload = {
            dingToken: access_token,
            unionId: user.unionid,
            operatorId: user.unionid,
            subject: sheet.title,
            creatorId: user.unionid,
            description: "考勤确认助手",
            dueTime: dueTime,
            executorIds: [user.unionid],
            participantIds: [user.unionid],
            detailUrl: { appUrl: actionURL, pcUrl: actionURL },
            contentFieldList: contentFieldList,
            isOnlyShowExecutor: true,
            priority: 40,
            notifyConfigs: { dingNotify: "1", sendTodoApn: true, sendAssistantChat: true },
            bizCategoryId: "hr.attendance",
            actionList: [{
                title: "点击查看考勤确认单详情",
                buttonStyleType: 101,
                actionType: 2,
                url: actionURL,
                pcUrl: actionURL
            }],
            todoType: "TODO",
            reminderTimeStamp: dueTime - (1 * 60 * 60 * 1000), // 1 day before due time
            remindNotifyConfigs: { dingNotify: "1", sendTodoApn: true }
        };

        const todoPromise = fetch("https://sg.api.eyewind.cn/etl/dingding/tudo/create", {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(todoPayload)
        });

        // --- Execute both requests ---
        try {
            const [corpMessageResult, todoResult] = await Promise.all([corpMessagePromise, todoPromise]);

            const corpMessageData = await corpMessageResult.json();
            if (corpMessageData.data.errcode !== 0) {
                throw new Error(`发送工作通知失败: DingTalk API Error - ${corpMessageData.data.errmsg}`);
            }

            const todoData = await todoResult.json();
            if (todoData.success === false || (todoData.data.errcode && todoData.data.errcode !== 0)) {
                throw new Error(`创建待办事项失败: DingTalk API Error - ${todoData.data.message || todoData.data.errmsg}`);
            }

            return {
                success: true,
                name: record.employeeName,
                corp_task_id: corpMessageData.data.task_id,
                todo_task_id: todoData.data.id
            };

        } catch (error) {
            console.error(`处理 ${record.employeeName} 时出错:`, error);
            throw new Error(`处理 ${record.employeeName} 时出错: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    return Promise.allSettled(sendPromises);
}

/** 5、撤回钉钉通知与代办 */
export async function recallDingTalkNotifications(
    records: EmployeeAttendanceRecord[],
    allUsers: DingTalkUser[],
    mainCompany: string
) {
    const tokenResponse = await fetchToken(mainCompany);
    const { access_token } = tokenResponse.data || {};
    if (!access_token) {
        throw new Error(`获取钉钉访问令牌失败。`);
    }

    const config = getAppConfig(mainCompany);
    const AGENT_ID = config.agent_id;

    const recallPromises = records.map(async record => {
        const user = allUsers.find(u => u.name === record.employeeName);
        if (!user || !user.unionid) {
            console.warn(`跳过为 ${record.employeeName} 撤回通知: 未找到用户或缺少UnionID。`);
            return { success: false, name: record.employeeName, error: 'User not found or missing UnionID' };
        }

        const promises = [];

        // 1. Recall Todo (Delete)
        if (record.todo_task_id) {
            const todoRecallPayload = {
                dingToken: access_token,
                unionId: user.unionid,
                taskId: record.todo_task_id,
                operatorId: user.unionid // Defaulting operator to same user as per requirement
            };
            promises.push(
                fetch("https://sg.api.eyewind.cn/etl/dingding/tudo/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(todoRecallPayload)
                }).then(res => res.json())
                    .then(data => {
                        if (data.success === false) {
                            console.warn(`撤回代办失败 ${record.employeeName}:`, data);
                            throw new Error(`撤回代办失败: ${data.data?.errmsg || 'Unknown error'}`);
                        }
                        return { type: 'todo', success: true };
                    })
            );
        }

        // 2. Recall Corp Message
        if (record.corp_task_id) {
            const corpRecallPayload = {
                dingToken: access_token,
                agent_id: AGENT_ID,
                msg_task_id: record.corp_task_id
            };
            promises.push(
                fetch("https://sg.api.eyewind.cn/etl/dingding/corp/recall", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(corpRecallPayload)
                }).then(res => res.json())
                    .then(data => {
                        if (data.data && data.data.errcode !== 0) {
                            console.warn(`撤回工作通知失败 ${record.employeeName}:`, data);
                            // Not throwing error here to allow partial success (e.g. if message read, recall might fail but todo deleted)
                            return { type: 'corp', success: false, msg: data.data.errmsg };
                        }
                        return { type: 'corp', success: true };
                    })
            );
        }

        if (promises.length === 0) {
            return { success: true, name: record.employeeName, msg: "No tasks to recall" };
        }

        try {
            await Promise.all(promises);
            return { success: true, name: record.employeeName };
        } catch (error) {
            console.error(`撤回 ${record.employeeName} 失败:`, error);
            return { success: false, name: record.employeeName, error: error instanceof Error ? error.message : String(error) };
        }
    });

    return Promise.allSettled(recallPromises);
}

export async function getEyewindToken() {
    try {
        const response = await fetch("https://eyewind.cn/admin/token", {
            "headers": {
                "accept": "*/*",
                "accept-language": "zh-CN,zh;q=0.9",
                "content-type": "application/json",
            },
            "body": "{\"name\":\"yongsen\",\"password\":\"fengyongsen\"}",
            "method": "POST",
        });

        if (response.ok) {
            const res = await response.json();
            if (res?.data?.token) {
                return res.data.token;
            }
        }
    } catch (e) {
        console.error("Failed to fetch Eyewind token", e);
    }

    // Fallback if fetch fails or format is wrong
    return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiI4bmVsbzZ6bzF6OGoiLCJ0eXAiOiJhZG1pbiIsImlhdCI6MTc2MjE2OTA0MCwiZXhwIjoxNzYyMTc2MjQwfQ.wA_A1eww-mkM8naq2Zqn5qucdo8a7rFf4-YAzenkI0o";
}
