import { Router, Request, Response } from 'express';
import { attendanceService } from '../services/attendanceService';
import type { CompanyId, ApiResponse } from '../types/index';
import type { EditLogQuery } from '../types/attendance';

const router = Router();

// 验证公司ID
const validateCompanyId = (companyId: string): companyId is CompanyId => {
  return companyId === 'eyewind' || companyId === 'hydodo';
};

// GET /api/v1/logs/attendance/:companyId - 获取考勤编辑日志
router.get('/attendance/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID',
      } as ApiResponse);
    }
    
    const query: EditLogQuery = {
      page: parseInt(req.query.page as string) || 1,
      size: parseInt(req.query.size as string) || 20,
      userId: req.query.userId as string || undefined,
      startDate: req.query.startDate as string || undefined,
      endDate: req.query.endDate as string || undefined,
      editType: req.query.editType as any || undefined,
    };
    
    const data = await attendanceService.getEditLogs(companyId, query);
    
    res.json({
      code: 0,
      data,
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取考勤编辑日志失败:', error);
    res.status(500).json({
      code: 50002,
      message: error.message || '数据库操作失败',
    } as ApiResponse);
  }
});

// GET /api/v1/logs/audit - 获取系统审计日志
router.get('/audit', async (req: Request, res: Response) => {
  try {
    // 这里可以从数据库获取审计日志，目前返回空数组
    // 实际项目中应该有专门的审计日志表
    const page = parseInt(req.query.page as string) || 1;
    const size = parseInt(req.query.size as string) || 20;
    const userId = req.query.userId as string || undefined;
    const action = req.query.action as string || undefined;
    const startDate = req.query.startDate as string || undefined;
    const endDate = req.query.endDate as string || undefined;
    
    // TODO: 实现从数据库获取审计日志的逻辑
    // 目前返回模拟数据
    const data = {
      total: 0,
      list: [],
      page,
      size,
    };
    
    res.json({
      code: 0,
      data,
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取审计日志失败:', error);
    res.status(500).json({
      code: 50002,
      message: error.message || '数据库操作失败',
    } as ApiResponse);
  }
});

// GET /api/v1/logs/unified/:companyId - 获取统一日志（考勤+审计）
router.get('/unified/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40002,
        message: '无效的公司ID',
      } as ApiResponse);
    }
    
    const query: EditLogQuery & {
      logType?: 'attendance' | 'audit' | 'all';
      searchTerm?: string;
      action?: string;
    } = {
      page: parseInt(req.query.page as string) || 1,
      size: parseInt(req.query.size as string) || 20,
      userId: req.query.userId as string || undefined,
      startDate: req.query.startDate as string || undefined,
      endDate: req.query.endDate as string || undefined,
      editType: req.query.editType as any || undefined,
      logType: req.query.logType as any || 'all',
      searchTerm: req.query.searchTerm as string || undefined,
      action: req.query.action as string || undefined,
    };
    
    const unifiedLogs: any[] = [];
    
    // 获取考勤编辑日志
    if (query.logType === 'attendance' || query.logType === 'all') {
      try {
        const attendanceLogs = await attendanceService.getEditLogs(companyId, {
          page: 1,
          size: 1000, // 获取更多数据用于统一排序
          userId: query.userId,
          startDate: query.startDate,
          endDate: query.endDate,
          editType: query.editType,
        });
        
        // 转换为统一格式
        const convertedLogs = attendanceLogs.list.map((log: any) => ({
          id: `att_${log.id}`,
          type: 'attendance',
          timestamp: new Date(log.edit_time).getTime(),
          userId: log.user_id,
          userName: log.user_name || undefined,
          action: log.edit_type,
          target: `考勤数据 - ${log.user_name || log.user_id}`,
          details: log.edit_reason || `修改了 ${new Date(log.attendance_date).toLocaleDateString('zh-CN')} 的考勤数据`,
          attendanceDate: log.attendance_date,
          editType: log.edit_type,
          oldStatus: log.old_status || undefined,
          newStatus: log.new_status || undefined,
          editReason: log.edit_reason || undefined,
          clientIp: log.client_ip || undefined,
          userAgent: log.user_agent || undefined,
          oldValue: log.old_value,
          newValue: log.new_value,
          linkedProcInstId: log.linked_proc_inst_id || undefined,
        }));
        
        unifiedLogs.push(...convertedLogs);
      } catch (err) {
        console.warn('获取考勤日志失败:', err);
      }
    }
    
    // TODO: 获取审计日志（从数据库）
    if (query.logType === 'audit' || query.logType === 'all') {
      // 这里应该从数据库获取审计日志
      // 目前跳过
    }
    
    // 统一排序
    unifiedLogs.sort((a, b) => b.timestamp - a.timestamp);
    
    // 应用搜索筛选
    let filteredLogs = unifiedLogs;
    if (query.searchTerm) {
      const searchTerm = query.searchTerm.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.userName?.toLowerCase().includes(searchTerm) ||
        log.userId.toLowerCase().includes(searchTerm) ||
        log.target?.toLowerCase().includes(searchTerm) ||
        log.details?.toLowerCase().includes(searchTerm) ||
        log.action.toLowerCase().includes(searchTerm)
      );
    }
    
    // 应用操作类型筛选
    if (query.action && query.action !== 'ALL') {
      filteredLogs = filteredLogs.filter(log => log.action === query.action);
    }
    
    // 应用日期范围筛选
    if (query.startDate) {
      const startTime = new Date(query.startDate).getTime();
      filteredLogs = filteredLogs.filter(log => log.timestamp >= startTime);
    }
    if (query.endDate) {
      const endTime = new Date(query.endDate).getTime() + 24 * 60 * 60 * 1000 - 1;
      filteredLogs = filteredLogs.filter(log => log.timestamp <= endTime);
    }
    
    const total = filteredLogs.length;
    
    // 分页
    const startIndex = ((query.page || 1) - 1) * (query.size || 20);
    const endIndex = startIndex + (query.size || 20);
    const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
    
    const data = {
      total,
      list: paginatedLogs,
      page: query.page || 1,
      size: query.size || 20,
    };
    
    res.json({
      code: 0,
      data,
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取统一日志失败:', error);
    res.status(500).json({
      code: 50002,
      message: error.message || '数据库操作失败',
    } as ApiResponse);
  }
});

// DELETE /api/v1/logs/attendance/:logId - 删除考勤编辑日志（管理员功能）
router.delete('/attendance/:logId', async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;
    const editorId = req.headers['x-user-id'] as string || 'anonymous';
    const editorName = req.headers['x-user-name'] as string || undefined;
    
    // TODO: 实现删除考勤编辑日志的逻辑
    // 注意：删除日志是敏感操作，需要严格的权限控制
    
    res.json({
      code: 0,
      message: '日志删除成功',
    } as ApiResponse);
  } catch (error: any) {
    console.error('删除考勤编辑日志失败:', error);
    res.status(500).json({
      code: 50002,
      message: error.message || '数据库操作失败',
    } as ApiResponse);
  }
});

export default router;