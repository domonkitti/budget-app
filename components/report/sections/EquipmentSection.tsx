'use client'

import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { EquipmentYear, EquipmentItem } from '@/lib/reportTypes'
import { fmtNumber, fmtMillion, YEAR_CHOICES, DEFAULT_EQUIPMENT_GROUP } from '@/lib/reportTypes'
import NumberInput from '@/components/report/NumberInput'

interface Props {
  data: EquipmentYear[]
  isAdmin: boolean
  onChange?: (data: EquipmentYear[]) => void
  activeYear: number
  onActiveYearChange: (year: number) => void
  // Row window into yearData.items for this card — lets one year's list span multiple page-cards.
  rowStart?: number
  rowEnd?: number
  isContinuation?: boolean
  // Names which page this continuation was split off from (e.g. "ต่อจากหน้า 4").
  // Falls back to a plain "(ต่อ)" label when the source page can't be resolved.
  continuationLabel?: string
  // When on, measures its own rendered rows against the visible box on every render and reports
  // the last row index that actually fit — the parent uses that to push overflow rows onto a
  // continuation page. Only meaningful while the card sits in a fixed-height admin page slot.
  autoSplit?: boolean
  onMeasureOverflow?: (lastFitAbsoluteIndex: number, totalRows: number) => void
}

