import type { AuthSystem } from "./auth"

type PasswordResetInput = {
  currentPassword?: string
  headers: Headers
  newPassword: string
  targetUserId: string
}

export function createPasswordResetService({
  auth,
}: {
  auth: AuthSystem["auth"]
}) {
  async function authenticatedSession(headers: Headers) {
    const session = await auth.api.getSession({ headers })
    if (!session) throw new Error("You must sign in to change a password")
    return session
  }

  return {
    async getScreenContext(headers: Headers) {
      const session = await authenticatedSession(headers)
      const isAdministrator = session.user.role === "admin"

      if (!isAdministrator) {
        return {
          currentUserId: session.user.id,
          isAdministrator,
          users: [
            {
              email: session.user.email,
              id: session.user.id,
              name: session.user.name,
            },
          ],
        }
      }

      const result = await auth.api.listUsers({
        headers,
        query: {
          limit: 1_000,
          sortBy: "name",
          sortDirection: "asc",
        },
      })
      return {
        currentUserId: session.user.id,
        isAdministrator,
        users: result.users.map((user) => ({
          email: user.email,
          id: user.id,
          name: user.name,
        })),
      }
    },

    async resetPassword({
      currentPassword,
      headers,
      newPassword,
      targetUserId,
    }: PasswordResetInput) {
      const session = await authenticatedSession(headers)
      if (session.user.role === "admin") {
        await auth.api.setUserPassword({
          body: { newPassword, userId: targetUserId },
          headers,
        })
        await auth.api.revokeUserSessions({
          body: { userId: targetUserId },
          headers,
        })
        return
      }

      if (targetUserId !== session.user.id) {
        throw new Error("You can only change your own password")
      }
      if (!currentPassword) throw new Error("Current password is required")

      await auth.api.changePassword({
        body: {
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        },
        headers,
      })
    },
  }
}
