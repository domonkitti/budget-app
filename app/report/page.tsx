'use client'

import { useEffect, useState, type DragEvent } from 'react'
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
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null)
  const [draggedReport, setDraggedReport] = useState<{ groupId: string; id: string } | null>(null)
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

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

  async function addGroup() {
    if (!newGroupName.trim()) return
    const g = await reportApi.createReportGroup(newGroupName.trim())
    setGroups(gs => [...gs, g])
    setExpanded(s => new Set([...s, g.id]))
    setNewGroupName('')
    setShowNewGroup(false)
  }

  // Reorders groups locally (drag source moves to sit where the drag-over target currently is)
  // and persists the new order to the backend — mirrors ReportView's page drag-reorder pattern.
  function reorderGroup(fromId: string, toId: string) {
    if (fromId === toId) return
    setGroups(gs => {
      const ordered = [...gs].sort((a, b) => a.order - b.order)
      const fromIdx = ordered.findIndex(g => g.id === fromId)
      const toIdx = ordered.findIndex(g => g.id === toId)
      if (fromIdx === -1 || toIdx === -1) return gs
      const [moved] = ordered.splice(fromIdx, 1)
      ordered.splice(toIdx, 0, moved)
      const next = ordered.map((g, i) => ({ ...g, order: i }))
      reportApi.reorderReportGroups(next.map(g => g.id)).catch(() => {})
      return next
    })
  }

  function deleteGroup(id: string) {
    setConfirmState({
      message: 'ลบกลุ่มนี้? รายงานทั้งหมดในกลุ่มจะถูกลบด้วย',
      onConfirm: async () => {
        await reportApi.deleteReportGroup(id)
        setGroups(g => g.filter(gr => gr.id !== id))
        setReports(r => r.filter(rp => rp.groupId !== id))
        setConfirmState(null)
      },
    })
  }

  function deleteReport(id: string) {
    setConfirmState({
      message: 'ลบรายงานนี้?',
      onConfirm: async () => {
        await reportApi.deleteReport(id)
        setReports(r => r.filter(rp => rp.id !== id))
        setConfirmState(null)
      },
    })
  }

  function reorderReport(groupId: string, fromId: string, toId: string) {
    if (fromId === toId) return
    setReports(rs => {
      const groupReports = rs.filter(r => r.groupId === groupId).sort((a, b) => a.order - b.order)
      const others = rs.filter(r => r.groupId !== groupId)
      const fromIdx = groupReports.findIndex(r => r.id === fromId)
      const toIdx = groupReports.findIndex(r => r.id === toId)
      if (fromIdx === -1 || toIdx === -1) return rs
      const [moved] = groupReports.splice(fromIdx, 1)
      groupReports.splice(toIdx, 0, moved)
      const reordered = groupReports.map((rep, i) => ({ ...rep, order: i }))
      reportApi.reorderReports(reordered.map(rep => rep.id)).catch(() => {})
      return [...others, ...reordered]
    })
  }

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">รายงานสรุปแผนงาน</h1>
            <p className="text-sm text-gray-400 mt-1">งบลงทุนเพื่อการดำเนินงานปกติ</p>
          </div>
          <div className="flex items-center gap-2">
            {showNewGroup ? (
              <>
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
              </>
            ) : (
              <button
                onClick={() => setShowNewGroup(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                สร้างกลุ่มใหม่
              </button>
            )}
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
        </div>

        {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}
        {error && <p className="text-sm text-red-500">โหลดข้อมูลไม่สำเร็จ: {error}</p>}

        {!loading && !error && (
        <div className="space-y-4">
          {sortedGroups.map(group => {
            const groupReports = reports.filter(r => r.groupId === group.id).sort((a, b) => a.order - b.order)
            const open = expanded.has(group.id)
            return (
              <div
                key={group.id}
                className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-opacity ${draggedGroup === group.id ? 'opacity-40' : ''}`}
                onDragOver={draggedGroup != null ? (e: DragEvent) => e.preventDefault() : undefined}
                onDragEnter={draggedGroup != null && draggedGroup !== group.id ? () => reorderGroup(draggedGroup, group.id) : undefined}
                onDrop={draggedGroup != null ? (e: DragEvent) => { e.preventDefault(); setDraggedGroup(null) } : undefined}
              >
                <div className="w-full flex items-center px-6 py-4 hover:bg-gray-50 transition-colors">
                  <button
                    onClick={() => toggle(group.id)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <span
                      draggable
                      onClick={e => e.stopPropagation()}
                      onDragStart={e => { e.stopPropagation(); setDraggedGroup(group.id) }}
                      onDragEnd={() => setDraggedGroup(null)}
                      title="ลากเพื่อสลับลำดับกลุ่ม"
                      className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 shrink-0"
                    >
                      ⠿
                    </span>
                    <svg className="w-4 h-4 text-indigo-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                    <span className="font-semibold text-gray-800 truncate">{group.name}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">{groupReports.length} รายการ</span>
                  </button>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => deleteGroup(group.id)}
                      className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-1"
                    >
                      ลบ
                    </button>
                    <svg
                      onClick={() => toggle(group.id)}
                      className={`w-4 h-4 text-gray-400 transition-transform cursor-pointer shrink-0 ${open ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {groupReports.map(report => (
                      <div
                        key={report.id}
                        className={`flex items-center gap-2 px-6 py-4 hover:bg-indigo-50/30 transition-colors group ${draggedReport?.id === report.id ? 'opacity-40' : ''}`}
                        onDragOver={draggedReport?.groupId === group.id ? (e: DragEvent) => e.preventDefault() : undefined}
                        onDragEnter={draggedReport?.groupId === group.id && draggedReport.id !== report.id ? () => reorderReport(group.id, draggedReport.id, report.id) : undefined}
                        onDrop={draggedReport?.groupId === group.id ? (e: DragEvent) => { e.preventDefault(); setDraggedReport(null) } : undefined}
                      >
                        <span
                          draggable
                          onClick={e => e.preventDefault()}
                          onDragStart={e => { e.stopPropagation(); setDraggedReport({ groupId: group.id, id: report.id }) }}
                          onDragEnd={() => setDraggedReport(null)}
                          title="ลากเพื่อสลับลำดับรายงาน"
                          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600 shrink-0"
                        >
                          ⠿
                        </span>
                        <Link
                          href={`/report/${group.id}/${report.id}`}
                          className="flex items-center justify-between flex-1 min-w-0"
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
                        <Link
                          href={`/report/${group.id}/${report.id}`}
                          title="ดูรายงานนี้"
                          className="text-gray-300 hover:text-gray-700 p-1 shrink-0"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </Link>
                        <Link
                          href={`/report/admin/${group.id}/${report.id}`}
                          title="แก้ไขรายงานนี้ (โหมด Admin)"
                          className="text-gray-300 hover:text-indigo-500 p-1 shrink-0"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793 3 14.172V17h2.828l8.379-8.379-2.828-2.828z" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => deleteReport(report.id)}
                          title="ลบรายงานนี้"
                          className="text-gray-300 hover:text-red-400 p-1 shrink-0"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
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

      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmState(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-700 mb-6">{confirmState.message}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmState(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmState.onConfirm}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
