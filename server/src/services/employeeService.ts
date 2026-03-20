import db from '../db/index';
import type { CompanyId } from '../types/index';

export interface EmployeeRecord {
  id?: number;
  userid: string;
  name: string;
  avatar?: string | null;
  title?: string | null;
  department?: string | null;
  mobile?: string | null;
  job_number?: string | null;
  unionid?: string | null;
  main_company?: string | null;
  company_id: CompanyId;
  hired_date?: Date | string | null;
  create_time?: Date | string | null;
  dept_id_list?: number[] | null;
  leader_in_dept?: any[] | null;
  role_list?: any[] | null;
  is_admin?: boolean;
  is_boss?: boolean;
  is_senior?: boolean;
  is_active?: boolean;
  employment_status?: 'active' | 'resigned' | 'transferred';
  resignation_date?: Date | string | null;
  last_sync_time?: Date | null;
}

export class EmployeeService {
  /**
   * 批量同步员工数据（从钉钉API获取后调用）
   * 使用 upsert：存在则更新，不存在则插入
   */
  async batchUpsertEmployees(companyId: CompanyId, employees: any[]): Promise<{ upserted: number; total: number }> {
    if (!employees || employees.length === 0) {
      return { upserted: 0, total: 0 };
    }

    const records: EmployeeRecord[] = employees.map(emp => ({
      userid: emp.userid,
      name: emp.name,
      avatar: emp.avatar || null,
      title: emp.title || null,
      department: emp.department || null,
      mobile: emp.mobile || null,
      job_number: emp.job_number || null,
      unionid: emp.unionid || null,
      main_company: emp.mainCompany || null,
      company_id: companyId,
      hired_date: emp.hired_date ? new Date(emp.hired_date) : null,
      create_time: emp.create_time ? new Date(emp.create_time) : null,
      dept_id_list: emp.dept_id_list ? JSON.stringify(emp.dept_id_list) : null,
      leader_in_dept: emp.leader_in_dept ? JSON.stringify(emp.leader_in_dept) : null,
      role_list: emp.role_list ? JSON.stringify(emp.role_list) : null,
      is_admin: emp.admin || false,
      is_boss: emp.boss || false,
      is_senior: emp.senior || false,
      is_active: emp.active !== false,
      employment_status: 'active' as const,
      last_sync_time: new Date(),
    }));

    let upserted = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await db('att_employees')
        .insert(batch as any)
        .onConflict(['company_id', 'userid'])
        .merge([
          'name', 'avatar', 'title', 'department', 'mobile', 'job_number',
          'unionid', 'main_company', 'hired_date', 'create_time',
          'dept_id_list', 'leader_in_dept', 'role_list',
          'is_admin', 'is_boss', 'is_senior', 'is_active',
          'employment_status', 'last_sync_time', 'updated_at',
        ]);
      upserted += batch.length;
    }

    return { upserted, total: employees.length };
  }

  /**
   * 标记不在当前在职列表中的员工为离职
   */
  async markResignedEmployees(companyId: CompanyId, activeUserIds: string[]): Promise<number> {
    if (activeUserIds.length === 0) return 0;

    const result = await db('att_employees')
      .where({ company_id: companyId, employment_status: 'active' })
      .whereNotIn('userid', activeUserIds)
      .update({
        employment_status: 'resigned',
        resignation_date: new Date(),
        updated_at: new Date(),
      });

    return result;
  }

  /**
   * 获取某公司所有员工（含离职）
   */
  async getAllEmployees(companyId: CompanyId, includeResigned = false): Promise<EmployeeRecord[]> {
    let query = db('att_employees').where({ company_id: companyId });
    if (!includeResigned) {
      query = query.where('employment_status', 'active');
    }
    return await query.orderBy('name');
  }

  /**
   * 获取某月参与考勤的员工列表
   * 优先从 att_month_snapshot 的 employee_user_ids 获取，再关联 att_employees
   */
  async getMonthlyEmployees(companyId: CompanyId, yearMonth: string): Promise<EmployeeRecord[]> {
    // 先查快照
    const snapshot = await db('att_month_snapshot')
      .where({ company_id: companyId, year_month: yearMonth })
      .first();

    if (snapshot?.employee_user_ids) {
      const userIds = typeof snapshot.employee_user_ids === 'string'
        ? JSON.parse(snapshot.employee_user_ids)
        : snapshot.employee_user_ids;

      if (Array.isArray(userIds) && userIds.length > 0) {
        return await db('att_employees')
          .where({ company_id: companyId })
          .whereIn('userid', userIds)
          .orderBy('name');
      }
    }

    // 没有快照，返回所有在职员工
    return this.getAllEmployees(companyId);
  }

  /**
   * 根据userid列表获取员工信息
   */
  async getEmployeesByUserIds(companyId: CompanyId, userIds: string[]): Promise<EmployeeRecord[]> {
    if (userIds.length === 0) return [];
    return await db('att_employees')
      .where({ company_id: companyId })
      .whereIn('userid', userIds)
      .orderBy('name');
  }

  /**
   * 将员工记录转换为前端 DingTalkUser 格式
   */
  static toFrontendFormat(emp: EmployeeRecord): any {
    return {
      userid: emp.userid,
      name: emp.name,
      avatar: emp.avatar,
      title: emp.title,
      department: emp.department,
      mobile: emp.mobile,
      job_number: emp.job_number,
      unionid: emp.unionid,
      mainCompany: emp.main_company,
      create_time: emp.create_time,
      hired_date: emp.hired_date,
      dept_id_list: typeof emp.dept_id_list === 'string' ? JSON.parse(emp.dept_id_list) : emp.dept_id_list,
      leader_in_dept: typeof emp.leader_in_dept === 'string' ? JSON.parse(emp.leader_in_dept) : emp.leader_in_dept,
      role_list: typeof emp.role_list === 'string' ? JSON.parse(emp.role_list) : emp.role_list,
      admin: emp.is_admin,
      boss: emp.is_boss,
      senior: emp.is_senior,
      active: emp.is_active,
    };
  }
}

export const employeeService = new EmployeeService();
