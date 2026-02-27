# 模型提示词编辑功能

## 功能概述
在模型管理页面中添加了提示词编辑功能，允许管理员为每个AI功能模块配置和编辑自定义提示词。

## 实现内容

### 1. 数据模型更新
- 在 `ModelConfig` 接口中添加了 `prompt?: string` 字段
- 提示词作为可选字段存储在模型配置中

### 2. UI 功能
- 每个AI模块卡片中添加了提示词编辑区域
- 提示词使用 `textarea` 组件，支持多行文本输入
- 最小高度 100px，支持垂直调整大小

### 3. 交互流程
1. 点击提示词输入框进入编辑模式
2. 编辑完成后点击"保存"按钮保存提示词
3. 点击"取消"按钮放弃修改
4. 保存时显示加载状态和成功提示

### 4. 状态管理
- 使用 `editingPrompts` Map 管理正在编辑的提示词
- 只有在编辑模式下才显示保存/取消按钮
- 保存成功后自动退出编辑模式

### 5. API 集成
- 提示词通过 `/admin/chatgpt/model/upsert` API 保存
- 与模型配置一起存储在后端
- 保存时保留现有的模型和设置配置

## 使用方式

### 编辑提示词
1. 进入"管理中心" → "模型管理"
2. 找到需要配置的AI功能模块
3. 点击"提示词"输入框
4. 输入或修改提示词内容
5. 点击"保存"按钮

### 取消编辑
- 点击"取消"按钮放弃修改
- 或直接点击其他模块的输入框

## 技术细节

### 状态管理
```typescript
const [editingPrompts, setEditingPrompts] = useState<Map<string, string>>(new Map());
```

### 编辑模式判断
```typescript
const editingPrompt = editingPrompts.get(module.id);
const isEditingPrompt = editingPrompt !== undefined;
const displayPrompt = isEditingPrompt ? editingPrompt : currentPrompt;
```

### 保存逻辑
- 保存时包含完整的模型配置
- 保留现有的模型选择和设置
- 只更新提示词字段

## 注意事项

1. 提示词为可选字段，可以为空
2. 保存提示词时会保留现有的模型配置
3. 编辑模式下禁用其他操作
4. 保存成功后显示3秒提示消息

## 相关文件
- `components/admin/ModelManagement.tsx` - 主要实现文件
- `services/aiChatService.ts` - AI服务调用（未来可能需要支持提示词）

## 后续优化建议

1. 在 AI 服务调用时支持使用自定义提示词
2. 添加提示词模板功能
3. 支持提示词版本管理
4. 添加提示词预览功能
5. 支持从文件导入/导出提示词
