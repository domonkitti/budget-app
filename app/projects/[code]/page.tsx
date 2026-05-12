"use client"

import { Fragment, useEffect, useState, useCallback, useRef } from "react"
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
  years: { year: number; committed: SubJob | null; invest: SubJob | null; summary: SubJob | null }[]
}
type SourceGroup = {
  source: string
  years: { year: number; committed: BudgetSource | null; invest: BudgetSource | null; summary: BudgetSource | null }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupSubJobs(jobs: SubJob[]): SubJobGroup[] {
  const map = new Map<string, SubJobGroup>()
  for (const sj of jobs) {
    if (!map.has(sj.name)) map.set(sj.name, { name: sj.name, sort_order: sj.sort_order, years: [] })
    const g = map.get(sj.name)!
    let yr = g.years.find((y) => y.year === sj.data_year)
    if (!yr) { yr = { year: sj.data_year, committed: null, invest: null, summary: null }; g.years.push(yr) }
    if (sj.fund_type === "ผูกพัน") yr.committed = sj
    else if (sj.fund_type === "ลงทุน") yr.invest = sj
    else yr.summary = sj
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
    if (!yr) { yr = { year: bs.data_year, committed: null, invest: null, summary: null }; g.years.push(yr) }
    if (bs.fund_type === "ผูกพัน") yr.committed = bs
    else if (bs.fund_type === "ลงทุน") yr.invest = bs
    else yr.summary = bs
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

  // Sub-job management
  const [newSjNames, setNewSjNames] = useState<string[]>([])
  const [deletedSjNames, setDeletedSjNames] = useState<Set<string>>(new Set())
  const [sjMgmtOpen, setSjMgmtOpen] = useState(false)
  const [sjNameInput, setSjNameInput] = useState("")

  // Info editing
  const [editingInfo, setEditingInfo] = useState(false)
  const [infoForm, setInfoForm] = useState({ name: "", item_no: "", year: "", project_type: "", division: "", department: "", group_name: "" })
  const [savingInfo, setSavingInfo] = useState(false)

  function startEditInfo() {
    if (!project) return
    setInfoForm({
      name: project.name,
      item_no: project.item_no ?? "",
      year: String(project.year),
      project_type: project.project_type,
      division: project.division ?? "",
      department: project.department ?? "",
      group_name: project.group_name ?? "",
    })
    setEditingInfo(true)
  }

  async function saveInfo() {
    if (!project) return
    setSavingInfo(true)
    try {
      await api.updateProjectInfo(project.project_code, {
        name: infoForm.name.trim(),
        item_no: infoForm.item_no.trim() || null,
        year: parseInt(infoForm.year),
        project_type: infoForm.project_type,
        division: infoForm.division.trim() || null,
        department: infoForm.department.trim() || null,
        group_name: infoForm.group_name.trim() || null,
      })
      setEditingInfo(false)
      setLoading(true)
      await load()
    } catch (e: unknown) { setError(String(e)) }
    finally { setSavingInfo(false) }
  }

  // Shared scroll sync between the two tables
  const sjScrollRef = useRef<HTMLDivElement>(null)
  const bsScrollRef = useRef<HTMLDivElement>(null)
  const scrollSyncing = useRef(false)
  function onSjScroll(e: React.UIEvent<HTMLDivElement>) {
    if (scrollSyncing.current) return
    scrollSyncing.current = true
    if (bsScrollRef.current) bsScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
    scrollSyncing.current = false
  }
  function onBsScroll(e: React.UIEvent<HTMLDivElement>) {
    if (scrollSyncing.current) return
    scrollSyncing.current = true
    if (sjScrollRef.current) sjScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
    scrollSyncing.current = false
  }

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

  useEffect(() => { setProject(null); setLoading(true); setPending(new Map()); setPendingNew(new Map()); setUndoKeys(new Set()); setNewSjNames([]); setDeletedSjNames(new Set()); setSjMgmtOpen(false); load() }, [load])
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
    const sortOrder = source.sort_order ?? null

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

    // Find the รวม (summary) row for a given year — holds combined ct/ub
    const findSummaryRow = (year: number) => {
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i]
        if (sameGroup(row) && row.fund_type !== "ผูกพัน" && row.fund_type !== "ลงทุน" && row.data_year === year) return row
      }
      return null
    }

    // Get effective budget/target for a specific fund_type at a given year.
    // editedFundType/editedBudget/editedTarget override the row being edited (step 0).
    // For cascade steps they represent the new ผูกพัน value we just computed.
    const getFundValues = (fundType: string, year: number, editedFundType: string, editedBudget: number, editedTarget: number) => {
      if (editedFundType === fundType) return { budget: editedBudget, target: editedTarget }
      const row = findGroupedRow(fundType, year)
      if (row) {
        const key = `${prefix}-${row.id}`
        const p = extraPending.get(key) ?? pending.get(key)
        return { budget: p?.budget ?? row.budget, target: p?.target ?? row.target }
      }
      const pn = pendingNew.get(`${prefix}-new|${groupName}|${year}|${fundType}`) ?? extraPendingNew.get(`${prefix}-new|${groupName}|${year}|${fundType}`)
      return { budget: pn?.budget ?? 0, target: pn?.target ?? 0 }
    }

    // Sum ct/ub from all row types (committed + invest + summary) for a given year.
    // When source.id matches the edited row, use source's fresh values instead of DB/pending.
    const getCtUb = (year: number) => {
      let ct = 0, ub = 0
      const candidates = [
        findGroupedRow("ผูกพัน", year),
        findGroupedRow("ลงทุน", year),
        findSummaryRow(year),
      ]
      for (const row of candidates) {
        if (!row) continue
        if (row.fund_type === source.fund_type && row.data_year === source.data_year) {
          ct += source.cut_transfer ?? 0
          ub += source.under_budget ?? 0
        } else {
          const key = `${prefix}-${row.id}`
          const p = extraPending.get(key) ?? pending.get(key)
          ct += p?.cut_transfer ?? row.cut_transfer ?? 0
          ub += p?.under_budget ?? row.under_budget ?? 0
        }
      }
      return { ct, ub }
    }

    // Compute carry-forward: always sum ผูกพัน remain + ลงทุน remain + ct + ub.
    const computeCarry = (year: number, editedFundType: string, editedBudget: number, editedTarget: number, ct: number, ub: number): number => {
      const comm = getFundValues("ผูกพัน", year, editedFundType, editedBudget, editedTarget)
      const inv = getFundValues("ลงทุน", year, editedFundType, editedBudget, editedTarget)
      return (comm.budget - comm.target) + (inv.budget - inv.target) + ct + ub
    }

    // Cascade: start from source year, propagate carry-forward through committed rows
    let curYear = source.data_year
    let curFundType = source.fund_type
    let curBudget = source.budget
    let curTarget = source.target

    for (let step = 0; step < 30; step++) {
      const { ct: effectiveCt, ub: effectiveUb } = getCtUb(curYear)
      const carryForward = computeCarry(curYear, curFundType, curBudget, curTarget, effectiveCt, effectiveUb)
      const nextYear = curYear + 1
      const nextComm = findGroupedRow("ผูกพัน", nextYear)

      if (nextComm) {
        const nextKey = `${prefix}-${nextComm.id}`
        const nextBase = extraPending.get(nextKey) ?? pending.get(nextKey) ?? {
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
        if (isOriginal) {
          extraDeletes.push(nextKey)
          break
        }
        extraPending.set(nextKey, nextUpdated)
        // Continue cascade: next year's ผูกพัน budget is carryForward
        curYear = nextYear
        curFundType = "ผูกพัน"
        curBudget = carryForward
        curTarget = nextBase.target
      } else {
        // No committed row for nextYear — create one pendingNew and stop
        const nextKey = `${prefix}-new|${groupName}|${nextYear}|ผูกพัน`
        const existing = pendingNew.get(nextKey) ?? extraPendingNew.get(nextKey)
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
        break
      }
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
          if (prefix === "sj") {
            const row = project!.sub_jobs.find(r => r.id === id)
            if (row && deletedSjNames.has(row.name)) continue
            sjUpdates.push({ id, budget: p.budget, target: p.target, cut_transfer: p.cut_transfer, under_budget: p.under_budget })
          } else {
            bsUpdates.push({ id, budget: p.budget, target: p.target, cut_transfer: p.cut_transfer, under_budget: p.under_budget })
          }
        }
        const newSjs = [...pendingNew.values()]
          .filter(nr => nr.prefix === "sj"
            && nr.name_or_source !== DEFAULT_VIRTUAL_SJ_NAME
            && !deletedSjNames.has(nr.name_or_source))
          .map(nr => ({
            project_id: nr.project_id, name: nr.name_or_source, sort_order: nr.sort_order,
            fund_type: nr.fund_type, data_year: nr.data_year, budget: nr.budget, target: nr.target,
            cut_transfer: nr.cut_transfer, under_budget: nr.under_budget,
          }))
        const newBss = [...pendingNew.values()].filter(nr => nr.prefix === "bs").map(nr => ({
          project_id: nr.project_id, source: nr.name_or_source,
          fund_type: nr.fund_type, data_year: nr.data_year, budget: nr.budget, target: nr.target,
          cut_transfer: nr.cut_transfer, under_budget: nr.under_budget,
        }))
        const deletedNames = [...deletedSjNames].map(name => ({ project_id: project!.id, name }))
        await api.batchSave({
          batch_id: batchId,
          batch_comment: saveComment.trim(),
          sub_job_updates: sjUpdates,
          budget_source_updates: bsUpdates,
          new_sub_jobs: newSjs,
          new_budget_sources: newBss,
          deleted_sub_job_names: deletedNames.length > 0 ? deletedNames : undefined,
        })
      }
      setPending(new Map())
      setPendingNew(new Map())
      setUndoKeys(new Set())
      setSaveComment("")
      setNewSjNames([])
      setDeletedSjNames(new Set())
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

  const pendingCount = pending.size + pendingNew.size + newSjNames.length + deletedSjNames.size

  // ── Table helpers — computed first so validation + totals use the same rows ─

  const subJobGroups = project ? groupSubJobs(project.sub_jobs ?? []) : []
  const sourceGroups = project ? groupSources(project.budget_sources ?? []) : []

  // All years across both tables + any carry-forward years in pendingNew, sorted
  const allYears = project ? [...new Set([
    ...project.sub_jobs.map(sj => sj.data_year),
    ...project.budget_sources.map(bs => bs.data_year),
    ...[...pendingNew.keys()].map(k => parseInt(k.split("|")[2])).filter(y => !isNaN(y)),
  ])].sort() : []

  const DEFAULT_VIRTUAL_SJ_NAME = "งานรวม"
  const activeSjGroups = subJobGroups.filter(g => !deletedSjNames.has(g.name))
  const hasVirtualSjRow = activeSjGroups.length === 0 && newSjNames.length === 0 && allYears.length > 0

  // ── Sum validation — per (year × fund_type × field), grouped rows only ─────

  type SumMismatch = { fund_type: string; data_year: number; field: "budget" | "target"; sj: number; bs: number }

  const sumMismatches: SumMismatch[] = (() => {
    const sj = new Map<string, number>()
    const bs = new Map<string, number>()
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)

    for (const g of activeSjGroups) {
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
    for (const name of newSjNames) {
      for (const year of allYears) {
        const pnc = pendingNew.get(`sj-new|${name}|${year}|ผูกพัน`)
        const pni = pendingNew.get(`sj-new|${name}|${year}|ลงทุน`)
        if (pnc) { add(sj, `ผูกพัน|${year}|budget`, pnc.budget); add(sj, `ผูกพัน|${year}|target`, pnc.target) }
        if (pni) { add(sj, `ลงทุน|${year}|budget`, pni.budget); add(sj, `ลงทุน|${year}|target`, pni.target) }
      }
    }
    // Virtual row: include only explicitly-edited cells in sj map
    if (hasVirtualSjRow) {
      for (const [key, np] of pendingNew) {
        if (!key.startsWith("sj-new|")) continue
        const [, , yrStr, fundType] = key.split("|")
        add(sj, `${fundType}|${parseInt(yrStr)}|budget`, np.budget)
        add(sj, `${fundType}|${parseInt(yrStr)}|target`, np.target)
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
      // Virtual row: unedited cells are treated as matching, so skip bs-only keys
      if (hasVirtualSjRow && !sj.has(key)) continue
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

  // Per-year total helpers
  type YearTotal = { sc_b: number; si_b: number; sc_t: number; si_t: number; total_ct: number; total_ub: number }

  function sjYearTotal(year: number): YearTotal {
    let sc_b = 0, sc_t = 0, si_b = 0, si_t = 0, total_ct = 0, total_ub = 0
    for (const g of activeSjGroups) {
      const yd = g.years.find(y => y.year === year)
      const comm = yd?.committed ?? null; const inv = yd?.invest ?? null; const summ = yd?.summary ?? null
      if (comm) { sc_b += effectiveValue(comm, "sj", "budget"); sc_t += effectiveValue(comm, "sj", "target") }
      else { const np = pendingNew.get(`sj-new|${g.name}|${year}|ผูกพัน`); if (np) { sc_b += np.budget; sc_t += np.target } }
      if (inv) { si_b += effectiveValue(inv, "sj", "budget"); si_t += effectiveValue(inv, "sj", "target") }
      else { const np = pendingNew.get(`sj-new|${g.name}|${year}|ลงทุน`); if (np) { si_b += np.budget; si_t += np.target } }
      // Sum ct/ub from all row types
      if (comm || inv || summ) {
        for (const r of [comm, inv, summ]) {
          if (!r) continue
          total_ct += effectiveValue(r, "sj", "cut_transfer")
          total_ub += effectiveValue(r, "sj", "under_budget")
        }
      } else {
        const pnc = pendingNew.get(`sj-new|${g.name}|${year}|ผูกพัน`)
        const pni = pendingNew.get(`sj-new|${g.name}|${year}|ลงทุน`)
        if (pnc) { total_ct += pnc.cut_transfer; total_ub += pnc.under_budget }
        if (pni) { total_ct += pni.cut_transfer; total_ub += pni.under_budget }
      }
    }
    for (const name of newSjNames) {
      const pnc = pendingNew.get(`sj-new|${name}|${year}|ผูกพัน`)
      const pni = pendingNew.get(`sj-new|${name}|${year}|ลงทุน`)
      sc_b += pnc?.budget ?? 0; sc_t += pnc?.target ?? 0
      si_b += pni?.budget ?? 0; si_t += pni?.target ?? 0
      const adjPn = pnc ?? pni
      if (adjPn) { total_ct += adjPn.cut_transfer; total_ub += adjPn.under_budget }
    }
    if (hasVirtualSjRow) {
      const pnc = pendingNew.get(`sj-new|${DEFAULT_VIRTUAL_SJ_NAME}|${year}|ผูกพัน`)
      const pni = pendingNew.get(`sj-new|${DEFAULT_VIRTUAL_SJ_NAME}|${year}|ลงทุน`)
      const bst = bsYearTotal(year)
      sc_b += pnc?.budget ?? bst.sc_b
      sc_t += pnc?.target ?? bst.sc_t
      si_b += pni?.budget ?? bst.si_b
      si_t += pni?.target ?? bst.si_t
      const adjPn = pnc ?? pni
      total_ct += adjPn ? adjPn.cut_transfer : bst.total_ct
      total_ub += adjPn ? adjPn.under_budget : bst.total_ub
    }
    return { sc_b, si_b, sc_t, si_t, total_ct, total_ub }
  }

  function bsYearTotal(year: number): YearTotal {
    let sc_b = 0, sc_t = 0, si_b = 0, si_t = 0, total_ct = 0, total_ub = 0
    for (const g of sourceGroups) {
      const yd = g.years.find(y => y.year === year)
      const comm = yd?.committed ?? null; const inv = yd?.invest ?? null; const summ = yd?.summary ?? null
      if (comm) { sc_b += effectiveValue(comm, "bs", "budget"); sc_t += effectiveValue(comm, "bs", "target") }
      else { const np = pendingNew.get(`bs-new|${g.source}|${year}|ผูกพัน`); if (np) { sc_b += np.budget; sc_t += np.target } }
      if (inv) { si_b += effectiveValue(inv, "bs", "budget"); si_t += effectiveValue(inv, "bs", "target") }
      else { const np = pendingNew.get(`bs-new|${g.source}|${year}|ลงทุน`); if (np) { si_b += np.budget; si_t += np.target } }
      // Sum ct/ub from all row types
      if (comm || inv || summ) {
        for (const r of [comm, inv, summ]) {
          if (!r) continue
          total_ct += effectiveValue(r, "bs", "cut_transfer")
          total_ub += effectiveValue(r, "bs", "under_budget")
        }
      } else {
        const pnc = pendingNew.get(`bs-new|${g.source}|${year}|ผูกพัน`)
        const pni = pendingNew.get(`bs-new|${g.source}|${year}|ลงทุน`)
        if (pnc) { total_ct += pnc.cut_transfer; total_ub += pnc.under_budget }
        if (pni) { total_ct += pni.cut_transfer; total_ub += pni.under_budget }
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
          <th style={{ ...th, width: 200, minWidth: 200, maxWidth: 200, position: "sticky", left: 0, zIndex: 3, background: "#F9FAFB" }} rowSpan={3}>ชื่อ</th>
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
        <td style={{ ...td(), fontWeight: 500, position: "sticky", left: 0, background: "#fff", zIndex: 1, width: 200, maxWidth: 200, whiteSpace: "normal", wordBreak: "break-word" }}>{groupName}</td>
        {allYears.map(year => {
          const yd = years.find(y => y.year === year)
          const committed = yd?.committed ?? null
          const invest = yd?.invest ?? null
          const summary = yd?.summary ?? null
          const pnc = pendingNew.get(`${prefix}-new|${groupName}|${year}|ผูกพัน`)
          const pni = pendingNew.get(`${prefix}-new|${groupName}|${year}|ลงทุน`)
          const cb = committed ? effectiveValue(committed, prefix, "budget") : (pnc?.budget ?? 0)
          const ct = committed ? effectiveValue(committed, prefix, "target") : (pnc?.target ?? 0)
          const ib = invest ? effectiveValue(invest, prefix, "budget") : (pni?.budget ?? 0)
          const it_ = invest ? effectiveValue(invest, prefix, "target") : (pni?.target ?? 0)
          const tb = cb + ib; const tt = ct + it_
          // cut_transfer/under_budget: pick the row that actually has non-zero ct/ub data
          const hasRawCtUb = (r: SubJob | BudgetSource | null) =>
            !!r && (((r as BudgetSource).cut_transfer ?? 0) !== 0 || ((r as BudgetSource).under_budget ?? 0) !== 0)
          const adjRow = [summary, committed, invest].find(hasRawCtUb) ?? committed ?? invest ?? summary
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
        <td style={{ ...td(), fontWeight: 700, color: "#166534", position: "sticky", left: 0, background: "#F0FDF4", zIndex: 1, width: 200, maxWidth: 200, whiteSpace: "normal" }}>รวมทั้งหมด</td>
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

  // Virtual sub-job row — shown when project has no sub-jobs; initialized from bs totals
  function renderVirtualSubJobRow() {
    const groupName = DEFAULT_VIRTUAL_SJ_NAME
    const prefix = "sj" as const
    const neg = (v: number): React.CSSProperties => v < 0 ? { color: "#DC2626" } : {}
    const comp = (v: number, key: string) => (
      <td key={key} style={{ ...td(), textAlign: "right", fontFamily: "monospace", background: "#F9FAFB", ...neg(v) }}>{fmt3(v)}</td>
    )

    function makeVirtualCell(field: EditField, fundType: string, year: number, initValues: PendingRow) {
      const vKey = `${prefix}-new|${groupName}|${year}|${fundType}`
      const np = pendingNew.get(vKey)
      const effVal = np?.[field] ?? initValues[field]
      const isEd = editState?.key === vKey && editState?.field === field
      const isPend = !!np
      return (
        <td key={`${vKey}-${field}`} style={{ ...td(), padding: 0, background: !np ? "#F0F9FF" : "transparent" }}>
          <EditableCell
            value={effVal} isPending={isPend} isEditing={isEd}
            isUndo={undoKeys.has(`${vKey}|${field}`)}
            editValue={isEd ? editState!.value : ""}
            onStartEdit={() => {
              setPendingNew((prev) => {
                if (prev.has(vKey)) return prev
                const n = new Map(prev)
                n.set(vKey, { ...initValues, project_id: project!.id, name_or_source: groupName, sort_order: null, fund_type: fundType, data_year: year, prefix })
                return n
              })
              setEditState({ key: vKey, field, value: String(np?.[field] ?? initValues[field]) })
            }}
            onChange={(v) => setEditState((s) => s ? { ...s, value: v } : s)}
            onCommit={commitEdit} onCancel={() => setEditState(null)}
          />
        </td>
      )
    }

    return (
      <tr key={groupName} style={{ background: "#fff" }}>
        <td style={{ ...td(), fontWeight: 500, position: "sticky", left: 0, background: "#fff", zIndex: 1, width: 200, maxWidth: 200, whiteSpace: "normal", wordBreak: "break-word" }}>
          {groupName}
          <span style={{ marginLeft: 6, fontSize: 10, color: "#3B82F6", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 3, padding: "1px 5px" }}>auto</span>
        </td>
        {allYears.map(year => {
          const { sc_b, si_b, sc_t, si_t, total_ct, total_ub } = bsYearTotal(year)
          const pnc = pendingNew.get(`${prefix}-new|${groupName}|${year}|ผูกพัน`)
          const pni = pendingNew.get(`${prefix}-new|${groupName}|${year}|ลงทุน`)
          const cb = pnc?.budget ?? sc_b
          const ct = pnc?.target ?? sc_t
          const ib = pni?.budget ?? si_b
          const it_ = pni?.target ?? si_t
          const tb = cb + ib; const tt = ct + it_
          const commInit: PendingRow = { budget: sc_b, target: sc_t, cut_transfer: total_ct, under_budget: total_ub }
          const invInit: PendingRow = { budget: si_b, target: si_t, cut_transfer: 0, under_budget: 0 }
          return (
            <Fragment key={year}>
              {makeVirtualCell("budget", "ผูกพัน", year, commInit)}
              {makeVirtualCell("budget", "ลงทุน", year, invInit)}
              {comp(tb, `${year}-tb`)}
              {makeVirtualCell("target", "ผูกพัน", year, commInit)}
              {makeVirtualCell("target", "ลงทุน", year, invInit)}
              {comp(tt, `${year}-tt`)}
              {comp(cb - ct, `${year}-cr`)}
              {comp(ib - it_, `${year}-ir`)}
              {comp(tb - tt, `${year}-tr`)}
              {makeVirtualCell("cut_transfer", "ผูกพัน", year, commInit)}
              {makeVirtualCell("under_budget", "ผูกพัน", year, commInit)}
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
            {editingInfo ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>ชื่อโครงการ</span>
                    <input value={infoForm.name} onChange={e => setInfoForm(f => ({ ...f, name: e.target.value }))}
                      style={{ fontSize: 14, fontWeight: 700, border: "1.5px solid #3B82F6", borderRadius: 6, padding: "4px 8px", width: 400, outline: "none" }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>ข้อที่</span>
                    <input value={infoForm.item_no} onChange={e => setInfoForm(f => ({ ...f, item_no: e.target.value }))}
                      placeholder="–"
                      style={{ fontSize: 13, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", width: 80, outline: "none" }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>ปี</span>
                    <input type="number" value={infoForm.year} onChange={e => setInfoForm(f => ({ ...f, year: e.target.value }))}
                      style={{ fontSize: 13, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", width: 90, outline: "none" }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>ประเภท</span>
                    <select value={infoForm.project_type} onChange={e => setInfoForm(f => ({ ...f, project_type: e.target.value }))}
                      style={{ fontSize: 13, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", outline: "none" }}>
                      <option value="Y">Y — รายปี</option>
                      <option value="C">C — แผนงานระยะยาว</option>
                      <option value="L">L — สัญญาเช่า</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Division</span>
                    <input value={infoForm.division} onChange={e => setInfoForm(f => ({ ...f, division: e.target.value }))}
                      placeholder="–"
                      style={{ fontSize: 13, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", width: 160, outline: "none" }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Department</span>
                    <input value={infoForm.department} onChange={e => setInfoForm(f => ({ ...f, department: e.target.value }))}
                      placeholder="–"
                      style={{ fontSize: 13, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", width: 160, outline: "none" }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600 }}>Group</span>
                    <input value={infoForm.group_name} onChange={e => setInfoForm(f => ({ ...f, group_name: e.target.value }))}
                      placeholder="–"
                      style={{ fontSize: 13, border: "1.5px solid #D1D5DB", borderRadius: 6, padding: "4px 8px", width: 160, outline: "none" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" disabled={savingInfo} onClick={saveInfo}
                    style={{ padding: "5px 16px", background: savingInfo ? "#9CA3AF" : "#3B82F6", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: savingInfo ? "default" : "pointer" }}>
                    {savingInfo ? "Saving…" : "Save"}
                  </button>
                  <button type="button" onClick={() => setEditingInfo(false)}
                    style={{ padding: "5px 14px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold text-gray-800">{project.name}</h1>
                  {modeBadge}
                  {!isScenario && (
                    <button type="button" onClick={startEditInfo}
                      title="Edit project info"
                      style={{ padding: "2px 8px", fontSize: 11, color: "#6B7280", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 5, cursor: "pointer" }}>
                      Edit
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  <span className="font-mono">{project.project_code}</span>
                  {project.item_no && <span>ข้อ {project.item_no}</span>}
                  <span>ปี {project.year}</span>
                  <span>ประเภท {project.project_type}</span>
                  {project.division && <span>{project.division}</span>}
                  {project.department && <span>{project.department}</span>}
                  {project.group_name && <span>{project.group_name}</span>}
                </div>
              </div>
            )}
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
                <div ref={sjScrollRef} style={{ overflowX: "auto" }} data-scroll-container="" onScroll={onSjScroll}>
                  <table style={{ width: "100%", minWidth: "max-content", borderCollapse: "collapse" }}>
                    {makeTableHeader()}
                    <tbody>
                      {!hasVirtualSjRow && activeSjGroups.length === 0 && newSjNames.length === 0 && <tr><td colSpan={1 + allYears.length * COLS_PER_YEAR} style={{ ...td(), textAlign: "center", color: "#9CA3AF", padding: "24px" }}>ไม่มีข้อมูล</td></tr>}
                      {hasVirtualSjRow && renderVirtualSubJobRow()}
                      {activeSjGroups.map((g) => renderGroupRow(g.name, g.sort_order, g.years, "sj"))}
                      {newSjNames.map((name) => renderGroupRow(name, null, [], "sj"))}
                      {(activeSjGroups.length > 0 || newSjNames.length > 0 || hasVirtualSjRow) && renderTotalsRow(sjYearTotal, true)}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sub-job management */}
              {!isScenario && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setSjMgmtOpen(v => !v)}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B7280", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ transform: sjMgmtOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    จัดการงานย่อย
                  </button>

                  {sjMgmtOpen && (() => {
                    const remainingAfterDelete = activeSjGroups.length + newSjNames.length
                    const wouldBeEmpty = remainingAfterDelete === 0
                    return (
                      <div style={{ marginTop: 8, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 16px", maxWidth: 480 }}>
                        {/* Add row */}
                        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                          <input
                            value={sjNameInput}
                            onChange={e => setSjNameInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const name = sjNameInput.trim()
                                if (name && !subJobGroups.some(g => g.name === name) && !newSjNames.includes(name)) {
                                  setNewSjNames(prev => [...prev, name])
                                  setSjNameInput("")
                                }
                              }
                            }}
                            placeholder="ชื่องานย่อยใหม่"
                            style={{ flex: 1, fontSize: 12, border: "1px solid #D1D5DB", borderRadius: 5, padding: "4px 8px", outline: "none" }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const name = sjNameInput.trim()
                              if (name && !subJobGroups.some(g => g.name === name) && !newSjNames.includes(name)) {
                                setNewSjNames(prev => [...prev, name])
                                setSjNameInput("")
                              }
                            }}
                            style={{ fontSize: 12, padding: "4px 12px", background: "#3B82F6", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}
                          >+ เพิ่ม</button>
                        </div>

                        {/* Existing DB sub-jobs */}
                        {subJobGroups.map(g => {
                          const isDeleted = deletedSjNames.has(g.name)
                          const willBeEmpty = !isDeleted && activeSjGroups.length === 1 && newSjNames.length === 0
                          return (
                            <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "3px 0" }}>
                              <span style={{ flex: 1, fontSize: 12, color: isDeleted ? "#9CA3AF" : "#374151", textDecoration: isDeleted ? "line-through" : "none" }}>{g.name}</span>
                              {isDeleted ? (
                                <button
                                  type="button"
                                  onClick={() => setDeletedSjNames(prev => { const n = new Set(prev); n.delete(g.name); return n })}
                                  style={{ fontSize: 11, padding: "2px 8px", background: "#F3F4F6", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 4, cursor: "pointer" }}
                                >↩ undo</button>
                              ) : (
                                <>
                                  {willBeEmpty && (
                                    <span style={{ fontSize: 11, color: "#F59E0B" }}>⚠ จะไม่มีงานย่อย</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setDeletedSjNames(prev => new Set([...prev, g.name]))}
                                    style={{ fontSize: 11, padding: "2px 8px", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 4, cursor: "pointer" }}
                                  >ลบ</button>
                                </>
                              )}
                            </div>
                          )
                        })}

                        {/* New (unsaved) sub-jobs */}
                        {newSjNames.map(name => (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "3px 0" }}>
                            <span style={{ flex: 1, fontSize: 12, color: "#374151" }}>{name}</span>
                            <span style={{ fontSize: 10, color: "#3B82F6", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 3, padding: "1px 5px" }}>ใหม่</span>
                            <button
                              type="button"
                              onClick={() => {
                                setNewSjNames(prev => prev.filter(n => n !== name))
                                setPendingNew(prev => {
                                  const n = new Map(prev)
                                  for (const k of [...n.keys()]) { if (k.startsWith(`sj-new|${name}|`)) n.delete(k) }
                                  return n
                                })
                              }}
                              style={{ fontSize: 11, padding: "2px 8px", background: "#FEF2F2", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 4, cursor: "pointer" }}
                            >ลบ</button>
                          </div>
                        ))}

                        {wouldBeEmpty && (
                          <div style={{ marginTop: 8, fontSize: 11, color: "#B45309", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 5, padding: "6px 10px" }}>
                            ⚠ ไม่มีงานย่อย — แถว scratch จะถูกใช้แทน
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </section>

            {/* Budget Sources */}
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2">แหล่งเงิน (Budget Sources)</h2>
              <div className="bg-white border rounded-xl overflow-hidden">
                <div ref={bsScrollRef} style={{ overflowX: "auto" }} data-scroll-container="" onScroll={onBsScroll}>
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
            onClick={() => { setPending(new Map()); setPendingNew(new Map()); setUndoKeys(new Set()); setEditState(null); setNewSjNames([]); setDeletedSjNames(new Set()) }}
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
