'use client'

import { useState } from 'react'

export default function GroupNameEditor({ name, onRename }: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim()) onRename(draft.trim()); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { if (draft.trim()) onRename(draft.trim()); setEditing(false) }
          if (e.key === 'Escape') { setDraft(name); setEditing(false) }
        }}
        className="text-xs font-semibold text-gray-700 border-b border-indigo-300 outline-none bg-transparent"
      />
    )
  }
  return (
    <span
      onClick={() => { setDraft(name); setEditing(true) }}
      className="text-xs font-semibold text-gray-500 cursor-text hover:text-indigo-600"
      title="คลิกเพื่อแก้ไขชื่อตาราง"
    >
      {name}
    </span>
  )
}
