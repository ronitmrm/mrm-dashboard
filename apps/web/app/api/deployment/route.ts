export const dynamic = "force-dynamic"

// The release that is live right now; open tabs compare it with the one they loaded.
export function GET() {
  return Response.json(
    { deploymentId: process.env.NEXT_DEPLOYMENT_ID ?? null },
    { headers: { "Cache-Control": "no-store" } }
  )
}
