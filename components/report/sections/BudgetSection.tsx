'use client'

import type { BudgetData, BudgetCategory } from '@/lib/reportTypes'
import { fmtMillion, YEAR_CHOICES } from '@/lib/reportTypes'
import NumberInput from '@/components/report/NumberInput'

interface Props {
  data: BudgetData
  fiscalYear: number
  isAdmin: boolean
  onChange?: (data: BudgetData) => void
  onFiscalYearChange?: (year: number) => void
}

export default function BudgetSection({ data, fiscalYear, isAdmin, onChange, onFiscalYearChange }: Props) {
  const totalYear = data.categories.reduce((s, c) => s + c.yearAmount, 0) + data.reserve
  const years = Array.from(
    new Set([
      ...data.categories.flatMap(c => c.disbursementByYear.map(d => d.year)),
      ...data.reserveByYear.map(d => d.year),
    ])
  ).sort((a, b) => a - b)

  function addYear() {
    if (!onChange) return
    const nextYear = years.length ? Math.max(...years) + 1 : fiscalYear + 1
    onChange({
      ...data,
      categories: data.categories.map(c => (
        c.disbursementByYear.some(d => d.year === nextYear)
          ? c
          : { ...c, disbursementByYear: [...c.disbursementByYear, { year: nextYear, amount: 0 }] }
      )),
      reserveByYear: data.reserveByYear.some(d => d.year === nextYear)
        ? data.reserveByYear
        : [...data.reserveByYear, { year: nextYear, amount: 0 }],
    })
  }

  function removeYear(year: number) {
    if (!onChange) return
    onChange({
      ...data,
      categories: data.categories.map(c => ({
        ...c,
        disbursementByYear: c.disbursementByYear.filter(d => d.year !== year),
      })),
      reserveByYear: data.reserveByYear.filter(d => d.year !== year),
    })
  }

  function patchCategory(idx: number, patch: Partial<BudgetCategory>) {
    if (!onChange) return
    const next = [...data.categories]
    next[idx] = { ...next[idx], ...patch }
    onChange({ ...data, categories: next })
  }

  function patchCategoryYear(catIdx: number, year: number, amount: number) {
    if (!onChange) return
    const next = [...data.categories]
    const byYear = next[catIdx].disbursementByYear.map(d => d.year === year ? { ...d, amount } : d)
    next[catIdx] = { ...next[catIdx], disbursementByYear: byYear }
    onChange({ ...data, categories: next })
  }

  function patchReserveYear(year: number, amount: number) {
    if (!onChange) return
    const byYear = data.reserveByYear.map(d => d.year === year ? { ...d, amount } : d)
    onChange({ ...data, reserveByYear: byYear })
  }

  function deleteCategory(idx: number) {
    if (!onChange) return
    onChange({ ...data, categories: data.categories.filter((_, i) => i !== idx) })
  }

  function addCategory() {
    if (!onChange) return
    const newCat: BudgetCategory = {
      หมวด: data.categories.length + 1,
      name: 'หมวดใหม่',
      formRef: '',
      yearAmount: 0,
      disbursementByYear: years.map(y => ({ year: y, amount: 0 })),
    }
    onChange({ ...data, categories: [...data.categories, newCat] })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-100 shrink-0 flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700">
          งบประมาณที่ขอตั้งปี {fiscalYear} (004/4)
        </p>
        <span className="text-[10px] text-gray-400">หน่วย : ล้านบาท</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto pb-3">
          <table className="w-full min-w-[580px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 w-64">หมวด / รายการ</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 w-36">
                  {isAdmin && onFiscalYearChange ? (
                    <span className="inline-flex items-center gap-1 justify-end w-full">
                      วงเงิน
                      <select
                        value={fiscalYear}
                        onChange={e => onFiscalYearChange(Number(e.target.value))}
                        className="border-b border-gray-300 focus:border-indigo-400 outline-none text-xs font-semibold text-right bg-transparent"
                      >
                        {(YEAR_CHOICES.includes(fiscalYear) ? YEAR_CHOICES : [fiscalYear, ...YEAR_CHOICES]).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </span>
                  ) : `วงเงิน ${fiscalYear}`}
                </th>
                {years.map(y => (
                  <th key={y} className="text-right px-4 py-3 text-xs font-semibold text-gray-500 w-36">
                    <span className="inline-flex items-center gap-1.5">
                      เบิกจ่าย {y}
                      {isAdmin && (
                        <button
                          onClick={() => removeYear(y)}
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
                  <th className="w-8">
                    <button
                      onClick={addYear}
                      className="text-indigo-400 hover:text-indigo-600 font-bold text-sm"
                      title="เพิ่มปีเบิกจ่าย"
                    >
                      +
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
                {data.categories.map((cat, i) => (
                  <tr key={i} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-gray-700 align-top">
                      {isAdmin ? (
                        <textarea
                          value={cat.name}
                          onChange={e => patchCategory(i, { name: e.target.value })}
                          rows={2}
                          className="w-full border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent resize-none leading-snug"
                        />
                      ) : <span className="whitespace-pre-wrap">{cat.name}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900 align-top">
                      {isAdmin ? (
                        <NumberInput
                          value={cat.yearAmount}
                          onChange={v => patchCategory(i, { yearAmount: v })}
                          className="w-32 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                        />
                      ) : fmtMillion(cat.yearAmount)}
                    </td>
                    {years.map(y => {
                      const entry = cat.disbursementByYear.find(d => d.year === y)
                      return (
                        <td key={y} className="px-4 py-3 text-right font-mono text-gray-600 align-top">
                          {isAdmin ? (
                            <NumberInput
                              value={entry?.amount ?? 0}
                              onChange={v => patchCategoryYear(i, y, v)}
                              className="w-32 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                            />
                          ) : fmtMillion(entry?.amount ?? 0)}
                        </td>
                      )
                    })}
                    {isAdmin && (
                      <td className="py-3 px-2 align-top">
                        <button
                          onClick={() => deleteCategory(i)}
                          className="text-gray-300 hover:text-red-400 p-1"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {/* Reserve row — always shown in admin, only when > 0 in read mode */}
                {(isAdmin || data.reserve > 0) && (
                  <tr className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-gray-700">สำรองค่าปรับราคา</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-900">
                      {isAdmin ? (
                        <NumberInput
                          value={data.reserve}
                          onChange={v => onChange?.({ ...data, reserve: v })}
                          className="w-32 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                        />
                      ) : fmtMillion(data.reserve)}
                    </td>
                    {years.map(y => {
                      const entry = data.reserveByYear.find(d => d.year === y)
                      return (
                        <td key={y} className="px-4 py-3 text-right font-mono text-gray-600">
                          {isAdmin ? (
                            <NumberInput
                              value={entry?.amount ?? 0}
                              onChange={v => patchReserveYear(y, v)}
                              className="w-32 border-b border-gray-200 focus:border-indigo-400 outline-none text-sm py-0.5 bg-transparent text-right font-mono"
                            />
                          ) : fmtMillion(entry?.amount ?? 0)}
                        </td>
                      )
                    })}
                    {isAdmin && <td />}
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-6 py-3 font-semibold text-gray-900">รวมทั้งสิ้น</td>
                  <td className="px-4 py-3 text-right font-semibold font-mono text-gray-900">{fmtMillion(totalYear)}</td>
                  {years.map(y => {
                    const total = data.categories.reduce((s, c) => {
                      const e = c.disbursementByYear.find(d => d.year === y)
                      return s + (e?.amount ?? 0)
                    }, 0) + (data.reserveByYear.find(d => d.year === y)?.amount ?? 0)
                    return (
                      <td key={y} className="px-4 py-3 text-right font-semibold font-mono text-gray-900">
                        {fmtMillion(total)}
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
                onClick={addCategory}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-dashed border-indigo-300 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
              >
                + เพิ่มหมวด
              </button>
            </div>
          )}
      </div>
    </div>
  )
}
