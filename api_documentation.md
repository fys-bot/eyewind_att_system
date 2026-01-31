## 认证 (Authentication)

所有 API 请求都需要通过 `Authorization` 请求头中的 `Bearer Token` 进行认证。

### 获取 API 密钥

您可以在应用的“账号设置” > “API 密钥”页面生成和管理您的 API 密钥。请妥善保管您的密钥，不要在任何客户端代码中暴露。

## 本地化 (Localization)

管理您的本地化项目和资源文件。

### 创建项目

创建一个新的本地化项目。

**端点**: `POST /v1/projects`

**请求体 (Body)**:

| 参数 | 类型 | 描述 |
|---|---|---|
| `name` | string | **必需**. 项目的名称。 |
| `baseLanguage` | string | **必需**. 项目的基准语言代码 (例如 "en-US")。 |
| `targetLanguages`| string[] | **可选**. 项目需要翻译的目标语言代码数组。 |

**cURL 示例**:
`curl -X POST 'https://api.lingosync.ai/v1/projects' \
-H 'Authorization: Bearer YOUR_API_KEY' \
-H 'Content-Type: application/json' \
-d '{
  "name": "Project Chrono-Shift",
  "baseLanguage": "zh-CN",
  "targetLanguages": ["en-US", "ja-JP"]
}'`

**响应 (Response)**:
`{
  "id": "proj_12345abcde",
  "name": "Project Chrono-Shift",
  "baseLanguage": "zh-CN",
  "targetLanguages": ["en-US", "ja-JP"],
  "createdAt": "2024-07-21T10:00:00Z"
}`

### 上传语言文件

为一个项目上传或更新一个语言文件。

**端点**: `POST /v1/projects/{projectId}/files`

**请求体 (Body)**:

| 参数 | 类型 | 描述 |
|---|---|---|
| `languageCode` | string | **必需**. 文件的语言代码 (例如 "en-US")。 |
| `format` | string | **必需**. 文件格式, 当前仅支持 'json'。 |
| `content` | object | **必需**. 包含键值对的 JSON 对象。 |

**cURL 示例**:
`curl -X POST 'https://api.lingosync.ai/v1/projects/proj_12345abcde/files' \
-H 'Authorization: Bearer YOUR_API_KEY' \
-H 'Content-Type: application/json' \
-d '{
  "languageCode": "zh-CN",
  "format": "json",
  "content": {
    "welcome_message": "欢迎！",
    "start_game": "开始游戏"
  }
}'`

**响应 (Response)**:
`{
  "fileId": "file_abcdef12345",
  "projectId": "proj_12345abcde",
  "languageCode": "zh-CN",
  "version": 1,
  "updatedAt": "2024-07-21T10:05:00Z"
}`

## 数据分析 (Data Analysis)

获取和创建数据分析报告。

### 创建 A/B 测试报告

创建一个新的应用内 A/B 测试报告。

**端点**: `POST /v1/reports/ab-test`

**请求体 (Body)**:

| 参数 | 类型 | 描述 |
|---|---|---|
| `title` | string | **必需**. 项目名称。 |
| `testName` | string | **必需**. 测试的名称 (例如 "v1.5 新手引导优化")。 |
| `startDate`| string | **必需**. 数据周期的开始日期 (YYYY-MM-DD)。 |
| `endDate`| string | **必需**. 数据周期的结束日期 (YYYY-MM-DD)。 |
| `data`| object | **必需**. 包含 `controlGroup` 和 `experimentalGroup` 的数据对象。 |


**cURL 示例**:
`curl -X POST 'https://api.lingosync.ai/v1/reports/ab-test' \
-H 'Authorization: Bearer YOUR_API_KEY' \
-H 'Content-Type: application/json' \
-d '{
  "title": "Project Chrono-Shift",
  "testName": "v1.5 新手引导优化",
  "startDate": "2024-07-01",
  "endDate": "2024-07-14",
  "data": {
    "controlGroup": { "userCount": 10000, "kpis": { "retention": { "d1": 45.0 }}},
    "experimentalGroup": { "userCount": 10200, "kpis": { "retention": { "d1": 48.5 }}}
  }
}'`

**响应 (Response)**:
`{
  "id": "prod_ab_67890fghij",
  "testName": "v1.5 新手引导优化",
  "status": "processing",
  "createdAt": "2024-07-21T11:00:00Z"
}`

## 创意工具 (Creative Tools)

利用 AI 生成创意内容。

### 生成对话脚本

根据设定的角色和场景生成对话。

**端点**: `POST /v1/creative/dialogue`

**请求体 (Body)**:

| 参数 | 类型 | 描述 |
|---|---|---|
| `characterA` | object | **必需**. 角色A的设定，包含 `name` 和 `description`。 |
| `characterB` | object | **必需**. 角色B的设定。 |
| `scenario` | string | **必需**. 对话发生的场景描述。 |
| `history` | array | **可选**. 之前的对话历史，用于延续对话。 |


**cURL 示例**:
`curl -X POST 'https://api.lingosync.ai/v1/creative/dialogue' \
-H 'Authorization: Bearer YOUR_API_KEY' \
-H 'Content-Type: application/json' \
-d '{
  "characterA": { "name": "骑士", "description": "勇敢但鲁莽" },
  "characterB": { "name": "法师", "description": "神秘且睿智" },
  "scenario": "在危机四伏的古墓入口初次相遇",
  "history": [
    { "character": "骑士", "dialogue": "站住！你是什么人？" }
  ]
}'`

**响应 (Response)**:
`{
  "newDialogue": [
    { "character": "法师", "dialogue": "一个过客，恰好被同样的好奇心引至此地。" }
  ]
}`

## 系统管理 (System Management)

管理用户、角色和应用。

### 查询用户列表

获取系统中的用户列表，支持筛选。

**端点**: `GET /v1/users`

**查询参数 (Query)**:

| 参数 | 类型 | 描述 |
|---|---|---|
| `role` | string | **可选**. 根据角色名称筛选用户。 |
| `status`| string | **可选**. 根据状态筛选 ('active' or 'inactive')。 |
| `limit` | number | **可选**. 返回的用户数量上限，默认为 20。 |

**cURL 示例**:
`curl -X GET 'https://api.lingosync.ai/v1/users?role=翻译专员&status=active' \
-H 'Authorization: Bearer YOUR_API_KEY'`

**响应 (Response)**:
`{
  "data": [
    {
      "id": "user_2",
      "name": "translator_a",
      "email": "translator.a@lingosync.ai",
      "role": "翻译专员",
      "status": "active"
    }
  ],
  "hasMore": false
}`
