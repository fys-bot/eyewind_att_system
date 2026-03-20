const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

export interface SaveSnapshotRequest {
  companyId: string;
  companyDisplayName: string;
  yearMonth: string;
  reportType: 'attendance' | 'late' | 'performance';
  tabName: string;
  headers: string[];
  rows: string[][];
  redFrameCount: number;
  editCount: number;
  editLogs: Array<{
    rowIndex: number;
    colIndex: number;
    employeeName: string;
    columnName: string;
    oldValue: string;
    newValue: string;
  }>;
  savedBy?: string;
  savedByName?: string;
  remarks?: string;
}

export async function saveReportSnapshot(data: SaveSnapshotRequest): Promise<{ id: number; version: number }> {
  const res = await fetch(`${API_BASE}/api/v1/report-snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || '保存失败');
  return json.data;
}

export async function getSnapshots(companyId: string, yearMonth: string, reportType?: string) {
  const params = new URLSearchParams({ companyId, yearMonth });
  if (reportType) params.set('reportType', reportType);
  const res = await fetch(`${API_BASE}/api/v1/report-snapshots?${params}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || '查询失败');
  return json.data;
}

export async function getSnapshotById(id: number) {
  const res = await fetch(`${API_BASE}/api/v1/report-snapshots/${id}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || '查询失败');
  return json.data;
}

export async function getEditLogs(snapshotId: number) {
  const res = await fetch(`${API_BASE}/api/v1/report-snapshots/${snapshotId}/edit-logs`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || '查询失败');
  return json.data;
}

export async function getLatestSnapshot(companyId: string, yearMonth: string, reportType: string): Promise<any | null> {
  try {
    const params = new URLSearchParams({ companyId, yearMonth, reportType });
    const res = await fetch(`${API_BASE}/api/v1/report-snapshots/latest?${params}`);
    const json = await res.json();
    if (!res.ok || !json.success) return null;
    return json.data;
  } catch {
    return null;
  }
}
