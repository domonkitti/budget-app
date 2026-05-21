"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export default function AdminPage() {
  const [currentYear, setCurrentYear] = useState<number | null>(null)
  const [inputYear, setInputYear] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getActiveYear()
      .then((s) => {
        setCurrentYear(s.active_year)
        setInputYear(String(s.active_year))
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  async function handleSave() {
    const year = parseInt(inputYear, 10)
    if (isNaN(year) || year < 2500 || year > 2700) {
      setError("ปีงบประมาณไม่ถูกต้อง (ต้องอยู่ระหว่าง 2500–2700)")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await api.setActiveYear(year)
      setCurrentYear(result.active_year)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold mb-1">ตั้งค่าระบบ</h1>
      <p className="text-sm text-gray-500 mb-8">การตั้งค่านี้มีผลต่อหน้าโครงการและค่าเริ่มต้นในระบบ</p>

      <div className="bg-white border rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ปีงบประมาณที่ใช้งาน (Active Year)
          </label>
          {currentYear !== null && (
            <p className="text-xs text-gray-400 mb-2">ค่าปัจจุบัน: <span className="font-mono font-semibold text-gray-600">{currentYear}</span></p>
          )}
          <div className="flex gap-3">
            <input
              type="number"
              value={inputYear}
              onChange={(e) => setInputYear(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="เช่น 2570"
              className="border rounded-lg px-3 py-2 text-sm font-mono w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>

        {saved && (
          <p className="text-sm text-green-600 font-medium">บันทึกสำเร็จ — ปีงบประมาณอัปเดตเป็น {currentYear}</p>
        )}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="pt-3 border-t text-xs text-gray-400">
          ปีงบประมาณที่ใช้งานจะเป็นค่าเริ่มต้นของตัวกรองในหน้าโครงการ
        </div>
      </div>
    </div>
  )
}
