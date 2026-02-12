import express from 'express';
import db from '../db';

const router = express.Router();

// 获取操作日志
router.get('/', async (req, res) => {
  try {
    const { 
      userId, 
      action, 
      module, 
      startDate, 
      endDate, 
      page = 1, 
      pageSize = 50 
    } = req.query;

    let query = db('att_sys_operation_logs')
      .select(
        'id',
        'user_id',
        'user_name',
        'user_role',
        'action',
        'module',
        'target',
        'details',
        'ip_address',
        'created_at as createdAt'
      )
      .orderBy('created_at', 'desc');

    // 过滤条件
    if (userId) {
      query = query.where('user_id', userId as string);
    }
    if (action) {
      query = query.where('action', action as string);
    }
    if (module) {
      query = query.where('module', module as string);
    }
    if (startDate) {
      query = query.where('created_at', '>=', startDate as string);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate as string);
    }

    // 分页
    const offset = (Number(page) - 1) * Number(pageSize);
    const logs = await query.limit(Number(pageSize)).offset(offset);

    // 获取总数
    const countQuery = db('att_sys_operation_logs').count('* as count');
    if (userId) countQuery.where('user_id', userId as string);
    if (action) countQuery.where('action', action as string);
    if (module) countQuery.where('module', module as string);
    if (startDate) countQuery.where('created_at', '>=', startDate as string);
    if (endDate) countQuery.where('created_at', '<=', endDate as string);
    
    const [{ count }] = await countQuery;

    res.json({
      code: 0,
      message: 'success',
      data: {
        logs,
        total: Number(count),
        page: Number(page),
        pageSize: Number(pageSize)
      }
    });
  } catch (error) {
    console.error('获取操作日志失败:', error);
    res.status(500).json({
      code: 50000,
      message: '获取操作日志失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 创建操作日志
router.post('/', async (req, res) => {
  try {
    const { 
      userId, 
      userName, 
      userRole, 
      action, 
      module, 
      target, 
      details,
      ipAddress,
      userAgent
    } = req.body;

    if (!userId || !action || !module) {
      return res.status(400).json({
        code: 40000,
        message: '用户ID、操作类型和模块为必填项'
      });
    }

    const [result] = await db('att_sys_operation_logs').insert({
      user_id: userId,
      user_name: userName || null,
      user_role: userRole || null,
      action,
      module,
      target: target || null,
      details: details || null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      created_at: db.fn.now()
    }).returning('id');

    res.json({
      code: 0,
      message: '记录操作日志成功',
      data: { id: result?.id || result }
    });
  } catch (error) {
    console.error('记录操作日志失败:', error);
    res.status(500).json({
      code: 50000,
      message: '记录操作日志失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 删除操作日志（批量删除，按日期）
router.delete('/', async (req, res) => {
  try {
    const { beforeDate } = req.query;

    if (!beforeDate) {
      return res.status(400).json({
        code: 40000,
        message: '请指定删除日期'
      });
    }

    const deletedCount = await db('att_sys_operation_logs')
      .where('created_at', '<', beforeDate as string)
      .delete();

    res.json({
      code: 0,
      message: '删除操作日志成功',
      data: { deletedCount }
    });
  } catch (error) {
    console.error('删除操作日志失败:', error);
    res.status(500).json({
      code: 50000,
      message: '删除操作日志失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 获取操作统计
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = db('att_sys_operation_logs');
    
    if (startDate) {
      query = query.where('created_at', '>=', startDate as string);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate as string);
    }

    // 按操作类型统计
    const actionStats = await query.clone()
      .select('action')
      .count('* as count')
      .groupBy('action');

    // 按模块统计
    const moduleStats = await query.clone()
      .select('module')
      .count('* as count')
      .groupBy('module');

    // 按用户统计
    const userStats = await query.clone()
      .select('user_id', 'user_name')
      .count('* as count')
      .groupBy('user_id', 'user_name')
      .orderBy('count', 'desc')
      .limit(10);

    res.json({
      code: 0,
      message: 'success',
      data: {
        actionStats,
        moduleStats,
        userStats
      }
    });
  } catch (error) {
    console.error('获取操作统计失败:', error);
    res.status(500).json({
      code: 50000,
      message: '获取操作统计失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
