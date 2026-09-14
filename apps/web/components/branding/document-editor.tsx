"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Save } from "lucide-react"
import {
  brandingFields,
  brandingLanguages,
  brandingLanguageLabels,
  type BrandingContent,
  type BrandingLanguage,
  type BrandingType,
} from "@workspace/db/branding-domain"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { StandardState } from "@workspace/ui/components/standard-state"
import {
  ActionToolbar,
  FormGrid,
  FormSection,
} from "@/components/ui/golden-patterns"
import { saveBrandingDraft } from "@/app/branding/actions"

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
  const router = useRouter()
  const [content, setContent] = useState<BrandingContent>(
    initial ?? {
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
  )
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  function languageChange(language: BrandingLanguage, checked: boolean) {
    setContent((current) => ({
      ...current,
      languages: checked
        ? [...current.languages, language]
        : current.languages.filter((value) => value !== language),
      translations: current.translations.filter(
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
      className="grid min-w-0 gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        setError("")
        startTransition(async () => {
          try {
            const result = await saveBrandingDraft({
              type,
              documentId,
              version,
              content,
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
      <fieldset disabled={pending} className="grid min-w-0 gap-5">
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
        <FormSection title="Document details">
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
          </FormGrid>
        </FormSection>
        <FormSection
          title="Source text"
          description="Enter your facts in normal text. Use Not applicable where a section does not apply."
        >
          <div className="grid gap-4">
            {brandingFields[type].map((field) => (
              <div className="grid gap-2" key={field}>
                <Label htmlFor={`source-${field}`}>{field}</Label>
                <Textarea
                  id={`source-${field}`}
                  rows={3}
                  maxLength={12000}
                  value={content.inputs[field] ?? ""}
                  onChange={(event) =>
                    setContent({
                      ...content,
                      inputs: {
                        ...content.inputs,
                        [field]: event.target.value,
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </FormSection>
        <FormSection
          title="Document content"
          description="Review each selected language before saving and issuing. Copy Source copies your text without translating it."
        >
          <p className="mb-4 text-sm text-muted-foreground">
            Writing assistance and automatic translation are pending setup. For
            now, enter or paste the final text in each selected language.
          </p>
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
                      {translation.sections.map((section, index) => (
                        <div className="grid gap-2" key={index}>
                          <Label htmlFor={`heading-${language}-${index}`}>
                            Section {index + 1} heading
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
                          <Label htmlFor={`body-${language}-${index}`}>
                            Section {index + 1} text
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
                                      ? { ...entry, body: event.target.value }
                                      : entry
                                ),
                              })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            className="w-fit"
                            aria-label={`Remove ${brandingLanguageLabels[language]} section ${index + 1}`}
                            onClick={() =>
                              updateTranslation({
                                sections: translation.sections.filter(
                                  (_, at) => at !== index
                                ),
                              })
                            }
                          >
                            Remove Section
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        className="w-fit"
                        disabled={translation.sections.length >= 20}
                        onClick={() =>
                          updateTranslation({
                            sections: [
                              ...translation.sections,
                              { heading: "", body: "" },
                            ],
                          })
                        }
                      >
                        Add Section
                      </Button>
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
