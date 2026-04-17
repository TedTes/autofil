import type { DataSection, MergedData, SemanticSection } from '@/types'

const SECTION_KEY_ALIASES: Record<string, string[]> = {
  insured: ['insured', 'insured_information', 'applicant', 'named_insured'],
  policy: ['policy', 'policy_information'],
  locations: ['locations', 'location', 'property', 'property_section', 'commercial_property'],
  property: ['property', 'property_section', 'commercial_property', 'locations', 'location'],
  workers_compensation: ['workers_compensation', 'workers_comp', 'wc', 'payroll', 'classifications'],
  classifications: ['classifications', 'classification', 'workers_compensation', 'workers_comp'],
  exposures: ['operations', 'exposures', 'classifications', 'workers_compensation'],
  operations: ['operations', 'exposures'],
  lossHistory: ['loss_history', 'lossHistory', 'losses', 'prior_losses'],
  loss_history: ['loss_history', 'lossHistory', 'losses', 'prior_losses'],
  coverage: ['coverage', 'coverages', 'policy', 'property', 'property_section', 'commercial_property'],
}

function normalizeSectionKey(key: string): string {
  return key.replace(/[\s-]+/g, '_')
}

function findSection(
  mergedData: MergedData | null,
  section: DataSection
): SemanticSection | undefined {
  if (!mergedData?.semantic_sections?.length) {
    return undefined
  }
  const normalizedSection = normalizeSectionKey(String(section))
  const aliases = new Set(
    (SECTION_KEY_ALIASES[normalizedSection] || [normalizedSection]).map(normalizeSectionKey)
  )
  return mergedData.semantic_sections.find((entry) =>
    aliases.has(normalizeSectionKey(entry.key))
  )
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
