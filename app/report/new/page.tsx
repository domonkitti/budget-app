'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ReportGroup, ReportData } from '@/lib/reportTypes'
import { fmtMillion } from '@/lib/reportTypes'
import { reportApi } from '@/lib/reportApi'
import { blankReportData, dumpWorkbookFile, buildExtractionPrompt, buildAttachmentPrompt, parseModelJson } from '@/lib/formImport'

export default function CreateReportPage() {
  const router = useRouter()
  const [groups, setGroups] = useState<ReportGroup[]>([])
  const [groupId, setGroupId] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // import-from-Excel flow
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [skippedSheets, setSkippedSheets] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedAttach, setCopiedAttach] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [preview, setPreview] = useState<ReportData | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    reportApi.reportGroups()
      .then(g => { setGroups(g); setGroupId(g[0]?.id ?? '') })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  async function create(data: ReportData) {
    if (!groupId) return
    setCreating(true)
    setError(null)
    try {
      const report = await reportApi.createReport(groupId, data)
      router.push(`/report/admin/${groupId}/${report.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  async function handleFile(file: File) {
    setImportError(null)
    setPreview(null)
    setJsonText('')
    setCopied(false)
    try {
      const dump = await dumpWorkbookFile(file)
      if (!dump.text) throw new Error('อ่านไฟล์ไม่ได้ หรือไฟล์ว่างเปล่า')
      setPrompt(buildExtractionPrompt(dump.text))
      setSkippedSheets(dump.skippedSheets)
      setFileName(file.name)
    } catch (err) {
      setFileName('')
      setPrompt('')
      setSkippedSheets([])
      setImportError(err instanceof Error ? err.message : String(err))
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setCopiedAttach(false)
  }

  async function copyAttachmentPrompt() {
    await navigator.clipboard.writeText(buildAttachmentPrompt())
    setCopiedAttach(true)
    setCopied(false)
  }

  function checkJson() {
    setImportError(null)
    setPreview(null)
    try {
      setPreview(parseModelJson(jsonText))
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    }
  }

  const equipCount = preview?.equipment.reduce((s, y) => s + y.items.length, 0) ?? 0

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 w-full max-w-2xl">
        <h1 className="text-lg font-bold text-gray-900 mb-1">สร้างรายงานใหม่</h1>
        <p className="text-sm text-gray-400 mb-6">เลือกกลุ่มที่จะเก็บรายงานนี้ แล้วสร้างรายงานเปล่า หรือนำเข้าข้อมูลจากไฟล์คำขอตั้ง</p>

        {loading && <p className="text-sm text-gray-400">กำลังโหลด...</p>}
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {!loading && (
          <>
            <label className="block text-xs text-gray-400 mb-1.5">กลุ่ม</label>
            <select
              value={groupId}
              onChange={e => setGroupId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {groups.sort((a, b) => a.order - b.order).map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>

            <div className="flex items-center gap-3 mb-8">
              <Link href="/report" className="flex-1 text-center px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
                ยกเลิก
              </Link>
              <button
                onClick={() => create(blankReportData())}
                disabled={creating || !groupId}
                className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm disabled:opacity-60"
              >
                {creating ? 'กำลังสร้าง...' : 'สร้างรายงานเปล่า'}
              </button>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h2 className="text-sm font-bold text-gray-900 mb-1">นำเข้าจากไฟล์คำขอตั้ง (Excel / PDF / สแกน)</h2>
              <p className="text-xs text-gray-400 mb-4">
                ระบบจะสร้างพรอมต์ให้ นำไปวางใน copilot ของบริษัท แล้วคัดลอกคำตอบ JSON กลับมาวางที่นี่
                ข้อมูลจะถูกเติมลงรายงานให้มากที่สุด และตรวจสอบ/แก้ไขได้ในหน้าถัดไป
              </p>

              <div className="space-y-4">
                <div>
                  <span className="block text-xs font-medium text-gray-500 mb-1.5">1. เลือกไฟล์คำขอตั้ง (.xlsx)</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:text-sm file:font-medium hover:file:bg-indigo-100"
                  />
                  {fileName && <p className="text-xs text-green-600 mt-1">อ่านไฟล์ {fileName} แล้ว</p>}
                  {skippedSheets.length > 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      ไฟล์มีขนาดใหญ่ ข้ามชีตรายละเอียด: {skippedSheets.join(', ')} (ข้อมูลหลักครบถ้วน)
                    </p>
                  )}
                </div>

                <div>
                  <span className="block text-xs font-medium text-gray-500 mb-1.5">2. คัดลอกพรอมต์ไปวางใน copilot</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={copyPrompt}
                      disabled={!prompt}
                      className="px-4 py-2 text-sm border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 font-medium disabled:opacity-40"
                    >
                      {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกพรอมต์'}
                    </button>
                    <button
                      onClick={copyAttachmentPrompt}
                      className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium"
                      title="สำหรับไฟล์ PDF หรือสแกน — วางพรอมต์นี้ใน copilot พร้อมแนบไฟล์ ให้ copilot อ่านไฟล์เอง"
                    >
                      {copiedAttach ? 'คัดลอกแล้ว ✓' : 'ไฟล์เป็น PDF/สแกน? คัดลอกพรอมต์แบบแนบไฟล์'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    PDF/สแกน: ไม่ต้องเลือกไฟล์ในข้อ 1 — คัดลอกพรอมต์แบบแนบไฟล์ แล้วแนบไฟล์คำขอตั้งใน copilot พร้อมวางพรอมต์ ให้ copilot อ่าน (OCR) เอง
                  </p>
                </div>

                <div>
                  <span className="block text-xs font-medium text-gray-500 mb-1.5">3. วางคำตอบ JSON จาก copilot</span>
                  <textarea
                    value={jsonText}
                    onChange={e => { setJsonText(e.target.value); setPreview(null) }}
                    rows={5}
                    placeholder='{"projectName": ...}'
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button
                    onClick={checkJson}
                    disabled={!jsonText.trim()}
                    className="mt-1 px-4 py-2 text-sm border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 font-medium disabled:opacity-40"
                  >
                    ตรวจสอบข้อมูล
                  </button>
                </div>

                {importError && <p className="text-sm text-red-500">{importError}</p>}

                {preview && (
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <p className="text-sm font-medium text-gray-900 mb-2">{preview.projectName || '(ไม่พบชื่องาน)'}</p>
                    <ul className="text-xs text-gray-500 space-y-1 mb-3">
                      <li>ปีงบประมาณ {preview.fiscalYear} · {preview.basicInfo.startYear}–{preview.basicInfo.endYear} ({preview.basicInfo.durationYears} ปี)</li>
                      <li>วงเงินลงทุนทั้งสิ้น {fmtMillion(preview.basicInfo.totalInvestment)} ล้านบาท</li>
                      <li>งบประมาณ {preview.budget.categories.length} หมวด · วัสดุอุปกรณ์ {equipCount} รายการ · แผนจัดซื้อ {preview.procurements.length} ปี</li>
                    </ul>
                    <p className="text-xs text-amber-600 mb-3">ข้อมูลมาจาก AI — กรุณาตรวจสอบทุกช่องในหน้าถัดไปก่อนใช้งานจริง</p>
                    <button
                      onClick={() => create(preview)}
                      disabled={creating || !groupId}
                      className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm disabled:opacity-60"
                    >
                      {creating ? 'กำลังสร้าง...' : 'สร้างรายงานจากข้อมูลนี้'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
