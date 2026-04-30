"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Snapshot, Scenario } from "@/lib/types"
import { useViewMode } from "@/app/SnapshotProvider"

function fmtDate(s: string) {
  return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
}

export default function Navbar() {
  const path = usePathname()
  const { viewMode, setSnapshot, setScenario, clearMode } = useViewMode()

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [openPanel, setOpenPanel] = useState<"snapshots" | "scenarios" | null>(null)

  // Snapshot form
  const [snapLabel, setSnapLabel] = useState("")
  const [snapNote, setSnapNote] = useState("")
  const [snapSaving, setSnapSaving] = useState(false)

  // Scenario form
  const [scenLabel, setScenLabel] = useState("")
  const [scenNote, setScenNote] = useState("")
  const [scenSaving, setScenSaving] = useState(false)

  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { loadLists() }, [])

  useEffect(() => {
    if (!openPanel) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenPanel(null)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [openPanel])

  async function loadLists() {
    try {
      const [snaps, scens] = await Promise.all([api.snapshots(), api.scenarios()])
      setSnapshots(snaps)
      setScenarios(scens)
    } catch {}
  }

  async function saveSnapshot() {
    if (!snapLabel.trim()) return
    setSnapSaving(true)
    try {
      await api.createSnapshot(snapLabel.trim(), snapNote.trim())
      setSnapLabel(""); setSnapNote("")
      await loadLists()
    } catch {} finally { setSnapSaving(false) }
  }

  async function saveScenario() {
    if (!scenLabel.trim()) return
    setScenSaving(true)
    try {
      await api.createScenario(scenLabel.trim(), scenNote.trim())
      setScenLabel(""); setScenNote("")
      await loadLists()
    } catch {} finally { setScenSaving(false) }
  }

  async function viewSnapshotItem(s: Snapshot) {
    setLoading(true)
    try {
      const detail = await api.getSnapshot(s.id)
      setSnapshot(s, detail.data)
    } catch {} finally { setLoading(false); setOpenPanel(null) }
  }

  async function deleteSnapshot(id: number) {
    if (!confirm("Delete this snapshot?")) return
    await api.deleteSnapshot(id)
    if (viewMode.kind === "snapshot" && viewMode.item.id === id) clearMode()
    await loadLists()
  }

  async function deleteScenario(id: number) {
    if (!confirm("Delete this scenario?")) return
    await api.deleteScenario(id)
    if (viewMode.kind === "scenario" && viewMode.item.id === id) clearMode()
    await loadLists()
  }

  const navLinks = [
    { href: "/", label: "Overall" },
    { href: "/category", label: "Category" },
  ]

  // ── Mode indicator pill ──────────────────────────────────────────────────────
  let modePill: React.ReactNode
  if (viewMode.kind === "live") {
    modePill = (
      <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 7, padding: "3px 10px", fontSize: 12, color: "#166534" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
        <span style={{ fontWeight: 600 }}>LIVE</span>
      </div>
    )
  } else if (viewMode.kind === "snapshot") {
    modePill = (
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 7, padding: "3px 10px", fontSize: 12 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
        <span style={{ color: "#92400E", fontWeight: 600 }}>READ-ONLY</span>
        <span style={{ color: "#78350F", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>: {viewMode.item.label}</span>
        <button type="button" onClick={clearMode} style={{ marginLeft: 4, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 4, padding: "1px 7px", fontSize: 11, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>
          Back to LIVE
        </button>
      </div>
    )
  } else {
    modePill = (
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F5F3FF", border: "1px solid #A78BFA", borderRadius: 7, padding: "3px 10px", fontSize: 12 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#8B5CF6", flexShrink: 0 }} />
        <span style={{ color: "#5B21B6", fontWeight: 600 }}>WHAT IF</span>
        <span style={{ color: "#4C1D95", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>: {viewMode.item.label}</span>
        <button type="button" onClick={clearMode} style={{ marginLeft: 4, background: "#8B5CF6", color: "#fff", border: "none", borderRadius: 4, padding: "1px 7px", fontSize: 11, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>
          Back to LIVE
        </button>
      </div>
    )
  }

  const btnBase: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    border: "1px solid #E5E7EB", borderRadius: 7,
    padding: "4px 10px", fontSize: 12, fontWeight: 500, cursor: "pointer",
  }

  return (
    <>
      <nav className="bg-white border-b px-6 h-12 flex items-center gap-1 sticky top-0 z-30">
        <span className="font-bold text-gray-800 text-sm mr-4">Budget App</span>

        {navLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              path === l.href ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
            }`}
          >
            {l.label}
          </Link>
        ))}

        <div className="flex-1" />

        {modePill}

        {/* Buttons + dropdowns share one ref for outside-click */}
        <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6, position: "relative" }}>

          {/* ── Snapshots button ── */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpenPanel(openPanel === "snapshots" ? null : "snapshots")}
              style={{
                ...btnBase,
                background: openPanel === "snapshots" ? "#FFFBEB" : "#F9FAFB",
                color: openPanel === "snapshots" ? "#92400E" : "#6B7280",
                borderColor: openPanel === "snapshots" ? "#F59E0B" : "#E5E7EB",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm3 5a1 1 0 10-2 0v1H4a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2H8V9z" clipRule="evenodd" />
              </svg>
              Snapshots
              {snapshots.length > 0 && (
                <span style={{ background: "#E5E7EB", borderRadius: 10, padding: "0 5px", fontSize: 10, color: "#6B7280" }}>{snapshots.length}</span>
              )}
            </button>

            {openPanel === "snapshots" && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", width: 300, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "#FFFBEB", borderBottom: "1px solid #F3F4F6" }}>
                  <p style={{ fontSize: 11, color: "#92400E", lineHeight: 1.5, margin: 0 }}>
                    <strong>Read-only</strong> archives. Edits always go to <span style={{ color: "#16A34A", fontWeight: 600 }}>LIVE</span>.
                  </p>
                </div>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #F3F4F6" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Save a snapshot of LIVE now</p>
                  <input value={snapLabel} onChange={(e) => setSnapLabel(e.target.value)} placeholder="Label (required)" onKeyDown={(e) => e.key === "Enter" && saveSnapshot()} style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 5, padding: "4px 8px", fontSize: 12, marginBottom: 5, boxSizing: "border-box", outline: "none" }} />
                  <input value={snapNote} onChange={(e) => setSnapNote(e.target.value)} placeholder="Note (optional)" style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 5, padding: "4px 8px", fontSize: 12, marginBottom: 7, boxSizing: "border-box", outline: "none" }} />
                  <button type="button" disabled={!snapLabel.trim() || snapSaving} onClick={saveSnapshot} style={{ width: "100%", background: snapLabel.trim() ? "#F59E0B" : "#F3F4F6", color: snapLabel.trim() ? "#fff" : "#9CA3AF", border: "none", borderRadius: 5, padding: "5px 0", fontSize: 12, fontWeight: 600, cursor: snapLabel.trim() ? "pointer" : "default" }}>
                    {snapSaving ? "Saving…" : "Save snapshot"}
                  </button>
                </div>
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {loading && <div style={{ padding: "16px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>Loading…</div>}
                  {!loading && snapshots.length === 0 && <div style={{ padding: "16px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>No snapshots yet</div>}
                  {!loading && snapshots.map((s) => {
                    const active = viewMode.kind === "snapshot" && viewMode.item.id === s.id
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderBottom: "0.5px solid #F9FAFB", background: active ? "#FEF3C7" : "transparent" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {active && <span style={{ fontSize: 10, color: "#92400E", fontWeight: 700, marginRight: 4 }}>VIEWING</span>}
                            {s.label}
                          </div>
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{fmtDate(s.created_at)}</div>
                          {s.note && <div style={{ fontSize: 10, color: "#6B7280" }}>{s.note}</div>}
                        </div>
                        <button type="button" onClick={() => active ? (clearMode(), setOpenPanel(null)) : viewSnapshotItem(s)} style={{ background: active ? "#F59E0B" : "#F3F4F6", color: active ? "#fff" : "#374151", border: "none", borderRadius: 5, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontWeight: 500, flexShrink: 0 }}>
                          {active ? "← Live" : "View"}
                        </button>
                        <button type="button" onClick={() => deleteSnapshot(s.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 12, cursor: "pointer", padding: "1px 3px", flexShrink: 0 }} title="Delete">✕</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Scenarios button ── */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpenPanel(openPanel === "scenarios" ? null : "scenarios")}
              style={{
                ...btnBase,
                background: openPanel === "scenarios" ? "#F5F3FF" : "#F9FAFB",
                color: openPanel === "scenarios" ? "#5B21B6" : "#6B7280",
                borderColor: openPanel === "scenarios" ? "#A78BFA" : "#E5E7EB",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              Scenarios
              {scenarios.length > 0 && (
                <span style={{ background: "#EDE9FE", borderRadius: 10, padding: "0 5px", fontSize: 10, color: "#5B21B6" }}>{scenarios.length}</span>
              )}
            </button>

            {openPanel === "scenarios" && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", width: 300, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "#F5F3FF", borderBottom: "1px solid #F3F4F6" }}>
                  <p style={{ fontSize: 11, color: "#5B21B6", lineHeight: 1.5, margin: 0 }}>
                    <strong>Writable</strong> branches. Edit numbers independently — LIVE data is never affected.
                  </p>
                </div>
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #F3F4F6" }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Fork LIVE into a new scenario</p>
                  <input value={scenLabel} onChange={(e) => setScenLabel(e.target.value)} placeholder="Label (required)" onKeyDown={(e) => e.key === "Enter" && saveScenario()} style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 5, padding: "4px 8px", fontSize: 12, marginBottom: 5, boxSizing: "border-box", outline: "none" }} />
                  <input value={scenNote} onChange={(e) => setScenNote(e.target.value)} placeholder="Note (optional)" style={{ width: "100%", border: "1px solid #E5E7EB", borderRadius: 5, padding: "4px 8px", fontSize: 12, marginBottom: 7, boxSizing: "border-box", outline: "none" }} />
                  <button type="button" disabled={!scenLabel.trim() || scenSaving} onClick={saveScenario} style={{ width: "100%", background: scenLabel.trim() ? "#8B5CF6" : "#F3F4F6", color: scenLabel.trim() ? "#fff" : "#9CA3AF", border: "none", borderRadius: 5, padding: "5px 0", fontSize: 12, fontWeight: 600, cursor: scenLabel.trim() ? "pointer" : "default" }}>
                    {scenSaving ? "Creating…" : "Create scenario"}
                  </button>
                </div>
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {scenarios.length === 0 && <div style={{ padding: "16px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>No scenarios yet</div>}
                  {scenarios.map((s) => {
                    const active = viewMode.kind === "scenario" && viewMode.item.id === s.id
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderBottom: "0.5px solid #F9FAFB", background: active ? "#F5F3FF" : "transparent" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {active && <span style={{ fontSize: 10, color: "#5B21B6", fontWeight: 700, marginRight: 4 }}>EDITING</span>}
                            {s.label}
                          </div>
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{fmtDate(s.created_at)}</div>
                          {s.note && <div style={{ fontSize: 10, color: "#6B7280" }}>{s.note}</div>}
                        </div>
                        <button type="button" onClick={() => { active ? clearMode() : setScenario(s); setOpenPanel(null) }} style={{ background: active ? "#8B5CF6" : "#F3F4F6", color: active ? "#fff" : "#374151", border: "none", borderRadius: 5, padding: "2px 8px", fontSize: 11, cursor: "pointer", fontWeight: 500, flexShrink: 0 }}>
                          {active ? "← Live" : "Edit"}
                        </button>
                        <button type="button" onClick={() => deleteScenario(s.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 12, cursor: "pointer", padding: "1px 3px", flexShrink: 0 }} title="Delete">✕</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </nav>

      {/* Persistent banner when not in LIVE mode */}
      {viewMode.kind === "snapshot" && (
        <div style={{ background: "#FFFBEB", borderBottom: "1.5px solid #FCD34D", padding: "5px 24px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 48, zIndex: 29 }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="#D97706"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span style={{ fontSize: 12, color: "#92400E" }}>
            Viewing <strong>read-only snapshot</strong>: <strong>{viewMode.item.label}</strong>
            {viewMode.item.note && <span style={{ marginLeft: 6, color: "#B45309" }}>({viewMode.item.note})</span>}
            <span style={{ marginLeft: 8, color: "#B45309", fontSize: 11 }}>saved {fmtDate(viewMode.item.created_at)}</span>
            <span style={{ marginLeft: 12, color: "#D97706" }}>— Project page edits still go to LIVE.</span>
          </span>
          <button type="button" onClick={clearMode} style={{ marginLeft: "auto", background: "#D97706", color: "#fff", border: "none", borderRadius: 5, padding: "2px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>Back to LIVE</button>
        </div>
      )}

      {viewMode.kind === "scenario" && (
        <div style={{ background: "#F5F3FF", borderBottom: "1.5px solid #A78BFA", padding: "5px 24px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 48, zIndex: 29 }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="#7C3AED"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
          <span style={{ fontSize: 12, color: "#5B21B6" }}>
            Editing scenario: <strong>{viewMode.item.label}</strong>
            {viewMode.item.note && <span style={{ marginLeft: 6, color: "#6D28D9" }}>({viewMode.item.note})</span>}
            <span style={{ marginLeft: 12, color: "#7C3AED" }}>— Changes here do NOT affect LIVE data.</span>
          </span>
          <button type="button" onClick={clearMode} style={{ marginLeft: "auto", background: "#8B5CF6", color: "#fff", border: "none", borderRadius: 5, padding: "2px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>Back to LIVE</button>
        </div>
      )}
    </>
  )
}
