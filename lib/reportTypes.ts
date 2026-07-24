export type NecessityType = 'สัญญาผูกพัน' | 'นโยบายรัฐบาล' | 'นโยบายกฟภ' | 'อื่นๆ'
export type InvestmentType = 'ก่อสร้างขยายเขต' | 'บำรุงรักษาระบบไฟฟ้า' | 'IT' | 'ติดตั้งศูนย์สั่งการ' | 'จัดหาที่ดินอาคาร' | 'พัฒนาระบบสื่อสาร' | 'อื่นๆ'
export type ProjectStatus = 'ต่อเนื่อง' | 'ใหม่'
export type SectionKey = string
export type SectionWidth = 'full' | 'half'

export interface ReportGroup {
  id: string
  name: string
  order: number
}

export interface Report {
  id: string
  groupId: string
  presetId: string | null
  order: number
  data: ReportData
}

export interface ReportData {
  projectName: string
  dept: string        // กอง
  section: string     // ฝ่าย
  fiscalYear: number
  status: ProjectStatus
  basicInfo: BasicInfo
  benefits: Benefits
  budget: BudgetData
  equipment: EquipmentYear[]
  procurements: ProcurementPlan[]
  history: HistoryData
  compareTable: CompareTableData
}

export interface BasicInfo {
  responsible: {
    department: string  // แผนก
    division: string    // กอง
    section: string     // ฝ่าย
    unit: string        // สายงาน
    phone: string
  }
  necessity: NecessityType
  investmentType: InvestmentType
  status: ProjectStatus
  approval: string
  workNature: string  // ลักษณะงาน
  area: string
  durationYears: number
  startYear: number
  endYear: number
  totalInvestment: number
  yearInvestment: number
  disbursementTarget: number
  operatingBudget: number | null
  objectives: string[]
}

export interface Benefits {
  outputAfterCompletion: string
  outcomeAfterCompletion: string
  outputThisYear: string
  outcomeThisYear: string
  benefitIncreaseRevenue: boolean
  benefitReduceCost: boolean
  benefitOther: string
  orgImpact: string
  communityImpact: string
  ifNotApprovedImpact: string
  problemsObstacles: string
}

export interface BudgetData {
  categories: BudgetCategory[]
  reserve: number
  reserveByYear: { year: number; amount: number }[]
}

export interface BudgetCategory {
  หมวด: number
  name: string
  formRef: string
  yearAmount: number
  disbursementByYear: { year: number; amount: number }[]
}

// Historical ผูกพัน/ลงทุน tracking table ("นำเข้าข้อมูลย้อนหลัง"). Rows and year columns are
// both freeform — admin adds/removes them by hand. A one-time import can prefill rows from a
// chosen project's live budget data, but nothing here stays bound to that project afterward.
export interface HistoryAmount {
  year: number
  amount: number
  // Manual per-cell highlight (e.g. to box off a cluster of related cells like the reference
  // sheet does) — admin-picked, not derived from any rule, so it never drifts as rows/years change.
  color?: string
}

export interface HistoryRow {
  name: string
  amounts: HistoryAmount[]
}

export interface HistoryGroup {
  name: string
  rows: HistoryRow[]
}

export interface HistoryData {
  groups: HistoryGroup[]
}

export const HISTORY_GROUP_NAMES = ['วงเงินดำเนินการ', 'เป้าหมายการเบิกจ่าย', 'คงเหลือ'] as const

// Default row set per group, matching the reference sheet — still fully freeform afterward
// (admin can rename/add/remove any of these), this just saves re-typing the usual rows every time.
export const HISTORY_ROW_NAMES: Record<string, string[]> = {
  'วงเงินดำเนินการ': ['ผูกพัน', 'ลงทุน', 'ลงทุน (เพิ่มเติม)'],
  'เป้าหมายการเบิกจ่าย': ['ผูกพัน', 'ลงทุน', 'ลงทุน (เพิ่มเติม)'],
  'คงเหลือ': ['ผูกพัน', 'ลงทุน', 'ยกเลิกไม่ผูกพัน', 'คงเหลือผูกพันไป'],
}

