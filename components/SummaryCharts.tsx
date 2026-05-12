"use client"

import { Fragment, useMemo, useState } from "react"
import { BarChart, Bar, LabelList, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts"
import type { FlatProject } from "@/lib/types"

function fmt(n: number) {
  if (n === 0) return <span className="text-gray-300">-</span>
  return <>{n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</>
}

const TYPE_LABELS: Record<string, string> = {
  Y: "งานรายปี",
  C: "แผนระยะยาว",
  L: "สัญญาเช่า",
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  Y: { bg: "#DBEAFE", text: "#1E3A8A" },
  C: { bg: "#D1FAE5", text: "#065F46" },
  L: { bg: "#FDE68A", text: "#92400E" },
}

type FundVals = { committed: number; invest: number }
type SourceRow = { source: string; budget: FundVals; target: FundVals }
type TypeAgg = { type: string; rows: SourceRow[]; budget: FundVals; target: FundVals }

function total(v: FundVals) { return v.committed + v.invest }

type Props = { data: FlatProject[]; years?: number[] }

export default function SummaryCharts({ data, years = [] }: Props) {
  const activeYears = years.length > 0 ? new Set(years) : null

  const availableYears = useMemo(
    () => [...new Set(data.flatMap(p => p.source_breakdown.map(e => e.year)))].sort((a, b) => a - b),
    [data]
  )

  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const displayYear = selectedYear ?? availableYears[0] ?? null

  const byYear = useMemo(() =>
    Object.values(
      data.reduce<Record<number, { year: number; budget: number; target: number }>>((acc, p) => {
        p.source_breakdown.forEach(e => {
          if (activeYears && !activeYears.has(e.year)) return
          if (!acc[e.year]) acc[e.year] = { year: e.year, budget: 0, target: 0 }
          acc[e.year].budget += e.budget
          acc[e.year].target += e.target
        })
        return acc
      }, {})
    ).sort((a, b) => a.year - b.year),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, years]
  )

  const typeAggs = useMemo((): TypeAgg[] => {
    if (displayYear === null) return []
    return ["Y", "C", "L"]
      .map(type => {
        const sourceMap: Record<string, { budget: FundVals; target: FundVals }> = {}
        data
          .filter(p => p.project_type === type)
          .forEach(p => {
            p.source_breakdown.forEach(e => {
              if (e.year !== displayYear) return
              if (!sourceMap[e.source]) sourceMap[e.source] = {
                budget: { committed: 0, invest: 0 },
                target: { committed: 0, invest: 0 },
              }
              if (e.fund_type === "ผูกพัน") {
                sourceMap[e.source].budget.committed += e.budget
                sourceMap[e.source].target.committed += e.target
              } else if (e.fund_type === "ลงทุน") {
                sourceMap[e.source].budget.invest += e.budget
                sourceMap[e.source].target.invest += e.target
              }
            })
          })
        const rows: SourceRow[] = Object.entries(sourceMap)
          .map(([source, vals]) => ({ source, ...vals }))
          .filter(r => total(r.budget) !== 0 || total(r.target) !== 0)
        const agg: FundVals = { committed: 0, invest: 0 }
        const tgt: FundVals = { committed: 0, invest: 0 }
        rows.forEach(r => {
          agg.committed += r.budget.committed; agg.invest += r.budget.invest
          tgt.committed += r.target.committed; tgt.invest += r.target.invest
        })
        return { type, rows, budget: agg, target: tgt }
      })
      .filter(t => t.rows.length > 0)
  }, [data, displayYear])

  const grand = typeAggs.reduce(
    (acc, t) => ({
      budget: { committed: acc.budget.committed + t.budget.committed, invest: acc.budget.invest + t.budget.invest },
      target: { committed: acc.target.committed + t.target.committed, invest: acc.target.invest + t.target.invest },
    }),
    { budget: { committed: 0, invest: 0 }, target: { committed: 0, invest: 0 } }
  )

  const tdNum = "py-1 px-2 text-right tabular-nums text-xs whitespace-nowrap"
  const thStyle = "py-1 px-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap"

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">

      {/* Summary table — 2/3 */}
      <div className="col-span-2 bg-white rounded-xl border p-4 flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">สรุปงบประมาณ</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">หน่วย:ล้านบาท</span>
            <select
              className="border rounded px-2 py-1 text-xs text-gray-600"
              value={displayYear ?? ""}
              onChange={e => setSelectedYear(Number(e.target.value))}
            >
              {availableYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-1 px-2 font-medium text-xs" rowSpan={2}>ประเภท / แหล่งเงิน</th>
                <th className="text-center py-1 px-2 font-medium text-xs border-l" colSpan={3}>งบเงินดำเนินการปี</th>
                <th className="text-center py-1 px-2 font-medium text-xs border-l" colSpan={3}>เป้าหมายการเบิกจ่าย</th>
              </tr>
              <tr className="border-b text-gray-400">
                <th className={`${thStyle} border-l`}>ผูกพัน</th>
                <th className={thStyle}>ลงทุน</th>
                <th className={thStyle}>รวม</th>
                <th className={`${thStyle} border-l`}>ผูกพัน</th>
                <th className={thStyle}>ลงทุน</th>
                <th className={thStyle}>รวม</th>
              </tr>
            </thead>
            <tbody>
              {typeAggs.map(({ type, rows, budget, target }) => {
                const colors = TYPE_COLORS[type] ?? { bg: "#F3F4F6", text: "#374151" }
                return (
                  <Fragment key={type}>
                    {/* Type total row — on top */}
                    <tr style={{ background: colors.bg }}>
                      <td className="py-1 px-2 font-semibold text-xs" style={{ color: colors.text }}>
                        รวม{TYPE_LABELS[type] ?? type}
                      </td>
                      <td className={`${tdNum} border-l font-bold`} style={{ color: colors.text }}>{fmt(budget.committed)}</td>
                      <td className={`${tdNum} font-bold`} style={{ color: colors.text }}>{fmt(budget.invest)}</td>
                      <td className={`${tdNum} font-bold`} style={{ color: colors.text }}>{fmt(total(budget))}</td>
                      <td className={`${tdNum} border-l font-bold`} style={{ color: colors.text }}>{fmt(target.committed)}</td>
                      <td className={`${tdNum} font-bold`} style={{ color: colors.text }}>{fmt(target.invest)}</td>
                      <td className={`${tdNum} font-bold`} style={{ color: colors.text }}>{fmt(total(target))}</td>
                    </tr>
                    {/* Source detail rows */}
                    {rows.map(row => (
                      <tr key={`${type}-${row.source}`} className="border-b border-gray-50">
                        <td className="py-1 pl-5 pr-2 text-gray-400 text-xs">– {row.source}</td>
                        <td className={`${tdNum} border-l text-blue-500`}>{fmt(row.budget.committed)}</td>
                        <td className={`${tdNum} text-blue-500`}>{fmt(row.budget.invest)}</td>
                        <td className={`${tdNum} text-blue-600`}>{fmt(total(row.budget))}</td>
                        <td className={`${tdNum} border-l text-emerald-500`}>{fmt(row.target.committed)}</td>
                        <td className={`${tdNum} text-emerald-500`}>{fmt(row.target.invest)}</td>
                        <td className={`${tdNum} text-emerald-600`}>{fmt(total(row.target))}</td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              {typeAggs.length > 0 && (
                <tr className="bg-gray-100 border-t">
                  <td className="py-1 px-2 font-bold text-xs text-gray-700">รวมทั้งหมด</td>
                  <td className={`${tdNum} border-l font-bold text-gray-700`}>{fmt(grand.budget.committed)}</td>
                  <td className={`${tdNum} font-bold text-gray-700`}>{fmt(grand.budget.invest)}</td>
                  <td className={`${tdNum} font-bold text-gray-700`}>{fmt(total(grand.budget))}</td>
                  <td className={`${tdNum} border-l font-bold text-gray-700`}>{fmt(grand.target.committed)}</td>
                  <td className={`${tdNum} font-bold text-gray-700`}>{fmt(grand.target.invest)}</td>
                  <td className={`${tdNum} font-bold text-gray-700`}>{fmt(total(grand.target))}</td>
                </tr>
              )}
              {typeAggs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-gray-400 text-xs">ไม่มีข้อมูล</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart — 1/3 */}
      <div className="bg-white rounded-xl border p-4 flex flex-col">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">แนวโน้มงบประมาณ</h3>
        <div className="flex-1 min-h-0" style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byYear} margin={{ top: 24, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => Number(v).toFixed(0)} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => `${Number(v).toFixed(1)}M`} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="budget" fill="#3b82f6" name="งบเงินดำเนินการ/รวม" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="budget" position="top" formatter={(v) => Math.round(Number(v)).toLocaleString()} style={{ fontSize: 12, fontWeight: 600, fill: "#3b82f6" }} />
            </Bar>
            <Bar dataKey="target" fill="#10b981" name="เป้าหมายการเบิกจ่าย/รวม" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="target" position="top" formatter={(v) => Math.round(Number(v)).toLocaleString()} style={{ fontSize: 12, fontWeight: 600, fill: "#10b981" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>

    </div>
  )
}
