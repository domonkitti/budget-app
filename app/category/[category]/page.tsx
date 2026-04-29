"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Category, CategorySummaryRow, FilterOptions, FlatProject } from "@/lib/types"
import BudgetTable from "@/components/BudgetTable"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { exportCategoryExcel } from "@/lib/exportExcel"

type Metric = "budget" | "target" | "remain"

const METRIC_LABELS: Record<Metric, string> = { budget: "Budget", target: "Target", remain: "Remain" }
const METRIC_ACCENT: Record<Metric, string> = { budget: "#3B82F6", target: "#10B981", remain: "#F59E0B" }
const METRIC_BAR_RGBA: Record<Metric, string> = {
  budget: "rgba(59,130,246,0.12)",
  target: "rgba(16,185,129,0.12)",
  remain: "rgba(245,158,11,0.12)",
}

// Each code index gets a unique hue. Metric = shade depth (budget=vivid, target=medium, remain=pale).
// This makes codes distinguishable within a bar, and metrics distinguishable between bars.
const CODE_FILLS: Record<Metric, string[]> = {
  budget: ["#60A5FA","#34D399","#F87171","#FBBF24","#A78BFA","#FB923C","#38BDF8","#E879F9"],
  target: ["#93C5FD","#6EE7B7","#FCA5A5","#FCD34D","#C4B5FD","#FDBA74","#7DD3FC","#F0ABFC"],
  remain: ["#BFDBFE","#A7F3D0","#FECACA","#FDE68A","#DDD6FE","#FED7AA","#BAE6FD","#F5D0FE"],
}

const fmt = (n: number) => (n / 1_000_000).toFixed(2) + "M"
const fmtPct = (n: number, total: number) =>
  total === 0 ? "-" : ((n / total) * 100).toFixed(1) + "%"

