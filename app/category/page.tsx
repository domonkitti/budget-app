"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { Category, CategoryValue } from "@/lib/types"

function categoryPath(name: string) {
  return `/category/${encodeURIComponent(name)}`
}

export default function CategoryPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [valueCounts, setValueCounts] = useState<Record<number, number>>({})
  const [newCat, setNewCat] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [addingFor, setAddingFor] = useState<number | null>(null)
  const [valueInput, setValueInput] = useState("")
  const [values, setValues] = useState<Record<number, CategoryValue[]>>({})

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const cats = await api.categories()
      setCategories(cats)
      const entries = await Promise.all(cats.map(async cat => {
        const values = await api.categoryValues(cat.id)
        return [cat.id, values.length] as const
      }))
      setValueCounts(Object.fromEntries(entries))
    } catch (err: unknown) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(loadCategories)
  }, [loadCategories])

  async function addCategory() {
    const name = newCat.trim()
    if (!name) return
    setError("")
    try {
      await api.createAllocationCategory(name)
      setNewCat("")
      await loadCategories()
    } catch {
      setError("Category name already exists")
    }
  }

  async function loadValues(catID: number) {
    const vals = await api.categoryValues(catID)
    setValues(v => ({ ...v, [catID]: vals }))
  }

  async function toggleAdding(catID: number) {
    if (addingFor === catID) {
      setAddingFor(null)
      return
    }
    setAddingFor(catID)
    setValueInput("")
    if (!values[catID]) await loadValues(catID)
  }

  async function addValue(catID: number) {
    const code = valueInput.trim()
    if (!code) return
    setError("")
    try {
      await api.createCategoryValue(catID, code)
      setValueInput("")
      await loadValues(catID)
      setValueCounts(v => ({ ...v, [catID]: (v[catID] ?? 0) + 1 }))
    } catch {
      setError("Value already exists in this category")
    }
  }

  async function deleteValue(catID: number, valID: number) {
    await api.deleteCategoryValue(valID)
    await loadValues(catID)
    setValueCounts(v => ({ ...v, [catID]: Math.max(0, (v[catID] ?? 1) - 1) }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-gray-800">Categories</h1>
        <p className="text-sm text-gray-400">Open a category for summary, then add projects/jobs on its allocation page.</p>
      </header>

      <main className="px-6 py-6 max-w-4xl mx-auto">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex justify-between">
            {error}
            <button onClick={() => setError("")}>x</button>
          </div>
        )}

        <div className="bg-white rounded-lg border p-4 mb-4">
          <h2 className="font-semibold text-gray-700 mb-3">Create New Category</h2>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. SO, Smart Grid, Approval"
              value={newCat}
              onChange={event => setNewCat(event.target.value)}
              onKeyDown={event => event.key === "Enter" && addCategory()}
            />
            <button
              onClick={addCategory}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading...</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {categories.length === 0 && (
              <p className="text-center text-gray-400 py-8 text-sm md:col-span-2">No categories yet</p>
            )}
            {categories.map(cat => (
              <div
                key={cat.id}
                className="bg-white rounded-lg border px-4 py-4 hover:border-blue-400 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link href={categoryPath(cat.name)} className="min-w-0">
                    <div className="font-semibold text-gray-800">{cat.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{valueCounts[cat.id] ?? 0} values</div>
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => toggleAdding(cat.id)}
                      className="text-xs font-medium text-gray-500 hover:text-gray-800 border rounded-lg px-2 py-1"
                    >
                      + Value
                    </button>
                    <Link href={categoryPath(cat.name)} className="text-sm font-medium text-blue-600">Open</Link>
                  </div>
                </div>
                {addingFor === cat.id && (
                  <div className="mt-3 border-t pt-3">
                    {values[cat.id] === undefined ? (
                      <p className="text-xs text-gray-400">Loading values...</p>
                    ) : values[cat.id].length === 0 ? (
                      <p className="text-xs text-gray-400 mb-2">No values yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {values[cat.id].map(val => (
                          <span
                            key={val.id}
                            className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-mono px-2 py-1 rounded-full"
                          >
                            {val.code}
                            <button
                              onClick={() => deleteValue(cat.id, val.id)}
                              className="text-gray-400 hover:text-red-500 leading-none"
                              title="Remove value"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        className="flex-1 border rounded-lg px-2 py-1.5 text-sm"
                        placeholder="e.g. SO4"
                        value={valueInput}
                        onChange={event => setValueInput(event.target.value)}
                        onKeyDown={event => event.key === "Enter" && addValue(cat.id)}
                      />
                      <button
                        onClick={() => addValue(cat.id)}
                        className="px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-medium hover:bg-gray-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
