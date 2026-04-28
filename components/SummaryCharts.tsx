"use client"

import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts"
import type { FlatProject } from "@/lib/types"

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"]

function fmt(n: number) {
  return (n / 1e6).toFixed(1) + "M"
}

function projectSum(p: FlatProject) {
  return p.source_breakdown.reduce(
    (acc, e) => ({ budget: acc.budget + e.budget, target: acc.target + e.target, remain: acc.remain + e.remain }),
    { budget: 0, target: 0, remain: 0 }
  )
}

type Props = { data: FlatProject[] }

export default function SummaryCharts({ data }: Props) {
  const total = data.reduce(
    (acc, p) => {
      const s = projectSum(p)
      return { budget: acc.budget + s.budget, target: acc.target + s.target, remain: acc.remain + s.remain }
    },
    { budget: 0, target: 0, remain: 0 }
  )

  const byDivision = Object.values(
    data.reduce<Record<string, { name: string; budget: number; target: number }>>((acc, p) => {
      const key = p.division ?? "N/A"
      if (!acc[key]) acc[key] = { name: key, budget: 0, target: 0 }
      const s = projectSum(p)
      acc[key].budget += s.budget
      acc[key].target += s.target
      return acc
    }, {})
  ).sort((a, b) => b.budget - a.budget).slice(0, 8)

  const pieData = [
    { name: "Used", value: total.target },
    { name: "Remain", value: total.remain },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="bg-white rounded-xl border p-4 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Overview</h3>
        {[
          { label: "Budget", value: total.budget, color: "text-blue-600" },
          { label: "Target", value: total.target, color: "text-emerald-600" },
          { label: "Remain", value: total.remain, color: "text-amber-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{label}</span>
            <span className={`text-lg font-bold ${color}`}>{fmt(value)}</span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">By Division</h3>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={byDivision} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => (v / 1e6).toFixed(0)} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Bar dataKey="budget" fill="#3b82f6" name="Budget" radius={[3, 3, 0, 0]} />
            <Bar dataKey="target" fill="#10b981" name="Target" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Budget Usage</h3>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value">
              {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
            </Pie>
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
