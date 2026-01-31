import { Router, Request, Response } from 'express';
import { ruleService } from '../services/ruleService';
import type { CompanyId, ApiResponse } from '../types/index';

const router = Router();

// 验证公司ID
const validateCompanyId = (companyId: string): companyId is CompanyId => {
  return companyId === 'eyewind' || companyId === 'hydodo';
};

// GET /api/v1/attendance/rules/:companyId - 获取公司完整配置
router.get('/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40003,
        message: '无效的公司ID，必须是 eyewind 或 hydodo',
      } as ApiResponse);
    }

    const config = await ruleService.getFullConfig(companyId);
    
    if (!config) {
      return res.status(404).json({
        code: 40001,
        message: '配置不存在',
      } as ApiResponse);
    }

    res.json({
      code: 0,
      data: config,
    } as ApiResponse);
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({
      code: 50000,
      message: '服务器内部错误',
    } as ApiResponse);
  }
});

// PUT /api/v1/attendance/rules/:companyId - 更新完整配置
router.put('/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const updatedBy = req.headers['x-user-id'] as string || 'anonymous';
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40003,
        message: '无效的公司ID',
      } as ApiResponse);
    }

    const result = await ruleService.updateFullConfig(companyId, req.body, updatedBy);

    res.json({
      code: 0,
      data: {
        id: result.id,
        version: result.version,
        updatedAt: new Date().toISOString(),
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('更新配置失败:', error);
    
    if (error.message === '配置不存在') {
      return res.status(404).json({
        code: 40001,
        message: error.message,
      } as ApiResponse);
    }

    res.status(500).json({
      code: 50000,
      message: '服务器内部错误',
    } as ApiResponse);
  }
});

// PATCH /api/v1/attendance/rules/:companyId - 部分更新配置
router.patch('/:companyId', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const updatedBy = req.headers['x-user-id'] as string || 'anonymous';
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40003,
        message: '无效的公司ID',
      } as ApiResponse);
    }

    const result = await ruleService.updateFullConfig(companyId, req.body, updatedBy);

    res.json({
      code: 0,
      data: {
        id: result.id,
        version: result.version,
        updatedAt: new Date().toISOString(),
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('部分更新配置失败:', error);
    res.status(500).json({
      code: 50000,
      message: '服务器内部错误',
    } as ApiResponse);
  }
});

// GET /api/v1/attendance/rules/:companyId/history - 获取变更历史
router.get('/:companyId/history', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const size = parseInt(req.query.size as string) || 20;
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40003,
        message: '无效的公司ID',
      } as ApiResponse);
    }

    const result = await ruleService.getChangeHistory(companyId, page, size);

    res.json({
      code: 0,
      data: result,
    } as ApiResponse);
  } catch (error) {
    console.error('获取变更历史失败:', error);
    res.status(500).json({
      code: 50000,
      message: '服务器内部错误',
    } as ApiResponse);
  }
});

// POST /api/v1/attendance/rules/:companyId/rollback - 回滚到指定版本
router.post('/:companyId/rollback', async (req: Request, res: Response) => {
  try {
    const { companyId } = req.params;
    const { historyId, reason } = req.body;
    const rolledBy = req.headers['x-user-id'] as string || 'anonymous';
    
    if (!validateCompanyId(companyId)) {
      return res.status(400).json({
        code: 40003,
        message: '无效的公司ID',
      } as ApiResponse);
    }

    if (!historyId) {
      return res.status(400).json({
        code: 40003,
        message: '缺少 historyId 参数',
      } as ApiResponse);
    }

    const result = await ruleService.rollback(companyId, historyId, reason || '', rolledBy);

    res.json({
      code: 0,
      data: {
        version: result.version,
        rolledBackAt: new Date().toISOString(),
      },
    } as ApiResponse);
  } catch (error: any) {
    console.error('回滚失败:', error);
    
    if (error.message === '配置不存在' || error.message === '历史记录不存在或无快照') {
      return res.status(404).json({
        code: 40004,
        message: error.message,
      } as ApiResponse);
    }

    res.status(500).json({
      code: 50000,
      message: '服务器内部错误',
    } as ApiResponse);
  }
});

export default router;
