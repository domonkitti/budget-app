import type { FlatProject } from './types'
import type { Report, ReportGroup, ProcurementMonth } from './reportTypes'
import { THAI_MONTHS, DEFAULT_EQUIPMENT_GROUP, normDetails, durationYears } from './reportTypes'

// One self-describing .md file with everything the app knows — users attach it to
// their company copilot chat and ask questions. CSV blocks keep the big tables
// compact; the legend up top tells the model how to read them.

// TODO: swap in the real deployed URL once the app has one.
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function projectUrl(projectCode: string): string {
  return `${BASE_URL}/projects/${encodeURIComponent(projectCode)}`
}

function reportUrl(groupId: string, reportId: string): string {
  return `${BASE_URL}/report/${encodeURIComponent(groupId)}/${encodeURIComponent(reportId)}`
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',')
}

function n(v: number): number {
  return Number(v.toFixed(3))
}

function monthsText(months: ProcurementMonth[]): string {
  const parts: string[] = []
  months.forEach((m, mi) => {
    if (!m.active && m.amount == null) return
    parts.push(m.amount != null ? `${THAI_MONTHS[mi]}=${n(m.amount)}` : THAI_MONTHS[mi])
  })
  return parts.length ? parts.join(', ') : '—'
}

function reportMarkdown(report: Report, groupName: string): string {
  const d = report.data
  const bi = d.basicInfo
  const bn = d.benefits
  const lines: string[] = []

  lines.push(`### ${d.projectName || '(ไม่มีชื่อ)'} — ปีงบประมาณ ${d.fiscalYear} (กลุ่ม: ${groupName})`)
  lines.push(`- ลิงก์รายงาน: ${reportUrl(report.groupId, report.id)}`)
  lines.push(`- หน่วยงาน: กอง ${d.dept || '-'} / ฝ่าย ${d.section || '-'} / แผนก ${bi.responsible.department || '-'} / สายงาน ${bi.responsible.unit || '-'}`)
  lines.push(`- สถานะ: ${bi.status} | ความจำเป็น: ${bi.necessity} | ประเภทการลงทุน: ${bi.investmentType}`)
  lines.push(`- ระยะเวลา: ${durationYears(bi.startYear, bi.endYear)} ปี (${bi.startYear}–${bi.endYear}) | พื้นที่: ${bi.area || '-'}`)
  lines.push(`- วงเงินลงทุนทั้งสิ้น: ${n(bi.totalInvestment)} | วงเงินปีนี้: ${n(bi.yearInvestment)} | เป้าเบิกจ่ายปีนี้: ${n(bi.disbursementTarget)}${bi.operatingBudget != null ? ` | งบทำการ: ${n(bi.operatingBudget)}` : ''}`)
  if (bi.workNature) lines.push(`- ลักษณะงาน: ${bi.workNature}`)
  if (bi.approval) lines.push(`- อนุมัติโดย: ${bi.approval}`)
  if (bi.objectives.length) lines.push(`- วัตถุประสงค์: ${bi.objectives.join(' / ')}`)

  const benefits: string[] = []
  if (bn.outputAfterCompletion) benefits.push(`ผลผลิตหลังเสร็จ: ${bn.outputAfterCompletion}`)
  if (bn.outcomeAfterCompletion) benefits.push(`ผลลัพธ์หลังเสร็จ: ${bn.outcomeAfterCompletion}`)
  if (bn.outputThisYear) benefits.push(`ผลผลิตปีนี้: ${bn.outputThisYear}`)
  if (bn.outcomeThisYear) benefits.push(`ผลลัพธ์ปีนี้: ${bn.outcomeThisYear}`)
  if (bn.orgImpact) benefits.push(`ผลกระทบต่อองค์กร: ${bn.orgImpact}`)
  if (bn.communityImpact) benefits.push(`ผลกระทบต่อชุมชน: ${bn.communityImpact}`)
  if (bn.ifNotApprovedImpact) benefits.push(`ผลกระทบถ้าไม่ได้รับงบ: ${bn.ifNotApprovedImpact}`)
  if (bn.problemsObstacles) benefits.push(`ปัญหาอุปสรรค: ${bn.problemsObstacles}`)
  if (benefits.length) {
    lines.push(`ผลประโยชน์/ผลกระทบ:`)
    benefits.forEach(b => lines.push(`- ${b}`))
  }

  if (d.budget.categories.length) {
    lines.push(`งบประมาณตามหมวด (ล้านบาท):`)
    for (const c of d.budget.categories) {
      const byYear = c.disbursementByYear.map(y => `${y.year}=${n(y.amount)}`).join(', ')
      lines.push(`- หมวด ${c.หมวด} ${c.name}${c.formRef ? ` (${c.formRef})` : ''}: วงเงิน ${n(c.yearAmount)}${byYear ? ` | เบิกจ่ายรายปี: ${byYear}` : ''}`)
    }
    if (d.budget.reserve) lines.push(`- สำรองค่าปรับราคา: ${n(d.budget.reserve)}`)
  }

  for (const ey of d.equipment) {
    if (!ey.items.length) continue
    lines.push(`วัสดุอุปกรณ์ ปี ${ey.year}:`)
    for (const it of ey.items) {
      const byYear = it.disbursementByYear.map(y => `${y.year}=${n(y.amount)}`).join(', ')
      lines.push(`- ${it.no}. ${it.description}${it.group && it.group !== DEFAULT_EQUIPMENT_GROUP ? ` [${it.group}]` : ''}: จำนวน ${it.qty}${it.unit ? ` ${it.unit}` : ''} × ${it.unitPrice.toLocaleString('en-US')} บาท = ${n(it.totalAmount)} ลบ.${byYear ? ` | จ่ายรายปี: ${byYear}` : ''}${it.cancelled ? ' (ยกเลิก)' : ''}`)
    }
  }

  for (const plan of d.procurements) {
    if (!plan.activities.length) continue
    lines.push(`แผนจัดซื้อ/จัดจ้าง ปี ${plan.fiscalYear}:`)
    for (const a of plan.activities) {
      lines.push(`- ${a.name}: ${monthsText(a.months)}`)
      for (const det of normDetails(a.details)) {
        lines.push(`  - ${det.name}: ${monthsText(det.months)}`)
      }
    }
  }

  return lines.join('\n')
}

