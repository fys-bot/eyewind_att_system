import { Router, Request, Response } from 'express';
import axios from 'axios';
import type { ApiResponse } from '../types/index';

const router = Router();

// 钉钉机器人推送接口
interface DingTalkPushRequest {
  webhook: string;
  content: string;
  atUsers?: Array<{
    name: string;
    mobile: string;
    userid?: string;
  }>;
}

interface DingTalkMessage {
  msgtype: 'text';
  text: {
    content: string;
  };
  at?: {
    atMobiles?: string[];
    atUserIds?: string[];
    isAtAll?: boolean;
  };
}

// POST /api/v1/push/dingtalk - 发送钉钉机器人消息
router.post('/dingtalk', async (req: Request, res: Response) => {
  try {
    const { webhook, content, atUsers = [] }: DingTalkPushRequest = req.body;

    // 验证必要参数
    if (!webhook || !content) {
      return res.status(400).json({
        code: 40001,
        message: 'webhook和content参数不能为空',
      } as ApiResponse);
    }

    // 验证webhook格式
    if (!webhook.includes('dingtalk.com') && !webhook.includes('oapi.dingtalk.com')) {
      return res.status(400).json({
        code: 40002,
        message: '无效的钉钉webhook地址',
      } as ApiResponse);
    }

    // 构建钉钉消息格式
    const message: DingTalkMessage = {
      msgtype: 'text',
      text: {
        content: content
      }
    };

    // 处理艾特人功能
    if (atUsers && atUsers.length > 0) {
      const atMobiles = atUsers
        .filter(user => user.mobile && user.mobile.trim())
        .map(user => user.mobile.trim());
      
      const atUserIds = atUsers
        .filter(user => user.userid && user.userid.trim() && !user.userid.includes('preset_'))
        .map(user => user.userid!.trim());

      if (atMobiles.length > 0 || atUserIds.length > 0) {
        message.at = {};
        
        if (atMobiles.length > 0) {
          message.at.atMobiles = atMobiles;
        }
        
        if (atUserIds.length > 0) {
          message.at.atUserIds = atUserIds;
        }
      }
    }

    console.log('[DingTalk Push] 发送消息:', {
      webhook: webhook.substring(0, 50) + '...',
      contentLength: content.length,
      atUsers: atUsers.length,
      atMobiles: message.at?.atMobiles?.length || 0,
      atUserIds: message.at?.atUserIds?.length || 0
    });

    // 发送到钉钉
    const response = await axios.post(webhook, message, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10秒超时
    });

    // 检查钉钉返回结果
    if (response.data && response.data.errcode === 0) {
      console.log('[DingTalk Push] 发送成功');
      res.json({
        code: 0,
        message: '推送成功',
        data: {
          success: true,
          dingResponse: response.data
        }
      } as ApiResponse);
    } else {
      console.error('[DingTalk Push] 钉钉返回错误:', response.data);
      res.status(400).json({
        code: 40003,
        message: `钉钉推送失败: ${response.data?.errmsg || '未知错误'}`,
        data: {
          success: false,
          dingResponse: response.data
        }
      } as ApiResponse);
    }

  } catch (error: any) {
    console.error('[DingTalk Push] 推送失败:', error);
    
    let errorMessage = '推送失败';
    let errorCode = 50001;
    
    if (error.code === 'ECONNABORTED') {
      errorMessage = '请求超时，请检查网络连接';
      errorCode = 50002;
    } else if (error.response) {
      errorMessage = `HTTP错误: ${error.response.status} ${error.response.statusText}`;
      errorCode = 50003;
    } else if (error.request) {
      errorMessage = '网络请求失败，请检查网络连接';
      errorCode = 50004;
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(500).json({
      code: errorCode,
      message: errorMessage,
      data: {
        success: false,
        error: error.message
      }
    } as ApiResponse);
  }
});

// GET /api/v1/push/test - 测试接口连通性
router.get('/test', (req: Request, res: Response) => {
  res.json({
    code: 0,
    message: '推送服务正常',
    data: {
      timestamp: new Date().toISOString(),
      service: 'push-service'
    }
  } as ApiResponse);
});

export default router;