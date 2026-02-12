# AttendanceRules.tsx UI 更新指南

## 需要修改的部分

### 1. 删除旧的独立配置初始化（第 127-128 行）

**删除**：
```typescript
crossWeekCheckout: rules.crossWeekCheckout || DEFAULT_CONFIGS[selectedCompany].rules!.crossWeekCheckout,
crossMonthCheckout: rules.crossMonthCheckout || DEFAULT_CONFIGS[selectedCompany].rules!.crossMonthCheckout,
```

### 2. 更新数据库配置转换逻辑（第 316-452 行）

**替换整个转换逻辑**：

```typescript
// 转换跨天打卡规则（统一格式）
const crossDayRules = (dbConfig.crossDayRules || []).map((r: any) => ({
    checkoutTime: r.time_start?.replace(':00', '') || '20:30',
    nextCheckinTime: r.time_end?.replace(':00', '') || '09:30',
    description: r.description || '',
    applyTo: r.apply_to || 'day',
    weekDays: r.week_days || undefined
}));

const finalCrossDayRules = crossDayRules.length > 0 
    ? crossDayRules 
    : defaultConfig.rules!.crossDayCheckout.rules;

// ... 其他配置 ...

crossDayCheckout: {
    enabled: dbConfig.cross_day_enabled ?? defaultConfig.rules!.crossDayCheckout.enabled,
    rules: finalCrossDayRules
},
```

### 3. 删除旧的跨周/跨月规则处理函数（第 694-735 行）

**删除以下函数**：
- `addCrossWeekRule()`
- `updateCrossWeekRule()`
- `removeCrossWeekRule()`
- `addCrossMonthRule()`
- `updateCrossMonthRule()`
- `removeCrossMonthRule()`

### 4. 更新跨天规则处理函数（第 677-693 行）

**修改为**：

```typescript
const addCrossDayRule = (applyTo: 'day' | 'week' | 'month' = 'day') => {
    const newRule = {
        checkoutTime: "20:30",
        nextCheckinTime: "09:30",
        description: applyTo === 'week' ? "新跨周规则" : applyTo === 'month' ? "新跨月规则" : "新跨天规则",
        applyTo: applyTo,
        ...(applyTo === 'week' ? { weekDays: ['friday'] as ('friday' | 'saturday' | 'sunday')[] } : {})
    };
    const newRules = [...formData.rules.crossDayCheckout.rules, newRule];
    updateRule('crossDayCheckout', { ...formData.rules.crossDayCheckout, rules: newRules });
};

const updateCrossDayRule = (index: number, field: string, value: any) => {
    const newRules = [...formData.rules.crossDayCheckout.rules];
    newRules[index] = { ...newRules[index], [field]: value };
    updateRule('crossDayCheckout', { ...formData.rules.crossDayCheckout, rules: newRules });
};

const removeCrossDayRule = (index: number) => {
    const newRules = formData.rules.crossDayCheckout.rules.filter((_, i) => i !== index);
    updateRule('crossDayCheckout', { ...formData.rules.crossDayCheckout, rules: newRules });
};
```

### 5. 更新 UI 渲染部分

找到跨天打卡规则的 UI 部分（搜索 "跨天打卡规则"），替换为：

