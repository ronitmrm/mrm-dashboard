import {
  commercialTermTypes,
  type CommercialTermType,
} from "@workspace/db"

import { currencyCodes } from "./currencies"

export type CommercialTermOptions = Record<CommercialTermType, string[]>

export function commercialTermOptions(
  terms: readonly {
    active: boolean
    name: string
    termType: CommercialTermType
  }[]
): CommercialTermOptions {
  return Object.fromEntries(
    commercialTermTypes.map((termType) => [
      termType,
      termType === "currency"
        ? [...currencyCodes]
        : terms
            .filter((term) => term.active && term.termType === termType)
            .map((term) => term.name),
    ])
  ) as CommercialTermOptions
}
