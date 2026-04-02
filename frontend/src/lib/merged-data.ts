import type { DataSection, MergedData, SemanticSection } from '@/types'

const SECTION_KEY_ALIASES: Record<DataSection, string[]> = {
  insured: ['insured'],
  locations: ['locations'],
  exposures: ['operations', 'exposures'],
  lossHistory: ['loss_history', 'lossHistory'],
  coverage: ['coverage'],
}

function findSection(
  mergedData: MergedData | null,
  section: DataSection
): SemanticSection | undefined {
  if (!mergedData?.semantic_sections?.length) {
    return undefined
  }
  const aliases = SECTION_KEY_ALIASES[section] || [section]
  return mergedData.semantic_sections.find((entry) => aliases.includes(entry.key))
}

function sectionHasValues(section?: SemanticSection): boolean {
  if (!section) return false
  return section.fields?.some((field) =>
    field.values?.some((value) => value.value !== null && value.value !== undefined && value.value !== '')
  )
}

function hasAnyMergedData(mergedData: MergedData | null): boolean {
  return Boolean(
    mergedData?.semantic_sections?.some((section) => sectionHasValues(section))
  )
}

export function calculateSectionCompleteness(
  section: DataSection,
  mergedData: MergedData | null
): number {
  const target = findSection(mergedData, section)
  return sectionHasValues(target) ? 100 : 0
}

export function hasSectionData(
  section: DataSection,
  mergedData: MergedData | null
): boolean {
  const target = findSection(mergedData, section)
  return sectionHasValues(target)
}

export function getMissingSections(
  requiredSections: DataSection[],
  mergedData: MergedData | null
): DataSection[] {
  return requiredSections.filter((section) => !hasSectionData(section, mergedData))
}

export function calculateTemplateReadiness(
  requiredSections: DataSection[],
  optionalSections: DataSection[] = [],
  mergedData: MergedData | null
): {
  canGenerate: boolean
  completeness: number
  missingRequired: DataSection[]
  availableOptional: DataSection[]
} {
  const missingRequired = getMissingSections(requiredSections, mergedData)
  const availableOptional = optionalSections.filter((section) =>
    hasSectionData(section, mergedData)
  )

  const totalSections = requiredSections.length + optionalSections.length
  const availableSections =
    (requiredSections.length - missingRequired.length) + availableOptional.length
  const completeness =
    totalSections > 0
      ? Math.round((availableSections / totalSections) * 100)
      : hasAnyMergedData(mergedData)
        ? 100
        : 0

  return {
    canGenerate: missingRequired.length === 0,
    completeness,
    missingRequired,
    availableOptional,
  }
}
