'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import ReactGridLayout, { verticalCompactor, noCompactor } from 'react-grid-layout'
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

// A4 landscape page at 96 CSS px/inch (297mm x 210mm) — must match SLIDE_WIDTH_PX/SLIDE_HEIGHT_PX
// in app/api/report-pdf/route.ts, since each .page-card-body is captured 1:1 into one PDF page.
const SLIDE_WIDTH_PX = 1123
const SLIDE_HEIGHT_PX = 794
const SLIDE_PADDING_PX = 24
const SLIDE_CONTENT_WIDTH_PX = SLIDE_WIDTH_PX - SLIDE_PADDING_PX * 2
const SLIDE_CONTENT_BUDGET_PX = SLIDE_HEIGHT_PX - SLIDE_PADDING_PX * 2
const ROW_HEIGHT = 60
const ROW_MARGIN = 16
// Page height is fixed to the A4 card — cap grid rows so drag/resize can never push content past it.
const MAX_ROWS = Math.floor((SLIDE_CONTENT_BUDGET_PX + ROW_MARGIN) / (ROW_HEIGHT + ROW_MARGIN))

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

// Sections that support row-window splitting (rowStart/rowEnd chains + auto-split toggle).
const SPLITTABLE_KEYS = new Set(['equipment', 'procurement'])

// Saved presets can predate the A4 page cap (or the old free-height resize) — clamp on load so every
// card starts fully inside the page, otherwise its resize handle would render clipped and unreachable.
function clampLayoutItem(item: LayoutItem): LayoutItem {
  const w = Math.min(item.w, 12)
  const h = Math.min(item.h, MAX_ROWS)
  const x = Math.min(Math.max(item.x, 0), 12 - w)
  const y = Math.min(Math.max(item.y, 0), MAX_ROWS - h)
  return { ...item, w, h, x, y }
}

interface Props {
  initialReport: Report
  isAdmin: boolean
  savedPresets?: Preset[]
  onSavePreset?: (preset: Preset) => void
  // Debounced autosave hook — called ~800ms after edits settle, with the full current data.
  // Omit to leave editing purely in-memory (e.g. a page that hasn't created the report yet).
  onDataChange?: (data: ReportData) => void | Promise<void>
}

