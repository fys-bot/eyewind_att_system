import express from 'express';
import axios from 'axios';
import { attendanceStatusService } from '../services/attendanceStatusService';
import { employeeService } from '../services/employeeService';
import { dataSyncService } from '../services/dataSyncService';
import { logApiRequest, logDbQuery, logApiResponse, logError, logWarning, getDataStructure } from '../utils/logger';

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
const DING_TODO_CREATE_PATH = '/topapi/workrecord/add'; // 创建待办
const DING_TODO_DELETE_PATH = '/topapi/workrecord/update'; // 删除/更新待办
const DING_PROCESS_INSTANCE_PATH = '/topapi/processinstance/get'; // 获取流程实例
const DING_ATTENDANCE_LOAD_PATH = '/attendance/list'; // 加载考勤数据
const DING_ATTENDANCE_UPSET_PATH = '/topapi/attendance/updatedata'; // 更新考勤数据

/**
 * 获取钉钉Access Token
 * 对应原外部API: https://sg.api.eyewind.cn/etl/dingding/gettoken
 */
export const fetchToken = async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  try {
    // 1. 从请求体中安全地获取 appkey 和 appsecret
    const { appkey, appsecret } = req.body;

    logApiRequest('/dingtalk/gettoken', 'POST', undefined, undefined, { hasAppkey: !!appkey, hasAppsecret: !!appsecret });

    if (!appkey || !appsecret) {
      logError('缺少必要参数', new Error('Missing params'), { appkey: !!appkey, appsecret: !!appsecret });
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数 appkey 或 appsecret'
      });
    }

    // 2. 构造完整的 API URL
    const url = `${DING_OAPI}${DING_GETTOKEN_PATH}`;

    // 3. 使用 URLSearchParams 构造查询参数对象
    const params = new URLSearchParams({
      appkey,   // 钉钉接口 key
      appsecret, // 钉钉接口 secret
    });

    // 4. 发起 GET 请求
    const response = await axios.get(`${url}?${params}`);
    const duration = Date.now() - startTime;

    // 检查 HTTP 状态码
    if (response.status !== 200) {
      const errorMessage = `获取 Token 失败，HTTP 状态码: ${response.status}`;
      logError('获取Token HTTP错误', new Error(errorMessage), { status: response.status, duration });
      return res.status(500).json({ 
        success: false, 
        message: errorMessage, 
        http_status: response.status 
      });
    }

    const data = response.data;

    // 5. 检查钉钉 API 业务错误码
    if (data.errcode && data.errcode !== 0) {
      logError('获取Token业务错误', new Error(data.errmsg), { errcode: data.errcode, duration });
      const errorMessage = `获取 Token 失败 [${data.errcode}]: ${data.errmsg || '未知钉钉错误'}`;
      return res.status(400).json({ 
        success: false, 
        message: errorMessage, 
        dingtalk_code: data.errcode,
        dingtalk_msg: data.errmsg,
        full_response: data 
      });
    }

    logApiResponse('/dingtalk/gettoken', 200, undefined, duration);
    
    // 成功，返回数据
    return res.json({ 
      data, 
      success: true 
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMessage = `服务器处理请求时发生意外错误: ${error.message}`;
    logError('fetchToken意外错误', error, { duration });
    return res.status(500).json({ 
      success: false, 
      message: errorMessage, 
      internal_error: true 
    });
  }
};

/**
 * 发送企业消息
 * 对应原外部API: https://sg.api.eyewind.cn/etl/dingding/corp/send
 */
export const sendCorpMessage = async (req: express.Request, res: express.Response) => {
  try {
    const { dingToken, agent_id, userid_list, msg } = req.body;

    if (!dingToken || !agent_id || !userid_list || !msg) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数'
      });
    }

    const payload = {
      agent_id,
      userid_list,
      msg
    };

    const result = await _callDingTalkApi(dingToken, DING_CORPCONVERSATION_PATH, payload);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("发送企业消息失败:", error);
    return res.status(500).json({
      success: false,
      message: `发送企业消息失败: ${error.message}`
    });
  }
};

/**
 * 创建待办
 * 对应原外部API: https://sg.api.eyewind.cn/etl/dingding/tudo/create
 */