export default function EquipmentSection({ data, isAdmin, onChange, activeYear, onActiveYearChange, rowStart, rowEnd, isContinuation, continuationLabel, autoSplit, onMeasureOverflow }: Props) {
  const disbursementFor = (it: EquipmentItem, year: number) => it.disbursementByYear.find(d => d.year === year)?.amount ?? 0
  const yearIdx = data.findIndex(d => d.year === activeYear)
  const yearData = data[yearIdx]
  const allItems = yearData?.items ?? []
  const visibleItems = rowStart != null || rowEnd != null ? allItems.slice(rowStart ?? 0, rowEnd ?? allItems.length) : allItems
  const total = visibleItems.reduce((s, item) => s + (item.cancelled ? 0 : item.totalAmount), 0)
  const totalDisbursement = (year: number) => visibleItems.reduce((s, item) => s + (item.cancelled ? 0 : disbursementFor(item, year)), 0)

  const scrollRef = useRef<HTMLDivElement>(null)
  const tbodyRef = useRef<HTMLTableSectionElement>(null)

  // Runs after every render (no dep array) so it stays live as rows are added/edited/removed.
  // Purely reads layout and calls back up — never touches local state, so it can't loop on itself.
  useLayoutEffect(() => {
    if (!autoSplit || !onMeasureOverflow || !scrollRef.current || !tbodyRef.current) return
    const containerH = scrollRef.current.clientHeight
    const rows = tbodyRef.current.querySelectorAll<HTMLElement>('tr[data-row-i]')
    if (rows.length === 0) return
    let lastFitIdx = -1
    for (const row of rows) {
      const bottom = row.offsetTop + row.offsetHeight
      if (bottom <= containerH) lastFitIdx = Number(row.dataset.rowI)
      else break
    }
    onMeasureOverflow(lastFitIdx, allItems.length)
  })

  // ประมาณจ่าย columns are whatever years actually exist in the item data — admin adds/removes freely.
  const disbYears = Array.from(new Set(allItems.flatMap(it => it.disbursementByYear.map(d => d.year)))).sort((a, b) => a - b)

  function addDisbYear() {
    if (!onChange || yearIdx < 0) return
    const nextYr = disbYears.length ? Math.max(...disbYears) + 1 : activeYear
    const next = [...data]
    next[yearIdx] = {
      ...next[yearIdx],
      items: next[yearIdx].items.map(it => (
        it.disbursementByYear.some(d => d.year === nextYr)
          ? it
          : { ...it, disbursementByYear: [...it.disbursementByYear, { year: nextYr, amount: 0 }] }
      )),
    }
    onChange(next)
  }

  function removeDisbYear(year: number) {
    if (!onChange || yearIdx < 0) return
    const next = [...data]
    next[yearIdx] = {
      ...next[yearIdx],
      items: next[yearIdx].items.map(it => ({ ...it, disbursementByYear: it.disbursementByYear.filter(d => d.year !== year) })),
    }
    onChange(next)
  }

  function addYear(year: number) {
    if (!onChange || data.some(d => d.year === year)) return
    const next = [...data, { year, items: [] }].sort((a, b) => a.year - b.year)
    onChange(next)
    onActiveYearChange(year)
  }

  function removeYear(year: number) {
    if (!onChange) return
    const next = data.filter(d => d.year !== year)
    onChange(next)
    if (activeYear === year) onActiveYearChange(next[0]?.year ?? 0)
  }

  function patchItemYear(itemIdx: number, year: number, amount: number) {
    if (!onChange || yearIdx < 0) return
    const next = [...data]
    const items = [...next[yearIdx].items]
    const item = items[itemIdx]
    const byYear = item.disbursementByYear.some(d => d.year === year)
      ? item.disbursementByYear.map(d => d.year === year ? { ...d, amount } : d)
      : [...item.disbursementByYear, { year, amount }]
    items[itemIdx] = { ...item, disbursementByYear: byYear }
    next[yearIdx] = { ...next[yearIdx], items }
    onChange(next)
  }

  // วงเงิน is entered independently, not qty × unitPrice — the allocated budget can run
  // higher than the raw calculation since they want to spare some as buffer.
  function patchItem(itemIdx: number, patch: Partial<EquipmentItem>) {
    if (!onChange || yearIdx < 0) return
    const next = [...data]
    const items = [...next[yearIdx].items]
    items[itemIdx] = { ...items[itemIdx], ...patch }
    next[yearIdx] = { ...next[yearIdx], items }
    onChange(next)
  }

  function deleteItem(itemIdx: number) {
    if (!onChange || yearIdx < 0) return
    const next = [...data]
    next[yearIdx] = { ...next[yearIdx], items: next[yearIdx].items.filter((_, i) => i !== itemIdx) }
    onChange(next)
  }

  function addItem(group?: string) {
    if (!onChange || yearIdx < 0) return
    const next = [...data]
    const items = next[yearIdx].items
    const newItem: EquipmentItem = {
      no: (items[items.length - 1]?.no ?? 0) + 1,
      description: 'รายการใหม่',
      details: [],
      matNo: '',
      qty: 0,
      unit: 'ชุด',
      unitPrice: 0,
      priceSource: '',
      totalAmount: 0,
      disbursementByYear: [],
      paymentNote: '',
      ...(group ? { group } : {}),
    }
    next[yearIdx] = { ...next[yearIdx], items: [...items, newItem] }
    onChange(next)
  }

  function renameGroup(oldName: string | undefined, newName: string) {
    if (!onChange || yearIdx < 0 || !newName || oldName === newName) return
    const next = [...data]
    next[yearIdx] = { ...next[yearIdx], items: next[yearIdx].items.map(it => it.group === oldName ? { ...it, group: newName } : it) }
    onChange(next)
  }

  function deleteGroup(name: string | undefined) {
    if (!onChange || yearIdx < 0) return
    const next = [...data]
    next[yearIdx] = { ...next[yearIdx], items: next[yearIdx].items.filter(it => it.group !== name) }
    onChange(next)
  }

  // Bucket visible items by group, preserving order of first appearance. Undefined
  // group (main "007" table) is always first so the default single-table look is unchanged.
  const buckets: { name?: string; rows: { item: EquipmentItem; i: number }[] }[] = []
  visibleItems.forEach((item, localI) => {
    const i = (rowStart ?? 0) + localI
    let bucket = buckets.find(b => b.name === item.group)
    if (!bucket) { bucket = { name: item.group, rows: [] }; buckets.push(bucket) }
    bucket.rows.push({ item, i })
  })
  const [newGroupName, setNewGroupName] = useState('')

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-100 flex items-center justify-between flex-wrap gap-3 shrink-0">
        <p className="text-sm font-bold text-gray-700">
          รายการวัสดุอุปกรณ์ (007){isContinuation && <span className="text-gray-400 font-normal"> ({continuationLabel ?? 'ต่อ'})</span>}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-gray-400">หน่วย : ล้านบาท</span>
          {!isContinuation && (
            <div className="flex items-center gap-1 flex-wrap">
              {data.map(d => (
                <span key={d.year} className="inline-flex items-center">
                  <button
                    onClick={() => onActiveYearChange(d.year)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      activeYear === d.year
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    ปี {d.year}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => removeYear(d.year)}
                      className="text-gray-300 hover:text-red-400 px-1"
                      title="ลบปีนี้"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {isAdmin && (
                <select
                  value=""
                  onChange={e => e.target.value && addYear(Number(e.target.value))}
                  className="text-xs border border-dashed border-indigo-300 rounded-lg px-2 py-1 text-indigo-600 bg-transparent"
                >
                  <option value="">+ เพิ่มปี</option>
                  {YEAR_CHOICES.filter(y => !data.some(d => d.year === y)).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto pb-3">
        {yearData && visibleItems.length > 0 ? (
          <>
            <table
              className="w-full text-sm"
              style={{ minWidth: `${520 + disbYears.length * 110}px` }}
            >
              <thead className="sticky top-0 z-10">
                <tr className="bg-white border-b border-gray-100">
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-40">รายการ</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 w-28">
                    <span className="flex justify-end w-full">จำนวน</span>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 w-32">
                    <span className="flex justify-end w-full">วงเงินปี {activeYear}</span>
                  </th>
                  {disbYears.map(y => (
                    <th key={y} className="text-right px-4 py-3 text-xs font-semibold text-gray-400 w-28">
                      <span className="inline-flex items-center gap-1 justify-end w-full">
                        ประมาณจ่าย ปี {y}
                        {isAdmin && (
                          <button
                            onClick={() => removeDisbYear(y)}
                            className="text-gray-300 hover:text-red-400"
                            title="ลบปีนี้"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                  {isAdmin && (
                    <th className="w-10">
                      <button
                        onClick={addDisbYear}
                        className="text-indigo-400 hover:text-indigo-600 font-bold text-sm"
                        title="เพิ่มปีประมาณจ่าย"
                      >
                        +
                      </button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody ref={tbodyRef} className="divide-y divide-gray-50">
                {buckets.map(bucket => (
                  <Fragment key={bucket.name ?? '__main'}>
                    <tr className="bg-gray-50">
                      <td colSpan={isAdmin ? 5 + disbYears.length : 4 + disbYears.length} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {isAdmin ? (
                            <GroupNameEditor name={bucket.name ?? DEFAULT_EQUIPMENT_GROUP} onRename={n => renameGroup(bucket.name, n)} />
                          ) : (
                            <span className="text-xs font-semibold text-gray-500">{bucket.name ?? DEFAULT_EQUIPMENT_GROUP}</span>
                          )}
                          {isAdmin && buckets.length > 1 && (
                            <button
                              onClick={() => deleteGroup(bucket.name)}
                              className="ml-auto text-xs text-gray-300 hover:text-red-400"
                              title="ลบตารางนี้"
                            >
                              ลบตาราง ×
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {bucket.rows.map(({ item, i }) => (
                  <tr key={item.no} data-row-i={i} className={`hover:bg-gray-50/50 ${item.cancelled ? 'opacity-40' : ''}`}>
                    <td className="text-center px-4 py-3 text-gray-400 text-xs align-top">{item.no}</td>

                    <td className="px-4 py-3 align-top">
                      {isAdmin ? (
                        <div className="space-y-1">
                          <input
                            value={item.description}
                            onChange={e => patchItem(i, { description: e.target.value })}
                            className="w-full border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent font-medium text-gray-800"
                          />
                          {item.details.map((d, di) => (
                            <div key={di} className="flex items-center gap-1">
                              <span className="text-gray-300 text-xs shrink-0">–</span>
                              <input
                                value={d}
                                onChange={e => {
                                  const details = [...item.details]
                                  details[di] = e.target.value
                                  patchItem(i, { details })
                                }}
                                className="flex-1 border-b border-gray-100 focus:border-indigo-300 outline-none text-xs py-0.5 bg-transparent text-gray-500"
                              />
                              <button
                                onClick={() => patchItem(i, { details: item.details.filter((_, j) => j !== di) })}
                                className="text-gray-200 hover:text-red-400 text-xs shrink-0"
                              >✕</button>
                            </div>
                          ))}
                          <button
                            onClick={() => patchItem(i, { details: [...item.details, ''] })}
                            className="text-xs text-gray-300 hover:text-indigo-400 mt-1"
                          >+ รายละเอียด</button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-gray-800 font-medium leading-snug">
                            {item.cancelled ? <s>{item.description}</s> : item.description}
                          </p>
                          {item.details.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {item.details.map((d, di) => (
                                <li key={di} className="text-xs text-gray-400 flex gap-1">
                                  <span>–</span>{d}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="text-right px-4 py-3 font-mono text-gray-700 align-top">
                      {isAdmin ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 justify-end">
                            <NumberInput
                              value={item.qty}
                              onChange={v => patchItem(i, { qty: v })}
                              className="w-14 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                            />
                            <input
                              value={item.unit}
                              onChange={e => patchItem(i, { unit: e.target.value })}
                              className="w-12 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-gray-500"
                            />
                          </div>
                          <div className="flex items-center gap-1 justify-end text-gray-400">
                            <span className="text-xs">@</span>
                            <NumberInput
                              value={item.unitPrice}
                              onChange={v => patchItem(i, { unitPrice: v })}
                              className="w-24 border-b border-gray-200 focus:border-indigo-400 outline-none text-xs py-0.5 bg-transparent text-right font-mono"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div>{item.qty.toLocaleString()} {item.unit}</div>
                          <div className="text-gray-400 text-xs">@{fmtNumber(item.unitPrice)}</div>
                        </div>
                      )}
                    </td>

                    <td className="text-right px-4 py-3 font-mono font-semibold text-gray-900 align-top">
                      {item.cancelled ? (
                        <span className="text-gray-300 text-xs">(ยกเลิก)</span>
                      ) : isAdmin ? (
                        <NumberInput
                          value={item.totalAmount}
                          onChange={v => patchItem(i, { totalAmount: v })}
                          className="w-24 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono font-semibold"
                        />
                      ) : fmtMillion(item.totalAmount)}
                    </td>

                    {disbYears.map(y => (
                      <td key={y} className="text-right px-4 py-3 font-mono text-gray-600 align-top">
                        {isAdmin ? (
                          <NumberInput
                            value={disbursementFor(item, y)}
                            onChange={v => patchItemYear(i, y, v)}
                            className="w-24 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                          />
                        ) : fmtMillion(disbursementFor(item, y))}
                      </td>
                    ))}

                    {isAdmin && (
                      <td className="py-3 px-2 align-top">
                        <div className="flex flex-col gap-1.5 items-center">
                          <button
                            onClick={() => patchItem(i, { cancelled: !item.cancelled })}
                            title={item.cancelled ? 'เปิดใช้งาน' : 'ยกเลิกรายการ'}
                            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                              item.cancelled
                                ? 'border-amber-300 text-amber-500 hover:bg-amber-50'
                                : 'border-gray-200 text-gray-300 hover:border-amber-300 hover:text-amber-500'
                            }`}
                          >
                            {item.cancelled ? '↩' : '⊘'}
                          </button>
                          <button
                            onClick={() => deleteItem(i)}
                            className="text-gray-200 hover:text-red-400"
                            title="ลบรายการ"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                    ))}
                    {buckets.length > 1 && isAdmin && rowEnd == null && (
                      <tr>
                        <td colSpan={isAdmin ? 5 + disbYears.length : 4 + disbYears.length} className="px-4 py-2">
                          <button
                            onClick={() => addItem(bucket.name)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
                          >
                            + เพิ่มรายการ
                          </button>
                        </td>
                      </tr>
                    )}
                    {buckets.length > 1 && (
                      <tr className="bg-gray-50/70">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-gray-500">
                          รวมย่อย ({bucket.rows.length} รายการ)
                        </td>
                        <td className="text-right px-4 py-2 font-bold font-mono text-gray-900 text-sm">
                          {fmtMillion(bucket.rows.reduce((s, r) => s + (r.item.cancelled ? 0 : r.item.totalAmount), 0))}
                        </td>
                        {disbYears.map(y => (
                          <td key={y} className="text-right px-4 py-2 font-mono text-gray-500 text-xs">
                            {fmtMillion(bucket.rows.reduce((s, r) => s + (r.item.cancelled ? 0 : disbursementFor(r.item, y)), 0))}
                          </td>
                        ))}
                        {isAdmin && <td />}
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">
                    {isContinuation || rowEnd != null ? 'รวมย่อย' : 'รวมทั้งสิ้น'} ({visibleItems.length} รายการ)
                  </td>
                  <td className="text-right px-4 py-3 font-bold font-mono text-gray-900">{fmtMillion(total)}</td>
                  {disbYears.map(y => (
                    <td key={y} className="text-right px-4 py-3 font-bold font-mono text-gray-900">{fmtMillion(totalDisbursement(y))}</td>
                  ))}
                  {isAdmin && <td />}
                </tr>
              </tfoot>
            </table>

            {isAdmin && rowEnd == null && (
              <div className="px-4 py-3 border-t border-gray-50 flex items-center gap-3 flex-wrap">
                {buckets.length === 1 && (
                  <button
                    onClick={() => addItem()}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    + เพิ่มรายการ
                  </button>
                )}
                <div className="flex items-center gap-1.5">
                  <input
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="ชื่อตารางใหม่ เช่น ค่าใช้จ่ายหน้างาน/ค่าจ้าง"
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-64 outline-none focus:border-indigo-400"
                  />
                  <button
                    onClick={() => { if (newGroupName.trim()) { addItem(newGroupName.trim()); setNewGroupName('') } }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
                  >
                    + ตารางย่อยใหม่
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <p className="text-gray-300 text-sm">
              {!yearData ? 'ยังไม่มีปี — เพิ่มปีก่อนเพื่อเริ่มรายการ' : allItems.length === 0 ? `ไม่มีรายการสำหรับปี ${activeYear}` : 'ไม่มีรายการในช่วงนี้'}
            </p>
            {isAdmin && yearData && rowEnd == null && (
              <button
                onClick={() => addItem()}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
              >
                + เพิ่มรายการ
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupNameEditor({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim()) onRename(draft.trim()); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { if (draft.trim()) onRename(draft.trim()); setEditing(false) }
          if (e.key === 'Escape') { setDraft(name); setEditing(false) }
        }}
        className="text-xs font-semibold text-gray-700 border-b border-indigo-300 outline-none bg-transparent"
      />
    )
  }
  return (
    <span
      onClick={() => { setDraft(name); setEditing(true) }}
      className="text-xs font-semibold text-gray-500 cursor-text hover:text-indigo-600"
      title="คลิกเพื่อแก้ไขชื่อตาราง"
    >
      {name}
    </span>
  )
}
