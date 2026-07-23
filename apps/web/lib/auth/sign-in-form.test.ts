import { readFile } from "node:fs/promises"

import { describe, expect, test } from "vitest"

const signInFormUrl = new URL(
  "../../components/auth/sign-in-form.tsx",
  import.meta.url
)

describe("sign-in form progressive safety", () => {
  test("does not allow a native credential-bearing GET before hydration", async () => {
    const source = await readFile(signInFormUrl, "utf8")

    expect(source).toContain('<form method="post" onSubmit={submit}>')
    expect(source).toContain("disabled={!isReady || isPending}")
    expect(source).toContain("setIsReady(true)")
  })
})