export function buildAIExport(projects: FlatProject[], groups: ReportGroup[], reports: Report[]): string {
  const out: string[] = []

  out.push(`# ข้อมูลระบบงบประมาณลงทุน (export สำหรับ AI)`)
  out.push(`Export เมื่อ: ${new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })} (ข้อมูล LIVE ณ เวลานั้น)`)
  out.push(``)
  out.push(`## คำอธิบายข้อมูล (อ่านก่อนตอบคำถาม)`)
  out.push(`- จำนวนเงินทุกตัวมีหน่วยเป็น "ล้านบาท" ยกเว้นที่ระบุว่า "บาท"`)
  out.push(`- ปีทั้งหมดเป็นปีงบประมาณ พ.ศ.`)
  out.push(`- fund_type: "ลงทุน" = งบลงทุนที่ตั้งในปีนั้น / "ผูกพัน" = งบผูกพันที่ยกมาจากปีก่อน`)
  out.push(`- budget = งบประมาณที่ได้รับ, target = เป้าหมายเบิกจ่าย, remain = คงเหลือ (budget − target),`)
  out.push(`  cut_transfer = ตัดโอน (รวมอยู่ในการคิดยอดเสมอ), under_budget = ต่ำกว่างบ`)
  out.push(`- แหล่งเงิน (source) มี 3 แหล่ง: เงินกู้ / เงินรายได้ กฟภ. / เงินสมทบผู้ใช้ไฟ`)
  out.push(`- ตาราง CSV: แถวแรกเป็นชื่อคอลัมน์ คั่นด้วย comma`)
  out.push(`- ส่วน "รายงานคำขอตั้ง" คือแบบฟอร์มเสนอขอตั้งงบประมาณ (แบบ งป.003/004/007/009) ของแต่ละงาน/แผนงาน`)
  out.push(`- คอลัมน์/บรรทัด "link" คือ URL ไปหน้านั้นในเว็บแอประบบงบประมาณ — เมื่อผู้ใช้ถามถึงโครงการหรือรายงานใด ให้แนบลิงก์นี้กลับไปในคำตอบด้วยเสมอ`)
  out.push(``)

  out.push(`## 1. โครงการทั้งหมด (${projects.length} โครงการ)`)
  out.push('```csv')
  out.push(csvRow(['project_code', 'item_no', 'name', 'division', 'department', 'group', 'project_type', 'start_year', 'link']))
  for (const p of projects) {
    out.push(csvRow([p.project_code, p.item_no, p.name, p.division, p.department, p.group_name, p.project_type, p.year, projectUrl(p.project_code)]))
  }
  out.push('```')
  out.push(``)

  out.push(`## 2. งบประมาณรายโครงการ แยกแหล่งเงิน/ปี (ล้านบาท)`)
  out.push('```csv')
  out.push(csvRow(['project_code', 'year', 'source', 'fund_type', 'budget', 'target', 'remain', 'cut_transfer', 'under_budget']))
  for (const p of projects) {
    for (const e of p.source_breakdown) {
      out.push(csvRow([p.project_code, e.year, e.source, e.fund_type, n(e.budget), n(e.target), n(e.remain), n(e.cut_transfer), n(e.under_budget)]))
    }
  }
  out.push('```')
  out.push(``)

  out.push(`## 3. งานย่อยรายโครงการ (sub jobs, ล้านบาท)`)
  out.push('```csv')
  out.push(csvRow(['project_code', 'sub_job', 'year', 'fund_type', 'budget', 'target', 'remain', 'cut_transfer', 'under_budget']))
  for (const p of projects) {
    for (const sj of p.sub_jobs) {
      out.push(csvRow([p.project_code, sj.name, sj.year, sj.fund_type, n(sj.budget), n(sj.target), n(sj.remain), n(sj.cut_transfer), n(sj.under_budget)]))
    }
  }
  out.push('```')
  out.push(``)

  out.push(`## 4. รายงานคำขอตั้ง (${reports.length} รายงาน)`)
  const groupName = new Map(groups.map(g => [g.id, g.name]))
  for (const r of reports) {
    out.push(``)
    out.push(reportMarkdown(r, groupName.get(r.groupId) ?? r.groupId))
  }
  out.push(``)

  return out.join('\n')
}

export function downloadText(filename: string, text: string) {
  // BOM so Windows apps (Notepad ฯลฯ) read the Thai text as UTF-8.
  const blob = new Blob(['﻿' + text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
