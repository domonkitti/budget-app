"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { FlatProject, FilterOptions } from "@/lib/types"
import SummaryCharts from "@/components/SummaryCharts"
import BudgetTable from "@/components/BudgetTable"

export default function Home() {
  const [data, setData] = useState<FlatProject[]>([])
  const [options, setOptions] = useState<FilterOptions>({ years: [], sources: [] })
  const [source, setSource] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.filterOptions().then(setOptions).catch(() => {})
  }, [])

  useEffect(() => {
    let ignore = false
    const params: Record<string, string> = {}
    if (source) params.source = source
    api.flatProjects(params)
      .then(result => {
        if (ignore) return
        setData(result)
        setError(null)
      })
      .catch(e => {
        if (ignore) return
        setError(e.message)
      })
      .finally(() => {
        if (ignore) return
        setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [source])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-gray-800">Budget Dashboard</h1>
        <p className="text-sm text-gray-400">งบลงทุนเพื่อการดำเนินงานปกติ</p>
      </header>

      <div className="bg-white border-b px-6 py-2 flex items-center gap-4">
        <span className="text-xs text-gray-500 font-medium">Filter:</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Source</label>
          <select
            className="border rounded-lg px-2 py-1 text-sm"
            value={source}
            onChange={e => setSource(e.target.value)}
          >
            <option value="">All sources</option>
            {options.sources.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {source && (
          <button onClick={() => setSource("")} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Clear
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
            <SummaryCharts data={data} />
            <BudgetTable data={data} years={options.years} />
          </>
        )}
      </main>
    </div>
  )
}
