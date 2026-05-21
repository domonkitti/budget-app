"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api } from "@/lib/api"
import type { ProjectDiff, ProjectDetail } from "@/lib/types"

// ── Styles ────────────────────────────────────────────────────────────────────
const border = "0.5px solid #E5E7EB"
const th = (extra?: React.CSSProperties): React.CSSProperties => ({
  border, padding: "5px 10px", background: "#F9FAFB", color: "#6B7280",
  fontWeight: 600, fontSize: 11, textAlign: "center", whiteSpace: "nowrap", ...extra,
})
const td = (extra?: React.CSSProperties): React.CSSProperties => ({
  border, padding: "4px 8px", fontSize: 12, color: "#374151", ...extra,
})

const COL_GROUPS = [
  { label: "งบเงินดำเนินการ",     field: "budget"       as const, cols: 3, bg: "rgba(96,165,250,0.15)",  sub: "rgba(96,165,250,0.08)"  },
  { label: "เป้าหมายการเบิกจ่าย", field: "target"       as const, cols: 3, bg: "rgba(52,211,153,0.15)",  sub: "rgba(52,211,153,0.08)"  },
  { label: "คงเหลือ",              field: "remain"       as const, cols: 3, bg: "rgba(156,163,175,0.15)", sub: "rgba(156,163,175,0.08)" },
  { label: "ตัดทิ้ง",             field: "cut_transfer" as const, cols: 1, bg: "rgba(251,146,60,0.15)",  sub: "rgba(251,146,60,0.08)"  },
  { label: "ต่ำกว่างบ",           field: "under_budget" as const, cols: 1, bg: "rgba(167,139,250,0.15)", sub: "rgba(167,139,250,0.08)" },
]
const COLS_PER_YEAR = COL_GROUPS.reduce((s, g) => s + g.cols, 0)

const fieldLabel: Record<string, string> = {
  name: "ชื่อโครงการ", division: "ฝ่าย", department: "แผนก", group_name: "หมวด",
}

// ── Data helpers ──────────────────────────────────────────────────────────────
const VIRTUAL_SJ = "งานรวม"

type NumField = "budget" | "target" | "cut_transfer" | "under_budget"
type Row = { name: string; fund_type: string; data_year: number } & Record<NumField, number | null>
type YearSlot = { committed: Row | null; invest: Row | null }
type Groups = Map<string, Map<number, YearSlot>>

const nullRow = (name: string, fund_type: string, data_year: number): Row =>
  ({ name, fund_type, data_year, budget: null, target: null, cut_transfer: null, under_budget: null })

function bsTotals(project: ProjectDetail): Row[] {
  const totals = new Map<string, Record<NumField, number>>()
  for (const bs of project.budget_sources) {
    if (bs.fund_type !== "ผูกพัน" && bs.fund_type !== "ลงทุน") continue
    const k = `${bs.data_year}|${bs.fund_type}`
    const e = totals.get(k) ?? { budget: 0, target: 0, cut_transfer: 0, under_budget: 0 }
    e.budget += bs.budget
    e.target += bs.target
    e.cut_transfer += bs.cut_transfer
    e.under_budget += bs.under_budget
    totals.set(k, e)
  }
  return [...totals.entries()].map(([k, v]) => {
    const [yr, ft] = k.split("|")
    return { name: VIRTUAL_SJ, fund_type: ft, data_year: Number(yr), ...v }
  })
}

function buildOldRows(project: ProjectDetail, diff: ProjectDiff): Row[] {
  const rows: Row[] = project.sub_jobs.length === 0
    ? bsTotals(project)
    : project.sub_jobs
        .filter(sj => sj.fund_type === "ผูกพัน" || sj.fund_type === "ลงทุน")
        .map(sj => ({ name: sj.name, fund_type: sj.fund_type, data_year: sj.data_year, budget: sj.budget, target: sj.target, cut_transfer: sj.cut_transfer, under_budget: sj.under_budget }))
  for (const d of diff.sub_job_diffs) {
    if (d.change !== "added") continue
    if (!rows.find(r => r.name === d.name && r.fund_type === d.fund_type && r.data_year === d.data_year))
      rows.push(nullRow(d.name, d.fund_type, d.data_year))
  }
  return rows
}

