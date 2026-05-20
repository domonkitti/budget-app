"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api } from "@/lib/api"
import type { ProjectDiff, ProjectDetail } from "@/lib/types"

// ── Styles (copied from edit page) ───────────────────────────────────────────
const border = "0.5px solid #E5E7EB"
const th = (extra?: React.CSSProperties): React.CSSProperties => ({
  border, padding: "5px 10px", background: "#F9FAFB", color: "#6B7280",
  fontWeight: 600, fontSize: 11, textAlign: "center", whiteSpace: "nowrap", ...extra,
})
const td = (extra?: React.CSSProperties): React.CSSProperties => ({
  border, padding: "4px 8px", fontSize: 12, color: "#374151", ...extra,
})

const COL_GROUPS = [
  { label: "งบเงินดำเนินการ",     field: "budget" as const, bg: "rgba(96,165,250,0.15)", sub: "rgba(96,165,250,0.08)" },
  { label: "เป้าหมายการเบิกจ่าย", field: "target" as const, bg: "rgba(52,211,153,0.15)", sub: "rgba(52,211,153,0.08)" },
]

const fieldLabel: Record<string, string> = {
  name: "ชื่อโครงการ", division: "ฝ่าย", department: "แผนก", group_name: "หมวด",
}

// ── Data helpers ──────────────────────────────────────────────────────────────
type Row = { name: string; fund_type: string; data_year: number; budget: number | null; target: number | null }
type YearSlot = { committed: Row | null; invest: Row | null }
type Groups = Map<string, Map<number, YearSlot>>

function buildOldRows(project: ProjectDetail, diff: ProjectDiff): Row[] {
  const rows: Row[] = project.sub_jobs
    .filter(sj => sj.fund_type === "ผูกพัน" || sj.fund_type === "ลงทุน")
    .map(sj => ({ name: sj.name, fund_type: sj.fund_type, data_year: sj.data_year, budget: sj.budget, target: sj.target }))
  // Placeholder for added rows so OLD table has matching rows
  for (const d of diff.sub_job_diffs) {
    if (d.change !== "added") continue
    if (!rows.find(r => r.name === d.name && r.fund_type === d.fund_type && r.data_year === d.data_year))
      rows.push({ name: d.name, fund_type: d.fund_type, data_year: d.data_year, budget: null, target: null })
  }
  return rows
}

