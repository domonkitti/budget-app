'use client'

import { Fragment, useState, type DragEvent } from 'react'
import type { HistoryData, HistoryGroup } from '@/lib/reportTypes'
import { fmtMillion, HISTORY_GROUP_NAMES, HISTORY_ROW_NAMES } from '@/lib/reportTypes'
import NumberInput from '@/components/report/NumberInput'
import { api } from '@/lib/api'
import type { Project } from '@/lib/types'

interface Props {
  data: HistoryData
  fiscalYear: number
  isAdmin: boolean
  onChange?: (data: HistoryData) => void
}

const CELL = 'border border-gray-300 px-3 py-1.5'
// First column stays put while the table scrolls horizontally — needs its own background
// (matching whatever row it's in) so scrolled-under cells don't show through.
const FIRST_CELL = `${CELL} sticky left-0 bg-white`

// Fixed palette rather than a free color picker — keeps the "box off a cluster of cells" look
// consistent instead of every report ending up with its own random shade.
const HIGHLIGHT_COLORS = [
  { key: 'yellow', swatch: 'bg-amber-300', cell: 'bg-amber-100' },
  { key: 'purple', swatch: 'bg-purple-300', cell: 'bg-purple-100' },
  { key: 'green', swatch: 'bg-emerald-300', cell: 'bg-emerald-100' },
  { key: 'blue', swatch: 'bg-sky-300', cell: 'bg-sky-100' },
  { key: 'pink', swatch: 'bg-pink-300', cell: 'bg-pink-100' },
]

function cellBg(color?: string) {
  return HIGHLIGHT_COLORS.find(c => c.key === color)?.cell ?? ''
}

