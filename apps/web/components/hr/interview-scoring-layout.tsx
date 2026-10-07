"use client"

import { JobTemplateReference } from "@/components/hr/job-template-preview"

export function InterviewScoringLayout({
  children,
  templateCode,
}: {
  children: React.ReactNode
  templateCode: string | null
}) {
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-start">
      <div className="min-w-0">{children}</div>
      <aside className="order-first max-h-56 min-w-0 overflow-y-auto lg:sticky lg:top-0 lg:order-last lg:max-h-[calc(100vh-9rem)]">
        <JobTemplateReference code={templateCode} />
      </aside>
    </div>
  )
}
