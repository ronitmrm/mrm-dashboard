"use client"
import { useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Save } from "lucide-react"
import {
  brandingFields,
  brandingNoticeBody,
  brandingLanguages,
  brandingLanguageLabels,
  brandingStepNumber,
  type BrandingContent,
  type BrandingSection,
  type BrandingLanguage,
  type BrandingType,
  type WorkInstructionLayout,
} from "@workspace/db/branding-domain"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { prepareBrandingPicture } from "@/lib/branding/picture"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  ActionToolbar,
  FormGrid,
  FormSection,
} from "@/components/ui/golden-patterns"
import { saveBrandingDraft } from "@/app/branding/actions"

import { BrandingNoticeEditor } from "./notice-editor"

const BrandingBookEditor = dynamic(() => import("./book-editor"))

function visualGuidePair(sections: BrandingSection[] = []): BrandingSection[] {
  return (["bad", "good"] as const).map((assessment, index) => {
    const existing =
      sections.find((section) => section.assessment === assessment) ??
      sections[index]
    return {
      heading: "",
      body: [existing?.heading, existing?.body].filter(Boolean).join("\n"),
      picture: existing?.picture,
      layout: "visual-guide",
      assessment,
    }
  })
}

export function BrandingDocumentEditor({
  type,
  documentId,
  version,
  initial,
}: {
  type: BrandingType
  documentId?: string
  version?: number
  initial?: BrandingContent
}) {
  const book = type === "sop" || type === "policy"
  const router = useRouter()
  const [content, setContent] = useState<BrandingContent>(() => {
    const base: BrandingContent = initial ?? {
      title: "",
      department: "",
      effectiveDate: "",
      languages: ["en"],
      inputs: Object.fromEntries(
        brandingFields[type].map((field) => [field, ""])
      ),
      translations: [],
      changeReason: "",
    }
    if (type === "notice")
      return {
        ...base,
        translations: base.languages.map((language) => {
          const existing = base.translations.find(
            (entry) => entry.language === language
          )
          const body = existing?.sections.length
            ? brandingNoticeBody(existing.sections)
            : brandingFields.notice
                .map((field) => base.inputs[field])
                .filter(Boolean)
                .join("\n\n")
          return {
            language,
            title: base.title,
            sections: existing?.sections.some((section) => section.richBody)
              ? existing.sections
              : [{ heading: "", body }],
          }
        }),
      }
    return {
      ...base,
      translations: base.languages.map((language) => {
        const existing = base.translations.find(
          (entry) => entry.language === language
        )
        const sourceSections = book
          ? brandingFields[type]
              .filter((field) => base.inputs[field]?.trim())
              .map((field) => ({ heading: field, body: base.inputs[field]! }))
          : []
        return {
          ...existing,
          language,
          title: existing?.title ?? base.title,
          sections: existing?.sections.length
            ? existing.sections
            : sourceSections.length
              ? sourceSections
              : [{ heading: "", body: "" }],
        }
      }),
    }
  })
  const visualGuide = content.translations.some((entry) =>
    entry.sections.some((section) => section.layout === "visual-guide")
  )
  const [error, setError] = useState("")
  const [picturePending, setPicturePending] = useState(false)
  const [pending, startTransition] = useTransition()
  function languageChange(language: BrandingLanguage, checked: boolean) {
    setContent((current) => ({
      ...current,
      languages: checked
        ? [...current.languages, language]
        : current.languages.filter((value) => value !== language),
      translations:
        checked &&
        type !== "notice" &&
        !current.translations.some((entry) => entry.language === language)
          ? [
              ...current.translations,
              {
                language,
                title: current.title,
                sections:
                  current.translations[0]?.sections[0]?.layout ===
                  "visual-guide"
                    ? visualGuidePair()
                    : [{ heading: "", body: "" }],
              },
            ]
          : current.translations.filter(
              (entry) => checked || entry.language !== language
            ),
    }))
  }
  function prepareLanguage(language: BrandingLanguage) {
    setContent((current) => ({
      ...current,
      translations: [
        ...current.translations,
        {
          language,
          title: current.title,
          sections: brandingFields[type]
            .filter((field) => current.inputs[field]?.trim())
            .map((field) => ({ heading: field, body: current.inputs[field]! })),
        },
      ],
    }))
  }
  return (
    <form
      className="grid w-full max-w-5xl min-w-0 gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        setError("")
        startTransition(async () => {
          try {
            const result = await saveBrandingDraft({
              type,
              documentId,
              version,
              content:
                type === "work-instruction" || type === "notice"
                  ? {
                      ...content,
                      translations: content.translations.map((translation) => ({
                        ...translation,
                        title: content.title,
                      })),
                    }
                  : content,
            })
            if (result.error) {
              setError(result.error)
              return
            }
            router.push(`/branding/${type}/${result.id}`)
            router.refresh()
          } catch {
            setError(
              "The draft could not be saved. Your text is still here; please try again."
            )
          }
        })
      }}
    >
      <fieldset
        disabled={pending || picturePending}
        className="grid min-w-0 gap-5"
      >
        <ActionToolbar>
          <Button disabled={pending} type="submit">
            <Save aria-hidden="true" />
            {pending ? "Saving…" : "Save Draft"}
          </Button>
        </ActionToolbar>
        {error ? (
          <StandardState
            variant="error"
            title="Draft not saved"
            description={error}
          />
        ) : null}
        <FormSection
          title={
            type === "sop" || type === "policy"
              ? "Cover details"
              : "Document details"
          }
        >
          <FormGrid>
            <div className="grid gap-2">
              <Label htmlFor="branding-title">Title</Label>
              <Input
                id="branding-title"
                required
                maxLength={240}
                value={content.title}
                onChange={(event) =>
                  setContent({ ...content, title: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="branding-department">Department</Label>
              <Input
                id="branding-department"
                required
                maxLength={160}
                value={content.department}
                onChange={(event) =>
                  setContent({ ...content, department: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="branding-date">Effective date</Label>
              <Input
                id="branding-date"
                type="date"
                value={content.effectiveDate}
                onChange={(event) =>
                  setContent({ ...content, effectiveDate: event.target.value })
                }
              />
            </div>
            {type !== "notice" ? (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">
                  Document languages
                </legend>
                <div className="flex flex-wrap gap-4">
                  {brandingLanguages.map((language) => (
                    <Label key={language} className="flex items-center gap-2">
                      <Checkbox
                        checked={content.languages.includes(language)}
                        onCheckedChange={(checked) =>
                          languageChange(language, checked === true)
                        }
                      />
                      {brandingLanguageLabels[language]}
                    </Label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </FormGrid>
        </FormSection>
        {type === "notice" ? (
          <BrandingNoticeEditor content={content} onChange={setContent} />
        ) : (
          <FormSection
            title="Document content"
            description={
              type === "work-instruction"
                ? visualGuide
                  ? "Visual Guide is locked to Bad Picture + Bad Text and Good Picture + Good Text for each language."
                  : "Choose a format for each section, then add its heading, body and picture where required."
                : book
                  ? "Review each selected language before saving and issuing."
                  : "Review each selected language before saving and issuing."
            }
          >
            {book ? (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  Each language has a cover, details page, automatic index and
                  flowing content. Add headings and subheadings below; choose
                  bullets or numbering within each body.
                </p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Writing assistance and automatic translation are pending
                  setup. For now, enter or paste the final text in each selected
                  language.
                </p>
              </>
            ) : null}
            <div className="grid gap-6">
              {content.languages.map((language) => {
                const translation = content.translations.find(
                  (entry) => entry.language === language
                )
                function updateTranslation(
                  update: Partial<NonNullable<typeof translation>>
                ) {
                  setContent((current) => ({
                    ...current,
                    translations: current.translations.map((entry) =>
                      entry.language === language
                        ? { ...entry, ...update }
                        : entry
                    ),
                  }))
                }
                return (
                  <section key={language} className="grid gap-4">
                    <h3 className="font-medium">
                      {brandingLanguageLabels[language]}
                    </h3>
                    {translation ? (
                      <>
                        {type !== "work-instruction" ? (
                          <div className="grid gap-2">
                            <Label htmlFor={`title-${language}`}>
                              Title · {brandingLanguageLabels[language]}
                            </Label>
                            <Input
                              id={`title-${language}`}
                              lang={language}
                              value={translation.title}
                              onChange={(event) =>
                                updateTranslation({ title: event.target.value })
                              }
                              maxLength={240}
                            />
                          </div>
                        ) : null}
                        {book ? (
                          <BrandingBookEditor
                            translation={translation}
                            onChange={updateTranslation}
                            disabled={pending}
                          />
                        ) : (
                          <>
                            {translation.sections.map((section, index) => (
                              <div className="grid gap-2" key={index}>
                                {!visualGuide ? (
                                  <div className="flex gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={index === 0}
                                      aria-label={`Move section ${index + 1} up`}
                                      onClick={() => {
                                        const sections = [
                                          ...translation.sections,
                                        ]
                                        ;[
                                          sections[index - 1],
                                          sections[index],
                                        ] = [
                                          sections[index]!,
                                          sections[index - 1]!,
                                        ]
                                        updateTranslation({ sections })
                                      }}
                                    >
                                      Move Up
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={
                                        index ===
                                        translation.sections.length - 1
                                      }
                                      aria-label={`Move section ${index + 1} down`}
                                      onClick={() => {
                                        const sections = [
                                          ...translation.sections,
                                        ]
                                        ;[
                                          sections[index],
                                          sections[index + 1],
                                        ] = [
                                          sections[index + 1]!,
                                          sections[index]!,
                                        ]
                                        updateTranslation({ sections })
                                      }}
                                    >
                                      Move Down
                                    </Button>
                                  </div>
                                ) : null}
                                {type === "work-instruction" ? (
                                  <>
                                    {!visualGuide ? (
                                      <>
                                        <Label
                                          htmlFor={`format-${language}-${index}`}
                                        >
                                          Format {index + 1}
                                        </Label>
                                        <NativeSelect
                                          id={`format-${language}-${index}`}
                                          value={section.layout ?? "text"}
                                          onChange={(event) => {
                                            if (
                                              event.target.value ===
                                              "visual-guide"
                                            ) {
                                              if (
                                                content.translations.some(
                                                  (entry) =>
                                                    entry.sections.length > 2
                                                )
                                              ) {
                                                setError(
                                                  "Visual Guide has two fixed entries. Keep at most two sections per language before selecting it."
                                                )
                                                return
                                              }
                                              setError("")
                                              setContent((current) => ({
                                                ...current,
                                                translations:
                                                  current.translations.map(
                                                    (entry) => ({
                                                      ...entry,
                                                      sections: visualGuidePair(
                                                        entry.sections
                                                      ),
                                                    })
                                                  ),
                                              }))
                                              return
                                            }
                                            updateTranslation({
                                              sections:
                                                translation.sections.map(
                                                  (entry, at) =>
                                                    at === index
                                                      ? {
                                                          ...entry,
                                                          layout: event.target
                                                            .value as WorkInstructionLayout,
                                                          ...(event.target
                                                            .value === "text"
                                                            ? {
                                                                picture:
                                                                  undefined,
                                                              }
                                                            : {}),
                                                        }
                                                      : entry
                                                ),
                                            })
                                          }}
                                        >
                                          <NativeSelectOption value="text">
                                            Heading + body
                                          </NativeSelectOption>
                                          <NativeSelectOption value="text-on-picture">
                                            Text on picture
                                          </NativeSelectOption>
                                          <NativeSelectOption value="picture-left">
                                            Picture left + body right
                                          </NativeSelectOption>
                                          <NativeSelectOption value="visual-guide">
                                            Visual guide · Good / Bad
                                          </NativeSelectOption>
                                        </NativeSelect>
                                      </>
                                    ) : (
                                      <p className="text-sm font-medium">
                                        Visual Guide -{" "}
                                        {section.assessment === "bad"
                                          ? "Bad - fixed red cross"
                                          : "Good - fixed green tick"}
                                      </p>
                                    )}
                                    {section.layout &&
                                    section.layout !== "text" ? (
                                      <>
                                        {section.layout !== "visual-guide" ? (
                                          <p className="text-sm text-muted-foreground">
                                            Step{" "}
                                            {brandingStepNumber(
                                              language,
                                              index + 1
                                            )}{" "}
                                            · Numbered automatically. Heading is
                                            optional.
                                          </p>
                                        ) : null}
                                        <Label
                                          htmlFor={`picture-${language}-${index}`}
                                        >
                                          {visualGuide
                                            ? `${section.assessment === "bad" ? "Bad" : "Good"} Picture`
                                            : `Picture ${index + 1}`}
                                        </Label>
                                        <Input
                                          id={`picture-${language}-${index}`}
                                          type="file"
                                          accept="image/jpeg,image/png,image/webp"
                                          onChange={async (event) => {
                                            const file = event.target.files?.[0]
                                            event.target.value = ""
                                            if (!file) return
                                            setPicturePending(true)
                                            setError("")
                                            try {
                                              const picture =
                                                await prepareBrandingPicture(
                                                  file
                                                )
                                              updateTranslation({
                                                sections:
                                                  translation.sections.map(
                                                    (entry, at) =>
                                                      at === index
                                                        ? { ...entry, picture }
                                                        : entry
                                                  ),
                                              })
                                            } catch (error) {
                                              setError(
                                                error instanceof Error
                                                  ? error.message
                                                  : "The picture could not be loaded."
                                              )
                                            } finally {
                                              setPicturePending(false)
                                            }
                                          }}
                                        />
                                        {section.picture ? (
                                          <>
                                            {/* eslint-disable-next-line @next/next/no-img-element -- Bounded private data URL; no image optimizer request. */}
                                            <img
                                              src={section.picture}
                                              alt={`Picture for section ${index + 1}`}
                                              className="max-h-48 max-w-full rounded-md border object-contain"
                                            />
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              className="w-fit"
                                              onClick={() =>
                                                updateTranslation({
                                                  sections:
                                                    translation.sections.map(
                                                      (entry, at) =>
                                                        at === index
                                                          ? {
                                                              ...entry,
                                                              picture:
                                                                undefined,
                                                            }
                                                          : entry
                                                    ),
                                                })
                                              }
                                            >
                                              Remove Picture
                                            </Button>
                                          </>
                                        ) : null}
                                      </>
                                    ) : null}
                                  </>
                                ) : null}
                                {!visualGuide ? (
                                  <>
                                    <Label
                                      htmlFor={`heading-${language}-${index}`}
                                    >
                                      {type === "work-instruction"
                                        ? `Heading ${index + 1}${section.layout && section.layout !== "text" ? " (optional)" : ""}`
                                        : `Section ${index + 1} heading`}
                                    </Label>
                                    <Input
                                      id={`heading-${language}-${index}`}
                                      lang={language}
                                      maxLength={200}
                                      value={section.heading}
                                      onChange={(event) =>
                                        updateTranslation({
                                          sections: translation.sections.map(
                                            (entry, at) =>
                                              at === index
                                                ? {
                                                    ...entry,
                                                    heading: event.target.value,
                                                  }
                                                : entry
                                          ),
                                        })
                                      }
                                    />
                                  </>
                                ) : null}
                                <Label htmlFor={`body-${language}-${index}`}>
                                  {visualGuide
                                    ? `${section.assessment === "bad" ? "Bad" : "Good"} Text`
                                    : type === "work-instruction"
                                      ? `Body ${index + 1}`
                                      : `Section ${index + 1} text`}
                                </Label>
                                <Textarea
                                  id={`body-${language}-${index}`}
                                  lang={language}
                                  rows={5}
                                  maxLength={12000}
                                  value={section.body}
                                  onChange={(event) =>
                                    updateTranslation({
                                      sections: translation.sections.map(
                                        (entry, at) =>
                                          at === index
                                            ? {
                                                ...entry,
                                                body: event.target.value,
                                              }
                                            : entry
                                      ),
                                    })
                                  }
                                />
                                {!visualGuide ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-fit"
                                    disabled={
                                      type === "work-instruction" &&
                                      translation.sections.length === 1
                                    }
                                    aria-label={`Remove ${brandingLanguageLabels[language]} section ${index + 1}`}
                                    onClick={() =>
                                      updateTranslation({
                                        sections: translation.sections.filter(
                                          (_, at) => at !== index
                                        ),
                                      })
                                    }
                                  >
                                    {type === "work-instruction"
                                      ? "Remove Section"
                                      : "Remove Section"}
                                  </Button>
                                ) : null}
                              </div>
                            ))}
                            {!visualGuide ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="w-fit"
                                disabled={translation.sections.length >= 20}
                                onClick={() =>
                                  updateTranslation({
                                    sections: [
                                      ...translation.sections,
                                      {
                                        heading: "",
                                        body: "",
                                      },
                                    ],
                                  })
                                }
                              >
                                {type === "work-instruction"
                                  ? "Add Section"
                                  : "Add Section"}
                              </Button>
                            ) : null}
                          </>
                        )}
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-fit"
                        onClick={() => prepareLanguage(language)}
                      >
                        Copy Source to {brandingLanguageLabels[language]} Editor
                      </Button>
                    )}
                  </section>
                )
              })}
            </div>
          </FormSection>
        )}
        {documentId && type !== "notice" ? (
          <FormSection title="Revision notes">
            <div className="grid gap-2">
              <Label htmlFor="change-reason">Reason for change</Label>
              <Textarea
                id="change-reason"
                value={content.changeReason}
                maxLength={2000}
                onChange={(event) =>
                  setContent({ ...content, changeReason: event.target.value })
                }
              />
            </div>
          </FormSection>
        ) : null}
      </fieldset>
    </form>
  )
}
