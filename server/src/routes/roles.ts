import express from 'express';
import db from '../db';

const router = express.Router();

// 获取所有角色
router.get('/', async (req, res) => {
  try {
    const roles = await db('att_sys_roles')
      .select(
        'id',
        'role_id',
        'name',
        'description',
        'permissions',
        'is_system',
        'created_at as createdAt',
        'updated_at as updatedAt'
      )
      .orderBy('created_at', 'asc');

    // 解析 permissions JSON
    const rolesWithParsedPermissions = roles.map((role: any) => ({
      ...role,
      id: role.role_id, // 前端使用 role_id 作为 id
      permissions: typeof role.permissions === 'string' 
        ? JSON.parse(role.permissions) 
        : role.permissions
    }));

    res.json({
      code: 0,
      message: 'success',
      data: rolesWithParsedPermissions
    });
  } catch (error) {
    console.error('获取角色列表失败:', error);
    res.status(500).json({
      code: 50000,
      message: '获取角色列表失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 创建角色
router.post('/', async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    if (!name) {
      return res.status(400).json({
        code: 40000,
        message: '角色名称为必填项'
      });
    }

    // 生成角色ID
    const roleId = `role_${Date.now()}`;

    const [id] = await db('att_sys_roles').insert({
      role_id: roleId,
      name,
      description: description || '',
      permissions: JSON.stringify(permissions || []),
      is_system: false,
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    });

    // 获取创建的角色信息
    const newRole = await db('att_sys_roles')
      .where('id', id)
      .select(
        'id',
        'role_id',
        'name',
        'description',
        'permissions',
        'is_system',
        'created_at as createdAt'
      )
      .first();

    res.json({
      code: 0,
      message: '创建角色成功',
      data: {
        ...newRole,
        id: newRole.role_id,
        permissions: typeof newRole.permissions === 'string' 
          ? JSON.parse(newRole.permissions) 
          : newRole.permissions
      }
    });
  } catch (error) {
    console.error('创建角色失败:', error);
    res.status(500).json({
      code: 50000,
      message: '创建角色失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 更新角色
router.put('/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;
    const { name, description, permissions } = req.body;

    // 检查是否是系统角色
    const role = await db('att_sys_roles').where({ role_id: roleId }).first();
    if (role && role.is_system) {
      // 系统角色只允许更新权限，不允许修改名称和描述
      if (name && name !== role.name) {
        return res.status(400).json({
          code: 40001,
          message: '系统内置角色不允许修改名称'
        });
      }
    }

    const updateData: any = {
      updated_at: db.fn.now()
    };

    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (permissions) updateData.permissions = JSON.stringify(permissions);

    await db('att_sys_roles')
      .where({ role_id: roleId })
      .update(updateData);

    // 获取更新后的角色信息
    const updatedRole = await db('att_sys_roles')
      .where({ role_id: roleId })
      .select(
        'id',
        'role_id',
        'name',
        'description',
        'permissions',
        'is_system',
        'created_at as createdAt'
      )
      .first();

    res.json({
      code: 0,
      message: '更新角色成功',
      data: {
        ...updatedRole,
        id: updatedRole.role_id,
        permissions: typeof updatedRole.permissions === 'string' 
          ? JSON.parse(updatedRole.permissions) 
          : updatedRole.permissions
      }
    });
  } catch (error) {
    console.error('更新角色失败:', error);
    res.status(500).json({
      code: 50000,
      message: '更新角色失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 删除角色
router.delete('/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;

    // 检查是否是系统角色
    const role = await db('att_sys_roles').where({ role_id: roleId }).first();
    if (role && role.is_system) {
      return res.status(400).json({
        code: 40002,
        message: '系统内置角色不能删除'
      });
    }

    // 检查是否有用户使用此角色
    const usersWithRole = await db('att_sys_users').where({ role_id: roleId }).count('* as count').first();
    const userCount = usersWithRole ? Number(usersWithRole.count) : 0;
    if (userCount > 0) {
      return res.status(400).json({
        code: 40003,
        message: `该角色下还有 ${userCount} 个用户，无法删除`
      });
    }

    await db('att_sys_roles').where({ role_id: roleId }).delete();

    res.json({
      code: 0,
      message: '删除角色成功'
    });
  } catch (error) {
    console.error('删除角色失败:', error);
    res.status(500).json({
      code: 50000,
      message: '删除角色失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 获取所有可用权限
router.get('/permissions', async (req, res) => {
  try {
    // 🔥 按照菜单栏顺序组织权限
    const ALL_PERMISSIONS = {
      '员工列表': {
        'employee_list:view': '查看员工列表',
        'employee_list:detail': '查看员工详情',
        'employee_list:sync': '同步钉钉花名册',
        'employee_list:filter': '筛选员工',
        'employee_list:edit': '编辑员工信息',
        'employee_list:delete': '删除员工',
        'employee_list:export': '导出员工列表',
      },
      '考勤仪表盘': {
        'attendance_dashboard:view': '查看仪表盘概览',
        'attendance_dashboard:statistics': '查看统计数据',
        'attendance_dashboard:ranking': '查看排名统计',
        'attendance_dashboard:charts': '查看图表分析',
        'attendance_dashboard:calendar_view': '查看考勤日历',
        'attendance_dashboard:calendar_edit': '编辑日历 (补卡/修改状态)',
        'attendance_dashboard:ai_analysis': '查看AI智能分析',
        'attendance_dashboard:export': '下载统计报表',
        'attendance_dashboard:preview': '预览报表',
        'attendance_dashboard:custom_download': '自定义下载',
        'attendance_dashboard:push_report': '推送报告',
        'attendance_dashboard:create_verification': '创建考勤确认',
      },
      '考勤确认': {
        'attendance_verification:view': '查看确认单列表',
        'attendance_verification:create': '创建/上传考勤表',
        'attendance_verification:edit': '编辑考勤明细',
        'attendance_verification:send': '发送钉钉通知/待办',
        'attendance_verification:recall': '撤回钉钉通知/待办',
        'attendance_verification:archive': '生成/下载存档',
        'attendance_verification:delete': '删除确认单',
        'attendance_verification:export': '导出考勤数据',
      },
      '考勤规则': {
        'attendance_rules:view': '查看考勤规则',
        'attendance_rules:edit': '编辑考勤规则',
        'attendance_rules:create': '创建考勤规则',
        'attendance_rules:delete': '删除考勤规则',
        'attendance_rules:test': '测试规则',
      },
      '账号管理': {
        'admin:users': '用户账号管理',
        'admin:roles': '角色权限管理',
      },
      '参数管理': {
        'params:view': '查看系统参数',
        'params:edit': '编辑系统参数',
      },
      '模型管理': {
        'model:view': '查看模型列表',
        'model:edit': '编辑模型配置',
        'model:test': '测试模型',
        'model:delete': '删除模型',
      },
      '日志管理': {
        'logs:view': '查看操作日志',
        'logs:filter': '筛选日志',
        'logs:statistics': '查看日志统计',
        'logs:export': '导出日志',
        'logs:delete': '删除日志',
      }
    };

    res.json({
      code: 0,
      message: 'success',
      data: ALL_PERMISSIONS
    });
  } catch (error) {
    console.error('获取权限列表失败:', error);
    res.status(500).json({
      code: 50000,
      message: '获取权限列表失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
