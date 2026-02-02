import knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'attendance_rules',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    acquireConnectionTimeout: 30000,
  },
  pool: { 
    min: 0, 
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

export default db;
