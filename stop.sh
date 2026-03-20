#!/bin/bash

# 考勤管理系统停止脚本
# 使用方法: ./stop.sh

echo "停止考勤管理系统服务..."

# 从 PID 文件读取进程 ID
if [ -f ".backend.pid" ]; then
    BACKEND_PID=$(cat .backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID
        echo "✓ 后端服务已停止 (PID: $BACKEND_PID)"
    fi
    rm -f .backend.pid
fi

if [ -f ".frontend.pid" ]; then
    FRONTEND_PID=$(cat .frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID
        echo "✓ 前端服务已停止 (PID: $FRONTEND_PID)"
    fi
    rm -f .frontend.pid
fi

# 备用方案：通过端口查找并停止
if lsof -ti:3001 >/dev/null 2>&1; then
    kill $(lsof -ti:3001)
    echo "✓ 端口 3001 上的进程已停止"
fi

if lsof -ti:5173 >/dev/null 2>&1; then
    kill $(lsof -ti:5173)
    echo "✓ 端口 5173 上的进程已停止"
fi

echo "所有服务已停止"
