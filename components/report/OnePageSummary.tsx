'use client'

import type { EquipmentItem, Report } from '@/lib/reportTypes'
import { fmtMillion, fmtNumber, THAI_MONTHS, ACTIVE_YEAR, DEFAULT_EQUIPMENT_GROUP, durationYears } from '@/lib/reportTypes'

interface Props {
  report: Report
}

export default function OnePageSummary({ report }: Props) {
  const data = report.data
  const bi = data.basicInfo

  // "Active year" is a global system setting (ACTIVE_YEAR), not the project's own reporting
  // fiscalYear — they happen to match in this mock, but shouldn't be conflated.
  const activeYear = ACTIVE_YEAR
  const nextYear = activeYear + 1
  const equipmentYear = data.equipment.find(y => y.year === activeYear) ?? data.equipment[0]
  const disbursementFor = (it: { disbursementByYear: { year: number; amount: number }[] }, year: number) =>
    it.disbursementByYear.find(d => d.year === year)?.amount ?? 0

  const procurementPlans = [...data.procurements]
    .filter(p => p.activities.length > 0)
    .sort((a, b) => a.fiscalYear - b.fiscalYear)

  return (
    <div className="mx-auto max-w-5xl bg-white text-gray-900 p-10 print:p-0 print:max-w-none">
      {/* Header */}
      <div className="border-b-2 border-gray-900 pb-4 mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-snug">{data.projectName}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-sm text-gray-500">
            <span>{data.dept}</span>
            <span className="text-gray-300">·</span>
            <span>{data.section}</span>
            <span className="text-gray-300">·</span>
            <span>ปีงบประมาณ {data.fiscalYear}</span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                data.status === 'ต่อเนื่อง' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
              }`}
            >
              {data.status}
            </span>
          </div>
        </div>
        <span className="text-[10px] text-gray-400 shrink-0 mt-1">หน่วย : ล้านบาท</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Kpi label="วงเงินทั้งสิ้น" value={fmtMillion(bi.totalInvestment)} sub={`${durationYears(bi.startYear, bi.endYear)} ปี (${bi.startYear}–${bi.endYear})`} color="bg-indigo-600" />
        <Kpi label={`วงเงินปี ${data.fiscalYear}`} value={fmtMillion(bi.yearInvestment)} sub="ไม่รวม VAT" color="bg-violet-600" />
        <Kpi label="เป้าเบิกจ่าย" value={fmtMillion(bi.disbursementTarget)} sub={`ปี ${data.fiscalYear}`} color="bg-sky-600" />
      </div>

      {/* Two-column meta */}
      <div className="grid grid-cols-2 gap-6 mb-5">
        <div className="space-y-2.5">
          <SectionLabel>ข้อมูลพื้นฐาน</SectionLabel>
          <Row label="ผู้รับผิดชอบ" value={`${bi.responsible.department} (${bi.responsible.section})`} />
          <Row label="พื้นที่" value={bi.area} />
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            <Badge value={bi.necessity} color="blue" />
            <Badge value={bi.investmentType} color="violet" />
            <Badge value={bi.approval} color="amber" />
          </div>
        </div>
        <div className="space-y-2.5">
          <SectionLabel>วัตถุประสงค์</SectionLabel>
          <ul className="space-y-1">
            {bi.objectives.slice(0, 3).map((obj, i) => (
              <li key={i} className="flex gap-1.5 text-sm text-gray-700 leading-snug">
                <span className="text-indigo-400 shrink-0">•</span>
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Equipment — active year snapshot, full list, ranked by near-term disbursement */}
      {equipmentYear && equipmentYear.items.length > 0 && (() => {
        // Group items into their own table when tagged (e.g. ค่าใช้จ่ายหน้างาน/ค่าจ้าง);
        // untagged items form the main table, preserving the original single-table look.
        const buckets: { name?: string; items: EquipmentItem[] }[] = []
        for (const it of equipmentYear.items) {
          let bucket = buckets.find(b => b.name === it.group)
          if (!bucket) { bucket = { name: it.group, items: [] }; buckets.push(bucket) }
          bucket.items.push(it)
        }
        return (
          <div className="mb-5">
            <SectionLabel>{`วัสดุอุปกรณ์หลัก ปี ${equipmentYear.year} (${equipmentYear.items.length} รายการ)`}</SectionLabel>
            <div className="space-y-3">
              {buckets.map(bucket => {
                const shown = [...bucket.items]
                  .filter(it => !it.cancelled)
                  .sort((a, b) => (disbursementFor(b, activeYear) + disbursementFor(b, nextYear)) - (disbursementFor(a, activeYear) + disbursementFor(a, nextYear)))
                return (
                  <div key={bucket.name ?? '__main'}>
                    {buckets.length > 1 && (
                      <p className="text-xs font-semibold text-gray-500 mb-1">{bucket.name ?? DEFAULT_EQUIPMENT_GROUP} ({bucket.items.length} รายการ)</p>
                    )}
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-1 font-semibold text-gray-500 text-xs w-56">รายการ</th>
                          <th className="text-right py-1 font-semibold text-gray-500 text-xs w-28">จำนวน/วงเงิน</th>
                          <th className="text-right py-1 font-semibold text-gray-500 text-xs w-28">ประมาณจ่าย ปี {activeYear}</th>
                          <th className="text-right py-1 font-semibold text-gray-500 text-xs w-28">ประมาณจ่าย ปี {nextYear}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {shown.map(it => (
                          <tr key={it.no}>
                            <td className="py-1 pr-2 text-gray-700 break-words">{it.description}</td>
                            <td className="py-1 text-right text-gray-600">
                              <div className="font-mono">{fmtMillion(it.totalAmount)}</div>
                              <div className="text-gray-400">{fmtNumber(it.qty)} {it.unit}</div>
                            </td>
                            <td className="py-1 text-right font-mono text-gray-600">{fmtMillion(disbursementFor(it, activeYear))}</td>
                            <td className="py-1 text-right font-mono text-gray-600">{fmtMillion(disbursementFor(it, nextYear))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-300 font-semibold">
                          <td className="py-1 pr-2 text-gray-700">รวม</td>
                          <td className="py-1 text-right font-mono text-gray-900">
                            {fmtMillion(shown.reduce((s, it) => s + it.totalAmount, 0))}
                          </td>
                          <td className="py-1 text-right font-mono text-gray-900">
                            {fmtMillion(shown.reduce((s, it) => s + disbursementFor(it, activeYear), 0))}
                          </td>
                          <td className="py-1 text-right font-mono text-gray-900">
                            {fmtMillion(shown.reduce((s, it) => s + disbursementFor(it, nextYear), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )
              })}
            </div>
            {buckets.length > 1 && (() => {
              const all = equipmentYear.items.filter(it => !it.cancelled)
              return (
                <table className="w-full text-sm border-collapse mt-2">
                  <tbody>
                    <tr className="border-t-2 border-gray-900 font-bold text-gray-900">
                      <td className="py-1.5 pr-2 w-56">รวมทั้งสิ้นทุกตาราง</td>
                      <td className="py-1.5 text-right font-mono w-28">{fmtMillion(all.reduce((s, it) => s + it.totalAmount, 0))}</td>
                      <td className="py-1.5 text-right font-mono w-28">{fmtMillion(all.reduce((s, it) => s + disbursementFor(it, activeYear), 0))}</td>
                      <td className="py-1.5 text-right font-mono w-28">{fmtMillion(all.reduce((s, it) => s + disbursementFor(it, nextYear), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              )
            })()}
          </div>
        )
      })()}

      {/* Procurement timeline — one stacked strip per fiscal year covered */}
      {procurementPlans.length > 0 && (
        <div>
          <SectionLabel>แผนจัดซื้อจัดจ้าง</SectionLabel>
          <div className="space-y-3">
            {procurementPlans.map(plan => (
              <div key={plan.fiscalYear}>
                <p className="text-xs font-semibold text-gray-500 mb-1">ปี {plan.fiscalYear}</p>
                <div className="flex text-[10px] text-gray-400 pl-28 mb-1">
                  {THAI_MONTHS.map(m => (
                    <span key={m} className="flex-1 text-center">{m}</span>
                  ))}
                </div>
                <div className="space-y-1">
                  {plan.activities.map(act => {
                    const isDisbursement = act.name === 'เบิกจ่าย'
                    return (
                      <div key={act.id} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-xs text-gray-600 truncate">{act.name}</span>
                        <div className="flex flex-1 gap-0.5">
                          {act.months.map((m, i) => (
                            <div
                              key={i}
                              title={m.amount ? fmtNumber(m.amount) : undefined}
                              className={`flex-1 flex items-center justify-center ${
                                isDisbursement ? 'h-5' : `h-3 rounded-sm ${m.active ? 'bg-indigo-500' : 'bg-gray-100'}`
                              }`}
                            >
                              {isDisbursement && m.amount != null && (
                                <span className="text-[8px] leading-none text-gray-700 font-medium px-0.5 truncate">
                                  {fmtMillion(m.amount)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className={`${color} rounded-lg px-4 py-3 text-white`}>
      <p className="text-[10px] font-medium text-white/70 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold mt-0.5 leading-tight">{value}</p>
      <p className="text-[10px] text-white/60 mt-0.5">{sub}</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">{children}</p>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="font-semibold text-gray-700 w-24 shrink-0">{label}</span>
      <span className="text-gray-600">{value || '—'}</span>
    </div>
  )
}

function Badge({ value, color }: { value: string; color: 'blue' | 'violet' | 'amber' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  }
  return <span className={`text-xs px-2.5 py-0.5 rounded-full ring-1 font-medium ${colors[color]}`}>{value}</span>
}
