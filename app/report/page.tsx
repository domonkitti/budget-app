'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ReportGroup, Report } from '@/lib/reportTypes'
import { reportApi } from '@/lib/reportApi'
import { fmtMillion } from '@/lib/reportTypes'

export default function ReportListPage() {
  const [groups, setGroups] = useState<ReportGroup[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([reportApi.reportGroups(), reportApi.reports()])
      .then(([g, r]) => {
        setGroups(g)
        setReports(r)
        setExpanded(new Set(g.map(gr => gr.id)))
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const toggle = (id: string) =>
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">รายงานสรุปแผนงาน</h1>
            <p className="text-sm text-gray-400 mt-1">งบลงทุนเพื่อการดำเนินงานปกติ</p>
          </div>
          <Link
            href="/report/new"
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            สร้างรายงาน
          </Link>
        </div>

        {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}
        {error && <p className="text-sm text-red-500">โหลดข้อมูลไม่สำเร็จ: {error}</p>}

        {!loading && !error && (
        <div className="space-y-4">
          {groups.sort((a, b) => a.order - b.order).map(group => {
            const groupReports = reports.filter(r => r.groupId === group.id)
            const open = expanded.has(group.id)
            return (
              <div key={group.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <button
                  onClick={() => toggle(group.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="font-semibold text-gray-800">{group.name}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{groupReports.length} รายการ</span>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                {open && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {groupReports.map(report => (
                      <Link
                        key={report.id}
                        href={`/report/${group.id}/${report.id}`}
                        className="flex items-center justify-between px-6 py-4 hover:bg-indigo-50/30 transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 group-hover:text-indigo-700 truncate">
                            {report.data.projectName}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {report.data.dept} · ปี {report.data.fiscalYear}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 ml-4 shrink-0">
                          <span className="text-sm font-semibold text-gray-700">
                            {fmtMillion(report.data.basicInfo.yearInvestment)}
                          </span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                            report.data.status === 'ต่อเนื่อง'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {report.data.status}
                          </span>
                          <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </Link>
                    ))}
                    {groupReports.length === 0 && (
                      <div className="px-6 py-6 text-center text-sm text-gray-300">ยังไม่มีรายงาน</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )}
      </div>
    </div>
  )
}
