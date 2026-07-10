'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { MOCK_REPORTS } from '@/lib/reportMock'
import { exportReportPdf } from '@/lib/exportReportPdf'
import { exportReportExcel } from '@/lib/exportReportExcel'

const ReportView = dynamic(() => import('@/components/report/ReportView'), { ssr: false })

export default function ReportViewPage() {
  const { groupId, reportId } = useParams<{ groupId: string; reportId: string }>()
  const report = MOCK_REPORTS.find(r => r.id === reportId)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

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
    <>
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/report" className="hover:text-gray-700">รายงาน</Link>
        <span>/</span>
        <span className="text-gray-700 truncate max-w-xs">{report.data.projectName}</span>
        <button
          onClick={() => exportReportExcel(report)}
          className="ml-auto flex items-center gap-2 px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 4a2 2 0 012-2h6a2 2 0 012 2v2h1a2 2 0 012 2v5a2 2 0 01-2 2h-1v1a2 2 0 01-2 2H7a2 2 0 01-2-2v-1H4a2 2 0 01-2-2V8a2 2 0 012-2h1V4zm2 0v2h6V4H7zm6 8H7v4h6v-4zm2-1h1V8h-1v3z" clipRule="evenodd" />
          </svg>
          ส่งออก Excel
        </button>
        <button
          onClick={async () => {
            setExporting(true)
            setExportError(null)
            try { await exportReportPdf(groupId, reportId) }
            catch (err) { setExportError(err instanceof Error ? err.message : String(err)) }
            finally { setExporting(false) }
          }}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm disabled:opacity-60"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 4a2 2 0 012-2h6a2 2 0 012 2v2h1a2 2 0 012 2v5a2 2 0 01-2 2h-1v1a2 2 0 01-2 2H7a2 2 0 01-2-2v-1H4a2 2 0 01-2-2V8a2 2 0 012-2h1V4zm2 0v2h6V4H7zm6 8H7v4h6v-4zm2-1h1V8h-1v3z" clipRule="evenodd" />
          </svg>
          {exporting ? 'กำลังสร้าง PDF...' : 'ส่งออก PDF'}
        </button>
      </div>
      {exportError && (
        <div className="no-print bg-red-50 border-b border-red-200 px-6 py-2 text-xs text-red-600">
          ส่งออก PDF ไม่สำเร็จ: {exportError}
        </div>
      )}
      <ReportView initialReport={report} isAdmin={false} />
    </>
  )
}
