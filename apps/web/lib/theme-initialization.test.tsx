import { runInNewContext } from "node:vm"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

vi.mock("next/font/google", () => ({
  Hind: () => ({ variable: "font-hind" }),
  Hind_Vadodara: () => ({ variable: "font-gujarati" }),
  Outfit: () => ({ variable: "font-outfit" }),
}))
vi.mock(
  "@/components/theme-provider",
  async () => import("../components/theme-provider")
)
vi.mock("@/components/software-processing-provider", () => ({
  SoftwareProcessingProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}))

import RootLayout from "../app/layout"

it("applies saved dark mode before page content and React hydration", async () => {
  const html = renderToStaticMarkup(
    await RootLayout({ children: <main>Page</main> })
  )
  const head = html.split("</head>")[0]!
  const script = head.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1]
  expect(script).toBeDefined()
  const classes = new Set<string>()
  const root = {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (...names: string[]) =>
        names.forEach((name) => classes.delete(name)),
    },
    style: { colorScheme: "light" },
  }
  runInNewContext(script!, {
    document: { documentElement: root },
    window: {
      localStorage: { getItem: () => "dark" },
      matchMedia: () => ({ matches: false }),
    },
  })
  expect(classes.has("dark")).toBe(true)
  expect(root.style.colorScheme).toBe("dark")
})
