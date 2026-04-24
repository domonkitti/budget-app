export type FlatProject = {
  id: number
  project_code: string
  name: string
  division: string | null
  project_type: string
  year: number
  budget_committed: number
  budget_invest: number
  budget_total: number
  target_committed: number
  target_invest: number
  target_total: number
  remain_committed: number
  remain_invest: number
  remain_total: number
}

export type SummaryRow = {
  group_by: string
  budget: number
  target: number
  remain: number
}

export type SortDir = "asc" | "desc" | false

export type TagCategory = {
  id: number
  name: string
}

export type TagValue = {
  id: number
  category_id: number
  code: string
}

export type SubJobTag = {
  id: number
  project_id: number
  sub_job_name: string
  tag_value_id: number
  tag_code: string
  category_id: number
  percentage: number
}

export type TagSummaryRow = {
  code: string
  budget: number
  target: number
  remain: number
}

export type SubJobTagInput = {
  tag_value_id: number
  percentage: number
}
