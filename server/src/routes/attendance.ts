import { Router, Request, Response } from 'express';
import { attendanceService } from '../services/attendanceService';
import { attendanceStatusService } from '../services/attendanceStatusService';
import type { CompanyId, ApiResponse } from '../types/index';
import type { BatchUpdateDailyRequest, SyncRequest, EditLogQuery } from '../types/attendance';

const router = Router();

// 验证公司ID
const validateCompanyId = (companyId: string): companyId is CompanyId => {
  return companyId === 'eyewind' || companyId === 'hydodo';
};

// 验证年月格式
const validateYearMonth = (yearMonth: string): boolean => {
  return /^\d{4}-\d{2}$/.test(yearMonth);
};

// GET /api/v1/attendance/calendar/:companyId/:yearMonth - 获取月度考勤日历
router.get('/calendar/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    const userIds = req.query.userIds ? (req.query.userIds as string).split(',') : undefined;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID，必须是 eyewind 或 hydodo',
      } as ApiResponse);
    }
    
    if (!validateYearMonth(yearMonth)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的年月格式，应为 YYYY-MM',
      } as ApiResponse);
    }
    
    const data = await attendanceService.getMonthlyCalendar(companyId, yearMonth, userIds);
    
    res.json({
      code: 0,
      data,
    } as ApiResponse);
  } catch (error) {
    console.error('获取月度考勤日历失败:', error);
    res.status(500).json({
      code: 50002,
      message: '数据库操作失败',
    } as ApiResponse);
  }
});

// GET /api/v1/attendance/calendar/:companyId/:yearMonth/:userId - 获取单个员工月度数据
router.get('/calendar/:companyId/:yearMonth/:userId', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth, userId } = req.params;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID',
      } as ApiResponse);
    }
    
    if (!validateYearMonth(yearMonth)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的年月格式',
      } as ApiResponse);
    }
    
    const data = await attendanceService.getEmployeeMonthlyData(companyId, yearMonth, userId);
    
    res.json({
      code: 0,
      data,
    } as ApiResponse);
  } catch (error) {
    console.error('获取员工月度数据失败:', error);
    res.status(500).json({
      code: 50002,
      message: '数据库操作失败',
    } as ApiResponse);
  }
});

// PUT /api/v1/attendance/daily/:companyId - 批量更新每日考勤
router.put('/daily/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const editorId = req.headers['x-user-id'] as string || 'anonymous';
    const editorName = req.headers['x-user-name'] as string || undefined;
    const clientIp = req.ip || req.headers['x-forwarded-for'] as string || undefined;
    const userAgent = req.headers['user-agent'] || undefined;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID',
      } as ApiResponse);
    }
    
    const data: BatchUpdateDailyRequest = req.body;
    if (!data.updates || !Array.isArray(data.updates) || data.updates.length === 0) {
      return res.status(400).json({
        code: 40002,
        message: '缺少 updates 数组',
      } as ApiResponse);
    }
    
    const result = await attendanceService.batchUpdateDaily(
      companyId,
      data,
      editorId,
      editorName,
      clientIp,
      userAgent
    );
    
    res.json({
      code: 0,
      data: result,
    } as ApiResponse);
  } catch (error: any) {
    console.error('批量更新每日考勤失败:', error);
    res.status(500).json({
      code: 50002,
      message: error.message || '数据库操作失败',
    } as ApiResponse);
  }
});

// PATCH /api/v1/attendance/daily/:dailyId - 更新单条每日考勤
router.patch('/daily/:dailyId', async (req: Request, res: Response) => {
  try {
    const { dailyId } = req.params;
    const companyId = req.query.companyId as string;
    const editorId = req.headers['x-user-id'] as string || 'anonymous';
    const editorName = req.headers['x-user-name'] as string || undefined;
    const clientIp = req.ip || req.headers['x-forwarded-for'] as string || undefined;
    const userAgent = req.headers['user-agent'] || undefined;
    
    if (!companyId || !validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '缺少或无效的 companyId 参数',
      } as ApiResponse);
    }
    
    const result = await attendanceService.updateDaily(
      companyId,
      parseInt(dailyId),
      req.body,
      editorId,
      editorName,
      clientIp,
      userAgent
    );
    
    res.json({
      code: 0,
      data: result,
    } as ApiResponse);
  } catch (error: any) {
    console.error('更新每日考勤失败:', error);
    
    if (error.message === '记录不存在') {
      return res.status(404).json({
        code: 40001,
        message: error.message,
      } as ApiResponse);
    }
    
    res.status(500).json({
      code: 50002,
      message: error.message || '数据库操作失败',
    } as ApiResponse);
  }
});