function buildNewRows(project: ProjectDetail, diff: ProjectDiff): Row[] {
  const rows: Row[] = []
  for (const sj of project.sub_jobs) {
    if (sj.fund_type !== "ผูกพัน" && sj.fund_type !== "ลงทุน") continue
    const d = diff.sub_job_diffs.find(x => x.name === sj.name && x.fund_type === sj.fund_type && x.data_year === sj.data_year)
    if (d?.change === "removed") { rows.push({ name: sj.name, fund_type: sj.fund_type, data_year: sj.data_year, budget: null, target: null }); continue }
    const bd = d?.diffs?.find(x => x.field === "budget")
    const td_ = d?.diffs?.find(x => x.field === "target")
    rows.push({ name: sj.name, fund_type: sj.fund_type, data_year: sj.data_year, budget: bd ? (bd.po_value as number) : sj.budget, target: td_ ? (td_.po_value as number) : sj.target })
  }
  for (const d of diff.sub_job_diffs) {
    if (d.change !== "added") continue
    const bd = d.diffs?.find(x => x.field === "budget")
    const td_ = d.diffs?.find(x => x.field === "target")
    rows.push({ name: d.name, fund_type: d.fund_type, data_year: d.data_year, budget: (bd?.po_value as number) ?? null, target: (td_?.po_value as number) ?? null })
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
  const newRows = project ? buildNewRows(project, diff) : []
  const { groups: oldGroups } = groupRows(oldRows)
  const { groups: newGroups, allYears: newYears } = groupRows(newRows)
  // Always use all BG years as the base so every year the project has shows up
  const bgAllYears = project ? [...new Set(project.sub_jobs.map(s => s.data_year))].sort() : []
  const allYears = [...new Set([...bgAllYears, ...newYears])].sort()

  // Preserve BG name order, add new at the end
  const bgNames = project ? [...new Set(project.sub_jobs.map(s => s.name))] : []
  const addedNames = diff.sub_job_diffs.filter(d => d.change === "added" && !bgNames.includes(d.name)).map(d => d.name)
  const allNames = [...new Set([...bgNames, ...addedNames])]

  // Changed cells set for highlight
  const changedCells = new Set<string>()
  for (const d of diff.sub_job_diffs) {
    if (d.change === "added" || d.change === "removed") {
      changedCells.add(`${d.name}|${d.data_year}|${d.fund_type}|budget`)
      changedCells.add(`${d.name}|${d.data_year}|${d.fund_type}|target`)
    } else if (d.change === "modified") {
      for (const fd of d.diffs ?? []) changedCells.add(`${d.name}|${d.data_year}|${d.fund_type}|${fd.field}`)
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
          {allYears.map(yr => <th key={yr} colSpan={6} style={th({ background: "#F3F4F6", borderBottom: "none" })}>ปี {yr}</th>)}
        </tr>
        <tr>
          {allYears.map(yr => (
            <Fragment key={yr}>
              {COL_GROUPS.map(g => <th key={g.label} colSpan={3} style={th({ background: g.bg, borderBottom: "none" })}>{g.label}</th>)}
            </Fragment>
          ))}
        </tr>
        <tr>
          {allYears.map(yr => (
            <Fragment key={yr}>
              {COL_GROUPS.map(g => (
                <Fragment key={g.label}>
                  {["ผูกพัน", "ลงทุน", "รวม"].map(lbl => <th key={lbl} style={th({ minWidth: 110, background: g.sub })}>{lbl}</th>)}
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
    const neg = (v: number) => v < 0 ? { color: "#DC2626" } : {}

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

                function numCell(row: Row | null, field: "budget" | "target", fundType: string) {
                  const changed = side === "new" && changedCells.has(`${name}|${yr}|${fundType}|${field}`)
                  const chg = side === "new" ? changeOf(name, yr, fundType) : undefined
                  const bg = changed ? "#FEF9C3" : rowBg
                  const color = chg === "added" ? "#16A34A" : chg === "removed" ? "#9CA3AF" : changed ? "#92400E" : "#374151"
                  const val = row?.[field] ?? null
                  return (
                    <td key={`${name}-${yr}-${fundType}-${field}`} style={td({ textAlign: "right", fontFamily: "monospace", background: bg, color, fontWeight: changed ? 700 : undefined })}>
                      {fmt3(val)}
                    </td>
                  )
                }

                const cb = c?.budget ?? null; const ib = inv?.budget ?? null
                const ct = c?.target ?? null; const it = inv?.target ?? null
                const tb = (cb != null || ib != null) ? (cb ?? 0) + (ib ?? 0) : null
                const tt = (ct != null || it != null) ? (ct ?? 0) + (it ?? 0) : null
                const sumBgChanged = side === "new" && (changedCells.has(`${name}|${yr}|ผูกพัน|budget`) || changedCells.has(`${name}|${yr}|ลงทุน|budget`))
                const sumTgChanged = side === "new" && (changedCells.has(`${name}|${yr}|ผูกพัน|target`) || changedCells.has(`${name}|${yr}|ลงทุน|target`))

                return (
                  <Fragment key={yr}>
                    {numCell(c, "budget", "ผูกพัน")}
                    {numCell(inv, "budget", "ลงทุน")}
                    <td style={td({ textAlign: "right", fontFamily: "monospace", background: sumBgChanged ? "#FEF9C3" : rowBg || "#F9FAFB", ...neg(tb ?? 0) })}>{fmt3(tb)}</td>
                    {numCell(c, "target", "ผูกพัน")}
                    {numCell(inv, "target", "ลงทุน")}
                    <td style={td({ textAlign: "right", fontFamily: "monospace", background: sumTgChanged ? "#FEF9C3" : rowBg || "#F9FAFB", ...neg(tt ?? 0) })}>{fmt3(tt)}</td>
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

          {/* OLD — BG */}
          <p className="text-xs font-medium text-gray-400 mb-1">ข้อมูลเดิม (BG)</p>
          <div ref={oldRef} onScroll={onOldScroll} className="overflow-x-auto rounded-lg border border-gray-200 mb-3">
            <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
              <TableHeader />
              <TableBody groups={oldGroups} side="old" />
            </table>
          </div>

          {/* NEW — PO */}
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
