import type { CategorySummaryRow, FlatProject } from "./types"

const M = (n: number) => Number((n / 1_000_000).toFixed(3))

export async function exportCategoryExcel(
  categoryName: string,
  activeYears: number[],
  yearSummaries: Record<number, CategorySummaryRow[]>,
  projects: FlatProject[],
) {
  const XLSX = await import("xlsx")

  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Category Summary (code × year) ───────────────────────────────

  const allCodes = [...new Set(
    Object.values(yearSummaries).flatMap(rows => rows.map(r => r.code))
  )].sort()

  const summaryAoa: (string | number)[][] = []

  // Title rows
  summaryAoa.push([`Category: ${categoryName}`])
  summaryAoa.push([`Exported: ${new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}`])
  summaryAoa.push([`Values in millions (ล้านบาท)`])
  summaryAoa.push([])

  // Header
  const hdr: string[] = ["Code"]
  for (const y of activeYears) {
    hdr.push(`Budget ${y}`, `Target ${y}`, `Remain ${y}`)
  }
  summaryAoa.push(hdr)

  // One row per code
  for (const code of allCodes) {
    const row: (string | number)[] = [code]
    for (const y of activeYears) {
      const r = (yearSummaries[y] ?? []).find(r => r.code === code)
      row.push(r ? M(r.budget) : 0, r ? M(r.target) : 0, r ? M(r.remain) : 0)
    }
    summaryAoa.push(row)
  }

  // Totals row
  const totalsRow: (string | number)[] = ["Total"]
  for (const y of activeYears) {
    const rows = yearSummaries[y] ?? []
    totalsRow.push(
      M(rows.reduce((s, r) => s + r.budget, 0)),
      M(rows.reduce((s, r) => s + r.target, 0)),
      M(rows.reduce((s, r) => s + r.remain, 0)),
    )
  }
  summaryAoa.push(totalsRow)

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa)

  // Column widths
  summarySheet["!cols"] = [
    { wch: 12 },
    ...activeYears.flatMap(() => [{ wch: 16 }, { wch: 16 }, { wch: 16 }]),
  ]

  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

  // ── Sheet 2: Year-by-year % breakdown (mirrors chart) ────────────────────

  const pctAoa: (string | number)[][] = []
  pctAoa.push([`Category: ${categoryName} — Budget % by Code per Year`])
  pctAoa.push([])
  pctAoa.push(["Year", ...allCodes, "Total"])

  for (const y of activeYears) {
    const rows = yearSummaries[y] ?? []
    const total = rows.reduce((s, r) => s + r.budget, 0)
    const row: (string | number)[] = [y]
    for (const code of allCodes) {
      const r = rows.find(r => r.code === code)
      row.push(r && total > 0 ? Number(((r.budget / total) * 100).toFixed(1)) : 0)
    }
    row.push(100)
    pctAoa.push(row)
  }

  const pctSheet = XLSX.utils.aoa_to_sheet(pctAoa)
  pctSheet["!cols"] = [{ wch: 8 }, ...allCodes.map(() => ({ wch: 12 })), { wch: 8 }]
  XLSX.utils.book_append_sheet(wb, pctSheet, "% Breakdown")

  // ── Sheet 3: Project detail ───────────────────────────────────────────────

  const projAoa: (string | number | null)[][] = []

  const projHdr: string[] = [
    "#", "Code", "Name", "Division", "Type", "Start Year", "Source", "Fund Type",
    ...activeYears.flatMap(y => [`Budget ${y}`, `Target ${y}`, `Remain ${y}`]),
  ]
  projAoa.push(projHdr)

  const allSources = [...new Set(
    projects.flatMap(p => p.source_breakdown.map(e => e.source))
  )].sort()

  for (const p of projects) {
    const sourcesForProject = allSources.filter(src =>
      p.source_breakdown.some(e => e.source === src)
    )
    if (sourcesForProject.length === 0) {
      // row with no source data
      const row: (string | number | null)[] = [
        p.item_no ?? "", p.project_code, p.name, p.division ?? "", p.project_type, p.year, "", "",
        ...activeYears.flatMap(() => [0, 0, 0]),
      ]
      projAoa.push(row)
      continue
    }

    for (const src of sourcesForProject) {
      const fundTypes = [...new Set(
        p.source_breakdown.filter(e => e.source === src).map(e => e.fund_type)
      )]

      for (const ft of fundTypes) {
        const row: (string | number | null)[] = [
          p.item_no ?? "", p.project_code, p.name, p.division ?? "", p.project_type, p.year,
          src, ft,
        ]
        for (const y of activeYears) {
          const entries = p.source_breakdown.filter(
            e => e.year === y && e.source === src && e.fund_type === ft,
          )
          row.push(
            M(entries.reduce((s, e) => s + e.budget, 0)),
            M(entries.reduce((s, e) => s + e.target, 0)),
            M(entries.reduce((s, e) => s + e.remain, 0)),
          )
        }
        projAoa.push(row)
      }
    }
  }

  const projSheet = XLSX.utils.aoa_to_sheet(projAoa)
  projSheet["!cols"] = [
    { wch: 6 }, { wch: 14 }, { wch: 50 }, { wch: 14 }, { wch: 8 }, { wch: 10 },
    { wch: 20 }, { wch: 12 },
    ...activeYears.flatMap(() => [{ wch: 14 }, { wch: 14 }, { wch: 14 }]),
  ]
  projSheet["!freeze"] = { xSplit: 0, ySplit: 1 }

  XLSX.utils.book_append_sheet(wb, projSheet, "Projects")

  // ── Download ──────────────────────────────────────────────────────────────

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${categoryName}_${date}.xlsx`)
}
