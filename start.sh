#!/bin/bash

# 考勤管理系统启动脚本
# 使用方法: ./start.sh

set -e

echo "========================================="
echo "  考勤管理系统 - 启动服务"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ 未检测到依赖，正在安装...${NC}"
    npm install --production
fi

if [ ! -d "server/node_modules" ]; then
    echo -e "${YELLOW}⚠ 未检测到后端依赖，正在安装...${NC}"
    cd server
    npm install --production
    cd ..
fi

# 检查环境变量文件
if [ ! -f "server/.env" ]; then
    echo -e "${RED}✗ 未找到 server/.env 文件${NC}"
    echo "请创建 server/.env 文件并配置数据库连接信息"
    echo ""
    echo "示例配置："
    echo "DB_HOST=localhost"
    echo "DB_PORT=5432"
    echo "DB_NAME=attendance_db"
    echo "DB_USER=attendance_user"
    echo "DB_PASSWORD=your_password"
    echo "PORT=3001"
    echo "NODE_ENV=production"
    exit 1
fi

# 检查是否需要运行数据库迁移
echo -e "${BLUE}检查数据库迁移...${NC}"
cd server
if ! npm run migrate 2>/dev/null; then
    echo -e "${YELLOW}⚠ 数据库迁移失败，请检查数据库连接${NC}"
fi
cd ..

echo ""
echo -e "${GREEN}✓ 准备就绪${NC}"
echo ""

# 启动服务
echo -e "${BLUE}启动后端服务...${NC}"
cd server
NODE_ENV=production node dist/index.js &
BACKEND_PID=$!
cd ..

echo -e "${GREEN}✓ 后端服务已启动 (PID: $BACKEND_PID)${NC}"
echo ""

# 检查是否安装了 serve
if ! command -v serve &> /dev/null; then
    echo -e "${YELLOW}⚠ 未安装 serve，正在安装...${NC}"
    npm install -g serve
fi

echo -e "${BLUE}启动前端服务...${NC}"
serve -s dist -l 5173 &
FRONTEND_PID=$!

echo -e "${GREEN}✓ 前端服务已启动 (PID: $FRONTEND_PID)${NC}"
echo ""

echo "========================================="
echo -e "${GREEN}  ✓ 服务启动成功！${NC}"
echo "========================================="
echo ""
echo "访问地址："
echo "  - 前端: http://localhost:5173"
echo "  - 后端: http://localhost:3001"
echo ""
echo "进程 ID："
echo "  - 后端: $BACKEND_PID"
echo "  - 前端: $FRONTEND_PID"
echo ""
echo "停止服务："
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "查看日志："
echo "  tail -f server/logs/*.log"
echo ""

# 保存 PID 到文件
echo "$BACKEND_PID" > .backend.pid
echo "$FRONTEND_PID" > .frontend.pid

# 等待用户中断
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; rm -f .backend.pid .frontend.pid; echo ''; echo '服务已停止'; exit 0" INT TERM

echo "按 Ctrl+C 停止服务..."
wait
