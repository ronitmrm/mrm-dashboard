"use server"

import { headers } from "next/headers"

import { getAuth } from "@/lib/auth/auth"
import { createPasswordResetService } from "@/lib/auth/password-reset"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { optionalText, requiredText } from "@/lib/form-data"

const passwordPath = "/account/password"

export type PasswordResetActionState = {
  message: string
  status: "idle" | "error" | "success"
}

export async function resetPasswordAction(
  _state: PasswordResetActionState,
  formData: FormData
): Promise<PasswordResetActionState> {
  await requireAuthenticatedSession(passwordPath)

  try {
    const newPassword = requiredText(formData, "newPassword")
    const confirmation = requiredText(formData, "confirmPassword")
    if (newPassword !== confirmation) {
      return { message: "New passwords do not match.", status: "error" }
    }
    if (newPassword.length < 6) {
      return {
        message: "Password must contain at least 6 characters.",
        status: "error",
      }
    }
    if (newPassword.length > 128) {
      return {
        message: "Password must contain no more than 128 characters.",
        status: "error",
      }
    }

    const reset = createPasswordResetService({ auth: getAuth() })
    await reset.resetPassword({
      currentPassword: optionalText(formData, "currentPassword"),
      headers: await headers(),
      newPassword,
      targetUserId: requiredText(formData, "targetUserId"),
    })

    return {
      message: "Password updated successfully.",
      status: "success",
    }
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : "Password update failed.",
      status: "error",
    }
  }
}
