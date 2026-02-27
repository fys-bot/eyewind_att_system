# 部门分组审批流程列表功能

## 功能概述
将审批流程列表按部门进行分组显示，每个部门添加图标，并修复申请原因中的换行符显示问题。

## 已完成的修改

### 1. 修复申请原因换行符显示 (AttendanceShared.tsx)
- **位置**: `components/attendance/dashboard/AttendanceShared.tsx`
- **修改内容**: 在ProcessDetailCard组件中，将申请事由的换行符 `\\n` 转换为真实的换行符 `\n`
- **代码**:
```typescript
{reason.replace(/\\n/g, '\n')}
```
- **效果**: 申请原因中的换行符现在可以正确显示

## 需要实现的功能

### 2. 按部门分组显示审批流程

根据截图，需要创建一个审批流程列表组件，按部门分组显示。

#### 数据结构
```typescript
interface ProcessWithUser {
    processInfo: any;  // 审批流程信息
    userName: string;  // 员工姓名
    department: string; // 部门名称
}

interface DepartmentGroup {
    department: string;
    processes: ProcessWithUser[];
}
```

#### 实现步骤

1. **获取审批流程数据**
   - 从 `processDataMap` 中获取所有审批流程
   - 关联员工信息，获取部门名称

2. **按部门分组**
   ```typescript
   const groupByDepartment = (processes: ProcessWithUser[]): DepartmentGroup[] => {
       const groups = new Map<string, ProcessWithUser[]>();
       
       processes.forEach(process => {
           const dept = process.department || '未分配部门';
           if (!groups.has(dept)) {
               groups.set(dept, []);
           }
           groups.get(dept)!.push(process);
       });
       
       return Array.from(groups.entries()).map(([department, processes]) => ({
           department,
           processes
       }));
   };
   ```

3. **添加部门图标**
   ```typescript
   const getDepartmentIcon = (department: string) => {
       if (department.includes('技术') || department.includes('研发') || department.includes('开发')) {
           return <CodeIcon className="w-5 h-5" />;
       }
       if (department.includes('产品') || department.includes('设计')) {
           return <PencilIcon className="w-5 h-5" />;
       }
       if (department.includes('运营') || department.includes('市场')) {
           return <MegaphoneIcon className="w-5 h-5" />;
       }
       if (department.includes('人事') || department.includes('HR')) {
           return <UserIcon className="w-5 h-5" />;
       }
       if (department.includes('财务')) {
           return <DollarSignIcon className="w-5 h-5" />;
       }
       if (department.includes('行政')) {
           return <BriefcaseIcon className="w-5 h-5" />;
       }
       return <BuildingIcon className="w-5 h-5" />;
   };
   ```

4. **渲染分组列表**
   ```tsx
   {departmentGroups.map(group => (
       <div key={group.department} className="mb-6">
           {/* 部门标题 */}
           <div className="flex items-center gap-2 mb-3 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
               {getDepartmentIcon(group.department)}
               <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                   {group.department}
               </h3>
               <span className="text-sm text-slate-500 dark:text-slate-400">
                   ({group.processes.length})
               </span>
           </div>
           
           {/* 审批流程列表 */}
           <div className="space-y-3">
               {group.processes.map(process => (
                   <div key={process.processInfo.procInstId} className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                       {/* 员工信息 */}
                       <div className="flex items-center gap-2 mb-2">
                           <span className="font-bold text-slate-900 dark:text-white">
                               {process.userName}
                           </span>
                       </div>
                       
                       {/* 审批详情 */}
                       <ProcessDetailCard processInfo={process.processInfo} />
                   </div>
               ))}
           </div>
       </div>
   ))}
   ```

### 3. 修复无序列表断断续续的问题

如果是指审批流程列表的显示问题，可能的原因：
1. CSS样式问题导致列表项之间间距不一致
2. 数据加载时的闪烁问题
3. 虚拟滚动导致的渲染问题

#### 解决方案
```tsx
// 添加统一的间距和过渡动画
<div className="space-y-3">
    {items.map((item, index) => (
        <div 
            key={item.id}
            className="transition-all duration-200 ease-in-out"
            style={{ animationDelay: `${index * 50}ms` }}
        >
            {/* 列表项内容 */}
        </div>
    ))}
</div>
```