export default function ReportView({ initialReport, isAdmin, savedPresets = [], onSavePreset, onDataChange }: Props) {
  const [report, setReport] = useState<Report>(initialReport)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks the report.data object reference that's already saved (or is the original from the
  // server). Compared by reference, not a "did this run already" flag — that distinction matters
  // because React StrictMode's dev-mode double-invoke re-runs this effect a second time for the
  // *same* render/commit, with the *same* report.data reference. A one-shot boolean flag would
  // get flipped by that phantom first run and then wrongly treat the second (still-phantom) run
  // as a real edit, firing a save with nothing actually changed. Comparing references instead
  // correctly recognizes "still the same object" and skips it either way.
  const lastSavedDataRef = useRef<ReportData | null>(null)

  // Debounced autosave: waits for edits to settle before PATCHing the whole data blob, so rapid
  // keystrokes don't hammer the API. Purely fire-and-report — never blocks or reverts local edits
  // on failure.
  useEffect(() => {
    if (!onDataChange) return
    if (lastSavedDataRef.current === null) { lastSavedDataRef.current = report.data; return }
    if (lastSavedDataRef.current === report.data) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    saveTimerRef.current = setTimeout(() => {
      const dataAtSaveTime = report.data
      Promise.resolve(onDataChange(dataAtSaveTime))
        .then(() => { lastSavedDataRef.current = dataAtSaveTime; setSaveStatus('saved') })
        .catch(() => setSaveStatus('error'))
    }, 800)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.data])

  // Manual save button — cancels any pending debounce and saves immediately, so admins get an
  // explicit confirmation instead of only trusting the background autosave.
  function saveNow() {
    if (!onDataChange) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    const dataAtSaveTime = report.data
    Promise.resolve(onDataChange(dataAtSaveTime))
      .then(() => { lastSavedDataRef.current = dataAtSaveTime; setSaveStatus('saved') })
      .catch(() => setSaveStatus('error'))
  }
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
        return { ...parsed, sections, layout: layout.map(clampLayoutItem), pages }
      } catch { return DEFAULT_PRESET }
    }
    return DEFAULT_PRESET
  })
  const [saveLabel, setSaveLabel] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [dragOverPage, setDragOverPage] = useState<number | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [equipmentActiveYear, setEquipmentActiveYear] = useState<number | null>(null)
  const [draggedPage, setDraggedPage] = useState<number | null>(null)
  const [trayOpen, setTrayOpen] = useState(true)

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
    updatePreset(p => {
      // Stack below whatever's already on the target page instead of dropping at y:0,
      // which would overlap existing cards there — and shrink to whatever rows are left
      // on the page rather than silently exceeding it.
      const startY = p.layout
        .filter(item => item.i !== key && item.page === page)
        .reduce((m, item) => Math.max(m, item.y + item.h), 0)
      const availableRows = Math.max(1, MAX_ROWS - startY)
      return {
        ...p,
        layout: p.layout.map(item => item.i === key ? { ...item, page, x: 0, y: startY, h: Math.min(item.h, availableRows) } : item),
      }
    })
  }

  function handleCardDragStart(e: DragEvent, key: string) {
    e.dataTransfer.setData('text/plain', key)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handlePageDrop(e: DragEvent, page: number) {
    e.preventDefault()
    const key = e.dataTransfer.getData('text/plain')
    if (key) {
      // Dragging a hidden section in from the content tray both places and reveals it —
      // otherwise it'd land on the target page but stay invisible.
      const sectionKey = baseKey(key) as SectionKey
      if (!visibleKeys.includes(sectionKey)) toggleVisible(sectionKey)
      setItemPage(key, page)
    }
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

  // Inserts a new empty page directly after `afterPage`, not at the end of the sequence,
  // so it shows up next to where the admin is working instead of jumping to the back.
  function addPageAfter(afterPage: number) {
    updatePreset(p => {
      const nextPage = Math.max(...p.pages, 0) + 1
      const pages = [...p.pages]
      const idx = pages.indexOf(afterPage)
      pages.splice(idx === -1 ? pages.length : idx + 1, 0, nextPage)
      return { ...p, pages }
    })
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

  // Merges a continuation part (equipment or procurement) back into the preceding part it was split from.
  function mergeSplitPart(item: LayoutItem) {
    updatePreset(p => {
      const prev = p.layout.find(li => baseKey(li.i) === baseKey(item.i) && li.rowEnd === item.rowStart)
      if (!prev) return p
      const page = item.page
      const layout = p.layout
        .filter(li => li.i !== item.i)
        .map(li => li.i === prev.i ? { ...li, rowEnd: item.rowEnd } : li)
      const pageStillUsed = layout.some(li => li.page === page)
      return { ...p, layout, pages: pageStillUsed ? p.pages : p.pages.filter(pg => pg !== page) }
    })
  }

  // Auto-split's measurement callback: `lastFitIdx` is the last absolute row index that actually
  // rendered inside the visible box. One-directional by design — it only grows the chain forward
  // as content overflows. It deliberately never pulls rows back in when content shrinks, since
  // that would require guessing whether the next continuation's rows would fit without rendering
  // them, and a wrong guess ping-pongs forever (pull row in → it overflows → push back out → …).
  // Shrinking back after deletions stays a manual "รวมกลับ" action.
  function handleRowOverflow(itemKey: string, lastFitIdx: number, totalRows: number) {
    updatePreset(p => {
      const item = p.layout.find(li => li.i === itemKey)
      if (!item) return p
      const windowEnd = item.rowEnd ?? totalRows
      if (lastFitIdx < (item.rowStart ?? 0) || lastFitIdx + 1 >= windowEnd) return p
      const newRowEnd = lastFitIdx + 1
      // If a continuation immediately follows *on the very next page in sequence*, just extend
      // it backward to absorb the overflow — its own measurement effect re-checks on the next
      // render and cascades further if needed. Matching on rowStart alone (without also pinning
      // the page to be adjacent) risked coincidentally linking to an unrelated chain elsewhere
      // in the doc that happened to share the same cut number, sending the overflow to the
      // wrong page instead of the next one.
      const itemPageIdx = p.pages.indexOf(item.page)
      const nextPageInSequence = itemPageIdx === -1 ? undefined : p.pages[itemPageIdx + 1]
      const existingNext = nextPageInSequence == null ? undefined : p.layout.find(
        li => li.page === nextPageInSequence && baseKey(li.i) === baseKey(itemKey) && li.rowStart === windowEnd
      )
      if (existingNext) {
        return {
          ...p,
          layout: p.layout.map(li => {
            if (li.i === itemKey) return { ...li, rowEnd: newRowEnd }
            if (li.i === existingNext.i) return { ...li, rowStart: newRowEnd }
            return li
          }),
        }
      }
      const nextPage = Math.max(...p.pages, 0) + 1
      const newId = `${baseKey(itemKey)}__${Date.now()}`
      // Insert the new page immediately after the page being split, not at the end of the
      // sequence, so the continuation shows up right next to its source.
      const pages = [...p.pages]
      pages.splice(itemPageIdx === -1 ? pages.length : itemPageIdx + 1, 0, nextPage)
      return {
        ...p,
        pages,
        layout: [
          ...p.layout.map(li => li.i === itemKey ? { ...li, rowEnd: newRowEnd } : li),
          { ...item, i: newId, page: nextPage, x: 0, y: 0, rowStart: newRowEnd, rowEnd: item.rowEnd, autoSplit: item.autoSplit },
        ],
      }
    })
  }

  // Flips autoSplit for a whole chain at once (root + every linked continuation) so they all
  // measure consistently — flipping only the card you clicked would leave the rest stuck on
  // whichever mode they inherited when they were created. Callable from *any* part of the chain
  // (the toggle now shows on every page, not just the root), so it first walks backward to the
  // true root before collecting the chain forward from there.
  function toggleAutoSplit(clickedKey: string) {
    updatePreset(p => {
      const clicked = p.layout.find(li => li.i === clickedKey)
      if (!clicked) return p
      let root = clicked
      for (let guard = 0; guard < p.layout.length && root.rowStart != null; guard++) {
        const prev = p.layout.find(li => li.i !== root.i && baseKey(li.i) === baseKey(clickedKey) && li.rowEnd === root.rowStart)
        if (!prev) break
        root = prev
      }
      const next = !clicked.autoSplit
      const chainKeys = new Set([root.i])
      let cursor = root
      let tailRowEnd = root.rowEnd
      // cursor.rowEnd == null means cursor is an unsplit tail — nothing can continue it. Without
      // this guard, an unsplit item (rowEnd undefined) spuriously "matches" any other unsplit
      // equipment item via undefined === undefined and the walk never terminates.
      for (let guard = 0; guard < p.layout.length && cursor.rowEnd != null; guard++) {
        const found = p.layout.find(li => li.i !== cursor.i && baseKey(li.i) === baseKey(clickedKey) && li.rowStart === cursor.rowEnd)
        if (!found) break
        chainKeys.add(found.i)
        tailRowEnd = found.rowEnd
        cursor = found
      }

      if (!next) {
        // Turning off collapses every continuation back into the root — one scrollable table
        // again — instead of leaving stray split-off pages sitting there with autoSplit now inert.
        const removedPages = new Set(
          p.layout.filter(li => chainKeys.has(li.i) && li.i !== root.i).map(li => li.page)
        )
        const layout = p.layout
          .filter(li => li.i === root.i || !chainKeys.has(li.i))
          .map(li => li.i === root.i ? { ...li, rowEnd: tailRowEnd, autoSplit: false } : li)
        const pages = p.pages.filter(pg => !removedPages.has(pg) || layout.some(li => li.page === pg))
        return { ...p, layout, pages }
      }

      return { ...p, layout: p.layout.map(li => chainKeys.has(li.i) ? { ...li, autoSplit: next } : li) }
    })
  }

  // Duplicates a whole card onto a new page — e.g. to print every year of 007/009 at once
  // instead of only whichever year tab happens to be selected. The copy shows the full list
  // (no row window) and, for 'equipment', gets its own pinnedYear independent of the shared
  // active-year tabs so admin can pick a different year per copy.
  function duplicateItem(item: LayoutItem) {
    updatePreset(p => {
      const nextPage = Math.max(...p.pages, 0) + 1
      const key = baseKey(item.i)
      const newId = `${key}__${Date.now()}`
      let pinnedYear: number | undefined
      if (key === 'equipment') pinnedYear = item.pinnedYear ?? equipmentActiveYear ?? data.equipment[0]?.year
      if (key === 'procurement') pinnedYear = item.pinnedYear ?? data.procurements[0]?.fiscalYear
      const clone: LayoutItem = { ...item, i: newId, page: nextPage, x: 0, y: 0, rowStart: undefined, rowEnd: undefined, pinnedYear }
      // Insert the new page right after the page being duplicated, not at the very end,
      // so the copy shows up next to its source instead of jumping to the back.
      const pages = [...p.pages]
      pages.splice(pages.indexOf(item.page) + 1, 0, nextPage)
      return { ...p, pages, layout: [...p.layout, clone] }
    })
  }

  // Removes one duplicated card instance. Data is untouched — this only deletes the layout
  // entry, since duplicates just render another view of the same underlying section data.
  function deleteCardInstance(key: string) {
    updatePreset(p => {
      const item = p.layout.find(li => li.i === key)
      if (!item) return p
      const layout = p.layout.filter(li => li.i !== key)
      const pageStillUsed = layout.some(li => li.page === item.page)
      return { ...p, layout, pages: pageStillUsed ? p.pages : p.pages.filter(pg => pg !== item.page) }
    })
  }

  // Sets the fixed year for one duplicated 'equipment' card, independent of the shared tabs.
  function setPinnedYear(key: string, year: number) {
    updatePreset(p => ({ ...p, layout: p.layout.map(li => li.i === key ? { ...li, pinnedYear: year } : li) }))
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

  const layout = activePreset.layout
    .filter(item => visibleKeys.includes(baseKey(item.i) as SectionKey))
    .map(clampLayoutItem)

  // Every "extra" card instance beyond the 6 default sections — a ทำซ้ำ duplicate (own key,
  // full row range) or an equipment continuation part (rowStart set). These are easy to lose
  // track of once they're off on some other page, so the content tray lists them explicitly
  // with where they currently live and a way to remove them from one place.
  const extraInstances = activePreset.layout.filter(li => li.i !== baseKey(li.i))

  const allPresets = [DEFAULT_PRESET, ...savedPresets]

  // Order follows activePreset.pages (which reorderPage rearranges), not numeric page id —
  // page ids are stable identifiers, display order is what "swap page order" actually changes.
  const sortedPages = Array.from(new Set([...activePreset.pages, ...layout.map(item => item.page)]))

  // A page that's purely one auto-split continuation gets named relative to its source page
  // ("หน้า 3 (ต่อ 1)", "หน้า 3 (ต่อ 2)") instead of its own top-level number — otherwise every
  // page after a long auto-split chain would keep bumping up just because the chain grew.
  // Single forward pass: a chain's root always appears before its continuations in sortedPages
  // (insertion always happens right after the source page), so by the time we reach a
  // continuation here its source's label has already been computed.
  const pageLabels: Record<number, string> = {}
  let pageDisplayNum = 0
  for (const page of sortedPages) {
    const pageItems = layout.filter(item => item.page === page)
    let contLabel: string | undefined
    if (pageItems.length === 1) {
      const only = pageItems[0]
      if (SPLITTABLE_KEYS.has(baseKey(only.i)) && only.rowStart != null && only.autoSplit) {
        let hops = 0
        let cursor = only
        for (let guard = 0; guard < layout.length; guard++) {
          const prev = layout.find(li => li.i !== cursor.i && baseKey(li.i) === baseKey(only.i) && li.rowEnd === cursor.rowStart)
          if (!prev) break
          hops++
          if (prev.rowStart == null) {
            contLabel = pageLabels[prev.page] ? `${pageLabels[prev.page]} (ต่อ ${hops})` : undefined
            break
          }
          cursor = prev
        }
      }
    }
    if (contLabel) {
      pageLabels[page] = contLabel
    } else {
      pageDisplayNum++
      pageLabels[page] = `หน้า ${pageDisplayNum}`
    }
  }

  // For an equipment continuation part, names which page it was split off from
  // (e.g. "ต่อจากหน้า 4") so it's clear which table it belongs to when there are
  // multiple equipment cards (ทำซ้ำ copies, other split chains) on the page.
  function splitSourceLabel(item: LayoutItem): string | undefined {
    if (item.rowStart == null) return undefined
    const source = layout.find(li => baseKey(li.i) === baseKey(item.i) && li.rowEnd === item.rowStart)
    if (!source) return undefined
    const label = pageLabels[source.page]
    return label ? `ต่อจาก${label}` : undefined
  }

  // Jumps the canvas to a given page from the content tray — trays list where things live,
  // but that's only useful if clicking it actually takes you there.
  function scrollToPage(page: number) {
    document.getElementById(`report-page-${page}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
            activeYear={item.pinnedYear ?? equipmentActiveYear ?? data.equipment[0]?.year ?? 0}
            onActiveYearChange={item.pinnedYear != null ? (y: number) => setPinnedYear(item.i, y) : setEquipmentActiveYear}
            rowStart={item.rowStart}
            rowEnd={item.rowEnd}
            isContinuation={item.rowStart != null}
            continuationLabel={splitSourceLabel(item)}
            autoSplit={effectiveAdmin ? item.autoSplit : undefined}
            onMeasureOverflow={effectiveAdmin ? (lastFitIdx, totalRows) => handleRowOverflow(item.i, lastFitIdx, totalRows) : undefined}
          />
        )
      case 'procurement':
        return (
          <GanttSection
            data={data.procurements}
            isAdmin={effectiveAdmin}
            onChange={effectiveAdmin ? (plans) => patchData({ procurements: plans }) : undefined}
            pinnedYear={item.pinnedYear}
            onPinnedYearChange={item.pinnedYear != null ? (y: number) => setPinnedYear(item.i, y) : undefined}
            rowStart={item.rowStart}
            rowEnd={item.rowEnd}
            isContinuation={item.rowStart != null}
            continuationLabel={splitSourceLabel(item)}
            autoSplit={effectiveAdmin ? item.autoSplit : undefined}
            onMeasureOverflow={effectiveAdmin ? (lastFitIdx, totalRows) => handleRowOverflow(item.i, lastFitIdx, totalRows) : undefined}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {isAdmin && (
        <div className={`no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3 flex-wrap shadow-sm transition-[padding] duration-200 ${trayOpen && effectiveAdmin ? 'pr-[17.5rem]' : 'pr-10'}`}>
          {effectiveAdmin && (
            <>
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
            </>
          )}

          <button
            onClick={() => setPreviewMode(p => !p)}
            className={`text-xs rounded-lg px-3 py-1.5 font-medium border ${
              previewMode ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'text-gray-600 hover:text-gray-900 border-gray-300'
            }`}
          >
            {previewMode ? '← กลับไปแก้ไข' : 'ดูตัวอย่าง'}
          </button>

          {onDataChange && effectiveAdmin && (
            <button
              onClick={saveNow}
              disabled={saveStatus === 'saving'}
              title="บันทึกเนื้อหารายงานทันที (ปกติระบบบันทึกให้อัตโนมัติอยู่แล้วหลังหยุดพิมพ์)"
              className={`text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors ${
                saveStatus === 'error'
                  ? 'text-red-500 border-red-200 hover:bg-red-50'
                  : saveStatus === 'saving'
                  ? 'text-gray-400 border-gray-200'
                  : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {saveStatus === 'saving' && 'กำลังบันทึก...'}
              {saveStatus === 'saved' && '✓ บันทึกแล้ว'}
              {saveStatus === 'error' && 'บันทึกไม่สำเร็จ — ลองอีกครั้ง'}
              {saveStatus === 'idle' && 'บันทึก'}
            </button>
          )}

          {effectiveAdmin && (
            <span className="ml-auto text-xs text-amber-500 font-medium flex items-center gap-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Admin — 1 หน้า = 1 หน้าที่ export ลากไอคอนจุดบนการ์ดไปวางที่หน้าอื่นเพื่อย้าย หรือลากจากแผงเนื้อหาทางขวามาวางที่หน้า — ใช้ ⠿ ที่หัวแต่ละหน้าเพื่อสลับลำดับ
            </span>
          )}
        </div>
      )}

      {effectiveAdmin && (
        <div className={`no-print fixed top-16 bottom-4 z-30 flex transition-[right] duration-200 ${trayOpen ? 'right-0' : '-right-64'}`}>
          <button
            onClick={() => setTrayOpen(o => !o)}
            title={trayOpen ? 'ย่อแผงเนื้อหา' : 'ขยายแผงเนื้อหา'}
            className="self-start mt-4 w-9 h-20 bg-white border border-r-0 border-gray-200 rounded-l-lg shadow-md flex items-center justify-center text-gray-400 hover:text-indigo-600 text-2xl"
          >
            {trayOpen ? '›' : '‹'}
          </button>
          <div className="w-64 bg-white border-l border-gray-200 shadow-lg overflow-y-auto p-2 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">เนื้อหาที่ซ่อนอยู่ ({hiddenKeys.length})</span>
              {hiddenKeys.length === 0 && (
                <span className="text-xs text-gray-300 px-1">แสดงครบทุกส่วนแล้ว</span>
              )}
              {hiddenKeys.map(key => (
                <div
                  key={key}
                  draggable
                  onDragStart={e => handleCardDragStart(e, key)}
                  onClick={() => toggleVisible(key)}
                  title="ลากไปวางที่หน้าที่ต้องการ หรือคลิกเพื่อเพิ่ม"
                  className="cursor-grab active:cursor-grabbing text-left text-xs text-indigo-600 hover:text-indigo-800 border border-dashed border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-2 transition-colors"
                >
                  + {sectionLabel(key)}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">ส่วนหลักทั้งหมด</span>
              {activePreset.sections.map(s => {
                const primary = activePreset.layout.find(li => li.i === s.key)
                const location = s.visible && primary ? (pageLabels[primary.page] ?? '-') : 'ซ่อนอยู่'
                return (
                  <div key={s.key} className="flex items-center justify-between gap-2 text-xs px-1.5 py-1">
                    <span className={s.visible ? 'text-gray-600' : 'text-gray-300'}>{sectionLabel(s.key)}</span>
                    {s.visible && primary ? (
                      <button onClick={() => scrollToPage(primary.page)} title="ไปที่หน้านี้" className="text-emerald-600 hover:underline">
                        {location}
                      </button>
                    ) : (
                      <span className="text-gray-300">{location}</span>
                    )}
                  </div>
                )
              })}
            </div>

            {extraInstances.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">สำเนา / ส่วนต่อ ({extraInstances.length})</span>
                {extraInstances.map(li => {
                  const label = sectionLabel(baseKey(li.i))
                  const visible = visibleKeys.includes(baseKey(li.i) as SectionKey)
                  const location = visible ? (pageLabels[li.page] ?? '-') : 'ซ่อนอยู่'
                  const isContinuation = li.rowStart != null
                  const kind = isContinuation ? (splitSourceLabel(li) ?? 'ต่อ') : 'สำเนา'
                  const onRemove = isContinuation && li.autoSplit
                    ? () => toggleAutoSplit(li.i)
                    : isContinuation
                    ? () => mergeSplitPart(li)
                    : () => deleteCardInstance(li.i)
                  const removeTitle = isContinuation && li.autoSplit
                    ? 'ปิดแบ่งหน้าอัตโนมัติและรวมกลับเป็น 1 ตาราง'
                    : isContinuation
                    ? 'รวมกลับเข้าส่วนก่อนหน้า'
                    : 'ลบสำเนานี้'
                  return (
                    <div key={li.i} className="flex items-center justify-between gap-2 text-xs px-1.5 py-1.5 border border-gray-100 rounded-lg">
                      <div className="min-w-0">
                        <div className="text-gray-600 truncate">{label} <span className="text-gray-400 font-normal">({kind})</span></div>
                        {visible ? (
                          <button onClick={() => scrollToPage(li.page)} title="ไปที่หน้านี้" className="text-emerald-600 hover:underline">
                            {location}
                          </button>
                        ) : (
                          <div className="text-gray-300">{location}</div>
                        )}
                      </div>
                      <button onClick={onRemove} title={removeTitle} className="text-gray-300 hover:text-red-500 shrink-0">
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="report-print-area w-full flex flex-col items-center py-8">
        {sortedPages.map((page, pageIdx) => {
          const pageItems = layout.filter(item => item.page === page)
          const isEmpty = pageItems.length === 0
          const pageMaxY = pageItems.reduce((m, it) => Math.max(m, it.y + it.h), 0)
          const pageContentHeightPx = pageMaxY > 0 ? pageMaxY * ROW_HEIGHT + Math.max(0, pageMaxY - 1) * ROW_MARGIN : 0
          // Admin keeps the full fixed A4 page — content can't grow past it (see MAX_ROWS),
          // and free drag/resize needs a stable page size to work against. The boss/viewer
          // page (and therefore the PDF export, which screenshots this same view) hugs its
          // content instead, so a lightly-filled page doesn't show a block of empty space.
          const containerHeight = effectiveAdmin ? SLIDE_CONTENT_BUDGET_PX : Math.max(pageContentHeightPx, ROW_HEIGHT)
          const overBudget = pageContentHeightPx > SLIDE_CONTENT_BUDGET_PX

          // An empty page is just a placeholder for the admin to drag cards into —
          // skip it entirely for the boss view / PDF export so it doesn't become a blank page.
          if (isEmpty && !effectiveAdmin) return null

          return (
            <div
              key={page}
              id={`report-page-${page}`}
              className={`relative rounded-xl transition-all ${effectiveAdmin ? 'mb-10' : 'mb-8'} ${
                draggedPage === page ? 'opacity-40 scale-[0.98]' : ''
              }`}
              style={{ width: SLIDE_WIDTH_PX }}
              onDragOver={effectiveAdmin && draggedPage != null ? e => e.preventDefault() : undefined}
              onDragEnter={effectiveAdmin && draggedPage != null && draggedPage !== page ? () => reorderPage(draggedPage, page) : undefined}
              onDrop={effectiveAdmin && draggedPage != null ? e => { e.preventDefault(); setDraggedPage(null) } : undefined}
            >
              {effectiveAdmin && (
                <div className="no-print mb-1.5 px-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">
                    {pageLabels[page] ?? `หน้า ${pageIdx + 1}`}
                    {overBudget && <span className="ml-2 text-red-500">เนื้อหาเกินขนาดหน้า A4 — เปิด &quot;แบ่งหน้าอัตโนมัติ&quot; (ตาราง 007/009) หรือลดขนาดการ์ด</span>}
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDraggedPage(page) }}
                      onDragEnd={() => setDraggedPage(null)}
                      title="ลากเพื่อสลับลำดับหน้า"
                      className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-600"
                    >
                      ⠿
                    </span>
                    <button onClick={() => addPageAfter(page)} title="เพิ่มหน้าใต้หน้านี้" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                      + หน้า
                    </button>
                    {isEmpty && sortedPages.length > 1 && (
                      <button onClick={() => removePage(page)} title="ลบหน้านี้" className="text-xs text-gray-400 hover:text-red-500">
                        ✕
                      </button>
                    )}
                  </span>
                </div>
              )}
              <div
                className={`page-card-body relative bg-white overflow-hidden transition-colors ${
                  effectiveAdmin
                    ? `rounded-xl border-2 border-dashed ${dragOverPage === page ? 'border-indigo-400 bg-indigo-50' : overBudget ? 'border-red-400' : 'border-gray-300'}`
                    : ''
                }`}
                style={{ padding: SLIDE_PADDING_PX, height: containerHeight, boxSizing: 'content-box' }}
                onDragOver={effectiveAdmin ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverPage(page) } : undefined}
                onDragLeave={effectiveAdmin ? () => setDragOverPage(p => p === page ? null : p) : undefined}
                onDrop={effectiveAdmin ? e => handlePageDrop(e, page) : undefined}
              >
                <ReactGridLayout
                  layout={pageItems}
                  width={SLIDE_CONTENT_WIDTH_PX}
                  gridConfig={{ cols: 12, rowHeight: ROW_HEIGHT, margin: [ROW_MARGIN, ROW_MARGIN] as const, containerPadding: [0, 0] as const, maxRows: MAX_ROWS }}
                  dragConfig={{ enabled: effectiveAdmin, handle: '.rgl-handle', bounded: true }}
                  resizeConfig={{ enabled: effectiveAdmin, handles: ['se', 's', 'e'] as const }}
                  compactor={effectiveAdmin ? noCompactor : verticalCompactor}
                  onLayoutChange={handleLayoutChange}
                >
                  {pageItems.map(item => {
                    const key = item.i
                    return (
                    <div key={key} className="relative flex flex-col">
                    {/* Rounding + clipping live on this inner wrapper, not the GridItem's own child —
                        the resize handle react-grid-layout injects sits at that outer div's literal
                        corner, and a rounded+clipped outer box was cutting the handle icon off. */}
                    <div className="overflow-hidden rounded-xl shadow-sm flex flex-col flex-1 min-h-0">
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
                              {sectionLabel(baseKey(key))}
                              {item.rowStart != null && ` (${splitSourceLabel(item) ?? 'ต่อ'})`}
                              {item.rowStart == null && item.rowEnd == null && key !== baseKey(key) && ' (สำเนา)'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {SPLITTABLE_KEYS.has(baseKey(key)) && (
                              <label
                                onMouseDown={e => e.stopPropagation()}
                                title="เปิด = แบ่งหน้าใหม่ให้อัตโนมัติเมื่อรายการยาวเกินหน้า (ใช้ได้ทุกส่วนของตารางนี้) · ปิด = เลื่อนดูได้ตามปกติ"
                                className="flex items-center gap-1.5 text-[11px] text-white/50 hover:text-white/80 cursor-pointer select-none transition-colors"
                              >
                                <span
                                  onClick={() => toggleAutoSplit(item.i)}
                                  className={`w-7 h-4 rounded-full relative transition-colors shrink-0 ${item.autoSplit ? 'bg-emerald-400' : 'bg-white/20'}`}
                                >
                                  <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${item.autoSplit ? 'translate-x-3' : ''}`} />
                                </span>
                                แบ่งหน้าอัตโนมัติ
                              </label>
                            )}
                            {item.rowStart != null && (
                              <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => mergeSplitPart(item)}
                                title="รวมกลับเข้าส่วนก่อนหน้า"
                                className="text-xs text-white/50 hover:text-white transition-colors"
                              >
                                รวมกลับ
                              </button>
                            )}
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={() => duplicateItem(item)}
                              title="ทำซ้ำการ์ดนี้ไปหน้าใหม่ — เช่น พิมพ์ 007/009 ทุกปี"
                              className="text-xs text-white/50 hover:text-white transition-colors"
                            >
                              ทำซ้ำ
                            </button>
                            {item.rowStart == null && item.rowEnd == null && key !== baseKey(key) && (
                              <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => deleteCardInstance(key)}
                                title="ลบการ์ดที่ทำซ้ำนี้"
                                className="text-xs text-white/50 hover:text-red-300 transition-colors"
                              >
                                ลบ
                              </button>
                            )}
                            <select
                              value={item.page}
                              onMouseDown={e => e.stopPropagation()}
                              onChange={e => e.target.value === 'new' ? moveToNewPage(key) : setItemPage(key, Number(e.target.value))}
                              className="text-[11px] bg-indigo-700 text-white/80 border-none rounded px-1 py-0.5 focus:outline-none"
                            >
                              {sortedPages.map((pg, pgIdx) => <option key={pg} value={pg}>{pageLabels[pg] ?? `หน้า ${pgIdx + 1}`}</option>)}
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
            </div>
          )
        })}

      </div>
    </div>
  )
}
