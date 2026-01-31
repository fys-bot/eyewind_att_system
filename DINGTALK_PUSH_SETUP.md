# 钉钉推送功能设置指南

## 🚀 快速开始

### 1. 安装服务器依赖

```bash
cd server
npm install axios
```

### 2. 启动服务器

```bash
cd server
npm run dev
```

服务器启动后会显示：
```
🚀 考勤规则配置服务器已启动

端口: 5000
环境: development

推送服务 API (新增):
POST   /api/v1/push/dingtalk
GET    /api/v1/push/test
```

### 3. 测试推送服务

在浏览器中访问：`http://localhost:5000/api/v1/push/test`

应该看到：
```json
{
  "code": 0,
  "message": "推送服务正常",
  "data": {
    "timestamp": "2025-01-31T10:30:00.000Z",
    "service": "push-service"
  }
}
```

## 🤖 钉钉机器人配置

### 1. 创建钉钉机器人

1. 在钉钉群中，点击右上角设置
2. 选择"群机器人" → "添加机器人"
3. 选择"自定义机器人"
4. 设置机器人名称和头像
5. 安全设置选择"自定义关键词"，输入：`考勤`、`报告`、`统计`
6. 复制生成的Webhook地址

### 2. Webhook地址格式

正确的webhook地址格式：
```
https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 📱 使用推送功能

### 1. 打开推送弹窗

在考勤仪表盘中，点击"推送"按钮

### 2. 配置推送参数

- **Webhook地址**：粘贴钉钉机器人的webhook地址
- **@提醒人员**：选择要@的人员（支持多选）
- **推送内容**：编辑要发送的消息内容

### 3. 发送推送

点击"发送推送"按钮，系统会：
1. 验证webhook地址格式
2. 通过本地服务器发送到钉钉
3. 显示推送结果

## 🎯 艾特功能说明

### 支持的艾特方式

1. **手机号艾特**：通过用户手机号进行@提醒
2. **用户ID艾特**：通过钉钉用户ID进行@提醒
3. **预设联系人**：支持财务等常用联系人

### 艾特用户选择

- 从下拉列表中选择要@的人员
- 支持搜索功能，输入姓名快速查找
- 选中的用户会显示在已选列表中
- 可以随时删除不需要的用户

### 消息格式

推送的消息会自动在开头添加@用户：
```
Hi，@张三 @李四 

附件已提交为2025年1月风眼&海多多考勤、社保公积金相关资料，请予以核算。
...
```

## 🔧 故障排除

### 常见问题

1. **CORS错误**
   - ✅ 已解决：通过本地服务器代理

2. **推送服务连接失败**
   - 检查服务器是否启动：`npm run dev`
   - 确认端口5000未被占用

3. **无效的webhook地址**
   - 确保地址包含`access_token`参数
   - 检查机器人是否被删除

4. **@功能不生效**
   - 确保被@的人在钉钉群中
   - 检查手机号格式是否正确

5. **钉钉返回错误**
   - 检查机器人安全设置
   - 确认消息包含设置的关键词

### 调试信息

在浏览器控制台中查看详细日志：
```
[PushApiService] 发送钉钉消息: {webhookLength: 108, contentLength: 245, atUsersCount: 2}
[PushApiService] 推送成功
```

在服务器控制台中查看：
```
[DingTalk Push] 发送消息: {webhook: "https://oapi.dingtalk.com/robot/send?access_...", contentLength: 245, atUsers: 2, atMobiles: 2, atUserIds: 0}
[DingTalk Push] 发送成功
```

## 📋 API参考

### POST /api/v1/push/dingtalk

发送钉钉机器人消息

**请求体：**
```json
{
  "webhook": "https://oapi.dingtalk.com/robot/send?access_token=...",
  "content": "消息内容",
  "atUsers": [
    {
      "name": "张三",
      "mobile": "13800138000",
      "userid": "user123"
    }
  ]
}
```

**响应：**
```json
{
  "code": 0,
  "message": "推送成功",
  "data": {
    "success": true,
    "dingResponse": {
      "errcode": 0,
      "errmsg": "ok"
    }
  }
}
```

### GET /api/v1/push/test

测试推送服务连通性

**响应：**
```json
{
  "code": 0,
  "message": "推送服务正常",
  "data": {
    "timestamp": "2025-01-31T10:30:00.000Z",
    "service": "push-service"
  }
}
```

## 🎉 完成

现在你可以正常使用钉钉推送功能了！推送的考勤报告会发送到指定的钉钉群，并@选中的人员。