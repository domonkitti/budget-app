import type { CategoryAllocationSelection, FlatProject, SummaryRow, Project, ProjectDetail, FilterOptions, Snapshot, SnapshotDetail, ChangeLogEntry, SubJob, BudgetSource, BatchSaveRequest, ImportStatus, ProjectDiff, ImportLog, ProjectOverviewItem, ActiveYearSetting } from "./types"

const BASE = "/api/v1"
const EXTRA_HEADERS = { "ngrok-skip-browser-warning": "true" }

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  let url = BASE + path
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][])
    if (qs.toString()) url += "?" + qs.toString()
  }
  const res = await fetch(url, { cache: "no-store", headers: EXTRA_HEADERS })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

import type { ProjectTag, TagCategory, TagValue, SubJobTag, TagSummaryRow, SubJobTagInput } from "./types"

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return undefined as T
  return res.json()
}

async function put(path: string, body: unknown): Promise<void> {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: "DELETE", headers: EXTRA_HEADERS })
  if (!res.ok) throw new Error(await res.text())
}

export const api = {
  projects: (params?: Record<string, string>) =>
    get<Project[]>("/projects", params),
  createProject: (data: { name: string; project_type: string; year: number; division?: string | null; department?: string | null; group_name?: string | null; item_no?: string | null }) =>
    post<Project>("/projects", data),
  projectDetail: (code: string) =>
    get<ProjectDetail>(`/projects/${code}`),
  updateProjectInfo: (code: string, data: { name: string; item_no: string | null; year: number; project_type: string; division: string | null; department: string | null; group_name: string | null }) =>
    patchJson<{ ok: string }>(`/projects/${code}`, data),
  filterOptions: () => get<FilterOptions>("/filter-options"),
  flatProjects: (params?: Record<string, string>) =>
    get<FlatProject[]>("/projects/flat", params),

  summary: (by: string, params?: Record<string, string>) =>
    get<SummaryRow[]>("/summary", { by, ...params }),

  // Tag categories
  tagCategories: () => get<TagCategory[]>("/tag-categories"),
  createCategory: (name: string) => post<TagCategory>("/tag-categories", { name }),
  deleteCategory: (id: number) => del(`/tag-categories/${id}`),

  // Tag values
  tagValues: (catID: number) => get<TagValue[]>(`/tag-categories/${catID}/values`),
  createValue: (catID: number, code: string) =>
    post<TagValue>(`/tag-categories/${catID}/values`, { code }),
  updateValue: (id: number, code: string) => putJson<TagValue>(`/tag-values/${id}`, { code }),
  deleteValue: (id: number) => del(`/tag-values/${id}`),

  // Sub-job tags
  projectTags: (projectId: number) =>
    get<ProjectTag[]>("/project-tags", {
      project_id: String(projectId),
    }),
  setProjectTags: (projectId: number, categoryId: number, tags: SubJobTagInput[]) =>
    put("/project-tags", {
      project_id: projectId,
      category_id: categoryId,
      tags,
    }),

  subJobTags: (projectId: number, subJobName: string) =>
    get<SubJobTag[]>("/sub-job-tags", {
      project_id: String(projectId),
      sub_job_name: subJobName,
    }),
  setSubJobTags: (projectId: number, subJobName: string, categoryId: number, tags: SubJobTagInput[]) =>
    put("/sub-job-tags", {
      project_id: projectId,
      sub_job_name: subJobName,
      category_id: categoryId,
      tags,
    }),

  // Tag summary
  summaryByTag: (category: string, params?: Record<string, string>) =>
    get<TagSummaryRow[]>("/summary/by-tag", { category, ...params }),

  // Category allocation aliases used by the UI.
  categories: () => get<TagCategory[]>("/tag-categories"),
  createAllocationCategory: (name: string) => post<TagCategory>("/tag-categories", { name }),
  deleteAllocationCategory: (id: number) => del(`/tag-categories/${id}`),
  categoryValues: (catID: number) => get<TagValue[]>(`/tag-categories/${catID}/values`),
  createCategoryValue: (catID: number, code: string) =>
    post<TagValue>(`/tag-categories/${catID}/values`, { code }),
  updateCategoryValue: (id: number, code: string) => putJson<TagValue>(`/tag-values/${id}`, { code }),
  deleteCategoryValue: (id: number) => del(`/tag-values/${id}`),
  projectCategoryAllocations: (projectId: number) =>
    get<ProjectTag[]>("/project-tags", {
      project_id: String(projectId),
    }),
  setProjectCategoryAllocations: (projectId: number, categoryId: number, allocations: SubJobTagInput[]) =>
    put("/project-tags", {
      project_id: projectId,
      category_id: categoryId,
      tags: allocations,
    }),
  jobCategoryAllocations: (projectId: number, subJobName: string) =>
    get<SubJobTag[]>("/sub-job-tags", {
      project_id: String(projectId),
      sub_job_name: subJobName,
    }),
  setJobCategoryAllocations: (projectId: number, subJobName: string, categoryId: number, allocations: SubJobTagInput[]) =>
    put("/sub-job-tags", {
      project_id: projectId,
      sub_job_name: subJobName,
      category_id: categoryId,
      tags: allocations,
    }),
  categorySummary: (category: string, params?: Record<string, string>) =>
    get<TagSummaryRow[]>("/summary/by-tag", { category, ...params }),

  // Snapshots
  snapshots: () => get<Snapshot[]>("/snapshots"),
  createSnapshot: (label: string, note?: string) =>
    post<Snapshot>("/snapshots", { label, note: note ?? "" }),
  getSnapshot: (id: number) => get<SnapshotDetail>(`/snapshots/${id}`),
  deleteSnapshot: (id: number) => del(`/snapshots/${id}`),
  promoteSnapshot: (id: number) => post<void>(`/snapshots/${id}/promote`, {}),

  // Inline editing (live)
  createSubJob: (projectId: number, name: string, sortOrder: number | null, fundType: string, dataYear: number, budget: number, target: number) =>
    post<SubJob>("/sub-jobs", { project_id: projectId, name, sort_order: sortOrder, fund_type: fundType, data_year: dataYear, budget, target }),
  createBudgetSource: (projectId: number, source: string, fundType: string, dataYear: number, budget: number, target: number, cut_transfer = 0, under_budget = 0) =>
    post<BudgetSource>("/budget-sources", { project_id: projectId, source, fund_type: fundType, data_year: dataYear, budget, target, cut_transfer, under_budget }),
  updateSubJob: (id: number, budget: number, target: number) =>
    put(`/sub-jobs/${id}`, { budget, target }),
  updateBudgetSource: (id: number, budget: number, target: number, cut_transfer = 0, under_budget = 0) =>
    put(`/budget-sources/${id}`, { budget, target, cut_transfer, under_budget }),

  // Batch save
  batchSave: (req: BatchSaveRequest) => post<void>("/batch-save", req),

  // Change log
  projectHistory: (code: string) => get<ChangeLogEntry[]>(`/projects/${code}/history`),
  undoChange: (id: number) => post<void>(`/change-log/${id}/undo`, {}),
  updateBatchComment: (batchId: string, comment: string) =>
    fetch(`${BASE}/change-log/batch/${encodeURIComponent(batchId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...EXTRA_HEADERS },
      body: JSON.stringify({ comment }),
    }).then(r => { if (!r.ok) throw new Error(r.statusText) }),

  allocationSelections: (categoryId: number) =>
    get<CategoryAllocationSelection[]>("/allocation-selections", { category_id: String(categoryId) }),
  setAllocationSelections: (categoryId: number, selections: CategoryAllocationSelection[]) =>
    put("/allocation-selections", { category_id: categoryId, selections }),

  // Import
  importVersions: () => get<ImportStatus[]>("/import/versions"),
  importDiff: (code: string) => get<ProjectDiff>(`/import/project/${code}/diff`),
  importAccept: (code: string) => post<{ ok: boolean; project_code: string; po_version: number }>(`/import/project/${code}/accept`, {}),
  importLog: () => get<ImportLog[]>("/import/log"),

  // Project overview
  projectOverview: (year?: number) =>
    get<ProjectOverviewItem[]>("/project-overview", year ? { year: String(year) } : undefined),

  // Settings
  getActiveYear: () => get<ActiveYearSetting>("/settings/active-year"),
  setActiveYear: (year: number) =>
    putJson<ActiveYearSetting>("/settings/active-year", { active_year: year }),
}
