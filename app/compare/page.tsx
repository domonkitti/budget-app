"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { api } from "@/lib/api"
import type { FlatProject, SourceYearEntry } from "@/lib/types"

// ── Constants ─────────────────────────────────────────────────────────────────

type Mode = "project" | "department"

const METRICS = [
  { key: "budget_invest", label: "วงเงิน/ลงทุน" },
  { key: "budget_commit", label: "วงเงิน/ผูกพัน" },
  { key: "budget_total",  label: "วงเงิน/รวม" },
  { key: "target_invest", label: "เป้า/ลงทุน" },
  { key: "target_commit", label: "เป้า/ผูกพัน" },
  { key: "target_total",  label: "เป้า/รวม" },
  { key: "remain",        label: "คงเหลือ" },
  { key: "pct",           label: "% ใช้จ่าย" },
]

const COLORS = ["#6366F1","#10B981","#F59E0B","#EF4444","#3B82F6","#EC4899","#8B5CF6","#14B8A6"]

// ── Pure helpers ──────────────────────────────────────────────────────────────

function sumEntries(entries: SourceYearEntry[], year?: number) {
  const rows = year !== undefined ? entries.filter(e => e.year === year) : entries
  const bi = rows.filter(e => e.fund_type === "ลงทุน").reduce((s, e) => s + e.budget, 0)
  const bc = rows.filter(e => e.fund_type === "ผูกพัน").reduce((s, e) => s + e.budget, 0)
  const ti = rows.filter(e => e.fund_type === "ลงทุน").reduce((s, e) => s + e.target, 0)
  const tc = rows.filter(e => e.fund_type === "ผูกพัน").reduce((s, e) => s + e.target, 0)
  const rem = rows.reduce((s, e) => s + e.remain, 0)
  const totalBudget = bi + bc
  return {
    budget_invest: bi, budget_commit: bc, budget_total: bi + bc,
    target_invest: ti, target_commit: tc, target_total: ti + tc,
    remain: rem,
    pct: totalBudget > 0 ? ((ti + tc) / totalBudget) * 100 : 0,
  }
}

type CompiledGroup = { label: string; displayLabel: string; ids: string[]; entries: SourceYearEntry[] }

function buildGroups(mode: Mode, groups: string[][], projects: FlatProject[]): CompiledGroup[] {
  return groups.map(ids => {
    if (mode === "project") {
      const matched = ids.flatMap(id => {
        const p = projects.find(x => x.project_code === id)
        return p ? [p] : []
      })
      return {
        label: ids.join(" + "),
        displayLabel: matched.map(p => p.name).join(", ") || ids.join(", "),
        ids,
        entries: matched.flatMap(p => p.source_breakdown),
      }
    }
    const matched = ids.flatMap(id =>
      projects.filter(p => (p.department ?? p.division ?? "") === id)
    )
    return {
      label: ids.join(" + "),
      displayLabel: ids.join(", "),
      ids,
      entries: matched.flatMap(p => p.source_breakdown),
    }
  })
}

function fmt(n: number, isPct = false) {
  if (isPct) return n.toFixed(1) + "%"
  return n === 0 ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function encodeGroups(groups: string[][]): string {
  return groups.map(g => g.join(",")).join("|")
}
function decodeGroups(raw: string): string[][] {
  return raw.split("|").map(g => g.split(",").filter(Boolean)).filter(g => g.length > 0)
}
function encodeNames(names: string[]): string {
  return names.map(n => encodeURIComponent(n)).join("|")
}
function decodeNames(raw: string): string[] {
  return raw.split("|").map(n => decodeURIComponent(n))
}

// ── Draggable item in left panel ──────────────────────────────────────────────

function DraggableItem({
  id,
  label,
  sub,
  inUse,
}: {
  id: string
  label: string
  sub?: string
  inUse: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: { id } })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`px-3 py-2 rounded-lg border text-sm select-none transition-opacity ${
        isDragging
          ? "opacity-30"
          : inUse
            ? "bg-indigo-50 border-indigo-200 cursor-grab"
            : "bg-white border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 cursor-grab"
      }`}
    >
      <div className={`leading-snug mb-0.5 ${inUse ? "text-indigo-600 font-medium" : "text-gray-700"}`}>{label}</div>
      {sub && <div className="font-mono text-[10px] text-gray-400">{sub}</div>}
    </div>
  )
}

