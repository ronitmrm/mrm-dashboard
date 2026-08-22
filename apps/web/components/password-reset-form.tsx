"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { KeyRound, LoaderCircle } from "lucide-react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

import {
  resetPasswordAction,
  type PasswordResetActionState,
} from "@/app/account/password/password-action"

type PasswordResetUser = {
  email: string
  id: string
  name: string
}

const initialPasswordResetActionState: PasswordResetActionState = {
  message: "",
  status: "idle",
}

export function PasswordResetForm({
  currentUserId,
  isAdministrator,
  users,
}: {
  currentUserId: string
  isAdministrator: boolean
  users: PasswordResetUser[]
}) {
  const [state, action] = useActionState(
    resetPasswordAction,
    initialPasswordResetActionState
  )

  return (
    <form action={action} className="grid gap-5">
      {isAdministrator ? (
        <div className="grid gap-2">
          <Label htmlFor="targetUserId">Account</Label>
          <NativeSelect
            className="w-full"
            defaultValue={currentUserId}
            id="targetUserId"
            name="targetUserId"
          >
            {users.map((user) => (
              <NativeSelectOption key={user.id} value={user.id}>
                {user.name} — {user.email}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            Resetting an account signs it out on every device.
          </p>
        </div>
      ) : (
        <>
          <input name="targetUserId" type="hidden" value={currentUserId} />
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              autoComplete="current-password"
              id="currentPassword"
              maxLength={128}
              name="currentPassword"
              required
              type="password"
            />
          </div>
        </>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="newPassword">New Password</Label>
          <Input
            autoComplete="new-password"
            id="newPassword"
            maxLength={128}
            minLength={6}
            name="newPassword"
            required
            type="password"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <Input
            autoComplete="new-password"
            id="confirmPassword"
            maxLength={128}
            minLength={6}
            name="confirmPassword"
            required
            type="password"
          />
        </div>
      </div>

      {state.status !== "idle" ? (
        <Alert variant={state.status === "error" ? "destructive" : "default"}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton isAdministrator={isAdministrator} />
      </div>
    </form>
  )
}

function SubmitButton({ isAdministrator }: { isAdministrator: boolean }) {
  const { pending } = useFormStatus()
  const label = isAdministrator ? "Reset Password" : "Change Password"

  return (
    <Button disabled={pending} type="submit">
      {pending ? <LoaderCircle className="animate-spin" /> : <KeyRound />}
      {pending ? "Updating" : label}
    </Button>
  )
}
