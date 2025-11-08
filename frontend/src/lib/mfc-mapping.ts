/**
 * MFC Field Mapping Configuration
 * Maps backend MFC field IDs to frontend nested paths
 * 
 * Used by: entity-transformer.ts to determine where each field should be placed
 * Example: "InsuredName" → "applicant.company_name"
 */

export interface FieldMapping {
    /** Frontend nested path (e.g., "applicant.company_name") */
    path: string
    
    /** Whether this field can have multiple values */
    cardinality: 'one' | 'many'
    
    /** Expected data type */
    type: 'string' | 'number' | 'date' | 'money' | 'object' | 'array'
    
    /** Optional custom transformer function name */
    transformer?: string
  }
  
  /**
   * Master mapping table: MFC Field ID → Frontend Path
   * 
   * IMPORTANT: Field IDs must match exactly with backend mfc.yaml
   * Add new fields here when backend mfc.yaml is updated
   */
  export const MFC_FIELD_MAPPINGS: Record<string, FieldMapping> = {
    
    // ============================================================================
    // INSURED / APPLICANT (F001-F003)
    // ============================================================================
    
    InsuredName: {
      path: 'applicant.company_name',
      cardinality: 'many',  // Has multiple values: company, DBA, contact, date
      type: 'string',
      transformer: 'transformInsuredName'  // Special handling needed
    },
    
    DBA: {
      path: 'applicant.dba',
      cardinality: 'one',
      type: 'string'
    },
    
    FEIN: {
      path: 'applicant.fein',
      cardinality: 'one',
      type: 'string'
    },
    
    // ============================================================================
    // ADDRESS & LOCATIONS (F010-F011)
    // ============================================================================
    
    MailingAddress: {
      path: 'applicant.mailing_address',
      cardinality: 'many',  // [street, city, state, zip, country]
      type: 'object',
      transformer: 'transformMailingAddress'  // Convert array → object
    },
    
    Location: {
      path: 'locations',
      cardinality: 'many',
      type: 'object'
    },
    
    // ============================================================================
    // POLICY BASICS (F020-F023)
    // ============================================================================
    
    PolicyNumber: {
      path: 'policy.policy_number',
      cardinality: 'one',
      type: 'string'
    },
    
    EffectiveDate: {
      path: 'policy.effective_date',
      cardinality: 'one',
      type: 'date',
      transformer: 'transformEffectiveDate'  // First value only
    },
    
    ExpirationDate: {
      path: 'policy.expiration_date',
      cardinality: 'one',
      type: 'date'
    },
    
    LineOfBusiness: {
      path: 'policy.line_of_business',
      cardinality: 'one',
      type: 'string',
      transformer: 'transformLineOfBusiness'  // First value only
    },
    
    // ============================================================================
    // GENERAL LIABILITY - ACORD 126 (F100-F102)
    // ============================================================================
    
    Classification: {
      path: 'classifications',
      cardinality: 'many',
      type: 'object',
      transformer: 'transformClassification'  // Filter empty objects
    },
    
    GrossSales: {
      path: 'applicant.gross_sales',
      cardinality: 'many',  // Can have current + projected
      type: 'money',
      transformer: 'transformGrossSales'  // Convert to object if 2+ values
    },
    
    Payroll: {
      path: 'applicant.payroll',
      cardinality: 'one',
      type: 'money'
    },
    
    // ============================================================================
    // PROPERTY - ACORD 125 (F110-F112)
    // ============================================================================
    
    BuildingLimit: {
      path: 'policy.building_limit',
      cardinality: 'one',
      type: 'money'
    },
    
    BPPLimit: {
      path: 'policy.bpp_limit',
      cardinality: 'one',
      type: 'money'
    },
    
    Deductible: {
      path: 'policy.deductibles',
      cardinality: 'many',  // Can have multiple deductible types
      type: 'money',
      transformer: 'transformDeductible'  // Convert to structured object
    },
    
    // ============================================================================
    // LOSS HISTORY (F200)
    // ============================================================================
    
    PriorLosses: {
      path: 'loss_history.prior_losses',
      cardinality: 'many',
      type: 'object'
    },
    
    // ============================================================================
    // SUPPLEMENTAL (F300-F302)
    // ============================================================================
    
    YearsInBusiness: {
      path: 'supplemental.years_in_business',
      cardinality: 'one',
      type: 'number'
    },
    
    RoofAge: {
      path: 'supplemental.roof_age',
      cardinality: 'one',
      type: 'number'
    },
    
    NumberOfEmployees: {
      path: 'supplemental.number_of_employees',
      cardinality: 'one',
      type: 'number'
    },
    
    // ============================================================================
    // FINANCIAL / SOV (F400)
    // ============================================================================
    
    TotalInsuredValue: {
      path: 'policy.total_insured_value',
      cardinality: 'one',
      type: 'money'
    },
    
    // ============================================================================
    // METADATA / AUDIT (F500-F502)
    // ============================================================================
    
    ProducerName: {
      path: 'applicant.producer',
      cardinality: 'many',  // [name, location code, hazard code, license, FEIN]
      type: 'string',
      transformer: 'transformProducerName'  // Convert to object
    },
    
    SubmissionDate: {
      path: 'metadata.submission_date',
      cardinality: 'one',
      type: 'date'
    },
    
    Carrier: {
      path: 'metadata.carrier',
      cardinality: 'one',
      type: 'string'
    },
    
    // ============================================================================
    // ADDITIONAL INTERESTS (F600)
    // ============================================================================
    
    AdditionalInsured: {
      path: 'additional_interests',
      cardinality: 'many',
      type: 'object'
    }
  }
  
  /**
   * Get mapping for a specific field ID
   * Returns undefined if field not found (unmapped fields go to 'other')
   * 
   * Used by: entity-transformer.ts
   */
  export function getFieldMapping(fieldId: string): FieldMapping | undefined {
    return MFC_FIELD_MAPPINGS[fieldId]
  }
  
  /**
   * Check if a field has a custom transformer
   * 
   * Used by: entity-transformer.ts to determine if special handling needed
   */
  export function hasCustomTransformer(fieldId: string): boolean {
    const mapping = getFieldMapping(fieldId)
    return mapping !== undefined && mapping.transformer !== undefined
  }
  
  /**
   * Get all field IDs that map to a specific category
   * Example: getFieldsByCategory('applicant') → ['InsuredName', 'DBA', 'FEIN', ...]
   * 
   * Used by: Could be used for grouping/filtering in UI
   */
  export function getFieldsByCategory(category: string): string[] {
    return Object.entries(MFC_FIELD_MAPPINGS)
      .filter(([_, mapping]) => mapping.path.startsWith(category))
      .map(([fieldId, _]) => fieldId)
  }
  
  /**
   * Get all mappings (for debugging/logging)
   * 
   * Used by: Development/debugging tools
   */
  export function getAllMappings(): Record<string, FieldMapping> {
    return MFC_FIELD_MAPPINGS
  }
  
  /**
   * Validate that a field mapping exists
   * Useful for catching missing mappings during development
   * 
   * Used by: entity-transformer.ts for validation
   */
  export function isMappedField(fieldId: string): boolean {
    return fieldId in MFC_FIELD_MAPPINGS
  }