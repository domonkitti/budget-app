'use client'

import type { MouseEvent as ReactMouseEvent } from 'react'
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

// Plain mouse-event dragging (not react-grid-layout — that's grid-cell based, this is free
// pixel positioning) clamped to the page's own content box, so it can be moved around freely
// but never dragged onto a different page.
export default function PageHighlightBox({ highlight, containerW, containerH, isAdmin, onChange, onDelete }: Props) {
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

  return (
    <div
      onMouseDown={startDrag}
      className={`absolute border-2 bg-transparent rounded-sm ${borderClass(highlight.color)} ${isAdmin ? 'cursor-move pointer-events-auto' : 'pointer-events-none'}`}
      style={{ left: highlight.x, top: highlight.y, width: highlight.w, height: highlight.h }}
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
}
