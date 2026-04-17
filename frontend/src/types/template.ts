/**
 * Template types and interfaces for output generation
 * 
 */

/**
 * Form types supported by the system
 */
export type FormType = 
  | 'ACORD_126'
  | 'ACORD_125'
  | 'ACORD_130'
  | 'ACORD_140'
  | 'SOV'
  | string  // Allow for future form types without code changes

/**
 * Data sections available in merged data
 */
export type DataSection = 
  | 'insured'
  | 'policy'
  | 'locations'
  | 'property'
  | 'workers_compensation'
  | 'classifications'
  | 'exposures'
  | 'operations'
  | 'lossHistory'
  | 'coverage'
  | string

/**
 * Template generation status
 */
export type TemplateStatus = 
  | 'available'
  | 'insufficient'
  | 'generating'
  | 'completed'
  | 'failed'

/**
 * Output template definition (from backend)
 */
export interface OutputTemplate {
  /** Unique template identifier */
  id: string
  
  /** Display name */
  name: string
  
  /** Short description */
  description: string
  
  /** Form type identifier */
  formType: FormType
  
  /** Data sections required to generate */
  requiredDataSections: DataSection[]
  
  /** Optional data sections */
  optionalDataSections?: DataSection[]
  
  /** Estimated number of fields */
  estimatedFields: number
  
  /** Template version */
  version?: string
  
  /** Filler identifier used by backend */
  filler?: string
  
  /** Icon name for UI */
  icon?: string
  
  /** Popularity flag */
  isPopular?: boolean
  
  /** File size estimate in KB */
  estimatedSize?: number
  
  /** Template PDF URL (for preview) */
  templateUrl?: string
  
  /** Expected documents for this template */
  expectedDocuments?: string[]
  
  /** Creation/update timestamps */
  createdAt?: string
  updatedAt?: string
}

/**
 * Template availability status
 */
export interface TemplateAvailability {
  template: OutputTemplate
  canGenerate: boolean
  status: TemplateStatus
  completeness: number
  fieldsToFill: number
  missingRequiredSections: DataSection[]
  availableOptionalSections: DataSection[]
  warnings: string[]
}

/**
 * Template selection state
 */
export interface TemplateSelection {
  templateId: string
  selected: boolean
  availability: TemplateAvailability
}

/**
 * Output generation request
 */
export interface GenerateOutputsRequest {
  packageId: string
  templateIds: string[]
  customMergedData?: Record<string, unknown>
}

/**
 * Single template generation result
 */
export interface TemplateGenerationResult {
  templateId: string
  templateName: string
  success: boolean
  fileUrl?: string
  filename?: string
  fieldsFilled: number
  totalFields: number
  coverage: number
  warnings: string[]
  error?: string
  generatedAt: string
}

/**
 * Output generation response
 */
export interface GenerateOutputsResponse {
  success: boolean
  results: TemplateGenerationResult[]
  totalRequested: number
  totalGenerated: number
  totalFailed: number
  timestamp: string
}

/**
 * Template library response from backend
 */
export interface TemplateLibraryResponse {
  templates: OutputTemplate[]
  total: number
  timestamp: string
}