export function emptyHistoryData(): HistoryData {
  return {
    groups: HISTORY_GROUP_NAMES.map(name => ({
      name,
      rows: (HISTORY_ROW_NAMES[name] ?? []).map(n => ({ name: n, amounts: [] })),
    })),
  }
}

// Snapshot of the /compare page's metric table ("นำเข้าจาก Compare") — pulled once for a
// manually chosen set of projects/metrics, then fully freeform afterward (admin adds/removes
// rows and columns and edits values by hand), same one-time-import philosophy as HistoryData.
export interface CompareTableColumn {
  key: string
  label: string
}

export interface CompareTableRow {
  label: string
  values: { key: string; amount: number }[]
}

export interface CompareTableData {
  columns: CompareTableColumn[]
  rows: CompareTableRow[]
}

export function emptyCompareTable(): CompareTableData {
  return { columns: [], rows: [] }
}

// Same 8 metrics as /compare's METRICS list, ผูกพัน-before-ลงทุน order — kept here too so the
// report's import modal offers the identical set without importing the whole compare page.
export const COMPARE_METRICS = [
  { key: 'budget_commit', label: 'วงเงิน/ผูกพัน' },
  { key: 'budget_invest', label: 'วงเงิน/ลงทุน' },
  { key: 'budget_total',  label: 'วงเงิน/รวม' },
  { key: 'target_commit', label: 'เป้า/ผูกพัน' },
  { key: 'target_invest', label: 'เป้า/ลงทุน' },
  { key: 'target_total',  label: 'เป้า/รวม' },
  { key: 'remain',        label: 'คงเหลือ' },
  { key: 'pct',           label: '% ใช้จ่าย' },
] as const

export interface EquipmentYear {
  year: number
  items: EquipmentItem[]
}

export interface EquipmentItem {
  no: number
  description: string
  details: string[]
  matNo: string
  qty: number
  unit: string
  unitPrice: number
  priceSource: string
  totalAmount: number
  disbursementByYear: { year: number; amount: number }[]
  paymentNote: string
  cancelled?: boolean
  // Undefined = main วัสดุอุปกรณ์หลัก table. Set to split off a separate named
  // table within the same year, e.g. "ค่าใช้จ่ายหน้างาน/ค่าจ้าง".
  group?: string
}

export interface ProcurementPlan {
  fiscalYear: number
  // each activity has 12 months: index 0 = ม.ค. (Jan), 11 = ธ.ค. (Dec)
  activities: ProcurementActivity[]
}

export interface ProcurementActivity {
  id: string
  name: string
  months: ProcurementMonth[]
  // Sub-rows, each with its own gantt timeline. Reports saved before detail
  // timelines existed stored plain strings — always read through normDetails().
  details?: (ProcurementDetail | string)[]
  // Undefined = main "009" table for the year. Set to split off a separate named
  // table within the same year — mirrors EquipmentItem.group, for projects whose
  // source form has more than one 009 sheet (one per sub-job).
  group?: string
}

export interface ProcurementDetail {
  name: string
  months: ProcurementMonth[]
}

export interface ProcurementMonth {
  active: boolean
  amount?: number
}

export function emptyMonths(): ProcurementMonth[] {
  return Array.from({ length: 12 }, () => ({ active: false }))
}

export function normDetails(details?: (ProcurementDetail | string)[]): ProcurementDetail[] {
  return (details ?? []).map(d =>
    typeof d === 'string'
      ? { name: d, months: emptyMonths() }
      : { ...d, months: d.months?.length === 12 ? d.months : emptyMonths() }
  )
}

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  page: number
  // Row window for splittable list sections ('equipment' and 'procurement'). Undefined rowEnd = through the last row.
  rowStart?: number
  rowEnd?: number
  // Fixed year for a duplicated 'equipment'/'procurement' card, independent of the shared
  // active-year tabs — lets you print every year's 007/009 as separate cards instead of only
  // whichever tab is selected.
  pinnedYear?: number
  // When true, this chain (this part plus any linked continuations) auto-splits itself onto a
  // new page whenever its rendered rows overflow the page — shared across every part of the
  // same chain so they all measure consistently. Off = today's default: content just scrolls
  // inside the card.
  autoSplit?: boolean
}

