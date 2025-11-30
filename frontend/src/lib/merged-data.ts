// Add at the end of the file

import type { DataSection,MergedData } from '../types'

/**
 * Calculate completeness score for a data section
 */
export function calculateSectionCompleteness(
  section: DataSection,
  mergedData: MergedData | null
): number {
  if (!mergedData) return 0
  
  const validSections = ['insured', 'locations', 'exposures', 'lossHistory', 'coverage'] as const
  if (!validSections.includes(section)) return 0
  
  const qualityScore = mergedData.metadata.dataQuality[section as keyof typeof mergedData.metadata.dataQuality]
  return qualityScore?.score || 0
}

/**
 * Check if a data section exists and has content
 */
export function hasSectionData(
  section: DataSection,
  mergedData: MergedData | null
): boolean {
  if (!mergedData) return false
  
  switch (section) {
    case 'insured':
      return !!mergedData.insured?.businessName
    case 'locations':
      return (mergedData.locations?.length || 0) > 0
    case 'exposures':
      return !!mergedData.exposures?.annualRevenue
    case 'lossHistory':
      return (mergedData.lossHistory?.losses?.length || 0) > 0
    case 'coverage':
      return !!mergedData.coverage?.currentCarrier
    default:
      return false
  }
}

/**
 * Get missing data sections
 */
export function getMissingSections(
  requiredSections: DataSection[],
  mergedData: MergedData | null
): DataSection[] {
  return requiredSections.filter(section => !hasSectionData(section, mergedData))
}

/**
 * Calculate overall template readiness
 */
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
  const availableOptional = optionalSections.filter(section => 
    hasSectionData(section, mergedData)
  )
  
  const totalSections = requiredSections.length + optionalSections.length
  const availableSections = (requiredSections.length - missingRequired.length) + availableOptional.length
  const completeness = totalSections > 0 ? Math.round((availableSections / totalSections) * 100) : 0
  
  return {
    canGenerate: missingRequired.length === 0,
    completeness,
    missingRequired,
    availableOptional,
  }
}