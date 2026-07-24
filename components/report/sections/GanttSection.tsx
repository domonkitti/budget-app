'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import type { ProcurementPlan, ProcurementActivity, ProcurementMonth } from '@/lib/reportTypes'
import { THAI_MONTHS, fmtMillion, emptyMonths, normDetails, DEFAULT_PROCUREMENT_GROUP } from '@/lib/reportTypes'
import { toCleaned, formatDraft } from '@/components/report/NumberInput'
import GroupNameEditor from '@/components/report/GroupNameEditor'

interface Props {
  data: ProcurementPlan[]
  isAdmin: boolean
  onChange?: (plans: ProcurementPlan[]) => void
  // Fixed year for a duplicated card, independent of the stacked top-to-bottom view — lets you
  // print every year's 009 as separate cards instead of the full list.
  pinnedYear?: number
  onPinnedYearChange?: (year: number) => void
  // Row window into the flat activity list (regular activities then the pinned "เบิกจ่าย" row,
  // per visible year in order) — lets one card's plan list span multiple page-cards, same scheme
  // as EquipmentSection's rowStart/rowEnd over allItems.
  rowStart?: number
  rowEnd?: number
  isContinuation?: boolean
  // Names which page this continuation was split off from (e.g. "ต่อจากหน้า 4").
  continuationLabel?: string
  // When on, measures its own rendered rows against the visible box on every render and reports
  // the last row index that actually fit — the parent uses that to push overflow rows onto a
  // continuation page. Only meaningful while the card sits in a fixed-height admin page slot.
  autoSplit?: boolean
  onMeasureOverflow?: (lastFitAbsoluteIndex: number, totalRows: number) => void
}

const PINNED_NAME = 'เบิกจ่าย'
// The disbursement row is pinned by name prefix, so imported forms ("เบิกจ่ายเงิน(ล้านบาท)")
// pin the same as hand-created rows.
const isPinnedActivity = (a: ProcurementActivity) => a.name.trim().startsWith(PINNED_NAME)

type FlatRow = { year: number; group?: string; activity: ProcurementActivity; globalIdx: number; isPinned: boolean; absIdx: number }
// di = -1 targets the activity's own months; >= 0 targets details[di].
type CellKey = { year: number; ai: number; di: number; mi: number }

