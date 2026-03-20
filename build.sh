#!/bin/bash

# 考勤管理系统打包脚本
# 使用方法: ./build.sh

set -e  # 遇到错误立即退出

echo "========================================="
echo "  考勤管理系统 - 生产环境打包"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. 清理旧的构建文件
echo -e "${BLUE}[1/5] 清理旧的构建文件...${NC}"
rm -rf dist
rm -rf server/dist
echo -e "${GREEN}✓ 清理完成${NC}"
echo ""

# 2. 安装前端依赖
echo -e "${BLUE}[2/5] 安装前端依赖...${NC}"
npm install
echo -e "${GREEN}✓ 前端依赖安装完成${NC}"
echo ""

# 3. 构建前端
echo -e "${BLUE}[3/5] 构建前端应用...${NC}"
npm run build
echo -e "${GREEN}✓ 前端构建完成 (dist/)${NC}"
echo ""

# 4. 安装后端依赖
echo -e "${BLUE}[4/5] 安装后端依赖...${NC}"
cd server
npm install
echo -e "${GREEN}✓ 后端依赖安装完成${NC}"
echo ""

# 5. 构建后端
echo -e "${BLUE}[5/5] 构建后端应用...${NC}"
npm run build
cd ..
echo -e "${GREEN}✓ 后端构建完成 (server/dist/)${NC}"
echo ""

# 6. 创建部署包
echo -e "${BLUE}[额外] 创建部署包...${NC}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="attendance-system-${TIMESTAMP}.tar.gz"

tar -czf "${PACKAGE_NAME}" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='.env.local' \
  --exclude='server/.env' \
  dist/ \
  server/dist/ \
  server/package.json \
  server/package-lock.json \
  server/knexfile.ts \
  server/src/migrations/ \
  server/src/seeds/ \
  package.json \
  start.sh \
  stop.sh \
  README.md \
  DEPLOYMENT.md

echo -e "${GREEN}✓ 部署包已创建: ${PACKAGE_NAME}${NC}"
echo ""

echo "========================================="
echo -e "${GREEN}  ✓ 打包完成！${NC}"
echo "========================================="
echo ""
echo "构建产物："
echo "  - 前端: dist/"
echo "  - 后端: server/dist/"
echo "  - 部署包: ${PACKAGE_NAME}"
echo ""
echo "部署包内容："
echo "  ✓ 前端静态文件 (dist/)"
echo "  ✓ 后端编译文件 (server/dist/)"
echo "  ✓ 数据库迁移文件 (server/src/migrations/)"
echo "  ✓ 种子数据 (server/src/seeds/)"
echo "  ✓ 启动脚本 (start.sh, stop.sh)"
echo "  ✓ 文档 (README.md, DEPLOYMENT.md)"
echo ""
echo "下一步："
echo "  1. 上传部署包到服务器: scp ${PACKAGE_NAME} user@server:/opt/"
echo "  2. 解压: tar -xzf ${PACKAGE_NAME}"
echo "  3. 配置环境变量: cp server/.env.example server/.env"
echo "  4. 运行数据库迁移: cd server && npm run migrate"
echo "  5. 启动服务: chmod +x start.sh && ./start.sh"
echo ""
