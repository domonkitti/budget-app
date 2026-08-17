"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { api } from "@/lib/api"
import type { FilterOptions, ProjectOverviewItem } from "@/lib/types"

const statusConfig: Record<ProjectOverviewItem["status"], { label: string; className: string }> = {
  has_update:  { label: "มีการอัปเดต", className: "bg-yellow-100 text-yellow-800" },
  new:         { label: "โครงการใหม่", className: "bg-green-100 text-green-800" },
  up_to_date:  { label: "ทันสมัย",    className: "bg-gray-100 text-gray-500" },
  budget_only: { label: "Budget Only", className: "bg-blue-100 text-blue-700" },
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

type GroupKey = "continuing" | "new_plan" | "annual" | "lease" | "change_annual" | "change_plan"

function getGroup(item: ProjectOverviewItem, activeYear: number): GroupKey {
  if (item.project_type === "L") return "lease"
  if (item.project_type === "Y") return "annual"
  if (item.project_type === "CY") return "change_annual"
  if (item.project_type === "CC") return "change_plan"
  if (item.project_type === "C") {
    return item.project_year < activeYear ? "continuing" : "new_plan"
  }
  return "annual"
}

const groupConfig: Record<GroupKey, { label: string; color: string }> = {
  continuing:    { label: "แผนงานต่อเนื่อง",               color: "border-orange-300 bg-orange-50" },
  new_plan:      { label: "แผนงานใหม่",                    color: "border-green-300 bg-green-50" },
  annual:        { label: "งานรายปี",                      color: "border-blue-300 bg-blue-50" },
  lease:         { label: "แผนเช่าที่ไม่ก่อให้เกิดรายได้", color: "border-purple-300 bg-purple-50" },
  change_annual: { label: "เปลี่ยนแปลงงบรายปี",            color: "border-cyan-300 bg-cyan-50" },
  change_plan:   { label: "เปลี่ยนแปลงแผนงาน",             color: "border-rose-300 bg-rose-50" },
}

const groupOrder: GroupKey[] = ["continuing", "new_plan", "annual", "lease", "change_annual", "change_plan"]

const TYPE_ORDER: Record<string, number> = { Y: 0, CY: 1, C: 2, CC: 3, L: 4 }
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

const HMWAT_OPTIONS = [
  "หมวดสิ่งก่อสร้าง",
  "หมวดเครื่องจักรอุปกรณ์",
  "หมวดเครื่องใช้สำนักงานและเครื่องมือเครื่องใช้ขนาดเล็ก",
  "หมวดวิจัยและพัฒนา",
  "หมวดลงทุนอื่นๆ",
  "หมวดสำรองกรณีจำเป็นเร่งด่วน",
  "หมวดสำรองราคา",
]

interface CreateForm {
  name: string
  project_type: string
  year: string
  division: string
  department: string
  group_name: string
}

function CreateProjectModal({ filterOpts, activeYear, onClose, onCreated }: {
  filterOpts: FilterOptions
  activeYear: number
  onClose: () => void
  onCreated: (code: string) => void
}) {
  const [form, setForm] = useState<CreateForm>({
    name: "", project_type: "Y", year: String(activeYear),
    division: "", department: "", group_name: "",
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function set(field: keyof CreateForm, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const p = await api.createProject({
        name: form.name,
        project_type: form.project_type,
        year: Number(form.year),
        division: form.division || null,
        department: form.department || null,
        group_name: (form.project_type === "Y" || form.project_type === "CY") ? (form.group_name || null) : null,
        item_no: "xx",
      })
      onCreated(p.project_code)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4">สร้างโครงการใหม่</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อโครงการ <span className="text-red-500">*</span></label>
            <input
              className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name} onChange={e => set("name", e.target.value)} required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ปีงบประมาณ <span className="text-red-500">*</span></label>
              <input
                type="number" min="2500" max="2600"
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.year} onChange={e => set("year", e.target.value)} required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท <span className="text-red-500">*</span></label>
              <select
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.project_type} onChange={e => set("project_type", e.target.value)}
              >
                <option value="Y">Y — งานรายปี</option>
                <option value="CY">CY — เปลี่ยนแปลงงบรายปี</option>
                <option value="C">C — แผนงาน</option>
                <option value="CC">CC — เปลี่ยนแปลงแผนงาน</option>
                <option value="L">L — สัญญาเช่า</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">กอง</label>
              <select
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.division} onChange={e => set("division", e.target.value)}
              >
                <option value="">— ไม่ระบุ —</option>
                {filterOpts.divisions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สายงาน</label>
              <select
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.department} onChange={e => set("department", e.target.value)}
              >
                <option value="">— ไม่ระบุ —</option>
                {filterOpts.departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          {(form.project_type === "Y" || form.project_type === "CY") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมวด</label>
              <select
                className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.group_name} onChange={e => set("group_name", e.target.value)}
              >
                <option value="">— ไม่ระบุ —</option>
                {HMWAT_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-1.5 text-sm rounded-md border hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "กำลังสร้าง..." : "สร้างโครงการ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const [activeYear, setActiveYear] = useState<number | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [items, setItems] = useState<ProjectOverviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    Promise.all([api.getActiveYear(), api.filterOptions()])
      .then(([setting, opts]) => {
        setActiveYear(setting.active_year)
        setSelectedYear(setting.active_year)
        setAvailableYears(opts.years)
        setFilterOpts(opts)
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
      {showCreate && filterOpts && activeYear && (
        <CreateProjectModal
          filterOpts={filterOpts}
          activeYear={activeYear}
          onClose={() => setShowCreate(false)}
          onCreated={(code) => router.push(`/projects/${code}`)}
        />
      )}
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
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            + สร้างโครงการ
          </button>
          <Link href="/import/ai2" className="text-sm text-blue-600 hover:underline">
            นำเข้าด้วย AI →
          </Link>
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