// POST /api/v1/attendance/sync/:companyId/:yearMonth - 触发数据同步（占位）
router.post('/sync/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID',
      } as ApiResponse);
    }
    
    if (!validateYearMonth(yearMonth)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的年月格式',
      } as ApiResponse);
    }
    
    const syncRequest: SyncRequest = req.body;
    
    // TODO: 实现实际的钉钉数据同步逻辑
    // 目前返回模拟响应
    res.json({
      code: 0,
      data: {
        taskId: `sync_${Date.now()}`,
        status: 'completed',
        totalUsers: 0,
        processedUsers: 0,
        message: '同步功能待实现，需要对接钉钉API',
      },
    } as ApiResponse);
  } catch (error) {
    console.error('触发同步失败:', error);
    res.status(500).json({
      code: 50001,
      message: '同步服务异常',
    } as ApiResponse);
  }
});

// GET /api/v1/attendance/stats/:companyId/:yearMonth - 获取月度统计
router.get('/stats/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    const sortBy = req.query.sortBy as string | undefined;
    const order = req.query.order as 'asc' | 'desc' | undefined;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID',
      } as ApiResponse);
    }
    
    if (!validateYearMonth(yearMonth)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的年月格式',
      } as ApiResponse);
    }
    
    const data = await attendanceService.getMonthlyStats(companyId, yearMonth, sortBy, order);
    
    res.json({
      code: 0,
      data,
    } as ApiResponse);
  } catch (error) {
    console.error('获取月度统计失败:', error);
    res.status(500).json({
      code: 50002,
      message: '数据库操作失败',
    } as ApiResponse);
  }
});

// POST /api/v1/attendance/stats/recalc/:companyId/:yearMonth - 重新计算统计
router.post('/stats/recalc/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID',
      } as ApiResponse);
    }
    
    if (!validateYearMonth(yearMonth)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的年月格式',
      } as ApiResponse);
    }
    
    const result = await attendanceService.recalculateMonthlyStats(companyId, yearMonth);
    
    res.json({
      code: 0,
      data: result,
    } as ApiResponse);
  } catch (error) {
    console.error('重新计算统计失败:', error);
    res.status(500).json({
      code: 50002,
      message: '数据库操作失败',
    } as ApiResponse);
  }
});

// GET /api/v1/attendance/edit-logs/:companyId - 获取编辑日志
router.get('/edit-logs/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID',
      } as ApiResponse);
    }
    
    const query: EditLogQuery = {
      userId: req.query.userId as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      editType: req.query.editType as any,
      editorId: req.query.editorId as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      size: req.query.size ? parseInt(req.query.size as string) : 20,
    };
    
    const data = await attendanceService.getEditLogs(companyId, query);
    
    res.json({
      code: 0,
      data,
    } as ApiResponse);
  } catch (error) {
    console.error('获取编辑日志失败:', error);
    res.status(500).json({
      code: 50002,
      message: '数据库操作失败',
    } as ApiResponse);
  }
});

// GET /api/v1/attendance/approval/:procInstId - 获取审批单详情
router.get('/approval/:procInstId', async (req: Request, res: Response) => {
  try {
    const { procInstId } = req.params;
    
    const data = await attendanceService.getApprovalDetail(procInstId);
    
    if (!data) {
      return res.status(404).json({
        code: 40001,
        message: '审批单不存在',
      } as ApiResponse);
    }
    
    res.json({
      code: 0,
      data,
    } as ApiResponse);
  } catch (error) {
    console.error('获取审批单详情失败:', error);
    res.status(500).json({
      code: 40004,
      message: '审批单获取失败',
    } as ApiResponse);
  }
});

// 🔥 新增：考勤状态相关接口

// POST /api/v1/attendance/status/upsert - 批量 UPSERT 考勤状态
router.post('/status/upsert', async (req: Request, res: Response) => {
  try {
    const { data = [] } = req.body;
    
    // 🔥 设置缓存控制头
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const result = await attendanceStatusService.batchUpsert(data);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        detail: result.detail,
      });
    }
  } catch (error: any) {
    console.error('批量 UPSERT 考勤状态失败:', error);
    res.status(500).json({
      success: false,
      message: '批量 UPSERT 失败，内部错误。',
      detail: error.message?.substring(0, 200),
    });
  }
});

// GET /api/v1/attendance/status/load/:pathSegment? - 加载考勤状态
router.get('/status/load/:pathSegment?', async (req: Request, res: Response) => {
  try {
    const pathSegment = req.params.pathSegment || 'load';
    const companyId = req.query.companyId as string; // 🔥 从查询参数获取公司ID
    
    // 🔥 设置缓存控制头，避免304响应
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // 🔥 验证公司ID（如果提供）
    if (companyId && !validateCompanyId(companyId)) {
      return res.status(400).json({
        success: false,
        message: '无效的公司ID，必须是 eyewind 或 hydodo',
      });
    }
    
    const result = await attendanceStatusService.loadAttendanceStatus(pathSegment, companyId);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error: any) {
    console.error('加载考勤状态失败:', error);
    res.status(500).json({
      success: false,
      message: '读取考勤状态失败，内部错误。',
      detail: error.message?.substring(0, 200),
    });
  }
});

export default router;
