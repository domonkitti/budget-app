// Mock data for the budget-priority scoring page (app/scoring).
// Criteria/weights follow "Draft #3 Value-Chain Matrix" from the PEA weighted-scoring doc.

export type CriteriaKey = "strategic" | "risk" | "financial" | "readiness"

export const CRITERIA_LABELS: Record<CriteriaKey, string> = {
  strategic: "Strategic Alignment",
  risk: "Risk & Criticality",
  financial: "Financial & Operational Value",
  readiness: "Project Readiness",
}

export const CRITERIA_SHORT: Record<CriteriaKey, string> = {
  strategic: "Strat.",
  risk: "Risk",
  financial: "Fin.",
  readiness: "Ready",
}

export const CRITERIA_KEYS: CriteriaKey[] = ["strategic", "risk", "financial", "readiness"]

export type ScoreCategory = {
  id: string
  name: string
  weights: Record<CriteriaKey, number> // fractions, sum to 1
}

export const CATEGORIES: ScoreCategory[] = [
  {
    id: "core-grid",
    name: "1. งานระบบจำหน่ายหลักและโครงข่ายความมั่นคง",
    weights: { strategic: 0.20, risk: 0.50, financial: 0.15, readiness: 0.15 },
  },
  {
    id: "commercial",
    name: "2. งานบริการลูกค้าและธุรกิจเกี่ยวเนื่องเชิงพาณิชย์",
    weights: { strategic: 0.15, risk: 0.10, financial: 0.65, readiness: 0.10 },
  },
  {
    id: "innovation",
    name: "3. งานนวัตกรรม โครงข่ายอัจฉริยะ และพลังงานสะอาด",
    weights: { strategic: 0.45, risk: 0.15, financial: 0.25, readiness: 0.15 },
  },
  {
    id: "social",
    name: "4. งานขยายเขตสังคมและพื้นที่ห่างไกล (ESG & CSR)",
    weights: { strategic: 0.25, risk: 0.15, financial: 0.45, readiness: 0.15 },
  },
  {
    id: "internal",
    name: "5. งานเพิ่มประสิทธิภาพระบบสนับสนุนและกระบวนการภายใน",
    weights: { strategic: 0.20, risk: 0.35, financial: 0.15, readiness: 0.30 },
  },
]

export function categoryOf(id: string): ScoreCategory {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[0]
}

export type ScoreProject = {
  id: string
  department: string
  name: string
  categoryId: string
  mandatory: boolean // งานที่จำเป็นต้องดำเนินการแน่นอน / ต่อสัญญาเดิม
  budget: number // บาท
  scores: Record<CriteriaKey, number> // raw 1-5
}

