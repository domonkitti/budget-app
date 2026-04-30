"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import type { ProjectDetail, SubJob, BudgetSource } from "@/lib/types"
import { useViewMode } from "@/app/SnapshotProvider"

const fmt3 = (n: number) =>
  n === 0
    ? "—"
    : n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

// ─── Types ────────────────────────────────────────────────────────────────────

type EditCell = { id: number; kind: "sub_job" | "budget_source"; field: "budget" | "target"; value: string }

type SubJobGroup = {
  name: string
  sort_order: number | null
  years: {
    year: number
    committed: SubJob | null
    invest: SubJob | null
  }[]
}

type SourceGroup = {
  source: string
  years: {
    year: number
    committed: BudgetSource | null
    invest: BudgetSource | null
  }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupSubJobs(jobs: SubJob[]): SubJobGroup[] {
  const map = new Map<string, SubJobGroup>()
  for (const sj of jobs) {
    if (!map.has(sj.name)) map.set(sj.name, { name: sj.name, sort_order: sj.sort_order, years: [] })
    const g = map.get(sj.name)!
    let yr = g.years.find((y) => y.year === sj.data_year)
    if (!yr) { yr = { year: sj.data_year, committed: null, invest: null }; g.years.push(yr) }
    if (sj.fund_type === "ผูกพัน") yr.committed = sj
    else yr.invest = sj
  }
  return [...map.values()]
    .sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999) || a.name.localeCompare(b.name, "th"))
    .map((g) => ({ ...g, years: g.years.sort((a, b) => a.year - b.year) }))
}

function groupSources(sources: BudgetSource[]): SourceGroup[] {
  const map = new Map<string, SourceGroup>()
  for (const bs of sources) {
    if (!map.has(bs.source)) map.set(bs.source, { source: bs.source, years: [] })
    const g = map.get(bs.source)!
    let yr = g.years.find((y) => y.year === bs.data_year)
    if (!yr) { yr = { year: bs.data_year, committed: null, invest: null }; g.years.push(yr) }
    if (bs.fund_type === "ผูกพัน") yr.committed = bs
    else yr.invest = bs
  }
  return [...map.values()].map((g) => ({ ...g, years: g.years.sort((a, b) => a.year - b.year) }))
}

