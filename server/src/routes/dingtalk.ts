import express from 'express';
import axios from 'axios';

const router = express.Router();

// 钉钉API配置
const DING_OAPI = 'https://oapi.dingtalk.com';

// API路径常量
const DING_GETTOKEN_PATH = '/gettoken';
const DING_USER_QUERY_PATH = '/topapi/smartwork/hrm/employee/queryonjob'; // 查询在职员工列表
const DING_USER_DETAIL_PATH = '/topapi/v2/user/get'; // 获取用户详情
const DING_DEPT_LIST_PATH = '/topapi/v2/department/listsub'; // 获取子部门列表
const DING_ATTENDANCE_LIST_PATH = '/attendance/list'; // 获取打卡详情
const DING_GETATTCOLUMNS_PATH = '/topapi/attendance/getattcolumns'; // 获取考勤列定义
const DING_GETCOLUMNVAL_PATH = '/topapi/attendance/getcolumnval'; // 获取单个考勤指标值
const DING_HRM_EMPLOYEE_LIST_PATH = '/topapi/smartwork/hrm/employee/v2/list'; // 获取员工花名册字段信息
const DING_CORPCONVERSATION_PATH = '/topapi/message/corpconversation/asyncsend_v2'; // 发送工作通知

/**
 * 通用：检查钉钉 API 响应的 HTTP 状态和业务错误码。
 * @param {any} response - axios 响应对象。
 * @param {string} apiPath - 正在调用的 API 路径，用于日志记录。
 * @param {string} [contextId='N/A'] - 用于日志记录的上下文 ID（例如 userId 或 deptId）。
 * @returns {Promise<object>} - 解析后的 JSON 数据。
 * @throws {Error} - 如果遇到 HTTP 错误或钉钉业务错误，抛出包含详细信息的 Error 对象。
 */
const _checkDingTalkResponse = async (response: any, apiPath: string, contextId: string = 'N/A') => {
  const data = response.data;
  
  if (data.errcode !== 0) {
    const errorMessage = `DingTalk API Business Error (${apiPath}, Context: ${contextId}): Code ${data.errcode} - ${data.errmsg}`;
    console.error(errorMessage, data);
    throw new Error(errorMessage);
  }

  return data;
};

/**
 * 获取单个用户的详细信息（包含头像和部门ID）。
 * 包含重试机制以处理QPS限流。
 * @param {string} accessToken 钉钉接口访问令牌。
 * @param {string} userId 员工的唯一标识ID。
 * @returns {Promise<object | null>} 用户的详细信息对象。
 */
const _fetchUserDetail = async (accessToken: string, userId: string, retryCount: number = 0): Promise<any> => {
  const requestBody = {
    userid: userId,
    language: 'zh_CN',
  };

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2秒延迟

  try {
    const response = await axios.post(`${DING_OAPI}${DING_USER_DETAIL_PATH}?access_token=${accessToken}`, requestBody, {
      headers: { 'Content-Type': 'application/json' },
    });

    // 统一检查响应
    const data = await _checkDingTalkResponse(response, DING_USER_DETAIL_PATH, userId);

    // 成功返回包含 avatar 和 department_id_list 的完整用户对象
    return data.result || null;
  } catch (error: any) {
    // 检查是否是QPS限流错误 (错误码88)
    if (error.message.includes('Code 88') && retryCount < MAX_RETRIES) {
      console.warn(`[${new Date().toLocaleString()}] DingTalk API QPS限流，用户 ${userId} 将在 ${RETRY_DELAY}ms 后重试 (${retryCount + 1}/${MAX_RETRIES})`);
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return _fetchUserDetail(accessToken, userId, retryCount + 1);
    }
    
    // 记录单个用户获取失败，但不重新抛出，允许 Promise.allSettled 正常处理
    console.warn(`[${new Date().toLocaleString()}] DingTalk API 获取用户 ${userId} 详情失败: ${error.message}`);
    return null;
  }
};

/**
 * 递归地从钉钉API获取所有在职员工的userId列表。
 * @param {string} accessToken 钉钉接口访问令牌。
 * @param {number} [offset=0] 分页游标，首次调用为0。
 * @param {Array<string>} [allUserIds=[]] 存储所有已获取的员工userId列表。
 * @returns {Promise<Array<string>>} 包含所有员工userId的列表。
 */
