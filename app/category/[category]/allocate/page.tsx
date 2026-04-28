"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import type {
  FlatProject,
  Category,
  CategoryAllocationSelection,
  CategoryAllocationInput,
  CategorySummaryRow,
  CategoryValue,
  FilterOptions,
  JobCategoryAllocation,
  ProjectCategoryAllocation,
  SourceYearEntry,
  SubJobYearEntry,
} from "@/lib/types"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from "recharts"

type AllocationTag = ProjectCategoryAllocation | JobCategoryAllocation
type DraftRow = { valueId: number; percentage: number }
type AmountMetric = "budget" | "target" | "remain"
type AllocationRow =
  | {
      kind: "project"
      key: string
      projectId: number
      projectCode: string
      projectName: string
      label: string
      budget: number
      target: number
      remain: number
    }
  | {
      kind: "job"
      key: string
      projectId: number
      projectCode: string
      projectName: string
      subJobName: string
      label: string
      budget: number
      target: number
      remain: number
    }

const fmt = (n: number) => (n / 1_000_000).toFixed(2) + "M"
const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
const BAR_COLORS = {
  budget: "#3b82f6",
  target: "#10b981",
  remain: "#f59e0b",
}

function sumSubJobs(subJobs: SubJobYearEntry[], name?: string) {
  return subJobs.reduce(
    (sum, row) => {
      if (name && row.name !== name) return sum
      sum.budget += row.budget
      sum.target += row.target
      sum.remain += row.remain
      return sum
    },
    { budget: 0, target: 0, remain: 0 },
  )
}

function sumSources(sources: SourceYearEntry[]) {
  return sources.reduce(
    (sum, row) => {
      sum.budget += row.budget
      sum.target += row.target
      sum.remain += row.remain
      return sum
    },
    { budget: 0, target: 0, remain: 0 },
  )
}

function subJobRank(a: { sort_order: number | null; name: string }, b: { sort_order: number | null; name: string }) {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER
  return ao - bo || a.name.localeCompare(b.name, "th")
}

function uniqueJobs(project: FlatProject) {
  const byName = new Map<string, { name: string; sort_order: number | null }>()
  const subJobs = project.sub_jobs ?? []
  subJobs.forEach(job => {
    const existing = byName.get(job.name)
    if (!existing || subJobRank(job, existing) < 0) {
      byName.set(job.name, { name: job.name, sort_order: job.sort_order })
    }
  })
  return [...byName.values()].sort(subJobRank)
}

function projectKey(projectId: number) {
  return `project:${projectId}`
}

function jobKey(projectId: number, subJobName: string) {
  return `job:${projectId}:${subJobName}`
}

function selectionToKey(selection: CategoryAllocationSelection) {
  if (selection.target_type === "project") return projectKey(selection.project_id)
  if (!selection.sub_job_name) return ""
  return jobKey(selection.project_id, selection.sub_job_name)
}

function keyToSelection(key: string, categoryId: number): CategoryAllocationSelection | null {
  const [kind, projectIdText, ...jobNameParts] = key.split(":")
  const projectId = Number(projectIdText)
  if (!Number.isFinite(projectId) || projectId <= 0) return null
  if (kind === "project") {
    return { category_id: categoryId, project_id: projectId, target_type: "project", sub_job_name: null }
  }
  if (kind === "job") {
    const subJobName = jobNameParts.join(":")
    if (!subJobName) return null
    return { category_id: categoryId, project_id: projectId, target_type: "job", sub_job_name: subJobName }
  }
  return null
}

function moneyFromMillionInput(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return parsed * 1_000_000
}

function cleanPercentage(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100
}

function categoryNameFromParam(value: string | string[] | undefined) {
  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "")
}

