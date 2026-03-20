import { Router } from 'express';
import { saveReportSnapshot, getSnapshots, getSnapshotById, getEditLogs, getEditLogsByCompanyMonth, getLatestSnapshot } from '../services/reportSnapshotService';

const router = Router();

// 保存报表快照
router.post('/', async (req, res) => {
  try {
    const {
      companyId, companyDisplayName, yearMonth, reportType,
      tabName, headers, rows, redFrameCount, editCount,
      editLogs, savedBy, savedByName, remarks
    } = req.body;

    if (!companyId || !yearMonth || !reportType || !headers || !rows) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = await saveReportSnapshot({
      companyId, companyDisplayName, yearMonth, reportType,
      tabName, headers, rows, redFrameCount: redFrameCount || 0,
      editCount: editCount || 0, editLogs: editLogs || [],
      savedBy, savedByName, remarks
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[report-snapshots] 保存失败:', error);
    res.status(500).json({ error: error.message || '保存失败' });
  }
});

// 查询最新快照（按公司+月份+报表类型）
router.get('/latest', async (req, res) => {
  try {
    const { companyId, yearMonth, reportType } = req.query;
    if (!companyId || !yearMonth || !reportType) {
      return res.status(400).json({ error: '缺少 companyId、yearMonth 或 reportType' });
    }
    const data = await getLatestSnapshot(companyId as string, yearMonth as string, reportType as string);
    res.json({ success: true, data: data || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '查询失败' });
  }
});

// 查询快照列表
router.get('/', async (req, res) => {
  try {
    const { companyId, yearMonth, reportType } = req.query;
    if (!companyId || !yearMonth) {
      return res.status(400).json({ error: '缺少 companyId 或 yearMonth' });
    }
    const data = await getSnapshots(companyId as string, yearMonth as string, reportType as string | undefined);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[report-snapshots] 查询失败:', error);
    res.status(500).json({ error: error.message || '查询失败' });
  }
});

// 查询单个快照详情
router.get('/:id', async (req, res) => {
  try {
    const data = await getSnapshotById(Number(req.params.id));
    if (!data) return res.status(404).json({ error: '快照不存在' });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '查询失败' });
  }
});

// 查询某个快照的编辑日志
router.get('/:id/edit-logs', async (req, res) => {
  try {
    const data = await getEditLogs(Number(req.params.id));
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '查询失败' });
  }
});

// 按公司+月份查询编辑日志
router.get('/edit-logs/by-company', async (req, res) => {
  try {
    const { companyId, yearMonth, reportType } = req.query;
    if (!companyId || !yearMonth) {
      return res.status(400).json({ error: '缺少 companyId 或 yearMonth' });
    }
    const data = await getEditLogsByCompanyMonth(companyId as string, yearMonth as string, reportType as string | undefined);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || '查询失败' });
  }
});

export default router;