const _queryAllUserIds = async (accessToken: string, offset: number = 0, allUserIds: string[] = []): Promise<string[]> => {
  const pageSize = 50; // 每页大小，最大50

  // API请求参数
  const requestBody = {
    status_list: '2,5,3,-1', // 员工状态列表：2=在职，5=退休，3=离职，-1=未入职
    size: pageSize,
    offset: offset,
  };

  try {
    const response = await axios.post(`${DING_OAPI}${DING_USER_QUERY_PATH}?access_token=${accessToken}`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 统一检查响应，失败则抛出
    const data = await _checkDingTalkResponse(response, DING_USER_QUERY_PATH, `Offset: ${offset}`);

    const result = data.result || {};

    // 拼接本页获取到的员工userId列表
    const currentChunk = result.data_list || [];
    allUserIds = allUserIds.concat(currentChunk);

    const nextCursor = result.next_cursor;

    // 如果存在下一页游标且不为 -1，则继续递归
    if (nextCursor !== null && nextCursor !== undefined && nextCursor !== -1) {
      console.log(`[${new Date().toLocaleString()}] DingTalk API 当前已获取 ${allUserIds.length} 条用户ID，继续请求下一页游标: ${nextCursor}`);
      return _queryAllUserIds(accessToken, nextCursor, allUserIds);
    } else {
      return allUserIds;
    }
  } catch (error: any) {
    // 重新抛出错误，由 fetchAllEmployees 统一处理
    console.error(`[${new Date().toLocaleString()}] DingTalk API 递归获取员工ID列表失败!`, error.message);
    throw error;
  }
};

/**
 * 获取所有部门列表，并构建 ID 到名称的映射。
 * 使用递归从根部门开始遍历所有子部门。
 * @param {string} accessToken 钉钉接口访问令牌
 * @returns {Promise<Map<number, string>>} 部门 ID 到部门名称的映射
 */
const _fetchDepartmentMap = async (accessToken: string): Promise<Map<number, string>> => {
  // 根部门 ID
  const rootId = 1;
  const deptMap = new Map<number, string>();
  deptMap.set(rootId, '根部门');

  // 内部递归函数
  const recursiveFetch = async (parentId: number) => {
    try {
      const response = await axios.post(`${DING_OAPI}${DING_DEPT_LIST_PATH}?access_token=${accessToken}`, 
        { dept_id: parentId },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const data = await _checkDingTalkResponse(response, DING_DEPT_LIST_PATH, parentId.toString());
      const subDepartments = data.result || [];
      const childDeptIds: number[] = [];

      for (const dept of subDepartments) {
        const { dept_id, name } = dept;
        if (!deptMap.has(dept_id)) deptMap.set(dept_id, name);
        childDeptIds.push(dept_id);
      }

      // 并行递归子部门
      await Promise.all(childDeptIds.map((id) => recursiveFetch(id)));
    } catch (err: any) {
      console.error(`[${new Date().toLocaleString()}] DingTalk API 获取部门 ${parentId} 失败:`, err.message);
    }
  };

  // 从根部门开始递归
  await recursiveFetch(rootId);
  return deptMap;
};

/**
 * 从钉钉 HRM 接口获取员工的 HR 字段数据 (包括主体公司)。
 * 接口: /topapi/smartwork/hrm/employee/v2/list
 * ⚠️ 限制: 每次最多查询 100 个用户ID。
 * 
 * @param {string} accessToken 钉钉接口访问令牌。
 * @param {Array<string>} allUserIds 员工的唯一标识ID列表。
 * @returns {Promise<Map<string, string>>} userId 到 '主体公司' 名称的映射。
 */
const _fetchHrmEmployeeData = async (accessToken: string, allUserIds: string[]): Promise<Map<string, string>> => {
  const BATCH_SIZE = 100; // HRM V2 List 接口每次最多支持 100 个 user_id
  const hrmCompanyMap = new Map<string, string>();

  // ⚠️ 请将 'sys05-contractCompanyName' 替换为您钉钉 HR 资产管理中配置的实际"主体公司"字段的 field_code
  const COMPANY_FIELD_CODE = 'sys05-contractCompanyName';

  for (let i = 0; i < allUserIds.length; i += BATCH_SIZE) {
    const chunk = allUserIds.slice(i, i + BATCH_SIZE);

    // API请求参数
    const requestBody = {
      userid_list: chunk.join(','),
      field_filter_list: COMPANY_FIELD_CODE,
      agentid: 1
    };

    try {
      const response = await axios.post(`${DING_OAPI}${DING_HRM_EMPLOYEE_LIST_PATH}?access_token=${accessToken}`, requestBody, {
        headers: { 'Content-Type': 'application/json' },
      });

      // 统一检查响应，失败则抛出
      const data = await _checkDingTalkResponse(response, DING_HRM_EMPLOYEE_LIST_PATH, `Batch ${i}`);

      // 修正：API文档显示结果在 data.result.data_list 中
      const employeeDataList = data.result || [];

      // 解析并提取主体公司字段
      for (const employeeData of employeeDataList) {
        const userId = employeeData.userid;
        const fieldDataList = employeeData.field_data_list || [];
        let mainCompanyName = ''; // 默认值

        // 遍历所有字段组
        for (const fieldGroup of fieldDataList) {
          // 查找 field_code 匹配的字段
          if (fieldGroup.field_code === COMPANY_FIELD_CODE && fieldGroup.field_value_list?.length > 0) {
            const firstValue = fieldGroup.field_value_list[0];
            // 优先使用 label，如果 label 不存在或为空，则使用 value。
            const candidateName = firstValue.label || firstValue.value;
            // 只有当获取到的值是有效的非空字符串（去除空格后）时才更新 mainCompanyName
            if (typeof candidateName === 'string' && candidateName.trim() !== '') {
              mainCompanyName = candidateName;
            } // 如果 candidateName 是 null, undefined, 或空字符串，则 mainCompanyName 保持为 ''
            break;
          }
        }

        hrmCompanyMap.set(userId, mainCompanyName);
      }
    } catch (error: any) {
      // 记录错误，但不中断，继续处理下一个批次
      console.error(`[${new Date().toLocaleString()}] DingTalk API 获取 HRM 员工数据批次 ${i} 失败!`, error.message);
    }

    // 增加延迟以避免 QPS 限制
    if (i + BATCH_SIZE < allUserIds.length) {
      console.log(`[${new Date().toLocaleString()}] DingTalk API HRM批次间等待 500ms 避免QPS限流...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return hrmCompanyMap;
};

/**
 * 接口处理器：获取所有在职员工的完整信息（头像、部门、主体公司）。
 * 
 * @param {express.Request} req 请求对象，预期在 req.body 中包含 { dingToken: <AccessToken> }
 * @param {express.Response} res 响应对象
 * 
 * ⚠️ 警告：该方法已引入并发限制以避免QPS限流，但大量请求仍需较长时间。
 */
const fetchAllEmployees = async (req: express.Request, res: express.Response) => {
  try {
    // 1. 从请求体中解析出钉钉 Access Token
    const { dingToken } = req.body;
    if (!dingToken) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的钉钉访问令牌 (dingToken)!',
      });
    }

    console.log(`[${new Date().toLocaleString()}] DingTalk API 开始获取所有员工信息...`);

    // 2. 异步并行获取所有用户ID 和 部门映射
    const [allUserIds, departmentMap] = await Promise.all([
      _queryAllUserIds(dingToken),
      _fetchDepartmentMap(dingToken),
    ]);

    // 3. 异步获取 HRM 主体公司数据 (依赖 allUserIds)
    const hrmCompanyMap = await _fetchHrmEmployeeData(dingToken, allUserIds);

    console.log(`[${new Date().toLocaleString()}] DingTalk API 成功获取 ${allUserIds.length} 个用户ID、${departmentMap.size} 个部门和 ${hrmCompanyMap.size} 条员工数据。`);

    // 4. 批量获取用户详情 (严格限制并发和添加延迟以防止QPS限流)
    const CONCURRENCY_LIMIT = 18; // 降低并发数
    const DELAY_BETWEEN_BATCHES = 500; // 每批次间延迟1秒
    const detailedUsers: any[] = [];

    // 统计不同 mainCompany 对应的人数
    const companyCounts: Record<string, string[]> = {};

    console.log(`[${new Date().toLocaleString()}] DingTalk API 开始获取 ${allUserIds.length} 个用户详情，并发限制: ${CONCURRENCY_LIMIT}，批次延迟: ${DELAY_BETWEEN_BATCHES}ms`);

    // 分批次循环处理所有用户ID
    for (let i = 0; i < allUserIds.length; i += CONCURRENCY_LIMIT) {
      const chunk = allUserIds.slice(i, i + CONCURRENCY_LIMIT);

      // 创建批次请求的 Promise 数组
      const detailPromises = chunk.map((userId) => _fetchUserDetail(dingToken, userId));

      // 执行批次请求 (使用 Promise.allSettled 忽略单个用户获取失败)
      const chunkResults = await Promise.allSettled(detailPromises);

      // 处理并组装结果
      chunkResults
        // 过滤掉失败的 promise (rejected) 和返回 null 的 promise (fulfilled, but user detail failed)
        .filter((result) => result.status === 'fulfilled' && result.value !== null)
        .forEach((result: any) => {
          const user = result.value;

          // 5. 部门名称解析
          const deptNames = (user.dept_id_list || []).map((deptId: number) =>
            departmentMap.get(deptId) || `未知部门ID(${deptId})`
          );

          // 6. 获取主体公司名称
          const mainCompany = hrmCompanyMap.get(user.userid);
          if (mainCompany) {
            // 7. 组装最终结果， mainCompany = ''的是 boss 或者是 深圳 员工，不需要处理
            detailedUsers.push({
              ...user,
              department: [...new Set(deptNames)].join('、'),
              mainCompany: mainCompany, // 新增的主体公司字段
            });

            // 8. 统计主体公司人数
            if (!companyCounts[mainCompany]) {
              companyCounts[mainCompany] = [];
            }
            companyCounts[mainCompany].push(user.userid);
          }
        });

      console.log(`[${new Date().toLocaleString()}] DingTalk API 完成处理 ${i + chunk.length} / ${allUserIds.length} 条记录...`);
      
      // 添加批次间延迟，避免QPS限流
      if (i + CONCURRENCY_LIMIT < allUserIds.length) {
        console.log(`[${new Date().toLocaleString()}] DingTalk API 等待 ${DELAY_BETWEEN_BATCHES}ms 避免QPS限流...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    // 8. 返回结果
    return res.json({
      employees: detailedUsers,
      totalCount: detailedUsers.length,
      companyCounts: companyCounts, // 新增：主体公司人数统计
      success: true,
    });
  } catch (error: any) {
    console.error(`[${new Date().toLocaleString()}] 接口处理失败！`, error);

    // 设置 500 Internal Server Error 状态码
    return res.status(500).json({
      success: false,
      message: `获取员工完整信息失败：${error.message}`,
      error_type: 'InternalServer'
    });
  }
};

// --- 考勤结果映射常量 ---
// 打卡来源类型映射
export const SOURCE_TYPE_MAP = {
    'ATM': '考勤机打卡 (指纹/人脸打卡)',
    'BEACON': 'iBeacon',
    'DING_ATM': '钉钉考勤机 (考勤蓝牙打卡)',
    'USER': '用户打卡',
    'BOSS': '老板改签',
    'APPROVE': '审批系统',
    'SYSTEM': '考勤系统',
    'AUTO_CHECK': '自动打卡',
};

// 位置结果映射
export const LOCATION_RESULT_MAP = {
    'Normal': '范围内',
    'Outside': '范围外',
    'NotSigned': '未打卡',
};

// 时间结果映射
export const TIME_RESULT_MAP = {
    'Normal': '正常',
    'Early': '早退',
    'Late': '迟到',
    'SeriousLate': '严重迟到',
    'Absenteeism': '旷工迟到',
    'NotSigned': '未打卡',
};

// 上下班类型映射
export const CHECK_TYPE_MAP = {
    'OnDuty': '上班',
    'OffDuty': '下班',
};

/**
 * 实用工具函数：用于暂停执行 (用于指数退避)
 * @param {number} ms 暂停的毫秒数
 * @returns {Promise<void>}
 */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 内部通用方法：调用钉钉 API
 * @param {string} token 钉钉 Access Token
 * @param {string} apiPath 钉钉 API 路径（不含域名）
 * @param {object} payload 发送到钉钉 API 的请求体
 * @returns {Promise<object>} 钉钉 API 响应的 JSON 对象
 * @throws {Error} 如果 HTTP 状态码不为 200 或钉钉返回的 errcode 不为 0
 */
export const _callDingTalkApi = async (token: string, apiPath: string, payload: any): Promise<any> => {
    // 使用 DING_OAPI 拼接完整的 URL
    const url = `${DING_OAPI}${apiPath}?access_token=${token}`;
    console.log(`[${new Date().toLocaleString()}] DingTalk API Calling: ${apiPath}`, payload?.userid && `userid: ${payload?.userid}`);

    const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
    });

    if (response.status !== 200) {
        throw new Error(`DingTalk HTTP Error: ${response.status} on ${apiPath}`);
    }

    const result = response.data;
    if (result.errcode !== 0) {
        throw new Error(`DingTalk API Error [${result.errcode}]: ${result.errmsg}`);
    }

    return result;
};

/**
 * 内部工具函数：处理单个考勤记录的映射和时间转换 (现支持员工信息增强)
 * @param {object} record 单个考勤记录对象
 * @param {Map<string, {name: string, department: string}>} employeeMap 员工 ID 到姓名/部门信息的映射
 * @returns {object} 处理后的考勤记录，包含 userName 和 department_Name
 */
const _processPunchRecord = (record: any, employeeMap: Map<string, {name: string, department: string}> = new Map()): any => {
    // 1. 时间转换 (钉钉时间戳通常是毫秒级)
    const toLocaleTime = (timestamp: number | string): string | null => {
        if (!timestamp) return null;
        // 假设时间戳是毫秒级，如果只有10位，则乘以 1000 转换为毫秒
        const ts = String(timestamp).length === 10 ? Number(timestamp) * 1000 : Number(timestamp);
        // 使用中文环境和 24 小时制格式化
        return new Date(ts).toLocaleString();
    };

    // 2. 映射处理
    const employeeInfo = employeeMap.get(record.userId) || { name: '未知员工', department: '未知部门' };
    const processedRecord = {
        ...record,
        // --- 增强字段：员工姓名和部门 ---
        userName: employeeInfo.name,
        department_Name: employeeInfo.department,
        // --- 时间转换字段 ---
        baseCheckTime: toLocaleTime(record.baseCheckTime),
        userCheckTime: toLocaleTime(record.userCheckTime),
        // --- 结果映射字段 ---
        sourceType_Desc: SOURCE_TYPE_MAP[record.sourceType as keyof typeof SOURCE_TYPE_MAP] || record.sourceType,
        locationResult_Desc: LOCATION_RESULT_MAP[record.locationResult as keyof typeof LOCATION_RESULT_MAP] || record.locationResult,
        timeResult_Desc: TIME_RESULT_MAP[record.timeResult as keyof typeof TIME_RESULT_MAP] || record.timeResult,
        checkType_Desc: CHECK_TYPE_MAP[record.checkType as keyof typeof CHECK_TYPE_MAP] || record.checkType,
    };

    return processedRecord;
};

/**
 * 接口 1: 获取员工打卡详情 (已优化：支持分页、7天范围分割和50人ID分割获取全部数据)
 * 对应钉钉 API: /attendance/listRecord
 * @param {express.Request} req 后端请求上下文
 * @param {express.Response} res 响应对象
 */
export const fetchPunchDetails = async (req: express.Request, res: express.Response) => {
    try {
        // 1. 从请求体中解析参数，统一使用 dingToken
        const { dingToken, employees, fromDate, toDate } = req.body;

        // 2. 参数校验
        if (!dingToken || !employees || employees.length === 0 || !fromDate || !toDate) {
            return res.status(400).json({
                success: false,
                message: '缺少必要的参数 (dingToken, employees, fromDate, toDate)!',
            });
        }

        console.log(`[${new Date().toLocaleString()}] Attendance 开始获取用户 ${employees.length} 人在 ${fromDate} 到 ${toDate} 间的打卡详情...`);

        const allRecords: any[] = [];
        const USER_CHUNK_LIMIT = 50;

        // 解析日期，并修正日期解析兼容性问题 (将 '-' 替换为 '/')
        const startDayString = fromDate.split(' ')[0];
        const endDayString = toDate.split(' ')[0];
        const overallEnd = new Date(endDayString.replace(/-/g, '/'));

        // 1. 【新增步骤】：获取当前用户列表的员工姓名和部门信息映射
        const employeeDetailsMap = new Map<string, {name: string, department: string}>();
        const userIdList = employees.map((emp: any) => {
            employeeDetailsMap.set(emp.userid, emp);
            return emp.userid;
        });

        // 2. 【用户ID分块循环】: 每次处理最多 50 个用户ID
        for (let u = 0; u < userIdList.length; u += USER_CHUNK_LIMIT) {
            const currentUserChunk = userIdList.slice(u, u + USER_CHUNK_LIMIT);
            console.log(`[${new Date().toLocaleString()}] Attendance - 正在处理用户块 (${u + 1} to ${u + currentUserChunk.length})`);

            // 3. 【日期分段循环】: 每次处理最多 7 天 (每次用户块循环都需要从原始的起始日期开始)
            const dateChunkStart = new Date(startDayString.replace(/-/g, '/'));
            while (dateChunkStart <= overallEnd) {
                // 1. 计算当前分段的结束日期
                let currentEnd = new Date(dateChunkStart);
                currentEnd.setDate(currentEnd.getDate() + 6); // + 6 days = 7 天范围 (包含起始日)

                // 2. 限制结束日期不能超过总结束日期
                if (currentEnd > overallEnd) {
                    currentEnd = overallEnd;
                }

                // 3. 格式化分段的起始和结束时间 (带上 00:00:00 和 23:59:59)
                const chunkWorkDateFrom = dateChunkStart.toISOString().split('T')[0] + ' 00:00:00';
                const chunkWorkDateTo = currentEnd.toISOString().split('T')[0] + ' 23:59:59';

                console.log(`[${new Date().toLocaleString()}] Attendance - 日期分段: ${chunkWorkDateFrom} to ${chunkWorkDateTo}`);

                // --- 4. 分段内的分页获取逻辑 ---
                let offset = 0;
                const limit = 50;
                let hasMore = true;

                while (hasMore) {
                    const dingtalkPayload = {
                        workDateFrom: chunkWorkDateFrom,
                        workDateTo: chunkWorkDateTo,
                        userIdList: currentUserChunk, // <--- 使用当前的用户块
                        offset: offset,
                        limit: limit,
                    };

                    const dingtalkResponse = await _callDingTalkApi(
                        dingToken,
                        '/attendance/list',
                        dingtalkPayload,
                    );

                    if (dingtalkResponse.recordresult && dingtalkResponse.recordresult.length > 0) {
                        allRecords.push(...dingtalkResponse.recordresult);
                    }

                    // 钉钉 API 响应中的 hasMore 字段
                    hasMore = dingtalkResponse.hasMore || false;
                    offset += limit;

                    if (hasMore) {
                        console.log(`[${new Date().toLocaleString()}] Attendance   - 分段内继续分页... 当前总记录数: ${allRecords.length}`);
                    }
                }

                // --- 分段内的分页获取逻辑结束 ---

                // 5. 移动到下一个分段的起始日期 (当前结束日期的后一天)
                dateChunkStart.setDate(currentEnd.getDate() + 1);
            }
        }

        console.log(`[${new Date().toLocaleString()}] Attendance 打卡详情获取完成，共 ${allRecords.length} 条记录。`);

        // 6. 【修改处理步骤】：对所有记录进行映射、时间转换和员工信息增强
        const processedRecords = allRecords.map((record) =>
            _processPunchRecord(record, employeeDetailsMap)
        );

        // 7. 返回最终结果
        return res.json({
            success: true,
            data: processedRecords,
            totalCount: allRecords.length,
        });
    } catch (error: any) {
        console.error(`[${new Date().toLocaleString()}] PunchDetails 接口处理失败！`, error);
        return res.status(500).json({
            success: false,
            message: `获取打卡详情失败：${error.message}`,
        });
    }
};

// 路由定义
router.post('/employees', fetchAllEmployees);
router.post('/punch', fetchPunchDetails);

export default router;