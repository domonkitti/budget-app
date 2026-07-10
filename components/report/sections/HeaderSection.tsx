'use client'

import type { ReportData } from '@/lib/reportTypes'
import { fmtMillion } from '@/lib/reportTypes'

interface Props {
  data: ReportData
  isAdmin: boolean
  onChange?: (patch: Partial<ReportData>) => void
}

export default function HeaderSection({ data, isAdmin, onChange }: Props) {
  const bi = data.basicInfo

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
      <div className="px-8 py-6 border-b border-gray-100 shrink-0">
        {isAdmin ? (
          <textarea
            className="w-full text-xl font-bold text-gray-900 leading-snug resize-none border-0 outline-none focus:ring-2 focus:ring-indigo-200 rounded px-1 -mx-1 bg-transparent"
            rows={2}
            value={data.projectName}
            onChange={e => onChange?.({ projectName: e.target.value })}
          />
        ) : (
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{data.projectName}</h1>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <span className="text-sm text-gray-500">{data.dept}</span>
          <span className="text-gray-300">·</span>
          <span className="text-sm text-gray-500">ปีงบประมาณ {data.fiscalYear}</span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              data.status === 'ต่อเนื่อง'
                ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            }`}
          >
            {data.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <KpiCard
          label="วงเงินทั้งสิ้น"
          value={fmtMillion(bi.totalInvestment)}
          sub={`${bi.durationYears} ปี (${bi.startYear}–${bi.endYear})`}
          color="indigo"
        />
        <KpiCard
          label={`วงเงินปี ${data.fiscalYear}`}
          value={fmtMillion(bi.yearInvestment)}
          sub="ไม่รวม VAT"
          color="violet"
        />
        <KpiCard
          label="เป้าเบิกจ่าย"
          value={fmtMillion(bi.disbursementTarget)}
          sub={`ปี ${data.fiscalYear}`}
          color="sky"
        />
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color }: {
  label: string
  value: string
  sub: string
  color: 'indigo' | 'violet' | 'sky'
}) {
  const colors = {
    indigo: 'bg-indigo-600',
    violet: 'bg-violet-600',
    sky: 'bg-sky-600',
  }
  return (
    <div className={`${colors[color]} px-6 py-5 text-white`}>
      <p className="text-xs font-medium text-white/70 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1 leading-tight">{value}</p>
      <p className="text-xs text-white/60 mt-0.5">{sub}</p>
    </div>
  )
}
