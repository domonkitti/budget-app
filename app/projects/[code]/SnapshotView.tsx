"use client"

import { Fragment } from "react"
import Link from "next/link"
import type { FlatProject, SubJobYearEntry, SourceYearEntry } from "@/lib/types"

// ── Shared styles (matches edit page) ────────────────────────────────────────

const border = "0.5px solid #E5E7EB"
const th: React.CSSProperties = { border, padding: "5px 10px", background: "#F9FAFB", color: "#6B7280", fontWeight: 600, fontSize: 11, textAlign: "center", whiteSpace: "nowrap" }
const td = (opts?: React.CSSProperties): React.CSSProperties => ({ border, padding: "4px 8px", fontSize: 12, color: "#374151", ...opts })

const fmt3 = (n: number) =>
  !n ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

// ── Column structure (same as edit page) ──────────────────────────────────────

const COL_GROUPS = [
  { label: "งบเงินดำเนินการ",    cols: 3, bg: "rgba(96,165,250,0.15)",  subBg: "rgba(96,165,250,0.08)" },
  { label: "เป้าหมายการเบิกจ่าย", cols: 3, bg: "rgba(52,211,153,0.15)",  subBg: "rgba(52,211,153,0.08)" },
  { label: "คงเหลือ",             cols: 3, bg: "rgba(251,191,36,0.15)",  subBg: "rgba(251,191,36,0.08)" },
  { label: "ตัดทิ้ง/โยกย้าย",   cols: 1, bg: "rgba(239,68,68,0.12)",   subBg: "rgba(239,68,68,0.06)" },
  { label: "ต่ำกว่างบ",          cols: 1, bg: "rgba(168,85,247,0.12)",  subBg: "rgba(168,85,247,0.06)" },
]
const COLS_PER_YEAR = COL_GROUPS.reduce((s, g) => s + g.cols, 0)

// ── Helpers ───────────────────────────────────────────────────────────────────

type Row = SubJobYearEntry | SourceYearEntry

function nameOf(r: Row): string {
  return "name" in r ? r.name : (r as SourceYearEntry).source
}

