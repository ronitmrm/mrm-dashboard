"use client"

import { useState } from "react"
import Link from "next/link"
import { KeyRound, LogOut } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { authClient } from "../lib/auth/auth-client"

export function UserAccountFooter({
  user,
}: {
  user: { email: string; name: string }
}) {
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function signOut() {
    setIsSigningOut(true)
    try {
      await authClient.signOut()
      window.location.assign("/sign-in")
    } catch {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1 rounded-lg">
      <Link
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        href="/account/password"
        title="Password & Security"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/12 text-sm font-semibold text-sidebar-primary">
          {(user.name || user.email).trim().charAt(0).toUpperCase()}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-sm font-semibold">{user.name}</span>
          <span className="truncate text-xs text-sidebar-foreground">
            {user.email}
          </span>
        </span>
        <KeyRound className="size-4 shrink-0 text-sidebar-foreground" />
      </Link>
      <Button
        aria-label="Sign out"
        className="size-9 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        disabled={isSigningOut}
        onClick={() => void signOut()}
        title="Sign out"
        type="button"
        variant="ghost"
      >
        <LogOut className="size-4" />
      </Button>
    </div>
  )
}
