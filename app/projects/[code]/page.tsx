"use client"

import { Fragment, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { api } from "@/lib/api"
import type { ProjectDetail, SubJob, BudgetSource, ChangeLogEntry } from "@/lib/types"
import { useViewMode } from "@/app/SnapshotProvider"

const fmt3 = (n: number) =>
  !n ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

function fmtDate(s: string) {
  return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
}

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingRow = { budget: number; target: number; cut_transfer: number; under_budget: number }
type EditField = "budget" | "target" | "cut_transfer" | "under_budget"
type EditState = { key: string; field: EditField; value: string }
type NewPendingRow = { budget: number; target: number; cut_transfer: number; under_budget: number; project_id: number; name_or_source: string; sort_order: number | null; fund_type: string; data_year: number; prefix: "sj" | "bs" }
type RecalcSource = PendingRow & { prefix: "sj" | "bs"; groupName: string; sort_order: number | null; fund_type: string; data_year: number }

type SubJobGroup = {
  name: string; sort_order: number | null
  years: { year: number; committed: SubJob | null; invest: SubJob | null }[]
}
type SourceGroup = {
  source: string
  years: { year: number; committed: BudgetSource | null; invest: BudgetSource | null }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupSubJobs(jobs: SubJob[]): SubJobGroup[] {
  const map = new Map<string, SubJobGroup>()
  for (const sj of jobs) {
    if (!map.has(sj.name)) map.set(sj.name, { name: sj.name, sort_order: sj.sort_order, years: [] })
    const g = map.get(sj.name)!
    let yr = g.years.find((y) => y.year === sj.data_year)
    if (!yr) { yr = { year: sj.data_year, committed: null, invest: null }; g.years.push(yr) }
    if (sj.fund_type === "ผูกพัน") yr.committed = sj; else yr.invest = sj
  }
  return [...map.values()]
    .sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999) || a.name.localeCompare(b.name, "th"))
    .map((g) => ({ ...g, years: g.years.sort((a, b) => a.year - b.year) }))
}

function groupSources(sources: BudgetSource[]): SourceGroup[] {
  const map = new Map<string, SourceGroup>()
  for (const bs of sources) {
    if (!map.has(bs.source)) map.set(bs.source, { source: bs.source, years: [] })
    const g = map.get(bs.source)!
    let yr = g.years.find((y) => y.year === bs.data_year)
    if (!yr) { yr = { year: bs.data_year, committed: null, invest: null }; g.years.push(yr) }
    if (bs.fund_type === "ผูกพัน") yr.committed = bs; else yr.invest = bs
  }
  return [...map.values()].map((g) => ({ ...g, years: g.years.sort((a, b) => a.year - b.year) }))
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const border = "0.5px solid #E5E7EB"
const th: React.CSSProperties = { border, padding: "5px 10px", background: "#F9FAFB", color: "#6B7280", fontWeight: 600, fontSize: 11, textAlign: "center", whiteSpace: "nowrap" }
const td = (opts?: React.CSSProperties): React.CSSProperties => ({ border, padding: "4px 8px", fontSize: 12, color: "#374151", ...opts })

// ─── EditableCell ─────────────────────────────────────────────────────────────

function EditableCell({
  value, isPending, isEditing, editValue,
  isUndo,
  onStartEdit, onChange, onCommit, onCancel,
}: {
  value: number; isPending: boolean; isEditing: boolean; editValue: string
  isUndo?: boolean
  onStartEdit: () => void; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void
}) {
  if (isEditing) {
    return (
      <input
        autoFocus
        value={editValue}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel() }}
        style={{ width: 120, textAlign: "right", fontFamily: "monospace", fontSize: 12, border: "1.5px solid #3B82F6", borderRadius: 4, padding: "2px 6px", outline: "none" }}
      />
    )
  }
  return (
    <span
      onClick={onStartEdit}
      title="Click to edit"
      style={{
        display: "block", textAlign: "right", padding: "2px 6px", borderRadius: 4,
        cursor: "text", fontFamily: "monospace", minWidth: 100,
        background: isUndo ? "#FEE2E2" : isPending ? "#FEF9C3" : "transparent",
        fontWeight: isPending ? 600 : undefined,
        color: isUndo ? "#B91C1C" : value === 0 && !isPending ? "#9CA3AF" : undefined,
      }}
      onMouseEnter={(e) => { if (!isPending && !isUndo) (e.currentTarget as HTMLElement).style.background = "#EEF2FF" }}
      onMouseLeave={(e) => { if (!isPending && !isUndo) (e.currentTarget as HTMLElement).style.background = "transparent" }}
    >
      {value === 0 ? "0.000" : fmt3(value)}
    </span>
  )
}


// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectPage() {
  const params = useParams<{ code: string }>()
  const code = decodeURIComponent(params.code)
  const { viewMode } = useViewMode()
  const isScenario = viewMode.kind === "scenario"
  const scenarioId = isScenario ? viewMode.item.id : null

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Pending edits — key: "sj-{id}" | "bs-{id}"
  const [pending, setPending] = useState<Map<string, PendingRow>>(new Map())
  // Pending new rows — key: "sj-new|{name}|{year}|{fund_type}" | "bs-new|{source}|{year}|{fund_type}"
  const [pendingNew, setPendingNew] = useState<Map<string, NewPendingRow>>(new Map())
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  // History
  const [history, setHistory] = useState<ChangeLogEntry[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [undoKeys, setUndoKeys] = useState<Set<string>>(new Set())
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [editingBatch, setEditingBatch] = useState<string | null>(null)
  const [batchCommentInput, setBatchCommentInput] = useState("")
  const [savingBatchComment, setSavingBatchComment] = useState(false)

  // Save bar
  const [saveComment, setSaveComment] = useState("")

  const load = useCallback(async () => {
    try {
      const p = isScenario && scenarioId != null
        ? await api.scenarioProjectDetail(scenarioId, code)
        : await api.projectDetail(code)
      setProject(p)
    } catch (e: unknown) { setError(String(e)) }
    finally { setLoading(false) }
  }, [code, isScenario, scenarioId])

  const loadHistory = useCallback(async () => {
    if (isScenario) return
    try { setHistory(await api.projectHistory(code)) } catch {}
  }, [code, isScenario])

  useEffect(() => { setProject(null); setLoading(true); setPending(new Map()); setPendingNew(new Map()); setUndoKeys(new Set()); load() }, [load])
  useEffect(() => { loadHistory() }, [loadHistory])

  function historyFieldLabel(field: string) {
    if (field === "budget") return "งบเงินดำเนินการ"
    if (field === "target") return "เป้าหมายการเบิกจ่าย"
    if (field === "cut_transfer") return "ตัดทิ้ง/โยกย้าย"
    if (field === "under_budget") return "ต่ำกว่างบ"
    return field
  }

  function isHistoryVisible(entry: ChangeLogEntry) {
    if (!["budget", "target", "cut_transfer", "under_budget"].includes(entry.field)) return false
    return !(entry.field === "budget" && entry.fund_type === "ผูกพัน")
  }

  // Column highlight for mismatch navigation
  const [blinkCol, setBlinkCol] = useState<string | null>(null)
  function scrollToCol(year: number, field: string, fund_type: string) {
    const colId = `col-${year}-${field}-${fund_type}`
    setBlinkCol(colId)
    document.querySelectorAll(`[data-col="${colId}"]`).forEach(el => {
      const container = (el as HTMLElement).closest("[data-scroll-container]") as HTMLElement | null
      if (!container) return
      const elRect = el.getBoundingClientRect()
      const cRect = container.getBoundingClientRect()
      container.scrollTo({ left: Math.max(0, container.scrollLeft + elRect.left - cRect.left - cRect.width / 2 + elRect.width / 2), behavior: "smooth" })
    })
    setTimeout(() => setBlinkCol(null), 900)
  }

  // ── Pending edit helpers ───────────────────────────────────────────────────

  function startEdit(key: string, field: EditField) {
    if (!project) return
    const [prefix, idStr] = key.split("-")
    const id = parseInt(idStr)
    const row = prefix === "sj"
      ? project.sub_jobs.find((r) => r.id === id)
      : project.budget_sources.find((r) => r.id === id)
    if (!row) return
    const cur = pending.get(key) ?? { budget: row.budget, target: row.target, cut_transfer: row.cut_transfer ?? 0, under_budget: row.under_budget ?? 0 }
    setEditState({ key, field, value: String(cur[field] ?? 0) })
  }

  function makeForwardRecalc(source: RecalcSource) {
    if (!project) return { extraPending: new Map<string, PendingRow>(), extraDeletes: [] as string[], extraPendingNew: new Map<string, NewPendingRow>() }

    const extraPending = new Map<string, PendingRow>()
    const extraDeletes: string[] = []
    const extraPendingNew = new Map<string, NewPendingRow>()
    const { prefix, groupName } = source
    const { data_year } = source
    const sortOrder = source.sort_order ?? null
    const siblingFund = source.fund_type === "ผูกพัน" ? "ลงทุน" : "ผูกพัน"
    const rows = prefix === "sj" ? project.sub_jobs : project.budget_sources
    const sameGroup = (row: SubJob | BudgetSource) =>
      prefix === "sj" ? (row as SubJob).name === groupName : (row as BudgetSource).source === groupName
    const findGroupedRow = (fundType: string, year: number) => {
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i]
        if (sameGroup(row) && row.fund_type === fundType && row.data_year === year) return row
      }
      return null
    }
    const siblingRow = findGroupedRow(siblingFund, data_year)
    const siblingPendingNew = pendingNew.get(`${prefix}-new|${groupName}|${data_year}|${siblingFund}`)
    const siblingKey = siblingRow ? `${prefix}-${siblingRow.id}` : ""
    const siblingBudget = siblingRow ? (pending.get(siblingKey)?.budget ?? siblingRow.budget) : (siblingPendingNew?.budget ?? 0)
    const siblingTarget = siblingRow ? (pending.get(siblingKey)?.target ?? siblingRow.target) : (siblingPendingNew?.target ?? 0)
    const totalRemain = (source.budget - source.target) + (siblingBudget - siblingTarget)
    const carryForward = totalRemain + source.cut_transfer + source.under_budget

    const yearIdx = allYears.indexOf(data_year)
    if (yearIdx < 0 || yearIdx >= allYears.length - 1) return { extraPending, extraDeletes, extraPendingNew }

    const nextYear = allYears[yearIdx + 1]
    const nextComm = findGroupedRow("ผูกพัน", nextYear)
    if (nextComm) {
      const nextKey = `${prefix}-${nextComm.id}`
      const nextBase = pending.get(nextKey) ?? {
        budget: nextComm.budget,
        target: nextComm.target,
        cut_transfer: nextComm.cut_transfer,
        under_budget: nextComm.under_budget,
      }
      const nextUpdated = { ...nextBase, budget: carryForward }
      const isOriginal =
        nextUpdated.budget === nextComm.budget &&
        nextUpdated.target === nextComm.target &&
        nextUpdated.cut_transfer === nextComm.cut_transfer &&
        nextUpdated.under_budget === nextComm.under_budget
      if (isOriginal) extraDeletes.push(nextKey)
      else extraPending.set(nextKey, nextUpdated)
    } else {
      const nextKey = `${prefix}-new|${groupName}|${nextYear}|ผูกพัน`
      const existing = pendingNew.get(nextKey)
      extraPendingNew.set(nextKey, existing
        ? { ...existing, budget: carryForward }
        : {
          budget: carryForward,
          target: 0,
          cut_transfer: 0,
          under_budget: 0,
          project_id: project.id,
          name_or_source: groupName,
          sort_order: prefix === "sj" ? sortOrder : null,
          fund_type: "ผูกพัน",
          data_year: nextYear,
          prefix,
        }
      )
    }

    return { extraPending, extraDeletes, extraPendingNew }
  }

  function commitEdit() {
    if (!editState || !project) return
    const raw = editState.value.replace(/,/g, "").trim()
    const num = parseFloat(raw)
    if (isNaN(num)) { setEditState(null); return }

    const { key, field } = editState

    // Virtual key for new rows
    if (key.includes("-new|")) {
      const existing = pendingNew.get(key)
      if (!existing) { setEditState(null); return }
      const updated = { ...existing, [field]: num }
      const isEmpty = updated.budget === 0 && updated.target === 0 && updated.cut_transfer === 0 && updated.under_budget === 0
      const { extraPending, extraDeletes, extraPendingNew } = makeForwardRecalc({
        ...updated,
        groupName: updated.name_or_source,
        sort_order: updated.sort_order,
      })

      setPendingNew((prev) => {
        const n = new Map(prev)
        if (isEmpty) n.delete(key); else n.set(key, updated)
        extraPendingNew.forEach((v, k) => n.set(k, v))
        return n
      })
      setUndoKeys((prev) => {
        const n = new Set(prev)
        n.delete(`${key}|${field}`)
        return n
      })
      if (extraPending.size > 0 || extraDeletes.length > 0) {
        setPending((prev) => {
          const n = new Map(prev)
          extraPending.forEach((v, k) => n.set(k, v))
          extraDeletes.forEach(k => n.delete(k))
          return n
        })
      }
      setEditState(null)
      return
    }

    const [prefix, idStr] = key.split("-")
    const id = parseInt(idStr)
    const row = prefix === "sj"
      ? project.sub_jobs.find((r) => r.id === id)
      : project.budget_sources.find((r) => r.id === id)
    if (!row) { setEditState(null); return }

    const base = pending.get(key) ?? { budget: row.budget, target: row.target, cut_transfer: row.cut_transfer ?? 0, under_budget: row.under_budget ?? 0 }
    const updated = { ...base, [field]: num }

    // Forward recalc: year X+1 ผูกพัน = total คงเหลือรวม of year X + cut_transfer_X + under_budget_X
    const groupName = prefix === "sj" ? (row as SubJob).name : (row as BudgetSource).source
    const sortOrder = prefix === "sj" ? (row as SubJob).sort_order : null
    const { extraPending, extraDeletes, extraPendingNew } = makeForwardRecalc({
      ...updated,
      prefix: prefix as "sj" | "bs",
      groupName,
      sort_order: sortOrder,
      fund_type: row.fund_type,
      data_year: row.data_year,
    })

    const isOriginal = updated.budget === row.budget && updated.target === row.target &&
      updated.cut_transfer === (row.cut_transfer ?? 0) && updated.under_budget === (row.under_budget ?? 0)

    setPending((prev) => {
      const n = new Map(prev)
      if (isOriginal) n.delete(key); else n.set(key, updated)
      extraPending.forEach((v, k) => n.set(k, v))
      extraDeletes.forEach(k => n.delete(k))
      return n
    })
    if (extraPendingNew.size > 0) {
      setPendingNew((prev) => {
        const n = new Map(prev)
        extraPendingNew.forEach((v, k) => n.set(k, v))
        return n
      })
    }
    setUndoKeys((prev) => {
      const n = new Set(prev)
      n.delete(`${key}|${field}`)
      return n
    })
    setEditState(null)
  }

  function effectiveValue(row: SubJob | BudgetSource, prefix: "sj" | "bs", field: EditField): number {
    const p = pending.get(`${prefix}-${row.id}`)
    if (p && field in p) return p[field as keyof PendingRow]
    return (row as Record<string, unknown>)[field] as number ?? 0
  }

  // ── Save / Discard ─────────────────────────────────────────────────────────

  async function saveAll() {
    setSaving(true)
    try {
      if (isScenario && scenarioId != null) {
        await Promise.all([...pending.entries()].map(([key, p]) => {
          const [prefix, idStr] = key.split("-")
          const id = parseInt(idStr)
          return prefix === "sj"
            ? api.updateScenarioSubJob(scenarioId, id, p.budget, p.target, p.cut_transfer, p.under_budget)
            : api.updateScenarioBudgetSource(scenarioId, id, p.budget, p.target, p.cut_transfer, p.under_budget)
        }))
      } else {
        const batchId = crypto.randomUUID()
        const sjUpdates: Array<{ id: number; budget: number; target: number; cut_transfer: number; under_budget: number }> = []
        const bsUpdates: Array<{ id: number; budget: number; target: number; cut_transfer: number; under_budget: number }> = []
        for (const [key, p] of pending) {
          const [prefix, idStr] = key.split("-")
          const id = parseInt(idStr)
          if (prefix === "sj") sjUpdates.push({ id, budget: p.budget, target: p.target, cut_transfer: p.cut_transfer, under_budget: p.under_budget })
          else bsUpdates.push({ id, budget: p.budget, target: p.target, cut_transfer: p.cut_transfer, under_budget: p.under_budget })
        }
        const newSjs = [...pendingNew.values()].filter(nr => nr.prefix === "sj").map(nr => ({
          project_id: nr.project_id, name: nr.name_or_source, sort_order: nr.sort_order,
          fund_type: nr.fund_type, data_year: nr.data_year, budget: nr.budget, target: nr.target,
          cut_transfer: nr.cut_transfer, under_budget: nr.under_budget,
        }))
        const newBss = [...pendingNew.values()].filter(nr => nr.prefix === "bs").map(nr => ({
          project_id: nr.project_id, source: nr.name_or_source,
          fund_type: nr.fund_type, data_year: nr.data_year, budget: nr.budget, target: nr.target,
          cut_transfer: nr.cut_transfer, under_budget: nr.under_budget,
        }))
        await api.batchSave({
          batch_id: batchId,
          batch_comment: saveComment.trim(),
          sub_job_updates: sjUpdates,
          budget_source_updates: bsUpdates,
          new_sub_jobs: newSjs,
          new_budget_sources: newBss,
        })
      }
      setPending(new Map())
      setPendingNew(new Map())
      setUndoKeys(new Set())
      setSaveComment("")
      setLoading(true)
      await load()
      await loadHistory()
    } catch (e: unknown) { setError(String(e)) }
    finally { setSaving(false) }
  }

  function stageUndo(entry: ChangeLogEntry) {
    if (!project || !["budget", "target", "cut_transfer", "under_budget"].includes(entry.field)) return
    const prefix = entry.table_name === "sub_jobs" ? "sj" : "bs"
    const row = prefix === "sj"
      ? project.sub_jobs.find((r) => r.id === entry.row_id)
      : project.budget_sources.find((r) => r.id === entry.row_id)
    if (!row) return

    const field = entry.field as EditField
    const key = `${prefix}-${row.id}`
    const base = pending.get(key) ?? {
      budget: row.budget,
      target: row.target,
      cut_transfer: row.cut_transfer ?? 0,
      under_budget: row.under_budget ?? 0,
    }
    const updated = { ...base, [field]: entry.old_value }
    const groupName = prefix === "sj" ? (row as SubJob).name : (row as BudgetSource).source
    const sortOrder = prefix === "sj" ? (row as SubJob).sort_order : null
    const { extraPending, extraDeletes, extraPendingNew } = makeForwardRecalc({
      ...updated,
      prefix,
      groupName,
      sort_order: sortOrder,
      fund_type: row.fund_type,
      data_year: row.data_year,
    })
    const isOriginal = updated.budget === row.budget && updated.target === row.target &&
      updated.cut_transfer === (row.cut_transfer ?? 0) && updated.under_budget === (row.under_budget ?? 0)

    setPending((prev) => {
      const n = new Map(prev)
      if (isOriginal) n.delete(key); else n.set(key, updated)
      extraPending.forEach((v, k) => n.set(k, v))
      extraDeletes.forEach(k => n.delete(k))
      return n
    })
    if (extraPendingNew.size > 0) {
      setPendingNew((prev) => {
        const n = new Map(prev)
        extraPendingNew.forEach((v, k) => n.set(k, v))
        return n
      })
    }
    setUndoKeys((prev) => {
      const n = new Set(prev)
      n.add(`${key}|${field}`)
      extraPending.forEach((_, k) => n.add(`${k}|budget`))
      extraPendingNew.forEach((_, k) => n.add(`${k}|budget`))
      return n
    })
  }

  async function saveBatchComment(batchId: string) {
    setSavingBatchComment(true)
    try {
      await api.updateBatchComment(batchId, batchCommentInput.trim())
      setEditingBatch(null)
      await loadHistory()
    } catch {} finally { setSavingBatchComment(false) }
  }

  function toggleBatch(batchId: string) {
    setExpandedBatches(prev => {
      const n = new Set(prev)
      if (n.has(batchId)) n.delete(batchId); else n.add(batchId)
      return n
    })
  }

  const pendingCount = pending.size + pendingNew.size

  // ── Table helpers — computed first so validation + totals use the same rows ─

  const subJobGroups = project ? groupSubJobs(project.sub_jobs ?? []) : []
  const sourceGroups = project ? groupSources(project.budget_sources ?? []) : []

  // ── Sum validation — per (year × fund_type × field), grouped rows only ─────

  type SumMismatch = { fund_type: string; data_year: number; field: "budget" | "target"; sj: number; bs: number }

  const sumMismatches: SumMismatch[] = (() => {
    const sj = new Map<string, number>()
    const bs = new Map<string, number>()
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

    for (const g of subJobGroups) {
      for (const y of g.years) {
        if (y.committed) {
          add(sj, `ผูกพัน|${y.year}|budget`, effectiveValue(y.committed, "sj", "budget"))
          add(sj, `ผูกพัน|${y.year}|target`, effectiveValue(y.committed, "sj", "target"))
        } else {
          const np = pendingNew.get(`sj-new|${g.name}|${y.year}|ผูกพัน`)
          if (np) { add(sj, `ผูกพัน|${y.year}|budget`, np.budget); add(sj, `ผูกพัน|${y.year}|target`, np.target) }
        }
        if (y.invest) {
          add(sj, `ลงทุน|${y.year}|budget`, effectiveValue(y.invest, "sj", "budget"))
          add(sj, `ลงทุน|${y.year}|target`, effectiveValue(y.invest, "sj", "target"))
        } else {
          const np = pendingNew.get(`sj-new|${g.name}|${y.year}|ลงทุน`)
          if (np) { add(sj, `ลงทุน|${y.year}|budget`, np.budget); add(sj, `ลงทุน|${y.year}|target`, np.target) }
        }
      }
    }
    for (const g of sourceGroups) {
      for (const y of g.years) {
        if (y.committed) {
          add(bs, `ผูกพัน|${y.year}|budget`, effectiveValue(y.committed, "bs", "budget"))
          add(bs, `ผูกพัน|${y.year}|target`, effectiveValue(y.committed, "bs", "target"))
        } else {
          const np = pendingNew.get(`bs-new|${g.source}|${y.year}|ผูกพัน`)
          if (np) { add(bs, `ผูกพัน|${y.year}|budget`, np.budget); add(bs, `ผูกพัน|${y.year}|target`, np.target) }
        }
        if (y.invest) {
          add(bs, `ลงทุน|${y.year}|budget`, effectiveValue(y.invest, "bs", "budget"))
          add(bs, `ลงทุน|${y.year}|target`, effectiveValue(y.invest, "bs", "target"))
        } else {
          const np = pendingNew.get(`bs-new|${g.source}|${y.year}|ลงทุน`)
          if (np) { add(bs, `ลงทุน|${y.year}|budget`, np.budget); add(bs, `ลงทุน|${y.year}|target`, np.target) }
        }
      }
    }

    const all = new Set([...sj.keys(), ...bs.keys()])
    const out: SumMismatch[] = []
    for (const key of [...all].sort()) {
      const sv = sj.get(key) ?? 0
      const bv = bs.get(key) ?? 0
      if (Math.abs(sv - bv) > 0.001) {
        const [fund_type, yr, field] = key.split("|")
        out.push({ fund_type, data_year: parseInt(yr), field: field as "budget" | "target", sj: sv, bs: bv })
      }
    }
    return out
  })()

  const hasMismatch = sumMismatches.length > 0
  const visibleHistory = history.filter(isHistoryVisible).slice(0, 20)

  // All years across both tables, sorted
  const allYears = project ? [...new Set([
    ...project.sub_jobs.map(sj => sj.data_year),
    ...project.budget_sources.map(bs => bs.data_year),
  ])].sort() : []

  // Per-year total helpers
  type YearTotal = { sc_b: number; si_b: number; sc_t: number; si_t: number; total_ct: number; total_ub: number }

  function sjYearTotal(year: number): YearTotal {
    let sc_b = 0, sc_t = 0, si_b = 0, si_t = 0, total_ct = 0, total_ub = 0
    for (const g of subJobGroups) {
      const yd = g.years.find(y => y.year === year)
      const comm = yd?.committed ?? null; const inv = yd?.invest ?? null
      if (comm) { sc_b += effectiveValue(comm, "sj", "budget"); sc_t += effectiveValue(comm, "sj", "target") }
      else { const np = pendingNew.get(`sj-new|${g.name}|${year}|ผูกพัน`); if (np) { sc_b += np.budget; sc_t += np.target } }
      if (inv) { si_b += effectiveValue(inv, "sj", "budget"); si_t += effectiveValue(inv, "sj", "target") }
      else { const np = pendingNew.get(`sj-new|${g.name}|${year}|ลงทุน`); if (np) { si_b += np.budget; si_t += np.target } }
      // cut_transfer/under_budget: use committed row if exists, else invest
      const adjRow = comm ?? inv
      const adjPendingNew = pendingNew.get(`sj-new|${g.name}|${year}|ผูกพัน`) ?? pendingNew.get(`sj-new|${g.name}|${year}|ลงทุน`)
      if (adjRow) {
        total_ct += effectiveValue(adjRow, "sj", "cut_transfer")
        total_ub += effectiveValue(adjRow, "sj", "under_budget")
      } else if (adjPendingNew) {
        total_ct += adjPendingNew.cut_transfer
        total_ub += adjPendingNew.under_budget
      }
    }
    return { sc_b, si_b, sc_t, si_t, total_ct, total_ub }
  }

  function bsYearTotal(year: number): YearTotal {
    let sc_b = 0, sc_t = 0, si_b = 0, si_t = 0, total_ct = 0, total_ub = 0
    for (const g of sourceGroups) {
      const yd = g.years.find(y => y.year === year)
      const comm = yd?.committed ?? null; const inv = yd?.invest ?? null
      if (comm) { sc_b += effectiveValue(comm, "bs", "budget"); sc_t += effectiveValue(comm, "bs", "target") }
      else { const np = pendingNew.get(`bs-new|${g.source}|${year}|ผูกพัน`); if (np) { sc_b += np.budget; sc_t += np.target } }
      if (inv) { si_b += effectiveValue(inv, "bs", "budget"); si_t += effectiveValue(inv, "bs", "target") }
      else { const np = pendingNew.get(`bs-new|${g.source}|${year}|ลงทุน`); if (np) { si_b += np.budget; si_t += np.target } }
      const adjRow = comm ?? inv
      const adjPendingNew = pendingNew.get(`bs-new|${g.source}|${year}|ผูกพัน`) ?? pendingNew.get(`bs-new|${g.source}|${year}|ลงทุน`)
      if (adjRow) {
        total_ct += effectiveValue(adjRow, "bs", "cut_transfer")
        total_ub += effectiveValue(adjRow, "bs", "under_budget")
      } else if (adjPendingNew) {
        total_ct += adjPendingNew.cut_transfer
        total_ub += adjPendingNew.under_budget
      }
    }
    return { sc_b, si_b, sc_t, si_t, total_ct, total_ub }
  }

  // Editable cell — shared by both tables
  function makeEditCell(
    row: SubJob | BudgetSource | null,
    field: EditField,
    fundType: string,
    year: number,
    groupName: string,
    sortOrder: number | null | undefined,
    prefix: "sj" | "bs",
  ) {
    if (!row) {
      const vKey = `${prefix}-new|${groupName}|${year}|${fundType}`
      const np = pendingNew.get(vKey)
      const effVal = np?.[field] ?? 0
      const isEd = editState?.key === vKey && editState?.field === field
      const isPend = !!np
      return (
        <td key={`${vKey}-${field}`} style={{ ...td(), padding: 0 }}>
          <EditableCell
            value={effVal} isPending={isPend} isEditing={isEd}
            isUndo={undoKeys.has(`${vKey}|${field}`)}
            editValue={isEd ? editState!.value : ""}
            onStartEdit={() => {
              setPendingNew((prev) => {
                if (prev.has(vKey)) return prev
                const n = new Map(prev)
                n.set(vKey, { budget: 0, target: 0, cut_transfer: 0, under_budget: 0, project_id: project!.id, name_or_source: groupName, sort_order: sortOrder ?? null, fund_type: fundType, data_year: year, prefix })
                return n
              })
              setEditState({ key: vKey, field, value: String(np?.[field as keyof NewPendingRow] as number ?? 0) })
            }}
            onChange={(v) => setEditState((s) => s ? { ...s, value: v } : s)}
            onCommit={commitEdit} onCancel={() => setEditState(null)}
          />
        </td>
      )
    }
    const key = `${prefix}-${row.id}`
    const isEd = editState?.key === key && editState?.field === field
    const isPend = pending.has(key)
    const effVal = effectiveValue(row, prefix, field)
    return (
      <td key={`${key}-${field}`} style={{ ...td(), padding: 0 }}>
        <EditableCell
          value={effVal} isPending={isPend} isEditing={isEd}
          isUndo={undoKeys.has(`${key}|${field}`)}
          editValue={isEd ? editState!.value : ""}
          onStartEdit={() => startEdit(key, field)}
          onChange={(v) => setEditState((s) => s ? { ...s, value: v } : s)}
          onCommit={commitEdit} onCancel={() => setEditState(null)}
        />
      </td>
    )
  }

  // Table header — 9 cols (3 groups × 3) + 2 single cols = 11 per year
  const COL_GROUPS = [
    { label: "งบเงินดำเนินการ",    field: "budget" as const,       cols: 3 as const, bg: "rgba(96,165,250,0.15)", subBg: "rgba(96,165,250,0.08)" },
    { label: "เป้าหมายการเบิกจ่าย", field: "target" as const,      cols: 3 as const, bg: "rgba(52,211,153,0.15)", subBg: "rgba(52,211,153,0.08)" },
    { label: "คงเหลือ",             field: null,                    cols: 3 as const, bg: "rgba(251,191,36,0.15)", subBg: "rgba(251,191,36,0.08)" },
    { label: "ตัดทิ้ง/โยกย้าย",   field: "cut_transfer" as const, cols: 1 as const, bg: "rgba(239,68,68,0.12)",  subBg: "rgba(239,68,68,0.06)" },
    { label: "ต่ำกว่างบ",          field: "under_budget" as const, cols: 1 as const, bg: "rgba(168,85,247,0.12)", subBg: "rgba(168,85,247,0.06)" },
  ]
  const COLS_PER_YEAR = COL_GROUPS.reduce((s, g) => s + g.cols, 0)

  function makeTableHeader() {
    return (
      <thead>
        {/* Row 1 — year spans */}
        <tr>
          <th style={{ ...th, minWidth: 200, position: "sticky", left: 0, zIndex: 3, background: "#F9FAFB" }} rowSpan={3}>ชื่อ</th>
          {allYears.map(year => (
            <th key={year} colSpan={COLS_PER_YEAR} style={{ ...th, background: "#F3F4F6", borderBottom: "none" }}>ปี {year}</th>
          ))}
        </tr>
        {/* Row 2 — group labels per year */}
        <tr>
          {allYears.map(year => (
            <Fragment key={year}>
              {COL_GROUPS.map(g => (
                <th key={g.label} colSpan={g.cols} style={{ ...th, background: g.bg, borderBottom: "none" }}>{g.label}</th>
              ))}
            </Fragment>
          ))}
        </tr>
        {/* Row 3 — ผูกพัน/ลงทุน/รวม for 3-col groups, รวม only for 1-col groups */}
        <tr>
          {allYears.map(year => (
            <Fragment key={year}>
              {COL_GROUPS.map(g => (
                <Fragment key={g.label}>
                  {g.cols === 3 ? (
                    ["ผูกพัน", "ลงทุน", "รวม"].map(lbl => {
                      const colId = g.field && lbl !== "รวม" ? `col-${year}-${g.field}-${lbl}` : undefined
                      const lit = colId === blinkCol
                      return (
                        <th key={lbl} {...(colId ? { "data-col": colId } : {})}
                          style={{ ...th, minWidth: 110, background: lit ? "#FDE047" : g.subBg, transition: "background 0.7s ease-out" }}
                        >{lbl}</th>
                      )
                    })
                  ) : (
                    <th key="รวม" style={{ ...th, minWidth: 110, background: g.subBg }}>รวม</th>
                  )}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tr>
      </thead>
    )
  }

  // One body row per name/source group
  function renderGroupRow(
    groupName: string,
    sortOrder: number | null | undefined,
    years: SubJobGroup["years"] | SourceGroup["years"],
    prefix: "sj" | "bs",
  ) {
    const neg = (v: number): React.CSSProperties => v < 0 ? { color: "#DC2626" } : {}
    const comp = (v: number, key: string) => (
      <td key={key} style={{ ...td(), textAlign: "right", fontFamily: "monospace", background: "#F9FAFB", ...neg(v) }}>{fmt3(v)}</td>
    )
    return (
      <tr key={groupName} style={{ background: "#fff" }}>
        <td style={{ ...td(), fontWeight: 500, position: "sticky", left: 0, background: "#fff", zIndex: 1 }}>{groupName}</td>
        {allYears.map(year => {
          const yd = years.find(y => y.year === year)
          const committed = yd?.committed ?? null
          const invest = yd?.invest ?? null
          const pnc = pendingNew.get(`${prefix}-new|${groupName}|${year}|ผูกพัน`)
          const pni = pendingNew.get(`${prefix}-new|${groupName}|${year}|ลงทุน`)
          const cb = committed ? effectiveValue(committed, prefix, "budget") : (pnc?.budget ?? 0)
          const ct = committed ? effectiveValue(committed, prefix, "target") : (pnc?.target ?? 0)
          const ib = invest ? effectiveValue(invest, prefix, "budget") : (pni?.budget ?? 0)
          const it_ = invest ? effectiveValue(invest, prefix, "target") : (pni?.target ?? 0)
          const tb = cb + ib; const tt = ct + it_
          // cut_transfer/under_budget stored on committed row; fall back to invest if no committed row, then pendingNew
          const adjRow = committed ?? invest
          const adjPn = pnc ?? pni
          const adjFundType = adjRow?.fund_type ?? (pnc ? "ผูกพัน" : "ลงทุน")
          const hasAdj = adjRow != null || adjPn != null
          const na = (k: string) => <td key={k} style={{ ...td(), textAlign: "right", color: "#D1D5DB" }}>—</td>
          return (
            <Fragment key={year}>
              {makeEditCell(committed, "budget", "ผูกพัน", year, groupName, sortOrder, prefix)}
              {makeEditCell(invest, "budget", "ลงทุน", year, groupName, sortOrder, prefix)}
              {comp(tb, `${year}-tb`)}
              {makeEditCell(committed, "target", "ผูกพัน", year, groupName, sortOrder, prefix)}
              {makeEditCell(invest, "target", "ลงทุน", year, groupName, sortOrder, prefix)}
              {comp(tt, `${year}-tt`)}
              {comp(cb - ct, `${year}-cr`)}
              {comp(ib - it_, `${year}-ir`)}
              {comp(tb - tt, `${year}-tr`)}
              {hasAdj ? makeEditCell(adjRow, "cut_transfer", adjFundType, year, groupName, sortOrder, prefix) : na(`${year}-ct`)}
              {hasAdj ? makeEditCell(adjRow, "under_budget", adjFundType, year, groupName, sortOrder, prefix) : na(`${year}-ub`)}
            </Fragment>
          )
        })}
      </tr>
    )
  }

  // Totals row — per year
  function renderTotalsRow(totalFn: (year: number) => YearTotal, isSj: boolean) {
    const T = (v: number, key: string): React.ReactNode => (
      <td key={key} style={{ ...td(), textAlign: "right", fontFamily: "monospace", fontWeight: 700, background: "#F0FDF4", color: v < 0 ? "#DC2626" : "#166534" }}>{fmt3(v)}</td>
    )
    const na = (k: string) => <td key={k} style={{ ...td(), textAlign: "right", color: "#D1D5DB", background: "#F0FDF4" }}>—</td>
    return (
      <tr style={{ background: "#F0FDF4", borderTop: "1.5px solid #86EFAC" }}>
        <td style={{ ...td(), fontWeight: 700, color: "#166534", position: "sticky", left: 0, background: "#F0FDF4", zIndex: 1 }}>รวมทั้งหมด</td>
        {allYears.map(year => {
          const { sc_b, si_b, sc_t, si_t, total_ct, total_ub } = totalFn(year)
          const tb = sc_b + si_b; const tt = sc_t + si_t
          return (
            <Fragment key={year}>
              {T(sc_b, `${year}-sc_b`)}{T(si_b, `${year}-si_b`)}{T(tb, `${year}-tb`)}
              {T(sc_t, `${year}-sc_t`)}{T(si_t, `${year}-si_t`)}{T(tt, `${year}-tt`)}
              {T(sc_b - sc_t, `${year}-cr`)}{T(si_b - si_t, `${year}-ir`)}{T(tb - tt, `${year}-tr`)}
              {isSj || total_ct !== 0 ? T(total_ct, `${year}-tct`) : na(`${year}-tct`)}
              {isSj || total_ub !== 0 ? T(total_ub, `${year}-tub`) : na(`${year}-tub`)}
            </Fragment>
          )
        })}
      </tr>
    )
  }

  // ── Mode badge ─────────────────────────────────────────────────────────────

  const modeBadge = isScenario ? (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#F5F3FF", border: "1px solid #A78BFA", borderRadius: 6, padding: "1px 8px", fontSize: 11, color: "#5B21B6", fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8B5CF6" }} />
      WHAT IF: {viewMode.kind === "scenario" ? viewMode.item.label : ""}
    </span>
  ) : (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, padding: "1px 8px", fontSize: 11, color: "#166534", fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E" }} />
      LIVE
    </span>
  )

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingBottom: pendingCount > 0 ? 72 : 0 }}>
      <header className="bg-white border-b px-6 py-4">
        <Link href="/" style={{ color: "#9CA3AF", fontSize: 12, textDecoration: "none" }}>← Back to dashboard</Link>
        {project && (
          <div className="mt-1 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-800">{project.name}</h1>
                {modeBadge}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                <span className="font-mono">{project.project_code}</span>
                {project.item_no && <span>ข้อ {project.item_no}</span>}
                <span>ปี {project.year}</span>
                <span>ประเภท {project.project_type}</span>
                {project.division && <span>{project.division}</span>}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Sum mismatch warning */}
      {project && hasMismatch && (
        <div style={{ background: "#FFF7ED", borderBottom: "1.5px solid #FB923C", padding: "8px 24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", marginBottom: 4 }}>
            ⚠ ยอดรวมไม่ตรงกัน — งานย่อย ≠ แหล่งเงิน ในบางกลุ่ม
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
            {sumMismatches.map((m) => {
              const colName = (m.field === "budget" ? "งบเงินดำเนินการ" : "เป้าหมายการเบิกจ่าย") + "/" + m.fund_type
              return (
                <span
                  key={`${m.data_year}|${m.fund_type}|${m.field}`}
                  onClick={() => scrollToCol(m.data_year, m.field, m.fund_type)}
                  style={{ fontSize: 11, color: "#92400E", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                >
                  {colName} · ปี {m.data_year}
                  {" — "}งานย่อย <strong>{fmt3(m.sj)}</strong> ≠ แหล่งเงิน <strong>{fmt3(m.bs)}</strong>
                  {" "}({m.sj > m.bs ? "+" : ""}{fmt3(m.sj - m.bs)})
                  {" "}↗
                </span>
              )
            })}
          </div>
        </div>
      )}

      <main className="px-6 py-6 max-w-[1800px] mx-auto space-y-8">
        {loading && <div className="text-center py-20 text-gray-400">Loading…</div>}
        {error && <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>}

        {!loading && project && (
          <>
            {/* Sub Jobs */}
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">งานย่อย (Sub Jobs)</h2>
              <div className="bg-white border rounded-xl overflow-hidden">
                <div style={{ overflowX: "auto" }} data-scroll-container="">
                  <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
                    {makeTableHeader()}
                    <tbody>
                      {subJobGroups.length === 0 && <tr><td colSpan={1 + allYears.length * COLS_PER_YEAR} style={{ ...td(), textAlign: "center", color: "#9CA3AF", padding: "24px" }}>ไม่มีข้อมูล</td></tr>}
                      {subJobGroups.map((g) => renderGroupRow(g.name, g.sort_order, g.years, "sj"))}
                      {subJobGroups.length > 0 && renderTotalsRow(sjYearTotal, true)}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Budget Sources */}
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">แหล่งเงิน (Budget Sources)</h2>
              <div className="bg-white border rounded-xl overflow-hidden">
                <div style={{ overflowX: "auto" }} data-scroll-container="">
                  <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
                    {makeTableHeader()}
                    <tbody>
                      {sourceGroups.length === 0 && <tr><td colSpan={1 + allYears.length * COLS_PER_YEAR} style={{ ...td(), textAlign: "center", color: "#9CA3AF", padding: "24px" }}>ไม่มีข้อมูล</td></tr>}
                      {sourceGroups.map((g) => renderGroupRow(g.source, null, g.years, "bs"))}
                      {sourceGroups.length > 0 && renderTotalsRow(bsYearTotal, false)}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">รวม = ผูกพัน + ลงทุน · ยอดรวมแหล่งเงิน = ยอดรวมงานย่อย</p>
            </section>

            {/* History */}
            {!isScenario && (
              <section>
                <button
                  type="button"
                  onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) loadHistory() }}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ transform: historyOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  ประวัติการแก้ไข ({visibleHistory.length})
                </button>

                {historyOpen && (() => {
                  // Group entries by batch_id
                  type HistGroup = { batchId: string; comment: string; changedAt: string; entries: ChangeLogEntry[] }
                  const groups: HistGroup[] = []
                  const seen = new Map<string, HistGroup>()
                  for (const e of visibleHistory) {
                    if (e.batch_id) {
                      if (!seen.has(e.batch_id)) {
                        const g: HistGroup = { batchId: e.batch_id, comment: e.batch_comment, changedAt: e.changed_at, entries: [] }
                        seen.set(e.batch_id, g)
                        groups.push(g)
                      }
                      seen.get(e.batch_id)!.entries.push(e)
                    } else {
                      groups.push({ batchId: "", comment: "", changedAt: e.changed_at, entries: [e] })
                    }
                  }

                  const entryRow = (e: ChangeLogEntry, indent = false) => (
                    <tr key={e.id} style={{ borderBottom: "0.5px solid #F3F4F6", background: indent ? "#FAFAFA" : "#fff" }}>
                      <td style={{ ...td(), whiteSpace: "nowrap", color: "#9CA3AF", paddingLeft: indent ? 24 : undefined }}>{fmtDate(e.changed_at)}</td>
                      <td style={{ ...td(), fontSize: 11 }}>{e.table_name === "sub_jobs" ? "งานย่อย" : "แหล่งเงิน"}</td>
                      <td style={{ ...td(), maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.row_name}</td>
                      <td style={{ ...td(), textAlign: "center" }}>{e.data_year}</td>
                      <td style={{ ...td() }}>{e.fund_type}</td>
                      <td style={{ ...td() }}>{historyFieldLabel(e.field)}</td>
                      <td style={{ ...td(), textAlign: "right", fontFamily: "monospace", color: "#9CA3AF" }}>{fmt3(e.old_value)}</td>
                      <td style={{ ...td(), textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmt3(e.new_value)}</td>
                      <td style={{ ...td() }}>
                        <button
                          type="button"
                          onClick={() => stageUndo(e)}
                          style={{ fontSize: 11, padding: "2px 8px", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          ↩ undo
                        </button>
                      </td>
                    </tr>
                  )

                  return (
                    <div className="bg-white border rounded-xl overflow-hidden">
                      {groups.length === 0 ? (
                        <div style={{ padding: "24px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>ยังไม่มีประวัติ</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              {["เวลา", "ตาราง", "ชื่อ", "ปี", "ประเภท", "ฟิลด์", "ก่อน", "หลัง", ""].map((h, i) => (
                                <th key={i} style={{ ...th, textAlign: i >= 6 ? "right" : "left" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {groups.map((g, gi) => {
                              if (!g.batchId) return entryRow(g.entries[0])
                              const expanded = expandedBatches.has(g.batchId)
                              const isEditingComment = editingBatch === g.batchId
                              return (
                                <Fragment key={g.batchId + gi}>
                                  {/* Batch header row */}
                                  <tr style={{ background: "#F8FAFF", borderBottom: "0.5px solid #E0E7FF", borderTop: gi > 0 ? "1px solid #E5E7EB" : undefined }}>
                                    <td style={{ ...td(), whiteSpace: "nowrap", color: "#6B7280" }}>{fmtDate(g.changedAt)}</td>
                                    <td colSpan={7} style={{ ...td() }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <button
                                          type="button"
                                          onClick={() => toggleBatch(g.batchId)}
                                          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6B7280", fontSize: 12 }}
                                        >
                                          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                          </svg>
                                          <span style={{ fontFamily: "monospace", fontSize: 11, background: "#E0E7FF", color: "#3730A3", borderRadius: 3, padding: "1px 6px" }}>{g.entries.length} changes</span>
                                        </button>
                                        {isEditingComment ? (
                                          <form
                                            onSubmit={(ev) => { ev.preventDefault(); saveBatchComment(g.batchId) }}
                                            style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}
                                          >
                                            <input
                                              autoFocus
                                              value={batchCommentInput}
                                              onChange={(e) => setBatchCommentInput(e.target.value)}
                                              onKeyDown={(e) => { if (e.key === "Escape") setEditingBatch(null) }}
                                              placeholder="เพิ่มข้อความ…"
                                              style={{ flex: 1, fontSize: 12, border: "1px solid #3B82F6", borderRadius: 4, padding: "2px 8px", outline: "none" }}
                                            />
                                            <button type="submit" disabled={savingBatchComment} style={{ fontSize: 11, padding: "2px 10px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>
                                              {savingBatchComment ? "…" : "บันทึก"}
                                            </button>
                                            <button type="button" onClick={() => setEditingBatch(null)} style={{ fontSize: 11, padding: "2px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer" }}>ยกเลิก</button>
                                          </form>
                                        ) : (
                                          <span
                                            onClick={() => { setEditingBatch(g.batchId); setBatchCommentInput(g.comment) }}
                                            title="คลิกเพื่อแก้ไขข้อความ"
                                            style={{ fontSize: 12, color: g.comment ? "#1E293B" : "#9CA3AF", fontStyle: g.comment ? "normal" : "italic", cursor: "text", flex: 1 }}
                                          >
                                            {g.comment || "เพิ่มข้อความ…"}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ ...td() }} />
                                  </tr>
                                  {/* Individual entries (expanded) */}
                                  {expanded && g.entries.map(e => entryRow(e, true))}
                                </Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })()}
              </section>
            )}
          </>
        )}
      </main>

      {/* Sticky save bar */}
      {pendingCount > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, background: "#1E293B", borderTop: "1px solid #334155", padding: "12px 24px", display: "flex", alignItems: "center", gap: 12 }}>
          {hasMismatch && (
            <span style={{ fontSize: 11, color: "#FB923C", marginRight: 4 }}>⚠ ยอดไม่ตรง {sumMismatches.length} กลุ่ม</span>
          )}
          <span style={{ fontSize: 12, color: "#94A3B8" }}>
            {pendingCount} รายการรอบันทึก — <span style={{ color: "#FEF9C3" }}>เซลล์สีเหลือง = ยังไม่บันทึก</span>
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => { setPending(new Map()); setPendingNew(new Map()); setUndoKeys(new Set()); setEditState(null) }}
            style={{ padding: "6px 16px", background: "transparent", color: "#94A3B8", border: "1px solid #475569", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
          >
            Discard
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={saveAll}
            style={{ padding: "6px 20px", background: saving ? "#475569" : "#3B82F6", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: saving ? "default" : "pointer" }}
          >
            {saving ? "Saving…" : `Save ${pendingCount} changes`}
          </button>
        </div>
      )}
    </div>
  )
}
