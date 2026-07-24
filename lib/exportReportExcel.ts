import type { Report } from "./reportTypes"
import { THAI_MONTHS, DEFAULT_EQUIPMENT_GROUP, normDetails, durationYears } from "./reportTypes"

function workbookSafeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_")
}

// Report data stores amounts in ล้านบาท; the exported Excel is the real-baht exchange
// format (matches how a future import would read full baht figures back into the DB).
function toBaht(millionBaht: number) {
  return Math.round(millionBaht * 1_000_000)
}

export async function exportReportExcel(report: Report) {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  const data = report.data

  // ── Sheet 1: ข้อมูลทั่วไป (004/1 + 004/2) ──────────────────────────────────

  const infoAoa: (string | number)[][] = []
  infoAoa.push([data.projectName])
  infoAoa.push([`กอง: ${data.dept}   ฝ่าย: ${data.section}   ปีงบประมาณ: ${data.fiscalYear}   สถานะ: ${data.status}`])
  infoAoa.push([])
  infoAoa.push(["ข้อมูลพื้นฐาน (004/1)"])
  infoAoa.push(["แผนก", data.basicInfo.responsible.department])
  infoAoa.push(["กอง", data.basicInfo.responsible.division])
  infoAoa.push(["ฝ่าย", data.basicInfo.responsible.section])
  infoAoa.push(["สายงาน", data.basicInfo.responsible.unit])
  infoAoa.push(["เบอร์โทร", data.basicInfo.responsible.phone])
  infoAoa.push(["ความจำเป็น", data.basicInfo.necessity])
  infoAoa.push(["ประเภทการลงทุน", data.basicInfo.investmentType])
  infoAoa.push(["สถานภาพโครงการ", data.basicInfo.status])
  infoAoa.push(["พื้นที่", data.basicInfo.area])
  infoAoa.push(["ระยะเวลา (ปี)", durationYears(data.basicInfo.startYear, data.basicInfo.endYear)])
  infoAoa.push(["ปีเริ่ม - ปีสิ้นสุด", `${data.basicInfo.startYear}-${data.basicInfo.endYear}`])
  infoAoa.push(["วงเงินลงทุนรวม", toBaht(data.basicInfo.totalInvestment)])
  infoAoa.push(["วงเงินปีนี้", toBaht(data.basicInfo.yearInvestment)])
  infoAoa.push(["เป้าเบิกจ่าย", toBaht(data.basicInfo.disbursementTarget)])
  infoAoa.push(["งบทำการ", data.basicInfo.operatingBudget ?? ""])
  infoAoa.push(["วัตถุประสงค์", data.basicInfo.objectives.join(" | ")])
  infoAoa.push([])
  infoAoa.push(["ผลประโยชน์และผลกระทบ (004/2)"])
  infoAoa.push(["Output (เมื่อเสร็จสิ้น)", data.benefits.outputAfterCompletion])
  infoAoa.push(["Outcome (เมื่อเสร็จสิ้น)", data.benefits.outcomeAfterCompletion])
  infoAoa.push(["Output ปีนี้", data.benefits.outputThisYear])
  infoAoa.push(["Outcome ปีนี้", data.benefits.outcomeThisYear])
  infoAoa.push([
    "ก่อให้เกิดประโยชน์",
    [
      data.benefits.benefitIncreaseRevenue ? "เพิ่มรายได้" : null,
      data.benefits.benefitReduceCost ? "ลดค่าใช้จ่าย" : null,
      data.benefits.benefitOther || null,
    ].filter(Boolean).join(", "),
  ])
  infoAoa.push(["ผลกระทบต่อองค์กร", data.benefits.orgImpact])
  infoAoa.push(["ผลกระทบต่อชุมชน", data.benefits.communityImpact])
  infoAoa.push(["หากไม่ได้รับอนุมัติ", data.benefits.ifNotApprovedImpact])
  infoAoa.push(["ปัญหาอุปสรรค", data.benefits.problemsObstacles])

  const infoSheet = XLSX.utils.aoa_to_sheet(infoAoa)
  infoSheet["!cols"] = [{ wch: 22 }, { wch: 80 }]
  XLSX.utils.book_append_sheet(wb, infoSheet, "ข้อมูลทั่วไป")

  // ── Sheet 2: งบประมาณ (004/4) ──────────────────────────────────────────────

  const budgetYears = Array.from(
    new Set([
      ...data.budget.categories.flatMap(c => c.disbursementByYear.map(d => d.year)),
      ...data.budget.reserveByYear.map(d => d.year),
    ]),
  ).sort((a, b) => a - b)

  const budgetAoa: (string | number)[][] = []
  budgetAoa.push([
    "หมวด / รายการ",
    `วงเงิน ${data.fiscalYear}`,
    ...budgetYears.map(y => `เบิกจ่าย ${y}`),
  ])
  for (const cat of data.budget.categories) {
    budgetAoa.push([
      cat.name,
      toBaht(cat.yearAmount),
      ...budgetYears.map(y => toBaht(cat.disbursementByYear.find(d => d.year === y)?.amount ?? 0)),
    ])
  }
  if (data.budget.reserve > 0) {
    budgetAoa.push([
      "สำรองค่าปรับราคา",
      toBaht(data.budget.reserve),
      ...budgetYears.map(y => toBaht(data.budget.reserveByYear.find(d => d.year === y)?.amount ?? 0)),
    ])
  }
  const budgetTotal = data.budget.categories.reduce((s, c) => s + c.yearAmount, 0) + data.budget.reserve
  budgetAoa.push([
    "รวมทั้งสิ้น",
    toBaht(budgetTotal),
    ...budgetYears.map(y =>
      toBaht(data.budget.categories.reduce((s, c) => s + (c.disbursementByYear.find(d => d.year === y)?.amount ?? 0), 0)
      + (data.budget.reserveByYear.find(d => d.year === y)?.amount ?? 0))
    ),
  ])

  const budgetSheet = XLSX.utils.aoa_to_sheet(budgetAoa)
  budgetSheet["!cols"] = [{ wch: 40 }, { wch: 16 }, ...budgetYears.map(() => ({ wch: 16 }))]
  XLSX.utils.book_append_sheet(wb, budgetSheet, "งบประมาณ")

  // ── Sheet 3: วัสดุอุปกรณ์ (007) — one table per year ───────────────────────

  const equipAoa: (string | number)[][] = []
  for (const yearData of data.equipment) {
    equipAoa.push([`ปี ${yearData.year}`])

    // Group items into their own table when tagged (e.g. ค่าใช้จ่ายหน้างาน/ค่าจ้าง);
    // untagged items form the main table.
    const buckets: { name?: string; items: typeof yearData.items }[] = []
    for (const item of yearData.items) {
      let bucket = buckets.find(b => b.name === item.group)
      if (!bucket) { bucket = { name: item.group, items: [] }; buckets.push(bucket) }
      bucket.items.push(item)
    }

    let grandTotal = 0
    for (const bucket of buckets) {
      equipAoa.push([bucket.name ?? DEFAULT_EQUIPMENT_GROUP])
      equipAoa.push(["#", "รายการ", "จำนวน", "หน่วย", "ราคา/หน่วย", "รวม", "แหล่งราคา", "กำหนดจ่าย"])
      let subtotal = 0
      for (const item of bucket.items) {
        const description = [item.description, ...item.details.map(d => `– ${d}`)].join("\n")
        const amount = item.cancelled ? 0 : item.totalAmount
        subtotal += amount
        equipAoa.push([
          item.no,
          item.cancelled ? `(ยกเลิก) ${description}` : description,
          item.qty,
          item.unit,
          item.unitPrice,
          toBaht(amount),
          item.priceSource,
          item.paymentNote,
        ])
      }
      grandTotal += subtotal
      equipAoa.push(["", "", "", "", buckets.length > 1 ? "รวมย่อย" : "รวมทั้งสิ้น", toBaht(subtotal), "", `${bucket.items.length} รายการ`])
      equipAoa.push([])
    }
    if (buckets.length > 1) {
      equipAoa.push(["", "", "", "", "รวมทั้งสิ้นทุกตาราง", toBaht(grandTotal), "", `${yearData.items.length} รายการ`])
      equipAoa.push([])
    }
  }

  const equipSheet = XLSX.utils.aoa_to_sheet(equipAoa)
  equipSheet["!cols"] = [{ wch: 5 }, { wch: 50 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, equipSheet, "วัสดุอุปกรณ์")

  // ── Sheet 4: แผนจัดซื้อ/จัดจ้าง (009) — one table per year ─────────────────

  const procAoa: (string | number)[][] = []
  for (const plan of data.procurements) {
    procAoa.push([`ปี ${plan.fiscalYear}`])
    procAoa.push(["กิจกรรม", ...THAI_MONTHS])
    for (const activity of plan.activities) {
      procAoa.push([
        activity.name,
        ...activity.months.map(m => {
          if (!m.active) return ""
          return m.amount != null ? toBaht(m.amount) : "✓"
        }),
      ])
      for (const d of normDetails(activity.details)) {
        procAoa.push([
          `   – ${d.name}`,
          ...d.months.map(m => {
            if (!m.active) return ""
            return m.amount != null ? toBaht(m.amount) : "✓"
          }),
        ])
      }
    }
    procAoa.push([])
  }

  const procSheet = XLSX.utils.aoa_to_sheet(procAoa)
  procSheet["!cols"] = [{ wch: 24 }, ...THAI_MONTHS.map(() => ({ wch: 8 }))]
  XLSX.utils.book_append_sheet(wb, procSheet, "แผนจัดซื้อจัดจ้าง")

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${workbookSafeName(data.projectName)}_${date}.xlsx`)
}
