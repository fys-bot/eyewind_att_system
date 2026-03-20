import express from 'express';
import db from '../db';
import { logApiRequest, logDbQuery, logApiResponse, logError, getDataStructure } from '../utils/logger';

const router = express.Router();

// 获取所有用户
router.get('/', async (req, res) => {
  const startTime = Date.now();
  try {
    logApiRequest('/api/users', 'GET');
    
    const users = await db('att_sys_users')
      .leftJoin('att_sys_roles', 'att_sys_users.role_id', 'att_sys_roles.role_id')
      .select(
        'att_sys_users.id',
        'att_sys_users.user_id',
        'att_sys_users.name',
        'att_sys_users.email',
        'att_sys_users.avatar',
        'att_sys_users.role_id as roleId',
        'att_sys_roles.name as roleName',
        'att_sys_users.status',
        'att_sys_users.creator',
        'att_sys_users.last_login as lastLogin',
        'att_sys_users.created_at as createdAt',
        'att_sys_users.updated_at as updatedAt'
      )
      .orderBy('att_sys_users.created_at', 'desc');

    const duration = Date.now() - startTime;
    logDbQuery('getAllUsers', users.length, getDataStructure(users), duration);
    logApiResponse('/api/users', 200, users.length, duration);

    res.json({
      code: 0,
      message: 'success',
      data: users
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('获取用户列表失败', error, { duration });
    res.status(500).json({
      code: 50000,
      message: '获取用户列表失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 创建用户
router.post('/', async (req, res) => {
  try {
    const { name, email, roleId, status, password } = req.body;

    if (!name || !roleId) {
      return res.status(400).json({
        code: 40000,
        message: '用户名和角色为必填项'
      });
    }

    // 检查用户名是否已存在
    const existingUser = await db('att_sys_users').where({ name }).first();
    if (existingUser) {
      return res.status(400).json({
        code: 40001,
        message: '用户名已存在'
      });
    }

    // 生成用户ID
    const userId = `user_${Date.now()}`;
    const passwordHash = password || '123456'; // TODO: 使用 bcrypt 加密

    const [id] = await db('att_sys_users').insert({
      user_id: userId,
      name,
      email: email || null,
      password_hash: passwordHash,
      role_id: roleId,
      status: status || 'active',
      creator: req.body.creator || 'admin',
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    });

    // 获取创建的用户信息（包含角色名称）
    const newUser = await db('att_sys_users')
      .leftJoin('att_sys_roles', 'att_sys_users.role_id', 'att_sys_roles.role_id')
      .where('att_sys_users.id', id)
      .select(
        'att_sys_users.id',
        'att_sys_users.user_id',
        'att_sys_users.name',
        'att_sys_users.email',
        'att_sys_users.avatar',
        'att_sys_users.role_id as roleId',
        'att_sys_roles.name as roleName',
        'att_sys_users.status',
        'att_sys_users.creator',
        'att_sys_users.last_login as lastLogin',
        'att_sys_users.created_at as createdAt'
      )
      .first();

    res.json({
      code: 0,
      message: '创建用户成功',
      data: newUser
    });
  } catch (error) {
    console.error('创建用户失败:', error);
    res.status(500).json({
      code: 50000,
      message: '创建用户失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 更新用户
router.put('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, roleId, status, password } = req.body;

    const updateData: any = {
      updated_at: db.fn.now()
    };

    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (roleId) updateData.role_id = roleId;
    if (status) updateData.status = status;
    if (password) updateData.password_hash = password; // TODO: 使用 bcrypt 加密

    await db('att_sys_users')
      .where({ user_id: userId })
      .update(updateData);

    // 获取更新后的用户信息
    const updatedUser = await db('att_sys_users')
      .leftJoin('att_sys_roles', 'att_sys_users.role_id', 'att_sys_roles.role_id')
      .where('att_sys_users.user_id', userId)
      .select(
        'att_sys_users.id',
        'att_sys_users.user_id',
        'att_sys_users.name',
        'att_sys_users.email',
        'att_sys_users.avatar',
        'att_sys_users.role_id as roleId',
        'att_sys_roles.name as roleName',
        'att_sys_users.status',
        'att_sys_users.creator',
        'att_sys_users.last_login as lastLogin',
        'att_sys_users.created_at as createdAt'
      )
      .first();

    res.json({
      code: 0,
      message: '更新用户成功',
      data: updatedUser
    });
  } catch (error) {
    console.error('更新用户失败:', error);
    res.status(500).json({
      code: 50000,
      message: '更新用户失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 删除用户
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 检查是否是系统管理员
    const user = await db('att_sys_users').where({ user_id: userId }).first();
    if (user && user.user_id === 'user_1') {
      return res.status(400).json({
        code: 40002,
        message: '不能删除系统管理员账号'
      });
    }

    await db('att_sys_users').where({ user_id: userId }).delete();

    res.json({
      code: 0,
      message: '删除用户成功'
    });
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({
      code: 50000,
      message: '删除用户失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  const startTime = Date.now();
  try {
    const { username, password } = req.body;

    logApiRequest('/api/users/login', 'POST', undefined, undefined, { username, hasPassword: !!password });

    if (!username || !password) {
      logError('缺少登录参数', new Error('Missing params'), { hasUsername: !!username, hasPassword: !!password });
      return res.status(400).json({
        code: 40000,
        message: '用户名和密码为必填项'
      });
    }

    // 查询用户
    const user = await db('att_sys_users')
      .leftJoin('att_sys_roles', 'att_sys_users.role_id', 'att_sys_roles.role_id')
      .where('att_sys_users.name', username)
      .select(
        'att_sys_users.id',
        'att_sys_users.user_id',
        'att_sys_users.name',
        'att_sys_users.email',
        'att_sys_users.avatar',
        'att_sys_users.password_hash',
        'att_sys_users.role_id as roleId',
        'att_sys_roles.name as roleName',
        'att_sys_roles.permissions',
        'att_sys_users.status'
      )
      .first();

    if (!user) {
      const duration = Date.now() - startTime;
      logError('用户不存在', new Error('User not found'), { username, duration });
      return res.status(401).json({
        code: 40100,
        message: '用户名或密码错误'
      });
    }

    // 验证密码 (TODO: 使用 bcrypt 验证)
    if (user.password_hash !== password) {
      const duration = Date.now() - startTime;
      logError('密码错误', new Error('Wrong password'), { username, duration });
      return res.status(401).json({
        code: 40100,
        message: '用户名或密码错误'
      });
    }

    // 检查账号状态
    if (user.status !== 'active') {
      const duration = Date.now() - startTime;
      logError('账号已禁用', new Error('Account disabled'), { username, status: user.status, duration });
      return res.status(403).json({
        code: 40300,
        message: '账号已被禁用'
      });
    }

    // 更新最后登录时间
    await db('att_sys_users')
      .where({ user_id: user.user_id })
      .update({ last_login: db.fn.now() });

    // 解析权限
    const permissions = typeof user.permissions === 'string' 
      ? JSON.parse(user.permissions) 
      : user.permissions;

    const duration = Date.now() - startTime;
    logDbQuery('userLogin', 1, `userId=${user.user_id}, role=${user.roleName}`, duration);
    logApiResponse('/api/users/login', 200, 1, duration);

    // 返回用户信息（不包含密码）
    const { password_hash, ...userInfo } = user;
    res.json({
      code: 0,
      message: '登录成功',
      data: {
        ...userInfo,
        permissions
      }
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('登录失败', error, { duration });
    res.status(500).json({
      code: 50000,
      message: '登录失败',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
