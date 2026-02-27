const API_BASE_URL = 'http://10.10.88.135:5001/api/v1';

export interface Role {
  id: string;
  role_id: string;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
  permissions?: string[];
}

export interface UpdateRoleRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

export interface PermissionsMap {
  [module: string]: {
    [key: string]: string;
  };
}

// 获取所有角色
export async function getRoles(): Promise<Role[]> {
  const response = await fetch(`${API_BASE_URL}/roles`);
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '获取角色列表失败');
  }
  
  return data.data;
}

// 创建角色
export async function createRole(roleData: CreateRoleRequest): Promise<Role> {
  const response = await fetch(`${API_BASE_URL}/roles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(roleData),
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '创建角色失败');
  }
  
  return data.data;
}

// 更新角色
export async function updateRole(roleId: string, roleData: UpdateRoleRequest): Promise<Role> {
  const response = await fetch(`${API_BASE_URL}/roles/${roleId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(roleData),
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '更新角色失败');
  }
  
  return data.data;
}

// 删除角色
export async function deleteRole(roleId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/roles/${roleId}`, {
    method: 'DELETE',
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '删除角色失败');
  }
}

// 获取所有可用权限
export async function getPermissions(): Promise<PermissionsMap> {
  const response = await fetch(`${API_BASE_URL}/roles/permissions`);
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.message || '获取权限列表失败');
  }
  
  return data.data;
}
