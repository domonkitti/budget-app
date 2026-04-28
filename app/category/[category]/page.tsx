"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import type { Category, CategorySummaryRow, FilterOptions, FlatProject } from "@/lib/types"
import BudgetTable from "@/components/BudgetTable"
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
]

const fmt = (n: number) => (n / 1_000_000).toFixed(2) + "M"
const fmtPct = (n: number, total: number) =>
  total === 0 ? "-" : (n / total * 100).toFixed(1) + "%"

function categoryNameFromParam(value: string | string[] | undefined) {
  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "")
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let ignore = false
    setLoading(true)
    Promise.all([
      api.categories(),
      api.filterOptions().catch(() => ({ years: [], sources: [] } as FilterOptions)),
      api.flatProjects(),
    ])
      .then(async ([cats, opts, flat]) => {
        if (ignore) return
        const cat = cats.find(item => item.name === categoryName) ?? null
        setCategory(cat)
        setOptions(opts)
        setProjects(flat)
      })
      .catch((err: unknown) => { if (!ignore) setError(String(err)) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [categoryName])

  const activeYears = useMemo(() => {
    const from = yearFrom ? Number(yearFrom) : null
    const to = yearTo ? Number(yearTo) : null
    const filtered = options.years.filter(y => {
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
      activeYears.map(y =>
        api.categorySummary(category.name, { year: String(y) }).then(rows => [y, rows] as const)
      )
    ).then(results => {
      if (ignore) return
      const map: Record<number, CategorySummaryRow[]> = {}
      results.forEach(([y, rows]) => { map[y] = rows })
      setYearSummaries(map)
    }).catch(() => {})
    return () => { ignore = true }
  }, [category, activeYears])

  // All value codes across all loaded years, sorted alphabetically
  const valueCodes = useMemo(() => {
    const set = new Set<string>()
    Object.values(yearSummaries).forEach(rows => rows.forEach(r => set.add(r.code)))
    return [...set].sort()
  }, [yearSummaries])

  // Chart data: one entry per year, each value code = its % of that year's total budget
  const chartData = useMemo(() => {
    return activeYears.map(y => {
      const rows = yearSummaries[y] ?? []
      const totalBudget = rows.reduce((sum, r) => sum + r.budget, 0)
      const entry: Record<string, number | string> = { year: String(y) }
      valueCodes.forEach(code => {
        const row = rows.find(r => r.code === code)
        entry[code] = row && totalBudget > 0
          ? Math.round(row.budget / totalBudget * 1000) / 10
          : 0
      })
      return entry
    })
  }, [activeYears, yearSummaries, valueCodes])

  // Summary table: aggregate across active years (values already × allocation %)
  const aggregateSummary = useMemo(() => {
    const map: Record<string, { budget: number; target: number; remain: number }> = {}
    activeYears.forEach(y => {
      ;(yearSummaries[y] ?? []).forEach(r => {
        if (!map[r.code]) map[r.code] = { budget: 0, target: 0, remain: 0 }
        map[r.code].budget += r.budget
        map[r.code].target += r.target
        map[r.code].remain += r.remain
      })
    })
    return valueCodes.filter(code => map[code]).map(code => ({ code, ...map[code] }))
  }, [activeYears, yearSummaries, valueCodes])

  const totals = useMemo(
    () => aggregateSummary.reduce(
      (acc, r) => ({ budget: acc.budget + r.budget, target: acc.target + r.target, remain: acc.remain + r.remain }),
      { budget: 0, target: 0, remain: 0 },
    ),
    [aggregateSummary],
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link href="/category" className="text-xs text-gray-400 hover:text-gray-700">Back to categories</Link>
            <h1 className="text-xl font-bold text-gray-800 mt-1">{categoryName} Summary</h1>
          </div>
          <Link
            href={`/category/${encodeURIComponent(categoryName)}/allocate`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Allocate
          </Link>
        </div>
      </header>

      <main className="px-6 py-6 max-w-[1800px] mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>
        )}
        {loading && <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>}
        {!loading && !category && (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-400 text-sm">Category not found</div>
        )}
        {!loading && category && (
          <>
            <div className="bg-white border rounded-lg overflow-hidden mb-6">
              {/* Header + year range */}
              <div className="px-4 py-3 border-b flex items-center justify-between gap-4 flex-wrap">
                <h2 className="font-semibold text-gray-700">{categoryName} — budget % by year</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 font-medium">Year range</span>
                  <select
                    className="border rounded-lg px-2 py-1 text-sm"
                    value={yearFrom}
                    onChange={e => setYearFrom(e.target.value)}
                  >
                    <option value="">From</option>
                    {options.years.map(y => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                  <span className="text-xs text-gray-400">–</span>
                  <select
                    className="border rounded-lg px-2 py-1 text-sm"
                    value={yearTo}
                    onChange={e => setYearTo(e.target.value)}
                  >
                    <option value="">To</option>
                    {options.years.map(y => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                  {(yearFrom || yearTo) && (
                    <button
                      onClick={() => { setYearFrom(""); setYearTo("") }}
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Stacked bar chart — each year is a group, each bar segment = % of budget */}
              {chartData.length > 0 && valueCodes.length > 0 ? (
                <div className="px-4 pt-5 pb-3">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                      <XAxis dataKey="year" tick={{ fontSize: 13 }} />
                      <YAxis
                        tickFormatter={v => v + "%"}
                        tick={{ fontSize: 11 }}
                        width={46}
                        domain={[0, 100]}
                      />
                      <Tooltip formatter={(value) => (typeof value === "number" ? value.toFixed(1) : value) + "%"} />
                      <Legend />
                      {valueCodes.map((code, i) => (
                        <Bar
                          key={code}
                          dataKey={code}
                          stackId="a"
                          fill={PALETTE[i % PALETTE.length]}
                          radius={i === valueCodes.length - 1 ? [3, 3, 0, 0] : undefined}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-14 text-center text-sm text-gray-400">No allocated data for selected years</div>
              )}

              {/* Summary table — amounts already multiplied by allocation % */}
              <table className="w-full text-sm border-t">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-2 text-xs font-medium text-gray-500">Value</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Budget</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Budget %</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Target</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Target %</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Remain</th>
                    <th className="px-4 py-2 text-xs font-medium text-gray-500 text-right">Remain %</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregateSummary.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No allocated data yet</td>
                    </tr>
                  )}
                  {aggregateSummary.map((row, i) => (
                    <tr key={row.code} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                            style={{ background: PALETTE[i % PALETTE.length] }}
                          />
                          <span className="font-mono text-gray-700">{row.code}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-600">{fmt(row.budget)}</td>
                      <td className="px-4 py-2 text-right font-mono text-blue-600 font-medium">
                        {fmtPct(row.budget, totals.budget)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-600">{fmt(row.target)}</td>
                      <td className="px-4 py-2 text-right font-mono text-emerald-600 font-medium">
                        {fmtPct(row.target, totals.target)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-600">{fmt(row.remain)}</td>
                      <td className="px-4 py-2 text-right font-mono text-amber-600 font-medium">
                        {fmtPct(row.remain, totals.remain)}
                      </td>
                    </tr>
                  ))}
                  {aggregateSummary.length > 0 && (
                    <tr className="bg-gray-50 border-t font-semibold">
                      <td className="px-4 py-2 text-gray-700">Total</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">{fmt(totals.budget)}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">100%</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">{fmt(totals.target)}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">100%</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-800">{fmt(totals.remain)}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">100%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <BudgetTable data={projects} years={activeYears} />
          </>
        )}
      </main>
    </div>
  )
}
