"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"

import { Button } from "@workspace/ui/components/button"
import { StandardState } from "@workspace/ui/components/standard-state"

import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString()

export default function PdfDocumentPreview({ source }: { source: string }) {
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(0)
  const container = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  function changePage(nextPage: number) {
    setPage(nextPage)
    scroller.current?.scrollTo({ top: 0, left: 0 })
  }

  return (
    <section aria-label="PDF viewer" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b p-2">
        <Button
          aria-label="Previous page"
          size="icon"
          variant="outline"
          disabled={page <= 1}
          onClick={() => changePage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm tabular-nums" aria-live="polite">
          {pageCount ? `Page ${page} of ${pageCount}` : "Loading pages…"}
        </span>
        <Button
          aria-label="Next page"
          size="icon"
          variant="outline"
          disabled={!pageCount || page >= pageCount}
          onClick={() => changePage(page + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          aria-label="Zoom out"
          size="icon"
          variant="outline"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
        >
          <Minus />
        </Button>
        <span className="text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button
          aria-label="Zoom in"
          size="icon"
          variant="outline"
          disabled={zoom >= 2}
          onClick={() => setZoom((value) => Math.min(2, value + 0.25))}
        >
          <Plus />
        </Button>
      </div>
      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-auto bg-muted p-2 sm:p-4"
      >
        <div ref={container} className="mx-auto w-full max-w-5xl">
          <Document
            file={source}
            onLoadSuccess={({ numPages }) => setPageCount(numPages)}
            loading={
              <StandardState
                variant="loading"
                title="Loading PDF"
                description="Fetching document pages."
              />
            }
            error={
              <StandardState
                variant="error"
                title="PDF preview unavailable"
                description="Try reopening this document, or use Download Original above."
              />
            }
          >
            {width > 0 ? (
              <Page
                key={page}
                pageNumber={page}
                width={width * zoom}
                devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
                loading={
                  <StandardState
                    variant="loading"
                    title={`Loading page ${page}`}
                    description="Preparing this page."
                  />
                }
                error={
                  <StandardState
                    variant="error"
                    title="Page could not be displayed"
                    description="Try another page or download the original document."
                  />
                }
              />
            ) : null}
          </Document>
        </div>
      </div>
    </section>
  )
}
