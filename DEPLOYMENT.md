# 部署指南

## 快速打包

### 方式一：使用打包脚本（推荐）

```bash
chmod +x build.sh
./build.sh
```

这会自动完成所有构建步骤并生成部署包。

### 方式二：手动打包

```bash
# 1. 构建前端
npm install
npm run build

# 2. 构建后端
cd server
npm install
npm run build
cd ..
```

## 部署到生产环境

### 1. 准备服务器环境

**系统要求：**
- Node.js >= 18.0.0
- PostgreSQL >= 14.0
- 至少 2GB RAM
- 至少 10GB 磁盘空间

**安装依赖：**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm postgresql

# CentOS/RHEL
sudo yum install nodejs npm postgresql-server
```

### 2. 上传部署包

```bash
# 从本地上传到服务器
scp attendance-system-*.tar.gz user@server:/opt/

# 在服务器上解压
cd /opt
tar -xzf attendance-system-*.tar.gz
cd attendance-system
```

### 3. 配置环境变量

**前端配置 (.env.local):**
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

**后端配置 (server/.env):**
```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_db
DB_USER=attendance_user
DB_PASSWORD=your_secure_password

# 服务器配置
PORT=3001
NODE_ENV=production

# 钉钉配置（可选）
DINGTALK_APPKEY=your_appkey
DINGTALK_APPSECRET=your_appsecret
```

### 4. 初始化数据库

```bash
# 创建数据库
sudo -u postgres psql
CREATE DATABASE attendance_db;
CREATE USER attendance_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE attendance_db TO attendance_user;
\q

# 运行数据库迁移
cd server
npm run migrate

# （可选）运行种子数据
npm run seed
```

### 5. 安装生产依赖

```bash
# 安装前端依赖（如果需要）
npm install --production

# 安装后端依赖
cd server
npm install --production
cd ..
```

### 6. 启动服务

#### 方式一：使用 PM2（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动后端服务
cd server
pm2 start dist/index.js --name attendance-api

# 启动前端服务（使用 serve）
npm install -g serve
pm2 start "serve -s ../dist -l 5173" --name attendance-web

# 查看状态
pm2 status

# 设置开机自启
pm2 startup
pm2 save
```

#### 方式二：使用 systemd

创建服务文件 `/etc/systemd/system/attendance-api.service`:
```ini
[Unit]
Description=Attendance Management System API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/attendance-system/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl daemon-reload
sudo systemctl enable attendance-api
sudo systemctl start attendance-api
sudo systemctl status attendance-api
```

### 7. 配置 Nginx 反向代理

创建 Nginx 配置 `/etc/nginx/sites-available/attendance`:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /opt/attendance-system/dist;
        try_files $uri $uri/ /index.html;
        
        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 日志
    access_log /var/log/nginx/attendance-access.log;
    error_log /var/log/nginx/attendance-error.log;
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 8. 配置 HTTPS（可选但推荐）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取 SSL 证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

## 更新部署

```bash
# 1. 备份数据库
pg_dump attendance_db > backup_$(date +%Y%m%d).sql

# 2. 停止服务
pm2 stop attendance-api attendance-web

# 3. 上传新的部署包并解压
# ...

# 4. 运行数据库迁移（如果有）
cd server
npm run migrate

# 5. 重启服务
pm2 restart attendance-api attendance-web
```

## 监控和维护

### 查看日志

```bash
# PM2 日志
pm2 logs attendance-api
pm2 logs attendance-web

# Nginx 日志
tail -f /var/log/nginx/attendance-access.log
tail -f /var/log/nginx/attendance-error.log
```

### 性能监控

```bash
# PM2 监控
pm2 monit

# 系统资源
htop
```

### 数据库备份

创建备份脚本 `/opt/scripts/backup-db.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
pg_dump attendance_db > $BACKUP_DIR/attendance_db_$DATE.sql
# 保留最近 7 天的备份
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
```

设置定时任务：
```bash
crontab -e
# 每天凌晨 2 点备份
0 2 * * * /opt/scripts/backup-db.sh
```

## 故障排查

### 后端服务无法启动

1. 检查数据库连接
2. 检查端口占用：`lsof -i :3001`
3. 查看日志：`pm2 logs attendance-api`

### 前端无法访问

1. 检查 Nginx 配置：`sudo nginx -t`
2. 检查文件权限：`ls -la /opt/attendance-system/dist`
3. 查看 Nginx 日志

### 数据库连接失败

1. 检查 PostgreSQL 状态：`sudo systemctl status postgresql`
2. 检查数据库配置：`server/.env`
3. 测试连接：`psql -h localhost -U attendance_user -d attendance_db`

## 安全建议

1. 使用强密码
2. 启用 HTTPS
3. 配置防火墙
4. 定期更新系统和依赖
5. 定期备份数据库
6. 限制数据库访问权限
7. 使用环境变量存储敏感信息

## 性能优化

1. 启用 Nginx gzip 压缩
2. 配置静态资源缓存
3. 使用 CDN 加速静态资源
4. 优化数据库索引
5. 配置 PostgreSQL 连接池
6. 使用 Redis 缓存（可选）

## 联系支持

如有问题，请联系技术支持团队。
