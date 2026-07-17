import type {
  ReportData, BasicInfo, Benefits, BudgetCategory, EquipmentYear, EquipmentItem,
  ProcurementPlan, ProcurementActivity, ProcurementDetail, ProcurementMonth,
  NecessityType, InvestmentType, ProjectStatus,
} from './reportTypes'
import { ACTIVE_YEAR } from './reportTypes'

export function blankReportData(): ReportData {
  const year = ACTIVE_YEAR
  return {
    projectName: '',
    dept: '',
    section: '',
    fiscalYear: year,
    status: 'ใหม่',
    basicInfo: {
      responsible: { department: '', division: '', section: '', unit: '', phone: '' },
      necessity: 'อื่นๆ',
      investmentType: 'อื่นๆ',
      status: 'ใหม่',
      approval: '',
      workNature: '',
      area: '',
      durationYears: 1,
      startYear: year,
      endYear: year,
      totalInvestment: 0,
      yearInvestment: 0,
      disbursementTarget: 0,
      operatingBudget: null,
      objectives: [],
    },
    benefits: {
      outputAfterCompletion: '',
      outcomeAfterCompletion: '',
      outputThisYear: '',
      outcomeThisYear: '',
      benefitIncreaseRevenue: false,
      benefitReduceCost: false,
      benefitOther: '',
      orgImpact: '',
      communityImpact: '',
      ifNotApprovedImpact: '',
      problemsObstacles: '',
    },
    budget: { categories: [], reserve: 0, reserveByYear: [] },
    equipment: [],
    procurements: [{
      fiscalYear: year,
      activities: [
        {
          id: 'disburse-default',
          name: 'เบิกจ่าย',
          months: Array.from({ length: 12 }, () => ({ active: false })),
          details: [],
        },
      ],
    }],
  }
}

// Reference/boilerplate sheets with no per-project data — skipping them keeps the prompt small.
const SKIP_SHEETS = new Set(['S', 'Sheet1', 'รายชื่อฟอร์ม'])
const SKIP_PREFIXES = ['คำอธิบาย']
// Sheets the report schema actually maps from — always included. Anything else
// (e.g. regional equipment detail lists) is included only while the total stays small.
const CORE_SHEET = /^(ปก|003|004|005|006|007|008|009|010|011)/
const MAX_ROWS_PER_SHEET = 120
const MAX_TOTAL_CHARS = 60000

export interface WorkbookDump {
  text: string
  skippedSheets: string[]
}

export async function dumpWorkbookFile(file: File): Promise<WorkbookDump> {
  const XLSX = await import('xlsx')
  // cellStyles lets us see fill colors — the 009 gantt timeline is drawn with colored
  // empty cells, which we emit as "addr=■" so the model can reconstruct active months.
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true })
  const sheets: { name: string; text: string; core: boolean }[] = []
  for (const name of wb.SheetNames) {
    const trimmed = name.trim()
    if (SKIP_SHEETS.has(trimmed) || SKIP_PREFIXES.some(p => trimmed.startsWith(p))) continue
    const emitFills = trimmed.startsWith('009')
    const ws = wb.Sheets[name]
    const ref = ws['!ref']
    if (!ref) continue
    const range = XLSX.utils.decode_range(ref)
    const lines: string[] = []
    for (let r = range.s.r; r <= range.e.r && lines.length < MAX_ROWS_PER_SHEET; r++) {
      const cells: string[] = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = ws[addr] as { v?: unknown; s?: { fgColor?: unknown } } | undefined
        if (cell == null) continue
        const v = cell.v != null ? String(cell.v).replace(/\s+/g, ' ').trim() : ''
        if (v) cells.push(`${addr}=${v}`)
        else if (emitFills && cell.s?.fgColor) cells.push(`${addr}=■`)
      }
      if (cells.length) lines.push(cells.join(' | ').slice(0, 600))
    }
    if (lines.length) {
      sheets.push({
        name,
        text: `===== SHEET: ${name} =====\n${lines.join('\n')}`,
        core: CORE_SHEET.test(trimmed),
      })
    }
  }

  // Fill the budget core-first so oversized files drop detail sheets, not form data.
  let total = sheets.filter(s => s.core).reduce((n, s) => n + s.text.length, 0)
  const skippedSheets: string[] = []
  const included = sheets.filter(s => {
    if (s.core) return true
    if (total + s.text.length <= MAX_TOTAL_CHARS) {
      total += s.text.length
      return true
    }
    skippedSheets.push(s.name)
    return false
  })

  return { text: included.map(s => s.text).join('\n'), skippedSheets }
}

