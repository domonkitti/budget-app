import type { ReportGroup, Report, ReportData } from './reportTypes'
import { emptyHistoryData, emptyCompareTable } from './reportTypes'

const BASE = "/api/v1"
const EXTRA_HEADERS = { "ngrok-skip-browser-warning": "true" }

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { cache: 'no-store', headers: EXTRA_HEADERS })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...EXTRA_HEADERS },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function patch(path: string, body: unknown): Promise<void> {
  const res = await fetch(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...EXTRA_HEADERS },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
}

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: 'DELETE', headers: EXTRA_HEADERS })
  if (!res.ok) throw new Error(await res.text())
}

// Reports saved before the history/compareTable sections existed have no corresponding key in
// their stored JSON — backfill on read so older reports don't crash those sections, instead of
// migrating every row.
function withNewSections(report: Report): Report {
  if (report.data.history && report.data.compareTable) return report
  return {
    ...report,
    data: {
      ...report.data,
      history: report.data.history ?? emptyHistoryData(),
      compareTable: report.data.compareTable ?? emptyCompareTable(),
    },
  }
}

export const reportApi = {
  reportGroups: () => get<ReportGroup[]>('/report-groups'),
  createReportGroup: (name: string) => post<ReportGroup>('/report-groups', { name }),
  renameReportGroup: (id: string, name: string) => patch(`/report-groups/${id}`, { name }),
  deleteReportGroup: (id: string) => del(`/report-groups/${id}`),
  reorderReportGroups: (ids: string[]) => patch('/report-groups/reorder', { ids }),

  reports: () => get<Report[]>('/reports'),
  report: (id: string) => get<Report>(`/reports/${id}`).then(withNewSections),
  createReport: (groupId: string, data: ReportData) => post<Report>('/reports', { groupId, data }),
  updateReportData: (id: string, data: ReportData) => patch(`/reports/${id}`, { data }),
  deleteReport: (id: string) => del(`/reports/${id}`),
  reorderReports: (ids: string[]) => patch('/reports/reorder', { ids }),
}
