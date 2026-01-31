/**
 * 推送服务 API
 * 处理钉钉机器人推送功能
 */

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-domain.com/api/v1' 
  : 'http://localhost:5000/api/v1';

export interface AtUser {
  name: string;
  mobile: string;
  userid?: string;
}

export interface DingTalkPushRequest {
  webhook: string;
  content: string;
  atUsers?: AtUser[];
}

export interface PushResponse {
  success: boolean;
  message: string;
  dingResponse?: any;
  error?: string;
}

/**
 * 发送钉钉机器人消息
 */
export async function sendDingTalkMessage(request: DingTalkPushRequest): Promise<PushResponse> {
  try {
    console.log('[PushApiService] 发送钉钉消息:', {
      webhookLength: request.webhook.length,
      contentLength: request.content.length,
      atUsersCount: request.atUsers?.length || 0
    });

    const response = await fetch(`${API_BASE_URL}/push/dingtalk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (response.ok && data.code === 0) {
      console.log('[PushApiService] 推送成功');
      return {
        success: true,
        message: data.message || '推送成功',
        dingResponse: data.data?.dingResponse
      };
    } else {
      console.error('[PushApiService] 推送失败:', data);
      return {
        success: false,
        message: data.message || '推送失败',
        error: data.message
      };
    }
  } catch (error: any) {
    console.error('[PushApiService] 网络错误:', error);
    return {
      success: false,
      message: '网络请求失败，请检查服务器连接',
      error: error.message
    };
  }
}

/**
 * 测试推送服务连通性
 */
export async function testPushService(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/push/test`);
    const data = await response.json();

    if (response.ok && data.code === 0) {
      return {
        success: true,
        message: '推送服务连接正常'
      };
    } else {
      return {
        success: false,
        message: data.message || '推送服务连接失败'
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `推送服务连接失败: ${error.message}`
    };
  }
}

/**
 * 验证钉钉webhook地址格式
 */
export function validateDingTalkWebhook(webhook: string): { valid: boolean; message: string } {
  if (!webhook.trim()) {
    return { valid: false, message: '请输入Webhook地址' };
  }

  try {
    const url = new URL(webhook);
    
    if (url.protocol !== 'https:') {
      return { valid: false, message: '请使用HTTPS协议的链接' };
    }
    
    if (!url.hostname.includes('dingtalk.com') && !url.hostname.includes('oapi.dingtalk.com')) {
      return { valid: false, message: '请输入有效的钉钉机器人Webhook地址' };
    }
    
    if (!url.searchParams.has('access_token')) {
      return { valid: false, message: '链接缺少access_token参数' };
    }
    
    return { valid: true, message: 'Webhook地址格式正确' };
  } catch {
    return { valid: false, message: '请输入有效的URL地址' };
  }
}

/**
 * 格式化艾特用户列表
 */
export function formatAtUsers(users: AtUser[]): string {
  if (!users || users.length === 0) return '';
  return users.map(user => `@${user.name}`).join(' ') + ' ';
}

export default {
  sendDingTalkMessage,
  testPushService,
  validateDingTalkWebhook,
  formatAtUsers
};