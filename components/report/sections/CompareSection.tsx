'use client'

import { useState } from 'react'
import type { CompareTableData } from '@/lib/reportTypes'
import { fmtMillion, COMPARE_METRICS } from '@/lib/reportTypes'
import NumberInput from '@/components/report/NumberInput'
import { api } from '@/lib/api'
import type { Project } from '@/lib/types'

interface Props {
  data: CompareTableData
  isAdmin: boolean
  onChange?: (data: CompareTableData) => void
}

const CELL = 'border border-gray-300 px-3 py-1.5'
const FIRST_CELL = `${CELL} sticky left-0 bg-white`

export default function CompareSection({ data, isAdmin, onChange }: Props) {
  const [showImport, setShowImport] = useState(false)

  function addColumn() {
    if (!onChange) return
    const key = `col-${Date.now()}`
    onChange({
      columns: [...data.columns, { key, label: 'คอลัมน์ใหม่' }],
      rows: data.rows.map(r => ({ ...r, values: [...r.values, { key, amount: 0 }] })),
    })
  }

  function removeColumn(key: string) {
    if (!onChange) return
    onChange({
      columns: data.columns.filter(c => c.key !== key),
      rows: data.rows.map(r => ({ ...r, values: r.values.filter(v => v.key !== key) })),
    })
  }

  function patchColumnLabel(key: string, label: string) {
    if (!onChange) return
    onChange({ ...data, columns: data.columns.map(c => c.key === key ? { ...c, label } : c) })
  }

  function addRow() {
    if (!onChange) return
    onChange({ ...data, rows: [...data.rows, { label: 'โครงการใหม่', values: data.columns.map(c => ({ key: c.key, amount: 0 })) }] })
  }

  function removeRow(idx: number) {
    if (!onChange) return
    onChange({ ...data, rows: data.rows.filter((_, i) => i !== idx) })
  }

  function patchRowLabel(idx: number, label: string) {
    if (!onChange) return
    const rows = [...data.rows]
    rows[idx] = { ...rows[idx], label }
    onChange({ ...data, rows })
  }

  function patchValue(idx: number, key: string, amount: number) {
    if (!onChange) return
    const rows = [...data.rows]
    rows[idx] = { ...rows[idx], values: rows[idx].values.map(v => v.key === key ? { ...v, amount } : v) }
    onChange({ ...data, rows })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-100 shrink-0 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-gray-700">ตารางเปรียบเทียบ</p>
        <div className="flex items-center gap-3">
          {isAdmin && onChange && (
            <button
              onClick={() => setShowImport(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1.5"
            >
              นำเข้าจาก Compare
            </button>
          )}
          <span className="text-[10px] text-gray-400 shrink-0">หน่วย : ล้านบาท</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3">
        {data.rows.length === 0 && data.columns.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-300 text-sm">
            ยังไม่มีข้อมูล — กด &quot;นำเข้าจาก Compare&quot; เพื่อเลือกโครงการและตัวชี้วัด
          </div>
        ) : (
          <table className="border-collapse text-sm min-w-[480px]">
            <thead>
              <tr>
                <th className={`${FIRST_CELL} z-20 text-left font-semibold text-gray-700 w-56`} />
                {data.columns.map(c => (
                  <th key={c.key} className={`${CELL} text-right font-semibold text-gray-700 w-36`}>
                    <span className="inline-flex items-center gap-1.5 justify-end w-full">
                      {isAdmin && onChange ? (
                        <input
                          value={c.label}
                          onChange={e => patchColumnLabel(c.key, e.target.value)}
                          className="w-full outline-none text-xs font-semibold text-right bg-transparent"
                        />
                      ) : c.label}
                      {isAdmin && onChange && (
                        <button onClick={() => removeColumn(c.key)} className="text-gray-300 hover:text-red-400 font-normal shrink-0" title="ลบคอลัมน์นี้">×</button>
                      )}
                    </span>
                  </th>
                ))}
                {isAdmin && onChange && (
                  <th className="w-8 border-0">
                    <button onClick={addColumn} className="text-indigo-400 hover:text-indigo-600 font-bold text-sm" title="เพิ่มคอลัมน์">+</button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, ri) => (
                <tr key={ri}>
                  <td className={`${FIRST_CELL} z-10 text-gray-700`}>
                    {isAdmin && onChange ? (
                      <input
                        value={row.label}
                        onChange={e => patchRowLabel(ri, e.target.value)}
                        className="w-full outline-none text-sm bg-transparent"
                      />
                    ) : row.label}
                  </td>
                  {data.columns.map(c => {
                    const v = row.values.find(x => x.key === c.key)
                    return (
                      <td key={c.key} className={`${CELL} text-right font-mono text-gray-700`}>
                        {isAdmin && onChange ? (
                          <NumberInput
                            value={v?.amount ?? 0}
                            onChange={val => patchValue(ri, c.key, val)}
                            className="w-full outline-none text-sm bg-transparent text-right font-mono"
                          />
                        ) : fmtMillion(v?.amount ?? 0)}
                      </td>
                    )
                  })}
                  {isAdmin && onChange && (
                    <td className="border-0 px-1">
                      <button onClick={() => removeRow(ri)} className="text-gray-300 hover:text-red-400 p-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isAdmin && onChange && data.columns.length > 0 && (
          <button
            onClick={addRow}
            className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-dashed border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1 transition-colors"
          >
            + เพิ่มแถว
          </button>
        )}
      </div>

      {showImport && onChange && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={imported => { onChange(imported); setShowImport(false) }}
        />
      )}
    </div>
  )
}

// Pulls a raw one-time snapshot of the /compare page's metrics (same 8 keys, same aggregation —
// sum of budget_sources across every data_year, grouped by fund_type) for a manually chosen set
// of projects — not bound afterward. Rows/columns are fully freeform once imported.
function ImportModal({ onClose, onImport }: { onClose: () => void; onImport: (data: CompareTableData) => void }) {
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project[]>([])
  const [metricKeys, setMetricKeys] = useState<string[]>(['budget_commit', 'budget_invest', 'budget_total'])
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

  function toggleProject(p: Project) {
    setSelected(sel => sel.some(s => s.id === p.id) ? sel.filter(s => s.id !== p.id) : [...sel, p])
  }

  function toggleMetric(key: string) {
    setMetricKeys(keys => keys.includes(key) ? keys.filter(k => k !== key) : [...keys, key])
  }

  async function doImport() {
    if (selected.length === 0 || metricKeys.length === 0) return
    setImporting(true)
    setError(null)
    try {
      const columns = COMPARE_METRICS.filter(m => metricKeys.includes(m.key)).map(m => ({ key: m.key, label: m.label }))
      const rows = []
      for (const p of selected) {
        const detail = await api.projectDetail(p.project_code)
        const bi = detail.budget_sources.filter(s => s.fund_type === 'ลงทุน').reduce((s, e) => s + e.budget, 0)
        const bc = detail.budget_sources.filter(s => s.fund_type === 'ผูกพัน').reduce((s, e) => s + e.budget, 0)
        const ti = detail.budget_sources.filter(s => s.fund_type === 'ลงทุน').reduce((s, e) => s + e.target, 0)
        const tc = detail.budget_sources.filter(s => s.fund_type === 'ผูกพัน').reduce((s, e) => s + e.target, 0)
        const rem = detail.budget_sources.reduce((s, e) => s + e.remain, 0)
        const totalBudget = bi + bc
        const byMetric: Record<string, number> = {
          budget_commit: bc, budget_invest: bi, budget_total: totalBudget,
          target_commit: tc, target_invest: ti, target_total: ti + tc,
          remain: rem,
          pct: totalBudget > 0 ? ((ti + tc) / totalBudget) * 100 : 0,
        }
        rows.push({ label: p.name, values: columns.map(c => ({ key: c.key, amount: byMetric[c.key] ?? 0 })) })
      }
      onImport({ columns, rows })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">นำเข้าจาก Compare</p>
          <p className="text-xs text-gray-400 mt-1">
            เลือกโครงการและตัวชี้วัดที่ต้องการ — ดึงมา ณ ตอนนี้ครั้งเดียว ไม่ผูกอัตโนมัติ
            และจะแทนที่ตารางเดิมทั้งหมด
          </p>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">ตัวชี้วัด</p>
          <div className="flex flex-wrap gap-1.5">
            {COMPARE_METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                className={`text-xs rounded-lg px-2.5 py-1 border font-medium transition-colors ${
                  metricKeys.includes(m.key) ? 'bg-indigo-600 text-white border-indigo-600' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
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
          {projects.map(p => {
            const checked = selected.some(s => s.id === p.id)
            return (
              <button
                key={p.id}
                onClick={() => toggleProject(p)}
                className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 ${checked ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
              >
                <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'}`}>
                  {checked && '✓'}
                </span>
                <span className="min-w-0">
                  <div className="text-sm text-gray-800 truncate">{p.name}</div>
                  <div className="text-xs text-gray-400">{p.project_code} · ปี {p.year}</div>
                </span>
              </button>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">{selected.length} โครงการ · {metricKeys.length} ตัวชี้วัด</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
              ยกเลิก
            </button>
            <button
              onClick={doImport}
              disabled={importing || selected.length === 0 || metricKeys.length === 0}
              className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-60"
            >
              {importing ? 'กำลังนำเข้า...' : 'นำเข้า'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
