import type { ModelOption } from '~/components/model-combobox'

export function sortModelChoices(choices: ModelOption[], catalogOnly: ModelOption[]): ModelOption[] {
  const supportedCompanies = new Set(choices.map((entry) => entry.company))
  return [...choices, ...catalogOnly].sort(
    (left, right) =>
      Number(supportedCompanies.has(right.company)) - Number(supportedCompanies.has(left.company)) ||
      Number(Boolean(right.definition?.supportsLora)) - Number(Boolean(left.definition?.supportsLora)) ||
      left.company.localeCompare(right.company) ||
      Number(right.supported) - Number(left.supported) ||
      Number(left.disabled) - Number(right.disabled) ||
      left.label.localeCompare(right.label),
  )
}