// A free-floating annotation box drawn over one page — not tied to any card or cell, just a
// clear (unfilled) colored-border rectangle the admin can drag/resize to circle something on
// the page. Position/size are in px relative to that page's own content area, and
// dragging/resizing is clamped to stay within it — it can't be moved onto a different page.
export interface PageHighlight {
  id: string
  page: number
  x: number
  y: number
  w: number
  h: number
  color?: string
}

export interface Preset {
  id: string
  name: string
  sections: PresetSection[]
  layout: LayoutItem[]
  pages: number[]
  highlights?: PageHighlight[]
}

export interface PresetSection {
  key: SectionKey
  visible: boolean
  width: SectionWidth
  hiddenFields?: string[]
}

export const DEFAULT_PRESET: Preset = {
  id: 'default',
  name: 'Full View',
  sections: [
    { key: 'header',       visible: true, width: 'full' },
    { key: 'basicInfo',    visible: true, width: 'full' },
    { key: 'benefits',     visible: true, width: 'full' },
    { key: 'budget',       visible: true, width: 'full' },
    { key: 'equipment',    visible: true, width: 'full' },
    { key: 'procurement',  visible: true, width: 'full' },
    { key: 'history',      visible: false, width: 'full' },
    { key: 'compareTable', visible: false, width: 'full' },
  ],
  layout: [
    { i: 'header',         x: 0, y: 0,  w: 12, h: 4,  minH: 3, minW: 3, page: 1 },
    { i: 'basicInfo',      x: 0, y: 0,  w: 6,  h: 10, minH: 6, minW: 3, page: 2 },
    { i: 'benefits',       x: 6, y: 0,  w: 6,  h: 10, minH: 4, minW: 3, page: 2 },
    { i: 'budget',         x: 0, y: 0,  w: 12, h: 6,  minH: 4, minW: 4, page: 3 },
    { i: 'equipment',      x: 0, y: 0,  w: 12, h: 10, minH: 6, minW: 4, page: 4 },
    { i: 'procurement',    x: 0, y: 0,  w: 12, h: 10, minH: 6, minW: 6, page: 5 },
    { i: 'history',        x: 0, y: 0,  w: 12, h: 10, minH: 6, minW: 4, page: 6 },
    { i: 'compareTable',   x: 0, y: 0,  w: 12, h: 10, minH: 6, minW: 4, page: 7 },
  ],
  pages: [1, 2, 3, 4, 5],
  highlights: [],
}

// Display label for equipment items with no explicit group (the default/main 007 table).
export const DEFAULT_EQUIPMENT_GROUP = 'วัสดุอุปกรณ์หลัก'

// Display label for procurement activities with no explicit group (the default/main 009 table).
export const DEFAULT_PROCUREMENT_GROUP = 'แผนจัดซื้อจัดจ้างหลัก'

export const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

// TODO: replace with real current fiscal year from API/session once available
export const ACTIVE_YEAR = 2570

export const YEAR_CHOICES = Array.from({ length: 11 }, (_, i) => ACTIVE_YEAR - 5 + i)

// Amounts are entered and stored directly in ล้านบาท (see each table's "หน่วย : ล้านบาท"
// note) — no conversion here, just formatting. Exception: EquipmentSection's ราคา/หน่วย
// (unitPrice) stays in raw บาท and uses fmtNumber instead.
export function fmtMillion(n: number): string {
  if (!n) return '—'
  return n.toLocaleString('th-TH', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export function fmtNumber(n: number): string {
  if (!n) return '—'
  return n.toLocaleString('th-TH')
}

// durationYears is derived from startYear/endYear, not entered independently —
// always recompute instead of trusting a stored value, which can drift out of
// sync (e.g. AI-imported reports where the source text gave a wrong figure).
export function durationYears(startYear: number, endYear: number): number {
  return Math.max(1, endYear - startYear + 1)
}
