import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rulesRouter from './routes/rules';
import attendanceRouter from './routes/attendance';
import logsRouter from './routes/logs';
import pushRouter from './routes/push';
import dingtalkRouter from './routes/dingtalk';
import usersRouter from './routes/users';
import rolesRouter from './routes/roles';
import operationLogsRouter from './routes/operation-logs';
import reportSnapshotsRouter from './routes/report-snapshots';
import dataSyncRouter from './routes/data-sync';
import { auditLogger } from './middleware/auditLogger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 增加请求体大小限制到10MB
app.use(express.urlencoded({ limit: '10mb', extended: true })); // 同时增加URL编码的限制

// 请求日志
app.use((req, _res, next) => {
  // console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 审计日志中间件（在路由之前）
app.use(auditLogger());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.use('/api/v1/attendance/rules', rulesRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/logs', logsRouter);
app.use('/api/v1/push', pushRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/roles', rolesRouter);
app.use('/api/v1/operation-logs', operationLogsRouter);
app.use('/api/v1/report-snapshots', reportSnapshotsRouter);
app.use('/api/v1/sync', dataSyncRouter);
app.use('/etl/dingding', dingtalkRouter);

// 404 处理
app.use((_req, res) => {
  res.status(404).json({
    code: 40400,
    message: '接口不存在',
  });
});

// 错误处理
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: 50000,
    message: '服务器内部错误',
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`考勤管理系统服务器已启动 - 端口: ${PORT} - 环境: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