export const PROJECTS: ScoreProject[] = [
  {
    id: "p1", department: "กกก.", categoryId: "core-grid", mandatory: true, budget: 18_500_000,
    name: "แผนงานเปลี่ยนทดแทน Switchgear 22 kV และอุปกรณ์ควบคุมในระบบจำหน่าย",
    scores: { strategic: 3, risk: 5, financial: 3, readiness: 4 },
  },
  {
    id: "p2", department: "กกก.", categoryId: "core-grid", mandatory: true, budget: 25_000_000,
    name: "โครงการก่อสร้างสถานีไฟฟ้าย่อยเพิ่มเติมเพื่อรองรับความต้องการไฟฟ้า",
    scores: { strategic: 4, risk: 4, financial: 3, readiness: 3 },
  },
  {
    id: "p3", department: "กกง.", categoryId: "core-grid", mandatory: true, budget: 11_000_000,
    name: "แผนงานจัดหามิเตอร์และอุปกรณ์ประกอบสำรองจ่ายประจำปี",
    scores: { strategic: 2, risk: 3, financial: 4, readiness: 4 },
  },
  {
    id: "p4", department: "กกข.", categoryId: "commercial", mandatory: false, budget: 9_000_000,
    name: "โครงการขยายสถานีอัดประจุไฟฟ้า PEA VOLTA บนเส้นทางท่องเที่ยวหลัก",
    scores: { strategic: 3, risk: 2, financial: 5, readiness: 3 },
  },
  {
    id: "p5", department: "กกข.", categoryId: "commercial", mandatory: false, budget: 6_500_000,
    name: "โครงการพัฒนาแพลตฟอร์มซื้อขายพลังงาน (Energy Trading)",
    scores: { strategic: 4, risk: 2, financial: 4, readiness: 2 },
  },
  {
    id: "p6", department: "กกค.", categoryId: "innovation", mandatory: true, budget: 32_000_000,
    name: "โครงการติดตั้งระบบมิเตอร์อัจฉริยะ (Smart Meter / AMI) ทั่วองค์กร",
    scores: { strategic: 5, risk: 3, financial: 4, readiness: 4 },
  },
  {
    id: "p7", department: "กกจ.", categoryId: "innovation", mandatory: false, budget: 14_000_000,
    name: "โครงการจัดหาระบบกักเก็บพลังงานด้วยแบตเตอรี่ (BESS) เกาะสมุย",
    scores: { strategic: 5, risk: 3, financial: 3, readiness: 3 },
  },
  {
    id: "p8", department: "กกง.", categoryId: "social", mandatory: false, budget: 7_200_000,
    name: "งานขยายเขตไฟฟ้าด้วยระบบ Solar Cell / Microgrid ให้ชุมชนเกาะห่างไกล",
    scores: { strategic: 4, risk: 3, financial: 3, readiness: 2 },
  },
  {
    id: "p9", department: "กกง.", categoryId: "social", mandatory: true, budget: 5_000_000,
    name: "โครงการขยายเขตไฟฟ้าให้ครัวเรือนทุรกันดารตามพระราชดำริ",
    scores: { strategic: 4, risk: 2, financial: 3, readiness: 3 },
  },
  {
    id: "p10", department: "กกฉ.", categoryId: "internal", mandatory: false, budget: 4_800_000,
    name: "แผนงานพัฒนาแพลตฟอร์มพนักงาน (PEA WorkD Super App)",
    scores: { strategic: 3, risk: 4, financial: 3, readiness: 4 },
  },
  {
    id: "p11", department: "กกฉ.", categoryId: "internal", mandatory: true, budget: 3_200_000,
    name: "งานจ้างดูแลบำรุงรักษาระบบคอมพิวเตอร์และซอฟต์แวร์สำเร็จรูป",
    scores: { strategic: 3, risk: 4, financial: 3, readiness: 4 },
  },
  {
    id: "p12", department: "กกฉ.", categoryId: "internal", mandatory: false, budget: 6_000_000,
    name: "โครงการพัฒนาระบบบริหารจัดการข้อมูลองค์กร (Enterprise Big Data)",
    scores: { strategic: 3, risk: 2, financial: 3, readiness: 3 },
  },
]

export type Priority = "A" | "B" | "C"

export function priorityOf(total: number): Priority {
  if (total >= 80) return "A"
  if (total >= 50) return "B"
  return "C"
}

// stripe = tier accent color for the left edge of each table row (esports-standings style)
export const PRIORITY_STYLE: Record<Priority, { bg: string; fg: string; border: string; stripe: string }> = {
  A: { bg: "#ECFDF5", fg: "#047857", border: "#6EE7B7", stripe: "#10B981" },
  B: { bg: "#FFFBEB", fg: "#92400E", border: "#FCD34D", stripe: "#F59E0B" },
  C: { bg: "#F3F4F6", fg: "#4B5563", border: "#D1D5DB", stripe: "#9CA3AF" },
}

export type ScoredProject = ScoreProject & {
  category: ScoreCategory
  net: Record<CriteriaKey, number> // weighted, 0-100 scale contribution per criterion
  total: number // 0-100
  priority: Priority
}

export function scoreProject(p: ScoreProject): ScoredProject {
  const category = categoryOf(p.categoryId)
  const net = {} as Record<CriteriaKey, number>
  let total = 0
  for (const k of CRITERIA_KEYS) {
    const v = p.scores[k] * category.weights[k] * 20 // raw(1-5) * weight * 20 => 0-100 scale
    net[k] = v
    total += v
  }
  total = Math.round(total * 10) / 10
  return { ...p, category, net, total, priority: priorityOf(total) }
}

export const SCORED_PROJECTS: ScoredProject[] = PROJECTS.map(scoreProject)
