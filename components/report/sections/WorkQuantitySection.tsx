'use client'

import type { WorkQuantityData, WorkQuantityItem } from '@/lib/reportTypes'
import NumberInput from '@/components/report/NumberInput'

interface Props {
  data: WorkQuantityData
  startYear: number
  endYear: number
  isAdmin: boolean
  onChange?: (data: WorkQuantityData) => void
}

function fmtQty(v: number): string {
  return v ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '–'
}

// Adds/updates a {year,amount} entry — upsert instead of a plain .map() so a year that only
// exists via the project's default start–end range (not yet in this row's own array) still
// gets created on first edit, rather than silently no-op'ing.
function upsertYear(list: { year: number; amount: number }[], year: number, amount: number) {
  return list.some(e => e.year === year)
    ? list.map(e => e.year === year ? { ...e, amount } : e)
    : [...list, { year, amount }].sort((a, b) => a.year - b.year)
}

export default function WorkQuantitySection({ data, startYear, endYear, isAdmin, onChange }: Props) {
  // Defaults to the project's own start–end range so year columns show up immediately, even
  // before any item has data — plus any extra years already present in the data (never dropped).
  const projectYears = Array.from({ length: Math.max(0, endYear - startYear + 1) }, (_, i) => startYear + i)
  const dataYears = [
    ...data.items.flatMap(it => it.byYear.map(y => y.year)),
    ...data.progressByYear.map(y => y.year),
  ]
  const years = Array.from(new Set([...projectYears, ...dataYears])).sort((a, b) => a - b)

  function addYear() {
    if (!onChange) return
    const nextYear = years.length ? Math.max(...years) + 1 : startYear
    // Touching progressByYear alone is enough — years[] is derived, so any array containing
    // the new year makes its column appear; every item cell then falls back to 0 until edited.
    onChange({ ...data, progressByYear: upsertYear(data.progressByYear, nextYear, 0) })
  }

  function removeYear(year: number) {
    if (!onChange) return
    onChange({
      items: data.items.map(it => ({ ...it, byYear: it.byYear.filter(y => y.year !== year) })),
      progressByYear: data.progressByYear.filter(y => y.year !== year),
    })
  }

  function patchItem(idx: number, patch: Partial<WorkQuantityItem>) {
    if (!onChange) return
    const next = [...data.items]
    next[idx] = { ...next[idx], ...patch }
    onChange({ ...data, items: next })
  }

  function patchItemYear(idx: number, year: number, amount: number) {
    if (!onChange) return
    const next = [...data.items]
    next[idx] = { ...next[idx], byYear: upsertYear(next[idx].byYear, year, amount) }
    onChange({ ...data, items: next })
  }

  function patchProgressYear(year: number, amount: number) {
    if (!onChange) return
    onChange({ ...data, progressByYear: upsertYear(data.progressByYear, year, amount) })
  }

  function deleteItem(idx: number) {
    if (!onChange) return
    onChange({ ...data, items: data.items.filter((_, i) => i !== idx) })
  }

  function addItem() {
    if (!onChange) return
    const newItem: WorkQuantityItem = {
      no: data.items.length + 1,
      name: 'งานใหม่',
      unit: '',
      totalQuantity: 0,
      byYear: years.map(y => ({ year: y, amount: 0 })),
    }
    onChange({ ...data, items: [...data.items, newItem] })
  }

  const colCount = 3 + years.length + (isAdmin ? 1 : 0)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-100 shrink-0 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700">ปริมาณงาน</p>
        <span className="text-[10px] text-gray-400">ปริมาณงานทั้งหมด และดำเนินการแล้วรายปี (ไม่ใช่หน่วยเงิน)</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto pb-3">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 w-64">งาน/กิจกรรมหลัก</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-24">หน่วยนับ</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 w-32">ปริมาณงานทั้งหมด</th>
              {years.map(y => (
                <th key={y} className="text-right px-4 py-3 text-xs font-semibold text-gray-500 w-32">
                  <span className="inline-flex items-center gap-1.5">
                    ทำได้ปี {y}
                    {isAdmin && !projectYears.includes(y) && (
                      <button onClick={() => removeYear(y)} className="text-gray-300 hover:text-red-400" title="ลบปีนี้ (นอกช่วงโครงการ)">×</button>
                    )}
                  </span>
                </th>
              ))}
              {isAdmin && (
                <th className="w-8">
                  <button onClick={addYear} className="text-indigo-400 hover:text-indigo-600 font-bold text-sm" title="เพิ่มปี">+</button>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.items.map((it, i) => (
              <tr key={i} className="hover:bg-gray-50/50">
                <td className="px-6 py-3 text-gray-700 align-top">
                  {isAdmin ? (
                    <textarea
                      value={it.name}
                      onChange={e => patchItem(i, { name: e.target.value })}
                      rows={2}
                      className="w-full border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent resize-none leading-snug"
                    />
                  ) : <span className="whitespace-pre-wrap">{it.name}</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 align-top">
                  {isAdmin ? (
                    <input
                      value={it.unit}
                      onChange={e => patchItem(i, { unit: e.target.value })}
                      className="w-full border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent"
                    />
                  ) : (it.unit || '—')}
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-900 align-top">
                  {isAdmin ? (
                    <NumberInput
                      value={it.totalQuantity}
                      onChange={v => patchItem(i, { totalQuantity: v })}
                      className="w-28 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                    />
                  ) : fmtQty(it.totalQuantity)}
                </td>
                {years.map(y => {
                  const entry = it.byYear.find(e => e.year === y)
                  return (
                    <td key={y} className="px-4 py-3 text-right font-mono text-gray-600 align-top">
                      {isAdmin ? (
                        <NumberInput
                          value={entry?.amount ?? 0}
                          onChange={v => patchItemYear(i, y, v)}
                          className="w-28 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                        />
                      ) : fmtQty(entry?.amount ?? 0)}
                    </td>
                  )
                })}
                {isAdmin && (
                  <td className="py-3 px-2 align-top">
                    <button onClick={() => deleteItem(i)} className="text-gray-300 hover:text-red-400 p-1">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-6 py-6 text-center text-sm text-gray-300">ยังไม่มีรายการ</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td colSpan={3} className="px-6 py-3 font-semibold text-gray-900">ความคืบหน้า %</td>
              {years.map(y => {
                const entry = data.progressByYear.find(e => e.year === y)
                return (
                  <td key={y} className="px-4 py-3 text-right font-semibold font-mono text-gray-900">
                    {isAdmin ? (
                      <NumberInput
                        value={entry?.amount ?? 0}
                        onChange={v => patchProgressYear(y, v)}
                        className="w-28 border-b border-gray-300 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono font-semibold"
                      />
                    ) : fmtQty(entry?.amount ?? 0)}
                  </td>
                )
              })}
              {isAdmin && <td />}
            </tr>
          </tfoot>
        </table>
        {isAdmin && (
          <div className="px-6 py-3 border-t border-gray-50">
            <button
              onClick={addItem}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
            >
              + เพิ่มงาน
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
