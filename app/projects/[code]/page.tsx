"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import type { ProjectDetail, SubJob, BudgetSource, ChangeLogEntry } from "@/lib/types"
import { useViewMode } from "@/app/SnapshotProvider"

const fmt3 = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

function fmtDate(s: string) {
  return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingRow = { budget: number; target: number }
type EditState = { key: string; field: "budget" | "target"; value: string }

type SubJobGroup = {
  name: string; sort_order: number | null
  years: { year: number; committed: SubJob | null; invest: SubJob | null }[]
}
type SourceGroup = {
  source: string
  years: { year: number; committed: BudgetSource | null; invest: BudgetSource | null }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupSubJobs(jobs: SubJob[]): SubJobGroup[] {
  const map = new Map<string, SubJobGroup>()
  for (const sj of jobs) {
    if (!map.has(sj.name)) map.set(sj.name, { name: sj.name, sort_order: sj.sort_order, years: [] })
    const g = map.get(sj.name)!
    let yr = g.years.find((y) => y.year === sj.data_year)
    if (!yr) { yr = { year: sj.data_year, committed: null, invest: null }; g.years.push(yr) }
    if (sj.fund_type === "ผูกพัน") yr.committed = sj; else yr.invest = sj
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
    if (bs.fund_type === "ผูกพัน") yr.committed = bs; else yr.invest = bs
  }
  return [...map.values()].map((g) => ({ ...g, years: g.years.sort((a, b) => a.year - b.year) }))
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const border = "0.5px solid #E5E7EB"
const th: React.CSSProperties = { border, padding: "5px 10px", background: "#F9FAFB", color: "#6B7280", fontWeight: 600, fontSize: 11, textAlign: "center", whiteSpace: "nowrap" }
const td = (opts?: React.CSSProperties): React.CSSProperties => ({ border, padding: "4px 8px", fontSize: 12, color: "#374151", ...opts })

// ─── EditableCell ─────────────────────────────────────────────────────────────

function EditableCell({
  value, isPending, isEditing, editValue,
  onStartEdit, onChange, onCommit, onCancel,
}: {
  value: number; isPending: boolean; isEditing: boolean; editValue: string
  onStartEdit: () => void; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void
}) {
  if (isEditing) {
    return (
      <input
        autoFocus
        value={editValue}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel() }}
        style={{ width: 120, textAlign: "right", fontFamily: "monospace", fontSize: 12, border: "1.5px solid #3B82F6", borderRadius: 4, padding: "2px 6px", outline: "none" }}
      />
    )
  }
  return (
    <span
      onClick={onStartEdit}
      title="Click to edit"
      style={{
        display: "block", textAlign: "right", padding: "2px 6px", borderRadius: 4,
        cursor: "text", fontFamily: "monospace", minWidth: 100,
        background: isPending ? "#FEF9C3" : "transparent",
        fontWeight: isPending ? 600 : undefined,
      }}
      onMouseEnter={(e) => { if (!isPending) (e.currentTarget as HTMLElement).style.background = "#EEF2FF" }}
      onMouseLeave={(e) => { if (!isPending) (e.currentTarget as HTMLElement).style.background = "transparent" }}
    >
      {fmt3(value)}
    </span>
  )
}

// ─── Totals row ───────────────────────────────────────────────────────────────

function TotalsRow({ label, rows, pending, prefix }: {
  label: string; rows: (SubJob | BudgetSource)[]
  pending: Map<string, PendingRow>; prefix: "sj" | "bs"
}) {
  const eff = (r: SubJob | BudgetSource) => pending.get(`${prefix}-${r.id}`) ?? { budget: r.budget, target: r.target }
  const sc = rows.filter((r) => r.fund_type === "ผูกพัน").reduce((a, r) => { const e = eff(r); return { budget: a.budget + e.budget, target: a.target + e.target } }, { budget: 0, target: 0 })
  const si = rows.filter((r) => r.fund_type === "ลงทุน").reduce((a, r) => { const e = eff(r); return { budget: a.budget + e.budget, target: a.target + e.target } }, { budget: 0, target: 0 })
  const tb = sc.budget + si.budget; const tt = sc.target + si.target; const tr_ = tb - tt
  const scr = sc.budget - sc.target; const sir = si.budget - si.target
  const T = (val: number): React.CSSProperties => ({ ...td(), textAlign: "right", fontFamily: "monospace", fontWeight: 700, background: "#F0FDF4", color: val < 0 ? "#DC2626" : "#166534" })
  return (
    <tr style={{ background: "#F0FDF4", borderTop: "1.5px solid #86EFAC" }}>
      <td style={{ ...td(), fontWeight: 700, color: "#166534" }} colSpan={2}>{label}</td>
      <td style={T(sc.budget)}>{fmt3(sc.budget)}</td>
      <td style={T(si.budget)}>{fmt3(si.budget)}</td>
      <td style={T(tb)}>{fmt3(tb)}</td>
      <td style={T(sc.target)}>{fmt3(sc.target)}</td>
      <td style={T(si.target)}>{fmt3(si.target)}</td>
      <td style={T(tt)}>{fmt3(tt)}</td>
      <td style={T(scr)}>{fmt3(scr)}</td>
      <td style={T(sir)}>{fmt3(sir)}</td>
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

  // Pending edits — key: "sj-{id}" | "bs-{id}"
  const [pending, setPending] = useState<Map<string, PendingRow>>(new Map())
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  // History
  const [history, setHistory] = useState<ChangeLogEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [undoing, setUndoing] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const p = isScenario && scenarioId != null
        ? await api.scenarioProjectDetail(scenarioId, code)
        : await api.projectDetail(code)
      setProject(p)
    } catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [code, isScenario, scenarioId])

  const loadHistory = useCallback(async () => {
    if (isScenario) return
    try { setHistory(await api.projectHistory(code)) } catch {}
  }, [code, isScenario])

  useEffect(() => { setProject(null); setLoading(true); setPending(new Map()); load() }, [load])
  useEffect(() => { loadHistory() }, [loadHistory])

  // ── Pending edit helpers ───────────────────────────────────────────────────

  function startEdit(key: string, field: "budget" | "target") {
    if (!project) return
    const [prefix, idStr] = key.split("-")
    const id = parseInt(idStr)
    const row = prefix === "sj"
      ? project.sub_jobs.find((r) => r.id === id)
      : project.budget_sources.find((r) => r.id === id)
    if (!row) return
    const cur = pending.get(key) ?? { budget: row.budget, target: row.target }
    setEditState({ key, field, value: String(cur[field]) })
  }

  function commitEdit() {
    if (!editState || !project) return
    const raw = editState.value.replace(/,/g, "").trim()
    const num = parseFloat(raw)
    if (isNaN(num)) { setEditState(null); return }

    const { key, field } = editState
    const [prefix, idStr] = key.split("-")
    const id = parseInt(idStr)
    const row = prefix === "sj"
      ? project.sub_jobs.find((r) => r.id === id)
      : project.budget_sources.find((r) => r.id === id)
    if (!row) { setEditState(null); return }

    const base = pending.get(key) ?? { budget: row.budget, target: row.target }
    const updated = { ...base, [field]: num }

    // Remove if back to original
    if (updated.budget === row.budget && updated.target === row.target) {
      setPending((prev) => { const n = new Map(prev); n.delete(key); return n })
    } else {
      setPending((prev) => new Map(prev).set(key, updated))
    }
    setEditState(null)
  }

  function effectiveValue(row: SubJob | BudgetSource, prefix: "sj" | "bs", field: "budget" | "target"): number {
    return pending.get(`${prefix}-${row.id}`)?.[field] ?? row[field]
  }

  // ── Save / Discard ─────────────────────────────────────────────────────────

  async function saveAll() {
    setSaving(true)
    try {
      await Promise.all([...pending.entries()].map(([key, p]) => {
        const [prefix, idStr] = key.split("-")
        const id = parseInt(idStr)
        if (isScenario && scenarioId != null) {
          return prefix === "sj"
            ? api.updateScenarioSubJob(scenarioId, id, p.budget, p.target)
            : api.updateScenarioBudgetSource(scenarioId, id, p.budget, p.target)
        }
        return prefix === "sj"
          ? api.updateSubJob(id, p.budget, p.target)
          : api.updateBudgetSource(id, p.budget, p.target)
      }))
      setPending(new Map())
      setLoading(true)
      await load()
      await loadHistory()
    } catch (e: unknown) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function undoChange(entryId: number) {
    setUndoing(entryId)
    try {
      await api.undoChange(entryId)
      setLoading(true)
      await load()
      await loadHistory()
    } catch {} finally { setUndoing(null) }
  }

  // ── Sum validation ─────────────────────────────────────────────────────────

  const sjBudget = project?.sub_jobs.reduce((s, r) => s + effectiveValue(r, "sj", "budget"), 0) ?? 0
  const bsBudget = project?.budget_sources.reduce((s, r) => s + effectiveValue(r, "bs", "budget"), 0) ?? 0
  const sjTarget = project?.sub_jobs.reduce((s, r) => s + effectiveValue(r, "sj", "target"), 0) ?? 0
  const bsTarget = project?.budget_sources.reduce((s, r) => s + effectiveValue(r, "bs", "target"), 0) ?? 0
  const budgetMismatch = project && Math.abs(sjBudget - bsBudget) > 0.001
  const targetMismatch = project && Math.abs(sjTarget - bsTarget) > 0.001
  const hasMismatch = budgetMismatch || targetMismatch

  const pendingCount = pending.size

  // ── Table helpers ──────────────────────────────────────────────────────────

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
        {["rgba(96,165,250,0.08)", "rgba(96,165,250,0.08)", "rgba(96,165,250,0.08)",
          "rgba(52,211,153,0.08)", "rgba(52,211,153,0.08)", "rgba(52,211,153,0.08)",
          "rgba(251,191,36,0.08)", "rgba(251,191,36,0.08)", "rgba(251,191,36,0.08)"].map((bg, i) => (
          <th key={i} style={{ ...th, minWidth: 110, background: bg }}>
            {["ผูกพัน","ลงทุน","รวม","ผูกพัน","ลงทุน","รวม","ผูกพัน","ลงทุน","รวม"][i]}
          </th>
        ))}
      </tr>
    </thead>
  )

  function renderYearRow(
    year: number,
    committed: SubJob | BudgetSource | null,
    invest: SubJob | BudgetSource | null,
    prefix: "sj" | "bs",
    isFirst: boolean, groupSize: number, groupName: string,
  ) {
    const cb = committed ? effectiveValue(committed, prefix, "budget") : 0
    const ct = committed ? effectiveValue(committed, prefix, "target") : 0
    const ib = invest ? effectiveValue(invest, prefix, "budget") : 0
    const it_ = invest ? effectiveValue(invest, prefix, "target") : 0
    const tb = cb + ib; const tt = ct + it_; const tr_ = tb - tt
    const cr = cb - ct; const ir = ib - it_

    const rem = (val: number): React.CSSProperties => val < 0 ? { color: "#DC2626" } : {}
    const dash = <span style={{ display: "block", textAlign: "right", padding: "2px 8px", color: "#D1D5DB" }}>—</span>
    const comp = (val: number) => (
      <td style={{ ...td(), textAlign: "right", fontFamily: "monospace", background: "#F9FAFB", ...rem(val) }}>{fmt3(val)}</td>
    )

    const editCell = (row: SubJob | BudgetSource | null, field: "budget" | "target") => {
      if (!row) return <td style={{ ...td(), padding: 0 }}>{dash}</td>
      const key = `${prefix}-${row.id}`
      const isEd = editState?.key === key && editState?.field === field
      const isPend = pending.has(key)
      const effVal = effectiveValue(row, prefix, field)
      return (
        <td style={{ ...td(), padding: 0 }}>
          <EditableCell
            value={effVal}
            isPending={isPend}
            isEditing={isEd}
            editValue={isEd ? editState!.value : ""}
            onStartEdit={() => startEdit(key, field)}
            onChange={(v) => setEditState((s) => s ? { ...s, value: v } : s)}
            onCommit={commitEdit}
            onCancel={() => setEditState(null)}
          />
        </td>
      )
    }

    return (
      <tr key={year} style={{ background: "#fff" }}>
        {isFirst && <td style={{ ...td(), verticalAlign: "top", fontWeight: 500 }} rowSpan={groupSize}>{groupName}</td>}
        <td style={{ ...td(), textAlign: "center", color: "#6B7280" }}>{year}</td>
        {editCell(committed, "budget")}{editCell(invest, "budget")}{comp(tb)}
        {editCell(committed, "target")}{editCell(invest, "target")}{comp(tt)}
        {comp(cr)}{comp(ir)}{comp(tr_)}
      </tr>
    )
  }

  // ── Mode badge ─────────────────────────────────────────────────────────────

  const modeBadge = isScenario ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#F5F3FF", border: "1px solid #A78BFA", borderRadius: 6, padding: "1px 8px", fontSize: 11, color: "#5B21B6", fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8B5CF6" }} />
      WHAT IF: {viewMode.kind === "scenario" ? viewMode.item.label : ""}
    </span>
  ) : (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, padding: "1px 8px", fontSize: 11, color: "#166534", fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
      LIVE
    </span>
  )

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingBottom: pendingCount > 0 ? 72 : 0 }}>
      <header className="bg-white border-b px-6 py-4">
        <Link href="/" style={{ color: "#9CA3AF", fontSize: 12, textDecoration: "none" }}>← Back to dashboard</Link>
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
            </div>
          </div>
        )}
      </header>

      {/* Sum mismatch warning */}
      {project && hasMismatch && (
        <div style={{ background: "#FFF7ED", borderBottom: "1.5px solid #FB923C", padding: "6px 24px", fontSize: 12, color: "#C2410C" }}>
          ⚠ ยอดรวมไม่ตรงกัน —{" "}
          {budgetMismatch && <span>งบ: งานย่อย {fmt3(sjBudget)} ≠ แหล่งเงิน {fmt3(bsBudget)}{targetMismatch ? "  |  " : ""}</span>}
          {targetMismatch && <span>เป้า: งานย่อย {fmt3(sjTarget)} ≠ แหล่งเงิน {fmt3(bsTarget)}</span>}
        </div>
      )}

      <main className="px-6 py-6 max-w-[1800px] mx-auto space-y-8">
        {loading && <div className="text-center py-20 text-gray-400">Loading…</div>}
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>}

        {!loading && project && (
          <>
            {/* Sub Jobs */}
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">งานย่อย (Sub Jobs)</h2>
              <div className="bg-white border rounded-xl overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
                    {tableHeader}
                    <tbody>
                      {subJobGroups.length === 0 && <tr><td colSpan={11} style={{ ...td(), textAlign: "center", color: "#9CA3AF", padding: "24px" }}>ไม่มีข้อมูล</td></tr>}
                      {subJobGroups.map((g) => g.years.map((y, yi) => renderYearRow(y.year, y.committed, y.invest, "sj", yi === 0, g.years.length, g.name)))}
                      {project.sub_jobs.length > 0 && <TotalsRow label="รวมทั้งหมด" rows={project.sub_jobs} pending={pending} prefix="sj" />}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Budget Sources */}
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">แหล่งเงิน (Budget Sources)</h2>
              <div className="bg-white border rounded-xl overflow-hidden">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
                    {tableHeader}
                    <tbody>
                      {sourceGroups.length === 0 && <tr><td colSpan={11} style={{ ...td(), textAlign: "center", color: "#9CA3AF", padding: "24px" }}>ไม่มีข้อมูล</td></tr>}
                      {sourceGroups.map((g) => g.years.map((y, yi) => renderYearRow(y.year, y.committed, y.invest, "bs", yi === 0, g.years.length, g.source)))}
                      {project.budget_sources.length > 0 && <TotalsRow label="รวมทั้งหมด" rows={project.budget_sources} pending={pending} prefix="bs" />}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">รวม = ผูกพัน + ลงทุน · ยอดรวมแหล่งเงิน = ยอดรวมงานย่อย</p>
            </section>

            {/* History */}
            {!isScenario && (
              <section>
                <button
                  type="button"
                  onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) loadHistory() }}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ transform: historyOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  ประวัติการแก้ไข ({history.length})
                </button>

                {historyOpen && (
                  <div className="bg-white border rounded-xl overflow-hidden">
                    {history.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>ยังไม่มีประวัติ</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {["เวลา", "ตาราง", "ชื่อ", "ปี", "ประเภท", "ฟิลด์", "ก่อน", "หลัง", ""].map((h, i) => (
                              <th key={i} style={{ ...th, textAlign: i >= 6 ? "right" : "left" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((e) => (
                            <tr key={e.id} style={{ borderBottom: "0.5px solid #F3F4F6" }}>
                              <td style={{ ...td(), whiteSpace: "nowrap", color: "#9CA3AF" }}>{fmtDate(e.changed_at)}</td>
                              <td style={{ ...td(), fontSize: 11 }}>{e.table_name === "sub_jobs" ? "งานย่อย" : "แหล่งเงิน"}</td>
                              <td style={{ ...td(), maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.row_name}</td>
                              <td style={{ ...td(), textAlign: "center" }}>{e.data_year}</td>
                              <td style={{ ...td() }}>{e.fund_type}</td>
                              <td style={{ ...td() }}>{e.field === "budget" ? "งบ" : "เป้า"}</td>
                              <td style={{ ...td(), textAlign: "right", fontFamily: "monospace", color: "#9CA3AF" }}>{fmt3(e.old_value)}</td>
                              <td style={{ ...td(), textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmt3(e.new_value)}</td>
                              <td style={{ ...td() }}>
                                <button
                                  type="button"
                                  disabled={undoing === e.id}
                                  onClick={() => undoChange(e.id)}
                                  style={{ fontSize: 11, padding: "2px 8px", background: undoing === e.id ? "#F3F4F6" : "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" }}
                                >
                                  {undoing === e.id ? "…" : "↩ undo"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Sticky save bar */}
      {pendingCount > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "#1E293B", borderTop: "1px solid #334155", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
          {hasMismatch && (
            <span style={{ fontSize: 11, color: "#FB923C", marginRight: 4 }}>⚠ ยอดไม่ตรง</span>
          )}
          <span style={{ fontSize: 12, color: "#94A3B8" }}>
            {pendingCount} รายการรอบันทึก — <span style={{ color: "#FEF9C3" }}>เซลล์สีเหลือง = ยังไม่บันทึก</span>
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => { setPending(new Map()); setEditState(null) }}
            style={{ padding: "6px 16px", background: "transparent", color: "#94A3B8", border: "1px solid #475569", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
          >
            Discard
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={saveAll}
            style={{ padding: "6px 20px", background: saving ? "#475569" : "#3B82F6", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: saving ? "default" : "pointer" }}
          >
            {saving ? "Saving…" : `Save ${pendingCount} changes`}
          </button>
        </div>
      )}
    </div>
  )
}