function buildNewRows(project: ProjectDetail, diff: ProjectDiff): Row[] {
  const base: Row[] = project.sub_jobs.length === 0
    ? bsTotals(project)
    : project.sub_jobs
        .filter(sj => sj.fund_type === "ผูกพัน" || sj.fund_type === "ลงทุน")
        .map(sj => ({ name: sj.name, fund_type: sj.fund_type, data_year: sj.data_year, budget: sj.budget, target: sj.target, cut_transfer: sj.cut_transfer, under_budget: sj.under_budget }))

  const rows: Row[] = []
  const handled = new Set<string>()
  for (const r of base) {
    handled.add(`${r.name}|${r.fund_type}|${r.data_year}`)
    const d = diff.sub_job_diffs.find(x => x.name === r.name && x.fund_type === r.fund_type && x.data_year === r.data_year)
    if (d?.change === "removed") { rows.push(nullRow(r.name, r.fund_type, r.data_year)); continue }
    const pv = (field: NumField) => d?.diffs?.find(x => x.field === field)?.po_value as number | undefined
    rows.push({
      ...r,
      budget:       pv("budget")       ?? r.budget,
      target:       pv("target")       ?? r.target,
      cut_transfer: pv("cut_transfer") ?? r.cut_transfer,
      under_budget: pv("under_budget") ?? r.under_budget,
    })
  }
  for (const d of diff.sub_job_diffs) {
    if (d.change !== "added") continue
    if (handled.has(`${d.name}|${d.fund_type}|${d.data_year}`)) continue
    const pv = (field: NumField) => d.diffs?.find(x => x.field === field)?.po_value as number | null ?? null
    rows.push({ name: d.name, fund_type: d.fund_type, data_year: d.data_year, budget: pv("budget"), target: pv("target"), cut_transfer: pv("cut_transfer"), under_budget: pv("under_budget") })
  }
  return rows
}

function groupRows(rows: Row[]): { groups: Groups; allYears: number[] } {
  const groups: Groups = new Map()
  const yearsSet = new Set<number>()
  for (const r of rows) {
    if (!groups.has(r.name)) groups.set(r.name, new Map())
    const g = groups.get(r.name)!
    if (!g.has(r.data_year)) g.set(r.data_year, { committed: null, invest: null })
    const slot = g.get(r.data_year)!
    if (r.fund_type === "ผูกพัน") slot.committed = r
    else if (r.fund_type === "ลงทุน") slot.invest = r
    yearsSet.add(r.data_year)
  }
  return { groups, allYears: [...yearsSet].sort() }
}

