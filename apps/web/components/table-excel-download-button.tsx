"use client"

import { useState } from "react"

import { DataDownloadButton } from "@/components/data-download-button"

function cellText(cell: HTMLTableCellElement) {
  if (cell.dataset.exportValue !== undefined) return cell.dataset.exportValue
  const copy = cell.cloneNode(true) as HTMLTableCellElement
  copy
    .querySelectorAll(
      '[data-slot="table-column-filter-host"], button, input, select, textarea, form'
    )
    .forEach((element) => element.remove())
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim()
}

export function TableExcelDownloadButton({
  fileName,
  tableId,
}: {
  fileName: string
  tableId: string
}) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState("")

  async function download() {
    setError("")
    setDownloading(true)
    try {
      const table = document.getElementById(tableId)
      if (!(table instanceof HTMLTableElement) || !table.tHead?.rows[0]) {
        throw new Error(
          "The stock register is unavailable. Refresh and try again."
        )
      }
      const headers = Array.from(table.tHead.rows[0].cells)
      const columns = headers.flatMap((cell, index) =>
        cell.dataset.exportIgnore === "true" ? [] : [index]
      )
      const rows = Array.from(table.tBodies)
        .flatMap((body) => Array.from(body.rows))
        .filter((row) => !row.hidden && row.cells.length === headers.length)
        .map((row) => columns.map((index) => cellText(row.cells[index]!)))
      const { utils, writeFileXLSX } = await import("xlsx")
      const sheet = utils.aoa_to_sheet([
        columns.map((index) => cellText(headers[index]!)),
        ...rows,
      ])
      sheet["!cols"] = columns.map(() => ({ wch: 24 }))
      sheet["!autofilter"] = { ref: sheet["!ref"]! }
      const workbook = utils.book_new()
      utils.book_append_sheet(workbook, sheet, "Stock")
      writeFileXLSX(workbook, fileName, { compression: true })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Excel download failed. Try again."
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="grid gap-1">
      <DataDownloadButton
        disabled={downloading}
        label={downloading ? "Preparing Excel…" : "Download Excel"}
        onClick={download}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