export const createTodo = async (req: express.Request, res: express.Response) => {
  try {
    const { dingToken, userid, title, url, pc_url } = req.body;

    if (!dingToken || !userid || !title) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数'
      });
    }

    const payload = {
      userid,
      title,
      url: url || '',
      pc_url: pc_url || url || ''
    };

    const result = await _callDingTalkApi(dingToken, DING_TODO_CREATE_PATH, payload);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("创建待办失败:", error);
    return res.status(500).json({
      success: false,
      message: `创建待办失败: ${error.message}`
    });
  }
};

/**
 * 删除待办
 * 对应原外部API: https://sg.api.eyewind.cn/etl/dingding/tudo/delete
 */
export const deleteTodo = async (req: express.Request, res: express.Response) => {
  try {
    const { dingToken, record_id } = req.body;

    if (!dingToken || !record_id) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数'
      });
    }

    const payload = {
      record_id,
      status: 1 // 1表示完成/删除
    };

    const result = await _callDingTalkApi(dingToken, DING_TODO_DELETE_PATH, payload);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("删除待办失败:", error);
    return res.status(500).json({
      success: false,
      message: `删除待办失败: ${error.message}`
    });
  }
};

/**
 * 撤回企业消息
 * 对应原外部API: https://sg.api.eyewind.cn/etl/dingding/corp/recall
 */
export const recallCorpMessage = async (req: express.Request, res: express.Response) => {
  try {
    const { dingToken, msg_task_id } = req.body;

    if (!dingToken || !msg_task_id) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数'
      });
    }

    const payload = {
      msg_task_id
    };

    // 钉钉撤回消息API路径
    const result = await _callDingTalkApi(dingToken, '/topapi/message/corpconversation/recall', payload);
    
    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("撤回企业消息失败:", error);
    return res.status(500).json({
      success: false,
      message: `撤回企业消息失败: ${error.message}`
    });
  }
};

/**
 * 加载考勤数据 - 从数据库查询
 * 对应原外部API: https://sg.api.eyewind.cn/etl/dingding/attendance/load/{userid}
 * 支持多种查询模式：按用户ID、按月份、按用户ID+月份组合查询
 */