function groupRows<T extends Row>(entries: T[]): { label: string; rows: T[] }[] {
  const map = new Map<string, T[]>()
  for (const e of entries) {
    const key = nameOf(e)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  // preserve insertion order (already sorted from API)
  return [...map.entries()].map(([label, rows]) => ({ label, rows }))
}

function getCell(rows: Row[], year: number, fundType: string) {
  return rows.find(r => r.year === year && r.fund_type === fundType)
}

// ── Table ─────────────────────────────────────────────────────────────────────

function ReadOnlyTable({ label, entries, years }: { label: string; entries: Row[]; years: number[] }) {
  const neg = (v: number): React.CSSProperties => v < 0 ? { color: "#DC2626" } : {}
  const num = (v: number, key: string, red = false) => (
    <td key={key} style={{ ...td(), textAlign: "right", fontFamily: "monospace", ...neg(v), ...(red ? { color: "#DC2626" } : {}) }}>
      {fmt3(v)}
    </td>
  )
  const na = (key: string) => (
    <td key={key} style={{ ...td(), textAlign: "right", color: "#D1D5DB" }}>—</td>
  )

  const groups = groupRows(entries)

  // Totals
  const totalFor = (year: number) => {
    let sc_b = 0, si_b = 0, sc_t = 0, si_t = 0, total_ct = 0, total_ub = 0
    for (const { rows } of groups) {
      const c = getCell(rows, year, "ผูกพัน")
      const i = getCell(rows, year, "ลงทุน")
      sc_b += c?.budget ?? 0; si_b += i?.budget ?? 0
      sc_t += c?.target ?? 0; si_t += i?.target ?? 0
      const adj = c?.cut_transfer || i?.cut_transfer ? (c ?? i) : null
      total_ct += adj?.cut_transfer ?? 0
      total_ub += adj?.under_budget ?? 0
    }
    return { sc_b, si_b, sc_t, si_t, total_ct, total_ub }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-600">{label}</h2>
      <div style={{ overflowX: "auto", borderRadius: 12, border }}>
        <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
          <thead>
            {/* Row 1 — year spans */}
            <tr>
              <th style={{ ...th, width: 200, minWidth: 200, position: "sticky", left: 0, zIndex: 3, background: "#F9FAFB" }} rowSpan={3}>ชื่อ</th>
              {years.map(year => (
                <th key={year} colSpan={COLS_PER_YEAR} style={{ ...th, background: "#F3F4F6", borderBottom: "none" }}>ปี {year}</th>
              ))}
            </tr>
            {/* Row 2 — group labels */}
            <tr>
              {years.map(year => (
                <Fragment key={year}>
                  {COL_GROUPS.map(g => (
                    <th key={g.label} colSpan={g.cols} style={{ ...th, background: g.bg, borderBottom: "none" }}>{g.label}</th>
                  ))}
                </Fragment>
              ))}
            </tr>
            {/* Row 3 — ผูกพัน/ลงทุน/รวม */}
            <tr>
              {years.map(year => (
                <Fragment key={year}>
                  {COL_GROUPS.map(g => (
                    <Fragment key={g.label}>
                      {g.cols === 3 ? (
                        ["ผูกพัน", "ลงทุน", "รวม"].map(lbl => (
                          <th key={lbl} style={{ ...th, minWidth: 110, background: g.subBg }}>{lbl}</th>
                        ))
                      ) : (
                        <th style={{ ...th, minWidth: 110, background: g.subBg }}>รวม</th>
                      )}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(({ label: gLabel, rows }) => (
              <tr key={gLabel} style={{ background: "#fff" }}>
                <td style={{ ...td(), fontWeight: 500, position: "sticky", left: 0, background: "#fff", zIndex: 1, width: 200, maxWidth: 200, whiteSpace: "normal", wordBreak: "break-word" }}>
                  {gLabel}
                </td>
                {years.map(year => {
                  const c = getCell(rows, year, "ผูกพัน")
                  const i = getCell(rows, year, "ลงทุน")
                  const cb = c?.budget ?? 0, ct = c?.target ?? 0
                  const ib = i?.budget ?? 0, it_ = i?.target ?? 0
                  const tb = cb + ib, tt = ct + it_
                  const adj = c?.cut_transfer || i?.cut_transfer || c?.under_budget || i?.under_budget
                    ? (c ?? i) : null
                  return (
                    <Fragment key={year}>
                      {num(cb, `${year}-cb`)} {num(ib, `${year}-ib`)} {num(tb, `${year}-tb`)}
                      {num(ct, `${year}-ct`)} {num(it_, `${year}-it`)} {num(tt, `${year}-tt`)}
                      {num(cb - ct, `${year}-cr`, cb - ct < 0)} {num(ib - it_, `${year}-ir`, ib - it_ < 0)} {num(tb - tt, `${year}-tr`, tb - tt < 0)}
                      {adj ? num(adj.cut_transfer, `${year}-adj-ct`) : na(`${year}-na-ct`)}
                      {adj ? num(adj.under_budget, `${year}-adj-ub`) : na(`${year}-na-ub`)}
                    </Fragment>
                  )
                })}
              </tr>
            ))}
            {/* Totals row */}
            {groups.length > 0 && (
              <tr style={{ background: "#F0FDF4", borderTop: "1.5px solid #86EFAC" }}>
                <td style={{ ...td(), fontWeight: 700, color: "#166534", position: "sticky", left: 0, background: "#F0FDF4", zIndex: 1, width: 200, maxWidth: 200 }}>รวมทั้งหมด</td>
                {years.map(year => {
                  const { sc_b, si_b, sc_t, si_t, total_ct, total_ub } = totalFor(year)
                  const tb = sc_b + si_b, tt = sc_t + si_t
                  const T = (v: number, key: string) => (
                    <td key={key} style={{ ...td(), textAlign: "right", fontFamily: "monospace", fontWeight: 700, background: "#F0FDF4", color: v < 0 ? "#DC2626" : "#166534" }}>{fmt3(v)}</td>
                  )
                  return (
                    <Fragment key={year}>
                      {T(sc_b, `${year}-sc_b`)} {T(si_b, `${year}-si_b`)} {T(tb, `${year}-tb`)}
                      {T(sc_t, `${year}-sc_t`)} {T(si_t, `${year}-si_t`)} {T(tt, `${year}-tt`)}
                      {T(sc_b - sc_t, `${year}-cr`)} {T(si_b - si_t, `${year}-ir`)} {T(tb - tt, `${year}-tr`)}
                      {T(total_ct, `${year}-tct`)} {T(total_ub, `${year}-tub`)}
                    </Fragment>
                  )
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SnapshotProjectView({
  project,
  snapshotLabel,
}: {
  project: FlatProject
  snapshotLabel: string
}) {
  const years = [...new Set([
    ...project.sub_jobs.map(e => e.year),
    ...project.source_breakdown.map(e => e.year),
  ])].sort()

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
      {/* Read-only banner */}
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm">
        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
        <span className="text-amber-800">
          Snapshot (read-only): <strong>{snapshotLabel}</strong>
        </span>
        <Link href={`/projects/${encodeURIComponent(project.project_code)}`} className="ml-auto text-xs text-amber-700 underline">
          ← Back
        </Link>
      </div>

      {/* Project header */}
      <div>
        <div className="text-xs text-gray-400 font-mono mb-0.5">{project.project_code}</div>
        <h1 className="text-xl font-bold text-gray-800">{project.name}</h1>
        <div className="flex gap-4 mt-1 text-xs text-gray-500">
          {project.division && <span>{project.division}</span>}
          {project.department && <span>{project.department}</span>}
          {project.group_name && <span className="font-medium text-indigo-600">{project.group_name}</span>}
        </div>
      </div>

      {project.sub_jobs.length > 0 && (
        <ReadOnlyTable label="Sub-jobs" entries={project.sub_jobs} years={years} />
      )}

      {project.source_breakdown.length > 0 && (
        <ReadOnlyTable label="Budget Sources" entries={project.source_breakdown} years={years} />
      )}
    </div>
  )
}
