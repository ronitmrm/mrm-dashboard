export const PUBLIC_CONVEX_URL = requiredPublicEnv(
  "NEXT_PUBLIC_CONVEX_URL",
  process.env.NEXT_PUBLIC_CONVEX_URL,
)
export const PUBLIC_CONVEX_SITE_URL = requiredPublicEnv(
  "NEXT_PUBLIC_CONVEX_SITE_URL",
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
)

function requiredPublicEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `${name} is required. Copy apps/web/.env.example to apps/web/.env.local and set the Convex URL for cloud or local self-hosted development.`
    )
  }
  return value
}
