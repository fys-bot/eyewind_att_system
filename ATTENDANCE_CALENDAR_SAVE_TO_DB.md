# 考勤日历编辑保存入库功能

## 🎯 功能需求

用户在考勤日历页面编辑考勤数据后，点击保存需要将修改的数据入库到数据库中，确保数据的持久化和多设备同步。

## ✅ 实现方案

### 1. 修改保存逻辑

将原来的"本地缓存优先"改为"数据库优先"的保存策略：

```typescript
// ❌ 修改前：仅保存到本地缓存
const cacheKey = `ATTENDANCE_MAP_CACHE_${currentCompany}_${month}`;
await SmartCache.set(cacheKey, attendanceMap);

// ✅ 修改后：优先保存到数据库
const result = await attendanceApiService.batchUpdateDaily(companyId, updates);
await SmartCache.set(cacheKey, attendanceMap); // 数据库保存成功后再更新缓存
```

### 2. 数据收集和格式化

遍历考勤地图，收集所有修改的记录：

```typescript
const updates: any[] = [];
for (const [userId, userDays] of Object.entries(attendanceMap)) {
  for (const [dayStr, status] of Object.entries(userDays)) {
    const day = parseInt(dayStr);
    const date = `${month}-${String(day).padStart(2, '0')}`;
    
    const updateRecord = {
      userId,
      date,
      status: status.status,
      onDutyTime: status.onDutyTime,
      offDutyTime: status.offDutyTime,
      records: status.records || [],
      editReason: '考勤日历编辑修改',
      linkedProcInstId: status.records?.find(r => r.procInstId)?.procInstId
    };
    
    updates.push(updateRecord);
  }
}
```

### 3. API调用入库

调用服务器端的批量更新接口：

```typescript
const { attendanceApiService } = await import('../../../services/attendanceApiService.ts');
const companyId = currentCompany === 'eyewind' || currentCompany === '风眼' ? 'eyewind' : 'hydodo';

const result = await attendanceApiService.batchUpdateDaily(companyId, updates);
console.log(`数据库保存成功: 已更新 ${result.updated} 条记录`);
```

### 4. 错误处理和降级

提供完善的错误处理和降级方案：

```typescript
try {
  // 尝试数据库保存
  const result = await attendanceApiService.batchUpdateDaily(companyId, updates);
  alert(`✅ 保存成功！已更新 ${result.updated} 条记录到数据库`);
} catch (error) {
  // 数据库保存失败，提供降级选项
  const fallbackMessage = `
❌ 数据库保存失败：${error.message}

是否仅保存到本地缓存？
• 点击"确定"：保存到本地缓存（下次刷新可能丢失）
• 点击"取消"：放弃保存，继续编辑
  `;
  
  if (confirm(fallbackMessage)) {
    await SmartCache.set(cacheKey, attendanceMap);
    alert('⚠️ 已保存到本地缓存，建议稍后重试数据库保存');
  }
}
```

## 🔄 保存流程

1. **用户编辑考勤数据** → 在考勤日历中修改员工的考勤状态
2. **点击保存按钮** → 触发 `handleSaveEdit` 函数
3. **确认保存提示** → 显示保存确认对话框，说明将入库到数据库
4. **收集修改数据** → 遍历 `attendanceMap`，构建更新记录数组
5. **调用API入库** → `PUT /api/v1/attendance/daily/:companyId`
6. **数据库保存** → 服务器端批量更新考勤记录到数据库
7. **记录审计日志** → 记录修改操作的详细日志
8. **更新本地缓存** → 数据库保存成功后，同步更新本地缓存
9. **显示成功提示** → 显示实际更新的记录数量

## 🎯 关键改进点

### 1. 数据库优先
- 修改保存逻辑，优先保存到数据库
- 确保数据持久化和多设备同步

### 2. 批量操作
- 支持一次性保存多条考勤记录的修改
- 提高保存效率，减少网络请求

### 3. 错误处理
- 提供降级方案，数据库保存失败时可选择保存到本地缓存
- 用户可以选择继续编辑或接受本地保存

### 4. 审计日志
- 服务器端自动记录修改操作的详细日志
- 包含修改人、修改时间、修改内容等信息

## 📋 相关API接口

### PUT /api/v1/attendance/daily/:companyId
批量更新每日考勤数据

**请求体：**
```json
{
  "updates": [
    {
      "userId": "user123",
      "date": "2025-01-15",
      "status": "normal",
      "onDutyTime": "09:00",
      "offDutyTime": "18:30",
      "records": [...],
      "editReason": "考勤日历编辑修改",
      "linkedProcInstId": "proc456"
    }
  ]
}
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "updated": 15,
    "editLogIds": [101, 102, 103, ...]
  }
}
```

### GET /api/v1/attendance/edit-logs/:companyId
查看编辑日志

**响应：**
```json
{
  "code": 0,
  "data": {
    "total": 50,
    "list": [
      {
        "id": 101,
        "user_id": "user123",
        "user_name": "张三",
        "attendance_date": "2025-01-15",
        "edit_type": "status",
        "old_status": "incomplete",
        "new_status": "normal",
        "edit_reason": "考勤日历编辑修改",
        "editor_id": "admin",
        "editor_name": "管理员",
        "edit_time": "2025-01-31T10:30:00Z"
      }
    ]
  }
}
```

## 🧪 测试验证

### 预期行为：
- ✅ 编辑考勤数据后点击保存，数据会入库到数据库
- ✅ 保存成功后显示实际更新的记录数量
- ✅ 数据库保存失败时提供降级选项
- ✅ 可以在编辑日志中查看修改记录
- ✅ 多设备间数据保持同步

### 测试步骤：
1. **启动服务器**：确保后端服务器正常运行
2. **进入考勤日历**：打开考勤日历页面
3. **开启编辑模式**：点击编辑按钮
4. **修改考勤数据**：修改某些员工的考勤状态
5. **保存修改**：点击保存按钮
6. **验证入库**：检查数据库中的记录是否更新
7. **查看日志**：在编辑日志中查看修改记录

## 🔧 故障排除

### 常见问题：

1. **"数据库保存失败"**
   - 检查服务器是否正常运行
   - 检查网络连接
   - 查看服务器日志

2. **"批量更新失败"**
   - 检查数据格式是否正确
   - 确认公司ID和日期格式有效
   - 查看具体错误信息

3. **"权限不足"**
   - 确认用户有编辑考勤数据的权限
   - 检查请求头中的用户信息

4. **"本地缓存不一致"**
   - 清除本地缓存重新加载
   - 刷新页面获取最新数据

## 📋 修改文件清单

### ✅ components/attendance/dashboard/AttendanceCalendar.tsx
- 修改 `handleSaveEdit` 函数
- 优先保存到数据库，然后更新本地缓存
- 添加完善的错误处理和降级方案
- 显示实际更新的记录数量

### ✅ services/attendanceApiService.ts
- 已有 `batchUpdateDaily` 方法
- 支持批量更新考勤记录
- 返回更新数量和编辑日志ID

### ✅ server/src/routes/attendance.ts
- 已有 `PUT /api/v1/attendance/daily/:companyId` 接口
- 支持批量更新每日考勤
- 自动记录编辑日志

## 🎉 功能完成

考勤日历编辑保存功能现在会正确将修改的数据入库到数据库，确保数据的持久化和一致性。用户的编辑操作会被完整记录，支持审计和追踪。这解决了之前数据只保存到本地缓存的问题，提供了更可靠的数据管理方案。