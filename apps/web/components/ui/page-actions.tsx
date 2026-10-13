"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

export const PageActionsTarget = createContext<HTMLElement | null>(null)

export function useShellPageActions() {
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(
    null
  )
  const [headerHeight, setHeaderHeight] = useState(64)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    const measure = () => setHeaderHeight(header.getBoundingClientRect().height)
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    measure()
    return () => observer.disconnect()
  }, [])

  return { actionsTarget, setActionsTarget, headerHeight, headerRef }
}

export function PageActions({ children }: { children: ReactNode }) {
  const target = useContext(PageActionsTarget)
  return target ? createPortal(children, target) : children
}
