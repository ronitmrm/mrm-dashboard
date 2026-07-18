import Image from "next/image"

import { SignInForm } from "@/components/auth/sign-in-form"
import { safeReturnPath } from "@/lib/auth/navigation"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-6">
      <div className="grid w-full max-w-md gap-8">
        <Image
          src="/mrm-green.svg"
          alt="MRMPL"
          width={792}
          height={176}
          priority
          className="mx-auto h-10 w-auto"
        />
        <SignInForm returnPath={safeReturnPath(next)} />
      </div>
    </main>
  )
}
