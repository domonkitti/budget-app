"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { TagCategory, TagValue, SubJobTag, SubJobTagInput } from "@/lib/types"

type Props = {
  projectId: number
  projectCode: string
  subJobName: string
  onClose: () => void
}

type Draft = Record<number, { valueId: number; percentage: number }[]>

export default function TagPanel({ projectId, projectCode, subJobName, onClose }: Props) {
  const [categories, setCategories] = useState<TagCategory[]>([])
  const [allValues, setAllValues] = useState<Record<number, TagValue[]>>({})
  const [draft, setDraft] = useState<Draft>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [errors, setErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    loadAll()
  }, [projectId, subJobName])

  async function loadAll() {
    const cats = await api.tagCategories()
    setCategories(cats)

    const valMap: Record<number, TagValue[]> = {}
    await Promise.all(cats.map(async c => {
      valMap[c.id] = await api.tagValues(c.id)
    }))
    setAllValues(valMap)

    const existing = await api.subJobTags(projectId, subJobName)
    const draftMap: Draft = {}
    for (const tag of existing) {
      if (!draftMap[tag.category_id]) draftMap[tag.category_id] = []
      draftMap[tag.category_id].push({ valueId: tag.tag_value_id, percentage: tag.percentage })
    }
    setDraft(draftMap)
  }

  function total(catID: number) {
    return (draft[catID] ?? []).reduce((s, t) => s + (t.percentage || 0), 0)
  }

  function addRow(catID: number) {
    setDraft(d => ({ ...d, [catID]: [...(d[catID] ?? []), { valueId: 0, percentage: 0 }] }))
  }

  function removeRow(catID: number, idx: number) {
    setDraft(d => ({ ...d, [catID]: d[catID].filter((_, i) => i !== idx) }))
  }

  function fillRemaining(catID: number, idx: number) {
    const others = (draft[catID] ?? []).reduce((s, t, i) => i !== idx ? s + (t.percentage || 0) : s, 0)
    const remaining = Math.round((100 - others) * 100) / 100
    setDraft(d => ({
      ...d,
      [catID]: d[catID].map((t, i) => i === idx ? { ...t, percentage: remaining } : t),
    }))
  }

  async function save(catID: number) {
    const rows = draft[catID] ?? []
    const t = total(catID)
    if (rows.length > 0 && (t < 99.99 || t > 100.01)) {
      setErrors(e => ({ ...e, [catID]: `Total is ${t.toFixed(2)}% — must be exactly 100%` }))
      return
    }
    if (rows.some(r => !r.valueId)) {
      setErrors(e => ({ ...e, [catID]: "All rows must have a value selected" }))
      return
    }
    setErrors(e => ({ ...e, [catID]: "" }))
    setSaving(catID)
    try {
      const tags: SubJobTagInput[] = rows.map(r => ({ tag_value_id: r.valueId, percentage: r.percentage }))
      await api.setSubJobTags(projectId, subJobName, catID, tags)
    } catch (err: unknown) {
      setErrors(e => ({ ...e, [catID]: String(err) }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white border-l shadow-xl flex flex-col z-50">
      {/* Header */}
      <div className="px-5 py-4 border-b">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono">{projectCode}</p>
            <h2 className="font-semibold text-gray-800 mt-0.5 leading-tight">{subJobName}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {categories.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">
            No categories yet.{" "}
            <a href="/tags" className="text-blue-500 hover:underline">Create categories first →</a>
          </div>
        )}

        {categories.map(cat => {
          const rows = draft[cat.id] ?? []
          const t = total(cat.id)
          const isValid = rows.length === 0 || (t >= 99.99 && t <= 100.01)

          return (
            <div key={cat.id} className="border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                <span className="font-medium text-sm text-gray-700">{cat.name}</span>
                <span className={`text-xs font-mono font-semibold ${isValid ? "text-emerald-600" : "text-red-500"}`}>
                  {t.toFixed(2)}%
                </span>
              </div>

              <div className="px-3 py-2 space-y-2">
                {rows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      className="flex-1 border rounded px-2 py-1 text-sm"
                      value={row.valueId}
                      onChange={e => setDraft(d => ({
                        ...d,
                        [cat.id]: d[cat.id].map((r, i) => i === idx ? { ...r, valueId: Number(e.target.value) } : r),
                      }))}
                    >
                      <option value={0}>— select —</option>
                      {(allValues[cat.id] ?? []).map(v => (
                        <option key={v.id} value={v.id}>{v.code}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="w-20 border rounded px-2 py-1 text-sm text-right"
                      value={row.percentage || ""}
                      placeholder="%"
                      onChange={e => setDraft(d => ({
                        ...d,
                        [cat.id]: d[cat.id].map((r, i) => i === idx ? { ...r, percentage: Number(e.target.value) } : r),
                      }))}
                    />
                    <button
                      title="Fill remaining"
                      onClick={() => fillRemaining(cat.id, idx)}
                      className="text-blue-400 hover:text-blue-600 text-sm"
                    >↺</button>
                    <button
                      onClick={() => removeRow(cat.id, idx)}
                      className="text-red-400 hover:text-red-600 text-sm"
                    >✕</button>
                  </div>
                ))}

                {errors[cat.id] && (
                  <p className="text-xs text-red-500">{errors[cat.id]}</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => addRow(cat.id)}
                    className="text-xs text-blue-500 hover:underline"
                  >
                    + Add value
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => save(cat.id)}
                    disabled={saving === cat.id}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving === cat.id ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-5 py-3 border-t">
        <a href="/tags" className="text-xs text-blue-500 hover:underline">Manage categories →</a>
      </div>
    </div>
  )
}
