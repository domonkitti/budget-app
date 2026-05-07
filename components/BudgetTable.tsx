"use client"

import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { FlatProject, SourceYearEntry, SubJobYearEntry } from "@/lib/types"

const FUND_COLUMNS = [
  { key: "committed", label: "ผูกพัน", fundType: "ผูกพัน" as const },
  { key: "invest", label: "ลงทุน", fundType: "ลงทุน" as const },
  { key: "total", label: "รวม", fundType: null },
] as const
const GROUPS = [
  { key: "Budget", label: "งบเงินดำเนินการปี" },
  { key: "Target", label: "เป้าหมายการเบิกจ่ายปี" },
  { key: "Remain", label: "คงเหลือ" },
] as const

const HMWAT_ORDER = [
  "หมวดสิ่งก่อสร้าง",
  "หมวดเครื่องจักรอุปกรณ์",
  "หมวดเครื่องใช้สำนักงานและเครื่องมือเครื่องใช้ขนาดเล็ก",
  "หมวดวิจัยและพัฒนา",
  "หมวดลงทุนอื่นๆ",
  "หมวดสำรองราคา",
  "หมวดสำรองกรณีจำเป็นเร่งด่วน",
]

type Group = (typeof GROUPS)[number]["key"]
type FundType = "ผูกพัน" | "ลงทุน"
type FundColumnKey = (typeof FUND_COLUMNS)[number]["key"]
type SortDir = "asc" | "desc"
type NumericFilter = { min: string; max: string }
type MoneySortState = { kind: "money"; year: number; group: Group; fundKey: FundColumnKey; dir: SortDir }
type YearSortState = { kind: "year"; dir: SortDir }
type ItemSortState = { kind: "item"; dir: SortDir }
type SortState = MoneySortState | YearSortState | ItemSortState | null

function fmt(n: number) {
  if (n === 0) return <span style={{ color: "#D1D5DB" }}>-</span>
  return n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function metricValue(
  entry: Pick<SourceYearEntry, "budget" | "target" | "remain">,
  group: Group,
): number {
  return group === "Budget" ? entry.budget : group === "Target" ? entry.target : entry.remain
}

function getVal(
  breakdown: SourceYearEntry[],
  year: number,
  source: string | null,
  fundType: FundType | null,
  group: Group,
): number {
  return breakdown.reduce((sum, entry) => {
    if (entry.year !== year) return sum
    if (source !== null && entry.source !== source) return sum
    if (fundType !== null && entry.fund_type !== fundType) return sum
    return sum + metricValue(entry, group)
  }, 0)
}

function getSubJobVal(
  subJobs: SubJobYearEntry[],
  name: string | null,
  year: number,
  fundType: FundType | null,
  group: Group,
): number {
  return subJobs.reduce((sum, entry) => {
    if (entry.year !== year) return sum
    if (name !== null && entry.name !== name) return sum
    if (fundType !== null && entry.fund_type !== fundType) return sum
    return sum + metricValue(entry, group)
  }, 0)
}

function subJobRank(
  a: { sort_order: number | null; name: string },
  b: { sort_order: number | null; name: string },
) {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
  return ao - bo || a.name.localeCompare(b.name, "th")
}

function sourceRank(source: string) {
  const order = [
    "เงินกู้",
    "เงินกู้ในประเทศ",
    "เงินรายได้ กฟภ.",
    "เงินสมทบผู้ใช้ไฟ",
    "เงินสมทบจากผู้ใช้ไฟ",
  ]
  const idx = order.indexOf(source)
  return idx === -1 ? order.length : idx
}

function sumProjects(projects: FlatProject[], year: number, fundType: FundType | null, group: Group) {
  return projects.reduce((s, p) => s + getVal(p.source_breakdown, year, null, fundType, group), 0)
}

function sumProjectsBySource(projects: FlatProject[], year: number, source: string, fundType: FundType | null, group: Group) {
  return projects.reduce((s, p) => s + getVal(p.source_breakdown, year, source, fundType, group), 0)
}

function filterKey(year: number, group: Group, fundKey: FundColumnKey) {
  return `${year}-${group}-${fundKey}`
}

function parseFilterValue(value: string) {
  const cleaned = value.replace(/,/g, "").trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function itemNoCompare(a: string | null, b: string | null) {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b, "th", { numeric: true, sensitivity: "base" })
}

function workbookSafeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_")
}

function excelMoney(n: number) {
  return Number(n.toFixed(3))
}

// ─── Dropdown primitives ────────────────────────────────────────────────────

function DropdownMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#F9FAFB",
          border: "0.5px solid #E5E7EB",
          color: "#374151",
          borderRadius: 10,
          padding: "5px 12px",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          outline: "none",
        }}
      >
        {label} <span style={{ fontSize: 9, color: "#6B7280" }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            background: "#F9FAFB",
            border: "0.5px solid #D1D5DB",
            borderRadius: 10,
            padding: "6px 4px",
            minWidth: 160,
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function DropdownItem({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 12px",
        background: "none",
        border: "none",
        color: checked ? "#111827" : "#6B7280",
        fontSize: 12,
        cursor: "pointer",
        borderRadius: 6,
        textAlign: "left",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          background: checked ? "#3B82F6" : "transparent",
          border: checked ? "none" : "1px solid #D1D5DB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {checked && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1 }}>✓</span>}
      </span>
      {label}
    </button>
  )
}

// ─── Pivot filter (multi-select dropdown, Excel-style) ───────────────────────

function PivotFilter({
  allValues,
  selected,
  onChange,
}: {
  allValues: string[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const isAll = selected.size === 0
  const label =
    isAll ? "All"
    : selected.size === 1 ? ([...selected][0] || "(none)")
    : `${selected.size} / ${allValues.length}`

  const visible = allValues.filter((v) =>
    (v || "(none)").toLowerCase().includes(search.toLowerCase()),
  )

  function toggle(val: string) {
    const next = new Set(selected)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    if (next.size === allValues.length) onChange(new Set())
    else onChange(next)
  }

  const checked = (val: string) => isAll || selected.has(val)

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 3,
          width: "100%",
          background: isAll ? "#fff" : "#EEF2FF",
          border: `0.5px solid ${isAll ? "#D1D5DB" : "#6366F1"}`,
          borderRadius: 5,
          padding: "2px 6px",
          fontSize: 11,
          color: isAll ? "#6B7280" : "#4338CA",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{label}</span>
        <svg width="8" height="8" viewBox="0 0 20 20" fill="currentColor" style={{ flexShrink: 0, opacity: 0.5 }}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            zIndex: 60,
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            minWidth: 180,
            maxWidth: 300,
          }}
        >
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #F3F4F6" }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                width: "100%",
                border: "1px solid #D1D5DB",
                borderRadius: 4,
                padding: "3px 7px",
                fontSize: 11,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "3px 10px 3px 8px", borderBottom: "1px solid #F3F4F6", gap: 2 }}>
            <button
              type="button"
              onClick={() => onChange(new Set())}
              style={{ background: "none", border: "none", fontSize: 10, color: "#6366F1", cursor: "pointer", padding: "1px 3px", fontWeight: 600 }}
            >
              Select all
            </button>
            <span style={{ color: "#D1D5DB", fontSize: 10 }}>·</span>
            <button
              type="button"
              onClick={() => onChange(new Set(visible))}
              style={{ background: "none", border: "none", fontSize: 10, color: "#6B7280", cursor: "pointer", padding: "1px 3px" }}
            >
              Clear
            </button>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#9CA3AF" }}>
              {isAll ? allValues.length : selected.size} shown
            </span>
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto", padding: "2px 0" }}>
            {visible.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 11, color: "#9CA3AF" }}>No results</div>
            )}
            {visible.map((val) => (
              <label
                key={val || "__none__"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "#374151",
                  background: checked(val) ? "#F9FAFB" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked(val)}
                  onChange={() => toggle(val)}
                  style={{ accentColor: "#6366F1", width: 12, height: 12, cursor: "pointer" }}
                />
                {val || <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>(none)</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

type Props = {
  data: FlatProject[]
  years: number[]
  extraColumn?: { header: React.ReactNode; cell: (project: FlatProject) => React.ReactNode }
}
export type BudgetTableHandle = { exportCurrentView: (label: string) => Promise<void> }

const BudgetTable = forwardRef<BudgetTableHandle, Props>(function BudgetTable({ data, years, extraColumn }, ref) {
  const [selNames, setSelNames] = useState<Set<string>>(new Set())
  const [selCodes, setSelCodes] = useState<Set<string>>(new Set())
  const [selDivisions, setSelDivisions] = useState<Set<string>>(new Set())
  const [selDepartments, setSelDepartments] = useState<Set<string>>(new Set())
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set())
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set())
  const [selYears, setSelYears] = useState<Set<string>>(new Set())
  const [selDisplayYears, setSelDisplayYears] = useState<Set<string>>(new Set())
  const [numFilters, setNumFilters] = useState<Record<string, NumericFilter>>({})
  const [sortState, setSortState] = useState<SortState>(null)
  const [showJobs, setShowJobs] = useState(true)
  const [showSources, setShowSources] = useState(true)
  const [infoVis, setInfoVis] = useState({
    code: false,
    division: false,
    department: false,
    group: false,
    type: false,
    year: false,
  })
  const [groupVis, setGroupVis] = useState<Record<Group, boolean>>({
    Budget: true,
    Target: true,
    Remain: true,
  })
  const [fundVis, setFundVis] = useState<Record<FundColumnKey, boolean>>({
    committed: true,
    invest: true,
    total: true,
  })

  const allDisplayYears = useMemo(
    () =>
      years.length > 0
        ? years
        : [...new Set(data.flatMap((row) => row.source_breakdown.map((entry) => entry.year)))].sort(),
    [data, years],
  )
  const displayYears = useMemo(() => {
    if (selDisplayYears.size === 0) return allDisplayYears
    const selected = allDisplayYears.filter((year) => selDisplayYears.has(String(year)))
    return selected.length > 0 ? selected : allDisplayYears
  }, [allDisplayYears, selDisplayYears])
  const displayYearLabel =
    selDisplayYears.size === 0
      ? "Years: All"
      : displayYears.length === 1
        ? `Years: ${displayYears[0]}`
        : `Years: ${displayYears.length} / ${allDisplayYears.length}`
  const allNames = useMemo(() => [...new Set(data.map((r) => r.name))].sort((a, b) => a.localeCompare(b, "th")), [data])
  const allCodes = useMemo(() => [...new Set(data.map((r) => r.project_code))].sort(), [data])
  const allDivisions = useMemo(() => [...new Set(data.map((r) => r.division ?? ""))].sort(), [data])
  const allDepartments = useMemo(() => [...new Set(data.map((r) => r.department ?? ""))].sort(), [data])
  const allGroups = useMemo(() => [...new Set(data.map((r) => r.group_name ?? ""))].sort(), [data])
  const allTypes = useMemo(() => [...new Set(data.map((r) => r.project_type))].sort(), [data])
  const allStartYears = useMemo(
    () => [...new Set(data.map((r) => String(r.year)))].sort(),
    [data],
  )

  const visibleGroups = GROUPS.filter((group) => groupVis[group.key])
  const visibleFunds = FUND_COLUMNS.filter((column) => fundVis[column.key])
  const leftColSpan =
    2 +
    Number(infoVis.code) +
    Number(infoVis.division) +
    Number(infoVis.department) +
    Number(infoVis.group) +
    Number(infoVis.type) +
    Number(infoVis.year)
  const hasMoneyColumns = visibleGroups.length > 0 && visibleFunds.length > 0

  const sources = useMemo(() => {
    const set = new Set<string>()
    data.forEach((row) => row.source_breakdown.forEach((entry) => set.add(entry.source)))
    return [...set].sort((a, b) => sourceRank(a) - sourceRank(b) || a.localeCompare(b, "th"))
  }, [data])

  function getSubJobRows(row: FlatProject) {
    const byName = new Map<string, { name: string; sort_order: number | null }>()
    const subJobs = row.sub_jobs ?? []
    subJobs.forEach((entry) => {
      const existing = byName.get(entry.name)
      if (!existing || subJobRank(entry, existing) < 0) {
        byName.set(entry.name, { name: entry.name, sort_order: entry.sort_order })
      }
    })
    return [...byName.values()].sort(subJobRank)
  }

  const filtered = useMemo(() => {
    const numericColumns = displayYears.flatMap((year) =>
      visibleGroups.flatMap((group) =>
        visibleFunds.map((column) => ({
          year,
          group: group.key,
          fundType: column.fundType,
          filter: numFilters[filterKey(year, group.key, column.key)],
        })),
      ),
    )

    return data.filter((row) => {
      if (selNames.size > 0 && !selNames.has(row.name)) return false
      if (selCodes.size > 0 && !selCodes.has(row.project_code)) return false
      if (selDivisions.size > 0 && !selDivisions.has(row.division ?? "")) return false
      if (selDepartments.size > 0 && !selDepartments.has(row.department ?? "")) return false
      if (selGroups.size > 0 && !selGroups.has(row.group_name ?? "")) return false
      if (selTypes.size > 0 && !selTypes.has(row.project_type)) return false
      if (selYears.size > 0 && !selYears.has(String(row.year))) return false
      if (
        selDisplayYears.size > 0 &&
        displayYears.every((year) => getVal(row.source_breakdown, year, null, null, "Budget") === 0)
      ) {
        return false
      }

      return numericColumns.every((column) => {
        const min = parseFilterValue(column.filter?.min ?? "")
        const max = parseFilterValue(column.filter?.max ?? "")
        if (min === null && max === null) return true
        const value = getVal(row.source_breakdown, column.year, null, column.fundType, column.group)
        if (min !== null && value < min) return false
        if (max !== null && value > max) return false
        return true
      })
    })
  }, [data, displayYears, selNames, numFilters, selCodes, selDivisions, selDepartments, selGroups, selTypes, selYears, selDisplayYears, visibleFunds, visibleGroups])

  const sorted = useMemo(() => {
    if (!sortState) return filtered
    if (sortState.kind === "item") {
      return [...filtered].sort((a, b) =>
        sortState.dir === "asc"
          ? itemNoCompare(a.item_no, b.item_no)
          : itemNoCompare(b.item_no, a.item_no),
      )
    }
    if (sortState.kind === "year") {
      return [...filtered].sort((a, b) =>
        sortState.dir === "asc" ? a.year - b.year : b.year - a.year,
      )
    }
    const groupVisible = groupVis[sortState.group]
    const fundColumn = FUND_COLUMNS.find((column) => column.key === sortState.fundKey)
    if (!groupVisible || !fundColumn || !fundVis[sortState.fundKey]) return filtered
    return [...filtered].sort((a, b) => {
      const av = getVal(
        a.source_breakdown,
        sortState.year,
        null,
        fundColumn.fundType,
        sortState.group,
      )
      const bv = getVal(
        b.source_breakdown,
        sortState.year,
        null,
        fundColumn.fundType,
        sortState.group,
      )
      return sortState.dir === "asc" ? av - bv : bv - av
    })
  }, [filtered, fundVis, groupVis, sortState])

  type RenderedItem =
    | { kind: "project"; row: FlatProject }
    | { kind: "group-total"; label: string; projects: FlatProject[] }
    | { kind: "type-total"; label: string; projects: FlatProject[]; bg: string; color: string }

  const renderedItems = useMemo((): RenderedItem[] => {
    const items: RenderedItem[] = []
    type Seg = { type: string; rows: FlatProject[] }
    const segments: Seg[] = []
    for (const row of sorted) {
      const last = segments[segments.length - 1]
      if (!last || last.type !== row.project_type) segments.push({ type: row.project_type, rows: [row] })
      else last.rows.push(row)
    }
    for (const seg of segments) {
      if (seg.type === "Y") {
        type HmwatSeg = { group: string; rows: FlatProject[] }
        const hmwatSegs: HmwatSeg[] = []
        for (const row of seg.rows) {
          const g = row.group_name ?? ""
          const last = hmwatSegs[hmwatSegs.length - 1]
          if (!last || last.group !== g) hmwatSegs.push({ group: g, rows: [row] })
          else last.rows.push(row)
        }
        for (const hs of hmwatSegs) {
          for (const row of hs.rows) items.push({ kind: "project", row })
          items.push({ kind: "group-total", label: hs.group, projects: hs.rows })
        }
        items.push({ kind: "type-total", label: "รวมงานรายปี (Y)", projects: seg.rows, bg: "#DBEAFE", color: "#1E3A8A" })
      } else {
        for (const row of seg.rows) items.push({ kind: "project", row })
        const label = seg.type === "C" ? "รวมแผนระยะยาว (C)" : seg.type === "L" ? "รวมสัญญาเช่า (L)" : `รวม${seg.type}`
        const bg = seg.type === "C" ? "#D1FAE5" : "#FDE68A"
        const color = seg.type === "C" ? "#065F46" : "#92400E"
        items.push({ kind: "type-total", label, projects: seg.rows, bg, color })
      }
    }
    return items
  }, [sorted])

  function cycleItemSort() {
    setSortState((current) => {
      if (!current || current.kind !== "item") return { kind: "item", dir: "asc" }
      if (current.dir === "asc") return { kind: "item", dir: "desc" }
      return null
    })
  }

  function cycleMoneySort(year: number, group: Group, fundKey: FundColumnKey) {
    setSortState((current) => {
      if (
        !current ||
        current.kind !== "money" ||
        current.year !== year ||
        current.group !== group ||
        current.fundKey !== fundKey
      ) {
        return { kind: "money", year, group, fundKey, dir: "asc" }
      }
      if (current.dir === "asc") return { ...current, dir: "desc" }
      return null
    })
  }

  function cycleYearSort() {
    setSortState((current) => {
      if (!current || current.kind !== "year") return { kind: "year", dir: "asc" }
      if (current.dir === "asc") return { kind: "year", dir: "desc" }
      return null
    })
  }

  function updateNumFilter(
    year: number,
    group: Group,
    fundKey: FundColumnKey,
    part: keyof NumericFilter,
    value: string,
  ) {
    const key = filterKey(year, group, fundKey)
    setNumFilters((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { min: "", max: "" }), [part]: value },
    }))
  }

  function toggleDisplayYear(year: number, checked: boolean) {
    const key = String(year)
    const next =
      selDisplayYears.size === 0
        ? new Set(allDisplayYears.map((item) => String(item)))
        : new Set(selDisplayYears)
    if (checked) next.add(key)
    else next.delete(key)
    setSelDisplayYears(next.size === allDisplayYears.length ? new Set() : next)
  }

  function moneySortIcon(year: number, group: Group, fundKey: FundColumnKey) {
    if (
      !sortState ||
      sortState.kind !== "money" ||
      sortState.year !== year ||
      sortState.group !== group ||
      sortState.fundKey !== fundKey
    )
      return "↕"
    return sortState.dir === "asc" ? "↑" : "↓"
  }

  function yearSortIcon() {
    if (!sortState || sortState.kind !== "year") return "↕"
    return sortState.dir === "asc" ? "↑" : "↓"
  }

  function itemSortIcon() {
    if (!sortState || sortState.kind !== "item") return "↕"
    return sortState.dir === "asc" ? "↑" : "↓"
  }

  async function exportCurrentView(label: string) {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    const aoa: (string | number | null)[][] = []
    const infoHeaders = [
      "ข้อ",
      "รายการ",
      ...(infoVis.code ? ["Code"] : []),
      ...(infoVis.division ? ["Division"] : []),
      ...(infoVis.department ? ["Department"] : []),
      ...(infoVis.group ? ["Group"] : []),
      ...(infoVis.type ? ["Type"] : []),
      ...(infoVis.year ? ["Start Year"] : []),
    ]
    const moneyHeaders = hasMoneyColumns
      ? displayYears.flatMap((year) =>
          visibleGroups.flatMap((group) =>
            visibleFunds.map((column) =>
              group.key === "Remain"
                ? `${group.label} ${column.label}`
                : `${group.label} ${year} ${column.label}`,
            ),
          ),
        )
      : []

    aoa.push([label])
    aoa.push([`Exported: ${new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}`])
    aoa.push(["Values in millions (ล้านบาท)"])
    aoa.push([])
    aoa.push([...infoHeaders, ...moneyHeaders])

    function infoValues(row: FlatProject, name: string, itemNo: string | null = "") {
      return [
        itemNo ?? "",
        name,
        ...(infoVis.code ? [row.project_code] : []),
        ...(infoVis.division ? [row.division ?? ""] : []),
        ...(infoVis.department ? [row.department ?? ""] : []),
        ...(infoVis.group ? [row.group_name ?? ""] : []),
        ...(infoVis.type ? [row.project_type] : []),
        ...(infoVis.year ? [row.year] : []),
      ]
    }

    function projectMoneyValues(row: FlatProject) {
      if (!hasMoneyColumns) return []
      return displayYears.flatMap((year) =>
        visibleGroups.flatMap((group) =>
          visibleFunds.map((column) =>
            excelMoney(getVal(row.source_breakdown, year, null, column.fundType, group.key)),
          ),
        ),
      )
    }

    for (const row of sorted) {
      aoa.push([...infoValues(row, row.name, row.item_no), ...projectMoneyValues(row)])

      if (showJobs) {
        for (const [index, subJob] of getSubJobRows(row).entries()) {
          const values = hasMoneyColumns
            ? displayYears.flatMap((year) =>
                visibleGroups.flatMap((group) =>
                  visibleFunds.map((column) =>
                    excelMoney(getSubJobVal(row.sub_jobs ?? [], subJob.name, year, column.fundType, group.key)),
                  ),
                ),
              )
            : []
          aoa.push([...infoValues(row, `${index + 1}. ${subJob.name}`), ...values])
        }
      }

      if (showSources) {
        for (const source of sources) {
          const values = hasMoneyColumns
            ? displayYears.flatMap((year) =>
                visibleGroups.flatMap((group) =>
                  visibleFunds.map((column) =>
                    excelMoney(getVal(row.source_breakdown, year, source, column.fundType, group.key)),
                  ),
                ),
              )
            : []
          aoa.push([...infoValues(row, `- ${source}`), ...values])
        }
      }
    }

    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    sheet["!cols"] = [
      { wch: 8 },
      { wch: 55 },
      ...(infoVis.code ? [{ wch: 14 }] : []),
      ...(infoVis.division ? [{ wch: 14 }] : []),
      ...(infoVis.department ? [{ wch: 14 }] : []),
      ...(infoVis.group ? [{ wch: 14 }] : []),
      ...(infoVis.type ? [{ wch: 8 }] : []),
      ...(infoVis.year ? [{ wch: 10 }] : []),
      ...moneyHeaders.map(() => ({ wch: 16 })),
    ]
    sheet["!freeze"] = { xSplit: 0, ySplit: 5 }
    XLSX.utils.book_append_sheet(wb, sheet, "Current View")
    const date = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `${workbookSafeName(label)}_${date}.xlsx`)
  }

  useImperativeHandle(ref, () => ({ exportCurrentView }))

  // Style helpers
  const border = "0.5px solid #E5E7EB"
  const headBg = "#F9FAFB"

  const thBase: React.CSSProperties = {
    border,
    padding: "5px 8px",
    textAlign: "center",
    fontWeight: 600,
    color: "#6B7280",
    background: headBg,
    whiteSpace: "nowrap",
    fontSize: 11,
    position: "sticky",
  }

  const filterInput: React.CSSProperties = {
    background: "#ffffff",
    border: "0.5px solid #D1D5DB",
    color: "#374151",
    borderRadius: 4,
    padding: "2px 4px",
    fontSize: 11,
    outline: "none",
    minWidth: 0,
  }

  function numCellStyle(
    value: number,
    variant: "project" | "detail" = "detail",
  ): React.CSSProperties {
    return {
      border,
      padding: "4px 8px",
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      fontSize: 12,
      color: variant === "project" ? "#111827" : "#374151",
      background: variant === "project" ? "#F8FAFC" : "transparent",
      fontWeight: variant === "project" && value !== 0 ? 700 : 400,
    }
  }

  function infoCell(
    stickyLeft?: number,
    variant: "project" | "detail" = "detail",
  ): React.CSSProperties {
    return {
      border,
      padding: "4px 8px",
      color: variant === "project" ? "#111827" : "#374151",
      background: variant === "project" ? "#F8FAFC" : "#ffffff",
      fontSize: 12,
      fontWeight: variant === "project" ? 700 : 400,
      ...(stickyLeft !== undefined
        ? { position: "sticky", left: stickyLeft, zIndex: 2 }
        : {}),
    }
  }

  function renderTotalBlock(
    key: string,
    label: string,
    projects: FlatProject[],
    bg: string,
    color: string,
    bold: boolean,
  ) {
    const cellStyle: React.CSSProperties = {
      border,
      padding: "4px 8px",
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      fontSize: 12,
      color,
      background: bg,
      fontWeight: bold ? 700 : 600,
    }
    const srcCellStyle: React.CSSProperties = { ...cellStyle, fontWeight: 400 }
    return (
      <Fragment key={key}>
        <tr style={{ background: bg }}>
          <td style={{ ...infoCell(0), background: bg, color, fontWeight: bold ? 700 : 600, width: 44, textAlign: "center" }} />
          <td style={{ ...infoCell(44), background: bg, color, fontWeight: bold ? 700 : 600, minWidth: 360, maxWidth: 360, whiteSpace: "normal", wordBreak: "break-word" }}>
            {label}
          </td>
          {extraColumn && <td style={{ ...infoCell(), background: bg }} />}
          {infoVis.code && <td style={{ ...infoCell(), background: bg }} />}
          {infoVis.division && <td style={{ ...infoCell(), background: bg }} />}
          {infoVis.department && <td style={{ ...infoCell(), background: bg }} />}
          {infoVis.group && <td style={{ ...infoCell(), background: bg }} />}
          {infoVis.type && <td style={{ ...infoCell(), background: bg }} />}
          {infoVis.year && <td style={{ ...infoCell(), background: bg }} />}
          {hasMoneyColumns && displayYears.map((year) => (
            <Fragment key={year}>
              {visibleGroups.map((group) => (
                <Fragment key={`${key}-${year}-${group.key}`}>
                  {visibleFunds.map((column) => {
                    const val = sumProjects(projects, year, column.fundType, group.key)
                    return <td key={column.key} style={cellStyle}>{fmt(val)}</td>
                  })}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tr>
        {showSources && sources.map((source) => (
          <tr key={`${key}-src-${source}`} style={{ background: bg }}>
            <td style={{ ...infoCell(0), width: 44, background: bg }} />
            <td style={{ ...infoCell(44), paddingLeft: 24, background: bg, color, fontStyle: "italic", fontWeight: 400, maxWidth: 360, whiteSpace: "normal", wordBreak: "break-word" }}>
              – {source}
            </td>
            {extraColumn && <td style={{ ...infoCell(), background: bg }} />}
            {infoVis.code && <td style={{ ...infoCell(), background: bg }} />}
            {infoVis.division && <td style={{ ...infoCell(), background: bg }} />}
            {infoVis.department && <td style={{ ...infoCell(), background: bg }} />}
            {infoVis.group && <td style={{ ...infoCell(), background: bg }} />}
            {infoVis.type && <td style={{ ...infoCell(), background: bg }} />}
            {infoVis.year && <td style={{ ...infoCell(), background: bg }} />}
            {hasMoneyColumns && displayYears.map((year) => (
              <Fragment key={year}>
                {visibleGroups.map((group) => (
                  <Fragment key={`${key}-src-${source}-${year}-${group.key}`}>
                    {visibleFunds.map((column) => {
                      const val = sumProjectsBySource(projects, year, source, column.fundType, group.key)
                      return <td key={column.key} style={srcCellStyle}>{fmt(val)}</td>
                    })}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tr>
        ))}
      </Fragment>
    )
  }

  return (
    <div
      style={{
        background: "#ffffff",
        border: "0.5px solid #E5E7EB",
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {/* Toolbar — dropdown menus */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: "0.5px solid #E5E7EB",
          background: "#F9FAFB",
        }}
      >
        <DropdownMenu label={displayYearLabel}>
          {allDisplayYears.map((year) => (
            <DropdownItem
              key={year}
              checked={selDisplayYears.size === 0 || selDisplayYears.has(String(year))}
              onChange={(v) => toggleDisplayYear(year, v)}
              label={String(year)}
            />
          ))}
        </DropdownMenu>

        <DropdownMenu label="Info">
          {([
            { key: "code" as const, label: "Code" },
            { key: "division" as const, label: "Division" },
            { key: "department" as const, label: "Department" },
            { key: "group" as const, label: "Group" },
            { key: "type" as const, label: "Type" },
            { key: "year" as const, label: "Start year" },
          ]).map(({ key, label }) => (
            <DropdownItem
              key={key}
              checked={infoVis[key]}
              onChange={(v) => setInfoVis((s) => ({ ...s, [key]: v }))}
              label={label}
            />
          ))}
        </DropdownMenu>

        <DropdownMenu label="Groups">
          {GROUPS.map((group) => (
            <DropdownItem
              key={group.key}
              checked={groupVis[group.key]}
              onChange={(v) => setGroupVis((s) => ({ ...s, [group.key]: v }))}
              label={group.key}
            />
          ))}
        </DropdownMenu>

        <DropdownMenu label="Columns">
          {FUND_COLUMNS.map((col) => (
            <DropdownItem
              key={col.key}
              checked={fundVis[col.key]}
              onChange={(v) => setFundVis((s) => ({ ...s, [col.key]: v }))}
              label={col.label}
            />
          ))}
          <DropdownItem
            checked={showJobs}
            onChange={setShowJobs}
            label="Job rows"
          />
          <DropdownItem
            checked={showSources}
            onChange={setShowSources}
            label="Source rows"
          />
        </DropdownMenu>
      </div>

      {/* Scrollable table */}
      <div style={{ maxHeight: "65vh", overflowX: "auto", overflowY: "auto" }}>
        <table
          style={{
            width: "100%",
            minWidth: "max-content",
            borderCollapse: "collapse",
            fontSize: 12,
            color: "#374151",
          }}
        >
          <thead>
            {/* Row 1 — group/year spans */}
            <tr>
              <th
                colSpan={leftColSpan}
                style={{ ...thBase, top: 0, zIndex: 5, minWidth: 440, left: 0 }}
              >
                Info
              </th>
              {hasMoneyColumns &&
                displayYears.map((year) => (
                  <Fragment key={year}>
                    {visibleGroups.map((group) => (
                      <th
                        key={`${year}-${group.key}`}
                        colSpan={visibleFunds.length}
                        style={{ ...thBase, top: 0, zIndex: 4 }}
                      >
                        {group.key === "Remain"
                          ? group.label
                          : `${group.label} ${year}`}
                      </th>
                    ))}
                  </Fragment>
                ))}
            </tr>

            {/* Row 2 — column headers */}
            <tr>
              <th
                onClick={cycleItemSort}
                title={`Sort ข้อ ${itemSortIcon()}`}
                style={{
                  ...thBase,
                  top: 33,
                  zIndex: 5,
                  width: 44,
                  left: 0,
                  position: "sticky",
                  cursor: "pointer",
                }}
              >
                ข้อ {itemSortIcon()}
              </th>
              <th
                style={{
                  ...thBase,
                  top: 33,
                  zIndex: 5,
                  minWidth: 360,
                  maxWidth: 360,
                  left: 44,
                  position: "sticky",
                  textAlign: "center",
                }}
              >
                รายการ
              </th>
              {extraColumn && (
                <th style={{ ...thBase, top: 33, zIndex: 4, minWidth: 100, textAlign: "center" }}>
                  {extraColumn.header}
                </th>
              )}
              {infoVis.code && (
                <th style={{ ...thBase, top: 33, zIndex: 4, minWidth: 110 }}>Code</th>
              )}
              {infoVis.division && (
                <th style={{ ...thBase, top: 33, zIndex: 4, minWidth: 120 }}>Division</th>
              )}
              {infoVis.department && (
                <th style={{ ...thBase, top: 33, zIndex: 4, minWidth: 120 }}>Department</th>
              )}
              {infoVis.group && (
                <th style={{ ...thBase, top: 33, zIndex: 4, minWidth: 120 }}>Group</th>
              )}
              {infoVis.type && (
                <th style={{ ...thBase, top: 33, zIndex: 4, width: 44 }}>Type</th>
              )}
              {infoVis.year && (
                <th style={{ ...thBase, top: 33, zIndex: 4, minWidth: 112 }}>
                  <button
                    type="button"
                    style={{
                      display: "inline-flex",
                      width: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      background: "none",
                      border: "none",
                      color: "#6B7280",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                    onClick={cycleYearSort}
                  >
                    Start year{" "}
                    <span style={{ fontSize: 9, color: "#6B7280" }}>
                      {yearSortIcon()}
                    </span>
                  </button>
                </th>
              )}
              {hasMoneyColumns &&
                displayYears.map((year) => (
                  <Fragment key={year}>
                    {visibleGroups.map((group) => (
                      <Fragment key={`${year}-${group.key}-funds`}>
                        {visibleFunds.map((column) => (
                          <th
                            key={`${year}-${group.key}-${column.key}`}
                            style={{ ...thBase, top: 33, zIndex: 4 }}
                          >
                            <button
                              type="button"
                              style={{
                                display: "inline-flex",
                                width: "100%",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 4,
                                background: "none",
                                border: "none",
                                color: "#6B7280",
                                cursor: "pointer",
                                fontSize: 11,
                              }}
                              onClick={() =>
                                cycleMoneySort(year, group.key, column.key)
                              }
                            >
                              {column.label}{" "}
                              <span style={{ fontSize: 9 }}>
                                {moneySortIcon(year, group.key, column.key)}
                              </span>
                            </button>
                          </th>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
            </tr>

            {/* Row 3 — filter inputs */}
            <tr>
              <th
                style={{
                  ...thBase,
                  top: 66,
                  zIndex: 5,
                  left: 0,
                  position: "sticky",
                  padding: "4px",
                }}
              />
              <th
                style={{
                  ...thBase,
                  top: 66,
                  zIndex: 5,
                  left: 44,
                  position: "sticky",
                  padding: "4px",
                }}
              >
                <PivotFilter allValues={allNames} selected={selNames} onChange={setSelNames} />
              </th>
              {extraColumn && <th style={{ ...thBase, top: 66, zIndex: 4 }} />}
              {infoVis.code && (
                <th style={{ ...thBase, top: 66, zIndex: 4, padding: "4px" }}>
                  <PivotFilter allValues={allCodes} selected={selCodes} onChange={setSelCodes} />
                </th>
              )}
              {infoVis.division && (
                <th style={{ ...thBase, top: 66, zIndex: 4, padding: "4px" }}>
                  <PivotFilter allValues={allDivisions} selected={selDivisions} onChange={setSelDivisions} />
                </th>
              )}
              {infoVis.department && (
                <th style={{ ...thBase, top: 66, zIndex: 4, padding: "4px" }}>
                  <PivotFilter allValues={allDepartments} selected={selDepartments} onChange={setSelDepartments} />
                </th>
              )}
              {infoVis.group && (
                <th style={{ ...thBase, top: 66, zIndex: 4, padding: "4px" }}>
                  <PivotFilter allValues={allGroups} selected={selGroups} onChange={setSelGroups} />
                </th>
              )}
              {infoVis.type && (
                <th style={{ ...thBase, top: 66, zIndex: 4, padding: "4px" }}>
                  <PivotFilter allValues={allTypes} selected={selTypes} onChange={setSelTypes} />
                </th>
              )}
              {infoVis.year && (
                <th style={{ ...thBase, top: 66, zIndex: 4, padding: "4px" }}>
                  <PivotFilter allValues={allStartYears} selected={selYears} onChange={setSelYears} />
                </th>
              )}
              {hasMoneyColumns &&
                displayYears.map((year) => (
                  <Fragment key={year}>
                    {visibleGroups.map((group) => (
                      <Fragment key={`${year}-${group.key}-filters`}>
                        {visibleFunds.map((column) => {
                          const current =
                            numFilters[filterKey(year, group.key, column.key)] ?? {
                              min: "",
                              max: "",
                            }
                          return (
                            <th
                              key={`${year}-${group.key}-${column.key}-filter`}
                              style={{ ...thBase, top: 66, zIndex: 4, padding: "4px" }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: 4,
                                  width: 112,
                                }}
                              >
                                <input
                                  style={filterInput}
                                  inputMode="decimal"
                                  placeholder="min"
                                  value={current.min}
                                  onChange={(e) =>
                                    updateNumFilter(
                                      year,
                                      group.key,
                                      column.key,
                                      "min",
                                      e.target.value,
                                    )
                                  }
                                />
                                <input
                                  style={filterInput}
                                  inputMode="decimal"
                                  placeholder="max"
                                  value={current.max}
                                  onChange={(e) =>
                                    updateNumFilter(
                                      year,
                                      group.key,
                                      column.key,
                                      "max",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                            </th>
                          )
                        })}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={99}
                  style={{
                    border,
                    padding: "32px 0",
                    textAlign: "center",
                    color: "#6B7280",
                    background: "#ffffff",
                  }}
                >
                  No data
                </td>
              </tr>
            ) : (
              renderedItems.map((item) => {
                  if (item.kind === "group-total") {
                    return renderTotalBlock(`group-${item.label}`, `รวม${item.label}`, item.projects, "#F0F9FF", "#0369A1", false)
                  }
                  if (item.kind === "type-total") {
                    return renderTotalBlock(`type-${item.label}`, item.label, item.projects, item.bg, item.color, true)
                  }
                  const row = item.row
                  return (
                <Fragment key={row.project_code}>
                  <tr
                    style={{
                      background: "#F8FAFC",
                      boxShadow: "inset 0 1px 0 #D1D5DB",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#EEF2FF")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "#F8FAFC")
                    }
                  >
                    <td
                      style={{
                        ...infoCell(0, "project"),
                        textAlign: "center",
                        verticalAlign: "top",
                        width: 44,
                      }}
                    >
                      {row.item_no ?? ""}
                    </td>
                    <td
                      style={{
                        ...infoCell(44, "project"),
                        verticalAlign: "top",
                        minWidth: 360,
                        maxWidth: 360,
                        whiteSpace: "normal",
                        wordBreak: "break-word",
                      }}
                    >
                      <Link
                        href={`/projects/${encodeURIComponent(row.project_code)}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#3B82F6")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "inherit")}
                      >
                        {row.name}
                      </Link>
                    </td>
                    {extraColumn && (
                      <td style={{ ...infoCell(undefined, "project"), verticalAlign: "middle", textAlign: "center" }}>
                        {extraColumn.cell(row)}
                      </td>
                    )}
                    {infoVis.code && (
                      <td style={{ ...infoCell(undefined, "project"), verticalAlign: "top", fontFamily: "monospace" }}>
                        {row.project_code}
                      </td>
                    )}
                    {infoVis.division && (
                      <td style={{ ...infoCell(undefined, "project"), verticalAlign: "top" }}>
                        {row.division ?? "-"}
                      </td>
                    )}
                    {infoVis.department && (
                      <td style={{ ...infoCell(undefined, "project"), verticalAlign: "top" }}>
                        {row.department ?? "-"}
                      </td>
                    )}
                    {infoVis.group && (
                      <td style={{ ...infoCell(undefined, "project"), verticalAlign: "top" }}>
                        {row.group_name ?? "-"}
                      </td>
                    )}
                    {infoVis.type && (
                      <td style={{ ...infoCell(undefined, "project"), textAlign: "center", verticalAlign: "top" }}>
                        {row.project_type}
                      </td>
                    )}
                    {infoVis.year && (
                      <td style={{ ...infoCell(undefined, "project"), textAlign: "center", verticalAlign: "top" }}>
                        {row.year}
                      </td>
                    )}
                    {hasMoneyColumns &&
                      displayYears.map((year) => (
                        <Fragment key={year}>
                          {visibleGroups.map((group) => (
                            <Fragment key={`${row.project_code}-${year}-${group.key}`}>
                              {visibleFunds.map((column) => {
                                const val = getVal(
                                  row.source_breakdown,
                                  year,
                                  null,
                                  column.fundType,
                                  group.key,
                                )
                                return (
                                  <td
                                    key={column.key}
                                    style={numCellStyle(val, "project")}
                                  >
                                    {fmt(val)}
                                  </td>
                                )
                              })}
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
                  </tr>

                  {showJobs &&
                    getSubJobRows(row).map((subJob, index) => (
                      <tr
                        key={`${row.project_code}-sub-job-${subJob.name}`}
                        style={{ background: "#ffffff" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#F9FAFB")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "#ffffff")
                        }
                      >
                        <td style={{ ...infoCell(0), width: 44 }} />
                        <td
                          style={{
                            ...infoCell(44),
                            paddingLeft: 24,
                            verticalAlign: "top",
                            color: "#6B7280",
                            maxWidth: 360,
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                          }}
                        >
                          {index + 1}. {subJob.name}
                        </td>
                        {extraColumn && <td style={infoCell()} />}
                        {infoVis.code && <td style={infoCell()} />}
                        {infoVis.division && <td style={infoCell()} />}
                        {infoVis.department && <td style={infoCell()} />}
                        {infoVis.group && <td style={infoCell()} />}
                        {infoVis.type && <td style={infoCell()} />}
                        {infoVis.year && <td style={infoCell()} />}
                        {hasMoneyColumns &&
                          displayYears.map((year) => (
                            <Fragment key={year}>
                              {visibleGroups.map((group) => (
                                <Fragment
                                  key={`${row.project_code}-${subJob.name}-${year}-${group.key}`}
                                >
                                  {visibleFunds.map((column) => {
                                    const val = getSubJobVal(
                                      row.sub_jobs ?? [],
                                      subJob.name,
                                      year,
                                      column.fundType,
                                      group.key,
                                    )
                                    return (
                                      <td
                                        key={column.key}
                                        style={numCellStyle(val)}
                                      >
                                        {fmt(val)}
                                      </td>
                                    )
                                  })}
                                </Fragment>
                              ))}
                            </Fragment>
                          ))}
                      </tr>
                    ))}

                  {showSources &&
                    sources.map((source) => (
                      <tr
                        key={`${row.project_code}-${source}`}
                        style={{ background: "#FAFAFA" }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#F9FAFB")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "#FAFAFA")
                        }
                      >
                        <td style={{ ...infoCell(0), width: 44 }} />
                        <td
                          style={{
                            ...infoCell(44),
                            paddingLeft: 24,
                            verticalAlign: "top",
                            color: "#6B7280",
                            fontStyle: "italic",
                            maxWidth: 360,
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                          }}
                        >
                          – {source}
                        </td>
                        {extraColumn && <td style={infoCell()} />}
                        {infoVis.code && <td style={infoCell()} />}
                        {infoVis.division && <td style={infoCell()} />}
                        {infoVis.department && <td style={infoCell()} />}
                        {infoVis.group && <td style={infoCell()} />}
                        {infoVis.type && <td style={infoCell()} />}
                        {infoVis.year && <td style={infoCell()} />}
                        {hasMoneyColumns &&
                          displayYears.map((year) => (
                            <Fragment key={year}>
                              {visibleGroups.map((group) => (
                                <Fragment
                                  key={`${row.project_code}-${source}-${year}-${group.key}`}
                                >
                                  {visibleFunds.map((column) => {
                                    const val = getVal(
                                      row.source_breakdown,
                                      year,
                                      source,
                                      column.fundType,
                                      group.key,
                                    )
                                    return (
                                      <td
                                        key={column.key}
                                        style={numCellStyle(val)}
                                      >
                                        {fmt(val)}
                                      </td>
                                    )
                                  })}
                                </Fragment>
                              ))}
                            </Fragment>
                          ))}
                      </tr>
                    ))}
                </Fragment>
                  )
                })
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: "8px 16px",
          borderTop: "0.5px solid #E5E7EB",
          fontSize: 11,
          color: "#6B7280",
          background: "#F9FAFB",
        }}
      >
        {sorted.length} of {data.length} rows
      </div>
    </div>
  )
})

export default BudgetTable
