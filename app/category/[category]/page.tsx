"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from "react"
import { api } from "@/lib/api"
import type {
  Category, CategorySummaryRow, FilterOptions, FlatProject,
  CategoryValue, CategoryAllocationSelection, CategoryAllocationInput,
  ProjectCategoryAllocation, JobCategoryAllocation,
  SubJobYearEntry,
} from "@/lib/types"
import BudgetTable from "@/components/BudgetTable"
import { useViewMode } from "@/app/SnapshotProvider"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { exportCategoryExcel } from "@/lib/exportExcel"

// ─── Allocation helpers ───────────────────────────────────────────────────────

type AllocationTag = ProjectCategoryAllocation | JobCategoryAllocation
type DraftRow = { valueId: number; percentage: number }
type AllocRow =
  | { kind: "project"; key: string; projectId: number; label: string; budget: number; target: number }
  | { kind: "job"; key: string; projectId: number; subJobName: string; label: string; budget: number; target: number }

function projectKey(id: number) { return `project:${id}` }
function jobKey(pid: number, name: string) { return `job:${pid}:${name}` }

function sumSubJobs(subJobs: SubJobYearEntry[], name?: string) {
  return subJobs.reduce(
    (s, r) => {
      if (name && r.name !== name) return s
      return { budget: s.budget + r.budget, target: s.target + r.target }
    },
    { budget: 0, target: 0 },
  )
}

function uniqueJobsFromFlat(project: FlatProject) {
  const byName = new Map<string, { name: string; sort_order: number | null }>()
  ;(project.sub_jobs ?? []).forEach((j) => {
    const ex = byName.get(j.name)
    const ao = j.sort_order ?? Number.MAX_SAFE_INTEGER
    const bo = ex?.sort_order ?? Number.MAX_SAFE_INTEGER
    if (!ex || ao < bo) byName.set(j.name, { name: j.name, sort_order: j.sort_order })
  })
  return [...byName.values()].sort((a, b) => {
    const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
    const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
    return ao - bo || a.name.localeCompare(b.name, "th")
  })
}

