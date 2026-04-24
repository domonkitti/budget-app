"use client"

import { useState, useMemo } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
} from "@tanstack/react-table"
import type { FlatProject } from "@/lib/types"

const helper = createColumnHelper<FlatProject>()

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (!dir) return <span className="text-gray-300 ml-1">↕</span>
  return <span className="text-blue-500 ml-1">{dir === "asc" ? "↑" : "↓"}</span>
}

function MinMaxFilter({ value, onChange }: {
  value: [number, number]
  onChange: (v: [number, number]) => void
}) {
  return (
    <div className="flex gap-1 mt-1">
      <input
        type="number"
        placeholder="min"
        className="w-20 text-xs border rounded px-1 py-0.5"
        value={value[0] === 0 ? "" : value[0]}
        onChange={e => onChange([Number(e.target.value) || 0, value[1]])}
      />
      <input
        type="number"
        placeholder="max"
        className="w-20 text-xs border rounded px-1 py-0.5"
        value={value[1] === Infinity ? "" : value[1]}
        onChange={e => onChange([value[0], Number(e.target.value) || Infinity])}
      />
    </div>
  )
}

type NumFilter = { budget: [number, number]; target: [number, number]; remain: [number, number] }

const COLS = [
  { key: "project_code", label: "Code" },
  { key: "division", label: "Division" },
  { key: "project_type", label: "Type" },
  { key: "year", label: "Year" },
]

type Props = {
  data: FlatProject[]
  onSelectSubJob?: (projectId: number, projectCode: string, subJobName: string) => void
}

