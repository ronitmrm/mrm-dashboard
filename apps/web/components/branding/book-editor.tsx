"use client"

import dynamic from "next/dynamic"
import {
  brandingOutline,
  plainBrandingRichText,
  brandingRichTextPlain,
  type BrandingSection,
  type BrandingTranslation,
} from "@workspace/db/branding-domain"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

const RichTextEditor = dynamic(() => import("./rich-text-editor"), {
  ssr: false,
})
const emptyText = plainBrandingRichText("")

function HeadingGroup({
  sections,
  onChange,
  language,
  parent = [],
  numbering = "hierarchical",
  disabled,
  total,
}: {
  sections: BrandingSection[]
  onChange: (sections: BrandingSection[]) => void
  language: string
  parent?: number[]
  numbering?: BrandingSection["childNumbering"]
  disabled: boolean
  total: number
}) {
  const update = (index: number, patch: Partial<BrandingSection>) =>
    onChange(
      sections.map((section, at) =>
        at === index ? { ...section, ...patch } : section
      )
    )
  return (
    <div className="grid min-w-0 gap-6">
      {sections.map((section, index) => {
        const path = [...parent, index + 1]
        const id = `book-${language}-${path.join("-")}`
        const number =
          numbering === "none"
            ? ""
            : numbering === "local"
              ? `${index + 1}`
              : path.join(".")
        const move = (offset: number) => {
          const next = [...sections]
          ;[next[index], next[index + offset]] = [
            next[index + offset]!,
            next[index]!,
          ]
          onChange(next)
        }
        return (
          <section key={id} className="grid min-w-0 gap-3 border-l-2 pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">
                {parent.length ? "Subheading" : "Heading"} {number}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!index}
                onClick={() => move(-1)}
              >
                Move Up
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={index === sections.length - 1}
                onClick={() => move(1)}
              >
                Move Down
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange(sections.filter((_, at) => at !== index))
                }
              >
                Remove {parent.length ? "Subheading" : "Heading"}
              </Button>
            </div>
            <Label htmlFor={`${id}-heading`}>Heading {number}</Label>
            <Input
              id={`${id}-heading`}
              lang={language}
              value={section.heading}
              maxLength={200}
              onChange={(event) =>
                update(index, { heading: event.target.value })
              }
            />
            <div className="flex flex-wrap gap-4">
              <Label>
                <Checkbox
                  checked={section.pageBreakBefore ?? false}
                  onCheckedChange={(value) =>
                    update(index, { pageBreakBefore: value === true })
                  }
                />
                Start on new page
              </Label>
              {parent.length ? (
                <Label>
                  <Checkbox
                    checked={section.includeInIndex ?? true}
                    onCheckedChange={(value) =>
                      update(index, { includeInIndex: value === true })
                    }
                  />
                  Include in index
                </Label>
              ) : null}
            </div>
            <Label htmlFor={`${id}-body`}>Body {number}</Label>
            <RichTextEditor
              id={`${id}-body`}
              label={`Body ${path.join(".")}`}
              language={language}
              disabled={disabled}
              value={section.richBody ?? plainBrandingRichText(section.body)}
              onChange={(richBody) =>
                update(index, {
                  richBody,
                  body: brandingRichTextPlain(richBody),
                })
              }
            />
            {section.children?.length ? (
              <>
                <Label htmlFor={`${id}-numbering`}>Subheading numbering</Label>
                <NativeSelect
                  id={`${id}-numbering`}
                  value={section.childNumbering ?? "hierarchical"}
                  onChange={(event) =>
                    update(index, {
                      childNumbering: event.target
                        .value as BrandingSection["childNumbering"],
                    })
                  }
                >
                  <NativeSelectOption value="hierarchical">
                    Hierarchical ({path.join(".")}.1, {path.join(".")}.2)
                  </NativeSelectOption>
                  <NativeSelectOption value="local">
                    Local (1, 2)
                  </NativeSelectOption>
                  <NativeSelectOption value="none">
                    Unnumbered
                  </NativeSelectOption>
                </NativeSelect>
                <HeadingGroup
                  sections={section.children}
                  onChange={(children) => update(index, { children })}
                  language={language}
                  parent={path}
                  numbering={section.childNumbering}
                  disabled={disabled}
                  total={total}
                />
              </>
            ) : null}
            {path.length < 4 ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit"
                disabled={total >= 100}
                onClick={() =>
                  update(index, {
                    children: [
                      ...(section.children ?? []),
                      { heading: "", body: "" },
                    ],
                  })
                }
              >
                Add Subheading
              </Button>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

export default function BrandingBookEditor({
  translation,
  onChange,
  disabled,
}: {
  translation: BrandingTranslation
  onChange: (patch: Partial<BrandingTranslation>) => void
  disabled: boolean
}) {
  const details = translation.details ?? {
    introduction: emptyText,
    preparedBy: "",
    attributions: [],
  }
  const total = brandingOutline(translation.sections).length
  return (
    <div className="grid min-w-0 gap-5">
      <h4 className="font-semibold">Document details page</h4>
      <Label htmlFor={`intro-${translation.language}`}>
        About this document
      </Label>
      <RichTextEditor
        id={`intro-${translation.language}`}
        label="About this document"
        language={translation.language}
        disabled={disabled}
        value={details.introduction}
        onChange={(introduction) =>
          onChange({ details: { ...details, introduction } })
        }
      />
      <Label htmlFor={`prepared-${translation.language}`}>Prepared by</Label>
      <Input
        id={`prepared-${translation.language}`}
        value={details.preparedBy}
        maxLength={240}
        onChange={(event) =>
          onChange({ details: { ...details, preparedBy: event.target.value } })
        }
      />
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Optional printed attributions
        </summary>
        <p className="my-3 text-sm text-muted-foreground">
          Enter names and designations only when applicable. These printed
          fields do not send approval requests.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["Issued by", "Reviewed by", "Approved by"] as const).map(
            (role) => {
              const attribution = details.attributions.find(
                (entry) => entry.role === role
              ) ?? { role, name: "", designation: "" }
              const update = (patch: Partial<typeof attribution>) =>
                onChange({
                  details: {
                    ...details,
                    attributions: [
                      ...details.attributions.filter(
                        (entry) => entry.role !== role
                      ),
                      { ...attribution, ...patch },
                    ],
                  },
                })
              return (
                <div key={role} className="grid gap-2">
                  <Label htmlFor={`${translation.language}-${role}`}>
                    {role}
                  </Label>
                  <Input
                    id={`${translation.language}-${role}`}
                    value={attribution.name}
                    maxLength={160}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                  <Label
                    htmlFor={`${translation.language}-${role}-designation`}
                  >
                    {role} designation
                  </Label>
                  <Input
                    id={`${translation.language}-${role}-designation`}
                    value={attribution.designation}
                    maxLength={160}
                    onChange={(event) =>
                      update({ designation: event.target.value })
                    }
                  />
                </div>
              )
            }
          )}
        </div>
      </details>
      <h4 className="font-semibold">Headings and content</h4>
      <p className="text-sm text-muted-foreground">
        Headings flow across pages. Use subheadings for titled sections; use
        list indentation for steps and subpoints within a body.
      </p>
      <HeadingGroup
        sections={translation.sections}
        onChange={(sections) => onChange({ sections })}
        language={translation.language}
        disabled={disabled}
        total={total}
      />
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={total >= 100}
        onClick={() =>
          onChange({
            sections: [...translation.sections, { heading: "", body: "" }],
          })
        }
      >
        Add Heading
      </Button>
    </div>
  )
}
