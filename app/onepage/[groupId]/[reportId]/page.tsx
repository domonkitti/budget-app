'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { MOCK_REPORTS } from '@/lib/reportMock'
import OnePageSummary from '@/components/report/OnePageSummary'

export default function OnePageSummaryPage() {
  const { groupId, reportId } = useParams<{ groupId: string; reportId: string }>()
  const report = MOCK_REPORTS.find(r => r.id === reportId && r.groupId === groupId)

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 mb-4">ไม่พบรายงานนี้</p>
          <Link href="/report" className="text-indigo-600 hover:underline text-sm">← กลับหน้าหลัก</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/report" className="hover:text-gray-700">รายงาน</Link>
        <span>/</span>
        <span className="text-gray-700 truncate max-w-xs">{report.data.projectName}</span>
        <Link
          href={`/report/${groupId}/${reportId}`}
          className="ml-auto text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 rounded px-2 py-1"
        >
          ดูฉบับเต็ม
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm"
        >
          พิมพ์ / บันทึก PDF
        </button>
      </div>
      <div className="py-8 px-4">
        <OnePageSummary report={report} />
      </div>
    </div>
  )
}
