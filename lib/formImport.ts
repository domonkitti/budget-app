import type {
  ReportData, BasicInfo, Benefits, BudgetCategory, EquipmentYear, EquipmentItem,
  ProcurementPlan, ProcurementActivity, ProcurementDetail, ProcurementMonth, WorkQuantityItem,
  NecessityType, InvestmentType, ProjectStatus,
} from './reportTypes'
import { ACTIVE_YEAR, durationYears, emptyHistoryData, emptyCompareTable, emptyWorkQuantity } from './reportTypes'

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
      executionType: '',
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
    history: emptyHistoryData(),
    compareTable: emptyCompareTable(),
    workQuantity: emptyWorkQuantity(),
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

// Some 009 gantt timelines are drawn with floating shapes (e.g. Excel's "Arrow: Left-Right")
// positioned over a cell instead of a colored cell fill — SheetJS only reads cell values/styles,
// it never sees these, so we unzip the .xlsx ourselves (it's just a zip of XML) and read each
// shape's anchor straight out of DrawingML. Returns sheet name -> set of cell addresses covered
// by at least one shape. Best-effort: any parse failure just yields an empty map, same as a
// workbook with no shapes at all — the existing fill-color detection still works either way.
async function findGanttShapeCells(file: File, XLSX: typeof import('xlsx')): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>()
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())

    const tag = (xml: string, re: RegExp) => xml.match(re) ?? []
    const attr = (t: string, name: string) => t.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]

    const workbookXml = await zip.file('xl/workbook.xml')?.async('text')
    const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text')
    if (!workbookXml || !workbookRelsXml) return result

    const rIdToSheetName = new Map<string, string>()
    for (const t of tag(workbookXml, /<sheet\b[^>]*\/>/g)) {
      const name = attr(t, 'name')
      const rid = attr(t, 'r:id')
      if (name && rid) rIdToSheetName.set(rid, name)
    }
    const rIdToTarget = new Map<string, string>()
    for (const t of tag(workbookRelsXml, /<Relationship\b[^>]*\/>/g)) {
      const id = attr(t, 'Id')
      const target = attr(t, 'Target')
      if (id && target) rIdToTarget.set(id, target)
    }

    for (const [rid, sheetName] of rIdToSheetName) {
      const sheetTarget = rIdToTarget.get(rid) // e.g. "worksheets/sheet13.xml"
      const sheetFile = sheetTarget?.split('/').pop()
      if (!sheetFile) continue

      const sheetRelsXml = await zip.file(`xl/worksheets/_rels/${sheetFile}.rels`)?.async('text')
      if (!sheetRelsXml) continue
      const drawingTarget = tag(sheetRelsXml, /<Relationship\b[^>]*\/>/g)
        .find(t => /\/relationships\/drawing"/.test(t))
      const drawingPath = drawingTarget && attr(drawingTarget, 'Target')
      if (!drawingPath) continue

      const drawingXml = await zip.file(`xl/${drawingPath.replace(/^\.\.\//, '')}`)?.async('text')
      if (!drawingXml) continue

      const cells = new Set<string>()
      const colRow = (block: string | undefined) => ({
        col: Number(block?.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1]),
        row: Number(block?.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1]),
      })
      const markRange = (from: { col: number; row: number }, to: { col: number; row: number }) => {
        if (!Number.isFinite(from.col) || !Number.isFinite(from.row)) return
        for (let r = Math.min(from.row, to.row); r <= Math.max(from.row, to.row); r++) {
          for (let c = Math.min(from.col, to.col); c <= Math.max(from.col, to.col); c++) {
            cells.add(XLSX.utils.encode_cell({ r, c }))
          }
        }
      }
      for (const anchor of tag(drawingXml, /<xdr:twoCellAnchor\b[\s\S]*?<\/xdr:twoCellAnchor>/g)) {
        const from = colRow(anchor.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1])
        const toBlock = anchor.match(/<xdr:to>([\s\S]*?)<\/xdr:to>/)?.[1]
        markRange(from, toBlock ? colRow(toBlock) : from)
      }
      // oneCellAnchor only carries a size in EMUs, not a column span, so just mark its cell.
      for (const anchor of tag(drawingXml, /<xdr:oneCellAnchor\b[\s\S]*?<\/xdr:oneCellAnchor>/g)) {
        const from = colRow(anchor.match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1])
        markRange(from, from)
      }

      if (cells.size) result.set(sheetName, cells)
    }
  } catch {
    // Malformed/unexpected zip structure — fall back to fill-color-only detection.
  }
  return result
}

