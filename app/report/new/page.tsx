'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { Report } from '@/lib/reportTypes'
import { ACTIVE_YEAR } from '@/lib/reportTypes'
import { MOCK_GROUPS } from '@/lib/reportMock'

const ReportView = dynamic(() => import('@/components/report/ReportView'), { ssr: false })

function makeBlankReport(id: string): Report {
  const year = ACTIVE_YEAR
  return {
    id,
    groupId: '',
    presetId: null,
    data: {
      projectName: '',
      dept: '',
      section: '',
      fiscalYear: year,
      status: 'ใหม่',
      basicInfo: {
        responsible: { department: '', division: '', section: '', unit: '', phone: '' },
        necessity: 'อื่นๆ',
        investmentType: 'อื่นๆ',
        status: 'ใหม่',
        approval: '',
        area: '',
        durationYears: 1,
        startYear: year,
        endYear: year,
        totalInvestment: 0,
        yearInvestment: 0,
        disbursementTarget: 0,
        operatingBudget: null,
        objectives: [],
      },
      benefits: {
        outputAfterCompletion: '',
        outcomeAfterCompletion: '',
        outputThisYear: '',
        outcomeThisYear: '',
        benefitIncreaseRevenue: false,
        benefitReduceCost: false,
        benefitOther: '',
        orgImpact: '',
        communityImpact: '',
        ifNotApprovedImpact: '',
        problemsObstacles: '',
      },
      budget: { categories: [], reserve: 0, reserveByYear: [] },
      equipment: [],
      procurements: [{
        fiscalYear: year,
        activities: [
          {
            id: 'disburse-default',
            name: 'เบิกจ่าย',
            months: Array.from({ length: 12 }, () => ({ active: false })),
            details: [],
          },
        ],
      }],
    },
  }
}

export default function CreateReportPage() {
  const router = useRouter()
  const [initialReport] = useState(() => makeBlankReport(`new-${Date.now()}`))
  const [groupId, setGroupId] = useState(MOCK_GROUPS[0]?.id ?? '')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  function handleSave() {
    setStatus('saving')
    // TODO: collect report state from ReportView and POST to API with groupId
    setTimeout(() => {
      setStatus('saved')
      setTimeout(() => router.push('/report'), 800)
    }, 600)
  }

  return (
    <>
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/report" className="hover:text-gray-700">รายงาน</Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">สร้างรายงานใหม่</span>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">กลุ่ม</span>
            <select
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {MOCK_GROUPS.sort((a, b) => a.order - b.order).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <Link
            href="/report"
            className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
          >
            ยกเลิก
          </Link>
          <button
            onClick={handleSave}
            disabled={status !== 'idle'}
            className={`px-5 py-1.5 text-sm rounded-lg font-medium shadow-sm transition-all ${
              status === 'saved'
                ? 'bg-emerald-500 text-white'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60'
            }`}
          >
            {status === 'saved' ? '✓ บันทึกแล้ว' : status === 'saving' ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      <ReportView initialReport={initialReport} isAdmin={true} />
    </>
  )
}