// ── Droppable group card ───────────────────────────────────────────────────────

function DroppableGroup({
  groupIdx,
  groupIds,
  color,
  name,
  getLabel,
  onRename,
  onRemoveItem,
  onRemoveGroup,
}: {
  groupIdx: number
  groupIds: string[]
  color: string
  name: string
  getLabel: (id: string) => string
  onRename: (name: string) => void
  onRemoveItem: (id: string) => void
  onRemoveGroup: () => void
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `group-${groupIdx}` })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  function commitRename() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== name) onRename(trimmed)
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        border: `1.5px solid ${isOver ? color : color + "50"}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 10,
        padding: "8px 10px",
        background: isOver ? color + "18" : color + "08",
        minWidth: 160,
        maxWidth: 280,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 4 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setDraft(name); setEditing(false) } }}
            style={{ fontSize: 11, fontWeight: 700, color, background: "none", border: "none", borderBottom: `1px solid ${color}`, outline: "none", width: "100%", padding: 0 }}
          />
        ) : (
          <span
            title="Click to rename"
            onClick={() => { setDraft(name); setEditing(true) }}
            style={{ fontSize: 11, fontWeight: 700, color, cursor: "text", flexShrink: 1, minWidth: 0 }}
          >
            {name}
          </span>
        )}
        <button
          type="button"
          onClick={onRemoveGroup}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0 }}
        >×</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, minHeight: 24 }}>
        {groupIds.map(id => (
          <span key={id} style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            background: "#fff", border: `1px solid ${color}40`,
            borderRadius: 12, padding: "2px 8px", fontSize: 11, color: "#374151",
          }}>
            {getLabel(id)}
            <button
              type="button"
              onClick={() => onRemoveItem(id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12, lineHeight: 1, padding: 0 }}
            >×</button>
          </span>
        ))}
        {groupIds.length === 0 && (
          <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>Drop items here</span>
        )}
      </div>
      {isOver && (
        <div style={{ marginTop: 6, fontSize: 11, color, fontWeight: 600 }}>+ Drop to add</div>
      )}
    </div>
  )
}

// ── Droppable "New Group" zone ─────────────────────────────────────────────────

function NewGroupZone() {
  const { isOver, setNodeRef } = useDroppable({ id: "new-group" })
  return (
    <div
      ref={setNodeRef}
      style={{
        border: `1.5px dashed ${isOver ? "#6366F1" : "#D1D5DB"}`,
        borderRadius: 10, padding: "10px 16px",
        background: isOver ? "#EEF2FF" : "none",
        fontSize: 12, color: isOver ? "#4338CA" : "#9CA3AF",
        cursor: "default", fontWeight: 600,
        display: "flex", alignItems: "center", gap: 6,
        transition: "all 0.15s", minWidth: 140,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
      {isOver ? "Drop to create group" : "New Group"}
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function ComparePage() {
  return <Suspense><CompareInner /></Suspense>
}

// ── Main component ────────────────────────────────────────────────────────────

function CompareInner() {
  const router = useRouter()
  const params = useSearchParams()
  const mode: Mode = (params.get("mode") as Mode) ?? "project"
  const groups: string[][] = useMemo(() => {
    const raw = params.get("groups")
    return raw ? decodeGroups(raw) : []
  }, [params])
  const groupNames: string[] = useMemo(() => {
    const raw = params.get("names")
    const decoded = raw ? decodeNames(raw) : []
    return groups.map((_, i) => decoded[i] || `Group ${i + 1}`)
  }, [params, groups])

  const [projects, setProjects] = useState<FlatProject[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => {
    api.flatProjects().then(d => { setProjects(d); setLoading(false) })
  }, [])

  const allYears = useMemo(() => {
    const s = new Set<number>()
    projects.forEach(p => p.source_breakdown.forEach(e => s.add(e.year)))
    return [...s].sort()
  }, [projects])

  const activeMetrics = useMemo(() => {
    const raw = params.get("metrics")
    if (!raw) return new Set(["budget_invest", "target_invest"])
    const valid = raw.split(",").filter(k => METRICS.some(m => m.key === k))
    return new Set(valid.length ? valid : ["budget_invest", "target_invest"])
  }, [params])

  const selectedYears = useMemo(() => {
    const raw = params.get("years")
    if (!raw) return allYears
    const requested = new Set(raw.split(",").map(Number))
    const filtered = allYears.filter(y => requested.has(y))
    return filtered.length ? filtered : allYears
  }, [params, allYears])

  const compiled = useMemo(() => buildGroups(mode, groups, projects), [mode, groups, projects])
  const selectedMetrics = METRICS.filter(m => activeMetrics.has(m.key))

  // Items for the left panel
  const panelItems = useMemo(() => {
    const q = search.toLowerCase()
    if (mode === "project") {
      return projects
        .filter(p => !q || p.project_code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
        .map(p => ({ id: p.project_code, label: p.name, sub: p.project_code }))
    }
    const depts = [...new Set(
      projects.map(p => p.department ?? p.division ?? "").filter(Boolean)
    )].sort()
    return depts
      .filter(d => !q || d.toLowerCase().includes(q))
      .map(d => ({ id: d, label: d, sub: undefined }))
  }, [mode, projects, search])

  const allInGroups = useMemo(() => new Set(groups.flat()), [groups])

  const nameMap = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach(p => m.set(p.project_code, p.name))
    return m
  }, [projects])

  const getLabel = (id: string) => nameMap.get(id) ?? id

  function setUrl(overrides: {
    mode?: Mode
    groups?: string[][]
    names?: string[]
    metrics?: string[]
    years?: number[] | null
  }) {
    const _mode = overrides.mode ?? mode
    const _groups = overrides.groups ?? groups
    const _names = overrides.names ?? groupNames

    const p = new URLSearchParams()
    p.set("mode", _mode)
    if (_groups.length) p.set("groups", encodeGroups(_groups))

    const namesToSave = _groups.map((_, i) => _names[i] || `Group ${i + 1}`)
    if (namesToSave.some((n, i) => n !== `Group ${i + 1}`)) {
      p.set("names", encodeNames(namesToSave))
    }

    // metrics: use override, else preserve current URL value
    const metricsRaw = overrides.metrics !== undefined
      ? (overrides.metrics.length ? overrides.metrics.join(",") : null)
      : params.get("metrics")
    if (metricsRaw) p.set("metrics", metricsRaw)

    // years: null = show all (clear param); array = filter; undefined = preserve current
    if (overrides.years !== undefined) {
      const y = overrides.years
      if (y !== null && y.length > 0 && y.length < allYears.length) {
        p.set("years", y.join(","))
      }
    } else {
      const yearsRaw = params.get("years")
      if (yearsRaw) p.set("years", yearsRaw)
    }

    router.replace(`/compare?${p.toString()}`)
  }

  function switchMode(m: Mode) { setUrl({ mode: m, groups: [], years: null }) }

  function renameGroup(groupIdx: number, name: string) {
    const newNames = groupNames.map((n, i) => (i === groupIdx ? name : n))
    setUrl({ names: newNames })
  }

  function removeItem(groupIdx: number, itemId: string) {
    const next = groups.map(g => [...g])
    next[groupIdx] = next[groupIdx].filter(x => x !== itemId)
    if (next[groupIdx].length === 0) next.splice(groupIdx, 1)
    setUrl({ groups: next })
  }

  function removeGroup(groupIdx: number) {
    setUrl({ groups: groups.filter((_, i) => i !== groupIdx) })
  }

  function toggleMetric(key: string) {
    const next = new Set(activeMetrics)
    if (next.has(key)) { if (next.size > 1) next.delete(key) }
    else next.add(key)
    setUrl({ metrics: [...next] })
  }

  function toggleYear(year: number) {
    let next: number[]
    if (selectedYears.includes(year)) {
      if (selectedYears.length <= 1) return
      next = selectedYears.filter(y => y !== year)
    } else {
      next = [...selectedYears, year].sort((a, b) => a - b)
    }
    setUrl({ years: next.length === allYears.length ? null : next })
  }

  function onDragStart({ active }: DragStartEvent) {
    setDraggingId(active.id as string)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDraggingId(null)
    if (!over) return
    const itemId = active.data.current?.id as string
    if (!itemId) return

    const overId = over.id as string

    if (overId === "new-group") {
      setUrl({ groups: [...groups, [itemId]] })
      return
    }

    const match = overId.match(/^group-(\d+)$/)
    if (!match) return
    const gi = parseInt(match[1], 10)
    if (gi >= groups.length) return
    if (groups[gi].includes(itemId)) return // already in group
    const next = groups.map(g => [...g])
    next[gi] = [...next[gi], itemId]
    setUrl({ groups: next })
  }

  const chartData = useMemo(() =>
    selectedYears.map(year => {
      const row: Record<string, number | string> = { year: String(year) }
      compiled.forEach(g => {
        const vals = sumEntries(g.entries, year)
        selectedMetrics.forEach(m => {
          row[`${g.label}||${m.key}`] = m.key === "pct"
            ? +vals.pct.toFixed(1)
            : vals[m.key as keyof typeof vals] as number
        })
      })
      return row
    })
  , [selectedYears, compiled, selectedMetrics])

  const draggingItem = draggingId
    ? panelItems.find(p => p.id === draggingId)
    : null

  return (
    <DndContext onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDraggingId(null)}>
      <div className="bg-gray-50 flex flex-col">

        {/* Top bar */}
        <div className="bg-white border-b px-6 py-3 flex items-center gap-3 shrink-0">
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {(["project", "department"] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${
                  mode === m ? "bg-indigo-500 text-white" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m === "project" ? "Project" : "Department"}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">
            {compiled.length === 0
              ? "Drag items from the left into a group"
              : `${compiled.length} group${compiled.length > 1 ? "s" : ""} · ${groups.flat().length} items`}
          </span>
        </div>

        <div className="flex">
          {/* ── Left panel — sticky so it stays visible while right panel scrolls ── */}
          <div className="w-64 border-r bg-white flex flex-col shrink-0 sticky top-0 h-screen">
            <div className="p-3 border-b shrink-0">
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <p className="text-center text-gray-400 text-sm py-10">Loading…</p>
              ) : panelItems.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">No results</p>
              ) : (
                panelItems.map(item => (
                  <DraggableItem
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    sub={item.sub}
                    inUse={allInGroups.has(item.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 p-6 space-y-6 min-w-0">

            {/* Groups row */}
            <div className="flex items-start gap-3 flex-wrap">
              {groups.map((groupIds, gi) => (
                <DroppableGroup
                  key={gi}
                  groupIdx={gi}
                  groupIds={groupIds}
                  color={COLORS[gi % COLORS.length]}
                  name={groupNames[gi] ?? `Group ${gi + 1}`}
                  getLabel={getLabel}
                  onRename={name => renameGroup(gi, name)}
                  onRemoveItem={id => removeItem(gi, id)}
                  onRemoveGroup={() => removeGroup(gi)}
                />
              ))}
              <NewGroupZone />
            </div>

            {loading && (
              <div className="text-center text-gray-400 text-sm py-12">Loading…</div>
            )}

            {!loading && groups.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-16">
                <div className="text-4xl mb-3">←</div>
                Drag projects or departments from the left panel into a group
              </div>
            )}

            {!loading && compiled.length > 0 && (
              <>
                {/* Metric + Year toggles */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 font-semibold w-14 shrink-0">Metrics:</span>
                    {METRICS.map(m => {
                      const on = activeMetrics.has(m.key)
                      return (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => toggleMetric(m.key)}
                          className={`px-3 py-1 rounded-md border text-xs font-semibold transition-colors ${
                            on
                              ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                              : "border-gray-200 bg-white text-gray-400"
                          }`}
                        >
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500 font-semibold w-14 shrink-0">Years:</span>
                    <button
                      type="button"
                      onClick={() => setUrl({ years: null })}
                      className={`px-3 py-1 rounded-md border text-xs font-semibold transition-colors ${
                        selectedYears.length === allYears.length
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-gray-200 bg-white text-gray-400"
                      }`}
                    >
                      All
                    </button>
                    {allYears.map(y => {
                      const on = selectedYears.includes(y)
                      return (
                        <button
                          key={y}
                          type="button"
                          onClick={() => toggleYear(y)}
                          className={`px-3 py-1 rounded-md border text-xs font-semibold transition-colors ${
                            on
                              ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                              : "border-gray-200 bg-white text-gray-400"
                          }`}
                        >
                          {y}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Comparison table */}
                <div className="bg-white rounded-xl border overflow-auto">
                  <table className="text-xs border-collapse min-w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 border-b whitespace-nowrap sticky left-0 bg-gray-50 z-10">
                          Group / Metric
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600 border-b whitespace-nowrap bg-gray-100">
                          Total
                        </th>
                        {selectedYears.map(y => (
                          <th key={y} className="text-right px-4 py-3 font-semibold text-gray-600 border-b whitespace-nowrap">
                            {y}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compiled.map((g, gi) => (
                        <>
                          <tr key={`${gi}-hdr`} style={{ background: COLORS[gi % COLORS.length] + "12" }}>
                            <td
                              colSpan={selectedYears.length + 2}
                              className="px-4 py-2 sticky left-0 z-10"
                              style={{ background: "inherit" }}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ background: COLORS[gi % COLORS.length] }}
                                />
                                <span className="font-bold text-gray-700">{groupNames[gi] ?? `Group ${gi + 1}`}</span>
                                <span className="text-gray-400">{g.displayLabel}</span>
                              </div>
                            </td>
                          </tr>
                          {selectedMetrics.map(m => {
                            const filteredEntries = g.entries.filter(e => selectedYears.includes(e.year))
                            const totalVal = sumEntries(filteredEntries)[m.key as keyof ReturnType<typeof sumEntries>] as number
                            return (
                              <tr
                                key={`${gi}-${m.key}`}
                                className="border-b border-gray-100 hover:bg-gray-50"
                              >
                                <td className="px-4 py-2 pl-8 text-gray-500 sticky left-0 bg-white z-10 whitespace-nowrap">
                                  {m.label}
                                </td>
                                <td className={`px-4 py-2 text-right font-mono bg-gray-50 font-semibold ${
                                  m.key === "remain" && totalVal < 0 ? "text-red-500" : "text-gray-700"
                                }`}>
                                  {fmt(totalVal, m.key === "pct")}
                                </td>
                                {selectedYears.map(year => {
                                  const vals = sumEntries(g.entries, year)
                                  const v = vals[m.key as keyof typeof vals] as number
                                  return (
                                    <td
                                      key={year}
                                      className={`px-4 py-2 text-right font-mono ${
                                        m.key === "remain" && v < 0
                                          ? "text-red-500"
                                          : m.key === "pct"
                                            ? "font-semibold text-gray-700"
                                            : "text-gray-700"
                                      }`}
                                    >
                                      {fmt(v, m.key === "pct")}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Trend chart */}
                <div className="bg-white rounded-xl border p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickCount={8}
                        tickFormatter={v => {
                          const n = Number(v)
                          return Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "K" : n.toFixed(1)
                        }}
                      />
                      <Tooltip
                        formatter={(v, _name, props) => {
                          const metricKey = String((props as { dataKey?: string }).dataKey ?? "").split("||")[1] ?? ""
                          return [fmt(Number(v), metricKey === "pct"), _name]
                        }}
                      />
                      <Legend />
                      {compiled.flatMap((g, gi) =>
                        selectedMetrics.map((m, mi) => (
                          <Line
                            key={`${g.label}||${m.key}`}
                            type="monotone"
                            dataKey={`${g.label}||${m.key}`}
                            name={`${groupNames[gi] ?? `Group ${gi + 1}`} — ${m.label}`}
                            stroke={COLORS[gi % COLORS.length]}
                            strokeWidth={2}
                            strokeDasharray={mi === 0 ? undefined : "5 3"}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        ))
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingItem ? (
          <div className="px-3 py-2 bg-white border border-indigo-300 rounded-lg shadow-xl text-sm cursor-grabbing">
            {draggingItem.sub && (
              <div className="font-mono text-[11px] text-gray-400">{draggingItem.sub}</div>
            )}
            <div className="text-gray-700">{draggingItem.label}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
