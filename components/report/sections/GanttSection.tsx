'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import type { ProcurementPlan, ProcurementActivity } from '@/lib/reportTypes'
import { THAI_MONTHS, fmtMillion } from '@/lib/reportTypes'
import { toCleaned, formatDraft } from '@/components/report/NumberInput'

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

type FlatRow = { year: number; activity: ProcurementActivity; globalIdx: number; isPinned: boolean; absIdx: number }

export default function GanttSection({
  data, isAdmin, onChange, pinnedYear, onPinnedYearChange,
  rowStart, rowEnd, isContinuation, continuationLabel, autoSplit, onMeasureOverflow,
}: Props) {
  const [editingCell, setEditingCell] = useState<{ year: number; ai: number; mi: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ year: number; idx: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragSrcRef = useRef<{ year: number; idx: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)

  // Unpinned (the normal card) lists every year top to bottom, like the onepage summary.
  // A pinned card (used for print pagination) stays locked to a single year.
  const plans = pinnedYear != null
    ? data.filter(p => p.fiscalYear === pinnedYear)
    : [...data].sort((a, b) => a.fiscalYear - b.fiscalYear)

  // Flat, windowable row list built from the FULL (unwindowed) plans above — regular activities
  // then the pinned "เบิกจ่าย" row, per year, in render order.
  const flatRows: FlatRow[] = []
  for (const plan of plans) {
    const pinnedIdx = plan.activities.findIndex(a => a.name === PINNED_NAME)
    plan.activities.forEach((activity, globalIdx) => {
      if (globalIdx === pinnedIdx) return
      flatRows.push({ year: plan.fiscalYear, activity, globalIdx, isPinned: false, absIdx: flatRows.length })
    })
    if (pinnedIdx >= 0) {
      flatRows.push({ year: plan.fiscalYear, activity: plan.activities[pinnedIdx], globalIdx: pinnedIdx, isPinned: true, absIdx: flatRows.length })
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

  function saveRegular(year: number, pinnedActivity: ProcurementActivity | null, next: ProcurementActivity[]) {
    patchPlan(year, p => ({ ...p, activities: pinnedActivity ? [...next, pinnedActivity] : next }))
  }

  function patchActivity(year: number, globalIdx: number, patch: Partial<ProcurementActivity>) {
    patchPlan(year, p => {
      const activities = [...p.activities]
      activities[globalIdx] = { ...activities[globalIdx], ...patch }
      return { ...p, activities }
    })
  }

  function toggleMonth(year: number, globalIdx: number, mi: number) {
    patchPlan(year, p => {
      const activities = [...p.activities]
      const months = [...activities[globalIdx].months]
      const wasActive = months[mi].active
      months[mi] = { active: !wasActive, amount: wasActive ? undefined : months[mi].amount }
      activities[globalIdx] = { ...activities[globalIdx], months }
      return { ...p, activities }
    })
  }

  function setAmount(year: number, globalIdx: number, mi: number, amount: number | undefined) {
    patchPlan(year, p => {
      const activities = [...p.activities]
      const months = [...activities[globalIdx].months]
      months[mi] = { ...months[mi], amount }
      activities[globalIdx] = { ...activities[globalIdx], months }
      return { ...p, activities }
    })
  }

  function handleCellClick(year: number, globalIdx: number, mi: number, isActive: boolean) {
    if (!isAdmin) return
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      if (!isActive) toggleMonth(year, globalIdx, mi)
      setEditingCell({ year, ai: globalIdx, mi })
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        toggleMonth(year, globalIdx, mi)
      }, 240)
    }
  }

  function addActivity(year: number, regularActivities: ProcurementActivity[], pinnedActivity: ProcurementActivity | null) {
    saveRegular(year, pinnedActivity, [...regularActivities, {
      id: `a${Date.now()}`,
      name: 'กิจกรรมใหม่',
      months: Array.from({ length: 12 }, () => ({ active: false })),
      details: [],
    }])
  }

  // Drag reorder (regular activities only)
  function handleDragStart(e: React.DragEvent, year: number, rIdx: number) {
    dragSrcRef.current = { year, idx: rIdx }
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, year: number, rIdx: number) {
    e.preventDefault()
    setDragOver({ year, idx: rIdx })
  }

  function handleDrop(e: React.DragEvent, year: number, rIdx: number, regularActivities: ProcurementActivity[], pinnedActivity: ProcurementActivity | null) {
    e.preventDefault()
    const src = dragSrcRef.current
    if (src && src.year === year && src.idx !== rIdx) {
      const next = [...regularActivities]
      const [removed] = next.splice(src.idx, 1)
      next.splice(rIdx, 0, removed)
      saveRegular(year, pinnedActivity, next)
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

  function renderMonthBars(year: number, activity: ProcurementActivity, globalIdx: number, isDisbursement: boolean) {
    return activity.months.map((month, mi) => {
      const isEditing = editingCell?.year === year && editingCell.ai === globalIdx && editingCell.mi === mi
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
                setAmount(year, globalIdx, mi, v && v !== '.' ? Number(v) : undefined)
                setEditingCell(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = toCleaned(e.currentTarget.value)
                  setAmount(year, globalIdx, mi, v && v !== '.' ? Number(v) : undefined)
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
          onClick={() => handleCellClick(year, globalIdx, mi, month.active)}
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
              const pinnedIdxFull = fullPlan ? fullPlan.activities.findIndex(a => a.name === PINNED_NAME) : -1
              const fullRegularActivities = fullPlan ? fullPlan.activities.filter((_, i) => i !== pinnedIdxFull) : []
              const fullPinnedActivity = fullPlan && pinnedIdxFull >= 0 ? fullPlan.activities[pinnedIdxFull] : null

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

                  <div className="space-y-1.5">
                    {bucket.rows.map(row => {
                      if (row.isPinned) {
                        return (
                          <div key={row.activity.id} data-row-i={row.absIdx} className="flex items-start gap-2 py-0.5 pt-2 border-t-2 border-gray-300">
                            <div className="w-48 shrink-0">
                              {isAdmin ? (
                                <div className="space-y-1 pl-5">
                                  <input
                                    value={row.activity.name}
                                    onChange={e => patchActivity(row.year, row.globalIdx, { name: e.target.value })}
                                    className="w-full border-b border-indigo-200 focus:border-indigo-400 outline-none text-xs py-0.5 bg-transparent font-medium text-indigo-700"
                                  />
                                  {(row.activity.details ?? []).map((d, di) => (
                                    <div key={di} className="flex items-center gap-1">
                                      <span className="text-gray-300 text-xs shrink-0">–</span>
                                      <input
                                        value={d}
                                        onChange={e => {
                                          const details = [...(row.activity.details ?? [])]
                                          details[di] = e.target.value
                                          patchActivity(row.year, row.globalIdx, { details })
                                        }}
                                        className="flex-1 border-b border-gray-100 focus:border-indigo-300 outline-none text-xs py-0.5 bg-transparent text-gray-500"
                                      />
                                      <button
                                        onClick={() => patchActivity(row.year, row.globalIdx, { details: (row.activity.details ?? []).filter((_, j) => j !== di) })}
                                        className="text-gray-200 hover:text-red-400 text-xs shrink-0"
                                      >✕</button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => patchActivity(row.year, row.globalIdx, { details: [...(row.activity.details ?? []), ''] })}
                                    className="text-xs text-gray-300 hover:text-indigo-400"
                                  >+ รายละเอียด</button>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-xs font-semibold text-indigo-700 truncate block">{row.activity.name}</span>
                                  {(row.activity.details ?? []).length > 0 && (
                                    <ul className="mt-0.5 space-y-0.5">
                                      {(row.activity.details ?? []).map((d, di) => (
                                        <li key={di} className="text-[10px] text-gray-400 flex gap-1"><span>–</span>{d}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-1 gap-0.5 pt-0.5">
                              {renderMonthBars(row.year, row.activity, row.globalIdx, true)}
                            </div>
                            <div className="w-20 shrink-0 text-right text-xs font-semibold text-gray-900 font-mono pt-1">
                              {fmtMillion(row.activity.months.reduce((s, m) => s + (m.amount ?? 0), 0))}
                            </div>
                            {isAdmin && <div className="w-5 shrink-0" />}
                          </div>
                        )
                      }

                      const trueRIdx = fullRegularActivities.findIndex(a => a.id === row.activity.id)
                      return (
                        <div
                          key={row.activity.id}
                          data-row-i={row.absIdx}
                          onDragOver={e => handleDragOver(e, row.year, trueRIdx)}
                          onDrop={e => handleDrop(e, row.year, trueRIdx, fullRegularActivities, fullPinnedActivity)}
                          className={`flex items-start gap-2 py-0.5 ${dragOver?.year === row.year && dragOver.idx === trueRIdx ? 'border-t-2 border-indigo-400' : ''}`}
                        >
                          <div className="w-48 shrink-0">
                            {isAdmin ? (
                              <div className="flex items-start gap-1.5">
                                <span
                                  draggable={rowEnd == null}
                                  onDragStart={rowEnd == null ? e => handleDragStart(e, row.year, trueRIdx) : undefined}
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
                                <div className="flex-1 min-w-0 space-y-1">
                                  <input
                                    value={row.activity.name}
                                    onChange={e => patchActivity(row.year, row.globalIdx, { name: e.target.value })}
                                    className="w-full border-b border-gray-200 focus:border-indigo-400 outline-none text-xs py-0.5 bg-transparent font-medium text-gray-700"
                                  />
                                  {(row.activity.details ?? []).map((d, di) => (
                                    <div key={di} className="flex items-center gap-1">
                                      <span className="text-gray-300 text-xs shrink-0">–</span>
                                      <input
                                        value={d}
                                        onChange={e => {
                                          const details = [...(row.activity.details ?? [])]
                                          details[di] = e.target.value
                                          patchActivity(row.year, row.globalIdx, { details })
                                        }}
                                        className="flex-1 border-b border-gray-100 focus:border-indigo-300 outline-none text-xs py-0.5 bg-transparent text-gray-500"
                                      />
                                      <button
                                        onClick={() => patchActivity(row.year, row.globalIdx, { details: (row.activity.details ?? []).filter((_, j) => j !== di) })}
                                        className="text-gray-200 hover:text-red-400 text-xs shrink-0"
                                      >✕</button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => patchActivity(row.year, row.globalIdx, { details: [...(row.activity.details ?? []), ''] })}
                                    className="text-xs text-gray-300 hover:text-indigo-400"
                                  >+ รายละเอียด</button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="text-xs font-medium text-gray-700 truncate block">{row.activity.name}</span>
                                {(row.activity.details ?? []).length > 0 && (
                                  <ul className="mt-0.5 space-y-0.5">
                                    {(row.activity.details ?? []).map((d, di) => (
                                      <li key={di} className="text-[10px] text-gray-400 flex gap-1"><span>–</span>{d}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-1 gap-0.5 pt-0.5">
                            {renderMonthBars(row.year, row.activity, row.globalIdx, false)}
                          </div>
                          <div className="w-20 shrink-0" />
                          {isAdmin && (
                            <button
                              onClick={() => saveRegular(row.year, fullPinnedActivity, fullRegularActivities.filter((_, i) => i !== trueRIdx))}
                              className="text-gray-200 hover:text-red-400 p-1 shrink-0"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {isAdmin && rowEnd == null && (
                    <div className="pt-3">
                      <button
                        onClick={() => addActivity(bucket.year, fullRegularActivities, fullPinnedActivity)}
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
