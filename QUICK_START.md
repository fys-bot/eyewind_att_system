# 快速部署指南

## 一、打包

在开发机器上运行：

```bash
chmod +x build.sh
./build.sh
```

这会生成一个压缩包，例如：`attendance-system-20260228_153045.tar.gz`

## 二、上传到服务器

```bash
scp attendance-system-*.tar.gz user@your-server:/opt/
```

## 三、服务器部署

### 1. 解压文件

```bash
cd /opt
tar -xzf attendance-system-*.tar.gz
cd attendance-system-*
```

### 2. 安装依赖

```bash
# 安装前端依赖
npm install --production

# 安装后端依赖
cd server
npm install --production
cd ..
```

### 3. 配置数据库

```bash
# 创建数据库
sudo -u postgres psql
CREATE DATABASE attendance_db;
CREATE USER attendance_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE attendance_db TO attendance_user;
\q
```

### 4. 配置环境变量

```bash
# 复制环境变量模板
cp server/.env.example server/.env

# 编辑配置文件
nano server/.env
```

修改以下配置：
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=attendance_db
DB_USER=attendance_user
DB_PASSWORD=your_password  # 改成你的密码
PORT=3001
NODE_ENV=production
```

### 5. 运行数据库迁移

```bash
cd server
npm run migrate
cd ..
```

### 6. 启动服务

```bash
chmod +x start.sh stop.sh
./start.sh
```

服务启动后：
- 前端：http://your-server:5173
- 后端：http://your-server:3001

### 7. 停止服务

```bash
./stop.sh
```

## 四、使用 PM2（推荐生产环境）

### 安装 PM2

```bash
npm install -g pm2
```

### 启动服务

```bash
# 启动后端
cd server
pm2 start dist/index.js --name attendance-api

# 启动前端
cd ..
npm install -g serve
pm2 start "serve -s dist -l 5173" --name attendance-web

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 设置开机自启
pm2 startup
pm2 save
```

### 停止服务

```bash
pm2 stop attendance-api attendance-web
```

### 重启服务

```bash
pm2 restart attendance-api attendance-web
```

## 五、配置 Nginx（可选）

### 安装 Nginx

```bash
sudo apt install nginx  # Ubuntu/Debian
sudo yum install nginx  # CentOS/RHEL
```

### 配置反向代理

创建配置文件 `/etc/nginx/sites-available/attendance`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        root /opt/attendance-system-*/dist;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/attendance /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 六、默认账号

首次登录使用：
- 用户名：`admin`
- 密码：`admin`

**重要：登录后请立即修改密码！**

## 七、常见问题

### 端口被占用

```bash
# 查看端口占用
lsof -i :3001
lsof -i :5173

# 停止占用端口的进程
kill -9 <PID>
```

### 数据库连接失败

1. 检查 PostgreSQL 是否运行：`sudo systemctl status postgresql`
2. 检查配置文件：`cat server/.env`
3. 测试连接：`psql -h localhost -U attendance_user -d attendance_db`

### 前端无法访问

1. 检查服务是否运行：`pm2 status` 或 `ps aux | grep serve`
2. 检查防火墙：`sudo ufw status`
3. 开放端口：`sudo ufw allow 5173`

## 八、更新部署

```bash
# 1. 停止服务
./stop.sh  # 或 pm2 stop all

# 2. 备份数据库
pg_dump attendance_db > backup_$(date +%Y%m%d).sql

# 3. 上传新的部署包并解压

# 4. 运行数据库迁移
cd server
npm run migrate
cd ..

# 5. 重启服务
./start.sh  # 或 pm2 restart all
```

## 九、监控和日志

### PM2 监控

```bash
pm2 monit
```

### 查看日志

```bash
# PM2 日志
pm2 logs attendance-api
pm2 logs attendance-web

# 系统日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 十、获取帮助

详细文档请查看：
- [README.md](./README.md) - 项目说明
- [DEPLOYMENT.md](./DEPLOYMENT.md) - 完整部署指南

如有问题，请联系技术支持。