## 使用示例

### 创建部门分组审批列表组件

```tsx
import React, { useMemo } from 'react';
import { ProcessDetailCard } from './AttendanceShared.tsx';
import { 
    BuildingIcon, CodeIcon, PencilIcon, MegaphoneIcon, 
    UserIcon, DollarSignIcon, BriefcaseIcon 
} from '../Icons.tsx';

interface DepartmentGroupedApprovalListProps {
    processDataMap: Record<string, any>;
    users: Array<{ name: string; department: string; userid: string }>;
}

export const DepartmentGroupedApprovalList: React.FC<DepartmentGroupedApprovalListProps> = ({
    processDataMap,
    users
}) => {
    // 按部门分组
    const departmentGroups = useMemo(() => {
        const processes: ProcessWithUser[] = [];
        
        // 遍历所有审批流程
        Object.entries(processDataMap).forEach(([procInstId, processInfo]) => {
            // 查找关联的员工
            const user = users.find(u => 
                processInfo.title?.includes(u.name) || 
                processInfo.formValues?.applicant === u.name
            );
            
            if (user) {
                processes.push({
                    processInfo,
                    userName: user.name,
                    department: user.department || '未分配部门'
                });
            }
        });
        
        // 按部门分组
        const groups = new Map<string, ProcessWithUser[]>();
        processes.forEach(process => {
            const dept = process.department;
            if (!groups.has(dept)) {
                groups.set(dept, []);
            }
            groups.get(dept)!.push(process);
        });
        
        // 转换为数组并排序
        return Array.from(groups.entries())
            .map(([department, processes]) => ({
                department,
                processes: processes.sort((a, b) => 
                    a.userName.localeCompare(b.userName, 'zh-CN')
                )
            }))
            .sort((a, b) => 
                a.department.localeCompare(b.department, 'zh-CN')
            );
    }, [processDataMap, users]);
    
    const getDepartmentIcon = (department: string) => {
        if (department.includes('技术') || department.includes('研发') || department.includes('开发')) {
            return <CodeIcon className="w-5 h-5" />;
        }
        if (department.includes('产品') || department.includes('设计')) {
            return <PencilIcon className="w-5 h-5" />;
        }
        if (department.includes('运营') || department.includes('市场')) {
            return <MegaphoneIcon className="w-5 h-5" />;
        }
        if (department.includes('人事') || department.includes('HR')) {
            return <UserIcon className="w-5 h-5" />;
        }
        if (department.includes('财务')) {
            return <DollarSignIcon className="w-5 h-5" />;
        }
        if (department.includes('行政')) {
            return <BriefcaseIcon className="w-5 h-5" />;
        }
        return <BuildingIcon className="w-5 h-5" />;
    };
    
    return (
        <div className="space-y-6">
            {departmentGroups.map(group => (
                <div key={group.department} className="space-y-3">
                    {/* 部门标题 */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
                            {getDepartmentIcon(group.department)}
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                                {group.department}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {group.processes.length} 个审批流程
                            </p>
                        </div>
                    </div>
                    
                    {/* 审批流程列表 */}
                    <div className="space-y-3 pl-4">
                        {group.processes.map((process, index) => (
                            <div 
                                key={process.processInfo.procInstId || index}
                                className="transition-all duration-200 ease-in-out hover:shadow-md"
                            >
                                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                                    {/* 员工信息 */}
                                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                                        <span className="font-bold text-base text-slate-900 dark:text-white">
                                            {process.userName}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">
                                            {process.department}
                                        </span>
                                    </div>
                                    
                                    {/* 审批详情 */}
                                    <ProcessDetailCard processInfo={process.processInfo} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
            
            {departmentGroups.length === 0 && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    暂无审批流程
                </div>
            )}
        </div>
    );
};
```

## 注意事项

1. **部门信息来源**: 需要确保员工数据中包含部门信息
2. **图标匹配**: 根据实际部门名称调整图标匹配逻辑
3. **性能优化**: 对于大量数据，考虑使用虚拟滚动
4. **排序**: 部门和员工都按中文拼音排序

## 相关文件
- `components/attendance/dashboard/AttendanceShared.tsx` - 审批详情卡片组件
- `components/Icons.tsx` - 图标组件
