export type SourceYearEntry = {
  year: number
  source: string
  fund_type: string
  budget: number
  target: number
  remain: number
}

export type SubJobYearEntry = {
  name: string
  sort_order: number | null
  year: number
  fund_type: string
  budget: number
  target: number
  remain: number
}

export type FlatProject = {
  id: number
  project_code: string
  item_no: string | null
  name: string
  division: string | null
  project_type: string
  year: number
  sub_jobs: SubJobYearEntry[]
  source_breakdown: SourceYearEntry[]
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

export type ProjectTag = {
  id: number
  project_id: number
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

export type CategoryAllocationSelection = {
  id?: number
  category_id: number
  project_id: number
  target_type: "project" | "job"
  sub_job_name?: string | null
}

export type Category = TagCategory
export type CategoryValue = TagValue
export type ProjectCategoryAllocation = ProjectTag
export type JobCategoryAllocation = SubJobTag
export type CategorySummaryRow = TagSummaryRow
export type CategoryAllocationInput = SubJobTagInput

export type Snapshot = {
  id: number
  label: string
  note?: string
  created_at: string
}

export type SnapshotDetail = Snapshot & {
  data: FlatProject[]
}

export type Scenario = {
  id: number
  label: string
  note?: string
  created_at: string
  updated_at: string
}

export type FilterOptions = {
  years: number[]
  sources: string[]
}

export type Project = {
  id: number
  project_code: string
  year: number
  project_type: string
  item_no: string | null
  name: string
  division: string | null
  department: string | null
}

export type SubJob = {
  id: number
  project_id: number
  name: string
  sort_order: number | null
  fund_type: string
  data_year: number
  budget: number
  target: number
  remain: number
}

export type BudgetSource = {
  id: number
  project_id: number
  source: string
  fund_type: string
  data_year: number
  budget: number
  target: number
  remain: number
}

export type ProjectDetail = Project & {
  sub_jobs: SubJob[]
  budget_sources: BudgetSource[]
}