const SCHEMA_EXAMPLE = `{
  "projectName": "",            // ชื่องาน/แผนงาน (จากแบบ งป.004/1 ข้อ 1 หรือหน้าปก)
  "dept": "",                   // กอง
  "section": "",                // ฝ่าย
  "fiscalYear": 2570,           // ปีแรกของช่วงปีที่ขอตั้งงบประมาณ (พ.ศ.)
  "status": "ใหม่",             // "ต่อเนื่อง" | "ใหม่"
  "basicInfo": {
    "responsible": { "department": "", "division": "", "section": "", "unit": "", "phone": "" },
                                  // department=แผนก, division=กอง, section=ฝ่าย, unit=สายงาน
    "necessity": "อื่นๆ",        // "สัญญาผูกพัน" | "นโยบายรัฐบาล" | "นโยบายกฟภ" | "อื่นๆ" (ข้อ 2.2 ช่องที่มี ü)
    "investmentType": "อื่นๆ",   // "ก่อสร้างขยายเขต" | "บำรุงรักษาระบบไฟฟ้า" | "IT" | "ติดตั้งศูนย์สั่งการ" | "จัดหาที่ดินอาคาร" | "พัฒนาระบบสื่อสาร" | "อื่นๆ" (ข้อ 2.3)
    "status": "ใหม่",            // ข้อ 2.4
    "approval": "",              // ข้อ 2.5 เช่น "ผวก. ลงนาม วันที่ ..." เฉพาะช่องที่ถูกเลือก
    "workNature": "",            // ลักษณะงาน เช่น "จ้างเหมา 100%" (จากแบบ 004/3 ข้อ 14.1 ถ้ามี)
    "area": "",                  // ข้อ 2.6 พื้นที่ดำเนินการ
    "durationYears": 1,          // ข้อ 2.7
    "startYear": 2570,           // ปีเริ่มต้น (พ.ศ.)
    "endYear": 2570,             // ปีสิ้นสุด (พ.ศ.)
    "totalInvestment": 0,        // ข้อ 2.8 (ล้านบาท)
    "yearInvestment": 0,         // ข้อ 2.9 (ล้านบาท)
    "disbursementTarget": 0,     // ข้อ 2.10 (ล้านบาท)
    "operatingBudget": null,     // ข้อ 2.11 (ล้านบาท) ไม่มี = null
    "objectives": ["..."]        // ข้อ 3 แยกเป็นข้อละ 1 รายการ
  },
  "benefits": {                  // จากแบบ งป.004/2
    "outputAfterCompletion": "", // 4.1 ผลผลิต
    "outcomeAfterCompletion": "",// 4.1 ผลลัพธ์
    "outputThisYear": "",        // 4.2 ผลผลิต
    "outcomeThisYear": "",       // 4.2 ผลลัพธ์
    "benefitIncreaseRevenue": false,
    "benefitReduceCost": false,
    "benefitOther": "",
    "orgImpact": "",             // 5.1
    "communityImpact": "",       // 5.2
    "ifNotApprovedImpact": "",   // ข้อ 6
    "problemsObstacles": ""      // ข้อ 7
  },
  "budget": {                    // จากแบบ งป.004/4 เฉพาะแถวที่มีวงเงิน
    "categories": [{
      "หมวด": 2,                 // เลขหมวด 1-7
      "name": "ค่าวัสดุอุปกรณ์",  // ชื่อรายการ
      "formRef": "งป.007",       // แบบฟอร์มอ้างอิงในวงเล็บ ถ้ามี
      "yearAmount": 0,           // วงเงินดำเนินการ (ล้านบาท)
      "disbursementByYear": [{ "year": 2568, "amount": 0 }]  // เป้าหมายเบิกจ่ายรายปี (ล้านบาท)
    }],
    "reserve": 0,
    "reserveByYear": []
  },
  "equipment": [{                // จากแบบ งป.007 — ใช้ year เดียว = fiscalYear ใส่ทุกรายการ
    "year": 2570,
    "items": [{
      "no": 1,
      "description": "",         // ชื่อรายการ
      "details": [],
      "matNo": "",
      "qty": 0,
      "unit": "",                // หน่วยนับ ถ้าไม่ระบุใช้ ""
      "unitPrice": 0,            // ราคาต่อหน่วย **เป็นบาท ไม่ต้องแปลง**
      "priceSource": "",         // แหล่งที่มาของราคา เช่น "ครั้งสุดท้ายเมื่อ...", "ท้องตลาดเฉลี่ย 3 บริษัท"
      "totalAmount": 0,          // วงเงินรวม (ล้านบาท)
      "disbursementByYear": [{ "year": 2568, "amount": 0 }],  // ประมาณจ่ายรายปี (ล้านบาท)
      "paymentNote": ""          // คำชี้แจง
    }]
  }],
  "procurements": [{             // จากแบบ งป.009 — 1 รายการต่อปีงบประมาณที่พบ
    "fiscalYear": 2570,
    "activities": [{
      "id": "a1",                // id สั้นๆ ไม่ซ้ำ
      "name": "",                // ชื่อขั้นตอนหลัก เช่น "อนุมัติหลักการ / อนุมัติสเปค" — แถวเบิกจ่ายเงินใช้ชื่อ "เบิกจ่าย" เท่านั้น
      "months": [{ "active": false }],  // 12 ช่องเสมอ index 0 = ม.ค. ... 11 = ธ.ค. — เดือนที่มี ■ ใส่ { "active": true } / แถว "เบิกจ่าย" ใส่ { "active": true, "amount": 22.4 } (ล้านบาท)
      "details": [{ "name": "", "months": [{ "active": false }] }]  // ขั้นตอนย่อยที่ขึ้นต้นด้วย "-" พร้อม months 12 ช่องของแถวนั้นเอง
    }]
  }]
}`

