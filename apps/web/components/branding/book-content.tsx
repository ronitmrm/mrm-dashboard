import {
  brandingOutline,
  brandingRichTextHtml,
  plainBrandingRichText,
  type BrandingTranslation,
} from "@workspace/db/branding-domain"
import "./structured-text.css"

export function BrandingBookContent({
  translation,
}: {
  translation: BrandingTranslation
}) {
  return (
    <div className="grid gap-4">
      {translation.details ? (
        <section>
          <h3 className="mb-2 font-semibold">About this document</h3>
          <div
            className="branding-prose"
            dangerouslySetInnerHTML={{
              __html: brandingRichTextHtml(translation.details.introduction),
            }}
          />
          {translation.details.preparedBy ? (
            <p className="text-sm">
              Prepared by: {translation.details.preparedBy}
            </p>
          ) : null}
          {translation.details.attributions
            .filter((entry) => entry.name || entry.designation)
            .map((entry) => (
              <p key={entry.role} className="text-sm">
                {entry.role}: {entry.name}
                {entry.designation ? ` · ${entry.designation}` : ""}
              </p>
            ))}
        </section>
      ) : null}
      {brandingOutline(translation.sections).map(
        ({ section, label, depth, path }) => (
          <section
            key={path.join(".")}
            style={{ marginLeft: `${depth * 0.75}rem` }}
          >
            <h3 className="mb-2 font-semibold">{label}</h3>
            <div
              className="branding-prose text-sm"
              dangerouslySetInnerHTML={{
                __html: brandingRichTextHtml(
                  section.richBody ?? plainBrandingRichText(section.body)
                ),
              }}
            />
          </section>
        )
      )}
    </div>
  )
}
