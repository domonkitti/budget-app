"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import type { AIImport2PreviewResult, AIImport2ApplyResult, AIImport2Item, AIImport2CarryoverCandidate } from "@/lib/types"
import { I_9CH_PROMPT, P_PROJECT_PROMPT } from "@/lib/aiImportPrompts"

function fmt3(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function fmtM(n: number) {
  if (n === 0) return <span className="text-gray-300">-</span>
  return <>{fmt3(n)}</>
}

const TYPE_LABELS: Record<string, string> = {
  Y: "งานรายปี", C: "แผนระยะยาว", L: "สัญญาเช่า", P: "งบโครงการ",
}

// CY/CC rows update the same project_code as the Y/C project they revise —
// fold them together for display, same convention baseProjectType uses server-side.
function baseType(t: string): string {
  return t === "CY" ? "Y" : t === "CC" ? "C" : t
}

type CompareRow = { project_type: string; oldC: number; oldI: number; newC: number; newI: number }

// computeComparison sums every item's old/new budget (regardless of group —
// a "needs_check" row still becomes a new project on Apply if nobody
// matches it, so it counts too) grouped by type. Computed from the exact
// same `items` array the detail tables below render, so this summary can
// never show a different picture than what's actually about to happen.
function computeComparison(items: AIImport2Item[]): CompareRow[] {
  const agg = new Map<string, CompareRow>()
  for (const it of items) {
    const t = baseType(it.project_type)
    const row = agg.get(t) ?? { project_type: t, oldC: 0, oldI: 0, newC: 0, newI: 0 }
    row.oldC += it.old_budget_committed
    row.oldI += it.old_budget_invest
    row.newC += it.new_budget_committed
    row.newI += it.new_budget_invest
    agg.set(t, row)
  }
  return [...agg.values()].sort((a, b) => a.project_type.localeCompare(b.project_type))
}

function CompareTable2({ rows }: { rows: CompareRow[] }) {
  if (rows.length === 0) return null
  const tdNum = "py-1 px-2 text-right tabular-nums text-xs whitespace-nowrap"
  const th = "py-1 px-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap"
  const grand = rows.reduce((acc, r) => ({
    oldC: acc.oldC + r.oldC, oldI: acc.oldI + r.oldI, newC: acc.newC + r.newC, newI: acc.newI + r.newI,
  }), { oldC: 0, oldI: 0, newC: 0, newI: 0 })
  const grandOldTotal = grand.oldC + grand.oldI
  const grandNewTotal = grand.newC + grand.newI
  const dColor = (v: number) => v > 0 ? "text-green-600" : v < 0 ? "text-red-600" : "text-gray-300"
  const dStr = (v: number) => v === 0 ? "-" : (v > 0 ? "+" : "") + fmt3(v)
  return (
    <div className="mb-6 bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">สรุปถ้านำเข้าทั้งหมด — วงเงินดำเนินการ เปรียบเทียบก่อน/หลัง</h3>
        <span className="text-xs text-gray-400">หน่วย:ล้านบาท</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="text-left py-1 px-2 font-medium text-xs" rowSpan={2}>ประเภท</th>
              <th className="text-center py-1 px-2 font-medium text-xs border-l" colSpan={3}>เดิม</th>
              <th className="text-center py-1 px-2 font-medium text-xs border-l" colSpan={3}>ใหม่</th>
              <th className="text-center py-1 px-2 font-medium text-xs border-l" colSpan={3}>ผลต่าง</th>
            </tr>
            <tr className="border-b text-gray-400">
              <th className={`${th} border-l`}>ผูกพัน</th><th className={th}>ลงทุน</th><th className={th}>รวม</th>
              <th className={`${th} border-l`}>ผูกพัน</th><th className={th}>ลงทุน</th><th className={th}>รวม</th>
              <th className={`${th} border-l`}>ผูกพัน</th><th className={th}>ลงทุน</th><th className={th}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const oldTotal = r.oldC + r.oldI
              const newTotal = r.newC + r.newI
              const dC = r.newC - r.oldC
              const dI = r.newI - r.oldI
              const dTotal = newTotal - oldTotal
              return (
                <tr key={r.project_type} className="border-b border-gray-50">
                  <td className="py-1 px-2 font-medium text-xs text-gray-700">{TYPE_LABELS[r.project_type] ?? r.project_type}</td>
                  <td className={`${tdNum} border-l text-gray-500`}>{fmtM(r.oldC)}</td>
                  <td className={`${tdNum} text-gray-500`}>{fmtM(r.oldI)}</td>
                  <td className={`${tdNum} text-gray-600 font-medium`}>{fmtM(oldTotal)}</td>
                  <td className={`${tdNum} border-l text-blue-500`}>{fmtM(r.newC)}</td>
                  <td className={`${tdNum} text-blue-500`}>{fmtM(r.newI)}</td>
                  <td className={`${tdNum} text-blue-600 font-medium`}>{fmtM(newTotal)}</td>
                  <td className={`${tdNum} border-l font-medium ${dColor(dC)}`}>{dStr(dC)}</td>
                  <td className={`${tdNum} font-medium ${dColor(dI)}`}>{dStr(dI)}</td>
                  <td className={`${tdNum} font-semibold ${dColor(dTotal)}`}>{dStr(dTotal)}</td>
                </tr>
              )
            })}
            <tr className="bg-gray-100 border-t">
              <td className="py-1 px-2 font-bold text-xs text-gray-700">รวมทั้งหมด</td>
              <td className={`${tdNum} border-l font-bold text-gray-700`}>{fmtM(grand.oldC)}</td>
              <td className={`${tdNum} font-bold text-gray-700`}>{fmtM(grand.oldI)}</td>
              <td className={`${tdNum} font-bold text-gray-700`}>{fmtM(grandOldTotal)}</td>
              <td className={`${tdNum} border-l font-bold text-blue-700`}>{fmtM(grand.newC)}</td>
              <td className={`${tdNum} font-bold text-blue-700`}>{fmtM(grand.newI)}</td>
              <td className={`${tdNum} font-bold text-blue-700`}>{fmtM(grandNewTotal)}</td>
              <td className={`${tdNum} border-l font-bold ${dColor(grandNewTotal - grandOldTotal)}`}>{dStr(grand.newC - grand.oldC)}</td>
              <td className={`${tdNum} font-bold ${dColor(grand.newI - grand.oldI)}`}>{dStr(grand.newI - grand.oldI)}</td>
              <td className={`${tdNum} font-bold ${dColor(grandNewTotal - grandOldTotal)}`}>{dStr(grandNewTotal - grandOldTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

type RawBatch = {
  projects?: { row_key: number; year?: number }[]
  sub_jobs?: { row_key: number }[]
  budget_sources?: { row_key: number }[]
  needs_review?: { row_key: number }[]
}

type LoadedBatch = {
  id: string
  label: string
  batch: RawBatch
  projectCount: number
  years: number[]
}

let nextId = 1

function toLoadedBatch(label: string, parsed: unknown): LoadedBatch | null {
  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as RawBatch).projects)) return null
  const batch = parsed as RawBatch
  const years = [...new Set((batch.projects ?? []).map((p) => p.year).filter((y): y is number => typeof y === "number"))].sort()
  return { id: `b${nextId++}`, label, batch, projectCount: batch.projects?.length ?? 0, years }
}

