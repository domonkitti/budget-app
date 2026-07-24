import { Fragment, useState } from "react"

const fmt = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export type MetricEntry = { year: number; fund_type: string; budget: number; target: number; cut_transfer: number; under_budget: number }
export type SourceMetricEntry = MetricEntry & { source: string }

const METRICS = [
  { key: "invest_budget", label: "วงเงิน/ลงทุน" },
  { key: "total_target", label: "เป้า/รวม" },
  { key: "cut_under", label: "ตัดทิ้ง/โยกย้าย+ต่ำกว่างบ" },
] as const

function metricValue(entries: MetricEntry[], key: (typeof METRICS)[number]["key"]) {
  if (key === "invest_budget") return entries.filter(e => e.fund_type === "ลงทุน").reduce((s, e) => s + e.budget, 0)
  if (key === "cut_under") return entries.reduce((s, e) => s + e.cut_transfer + e.under_budget, 0)
  return entries.reduce((s, e) => s + e.target, 0)
}

function groupBySource(entries: SourceMetricEntry[]) {
  const map = new Map<string, SourceMetricEntry[]>()
  for (const e of entries) {
    if (!map.has(e.source)) map.set(e.source, [])
    map.get(e.source)!.push(e)
  }
  return [...map.entries()]
}

const ALL = "all"

export function ProjectMetricsTable({
  entries,
  years,
  sourceEntries = [],
}: {
  entries: MetricEntry[]
  years: number[]
  sourceEntries?: SourceMetricEntry[]
}) {
  const [endYear, setEndYear] = useState<number | typeof ALL>(ALL)
  const effEndYear = endYear === ALL || years.includes(endYear) ? endYear : ALL
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const totalEntries = effEndYear === ALL ? entries : entries.filter(e => e.year <= effEndYear)
  const sourceGroups = groupBySource(sourceEntries)

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="bg-white rounded-xl border overflow-auto min-w-0">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-4 py-3 font-semibold text-gray-600 border-b whitespace-nowrap sticky left-0 bg-gray-50 z-10">
              Metric
            </th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600 border-b whitespace-nowrap bg-gray-100">
              <div className="flex items-center justify-end gap-1.5">
                <span>ผลรวม-</span>
                <select
                  value={effEndYear}
                  onChange={e => setEndYear(e.target.value === ALL ? ALL : Number(e.target.value))}
                  onClick={e => e.stopPropagation()}
                  className="text-right font-normal border border-gray-300 rounded px-1 py-0.5 bg-white"
                  style={{ fontSize: 11 }}
                >
                  <option value={ALL}>สิ้นสุดแผนงาน</option>
                  {years.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </th>
            {years.map(y => (
              <th key={y} className="text-right px-4 py-3 font-semibold text-gray-600 border-b whitespace-nowrap">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map(m => {
            const isOpen = expanded.has(m.key)
            return (
              <Fragment key={m.key}>
                <tr className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 sticky left-0 bg-white z-10 whitespace-nowrap">
                    {sourceGroups.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggle(m.key)}
                        className="flex items-center gap-1 hover:text-gray-800"
                      >
                        <span className="text-gray-400" style={{ fontSize: 9 }}>{isOpen ? "▼" : "▶"}</span>
                        {m.label}
                      </button>
                    ) : (
                      m.label
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono bg-gray-50 font-semibold text-gray-700">
                    {fmt(metricValue(totalEntries, m.key))}
                  </td>
                  {years.map(y => (
                    <td key={y} className="px-4 py-2 text-right font-mono text-gray-700">
                      {fmt(metricValue(entries.filter(e => e.year === y), m.key))}
                    </td>
                  ))}
                </tr>
                {isOpen && sourceGroups.map(([source, srcEntries]) => {
                  const srcTotalEntries = effEndYear === ALL ? srcEntries : srcEntries.filter(e => e.year <= effEndYear)
                  return (
                    <tr key={`${m.key}-${source}`} className="border-b border-gray-100 bg-gray-50/50">
                      <td className="px-4 py-1.5 pl-9 text-gray-400 sticky left-0 bg-white z-10 whitespace-nowrap">
                        {source}
                      </td>
                      <td className="px-4 py-1.5 text-right font-mono bg-gray-50 text-gray-500">
                        {fmt(metricValue(srcTotalEntries, m.key))}
                      </td>
                      {years.map(y => (
                        <td key={y} className="px-4 py-1.5 text-right font-mono text-gray-500">
                          {fmt(metricValue(srcEntries.filter(e => e.year === y), m.key))}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function FullPlanCard() {
  return (
    <div style={{ border: "0.5px solid #E5E7EB", borderRadius: 10, padding: "10px 14px", background: "#F9FAFB", minWidth: 160, display: "inline-block" }}>
      <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 2 }}>วงเงินเต็มแผน</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#9CA3AF", fontFamily: "monospace" }}>{fmt(0)}</div>
    </div>
  )
}
