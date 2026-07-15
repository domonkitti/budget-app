'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ReportGroup, ReportData } from '@/lib/reportTypes'
import { ACTIVE_YEAR } from '@/lib/reportTypes'
import { reportApi } from '@/lib/reportApi'

function blankReportData(): ReportData {
  const year = ACTIVE_YEAR
  return {
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
      workNature: '',
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
  }
}

export default function CreateReportPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<ReportGroup[]>([])
  const [groupId, setGroupId] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    reportApi.reportGroups()
      .then(g => { setGroups(g); setGroupId(g[0]?.id ?? '') })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!groupId) return
    setCreating(true)
    setError(null)
    try {
      const report = await reportApi.createReport(groupId, blankReportData())
      router.push(`/report/admin/${groupId}/${report.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 w-full max-w-md">
        <h1 className="text-lg font-bold text-gray-900 mb-1">สร้างรายงานใหม่</h1>
        <p className="text-sm text-gray-400 mb-6">เลือกกลุ่มที่จะเก็บรายงานนี้ แล้วเริ่มแก้ไขในหน้าถัดไป</p>

        {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {!loading && (
          <>
            <label className="block text-xs text-gray-400 mb-1.5">กลุ่ม</label>
            <select
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {groups.sort((a, b) => a.order - b.order).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>

            <div className="flex items-center gap-3">
              <Link href="/report" className="flex-1 text-center px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
                ยกเลิก
              </Link>
              <button
                onClick={handleCreate}
                disabled={creating || !groupId}
                className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm disabled:opacity-60"
              >
                {creating ? 'กำลังสร้าง...' : 'สร้างรายงาน'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
