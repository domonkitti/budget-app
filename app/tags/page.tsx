"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { TagCategory, TagValue } from "@/lib/types"

export default function TagsPage() {
  const [categories, setCategories] = useState<TagCategory[]>([])
  const [values, setValues] = useState<Record<number, TagValue[]>>({})
  const [newCat, setNewCat] = useState("")
  const [newVal, setNewVal] = useState<Record<number, string>>({})
  const [expanded, setExpanded] = useState<number | null>(null)
  const [error, setError] = useState("")

  useEffect(() => { loadCategories() }, [])

  async function loadCategories() {
    const cats = await api.tagCategories()
    setCategories(cats)
  }

  async function loadValues(catID: number) {
    const vals = await api.tagValues(catID)
    setValues(v => ({ ...v, [catID]: vals }))
  }

  async function addCategory() {
    if (!newCat.trim()) return
    try {
      await api.createCategory(newCat.trim())
      setNewCat("")
      loadCategories()
    } catch { setError("Category name already exists") }
  }

  async function deleteCategory(id: number) {
    if (!confirm("Delete this category and all its values?")) return
    await api.deleteCategory(id)
    loadCategories()
  }

  async function addValue(catID: number) {
    const code = (newVal[catID] ?? "").trim()
    if (!code) return
    try {
      await api.createValue(catID, code)
      setNewVal(v => ({ ...v, [catID]: "" }))
      loadValues(catID)
    } catch { setError("Value already exists in this category") }
  }

  async function deleteValue(catID: number, valID: number) {
    await api.deleteValue(valID)
    loadValues(catID)
  }

  function toggle(catID: number) {
    if (expanded === catID) {
      setExpanded(null)
    } else {
      setExpanded(catID)
      loadValues(catID)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <a href="/" className="text-sm text-blue-500 hover:underline">← Dashboard</a>
        <h1 className="text-xl font-bold text-gray-800 mt-1">Tag Management</h1>
        <p className="text-sm text-gray-400">Create grouping categories and values</p>
      </header>

      <main className="px-6 py-6 max-w-2xl mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex justify-between">
            {error}
            <button onClick={() => setError("")}>✕</button>
          </div>
        )}

        {/* Add category */}
        <div className="bg-white rounded-xl border p-4 mb-4">
          <h2 className="font-semibold text-gray-700 mb-3">New Category</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. SO, Smart Grid, Approval..."
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addCategory()}
            />
            <button
              onClick={addCategory}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        </div>

        {/* Category list */}
        <div className="space-y-2">
          {categories.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">No categories yet — add one above</p>
          )}
          {categories.map(cat => (
            <div key={cat.id} className="bg-white rounded-xl border overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => toggle(cat.id)}
              >
                <span className="font-medium text-gray-800">{cat.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    {values[cat.id]?.length ?? "?"} values
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); deleteCategory(cat.id) }}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    Delete
                  </button>
                  <span className="text-gray-400">{expanded === cat.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {expanded === cat.id && (
                <div className="border-t px-4 py-3">
                  {/* Values list */}
                  <div className="space-y-1 mb-3">
                    {(values[cat.id] ?? []).map(val => (
                      <div key={val.id} className="flex items-center justify-between py-1">
                        <span className="text-sm text-gray-700 font-mono">{val.code}</span>
                        <button
                          onClick={() => deleteValue(cat.id, val.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {(values[cat.id] ?? []).length === 0 && (
                      <p className="text-xs text-gray-400 py-1">No values yet</p>
                    )}
                  </div>

                  {/* Add value */}
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                      placeholder="e.g. SO1, SO2, approved..."
                      value={newVal[cat.id] ?? ""}
                      onChange={e => setNewVal(v => ({ ...v, [cat.id]: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && addValue(cat.id)}
                    />
                    <button
                      onClick={() => addValue(cat.id)}
                      className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
