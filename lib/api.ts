import type { FlatProject, SummaryRow } from "./types"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1"

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path)
  if (params) Object.entries(params).forEach(([k, v]) => v && url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { cache: "no-store" })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

import type { TagCategory, TagValue, SubJobTag, TagSummaryRow, SubJobTagInput } from "./types"

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

async function del(path: string): Promise<void> {
  const res = await fetch(BASE + path, { method: "DELETE" })
  if (!res.ok) throw new Error(await res.text())
}

export const api = {
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
  deleteValue: (id: number) => del(`/tag-values/${id}`),

  // Sub-job tags
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
}
