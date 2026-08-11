"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { api } from "@/lib/api"
import type { AIImportPreviewResult, AIImportApplyResult, AIImportCompareRow, AIImportYearTotal, AIImportMissingProject } from "@/lib/types"
import { I_9CH_PROMPT, P_PROJECT_PROMPT } from "@/lib/aiImportPrompts"

const TYPE_LABELS: Record<string, string> = {
  Y: "งานรายปี", CY: "เปลี่ยนแปลงงบรายปี", C: "แผนระยะยาว", CC: "เปลี่ยนแปลงแผนงาน", L: "สัญญาเช่า", P: "งบโครงการ",
}

function fmt3(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function fmtM(n: number) {
  if (n === 0) return <span className="text-gray-300">-</span>
  return <>{fmt3(n)}</>
}

function CoverageBanner({ items, dbYearTotals }: { items: { year: number }[]; dbYearTotals: AIImportYearTotal[] }) {
  if (dbYearTotals.length === 0) return null
  return (
    <div className="mb-6 space-y-2">
      {dbYearTotals.map((t) => {
        const batchCount = items.filter((it) => it.year === t.year).length
        const pct = t.project_count > 0 ? Math.round((batchCount / t.project_count) * 100) : 100
        const low = pct < 80
        return (
          <div key={t.year} className={`rounded-lg border p-3 text-sm ${low ? "bg-red-50 border-red-200 text-red-800" : "bg-gray-50 border-gray-200 text-gray-600"}`}>
            {low && <span className="font-semibold">⚠️ ไฟล์นี้อาจไม่ครบ — </span>}
            ปี {t.year}: ในระบบตอนนี้มี <strong>{t.project_count}</strong> โครงการ (รวม {fmt3(t.budget)} ล้านบาท)
            — ไฟล์ที่โหลดครอบคลุม <strong>{batchCount}</strong> โครงการ ({pct}%)
          </div>
        )
      })}
    </div>
  )
}

type CompareVals = { oldC: number; oldI: number; newC: number; newI: number }

function budgetVals(r: AIImportCompareRow): CompareVals {
  return { oldC: r.old_budget_committed, oldI: r.old_budget_invest, newC: r.new_budget_committed, newI: r.new_budget_invest }
}
function targetVals(r: AIImportCompareRow): CompareVals {
  return { oldC: r.old_target_committed, oldI: r.old_target_invest, newC: r.new_target_committed, newI: r.new_target_invest }
}

function CompareTable({ rows, title, get }: { rows: AIImportCompareRow[]; title: string; get: (r: AIImportCompareRow) => CompareVals }) {
  if (rows.length === 0) return null
  const tdNum = "py-1 px-2 text-right tabular-nums text-xs whitespace-nowrap"
  const th = "py-1 px-2 text-right text-xs font-medium text-gray-500 whitespace-nowrap"
  const grand = rows.reduce((acc, r) => {
    const v = get(r)
    return { oldC: acc.oldC + v.oldC, oldI: acc.oldI + v.oldI, newC: acc.newC + v.newC, newI: acc.newI + v.newI }
  }, { oldC: 0, oldI: 0, newC: 0, newI: 0 })
  const grandOldTotal = grand.oldC + grand.oldI
  const grandNewTotal = grand.newC + grand.newI
  const grandDC = grand.newC - grand.oldC
  const grandDI = grand.newI - grand.oldI
  const grandDTotal = grandNewTotal - grandOldTotal
  const dColor = (v: number) => v > 0 ? "text-green-600" : v < 0 ? "text-red-600" : "text-gray-300"
  const dStr = (v: number) => v === 0 ? "-" : (v > 0 ? "+" : "") + fmt3(v)
  return (
    <div className="mb-6 bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}/รวม — เปรียบเทียบก่อน/หลังนำเข้า</h3>
        <span className="text-xs text-gray-400">หน่วย:ล้านบาท — เฉพาะปีที่ไฟล์นี้แตะถึง</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="text-left py-1 px-2 font-medium text-xs" rowSpan={2}>ประเภท</th>
              <th className="text-center py-1 px-2 font-medium text-xs border-l" colSpan={3}>{title} (เดิม)</th>
              <th className="text-center py-1 px-2 font-medium text-xs border-l" colSpan={3}>{title} (ใหม่)</th>
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
              const v = get(r)
              const oldTotal = v.oldC + v.oldI
              const newTotal = v.newC + v.newI
              const dC = v.newC - v.oldC
              const dI = v.newI - v.oldI
              const dTotal = newTotal - oldTotal
              return (
                <tr key={r.project_type} className="border-b border-gray-50">
                  <td className="py-1 px-2 font-medium text-xs text-gray-700">{TYPE_LABELS[r.project_type] ?? r.project_type}</td>
                  <td className={`${tdNum} border-l text-gray-500`}>{fmtM(v.oldC)}</td>
                  <td className={`${tdNum} text-gray-500`}>{fmtM(v.oldI)}</td>
                  <td className={`${tdNum} text-gray-600 font-medium`}>{fmtM(oldTotal)}</td>
                  <td className={`${tdNum} border-l text-blue-500`}>{fmtM(v.newC)}</td>
                  <td className={`${tdNum} text-blue-500`}>{fmtM(v.newI)}</td>
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
              <td className={`${tdNum} border-l font-bold ${dColor(grandDC)}`}>{dStr(grandDC)}</td>
              <td className={`${tdNum} font-bold ${dColor(grandDI)}`}>{dStr(grandDI)}</td>
              <td className={`${tdNum} font-bold ${dColor(grandDTotal)}`}>{dStr(grandDTotal)}</td>
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

// row_key is only unique *within* one file — namespace it per loaded batch before merging so
// sub_jobs/budget_sources from different years don't collide onto the same project.
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

export default function AIImportPage() {
  const [loaded, setLoaded] = useState<LoadedBatch[]>([])
  const [raw, setRaw] = useState("")
  const [preview, setPreview] = useState<AIImportPreviewResult | null>(null)
  const [forcedNew, setForcedNew] = useState<Set<number>>(new Set())
  const [excludedRowKeys, setExcludedRowKeys] = useState<Set<number>>(new Set())
  const [keptMissingCodes, setKeptMissingCodes] = useState<Set<string>>(new Set())
  const [manualMatches, setManualMatches] = useState<Map<number, string>>(new Map())
  const [matchPopupRowKey, setMatchPopupRowKey] = useState<number | null>(null)
  const [matchSearch, setMatchSearch] = useState("")
  const [result, setResult] = useState<AIImportApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)
  const [snapshotted, setSnapshotted] = useState(false)
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
    setPreview(null); setForcedNew(new Set()); setExcludedRowKeys(new Set()); setKeptMissingCodes(new Set())
    setManualMatches(new Map()); setResult(null); setError(null); setSnapshotted(false)
  }

  // filteredBatch drops any project/sub_job/budget_source/needs_review row
  // whose row_key was excluded via "ลบออก" on a ใหม่ row (see toggleExcludeRow)
  // — these are new projects the user chose not to create at all.
  function filteredBatch(excluded: Set<number>): RawBatch {
    const merged = mergeBatches(loaded)
    return {
      projects: merged.projects?.filter((p) => !excluded.has(p.row_key)),
      sub_jobs: merged.sub_jobs?.filter((sj) => !excluded.has(sj.row_key)),
      budget_sources: merged.budget_sources?.filter((bs) => !excluded.has(bs.row_key)),
      needs_review: merged.needs_review?.filter((nr) => !excluded.has(nr.row_key)),
    }
  }

  // deleteCodesFor is every หายไป project NOT marked เก็บไว้ — these get
  // permanently deleted from the database on นำเข้า (see toggleKeepMissing).
  function deleteCodesFor(kept: Set<string>): string[] {
    return (preview?.missing_projects ?? []).filter((m) => !kept.has(m.project_code)).map((m) => m.project_code)
  }

  function buildPayload() {
    return {
      ...filteredBatch(excludedRowKeys),
      manual_matches: Object.fromEntries(manualMatches),
      delete_project_codes: deleteCodesFor(keptMissingCodes),
    }
  }

  // runPreview re-checks with the given overrides (defaulting to current
  // state) so the top comparison table and item lists reflect ลบออก/เก็บไว้
  // choices as a live forecast — the server computes it (not just the
  // frontend) so it stays exactly consistent with what นำเข้า will actually do.
  async function runPreview(overrides?: { excluded?: Set<number>; matches?: Map<number, string>; kept?: Set<string> }) {
    const excluded = overrides?.excluded ?? excludedRowKeys
    const matches = overrides?.matches ?? manualMatches
    const kept = overrides?.kept ?? keptMissingCodes
    setError(null); setChecking(true)
    try {
      setPreview(await api.importAIPreview({
        ...filteredBatch(excluded),
        manual_matches: Object.fromEntries(matches),
        delete_project_codes: deleteCodesFor(kept),
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setChecking(false)
    }
  }

  async function toggleExcludeRow(rowKey: number) {
    const next = new Set(excludedRowKeys)
    if (next.has(rowKey)) next.delete(rowKey)
    else next.add(rowKey)
    setExcludedRowKeys(next)
    await runPreview({ excluded: next })
  }

  async function toggleKeepMissing(code: string) {
    const next = new Set(keptMissingCodes)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    setKeptMissingCodes(next)
    await runPreview({ kept: next })
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
    // Fresh check — nothing reviewed yet this round, so no exclusions/deletions/matches carry over
    // (deliberately not routed through runPreview: that derives delete_project_codes from the
    // PREVIOUS preview.missing_projects, which would be stale here).
    setError(null); setResult(null)
    setForcedNew(new Set()); setManualMatches(new Map()); setExcludedRowKeys(new Set()); setKeptMissingCodes(new Set())
    setChecking(true)
    try {
      setPreview(await api.importAIPreview(mergeBatches(loaded)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setChecking(false)
    }
  }

  function toggleForceNew(rowKey: number) {
    setForcedNew((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      return next
    })
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
    await runPreview({ matches: next })
  }

  async function clearManualMatch(rowKey: number) {
    const next = new Map(manualMatches)
    next.delete(rowKey)
    setManualMatches(next)
    await runPreview({ matches: next })
  }

  async function handleSnapshot() {
    setSnapshotting(true)
    try {
      const label = `ก่อนนำเข้าด้วย AI — ${new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`
      await api.createSnapshot(label, "Auto-snapshot ก่อนใช้หน้านำเข้าด้วย AI")
      setSnapshotted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง snapshot ไม่สำเร็จ")
    } finally {
      setSnapshotting(false)
    }
  }

  async function handleImport() {
    if (!preview || loaded.length === 0) return
    const includedItems = preview.items.filter((it) => !excludedRowKeys.has(it.row_key))
    const matchedCount = includedItems.filter((it) => it.matched_code && !forcedNew.has(it.row_key)).length
    const newCount = includedItems.length - matchedCount
    const deleteCodes = deleteCodesFor(keptMissingCodes)
    const deleteWarning = deleteCodes.length > 0
      ? `\n\n🗑️ จะลบถาวร ${deleteCodes.length} โครงการที่ไม่ได้กด "เก็บไว้" — ลบแล้วกู้คืนไม่ได้ (${deleteCodes.slice(0, 5).join(", ")}${deleteCodes.length > 5 ? ", ..." : ""})`
      : ""
    const snapshotWarning = snapshotted
      ? ""
      : "\n\n⚠️ ยังไม่ได้สร้าง snapshot — แนะนำให้สร้างก่อน เผื่อต้องย้อนกลับ"
    if (!confirm(
      `อัปเดต ${matchedCount} โครงการที่ตรงกัน และสร้างใหม่ ${newCount} โครงการ จาก ${loaded.length} ไฟล์?${deleteWarning}${snapshotWarning}`
    )) return
    setImporting(true)
    setError(null)
    try {
      const payload = { ...buildPayload(), force_new_row_keys: [...forcedNew] }
      setResult(await api.importAIApply(payload))
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">นำเข้าข้อมูลด้วย AI (วางจาก copilot)</h1>
        <div className="flex items-center gap-4">
          <Link href="/import/ai2" className="text-sm text-amber-600 hover:underline">
            ลอง AI 2 (จับคู่ปีต่อปี) →
          </Link>
          <Link href="/import" className="text-sm text-blue-600 hover:underline">
            นำเข้าจาก PO →
          </Link>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-3">
        แต่ละไฟล์/ก้อนข้อความคือผลลัพธ์ JSON ของ <strong>หนึ่งปี</strong> (copilot อ่านทีละปีเท่านั้น) อัปโหลดหรือวางได้หลายปีพร้อมกัน
        แล้วนำเข้าทีเดียว โครงการที่มีเลขข้อตรงกับที่มีอยู่แล้ว (ไม่ว่าจะปีไหน) จะถูกจับคู่และอัปเดต ไม่สร้างซ้ำ
      </p>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-medium text-gray-700">1. คัดลอกพรอมต์ไปวางใน copilot ก่อน:</span>
        <button
          onClick={copyPrompt9ch}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          {copied9ch ? "คัดลอกแล้ว ✓" : "งบปกติ 9 ช่อง (Y/C/L)"}
        </button>
        <button
          onClick={copyPromptP}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
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
        <button
          onClick={handleAddPaste}
          disabled={!raw.trim()}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        >
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
              <button onClick={() => removeBatch(b.id)} className="text-red-500 hover:text-red-700 text-xs px-1" title="ลบออกจากรายการ">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleCheck}
          disabled={loaded.length === 0 || checking}
          className="px-4 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50"
        >
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
          <button
            onClick={handleImport}
            disabled={importing || preview.items.length === 0}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? "กำลังนำเข้า..." : `นำเข้า ${preview.items.length} โครงการ`}
          </button>
        )}
      </div>

      {error && <div className="mb-6 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      {result && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-medium text-green-800 mb-2">
            นำเข้าสำเร็จ — สร้างใหม่ {result.created} โครงการ, อัปเดต {result.updated} โครงการ
            {result.deleted > 0 && <span className="text-red-700">, ลบถาวร {result.deleted} โครงการ</span>}
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
            {(result.deleted_codes ?? []).map((code) => (
              <div key={code} className="flex items-center gap-3 text-xs text-gray-600">
                <span className="px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">ลบแล้ว</span>
                <span className="font-mono">{code}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && !result && (
        <>
          <CoverageBanner items={preview.items} dbYearTotals={preview.db_year_totals} />
          <CompareTable rows={preview.comparison} title="วงเงินดำเนินการ" get={budgetVals} />
          <CompareTable rows={preview.comparison} title="เป้าหมายเบิกจ่าย" get={targetVals} />

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

          {(() => {
            const matchedItems = preview.items.filter((it) => it.matched_code && !forcedNew.has(it.row_key))
            const unmatchedItems = preview.items.filter((it) => !it.matched_code || forcedNew.has(it.row_key))
            const newItems = unmatchedItems.filter((it) => !excludedRowKeys.has(it.row_key))
            const excludedItems = unmatchedItems.filter((it) => excludedRowKeys.has(it.row_key))
            const missing = preview.missing_projects.filter((m) => !keptMissingCodes.has(m.project_code))
            const keptCount = preview.missing_projects.length - missing.length
            return (
              <>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">1. ตรงกัน ({matchedItems.length})</h2>
                <div className="border rounded-lg overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">สถานะ</th>
                        <th className="text-left px-3 py-2">ข้อ</th>
                        <th className="text-left px-3 py-2">ชื่อโครงการ</th>
                        <th className="text-left px-3 py-2">ปี</th>
                        <th className="text-left px-3 py-2">ประเภท</th>
                        <th className="text-right px-3 py-2">งานย่อย</th>
                        <th className="text-right px-3 py-2">แหล่งเงิน</th>
                        <th className="text-right px-3 py-2 border-l">วงเงินดำเนินการ (เดิม)</th>
                        <th className="text-right px-3 py-2">วงเงินดำเนินการ (ใหม่)</th>
                        <th className="text-right px-3 py-2">ผลต่าง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedItems.map((it) => {
                        const isManual = manualMatches.has(it.row_key)
                        const oldBudget = it.old_budget_committed + it.old_budget_invest
                        const newBudget = it.new_budget_committed + it.new_budget_invest
                        const delta = newBudget - oldBudget
                        const deltaColor = delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-gray-300"
                        return (
                          <tr key={it.row_key} className="border-t">
                            <td className="px-3 py-2">
                              {isManual ? (
                                <button
                                  onClick={() => clearManualMatch(it.row_key)}
                                  title="คลิกเพื่อยกเลิกการจับคู่ด้วยมือ"
                                  className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 hover:bg-purple-200"
                                >
                                  จับคู่ด้วยมือ: {it.matched_code}
                                </button>
                              ) : (
                                <button
                                  onClick={() => toggleForceNew(it.row_key)}
                                  title="คลิกถ้าไม่ใช่โครงการเดียวกัน — จะสร้างใหม่แทนการอัปเดต"
                                  className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                                >
                                  ตรงกับ {it.matched_code}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{it.item_no}</td>
                            <td className="px-3 py-2 max-w-md whitespace-normal break-words">{it.name}</td>
                            <td className="px-3 py-2">{it.year}</td>
                            <td className="px-3 py-2">{it.project_type}</td>
                            <td className="px-3 py-2 text-right">{it.sub_job_count}</td>
                            <td className="px-3 py-2 text-right">{it.budget_source_count}</td>
                            <td className="px-3 py-2 text-right border-l tabular-nums text-gray-500" title={`ผูกพัน ${fmt3(it.old_budget_committed)} / ลงทุน ${fmt3(it.old_budget_invest)}`}>
                              {fmt3(oldBudget)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-blue-600 font-medium" title={`ผูกพัน ${fmt3(it.new_budget_committed)} / ลงทุน ${fmt3(it.new_budget_invest)}`}>
                              {fmt3(newBudget)}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${deltaColor}`}>
                              {delta === 0 ? "-" : (delta > 0 ? "+" : "") + fmt3(delta)}
                            </td>
                          </tr>
                        )
                      })}
                      {matchedItems.length === 0 && (
                        <tr><td colSpan={10} className="px-3 py-4 text-center text-gray-400">ไม่มี</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span>
                    2. หายไป ({missing.length})
                    <span className="font-normal text-gray-400"> — มีในระบบอยู่แล้ว แต่ไฟล์นี้ไม่มีแถวที่ตรง</span>
                    <span className="font-normal text-red-600"> — จะถูก "ลบถาวร" ตอนนำเข้า ถ้าไม่กด "เก็บไว้"</span>
                  </span>
                  {keptCount > 0 && (
                    <button
                      onClick={() => { setKeptMissingCodes(new Set()); runPreview({ kept: new Set() }) }}
                      className="text-xs font-normal text-gray-400 hover:text-gray-600 underline"
                    >
                      เก็บไว้แล้ว {keptCount} รายการ — แสดงทั้งหมด
                    </button>
                  )}
                </h2>
                <div className="border rounded-lg overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">รหัสโครงการ</th>
                        <th className="text-left px-3 py-2">ข้อ</th>
                        <th className="text-left px-3 py-2">ชื่อโครงการ</th>
                        <th className="text-left px-3 py-2">ประเภท</th>
                        <th className="text-right px-3 py-2">วงเงินดำเนินการ (เดิม)</th>
                        <th className="text-left px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {missing.map((m) => (
                        <tr key={m.project_code} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{m.project_code}</td>
                          <td className="px-3 py-2 font-mono text-xs">{m.item_no}</td>
                          <td className="px-3 py-2 max-w-md whitespace-normal break-words">{m.name}</td>
                          <td className="px-3 py-2">{m.project_type}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                            {fmt3(m.old_budget_committed + m.old_budget_invest)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => toggleKeepMissing(m.project_code)}
                              title="กันโครงการนี้ไม่ให้ถูกลบตอนนำเข้า"
                              className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                            >
                              ✓ เก็บไว้ ไม่ลบ
                            </button>
                          </td>
                        </tr>
                      ))}
                      {missing.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">ไม่มี — ไฟล์นี้ครอบคลุมครบ</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <span>3. ใหม่ ({newItems.length})</span>
                  {excludedItems.length > 0 && (
                    <button
                      onClick={() => { setExcludedRowKeys(new Set()); runPreview({ excluded: new Set() }) }}
                      className="text-xs font-normal text-gray-400 hover:text-gray-600 underline"
                    >
                      ลบออกจากการนำเข้าแล้ว {excludedItems.length} รายการ — เรียกคืนทั้งหมด
                    </button>
                  )}
                </h2>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-3 py-2">สถานะ</th>
                        <th className="text-left px-3 py-2">ข้อ</th>
                        <th className="text-left px-3 py-2">ชื่อโครงการ</th>
                        <th className="text-left px-3 py-2">ปี</th>
                        <th className="text-left px-3 py-2">ประเภท</th>
                        <th className="text-right px-3 py-2">วงเงินดำเนินการ (ใหม่)</th>
                        <th className="text-left px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {newItems.map((it) => {
                        const isForcedNew = forcedNew.has(it.row_key)
                        const newBudget = it.new_budget_committed + it.new_budget_invest
                        return (
                          <tr key={it.row_key} className="border-t">
                            <td className="px-3 py-2">
                              {it.matched_code && isForcedNew ? (
                                <button
                                  onClick={() => toggleForceNew(it.row_key)}
                                  title="คลิกเพื่อกลับไปอัปเดตโครงการที่ตรงกันแทน"
                                  className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                                >
                                  ใหม่ (บังคับ)
                                </button>
                              ) : (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">ใหม่</span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{it.item_no}</td>
                            <td className="px-3 py-2 max-w-md whitespace-normal break-words">
                              {it.name}
                              {it.rejected_match_code && (
                                <div className="mt-1 text-xs font-normal text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                  ⚠️ item_no ตรงกับ <span className="font-mono">{it.rejected_match_code}</span> ({it.rejected_match_name})
                                  แต่ชื่อคล้ายกันแค่ {Math.round((it.rejected_match_similarity ?? 0) * 100)}% — ไม่จับคู่อัตโนมัติ
                                  ใช้ &quot;จับคู่กับโครงการเดิม&quot; ถ้าเป็นโครงการเดียวกันจริง
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">{it.year}</td>
                            <td className="px-3 py-2">{it.project_type}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-blue-600 font-medium">{fmt3(newBudget)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => openMatchPopup(it.row_key)}
                                  className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100"
                                >
                                  จับคู่กับโครงการเดิม
                                </button>
                                <button
                                  onClick={() => toggleExcludeRow(it.row_key)}
                                  title="ไม่นำเข้าโครงการนี้ — เอาออกจากรายการ ไม่กระทบฐานข้อมูล"
                                  className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 hover:bg-red-100"
                                >
                                  ลบออก
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {newItems.length === 0 && (
                        <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">ไม่มี</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
          {preview.items.length === 0 && <p className="text-gray-500 mt-4">ไม่พบโครงการในข้อมูลที่วาง</p>}
        </>
      )}

      {matchPopupRowKey !== null && preview && (
        <MatchPopup
          rowKey={matchPopupRowKey}
          item={preview.items.find((it) => it.row_key === matchPopupRowKey) ?? null}
          missing={preview.missing_projects}
          search={matchSearch}
          onSearch={setMatchSearch}
          onChoose={chooseManualMatch}
          onClose={() => setMatchPopupRowKey(null)}
        />
      )}
    </div>
  )
}

function MatchPopup({
  rowKey, item, missing, search, onSearch, onChoose, onClose,
}: {
  rowKey: number
  item: { item_no: string; name: string } | null
  missing: AIImportMissingProject[]
  search: string
  onSearch: (s: string) => void
  onChoose: (rowKey: number, code: string) => void
  onClose: () => void
}) {
  const q = search.trim().toLowerCase()
  const filtered = q
    ? missing.filter((m) => m.name.toLowerCase().includes(q) || m.item_no.toLowerCase().includes(q) || m.project_code.toLowerCase().includes(q))
    : missing
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700">จับคู่โครงการ</h3>
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
          {filtered.map((m) => (
            <button
              key={m.project_code}
              onClick={() => onChoose(rowKey, m.project_code)}
              className="w-full text-left px-4 py-2 hover:bg-blue-50 border-b flex items-center gap-3 text-sm"
            >
              <span className="font-mono text-xs text-gray-400 shrink-0">{m.project_code}</span>
              <span className="flex-1 truncate">{m.name}</span>
              <span className="text-xs text-gray-500 tabular-nums shrink-0">{fmt3(m.old_budget_committed + m.old_budget_invest)}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-6">ไม่พบโครงการที่ตรงกับคำค้นหา</p>}
        </div>
        <div className="p-3 border-t flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
            ปิด (ยังใหม่อยู่)
          </button>
        </div>
      </div>
    </div>
  )
}
