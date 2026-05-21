"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import type { ProjectOverviewItem } from "@/lib/types"

const statusConfig: Record<ProjectOverviewItem["status"], { label: string; className: string }> = {
  has_update:  { label: "มีการอัปเดต", className: "bg-yellow-100 text-yellow-800" },
  new:         { label: "โครงการใหม่", className: "bg-green-100 text-green-800" },
  up_to_date:  { label: "ทันสมัย",    className: "bg-gray-100 text-gray-500" },
  budget_only: { label: "Budget Only", className: "bg-blue-100 text-blue-700" },
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

type GroupKey = "continuing" | "new_plan" | "annual" | "lease"

function getGroup(item: ProjectOverviewItem, activeYear: number): GroupKey {
  if (item.project_type === "L") return "lease"
  if (item.project_type === "Y") return "annual"
  if (item.project_type === "C") {
    return item.project_year < activeYear ? "continuing" : "new_plan"
  }
  return "annual"
}

const groupConfig: Record<GroupKey, { label: string; color: string }> = {
  continuing: { label: "แผนงานต่อเนื่อง",               color: "border-orange-300 bg-orange-50" },
  new_plan:   { label: "แผนงานใหม่",                    color: "border-green-300 bg-green-50" },
  annual:     { label: "งานรายปี",                      color: "border-blue-300 bg-blue-50" },
  lease:      { label: "แผนเช่าที่ไม่ก่อให้เกิดรายได้", color: "border-purple-300 bg-purple-50" },
}

const groupOrder: GroupKey[] = ["continuing", "new_plan", "annual", "lease"]

const TYPE_ORDER: Record<string, number> = { Y: 0, C: 1, L: 2 }
const HMWAT_ORDER = [
  "หมวดสิ่งก่อสร้าง",
  "หมวดเครื่องจักรอุปกรณ์",
  "หมวดเครื่องใช้สำนักงานและเครื่องมือเครื่องใช้ขนาดเล็ก",
  "หมวดวิจัยและพัฒนา",
  "หมวดลงทุนอื่นๆ",
  "หมวดสำรองกรณีจำเป็นเร่งด่วน",
  "หมวดสำรองราคา",
]

function itemNoCompare(a: string | null, b: string | null): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const ap = a.split(".")
  const bp = b.split(".")
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const as_ = ap[i] ?? ""
    const bs_ = bp[i] ?? ""
    const an = parseInt(as_, 10)
    const bn = parseInt(bs_, 10)
    if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn
    const sc = as_.localeCompare(bs_, "th")
    if (sc !== 0) return sc
  }
  return 0
}

function sortItems(items: ProjectOverviewItem[]): ProjectOverviewItem[] {
  return [...items].sort((a, b) => {
    const tDiff = (TYPE_ORDER[a.project_type] ?? 3) - (TYPE_ORDER[b.project_type] ?? 3)
    if (tDiff !== 0) return tDiff
    const ai = HMWAT_ORDER.indexOf(a.group_name ?? "")
    const bi = HMWAT_ORDER.indexOf(b.group_name ?? "")
    const gDiff = (ai === -1 ? HMWAT_ORDER.length : ai) - (bi === -1 ? HMWAT_ORDER.length : bi)
    if (gDiff !== 0) return gDiff
    return itemNoCompare(a.item_no, b.item_no)
  })
}

interface GroupTotals {
  fullPlan: number
  activeYear: number
  count: number
}

export default function ProjectsPage() {
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [items, setItems] = useState<ProjectOverviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.getActiveYear(), api.filterOptions()])
      .then(([setting, opts]) => {
        setActiveYear(setting.active_year)
        setSelectedYear(setting.active_year)
        setAvailableYears(opts.years)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (selectedYear === null) return
    setLoading(true)
    api.projectOverview(selectedYear)
      .then((data) => setItems(sortItems(data)))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedYear])

  if (error) return <div className="p-8 text-red-600">เกิดข้อผิดพลาด: {error}</div>

  const yearOptions = availableYears.length > 0
    ? availableYears
    : selectedYear ? [selectedYear] : []

  const totals = activeYear
    ? groupOrder.reduce<Record<GroupKey, GroupTotals>>((acc, key) => {
        acc[key] = { fullPlan: 0, activeYear: 0, count: 0 }
        return acc
      }, {} as Record<GroupKey, GroupTotals>)
    : null

  if (totals && activeYear) {
    for (const item of items) {
      const key = getGroup(item, activeYear)
      totals[key].fullPlan += item.full_plan_budget
      totals[key].activeYear += item.active_year_budget
      totals[key].count++
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">โครงการทั้งหมด</h1>
          {activeYear && (
            <p className="text-sm text-gray-500 mt-0.5">ปีงบประมาณที่ใช้งาน: {activeYear}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">แสดงปี:</label>
          <select
            value={selectedYear ?? ""}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}{y === activeYear ? " (ปัจจุบัน)" : ""}
              </option>
            ))}
          </select>
          <Link href="/import/log" className="text-sm text-blue-600 hover:underline">
            ประวัติการนำเข้า →
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && totals && activeYear && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {groupOrder.map((key) => {
            const cfg = groupConfig[key]
            const t = totals[key]
            return (
              <div key={key} className={`border rounded-xl p-4 ${cfg.color}`}>
                <div className="text-xs font-semibold text-gray-600 mb-2 leading-tight">{cfg.label}</div>
                <div className="space-y-1">
                  <div>
                    <div className="text-xs text-gray-400">วงเงินเต็มแผน</div>
                    <div className="font-mono text-sm font-semibold text-gray-800">{fmt(t.fullPlan)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">งบปี {selectedYear}</div>
                    <div className="font-mono text-sm font-semibold text-gray-800">{fmt(t.activeYear)}</div>
                  </div>
                  <div className="text-xs text-gray-400 pt-1">{t.count} โครงการ</div>
                </div>
              </div>
            )
          })}
          {/* Grand total */}
          <div className="border-2 border-gray-400 rounded-xl p-4 bg-gray-50">
            <div className="text-xs font-semibold text-gray-700 mb-2 leading-tight">รวมทั้งหมด</div>
            <div className="space-y-1">
              <div>
                <div className="text-xs text-gray-400">วงเงินเต็มแผน</div>
                <div className="font-mono text-sm font-bold text-gray-900">
                  {fmt(groupOrder.reduce((s, k) => s + totals[k].fullPlan, 0))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400">งบปี {selectedYear}</div>
                <div className="font-mono text-sm font-bold text-gray-900">
                  {fmt(groupOrder.reduce((s, k) => s + totals[k].activeYear, 0))}
                </div>
              </div>
              <div className="text-xs text-gray-400 pt-1">
                {groupOrder.reduce((s, k) => s + totals[k].count, 0)} โครงการ
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 py-12 text-center">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="text-gray-400 py-12 text-center">ไม่มีโครงการที่มีงบประมาณในปี {selectedYear}</div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600">โครงการ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-32">สถานะ</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 w-44">วงเงินเต็มแผน (ลงทุน)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 w-44">
                  งบปี {selectedYear} (ลงทุน)
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                const cfg = statusConfig[item.status]
                const actionable = item.status === "has_update" || item.status === "new"
                return (
                  <tr key={item.project_code} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">{item.project_code}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {fmt(item.full_plan_budget)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {fmt(item.active_year_budget)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {actionable && (
                        <Link
                          href={`/import/${item.project_code}`}
                          className="text-blue-600 hover:underline text-xs whitespace-nowrap"
                        >
                          ดู diff →
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
