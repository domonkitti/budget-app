export type SourceYearEntry = {
  year: number
  source: string
  fund_type: string
  budget: number
  target: number
  remain: number
  cut_transfer: number
  under_budget: number
}

export type SubJobYearEntry = {
  name: string
  sort_order: number | null
  year: number
  fund_type: string
  budget: number
  target: number
  remain: number
  cut_transfer: number
  under_budget: number
}

export type FlatProject = {
  id: number
  project_code: string
  item_no: string | null
  name: string
  division: string | null
  department: string | null
  group_name: string | null
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

export type ChangeLogEntry = {
  id: number
  table_name: string
  row_id: number
  project_id: number
  row_name: string
  fund_type: string
  data_year: number
  field: string
  old_value: number
  new_value: number
  changed_at: string
  batch_id: string
  batch_comment: string
}

export type BatchSaveRequest = {
  batch_id: string
  batch_comment: string
  sub_job_updates: Array<{ id: number; budget: number; target: number; cut_transfer: number; under_budget: number }>
  budget_source_updates: Array<{ id: number; budget: number; target: number; cut_transfer: number; under_budget: number }>
  new_sub_jobs: Array<{ project_id: number; name: string; sort_order: number | null; fund_type: string; data_year: number; budget: number; target: number; cut_transfer: number; under_budget: number }>
  new_budget_sources: Array<{ project_id: number; source: string; fund_type: string; data_year: number; budget: number; target: number; cut_transfer: number; under_budget: number }>
  deleted_sub_job_names?: Array<{ project_id: number; name: string }>
}

export type FilterOptions = {
  years: number[]
  sources: string[]
  divisions: string[]
  departments: string[]
  groups: string[]
}

export type ImportStatus = {
  project_code: string
  status: 'has_update' | 'new' | 'up_to_date'
  last_accepted_version: number | null
  last_accepted_at: string | null
  po_version: number | null
  po_updated_at: string | null
}

export type ImportLog = {
  id: number
  project_code: string
  po_version: number
  accepted_by: string
  accepted_at: string
  snapshot_json: unknown
}

export type FieldDiff = {
  field: string
  bg_value: unknown
  po_value: unknown
}

export type SubJobDiff = {
  name: string
  fund_type: string
  data_year: number
  change: 'unchanged' | 'modified' | 'added' | 'removed'
  diffs?: FieldDiff[]
}

export type ProjectDiff = {
  project_code: string
  po_version: number
  has_changes: boolean
  project_diffs: FieldDiff[]
  sub_job_diffs: SubJobDiff[]
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
  group_name: string | null
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
  cut_transfer: number
  under_budget: number
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
  cut_transfer: number
  under_budget: number
}

export type ProjectDetail = Project & {
  sub_jobs: SubJob[]
  budget_sources: BudgetSource[]
}

export type AIImportNeedsReview = {
  row_key: number
  item_no: string
  reason: string
}

export type AIImportPreviewItem = {
  row_key: number
  item_no: string
  name: string
  year: number
  project_type: string
  division: string | null
  department: string | null
  project_group: string | null
  matched_code?: string
  sub_job_count: number
  budget_source_count: number
  old_budget_committed: number
  old_budget_invest: number
  new_budget_committed: number
  new_budget_invest: number
  rejected_match_code?: string
  rejected_match_name?: string
  rejected_match_similarity?: number
}

export type AIImportCompareRow = {
  project_type: string
  old_budget_committed: number
  old_budget_invest: number
  old_target_committed: number
  old_target_invest: number
  new_budget_committed: number
  new_budget_invest: number
  new_target_committed: number
  new_target_invest: number
}

export type AIImportYearTotal = {
  year: number
  project_count: number
  budget: number
}

export type AIImportMissingProject = {
  project_code: string
  item_no: string
  name: string
  project_type: string
  old_budget_committed: number
  old_budget_invest: number
}

export type AIImportPreviewResult = {
  items: AIImportPreviewItem[]
  needs_review: AIImportNeedsReview[]
  summary?: unknown
  comparison: AIImportCompareRow[]
  db_year_totals: AIImportYearTotal[]
  missing_projects: AIImportMissingProject[]
}

export type AIImportApplyResultItem = {
  row_key: number
  item_no: string
  name: string
  project_code: string
  action: 'created' | 'updated'
}

export type AIImportApplyResult = {
  results: AIImportApplyResultItem[]
  created: number
  updated: number
  deleted: number
  deleted_codes?: string[]
}

// AI Import 2 — separate year-carryover matching workflow (/import/ai2),
// independent of the AIImport* types above which back /import/ai.
export type AIImport2Group = 'matched' | 'new' | 'needs_check'

export type AIImport2Item = {
  row_key: number
  item_no: string
  name: string
  year: number
  project_type: string
  division: string | null
  department: string | null
  project_group: string | null
  group: AIImport2Group
  matched_code?: string
  sub_job_count: number
  budget_source_count: number
  old_budget_committed: number
  old_budget_invest: number
  new_budget_committed: number
  new_budget_invest: number
}

export type AIImport2CarryoverCandidate = {
  project_code: string
  item_no: string
  name: string
  project_type: string
  start_year: number
  year: number
  remaining: number
}

export type AIImport2PreviewResult = {
  items: AIImport2Item[]
  needs_review: AIImportNeedsReview[]
  carryover_candidates: AIImport2CarryoverCandidate[]
}

export type AIImport2ApplyResult = {
  results: AIImportApplyResultItem[]
  created: number
  updated: number
}

export type ProjectOverviewItem = {
  project_code: string
  name: string
  project_type: string
  project_year: number
  group_name: string | null
  item_no: string | null
  status: 'has_update' | 'new' | 'up_to_date' | 'budget_only'
  full_plan_budget: number
  active_year_budget: number
}

export type ActiveYearSetting = {
  active_year: number
}
