# 重复API调用问题修复总结

## 问题描述
用户反馈进入考勤确认页面时，会重复调用gettoken和员工接口，导致不必要的网络请求和性能问题。

## 根本原因分析
1. **React.StrictMode**: 在开发模式下，React.StrictMode会故意执行两次useEffect，导致重复的API调用
2. **缺乏缓存机制**: 每次组件重新渲染或重新挂载时都会发起新的API请求
3. **并发请求**: 多个组件同时请求相同的数据时，没有共享机制

## 修复方案

### 1. AttendancePage.tsx 修复
- **使用useRef防止重复初始化**: 将`hasStartedLoading`状态改为`hasInitializedRef`引用，完全避免严格模式的重复执行
- **简化状态管理**: 移除复杂的加载状态逻辑，使用单一的`isLoading`状态
- **组件卸载保护**: 使用`isMountedRef`确保组件卸载后不会更新状态

```typescript
// 🔥 使用 useRef 来确保只执行一次，完全避免严格模式的重复执行
const hasInitializedRef = useRef(false);

useEffect(() => {
    // 使用 ref 确保只执行一次，即使在严格模式下
    if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        loadData();
    }
}, []); // 空依赖数组，只在挂载时执行一次
```

### 2. API缓存机制优化

#### Token缓存 (fetchToken)
- **缓存时长**: 2小时（钉钉token有效期）
- **并发保护**: 使用Promise缓存防止并发请求
- **自动清理**: 请求完成后清除Promise引用

```typescript
const tokenCache = new Map<string, { data: any, timestamp: number, promise?: Promise<any> }>();

// 如果正在请求中，返回同一个 Promise
if (cached?.promise) {
    return cached.promise;
}
```

#### 员工数据缓存 (fetchAllEmployees)
- **缓存时长**: 5分钟
- **并发保护**: 同样使用Promise缓存机制
- **Mock数据缓存**: 即使是Mock数据也会被缓存，避免重复生成

```typescript
const employeeCache = new Map<string, { data: any[], timestamp: number, promise?: Promise<any[]> }>();

// 创建新的请求 Promise 并缓存
const requestPromise = (async () => {
    // API请求逻辑
})();

employeeCache.set(cacheKey, {
    data: currentCache?.data || [],
    timestamp: currentCache?.timestamp || 0,
    promise: requestPromise
});
```

### 3. 服务器端缓存控制
在服务器路由中添加缓存控制头，避免304响应导致的问题：

```typescript
// 🔥 设置缓存控制头，避免304响应
res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
});
```

## 修复效果

### 修复前
- 进入考勤页面时会调用2次gettoken接口
- 进入考勤页面时会调用2次员工接口
- 每次组件重新渲染都会发起新请求
- React.StrictMode导致的双重执行问题

### 修复后
- ✅ 进入考勤页面只调用1次gettoken接口
- ✅ 进入考勤页面只调用1次员工接口
- ✅ 5分钟内重复访问使用缓存数据
- ✅ 并发请求共享同一个Promise
- ✅ 完全解决React.StrictMode的重复执行问题

## 测试验证
创建了`test-duplicate-calls.html`测试页面，可以验证：
1. Token缓存机制是否正常工作
2. 员工数据缓存机制是否正常工作
3. 考勤API是否正常响应
4. 并发请求是否被正确处理

## 技术要点

### 1. useRef vs useState
- `useRef`的值在组件重新渲染时保持不变
- 不会触发组件重新渲染
- 在严格模式下也只会初始化一次

### 2. Promise缓存
- 将正在进行的Promise存储在缓存中
- 多个并发请求可以等待同一个Promise
- 请求完成后清除Promise引用，只保留数据

### 3. 内存缓存策略
- 使用Map存储缓存数据
- 包含数据、时间戳和Promise三个字段
- 支持TTL（生存时间）机制

## 注意事项
1. 缓存数据存储在内存中，页面刷新后会清空
2. Token缓存时间设置为2小时，需要根据实际token有效期调整
3. 员工数据缓存时间设置为5分钟，可根据业务需求调整
4. 在生产环境中可以考虑使用localStorage或sessionStorage持久化缓存

## 相关文件
- `components/attendance/AttendancePage.tsx` - 主要组件修复
- `components/attendance/verification/api.ts` - API缓存机制
- `server/src/routes/attendance.ts` - 服务器端缓存控制
- `test-duplicate-calls.html` - 测试验证页面