function sumRows(rows: (SubJob | BudgetSource)[]) {
  return rows.reduce(
    (acc, r) => ({ budget: acc.budget + r.budget, target: acc.target + r.target, remain: acc.remain + r.remain }),
    { budget: 0, target: 0, remain: 0 },
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const border = "0.5px solid #E5E7EB"
const th: React.CSSProperties = {
  border,
  padding: "5px 10px",
  background: "#F9FAFB",
  color: "#6B7280",
  fontWeight: 600,
  fontSize: 11,
  textAlign: "center",
  whiteSpace: "nowrap",
}
const td = (opts?: React.CSSProperties): React.CSSProperties => ({
  border,
  padding: "4px 8px",
  fontSize: 12,
  color: "#374151",
  ...opts,
})

// ─── EditableCell ─────────────────────────────────────────────────────────────

function EditableCell({
  row,
  field,
  kind,
  edit,
  onStart,
  onSave,
  onCancel,
}: {
  row: SubJob | BudgetSource
  field: "budget" | "target"
  kind: "sub_job" | "budget_source"
  edit: EditCell | null
  onStart: (e: EditCell) => void
  onSave: () => void
  onCancel: () => void
}) {
  const active = edit?.id === row.id && edit?.field === field
  const value = field === "budget" ? row.budget : row.target

  if (active && edit) {
    return (
      <input
        autoFocus
        value={edit.value}
        onChange={(e) => onStart({ ...edit, value: e.target.value })}
        onBlur={onSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave()
          if (e.key === "Escape") onCancel()
        }}
        style={{
          width: 120,
          textAlign: "right",
          fontFamily: "monospace",
          fontSize: 12,
          border: "1.5px solid #3B82F6",
          borderRadius: 4,
          padding: "2px 6px",
          outline: "none",
        }}
      />
    )
  }

  return (
    <span
      onClick={() => onStart({ id: row.id, kind, field, value: String(value) })}
      title="Click to edit"
      style={{
        display: "block",
        textAlign: "right",
        padding: "2px 6px",
        borderRadius: 4,
        cursor: "text",
        fontFamily: "monospace",
        minWidth: 100,
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#EEF2FF")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
    >
      {fmt3(value)}
    </span>
  )
}

// ─── Totals row ───────────────────────────────────────────────────────────────

function TotalsRow({ label, rows }: { label: string; rows: (SubJob | BudgetSource)[] }) {
  const sc = sumRows(rows.filter((r) => r.fund_type === "ผูกพัน"))
  const si = sumRows(rows.filter((r) => r.fund_type === "ลงทุน"))
  const tb = sc.budget + si.budget
  const tt = sc.target + si.target
  const tr_ = tb - tt

  const T = (val: number): React.CSSProperties => ({
    ...td(), textAlign: "right", fontFamily: "monospace", fontWeight: 700,
    background: "#F0FDF4", color: val < 0 ? "#DC2626" : "#166534",
  })

  return (
    <tr style={{ background: "#F0FDF4", borderTop: "1.5px solid #86EFAC" }}>
      <td style={{ ...td(), fontWeight: 700, color: "#166534" }} colSpan={2}>{label}</td>
      <td style={T(sc.budget)}>{fmt3(sc.budget)}</td>
      <td style={T(si.budget)}>{fmt3(si.budget)}</td>
      <td style={T(tb)}>{fmt3(tb)}</td>
      <td style={T(sc.target)}>{fmt3(sc.target)}</td>
      <td style={T(si.target)}>{fmt3(si.target)}</td>
      <td style={T(tt)}>{fmt3(tt)}</td>
      <td style={T(sc.remain)}>{fmt3(sc.remain)}</td>
      <td style={T(si.remain)}>{fmt3(si.remain)}</td>
      <td style={T(tr_)}>{fmt3(tr_)}</td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const params = useParams<{ code: string }>()
  const code = decodeURIComponent(params.code)
  const { viewMode } = useViewMode()
  const isScenario = viewMode.kind === "scenario"
  const scenarioId = isScenario ? viewMode.item.id : null

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [edit, setEdit] = useState<EditCell | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const p = isScenario && scenarioId != null
        ? await api.scenarioProjectDetail(scenarioId, code)
        : await api.projectDetail(code)
      setProject(p)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [code, isScenario, scenarioId])

  useEffect(() => { setProject(null); setLoading(true); load() }, [load])

  async function saveEdit() {
    if (!edit || !project) return
    const raw = edit.value.replace(/,/g, "").trim()
    const numVal = parseFloat(raw)
    if (isNaN(numVal)) { setEdit(null); return }

    setSaving(true)
    try {
      if (edit.kind === "sub_job") {
        const row = project.sub_jobs.find((r) => r.id === edit.id)!
        if (isScenario && scenarioId != null) {
          await api.updateScenarioSubJob(scenarioId, edit.id, edit.field === "budget" ? numVal : row.budget, edit.field === "target" ? numVal : row.target)
        } else {
          await api.updateSubJob(edit.id, edit.field === "budget" ? numVal : row.budget, edit.field === "target" ? numVal : row.target)
        }
      } else {
        const row = project.budget_sources.find((r) => r.id === edit.id)!
        if (isScenario && scenarioId != null) {
          await api.updateScenarioBudgetSource(scenarioId, edit.id, edit.field === "budget" ? numVal : row.budget, edit.field === "target" ? numVal : row.target)
        } else {
          await api.updateBudgetSource(edit.id, edit.field === "budget" ? numVal : row.budget, edit.field === "target" ? numVal : row.target)
        }
      }
      setEdit(null)
      setLoading(true)
      await load()
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const subJobGroups = project ? groupSubJobs(project.sub_jobs ?? []) : []
  const sourceGroups = project ? groupSources(project.budget_sources ?? []) : []

  const tableHeader = (
    <thead>
      <tr>
        <th style={{ ...th, minWidth: 200 }} rowSpan={2}>ชื่อ</th>
        <th style={{ ...th, minWidth: 60 }} rowSpan={2}>ปี</th>
        <th style={{ ...th, background: "rgba(96,165,250,0.15)" }} colSpan={3}>งบเงินดำเนินการ</th>
        <th style={{ ...th, background: "rgba(52,211,153,0.15)" }} colSpan={3}>เป้าหมายการเบิกจ่าย</th>
        <th style={{ ...th, background: "rgba(251,191,36,0.15)" }} colSpan={3}>คงเหลือ</th>
      </tr>
      <tr>
        <th style={{ ...th, minWidth: 110, background: "rgba(96,165,250,0.08)" }}>ผูกพัน</th>
        <th style={{ ...th, minWidth: 110, background: "rgba(96,165,250,0.08)" }}>ลงทุน</th>
        <th style={{ ...th, minWidth: 110, background: "rgba(96,165,250,0.08)" }}>รวม</th>
        <th style={{ ...th, minWidth: 110, background: "rgba(52,211,153,0.08)" }}>ผูกพัน</th>
        <th style={{ ...th, minWidth: 110, background: "rgba(52,211,153,0.08)" }}>ลงทุน</th>
        <th style={{ ...th, minWidth: 110, background: "rgba(52,211,153,0.08)" }}>รวม</th>
        <th style={{ ...th, minWidth: 110, background: "rgba(251,191,36,0.08)" }}>ผูกพัน</th>
        <th style={{ ...th, minWidth: 110, background: "rgba(251,191,36,0.08)" }}>ลงทุน</th>
        <th style={{ ...th, minWidth: 110, background: "rgba(251,191,36,0.08)" }}>รวม</th>
      </tr>
    </thead>
  )

  function renderYearRow(
    year: number,
    committed: SubJob | BudgetSource | null,
    invest: SubJob | BudgetSource | null,
    kind: "sub_job" | "budget_source",
    isFirst: boolean,
    groupSize: number,
    groupName: string,
  ) {
    const cb = committed?.budget ?? 0
    const ct = committed?.target ?? 0
    const cr = cb - ct
    const ib = invest?.budget ?? 0
    const it_ = invest?.target ?? 0
    const ir = ib - it_
    const tb = cb + ib
    const tt = ct + it_
    const tr_ = tb - tt

    const remainColor = (n: number): React.CSSProperties =>
      n < 0 ? { color: "#DC2626" } : {}

    const dash = <span style={{ display: "block", textAlign: "right", padding: "2px 8px", color: "#D1D5DB" }}>—</span>
    const computed = (val: number, extra?: React.CSSProperties) => (
      <td style={{ ...td(), textAlign: "right", fontFamily: "monospace", background: "#F9FAFB", ...remainColor(val), ...extra }}>{fmt3(val)}</td>
    )
    const editCell = (row: SubJob | BudgetSource | null, field: "budget" | "target") => (
      <td style={{ ...td(), padding: 0 }}>
        {row
          ? <EditableCell row={row} field={field} kind={kind} edit={edit} onStart={setEdit} onSave={saveEdit} onCancel={() => setEdit(null)} />
          : dash}
      </td>
    )

    return (
      <tr key={year} style={{ background: "#ffffff" }}>
        {isFirst && (
          <td style={{ ...td(), verticalAlign: "top", fontWeight: 500 }} rowSpan={groupSize}>
            {groupName}
          </td>
        )}
        <td style={{ ...td(), textAlign: "center", color: "#6B7280" }}>{year}</td>
        {editCell(committed, "budget")}
        {editCell(invest, "budget")}
        {computed(tb)}
        {editCell(committed, "target")}
        {editCell(invest, "target")}
        {computed(tt)}
        {computed(cr)}
        {computed(ir)}
        {computed(tr_)}
      </tr>
    )
  }

  // Mode badge
  let modeBadge: React.ReactNode
  if (isScenario) {
    modeBadge = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#F5F3FF", border: "1px solid #A78BFA", borderRadius: 6, padding: "1px 8px", fontSize: 11, color: "#5B21B6", fontWeight: 600 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8B5CF6" }} />
        WHAT IF: {viewMode.kind === "scenario" ? viewMode.item.label : ""}
      </span>
    )
  } else {
    modeBadge = (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, padding: "1px 8px", fontSize: 11, color: "#166534", fontWeight: 600 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
        LIVE
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <Link href="/" style={{ color: "#9CA3AF", fontSize: 12, textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
        {project && (
          <div className="mt-1 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-800">{project.name}</h1>
                {modeBadge}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                <span className="font-mono">{project.project_code}</span>
                {project.item_no && <span>ข้อ {project.item_no}</span>}
                <span>ปี {project.year}</span>
                <span>ประเภท {project.project_type}</span>
                {project.division && <span>{project.division}</span>}
              </div>
              {viewMode.kind === "snapshot" && (
                <p style={{ marginTop: 6, fontSize: 11, color: "#B45309", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 5, padding: "3px 8px", display: "inline-block" }}>
                  Snapshot active on other pages, but this page always shows and edits LIVE data.
                </p>
              )}
              {isScenario && (
                <p style={{ marginTop: 6, fontSize: 11, color: "#5B21B6", background: "#F5F3FF", border: "1px solid #A78BFA", borderRadius: 5, padding: "3px 8px", display: "inline-block" }}>
                  Editing scenario — changes here do NOT affect LIVE data.
                </p>
              )}
            </div>
            {saving && <span className="text-xs text-blue-500 animate-pulse">Saving…</span>}
          </div>
        )}
      </header>

      <main className="px-6 py-6 max-w-[1800px] mx-auto space-y-8">
        {loading && <div className="text-center py-20 text-gray-400">Loading…</div>}
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>}

        {!loading && project && (
          <>
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">งานย่อย (Sub Jobs)</h2>
              <div className="bg-white border rounded-xl overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
                    {tableHeader}
                    <tbody>
                      {subJobGroups.length === 0 && (
                        <tr><td colSpan={11} style={{ ...td(), textAlign: "center", color: "#9CA3AF", padding: "24px" }}>ไม่มีข้อมูล</td></tr>
                      )}
                      {subJobGroups.map((g) =>
                        g.years.map((y, yi) =>
                          renderYearRow(y.year, y.committed, y.invest, "sub_job", yi === 0, g.years.length, g.name),
                        ),
                      )}
                      {project.sub_jobs.length > 0 && (
                        <TotalsRow label="รวมทั้งหมด" rows={project.sub_jobs} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">แหล่งเงิน (Budget Sources)</h2>
              <div className="bg-white border rounded-xl overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
                    {tableHeader}
                    <tbody>
                      {sourceGroups.length === 0 && (
                        <tr><td colSpan={11} style={{ ...td(), textAlign: "center", color: "#9CA3AF", padding: "24px" }}>ไม่มีข้อมูล</td></tr>
                      )}
                      {sourceGroups.map((g) =>
                        g.years.map((y, yi) =>
                          renderYearRow(y.year, y.committed, y.invest, "budget_source", yi === 0, g.years.length, g.source),
                        ),
                      )}
                      {project.budget_sources.length > 0 && (
                        <TotalsRow label="รวมทั้งหมด" rows={project.budget_sources} />
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                รวม = ผูกพัน + ลงทุน · ยอดรวมแหล่งเงิน = ยอดรวมงานย่อย
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
