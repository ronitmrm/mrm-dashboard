import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  ActionToolbar,
  FormGrid,
  FormSection,
  PageHeader,
  StandardState,
} from "../components/ui/golden-patterns"
import { MetricCard, SectionCard } from "@workspace/ui/components/card"
import { StatusBadge } from "@workspace/ui/components/badge"

describe("Golden UI patterns", () => {
  it("renders typed semantic cards and statuses", () => {
    const markup = renderToStaticMarkup(
      <SectionCard tone="information">
        <MetricCard label="On time" tone="positive" value="42" />
        <StatusBadge tone="danger">Overdue</StatusBadge>
        <StatusBadge value="Pending" />
      </SectionCard>
    )

    expect(markup).toContain('data-slot="section-card"')
    expect(markup).toContain('data-tone="information"')
    expect(markup).toContain('data-tone="positive"')
    expect(markup).toContain('data-tone="danger"')
    expect(markup).toContain('data-tone="warning"')
  })

  it("renders the canonical page, toolbar, form, and state compositions", () => {
    const markup = renderToStaticMarkup(
      <>
        <PageHeader
          description="Canonical dashboard patterns"
          title="UI Reference"
        />
        <ActionToolbar aria-label="Reference actions">Actions</ActionToolbar>
        <FormSection
          description="Compact field layout"
          title="Operational form"
        >
          <FormGrid>Fields</FormGrid>
        </FormSection>
        <StandardState
          description="Try again later."
          title="Unavailable"
          variant="error"
        />
      </>
    )

    for (const slot of [
      "page-header",
      "action-toolbar",
      "form-section",
      "form-grid",
      "standard-state",
    ]) {
      expect(markup).toContain(`data-slot="${slot}"`)
    }
    expect(markup).toContain('role="alert"')
  })
})
