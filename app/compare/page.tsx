"use client"

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react"
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { api } from "@/lib/api"
import type { FlatProject, Snapshot, SourceYearEntry } from "@/lib/types"

// ── Constants ─────────────────────────────────────────────────────────────────

type Mode = "project" | "department" | "overall"

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

// Group items carry their source tagged onto the id ("<id>::<source>") so the
// same project/department can be compared against a different snapshot/live
// version across groups. Untagged ids (old saved URLs) default to "live".
const TAG_SEP = "::"
function tagId(id: string, source: string): string {
  return `${id}${TAG_SEP}${source}`
}
function parseTaggedId(tagged: string): { id: string; source: string } {
  const i = tagged.lastIndexOf(TAG_SEP)
  if (i === -1) return { id: tagged, source: "live" }
  return { id: tagged.slice(0, i), source: tagged.slice(i + TAG_SEP.length) }
}

function buildGroups(mode: Mode, groups: string[][], sourcesCache: Record<string, FlatProject[]>): CompiledGroup[] {
  return groups.map(tagged => {
    const parsed = tagged.map(parseTaggedId)
    if (mode === "project") {
      const matched = parsed.flatMap(({ id, source }) => {
        const p = (sourcesCache[source] ?? []).find(x => x.project_code === id)
        return p ? [p] : []
      })
      return {
        label: tagged.join(" + "),
        displayLabel: matched.map(p => p.name).join(", ") || parsed.map(p => p.id).join(", "),
        ids: tagged,
        entries: matched.flatMap(p => p.source_breakdown),
      }
    }
    const matched = parsed.flatMap(({ id, source }) =>
      (sourcesCache[source] ?? []).filter(p => (p.department ?? p.division ?? "") === id)
    )
    return {
      label: tagged.join(" + "),
      displayLabel: parsed.map(p => p.id).join(", "),
      ids: tagged,
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

// ── Overall snapshot comparison ───────────────────────────────────────────────

type OvFundVals = { commit: number; invest: number }
type OvSourceRow = { source: string; budget: OvFundVals; target: OvFundVals; cut_transfer: number; under_budget: number }
type OvTypeAgg = { type: string; rows: OvSourceRow[]; budget: OvFundVals; target: OvFundVals; cut_transfer: number; under_budget: number }
type OvDetail = "total" | "commit" | "invest"

const OV_TYPE_LABELS: Record<string, string> = { Y: "งานรายปี", CY: "เปลี่ยนแปลงงบรายปี", C: "แผนระยะยาว", CC: "เปลี่ยนแปลงแผนงาน", L: "สัญญาเช่า" }
const OV_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Y:  { bg: "#DBEAFE", text: "#1E3A8A" },
  CY: { bg: "#CFFAFE", text: "#164E63" },
  C:  { bg: "#D1FAE5", text: "#065F46" },
  CC: { bg: "#FFE4E6", text: "#9F1239" },
  L:  { bg: "#FDE68A", text: "#92400E" },
}

function ovTotal(v: OvFundVals) { return v.commit + v.invest }

function aggregateOverall(data: FlatProject[], year: number): OvTypeAgg[] {
  return ["Y", "CY", "C", "CC", "L"].map(type => {
    const sourceMap: Record<string, { budget: OvFundVals; target: OvFundVals; cut_transfer: number; under_budget: number }> = {}
    data.filter(p => p.project_type === type).forEach(p => {
      p.source_breakdown.filter(e => e.year === year).forEach(e => {
        if (!sourceMap[e.source]) sourceMap[e.source] = {
          budget: { commit: 0, invest: 0 }, target: { commit: 0, invest: 0 },
          cut_transfer: 0, under_budget: 0,
        }
        if (e.fund_type === "ผูกพัน") {
          sourceMap[e.source].budget.commit += e.budget
          sourceMap[e.source].target.commit += e.target
        } else {
          sourceMap[e.source].budget.invest += e.budget
          sourceMap[e.source].target.invest += e.target
        }
        sourceMap[e.source].cut_transfer += e.cut_transfer
        sourceMap[e.source].under_budget += e.under_budget
      })
    })
    const rows = Object.entries(sourceMap)
      .map(([source, vals]) => ({ source, ...vals }))
      .filter(r => ovTotal(r.budget) !== 0 || ovTotal(r.target) !== 0)
    const budget: OvFundVals = { commit: 0, invest: 0 }
    const target: OvFundVals = { commit: 0, invest: 0 }
    let cut_transfer = 0, under_budget = 0
    rows.forEach(r => {
      budget.commit += r.budget.commit; budget.invest += r.budget.invest
      target.commit += r.target.commit; target.invest += r.target.invest
      cut_transfer += r.cut_transfer; under_budget += r.under_budget
    })
    return { type, rows, budget, target, cut_transfer, under_budget }
  }).filter(t => ovTotal(t.budget) !== 0 || ovTotal(t.target) !== 0)
}

function loadSource(src: string): Promise<FlatProject[]> {
  return src.startsWith("snap-")
    ? api.getSnapshot(parseInt(src.slice(5), 10)).then(d => d.data)
    : api.flatProjects()
}

function getSourceLabel(src: string, snapshots: Snapshot[]) {
  if (src === "live") return "Live"
  const id = parseInt(src.slice(5), 10)
  return snapshots.find(s => s.id === id)?.label ?? src
}

function fmtOv(n: number) {
  if (n === 0) return <span className="text-gray-300">—</span>
  return <>{n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</>
}

function fmtDelta(delta: number) {
  if (Math.abs(delta) < 0.0005) return <span className="text-gray-300">—</span>
  const s = Math.abs(delta).toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
  return delta > 0
    ? <span className="text-emerald-600">{s}</span>
    : <span className="text-red-500">({s})</span>
}

function getProjectVals(p: FlatProject, year: number) {
  const entries = p.source_breakdown.filter(e => e.year === year)
  const b_commit = entries.filter(e => e.fund_type === "ผูกพัน").reduce((s, e) => s + e.budget, 0)
  const b_invest = entries.filter(e => e.fund_type === "ลงทุน").reduce((s, e) => s + e.budget, 0)
  const t_commit = entries.filter(e => e.fund_type === "ผูกพัน").reduce((s, e) => s + e.target, 0)
  const t_invest = entries.filter(e => e.fund_type === "ลงทุน").reduce((s, e) => s + e.target, 0)
  const cut = entries.reduce((s, e) => s + e.cut_transfer, 0)
  const ub = entries.reduce((s, e) => s + e.under_budget, 0)
  return { b_commit, b_invest, budget: b_commit + b_invest, t_commit, t_invest, target: t_commit + t_invest, cut, ub }
}

function OverallCompare() {
  const router = useRouter()
  const params = useSearchParams()
  const src1 = params.get("src1") ?? "live"
  const src2 = params.get("src2") ?? "live"
  const detailParam = params.get("detail")
  const detail: OvDetail = (detailParam === "commit" || detailParam === "invest") ? detailParam : "total"

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [data1, setData1] = useState<FlatProject[]>([])
  const [data2, setData2] = useState<FlatProject[]>([])
  const [loading1, setLoading1] = useState(true)
  const [loading2, setLoading2] = useState(true)
  const scrollRef1 = useRef<HTMLDivElement>(null)
  const scrollRef2 = useRef<HTMLDivElement>(null)

  useEffect(() => { api.snapshots().then(setSnapshots) }, [])
  useEffect(() => { setLoading1(true); loadSource(src1).then(d => { setData1(d); setLoading1(false) }) }, [src1])
  useEffect(() => { setLoading2(true); loadSource(src2).then(d => { setData2(d); setLoading2(false) }) }, [src2])

  useEffect(() => {
    const el1 = scrollRef1.current
    const el2 = scrollRef2.current
    if (!el1 || !el2) return
    let busy = false
    const s1 = () => { if (!busy) { busy = true; el2.scrollLeft = el1.scrollLeft; busy = false } }
    const s2 = () => { if (!busy) { busy = true; el1.scrollLeft = el2.scrollLeft; busy = false } }
    el1.addEventListener("scroll", s1)
    el2.addEventListener("scroll", s2)
    return () => { el1.removeEventListener("scroll", s1); el2.removeEventListener("scroll", s2) }
  })

  const currentBEYear = new Date().getFullYear() + 543

  const allYears = useMemo(() => {
    const s = new Set<number>()
    ;[...data1, ...data2].forEach(p => p.source_breakdown.forEach(e => s.add(e.year)))
    return [...s].sort()
  }, [data1, data2])

  const ovYearFrom = params.get("ovyfrom")
  const ovYearTo = params.get("ovyto")
  const yearFrom = ovYearFrom ? Number(ovYearFrom) : currentBEYear
  const yearTo = ovYearTo ? Number(ovYearTo) : currentBEYear + 2

  const displayYears = useMemo(() => {
    const filtered = allYears.filter(y => y >= yearFrom && y <= yearTo)
    return filtered.length > 0 ? filtered : allYears.slice(0, 3)
  }, [allYears, yearFrom, yearTo])

  function setOvUrl(overrides: { src1?: string; src2?: string; detail?: OvDetail; ovyfrom?: number; ovyto?: number }) {
    const p = new URLSearchParams()
    p.set("mode", "overall")
    const s1 = overrides.src1 ?? src1
    const s2 = overrides.src2 ?? src2
    if (s1 !== "live") p.set("src1", s1)
    if (s2 !== "live") p.set("src2", s2)
    const det: OvDetail = overrides.detail ?? detail
    if (det !== "total") p.set("detail", det)
    const yf = "ovyfrom" in overrides ? overrides.ovyfrom! : yearFrom
    const yt = "ovyto" in overrides ? overrides.ovyto! : yearTo
    if (yf !== currentBEYear) p.set("ovyfrom", String(yf))
    if (yt !== currentBEYear + 2) p.set("ovyto", String(yt))
    router.replace(`/compare?${p.toString()}`)
  }

  const agg1ByYear = useMemo(() => {
    const r: Record<number, OvTypeAgg[]> = {}
    displayYears.forEach(y => { r[y] = aggregateOverall(data1, y) })
    return r
  }, [data1, displayYears])

  const agg2ByYear = useMemo(() => {
    const r: Record<number, OvTypeAgg[]> = {}
    displayYears.forEach(y => { r[y] = aggregateOverall(data2, y) })
    return r
  }, [data2, displayYears])

  const emptyFunds: OvFundVals = { commit: 0, invest: 0 }
  const emptyGrand = { budget: emptyFunds, target: emptyFunds }

  const grand1ByYear = useMemo(() => {
    const r: Record<number, typeof emptyGrand> = {}
    displayYears.forEach(y => {
      r[y] = (agg1ByYear[y] ?? []).reduce(
        (a, t) => ({ budget: { commit: a.budget.commit + t.budget.commit, invest: a.budget.invest + t.budget.invest }, target: { commit: a.target.commit + t.target.commit, invest: a.target.invest + t.target.invest } }),
        { budget: { commit: 0, invest: 0 }, target: { commit: 0, invest: 0 } }
      )
    })
    return r
  }, [agg1ByYear, displayYears])

  const grand2ByYear = useMemo(() => {
    const r: Record<number, typeof emptyGrand> = {}
    displayYears.forEach(y => {
      r[y] = (agg2ByYear[y] ?? []).reduce(
        (a, t) => ({ budget: { commit: a.budget.commit + t.budget.commit, invest: a.budget.invest + t.budget.invest }, target: { commit: a.target.commit + t.target.commit, invest: a.target.invest + t.target.invest } }),
        { budget: { commit: 0, invest: 0 }, target: { commit: 0, invest: 0 } }
      )
    })
    return r
  }, [agg2ByYear, displayYears])

  const allTypes = useMemo(() => {
    const types = new Set<string>()
    displayYears.forEach(y => {
      ;(agg1ByYear[y] ?? []).forEach(t => types.add(t.type))
      ;(agg2ByYear[y] ?? []).forEach(t => types.add(t.type))
    })
    return ["Y", "CY", "C", "CC", "L"].filter(t => types.has(t))
  }, [agg1ByYear, agg2ByYear, displayYears])

  const diffProjects = useMemo(() => {
    if (displayYears.length === 0) return []
    const empty = { b_commit: 0, b_invest: 0, budget: 0, t_commit: 0, t_invest: 0, target: 0, cut: 0, ub: 0 }
    type PV = typeof empty
    const map1 = new Map(data1.map(p => [p.project_code, p]))
    const map2 = new Map(data2.map(p => [p.project_code, p]))
    const codes = new Set([...map1.keys(), ...map2.keys()])
    const result: Array<{ code: string; name: string; ptype: string; valsByYear: Record<number, { v1: PV; v2: PV }> }> = []
    for (const code of codes) {
      const p1 = map1.get(code)
      const p2 = map2.get(code)
      const valsByYear: Record<number, { v1: PV; v2: PV }> = {}
      let hasDiff = false
      for (const year of displayYears) {
        const v1 = p1 ? getProjectVals(p1, year) : empty
        const v2 = p2 ? getProjectVals(p2, year) : empty
        valsByYear[year] = { v1, v2 }
        if (Math.abs(v1.budget - v2.budget) > 0.0005 || Math.abs(v1.target - v2.target) > 0.0005) hasDiff = true
      }
      if (hasDiff) result.push({ code, name: (p1 ?? p2)!.name, ptype: (p1 ?? p2)!.project_type, valsByYear })
    }
    return result.sort((a, b) => {
      const da = displayYears.reduce((s, y) => s + Math.abs(a.valsByYear[y].v2.budget - a.valsByYear[y].v1.budget), 0)
      const db = displayYears.reduce((s, y) => s + Math.abs(b.valsByYear[y].v2.budget - b.valsByYear[y].v1.budget), 0)
      return db - da
    })
  }, [data1, data2, displayYears])

  const sourceLabel1 = getSourceLabel(src1, snapshots)
  const sourceLabel2 = getSourceLabel(src2, snapshots)
  const loading = loading1 || loading2

  function detailVal(v: OvFundVals): number {
    if (detail === "commit") return v.commit
    if (detail === "invest") return v.invest
    return ovTotal(v)
  }
  const budgetLabel = detail === "commit" ? "งบผูกพัน" : detail === "invest" ? "งบลงทุน" : "วงเงินดำเนินการ"
  const targetLabel = detail === "commit" ? "เป้าผูกพัน" : detail === "invest" ? "เป้าลงทุน" : "เป้าหมายการเบิกจ่าย"

  const sourceOptions = [
    { value: "live", label: "Live" },
    ...snapshots.map(s => ({ value: `snap-${s.id}`, label: s.label })),
  ]

  const tdN = "py-1 px-2 text-right tabular-nums text-xs whitespace-nowrap"
  const thS = "py-1.5 px-2 text-center text-[11px] font-medium whitespace-nowrap"
  const LABEL_W = 220

  function abd(a: number, b: number, extraCls = "") {
    return (
      <>
        <td className={`${tdN} ${extraCls}`} style={{ minWidth: 100 }}>{fmtOv(a)}</td>
        <td className={`${tdN} text-center border-l border-r border-gray-200 bg-gray-50`} style={{ minWidth: 90 }}>{fmtDelta(b - a)}</td>
        <td className={tdN} style={{ minWidth: 100 }}>{fmtOv(b)}</td>
      </>
    )
  }
  function abdBold(a: number, b: number, color: string, extraCls = "") {
    return (
      <>
        <td className={`${tdN} font-bold ${extraCls}`} style={{ color, minWidth: 100 }}>{fmtOv(a)}</td>
        <td className={`${tdN} font-bold text-center border-l border-r border-gray-200 bg-gray-50`} style={{ minWidth: 90 }}>{fmtDelta(b - a)}</td>
        <td className={`${tdN} font-bold`} style={{ color, minWidth: 100 }}>{fmtOv(b)}</td>
      </>
    )
  }

  const colsPerYear = 6   // 2 metrics × 3 cols (A | Δ | B)
  const totalCols = 1 + displayYears.length * colsPerYear

  // Returns the left-border class for the first column of each year group
  function yearBorder(yi: number) {
    return yi === 0 ? "border-l-2 border-indigo-200" : "border-l-2 border-gray-300"
  }

  // Shared 3-row thead for both tables
  function renderThead(labelText: string) {
    return (
      <thead>
        {/* Row 1 — year groups */}
        <tr className="border-b bg-gray-50">
          <th
            rowSpan={3}
            className="text-left py-1.5 px-3 font-medium text-xs text-gray-500 sticky left-0 bg-white z-10 border-r"
            style={{ width: LABEL_W, minWidth: LABEL_W }}
          >
            {labelText}
          </th>
          {displayYears.map((year, yi) => (
            <th
              key={year}
              colSpan={colsPerYear}
              className={`${thS} text-gray-600 ${yearBorder(yi)}`}
            >
              ปี {year}
            </th>
          ))}
        </tr>
        {/* Row 2 — metric groups per year */}
        <tr className="border-b">
          {displayYears.map((year, yi) => (
            <Fragment key={year}>
              <th className={`${thS} text-gray-500 ${yearBorder(yi)}`} colSpan={3}>{budgetLabel}</th>
              <th className={`${thS} text-gray-500 border-l`} colSpan={3}>{targetLabel}</th>
            </Fragment>
          ))}
        </tr>
        {/* Row 3 — A / ปรับ / B per metric per year */}
        <tr className="border-b bg-gray-50">
          {displayYears.map((year, yi) => (
            <Fragment key={year}>
              {[0, 1].map(gi => (
                <Fragment key={gi}>
                  <th className={`${thS} text-indigo-500 ${gi === 0 ? yearBorder(yi) : "border-l"}`} style={{ minWidth: 100 }}>{sourceLabel1}</th>
                  <th className={`${thS} text-gray-400 border-l border-r border-gray-200`} style={{ minWidth: 90 }}>ปรับ เพิ่ม/(ลด)</th>
                  <th className={`${thS} text-amber-500`} style={{ minWidth: 100 }}>{sourceLabel2}</th>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tr>
      </thead>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(["project", "department", "overall"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { if (m !== "overall") router.replace(`/compare?mode=${m}`) }}
              className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${
                m === "overall" ? "bg-indigo-500 text-white" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {m === "project" ? "Project" : m === "department" ? "Department" : "Overall"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5">A</span>
          <select value={src1} onChange={e => setOvUrl({ src1: e.target.value })} className="border rounded-lg px-2 py-1 text-xs text-gray-700">
            {sourceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="text-xs text-gray-400">vs</span>
          <span className="text-xs font-semibold text-amber-600 bg-amber-50 rounded px-1.5 py-0.5">B</span>
          <select value={src2} onChange={e => setOvUrl({ src2: e.target.value })} className="border rounded-lg px-2 py-1 text-xs text-gray-700">
            {sourceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {allYears.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">ปี:</span>
            <select
              value={yearFrom}
              onChange={e => setOvUrl({ ovyfrom: Number(e.target.value) })}
              className="border rounded-lg px-2 py-1 text-xs text-gray-700"
            >
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xs text-gray-400">–</span>
            <select
              value={yearTo}
              onChange={e => setOvUrl({ ovyto: Number(e.target.value) })}
              className="border rounded-lg px-2 py-1 text-xs text-gray-700"
            >
              {allYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-gray-400">Detail:</span>
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {(["total", "commit", "invest"] as OvDetail[]).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setOvUrl({ detail: d })}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  detail === d ? "bg-white shadow text-gray-700" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {d === "total" ? "รวม" : d === "commit" ? "ผูกพัน" : "ลงทุน"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {loading && <div className="text-center py-20 text-gray-400 text-sm">Loading…</div>}

        {!loading && displayYears.length > 0 && (
          <div ref={scrollRef1} className="bg-white rounded-xl border overflow-x-auto">
            <div className="p-4 border-b flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-600">สรุปงบประมาณ ปี {displayYears.join(" · ")}</h3>
              <span className="text-xs text-gray-400">หน่วย: ล้านบาท</span>
            </div>
            <table className="text-xs border-collapse">
              {renderThead("ประเภท / แหล่งเงิน")}
              <tbody>
                {allTypes.map(type => {
                  const colors = OV_TYPE_COLORS[type] ?? { bg: "#F3F4F6", text: "#374151" }
                  const allSources = [...new Set(displayYears.flatMap(y => [
                    ...((agg1ByYear[y] ?? []).find(t => t.type === type)?.rows.map(r => r.source) ?? []),
                    ...((agg2ByYear[y] ?? []).find(t => t.type === type)?.rows.map(r => r.source) ?? []),
                  ]))]
                  return (
                    <Fragment key={type}>
                      <tr>
                        <td colSpan={totalCols} className="py-1.5 px-3 text-xs font-semibold" style={{ background: colors.bg, color: colors.text }}>
                          {OV_TYPE_LABELS[type] ?? type}
                        </td>
                      </tr>
                      {allSources.map(source => (
                        <tr key={source} className="border-b border-gray-50">
                          <td className="py-1 pl-6 pr-3 text-gray-500 text-xs sticky left-0 bg-white z-10" style={{ width: LABEL_W, minWidth: LABEL_W }}>– {source}</td>
                          {displayYears.map((year, yi) => {
                            const t1y = (agg1ByYear[year] ?? []).find(t => t.type === type)
                            const t2y = (agg2ByYear[year] ?? []).find(t => t.type === type)
                            const rb1 = t1y?.rows.find(r => r.source === source)?.budget ?? emptyFunds
                            const rb2 = t2y?.rows.find(r => r.source === source)?.budget ?? emptyFunds
                            const rt1 = t1y?.rows.find(r => r.source === source)?.target ?? emptyFunds
                            const rt2 = t2y?.rows.find(r => r.source === source)?.target ?? emptyFunds
                            const yb = yearBorder(yi)
                            return (
                              <Fragment key={year}>
                                {abd(detailVal(rb1), detailVal(rb2), yb)}
                                {abd(detailVal(rt1), detailVal(rt2), "border-l")}
                              </Fragment>
                            )
                          })}
                        </tr>
                      ))}
                      <tr style={{ background: colors.bg }}>
                        <td className="py-1.5 px-3 font-semibold text-xs sticky left-0 z-10" style={{ color: colors.text, background: colors.bg, width: LABEL_W, minWidth: LABEL_W }}>
                          รวม{OV_TYPE_LABELS[type] ?? type}
                        </td>
                        {displayYears.map((year, yi) => {
                          const t1y = (agg1ByYear[year] ?? []).find(t => t.type === type)
                          const t2y = (agg2ByYear[year] ?? []).find(t => t.type === type)
                          const b1 = t1y?.budget ?? emptyFunds
                          const b2 = t2y?.budget ?? emptyFunds
                          const tg1 = t1y?.target ?? emptyFunds
                          const tg2 = t2y?.target ?? emptyFunds
                          const yb = yearBorder(yi)
                          return (
                            <Fragment key={year}>
                              {abdBold(detailVal(b1), detailVal(b2), colors.text, yb)}
                              {abdBold(detailVal(tg1), detailVal(tg2), colors.text, "border-l")}
                            </Fragment>
                          )
                        })}
                      </tr>
                    </Fragment>
                  )
                })}
                {allTypes.length > 0 && (
                  <tr className="bg-gray-100 border-t">
                    <td className="py-1.5 px-3 font-bold text-xs text-gray-700 sticky left-0 bg-gray-100 z-10" style={{ width: LABEL_W, minWidth: LABEL_W }}>รวมทั้งหมด</td>
                    {displayYears.map((year, yi) => {
                      const g1 = grand1ByYear[year] ?? emptyGrand
                      const g2 = grand2ByYear[year] ?? emptyGrand
                      const yb = yearBorder(yi)
                      return (
                        <Fragment key={year}>
                          {abd(detailVal(g1.budget), detailVal(g2.budget), `${yb} font-bold text-gray-700`)}
                          {abd(detailVal(g1.target), detailVal(g2.target), "border-l font-bold text-gray-700")}
                        </Fragment>
                      )
                    })}
                  </tr>
                )}
                {allTypes.length === 0 && (
                  <tr>
                    <td colSpan={totalCols} className="py-6 text-center text-gray-400 text-xs">ไม่มีข้อมูล</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && displayYears.length > 0 && diffProjects.length > 0 && (
          <div ref={scrollRef2} className="bg-white rounded-xl border overflow-x-auto">
            <div className="p-4 border-b flex items-center gap-3">
              <h3 className="text-sm font-semibold text-gray-600">รายการที่เปลี่ยนแปลง</h3>
              <span className="text-xs text-gray-400">{diffProjects.length} รายการ · หน่วย: ล้านบาท</span>
            </div>
            <table className="text-xs border-collapse">
              {renderThead("รายการ")}
              <tbody>
                {diffProjects.map(({ code, name, ptype, valsByYear }) => {
                  const rc = OV_TYPE_COLORS[ptype] ?? { bg: "#FFFFFF", text: "#374151" }
                  const bv = detail === "commit" ? "b_commit" : detail === "invest" ? "b_invest" : "budget"
                  const tv = detail === "commit" ? "t_commit" : detail === "invest" ? "t_invest" : "target"
                  return (
                    <tr key={code} className="border-b border-gray-50" style={{ background: rc.bg }}>
                      <td className="py-1 px-3 text-xs sticky left-0 z-10 whitespace-normal" style={{ width: LABEL_W, minWidth: LABEL_W, background: rc.bg, color: rc.text }}>{name}</td>
                      {displayYears.map((year, yi) => {
                        const { v1, v2 } = valsByYear[year]
                        const yb = yearBorder(yi)
                        return (
                          <Fragment key={year}>
                            {abd(v1[bv], v2[bv], yb)}
                            {abd(v1[tv], v2[tv], "border-l")}
                          </Fragment>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function ComparePage() {
  return <Suspense><CompareInner /></Suspense>
}

// ── Main component ────────────────────────────────────────────────────────────

function CompareInner() {
  const params = useSearchParams()
  const mode: Mode = (params.get("mode") as Mode) ?? "project"
  if (mode === "overall") return <OverallCompare />
  return <ProjectDeptCompare />
}

function ProjectDeptCompare() {
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

  const sourceParam = params.get("source") ?? "live"

  const [sourcesCache, setSourcesCache] = useState<Record<string, FlatProject[]>>({})
  const [search, setSearch] = useState("")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [totalEndYear, setTotalEndYear] = useState<number | "all">("all")
  const fetchingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    api.snapshots().then(setSnapshots)
  }, [])

  // Every source referenced by any group item (plus whatever is currently
  // being browsed in the left panel) needs its own data loaded, so items
  // tagged to different sources/snapshots keep their own numbers.
  const neededSources = useMemo(() => {
    const s = new Set<string>([sourceParam])
    groups.flat().forEach(tagged => s.add(parseTaggedId(tagged).source))
    return [...s]
  }, [sourceParam, groups])

  useEffect(() => {
    neededSources.forEach(src => {
      if (sourcesCache[src] || fetchingRef.current.has(src)) return
      fetchingRef.current.add(src)
      loadSource(src).then(data => {
        setSourcesCache(prev => ({ ...prev, [src]: data }))
      })
    })
  }, [neededSources, sourcesCache])

  const projects = sourcesCache[sourceParam] ?? []
  const loading = !sourcesCache[sourceParam]

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

  const effTotalEndYear = totalEndYear === "all" || selectedYears.includes(totalEndYear) ? totalEndYear : "all"

  const compiled = useMemo(() => buildGroups(mode, groups, sourcesCache), [mode, groups, sourcesCache])
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

  // Tagged ids currently placed in a group, e.g. "I2566Y015::snap-6"
  const allInGroups = useMemo(() => new Set(groups.flat()), [groups])

  // Chip label shown inside a group — includes the source it's pinned to,
  // since the same project/department can appear tagged to different versions.
  const getLabel = (taggedId: string) => {
    const { id, source } = parseTaggedId(taggedId)
    const list = sourcesCache[source] ?? []
    const name = mode === "project" ? (list.find(p => p.project_code === id)?.name ?? id) : id
    return `${name} · ${getSourceLabel(source, snapshots)}`
  }

  function setUrl(overrides: {
    mode?: Mode
    groups?: string[][]
    names?: string[]
    metrics?: string[]
    years?: number[] | null
    source?: string
  }) {
    const _mode = overrides.mode ?? mode
    const _groups = overrides.groups ?? groups
    const _names = overrides.names ?? groupNames

    const p = new URLSearchParams()
    p.set("mode", _mode)
    const _source = overrides.source ?? sourceParam
    if (_source !== "live") p.set("source", _source)
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
    const rawId = active.data.current?.id as string
    if (!rawId) return
    // Tag with whatever source is currently browsed, so dropping the same
    // project/department while browsing a different source/snapshot creates
    // a distinct, independently-sourced group item.
    const itemId = tagId(rawId, sourceParam)

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
            {(["project", "department", "overall"] as Mode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => m === "overall" ? router.replace("/compare?mode=overall") : switchMode(m)}
                className={`px-4 py-1 rounded-md text-xs font-semibold transition-colors ${
                  mode === m ? "bg-indigo-500 text-white" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m === "project" ? "Project" : m === "department" ? "Department" : "Overall"}
              </button>
            ))}
          </div>

          {/* Source picker — controls which version new items are dragged FROM;
              each dropped item keeps its own source tag, so a project can be
              compared against a different version of itself across groups */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium" title="Items you drag in are tagged with this source">Add from:</span>
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setUrl({ source: "live" })}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  sourceParam === "live" ? "bg-white shadow text-gray-700" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                Live
              </button>
              {snapshots.map(s => {
                const key = `snap-${s.id}`
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setUrl({ source: key })}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      sourceParam === key ? "bg-white shadow text-gray-700" : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
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
                    inUse={allInGroups.has(tagId(item.id, sourceParam))}
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
                          <div className="flex items-center justify-end gap-1.5">
                            <span>ผลรวม-</span>
                            <select
                              value={effTotalEndYear}
                              onChange={e => setTotalEndYear(e.target.value === "all" ? "all" : Number(e.target.value))}
                              onClick={e => e.stopPropagation()}
                              className="text-right font-normal border border-gray-300 rounded px-1 py-0.5 bg-white"
                              style={{ fontSize: 11 }}
                            >
                              <option value="all">สิ้นสุดแผนงาน</option>
                              {selectedYears.map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                          </div>
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
                            const filteredEntries = g.entries.filter(e =>
                              selectedYears.includes(e.year) && (effTotalEndYear === "all" || e.year <= effTotalEndYear)
                            )
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

                {/* Trend charts — one bar chart per metric */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {selectedMetrics.map(m => (
                    <div key={m.key} className="bg-white rounded-xl border p-6">
                      <div className="text-xs font-semibold text-gray-500 mb-2">{m.label}</div>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            tickCount={8}
                            domain={['auto', 'auto']}
                            tickFormatter={v => {
                              const n = Number(v)
                              return Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "K" : n.toFixed(1)
                            }}
                          />
                          <Tooltip formatter={(v, name) => [fmt(Number(v), m.key === "pct"), name]} />
                          <Legend />
                          {compiled.map((g, gi) => (
                            <Bar
                              key={`${g.label}||${m.key}`}
                              dataKey={`${g.label}||${m.key}`}
                              name={groupNames[gi] ?? `Group ${gi + 1}`}
                              fill={COLORS[gi % COLORS.length]}
                              radius={[3, 3, 0, 0]}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ))}
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