const FORM_GUIDE = '(แบบ งป.003 = สรุปวงเงิน, 004/1–004/5 = ข้อมูลพื้นฐาน/ผลประโยชน์/งบประมาณ, 007 = รายการวัสดุอุปกรณ์, 009 = แผนจัดซื้อจัดจ้างรายเดือน)'

const OUTPUT_RULE = 'ให้ตอบกลับเป็น JSON ตามโครงสร้างนี้เท่านั้น ห้ามมีข้อความอื่น ห้ามใช้ markdown code block:'

const COMMON_RULES = `1. หน่วยเงิน: แบบ 003 / 004 / 007 กรอกเป็น "บาท" ให้แปลงเป็น "ล้านบาท" (หารด้วย 1,000,000) ก่อนใส่ใน JSON
   ยกเว้น "unitPrice" ของ equipment ให้คงเป็นบาทตามเดิม / แบบ 009 เป็นล้านบาทอยู่แล้ว ไม่ต้องแปลง
2. ช่องเลือกที่มีเครื่องหมาย ü หรือ ✓ หรือ / หรือ X ในวงเล็บ คือช่องที่ถูกเลือก
3. ปีทั้งหมดเป็น พ.ศ. ตัวเลข เช่น 2568
4. ค่า enum (necessity, investmentType, status) ต้องตรงกับตัวเลือกใน comment เท่านั้น ถ้าไม่แน่ใจใช้ "อื่นๆ" หรือ "ใหม่"
5. ข้อมูลที่ไม่พบในฟอร์ม: string ใช้ "" / number ใช้ 0 / array ใช้ []  ห้ามแต่งข้อมูลขึ้นเอง
6. "months" ต้องมีสมาชิก 12 ตัวเสมอ (ม.ค. ถึง ธ.ค.)
7. ข้อความยาวที่ถูกตัดเป็นหลายเซลล์/หลายบรรทัด ให้ต่อกันเป็นประโยคเดียว ตัดเส้นประ "....." ทิ้ง`

const GANTT_RULES = `ขั้นตอนย่อยที่ขึ้นต้นด้วย "-" (เช่น "- ทำสัญญา") ให้เป็น details ของกิจกรรมแม่ (แถวหลักก่อนหน้า) พร้อม months ของแถวย่อยเอง
   แถวเบิกจ่ายเงินให้ใช้ชื่อ "เบิกจ่าย" และใส่จำนวนเงินเป็น amount ของเดือนตามคอลัมน์ที่ตัวเลขอยู่ (ไม่รวมคอลัมน์ "รวม")`

export function buildExtractionPrompt(dump: string): string {
  return `คุณคือผู้ช่วยแปลงข้อมูลจากแบบฟอร์มคำขอตั้งงบประมาณลงทุน (Excel) ให้เป็น JSON

ด้านล่างคือข้อมูลดิบจากไฟล์ Excel รูปแบบคือ "ชื่อเซลล์=ค่า" คั่นด้วย " | " แยกตามชีต
${FORM_GUIDE}

${OUTPUT_RULE}

${SCHEMA_EXAMPLE}

กติกาสำคัญ:
${COMMON_RULES}
8. ในแบบ 009 สัญลักษณ์ ■ คือเซลล์ที่ถูกระบายสีเป็น Gantt chart — เทียบคอลัมน์ของ ■ กับแถวหัวตารางเดือน (ม.ค.–ธ.ค.)
   แล้วใส่ { "active": true } ให้เดือนนั้นของแถวนั้น
   ${GANTT_RULES}

ข้อมูลจากไฟล์:

${dump}`
}

