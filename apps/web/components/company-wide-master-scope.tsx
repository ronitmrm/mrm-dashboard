import { Field, FieldLabel } from "@workspace/ui/components/field"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"

export function CompanyWideMasterScope() {
  return (
    <Field>
      <FieldLabel htmlFor="company-wide-production-unit">
        Production Unit
      </FieldLabel>
      <NativeSelect
        className="w-full bg-muted"
        disabled
        id="company-wide-production-unit"
        value="company-wide"
      >
        <NativeSelectOption value="company-wide">
          Full Software / Not Applicable
        </NativeSelectOption>
      </NativeSelect>
      <p className="text-xs text-muted-foreground">
        This master applies to the full software and is not tied to one
        Production Unit.
      </p>
    </Field>
  )
}