export async function dumpWorkbookFile(file: File): Promise<WorkbookDump> {
  const XLSX = await import('xlsx')
  // cellStyles lets us see fill colors — the 009 gantt timeline is often drawn with colored
  // empty cells, which we emit as "addr=■" so the model can reconstruct active months.
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellStyles: true })
  const shapeCellsBySheet = await findGanttShapeCells(file, XLSX)
  const sheets: { name: string; text: string; core: boolean }[] = []
  for (const name of wb.SheetNames) {
    const trimmed = name.trim()
    if (SKIP_SHEETS.has(trimmed) || SKIP_PREFIXES.some(p => trimmed.startsWith(p))) continue
    const emitFills = trimmed.startsWith('009')
    const shapeCells = emitFills ? shapeCellsBySheet.get(name) : undefined
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
        const v = cell?.v != null ? String(cell.v).replace(/\s+/g, ' ').trim() : ''
        if (v) cells.push(`${addr}=${v}`)
        else if (emitFills && (cell?.s?.fgColor || shapeCells?.has(addr))) cells.push(`${addr}=■`)
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
    "executionType": "",         // ข้อ 14.1 ช่อง (Ö) ดำเนินการเอง/จ้างเหมา/จ้างเหมาแบบ Turnkey — สรุปเป็นข้อความเช่น "จ้างเหมา 60%, ดำเนินการเอง 40%" ระบุเฉพาะช่องที่ติ๊ก ถ้าไม่มี % ให้ใส่แค่ชื่อประเภทคั่นด้วย ","
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
  "equipment": [{                // จากแบบ งป.007 — ใช้ year เดียว = fiscalYear ใส่ทุกรายการ (ข้ามแถว "รวม..." ดูกติกาข้อ 8)
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
      "paymentNote": "",         // คำชี้แจง
      "group": ""                // ชื่องานย่อย — ใส่เฉพาะเมื่อไฟล์มีชีต 007 มากกว่า 1 ชุด (ดูกติกาข้อ 11) ไม่งั้นเว้นว่าง
    }]
  }],
  "workQuantity": {              // จากแบบ งป.004/3 ข้อ 14.1 ตารางกิจกรรมหลัก — เฉพาะกรณีคอลัมน์ "หน่วยนับ" ไม่ใช่หน่วยเงิน (ดูกติกาข้อ 10)
    "items": [{
      "no": 1,                   // ลำดับกิจกรรมหลัก
      "name": "",                // ชื่อกิจกรรมหลัก (คอลัมน์ "กิจกรรมหลัก")
      "unit": "",                // หน่วยนับ เช่น กม./ต้น/จุด/ชุด/วงจร-กม.
      "totalQuantity": 0,        // คอลัมน์ "รวม" ของแถวนี้ — ปริมาณงานทั้งหมดตลอดโครงการ
      "byYear": [{ "year": 2568, "amount": 0 }]  // ปริมาณที่จะดำเนินการในแต่ละปีงบประมาณ ตามคอลัมน์ปีใต้ "ระยะเวลาดำเนินการ"
    }]
  },
  "procurements": [{             // จากแบบ งป.009 — 1 รายการต่อปีงบประมาณที่พบ (รวมทุกชีต 009 ของปีนั้น)
    "fiscalYear": 2570,
    "activities": [{
      "id": "a1",                // id สั้นๆ ไม่ซ้ำ
      "name": "",                // ชื่อขั้นตอนหลัก เช่น "อนุมัติหลักการ / อนุมัติสเปค" — แถวเบิกจ่ายเงินใช้ชื่อ "เบิกจ่าย" เท่านั้น
      "months": [{ "active": false }],  // 12 ช่องเสมอ index 0 = ม.ค. ... 11 = ธ.ค. — เดือนที่มี ■ ใส่ { "active": true } / แถว "เบิกจ่าย" ใส่ { "active": true, "amount": 22.4 } (ล้านบาท)
      "details": [{ "name": "", "months": [{ "active": false }] }],  // ขั้นตอนย่อยที่ขึ้นต้นด้วย "-" พร้อม months 12 ช่องของแถวนั้นเอง
      "group": ""                // ชื่องานย่อย — ต้องตรงกับ group ของ equipment ที่มาจาก 007 ชุดเดียวกัน (ดูกติกาข้อ 11) ไม่งั้นเว้นว่าง
    }]
  }]
}`

const FORM_GUIDE = '(แบบ งป.003 = สรุปวงเงิน, 004/1–004/5 = ข้อมูลพื้นฐาน/ผลประโยชน์/งบประมาณ, 007 = รายการวัสดุอุปกรณ์, 009 = แผนจัดซื้อจัดจ้างรายเดือน)'

const OUTPUT_RULE = 'ให้ตอบกลับเป็น JSON ตามโครงสร้างนี้เท่านั้น ห้ามมีข้อความอื่น ห้ามใช้ markdown code block:'

const COMMON_RULES = `1. หน่วยเงิน: แบบ 003 / 004 / 007 กรอกเป็น "บาท" ให้แปลงเป็น "ล้านบาท" (หารด้วย 1,000,000) ก่อนใส่ใน JSON
   ยกเว้น "unitPrice" ของ equipment ให้คงเป็นบาทตามเดิม / แบบ 009 เป็นล้านบาทอยู่แล้ว ไม่ต้องแปลง