export default function BudgetTable({ data, onSelectSubJob }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [visibility, setVisibility] = useState<VisibilityState>({ project_type: false, year: false })
  const [textFilters, setTextFilters] = useState({ code: "", name: "", division: "" })
  const [numFilters, setNumFilters] = useState<NumFilter>({
    budget: [0, Infinity],
    target: [0, Infinity],
    remain: [0, Infinity],
  })
  const [groupSort, setGroupSort] = useState<Record<string, false | "asc" | "desc">>({
    budget: false, target: false, remain: false,
  })

  const filtered = useMemo(() => data.filter(r => {
    if (textFilters.code && !r.project_code.toLowerCase().includes(textFilters.code.toLowerCase())) return false
    if (textFilters.name && !r.name.toLowerCase().includes(textFilters.name.toLowerCase())) return false
    if (textFilters.division && !(r.division ?? "").toLowerCase().includes(textFilters.division.toLowerCase())) return false
    if (r.budget_total < numFilters.budget[0] || r.budget_total > numFilters.budget[1]) return false
    if (r.target_total < numFilters.target[0] || r.target_total > numFilters.target[1]) return false
    if (r.remain_total < numFilters.remain[0] || r.remain_total > numFilters.remain[1]) return false
    return true
  }), [data, textFilters, numFilters])

  const sorted = useMemo(() => {
    const active = Object.entries(groupSort).find(([, v]) => v !== false)
    if (!active) return filtered
    const [key, dir] = active
    return [...filtered].sort((a, b) => {
      const ka = `${key}_total` as keyof FlatProject
      const va = a[ka] as number
      const vb = b[ka] as number
      return dir === "asc" ? va - vb : vb - va
    })
  }, [filtered, groupSort])

  const columns = useMemo(() => [
    helper.accessor("project_code", { header: "Code", id: "project_code" }),
    helper.accessor("name", { header: "Name", id: "name" }),
    helper.accessor("division", { header: "Division", id: "division", cell: i => i.getValue() ?? "—" }),
    helper.accessor("project_type", { header: "Type", id: "project_type" }),
    helper.accessor("year", { header: "Year", id: "year" }),
    helper.accessor("budget_committed", { header: "ผูกพัน", id: "budget_committed", cell: i => fmt(i.getValue()) }),
    helper.accessor("budget_invest", { header: "ลงทุน", id: "budget_invest", cell: i => fmt(i.getValue()) }),
    helper.accessor("target_committed", { header: "ผูกพัน", id: "target_committed", cell: i => fmt(i.getValue()) }),
    helper.accessor("target_invest", { header: "ลงทุน", id: "target_invest", cell: i => fmt(i.getValue()) }),
    helper.accessor("remain_committed", { header: "ผูกพัน", id: "remain_committed", cell: i => fmt(i.getValue()) }),
    helper.accessor("remain_invest", { header: "ลงทุน", id: "remain_invest", cell: i => fmt(i.getValue()) }),
  ], [])

  const table = useReactTable({
    data: sorted,
    columns,
    state: { sorting, columnFilters, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualSorting: true,
    manualFiltering: true,
  })

  function cycleSort(key: string) {
    setGroupSort(prev => {
      const next = { budget: false, target: false, remain: false } as typeof prev
      const cur = prev[key]
      next[key] = cur === false ? "asc" : cur === "asc" ? "desc" : false
      return next
    })
  }

  const groups = [
    { id: "budget", label: "Budget", cols: ["budget_committed", "budget_invest"] },
    { id: "target", label: "Target", cols: ["target_committed", "target_invest"] },
    { id: "remain", label: "Remain", cols: ["remain_committed", "remain_invest"] },
  ]

  const infoCols = ["project_code", "name", "division", "project_type", "year"].filter(
    id => visibility[id] !== false
  )

  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      {/* Column picker */}
      <div className="flex flex-wrap gap-2 p-3 border-b bg-gray-50 text-sm">
        <span className="text-gray-500 font-medium self-center">Columns:</span>
        {COLS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={visibility[key] !== false}
              onChange={e => setVisibility(v => ({ ...v, [key]: e.target.checked }))}
            />
            {label}
          </label>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            {/* Row 1: group headers */}
            <tr className="bg-gray-100 border-b">
              {infoCols.map(id => (
                <th key={id} rowSpan={3} className="px-3 py-2 text-left font-semibold text-gray-700 border-r align-top">
                  <div>{id === "project_code" ? "Code" : id === "project_type" ? "Type" : id.charAt(0).toUpperCase() + id.slice(1)}</div>
                  {["project_code", "name", "division"].includes(id) && (
                    <input
                      className="mt-1 w-full text-xs border rounded px-1 py-0.5 font-normal"
                      placeholder="search..."
                      value={textFilters[id === "project_code" ? "code" : id as keyof typeof textFilters]}
                      onChange={e => setTextFilters(f => ({
                        ...f, [id === "project_code" ? "code" : id]: e.target.value
                      }))}
                    />
                  )}
                </th>
              ))}
              {groups.map(g => (
                <th key={g.id} colSpan={2} className="px-3 py-2 text-center font-semibold text-gray-700 border-r cursor-pointer select-none"
                  onClick={() => cycleSort(g.id)}>
                  {g.label} <SortIcon dir={groupSort[g.id]} />
                </th>
              ))}
            </tr>
            {/* Row 2: sub-column headers */}
            <tr className="bg-gray-50 border-b">
              {groups.flatMap(g => g.cols.map((col, i) => (
                <th key={col} className={`px-3 py-1 text-center text-xs text-gray-500 font-medium ${i === 1 ? "border-r" : ""}`}>
                  {col.endsWith("committed") ? "ผูกพัน" : "ลงทุน"}
                </th>
              )))}
            </tr>
            {/* Row 3: numeric filter row only */}
            <tr className="bg-white border-b">
              {groups.map(g => (
                <td key={g.id} colSpan={2} className="px-2 py-1 border-r">
                  <MinMaxFilter
                    value={numFilters[g.id as keyof NumFilter]}
                    onChange={v => setNumFilters(f => ({ ...f, [g.id]: v }))}
                  />
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={infoCols.length + 6} className="text-center py-12 text-gray-400">
                  No data — import Excel file to get started
                </td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr
                  key={row.project_code}
                  className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} ${onSelectSubJob ? "cursor-pointer hover:bg-blue-50" : ""}`}
                  onClick={() => onSelectSubJob?.(row.id, row.project_code, row.name)}
                >
                  {visibility["project_code"] !== false && <td className="px-3 py-2 border-r font-mono text-xs">{row.project_code}</td>}
                  {visibility["name"] !== false && <td className="px-3 py-2 border-r">{row.name}</td>}
                  {visibility["division"] !== false && <td className="px-3 py-2 border-r text-center">{row.division ?? "—"}</td>}
                  {visibility["project_type"] !== false && <td className="px-3 py-2 border-r text-center">{row.project_type}</td>}
                  {visibility["year"] !== false && <td className="px-3 py-2 border-r text-center">{row.year}</td>}
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(row.budget_committed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums border-r">{fmt(row.budget_invest)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(row.target_committed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums border-r">{fmt(row.target_invest)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(row.remain_committed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums border-r">{fmt(row.remain_invest)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 border-t text-xs text-gray-400">
        {sorted.length} of {data.length} rows
      </div>
    </div>
  )
}
