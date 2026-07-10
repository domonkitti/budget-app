'use client'

import { useState, useRef, useEffect } from 'react'
import type { ProcurementPlan, ProcurementActivity } from '@/lib/reportTypes'
import { THAI_MONTHS } from '@/lib/reportTypes'

interface Props {
  data: ProcurementPlan[]
  isAdmin: boolean
  onChange?: (plans: ProcurementPlan[]) => void
}

const PINNED_NAME = 'เบิกจ่าย'

export default function GanttSection({ data, isAdmin, onChange }: Props) {
  const [activeYear, setActiveYear] = useState(data[0]?.fiscalYear ?? 0)
  const [editingCell, setEditingCell] = useState<{ ai: number; mi: number } | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragSrcIdx = useRef<number | null>(null)

  const planIdx = data.findIndex(p => p.fiscalYear === activeYear)
  const plan = data[planIdx]

  // เบิกจ่าย is always pinned to bottom; everything else is draggable
  const pinnedIdx = plan?.activities.findIndex(a => a.name === PINNED_NAME) ?? -1
  const regularActivities = plan?.activities.filter((_, i) => i !== pinnedIdx) ?? []
  const pinnedActivity = pinnedIdx >= 0 ? plan.activities[pinnedIdx] : null

  useEffect(() => {
    if (editingCell) inputRef.current?.focus()
  }, [editingCell])

  function patchPlan(updater: (p: ProcurementPlan) => ProcurementPlan) {
    if (!onChange || planIdx < 0) return
    const next = [...data]
    next[planIdx] = updater(next[planIdx])
    onChange(next)
  }

  // Commit regular + pinned back to the plan
  function saveRegular(next: ProcurementActivity[]) {
    patchPlan(p => ({ ...p, activities: pinnedActivity ? [...next, pinnedActivity] : next }))
  }

  function patchActivity(globalIdx: number, patch: Partial<ProcurementActivity>) {
    patchPlan(p => {
      const activities = [...p.activities]
      activities[globalIdx] = { ...activities[globalIdx], ...patch }
      return { ...p, activities }
    })
  }

  function toggleMonth(globalIdx: number, mi: number) {
    patchPlan(p => {
      const activities = [...p.activities]
      const months = [...activities[globalIdx].months]
      const wasActive = months[mi].active
      months[mi] = { active: !wasActive, amount: wasActive ? undefined : months[mi].amount }
      activities[globalIdx] = { ...activities[globalIdx], months }
      return { ...p, activities }
    })
  }

  function setAmount(globalIdx: number, mi: number, amount: number | undefined) {
    patchPlan(p => {
      const activities = [...p.activities]
      const months = [...activities[globalIdx].months]
      months[mi] = { ...months[mi], amount }
      activities[globalIdx] = { ...activities[globalIdx], months }
      return { ...p, activities }
    })
  }

  function handleCellClick(globalIdx: number, mi: number, isActive: boolean) {
    if (!isAdmin) return
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
      if (!isActive) toggleMonth(globalIdx, mi)
      setEditingCell({ ai: globalIdx, mi })
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null
        toggleMonth(globalIdx, mi)
      }, 240)
    }
  }

  function addActivity() {
    saveRegular([...regularActivities, {
      id: `a${Date.now()}`,
      name: 'กิจกรรมใหม่',
      months: Array.from({ length: 12 }, () => ({ active: false })),
      details: [],
    }])
  }

  // Drag reorder (regular activities only)
  function handleDragStart(e: React.DragEvent, rIdx: number) {
    dragSrcIdx.current = rIdx
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, rIdx: number) {
    e.preventDefault()
    setDragOverIdx(rIdx)
  }

  function handleDrop(e: React.DragEvent, rIdx: number) {
    e.preventDefault()
    const src = dragSrcIdx.current
    if (src !== null && src !== rIdx) {
      const next = [...regularActivities]
      const [removed] = next.splice(src, 1)
      next.splice(rIdx, 0, removed)
      saveRegular(next)
    }
    dragSrcIdx.current = null
    setDragOverIdx(null)
  }

  function handleDragEnd() {
    dragSrcIdx.current = null
    setDragOverIdx(null)
  }

  function addYear() {
    if (!onChange) return
    const lastYear = Math.max(...data.map(p => p.fiscalYear), 0)
    const newYear = lastYear + 1
    onChange([...data, { fiscalYear: newYear, activities: [] }])
    setActiveYear(newYear)
  }

  function renderMonthCells(activity: ProcurementActivity, globalIdx: number) {
    return activity.months.map((month, mi) => {
      const isEditing = editingCell?.ai === globalIdx && editingCell?.mi === mi
      return (
        <td key={mi} className="py-1 px-0.5 align-top pt-1.5">
          {isEditing ? (
            <input
              key={`${globalIdx}-${mi}`}
              ref={inputRef}
              type="number"
              defaultValue={month.amount ?? ''}
              onBlur={e => {
                setAmount(globalIdx, mi, e.target.value ? Number(e.target.value) : undefined)
                setEditingCell(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setAmount(globalIdx, mi, e.currentTarget.value ? Number(e.currentTarget.value) : undefined)
                  setEditingCell(null)
                }
                if (e.key === 'Escape') setEditingCell(null)
              }}
              className="w-full rounded-md text-center py-2.5 min-h-[40px] text-xs font-semibold bg-indigo-50 border-2 border-indigo-400 outline-none"
            />
          ) : month.active ? (
            <div
              onClick={() => handleCellClick(globalIdx, mi, true)}
              title={isAdmin ? 'คลิก = toggle · ดับเบิลคลิก = ใส่ยอด' : undefined}
              className={`rounded-md text-center py-2.5 min-h-[40px] flex items-center justify-center select-none ${
                isAdmin ? 'cursor-pointer hover:brightness-95 active:brightness-90' : ''
              } bg-indigo-200`}
            >
              {month.amount != null && (
                <span className="text-xs font-semibold leading-tight text-indigo-900">
                  {(month.amount / 1_000_000).toFixed(1)}ล.
                </span>
              )}
            </div>
          ) : (
            <div
              onClick={() => handleCellClick(globalIdx, mi, false)}
              title={isAdmin ? 'คลิกเพื่อเปิดใช้งาน' : undefined}
              className={`rounded-md min-h-[40px] bg-gray-50 select-none ${
                isAdmin ? 'cursor-pointer hover:bg-indigo-50 hover:border hover:border-dashed hover:border-indigo-200' : ''
              }`}
            />
          )}
        </td>
      )
    })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3 shrink-0">
        <p className="text-sm font-bold text-gray-700">แผนจัดซื้อ/จัดจ้าง (009)</p>
        <div className="flex gap-1 items-center">
          {data.map(p => (
            <button
              key={p.fiscalYear}
              onClick={() => { setActiveYear(p.fiscalYear); setEditingCell(null) }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                activeYear === p.fiscalYear
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              ปี {p.fiscalYear}
            </button>
          ))}
          {isAdmin && (
            <button
              onClick={addYear}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-white text-indigo-400 hover:bg-indigo-50 border border-dashed border-indigo-300 hover:border-indigo-400 transition-colors"
            >
              + ปี
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto pb-3">
        {plan ? (
          <>
            <table className="w-full min-w-[820px] border-collapse">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th className="bg-white text-left text-xs font-semibold text-gray-400 pl-4 pr-3 pt-4 pb-3 w-48">กิจกรรม</th>
                  {THAI_MONTHS.map((m, i) => (
                    <th key={i} className="bg-white text-center text-xs font-medium text-gray-400 pt-4 pb-3 w-14">{m}</th>
                  ))}
                  {isAdmin && <th className="bg-white w-6 pt-4" />}
                </tr>
              </thead>
              <tbody>
                {/* Regular activities — draggable */}
                {regularActivities.map((activity, rIdx) => {
                  const globalIdx = plan.activities.indexOf(activity)
                  return (
                    <tr
                      key={activity.id}
                      onDragOver={e => handleDragOver(e, rIdx)}
                      onDrop={e => handleDrop(e, rIdx)}
                      className={dragOverIdx === rIdx ? 'border-t-2 border-indigo-400' : ''}
                    >
                      <td className="py-1 pl-4 pr-3 align-top">
                        {isAdmin ? (
                          <div className="flex items-start gap-1.5">
                            <span
                              draggable
                              onDragStart={e => handleDragStart(e, rIdx)}
                              onDragEnd={handleDragEnd}
                              className="mt-1.5 cursor-grab active:cursor-grabbing text-gray-200 hover:text-gray-400 shrink-0 select-none"
                              title="ลากเพื่อเรียงลำดับ"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
                                <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
                                <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                              </svg>
                            </span>
                            <div className="flex-1 min-w-0 space-y-1">
                              <input
                                value={activity.name}
                                onChange={e => patchActivity(globalIdx, { name: e.target.value })}
                                className="w-full border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent font-medium text-gray-700"
                              />
                              {(activity.details ?? []).map((d, di) => (
                                <div key={di} className="flex items-center gap-1">
                                  <span className="text-gray-300 text-xs shrink-0">–</span>
                                  <input
                                    value={d}
                                    onChange={e => {
                                      const details = [...(activity.details ?? [])]
                                      details[di] = e.target.value
                                      patchActivity(globalIdx, { details })
                                    }}
                                    className="flex-1 border-b border-gray-100 focus:border-indigo-300 outline-none text-xs py-0.5 bg-transparent text-gray-500"
                                  />
                                  <button
                                    onClick={() => patchActivity(globalIdx, { details: (activity.details ?? []).filter((_, j) => j !== di) })}
                                    className="text-gray-200 hover:text-red-400 text-xs shrink-0"
                                  >✕</button>
                                </div>
                              ))}
                              <button
                                onClick={() => patchActivity(globalIdx, { details: [...(activity.details ?? []), ''] })}
                                className="text-xs text-gray-300 hover:text-indigo-400"
                              >+ รายละเอียด</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-sm font-medium text-gray-700">{activity.name}</span>
                            {(activity.details ?? []).length > 0 && (
                              <ul className="mt-0.5 space-y-0.5">
                                {(activity.details ?? []).map((d, di) => (
                                  <li key={di} className="text-xs text-gray-400 flex gap-1"><span>–</span>{d}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </td>
                      {renderMonthCells(activity, globalIdx)}
                      {isAdmin && (
                        <td className="py-1 pl-1 align-top pt-2">
                          <button
                            onClick={() => saveRegular(regularActivities.filter((_, i) => i !== rIdx))}
                            className="text-gray-200 hover:text-red-400 p-1"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}

                {/* เบิกจ่าย — pinned, not draggable, always last */}
                {pinnedActivity && (() => {
                  const globalIdx = plan.activities.indexOf(pinnedActivity)
                  return (
                    <tr key={pinnedActivity.id} className="border-t border-gray-100">
                      <td className="py-1 pl-4 pr-3 align-top pt-2">
                        {isAdmin ? (
                          <div className="space-y-1 pl-5">
                            <input
                              value={pinnedActivity.name}
                              onChange={e => patchActivity(globalIdx, { name: e.target.value })}
                              className="w-full border-b border-indigo-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent font-medium text-indigo-700"
                            />
                            {(pinnedActivity.details ?? []).map((d, di) => (
                              <div key={di} className="flex items-center gap-1">
                                <span className="text-gray-300 text-xs shrink-0">–</span>
                                <input
                                  value={d}
                                  onChange={e => {
                                    const details = [...(pinnedActivity.details ?? [])]
                                    details[di] = e.target.value
                                    patchActivity(globalIdx, { details })
                                  }}
                                  className="flex-1 border-b border-gray-100 focus:border-indigo-300 outline-none text-xs py-0.5 bg-transparent text-gray-500"
                                />
                                <button
                                  onClick={() => patchActivity(globalIdx, { details: (pinnedActivity.details ?? []).filter((_, j) => j !== di) })}
                                  className="text-gray-200 hover:text-red-400 text-xs shrink-0"
                                >✕</button>
                              </div>
                            ))}
                            <button
                              onClick={() => patchActivity(globalIdx, { details: [...(pinnedActivity.details ?? []), ''] })}
                              className="text-xs text-gray-300 hover:text-indigo-400"
                            >+ รายละเอียด</button>
                          </div>
                        ) : (
                          <div>
                            <span className="text-sm font-semibold text-indigo-700">{pinnedActivity.name}</span>
                            {(pinnedActivity.details ?? []).length > 0 && (
                              <ul className="mt-0.5 space-y-0.5">
                                {(pinnedActivity.details ?? []).map((d, di) => (
                                  <li key={di} className="text-xs text-gray-400 flex gap-1"><span>–</span>{d}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </td>
                      {renderMonthCells(pinnedActivity, globalIdx)}
                      {isAdmin && <td />}
                    </tr>
                  )
                })()}
              </tbody>
            </table>

            {isAdmin && (
              <div className="px-4 pb-4">
                <button
                  onClick={addActivity}
                  className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                  + เพิ่มกิจกรรม
                </button>
                <p className="mt-3 text-xs text-gray-300">คลิก = toggle · ดับเบิลคลิก = ใส่ยอดเงิน</p>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 py-10 text-center text-gray-300 text-sm">ไม่มีข้อมูลสำหรับปี {activeYear}</div>
        )}
      </div>
    </div>
  )
}
