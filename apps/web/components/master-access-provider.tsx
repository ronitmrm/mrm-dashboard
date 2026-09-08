"use client"

import { createContext, useCallback, useContext, type ReactNode } from "react"
import { productionMasterCapability } from "@/lib/auth/production-master-access"
import {
  masterCapability,
  type MasterAction,
} from "@/lib/auth/master-capabilities"

const MasterAccessContext = createContext<readonly string[] | null>(null)
const MasterStateUrlContext = createContext<string | undefined>(undefined)

export function MasterAccessProvider({
  permissions,
  stateUrl,
  children,
}: {
  permissions: readonly string[] | null
  stateUrl?: string
  children: ReactNode
}) {
  return (
    <MasterAccessContext.Provider value={permissions}>
      <MasterStateUrlContext.Provider value={stateUrl}>
        {children}
      </MasterStateUrlContext.Provider>
    </MasterAccessContext.Provider>
  )
}

export function useMasterStateUrl() {
  return useContext(MasterStateUrlContext)
}

export function useMasterAccess() {
  const permissions = useContext(MasterAccessContext)
  return useCallback(
    (
      entry: string,
      action: MasterAction,
      floor?: string,
      storeMaster = "ITEM_TYPE"
    ) => {
      if (permissions === null) return true
      const key =
        entry === "store_masters"
          ? masterCapability(storeMaster, action)
          : productionMasterCapability(entry, action, floor)
      return key !== null && permissions.includes(key)
    },
    [permissions]
  )
}