// For PDFs and scans the copilot reads the file itself — the user attaches it in the
// chat alongside this prompt, so it carries the schema and rules but no data dump.
export function buildAttachmentPrompt(): string {
  return `คุณคือผู้ช่วยแปลงข้อมูลจากแบบฟอร์มคำขอตั้งงบประมาณลงทุน ให้เป็น JSON

ให้อ่านข้อมูลจากไฟล์แบบฟอร์มคำขอตั้งงบประมาณที่แนบมาในแชทนี้ (PDF / Excel / รูปสแกน)
${FORM_GUIDE}
ถ้าเป็นไฟล์สแกนให้อ่านข้อความจากภาพอย่างระมัดระวัง โดยเฉพาะตัวเลข ห้ามเดาตัวเลขที่อ่านไม่ชัด (ใช้ 0 แล้วผู้ใช้จะตรวจเอง)

${OUTPUT_RULE}

${SCHEMA_EXAMPLE}

กติกาสำคัญ:
${COMMON_RULES}
8. ในแบบ 009 ตาราง Gantt ใช้การระบายสีช่องเดือน — เดือนที่ถูกระบายสีให้ใส่ { "active": true } ของแถวนั้น
   ${GANTT_RULES}`
}

/* ---------- normalization of the model's JSON reply ---------- */

function num(v: unknown, def = 0): number {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/,/g, ''))
    if (isFinite(n)) return n
  }
  return def
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function bool(v: unknown): boolean {
  return v === true
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : []
}

function parseMonths(v: unknown): ProcurementMonth[] {
  const rawMonths = Array.isArray(v) ? (v as unknown[]) : []
  return Array.from({ length: 12 }, (_, mi) => {
    const m = (rawMonths[mi] ?? {}) as Record<string, unknown>
    const amount = m.amount == null ? undefined : num(m.amount)
    return { active: bool(m.active) || !!amount, ...(amount ? { amount } : {}) }
  })
}

function parseDetails(v: unknown): ProcurementDetail[] {
  if (!Array.isArray(v)) return []
  return v.map(d => {
    if (typeof d === 'string') return { name: d.trim(), months: parseMonths(null) }
    const obj = (d ?? {}) as Record<string, unknown>
    return { name: str(obj.name), months: parseMonths(obj.months) }
  }).filter(d => d.name)
}

function yearAmounts(v: unknown): { year: number; amount: number }[] {
  if (!Array.isArray(v)) return []
  return v
    .map(e => ({ year: num(e?.year), amount: num(e?.amount) }))
    .filter(e => e.year > 0)
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return allowed.includes(v as T) ? (v as T) : def
}

const NECESSITIES: NecessityType[] = ['สัญญาผูกพัน', 'นโยบายรัฐบาล', 'นโยบายกฟภ', 'อื่นๆ']
const INVESTMENT_TYPES: InvestmentType[] = ['ก่อสร้างขยายเขต', 'บำรุงรักษาระบบไฟฟ้า', 'IT', 'ติดตั้งศูนย์สั่งการ', 'จัดหาที่ดินอาคาร', 'พัฒนาระบบสื่อสาร', 'อื่นๆ']
const STATUSES: ProjectStatus[] = ['ต่อเนื่อง', 'ใหม่']

/** Extract the JSON object from the copilot's reply (tolerates code fences / prose) and
 *  normalize it into a valid ReportData, falling back to blank defaults per field. */
