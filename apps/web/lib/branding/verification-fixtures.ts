import type { BrandingPdfInput } from "./pdf"

// Valid 16:9 JPEG with distinct quadrants and a central mark. Crop/contain
// behavior is visible without adding a fixture-file dependency.
const jpeg =
  "data:image/jpeg;base64,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"

const base = {
  authorName: "PDF migration verification",
  draft: true,
  issuedAt: "2026-09-19",
  revision: 0,
} as const

const contentBase = {
  changeReason: "",
  department: "Quality",
  effectiveDate: "2026-09-19",
  inputs: {},
} as const

const paragraph = (text: string, bold = false) => ({
  type: "paragraph" as const,
  content: [
    {
      type: "text" as const,
      text,
      ...(bold ? { marks: [{ type: "bold" as const }] } : {}),
    },
  ],
})

const bookSections = Array.from({ length: 12 }, (_, index) => ({
  heading: `Control stage ${index + 1}`,
  body: "",
  includeInIndex: true,
  ...(index === 6 ? { pageBreakBefore: true } : {}),
  richBody: {
    type: "doc" as const,
    content: [
      paragraph(
        `Stage ${index + 1} establishes the approved sequence, inspection evidence, escalation owner, and retained record for the production team.`
      ),
      {
        type: "orderedList" as const,
        attrs: { start: index + 1 },
        content: [
          {
            type: "listItem" as const,
            content: [
              paragraph("Verify the work area and machine condition.", true),
              {
                type: "bulletList" as const,
                content: [
                  {
                    type: "listItem" as const,
                    content: [
                      paragraph("Record the result before proceeding."),
                    ],
                  },
                  {
                    type: "listItem" as const,
                    content: [
                      paragraph("Escalate any unsafe or unclear condition."),
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "listItem" as const,
            content: [paragraph("Sign the retained production record.")],
          },
        ],
      },
      paragraph(
        "The next stage begins only after the responsible person confirms that the evidence is complete and readable."
      ),
    ],
  },
  ...(index === 2
    ? {
        childNumbering: "hierarchical" as const,
        children: [
          {
            heading: "Nested verification",
            body: "Confirm nested numbering and index placement across wrapped content.",
            includeInIndex: true,
          },
        ],
      }
    : {}),
}))

export const brandingVerificationFixtures = [
  {
    ...base,
    name: "mixed-notice",
    type: "notice",
    number: "MRM-NTC-0152",
    content: {
      ...contentBase,
      title: "Multilingual safety notice",
      languages: ["en", "hi", "gu"],
      translations: [
        {
          language: "en",
          title: "Safety notice",
          sections: [
            {
              heading: "",
              body: "",
              richBody: {
                type: "doc",
                content: [
                  {
                    type: "heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "Safety notice" }],
                  },
                  paragraph(
                    "Check the guarded area before starting the machine. Keep this wrapped sentence selectable and complete at the approved body size."
                  ),
                  {
                    type: "bulletList",
                    content: [
                      {
                        type: "listItem",
                        content: [
                          paragraph(
                            "Wear required protective equipment.",
                            true
                          ),
                        ],
                      },
                      {
                        type: "listItem",
                        content: [paragraph("Report defects immediately.")],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
        {
          language: "hi",
          title: "सुरक्षा सूचना",
          sections: [
            {
              heading: "सुरक्षा निर्देश",
              body: "मशीन शुरू करने से पहले कार्यक्षेत्र की जाँच करें। श्रमिक सुरक्षा, प्रगति और दृष्टि स्पष्ट रखें।",
            },
          ],
        },
        {
          language: "gu",
          title: "સુરક્ષા સૂચના",
          sections: [
            {
              heading: "સુરક્ષા સૂચના",
              body: "મશીન શરૂ કરતાં પહેલાં કાર્યક્ષેત્ર તપાસો. શ્રમિક ક્ષમતા અને દૃષ્ટિ સ્પષ્ટ રાખો. પગલાં ૧૨૩૪૫૬૭૮૯૦ પૂર્ણ કરો.",
            },
          ],
        },
      ],
    },
  },
  {
    ...base,
    name: "wi-text",
    type: "work-instruction",
    number: "MRM-WI-0152",
    content: {
      ...contentBase,
      title: "Machine start and inspection",
      languages: ["en", "hi", "gu"],
      translations: [
        {
          language: "en",
          title: "Machine start",
          sections: [
            {
              heading: "Inspect",
              body: "Confirm guards, lubrication, material identity and measuring equipment before starting.",
              layout: "text",
            },
          ],
        },
        {
          language: "hi",
          title: "मशीन आरंभ",
          sections: [
            {
              heading: "जाँच करें",
              body: "प्रारंभ से पहले सुरक्षा कवच, स्नेहन और मापक उपकरण की जाँच करें।",
              layout: "text",
            },
          ],
        },
        {
          language: "gu",
          title: "મશીન શરૂ",
          sections: [
            {
              heading: "તપાસ કરો",
              body: "શરૂ કરતાં પહેલાં સુરક્ષા કવચ, લુબ્રિકેશન અને માપન સાધન તપાસો.",
              layout: "text",
            },
          ],
        },
      ],
    },
  },
  {
    ...base,
    name: "wi-grid",
    type: "work-instruction",
    number: "MRM-WI-0153",
    content: {
      ...contentBase,
      title: "Washing and drying",
      languages: ["en"],
      translations: [
        {
          language: "en",
          title: "Washing and drying",
          sections: Array.from({ length: 4 }, (_, index) => ({
            heading: `Stage ${index + 1}`,
            body: "Clean the component, inspect the surface and retain the correct orientation.",
            layout: "text-on-picture" as const,
            picture: jpeg,
          })),
        },
      ],
    },
  },
  {
    ...base,
    name: "wi-picture-left",
    type: "work-instruction",
    number: "MRM-WI-0154",
    content: {
      ...contentBase,
      title: "Weigh scale calibration",
      languages: ["en"],
      translations: [
        {
          language: "en",
          title: "Weigh scale calibration",
          sections: Array.from({ length: 4 }, (_, index) => ({
            heading: `Calibration ${index + 1}`,
            body: "Place the certified weight, wait for a stable reading and record the observed value.",
            layout: "picture-left" as const,
            picture: jpeg,
          })),
        },
      ],
    },
  },
  {
    ...base,
    name: "wi-visual-guide",
    type: "work-instruction",
    number: "MRM-WI-0155",
    content: {
      ...contentBase,
      title: "Visual inspection guide",
      languages: ["en"],
      translations: [
        {
          language: "en",
          title: "Visual inspection guide",
          sections: [
            {
              heading: "",
              body: "Reject: damaged, contaminated or incorrectly oriented component.",
              layout: "visual-guide",
              assessment: "bad",
              picture: jpeg,
            },
            {
              heading: "",
              body: "Accept: clean, complete and correctly oriented component.",
              layout: "visual-guide",
              assessment: "good",
              picture: jpeg,
            },
          ],
        },
      ],
    },
  },
  {
    ...base,
    name: "multipage-book",
    type: "sop",
    number: "MRM-SOP-0152",
    content: {
      ...contentBase,
      title: "Production control procedure",
      languages: ["en"],
      translations: [
        {
          language: "en",
          title: "Production control procedure",
          details: {
            introduction: {
              type: "doc",
              content: [
                paragraph(
                  "This procedure defines the controlled production sequence, evidence and escalation responsibilities."
                ),
              ],
            },
            preparedBy: "Quality and Production",
            attributions: [
              {
                role: "Issued by",
                name: "Verification owner",
                designation: "Engineering Lead",
              },
            ],
          },
          sections: bookSections,
        },
      ],
    },
  },
] satisfies (BrandingPdfInput & { name: string })[]

export type BrandingVerificationFixture =
  (typeof brandingVerificationFixtures)[number]
