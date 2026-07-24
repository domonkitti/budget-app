"use client"

import { createContext, useContext, useState } from "react"
import type { FlatProject, Snapshot } from "@/lib/types"

export type ViewMode =
  | { kind: "live" }
  | { kind: "snapshot"; item: Snapshot; data: FlatProject[] }

type Ctx = {
  viewMode: ViewMode
  setSnapshot: (snap: Snapshot, data: FlatProject[]) => void
  clearMode: () => void
}

const ViewCtx = createContext<Ctx>({
  viewMode: { kind: "live" },
  setSnapshot: () => {},
  clearMode: () => {},
})

export function SnapshotProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>({ kind: "live" })

  return (
    <ViewCtx.Provider
      value={{
        viewMode,
        setSnapshot: (snap, data) => setViewMode({ kind: "snapshot", item: snap, data }),
        clearMode: () => setViewMode({ kind: "live" }),
      }}
    >
      {children}
    </ViewCtx.Provider>
  )
}

export const useViewMode = () => useContext(ViewCtx)

// Legacy shim — keeps existing pages compiling without changes until fully migrated
export const useSnapshotCtx = () => {
  const { viewMode, setSnapshot, clearMode } = useContext(ViewCtx)
  return {
    active: viewMode.kind === "snapshot" ? viewMode.item : null,
    snapshotData: viewMode.kind === "snapshot" ? viewMode.data : null,
    setSnapshot,
    clearSnapshot: clearMode,
  }
}
