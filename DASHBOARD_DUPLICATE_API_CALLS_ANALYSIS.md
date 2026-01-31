# 考勤仪表盘重复API调用问题分析

## 问题现象
进入考勤仪表盘时出现大量重复的API调用，从截图可以看到同一个API被调用了多次。

## 根本原因分析

### 1. 多个useEffect同时触发
在 `AttendanceDashboardPage.tsx` 中发现了多个useEffect，它们之间存在依赖关系和重复触发：

```typescript
// useEffect 1: 规则配置加载完成后加载数据
useEffect(() => { 
  if (ruleConfigLoaded) {
    loadAllData(); // 🔥 第一次调用
  }
}, [loadAllData, ruleConfigLoaded]);

// useEffect 2: 加载所有公司员工列表
useEffect(() => {
  const loadAllCompanyUsers = async () => {
    // 🔥 这里又调用了 fetchCompanyData，重复获取数据
    const data = await fetchCompanyData('eyewind', ...);
    const data2 = await fetchCompanyData('hydodo', ...);
  };
  loadAllCompanyUsers();
}, [globalMonth]); // 🔥 依赖globalMonth，每次月份变化都会触发

// useEffect 3: 初始化考勤地图
useEffect(() => {
  const initMap = async () => {
    // 依赖allUsers，当allUsers更新时触发
  };
  if (allUsers.length > 0) { initMap(); }
}, [allUsers, globalMonth, currentCompany]); // 🔥 多个依赖项
```

### 2. 循环依赖问题
- `loadAllData` 依赖 `[globalMonth, currentCompany]`
- `loadAllData` 被 `useEffect` 依赖，该 `useEffect` 又依赖 `[loadAllData, ruleConfigLoaded]`
- 当 `globalMonth` 或 `currentCompany` 变化时，`loadAllData` 重新创建，触发 `useEffect`
- 同时，另一个 `useEffect` 也依赖 `globalMonth`，也会触发

### 3. 重复的数据获取
- `loadAllData` 函数调用 `fetchCompanyData`
- `loadAllCompanyUsers` 函数也调用 `fetchCompanyData`
- 两个函数可能同时执行，导致相同的API被调用多次

## 具体的重复调用路径

1. **页面初始化**:
   - `initRuleConfig` useEffect 触发 → 设置 `ruleConfigLoaded = true`
   - `ruleConfigLoaded` useEffect 触发 → 调用 `loadAllData()`
   - `globalMonth` useEffect 触发 → 调用 `loadAllCompanyUsers()`

2. **月份变化时**:
   - `globalMonth` 变化 → `loadAllData` 重新创建
   - `loadAllData` 变化 → 触发 `ruleConfigLoaded` useEffect → 调用 `loadAllData()`
   - `globalMonth` 变化 → 触发 `loadAllCompanyUsers` useEffect → 调用 `fetchCompanyData`

3. **公司切换时**:
   - `currentCompany` 变化 → `loadAllData` 重新创建 → 触发多个 useEffect

## 修复方案

### 1. 合并数据加载逻辑
将所有数据加载合并到一个统一的函数中，避免重复调用。

### 2. 优化useEffect依赖
- 减少不必要的依赖项
- 使用 `useCallback` 稳定函数引用
- 避免在useEffect中创建新的函数

### 3. 添加加载状态控制
- 使用加载状态防止重复调用
- 添加防抖机制

### 4. 缓存优化
- 改进缓存策略，避免重复的网络请求
- 使用更精确的缓存键

## 影响
- 网络资源浪费
- 页面加载缓慢
- 服务器压力增大
- 用户体验差