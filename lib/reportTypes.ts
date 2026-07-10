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
}

export interface ProcurementPlan {
  fiscalYear: number
  // each activity has 12 months: index 0 = ต.ค. (Oct), 11 = ก.ย. (Sep)
  activities: ProcurementActivity[]
}

export interface ProcurementActivity {
  id: string
  name: string
  months: ProcurementMonth[]
  details?: string[]
}

export interface ProcurementMonth {
  active: boolean
  amount?: number
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
  // Row window for splittable list sections (currently only 'equipment'). Undefined rowEnd = through the last row.
  rowStart?: number
  rowEnd?: number
}

export interface Preset {
  id: string
  name: string
  sections: PresetSection[]
  layout: LayoutItem[]
  pages: number[]
  pageHeights?: Record<number, number>
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
  ],
  layout: [
    { i: 'header',         x: 0, y: 0,  w: 12, h: 4,  minH: 3, minW: 3, page: 1 },
    { i: 'basicInfo',      x: 0, y: 0,  w: 6,  h: 10, minH: 6, minW: 3, page: 2 },
    { i: 'benefits',       x: 6, y: 0,  w: 6,  h: 10, minH: 4, minW: 3, page: 2 },
    { i: 'budget',         x: 0, y: 0,  w: 12, h: 6,  minH: 4, minW: 4, page: 3 },
    { i: 'equipment',      x: 0, y: 0,  w: 12, h: 12, minH: 6, minW: 4, page: 4 },
    { i: 'procurement',    x: 0, y: 0,  w: 12, h: 10, minH: 6, minW: 6, page: 5 },
  ],
  pages: [1, 2, 3, 4, 5],
}

export const THAI_MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.']

// TODO: replace with real current fiscal year from API/session once available
export const ACTIVE_YEAR = 2570

export const YEAR_CHOICES = Array.from({ length: 11 }, (_, i) => ACTIVE_YEAR - 5 + i)

export function fmtMillion(n: number): string {
  if (!n) return '—'
  return `${(n / 1_000_000).toFixed(2)} ล.`
}

export function fmtNumber(n: number): string {
  if (!n) return '—'
  return n.toLocaleString('th-TH')
}
