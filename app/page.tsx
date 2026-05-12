"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { FlatProject, FilterOptions } from "@/lib/types"
import SummaryCharts from "@/components/SummaryCharts"
import BudgetTable, { type BudgetTableHandle } from "@/components/BudgetTable"
import { useViewMode } from "./SnapshotProvider"

export default function Home() {
  const { viewMode } = useViewMode()
  const [liveData, setLiveData] = useState<FlatProject[]>([])
  const [scenarioData, setScenarioData] = useState<FlatProject[] | null>(null)
  const [options, setOptions] = useState<FilterOptions>({ years: [], sources: [], divisions: [], departments: [], groups: [] })
  const currentBEYear = new Date().getFullYear() + 543
  const [yearFrom, setYearFrom] = useState(String(currentBEYear))
  const [yearTo, setYearTo] = useState(String(currentBEYear + 2))
  const [source, setSource] = useState("")
  const [division, setDivision] = useState("")
  const [department, setDepartment] = useState("")
  const [group, setGroup] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [tableFilteredData, setTableFilteredData] = useState<{ base: FlatProject[]; data: FlatProject[] } | null>(null)
  const tableRef = useRef<BudgetTableHandle>(null)

  const data = viewMode.kind === "snapshot"
    ? viewMode.data
    : viewMode.kind === "scenario" && scenarioData
      ? scenarioData
      : liveData

  const activeYears = useMemo(() => {
    const from = yearFrom ? Number(yearFrom) : null
    const to = yearTo ? Number(yearTo) : null
    const availableYears =
      options.years.length > 0
        ? options.years
        : Array.from({ length: 3 }, (_, index) => currentBEYear + index)
    return availableYears.filter((year) => {
      if (from !== null && year < from) return false
      if (to !== null && year > to) return false
      return true
    })
  }, [currentBEYear, options.years, yearFrom, yearTo])

  const visibleData = useMemo(() => {
    if (activeYears.length === 0) return data
    return data.filter((project) =>
      activeYears.some((year) =>
        project.source_breakdown.some((entry) => entry.year === year && entry.budget > 0),
      ),
    )
  }, [activeYears, data])
  const summaryData = tableFilteredData?.base === visibleData ? tableFilteredData.data : visibleData

  const handleTableFilteredDataChange = useCallback((nextData: FlatProject[]) => {
    setTableFilteredData((current) => {
      if (
        current?.base === visibleData &&
        current.data.length === nextData.length &&
        current.data.every((project, index) => project.id === nextData[index]?.id)
      ) {
        return current
      }
      return { base: visibleData, data: nextData }
    })
  }, [visibleData])

  useEffect(() => {
    api.filterOptions().then(setOptions).catch(() => {})
  }, [])

  // Load live data
  useEffect(() => {
    if (viewMode.kind !== "live") { setLoading(false); return }
    let ignore = false
    setLoading(true)
    const params: Record<string, string> = {}
    if (source) params.source = source
    if (division) params.division = division
    if (department) params.department = department
    if (group) params.group = group
    if (activeYears.length > 0) {
      params.years = activeYears.join(",")
      params.active_only = "true"
    }
    api.flatProjects(params)
      .then((result) => { if (!ignore) { setLiveData(result); setError(null) } })
      .catch((e) => { if (!ignore) setError(e.message) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [activeYears, source, division, department, group, viewMode.kind])

  // Load scenario flat data when entering scenario mode
  useEffect(() => {
    if (viewMode.kind !== "scenario") { setScenarioData(null); return }
    let ignore = false
    setLoading(true)
    setScenarioData(null)
    api.scenarioFlat(viewMode.item.id)
      .then((result) => { if (!ignore) { setScenarioData(result); setError(null) } })
      .catch((e) => { if (!ignore) setError(e.message) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
  }, [viewMode.kind === "scenario" ? viewMode.item.id : 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const isFiltered = viewMode.kind !== "live"
  const exportLabel =
    viewMode.kind === "snapshot"
      ? `Budget Dashboard Snapshot ${viewMode.item.label}`
      : viewMode.kind === "scenario"
        ? `Budget Dashboard Scenario ${viewMode.item.label}`
        : source
          ? `Budget Dashboard ${source}`
          : "Budget Dashboard"

  async function handleExport() {
    setExporting(true)
    try {
      await tableRef.current?.exportCurrentView(exportLabel)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
        <h1 className="text-xl font-bold text-gray-800">Budget Dashboard</h1>
        <p className="text-sm text-gray-400">งบลงทุนเพื่อการดำเนินงานปกติ</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || loading || Boolean(error)}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {exporting ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                </svg>
                Exporting...
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
        </div>
      </header>

      <div className="bg-white border-b px-6 py-2 flex items-center gap-4">
        <span className="text-xs text-gray-500 font-medium">Filter:</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Years</label>
          <select
            className="border rounded-lg px-2 py-1 text-sm"
            value={yearFrom}
            disabled={isFiltered}
            onChange={(e) => setYearFrom(e.target.value)}
          >
            <option value="">From</option>
            {options.years.map((year) => (
              <option key={year} value={String(year)}>{year}</option>
            ))}
          </select>
          <span className="text-xs text-gray-400">-</span>
          <select
            className="border rounded-lg px-2 py-1 text-sm"
            value={yearTo}
            disabled={isFiltered}
            onChange={(e) => setYearTo(e.target.value)}
          >
            <option value="">To</option>
            {options.years.map((year) => (
              <option key={year} value={String(year)}>{year}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Division</label>
          <select className="border rounded-lg px-2 py-1 text-sm" value={division} disabled={isFiltered} onChange={(e) => setDivision(e.target.value)}>
            <option value="">All</option>
            {options.divisions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Department</label>
          <select className="border rounded-lg px-2 py-1 text-sm" value={department} disabled={isFiltered} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All</option>
            {options.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Group</label>
          <select className="border rounded-lg px-2 py-1 text-sm" value={group} disabled={isFiltered} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All</option>
            {options.groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Source</label>
          <select
            className="border rounded-lg px-2 py-1 text-sm"
            value={source}
            disabled={isFiltered}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">All sources</option>
            {options.sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {(source || division || department || group) && !isFiltered && (
          <button onClick={() => { setSource(""); setDivision(""); setDepartment(""); setGroup("") }} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Clear filters
          </button>
        )}
        {(yearFrom !== String(currentBEYear) || yearTo !== String(currentBEYear + 2)) && !isFiltered && (
          <button
            onClick={() => { setYearFrom(String(currentBEYear)); setYearTo(String(currentBEYear + 2)) }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Reset years
          </button>
        )}
      </div>

      <main className="px-6 py-6 max-w-[1800px] mx-auto">
        {loading && <div className="text-center py-20 text-gray-400">Loading...</div>}
        {error && (
          <div className="text-center py-20 text-red-400">
            Cannot connect to API.<br /><span className="text-sm">{error}</span>
          </div>
        )}
        {!loading && !error && (
          <>
            <SummaryCharts data={summaryData} years={activeYears} />
            <BudgetTable
              ref={tableRef}
              data={visibleData}
              years={activeYears}
              onFilteredDataChange={handleTableFilteredDataChange}
            />
          </>
        )}
      </main>
    </div>
  )
}