export function parseModelJson(text: string): ReportData {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('ไม่พบ JSON ในข้อความที่วาง')
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(match[0])
  } catch {
    // Copying from a chat UI often leaks markdown escapes like \[ \] \_ \* into the
    // text — invalid JSON escapes, so stripping the backslash is always safe.
    try {
      raw = JSON.parse(match[0].replace(/\\([[\]_*#~()>-])/g, '$1'))
    } catch {
      throw new Error('JSON ไม่ถูกต้อง — ลองให้ copilot ตอบใหม่เป็น JSON ล้วนๆ')
    }
  }

  const base = blankReportData()
  const bi = (raw.basicInfo ?? {}) as Record<string, unknown>
  const resp = (bi.responsible ?? {}) as Record<string, unknown>
  const bn = (raw.benefits ?? {}) as Record<string, unknown>
  const bg = (raw.budget ?? {}) as Record<string, unknown>

  const fiscalYear = num(raw.fiscalYear, base.fiscalYear)

  const basicInfo: BasicInfo = {
    responsible: {
      department: str(resp.department),
      division: str(resp.division),
      section: str(resp.section),
      unit: str(resp.unit),
      phone: str(resp.phone),
    },
    necessity: oneOf(bi.necessity, NECESSITIES, 'อื่นๆ'),
    investmentType: oneOf(bi.investmentType, INVESTMENT_TYPES, 'อื่นๆ'),
    status: oneOf(bi.status, STATUSES, 'ใหม่'),
    approval: str(bi.approval),
    workNature: str(bi.workNature),
    area: str(bi.area),
    durationYears: num(bi.durationYears, 1),
    startYear: num(bi.startYear, fiscalYear),
    endYear: num(bi.endYear, fiscalYear),
    totalInvestment: num(bi.totalInvestment),
    yearInvestment: num(bi.yearInvestment),
    disbursementTarget: num(bi.disbursementTarget),
    operatingBudget: bi.operatingBudget == null ? null : num(bi.operatingBudget),
    objectives: strArr(bi.objectives),
  }

  const benefits: Benefits = {
    outputAfterCompletion: str(bn.outputAfterCompletion),
    outcomeAfterCompletion: str(bn.outcomeAfterCompletion),
    outputThisYear: str(bn.outputThisYear),
    outcomeThisYear: str(bn.outcomeThisYear),
    benefitIncreaseRevenue: bool(bn.benefitIncreaseRevenue),
    benefitReduceCost: bool(bn.benefitReduceCost),
    benefitOther: str(bn.benefitOther),
    orgImpact: str(bn.orgImpact),
    communityImpact: str(bn.communityImpact),
    ifNotApprovedImpact: str(bn.ifNotApprovedImpact),
    problemsObstacles: str(bn.problemsObstacles),
  }

  const categories: BudgetCategory[] = Array.isArray(bg.categories)
    ? (bg.categories as unknown[]).map(c => {
        const cat = (c ?? {}) as Record<string, unknown>
        return {
          หมวด: num(cat['หมวด'], 7),
          name: str(cat.name),
          formRef: str(cat.formRef),
          yearAmount: num(cat.yearAmount),
          disbursementByYear: yearAmounts(cat.disbursementByYear),
        }
      }).filter(c => c.name)
    : []

  const equipment: EquipmentYear[] = Array.isArray(raw.equipment)
    ? (raw.equipment as unknown[]).map(y => {
        const ey = (y ?? {}) as Record<string, unknown>
        const items: EquipmentItem[] = Array.isArray(ey.items)
          ? (ey.items as unknown[]).map((it, i) => {
              const item = (it ?? {}) as Record<string, unknown>
              return {
                no: num(item.no, i + 1),
                description: str(item.description),
                details: strArr(item.details),
                matNo: str(item.matNo),
                qty: num(item.qty),
                unit: str(item.unit),
                unitPrice: num(item.unitPrice),
                priceSource: str(item.priceSource),
                totalAmount: num(item.totalAmount),
                disbursementByYear: yearAmounts(item.disbursementByYear),
                paymentNote: str(item.paymentNote),
              }
            }).filter(it => it.description)
          : []
        return { year: num(ey.year, fiscalYear), items }
      }).filter(y => y.items.length)
    : []

  const procurements: ProcurementPlan[] = Array.isArray(raw.procurements)
    ? (raw.procurements as unknown[]).map((p, pi) => {
        const plan = (p ?? {}) as Record<string, unknown>
        const activities: ProcurementActivity[] = Array.isArray(plan.activities)
          ? (plan.activities as unknown[]).map((a, ai) => {
              const act = (a ?? {}) as Record<string, unknown>
              // The disbursement row pins to the bottom of the editor by name — normalize
              // whatever the form called it ("เบิกจ่ายเงิน(ล้านบาท)" ฯลฯ) to the canonical name.
              let name = str(act.name) || 'กิจกรรม'
              if (name.startsWith('เบิกจ่าย')) name = 'เบิกจ่าย'
              return {
                id: str(act.id) || `imp-${pi}-${ai}`,
                name,
                months: parseMonths(act.months),
                details: parseDetails(act.details),
              }
            })
          : []
        return { fiscalYear: num(plan.fiscalYear, fiscalYear), activities }
      }).filter(p => p.activities.length)
    : []

  return {
    projectName: str(raw.projectName),
    dept: str(raw.dept),
    section: str(raw.section),
    fiscalYear,
    status: oneOf(raw.status, STATUSES, 'ใหม่'),
    basicInfo,
    benefits,
    budget: {
      categories,
      reserve: num(bg.reserve),
      reserveByYear: yearAmounts(bg.reserveByYear),
    },
    equipment,
    procurements: procurements.length ? procurements : base.procurements,
  }
}
