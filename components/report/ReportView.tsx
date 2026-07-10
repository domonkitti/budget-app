'use client'

import { useState, useRef, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import ReactGridLayout from 'react-grid-layout'
import type { LayoutItem as RGLItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type { Report, ReportData, BasicInfo, Benefits, Preset, SectionKey, LayoutItem } from '@/lib/reportTypes'
import { DEFAULT_PRESET } from '@/lib/reportTypes'
import HeaderSection from './sections/HeaderSection'
import BasicInfoSection from './sections/BasicInfoSection'
import BenefitsSection from './sections/BenefitsSection'
import BudgetSection from './sections/BudgetSection'
import EquipmentSection from './sections/EquipmentSection'
import GanttSection from './sections/GanttSection'

// PowerPoint widescreen slide size at 96 CSS px/inch — must match SLIDE_WIDTH_PX/SLIDE_HEIGHT_PX
// in app/api/report-pdf/route.ts, since each .page-card-body is captured 1:1 into one PDF page.
const SLIDE_WIDTH_PX = 1280
const SLIDE_HEIGHT_PX = 720
const SLIDE_PADDING_PX = 24
const SLIDE_CONTENT_WIDTH_PX = SLIDE_WIDTH_PX - SLIDE_PADDING_PX * 2
const SLIDE_CONTENT_BUDGET_PX = SLIDE_HEIGHT_PX - SLIDE_PADDING_PX * 2
const ROW_HEIGHT = 60
const ROW_MARGIN = 16

const STATIC_LABELS: Record<string, string> = {
  header: 'ส่วนหัว',
  basicInfo: 'ข้อมูลพื้นฐาน (004/1)',
  benefits: 'ผลประโยชน์ (004/2)',
  budget: 'งบประมาณ (004/4)',
  equipment: 'วัสดุอุปกรณ์ (007)',
  procurement: 'แผนจัดซื้อ (009)',
}

function sectionLabel(key: string) {
  return STATIC_LABELS[key] ?? key
}

// Layout item ids for a split section look like "equipment__<n>" — strip the suffix to get the section key.
function baseKey(i: string): string {
  return i.split('__')[0]
}

interface Props {
  initialReport: Report
  isAdmin: boolean
  savedPresets?: Preset[]
  onSavePreset?: (preset: Preset) => void
}

export default function ReportView({ initialReport, isAdmin, savedPresets = [], onSavePreset }: Props) {
  const [report, setReport] = useState<Report>(initialReport)
  const [activePreset, setActivePreset] = useState<Preset>(() => {
    if (typeof window === 'undefined') return DEFAULT_PRESET
    const saved = localStorage.getItem(`report-preset-${initialReport.id}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Merge: ensure sections/layout added after the preset was saved still appear
        const sections = DEFAULT_PRESET.sections.map(def => {
          const found = parsed.sections?.find((s: { key: string }) => s.key === def.key)
          return found ?? def
        })
        const layout = DEFAULT_PRESET.layout.map(def => {
          const found = parsed.layout?.find((l: { i: string }) => l.i === def.i)
          return found ? { ...def, ...found } : def
        })
        // Dynamically-created split parts (e.g. "equipment__123") aren't in DEFAULT_PRESET — keep them too.
        const defaultIds = new Set(DEFAULT_PRESET.layout.map(l => l.i))
        const extraParts = (parsed.layout ?? []).filter((l: { i: string }) => !defaultIds.has(l.i))
        layout.push(...extraParts)
        const pages = Array.from(new Set([...(parsed.pages ?? DEFAULT_PRESET.pages), ...layout.map((l: { page: number }) => l.page)])).sort((a, b) => a - b)
        return { ...parsed, sections, layout, pages }
      } catch { return DEFAULT_PRESET }
    }
    return DEFAULT_PRESET
  })
  const [saveLabel, setSaveLabel] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [dragOverPage, setDragOverPage] = useState<number | null>(null)
  const [dragHeight, setDragHeight] = useState<{ page: number; height: number } | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [equipmentActiveYear, setEquipmentActiveYear] = useState<number | null>(null)
  const [draggedPage, setDraggedPage] = useState<number | null>(null)
  const pageResizeRef = useRef<{ page: number; startY: number; startHeight: number; current: number } | null>(null)

  const effectiveAdmin = isAdmin && !previewMode
  const data = report.data

  function patchData(patch: Partial<ReportData>) {
    setReport(r => ({ ...r, data: { ...r.data, ...patch } }))
  }
  function patchBasicInfo(patch: Partial<BasicInfo>) {
    setReport(r => ({ ...r, data: { ...r.data, basicInfo: { ...r.data.basicInfo, ...patch } } }))
  }
  function patchBenefits(patch: Partial<Benefits>) {
    setReport(r => ({ ...r, data: { ...r.data, benefits: { ...r.data.benefits, ...patch } } }))
  }

  function updatePreset(updater: (p: Preset) => Preset) {
    setActivePreset(p => {
      const next = updater(p)
      localStorage.setItem(`report-preset-${initialReport.id}`, JSON.stringify(next))
      return next
    })
  }

  function handleLayoutChange(newLayout: readonly RGLItem[]) {
    if (!effectiveAdmin) return
    updatePreset(p => ({
      ...p,
      layout: p.layout.map(item => {
        const u = newLayout.find(n => n.i === item.i)
        return u ? { ...item, x: u.x, y: u.y, w: u.w, h: u.h } : item
      }),
    }))
  }

  function setItemPage(key: string, page: number) {
    updatePreset(p => ({
      ...p,
      layout: p.layout.map(item => item.i === key ? { ...item, page, x: 0, y: 0 } : item),
    }))
  }

  function handleCardDragStart(e: DragEvent, key: string) {
    e.dataTransfer.setData('text/plain', key)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handlePageDrop(e: DragEvent, page: number) {
    e.preventDefault()
    const key = e.dataTransfer.getData('text/plain')
    if (key) setItemPage(key, page)
    setDragOverPage(null)
  }

  function moveToNewPage(key: string) {
    updatePreset(p => {
      const nextPage = Math.max(...p.pages, 0) + 1
      return {
        ...p,
        pages: [...p.pages, nextPage],
        layout: p.layout.map(item => item.i === key ? { ...item, page: nextPage, x: 0, y: 0 } : item),
      }
    })
  }

  function addPage() {
    updatePreset(p => ({ ...p, pages: [...p.pages, Math.max(...p.pages, 0) + 1] }))
  }

  function removePage(page: number) {
    updatePreset(p => {
      const visibleKeys = p.sections.filter(s => s.visible).map(s => s.key)
      const hasVisibleItem = p.layout.some(item => item.page === page && visibleKeys.includes(item.i as SectionKey))
      if (p.pages.length <= 1 || hasVisibleItem) return p
      return { ...p, pages: p.pages.filter(pg => pg !== page) }
    })
  }

  // Reorders the page sequence (export/display order) by moving `from` to sit where `to` currently is.
  function reorderPage(from: number, to: number) {
    if (from === to) return
    updatePreset(p => {
      const pages = [...p.pages]
      const fromIdx = pages.indexOf(from)
      const toIdx = pages.indexOf(to)
      if (fromIdx === -1 || toIdx === -1) return p
      pages.splice(fromIdx, 1)
      pages.splice(toIdx, 0, from)
      return { ...p, pages }
    })
  }

  // Splits an 'equipment' card's current row window in half, putting the second half
  // on a new page as its own card ("equipment__<id>"). Undefined rowEnd on the tail
  // part is preserved so newly added items keep showing up there.
  function splitEquipmentPage(item: LayoutItem) {
    const year = data.equipment.find(y => y.year === (equipmentActiveYear ?? data.equipment[0]?.year))
    const total = year?.items.length ?? 0
    const start = item.rowStart ?? 0
    const end = item.rowEnd ?? total
    const mid = start + Math.ceil((end - start) / 2)
    if (mid <= start || mid >= end) return
    updatePreset(p => {
      const nextPage = Math.max(...p.pages, 0) + 1
      const newId = `equipment__${Date.now()}`
      return {
        ...p,
        pages: [...p.pages, nextPage],
        layout: [
          ...p.layout.map(li => li.i === item.i ? { ...li, rowEnd: mid } : li),
          { ...item, i: newId, page: nextPage, x: 0, y: 0, rowStart: mid, rowEnd: item.rowEnd },
        ],
      }
    })
  }

  // Merges a continuation 'equipment' part back into the preceding part it was split from.
  function mergeEquipmentPart(item: LayoutItem) {
    updatePreset(p => {
      const prev = p.layout.find(li => baseKey(li.i) === 'equipment' && li.rowEnd === item.rowStart)
      if (!prev) return p
      const page = item.page
      const layout = p.layout
        .filter(li => li.i !== item.i)
        .map(li => li.i === prev.i ? { ...li, rowEnd: item.rowEnd } : li)
      const pageStillUsed = layout.some(li => li.page === page)
      return { ...p, layout, pages: pageStillUsed ? p.pages : p.pages.filter(pg => pg !== page) }
    })
  }

  function setPageHeight(page: number, height: number) {
    updatePreset(p => ({ ...p, pageHeights: { ...(p.pageHeights ?? {}), [page]: height } }))
  }

  function resetPageHeight(page: number) {
    updatePreset(p => {
      const next = { ...(p.pageHeights ?? {}) }
      delete next[page]
      return { ...p, pageHeights: next }
    })
  }

  function startPageResize(e: ReactMouseEvent, page: number, currentHeight: number) {
    e.preventDefault()
    e.stopPropagation()
    pageResizeRef.current = { page, startY: e.clientY, startHeight: currentHeight, current: currentHeight }
    setDragHeight({ page, height: currentHeight })

    function onMove(ev: MouseEvent) {
      const d = pageResizeRef.current
      if (!d) return
      const next = Math.max(120, d.startHeight + (ev.clientY - d.startY))
      d.current = next
      setDragHeight({ page: d.page, height: next })
    }
    function onUp() {
      const d = pageResizeRef.current
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      pageResizeRef.current = null
      setDragHeight(null)
      if (d) setPageHeight(d.page, d.current)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function toggleVisible(key: SectionKey) {
    updatePreset(p => ({
      ...p,
      sections: p.sections.map(s => s.key === key ? { ...s, visible: !s.visible } : s),
    }))
  }

  function toggleField(sectionKey: SectionKey, fieldKey: string) {
    updatePreset(p => ({
      ...p,
      sections: p.sections.map(s => {
        if (s.key !== sectionKey) return s
        const hidden = s.hiddenFields ?? []
        const next = hidden.includes(fieldKey) ? hidden.filter(f => f !== fieldKey) : [...hidden, fieldKey]
        return { ...s, hiddenFields: next }
      }),
    }))
  }

  function getHiddenFields(key: SectionKey): string[] {
    return activePreset.sections.find(s => s.key === key)?.hiddenFields ?? []
  }

  function handleSavePreset() {
    if (!saveLabel.trim()) return
    const next: Preset = { ...activePreset, id: `preset-${Date.now()}`, name: saveLabel.trim() }
    onSavePreset?.(next)
    setShowSaveInput(false)
    setSaveLabel('')
  }

  const visibleKeys = activePreset.sections
    .filter(s => s.visible)
    .map(s => s.key)

  const hiddenKeys = activePreset.sections
    .filter(s => !s.visible)
    .map(s => s.key)

  const layout = activePreset.layout.filter(item => visibleKeys.includes(baseKey(item.i) as SectionKey))

  const allPresets = [DEFAULT_PRESET, ...savedPresets]

  // Order follows activePreset.pages (which reorderPage rearranges), not numeric page id —
  // page ids are stable identifiers, display order is what "swap page order" actually changes.
  const sortedPages = Array.from(new Set([...activePreset.pages, ...layout.map(item => item.page)]))

  function renderSection(item: LayoutItem) {
    switch (baseKey(item.i)) {
      case 'header':
        return <HeaderSection data={data} isAdmin={effectiveAdmin} onChange={patchData} />
      case 'basicInfo':
        return <BasicInfoSection basicInfo={data.basicInfo} isAdmin={effectiveAdmin} hiddenFields={getHiddenFields('basicInfo')} onToggleField={f => toggleField('basicInfo', f)} onChange={patchBasicInfo} />
      case 'benefits':
        return <BenefitsSection benefits={data.benefits} isAdmin={effectiveAdmin} hiddenFields={getHiddenFields('benefits')} onToggleField={f => toggleField('benefits', f)} onChange={patchBenefits} />
      case 'budget':
        return (
          <BudgetSection
            data={data.budget}
            fiscalYear={data.fiscalYear}
            isAdmin={effectiveAdmin}
            onChange={effectiveAdmin ? (bd) => patchData({ budget: bd }) : undefined}
            onFiscalYearChange={effectiveAdmin ? (year) => patchData({ fiscalYear: year }) : undefined}
          />
        )
      case 'equipment':
        return (
          <EquipmentSection
            data={data.equipment}
            isAdmin={effectiveAdmin}
            onChange={effectiveAdmin ? (eq) => patchData({ equipment: eq }) : undefined}
            activeYear={equipmentActiveYear ?? data.equipment[0]?.year ?? 0}
            onActiveYearChange={setEquipmentActiveYear}
            rowStart={item.rowStart}
            rowEnd={item.rowEnd}
            isContinuation={item.i !== 'equipment'}
          />
        )
      case 'procurement':
        return <GanttSection data={data.procurements} isAdmin={effectiveAdmin} onChange={effectiveAdmin ? (plans) => patchData({ procurements: plans }) : undefined} />
      default:
        return null
    }
  }

  return (
    <div className={effectiveAdmin ? 'min-h-screen bg-gray-50' : 'min-h-screen bg-white'}>
      {isAdmin && previewMode && (
        <button
          onClick={() => setPreviewMode(false)}
          className="no-print fixed top-16 right-3 z-40 flex items-center gap-1.5 text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 font-medium shadow-md hover:bg-indigo-700"
        >
          ← กลับไปแก้ไข
        </button>
      )}
      {effectiveAdmin && (
        <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-wrap shadow-sm">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Layout:</span>
          <select
            value={activePreset.id}
            onChange={e => {
              const found = allPresets.find(p => p.id === e.target.value)
              if (found) updatePreset(() => found)
            }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            {allPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {showSaveInput ? (
            <>
              <input
                autoFocus
                value={saveLabel}
                onChange={e => setSaveLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); if (e.key === 'Escape') setShowSaveInput(false) }}
                placeholder="ชื่อ preset..."
                className="border border-indigo-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button onClick={handleSavePreset} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">บันทึก</button>
              <button onClick={() => setShowSaveInput(false)} className="text-sm text-gray-400 hover:text-gray-600">ยกเลิก</button>
            </>
          ) : (
            <button
              onClick={() => setShowSaveInput(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 font-medium"
            >
              + บันทึก Preset
            </button>
          )}

          <button
            onClick={() => updatePreset(() => DEFAULT_PRESET)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5"
          >
            รีเซ็ต
          </button>

          <button
            onClick={addPage}
            className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 rounded-lg px-3 py-1.5 font-medium"
          >
            + เพิ่มหน้า
          </button>

          <button
            onClick={() => setPreviewMode(true)}
            className="text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 font-medium"
          >
            ดูตัวอย่าง
          </button>

          <span className="ml-auto text-xs text-amber-500 font-medium flex items-center gap-1">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Admin — 1 หน้า = 1 หน้าที่ export ลากไอคอนจุดบนการ์ดไปวางที่หน้าอื่นเพื่อย้าย หรือใช้ dropdown &quot;หน้า&quot; — ลาก ⠿ ที่หัวหน้าเพื่อสลับลำดับหน้า
          </span>
        </div>
      )}

      <div className="report-print-area w-full flex flex-col items-center py-8">
        {sortedPages.map((page, pageIdx) => {
          const pageItems = layout.filter(item => item.page === page)
          const isEmpty = pageItems.length === 0
          const pageMaxY = pageItems.reduce((m, it) => Math.max(m, it.y + it.h), 0)
          const pageContentHeightPx = pageMaxY > 0 ? pageMaxY * ROW_HEIGHT + Math.max(0, pageMaxY - 1) * ROW_MARGIN : 0
          const autoHeight = isEmpty ? SLIDE_CONTENT_BUDGET_PX : pageContentHeightPx
          const manualHeight = activePreset.pageHeights?.[page]
          const containerHeight = dragHeight?.page === page ? dragHeight.height : (manualHeight ?? autoHeight)
          const overBudget = pageContentHeightPx > containerHeight

          // An empty page is just a placeholder for the admin to drag cards into —
          // skip it entirely for the boss view / PDF export so it doesn't become a blank page.
          if (isEmpty && !effectiveAdmin) return null

          return (
            <div
              key={page}
              className={`relative rounded-xl transition-all ${effectiveAdmin ? 'mb-10' : 'mb-8'} ${
                draggedPage === page ? 'opacity-40 scale-[0.98]' : ''
              }`}
              style={{ width: SLIDE_WIDTH_PX }}
              onDragOver={effectiveAdmin && draggedPage != null ? e => e.preventDefault() : undefined}
              onDragEnter={effectiveAdmin && draggedPage != null && draggedPage !== page ? () => reorderPage(draggedPage, page) : undefined}
              onDrop={effectiveAdmin && draggedPage != null ? e => { e.preventDefault(); setDraggedPage(null) } : undefined}
            >
              {effectiveAdmin && (
                <div className="no-print flex items-center justify-between mb-1.5 px-1">
                  <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                    <span
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDraggedPage(page) }}
                      onDragEnd={() => setDraggedPage(null)}
                      title="ลากเพื่อสลับลำดับหน้า"
                      className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600"
                    >
                      ⠿
                    </span>
                    หน้า {pageIdx + 1}
                    {manualHeight != null && (
                      <>
                        <span className="ml-2 text-indigo-500">สูงกำหนดเอง {containerHeight}px</span>
                        <button onClick={() => resetPageHeight(page)} className="ml-1.5 text-gray-400 hover:text-red-500">
                          รีเซ็ตความสูง
                        </button>
                      </>
                    )}
                    {overBudget && <span className="ml-2 text-red-500">เนื้อหาเกินขนาดหน้า — จะถูกย่อตอน export</span>}
                  </span>
                  {isEmpty && sortedPages.length > 1 && (
                    <button onClick={() => removePage(page)} className="text-xs text-gray-400 hover:text-red-500">
                      ลบหน้านี้
                    </button>
                  )}
                </div>
              )}
              <div
                className={`page-card-body relative bg-white overflow-hidden transition-colors ${
                  effectiveAdmin
                    ? `rounded-xl border-2 border-dashed ${dragOverPage === page ? 'border-indigo-400 bg-indigo-50' : overBudget ? 'border-red-400' : 'border-gray-300'}`
                    : ''
                }`}
                style={{ padding: SLIDE_PADDING_PX, height: containerHeight }}
                onDragOver={effectiveAdmin ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverPage(page) } : undefined}
                onDragLeave={effectiveAdmin ? () => setDragOverPage(p => p === page ? null : p) : undefined}
                onDrop={effectiveAdmin ? e => handlePageDrop(e, page) : undefined}
              >
                <ReactGridLayout
                  layout={pageItems}
                  width={SLIDE_CONTENT_WIDTH_PX}
                  gridConfig={{ cols: 12, rowHeight: ROW_HEIGHT, margin: [ROW_MARGIN, ROW_MARGIN] as const, containerPadding: [0, 0] as const }}
                  dragConfig={{ enabled: effectiveAdmin, handle: '.rgl-handle' }}
                  resizeConfig={{ enabled: effectiveAdmin, handles: ['se', 's', 'e'] as const }}
                  onLayoutChange={handleLayoutChange}
                >
                  {pageItems.map(item => {
                    const key = item.i
                    return (
                    <div key={key} className="relative overflow-hidden rounded-xl shadow-sm flex flex-col">
                      {effectiveAdmin && (
                        <div className="no-print rgl-handle shrink-0 h-7 cursor-grab active:cursor-grabbing z-10 flex items-center justify-between px-3 bg-indigo-600 select-none">
                          <div className="flex items-center gap-2">
                            <div
                              draggable
                              onDragStart={e => handleCardDragStart(e, key)}
                              onMouseDown={e => e.stopPropagation()}
                              title="ลากไปหน้าอื่น"
                              className="cursor-grab active:cursor-grabbing"
                            >
                              <svg className="w-3.5 h-3.5 text-white/50 shrink-0" fill="currentColor" viewBox="0 0 16 16">
                                <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
                                <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
                                <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                              </svg>
                            </div>
                            <span className="text-xs font-medium text-white/70">
                              {sectionLabel(baseKey(key))}{key !== baseKey(key) && ' (ต่อ)'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {baseKey(key) === 'equipment' && (
                              <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => splitEquipmentPage(item)}
                                title="แบ่งครึ่งรายการไปหน้าใหม่"
                                className="text-xs text-white/50 hover:text-white transition-colors"
                              >
                                แบ่งหน้า
                              </button>
                            )}
                            {key !== baseKey(key) && (
                              <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => mergeEquipmentPart(item)}
                                title="รวมกลับเข้าส่วนก่อนหน้า"
                                className="text-xs text-white/50 hover:text-white transition-colors"
                              >
                                รวมกลับ
                              </button>
                            )}
                            <select
                              value={item.page}
                              onMouseDown={e => e.stopPropagation()}
                              onChange={e => e.target.value === 'new' ? moveToNewPage(key) : setItemPage(key, Number(e.target.value))}
                              className="text-[11px] bg-indigo-700 text-white/80 border-none rounded px-1 py-0.5 focus:outline-none"
                            >
                              {sortedPages.map((pg, pgIdx) => <option key={pg} value={pg}>หน้า {pgIdx + 1}</option>)}
                              <option value="new">+ หน้าใหม่</option>
                            </select>
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={() => toggleVisible(baseKey(key) as SectionKey)}
                              className="text-xs text-white/50 hover:text-white transition-colors"
                            >
                              ซ่อน
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex-1 min-h-0">
                        {renderSection(item)}
                      </div>
                    </div>
                    )
                  })}
                </ReactGridLayout>
                {effectiveAdmin && isEmpty && (
                  <div
                    className="no-print flex items-center justify-center text-center text-xs text-gray-300 select-none px-6"
                    style={{ height: SLIDE_CONTENT_BUDGET_PX }}
                  >
                    ลากการ์ดมาไว้ที่หน้านี้ (ลากที่ไอคอนจุด) หรือใช้ dropdown &quot;หน้า&quot; บนการ์ด
                  </div>
                )}
              </div>
              {effectiveAdmin && (
                <div
                  onMouseDown={e => startPageResize(e, page, containerHeight)}
                  title="ลากเพื่อปรับความสูงหน้า"
                  className="no-print absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 w-20 h-3.5 rounded-full bg-indigo-500 hover:bg-indigo-600 cursor-ns-resize z-20 flex items-center justify-center shadow-sm"
                >
                  <div className="w-8 h-0.5 rounded-full bg-white/70" />
                </div>
              )}
            </div>
          )
        })}

        {effectiveAdmin && hiddenKeys.length > 0 && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">ซ่อนอยู่:</span>
            {hiddenKeys.map(key => (
              <button
                key={key}
                onClick={() => toggleVisible(key)}
                className="text-xs text-gray-400 hover:text-indigo-600 border border-dashed border-gray-300 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                + {sectionLabel(key)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
