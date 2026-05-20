"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import type { ImportLog } from "@/lib/types"

export default function ImportLogPage() {
  const [logs, setLogs] = useState<ImportLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.importLog()
      .then(setLogs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-gray-500">กำลังโหลด...</div>
  if (error) return <div className="p-8 text-red-600">เกิดข้อผิดพลาด: {error}</div>

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/import" className="text-sm text-gray-500 hover:underline">← กลับ</Link>
        <h1 className="text-2xl font-semibold">ประวัติการนำเข้าข้อมูล</h1>
      </div>

      {logs.length === 0 ? (
        <p className="text-gray-500">ยังไม่มีประวัติการนำเข้า</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs">
              <tr>
                <th className="text-left px-4 py-2 w-12">#</th>
                <th className="text-left px-4 py-2">รหัสโครงการ</th>
                <th className="text-left px-4 py-2">PO Version</th>
                <th className="text-left px-4 py-2">บันทึกโดย</th>
                <th className="text-left px-4 py-2">วันที่</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400">{log.id}</td>
                  <td className="px-4 py-2 font-mono font-medium">
                    <Link href={`/import/${log.project_code}`} className="text-blue-600 hover:underline">
                      {log.project_code}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{log.po_version}</td>
                  <td className="px-4 py-2">{log.accepted_by}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(log.accepted_at).toLocaleString("th-TH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
