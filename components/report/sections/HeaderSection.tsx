'use client'

import type { ReactNode } from 'react'
import type { ReportData } from '@/lib/reportTypes'
import { fmtMillion, ACTIVE_YEAR } from '@/lib/reportTypes'
import NumberInput from '@/components/report/NumberInput'

// This report is either a mid-year "เปลี่ยนแปลงงบ" (budget amendment, filed against last year)
// or the regular "งบประจำปี" (annual budget, filed against the current year).
const AMENDMENT_YEAR = ACTIVE_YEAR - 1
const ANNUAL_YEAR = ACTIVE_YEAR

interface Props {
  data: ReportData
  isAdmin: boolean
  onChange?: (patch: Partial<ReportData>) => void
}

export default function HeaderSection({ data, isAdmin, onChange }: Props) {
  const bi = data.basicInfo

  function patchBasicInfo(patch: Partial<ReportData['basicInfo']>) {
    onChange?.({ basicInfo: { ...bi, ...patch } })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-8 py-6 border-b border-gray-200 shrink-0">
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
          value={bi.totalInvestment}
          onValueChange={isAdmin ? (v: number) => patchBasicInfo({ totalInvestment: v }) : undefined}
          sub={
            isAdmin ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  value={bi.startYear}
                  onChange={e => {
                    const startYear = Number(e.target.value) || 0
                    patchBasicInfo({ startYear, durationYears: Math.max(1, bi.endYear - startYear + 1) })
                  }}
                  className="w-12 bg-transparent border-b border-white/30 focus:border-white outline-none text-xs text-white"
                />
                <span>–</span>
                <input
                  type="number"
                  value={bi.endYear}
                  onChange={e => {
                    const endYear = Number(e.target.value) || 0
                    patchBasicInfo({ endYear, durationYears: Math.max(1, endYear - bi.startYear + 1) })
                  }}
                  className="w-12 bg-transparent border-b border-white/30 focus:border-white outline-none text-xs text-white"
                />
                <span>({bi.durationYears} ปี)</span>
              </span>
            ) : `${bi.durationYears} ปี (${bi.startYear}–${bi.endYear})`
          }
          color="indigo"
        />
        <KpiCard
          label={
            isAdmin ? (
              <span className="inline-flex items-center gap-1">
                วงเงินปี
                <select
                  value={data.fiscalYear}
                  onChange={e => onChange?.({ fiscalYear: Number(e.target.value) })}
                  className="border-b border-white/40 focus:border-white outline-none text-xs font-medium bg-transparent text-white"
                >
                  {![AMENDMENT_YEAR, ANNUAL_YEAR].includes(data.fiscalYear) && (
                    <option value={data.fiscalYear} className="text-gray-900">{data.fiscalYear}</option>
                  )}
                  <option value={AMENDMENT_YEAR} className="text-gray-900">เปลี่ยนแปลงงบ ({AMENDMENT_YEAR})</option>
                  <option value={ANNUAL_YEAR} className="text-gray-900">งบประจำปี ({ANNUAL_YEAR})</option>
                </select>
              </span>
            ) : `วงเงินปี ${data.fiscalYear}`
          }
          value={bi.yearInvestment}
          onValueChange={isAdmin ? (v: number) => patchBasicInfo({ yearInvestment: v }) : undefined}
          sub="ไม่รวม VAT"
          color="violet"
        />
        <KpiCard
          label="เป้าเบิกจ่าย"
          value={bi.disbursementTarget}
          onValueChange={isAdmin ? (v: number) => patchBasicInfo({ disbursementTarget: v }) : undefined}
          sub={`ปี ${data.fiscalYear}`}
          color="sky"
        />
      </div>
    </div>
  )
}

function KpiCard({ label, value, onValueChange, sub, color }: {
  label: ReactNode
  value: number
  onValueChange?: (v: number) => void
  sub: ReactNode
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
      {onValueChange ? (
        <NumberInput
          value={value}
          onChange={onValueChange}
          className="w-full bg-transparent text-2xl font-bold mt-1 leading-tight text-white border-b border-white/30 focus:border-white outline-none"
        />
      ) : (
        <p className="text-2xl font-bold mt-1 leading-tight">{fmtMillion(value)}</p>
      )}
      <p className="text-xs text-white/60 mt-0.5">{sub}</p>
    </div>
  )
}
