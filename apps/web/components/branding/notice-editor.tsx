"use client"

import dynamic from "next/dynamic"

import {
  brandingLanguages,
  brandingLanguageLabels,
  brandingNoticeRichText,
  brandingRichTextPlain,
  type BrandingContent,
  type BrandingLanguage,
} from "@workspace/db/branding-domain"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { FormSection } from "@/components/ui/golden-patterns"
const RichTextEditor = dynamic(() => import("./rich-text-editor"), {
  ssr: false,
})

export function BrandingNoticeEditor({
  content,
  onChange,
}: {
  content: BrandingContent
  onChange: (content: BrandingContent) => void
}) {
  const available = brandingLanguages.filter(
    (language) => !content.languages.includes(language)
  )
  return (
    <FormSection
      title="Notice body"
      description="Choose any one language or add more. English, Hindi and Gujarati are optional; only the bodies you add appear on the one-page PDF. Review the PDF for readability."
    >
      <div className="grid gap-5">
        {content.translations.map((translation) => (
          <div className="grid gap-2" key={translation.language}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor={`notice-language-${translation.language}`}>
                  Language
                </Label>
                <NativeSelect
                  id={`notice-language-${translation.language}`}
                  value={translation.language}
                  onChange={(event) => {
                    const language = event.target.value as BrandingLanguage
                    onChange({
                      ...content,
                      languages: content.languages.map((value) =>
                        value === translation.language ? language : value
                      ),
                      translations: content.translations.map((entry) =>
                        entry === translation ? { ...entry, language } : entry
                      ),
                    })
                  }}
                >
                  {brandingLanguages
                    .filter(
                      (language) =>
                        language === translation.language ||
                        available.includes(language)
                    )
                    .map((language) => (
                      <NativeSelectOption key={language} value={language}>
                        {brandingLanguageLabels[language]}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </div>
              {content.translations.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove ${brandingLanguageLabels[translation.language]} body`}
                  onClick={() =>
                    onChange({
                      ...content,
                      languages: content.languages.filter(
                        (language) => language !== translation.language
                      ),
                      translations: content.translations.filter(
                        (entry) => entry !== translation
                      ),
                    })
                  }
                >
                  Remove body
                </Button>
              ) : null}
            </div>
            <Label htmlFor={`notice-body-${translation.language}`}>
              Body · {brandingLanguageLabels[translation.language]}
            </Label>
            <RichTextEditor
              id={`notice-body-${translation.language}`}
              label={`Body · ${brandingLanguageLabels[translation.language]}`}
              language={translation.language}
              tables
              headings
              value={brandingNoticeRichText(translation.sections)}
              onChange={(richBody) =>
                onChange({
                  ...content,
                  translations: content.translations.map((entry) =>
                    entry === translation
                      ? {
                          ...entry,
                          sections: [
                            {
                              heading: "",
                              body: brandingRichTextPlain(richBody),
                              richBody,
                            },
                          ],
                        }
                      : entry
                  ),
                })
              }
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={!available.length}
          onClick={() => {
            const language = available[0]
            if (!language) return
            onChange({
              ...content,
              languages: [...content.languages, language],
              translations: [
                ...content.translations,
                {
                  language,
                  title: content.title,
                  sections: [{ heading: "", body: "" }],
                },
              ],
            })
          }}
        >
          Add body
        </Button>
      </div>
    </FormSection>
  )
}
