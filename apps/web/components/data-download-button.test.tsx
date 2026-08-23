import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DataDownloadButton } from "./data-download-button"

describe("DataDownloadButton", () => {
  it("renders the standard Excel download action", () => {
    const html = renderToStaticMarkup(
      createElement(DataDownloadButton, { href: "/register.xlsx" })
    )

    expect(html).toContain('href="/register.xlsx"')
    expect(html).toContain("Download Excel")
    expect(html).toContain('data-icon="inline-start"')
  })

  it("supports an accurate CSV label with the same button", () => {
    const html = renderToStaticMarkup(
      createElement(DataDownloadButton, {
        href: "/register.csv",
        label: "Download CSV",
      })
    )

    expect(html).toContain("Download CSV")
    expect(html).toContain('data-icon="inline-start"')
  })
})
