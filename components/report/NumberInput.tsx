'use client'

import { useLayoutEffect, useRef, useState } from 'react'

interface Props {
  value: number
  onChange: (v: number) => void
  className?: string
  placeholder?: string
}

function format(n: number): string {
  return n ? n.toLocaleString('en-US', { maximumFractionDigits: 3 }) : ''
}

export function toCleaned(raw: string): string {
  return raw.replace(/,/g, '').replace(/[^0-9.]/g, '')
}

// Inserts thousands separators into a raw "123456.78" (or an in-progress "123." or "123")
// digit string directly, without round-tripping through Number — that would silently drop
// a trailing "." or an unfinished decimal part the user hasn't typed yet.
export function formatDraft(cleaned: string): string {
  const dotIdx = cleaned.indexOf('.')
  const intPart = dotIdx === -1 ? cleaned : cleaned.slice(0, dotIdx)
  const decPart = dotIdx === -1 ? '' : cleaned.slice(dotIdx + 1).replace(/\./g, '')
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dotIdx === -1 ? withCommas : `${withCommas}.${decPart}`
}

// Plain number input, but formatted with thousands separators while typing —
// keeps the caret at the same digit position across the comma reflow.
export default function NumberInput({ value, onChange, className, placeholder }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  // Counts digits *and* the decimal point — a caret sitting right after a freshly-typed "."
  // (with no digit after it yet) must stay after the dot, not snap back to the last digit.
  const caretSigBefore = useRef<number | null>(null)
  // Tracks the last value *we* emitted so the resync effect below can tell "value changed
  // because the parent echoed our own edit" from "value changed some other way (undo, another
  // field, initial load)" — otherwise an in-progress trailing "." gets reformatted away the
  // instant the parent's prop round-trips back in.
  const lastEmitted = useRef<number | null>(null)
  const [draft, setDraft] = useState(() => format(value))

  useLayoutEffect(() => {
    if (lastEmitted.current === value) return
    setDraft(format(value))
  }, [value])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || caretSigBefore.current == null) return
    const formatted = el.value
    let sigSeen = 0
    let pos = formatted.length
    for (let i = 0; i < formatted.length; i++) {
      if (/[0-9.]/.test(formatted[i])) sigSeen++
      if (sigSeen >= caretSigBefore.current) { pos = i + 1; break }
    }
    el.setSelectionRange(pos, pos)
    caretSigBefore.current = null
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const caretPos = e.target.selectionStart ?? raw.length
    caretSigBefore.current = (raw.slice(0, caretPos).match(/[0-9.]/g) || []).length
    const cleaned = toCleaned(raw)
    setDraft(formatDraft(cleaned))
    const parsed = cleaned === '' || cleaned === '.' ? 0 : Number(cleaned) || 0
    lastEmitted.current = parsed
    onChange(parsed)
  }

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  )
}
