import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rulesRouter from './routes/rules';
import attendanceRouter from './routes/attendance';
import logsRouter from './routes/logs';
import pushRouter from './routes/push';
import dingtalkRouter from './routes/dingtalk';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 增加请求体大小限制到10MB
app.use(express.urlencoded({ limit: '10mb', extended: true })); // 同时增加URL编码的限制

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/api/v1/attendance/rules', rulesRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/logs', logsRouter);
app.use('/api/v1/push', pushRouter);
app.use('/etl/dingding', dingtalkRouter);

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    code: 40400,
    message: '接口不存在',
  });
});

// 错误处理
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: 50000,
    message: '服务器内部错误',
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 考勤规则配置服务器已启动                                ║
║                                                            ║
║   端口: ${PORT}                                              ║
║   环境: ${process.env.NODE_ENV || 'development'}                              ║
║                                                            ║
║   考勤规则 API:                                             ║
║   GET    /api/v1/attendance/rules/:companyId               ║
║   PUT    /api/v1/attendance/rules/:companyId               ║
║   PATCH  /api/v1/attendance/rules/:companyId               ║
║   GET    /api/v1/attendance/rules/:companyId/history       ║
║   POST   /api/v1/attendance/rules/:companyId/rollback      ║
║                                                            ║
║   考勤日历 API:                                             ║
║   GET    /api/v1/attendance/calendar/:companyId/:yearMonth ║
║   GET    /api/v1/attendance/calendar/:companyId/:ym/:uid   ║
║   PUT    /api/v1/attendance/daily/:companyId               ║
║   PATCH  /api/v1/attendance/daily/:dailyId                 ║
║   POST   /api/v1/attendance/sync/:companyId/:yearMonth     ║
║   GET    /api/v1/attendance/stats/:companyId/:yearMonth    ║
║   POST   /api/v1/attendance/stats/recalc/:companyId/:ym    ║
║   GET    /api/v1/attendance/edit-logs/:companyId           ║
║   GET    /api/v1/attendance/approval/:procInstId           ║
║                                                            ║
║   考勤状态 API (新增):                                       ║
║   POST   /api/v1/attendance/status/upsert                 ║
║   GET    /api/v1/attendance/status/load/:pathSegment?     ║
║                                                            ║
║   钉钉集成 API (新增):                                       ║
║   POST   /etl/dingding/employees                          ║
║   POST   /etl/dingding/punch                              ║
║                                                            ║
║   日志管理 API:                                             ║
║   GET    /api/v1/logs/attendance/:companyId                ║
║   GET    /api/v1/logs/audit                                ║
║   GET    /api/v1/logs/unified/:companyId                   ║
║   DELETE /api/v1/logs/attendance/:logId                    ║
║                                                            ║
║   推送服务 API (新增):                                       ║
║   POST   /api/v1/push/dingtalk                            ║
║   GET    /api/v1/push/test                                 ║
║                                                            ║
║   健康检查: GET /health                                     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

export default app;
