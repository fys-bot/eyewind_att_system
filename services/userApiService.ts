const API_BASE_URL = 'http://localhost:5001/api/v1';

export interface User {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar?: string;
  roleId: string;
  roleName: string;
  status: 'active' | 'inactive';
  creator?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUserRequest {
  name: string;
  email?: string;
  roleId: string;
  status?: 'active' | 'inactive';
  password?: string;
  creator?: string;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  roleId?: string;
  status?: 'active' | 'inactive';
  password?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user_id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: string[];
  status: string;
}

// 获取所有用户
export async function getUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE_URL}/users`);
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '获取用户列表失败');
  }
  
  return data.data;
}

// 创建用户
export async function createUser(userData: CreateUserRequest): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '创建用户失败');
  }
  
  return data.data;
}

// 更新用户
export async function updateUser(userId: string, userData: UpdateUserRequest): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '更新用户失败');
  }
  
  return data.data;
}

// 删除用户
export async function deleteUser(userId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: 'DELETE',
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '删除用户失败');
  }
}

// 用户登录
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/users/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '登录失败');
  }
  
  return data.data;
}
