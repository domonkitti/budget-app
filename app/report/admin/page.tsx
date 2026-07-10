'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ReportGroup, Report } from '@/lib/reportTypes'
import { MOCK_GROUPS, MOCK_REPORTS } from '@/lib/reportMock'
import { fmtMillion } from '@/lib/reportTypes'

export default function ReportAdminPage() {
  const [groups, setGroups] = useState<ReportGroup[]>(MOCK_GROUPS)
  const [reports, setReports] = useState<Report[]>(MOCK_REPORTS)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(groups.map(g => g.id)))
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)

  const toggle = (id: string) =>
    setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  function addGroup() {
    if (!newGroupName.trim()) return
    const id = `g${Date.now()}`
    setGroups(g => [...g, { id, name: newGroupName.trim(), order: g.length }])
    setExpanded(s => new Set([...s, id]))
    setNewGroupName('')
    setShowNewGroup(false)
  }

  function renameGroup(id: string) {
    if (!editingGroupName.trim()) return
    setGroups(g => g.map(gr => gr.id === id ? { ...gr, name: editingGroupName.trim() } : gr))
    setEditingGroupId(null)
  }

  function deleteGroup(id: string) {
    if (!confirm('ลบกลุ่มนี้? รายงานทั้งหมดในกลุ่มจะถูกลบด้วย')) return
    setGroups(g => g.filter(gr => gr.id !== id))
    setReports(r => r.filter(rp => rp.groupId !== id))
  }

  function deleteReport(id: string) {
    setReports(r => r.filter(rp => rp.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">รายงานสรุปแผนงาน</h1>
              <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">Admin</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">จัดการรายงานและกลุ่มรายงาน</p>
          </div>
          {showNewGroup ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') setShowNewGroup(false) }}
                placeholder="ชื่อกลุ่ม เช่น การประชุมครั้งที่ 3"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button onClick={addGroup} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">สร้าง</button>
              <button onClick={() => setShowNewGroup(false)} className="px-3 py-2 text-sm text-gray-400 hover:text-gray-600">ยกเลิก</button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewGroup(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              สร้างกลุ่มใหม่
            </button>
          )}
        </div>

        <div className="space-y-4">
          {groups.sort((a, b) => a.order - b.order).map(group => {
            const groupReports = reports.filter(r => r.groupId === group.id)
            const open = expanded.has(group.id)
            return (
              <div key={group.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center px-6 py-4 border-b border-gray-50">
                  <button onClick={() => toggle(group.id)} className="flex items-center gap-3 flex-1 text-left">
                    <svg className="w-4 h-4 text-indigo-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    {editingGroupId === group.id ? (
                      <input
                        autoFocus
                        value={editingGroupName}
                        onChange={e => setEditingGroupName(e.target.value)}
                        onBlur={() => renameGroup(group.id)}
                        onKeyDown={e => { if (e.key === 'Enter') renameGroup(group.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                        onClick={e => e.stopPropagation()}
                        className="font-semibold text-gray-800 border-b-2 border-indigo-400 outline-none bg-transparent"
                      />
                    ) : (
                      <span className="font-semibold text-gray-800">{group.name}</span>
                    )}
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{groupReports.length}</span>
                  </button>

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name) }}
                      className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 rounded px-2 py-1"
                    >
                      เปลี่ยนชื่อ
                    </button>
                    <button
                      onClick={() => deleteGroup(group.id)}
                      className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-1"
                    >
                      ลบ
                    </button>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                {open && (
                  <div className="divide-y divide-gray-50">
                    {groupReports.map(report => (
                      <div key={report.id} className="flex items-center px-6 py-4 hover:bg-gray-50/50">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{report.data.projectName}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {report.data.dept} · ปี {report.data.fiscalYear} · {fmtMillion(report.data.basicInfo.yearInvestment)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                            report.data.status === 'ต่อเนื่อง' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                          }`}>
                            {report.data.status}
                          </span>
                          <Link
                            href={`/report/admin/${group.id}/${report.id}`}
                            className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded px-3 py-1.5 font-medium transition-colors"
                          >
                            แก้ไข
                          </Link>
                          <Link
                            href={`/report/${group.id}/${report.id}`}
                            className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-3 py-1.5 font-medium transition-colors"
                          >
                            ดูตัวอย่าง
                          </Link>
                          <button
                            onClick={() => deleteReport(report.id)}
                            className="text-gray-300 hover:text-red-400 p-1"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="px-6 py-3 bg-gray-50/50 flex gap-2">
                      <button className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1.5 border border-indigo-200 rounded-lg px-3 py-1.5">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        นำเข้าจากโครงการ
                      </button>
                      <button className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                        </svg>
                        สร้างรายงานใหม่
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