2. ช่องเลือกที่มีเครื่องหมาย ü หรือ Ö หรือ ✓ หรือ / หรือ X ในวงเล็บ คือช่องที่ถูกเลือก (ข้อ 14.1 อาจติ๊กได้มากกว่า 1 ช่องพร้อมกัน เช่น ทั้งดำเนินการเองและจ้างเหมาบางส่วน)
3. ปีทั้งหมดเป็น พ.ศ. ตัวเลข เช่น 2568
4. ค่า enum (necessity, investmentType, status) ต้องตรงกับตัวเลือกใน comment เท่านั้น ถ้าไม่แน่ใจใช้ "อื่นๆ" หรือ "ใหม่"
5. ข้อมูลที่ไม่พบในฟอร์ม: string ใช้ "" / number ใช้ 0 / array ใช้ []  ห้ามแต่งข้อมูลขึ้นเอง
6. "months" ต้องมีสมาชิก 12 ตัวเสมอ (ม.ค. ถึง ธ.ค.)
7. ข้อความยาวที่ถูกตัดเป็นหลายเซลล์/หลายบรรทัด ให้ต่อกันเป็นประโยคเดียว ตัดเส้นประ "....." ทิ้ง
8. แถวในแบบ 007 ที่ขึ้นต้นด้วย "รวม" (เช่น "รวมงานจัดหาวีทีและซีที") คือแถวสรุปยอดของกลุ่มรายการก่อนหน้า ไม่ใช่วัสดุจริง
   ห้ามใส่เป็น equipment item เด็ดขาด — แอประบบคำนวณผลรวมของตารางเองจากรายการจริงทั้งหมดอยู่แล้ว ถ้าใส่แถว "รวม" ปนไปด้วย
   ยอดรวมจะเพี้ยนเป็น 2 เท่า
