"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api } from "@/lib/api"
import type { ProjectDiff } from "@/lib/types"

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "number") return v.toLocaleString("th-TH")
  return String(v)
}

const changeBg: Record<string, string> = {
  added: "bg-green-50",
  modified: "bg-yellow-50",
  removed: "bg-red-50",
  unchanged: "",
}

const changeBadge: Record<string, string> = {
  added: "bg-green-100 text-green-700",
  modified: "bg-yellow-100 text-yellow-700",
  removed: "bg-red-100 text-red-700",
  unchanged: "bg-gray-100 text-gray-500",
}

export default function ImportDiffPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [diff, setDiff] = useState<ProjectDiff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    api.importDiff(code)
      .then(setDiff)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [code])

  async function handleAccept() {
    setAccepting(true)
    try {
      await api.importAccept(code)
      router.push("/import")
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
      setAccepting(false)
    }
  }

  if (loading) return <div className="p-8 text-gray-500">กำลังโหลด...</div>
  if (error) return <div className="p-8 text-red-600">เกิดข้อผิดพลาด: {error}</div>
  if (!diff) return null

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/import" className="text-sm text-gray-500 hover:underline mb-4 inline-block">
        ← กลับ
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold font-mono">{code}</h1>
          <p className="text-sm text-gray-500 mt-1">PO version {diff.po_version}</p>
        </div>
        {diff.has_changes && (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {accepting ? "กำลังบันทึก..." : "รับการเปลี่ยนแปลง"}
          </button>
        )}
      </div>

      {!diff.has_changes && (
        <div className="text-gray-500 bg-gray-50 border rounded-lg px-4 py-3 mb-6">
          ไม่มีการเปลี่ยนแปลง
        </div>
      )}

      {diff.project_diffs.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">ข้อมูลโครงการ</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-4 py-2 w-32">ฟิลด์</th>
                  <th className="text-left px-4 py-2">ค่าเดิม (BG)</th>
                  <th className="text-left px-4 py-2">ค่าใหม่ (PO)</th>
                </tr>
              </thead>
              <tbody>
                {diff.project_diffs.map((d, i) => (
                  <tr key={i} className="border-t bg-yellow-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{d.field}</td>
                    <td className="px-4 py-2 text-red-700">{fmt(d.bg_value)}</td>
                    <td className="px-4 py-2 text-green-700">{fmt(d.po_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {diff.sub_job_diffs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">งาน (Sub-jobs)</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-4 py-2">ชื่องาน</th>
                  <th className="text-left px-4 py-2">ประเภทกองทุน</th>
                  <th className="text-left px-4 py-2">ปี</th>
                  <th className="text-left px-4 py-2">การเปลี่ยนแปลง</th>
                  <th className="text-left px-4 py-2">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {diff.sub_job_diffs.map((sj, i) => (
                  <tr key={i} className={`border-t ${changeBg[sj.change] ?? ""}`}>
                    <td className="px-4 py-2">{sj.name}</td>
                    <td className="px-4 py-2">{sj.fund_type}</td>
                    <td className="px-4 py-2">{sj.data_year}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${changeBadge[sj.change] ?? ""}`}>
                        {sj.change}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 space-x-3">
                      {sj.diffs?.map((d, j) => (
                        <span key={j}>
                          {d.field}: <span className="text-red-600">{fmt(d.bg_value)}</span> → <span className="text-green-600">{fmt(d.po_value)}</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
