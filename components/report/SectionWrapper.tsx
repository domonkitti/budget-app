'use client'

import type { SectionKey, SectionWidth, PresetSection } from '@/lib/reportTypes'

interface Props {
  sectionKey: SectionKey
  isAdmin: boolean
  preset: PresetSection
  onToggleVisible: () => void
  onToggleWidth: () => void
  children: React.ReactNode
}

export default function SectionWrapper({ sectionKey, isAdmin, preset, onToggleVisible, onToggleWidth, children }: Props) {
  if (!preset.visible) {
    if (!isAdmin) return null
    return (
      <div className={preset.width === 'full' ? 'col-span-2' : 'col-span-1'}>
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm text-gray-300">{sectionKey} (hidden)</span>
          <button onClick={onToggleVisible} className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 rounded px-2 py-1">
            แสดง
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={preset.width === 'full' ? 'col-span-2' : 'col-span-1'}>
      {isAdmin && (
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={onToggleVisible}
            className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-1 flex items-center gap-1"
            title="ซ่อนส่วนนี้"
          >
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            ซ่อน
          </button>
          <button
            onClick={onToggleWidth}
            className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 rounded px-2 py-1"
            title="สลับความกว้าง"
          >
            {preset.width === 'full' ? '½ ครึ่งหน้า' : '⬜ เต็มหน้า'}
          </button>
        </div>
      )}
      {children}
    </div>
  )
}
