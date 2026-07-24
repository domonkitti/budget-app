"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CRITERIA_KEYS, CRITERIA_LABELS, CRITERIA_SHORT, PRIORITY_STYLE, SCORED_PROJECTS,
  type CriteriaKey, type ScoredProject,
} from "@/lib/scoringData"

type BudgetStatus = "ok" | "warning" | "over"

type SortKey = "rank" | "department" | "name" | "category" | CriteriaKey | "total" | "budget"
type SortDir = "asc" | "desc"

const LIMIT_KEY = "scoring-budget-limit"
const SNAPSHOT_KEY = "scoring-snapshot"

type Snapshot = { savedAt: string; rankById: Record<string, number> }

function money(n: number) {
  return n.toLocaleString("th-TH") + " ฿"
}

// Canonical rank by total score desc (ties broken by id) — the "baseline" everything compares against.
function scoreRanks(rows: ScoredProject[]): Record<string, number> {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
  const ranks: Record<string, number> = {}
  sorted.forEach((r, i) => { ranks[r.id] = i + 1 })
  return ranks
}

function sortValue(row: ScoredProject, key: SortKey): string | number {
  if (key === "department") return row.department
  if (key === "name") return row.name
  if (key === "category") return row.category.name
  if (key === "total") return row.total
  if (key === "budget") return row.budget
  if (key === "rank") return row.total
  return row.net[key as CriteriaKey]
}

// Liquipedia-style movement badge: shows how many ranks a row moved since the last saved snapshot.
function MoveBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span title="ยังไม่มี snapshot ให้เทียบ" className="inline-block w-8 text-center text-gray-300 text-[10px] font-semibold">NEW</span>
  if (delta === 0) return <span title="อันดับไม่เปลี่ยนจากครั้งก่อน" className="inline-block w-8 text-center text-gray-400 text-[11px]">―</span>
  const up = delta > 0
  return (
    <span
      title={up ? `ขยับขึ้น ${delta} อันดับ` : `ขยับลง ${Math.abs(delta)} อันดับ`}
      className={`inline-flex items-center justify-center gap-0.5 w-8 py-0.5 rounded text-[11px] font-bold tabular-nums ${
        up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
      }`}
    >
      {up ? "▲" : "▼"}{Math.abs(delta)}
    </span>
  )
}