function cleanPct(v: number) {
  return Math.round(Math.min(100, Math.max(0, v)) * 100) / 100
}

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
  const { viewMode } = useViewMode()

  const [category, setCategory] = useState<Category | null>(null)
  const [yearSummaries, setYearSummaries] = useState<Record<number, CategorySummaryRow[]>>({})
  const [liveProjects, setLiveProjects] = useState<FlatProject[]>([])
  const [scenarioProjects, setScenarioProjects] = useState<FlatProject[] | null>(null)
  const [options, setOptions] = useState<FilterOptions>({ years: [], sources: [] })
  const currentBEYear = new Date().getFullYear() + 543
  const [yearFrom, setYearFrom] = useState(String(currentBEYear))
  const [yearTo, setYearTo] = useState(String(currentBEYear + 2))
  const [activeMetrics, setActiveMetrics] = useState<Metric[]>(["budget", "target"])
  const [selectedDivisions, setSelectedDivisions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [exporting, setExporting] = useState(false)

  // Inline allocation state
  const [catValues, setCatValues] = useState<CategoryValue[]>([])
  const [selectionKeys, setSelectionKeys] = useState<Set<string>>(new Set())
  const [tableAllocations, setTableAllocations] = useState<Record<string, AllocationTag[]>>({})
  const [modalProject, setModalProject] = useState<FlatProject | null>(null)
  const [modalRows, setModalRows] = useState<AllocRow[]>([])
  const [modalAllocations, setModalAllocations] = useState<Record<string, AllocationTag[]>>({})
  const [modalLoading, setModalLoading] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftRow[]>([])
  const [draftSaving, setDraftSaving] = useState(false)
  const [draftError, setDraftError] = useState("")

  // ─── Inline allocation ──────────────────────────────────────────────────────

  const openModal = useCallback(async (project: FlatProject) => {
    setModalProject(project)
    setModalLoading(true)
    setEditingKey(null)
    setDraft([])
    setDraftError("")
    const cat = category
    if (!cat) { setModalLoading(false); return }

    const jobs = uniqueJobsFromFlat(project)
    const rows: AllocRow[] = []
    const allocs: Record<string, AllocationTag[]> = {}

    if (jobs.length === 0) {
      const key = projectKey(project.id)
      const tags = await api.projectCategoryAllocations(project.id)
      allocs[key] = tags.filter((t) => t.category_id === cat.id)
      const totals = sumSubJobs(project.sub_jobs ?? [])
      rows.push({ kind: "project", key, projectId: project.id, label: "ทั้งโครงการ", ...totals })
    } else {
      await Promise.all(jobs.map(async (job, idx) => {
        const key = jobKey(project.id, job.name)
        const tags = await api.jobCategoryAllocations(project.id, job.name)
        allocs[key] = tags.filter((t) => t.category_id === cat.id)
        const totals = sumSubJobs(project.sub_jobs ?? [], job.name)
        rows[idx] = { kind: "job", key, projectId: project.id, subJobName: job.name, label: `${idx + 1}. ${job.name}`, ...totals }
      }))
    }

    setModalAllocations(allocs)
    setModalRows(rows)
    setModalLoading(false)
  }, [category])

  function startRowEdit(row: AllocRow) {
    const existing = modalAllocations[row.key] ?? []
    setDraft(existing.map((t) => ({ valueId: t.tag_value_id, percentage: cleanPct(t.percentage) })))
    setEditingKey(row.key)
    setDraftError("")
  }

  async function saveRowEdit(row: AllocRow) {
    if (!category) return
    const cleanDraft = draft.map((d) => ({ ...d, percentage: cleanPct(d.percentage) }))
    const total = cleanDraft.reduce((s, d) => s + d.percentage, 0)
    if (cleanDraft.length > 0 && (total < 99.99 || total > 100.01)) {
      setDraftError(`รวม ${total.toFixed(2)}% — ต้องเป็น 100%`)
      return
    }
    if (cleanDraft.some((d) => !d.valueId)) {
      setDraftError("ต้องเลือก value ทุกแถว")
      return
    }
    const input: CategoryAllocationInput[] = cleanDraft.map((d) => ({ tag_value_id: d.valueId, percentage: d.percentage }))
    setDraftSaving(true)
    try {
      let updatedTags: AllocationTag[]
      if (row.kind === "project") {
        await api.setProjectCategoryAllocations(row.projectId, category.id, input)
        const updated = await api.projectCategoryAllocations(row.projectId)
        updatedTags = updated.filter((t) => t.category_id === category.id)
        setModalAllocations((prev) => ({ ...prev, [row.key]: updatedTags }))
      } else {
        await api.setJobCategoryAllocations(row.projectId, row.subJobName, category.id, input)
        const updated = await api.jobCategoryAllocations(row.projectId, row.subJobName)
        updatedTags = updated.filter((t) => t.category_id === category.id)
        setModalAllocations((prev) => ({ ...prev, [row.key]: updatedTags }))
      }
      // sync table allocations so cell refreshes immediately
      setTableAllocations((prev) => ({ ...prev, [row.key]: updatedTags }))
      setSelectionKeys((prev) => {
        const next = new Set(prev)
        if (input.length > 0) next.add(row.key); else next.delete(row.key)
        return next
      })
      setEditingKey(null)
    } catch (e: unknown) {
      setDraftError(String(e))
    } finally {
      setDraftSaving(false)
    }
  }

  function fillRemaining(idx: number) {
    const others = draft.reduce((s, d, i) => i !== idx ? s + (d.percentage || 0) : s, 0)
    setDraft((prev) => prev.map((d, i) => i === idx ? { ...d, percentage: cleanPct(100 - others) } : d))
  }

  const draftTotal = draft.reduce((s, d) => s + (d.percentage || 0), 0)

  const fmt2 = (n: number) => (n / 1_000_000).toFixed(2) + "M"

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
      .then(async ([cats, opts, flat]) => {
        if (ignore) return
        const cat = cats.find((item) => item.name === categoryName) ?? null
        setCategory(cat)
        setOptions(opts)
        setLiveProjects(flat)
        if (cat) {
          const [vals, sels] = await Promise.all([
            api.categoryValues(cat.id),
            api.allocationSelections(cat.id),
          ])
          if (ignore) return
          setCatValues(vals)
          setSelectionKeys(new Set(sels.map((s: CategoryAllocationSelection) =>
            s.target_type === "project"
              ? projectKey(s.project_id)
              : s.sub_job_name ? jobKey(s.project_id, s.sub_job_name) : ""
          ).filter(Boolean)))

          // Load allocations for every project/job (not just worklist keys)
          const allAllocs: Record<string, AllocationTag[]> = {}
          await Promise.all(flat.map(async (p: FlatProject) => {
            const jobs = uniqueJobsFromFlat(p)
            if (jobs.length === 0) {
              const key = projectKey(p.id)
              const tags = await api.projectCategoryAllocations(p.id)
              allAllocs[key] = tags.filter((t) => t.category_id === cat.id)
            } else {
              await Promise.all(jobs.map(async (j) => {
                const key = jobKey(p.id, j.name)
                const tags = await api.jobCategoryAllocations(p.id, j.name)
                allAllocs[key] = tags.filter((t) => t.category_id === cat.id)
              }))
            }
          }))
          if (ignore) return
          setTableAllocations(allAllocs)
        }
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

  // Load scenario flat data when in scenario mode
  useEffect(() => {
    if (viewMode.kind !== "scenario") { setScenarioProjects(null); return }
    let ignore = false
    api.scenarioFlat(viewMode.item.id)
      .then((flat) => { if (!ignore) setScenarioProjects(flat) })
      .catch(() => {})
    return () => { ignore = true }
  }, [viewMode.kind === "scenario" ? viewMode.item.id : 0]) // eslint-disable-line react-hooks/exhaustive-deps

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


  const projects = viewMode.kind === "snapshot"
    ? viewMode.data
    : viewMode.kind === "scenario" && scenarioProjects
      ? scenarioProjects
      : liveProjects

  const allDivisions = useMemo(() => {
    const set = new Set<string>()
    projects.forEach((p) => { if (p.division) set.add(p.division) })
    return [...set].sort()
  }, [projects])

  const filteredProjects = useMemo(() => {
    if (selectedDivisions.size === 0) return projects
    return projects.filter((p) => p.division && selectedDivisions.has(p.division))
  }, [projects, selectedDivisions])

  const allocatedCount = useMemo(() => {
    return filteredProjects.filter((p) => {
      const jobs = uniqueJobsFromFlat(p)
      if (jobs.length === 0) return (tableAllocations[projectKey(p.id)] ?? []).length > 0
      return jobs.some((j) => (tableAllocations[jobKey(p.id, j.name)] ?? []).length > 0)
    }).length
  }, [filteredProjects, tableAllocations])

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
          </div>
        </div>
      </header>

      {/* Mode banner */}
      {viewMode.kind === "snapshot" && (
        <div style={{ background: "#EEF2FF", borderBottom: "1px solid #C7D2FE", padding: "6px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="#6366F1">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm3 5a1 1 0 10-2 0v1H4a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2H8V9z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: 12, color: "#4338CA" }}>
            Project table shows snapshot: <strong>{viewMode.item.label}</strong>
            <span style={{ marginLeft: 6, color: "#818CF8", fontSize: 11 }}>(charts reflect live allocation data)</span>
          </span>
        </div>
      )}
      {viewMode.kind === "scenario" && (
        <div style={{ background: "#F5F3FF", borderBottom: "1px solid #C4B5FD", padding: "6px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="#7C3AED">
            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: 12, color: "#5B21B6" }}>
            Project table shows scenario: <strong>{viewMode.item.label}</strong>
            <span style={{ marginLeft: 6, color: "#7C3AED", fontSize: 11 }}>(charts reflect live allocation data)</span>
          </span>
        </div>
      )}

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

              {/* Summary value table — years as columns */}
              {(() => {
                const activeMetricList = (["budget", "target", "remain"] as Metric[]).filter((m) =>
                  activeMetrics.includes(m),
                )
                const yearTotalsMap = Object.fromEntries(
                  activeYears.map((y) => {
                    const rows = yearSummaries[y] ?? []
                    return [
                      y,
                      rows.reduce(
                        (acc, r) => ({
                          budget: acc.budget + r.budget,
                          target: acc.target + r.target,
                          remain: acc.remain + r.remain,
                        }),
                        { budget: 0, target: 0, remain: 0 },
                      ),
                    ]
                  }),
                )
                const colCount = 1 + activeYears.length * activeMetricList.length * 2
                const thBase: React.CSSProperties = {
                  padding: "5px 4px",
                  textAlign: "right",
                  color: "#6B7280",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }
                return (
                  <table
                    style={{
                      width: "100%",
                      fontSize: 13,
                      borderCollapse: "collapse",
                      borderTop: "0.5px solid #E5E7EB",
                    }}
                  >
                    <thead>
                      {/* Row 1: year span headers */}
                      <tr style={{ background: "#F9FAFB" }}>
                        <th
                          rowSpan={2}
                          style={{
                            ...thBase,
                            textAlign: "left",
                            padding: "5px 12px",
                            verticalAlign: "bottom",
                          }}
                        >
                          Value
                        </th>
                        {activeYears.map((year) => (
                          <th
                            key={year}
                            colSpan={activeMetricList.length * 2}
                            style={{
                              ...thBase,
                              textAlign: "center",
                              color: "#1D4ED8",
                              borderLeft: "0.5px solid #E5E7EB",
                              borderBottom: "0.5px solid #E5E7EB",
                            }}
                          >
                            {year}
                          </th>
                        ))}
                      </tr>
                      {/* Row 2: metric + % sub-headers */}
                      <tr style={{ background: "#F9FAFB" }}>
                        {activeYears.flatMap((year) =>
                          activeMetricList.flatMap((m, mi) => [
                            <th
                              key={`${year}-${m}-amt`}
                              style={{
                                ...thBase,
                                borderLeft: mi === 0 ? "0.5px solid #E5E7EB" : undefined,
                              }}
                            >
                              {METRIC_LABELS[m]}
                            </th>,
                            <th
                              key={`${year}-${m}-pct`}
                              style={{
                                ...thBase,
                                fontSize: 10,
                                width: "1.8rem",
                                color: METRIC_ACCENT[m],
                              }}
                            >
                              %
                            </th>,
                          ]),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {valueCodes.length === 0 && (
                        <tr>
                          <td
                            colSpan={colCount}
                            style={{ padding: "32px 16px", textAlign: "center", color: "#6B7280" }}
                          >
                            No allocated data yet
                          </td>
                        </tr>
                      )}
                      {valueCodes.map((code, i) => {
                        const rowBg = i % 2 === 0 ? "#ffffff" : "#F9FAFB"
                        const swatchColor = CODE_FILLS.budget[i % CODE_FILLS.budget.length]
                        return (
                          <tr key={code} style={{ background: rowBg }}>
                            <td style={{ padding: "7px 16px" }}>
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
                                  {code}
                                </span>
                              </div>
                            </td>
                            {activeYears.flatMap((year, yi) => {
                              const rows = yearSummaries[year] ?? []
                              const row = rows.find((r) => r.code === code)
                              const yt = yearTotalsMap[year]
                              return activeMetricList.flatMap((m, mi) => [
                                <td
                                  key={`${year}-${m}-amt`}
                                  style={{
                                    padding: "5px 4px",
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                    fontFamily: "monospace",
                                    color: row ? "#374151" : "#D1D5DB",
                                    borderLeft:
                                      mi === 0 && yi > 0 ? "0.5px solid #E5E7EB" : undefined,
                                  }}
                                >
                                  {row ? fmt(row[m]) : "—"}
                                </td>,
                                <td
                                  key={`${year}-${m}-pct`}
                                  style={{
                                    padding: "5px 3px 5px 1px",
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                    fontFamily: "monospace",
                                    fontSize: 10,
                                    color: row ? METRIC_ACCENT[m] : "#D1D5DB",
                                    fontWeight: 600,
                                  }}
                                >
                                  {row ? fmtPct(row[m], yt[m]) : "—"}
                                </td>,
                              ])
                            })}
                          </tr>
                        )
                      })}
                      {valueCodes.length > 0 && (
                        <tr style={{ background: "#F9FAFB", borderTop: "0.5px solid #D1D5DB" }}>
                          <td
                            style={{ padding: "5px 12px", color: "#111827", fontWeight: 700 }}
                          >
                            Total
                          </td>
                          {activeYears.flatMap((year, yi) => {
                            const yt = yearTotalsMap[year]
                            return activeMetricList.flatMap((m, mi) => [
                              <td
                                key={`${year}-${m}-amt`}
                                style={{
                                  padding: "5px 4px",
                                  textAlign: "right",
                                  fontVariantNumeric: "tabular-nums",
                                  fontFamily: "monospace",
                                  color: "#111827",
                                  fontWeight: 700,
                                  borderLeft:
                                    mi === 0 && yi > 0 ? "0.5px solid #E5E7EB" : undefined,
                                }}
                              >
                                {fmt(yt[m])}
                              </td>,
                              <td
                                key={`${year}-${m}-pct`}
                                style={{
                                  padding: "5px 3px 5px 1px",
                                  textAlign: "right",
                                  fontVariantNumeric: "tabular-nums",
                                  fontFamily: "monospace",
                                  fontSize: 10,
                                  color: "#6B7280",
                                }}
                              >
                                100%
                              </td>,
                            ])
                          })}
                        </tr>
                      )}
                    </tbody>
                  </table>
                )
              })()}
            </div>

            <BudgetTable
              data={filteredProjects}
              years={activeYears}
              extraColumn={{
                header: (
                  <span>
                    จัดสรร
                    <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 400, color: "#6B7280" }}>
                      ({allocatedCount}/{filteredProjects.length})
                    </span>
                  </span>
                ),
                cell: (project) => {
                  const jobs = uniqueJobsFromFlat(project)
                  // Collect all tags for this project across project-level and job-level keys
                  const allTags: AllocationTag[] = []
                  if (jobs.length === 0) {
                    const t = tableAllocations[projectKey(project.id)] ?? []
                    allTags.push(...t)
                  } else {
                    jobs.forEach((j) => {
                      const t = tableAllocations[jobKey(project.id, j.name)] ?? []
                      allTags.push(...t)
                    })
                  }
                  // Use first-occurrence percentage per code (summing across jobs is meaningless)
                  const byCode = new Map<string, number>()
                  allTags.forEach((t) => { if (!byCode.has(t.tag_code)) byCode.set(t.tag_code, t.percentage) })
                  const isAllocated = byCode.size > 0
                  return (
                    <button
                      type="button"
                      onClick={() => openModal(project)}
                      style={{
                        fontSize: 11,
                        padding: "3px 10px",
                        borderRadius: 6,
                        border: isAllocated ? "1px solid #86EFAC" : "1px solid #D1D5DB",
                        background: isAllocated ? "#F0FDF4" : "#F9FAFB",
                        color: isAllocated ? "#166534" : "#374151",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontWeight: isAllocated ? 600 : 400,
                        textAlign: "left",
                      }}
                    >
                      {isAllocated
                        ? [...byCode.entries()].map(([code, pct]) =>
                            jobs.length <= 1 ? `${code} ${pct.toFixed(0)}%` : code
                          ).join(" · ")
                        : "จัดสรร"}
                    </button>
                  )
                },
              }}
            />
          </>
        )}
      </main>

      {/* Allocation modal */}
      {modalProject && (
        <div
          onClick={() => setModalProject(null)}
          style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}
          >
            {/* Modal header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{modalProject.name}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" }}>{modalProject.project_code}</div>
              </div>
              <button onClick={() => setModalProject(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18, lineHeight: 1, padding: 2 }}>✕</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "16px 20px" }}>
              {modalLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
              ) : (
                <>
                  {catValues.length === 0 && (
                    <div style={{ padding: "8px 12px", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 6, fontSize: 12, color: "#92400E", marginBottom: 12 }}>
                      ยังไม่มี value ใน category นี้ — เพิ่มก่อนใน Manage page
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {modalRows.map((row) => {
                      const alloc = modalAllocations[row.key] ?? []
                      const isEditing = editingKey === row.key
                      return (
                        <Fragment key={row.key}>
                          <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                            {/* Row header */}
                            <div style={{ background: "#F9FAFB", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: isEditing ? "1px solid #E5E7EB" : "none" }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{row.label}</div>
                                <div style={{ fontSize: 11, color: "#9CA3AF" }}>Budget {fmt2(row.budget)} · Target {fmt2(row.target)}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {alloc.length > 0 && !isEditing && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                    {alloc.map((t) => (
                                      <span key={t.id} style={{ fontSize: 11, background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>
                                        {t.tag_code} {t.percentage}%
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {!isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => startRowEdit(row)}
                                    disabled={catValues.length === 0}
                                    style={{ fontSize: 11, padding: "3px 10px", background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", borderRadius: 5, cursor: "pointer" }}
                                  >
                                    {alloc.length > 0 ? "แก้ไข" : "กำหนด"}
                                  </button>
                                ) : (
                                  <button type="button" onClick={() => setEditingKey(null)} style={{ fontSize: 11, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}>ยกเลิก</button>
                                )}
                              </div>
                            </div>

                            {/* Inline editor */}
                            {isEditing && (
                              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                                {draft.map((item, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <select
                                      value={item.valueId}
                                      onChange={(e) => setDraft((prev) => prev.map((d, j) => j === i ? { ...d, valueId: Number(e.target.value) } : d))}
                                      style={{ flex: 1, border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", fontSize: 12 }}
                                    >
                                      <option value={0}>- เลือก -</option>
                                      {catValues.map((v) => (
                                        <option key={v.id} value={v.id}>{v.code}</option>
                                      ))}
                                    </select>
                                    <input
                                      type="number" step="0.01" min="0" max="100"
                                      value={item.percentage || ""}
                                      placeholder="%"
                                      onChange={(e) => setDraft((prev) => prev.map((d, j) => j === i ? { ...d, percentage: cleanPct(Number(e.target.value)) } : d))}
                                      style={{ width: 64, border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 6px", fontSize: 12, textAlign: "right" }}
                                    />
                                    <button type="button" onClick={() => fillRemaining(i)} style={{ fontSize: 11, color: "#3B82F6", background: "none", border: "none", cursor: "pointer" }}>Fill</button>
                                    <button type="button" onClick={() => setDraft((prev) => prev.filter((_, j) => j !== i))} style={{ fontSize: 11, color: "#EF4444", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                                  </div>
                                ))}
                                {draftError && <div style={{ fontSize: 11, color: "#EF4444" }}>{draftError}</div>}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
                                  <button type="button" onClick={() => setDraft((prev) => [...prev, { valueId: 0, percentage: 0 }])} style={{ fontSize: 11, color: "#3B82F6", background: "none", border: "none", cursor: "pointer" }}>+ เพิ่ม value</button>
                                  <span style={{ flex: 1 }} />
                                  <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 600, color: draftTotal >= 99.99 && draftTotal <= 100.01 ? "#059669" : "#6B7280" }}>{draftTotal.toFixed(2)}%</span>
                                  <button
                                    type="button"
                                    onClick={() => saveRowEdit(row)}
                                    disabled={draftSaving}
                                    style={{ fontSize: 12, padding: "4px 14px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                                  >
                                    {draftSaving ? "…" : "บันทึก"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </Fragment>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