function mergeBatches(loaded: LoadedBatch[]): RawBatch {
  const merged: Required<RawBatch> = { projects: [], sub_jobs: [], budget_sources: [], needs_review: [] }
  loaded.forEach((lb, i) => {
    const offset = (i + 1) * 1_000_000
    for (const p of lb.batch.projects ?? []) merged.projects.push({ ...p, row_key: p.row_key + offset })
    for (const sj of lb.batch.sub_jobs ?? []) merged.sub_jobs.push({ ...sj, row_key: sj.row_key + offset })
    for (const bs of lb.batch.budget_sources ?? []) merged.budget_sources.push({ ...bs, row_key: bs.row_key + offset })
    for (const nr of lb.batch.needs_review ?? []) merged.needs_review.push({ ...nr, row_key: nr.row_key + offset })
  })
  return merged
}

export default function AIImport2Page() {
  const [loaded, setLoaded] = useState<LoadedBatch[]>([])
  const [raw, setRaw] = useState("")
  const [preview, setPreview] = useState<AIImport2PreviewResult | null>(null)
  const [manualMatches, setManualMatches] = useState<Map<number, string>>(new Map())
  const [matchPopupRowKey, setMatchPopupRowKey] = useState<number | null>(null)
  const [matchSearch, setMatchSearch] = useState("")
  const [result, setResult] = useState<AIImport2ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)
  const [snapshotted, setSnapshotted] = useState(false)
  const [closingCarryover, setClosingCarryover] = useState<string | null>(null)
  const [copied9ch, setCopied9ch] = useState(false)
  const [copiedP, setCopiedP] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function copyPrompt9ch() {
    await navigator.clipboard.writeText(I_9CH_PROMPT)
    setCopied9ch(true); setCopiedP(false)
  }
  async function copyPromptP() {
    await navigator.clipboard.writeText(P_PROJECT_PROMPT)
    setCopiedP(true); setCopied9ch(false)
  }

  function resetDownstream() {
    setPreview(null); setManualMatches(new Map()); setResult(null); setError(null); setSnapshotted(false)
  }

  async function runPreview(matches: Map<number, string>) {
    setError(null); setChecking(true)
    try {
      setPreview(await api.importAI2Preview({ ...mergeBatches(loaded), manual_matches: Object.fromEntries(matches) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setChecking(false)
    }
  }

  function addBatch(label: string, text: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setError(`${label}: JSON ไม่ถูกต้อง — ตรวจสอบว่าวางข้อความทั้งหมดจากคำตอบของ copilot`)
      return
    }
    const lb = toLoadedBatch(label, parsed)
    if (!lb) {
      setError(`${label}: ไม่พบ "projects" array — ไม่ใช่รูปแบบผลลัพธ์ที่ถูกต้อง`)
      return
    }
    setLoaded((prev) => [...prev, lb])
    resetDownstream()
  }

  function handleAddPaste() {
    if (!raw.trim()) return
    addBatch(`วาง #${loaded.length + 1}`, raw)
    setRaw("")
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    for (const f of files) {
      const text = await f.text()
      addBatch(f.name, text)
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function removeBatch(id: string) {
    setLoaded((prev) => prev.filter((b) => b.id !== id))
    resetDownstream()
  }

  async function handleCheck() {
    if (loaded.length === 0) return
    setResult(null); setManualMatches(new Map())
    await runPreview(new Map())
  }

  function openMatchPopup(rowKey: number) {
    setMatchSearch("")
    setMatchPopupRowKey(rowKey)
  }

  async function chooseManualMatch(rowKey: number, projectCode: string) {
    const next = new Map(manualMatches)
    next.set(rowKey, projectCode)
    setManualMatches(next)
    setMatchPopupRowKey(null)
    await runPreview(next)
  }

  async function clearManualMatch(rowKey: number) {
    const next = new Map(manualMatches)
    next.delete(rowKey)
    setManualMatches(next)
    await runPreview(next)
  }

  async function handleSnapshot() {
    setSnapshotting(true)
    try {
      const label = `ก่อนนำเข้าด้วย AI 2 — ${new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`
      await api.createSnapshot(label, "Auto-snapshot ก่อนใช้หน้านำเข้าด้วย AI 2")
      setSnapshotted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง snapshot ไม่สำเร็จ")
    } finally {
      setSnapshotting(false)
    }
  }

  async function handleImport() {
    if (!preview || loaded.length === 0) return
    const warning = snapshotted ? "" : "\n\n⚠️ ยังไม่ได้สร้าง snapshot — แนะนำให้สร้างก่อน เผื่อต้องย้อนกลับ"
    if (!confirm(`นำเข้า ${preview.items.length} โครงการ จาก ${loaded.length} ไฟล์?${warning}`)) return
    setImporting(true)
    setError(null)
    try {
      const payload = { ...mergeBatches(loaded), manual_matches: Object.fromEntries(manualMatches) }
      setResult(await api.importAI2Apply(payload))
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setImporting(false)
    }
  }

  async function handleCloseCarryover(c: AIImport2CarryoverCandidate) {
    if (!confirm(
      `ยืนยันว่า "${c.name}" (${c.project_code}) ไม่มีงานต่อแล้วใช่ไหม?\n\n` +
      `ระบบจะเพิ่มตัดทิ้งของปี ${c.year} จนคงเหลือ/รวม - ตัดทิ้ง = 0 (ปิดยอดผูกพันคงเหลือ ${fmt3(c.remaining)} ล้านบาท) ` +
      `— แก้ไขย้อนหลังได้ผ่านประวัติการแก้ไขของโครงการ`
    )) return
    setClosingCarryover(c.project_code)
    setError(null)
    try {
      await api.importAI2CloseCarryover(c.project_code, c.year)
      await runPreview(manualMatches)
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setClosingCarryover(null)
    }
  }

  const matched = preview ? preview.items.filter((it) => it.group === "matched") : []
  const fresh = preview ? preview.items.filter((it) => it.group === "new") : []
  const needsCheck = preview ? preview.items.filter((it) => it.group === "needs_check") : []
  const carryover = preview ? preview.carryover_candidates : []

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">นำเข้าข้อมูลด้วย AI 2 <span className="text-sm font-normal text-amber-600">(จับคู่ปีต่อปี — ทดลอง)</span></h1>
        <Link href="/import/ai" className="text-sm text-blue-600 hover:underline">
          ไปหน้านำเข้า AI เดิม →
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-3">
        จับคู่โครงการด้วย <strong>ชื่อโครงการที่ตรงกันแบบเป๊ะ ๆ (exact match, 1 ต่อ 1)</strong> กับปีก่อนหน้าเท่านั้น
        (นำเข้าปี X จะจับคู่กับปี X-1 เสมอ ไม่ใช้เลขข้อเลย) — ชื่อไม่ตรงกันแม้แค่เล็กน้อย หรือมีโครงการปีก่อนซ้ำชื่อกันมากกว่า 1 โครงการ
        จะถือว่าไม่จับคู่ ให้ไปจับคู่ด้วยมือในกลุ่ม 3 แทน
      </p>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium text-gray-700">1. คัดลอกพรอมต์ไปวางใน copilot ก่อน:</span>
        <button onClick={copyPrompt9ch} className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
          {copied9ch ? "คัดลอกแล้ว ✓" : "งบปกติ 9 ช่อง (Y/C/L)"}
        </button>
        <button onClick={copyPromptP} className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
          {copiedP ? "คัดลอกแล้ว ✓" : "งบโครงการ (P)"}
        </button>
      </div>

      <p className="text-sm font-medium text-gray-700 mb-2">2. อัปโหลดไฟล์/วางคำตอบ JSON ที่ copilot ตอบกลับมา</p>

      <div className="border-2 border-dashed rounded-lg p-4 mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">อัปโหลดไฟล์ .json (เลือกได้หลายไฟล์)</label>
        <input ref={fileInputRef} type="file" accept=".json,application/json" multiple onChange={handleFiles} className="text-sm" />
      </div>

      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">หรือวางข้อความ JSON ทีละก้อน</label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='{"projects": [...], "sub_jobs": [...], "budget_sources": [...], "needs_review": [...], "summary": {...}}'
          className="w-full h-32 border rounded-lg p-3 font-mono text-xs mb-2"
        />
        <button onClick={handleAddPaste} disabled={!raw.trim()} className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
          + เพิ่มก้อนนี้เข้ารายการ
        </button>
      </div>

      {loaded.length > 0 && (
        <div className="mb-6 space-y-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">รายการที่โหลดแล้ว ({loaded.length})</p>
          {loaded.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-white text-sm">
              <span className="font-medium truncate flex-1">{b.label}</span>
              <span className="text-xs text-gray-500">{b.projectCount} โครงการ</span>
              <span className="text-xs font-mono text-gray-500">ปี {b.years.join(", ") || "?"}</span>
              <button onClick={() => removeBatch(b.id)} className="text-red-500 hover:text-red-700 text-xs px-1" title="ลบออกจากรายการ">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button onClick={handleCheck} disabled={loaded.length === 0 || checking} className="px-4 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50">
          {checking ? "กำลังตรวจสอบ..." : `ตรวจสอบ (${loaded.length} ไฟล์)`}
        </button>
        {preview && (
          <button
            onClick={handleSnapshot}
            disabled={snapshotting || snapshotted}
            className={`px-4 py-2 text-sm rounded-md border disabled:opacity-50 ${snapshotted ? "bg-green-50 border-green-300 text-green-700" : "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"}`}
          >
            {snapshotted ? "✓ สร้าง snapshot แล้ว" : snapshotting ? "กำลังสร้าง snapshot..." : "📸 สร้าง snapshot ก่อน"}
          </button>
        )}
        {preview && (
          <button onClick={handleImport} disabled={importing || preview.items.length === 0} className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {importing ? "กำลังนำเข้า..." : `นำเข้า ${preview.items.length} โครงการ`}
          </button>
        )}
      </div>

      {error && <div className="mb-6 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      {result && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-medium text-green-800 mb-2">
            นำเข้าสำเร็จ — สร้างใหม่ {result.created} โครงการ, อัปเดต {result.updated} โครงการ
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {result.results.map((r) => (
              <div key={r.row_key} className="flex items-center gap-3 text-xs text-gray-600">
                <span className={`px-1.5 py-0.5 rounded-full font-medium ${r.action === "created" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                  {r.action === "created" ? "ใหม่" : "อัปเดต"}
                </span>
                <span className="font-mono">{r.project_code}</span>
                <span className="truncate">{r.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && !result && (
        <>
          <CompareTable2 rows={computeComparison(preview.items)} />

          {/* Group-count summary — counts come from the exact same arrays the detail sections below render, so they can never drift apart. */}
          <div className="mb-6 grid grid-cols-4 gap-3">
            {[
              { n: 1, label: "ตรงกัน", count: matched.length, color: "text-gray-700" },
              { n: 2, label: "ใหม่", count: fresh.length, color: "text-green-700" },
              { n: 3, label: "ต้องตรวจสอบ", count: needsCheck.length, color: "text-amber-700" },
              { n: 4, label: "ค้างปีก่อน", count: carryover.length, color: "text-red-700" },
            ].map((g) => (
              <div key={g.n} className="bg-white rounded-xl border p-4 text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wide">กลุ่ม {g.n}</div>
                <div className={`text-2xl font-bold ${g.color}`}>{g.count}</div>
                <div className="text-sm text-gray-600">{g.label}</div>
              </div>
            ))}
          </div>

          {preview.needs_review.length > 0 && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-800 mb-2">
                ต้องตรวจสอบเพิ่มเติม ({preview.needs_review.length} รายการ) — ยังนำเข้าได้ตามปกติ แต่ควรเช็คทีหลัง
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto text-xs text-yellow-900">
                {preview.needs_review.map((n, i) => (
                  <div key={i}>
                    <span className="font-mono mr-2">{n.item_no || `#${n.row_key}`}</span>
                    {n.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-sm font-semibold text-gray-700 mb-2">1. ตรงกัน ({matched.length})</h2>
          <div className="border rounded-lg overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">รหัสโครงการ</th>
                  <th className="text-left px-3 py-2">ข้อ</th>
                  <th className="text-left px-3 py-2">ชื่อโครงการ</th>
                  <th className="text-left px-3 py-2">ปี</th>
                  <th className="text-left px-3 py-2">ประเภท</th>
                  <th className="text-right px-3 py-2 border-l">วงเงินดำเนินการ (เดิม)</th>
                  <th className="text-right px-3 py-2">วงเงินดำเนินการ (ใหม่)</th>
                </tr>
              </thead>
              <tbody>
                {matched.map((it) => {
                  const oldBudget = it.old_budget_committed + it.old_budget_invest
                  const newBudget = it.new_budget_committed + it.new_budget_invest
                  const isManual = manualMatches.has(it.row_key)
                  return (
                    <tr key={it.row_key} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">
                        {isManual ? (
                          <button onClick={() => clearManualMatch(it.row_key)} title="คลิกเพื่อยกเลิกการจับคู่ด้วยมือ" className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 hover:bg-purple-200">
                            {it.matched_code}
                          </button>
                        ) : it.matched_code}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{it.item_no}</td>
                      <td className="px-3 py-2 max-w-md whitespace-normal break-words">{it.name}</td>
                      <td className="px-3 py-2">{it.year}</td>
                      <td className="px-3 py-2">{it.project_type}</td>
                      <td className="px-3 py-2 text-right border-l tabular-nums text-gray-500">{fmt3(oldBudget)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-blue-600 font-medium">{fmt3(newBudget)}</td>
                    </tr>
                  )
                })}
                {matched.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">ไม่มี</td></tr>}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-semibold text-gray-700 mb-2">2. ใหม่ ({fresh.length})</h2>
          <div className="border rounded-lg overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">ข้อ</th>
                  <th className="text-left px-3 py-2">ชื่อโครงการ</th>
                  <th className="text-left px-3 py-2">ปี</th>
                  <th className="text-left px-3 py-2">ประเภท</th>
                  <th className="text-right px-3 py-2">วงเงินดำเนินการ (ใหม่)</th>
                </tr>
              </thead>
              <tbody>
                {fresh.map((it) => (
                  <tr key={it.row_key} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{it.item_no}</td>
                    <td className="px-3 py-2 max-w-md whitespace-normal break-words">{it.name}</td>
                    <td className="px-3 py-2">{it.year}</td>
                    <td className="px-3 py-2">{it.project_type}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-600 font-medium">{fmt3(it.new_budget_committed + it.new_budget_invest)}</td>
                  </tr>
                ))}
                {fresh.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">ไม่มี</td></tr>}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            3. ต้องตรวจสอบ ({needsCheck.length})
            <span className="font-normal text-gray-400"> — มีวงเงินดำเนินการ/ผูกพัน แต่ไม่พบโครงการปีก่อนที่ชื่อตรงกันเป๊ะ ๆ</span>
          </h2>
          <div className="border rounded-lg overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">ข้อ</th>
                  <th className="text-left px-3 py-2">ชื่อโครงการ</th>
                  <th className="text-left px-3 py-2">ปี</th>
                  <th className="text-left px-3 py-2">ประเภท</th>
                  <th className="text-right px-3 py-2">ผูกพัน (ใหม่)</th>
                  <th className="text-left px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {needsCheck.map((it) => (
                  <tr key={it.row_key} className="border-t bg-amber-50/40">
                    <td className="px-3 py-2 font-mono text-xs">{it.item_no}</td>
                    <td className="px-3 py-2 max-w-md whitespace-normal break-words">{it.name}</td>
                    <td className="px-3 py-2">{it.year}</td>
                    <td className="px-3 py-2">{it.project_type}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700 font-medium">{fmt3(it.new_budget_committed)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => openMatchPopup(it.row_key)} className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200">
                        จับคู่กับรายการค้างปีก่อน
                      </button>
                    </td>
                  </tr>
                ))}
                {needsCheck.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">ไม่มี</td></tr>}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            4. ค้างปีก่อน ({carryover.length})
            <span className="font-normal text-gray-400"> — ผูกพันปีก่อนยังไม่ปิดยอด และไฟล์นี้ไม่มีแถวที่ตรง</span>
          </h2>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">รหัสโครงการ</th>
                  <th className="text-left px-3 py-2">ข้อ</th>
                  <th className="text-left px-3 py-2">ชื่อโครงการ</th>
                  <th className="text-left px-3 py-2" title="ปีที่มียอดผูกพันคงเหลือค้างอยู่ (ไม่ใช่ปีที่โครงการเริ่มต้น — โครงการอาจเริ่มก่อนหน้านี้หลายปีแล้วก็ได้)">
                    ปี (ของยอดค้าง)
                  </th>
                  <th className="text-right px-3 py-2" title="วงเงินดำเนินการ/ผูกพัน − จ่ายจริง/ผูกพัน − ตัดทิ้ง — ตัวเลขนี้หักตัดทิ้งที่มีอยู่แล้ว ไม่ต้องคำนวณลบเพิ่ม">
                    ผูกพันคงเหลือ (หลังหักตัดทิ้ง)
                  </th>
                  <th className="text-left px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {carryover.map((c) => (
                  <tr key={c.project_code} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{c.project_code}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.item_no}</td>
                    <td className="px-3 py-2 max-w-md whitespace-normal break-words">{c.name}</td>
                    <td className="px-3 py-2">{c.year}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700 font-medium">{fmt3(c.remaining)}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleCloseCarryover(c)}
                        disabled={closingCarryover === c.project_code}
                        title="ไม่มีงานต่อแล้ว — เพิ่มตัดทิ้งให้คงเหลือเป็น 0"
                        className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                      >
                        {closingCarryover === c.project_code ? "กำลังปิดยอด..." : "✓ ยืนยันไม่มีงานต่อ"}
                      </button>
                    </td>
                  </tr>
                ))}
                {carryover.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">ไม่มี</td></tr>}
              </tbody>
            </table>
          </div>
          {preview.items.length === 0 && <p className="text-gray-500 mt-4">ไม่พบโครงการในข้อมูลที่วาง</p>}
        </>
      )}

      {matchPopupRowKey !== null && preview && (
        <MatchPopup2
          rowKey={matchPopupRowKey}
          item={preview.items.find((it) => it.row_key === matchPopupRowKey) ?? null}
          candidates={carryover}
          search={matchSearch}
          onSearch={setMatchSearch}
          onChoose={chooseManualMatch}
          onClose={() => setMatchPopupRowKey(null)}
        />
      )}
    </div>
  )
}

function MatchPopup2({
  rowKey, item, candidates, search, onSearch, onChoose, onClose,
}: {
  rowKey: number
  item: AIImport2Item | null
  candidates: AIImport2CarryoverCandidate[]
  search: string
  onSearch: (s: string) => void
  onChoose: (rowKey: number, code: string) => void
  onClose: () => void
}) {
  const q = search.trim().toLowerCase()
  const filtered = q
    ? candidates.filter((c) => c.name.toLowerCase().includes(q) || c.item_no.toLowerCase().includes(q) || c.project_code.toLowerCase().includes(q))
    : candidates
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700">จับคู่กับรายการค้างปีก่อน</h3>
          {item && (
            <p className="text-xs text-gray-500 mt-1 truncate">
              สำหรับ: <span className="font-mono">{item.item_no}</span> {item.name}
            </p>
          )}
          <input
            autoFocus
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="ค้นหาชื่อโครงการ / เลขข้อ / รหัสโครงการ..."
            className="w-full border rounded-lg px-3 py-1.5 text-sm mt-2"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.map((c) => (
            <button
              key={c.project_code}
              onClick={() => onChoose(rowKey, c.project_code)}
              className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b flex items-center gap-3 text-sm"
            >
              <span className="font-mono text-xs text-gray-400 shrink-0">{c.project_code}</span>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-gray-500 tabular-nums shrink-0">{fmt3(c.remaining)}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-6">ไม่พบรายการที่ตรงกับคำค้นหา</p>}
        </div>
        <div className="p-3 border-t flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}