export const loadAttendanceData = async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  try {
    // 从请求 URL 中获取最后一部分作为参数
    const pathSegment = req.params.userid || req.params[0]; // 兼容不同的路由参数
    const monthRegex = /^\d{4}-\d{2}$/;  // 月份格式正则表达式

    logApiRequest('/dingtalk/attendance/load', 'GET', { pathSegment });

    // 查询所有考勤记录
    let records: any[] = [];

    // 如果是 'load'，则查询所有记录
    if (pathSegment === 'load') {
      // 执行查询所有考勤记录 - 使用service层
      records = await attendanceStatusService.getAllRecords();

      // 如果没有记录，返回提示
      if (records.length === 0) {
        logWarning('没有找到考勤记录', { pathSegment });
        return res.status(404).json({
          success: false,
          message: '没有找到相关的考勤记录。',
        });
      }

      // 按月份进行分类
      const groupedByMonth = records.reduce((result: Record<string, any[]>, record: any) => {
        const month = record.attd_month;
        if (!result[month]) {
          result[month] = [];  // 如果该月不存在，初始化为数组
        }
        result[month].push(record);  // 将当前记录添加到对应月份的数组中
        return result;
      }, {});

      const duration = Date.now() - startTime;
      const monthCount = Object.keys(groupedByMonth).length;
      logDbQuery('getAllRecords', records.length, `按月分组: ${monthCount}个月`, duration);
      logApiResponse('/dingtalk/attendance/load', 200, records.length, duration);

      // 返回按月份分类的数据
      return res.json({
        success: true,
        message: '考勤记录已按月份分类。',
        data: groupedByMonth,
      });
    }

    // 检查是否是用户ID和月份的组合查询 (格式: userid**attd_month)
    const [userid, attd_month] = pathSegment.split('**');
    if (userid && attd_month) {
      records = await attendanceStatusService.getRecordsByUserAndMonth(userid, attd_month);
      const duration = Date.now() - startTime;
      logDbQuery('getRecordsByUserAndMonth', records.length, `userId=${userid}, month=${attd_month}`, duration);
    } else if (monthRegex.test(pathSegment)) {
      // 如果是有效的月份格式
      records = await attendanceStatusService.getRecordsByMonth(pathSegment);
      const duration = Date.now() - startTime;
      logDbQuery('getRecordsByMonth', records.length, `month=${pathSegment}`, duration);
    } else {
      // 否则，假设是 userid
      records = await attendanceStatusService.getRecordsByUser(pathSegment);
      const duration = Date.now() - startTime;
      logDbQuery('getRecordsByUser', records.length, `userId=${pathSegment}`, duration);
    }

    // 如果没有记录，返回提示
    if (records.length === 0) {
      logWarning('没有找到考勤记录', { pathSegment });
      return res.status(404).json({
        success: false,
        message: '没有找到相关的考勤记录。',
      });
    }

    const duration = Date.now() - startTime;
    logApiResponse('/dingtalk/attendance/load', 200, records.length, duration);

    // 根据查询类型返回不同的消息
    if (monthRegex.test(pathSegment)) {
      return res.json({
        success: true,
        message: `成功查询 ${pathSegment} 月 ${records.length} 条考勤记录。`,
        data: records, // 返回查询到的记录
      });
    }

    if (userid && attd_month) {
      return res.json({
        success: true,
        message: `成功查询用户 ${userid} 在 ${attd_month} 月的考勤记录。`,
        data: records, // 返回查询到的记录
      });
    }

    // 如果路径中传递的是 userid，直接返回该用户的考勤记录
    return res.json({
      success: true,
      message: `成功查询用户 ${pathSegment} 的考勤记录。`,
      data: records, // 返回查询到的记录
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    // 错误处理：捕获异常并记录
    logError('读取考勤状态失败', error, { duration });
    return res.status(500).json({
      success: false,
      message: '读取考勤状态失败，内部错误。',
      detail: error.message?.substring(0, 200),  // 错误详情（限制为 200 字符）
    });
  }
};

/**
 * 更新考勤数据 - 批量UPSERT到数据库
 * 对应原外部API: https://sg.api.eyewind.cn/etl/dingding/attendance/upset
 * 该接口基于 userid 和 attd_month 作为唯一键进行操作
 */
export const updateAttendanceData = async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  try {
    // 从请求体中获取待批量 upsert 的数据 (data 数组)
    const { data = [] } = req.body;

    logApiRequest('/dingtalk/attendance/upset', 'POST', undefined, undefined, { 
      dataCount: data.length,
      dataStructure: data.length > 0 ? getDataStructure(data) : 'empty'
    });

    // 检查 data 是否有效，必须是一个数组且非空
    if (!Array.isArray(data) || data.length === 0) {
      logError('无效的data数组', new Error('Invalid data'), { isArray: Array.isArray(data), length: data?.length });
      return res.status(400).json({
        success: false,
        message: '操作失败：必须提供有效的 data 数组。',
      });
    }

    // 校验每条记录的关键字段：确保每条记录都有 userid 和 attd_month
    const invalid = data.filter((r: any) => !r.userid || !r.attd_month);
    if (invalid.length > 0) {
      logError('存在无效记录', new Error('Invalid records'), { invalidCount: invalid.length, totalCount: data.length });
      return res.status(400).json({
        success: false,
        message: `操作失败：存在缺少 userid 或 attd_month 的记录，共 ${invalid.length} 条。`,
        invalid_records: invalid, // 返回缺失字段的记录
      });
    }

    // 添加时间戳：根据是否已有创建时间来设置字段
    const dataWithTimestamps = data.map((record: any) => ({
      ...record,
      created_at: record.created_at || new Date(),  // 如果没有传入 created_at，则使用当前时间
      updated_at: new Date(),  // 每次更新时，都设置 updated_at 为当前时间
    }));

    // 获取更新字段（排除 id 和 created_at）
    const dataKey = Object.keys(dataWithTimestamps[0]).filter(key => 
      key !== 'created_at' && key !== 'id' // id 通常是自增主键，created_at 不应被更新
    );

    // 执行批量 UPSERT 操作 - 使用service层
    const result = await attendanceStatusService.batchUpsert(dataWithTimestamps);
    const duration = Date.now() - startTime;

    logDbQuery('batchUpsert', data.length, `success=${result.success}`, duration);
    logApiResponse('/dingtalk/attendance/upset', 200, data.length, duration);

    // 返回操作结果
    return res.json({
      success: true,
      message: `批量 UPSERT 成功，共处理 ${data.length} 条记录。`,
      data: {
        total: data.length,             // 总共处理的记录数
        success_count: Array.isArray(result) ? result.length : data.length, // 成功更新/插入的记录数
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    // 捕获异常并返回错误信息
    logError('批量UPSERT考勤状态失败', error, { duration });
    
    // 处理数据库约束错误
    if (error.message && error.message.indexOf('duplicate key') > -1) {
      return res.status(409).json({
        success: false,
        message: '数据冲突：存在重复的记录。',
        detail: error.detail || error.message.substring(0, 200),
      });
    }
    
    return res.status(500).json({
      success: false,
      message: '批量 UPSERT 失败，内部错误。',
      detail: error.message?.substring(0, 200),  // 错误详情（限制为 200 字符）
    });
  }
};

/**
 * 获取流程实例
 * 对应原外部API: https://sg.api.eyewind.cn/etl/dingding/processInstances/{procInstId}
 */
export const getProcessInstance = async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  try {
    const { procInstId } = req.params;
    const { dingToken } = req.body;

    logApiRequest('/dingtalk/processInstances/:procInstId', 'POST', { procInstId }, undefined, { hasDingToken: !!dingToken });

    if (!dingToken || !procInstId) {
      logError('缺少必要参数', new Error('Missing params'), { hasDingToken: !!dingToken, hasProcInstId: !!procInstId });
      return res.status(400).json({
        success: false,
        message: '缺少必要的参数'
      });
    }

    // 使用钉钉新版API获取流程实例详情
    const response = await axios.get(
      `https://api.dingtalk.com/v1.0/workflow/processInstances?processInstanceId=${procInstId}`,
      {
        headers: {
          'x-acs-dingtalk-access-token': dingToken,
          'Content-Type': 'application/json',
        },
      }
    );

    const data = response.data;
    if (!data) {
      const duration = Date.now() - startTime;
      logWarning('流程实例数据为空', { procInstId, duration });
      return res.json({
        success: true,
        data: {}
      });
    }

    const instance = data.result || data.processInstance || data.data || data; // 兼容不同返回格式

    // ---- 1. 基础字段 ----
    const instanceId = instance.processInstanceId;
    const title = instance.title || instance.processInstanceName;
    const originatorUserId = instance.originatorUserId || instance.startUserId;
    const status = instance.status;
    const startTime = Number(instance.createTime || instance.startTime);
    const finishTime = Number(instance.finishTime || instance.completeTime);
    const durationHours = finishTime
      ? Number(((finishTime - startTime) / 3600000).toFixed(2))
      : undefined;

    // ---- 2. 表单字段（自动转为 key:value） ----
    let formValues: Record<string, any> = {};
    const forms = instance.formComponentValues || instance.formValues || [];
    if (Array.isArray(forms)) {
      forms.forEach((item: any) => {
        if (item.name && item.value != null) {
          formValues[item.name] = item.value;
        }
      });
    }

    // ---- 3. 智能推断审批类型 ----
    const detectBizType = () => {
      const text = (title + JSON.stringify(formValues)).toLowerCase();
      if (text.includes('请假') || text.includes('leave')) return '请假';
      if (text.includes('加班') || text.includes('overtime')) return '加班';
      if (text.includes('报销') || text.includes('reimburse')) return '报销';
      if (text.includes('出差') || text.includes('travel')) return '出差';
      if (text.includes('采购') || text.includes('purchase')) return '采购';
      return '通用审批';
    };

    const bizType = detectBizType();

    // ---- 4. 特殊处理请假类型的表单数据 ----
    if (bizType === '请假') {
      const result: Record<string, any> = {
        date: formValues["请假申请日期"],
        department: formValues["所在部门"],
        reason: formValues["请假事由"]
      };

      const weirdKey = Object.keys(formValues).find(k => k.includes("开始时间"));
      if (weirdKey) {
        try {
          const arr = JSON.parse(formValues[weirdKey]); // 反序列化成数组
          result.start = arr[0];
          result.end = arr[1];
          result.duration = arr[2];
          result.durationUnit = arr[3];
          result.leaveType = arr[4];
        } catch (e) {
          logError('解析请假时间数据失败', e, { procInstId });
        }
      }
      formValues = result;
    }

    // ---- 5. 当前审批人 ----
    let currentApprover = null;
    if (instance.tasks && Array.isArray(instance.tasks)) {
      const pending = instance.tasks.find((t: any) => t.status === 'RUNNING');
      if (pending) {
        currentApprover = pending.taskUserId || pending.userId;
      }
    }

    const duration = Date.now() - startTime;
    logDbQuery('getProcessInstance', 1, `bizType=${bizType}, status=${status}`, duration);
    logApiResponse('/dingtalk/processInstances', 200, 1, duration);

    return res.json({
      data: {
        instanceId,
        title,
        bizType,
        originatorUserId,
        status,
        startTime,
        finishTime,
        durationHours,
        currentApprover,
        formValues,
      },
      success: true,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError('获取审批详情失败', error, { duration });
    return res.status(500).json({
      success: false,
      message: `获取审批详情失败：${error.message}`,
    });
  }
};

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
    status_list: '2,5,3,-1', // 🔥 只查询在职员工：2=在职（移除了 5=退休，3=离职，-1=未入职）
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
    console.log(currentChunk)
    allUserIds = allUserIds.concat(currentChunk);

    const nextCursor = result.next_cursor;

    // 如果存在下一页游标且不为 -1，则继续递归
    if (nextCursor !== null && nextCursor !== undefined && nextCursor !== -1) {
      // console.log(`[${new Date().toLocaleString()}] DingTalk API 当前已获取 ${allUserIds.length} 条用户ID，继续请求下一页游标: ${nextCursor}`);
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
      // console.log(`[${new Date().toLocaleString()}] DingTalk API HRM批次间等待 500ms 避免QPS限流...`);
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
  const startTime = Date.now();
  try {
    // 1. 从请求体中解析出钉钉 Access Token
    const { dingToken } = req.body;
    
    logApiRequest('/dingtalk/employees', 'POST', undefined, undefined, { hasDingToken: !!dingToken });
    
    if (!dingToken) {
      logError('缺少钉钉访问令牌', new Error('Missing dingToken'));
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

    console.log(`[${new Date().toLocaleString()}] DingTalk API 获取到 ${allUserIds.length} 个用户ID、${departmentMap.size} 个部门`);

    // 3. 异步获取 HRM 主体公司数据 (依赖 allUserIds)
    const hrmCompanyMap = await _fetchHrmEmployeeData(dingToken, allUserIds);

    console.log(`[${new Date().toLocaleString()}] DingTalk API 获取到 ${hrmCompanyMap.size} 条员工HRM数据`);

    // 4. 批量获取用户详情 (严格限制并发和添加延迟以防止QPS限流)
    const CONCURRENCY_LIMIT = 18; // 降低并发数
    const DELAY_BETWEEN_BATCHES = 500; // 每批次间延迟500ms
    const detailedUsers: any[] = [];

    // 统计不同 mainCompany 对应的人数
    const companyCounts: Record<string, string[]> = {};

    console.log(`[${new Date().toLocaleString()}] DingTalk API 开始获取用户详情，并发限制: ${CONCURRENCY_LIMIT}，批次延迟: ${DELAY_BETWEEN_BATCHES}ms`);

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
          const mainCompany = hrmCompanyMap.get(user.userid) || ''; // 如果没有主体公司，设为空字符串
          
          // 7. 组装最终结果（包含所有员工，不管是否有主体公司）
          detailedUsers.push({
            ...user,
            department: [...new Set(deptNames)].join('、'),
            mainCompany: mainCompany, // 新增的主体公司字段
          });

          // 8. 统计主体公司人数（只统计有主体公司的员工）
          if (mainCompany) {
            if (!companyCounts[mainCompany]) {
              companyCounts[mainCompany] = [];
            }
            companyCounts[mainCompany].push(user.userid);
          }
        });

      console.log(`[${new Date().toLocaleString()}] DingTalk API 完成处理 ${i + chunk.length} / ${allUserIds.length} 条记录...`);
      
      // 添加批次间延迟，避免QPS限流
      if (i + CONCURRENCY_LIMIT < allUserIds.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    const duration = Date.now() - startTime;
    const companyCountsSummary = Object.entries(companyCounts).map(([company, users]) => `${company}:${users.length}人`).join(', ');
    
    logDbQuery('fetchAllEmployees', detailedUsers.length, `公司分布: ${companyCountsSummary}`, duration);
    logApiResponse('/dingtalk/employees', 200, detailedUsers.length, duration);

    // 8. 🔥 自动同步员工数据到数据库（异步，不阻塞响应）
    const companyIdForSync = Object.keys(companyCounts).some(c => c.includes('海多多')) ? 'hydodo' : 'eyewind';
    employeeService.batchUpsertEmployees(companyIdForSync as any, detailedUsers).catch(err => {
      console.error('[DataSync] 自动同步员工数据失败:', err.message);
    });

    // 9. 返回结果
    return res.json({
      employees: detailedUsers,
      totalCount: detailedUsers.length,
      companyCounts: companyCounts, // 新增：主体公司人数统计
      success: true,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logError('获取员工完整信息失败', error, { duration });

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
    // console.log(`[${new Date().toLocaleString()}] DingTalk API Calling: ${apiPath}`, payload?.userid && `userid: ${payload?.userid}`);

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
 * 计算获取打卡数据的实际日期范围
 * 🔥 优化：起始日期改为上个月的最后一个工作日，确保跨月规则有足够的数据
 * @param fromDate 原始开始日期 (格式: "YYYY-MM-DD HH:mm:ss")
 * @param toDate 原始结束日期 (格式: "YYYY-MM-DD HH:mm:ss")
 * @returns 调整后的日期范围
 */
const calculateExtendedDateRange = (fromDate: string, toDate: string): { adjustedFromDate: string; adjustedToDate: string; isPreviousMonthIncluded: boolean } => {
    const startDate = new Date(fromDate.split(' ')[0].replace(/-/g, '/'));
    const endDate = new Date(toDate.split(' ')[0].replace(/-/g, '/'));
    
    // 🔥 新逻辑：总是从上个月的最后一个工作日开始
    // 这样可以确保：
    // 1. 跨月规则有数据（本月第一天需要上月最后一天的打卡）
    // 2. 跨周规则有数据（本月第一周的周一需要上周五的打卡）
    // 3. 数据更完整，避免边界情况
    
    let adjustedStart = new Date(startDate);
    let isPreviousMonthIncluded = false;
    
    // 计算上个月的最后一天
    const lastDayOfPreviousMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 0);
    
    // 🔥 从上个月最后一天往前推，找到最后一个工作日
    // 简化实现：往前推10-14天，确保包含上个月最后一个工作日
    // 这样可以覆盖：周末 + 可能的节假日 + 上周五
    adjustedStart = new Date(lastDayOfPreviousMonth);
    adjustedStart.setDate(adjustedStart.getDate() - 13); // 往前推13天，共14天范围
    isPreviousMonthIncluded = true;
    
    // console.log(`[calculateExtendedDateRange] 🔥 优化：从上个月最后一个工作日开始获取数据`);
    // console.log(`[calculateExtendedDateRange] 原始范围: ${fromDate} ~ ${toDate}`);
    // console.log(`[calculateExtendedDateRange] 上个月最后一天: ${lastDayOfPreviousMonth.toISOString().split('T')[0]}`);
    // console.log(`[calculateExtendedDateRange] 调整后起始日期: ${adjustedStart.toISOString().split('T')[0]} (往前推14天)`);
    // console.log(`[calculateExtendedDateRange] 调整后范围: ${adjustedStart.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`);
    
    return {
        adjustedFromDate: `${adjustedStart.toISOString().split('T')[0]} 00:00:00`,
        adjustedToDate: toDate,
        isPreviousMonthIncluded
    };
};

/**
 * 接口 1: 获取员工打卡详情 (已优化：支持分页、7天范围分割和50人ID分割获取全部数据)
 * 🔥 优化：自动从上个月最后一个工作日开始获取数据，确保跨月/跨周规则有足够的数据
 * 对应钉钉 API: /attendance/listRecord
 * @param {express.Request} req 后端请求上下文
 * @param {express.Response} res 响应对象
 */
export const fetchPunchDetails = async (req: express.Request, res: express.Response) => {
    const startTime = Date.now();
    try {
        // 1. 从请求体中解析参数，统一使用 dingToken
        const { dingToken, employees, fromDate, toDate } = req.body;

        logApiRequest('/dingtalk/punch', 'POST', undefined, undefined, { 
            employeeCount: employees?.length,
            fromDate,
            toDate,
            hasDingToken: !!dingToken
        });

        // 2. 参数校验
        if (!dingToken || !employees || employees.length === 0 || !fromDate || !toDate) {
            logError('缺少必要参数', new Error('Missing params'), { 
                hasDingToken: !!dingToken,
                employeeCount: employees?.length,
                hasFromDate: !!fromDate,
                hasToDate: !!toDate
            });
            return res.status(400).json({
                success: false,
                message: '缺少必要的参数 (dingToken, employees, fromDate, toDate)!',
            });
        }

        console.log(`[${new Date().toLocaleString()}] Attendance 开始获取用户 ${employees.length} 人在 ${fromDate} 到 ${toDate} 间的打卡详情...`);

        // 🔥 计算扩展的日期范围（包含上个月最后几天）
        const { adjustedFromDate, adjustedToDate, isPreviousMonthIncluded } = calculateExtendedDateRange(fromDate, toDate);
        
        console.log(`[${new Date().toLocaleString()}] Attendance 日期范围调整: ${fromDate} ~ ${toDate} => ${adjustedFromDate} ~ ${adjustedToDate} (包含上月: ${isPreviousMonthIncluded})`);
        
        const allRecords: any[] = [];
        const USER_CHUNK_LIMIT = 50;

        // 解析日期，并修正日期解析兼容性问题 (将 '-' 替换为 '/')
        const startDayString = adjustedFromDate.split(' ')[0];
        const endDayString = adjustedToDate.split(' ')[0];
        const overallEnd = new Date(endDayString.replace(/-/g, '/'));
        
        // 🔥 添加日期解析调试信息
        // console.log(`[DEBUG] 日期解析结果:`, {
        //     startDayString,
        //     endDayString,
        //     overallEndISO: overallEnd.toISOString(),
        //     overallEndLocal: overallEnd.toLocaleString()
        // });

        // 1. 【新增步骤】：获取当前用户列表的员工姓名和部门信息映射
        const employeeDetailsMap = new Map<string, {name: string, department: string}>();
        const userIdList = employees.map((emp: any) => {
            employeeDetailsMap.set(emp.userid, emp);
            return emp.userid;
        });

        // 2. 【用户ID分块循环】: 每次处理最多 50 个用户ID
        for (let u = 0; u < userIdList.length; u += USER_CHUNK_LIMIT) {
            const currentUserChunk = userIdList.slice(u, u + USER_CHUNK_LIMIT);
            console.log(`[${new Date().toLocaleString()}] Attendance - 正在处理用户块 ${Math.floor(u / USER_CHUNK_LIMIT) + 1}/${Math.ceil(userIdList.length / USER_CHUNK_LIMIT)} (${currentUserChunk.length}人)`);

            // 3. 【日期分段循环】: 每次处理最多 7 天 (每次用户块循环都需要从原始的起始日期开始)
            const dateChunkStart = new Date(startDayString.replace(/-/g, '/'));
            let iterations = 0;
            const MAX_ITERATIONS = 100; // 🔥 添加安全限制，防止死循环
            
            while (dateChunkStart <= overallEnd && iterations < MAX_ITERATIONS) {
                iterations++;
                
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

                console.log(`[${new Date().toLocaleString()}] Attendance - 日期分段 ${iterations}: ${chunkWorkDateFrom} ~ ${chunkWorkDateTo}`);

                // --- 4. 分段内的分页获取逻辑 ---
                let offset = 0;
                const limit = 50;
                let hasMore = true;
                let pageCount = 0;

                while (hasMore) {
                    pageCount++;
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
                        console.log(`[${new Date().toLocaleString()}] Attendance - 分页 ${pageCount}: 获取到 ${dingtalkResponse.recordresult.length} 条打卡记录`);
                        allRecords.push(...dingtalkResponse.recordresult);
                    }

                    // 钉钉 API 响应中的 hasMore 字段
                    hasMore = dingtalkResponse.hasMore || false;
                    offset += limit;
                }

                // --- 分段内的分页获取逻辑结束 ---

                // 5. 🔥 修复日期递增逻辑，避免死循环
                const nextStart = new Date(currentEnd);
                nextStart.setDate(nextStart.getDate() + 1);
                
                // 检查是否需要继续循环
                if (nextStart > overallEnd) {
                    break;
                }
                
                // 更新循环变量
                dateChunkStart.setTime(nextStart.getTime());
            }
            
            // 🔥 检查是否因为达到最大迭代次数而退出
            if (iterations >= MAX_ITERATIONS) {
                logWarning('日期循环达到最大迭代次数', { iterations: MAX_ITERATIONS });
            }
        }

        console.log(`[${new Date().toLocaleString()}] Attendance 打卡详情获取完成，共 ${allRecords.length} 条记录`);

        // 🔥 标记哪些记录是上个月的数据（用于跨天打卡规则）
        const originalFromDate = new Date(fromDate.split(' ')[0].replace(/-/g, '/'));
        const processedRecords = allRecords.map((record) => {
            const recordDate = new Date(record.workDate);
            const isPreviousMonth = recordDate < originalFromDate;
            
            // 处理记录并添加标记
            const processed = _processPunchRecord(record, employeeDetailsMap);
            return {
                ...processed,
                isPreviousMonthData: isPreviousMonth  // 标记是否为上个月数据
            };
        });

        const duration = Date.now() - startTime;
        const previousMonthCount = processedRecords.filter(r => r.isPreviousMonthData).length;
        const currentMonthCount = processedRecords.length - previousMonthCount;
        
        logDbQuery('fetchPunchDetails', processedRecords.length, `当月:${currentMonthCount}条, 上月:${previousMonthCount}条`, duration);
        logApiResponse('/dingtalk/punch', 200, processedRecords.length, duration);

        // 7. 🔥 自动同步打卡数据到数据库（异步，不阻塞响应）
        try {
          const [y, m] = fromDate.split(' ')[0].split('-');
          const yearMonth = `${y}-${m}`;
          // 根据员工数据判断公司ID
          const companyIdForSync = (employees && employees.length > 0)
            ? 'eyewind' // 默认，后续可根据实际逻辑判断
            : 'eyewind';
          dataSyncService.syncPunchData(companyIdForSync as any, yearMonth, processedRecords, employees || []).catch(err => {
            console.error('[DataSync] 自动同步打卡数据失败:', err.message);
          });
        } catch (syncErr) {
          console.error('[DataSync] 准备同步打卡数据时出错:', syncErr);
        }

        // 8. 返回最终结果
        return res.json({
            success: true,
            data: processedRecords,
            totalCount: allRecords.length,
            metadata: {
                requestedRange: { from: fromDate, to: toDate },
                actualRange: { from: adjustedFromDate, to: adjustedToDate },
                isPreviousMonthIncluded,
                previousMonthRecordsCount: previousMonthCount
            }
        });
    } catch (error: any) {
        const duration = Date.now() - startTime;
        logError('获取打卡详情失败', error, { duration });
        return res.status(500).json({
            success: false,
            message: `获取打卡详情失败：${error.message}`,
        });
    }
};

// 路由定义
router.post('/gettoken', fetchToken);
router.post('/employees', fetchAllEmployees);
router.post('/punch', fetchPunchDetails);
router.post('/corp/send', sendCorpMessage);
router.post('/tudo/create', createTodo);
router.post('/tudo/delete', deleteTodo);
router.post('/corp/recall', recallCorpMessage);
router.post('/processInstances/:procInstId', getProcessInstance);
router.get('/attendance/load/:userid', loadAttendanceData);
router.get('/attendance/load', loadAttendanceData); // 支持查询所有记录
router.post('/attendance/upset', updateAttendanceData);

export default router;