export default function ScoringPage() {
  const [budgetLimit, setBudgetLimit] = useState(60_000_000)
  const [sortKey, setSortKey] = useState<SortKey>("total")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)

  useEffect(() => {
    const savedLimit = localStorage.getItem(LIMIT_KEY)
    if (savedLimit) setBudgetLimit(Number(savedLimit))
    const savedSnap = localStorage.getItem(SNAPSHOT_KEY)
    if (savedSnap) { try { setSnapshot(JSON.parse(savedSnap)) } catch {} }
  }, [])

  useEffect(() => { localStorage.setItem(LIMIT_KEY, String(budgetLimit)) }, [budgetLimit])

  const currentRank = useMemo(() => scoreRanks(SCORED_PROJECTS), [])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "department" || key === "name" || key === "category" ? "asc" : "desc")
    }
  }

  const sortedRows = useMemo(() => {
    const rows = [...SCORED_PROJECTS]
    rows.sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey)
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sortDir === "asc" ? cmp : -cmp
    })
    return rows
  }, [sortKey, sortDir])

  let cumulative = 0
  const rows = sortedRows.map((row, i) => {
    const before = cumulative
    cumulative += row.budget
    // "warning" = the row that tips the running total over the limit; "over" = fully past it
    const status: BudgetStatus = before >= budgetLimit ? "over" : cumulative > budgetLimit ? "warning" : "ok"
    return {
      row,
      displayRank: i + 1,
      status,
      moveDelta: snapshot ? (snapshot.rankById[row.id] ?? currentRank[row.id]) - currentRank[row.id] : null,
    }
  })

  const totalRequested = SCORED_PROJECTS.reduce((s, r) => s + r.budget, 0)
  const overAmount = Math.max(0, totalRequested - budgetLimit)
  const counts = { A: 0, B: 0, C: 0 }
  SCORED_PROJECTS.forEach(r => { counts[r.priority]++ })

  function saveSnapshot() {
    const snap: Snapshot = { savedAt: new Date().toISOString(), rankById: currentRank }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap))
    setSnapshot(snap)
  }
  function clearSnapshot() {
    localStorage.removeItem(SNAPSHOT_KEY)
    setSnapshot(null)
  }

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "total", label: "รวม" },
    { key: "budget", label: "งบที่ขอ" },
    { key: "department", label: "หน่วยงาน" },
    { key: "name", label: "ชื่อโครงการ" },
    { key: "category", label: "หมวด" },
    ...CRITERIA_KEYS.map(k => ({ key: k as SortKey, label: CRITERIA_SHORT[k] })),
  ]

  function SortChip({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <button
        onClick={() => toggleSort(k)}
        className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
          active ? "bg-gray-900 text-white" : "bg-white text-gray-500 border hover:border-gray-400"
        }`}
      >
        {label} {active && (sortDir === "asc" ? "▲" : "▼")}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-gray-800">Budget Priority Scoring</h1>
        <p className="text-sm text-gray-400">คะแนนถ่วงน้ำหนักรายโครงการ เรียงลำดับความสำคัญเทียบกับกรอบงบประมาณ</p>
      </header>

      <main className="px-6 py-6 max-w-7xl mx-auto space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-400 mb-1">งบประมาณที่ขอทั้งหมด</p>
            <p className="text-lg font-semibold text-gray-800">{money(totalRequested)}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-400 mb-1">กรอบวงเงินปีนี้</p>
            <input
              type="text"
              inputMode="numeric"
              value={budgetLimit.toLocaleString("th-TH")}
              onChange={e => setBudgetLimit(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
              className="text-lg font-semibold text-gray-800 border rounded-lg px-2 py-1 w-full outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className={`rounded-xl border p-4 ${overAmount > 0 ? "bg-red-50 border-red-200" : "bg-white"}`}>
            <p className="text-xs text-gray-400 mb-1">{overAmount > 0 ? "เกินกรอบวงเงิน" : "คงเหลือในกรอบ"}</p>
            <p className={`text-lg font-semibold ${overAmount > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {money(overAmount > 0 ? overAmount : budgetLimit - totalRequested)}
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-400 mb-1">Priority</p>
            <p className="text-sm font-medium text-gray-700">
              <span style={{ color: PRIORITY_STYLE.A.fg }}>A {counts.A}</span> ·{" "}
              <span style={{ color: PRIORITY_STYLE.B.fg }}>B {counts.B}</span> ·{" "}
              <span style={{ color: PRIORITY_STYLE.C.fg }}>C {counts.C}</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4 flex flex-col justify-between">
            <p className="text-xs text-gray-400 mb-1">Snapshot เทียบอันดับ</p>
            {snapshot ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  บันทึกไว้ {new Date(snapshot.savedAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <button onClick={clearSnapshot} className="text-xs text-red-500 hover:text-red-700 shrink-0">Clear</button>
              </div>
            ) : (
              <button onClick={saveSnapshot} className="text-xs px-2 py-1 bg-gray-800 text-white rounded-md hover:bg-gray-700 self-start">
                Save current ranking
              </button>
            )}
          </div>
        </div>

        {/* Sort bar — replaces table headers, since rows are no longer forced to one line */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 mr-1">เรียงตาม:</span>
          {SORT_OPTIONS.map(o => <SortChip key={o.key} k={o.key} label={o.label} />)}
        </div>

        {/* Card list — esports-standings styling: tier-colored rail. One shared grid template
            per row keeps every column pinned to the same x-position no matter how long a
            project name gets; only the name cell itself is free to wrap. */}
        <div className="bg-white rounded-xl border overflow-hidden">
          {/* Column headers — same grid template as the rows below, so every label
              sits centered directly above its column */}
          <div className="grid grid-cols-[48px_36px_minmax(220px,1fr)_44px_44px_44px_44px_56px_120px] gap-x-3 items-center px-4 py-2 bg-gray-50 border-b text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            <div className="text-center">Rank</div>
            <div className="text-center">Tier</div>
            <div className="text-center">Project</div>
            {CRITERIA_KEYS.map(k => (
              <div key={k} className="text-center" title={CRITERIA_LABELS[k]}>{CRITERIA_SHORT[k]}</div>
            ))}
            <div className="text-center">Total</div>
            <div className="text-center">Budget</div>
          </div>
          <div className="divide-y">
            {rows.map(({ row, displayRank, status, moveDelta }) => {
              const p = PRIORITY_STYLE[row.priority]
              const rowBg =
                status === "over" ? "bg-red-50 hover:bg-red-100" :
                status === "warning" ? "bg-amber-50 hover:bg-amber-100" :
                "hover:bg-blue-50/50"
              return (
                <div
                  key={row.id}
                  style={{ borderLeft: `4px solid ${p.stripe}` }}
                  className={`grid grid-cols-[48px_36px_minmax(220px,1fr)_44px_44px_44px_44px_56px_120px] gap-x-3 items-center px-4 py-3 transition-colors ${rowBg}`}
                >
                  {/* rank + movement */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-mono font-extrabold text-lg text-gray-800 leading-none">{displayRank}</span>
                    <MoveBadge delta={moveDelta} />
                  </div>

                  {/* priority tier badge — own grid column, so it lines up vertically down the whole list */}
                  <div className="flex justify-center">
                    <span
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded border"
                      style={{ background: p.bg, color: p.fg, borderColor: p.border }}
                    >
                      {row.priority}
                    </span>
                  </div>

                  {/* name / dept / category — free to wrap, no forced single line */}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 leading-snug">
                      {row.name}
                      {row.mandatory && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded align-middle">ผูกพันเดิม</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 leading-snug mt-0.5">{row.department} · {row.category.name}</p>
                  </div>

                  {/* criteria — each its own grid column, hover for full name + raw score/weight */}
                  {CRITERIA_KEYS.map(k => (
                    <div
                      key={k}
                      title={`${CRITERIA_LABELS[k]} — ดิบ ${row.scores[k]}/5 × น้ำหนัก ${(row.category.weights[k] * 100).toFixed(0)}%`}
                      className="text-center text-sm font-semibold text-gray-700 tabular-nums"
                    >
                      {row.net[k].toFixed(1)}
                    </div>
                  ))}

                  {/* total score */}
                  <div className="text-center text-xl font-extrabold text-gray-900 tabular-nums leading-none">
                    {row.total.toFixed(1)}
                  </div>

                  {/* budget */}
                  <div className="text-right text-sm text-gray-700 tabular-nums">{money(row.budget)}</div>
                </div>
              )
            })}
          </div>

          {/* Legend — tier stripe key, esports-standings style */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 bg-gray-50 border-t text-[11px] text-gray-500">
            {(["A", "B", "C"] as const).map(pr => (
              <span key={pr} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PRIORITY_STYLE[pr].stripe }} />
                Priority {pr} — {pr === "A" ? "สำคัญสูงสุด ต้องบรรจุ" : pr === "B" ? "สำคัญปานกลาง ตามกรอบวงเงิน" : "ชะลอ / ทบทวนใหม่"}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" />
              จุดตัดงบประมาณ (โครงการที่ทำให้ยอดสะสมเกิน)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300" />
              เกินกรอบงบประมาณแล้ว
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
