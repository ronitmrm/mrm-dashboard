import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextJsConfig,
  {
    files: ["**/*.tsx"],
    ignores: ["components/ui/golden-patterns.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              importNames: ["Table"],
              message:
                "Use OperationalTable; it is the only approved feature table boundary.",
              name: "@workspace/ui/components/table",
            },
            {
              importNames: ["Card"],
              message:
                "Use SectionCard; raw Card is reserved for shared pattern implementations.",
              name: "@workspace/ui/components/card",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          message:
            "Raw HTML tables are prohibited. Compose the shared OperationalTable system.",
          selector: "JSXOpeningElement[name.name='table']",
        },
        {
          message: "The legacy Table root is prohibited. Use OperationalTable.",
          selector: "JSXOpeningElement[name.name='Table']",
        },
        {
          message:
            "Feature modules must use SectionCard instead of the raw Card primitive.",
          selector: "JSXOpeningElement[name.name='Card']",
        },
        {
          message:
            "The legacy DashboardPageHeader is prohibited. Use PageHeader.",
          selector: "JSXOpeningElement[name.name='DashboardPageHeader']",
        },
      ],
    },
  },
]