function categoryNameFromParam(value: string | string[] | undefined) {
  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "")
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  const groups: Record<string, { code: string; value: number }[]> = {}
  payload.forEach((entry) => {
    const [metric, ...rest] = entry.dataKey.split("_")
    const code = rest.join("_")
    if (!groups[metric]) groups[metric] = []
    if (entry.value > 0) groups[metric].push({ code, value: entry.value })
  })

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 170,
        boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ color: "#111827", fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
        Year {label}
      </div>
      {Object.entries(groups).map(([metric, items]) => (
        <div key={metric} style={{ marginBottom: 8 }}>
          <div
            style={{
              color: METRIC_ACCENT[metric as Metric],
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            {METRIC_LABELS[metric as Metric]}
          </div>
          {items.map((item) => (
            <div
              key={item.code}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                marginBottom: 2,
              }}
            >
              <span style={{ color: "#6B7280", fontSize: 11 }}>{item.code}</span>
              <span
                style={{
                  color: "#111827",
                  fontSize: 11,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {item.value.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function DivisionFilter({
  allDivisions,
  selected,
  onChange,
}: {
  allDivisions: string[]
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

  const visible = allDivisions.filter((d) =>
    d.toLowerCase().includes(search.toLowerCase()),
  )

  const isAll = selected.size === 0
  const label =
    isAll ? "All"
    : selected.size === 1 ? [...selected][0]
    : `${selected.size} of ${allDivisions.length}`

  function toggle(div: string) {
    const next = new Set(selected)
    if (next.has(div)) next.delete(div)
    else next.add(div)
    onChange(next)
  }

  function selectAll() { onChange(new Set()) }
  function clearAll() { onChange(new Set(allDivisions)) }

  const checked = (div: string) => isAll || selected.has(div)

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: isAll ? "#fff" : "#EEF2FF",
          border: `1px solid ${isAll ? "#D1D5DB" : "#6366F1"}`,
          borderRadius: 8,
          padding: "4px 10px",
          fontSize: 13,
          color: isAll ? "#374151" : "#4338CA",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm2 5a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd"/>
        </svg>
        Division: <strong>{label}</strong>
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.5 }}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            minWidth: 220,
            maxWidth: 320,
          }}
        >
          {/* Search */}
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #F3F4F6" }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search division…"
              style={{
                width: "100%",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Select all / clear */}
          <div
            style={{
              display: "flex",
              gap: 0,
              padding: "4px 10px",
              borderBottom: "1px solid #F3F4F6",
            }}
          >
            <button
              type="button"
              onClick={selectAll}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                color: "#6366F1",
                cursor: "pointer",
                padding: "2px 4px",
                fontWeight: 600,
              }}
            >
              Select all
            </button>
            <span style={{ color: "#D1D5DB", fontSize: 11, alignSelf: "center" }}>·</span>
            <button
              type="button"
              onClick={clearAll}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                color: "#6B7280",
                cursor: "pointer",
                padding: "2px 4px",
              }}
            >
              Clear
            </button>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#9CA3AF", alignSelf: "center" }}>
              {selected.size === 0 ? `${allDivisions.length} selected` : `${allDivisions.length - selected.size} selected`}
            </span>
          </div>

          {/* List */}
          <div style={{ maxHeight: 240, overflowY: "auto", padding: "4px 0" }}>
            {visible.length === 0 && (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "#9CA3AF" }}>
                No results
              </div>
            )}
            {visible.map((div) => (
              <label
                key={div}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#374151",
                  background: checked(div) ? "#F9FAFB" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked(div)}
                  onChange={() => toggle(div)}
                  style={{ accentColor: "#6366F1", width: 14, height: 14, cursor: "pointer" }}
                />
                {div || <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>(none)</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CategorySummaryPage() {
  const params = useParams()
  const categoryName = categoryNameFromParam(params.category)

  const [category, setCategory] = useState<Category | null>(null)
  const [yearSummaries, setYearSummaries] = useState<Record<number, CategorySummaryRow[]>>({})
  const [projects, setProjects] = useState<FlatProject[]>([])
  const [options, setOptions] = useState<FilterOptions>({ years: [], sources: [] })
  const [yearFrom, setYearFrom] = useState("")
  const [yearTo, setYearTo] = useState("")
  const [activeMetrics, setActiveMetrics] = useState<Metric[]>(["budget", "target"])
  const [selectedDivisions, setSelectedDivisions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      await exportCategoryExcel(categoryName, activeYears, yearSummaries, projects)
    } finally {
      setExporting(false)
    }
  }

  function toggleMetric(metric: Metric) {
    setActiveMetrics((cur) => {
      if (cur.includes(metric)) {
        if (cur.length === 1) return cur
        return cur.filter((m) => m !== metric)
      }
      return [...cur, metric]
    })
  }

  useEffect(() => {
    let ignore = false
    setLoading(true)
    Promise.all([
      api.categories(),
      api.filterOptions().catch(() => ({ years: [], sources: [] } as FilterOptions)),
      api.flatProjects(),
    ])
      .then(([cats, opts, flat]) => {
        if (ignore) return
        setCategory(cats.find((item) => item.name === categoryName) ?? null)
        setOptions(opts)
        setProjects(flat)
      })
      .catch((err: unknown) => {
        if (!ignore) setError(String(err))
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [categoryName])

  const activeYears = useMemo(() => {
    const from = yearFrom ? Number(yearFrom) : null
    const to = yearTo ? Number(yearTo) : null
    const filtered = options.years.filter((y) => {
      if (from !== null && y < from) return false
      if (to !== null && y > to) return false
      return true
    })
    return filtered.length > 0 ? filtered : options.years
  }, [options.years, yearFrom, yearTo])

  useEffect(() => {
    if (!category || activeYears.length === 0) return
    let ignore = false
    Promise.all(
      activeYears.map((y) =>
        api.categorySummary(category.name, { year: String(y) }).then((rows) => [y, rows] as const),
      ),
    )
      .then((results) => {
        if (ignore) return
        const map: Record<number, CategorySummaryRow[]> = {}
        results.forEach(([y, rows]) => {
          map[y] = rows
        })
        setYearSummaries(map)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [category, activeYears])

  const valueCodes = useMemo(() => {
    const set = new Set<string>()
    Object.values(yearSummaries).forEach((rows) => rows.forEach((r) => set.add(r.code)))
    return [...set].sort()
  }, [yearSummaries])

  // One entry per year; keys are `${metric}_${code}` = that metric's % of year total
  const chartData = useMemo(() => {
    return activeYears.map((y) => {
      const rows = yearSummaries[y] ?? []
      const entry: Record<string, number | string> = { year: String(y) }
      ;(["budget", "target", "remain"] as Metric[]).forEach((metric) => {
        const total = rows.reduce((sum, r) => sum + r[metric], 0)
        valueCodes.forEach((code) => {
          const row = rows.find((r) => r.code === code)
          entry[`${metric}_${code}`] =
            row && total > 0 ? Math.round((row[metric] / total) * 1000) / 10 : 0
        })
      })
      return entry
    })
  }, [activeYears, yearSummaries, valueCodes])

  const aggregateSummary = useMemo(() => {
    const map: Record<string, { budget: number; target: number; remain: number }> = {}
    activeYears.forEach((y) => {
      ;(yearSummaries[y] ?? []).forEach((r) => {
        if (!map[r.code]) map[r.code] = { budget: 0, target: 0, remain: 0 }
        map[r.code].budget += r.budget
        map[r.code].target += r.target
        map[r.code].remain += r.remain
      })
    })
    return valueCodes.filter((code) => map[code]).map((code) => ({ code, ...map[code] }))
  }, [activeYears, yearSummaries, valueCodes])

  const totals = useMemo(
    () =>
      aggregateSummary.reduce(
        (acc, r) => ({
          budget: acc.budget + r.budget,
          target: acc.target + r.target,
          remain: acc.remain + r.remain,
        }),
        { budget: 0, target: 0, remain: 0 },
      ),
    [aggregateSummary],
  )

  const metricMax = useMemo(
    () => ({
      budget: Math.max(...aggregateSummary.map((r) => r.budget), 1),
      target: Math.max(...aggregateSummary.map((r) => r.target), 1),
      remain: Math.max(...aggregateSummary.map((r) => r.remain), 1),
    }),
    [aggregateSummary],
  )

  const allDivisions = useMemo(() => {
    const set = new Set<string>()
    projects.forEach((p) => { if (p.division) set.add(p.division) })
    return [...set].sort()
  }, [projects])

  const filteredProjects = useMemo(() => {
    if (selectedDivisions.size === 0) return projects
    return projects.filter((p) => p.division && selectedDivisions.has(p.division))
  }, [projects, selectedDivisions])

  const selectStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #D1D5DB",
    color: "#374151",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 13,
    cursor: "pointer",
    outline: "none",
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <Link
              href="/category"
              style={{
                color: "#9CA3AF",
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              ← Back to categories
            </Link>
            <h1 className="text-xl font-bold text-gray-800 mt-1">
              {categoryName} Summary
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading || !category}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                  Export Excel
                </>
              )}
            </button>
            <Link
              href={`/category/${encodeURIComponent(categoryName)}/allocate`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              style={{ textDecoration: "none" }}
            >
              Allocate
            </Link>
          </div>
        </div>
      </header>

      <main className="px-6 py-6 max-w-[1800px] mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}
        {loading && (
          <div className="text-center py-12 text-gray-400 text-sm">
            Loading...
          </div>
        )}
        {!loading && !category && (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">
            Category not found
          </div>
        )}

        {!loading && category && (
          <>
            {/* Chart card */}
            <div className="bg-white border rounded-xl overflow-hidden mb-6">
              {/* Control row */}
              <div className="px-4 py-3 border-b flex items-center justify-between gap-4 flex-wrap">
                {/* Metric chips */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="text-xs text-gray-400 font-medium mr-1">Show</span>
                  {(["budget", "target", "remain"] as Metric[]).map((metric) => {
                    const active = activeMetrics.includes(metric)
                    const activeGradient =
                      metric === "budget"
                        ? "linear-gradient(135deg, #60A5FA, #2563EB)"
                        : metric === "target"
                          ? "linear-gradient(135deg, #34D399, #059669)"
                          : "linear-gradient(135deg, #FBBF24, #D97706)"
                    return (
                      <button
                        key={metric}
                        type="button"
                        onClick={() => toggleMetric(metric)}
                        style={{
                          background: active ? activeGradient : "#F3F4F6",
                          color: active ? "#fff" : "#6B7280",
                          border: "none",
                          borderRadius: 8,
                          padding: "5px 14px",
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          outline: "none",
                        }}
                      >
                        {active ? "✓ " : ""}
                        {METRIC_LABELS[metric]}
                      </button>
                    )
                  })}
                </div>

                {/* Division filter */}
                {allDivisions.length > 0 && (
                  <DivisionFilter
                    allDivisions={allDivisions}
                    selected={selectedDivisions}
                    onChange={setSelectedDivisions}
                  />
                )}

                {/* Year range */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 font-medium">Year range</span>
                  <select style={selectStyle} value={yearFrom} onChange={(e) => setYearFrom(e.target.value)}>
                    <option value="">From</option>
                    {options.years.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">–</span>
                  <select style={selectStyle} value={yearTo} onChange={(e) => setYearTo(e.target.value)}>
                    <option value="">To</option>
                    {options.years.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                  {(yearFrom || yearTo) && (
                    <button
                      type="button"
                      onClick={() => { setYearFrom(""); setYearTo("") }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Chart */}
              {chartData.length > 0 && valueCodes.length > 0 ? (
                <div className="px-4 pt-5 pb-3">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
                      barCategoryGap="20%"
                      barGap={3}
                    >
                      <XAxis
                        dataKey="year"
                        tick={{ fontSize: 12, fill: "#6B7280" }}
                        axisLine={{ stroke: "#E5E7EB" }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => v + "%"}
                        tick={{ fontSize: 11, fill: "#9CA3AF" }}
                        width={46}
                        domain={[0, 100]}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<CustomTooltip />}
                        cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      />
                      {activeMetrics.flatMap((metric) =>
                        valueCodes.map((code, codeIdx) => (
                          <Bar
                            key={`${metric}_${code}`}
                            dataKey={`${metric}_${code}`}
                            stackId={metric}
                            fill={CODE_FILLS[metric][codeIdx % CODE_FILLS[metric].length]}
                            radius={
                              codeIdx === valueCodes.length - 1 ? [4, 4, 0, 0] : undefined
                            }
                            isAnimationActive
                            animationDuration={250}
                          />
                        )),
                      )}
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 pt-3 pl-[46px]">
                    {activeMetrics.flatMap((metric) =>
                      valueCodes.map((code, codeIdx) => {
                        const color = CODE_FILLS[metric][codeIdx % CODE_FILLS[metric].length]
                        return (
                          <div
                            key={`${metric}_${code}`}
                            style={{ display: "flex", alignItems: "center", gap: 6 }}
                          >
                            <div
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                flexShrink: 0,
                                background: color,
                              }}
                            />
                            <span style={{ color: "#6B7280", fontSize: 11 }}>
                              {METRIC_LABELS[metric]} · {code}
                            </span>
                          </div>
                        )
                      }),
                    )}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: "56px 0",
                    textAlign: "center",
                    color: "#6B7280",
                    fontSize: 13,
                  }}
                >
                  No allocated data for selected years
                </div>
              )}

              {/* Summary value table */}
              <table
                style={{
                  width: "100%",
                  fontSize: 13,
                  borderCollapse: "collapse",
                  borderTop: "0.5px solid #E5E7EB",
                }}
              >
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    <th
                      style={{
                        padding: "8px 16px",
                        textAlign: "left",
                        color: "#6B7280",
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Value
                    </th>
                    {(["budget", "target", "remain"] as Metric[])
                      .filter((m) => activeMetrics.includes(m))
                      .flatMap((m) => [
                        <th
                          key={`${m}-amt`}
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            color: "#6B7280",
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {METRIC_LABELS[m]}
                        </th>,
                        <th
                          key={`${m}-pct`}
                          style={{
                            padding: "8px 12px",
                            textAlign: "right",
                            color: "#6B7280",
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {METRIC_LABELS[m]} %
                        </th>,
                      ])}
                  </tr>
                </thead>
                <tbody>
                  {aggregateSummary.length === 0 && (
                    <tr>
                      <td
                        colSpan={1 + activeMetrics.length * 2}
                        style={{
                          padding: "32px 16px",
                          textAlign: "center",
                          color: "#6B7280",
                        }}
                      >
                        No allocated data yet
                      </td>
                    </tr>
                  )}
                  {aggregateSummary.map((row, i) => {
                    const rowBg = i % 2 === 0 ? "#ffffff" : "#F9FAFB"
                    const swatchColor = CODE_FILLS.budget[i % CODE_FILLS.budget.length]
                    return (
                      <tr key={row.code} style={{ background: rowBg }}>
                        <td style={{ padding: "8px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                flexShrink: 0,
                                background: swatchColor,
                              }}
                            />
                            <span style={{ fontFamily: "monospace", color: "#374151" }}>
                              {row.code}
                            </span>
                          </div>
                        </td>
                        {(["budget", "target", "remain"] as Metric[])
                          .filter((m) => activeMetrics.includes(m))
                          .flatMap((m) => {
                            const pct =
                              metricMax[m] > 0 ? (row[m] / metricMax[m]) * 100 : 0
                            return [
                              <td
                                key={`${m}-amt`}
                                style={{
                                  padding: "8px 12px",
                                  textAlign: "right",
                                  fontVariantNumeric: "tabular-nums",
                                  fontFamily: "monospace",
                                  color: "#374151",
                                  background: `linear-gradient(90deg, ${METRIC_BAR_RGBA[m]} ${pct}%, transparent ${pct}%)`,
                                }}
                              >
                                {fmt(row[m])}
                              </td>,
                              <td
                                key={`${m}-pct`}
                                style={{
                                  padding: "8px 12px",
                                  textAlign: "right",
                                  fontVariantNumeric: "tabular-nums",
                                  fontFamily: "monospace",
                                  color: METRIC_ACCENT[m],
                                  fontWeight: 600,
                                }}
                              >
                                {fmtPct(row[m], totals[m])}
                              </td>,
                            ]
                          })}
                      </tr>
                    )
                  })}
                  {aggregateSummary.length > 0 && (
                    <tr
                      style={{
                        background: "#F9FAFB",
                        borderTop: "0.5px solid #D1D5DB",
                      }}
                    >
                      <td
                        style={{
                          padding: "8px 16px",
                          color: "#111827",
                          fontWeight: 700,
                        }}
                      >
                        Total
                      </td>
                      {(["budget", "target", "remain"] as Metric[])
                        .filter((m) => activeMetrics.includes(m))
                        .flatMap((m) => [
                          <td
                            key={`${m}-amt`}
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              fontFamily: "monospace",
                              color: "#111827",
                              fontWeight: 700,
                            }}
                          >
                            {fmt(totals[m])}
                          </td>,
                          <td
                            key={`${m}-pct`}
                            style={{
                              padding: "8px 12px",
                              textAlign: "right",
                              fontVariantNumeric: "tabular-nums",
                              fontFamily: "monospace",
                              color: "#6B7280",
                            }}
                          >
                            100%
                          </td>,
                        ])}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <BudgetTable data={filteredProjects} years={activeYears} />
          </>
        )}
      </main>
    </div>
  )
}
