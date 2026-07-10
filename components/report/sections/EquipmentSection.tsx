'use client'

import type { EquipmentYear, EquipmentItem } from '@/lib/reportTypes'
import { fmtNumber, fmtMillion, YEAR_CHOICES } from '@/lib/reportTypes'

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
}

export default function EquipmentSection({ data, isAdmin, onChange, activeYear, onActiveYearChange, rowStart, rowEnd, isContinuation }: Props) {
  const yearIdx = data.findIndex(d => d.year === activeYear)
  const yearData = data[yearIdx]
  const allItems = yearData?.items ?? []
  const visibleItems = rowStart != null || rowEnd != null ? allItems.slice(rowStart ?? 0, rowEnd ?? allItems.length) : allItems
  const total = visibleItems.reduce((s, item) => s + (item.cancelled ? 0 : item.totalAmount), 0)

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

  function patchItem(itemIdx: number, patch: Partial<EquipmentItem>) {
    if (!onChange || yearIdx < 0) return
    const next = [...data]
    const items = [...next[yearIdx].items]
    const updated = { ...items[itemIdx], ...patch }
    if ('qty' in patch || 'unitPrice' in patch) {
      updated.totalAmount = updated.qty * updated.unitPrice
    }
    items[itemIdx] = updated
    next[yearIdx] = { ...next[yearIdx], items }
    onChange(next)
  }

  function deleteItem(itemIdx: number) {
    if (!onChange || yearIdx < 0) return
    const next = [...data]
    next[yearIdx] = { ...next[yearIdx], items: next[yearIdx].items.filter((_, i) => i !== itemIdx) }
    onChange(next)
  }

  function addItem() {
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
    }
    next[yearIdx] = { ...next[yearIdx], items: [...items, newItem] }
    onChange(next)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3 shrink-0">
        <p className="text-sm font-bold text-gray-700">
          รายการวัสดุอุปกรณ์ (007){isContinuation && <span className="text-gray-400 font-normal"> (ต่อ)</span>}
        </p>
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

      <div className="flex-1 min-h-0 overflow-auto pb-3">
        {yearData && visibleItems.length > 0 ? (
          <>
            <table className="w-full min-w-[700px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white border-b border-gray-100">
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 w-10">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">รายการ</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 w-20">จำนวน</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-16">หน่วย</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 w-32">ราคา/หน่วย</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 w-32">รวม</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-36">แหล่งราคา</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 w-32">กำหนดจ่าย</th>
                  {isAdmin && <th className="w-10" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleItems.map((item, localI) => {
                  const i = (rowStart ?? 0) + localI
                  return (
                  <tr key={item.no} className={`hover:bg-gray-50/50 ${item.cancelled ? 'opacity-40' : ''}`}>
                    <td className="text-center px-4 py-3 text-gray-400 text-xs">{item.no}</td>

                    <td className="px-4 py-3">
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

                    <td className="text-center px-4 py-3 font-mono text-gray-700">
                      {isAdmin ? (
                        <input
                          type="number"
                          value={item.qty || ''}
                          onChange={e => patchItem(i, { qty: Number(e.target.value) || 0 })}
                          className="w-16 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-center font-mono"
                        />
                      ) : item.qty.toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-gray-500">
                      {isAdmin ? (
                        <input
                          value={item.unit}
                          onChange={e => patchItem(i, { unit: e.target.value })}
                          className="w-14 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent"
                        />
                      ) : item.unit}
                    </td>

                    <td className="text-right px-4 py-3 font-mono text-gray-700">
                      {isAdmin ? (
                        <input
                          type="number"
                          value={item.unitPrice || ''}
                          onChange={e => patchItem(i, { unitPrice: Number(e.target.value) || 0 })}
                          className="w-28 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                        />
                      ) : fmtNumber(item.unitPrice)}
                    </td>

                    <td className="text-right px-4 py-3 font-mono font-semibold text-gray-900">
                      {item.cancelled
                        ? <span className="text-gray-300 text-xs">(ยกเลิก)</span>
                        : fmtMillion(item.totalAmount)}
                    </td>

                    <td className="px-4 py-3 text-xs text-gray-400 leading-relaxed">
                      {isAdmin ? (
                        <input
                          value={item.priceSource}
                          onChange={e => patchItem(i, { priceSource: e.target.value })}
                          className="w-full border-b border-gray-200 focus:border-indigo-400 outline-none text-xs py-0.5 bg-transparent"
                        />
                      ) : item.priceSource}
                    </td>

                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <input
                          value={item.paymentNote}
                          onChange={e => patchItem(i, { paymentNote: e.target.value })}
                          className="w-full border-b border-indigo-200 focus:border-indigo-400 outline-none text-xs py-0.5 bg-transparent text-indigo-600"
                        />
                      ) : (
                        <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                          {item.paymentNote}
                        </span>
                      )}
                    </td>

                    {isAdmin && (
                      <td className="py-3 px-2">
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
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold text-gray-500">
                    {isContinuation || rowEnd != null ? 'รวมย่อย' : 'รวมทั้งสิ้น'}
                  </td>
                  <td className="text-right px-4 py-3 font-bold font-mono text-gray-900">{fmtMillion(total)}</td>
                  <td colSpan={isAdmin ? 3 : 2} className="px-4 py-3 text-xs text-gray-400">{visibleItems.length} รายการ</td>
                </tr>
              </tfoot>
            </table>

            {isAdmin && rowEnd == null && (
              <div className="px-4 py-3 border-t border-gray-50">
                <button
                  onClick={addItem}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                  + เพิ่มรายการ
                </button>
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
                onClick={addItem}
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
