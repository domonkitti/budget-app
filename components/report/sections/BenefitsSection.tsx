'use client'

import { useState } from 'react'
import type { Benefits } from '@/lib/reportTypes'

interface Props {
  benefits: Benefits
  isAdmin: boolean
  hiddenFields: string[]
  onToggleField: (key: string) => void
  onChange?: (patch: Partial<Benefits>) => void
}

const BENEFIT_FIELDS = [
  { key: 'outputCompletion', label: 'Output เมื่อเสร็จสิ้น' },
  { key: 'outcomeCompletion', label: 'Outcome เมื่อเสร็จสิ้น' },
  { key: 'outputYear', label: 'Output ปีนี้' },
  { key: 'benefitTypes', label: 'ก่อให้เกิดประโยชน์' },
  { key: 'orgImpact', label: 'ผลกระทบต่อองค์กร' },
  { key: 'communityImpact', label: 'ผลกระทบต่อชุมชน' },
  { key: 'ifNotApproved', label: 'ถ้าไม่ได้รับอนุมัติ' },
  { key: 'problems', label: 'ปัญหา/อุปสรรค' },
]

export default function BenefitsSection({ benefits: ben, isAdmin, hiddenFields, onToggleField, onChange }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
        <p className="text-sm font-bold text-gray-700">ผลประโยชน์และผลกระทบ (004/2)</p>
        {isAdmin && <FieldMenu fields={BENEFIT_FIELDS} hiddenFields={hiddenFields} onToggle={onToggleField} />}
      </div>
      <div className="p-6 space-y-3 flex-1 min-h-0 overflow-auto">
        <Field fieldKey="outputCompletion" label="Output เมื่อเสร็จสิ้น" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <BlockRow label="Output (เมื่อเสร็จสิ้น)" value={ben.outputAfterCompletion} isAdmin={isAdmin} onSave={v => onChange?.({ outputAfterCompletion: v })} />
        </Field>

        <Field fieldKey="outcomeCompletion" label="Outcome เมื่อเสร็จสิ้น" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <BlockRow label="Outcome (เมื่อเสร็จสิ้น)" value={ben.outcomeAfterCompletion} isAdmin={isAdmin} onSave={v => onChange?.({ outcomeAfterCompletion: v })} />
        </Field>

        <Field fieldKey="outputYear" label="Output ปีนี้" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <BlockRow label="Output ปีนี้" value={ben.outputThisYear} isAdmin={isAdmin} onSave={v => onChange?.({ outputThisYear: v })} />
        </Field>

        <Field fieldKey="benefitTypes" label="ก่อให้เกิดประโยชน์" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-semibold text-gray-700 mb-2">ก่อให้เกิดประโยชน์</p>
            <div className="flex gap-2 flex-wrap">
              {isAdmin ? (
                <>
                  <BenefitToggle label="เพิ่มรายได้" active={ben.benefitIncreaseRevenue} onToggle={() => onChange?.({ benefitIncreaseRevenue: !ben.benefitIncreaseRevenue })} />
                  <BenefitToggle label="ลดค่าใช้จ่าย" active={ben.benefitReduceCost} onToggle={() => onChange?.({ benefitReduceCost: !ben.benefitReduceCost })} />
                </>
              ) : (
                <>
                  {ben.benefitIncreaseRevenue && <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full ring-1 ring-emerald-200">เพิ่มรายได้</span>}
                  {ben.benefitReduceCost && <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full ring-1 ring-emerald-200">ลดค่าใช้จ่าย</span>}
                  {!ben.benefitIncreaseRevenue && !ben.benefitReduceCost && <span className="text-xs text-gray-300">—</span>}
                </>
              )}
            </div>
          </div>
        </Field>

        <Field fieldKey="orgImpact" label="ผลกระทบต่อองค์กร" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <BlockRow label="ผลกระทบต่อองค์กร" value={ben.orgImpact} isAdmin={isAdmin} onSave={v => onChange?.({ orgImpact: v })} />
        </Field>

        <Field fieldKey="communityImpact" label="ผลกระทบต่อชุมชน" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <BlockRow label="ผลกระทบต่อชุมชน" value={ben.communityImpact} isAdmin={isAdmin} onSave={v => onChange?.({ communityImpact: v })} />
        </Field>

        <Field fieldKey="ifNotApproved" label="ถ้าไม่ได้รับอนุมัติ" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <BlockRow label="ถ้าไม่ได้รับอนุมัติ" value={ben.ifNotApprovedImpact} isAdmin={isAdmin} onSave={v => onChange?.({ ifNotApprovedImpact: v })} highlight />
        </Field>

        <Field fieldKey="problems" label="ปัญหา/อุปสรรค" isAdmin={isAdmin} hiddenFields={hiddenFields} onToggle={onToggleField}>
          <BlockRow label="ปัญหา / อุปสรรค" value={ben.problemsObstacles} isAdmin={isAdmin} onSave={v => onChange?.({ problemsObstacles: v })} />
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
        <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]">
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

function BlockRow({ label, value, isAdmin, onSave, highlight }: { label: string; value: string; isAdmin?: boolean; onSave?: (v: string) => void; highlight?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  return (
    <div className={`rounded-lg p-3 ${highlight ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50'}`}>
      <p className="text-sm font-semibold text-gray-700 mb-1">{label}</p>
      {isAdmin && onSave ? (
        editing ? (
          <textarea
            autoFocus rows={3} value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { onSave(draft); setEditing(false) }}
            onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
            className="text-sm text-gray-700 w-full border-b-2 border-indigo-400 outline-none bg-indigo-50/50 rounded px-1 resize-none"
          />
        ) : (
          <p className="text-sm text-gray-700 cursor-text hover:bg-indigo-50 rounded px-1 -mx-1 transition-colors min-h-[1.5rem]" onClick={() => { setDraft(value); setEditing(true) }}>
            {value || <span className="text-gray-300 italic">คลิกเพื่อแก้ไข</span>}
          </p>
        )
      ) : (
        <p className="text-sm text-gray-700">{value || '—'}</p>
      )}
    </div>
  )
}

function BenefitToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={`text-xs px-2.5 py-1 rounded-full ring-1 font-medium transition-colors ${active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-gray-50 text-gray-400 ring-gray-200'}`}>
      {active ? '✓ ' : '+ '}{label}
    </button>
  )
}
