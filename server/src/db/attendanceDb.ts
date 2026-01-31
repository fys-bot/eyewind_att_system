import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

// 考勤数据库连接配置
const attendanceDb = knex({
  client: 'pg',
  connection: {
    host: '81.70.91.77',
    port: 5432,
    database: 'eyewind-dw',
    user: 'etl',
    password: 'xnAvy5pkl3tR4zT7Q3As0',
  },
  pool: { 
    min: 2, 
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  acquireConnectionTimeout: 30000,
});

export default attendanceDb;