export default function GanttSection({
  data, isAdmin, onChange, pinnedYear, onPinnedYearChange,
  rowStart, rowEnd, isContinuation, continuationLabel, autoSplit, onMeasureOverflow,
}: Props) {
  const [editingCell, setEditingCell] = useState<CellKey | null>(null)
  const [dragOver, setDragOver] = useState<{ year: number; group?: string; idx: number } | null>(null)
  const [newGroupNameByYear, setNewGroupNameByYear] = useState<Record<number, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragSrcRef = useRef<{ year: number; group?: string; idx: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)

  // Unpinned (the normal card) lists every year top to bottom, like the onepage summary.
  // A pinned card (used for print pagination) stays locked to a single year.
  const plans = pinnedYear != null
    ? data.filter(p => p.fiscalYear === pinnedYear)
    : [...data].sort((a, b) => a.fiscalYear - b.fiscalYear)

  // Flat, windowable row list built from the FULL (unwindowed) plans above — within each year,
  // activities are bucketed by group (preserving order of first appearance, undefined group
  // first), and each group's own "เบิกจ่าย" row (if any) is pinned to the end of that group.
  const flatRows: FlatRow[] = []
  for (const plan of plans) {
    const groupOrder: (string | undefined)[] = []
    const byGroup = new Map<string | undefined, { activity: ProcurementActivity; globalIdx: number }[]>()
    plan.activities.forEach((activity, globalIdx) => {
      const g = activity.group
      if (!byGroup.has(g)) { byGroup.set(g, []); groupOrder.push(g) }
      byGroup.get(g)!.push({ activity, globalIdx })
    })
    for (const g of groupOrder) {
      const entries = byGroup.get(g)!
      const pinnedEntry = entries.find(e => isPinnedActivity(e.activity))
      for (const e of entries) {
        if (e === pinnedEntry) continue
        flatRows.push({ year: plan.fiscalYear, group: g, activity: e.activity, globalIdx: e.globalIdx, isPinned: false, absIdx: flatRows.length })
      }
      if (pinnedEntry) {
        flatRows.push({ year: plan.fiscalYear, group: g, activity: pinnedEntry.activity, globalIdx: pinnedEntry.globalIdx, isPinned: true, absIdx: flatRows.length })
      }
    }
  }
  const visibleRows = rowStart != null || rowEnd != null ? flatRows.slice(rowStart ?? 0, rowEnd ?? flatRows.length) : flatRows

  // Bucket the visible window back into per-year groups, preserving order, so a mid-year cut
  // still renders a clean "ปี {year}" block for whichever rows landed on this card.
  const yearBuckets: { year: number; rows: FlatRow[] }[] = []
  visibleRows.forEach(row => {
    let bucket = yearBuckets.find(b => b.year === row.year)
    if (!bucket) { bucket = { year: row.year, rows: [] }; yearBuckets.push(bucket) }
    bucket.rows.push(row)
  })
  // A year with zero activities produces no flatRows at all, so it'd never get a bucket above —
  // it still needs a header + "+ เพิ่มกิจกรรม" entry point. Only the un-windowed start of the
  // chain shows these (continuation cards only ever hold real overflow rows).
  if (rowStart == null) {
    for (const plan of plans) {
      if (plan.activities.length === 0 && !yearBuckets.some(b => b.year === plan.fiscalYear)) {
        yearBuckets.push({ year: plan.fiscalYear, rows: [] })
      }
    }
    yearBuckets.sort((a, b) => a.year - b.year)
  }

  useEffect(() => {
    if (editingCell) inputRef.current?.focus()
  }, [editingCell])

  // Runs after every render (no dep array) so it stays live as rows are added/edited/removed.
  // Uses viewport rects (not offsetTop) so it stays correct regardless of how many ancestors
  // between this card and react-grid-layout's own positioned wrapper — purely reads layout and
  // calls back up, never touches local state, so it can't loop on itself.
  useLayoutEffect(() => {
    if (!autoSplit || !onMeasureOverflow || !scrollRef.current || !rowsRef.current) return
    const containerBox = scrollRef.current.getBoundingClientRect()
    const rows = rowsRef.current.querySelectorAll<HTMLElement>('[data-row-i]')
    if (rows.length === 0) return
    let lastFitIdx = -1
    for (const row of rows) {
      const bottom = row.getBoundingClientRect().bottom - containerBox.top
      if (bottom <= containerBox.height) lastFitIdx = Number(row.dataset.rowI)
      else break
    }
    onMeasureOverflow(lastFitIdx, flatRows.length)
  })

  function patchPlan(year: number, updater: (p: ProcurementPlan) => ProcurementPlan) {
    if (!onChange) return
    const idx = data.findIndex(p => p.fiscalYear === year)
    if (idx < 0) return
    const next = [...data]
    next[idx] = updater(next[idx])
    onChange(next)
  }

  // Replaces one group's regular+pinned activities within a year, leaving every other
  // group's activities untouched.
  function saveGroupRegular(year: number, group: string | undefined, pinnedActivity: ProcurementActivity | null, next: ProcurementActivity[]) {
    patchPlan(year, p => {
      const others = p.activities.filter(a => a.group !== group)
      return { ...p, activities: [...others, ...next, ...(pinnedActivity ? [pinnedActivity] : [])] }
    })
  }

  function renameGroup(year: number, oldName: string | undefined, newName: string) {
    if (!newName || oldName === newName) return
    patchPlan(year, p => ({ ...p, activities: p.activities.map(a => a.group === oldName ? { ...a, group: newName } : a) }))
  }

  function deleteGroup(year: number, name: string | undefined) {
    patchPlan(year, p => ({ ...p, activities: p.activities.filter(a => a.group !== name) }))
  }

  function patchActivity(year: number, globalIdx: number, patch: Partial<ProcurementActivity>) {
    patchPlan(year, p => {
      const activities = [...p.activities]
      activities[globalIdx] = { ...activities[globalIdx], ...patch }
      return { ...p, activities }
    })
  }

  function patchDetailName(year: number, globalIdx: number, di: number, name: string) {
    patchPlan(year, p => {
      const activities = [...p.activities]
      const details = normDetails(activities[globalIdx].details)
      details[di] = { ...details[di], name }
      activities[globalIdx] = { ...activities[globalIdx], details }
      return { ...p, activities }
    })
  }

  // di = -1 patches the activity's own months; >= 0 patches details[di].
  function withMonths(a: ProcurementActivity, di: number, f: (months: ProcurementMonth[]) => ProcurementMonth[]): ProcurementActivity {
    if (di < 0) return { ...a, months: f(a.months) }
    const details = normDetails(a.details)
    details[di] = { ...details[di], months: f(details[di].months) }
    return { ...a, details }
  }

  function toggleMonth(year: number, globalIdx: number, di: number, mi: number) {
    patchPlan(year, p => {
      const activities = [...p.activities]
      activities[globalIdx] = withMonths(activities[globalIdx], di, months => {
        const next = [...months]
        const wasActive = next[mi].active
        next[mi] = { active: !wasActive, amount: wasActive ? undefined : next[mi].amount }
        return next
      })
      return { ...p, activities }
    })
  }

  function setAmount(year: number, globalIdx: number, di: number, mi: number, amount: number | undefined) {
    patchPlan(year, p => {
      const activities = [...p.activities]
      activities[globalIdx] = withMonths(activities[globalIdx], di, months => {
        const next = [...months]
        next[mi] = { ...next[mi], amount }
        return next
      })
      return { ...p, activities }
    })
  }

  function handleCellClick(year: number, globalIdx: number, di: number, mi: number, isActive: boolean) {
    if (!isAdmin) return
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      if (!isActive) toggleMonth(year, globalIdx, di, mi)
      setEditingCell({ year, ai: globalIdx, di, mi })
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        toggleMonth(year, globalIdx, di, mi)
      }, 240)
    }
  }

  function addActivity(year: number, group: string | undefined, regularActivities: ProcurementActivity[], pinnedActivity: ProcurementActivity | null) {
    saveGroupRegular(year, group, pinnedActivity, [...regularActivities, {
      id: `a${Date.now()}`,
      name: 'กิจกรรมใหม่',
      months: emptyMonths(),
      details: [],
      ...(group ? { group } : {}),
    }])
  }

  function addDetail(year: number, globalIdx: number, activity: ProcurementActivity) {
    patchActivity(year, globalIdx, { details: [...normDetails(activity.details), { name: '', months: emptyMonths() }] })
  }

  function removeDetail(year: number, globalIdx: number, activity: ProcurementActivity, di: number) {
    patchActivity(year, globalIdx, { details: normDetails(activity.details).filter((_, j) => j !== di) })
  }

  // Drag reorder (regular activities only, scoped to the same year+group)
  function handleDragStart(e: React.DragEvent, year: number, group: string | undefined, rIdx: number) {
    dragSrcRef.current = { year, group, idx: rIdx }
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, year: number, group: string | undefined, rIdx: number) {
    e.preventDefault()
    setDragOver({ year, group, idx: rIdx })
  }

  function handleDrop(e: React.DragEvent, year: number, group: string | undefined, rIdx: number, regularActivities: ProcurementActivity[], pinnedActivity: ProcurementActivity | null) {
    e.preventDefault()
    const src = dragSrcRef.current
    if (src && src.year === year && src.group === group && src.idx !== rIdx) {
      const next = [...regularActivities]
      const [removed] = next.splice(src.idx, 1)
      next.splice(rIdx, 0, removed)
      saveGroupRegular(year, group, pinnedActivity, next)
    }
    dragSrcRef.current = null
    setDragOver(null)
  }

  function handleDragEnd() {
    dragSrcRef.current = null
    setDragOver(null)
  }

  function addYear() {
    if (!onChange) return
    const lastYear = Math.max(...data.map(p => p.fiscalYear), 0)
    onChange([...data, { fiscalYear: lastYear + 1, activities: [] }])
  }

  function deleteYear(year: number) {
    if (!onChange) return
    onChange(data.filter(p => p.fiscalYear !== year))
  }

  function renderMonthBars(year: number, globalIdx: number, di: number, months: ProcurementMonth[], isDisbursement: boolean) {
    return months.map((month, mi) => {
      const isEditing = editingCell?.year === year && editingCell.ai === globalIdx && editingCell.di === di && editingCell.mi === mi
      if (isEditing) {
        return (
          <div key={mi} className="flex-1">
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              defaultValue={month.amount != null ? month.amount.toLocaleString('en-US', { maximumFractionDigits: 3 }) : ''}
              onInput={e => {
                const el = e.currentTarget
                const caret = el.selectionStart ?? el.value.length
                // Counts digits and the decimal point together — a caret right after a
                // freshly-typed "." must stay after the dot, not snap back to the last digit.
                const sigBefore = (el.value.slice(0, caret).match(/[0-9.]/g) || []).length
                const cleaned = toCleaned(el.value)
                el.value = formatDraft(cleaned)
                let count = 0, pos = el.value.length
                for (let i = 0; i < el.value.length; i++) {
                  if (/[0-9.]/.test(el.value[i])) count++
                  if (count >= sigBefore) { pos = i + 1; break }
                }
                el.setSelectionRange(pos, pos)
              }}
              onBlur={e => {
                const v = toCleaned(e.target.value)
                setAmount(year, globalIdx, di, mi, v && v !== '.' ? Number(v) : undefined)
                setEditingCell(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = toCleaned(e.currentTarget.value)
                  setAmount(year, globalIdx, di, mi, v && v !== '.' ? Number(v) : undefined)
                  setEditingCell(null)
                }
                if (e.key === 'Escape') setEditingCell(null)
              }}
              className="w-full h-6 rounded-sm text-center text-[10px] font-semibold bg-indigo-50 border border-indigo-400 outline-none"
            />
          </div>
        )
      }
      return (
        <div
          key={mi}
          onClick={() => handleCellClick(year, globalIdx, di, mi, month.active)}
          title={isAdmin ? (isDisbursement ? 'คลิก = toggle · ดับเบิลคลิก = ใส่ยอดเงิน' : 'คลิกเพื่อ toggle') : month.amount ? fmtMillion(month.amount) : undefined}
          className={`flex-1 flex items-center justify-center select-none ${
            isAdmin ? 'cursor-pointer' : ''
          } ${
            isDisbursement
              ? `h-5 rounded-sm border border-gray-300 ${month.amount != null ? 'bg-gray-100' : ''} ${isAdmin ? 'hover:bg-gray-100' : ''}`
              : `h-3 rounded-sm ${month.active ? 'bg-indigo-500' : 'bg-gray-200'} ${isAdmin ? 'hover:brightness-95 active:brightness-90' : ''}`
          }`}
        >
          {isDisbursement && month.amount != null && (
            <span className="text-[9px] leading-none text-gray-700 font-medium px-0.5 truncate">
              {fmtMillion(month.amount)}
            </span>
          )}
        </div>
      )
    })
  }

  // Read-only per-month sums shown on the pinned row when it has detail rows —
  // the details carry the editable amounts, the top row just totals them.
  function renderSummedBars(sums: number[]) {
    return sums.map((sum, mi) => (
      <div
        key={mi}
        title="รวมจากรายละเอียด"
        className="flex-1 h-5 rounded-sm border border-gray-200 bg-gray-50 flex items-center justify-center select-none"
      >
        {sum > 0 && (
          <span className="text-[9px] leading-none text-gray-500 font-medium px-0.5 truncate">
            {fmtMillion(sum)}
          </span>
        )}
      </div>
    ))
  }

  function renderDetailRows(row: FlatRow, isDisbursement: boolean) {
    const details = normDetails(row.activity.details)
    return details.map((d, di) => (
      <div key={di} className="flex items-start gap-2 py-0.5">
        <div className="w-48 shrink-0 flex items-center gap-1 pl-7">
          <span className="text-gray-300 text-xs shrink-0">–</span>
          {isAdmin ? (
            <input
              value={d.name}
              onChange={e => patchDetailName(row.year, row.globalIdx, di, e.target.value)}
              placeholder="รายละเอียด..."
              className="flex-1 min-w-0 border-b border-gray-100 focus:border-indigo-300 outline-none text-xs py-0.5 bg-transparent text-gray-500"
            />
          ) : (
            <span className="flex-1 min-w-0 text-[11px] text-gray-500 truncate">{d.name}</span>
          )}
        </div>
        <div className="flex flex-1 gap-0.5 pt-0.5">
          {renderMonthBars(row.year, row.globalIdx, di, d.months, isDisbursement)}
        </div>
        <div className="w-20 shrink-0 text-right text-[10px] text-gray-400 font-mono pt-1">
          {isDisbursement ? fmtMillion(d.months.reduce((s, m) => s + (m.amount ?? 0), 0)) : ''}
        </div>
        {isAdmin && (
          <button
            onClick={() => removeDetail(row.year, row.globalIdx, row.activity, di)}
            className="text-gray-200 hover:text-red-400 text-xs p-1 shrink-0 w-5"
          >✕</button>
        )}
      </div>
    ))
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-100 flex items-center justify-between flex-wrap gap-3 shrink-0">
        <p className="text-sm font-bold text-gray-700">
          แผนจัดซื้อ/จัดจ้าง (009){isContinuation && <span className="text-gray-400 font-normal"> ({continuationLabel ?? 'ต่อ'})</span>}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-gray-400">หน่วย : ล้านบาท</span>
          <div className="flex gap-1 items-center">
            {pinnedYear != null && data.map(p => (
              <button
                key={p.fiscalYear}
                onClick={() => onPinnedYearChange?.(p.fiscalYear)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  pinnedYear === p.fiscalYear
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                ปี {p.fiscalYear}
              </button>
            ))}
            {isAdmin && pinnedYear == null && rowEnd == null && (
              <button
                onClick={addYear}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-white text-indigo-400 hover:bg-indigo-50 border border-dashed border-indigo-300 hover:border-indigo-400 transition-colors"
              >
                + ปี
              </button>
            )}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto px-4 py-4">
        {yearBuckets.length > 0 ? (
          <div ref={rowsRef} className="space-y-6">
            {yearBuckets.map(bucket => {
              const fullPlan = plans.find(p => p.fiscalYear === bucket.year)

              // Sub-bucket this year's visible (windowed) rows by group, preserving order of
              // first appearance — mirrors EquipmentSection's item buckets.
              const groupBuckets: { name?: string; rows: FlatRow[] }[] = []
              bucket.rows.forEach(row => {
                let gb = groupBuckets.find(b => b.name === row.group)
                if (!gb) { gb = { name: row.group, rows: [] }; groupBuckets.push(gb) }
                gb.rows.push(row)
              })

              return (
                <div key={bucket.year}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-xs font-semibold text-gray-500">ปี {bucket.year}</p>
                    {isAdmin && pinnedYear == null && rowEnd == null && (
                      <button
                        onClick={() => deleteYear(bucket.year)}
                        className="text-gray-300 hover:text-red-400 text-xs"
                        title="ลบปีนี้"
                      >
                        ✕ ลบปีนี้
                      </button>
                    )}
                  </div>

                  {/* Month header */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-48 shrink-0" />
                    <div className="flex flex-1 gap-0.5">
                      {THAI_MONTHS.map((m, i) => (
                        <span key={i} className="flex-1 text-center text-[10px] font-medium text-gray-400">{m}</span>
                      ))}
                    </div>
                    <div className="w-20 shrink-0 text-right text-[10px] font-medium text-gray-400">รวม</div>
                    {isAdmin && <div className="w-5 shrink-0" />}
                  </div>

                  {groupBuckets.map(gb => {
                    const fullRegularActivities = fullPlan ? fullPlan.activities.filter(a => a.group === gb.name && !isPinnedActivity(a)) : []
                    const fullPinnedActivity = fullPlan ? fullPlan.activities.find(a => a.group === gb.name && isPinnedActivity(a)) ?? null : null

                    return (
                  <div key={gb.name ?? '__main'} className="mb-3">
                    {groupBuckets.length > 1 && (
                      <div className="flex items-center gap-2 mb-1.5 pl-1">
                        {isAdmin ? (
                          <GroupNameEditor name={gb.name ?? DEFAULT_PROCUREMENT_GROUP} onRename={n => renameGroup(bucket.year, gb.name, n)} />
                        ) : (
                          <span className="text-xs font-semibold text-gray-500">{gb.name ?? DEFAULT_PROCUREMENT_GROUP}</span>
                        )}
                        {isAdmin && rowEnd == null && (
                          <button
                            onClick={() => deleteGroup(bucket.year, gb.name)}
                            className="ml-auto text-xs text-gray-300 hover:text-red-400"
                            title="ลบตารางนี้"
                          >
                            ลบตาราง ×
                          </button>
                        )}
                      </div>
                    )}
                  <div className="space-y-1.5">
                    {gb.rows.map(row => {
                      if (row.isPinned) {
                        const details = normDetails(row.activity.details)
                        const hasDetails = details.length > 0
                        // With detail rows the top เบิกจ่าย row shows their per-month sums;
                        // without, it stays directly editable as before.
                        const monthSums = hasDetails
                          ? Array.from({ length: 12 }, (_, mi) => details.reduce((s, d) => s + (d.months[mi]?.amount ?? 0), 0))
                          : []
                        const total = hasDetails
                          ? monthSums.reduce((s, v) => s + v, 0)
                          : row.activity.months.reduce((s, m) => s + (m.amount ?? 0), 0)

                        return (
                          <div key={row.activity.id} data-row-i={row.absIdx} className="pt-2 border-t-2 border-gray-300">
                            <div className="flex items-start gap-2 py-0.5">
                              <div className="w-48 shrink-0 pl-5">
                                {isAdmin ? (
                                  <input
                                    value={row.activity.name}
                                    onChange={e => patchActivity(row.year, row.globalIdx, { name: e.target.value })}
                                    className="w-full border-b border-indigo-200 focus:border-indigo-400 outline-none text-xs py-0.5 bg-transparent font-medium text-indigo-700"
                                  />
                                ) : (
                                  <span className="text-xs font-semibold text-indigo-700 truncate block">{row.activity.name}</span>
                                )}
                              </div>
                              <div className="flex flex-1 gap-0.5 pt-0.5">
                                {hasDetails
                                  ? renderSummedBars(monthSums)
                                  : renderMonthBars(row.year, row.globalIdx, -1, row.activity.months, true)}
                              </div>
                              <div className="w-20 shrink-0 text-right text-xs font-semibold text-gray-900 font-mono pt-1">
                                {fmtMillion(total)}
                              </div>
                              {isAdmin && <div className="w-5 shrink-0" />}
                            </div>
                            {renderDetailRows(row, true)}
                            {isAdmin && (
                              <button
                                onClick={() => addDetail(row.year, row.globalIdx, row.activity)}
                                className="text-xs text-gray-300 hover:text-indigo-400 pl-7 mt-0.5"
                              >+ รายละเอียด</button>
                            )}
                          </div>
                        )
                      }

                      const trueRIdx = fullRegularActivities.findIndex(a => a.id === row.activity.id)
                      return (
                        <div
                          key={row.activity.id}
                          data-row-i={row.absIdx}
                          onDragOver={e => handleDragOver(e, row.year, row.group, trueRIdx)}
                          onDrop={e => handleDrop(e, row.year, row.group, trueRIdx, fullRegularActivities, fullPinnedActivity)}
                          className={dragOver?.year === row.year && dragOver.group === row.group && dragOver.idx === trueRIdx ? 'border-t-2 border-indigo-400' : ''}
                        >
                          <div className="flex items-start gap-2 py-0.5">
                            <div className="w-48 shrink-0">
                              {isAdmin ? (
                                <div className="flex items-start gap-1.5">
                                  <span
                                    draggable={rowEnd == null}
                                    onDragStart={rowEnd == null ? e => handleDragStart(e, row.year, row.group, trueRIdx) : undefined}
                                    onDragEnd={handleDragEnd}
                                    className={`mt-1.5 shrink-0 select-none ${rowEnd == null ? 'cursor-grab active:cursor-grabbing text-gray-200 hover:text-gray-400' : 'text-gray-100 cursor-default'}`}
                                    title={rowEnd == null ? 'ลากเพื่อเรียงลำดับ' : undefined}
                                  >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                                      <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
                                      <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
                                      <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                                    </svg>
                                  </span>
                                  <input
                                    value={row.activity.name}
                                    onChange={e => patchActivity(row.year, row.globalIdx, { name: e.target.value })}
                                    className="flex-1 min-w-0 border-b border-gray-200 focus:border-indigo-400 outline-none text-xs py-0.5 bg-transparent font-medium text-gray-700"
                                  />
                                </div>
                              ) : (
                                <span className="text-xs font-medium text-gray-700 truncate block">{row.activity.name}</span>
                              )}
                            </div>
                            <div className="flex flex-1 gap-0.5 pt-0.5">
                              {renderMonthBars(row.year, row.globalIdx, -1, row.activity.months, false)}
                            </div>
                            <div className="w-20 shrink-0" />
                            {isAdmin && (
                              <button
                                onClick={() => saveGroupRegular(row.year, row.group, fullPinnedActivity, fullRegularActivities.filter((_, i) => i !== trueRIdx))}
                                className="text-gray-200 hover:text-red-400 p-1 shrink-0"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                          {renderDetailRows(row, false)}
                          {isAdmin && (
                            <button
                              onClick={() => addDetail(row.year, row.globalIdx, row.activity)}
                              className="text-xs text-gray-300 hover:text-indigo-400 pl-7 mt-0.5"
                            >+ รายละเอียด</button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {isAdmin && rowEnd == null && (
                    <div className="pt-2">
                      <button
                        onClick={() => addActivity(bucket.year, gb.name, fullRegularActivities, fullPinnedActivity)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        + เพิ่มกิจกรรม
                      </button>
                    </div>
                  )}
                  </div>
                    )
                  })}

                  {isAdmin && rowEnd == null && (
                    <div className="pt-1 flex items-center gap-1.5">
                      <input
                        value={newGroupNameByYear[bucket.year] ?? ''}
                        onChange={e => setNewGroupNameByYear(m => ({ ...m, [bucket.year]: e.target.value }))}
                        placeholder="ชื่อตารางใหม่ เช่น VT&CT ชุดที่ 2"
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-56 outline-none focus:border-indigo-400"
                      />
                      <button
                        onClick={() => {
                          const name = (newGroupNameByYear[bucket.year] ?? '').trim()
                          if (!name) return
                          addActivity(bucket.year, name, [], null)
                          setNewGroupNameByYear(m => ({ ...m, [bucket.year]: '' }))
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
                      >
                        + ตารางย่อยใหม่
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {isAdmin && rowEnd == null && (
              <p className="text-xs text-gray-300">คลิก = toggle · ดับเบิลคลิก = ใส่ยอดเงิน</p>
            )}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-gray-300 text-sm">
            {plans.length === 0 ? `ไม่มีข้อมูลสำหรับปี ${pinnedYear}` : 'ไม่มีรายการในช่วงนี้'}
          </div>
        )}
      </div>
    </div>
  )
}
