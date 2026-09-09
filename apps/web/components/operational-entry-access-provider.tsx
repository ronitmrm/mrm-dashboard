"use client"

import { createContext, useCallback, useContext, type ReactNode } from "react"
import {
  operationalEntryCapability,
  type OperationalEntryAction,
} from "@/lib/auth/operational-entry-capabilities"

const OperationalEntryAccessContext = createContext<readonly string[] | null>(null)
const OperationalEntryStateUrlContext = createContext<string | undefined>(undefined)

export function OperationalEntryAccessProvider({
  permissions,
  stateUrl,
  children,
}: {
  permissions: readonly string[] | null
  stateUrl?: string
  children: ReactNode
}) {
  return (
    <OperationalEntryAccessContext.Provider value={permissions}>
      <OperationalEntryStateUrlContext.Provider value={stateUrl}>
        {children}
      </OperationalEntryStateUrlContext.Provider>
    </OperationalEntryAccessContext.Provider>
  )
}

export function useOperationalEntryStateUrl() {
  return useContext(OperationalEntryStateUrlContext)
}

export function useOperationalEntryAccess() {
  const permissions = useContext(OperationalEntryAccessContext)
  return useCallback(
    (entry: string, action: OperationalEntryAction, unit?: string) => {
      if (permissions === null) return true
      if (!unit) return false
      return permissions.includes(operationalEntryCapability(entry, action, unit))
    },
    [permissions]
  )
}