function fmt3(v: number | null): string {
  if (v == null) return "—"
  return v.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function sumOf(a: number | null, b: number | null): number | null {
  return (a != null || b != null) ? (a ?? 0) + (b ?? 0) : null
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ImportDiffPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [diff, setDiff] = useState<ProjectDiff | null>(null)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  const oldRef = useRef<HTMLDivElement>(null)
  const newRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  function onOldScroll(e: React.UIEvent<HTMLDivElement>) {
    if (syncing.current) return; syncing.current = true
    if (newRef.current) newRef.current.scrollLeft = e.currentTarget.scrollLeft
    syncing.current = false
  }
  function onNewScroll(e: React.UIEvent<HTMLDivElement>) {
    if (syncing.current) return; syncing.current = true
    if (oldRef.current) oldRef.current.scrollLeft = e.currentTarget.scrollLeft
    syncing.current = false
  }

  useEffect(() => {
    Promise.all([api.importDiff(code), api.projectDetail(code).catch(() => null)])
      .then(([d, p]) => { setDiff(d); setProject(p) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [code])

  async function handleAccept() {
    setAccepting(true)
    try { await api.importAccept(code); router.push("/import") }
    catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); setAccepting(false) }
  }

  if (loading) return <div className="p-8 text-gray-500">กำลังโหลด...</div>
  if (error) return <div className="p-8 text-red-600">เกิดข้อผิดพลาด: {error}</div>
  if (!diff) return null

  const nameDiff = diff.project_diffs.find(d => d.field === "name")
  const currentName = project?.name ?? (nameDiff ? String(nameDiff.bg_value) : code)
  const otherDiffs = diff.project_diffs.filter(d => d.field !== "name")

  const oldRows = project ? buildOldRows(project, diff) : []
  const newRows = project
    ? buildNewRows(project, diff)
    : diff.sub_job_diffs
        .filter(d => d.change === "added")
        .map(d => {
          const pv = (field: NumField) => d.diffs?.find(x => x.field === field)?.po_value as number | null ?? null
          return { name: d.name, fund_type: d.fund_type, data_year: d.data_year, budget: pv("budget"), target: pv("target"), cut_transfer: pv("cut_transfer"), under_budget: pv("under_budget") }
        })
  const { groups: oldGroups } = groupRows(oldRows)
  const { groups: newGroups, allYears: newYears } = groupRows(newRows)
  const bgAllYears = project ? [...new Set([
    ...project.sub_jobs.map(s => s.data_year),
    ...project.budget_sources.map(s => s.data_year),
  ])].sort() : []
  const allYears = [...new Set([...bgAllYears, ...newYears])].sort()

  const noSubJobs = project ? project.sub_jobs.length === 0 : false
  const bgNames = project
    ? noSubJobs
      ? (project.budget_sources.length > 0 ? [VIRTUAL_SJ] : [])
      : [...new Set(project.sub_jobs.map(s => s.name))]
    : []
  const addedNames = diff.sub_job_diffs.filter(d => d.change === "added" && !bgNames.includes(d.name)).map(d => d.name)
  const allNames = [...new Set([...bgNames, ...addedNames])]

  const changedCells = new Set<string>()
  for (const d of diff.sub_job_diffs) {
    const key = `${d.name}|${d.data_year}|${d.fund_type}`
    if (d.change === "added" || d.change === "removed") {
      for (const f of ["budget", "target", "cut_transfer", "under_budget"])
        changedCells.add(`${key}|${f}`)
    } else if (d.change === "modified") {
      for (const fd of d.diffs ?? []) changedCells.add(`${key}|${fd.field}`)
    }
  }

  function changeOf(name: string, year: number, fund_type: string) {
    return diff!.sub_job_diffs.find(d => d.name === name && d.data_year === year && d.fund_type === fund_type)?.change
  }

  // ── Table header (shared) ────────────────────────────────────────────────
  function TableHeader() {
    return (
      <thead>
        <tr>
          <th style={th({ width: 200, minWidth: 200, position: "sticky", left: 0, zIndex: 3, textAlign: "left" })} rowSpan={3}>ชื่องาน</th>
          {allYears.map(yr => <th key={yr} colSpan={COLS_PER_YEAR} style={th({ background: "#F3F4F6", borderBottom: "none" })}>ปี {yr}</th>)}
        </tr>
        <tr>
          {allYears.map(yr => (
            <Fragment key={yr}>
              {COL_GROUPS.map(g => <th key={g.label} colSpan={g.cols} style={th({ background: g.bg, borderBottom: "none" })}>{g.label}</th>)}
            </Fragment>
          ))}
        </tr>
        <tr>
          {allYears.map(yr => (
            <Fragment key={yr}>
              {COL_GROUPS.map(g => (
                <Fragment key={g.label}>
                  {g.cols === 3
                    ? ["ผูกพัน", "ลงทุน", "รวม"].map(lbl => <th key={lbl} style={th({ minWidth: 110, background: g.sub })}>{lbl}</th>)
                    : <th style={th({ minWidth: 110, background: g.sub })}>รวม</th>
                  }
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tr>
      </thead>
    )
  }

  // ── Table body ───────────────────────────────────────────────────────────
  function TableBody({ groups, side }: { groups: Groups; side: "old" | "new" }) {
    const neg = (v: number | null) => v != null && v < 0 ? { color: "#DC2626" } : {}

    return (
      <tbody>
        {allNames.map(name => {
          const sjDiffs = diff!.sub_job_diffs.filter(d => d.name === name)
          const allAdded   = sjDiffs.length > 0 && sjDiffs.every(d => d.change === "added")
          const allRemoved = sjDiffs.length > 0 && sjDiffs.every(d => d.change === "removed")
          const rowBg  = side === "new" ? (allAdded ? "#F0FDF4" : allRemoved ? "#FEF2F2" : "") : (allAdded ? "#F9FAFB" : "")
          const nameColor = side === "new"
            ? (allAdded ? "#16A34A" : allRemoved ? "#DC2626" : "#374151")
            : (allAdded ? "#9CA3AF" : "#374151")

          return (
            <tr key={name} style={{ background: rowBg || "#fff" }}>
              <td style={td({ fontWeight: 500, position: "sticky", left: 0, zIndex: 1, background: rowBg || "#fff", width: 200, maxWidth: 200, whiteSpace: "normal", wordBreak: "break-word", color: nameColor })}>
                {name}
              </td>
              {allYears.map(yr => {
                const slot = groups.get(name)?.get(yr)
                const c = slot?.committed ?? null
                const inv = slot?.invest ?? null
                const chg = side === "new" ? changeOf(name, yr, "ผูกพัน") ?? changeOf(name, yr, "ลงทุน") : undefined

                function numCell(row: Row | null, field: NumField, fundType: string) {
                  const changed = side === "new" && changedCells.has(`${name}|${yr}|${fundType}|${field}`)
                  const chgLocal = side === "new" ? changeOf(name, yr, fundType) : undefined
                  const bg = changed ? "#FEF9C3" : rowBg
                  const color = chgLocal === "added" ? "#16A34A" : chgLocal === "removed" ? "#9CA3AF" : changed ? "#92400E" : "#374151"
                  const val = row?.[field] ?? null
                  return (
                    <td key={`${name}-${yr}-${fundType}-${field}`} style={td({ textAlign: "right", fontFamily: "monospace", background: bg, color, fontWeight: changed ? 700 : undefined, ...neg(val) })}>
                      {fmt3(val)}
                    </td>
                  )
                }

                function sumCell(val: number | null, changed: boolean) {
                  return (
                    <td style={td({ textAlign: "right", fontFamily: "monospace", background: changed ? "#FEF9C3" : rowBg || "#F9FAFB", color: chg === "added" ? "#16A34A" : chg === "removed" ? "#9CA3AF" : changed ? "#92400E" : "#374151", fontWeight: changed ? 700 : undefined, ...neg(val) })}>
                      {fmt3(val)}
                    </td>
                  )
                }

                // budget
                const tBudget = sumOf(c?.budget ?? null, inv?.budget ?? null)
                const sumBgCh = side === "new" && (changedCells.has(`${name}|${yr}|ผูกพัน|budget`) || changedCells.has(`${name}|${yr}|ลงทุน|budget`))
                // target
                const tTarget = sumOf(c?.target ?? null, inv?.target ?? null)
                const sumTgCh = side === "new" && (changedCells.has(`${name}|${yr}|ผูกพัน|target`) || changedCells.has(`${name}|${yr}|ลงทุน|target`))
                // remain
                const cRemain = c != null ? (c.budget ?? 0) - (c.target ?? 0) : null
                const iRemain = inv != null ? (inv.budget ?? 0) - (inv.target ?? 0) : null
                const tRemain = tBudget != null || tTarget != null ? (tBudget ?? 0) - (tTarget ?? 0) : null
                const sumRmCh = sumBgCh || sumTgCh
                // cut_transfer
                const tCT = sumOf(c?.cut_transfer ?? null, inv?.cut_transfer ?? null)
                const sumCtCh = side === "new" && (changedCells.has(`${name}|${yr}|ผูกพัน|cut_transfer`) || changedCells.has(`${name}|${yr}|ลงทุน|cut_transfer`))
                // under_budget
                const tUB = sumOf(c?.under_budget ?? null, inv?.under_budget ?? null)
                const sumUbCh = side === "new" && (changedCells.has(`${name}|${yr}|ผูกพัน|under_budget`) || changedCells.has(`${name}|${yr}|ลงทุน|under_budget`))

                return (
                  <Fragment key={yr}>
                    {numCell(c, "budget", "ผูกพัน")}
                    {numCell(inv, "budget", "ลงทุน")}
                    {sumCell(tBudget, sumBgCh)}
                    {numCell(c, "target", "ผูกพัน")}
                    {numCell(inv, "target", "ลงทุน")}
                    {sumCell(tTarget, sumTgCh)}
                    <td style={td({ textAlign: "right", fontFamily: "monospace", background: sumRmCh ? "#FEF9C3" : rowBg || "#F9FAFB", ...neg(cRemain) })}>{fmt3(cRemain)}</td>
                    <td style={td({ textAlign: "right", fontFamily: "monospace", background: sumRmCh ? "#FEF9C3" : rowBg || "#F9FAFB", ...neg(iRemain) })}>{fmt3(iRemain)}</td>
                    <td style={td({ textAlign: "right", fontFamily: "monospace", background: sumRmCh ? "#FEF9C3" : rowBg || "#F9FAFB", ...neg(tRemain) })}>{fmt3(tRemain)}</td>
                    {sumCell(tCT, sumCtCh)}
                    {sumCell(tUB, sumUbCh)}
                  </Fragment>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-full mx-auto">
      <Link href="/import" className="text-sm text-gray-500 hover:underline mb-4 inline-block">← กลับ</Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">{currentName}</h1>
          {nameDiff && (
            <div className="mt-1 text-sm">
              <span className="text-gray-400">ชื่อใหม่: </span>
              <span className="text-green-700 font-medium">{String(nameDiff.po_value)}</span>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1 font-mono">{code} · PO v{diff.po_version}</p>
        </div>
        {diff.has_changes ? (
          <button onClick={handleAccept} disabled={accepting}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
            {accepting ? "กำลังบันทึก..." : "รับการเปลี่ยนแปลง"}
          </button>
        ) : (
          <span className="text-sm text-gray-400 bg-gray-50 border rounded-lg px-3 py-2">ไม่มีการเปลี่ยนแปลง</span>
        )}
      </div>

      {/* Other field diffs */}
      {otherDiffs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">ข้อมูลทั่วไป</h2>
          <div className="rounded-lg overflow-hidden" style={{ border }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th({ textAlign: "left" })}>รายการ</th>
                <th style={th()}>ข้อมูลเดิม</th>
                <th style={th()}>ข้อมูลใหม่ (PO)</th>
              </tr></thead>
              <tbody>
                {otherDiffs.map((d, i) => (
                  <tr key={i}>
                    <td style={td()}>{fieldLabel[d.field] ?? d.field}</td>
                    <td style={td({ textAlign: "center", color: "#DC2626" })}>{String(d.bg_value ?? "—")}</td>
                    <td style={td({ textAlign: "center", color: "#16A34A", fontWeight: 600 })}>{String(d.po_value ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Dual synced tables */}
      {allNames.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500">รายการงาน</h2>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: "#FEF9C3" }} /> เปลี่ยนแปลง</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-100" /> เพิ่มใหม่</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100" /> ลบออก</span>
            </div>
          </div>

          <p className="text-xs font-medium text-gray-400 mb-1">ข้อมูลเดิม (BG)</p>
          <div ref={oldRef} onScroll={onOldScroll} className="overflow-x-auto rounded-lg border border-gray-200 mb-3">
            <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
              <TableHeader />
              <TableBody groups={oldGroups} side="old" />
            </table>
          </div>

          <p className="text-xs font-medium text-blue-500 mb-1">ข้อมูลใหม่ (PO)</p>
          <div ref={newRef} onScroll={onNewScroll} className="overflow-x-auto rounded-lg border border-blue-200">
            <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
              <TableHeader />
              <TableBody groups={newGroups} side="new" />
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