9. ห้ามข้ามหรือสรุปย่อรายการที่มีข้อมูลจริงแม้ตารางจะยาว ต้องแปลงทุกแถว/ทุกเลขลำดับที่ปรากฏให้ครบ ไม่ใช่เลือกมาเฉพาะบางแถว
10. "workQuantity": มาจากตารางกิจกรรมหลักในแบบ 004/3 ข้อ 14.1 (คอลัมน์ กิจกรรมหลัก/หน่วยนับ/ระยะเวลาดำเนินการ/รวม)
    ใส่ก็ต่อเมื่อคอลัมน์ "หน่วยนับ" ของแถวนั้นไม่ใช่หน่วยเงิน (ไม่ใช่ "บาท"/"ล้านบาท") — ถ้าเป็นหน่วยเงินให้ข้ามแถวนั้นไป (ซ้ำกับ budget อยู่แล้ว)
    คอลัมน์ย่อยใต้ "ระยะเวลาดำเนินการ" แต่ละคอลัมน์คือปีงบประมาณหนึ่งปี (ดูแถวหัวตาราง "ปีงบประมาณ"/"ปี xx") ใส่เป็น byYear ของแถวนั้น
    ถ้าไม่พบกิจกรรมที่หน่วยนับไม่ใช่เงินเลยในทั้งไฟล์ ให้ "items": []
    (ชื่อรายการในแบบ 004/4 บางอันมีตัวเลข+หน่วยนับที่ไม่ใช่เงินฝังอยู่ท้ายชื่อ เช่น "งานย้ายแนวระบบไฟฟ้า 2,256.61 วงจร-กม."
    — ถ้าตาราง 004/3 ไม่มีข้อมูลนี้แต่พบรูปแบบนี้ใน 004/4 ให้ใช้เป็น totalQuantity แทนได้ โดยเว้น byYear เป็น [] เนื่องจากไม่มีข้อมูลรายปี)`

const GANTT_RULES = `ขั้นตอนย่อยที่ขึ้นต้นด้วย "-" (เช่น "- ทำสัญญา") ให้เป็น details ของกิจกรรมแม่ (แถวหลักก่อนหน้า) พร้อม months ของแถวย่อยเอง
   แถวเบิกจ่ายเงินให้ใช้ชื่อ "เบิกจ่าย" และใส่จำนวนเงินเป็น amount ของเดือนตามคอลัมน์ที่ตัวเลขอยู่ (ไม่รวมคอลัมน์ "รวม")`

const SUBJOB_GROUP_RULE = `บางไฟล์มีชีต 007 มากกว่า 1 ชุด (เช่น "007 (1)", "007 (2)") แต่ละชุดมักมีชีต 009/010-1 ของตัวเองกำกับด้วย
   (เช่น "009(007-1)", "009(007-2)") — นี่คือสัญญาณว่างานนี้แบ่งเป็นหลายงานย่อย (sub-job) ไม่ใช่รายการซ้ำ
   ถ้าพบแบบนี้ ให้ตั้งชื่อ "group" ตรงตามชื่อชีตต้นฉบับเลย เช่นชีต "007 (1)" ก็ใช้ group = "007 (1)" — ห้ามเดาแต่งชื่อให้สื่อความหมายเอง
   (ผู้ใช้ตั้งชื่อใหม่เองได้ทีหลังในหน้าแก้ไขรายงาน) จับคู่ equipment กับ procurement ที่เป็นชุดเดียวกันด้วยเลขชุดในชื่อชีต (เช่น "007-1" ใน "009(007-1)")
   แล้วใส่ "group" ชื่อเดียวกัน (เช่น "007 (1)") ทั้งฝั่ง equipment item และฝั่ง procurement activity ของชุดนั้น
   (activities จากหลายชีต 009 ของปีเดียวกันให้รวมอยู่ใน "activities" array เดียวกันของปีนั้น แยกกันด้วย "group" เท่านั้น)
   ถ้าไฟล์มีชีต 007/009 เพียงชุดเดียว (กรณีส่วนใหญ่) ห้ามใส่ "group" เลย (เว้นว่างหรือไม่ต้องมี key นี้)`

export function buildExtractionPrompt(dump: string): string {
  return `คุณคือผู้ช่วยแปลงข้อมูลจากแบบฟอร์มคำขอตั้งงบประมาณลงทุน (Excel) ให้เป็น JSON

ด้านล่างคือข้อมูลดิบจากไฟล์ Excel รูปแบบคือ "ชื่อเซลล์=ค่า" คั่นด้วย " | " แยกตามชีต
${FORM_GUIDE}

${OUTPUT_RULE}

${SCHEMA_EXAMPLE}

กติกาสำคัญ:
${COMMON_RULES}
11. ในแบบ 009 สัญลักษณ์ ■ คือเซลล์ที่ถูกระบายสีเป็น Gantt chart — เทียบคอลัมน์ของ ■ กับแถวหัวตารางเดือน (ม.ค.–ธ.ค.)
   แล้วใส่ { "active": true } ให้เดือนนั้นของแถวนั้น
   ${GANTT_RULES}
12. ${SUBJOB_GROUP_RULE}

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
11. ในแบบ 009 ตาราง Gantt ใช้การระบายสีช่องเดือน — เดือนที่ถูกระบายสีให้ใส่ { "active": true } ของแถวนั้น
   ${GANTT_RULES}
