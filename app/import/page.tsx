"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import type { ImportStatus } from "@/lib/types"

const statusConfig: Record<ImportStatus["status"], { label: string; className: string }> = {
  has_update: { label: "มีการอัปเดต", className: "bg-yellow-100 text-yellow-800" },
  new: { label: "โครงการใหม่", className: "bg-green-100 text-green-800" },
  up_to_date: { label: "ทันสมัย", className: "bg-gray-100 text-gray-500" },
}

export default function ImportPage() {
  const [statuses, setStatuses] = useState<ImportStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.importVersions()
      .then(setStatuses)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-gray-500">กำลังโหลด...</div>
  if (error) return <div className="p-8 text-red-600">เกิดข้อผิดพลาด: {error}</div>

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">นำเข้าข้อมูลจาก PO</h1>
        <Link href="/import/log" className="text-sm text-blue-600 hover:underline">
          ดูประวัติการนำเข้า →
        </Link>
      </div>

      <div className="space-y-2">
        {statuses.map((s) => {
          const cfg = statusConfig[s.status]
          const actionable = s.status !== "up_to_date"
          return (
            <div key={s.project_code} className="flex items-center justify-between border rounded-lg px-4 py-3 bg-white">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
                  {cfg.label}
                </span>
                <span className="font-mono font-medium">{s.project_code}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {s.po_updated_at && (
                  <span>PO อัปเดต: {new Date(s.po_updated_at).toLocaleDateString("th-TH")}</span>
                )}
                {s.last_accepted_at && (
                  <span>รับล่าสุด: {new Date(s.last_accepted_at).toLocaleDateString("th-TH")}</span>
                )}
                {actionable ? (
                  <Link href={`/import/${s.project_code}`} className="text-blue-600 hover:underline">
                    ดู diff →
                  </Link>
                ) : (
                  <span className="text-gray-400">ทันสมัย</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {statuses.length === 0 && (
        <p className="text-gray-500 mt-4">ไม่มีข้อมูลโครงการ</p>
      )}
    </div>
  )
}
