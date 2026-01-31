# GitHub 仓库设置指南

## 1. 初始化本地 Git 仓库

```bash
# 在项目根目录下执行
git init
```

## 2. 添加 .gitignore 文件

创建 `.gitignore` 文件（如果还没有的话）：

```bash
# 依赖
node_modules/
*/node_modules/

# 构建输出
dist/
build/
*/dist/
*/build/

# 环境变量
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# 日志
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# 运行时数据
pids
*.pid
*.seed
*.pid.lock

# 覆盖率目录
coverage/
*.lcov

# nyc 测试覆盖率
.nyc_output

# Grunt 中间存储
.grunt

# Bower 依赖目录
bower_components

# node-waf 配置
.lock-wscript

# 编译的二进制插件
build/Release

# 依赖目录
node_modules/
jspm_packages/

# TypeScript v1 声明文件
typings/

# TypeScript 缓存
*.tsbuildinfo

# 可选的 npm 缓存目录
.npm

# 可选的 eslint 缓存
.eslintcache

# Microbundle 缓存
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# 可选的 REPL 历史
.node_repl_history

# 输出的 npm 包
*.tgz

# Yarn 完整性文件
.yarn-integrity

# dotenv 环境变量文件
.env
.env.test

# parcel-bundler 缓存
.cache
.parcel-cache

# Next.js 构建输出
.next

# Nuxt.js 构建 / 生成输出
.nuxt
dist

# Gatsby 文件
.cache/
public

# Vuepress 构建输出
.vuepress/dist

# Serverless 目录
.serverless/

# FuseBox 缓存
.fusebox/

# DynamoDB Local 文件
.dynamodb/

# TernJS 端口文件
.tern-port

# macOS
.DS_Store

# Windows
Thumbs.db
ehthumbs.db
Desktop.ini

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# 数据库文件
*.db
*.sqlite
*.sqlite3

# 测试文件
test-*.html
```

## 3. 添加所有文件到 Git

```bash
# 添加所有文件
git add .

# 提交初始版本
git commit -m "初始提交：考勤管理系统 v0.0.2"
```

## 4. 在 GitHub 上创建仓库

1. 登录 GitHub (https://github.com)
2. 点击右上角的 "+" 按钮，选择 "New repository"
3. 填写仓库信息：
   - Repository name: `attendance-management-system`
   - Description: `考勤管理系统 - 企业级考勤规则配置与数据分析平台`
   - 选择 Public 或 Private（根据需要）
   - **不要**勾选 "Initialize this repository with a README"
4. 点击 "Create repository"

## 5. 连接本地仓库到 GitHub

```bash
# 添加远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/attendance-management-system.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

## 6. 后续提交流程

```bash
# 查看文件状态
git status

# 添加修改的文件
git add .

# 提交更改
git commit -m "描述你的更改"

# 推送到 GitHub
git push
```

## 7. 常用 Git 命令

```bash
# 查看提交历史
git log --oneline

# 查看当前分支
git branch

# 创建新分支
git checkout -b feature/new-feature

# 切换分支
git checkout main

# 合并分支
git merge feature/new-feature

# 拉取最新代码
git pull

# 查看远程仓库
git remote -v
```

## 8. 项目结构说明

```
考勤管理系统/
├── components/           # React 组件
│   ├── attendance/      # 考勤相关组件
│   ├── settings/        # 设置页面组件
│   └── admin/          # 管理员组件
├── server/             # 后端服务
│   ├── src/           # 源代码
│   └── package.json   # 后端依赖
├── services/          # API 服务
├── hooks/            # React Hooks
├── utils/            # 工具函数
├── database/         # 数据库相关
├── docs/            # 文档
├── package.json     # 前端依赖
└── README.md        # 项目说明
```

## 9. 环境变量配置

确保 `.env.local` 文件不会被提交到 Git：

```bash
# 检查 .env.local 是否在 .gitignore 中
grep -n "\.env" .gitignore
```

## 10. 协作开发建议

1. **分支策略**：
   - `main` 分支：稳定版本
   - `develop` 分支：开发版本
   - `feature/*` 分支：新功能开发

2. **提交信息规范**：
   - `feat: 添加新功能`
   - `fix: 修复bug`
   - `docs: 更新文档`
   - `style: 代码格式调整`
   - `refactor: 代码重构`
   - `test: 添加测试`

3. **代码审查**：
   - 使用 Pull Request 进行代码审查
   - 确保代码质量和一致性

## 故障排除

### 如果推送失败：

```bash
# 如果远程仓库有更新，先拉取
git pull origin main --rebase

# 然后再推送
git push
```

### 如果需要修改最后一次提交：

```bash
# 修改最后一次提交信息
git commit --amend -m "新的提交信息"

# 强制推送（谨慎使用）
git push --force-with-lease
```

### 如果需要撤销更改：

```bash
# 撤销工作区的更改
git checkout -- filename

# 撤销暂存区的更改
git reset HEAD filename

# 撤销最后一次提交（保留更改）
git reset --soft HEAD~1
```

完成以上步骤后，你的考勤管理系统就成功上传到 GitHub 了！