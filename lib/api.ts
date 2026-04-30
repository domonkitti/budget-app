import type { CategoryAllocationSelection, FlatProject, SummaryRow, Project, ProjectDetail, FilterOptions, Snapshot, SnapshotDetail, Scenario } from "./types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1"

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path)
  if (params) Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { cache: "no-store" })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

import type { ProjectTag, TagCategory, TagValue, SubJobTag, TagSummaryRow, SubJobTagInput } from "./types"

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  if (res.status === 204) return undefined as T
  return res.json()
}

async function put(path: string, body: unknown): Promise<void> {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
}

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: "DELETE" })
  if (!res.ok) throw new Error(await res.text())
}

export const api = {
  projects: (params?: Record<string, string>) =>
    get<Project[]>("/projects", params),
  projectDetail: (code: string) =>
    get<ProjectDetail>(`/projects/${code}`),
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

  // Inline editing (live)
  updateSubJob: (id: number, budget: number, target: number) =>
    put(`/sub-jobs/${id}`, { budget, target }),
  updateBudgetSource: (id: number, budget: number, target: number) =>
    put(`/budget-sources/${id}`, { budget, target }),

  // Scenarios
  scenarios: () => get<Scenario[]>("/scenarios"),
  createScenario: (label: string, note?: string) =>
    post<Scenario>("/scenarios", { label, note: note ?? "" }),
  deleteScenario: (id: number) => del(`/scenarios/${id}`),
  scenarioFlat: (id: number) => get<FlatProject[]>(`/scenarios/${id}/flat`),
  scenarioProjectDetail: (scenId: number, code: string) =>
    get<ProjectDetail>(`/scenarios/${scenId}/projects/${encodeURIComponent(code)}`),
  updateScenarioSubJob: (scenId: number, sjId: number, budget: number, target: number) =>
    put(`/scenarios/${scenId}/sub-jobs/${sjId}`, { budget, target }),
  updateScenarioBudgetSource: (scenId: number, bsId: number, budget: number, target: number) =>
    put(`/scenarios/${scenId}/budget-sources/${bsId}`, { budget, target }),
  allocationSelections: (categoryId: number) =>
    get<CategoryAllocationSelection[]>("/allocation-selections", { category_id: String(categoryId) }),
  setAllocationSelections: (categoryId: number, selections: CategoryAllocationSelection[]) =>
    put("/allocation-selections", { category_id: categoryId, selections }),
}
