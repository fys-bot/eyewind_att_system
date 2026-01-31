import attendanceDb from '../db/attendanceDb';

export interface AttendanceStatusRecord {
  id?: number;
  userid: string;
  attd_month: string;
  created_at?: Date;
  updated_at?: Date;
  [key: string]: any; // 允许其他字段
}

export class AttendanceStatusService {
  /**
   * 批量 UPSERT 考勤状态
   * @param data 考勤状态记录数组
   * @returns 操作结果
   */
  async batchUpsert(data: AttendanceStatusRecord[]): Promise<{
    success: boolean;
    message: string;
    data?: {
      total: number;
      success_count: number;
    };
    detail?: string;
  }> {
    try {
      // 检查 data 是否有效
      if (!Array.isArray(data) || data.length === 0) {
        return {
          success: false,
          message: '操作失败：必须提供有效的 data 数组。',
        };
      }

      // 校验每条记录的关键字段
      const invalid = data.filter(r => !r.userid || !r.attd_month);
      if (invalid.length > 0) {
        return {
          success: false,
          message: `操作失败：存在缺少 userid 或 attd_month 的记录，共 ${invalid.length} 条。`,
          detail: JSON.stringify(invalid),
        };
      }

      // 添加时间戳
      const dataWithTimestamps = data.map(record => ({
        ...record,
        created_at: record.created_at || new Date(),
        updated_at: new Date(),
      }));

      // 获取除了 created_at 和 id 之外的所有字段用于更新
      const dataKeys = Object.keys(dataWithTimestamps[0]).filter(
        key => key !== 'created_at' && key !== 'id'
      );

      // 执行数据库事务中的批量 UPSERT 操作
      const result = await attendanceDb.transaction(async (trx) => {
        // 执行批量插入/更新操作：基于 userid 和 attd_month 唯一约束
        const affectedRows = await trx('attendance')
          .insert(dataWithTimestamps)
          .onConflict(['userid', 'attd_month'])
          .merge(dataKeys);

        return affectedRows;
      });

      return {
        success: true,
        message: `批量 UPSERT 成功，共处理 ${data.length} 条记录。`,
        data: {
          total: data.length,
          success_count: Array.isArray(result) ? result.length : data.length,
        },
      };
    } catch (error: any) {
      console.error('批量 UPSERT 考勤状态时发生错误:', error);
      return {
        success: false,
        message: '批量 UPSERT 失败，内部错误。',
        detail: error.message?.substring(0, 200),
      };
    }
  }

  /**
   * 根据条件加载考勤状态
   * @param pathSegment 路径参数
   * @param companyId 公司ID，用于过滤数据（如果表中有company_id字段）
   * @returns 查询结果
   */
  async loadAttendanceStatus(pathSegment: string, companyId?: string): Promise<{
    success: boolean;
    message: string;
    data?: any;
    detail?: string;
  }> {
    try {
      const monthRegex = /^\d{4}-\d{2}$/;
      
      // 查询所有考勤记录
      let queryBuilder = attendanceDb('attendance');

      // 🔥 添加公司主体过滤（仅当表中有company_id字段时）
      if (companyId) {
        try {
          // 先检查表结构是否包含company_id字段
          const tableInfo = await attendanceDb('attendance').columnInfo();
          if (tableInfo.company_id) {
            queryBuilder = queryBuilder.where('company_id', companyId);
          } else {
            console.warn('attendance表中没有company_id字段，跳过公司过滤');
          }
        } catch (error) {
          console.warn('检查表结构失败，跳过公司过滤:', error);
        }
      }

      // 如果是 'load'，则查询所有记录
      if (pathSegment === 'load') {
        const records = await queryBuilder;

        if (records.length === 0) {
          return {
            success: false,
            message: companyId ? `没有找到公司 ${companyId} 的相关考勤记录。` : '没有找到相关的考勤记录。',
          };
        }

        // 按月份进行分类
        const groupedByMonth = records.reduce((result: Record<string, any[]>, record) => {
          const month = record.attd_month;
          if (!result[month]) {
            result[month] = [];
          }
          result[month].push(record);
          return result;
        }, {});

        return {
          success: true,
          message: companyId ? `公司 ${companyId} 的考勤记录已按月份分类。` : '考勤记录已按月份分类。',
          data: groupedByMonth,
        };
      }

      // 检查是否是 userid**attd_month 格式
      const [userid, attd_month] = pathSegment.split('**');
      if (userid && attd_month) {
        queryBuilder = queryBuilder.where({ userid, attd_month });
      } else if (monthRegex.test(pathSegment)) {
        // 如果是有效的月份格式
        queryBuilder = queryBuilder.where('attd_month', pathSegment);
      } else {
        // 否则，假设是 userid
        queryBuilder = queryBuilder.where('userid', pathSegment);
      }

      const records = await queryBuilder;

      if (records.length === 0) {
        return {
          success: false,
          message: companyId ? `没有找到公司 ${companyId} 的相关考勤记录。` : '没有找到相关的考勤记录。',
        };
      }

      // 根据查询类型返回不同的消息
      let message = '';
      if (userid && attd_month) {
        message = `成功查询用户 ${userid} 在 ${attd_month} 月的考勤记录。`;
      } else if (monthRegex.test(pathSegment)) {
        message = `成功查询 ${pathSegment} 月 ${records.length} 条考勤记录。`;
      } else {
        message = `成功查询用户 ${pathSegment} 的考勤记录。`;
      }

      if (companyId) {
        message = `[公司: ${companyId}] ${message}`;
      }

      return {
        success: true,
        message,
        data: records,
      };
    } catch (error: any) {
      console.error('读取考勤状态时发生错误:', error);
      return {
        success: false,
        message: '读取考勤状态失败，内部错误。',
        detail: error.message?.substring(0, 200),
      };
    }
  }
}

export const attendanceStatusService = new AttendanceStatusService();