export default function HistorySection({ data, fiscalYear, isAdmin, onChange }: Props) {
  const [showImport, setShowImport] = useState(false)
  const [pickerFor, setPickerFor] = useState<{ gi: number; ri: number; year: number } | null>(null)
  const years = Array.from(
    new Set(data.groups.flatMap(g => g.rows.flatMap(r => r.amounts.map(a => a.year))))
  ).sort((a, b) => a - b)

  function addYear() {
    if (!onChange) return
    const nextYear = years.length ? Math.max(...years) + 1 : fiscalYear + 1
    onChange({
      groups: data.groups.map(g => ({
        ...g,
        rows: g.rows.map(r => (
          r.amounts.some(a => a.year === nextYear) ? r : { ...r, amounts: [...r.amounts, { year: nextYear, amount: 0 }] }
        )),
      })),
    })
  }

  function removeYear(year: number) {
    if (!onChange) return
    onChange({
      groups: data.groups.map(g => ({
        ...g,
        rows: g.rows.map(r => ({ ...r, amounts: r.amounts.filter(a => a.year !== year) })),
      })),
    })
  }

  function addRow(groupIdx: number) {
    if (!onChange) return
    const next = [...data.groups]
    next[groupIdx] = {
      ...next[groupIdx],
      rows: [...next[groupIdx].rows, { name: 'รายการใหม่', amounts: years.map(y => ({ year: y, amount: 0 })) }],
    }
    onChange({ groups: next })
  }

  function removeRow(groupIdx: number, rowIdx: number) {
    if (!onChange) return
    const next = [...data.groups]
    next[groupIdx] = { ...next[groupIdx], rows: next[groupIdx].rows.filter((_, i) => i !== rowIdx) }
    onChange({ groups: next })
  }

  function moveRow(groupIdx: number, fromIdx: number, toIdx: number) {
    if (!onChange || fromIdx === toIdx) return
    const next = [...data.groups]
    const rows = [...next[groupIdx].rows]
    const [moved] = rows.splice(fromIdx, 1)
    rows.splice(toIdx, 0, moved)
    next[groupIdx] = { ...next[groupIdx], rows }
    onChange({ groups: next })
  }

  // Rows only reorder within their own group — dragging one across a group boundary is a no-op,
  // since the group split (วงเงินดำเนินการ/เป้าหมายการเบิกจ่าย/คงเหลือ) is structural.
  function handleRowDragStart(e: DragEvent, groupIdx: number, rowIdx: number) {
    e.dataTransfer.setData('text/plain', `${groupIdx}:${rowIdx}`)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleRowDrop(e: DragEvent, groupIdx: number, rowIdx: number) {
    e.preventDefault()
    const [fromGroup, fromRow] = e.dataTransfer.getData('text/plain').split(':').map(Number)
    if (fromGroup !== groupIdx || Number.isNaN(fromRow)) return
    moveRow(groupIdx, fromRow, rowIdx)
  }

  function patchRowName(groupIdx: number, rowIdx: number, name: string) {
    if (!onChange) return
    const next = [...data.groups]
    const rows = [...next[groupIdx].rows]
    rows[rowIdx] = { ...rows[rowIdx], name }
    next[groupIdx] = { ...next[groupIdx], rows }
    onChange({ groups: next })
  }

  function patchRowAmount(groupIdx: number, rowIdx: number, year: number, amount: number) {
    if (!onChange) return
    const next = [...data.groups]
    const rows = [...next[groupIdx].rows]
    rows[rowIdx] = { ...rows[rowIdx], amounts: rows[rowIdx].amounts.map(a => a.year === year ? { ...a, amount } : a) }
    next[groupIdx] = { ...next[groupIdx], rows }
    onChange({ groups: next })
  }

  function setCellColor(groupIdx: number, rowIdx: number, year: number, color: string | undefined) {
    if (!onChange) return
    const next = [...data.groups]
    const rows = [...next[groupIdx].rows]
    rows[rowIdx] = { ...rows[rowIdx], amounts: rows[rowIdx].amounts.map(a => a.year === year ? { ...a, color } : a) }
    next[groupIdx] = { ...next[groupIdx], rows }
    onChange({ groups: next })
    setPickerFor(null)
  }

  function groupTotal(group: HistoryGroup, year: number): number {
    return group.rows.reduce((s, r) => s + (r.amounts.find(a => a.year === year)?.amount ?? 0), 0)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-100 shrink-0 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-700">ข้อมูลย้อนหลัง</p>
        <div className="flex items-center gap-3">
          {isAdmin && onChange && (
            <button
              onClick={() => setShowImport(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1.5"
            >
              นำเข้าข้อมูลย้อนหลัง
            </button>
          )}
          <span className="text-[10px] text-gray-400 shrink-0">หน่วย : ล้านบาท</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        <table className="border-collapse text-sm min-w-[480px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${FIRST_CELL} z-20 text-left font-semibold text-gray-700 w-56`} />
              {years.map(y => (
                <th key={y} className={`${CELL} text-right font-semibold text-gray-700 bg-white w-32`}>
                  <span className="inline-flex items-center gap-1.5 justify-end w-full">
                    ปี {y}
                    {isAdmin && onChange && (
                      <button onClick={() => removeYear(y)} className="text-gray-300 hover:text-red-400 font-normal" title="ลบปีนี้">×</button>
                    )}
                  </span>
                </th>
              ))}
              {isAdmin && onChange && (
                <th className="w-8 border-0">
                  <button onClick={addYear} className="text-indigo-400 hover:text-indigo-600 font-bold text-sm" title="เพิ่มปี">+</button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.groups.map((group, gi) => (
              <Fragment key={group.name}>
                <tr>
                  <td className={`${FIRST_CELL} z-10 font-semibold text-teal-700 underline decoration-teal-300`}>
                    {group.name}
                  </td>
                  {years.map(y => <td key={y} className={CELL} />)}
                  {isAdmin && onChange && <td className="border-0" />}
                </tr>
                {group.rows.map((row, ri) => (
                  <tr
                    key={`${group.name}-${ri}`}
                    onDragOver={isAdmin && onChange ? e => e.preventDefault() : undefined}
                    onDrop={isAdmin && onChange ? e => handleRowDrop(e, gi, ri) : undefined}
                  >
                    <td className={`${FIRST_CELL} z-10 text-gray-700`}>
                      <div className="flex items-center gap-1.5">
                        {isAdmin && onChange && (
                          <span
                            draggable
                            onDragStart={e => handleRowDragStart(e, gi, ri)}
                            className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 shrink-0 select-none"
                            title="ลากเพื่อย้ายลำดับ"
                          >
                            ⠿
                          </span>
                        )}
                        {isAdmin && onChange ? (
                          <input
                            value={row.name}
                            onChange={e => patchRowName(gi, ri, e.target.value)}
                            className="w-full outline-none text-sm bg-transparent"
                          />
                        ) : row.name}
                      </div>
                    </td>
                    {years.map(y => {
                      const entry = row.amounts.find(a => a.year === y)
                      const isPicking = isAdmin && !!onChange && pickerFor?.gi === gi && pickerFor.ri === ri && pickerFor.year === y
                      return (
                        <td
                          key={y}
                          className={`${CELL} relative text-right font-mono text-gray-700 ${cellBg(entry?.color)}`}
                          onContextMenu={isAdmin && onChange ? e => { e.preventDefault(); setPickerFor({ gi, ri, year: y }) } : undefined}
                          title={isAdmin && onChange ? 'คลิกขวาเพื่อไฮไลต์' : undefined}
                        >
                          {isAdmin && onChange ? (
                            <NumberInput
                              value={entry?.amount ?? 0}
                              onChange={v => patchRowAmount(gi, ri, y, v)}
                              className="w-full outline-none text-sm bg-transparent text-right font-mono"
                            />
                          ) : fmtMillion(entry?.amount ?? 0)}
                          {isPicking && (
                            <div className="absolute z-30 top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex items-center gap-1 whitespace-nowrap">
                              {HIGHLIGHT_COLORS.map(c => (
                                <button
                                  key={c.key}
                                  onClick={() => setCellColor(gi, ri, y, c.key)}
                                  className={`w-5 h-5 rounded ${c.swatch} hover:ring-2 hover:ring-gray-400`}
                                  title={c.key}
                                />
                              ))}
                              <button
                                onClick={() => setCellColor(gi, ri, y, undefined)}
                                className="text-[10px] text-gray-400 hover:text-red-500 px-1"
                                title="ล้างสี"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </td>
                      )
                    })}
                    {isAdmin && onChange && (
                      <td className="border-0 px-1">
                        <button onClick={() => removeRow(gi, ri)} className="text-gray-300 hover:text-red-400 p-1">
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                <tr>
                  <td className={`${FIRST_CELL} z-10 font-semibold text-gray-900`}>รวม(ผูกพัน+ลงทุน)</td>
                  {years.map(y => (
                    <td key={y} className={`${CELL} text-right font-semibold font-mono text-gray-900`}>
                      {fmtMillion(groupTotal(group, y))}
                    </td>
                  ))}
                  {isAdmin && onChange && <td className="border-0" />}
                </tr>
                {isAdmin && onChange && (
                  <tr>
                    <td colSpan={years.length + 2} className="border-0 pt-1.5 pb-2.5">
                      <button
                        onClick={() => addRow(gi)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-dashed border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1 transition-colors"
                      >
                        + เพิ่มรายการ
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {pickerFor && <div className="fixed inset-0 z-20" onClick={() => setPickerFor(null)} />}

      {showImport && onChange && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={imported => { onChange(imported); setShowImport(false) }}
        />
      )}
    </div>
  )
}

// Pulls a raw one-time snapshot of ผูกพัน/ลงทุน budget/target/remain per year for a manually
// chosen project — not bound afterward. Only the top-level amounts come from the DB; anything
// extra (ลงทุน (เพิ่มเติม), ยกเลิกไม่ผูกพัน, คงเหลือผูกพันไป, ...) is added by hand via + เพิ่มรายการ,
// since tracing which original budget year a ผูกพัน carry-forward came from isn't solved yet.
function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (data: HistoryData) => void }) {
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function search() {
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const all = await api.projects()
      const q = query.trim().toLowerCase()
      setProjects(q ? all.filter(p => p.name.toLowerCase().includes(q) || p.project_code.toLowerCase().includes(q)) : all)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function pick(project: Project) {
    setImporting(true)
    setError(null)
    try {
      const detail = await api.projectDetail(project.project_code)
      type Agg = { budget: number; target: number; remain: number }
      const byYearFund = new Map<string, Agg>()
      for (const bs of detail.budget_sources) {
        const key = `${bs.data_year}|${bs.fund_type}`
        const cur = byYearFund.get(key) ?? { budget: 0, target: 0, remain: 0 }
        cur.budget += bs.budget
        cur.target += bs.target
        cur.remain += bs.remain
        byYearFund.set(key, cur)
      }
      const years = Array.from(new Set(detail.budget_sources.map(bs => bs.data_year))).sort((a, b) => a - b)
      // Only ผูกพัน/ลงทุน come straight from the DB — the rest of the default row set
      // (ลงทุน (เพิ่มเติม), ยกเลิกไม่ผูกพัน, คงเหลือผูกพันไป, ...) starts blank for manual entry.
      const rowsFor = (groupName: string, metric: keyof Agg) => (HISTORY_ROW_NAMES[groupName] ?? []).map(rowName => ({
        name: rowName,
        amounts: years.map(y => ({ year: y, amount: byYearFund.get(`${y}|${rowName}`)?.[metric] ?? 0 })),
      }))
      onImport({
        groups: HISTORY_GROUP_NAMES.map((name, i) => ({
          name,
          rows: rowsFor(name, (['budget', 'target', 'remain'] as const)[i]),
        })),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">นำเข้าข้อมูลย้อนหลัง</p>
          <p className="text-xs text-gray-400 mt-1">
            เลือกโครงการเพื่อดึงยอดผูกพัน/ลงทุน (วงเงิน/เป้าหมายเบิกจ่าย/คงเหลือ) รายปีมาเติมในตาราง —
            ดึงมา ณ ตอนนี้ครั้งเดียว ไม่ผูกอัตโนมัติ และจะแทนที่ข้อมูลในตารางเดิมทั้งหมด
          </p>
        </div>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') search() }}
            placeholder="ค้นหาชื่อหรือรหัสโครงการ..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={search}
            disabled={loading}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-60"
          >
            {loading ? '...' : 'ค้นหา'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {error && <p className="text-sm text-red-500 px-3 py-2">{error}</p>}
          {searched && !loading && projects.length === 0 && !error && (
            <p className="text-sm text-gray-400 px-3 py-2">ไม่พบโครงการ</p>
          )}
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => pick(p)}
              disabled={importing}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-50 disabled:opacity-60"
            >
              <div className="text-sm text-gray-800">{p.name}</div>
              <div className="text-xs text-gray-400">{p.project_code} · ปี {p.year}</div>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  )
}
