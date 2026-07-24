"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Snapshot } from "@/lib/types"
import { useViewMode } from "@/app/SnapshotProvider"

function fmtDate(s: string) {
  return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
}

export default function Navbar() {
  const path = usePathname()
  const { viewMode, setSnapshot, clearMode } = useViewMode()

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [openPanel, setOpenPanel] = useState<"snapshots" | null>(null)

  // Snapshot form
  const [snapLabel, setSnapLabel] = useState("")
  const [snapNote, setSnapNote] = useState("")
  const [snapSaving, setSnapSaving] = useState(false)

  const [loading, setLoading] = useState(false)
  const [aiExporting, setAiExporting] = useState(false)
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
      setSnapshots(await api.snapshots())
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

  async function exportForAI() {
    setAiExporting(true)
    try {
      const { reportApi } = await import("@/lib/reportApi")
      const [projects, groups, reports] = await Promise.all([
        api.flatProjects(),
        reportApi.reportGroups(),
        reportApi.reports(),
      ])
      const { buildAIExport, downloadText } = await import("@/lib/exportAI")
      const date = new Date().toISOString().slice(0, 10)
      downloadText(`budget-ai-export-${date}.md`, buildAIExport(projects, groups, reports))
    } catch (e) {
      alert(String(e))
    } finally {
      setAiExporting(false)
    }
  }

  async function promoteSnapshot(s: Snapshot) {
    const defaultName = `Live before restoring "${s.label}" — ${fmtDate(new Date().toISOString())}`
    const backupName = window.prompt(
      `Restoring "${s.label}" will overwrite current LIVE data.\n\nName a backup of the current LIVE data before continuing (or Cancel to abort):`,
      defaultName
    )
    if (backupName === null) return
    try {
      await api.createSnapshot(backupName.trim() || defaultName, "Auto-backup before restoring a snapshot")
      await api.promoteSnapshot(s.id)
      // Force a full reload — pages only refetch live data when viewMode.kind
      // *changes*, so if we were already on LIVE this is otherwise a no-op
      // and the page keeps showing stale pre-promote numbers.
      window.location.reload()
    } catch (e) { alert(String(e)) }
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

  const navLinks = [
    { href: "/", label: "Overall" },
    { href: "/category", label: "Category" },
    { href: "/compare", label: "Compare" },
    { href: "/scoring", label: "Scoring" },
    { href: "/projects", label: "Projects" },
    { href: "/report", label: "Report" },
    { href: "/admin", label: "Admin" },
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
  }

  const btnBase: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    border: "1px solid #E5E7EB", borderRadius: 7,
    padding: "4px 10px", fontSize: 12, fontWeight: 500, cursor: "pointer",
  }

  return (
    <>
      <nav className="no-print bg-white border-b px-6 h-12 flex items-center gap-1 sticky top-0 z-30">
        <span className="font-bold text-gray-800 text-sm mr-4">Budget App</span>

        {navLinks.map((l) => {
          const active = path === l.href ||
            (l.href === "/projects" && (path.startsWith("/projects") || path.startsWith("/import"))) ||
            (l.href === "/report" && path.startsWith("/report"))
          return (
            <Link
              key={l.href}
              href={l.href}
              prefetch={false}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                active ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              {l.label}
            </Link>
          )
        })}

        <div className="flex-1" />

        {modePill}

        {/* Buttons + dropdowns share one ref for outside-click */}
        <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6, position: "relative" }}>

          {/* ── AI export button ── */}
          <button
            type="button"
            onClick={exportForAI}
            disabled={aiExporting}
            title="ดาวน์โหลดข้อมูลทั้งหมดเป็นไฟล์ .md — แนบให้ AI (copilot) แล้วถามอะไรก็ได้เกี่ยวกับข้อมูลงบประมาณและรายงาน"
            style={{
              ...btnBase,
              background: "#F9FAFB",
              color: aiExporting ? "#9CA3AF" : "#6B7280",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
            </svg>
            {aiExporting ? "Exporting…" : "AI Export"}
          </button>

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
                        <button type="button" onClick={() => promoteSnapshot(s)} title="Restore to LIVE" style={{ background: "none", border: "1px solid #E5E7EB", borderRadius: 5, color: "#374151", fontSize: 11, cursor: "pointer", padding: "1px 6px", flexShrink: 0 }}>↑ LIVE</button>
                        <button type="button" onClick={() => deleteSnapshot(s.id)} style={{ background: "none", border: "none", color: "#EF4444", fontSize: 12, cursor: "pointer", padding: "1px 3px", flexShrink: 0 }} title="Delete">✕</button>
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

    </>
  )
}