export default function CategoryPage() {
  const params = useParams()
  const categoryName = categoryNameFromParam(params.category)
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)
  const [categoryValues, setCategoryValues] = useState<CategoryValue[]>([])
  const [newValue, setNewValue] = useState("")
  const [editingValueId, setEditingValueId] = useState<number | null>(null)
  const [editingValueCode, setEditingValueCode] = useState("")
  const [chartData, setChartData] = useState<CategorySummaryRow[]>([])
  const [projects, setProjects] = useState<FlatProject[]>([])
  const [allocations, setAllocations] = useState<Record<string, AllocationTag[]>>({})
  const [options, setOptions] = useState<FilterOptions>({ years: [], sources: [] })
  const [search, setSearch] = useState("")
  const [year, setYear] = useState("")
  const [source, setSource] = useState("")
  const [amountMetric, setAmountMetric] = useState<AmountMetric>("budget")
  const [minAmount, setMinAmount] = useState("")
  const [allocationFilter, setAllocationFilter] = useState<"all" | "allocated" | "empty">("all")
  const [selectedSearch, setSelectedSearch] = useState("")
  const [selectedYear, setSelectedYear] = useState("")
  const [selectedSource, setSelectedSource] = useState("")
  const [selectedAmountMetric, setSelectedAmountMetric] = useState<AmountMetric>("budget")
  const [selectedMinAmount, setSelectedMinAmount] = useState("")
  const [selectedAllocationFilter, setSelectedAllocationFilter] = useState<"all" | "allocated" | "empty">("all")
  const [showJobs, setShowJobs] = useState(true)
  const [selectedShowJobs, setSelectedShowJobs] = useState(true)
  const [loadingTable, setLoadingTable] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftRow[]>([])
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")
  const [pageError, setPageError] = useState("")
  const [selectedAllocationKeys, setSelectedAllocationKeys] = useState<string[]>([])
  const [checkedCandidateKeys, setCheckedCandidateKeys] = useState<string[]>([])

  const refreshSelectedCategory = useCallback(async () => {
    if (!selectedCat) return
    const [values, chart] = await Promise.all([
      api.categoryValues(selectedCat.id),
      api.categorySummary(selectedCat.name),
    ])
    setCategoryValues(values)
    setChartData(chart)
  }, [selectedCat])

  const loadAllocations = useCallback(async (cat: Category) => {
    const flat = await api.flatProjects()
    setProjects(flat)

    const allocs: Record<string, AllocationTag[]> = {}
    await Promise.all(flat.map(async project => {
      const projectTags = await api.projectCategoryAllocations(project.id)
      allocs[projectKey(project.id)] = projectTags.filter(tag => tag.category_id === cat.id)

      const jobNames = uniqueJobs(project)
      await Promise.all(jobNames.map(async job => {
        const tags = await api.jobCategoryAllocations(project.id, job.name)
        allocs[jobKey(project.id, job.name)] = tags.filter(tag => tag.category_id === cat.id)
      }))
    }))
    setAllocations(allocs)
  }, [])

  const selectCategory = useCallback(async (cat: Category) => {
    setSelectedCat(cat)
    setEditing(null)
    setSelectedAllocationKeys([])
    setCheckedCandidateKeys([])
    setPageError("")

    const [vals, chart, savedSelections] = await Promise.all([
      api.categoryValues(cat.id),
      api.categorySummary(cat.name),
      api.allocationSelections(cat.id),
    ])
    setCategoryValues(vals)
    setChartData(chart)
    setSelectedAllocationKeys(savedSelections.map(selectionToKey).filter(Boolean))

    setLoadingTable(true)
    try {
      await loadAllocations(cat)
    } catch (error: unknown) {
      setPageError(String(error))
    } finally {
      setLoadingTable(false)
    }
  }, [loadAllocations])

  useEffect(() => {
    Promise.resolve().then(async () => {
      const cats = await api.categories()
      const cat = cats.find(item => item.name === categoryName)
      if (cat) {
        await selectCategory(cat)
      } else {
        setPageError("Category not found")
      }
    })
    api.filterOptions().then(setOptions).catch(() => {})
  }, [categoryName, selectCategory])

  const buildRows = useCallback((filterYear: string, filterSource: string, useJobRows: boolean) => {
    const result: AllocationRow[] = []
    projects.forEach(project => {
      if (filterSource && !(project.source_breakdown ?? []).some(row => row.source === filterSource)) {
        return
      }

      const subJobsForYear = filterYear
        ? (project.sub_jobs ?? []).filter(row => String(row.year) === filterYear)
        : project.sub_jobs ?? []

      const sourceRows = (project.source_breakdown ?? []).filter(row => {
        if (filterYear && String(row.year) !== filterYear) return false
        if (filterSource && row.source !== filterSource) return false
        return true
      })

      if (!useJobRows) {
        const projectSum = subJobsForYear.length > 0
          ? sumSubJobs(subJobsForYear)
          : sumSources(sourceRows)
        result.push({
          kind: "project",
          key: projectKey(project.id),
          projectId: project.id,
          projectCode: project.project_code,
          projectName: project.name,
          label: project.name,
          ...projectSum,
        })
        return
      }
      const jobs = uniqueJobs(project)
      if (jobs.length === 0) {
        const projectSum = sumSources(sourceRows)
        result.push({
          kind: "project",
          key: projectKey(project.id),
          projectId: project.id,
          projectCode: project.project_code,
          projectName: project.name,
          label: "Whole project (no jobs)",
          ...projectSum,
        })
      }
      jobs.forEach((job, index) => {
        const jobSum = sumSubJobs(subJobsForYear, job.name)
        result.push({
          kind: "job",
          key: jobKey(project.id, job.name),
          projectId: project.id,
          projectCode: project.project_code,
          projectName: project.name,
          subJobName: job.name,
          label: `${index + 1}. ${job.name}`,
          ...jobSum,
        })
      })
    })
    return result
  }, [projects])

  const candidateBaseRows = useMemo(
    () => buildRows(year, source, showJobs),
    [buildRows, year, source, showJobs],
  )

  const selectedBaseRows = useMemo(
    () => buildRows(selectedYear, selectedSource, selectedShowJobs),
    [buildRows, selectedYear, selectedSource, selectedShowJobs],
  )

  const matchingRows = useMemo(() => {
    return candidateBaseRows.filter(row => {
      const query = search.trim().toLowerCase()
      const alloc = allocations[row.key] ?? []
      const min = moneyFromMillionInput(minAmount)
      if (query) {
        const haystack = [
          row.projectCode,
          row.projectName,
          row.label,
          row.kind === "job" ? row.subJobName : "",
        ].join(" ").toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (allocationFilter === "allocated" && alloc.length === 0) return false
      if (allocationFilter === "empty" && alloc.length > 0) return false
      if (min > 0 && row[amountMetric] < min) return false
      return true
    })
  }, [candidateBaseRows, search, allocationFilter, allocations, amountMetric, minAmount])

  const selectedKeySet = useMemo(() => new Set(selectedAllocationKeys), [selectedAllocationKeys])
  const checkedCandidateKeySet = useMemo(() => new Set(checkedCandidateKeys), [checkedCandidateKeys])

  const nonSelectedRows = useMemo(
    () => matchingRows.filter(row => !selectedKeySet.has(row.key)),
    [matchingRows, selectedKeySet],
  )

  const selectedRows = useMemo(() => {
    return selectedBaseRows.filter(row => {
      if (!selectedKeySet.has(row.key)) return false
      const query = selectedSearch.trim().toLowerCase()
      const alloc = allocations[row.key] ?? []
      const min = moneyFromMillionInput(selectedMinAmount)
      if (query) {
        const haystack = [
          row.projectCode,
          row.projectName,
          row.label,
          row.kind === "job" ? row.subJobName : "",
        ].join(" ").toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (selectedAllocationFilter === "allocated" && alloc.length === 0) return false
      if (selectedAllocationFilter === "empty" && alloc.length > 0) return false
      if (min > 0 && row[selectedAmountMetric] < min) return false
      return true
    })
  }, [selectedBaseRows, selectedKeySet, selectedSearch, selectedAllocationFilter, allocations, selectedAmountMetric, selectedMinAmount])

  const checkedCandidateRows = useMemo(
    () => nonSelectedRows.filter(row => checkedCandidateKeySet.has(row.key)),
    [nonSelectedRows, checkedCandidateKeySet],
  )

  async function saveSelectedKeys(keys: string[]) {
    if (!selectedCat) return
    const selections = keys
      .map(key => keyToSelection(key, selectedCat.id))
      .filter((selection): selection is CategoryAllocationSelection => selection !== null)
    await api.setAllocationSelections(selectedCat.id, selections)
  }

  async function updateSelectedKeys(keys: string[]) {
    setSelectedAllocationKeys(keys)
    setPageError("")
    try {
      await saveSelectedKeys(keys)
    } catch (error: unknown) {
      setPageError(String(error))
    }
  }

  async function addRowsToWorkList(rowsToAdd: AllocationRow[]) {
    const next = new Set(selectedAllocationKeys)
    rowsToAdd.forEach(row => next.add(row.key))
    const nextKeys = [...next]
    await updateSelectedKeys(nextKeys)
    setCheckedCandidateKeys(value => value.filter(key => !rowsToAdd.some(row => row.key === key)))
  }

  async function toggleWorkListRow(row: AllocationRow) {
    const next = new Set(selectedAllocationKeys)
    if (next.has(row.key)) {
      next.delete(row.key)
    } else {
      next.add(row.key)
    }
    await updateSelectedKeys([...next])
  }

  function setBudgetGreaterThanZero() {
    setAmountMetric("budget")
    setMinAmount("0.001")
  }

  async function removeRowsFromWorkList(rowsToRemove: AllocationRow[]) {
    const next = new Set(selectedAllocationKeys)
    rowsToRemove.forEach(row => next.delete(row.key))
    await updateSelectedKeys([...next])
  }

  function toggleCandidateCheck(row: AllocationRow) {
    setCheckedCandidateKeys(value => {
      const next = new Set(value)
      if (next.has(row.key)) {
        next.delete(row.key)
      } else {
        next.add(row.key)
      }
      return [...next]
    })
  }

  function setAllCandidateChecks(checked: boolean) {
    setCheckedCandidateKeys(checked ? nonSelectedRows.map(row => row.key) : [])
  }

  function applyFilters() {
    setCheckedCandidateKeys(value => value.filter(key => nonSelectedRows.some(row => row.key === key)))
  }

  function clearCandidateFilter() {
    setSearch("")
    setYear("")
    setSource("")
    setAmountMetric("budget")
    setMinAmount("")
    setAllocationFilter("all")
    setCheckedCandidateKeys([])
  }

  function clearSelectedFilter() {
    setSelectedSearch("")
    setSelectedYear("")
    setSelectedSource("")
    setSelectedAmountMetric("budget")
    setSelectedMinAmount("")
    setSelectedAllocationFilter("all")
    setSelectedShowJobs(true)
  }

  function renderRows(rows: AllocationRow[], mode: "candidate" | "selected") {
    return rows.map((row, index) => {
      const alloc = allocations[row.key] ?? []
      const isEditing = editing === row.key
      const showProjectHeader = index === 0 || rows[index - 1].projectCode !== row.projectCode

      return (
        <Fragment key={`${mode}-${row.key}`}>
          {showProjectHeader && (
            <tr className="bg-gray-100 border-b">
              <td colSpan={7} className="px-4 py-2">
                <div className="font-medium text-gray-800">{row.projectCode}</div>
                <div className="text-xs text-gray-500 mt-0.5">{row.projectName}</div>
              </td>
            </tr>
          )}
          <tr className={`border-b transition-colors ${isEditing ? "bg-blue-50" : "hover:bg-gray-50"}`}>
            <td className="px-4 py-3">
              {mode === "candidate" ? (
                <input
                  type="checkbox"
                  checked={checkedCandidateKeySet.has(row.key)}
                  onChange={() => toggleCandidateCheck(row)}
                  className="h-4 w-4"
                />
              ) : (
                <button
                  onClick={() => toggleWorkListRow(row)}
                  className="px-2 py-1 rounded-md text-xs font-medium border bg-white text-red-500 border-red-100 hover:border-red-300"
                >
                  Remove
                </button>
              )}
            </td>
            <td className="px-4 py-3">
              <div className="font-mono text-xs text-gray-400">{row.projectCode}</div>
            </td>
            <td className={`px-4 py-3 ${row.kind === "project" ? "font-medium text-gray-800" : "pl-8 text-gray-700"}`}>
              {row.label}
            </td>
            <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{fmt(row.budget)}</td>
            <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{fmt(row.target)}</td>
            <td className="px-4 py-3">
              {alloc.length === 0 ? (
                <span className="text-gray-300 text-xs">-</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {alloc.map(tag => (
                    <span key={tag.id} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                      {tag.tag_code} {tag.percentage}% ({fmt(row.budget * tag.percentage / 100)})
                    </span>
                  ))}
                </div>
              )}
            </td>
            <td className="px-4 py-3 text-right">
              {mode === "selected" && (!isEditing ? (
                <button onClick={() => startEdit(row)} className="text-xs text-blue-500 hover:underline font-medium">
                  {alloc.length > 0 ? "Edit" : "Assign Project"}
                </button>
              ) : (
                <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-gray-600">
                  Cancel
                </button>
              ))}
            </td>
          </tr>

          {mode === "selected" && isEditing && (
            <tr className="bg-blue-50 border-b">
              <td colSpan={7} className="px-6 py-3">
                <div className="max-w-md space-y-2">
                  {draft.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        className="flex-1 border rounded-lg px-2 py-1.5 text-sm bg-white"
                        value={item.valueId}
                        onChange={event =>
                          setDraft(value =>
                            value.map((draftItem, i) =>
                              i === index ? { ...draftItem, valueId: Number(event.target.value) } : draftItem
                            )
                          )
                        }
                      >
                        <option value={0}>- select -</option>
                        {categoryValues.map(value => (
                          <option key={value.id} value={value.id}>{value.code}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        className="w-20 border rounded-lg px-2 py-1.5 text-sm text-right bg-white"
                        value={item.percentage || ""}
                        placeholder="%"
                        onChange={event => setDraftPct(index, Number(event.target.value))}
                      />
                      <span className="w-28 text-xs text-gray-500 text-right font-mono">
                        {fmtMoney(row.budget * cleanPercentage(item.percentage) / 100)}
                      </span>
                      <button
                        title="Fill remaining to 100%"
                        onClick={() => fillRemaining(index)}
                        className="text-blue-400 hover:text-blue-600 text-sm"
                      >
                        Fill
                      </button>
                      <button
                        onClick={() => setDraft(value => value.filter((_, i) => i !== index))}
                        className="text-red-400 hover:text-red-600 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {editError && <p className="text-xs text-red-500">{editError}</p>}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={() => setDraft(value => [...value, { valueId: 0, percentage: 0 }])}
                      className="text-xs text-blue-500 hover:underline"
                    >
                      + Add value
                    </button>
                    <div className="flex-1" />
                    <span className={`text-xs font-mono font-semibold ${
                      draft.length > 0 && draftTotal >= 99.99 && draftTotal <= 100.01
                        ? "text-emerald-600"
                        : "text-gray-400"
                    }`}>
                      {draftTotal.toFixed(2)}%
                    </span>
                    <button
                      onClick={() => saveEdit(row)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          )}
        </Fragment>
      )
    })
  }

  async function addValue() {
    if (!selectedCat) return
    const code = newValue.trim()
    if (!code) return
    setPageError("")
    try {
      await api.createCategoryValue(selectedCat.id, code)
      setNewValue("")
      const values = await api.categoryValues(selectedCat.id)
      setCategoryValues(values)
    } catch {
      setPageError("Value already exists in this category")
    }
  }

  async function renameValue(id: number) {
    const code = editingValueCode.trim()
    if (!selectedCat || !code) return
    setPageError("")
    try {
      await api.updateCategoryValue(id, code)
      setEditingValueId(null)
      setEditingValueCode("")
      await refreshSelectedCategory()
    } catch {
      setPageError("Value name already exists in this category")
    }
  }

  async function deleteValue(id: number) {
    if (!selectedCat) return
    if (!confirm("Delete this value and remove its allocations?")) return
    await api.deleteCategoryValue(id)
    await refreshSelectedCategory()
    await loadAllocations(selectedCat)
  }

  function startEdit(row: AllocationRow) {
    const existing = allocations[row.key] ?? []
    setDraft(existing.map(tag => ({ valueId: tag.tag_value_id, percentage: cleanPercentage(tag.percentage) })))
    setEditing(row.key)
    setEditError("")
  }

  async function saveEdit(row: AllocationRow) {
    if (!selectedCat) return
    const cleanDraft = draft.map(item => ({ ...item, percentage: cleanPercentage(item.percentage) }))
    const total = cleanDraft.reduce((sum, item) => sum + item.percentage, 0)
    if (draft.length > 0 && (total < 99.99 || total > 100.01)) {
      setEditError(`Total is ${total.toFixed(2)}% - must be 100%`)
      return
    }
    if (cleanDraft.some(item => !item.valueId)) {
      setEditError("All rows must have a value selected")
      return
    }

    setSaving(true)
    try {
      const allocations: CategoryAllocationInput[] = cleanDraft.map(item => ({
        tag_value_id: item.valueId,
        percentage: item.percentage,
      }))

      if (row.kind === "project") {
        await api.setProjectCategoryAllocations(row.projectId, selectedCat.id, allocations)
        const updated = await api.projectCategoryAllocations(row.projectId)
        setAllocations(value => ({ ...value, [row.key]: updated.filter(tag => tag.category_id === selectedCat.id) }))
      } else {
        await api.setJobCategoryAllocations(row.projectId, row.subJobName, selectedCat.id, allocations)
        const updated = await api.jobCategoryAllocations(row.projectId, row.subJobName)
        setAllocations(value => ({ ...value, [row.key]: updated.filter(tag => tag.category_id === selectedCat.id) }))
      }

      setChartData(await api.categorySummary(selectedCat.name))
      setEditing(null)
    } catch (error: unknown) {
      setEditError(String(error))
    } finally {
      setSaving(false)
    }
  }

  function setDraftPct(index: number, percentage: number) {
    setDraft(value => value.map((item, i) => i === index ? { ...item, percentage: cleanPercentage(percentage) } : item))
  }

  function fillRemaining(index: number) {
    const others = draft.reduce((sum, item, i) => i !== index ? sum + (item.percentage || 0) : sum, 0)
    setDraftPct(index, 100 - others)
  }

  const draftTotal = draft.reduce((sum, item) => sum + (item.percentage || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {!selectedCat && (
        <>
          <header className="bg-white border-b px-6 py-4">
            <Link href={`/category/${encodeURIComponent(categoryName)}`} className="text-xs text-gray-400 hover:text-gray-700">
              Back to summary
            </Link>
            <h1 className="text-xl font-bold text-gray-800 mt-1">Allocate {categoryName}</h1>
            <p className="text-sm text-gray-400">Loading category...</p>
          </header>

          <main className="px-6 py-6 max-w-4xl mx-auto">
            {pageError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex justify-between">
                {pageError}
                <button onClick={() => setPageError("")}>x</button>
              </div>
            )}
            {!pageError && <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>}
          </main>
        </>
      )}

      {selectedCat && (
      <main className="px-6 py-6 max-w-[1500px] mx-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <Link href={`/category/${encodeURIComponent(selectedCat.name)}`} className="text-xs text-gray-400 hover:text-gray-700 mb-2 inline-block">
              Back to summary
            </Link>
            <h1 className="text-xl font-bold text-gray-800">Allocate {selectedCat.name}</h1>
            <p className="text-sm text-gray-400">Start with an empty work list. Filter, add projects/jobs, then allocate only those rows.</p>
          </div>
          <Link href={`/category/${encodeURIComponent(selectedCat.name)}`} className="text-xs text-blue-500 hover:underline">Summary</Link>
        </div>

          <>
            {pageError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex justify-between">
                {pageError}
                <button onClick={() => setPageError("")}>x</button>
              </div>
            )}

            <div className="bg-white rounded-lg border p-5 mb-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-semibold text-gray-700">
                    {selectedCat.name} values
                  </h2>
                  {categoryValues.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">Add at least one value before allocating jobs.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    className="w-44 border rounded-lg px-3 py-1.5 text-sm"
                    placeholder="New value"
                    value={newValue}
                    onChange={event => setNewValue(event.target.value)}
                    onKeyDown={event => event.key === "Enter" && addValue()}
                  />
                  <button onClick={addValue} className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700">
                    Add value
                  </button>
                </div>
              </div>
              <div className="mb-5 border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-3 py-2 text-xs font-medium text-gray-500">Value</th>
                      <th className="px-3 py-2 text-xs font-medium text-gray-500 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryValues.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-3 py-5 text-center text-xs text-gray-400">No values yet</td>
                      </tr>
                    )}
                    {categoryValues.map(value => (
                      <tr key={value.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2">
                          {editingValueId === value.id ? (
                            <input
                              className="border rounded-lg px-2 py-1 text-sm"
                              value={editingValueCode}
                              onChange={event => setEditingValueCode(event.target.value)}
                              onKeyDown={event => event.key === "Enter" && renameValue(value.id)}
                            />
                          ) : (
                            <span className="font-mono text-gray-800">{value.code}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {editingValueId === value.id ? (
                            <div className="flex items-center justify-end gap-3">
                              <button onClick={() => renameValue(value.id)} className="text-xs text-blue-600 hover:underline">
                                Save
                              </button>
                              <button onClick={() => setEditingValueId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => {
                                  setEditingValueId(value.id)
                                  setEditingValueCode(value.code)
                                }}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button onClick={() => deleteValue(value.id)} className="text-xs text-red-500 hover:underline">
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h2 className="font-semibold text-gray-700 mb-4">
                {selectedCat.name} budget / target by value
              </h2>
              {chartData.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">
                  No allocations yet. Assign a project or job below.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                    <XAxis dataKey="code" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={value => (value / 1_000_000).toFixed(0) + "M"} tick={{ fontSize: 11 }} width={52} />
                    <Tooltip formatter={value => fmt(Number(value))} />
                    <Legend />
                    <Bar dataKey="budget" name="งบเงินดำเนินการปี" fill={BAR_COLORS.budget} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="target" name="เป้าหมายการเบิกจ่ายปี" fill={BAR_COLORS.target} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="remain" name="คงเหลือ" fill={BAR_COLORS.remain} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {loadingTable ? (
              <div className="bg-white rounded-lg border text-center py-12 text-gray-400 text-sm">Loading...</div>
            ) : (
              <>
                <div className="bg-white rounded-lg border overflow-hidden">
                    <div className="px-5 py-3 border-b flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-700">Non-Selected</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Filtered candidates that are not yet in Selected project.</p>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap justify-end">
                        <input
                          className="border rounded-lg px-2 py-1 text-sm w-64"
                          placeholder="Search project or job"
                          value={search}
                          onChange={event => setSearch(event.target.value)}
                        />
                        <select className="border rounded-lg px-2 py-1 text-sm" value={year} onChange={event => setYear(event.target.value)}>
                          <option value="">All years</option>
                          {options.years.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <select className="border rounded-lg px-2 py-1 text-sm" value={source} onChange={event => setSource(event.target.value)}>
                          <option value="">All sources</option>
                          {options.sources.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <select
                          className="border rounded-lg px-2 py-1 text-sm"
                          value={amountMetric}
                          onChange={event => setAmountMetric(event.target.value as AmountMetric)}
                        >
                          <option value="budget">Budget</option>
                          <option value="target">Target</option>
                          <option value="remain">Remain</option>
                        </select>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          className="border rounded-lg px-2 py-1 text-sm w-28 text-right"
                          placeholder="Min M"
                          value={minAmount}
                          onChange={event => setMinAmount(event.target.value)}
                        />
                        <button
                          onClick={setBudgetGreaterThanZero}
                          className="px-2 py-1 border rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Budget &gt; 0
                        </button>
                        <select
                          className="border rounded-lg px-2 py-1 text-sm"
                          value={allocationFilter}
                          onChange={event => setAllocationFilter(event.target.value as "all" | "allocated" | "empty")}
                        >
                          <option value="all">All allocation status</option>
                          <option value="allocated">Allocated only</option>
                          <option value="empty">Not allocated only</option>
                        </select>
                        <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={showJobs}
                            onChange={event => setShowJobs(event.target.checked)}
                          />
                          Job rows
                        </label>
                      </div>
                    </div>
                    <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-3 flex-wrap">
                      <button
                        onClick={applyFilters}
                        disabled={nonSelectedRows.length === 0}
                        className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-medium hover:bg-gray-700 disabled:opacity-40"
                      >
                        Search
                      </button>
                      <button
                        onClick={clearCandidateFilter}
                        className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-medium hover:border-gray-400"
                      >
                        Clear filter
                      </button>
                      <div className="text-xs text-gray-400">
                        Non-Selected: {nonSelectedRows.length}. Checked: {checkedCandidateRows.length}. Selected project: {selectedRows.length}.
                      </div>
                      <div className="flex-1" />
                      <button
                        onClick={() => addRowsToWorkList(checkedCandidateRows)}
                        disabled={checkedCandidateRows.length === 0}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40"
                      >
                        Add All Selected
                      </button>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-left">
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs">
                            <input
                              type="checkbox"
                              checked={nonSelectedRows.length > 0 && checkedCandidateRows.length === nonSelectedRows.length}
                              onChange={event => setAllCandidateChecks(event.target.checked)}
                              className="h-4 w-4"
                            />
                          </th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs">Project</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs">Job / whole project</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Budget</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Target</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs">{selectedCat.name} allocation</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {nonSelectedRows.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No non-selected rows match the filters.</td>
                          </tr>
                        )}
                        {renderRows(nonSelectedRows, "candidate")}
                      </tbody>
                    </table>
                </div>

                <div className="bg-white rounded-lg border overflow-hidden">
                    <div className="px-5 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="font-semibold text-gray-700">Selected project</h3>
                        <p className="text-xs text-gray-400">Independent list. Assign percentages here.</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <input
                          className="border rounded-lg px-2 py-1 text-sm w-56"
                          placeholder="Filter selected"
                          value={selectedSearch}
                          onChange={event => setSelectedSearch(event.target.value)}
                        />
                        <select className="border rounded-lg px-2 py-1 text-sm" value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>
                          <option value="">All years</option>
                          {options.years.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <select className="border rounded-lg px-2 py-1 text-sm" value={selectedSource} onChange={event => setSelectedSource(event.target.value)}>
                          <option value="">All sources</option>
                          {options.sources.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <select
                          className="border rounded-lg px-2 py-1 text-sm"
                          value={selectedAmountMetric}
                          onChange={event => setSelectedAmountMetric(event.target.value as AmountMetric)}
                        >
                          <option value="budget">Budget</option>
                          <option value="target">Target</option>
                          <option value="remain">Remain</option>
                        </select>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          className="border rounded-lg px-2 py-1 text-sm w-28 text-right"
                          placeholder="Min M"
                          value={selectedMinAmount}
                          onChange={event => setSelectedMinAmount(event.target.value)}
                        />
                        <button
                          onClick={() => {
                            setSelectedAmountMetric("budget")
                            setSelectedMinAmount("0.001")
                          }}
                          className="px-2 py-1 border rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Budget &gt; 0
                        </button>
                        <select
                          className="border rounded-lg px-2 py-1 text-sm"
                          value={selectedAllocationFilter}
                          onChange={event => setSelectedAllocationFilter(event.target.value as "all" | "allocated" | "empty")}
                        >
                          <option value="all">All allocation status</option>
                          <option value="allocated">Allocated only</option>
                          <option value="empty">Not allocated only</option>
                        </select>
                        <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-600">
                          <input
                            type="checkbox"
                            checked={selectedShowJobs}
                            onChange={event => setSelectedShowJobs(event.target.checked)}
                          />
                          Job rows
                        </label>
                        <button
                          onClick={clearSelectedFilter}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-medium hover:border-gray-400"
                        >
                          Clear filter
                        </button>
                        <button
                          onClick={() => {
                            removeRowsFromWorkList(selectedRows)
                            setEditing(null)
                          }}
                          disabled={selectedRows.length === 0}
                          className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-medium hover:border-red-300 hover:text-red-500 disabled:opacity-40"
                        >
                          Remove Filtered
                        </button>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-left">
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs">List</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs">Project</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs">Job / whole project</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Budget</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs text-right">Target</th>
                          <th className="px-4 py-2 font-medium text-gray-500 text-xs">{selectedCat.name} allocation</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRows.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No selected projects/jobs yet.</td>
                          </tr>
                        )}
                        {renderRows(selectedRows, "selected")}
                      </tbody>
                    </table>
                </div>
              </>
            )}
          </>
      </main>
      )}
    </div>
  )
}
