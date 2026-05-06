import type { CategorySummaryRow, FlatProject } from "./types"

const M = (n: number) => Number((n / 1_000_000).toFixed(3))

function projectMetric(
  project: FlatProject,
  year: number,
  metric: "budget" | "target" | "remain",
) {
  return project.source_breakdown
    .filter((entry) => entry.year === year)
    .reduce((sum, entry) => sum + entry[metric], 0)
}

function workbookSafeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_")
}

export async function exportDashboardExcel(
  label: string,
  activeYears: number[],
  projects: FlatProject[],
) {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()
  const years =
    activeYears.length > 0
      ? activeYears
      : [...new Set(projects.flatMap((p) => p.source_breakdown.map((e) => e.year)))].sort()

  const summaryAoa: (string | number | null)[][] = []
  summaryAoa.push([label])
  summaryAoa.push([`Exported: ${new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}`])
  summaryAoa.push([`Values in millions (ล้านบาท)`])
  summaryAoa.push([])
  summaryAoa.push([
    "#",
    "Code",
    "Name",
    "Division",
    "Type",
    "Start Year",
    ...years.flatMap((year) => [`Budget ${year}`, `Target ${year}`, `Remain ${year}`]),
  ])

  for (const project of projects) {
    summaryAoa.push([
      project.item_no ?? "",
      project.project_code,
      project.name,
      project.division ?? "",
      project.project_type,
      project.year,
      ...years.flatMap((year) => [
        M(projectMetric(project, year, "budget")),
        M(projectMetric(project, year, "target")),
        M(projectMetric(project, year, "remain")),
      ]),
    ])
  }

  summaryAoa.push([
    "",
    "",
    "Total",
    "",
    "",
    "",
    ...years.flatMap((year) => [
      M(projects.reduce((sum, p) => sum + projectMetric(p, year, "budget"), 0)),
      M(projects.reduce((sum, p) => sum + projectMetric(p, year, "target"), 0)),
      M(projects.reduce((sum, p) => sum + projectMetric(p, year, "remain"), 0)),
    ]),
  ])

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryAoa)
  summarySheet["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 50 },
    { wch: 14 },
    { wch: 8 },
    { wch: 10 },
    ...years.flatMap(() => [{ wch: 14 }, { wch: 14 }, { wch: 14 }]),
  ]
  summarySheet["!freeze"] = { xSplit: 0, ySplit: 5 }
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

  const detailAoa: (string | number | null)[][] = []
  detailAoa.push([
    "#",
    "Code",
    "Name",
    "Division",
    "Type",
    "Start Year",
    "Source",
    "Fund Type",
    ...years.flatMap((year) => [`Budget ${year}`, `Target ${year}`, `Remain ${year}`]),
  ])

  for (const project of projects) {
    const sourceFundPairs = [
      ...new Set(project.source_breakdown.map((entry) => `${entry.source}\u0000${entry.fund_type}`)),
    ].sort()

    if (sourceFundPairs.length === 0) {
      detailAoa.push([
        project.item_no ?? "",
        project.project_code,
        project.name,
        project.division ?? "",
        project.project_type,
        project.year,
        "",
        "",
        ...years.flatMap(() => [0, 0, 0]),
      ])
      continue
    }

    for (const pair of sourceFundPairs) {
      const [source, fundType] = pair.split("\u0000")
      detailAoa.push([
        project.item_no ?? "",
        project.project_code,
        project.name,
        project.division ?? "",
        project.project_type,
        project.year,
        source,
        fundType,
        ...years.flatMap((year) => {
          const entries = project.source_breakdown.filter(
            (entry) =>
              entry.year === year &&
              entry.source === source &&
              entry.fund_type === fundType,
          )
          return [
            M(entries.reduce((sum, entry) => sum + entry.budget, 0)),
            M(entries.reduce((sum, entry) => sum + entry.target, 0)),
            M(entries.reduce((sum, entry) => sum + entry.remain, 0)),
          ]
        }),
      ])
    }
  }

  const detailSheet = XLSX.utils.aoa_to_sheet(detailAoa)
  detailSheet["!cols"] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 50 },
    { wch: 14 },
    { wch: 8 },
    { wch: 10 },
    { wch: 20 },
    { wch: 12 },
    ...years.flatMap(() => [{ wch: 14 }, { wch: 14 }, { wch: 14 }]),
  ]
  detailSheet["!freeze"] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, detailSheet, "Project Details")

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${workbookSafeName(label)}_${date}.xlsx`)
}

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
