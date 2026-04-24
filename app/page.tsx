"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { FlatProject } from "@/lib/types"
import SummaryCharts from "@/components/SummaryCharts"
import BudgetTable from "@/components/BudgetTable"
import TagPanel from "@/components/TagPanel"

type SelectedSubJob = { projectId: number; projectCode: string; subJobName: string }

export default function Home() {
  const [data, setData] = useState<FlatProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedSubJob | null>(null)

  useEffect(() => {
    api.flatProjects()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Budget Dashboard</h1>
          <p className="text-sm text-gray-400">งบลงทุนเพื่อการดำเนินงานปกติ</p>
        </div>
        <a href="/tags" className="text-sm text-blue-600 hover:underline font-medium">
          Manage Tags →
        </a>
      </header>

      <main className="px-6 py-6 max-w-[1600px] mx-auto">
        {loading && <div className="text-center py-20 text-gray-400">Loading...</div>}
        {error && (
          <div className="text-center py-20 text-red-400">
            Cannot connect to API — make sure the backend is running.<br />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {!loading && !error && (
          <>
            <SummaryCharts data={data} />
            <BudgetTable
              data={data}
              onSelectSubJob={(projectId, projectCode, subJobName) =>
                setSelected({ projectId, projectCode, subJobName })
              }
            />
          </>
        )}
      </main>

      {selected && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelected(null)} />
          <TagPanel
            projectId={selected.projectId}
            projectCode={selected.projectCode}
            subJobName={selected.subJobName}
            onClose={() => setSelected(null)}
          />
        </>
      )}
    </div>
  )
}
