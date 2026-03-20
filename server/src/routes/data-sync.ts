import { Router, Request, Response } from 'express';
import { dataSyncService } from '../services/dataSyncService';
import { employeeService, EmployeeService } from '../services/employeeService';
import { monthSnapshotService } from '../services/monthSnapshotService';
import { attendanceService } from '../services/attendanceService';
import type { CompanyId, ApiResponse } from '../types/index';

const router = Router();

const validateCompanyId = (companyId: string): companyId is CompanyId => {
  return companyId === 'eyewind' || companyId === 'hydodo';
};

// ============================================================
// 员工相关
// ============================================================

// POST /api/v1/sync/employees/:companyId — 同步员工数据
router.post('/employees/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const { employees } = req.body;
    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ code: 40003, message: '员工数据不能为空' } as ApiResponse);
    }

    const result = await dataSyncService.syncEmployees(companyId, employees);
    res.json({ code: 0, data: result } as ApiResponse);
  } catch (error: any) {
    console.error('同步员工数据失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// GET /api/v1/sync/employees/:companyId — 获取员工列表
router.get('/employees/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const includeResigned = req.query.includeResigned === 'true';
    const employees = await employeeService.getAllEmployees(companyId, includeResigned);
    const frontendEmployees = employees.map(e => EmployeeService.toFrontendFormat(e));

    res.json({
      code: 0,
      data: {
        employees: frontendEmployees,
        total: frontendEmployees.length,
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取员工列表失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// GET /api/v1/sync/employees/:companyId/:yearMonth — 获取某月参与考勤的员工
router.get('/employees/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const employees = await employeeService.getMonthlyEmployees(companyId, yearMonth);
    const frontendEmployees = employees.map(e => EmployeeService.toFrontendFormat(e));

    res.json({
      code: 0,
      data: {
        employees: frontendEmployees,
        total: frontendEmployees.length,
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取月度员工列表失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// ============================================================
// 打卡数据同步
// ============================================================

// POST /api/v1/sync/punch/:companyId/:yearMonth — 同步打卡数据
router.post('/punch/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const { punchRecords, employees } = req.body;
    if (!Array.isArray(punchRecords)) {
      return res.status(400).json({ code: 40003, message: '打卡数据不能为空' } as ApiResponse);
    }

    const result = await dataSyncService.syncPunchData(companyId, yearMonth, punchRecords, employees || []);
    res.json({ code: 0, data: result } as ApiResponse);
  } catch (error: any) {
    console.error('同步打卡数据失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// ============================================================
// 月度统计同步
// ============================================================

// POST /api/v1/sync/stats/:companyId/:yearMonth — 同步月度统计
router.post('/stats/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const { statsData, companyAggregates, employeeCounts, fullAttendanceCounts } = req.body;

    // 1. 同步员工级统计
    if (Array.isArray(statsData) && statsData.length > 0) {
      await dataSyncService.syncMonthlyStats(companyId, yearMonth, statsData);
    }

    // 2. 同步公司级汇总
    if (companyAggregates && typeof companyAggregates === 'object') {
      await monthSnapshotService.batchUpsertCompanyAggregates(
        companyId,
        yearMonth,
        companyAggregates,
        employeeCounts || {},
        fullAttendanceCounts || {}
      );
    }

    res.json({ code: 0, message: '统计数据同步成功' } as ApiResponse);
  } catch (error: any) {
    console.error('同步月度统计失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// ============================================================
// 月度快照管理
// ============================================================

// GET /api/v1/sync/snapshot/:companyId/:yearMonth — 获取月度快照
router.get('/snapshot/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const snapshot = await monthSnapshotService.getSnapshot(companyId, yearMonth);
    res.json({ code: 0, data: snapshot } as ApiResponse);
  } catch (error: any) {
    console.error('获取月度快照失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// POST /api/v1/sync/finalize/:companyId/:yearMonth — 定稿月度数据
router.post('/finalize/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const { employeeUserIds, summaryStats } = req.body;

    await dataSyncService.finalizeMonthData(
      companyId,
      yearMonth,
      employeeUserIds || [],
      summaryStats || { totalEmployees: 0, fullAttendanceCount: 0, abnormalUserCount: 0 }
    );

    res.json({ code: 0, message: '月度数据定稿成功' } as ApiResponse);
  } catch (error: any) {
    console.error('定稿月度数据失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// GET /api/v1/sync/snapshot/:companyId/:yearMonth/check — 检查是否可从数据库读取
router.get('/snapshot/:companyId/:yearMonth/check', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const isFinalized = await monthSnapshotService.isFinalized(companyId, yearMonth);
    const snapshot = isFinalized ? await monthSnapshotService.getSnapshot(companyId, yearMonth) : null;

    res.json({
      code: 0,
      data: {
        isFinalized,
        canReadFromDb: isFinalized,
        snapshot,
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('检查月度快照失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// GET /api/v1/sync/finalized-months/:companyId — 获取所有已定稿月份
router.get('/finalized-months/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    const months = await monthSnapshotService.getFinalizedMonths(companyId);
    res.json({ code: 0, data: months } as ApiResponse);
  } catch (error: any) {
    console.error('获取已定稿月份失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

// ============================================================
// 从数据库读取完整月度数据（替代钉钉API调用）
// ============================================================

// GET /api/v1/sync/month-data/:companyId/:yearMonth — 获取完整月度数据
router.get('/month-data/:companyId/:yearMonth', async (req: Request, res: Response) => {
  try {
    const { companyId, yearMonth } = req.params;
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({ code: 40002, message: '无效的公司ID' } as ApiResponse);
    }

    // 1. 获取员工列表
    const employees = await employeeService.getMonthlyEmployees(companyId, yearMonth);
    const frontendEmployees = employees.map(e => EmployeeService.toFrontendFormat(e));

    // 2. 获取考勤日历数据（att_daily + att_punch_record + att_approval_record）
    const calendarData = await attendanceService.getMonthlyCalendar(companyId, yearMonth);

    // 3. 获取月度统计
    const monthlyStats = await attendanceService.getMonthlyStats(companyId, yearMonth);

    // 4. 获取公司级汇总
    const companyAggregates = await monthSnapshotService.getCompanyAggregates(companyId, yearMonth);

    // 5. 获取快照信息
    const snapshot = await monthSnapshotService.getSnapshot(companyId, yearMonth);

    // 构建 companyCounts
    const companyCounts: Record<string, number> = {};
    frontendEmployees.forEach((e: any) => {
      const company = e.mainCompany || 'Unknown';
      companyCounts[company] = (companyCounts[company] || 0) + 1;
    });

    res.json({
      code: 0,
      data: {
        employees: frontendEmployees,
        companyCounts,
        attendanceMap: calendarData.attendanceMap,
        processDataMap: calendarData.processDataMap,
        monthlyStats: monthlyStats,
        companyAggregates: companyAggregates.reduce((acc: any, agg: any) => {
          acc[agg.company_name] = {
            totalLateMinutes: agg.total_late_minutes,
            abnormalUserCount: agg.abnormal_user_count,
            totalRecords: agg.total_records,
            abnormalRecords: agg.abnormal_records,
          };
          return acc;
        }, {}),
        snapshot,
        syncTime: calendarData.syncTime,
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取月度数据失败:', error);
    res.status(500).json({ code: 50002, message: error.message } as ApiResponse);
  }
});

export default router;
