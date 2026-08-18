'use client'

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { PageHighlight } from '@/lib/reportTypes'

interface Props {
  highlight: PageHighlight
  containerW: number
  containerH: number
  isAdmin: boolean
  onChange: (patch: Partial<PageHighlight>) => void
  onDelete: () => void
}

const MIN_SIZE = 40

const BOX_COLORS = [
  { key: 'red', border: 'border-red-500', dot: 'bg-red-500' },
  { key: 'yellow', border: 'border-amber-500', dot: 'bg-amber-500' },
  { key: 'green', border: 'border-emerald-500', dot: 'bg-emerald-500' },
  { key: 'blue', border: 'border-blue-500', dot: 'bg-blue-500' },
]

function borderClass(color?: string) {
  return BOX_COLORS.find(c => c.key === color)?.border ?? BOX_COLORS[0].border
}

// Finds the card content box (each section's own ".overflow-auto" scrollbox) that this
// highlight's page-relative center point currently sits over, if any — so the box can be
// portaled inside it and scroll natively with that card's content. Without this, a box drawn
// over a tall table stays pinned to the page while the table scrolls independently underneath it.
function findScrollTarget(pageBodyEl: HTMLElement, h: PageHighlight): HTMLElement | null {
  const pageRect = pageBodyEl.getBoundingClientRect()
  const centerX = pageRect.left + h.x + h.w / 2
  const centerY = pageRect.top + h.y + h.h / 2
  const candidates = pageBodyEl.querySelectorAll<HTMLElement>('.overflow-auto')
  for (const cand of candidates) {
    const r = cand.getBoundingClientRect()
    if (centerX >= r.left && centerX <= r.right && centerY >= r.top && centerY <= r.bottom) return cand
  }
  return null
}

// Plain mouse-event dragging (not react-grid-layout — that's grid-cell based, this is free
// pixel positioning) clamped to the page's own content box, so it can be moved around freely
// but never dragged onto a different page. Stored x/y/w/h always stay page-relative regardless
// of where the box is currently portaled — only the rendered position is content-relative.
export default function PageHighlightBox({ highlight, containerW, containerH, isAdmin, onChange, onDelete }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [contentPos, setContentPos] = useState<{ left: number; top: number } | null>(null)

  // Re-detects which card (if any) this box overlaps, and its position within that card's own
  // scrollable content, whenever the box's own geometry changes (drag/resize commit, or first
  // mount) — never on scroll itself, since once portaled the browser scrolls it natively for free.
  useEffect(() => {
    const pageBodyEl = boxRef.current?.closest<HTMLElement>('.page-card-body') ?? null
    if (!pageBodyEl) { setTarget(null); setContentPos(null); return }
    const found = findScrollTarget(pageBodyEl, highlight)
    if (found) {
      if (getComputedStyle(found).position === 'static') found.style.position = 'relative'
      const pageRect = pageBodyEl.getBoundingClientRect()
      const foundRect = found.getBoundingClientRect()
      setContentPos({
        left: (pageRect.left + highlight.x - foundRect.left) + found.scrollLeft,
        top: (pageRect.top + highlight.y - foundRect.top) + found.scrollTop,
      })
    } else {
      setContentPos(null)
    }
    setTarget(found)
  }, [highlight.x, highlight.y, highlight.w, highlight.h])

  function startDrag(e: ReactMouseEvent) {
    if (!isAdmin) return
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const origX = highlight.x
    const origY = highlight.y
    function onMove(ev: MouseEvent) {
      const x = Math.min(Math.max(0, origX + (ev.clientX - startX)), Math.max(0, containerW - highlight.w))
      const y = Math.min(Math.max(0, origY + (ev.clientY - startY)), Math.max(0, containerH - highlight.h))
      onChange({ x, y })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startResize(e: ReactMouseEvent) {
    if (!isAdmin) return
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const origW = highlight.w
    const origH = highlight.h
    function onMove(ev: MouseEvent) {
      const w = Math.min(Math.max(MIN_SIZE, origW + (ev.clientX - startX)), containerW - highlight.x)
      const h = Math.min(Math.max(MIN_SIZE, origH + (ev.clientY - startY)), containerH - highlight.y)
      onChange({ w, h })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const pos = target && contentPos ? contentPos : { left: highlight.x, top: highlight.y }

  const box = (
    <div
      ref={boxRef}
      onMouseDown={startDrag}
      className={`absolute z-40 border-2 bg-transparent rounded-sm ${borderClass(highlight.color)} ${isAdmin ? 'cursor-move pointer-events-auto' : 'pointer-events-none'}`}
      style={{ left: pos.left, top: pos.top, width: highlight.w, height: highlight.h }}
    >
      {isAdmin && (
        <>
          <div
            onMouseDown={e => e.stopPropagation()}
            className="no-print absolute -top-2.5 -left-2.5 flex items-center gap-0.5 bg-white border border-gray-200 rounded-full px-1 py-0.5 shadow"
          >
            {BOX_COLORS.map(c => (
              <button
                key={c.key}
                onClick={() => onChange({ color: c.key })}
                className={`w-2.5 h-2.5 rounded-full ${c.dot} hover:ring-2 hover:ring-gray-300`}
                title={c.key}
              />
            ))}
          </div>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={onDelete}
            title="ลบกรอบนี้"
            className="no-print absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-white border border-red-300 text-red-500 text-xs leading-none flex items-center justify-center shadow hover:bg-red-50"
          >
            ×
          </button>
          <div
            onMouseDown={startResize}
            title="ลากเพื่อย่อ/ขยาย"
            className={`no-print absolute -bottom-1.5 -right-1.5 w-3 h-3 rounded-sm cursor-nwse-resize ${BOX_COLORS.find(c => c.key === (highlight.color ?? 'red'))?.dot ?? 'bg-red-500'}`}
          />
        </>
      )}
    </div>
  )

  return target ? createPortal(box, target) : box
}
