'use client'

import { useState } from 'react'
import type { BasicInfo } from '@/lib/reportTypes'
import { durationYears } from '@/lib/reportTypes'

interface Props {
  basicInfo: BasicInfo
  isAdmin: boolean
  hiddenFields: string[]
  onToggleField: (key: string) => void
  onChange?: (patch: Partial<BasicInfo>) => void
}

const BASIC_FIELDS = [
  { key: 'responsible', label: 'ผู้รับผิดชอบ' },
  { key: 'badges', label: 'ประเภท/ความจำเป็น' },
  { key: 'area', label: 'พื้นที่/ระยะเวลา' },
  { key: 'objectives', label: 'วัตถุประสงค์' },
]

export default function BasicInfoSection({ basicInfo: bi, isAdmin, hiddenFields, onToggleField, onChange }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-100 flex items-center justify-between shrink-0">
        <p className="text-sm font-bold text-gray-700">ข้อมูลพื้นฐาน (004/1)</p>
        {isAdmin && <FieldMenu fields={BASIC_FIELDS} hiddenFields={hiddenFields} onToggle={onToggleField} />}
      </div>
      <div className="p-6 space-y-4 flex-1 min-h-0 overflow-auto">
        <Field fieldKey="responsible" label="ผู้รับผิดชอบ" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <div className="space-y-2">
            <Row label="แผนก" value={bi.responsible.department} isAdmin={isAdmin} onSave={v => onChange?.({ responsible: { ...bi.responsible, department: v } })} />
            <Row label="กอง" value={bi.responsible.division} isAdmin={isAdmin} onSave={v => onChange?.({ responsible: { ...bi.responsible, division: v } })} />
            <Row label="ฝ่าย" value={bi.responsible.section} isAdmin={isAdmin} onSave={v => onChange?.({ responsible: { ...bi.responsible, section: v } })} />
            <Row label="สายงาน" value={bi.responsible.unit} isAdmin={isAdmin} onSave={v => onChange?.({ responsible: { ...bi.responsible, unit: v } })} />
            <Row label="เบอร์โทร" value={bi.responsible.phone} isAdmin={isAdmin} onSave={v => onChange?.({ responsible: { ...bi.responsible, phone: v } })} />
          </div>
        </Field>

        <Field fieldKey="badges" label="ประเภท/ความจำเป็น" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <div className="space-y-2">
            <BadgeRow label="ความจำเป็น" value={bi.necessity} color="blue" />
            <BadgeRow label="ประเภทการลงทุน" value={bi.investmentType} color="violet" />
            <BadgeRow label="สถานะ" value={bi.status} color={bi.status === 'ต่อเนื่อง' ? 'sky' : 'emerald'} />
          </div>
        </Field>

        <Field fieldKey="area" label="พื้นที่/ระยะเวลา" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <div className="space-y-2">
            <Row label="ลักษณะงาน" value={bi.workNature} isAdmin={isAdmin} onSave={v => onChange?.({ workNature: v })} />
            <Row label="พื้นที่" value={bi.area} isAdmin={isAdmin} onSave={v => onChange?.({ area: v })} />
            <Row label="ระยะเวลา" value={`${durationYears(bi.startYear, bi.endYear)} ปี (${bi.startYear}–${bi.endYear})`} />
          </div>
        </Field>

        <Field fieldKey="objectives" label="วัตถุประสงค์" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <p className="text-sm font-semibold text-gray-700 mb-1.5">วัตถุประสงค์</p>
          <ul className="space-y-1.5">
            {bi.objectives.map((obj, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
                {isAdmin ? (
                  <EditableText value={obj} onSave={v => {
                    const next = [...bi.objectives]; next[i] = v
                    onChange?.({ objectives: next })
                  }} className="flex-1" />
                ) : <span>{obj}</span>}
              </li>
            ))}
            {isAdmin && (
              <li>
                <button onClick={() => onChange?.({ objectives: [...bi.objectives, ''] })} className="text-xs text-indigo-500 hover:text-indigo-700 mt-1">
                  + เพิ่มวัตถุประสงค์
                </button>
              </li>
            )}
          </ul>
        </Field>
      </div>
    </div>
  )
}

function Field({ fieldKey, label, isAdmin, hiddenFields, onToggle, children }: {
  fieldKey: string; label: string; isAdmin: boolean
  hiddenFields: string[]; onToggle: (k: string) => void; children: React.ReactNode
}) {
  const hidden = hiddenFields.includes(fieldKey)
  if (!isAdmin && hidden) return null
  if (isAdmin && hidden) return (
    <div className="border border-dashed border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between">
      <span className="text-xs text-gray-300">{label}</span>
      <button onClick={() => onToggle(fieldKey)} className="text-xs text-indigo-400 hover:text-indigo-600">+ แสดง</button>
    </div>
  )
  return (
    <div className="relative group">
      {isAdmin && (
        <button onClick={() => onToggle(fieldKey)} className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 p-0.5 rounded z-10" title={`ซ่อน ${label}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        </button>
      )}
      {children}
    </div>
  )
}

function FieldMenu({ fields, hiddenFields, onToggle }: {
  fields: { key: string; label: string }[]
  hiddenFields: string[]
  onToggle: (k: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200 rounded px-2 py-1 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        ฟิลด์
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
          {fields.map(f => (
            <button key={f.key} onClick={() => onToggle(f.key)} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-left">
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${hiddenFields.includes(f.key) ? 'border-gray-300' : 'border-indigo-500 bg-indigo-500'}`}>
                {!hiddenFields.includes(f.key) && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
              </span>
              <span className="text-gray-700">{f.label}</span>
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button onClick={() => setOpen(false)} className="w-full text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 text-left">ปิด</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, isAdmin, onSave }: { label: string; value: string; isAdmin?: boolean; onSave?: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <span className="text-sm font-semibold text-gray-700 w-28 shrink-0 pt-0.5">{label}</span>
      {isAdmin && onSave
        ? <EditableText value={value} onSave={onSave} className="text-sm text-gray-500 flex-1" />
        : <span className="text-sm text-gray-500">{value || '—'}</span>}
    </div>
  )
}

function BadgeRow({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-gray-700 w-28 shrink-0">{label}</span>
      <span className={`text-xs px-2.5 py-0.5 rounded-full ring-1 font-medium ${colors[color] ?? colors.blue}`}>{value}</span>
    </div>
  )
}

function EditableText({ value, onSave, className, multiline }: { value: string; onSave: (v: string) => void; className?: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  if (editing) {
    const shared = {
      autoFocus: true, value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: () => { onSave(draft); setEditing(false) },
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        if (e.key === 'Enter' && !multiline) { onSave(draft); setEditing(false) }
      },
      className: `${className} border-b-2 border-indigo-400 outline-none bg-indigo-50/50 rounded px-1 w-full`,
    }
    return multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />
  }
  return (
    <span className={`${className} cursor-text hover:bg-indigo-50 rounded px-1 -mx-1 transition-colors`} onClick={() => { setDraft(value); setEditing(true) }} title="คลิกเพื่อแก้ไข">
      {value || <span className="text-gray-300 italic">คลิกเพื่อแก้ไข</span>}
    </span>
  )
}