```tsx
{/* 跨天打卡规则（统一配置） */}
<div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
    <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
            <span className="text-2xl">🌙</span>
            <div>
                <h3 className="text-lg font-semibold text-gray-900">跨天打卡规则</h3>
                <p className="text-sm text-gray-500">统一管理跨天、跨周、跨月打卡规则</p>
            </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
            <input
                type="checkbox"
                checked={formData.rules.crossDayCheckout.enabled}
                onChange={(e) => updateRule('crossDayCheckout', { 
                    ...formData.rules.crossDayCheckout, 
                    enabled: e.target.checked 
                })}
                className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
    </div>

    {formData.rules.crossDayCheckout.enabled && (
        <div className="space-y-4">
            {/* 规则列表 */}
            {formData.rules.crossDayCheckout.rules.map((rule, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="grid grid-cols-12 gap-4 items-start">
                        {/* 应用场景 */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                应用场景
                            </label>
                            <select
                                value={rule.applyTo || 'day'}
                                onChange={(e) => updateCrossDayRule(index, 'applyTo', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            >
                                <option value="day">跨天</option>
                                <option value="week">跨周</option>
                                <option value="month">跨月</option>
                                <option value="all">全部</option>
                            </select>
                        </div>

                        {/* 下班时间阈值 */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                下班时间
                            </label>
                            <input
                                type="time"
                                value={rule.checkoutTime}
                                onChange={(e) => updateCrossDayRule(index, 'checkoutTime', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                        </div>

                        {/* 上班基准时间 */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                上班时间
                            </label>
                            <input
                                type="time"
                                value={rule.nextCheckinTime}
                                onChange={(e) => updateCrossDayRule(index, 'nextCheckinTime', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                        </div>

                        {/* 跨周规则的额外配置 */}
                        {rule.applyTo === 'week' && (
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    适用天
                                </label>
                                <div className="space-y-1">
                                    {['friday', 'saturday', 'sunday'].map(day => (
                                        <label key={day} className="flex items-center text-sm">
                                            <input
                                                type="checkbox"
                                                checked={rule.weekDays?.includes(day as any) || false}
                                                onChange={(e) => {
                                                    const current = rule.weekDays || [];
                                                    const updated = e.target.checked
                                                        ? [...current, day]
                                                        : current.filter(d => d !== day);
                                                    updateCrossDayRule(index, 'weekDays', updated);
                                                }}
                                                className="mr-2"
                                            />
                                            {day === 'friday' ? '周五' : day === 'saturday' ? '周六' : '周日'}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 规则描述 */}
                        <div className={rule.applyTo === 'week' ? 'col-span-3' : 'col-span-5'}>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                规则描述
                            </label>
                            <input
                                type="text"
                                value={rule.description}
                                onChange={(e) => updateCrossDayRule(index, 'description', e.target.value)}
                                placeholder="例如：晚上8点半后打卡，第二天可9点半上班"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                        </div>

                        {/* 删除按钮 */}
                        <div className="col-span-1 flex items-end">
                            <button
                                onClick={() => removeCrossDayRule(index)}
                                className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                            >
                                删除
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            {/* 添加规则按钮 */}
            <div className="flex gap-2">
                <button
                    onClick={() => addCrossDayRule('day')}
                    className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
                >
                    + 添加跨天规则
                </button>
                <button
                    onClick={() => addCrossDayRule('week')}
                    className="px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors text-sm font-medium"
                >
                    + 添加跨周规则
                </button>
                <button
                    onClick={() => addCrossDayRule('month')}
                    className="px-4 py-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors text-sm font-medium"
                >
                    + 添加跨月规则
                </button>
            </div>

            {/* 说明文字 */}
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                    <strong>规则说明：</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                    <li><strong>跨天</strong>：前一天加班影响第二天上班时间（周二到周五）</li>
                    <li><strong>跨周</strong>：周五/周末加班影响周一上班时间</li>
                    <li><strong>跨月</strong>：上月最后一天加班影响本月第一天上班时间</li>
                    <li>系统会自动按下班时间从晚到早排序，优先匹配最晚的规则</li>
                </ul>
            </div>
        </div>
    )}
</div>
```

### 6. 删除旧的跨周/跨月 UI 部分

搜索并删除以下部分：
- "跨周打卡规则" 的整个 div 块
- "跨月打卡规则" 的整个 div 块

## 完整修改步骤

1. 备份 `components/settings/AttendanceRules.tsx`
2. 按照上述说明逐一修改
3. 测试 UI 是否正常显示
4. 测试规则添加/编辑/删除功能
5. 测试保存功能

## 注意事项

- 确保所有对 `crossWeekCheckout` 和 `crossMonthCheckout` 的引用都已删除
- 新的 UI 使用 `applyTo` 字段来区分规则类型
- `weekDays` 字段只在 `applyTo === 'week'` 时显示
- 保存时确保数据格式正确