12. ${SUBJOB_GROUP_RULE}`
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

type ExtractResult = { ok: true; text: string } | { ok: false; reason: 'none' | 'truncated' }

// Finds the FIRST balanced {...} object, tracking brace depth and skipping braces inside
// string literals. A naive "first { to last }" regex breaks whenever the pasted text has
// anything past the JSON — a duplicated paste (two full objects back-to-back), trailing
// prose from the copilot, etc. — since it would grab everything up to whatever '}' happens
// to be last, producing multiple top-level values that JSON.parse always rejects.
function extractFirstJsonObject(text: string): ExtractResult {
  const start = text.indexOf('{')
  if (start < 0) return { ok: false, reason: 'none' }
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { ok: true, text: text.slice(start, i + 1) }
    }
  }
  return { ok: false, reason: 'truncated' }
}

/** Extract the JSON object from the copilot's reply (tolerates code fences / prose) and
 *  normalize it into a valid ReportData, falling back to blank defaults per field. */
export function parseModelJson(text: string): ReportData {
  const extracted = extractFirstJsonObject(text)
  if (!extracted.ok) {
    throw new Error(
      extracted.reason === 'truncated'
        ? 'JSON ปิดวงเล็บไม่ครบ — คำตอบอาจถูกตัดก่อนจบ (ยาวเกินไป) ลองขอให้ copilot ตอบสั้นลงหรือแบ่งเป็นหลายส่วน'
        : 'ไม่พบ JSON ในข้อความที่วาง'
    )
  }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(extracted.text)
  } catch {
    // Copying from a chat UI often leaks stray backslashes into the text — markdown escapes
    // like \[ \] \_ \*, or odder ones from whatever mangled the copy (e.g. \& turning up in
    // front of a plain ampersand). Any backslash JSON doesn't recognize as a real escape
    // (\" \\ \/ \b \f \n \r \t \u) is one of these leaks, not intentional — dropping it and
    // keeping the character after it is always safe.
    try {
      raw = JSON.parse(extracted.text.replace(/\\(?!["\\/bfnrtu])/g, ''))
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
  const startYear = num(bi.startYear, fiscalYear)
  const endYear = num(bi.endYear, fiscalYear)

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
    executionType: str(bi.executionType),
    area: str(bi.area),
    durationYears: durationYears(startYear, endYear),
    startYear,
    endYear,
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

  const wq = (raw.workQuantity ?? {}) as Record<string, unknown>
  const workQuantityItems: WorkQuantityItem[] = Array.isArray(wq.items)
    ? (wq.items as unknown[]).map((it, i) => {
        const item = (it ?? {}) as Record<string, unknown>
        return {
          no: num(item.no, i + 1),
          name: str(item.name),
          unit: str(item.unit),
          totalQuantity: num(item.totalQuantity),
          byYear: yearAmounts(item.byYear),
        }
      }).filter(it => it.name)
    : []

  const equipmentBlocks: EquipmentYear[] = Array.isArray(raw.equipment)
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
                ...(str(item.group) ? { group: str(item.group) } : {}),
              }
            }).filter(it => it.description)
          : []
        return { year: num(ey.year, fiscalYear), items }
      }).filter(y => y.items.length)
    : []
  // The model sometimes emits one equipment block per sub-job group instead of merging them
  // into a single per-year block (EquipmentYear is keyed by year — the editor picks the first
  // block matching a given year, so a second same-year block silently disappears from the UI).
  // Merge same-year blocks here so nothing gets lost regardless of how the model split it.
  const equipment: EquipmentYear[] = [...equipmentBlocks
    .reduce((byYear, ey) => byYear.set(ey.year, [...(byYear.get(ey.year) ?? []), ...ey.items]), new Map<number, EquipmentItem[]>())
    .entries()]
    .map(([year, items]) => ({ year, items }))

  const procurementBlocks: ProcurementPlan[] = Array.isArray(raw.procurements)
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
                ...(str(act.group) ? { group: str(act.group) } : {}),
              }
            })
          : []
        return { fiscalYear: num(plan.fiscalYear, fiscalYear), activities }
      }).filter(p => p.activities.length)
    : []
  // Same fix as equipment, for the same reason — ProcurementPlan is keyed by fiscalYear.
  // Activity ids are only required to be unique within their own block, so a collision after
  // merging (e.g. two groups both using "a1") gets a suffix instead of silently overwriting.
  const procurements: ProcurementPlan[] = [...procurementBlocks
    .reduce((byYear, p) => {
      const existing = byYear.get(p.fiscalYear) ?? []
      const existingIds = new Set(existing.map(a => a.id))
      const activities = p.activities.map(a => {
        if (!existingIds.has(a.id)) { existingIds.add(a.id); return a }
        let id = a.id, n = 2
        while (existingIds.has(id)) id = `${a.id}-${n++}`
        existingIds.add(id)
        return { ...a, id }
      })
      return byYear.set(p.fiscalYear, [...existing, ...activities])
    }, new Map<number, ProcurementActivity[]>())
    .entries()]
    .map(([fiscalYear, activities]) => ({ fiscalYear, activities }))

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
    history: base.history,
    compareTable: base.compareTable,
    workQuantity: { items: workQuantityItems, progressByYear: [] },
    procurements: procurements.length ? procurements : base.procurements,
  }
}
