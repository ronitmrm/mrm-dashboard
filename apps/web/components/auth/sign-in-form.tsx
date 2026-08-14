"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, LoaderCircle } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { authClient } from "@/lib/auth/auth-client"

export function SignInForm({ returnPath }: { returnPath: string }) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [isReady, setIsReady] = useState(false)
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsReady(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setIsPending(true)

    try {
      const form = new FormData(event.currentTarget)
      const result = await authClient.signIn.email({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      })

      if (result.error) {
        setError(result.error.message ?? "Sign in failed")
        setIsPending(false)
        return
      }

      router.replace(returnPath)
      router.refresh()
    } catch {
      setError("Sign in could not reach the server. Please try again.")
      setIsPending(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Sign In To Mrmpl</CardTitle>
        <CardDescription>
          Use The Fresh Account Provisioned For The Unified Postgresql
          Application.
        </CardDescription>
      </CardHeader>
      <form method="post" onSubmit={submit}>
        <fieldset
          className="min-w-0 border-0 p-0"
          disabled={!isReady || isPending}
        >
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                autoComplete="email"
                id="email"
                name="email"
                placeholder="name@mrmpl.com"
                required
                type="email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete="current-password"
                id="password"
                name="password"
                required
                type="password"
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="mt-6">
            <Button className="w-full" size="lg" type="submit">
              {isPending || !isReady ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ArrowRight />
              )}
              {isPending
                ? "Signing In"
                : isReady
                  ? "Continue"
                  : "Preparing Sign In"}
            </Button>
          </CardFooter>
        </fieldset>
      </form>
    </Card>
  )
}
