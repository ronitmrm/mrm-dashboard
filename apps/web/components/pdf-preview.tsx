"use client"

import dynamic from "next/dynamic"

import { StandardState } from "@workspace/ui/components/standard-state"

const PdfDocumentPreview = dynamic(() => import("./pdf-document-preview"), {
  ssr: false,
  loading: () => (
    <StandardState
      variant="loading"
      title="Loading PDF"
      description="Preparing the document viewer."
    />
  ),
})

export function PdfPreview({ source }: { source: string }) {
  return <PdfDocumentPreview key={source} source={source} />
}
