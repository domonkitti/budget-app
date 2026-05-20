"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api } from "@/lib/api"
import type { ProjectDiff, ProjectDetail } from "@/lib/types"

const fieldLabel: Record<string, string> = {
  name: "ชื่อโครงการ",
  division: "ฝ่าย",
  department: "แผนก",
  group_name: "หมวด",
  item_no: "เลขที่รายการ",
}

const changeLabel: Record<string, string> = {
  added: "เพิ่มใหม่",
  modified: "แก้ไข",
  removed: "ลบออก",
  unchanged: "เหมือนเดิม",
}

const changeBadge: Record<string, string> = {
  added: "bg-green-100 text-green-700",
  modified: "bg-yellow-100 text-yellow-700",
  removed: "bg-red-100 text-red-700",
  unchanged: "bg-gray-100 text-gray-400",
}

function fmtNum(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "number") return v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  return String(v)
}

const border = "0.5px solid #E5E7EB"
const th = (extra?: React.CSSProperties): React.CSSProperties => ({
  border, padding: "6px 12px", background: "#F9FAFB",
  color: "#6B7280", fontWeight: 600, fontSize: 11,
  textAlign: "center", whiteSpace: "nowrap", ...extra,
})
const td = (extra?: React.CSSProperties): React.CSSProperties => ({
  border, padding: "5px 10px", fontSize: 12, color: "#374151", ...extra,
})

export default function ImportDiffPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [diff, setDiff] = useState<ProjectDiff | null>(null)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    Promise.all([
      api.importDiff(code),
      api.projectDetail(code).catch(() => null),
    ]).then(([d, p]) => {
      setDiff(d)
      setProject(p)
    }).catch((e: Error) => setError(e.message))
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

  const nameDiff = diff.project_diffs.find(d => d.field === "name")
  const currentName = project?.name ?? (nameDiff ? String(nameDiff.bg_value) : code)
  const otherDiffs = diff.project_diffs.filter(d => d.field !== "name")

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/import" className="text-sm text-gray-500 hover:underline mb-4 inline-block">
        ← กลับ
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">{currentName}</h1>
          {nameDiff && (
            <div className="mt-1 text-sm">
              <span className="text-gray-400">ชื่อใหม่: </span>
              <span className="text-green-700 font-medium">{String(nameDiff.po_value)}</span>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1 font-mono">{code} · PO v{diff.po_version}</p>
        </div>
        {diff.has_changes ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {accepting ? "กำลังบันทึก..." : "รับการเปลี่ยนแปลง"}
          </button>
        ) : (
          <span className="text-sm text-gray-400 bg-gray-50 border rounded-lg px-3 py-2">ไม่มีการเปลี่ยนแปลง</span>
        )}
      </div>

      {/* Other project field diffs */}
      {otherDiffs.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">ข้อมูลทั่วไป</h2>
          <div className="rounded-lg overflow-hidden" style={{ border }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th({ textAlign: "left" })}>รายการ</th>
                  <th style={th()}>ข้อมูลเดิม</th>
                  <th style={th()}>ข้อมูลใหม่ (PO)</th>
                </tr>
              </thead>
              <tbody>
                {otherDiffs.map((d, i) => (
                  <tr key={i}>
                    <td style={td()}>{fieldLabel[d.field] ?? d.field}</td>
                    <td style={td({ textAlign: "center", color: "#DC2626" })}>{String(d.bg_value ?? "—")}</td>
                    <td style={td({ textAlign: "center", color: "#16A34A", fontWeight: 600 })}>{String(d.po_value ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Sub-job table */}
      {diff.sub_job_diffs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 mb-2">รายการงาน</h2>
          <div className="rounded-lg overflow-hidden" style={{ border }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th({ textAlign: "left" })}>ชื่องาน</th>
                  <th style={th()}>ประเภท</th>
                  <th style={th()}>ปี</th>
                  <th style={th()}>สถานะ</th>
                  <th style={th()}>งบประมาณ เดิม</th>
                  <th style={th({ background: "#EFF6FF" })}>งบประมาณ ใหม่</th>
                  <th style={th()}>เป้าหมาย เดิม</th>
                  <th style={th({ background: "#EFF6FF" })}>เป้าหมาย ใหม่</th>
                </tr>
              </thead>
              <tbody>
                {diff.sub_job_diffs.map((sj, i) => {
                  const budgetDiff = sj.diffs?.find(d => d.field === "budget")
                  const targetDiff = sj.diffs?.find(d => d.field === "target")
                  const isAdded = sj.change === "added"
                  const isRemoved = sj.change === "removed"
                  const isUnchanged = sj.change === "unchanged"
                  const budgetChanged = !!budgetDiff && !isUnchanged
                  const targetChanged = !!targetDiff && !isUnchanged

                  const rowBg = isAdded ? "#F0FDF4" : isRemoved ? "#FEF2F2" : ""
                  const grayText = { color: "#9CA3AF" }

                  return (
                    <tr key={i}>
                      <td style={td({ background: rowBg, color: isUnchanged ? "#9CA3AF" : "#374151" })}>{sj.name}</td>
                      <td style={td({ textAlign: "center", background: rowBg, ...(isUnchanged ? grayText : {}) })}>{sj.fund_type}</td>
                      <td style={td({ textAlign: "center", background: rowBg, ...(isUnchanged ? grayText : {}) })}>{sj.data_year}</td>
                      <td style={td({ textAlign: "center", background: rowBg })}>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${changeBadge[sj.change] ?? ""}`}>
                          {changeLabel[sj.change] ?? sj.change}
                        </span>
                      </td>
                      {/* Budget old */}
                      <td style={td({ textAlign: "right", background: rowBg, ...(isUnchanged ? grayText : {}) })}>
                        {isAdded ? "—" : fmtNum(budgetDiff?.bg_value)}
                      </td>
                      {/* Budget new — highlight if changed */}
                      <td style={td({ textAlign: "right", background: budgetChanged ? "#FEF9C3" : rowBg || "#F8FAFF", fontWeight: budgetChanged ? 600 : undefined, color: isAdded ? "#16A34A" : isRemoved ? "#DC2626" : budgetChanged ? "#16A34A" : "#9CA3AF" })}>
                        {isRemoved ? "—" : fmtNum(budgetDiff?.po_value)}
                      </td>
                      {/* Target old */}
                      <td style={td({ textAlign: "right", background: rowBg, ...(isUnchanged ? grayText : {}) })}>
                        {isAdded ? "—" : fmtNum(targetDiff?.bg_value)}
                      </td>
                      {/* Target new — highlight if changed */}
                      <td style={td({ textAlign: "right", background: targetChanged ? "#FEF9C3" : rowBg || "#F8FAFF", fontWeight: targetChanged ? 600 : undefined, color: isAdded ? "#16A34A" : isRemoved ? "#DC2626" : targetChanged ? "#16A34A" : "#9CA3AF" })}>
                        {isRemoved ? "—" : fmtNum(targetDiff?.po_value)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
