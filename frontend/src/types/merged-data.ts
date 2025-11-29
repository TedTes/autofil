/**
 * Merged Data Types
 * 
 * Defines the structure of the canonical merged dataset
 * returned by the backend after extraction and normalization
 */

/**
 * Complete merged dataset structure
 */
export interface MergedData {
    insured: InsuredInfo
    locations: Location[]
    exposures: ExposureInfo
    lossHistory: LossHistoryInfo
    coverage: CoverageInfo
    metadata: MergedDataMetadata
  }
  
  /**
   * Insured business information
   */
  export interface InsuredInfo {
    businessName: string
    dba?: string
    entityType?: string
    federalId?: string
    stateId?: string
    website?: string
    yearEstablished?: number
    businessDescription?: string
    mailingAddress: Address
    primaryContact: Contact
  }
  
  /**
   * Physical location information
   */
  export interface Location {
    id: string
    locationNumber?: number
    address: Address
    buildingValue?: number
    contentValue?: number
    businessIncomeValue?: number
    occupancy?: string
    constructionType?: string
    protectionClass?: string
    yearBuilt?: number
    squareFootage?: number
    numberOfStories?: number
    sprinklered?: boolean
    buildingDetails?: BuildingDetails
  }
  
  /**
   * Address structure
   */
  export interface Address {
    street: string
    street2?: string
    city: string
    state: string
    zip: string
    county?: string
    country?: string
  }
  
  /**
   * Contact information
   */
  export interface Contact {
    name: string
    title?: string
    phone: string
    phoneExt?: string
    email: string
    fax?: string
  }
  
  /**
   * Building details
   */
  export interface BuildingDetails {
    roofType?: string
    roofYear?: number
    hvacYear?: number
    plumbingYear?: number
    electricalYear?: number
    foundationType?: string
    exteriorWalls?: string
  }
  
  /**
   * Exposure information (revenues, payroll, etc.)
   */
  export interface ExposureInfo {
    annualRevenue?: number
    annualPayroll?: number
    numberOfEmployees?: number
    fullTimeEmployees?: number
    partTimeEmployees?: number
    seasonalEmployees?: number
    revenueByClassCode?: RevenueByClass[]
    payrollByClassCode?: PayrollByClass[]
  }
  
  /**
   * Revenue breakdown by class code
   */
  export interface RevenueByClass {
    classCode: string
    classDescription: string
    revenue: number
    percentage?: number
  }
  
  /**
   * Payroll breakdown by class code
   */
  export interface PayrollByClass {
    classCode: string
    classDescription: string
    payroll: number
    numberOfEmployees?: number
  }
  
  /**
   * Loss history information
   */
  export interface LossHistoryInfo {
    yearsOfHistory: number
    losses: LossRecord[]
    summary: LossSummary
  }
  
  /**
   * Individual loss record
   */
  export interface LossRecord {
    id: string
    date: string
    lossType: string
    description: string
    claimStatus: 'Open' | 'Closed' | 'Subrogated'
    paidAmount?: number
    reserveAmount?: number
    totalIncurred?: number
    claimNumber?: string
    locationId?: string
  }
  
  /**
   * Loss history summary
   */
  export interface LossSummary {
    totalClaims: number
    totalPaid: number
    totalIncurred: number
    claimsByYear: Record<string, number>
    claimsByType: Record<string, number>
    averageClaimSize: number
  }
  
  /**
   * Coverage information
   */
  export interface CoverageInfo {
    currentCarrier?: string
    policyNumber?: string
    effectiveDate?: string
    expirationDate?: string
    limits: CoverageLimits
    deductibles: Deductibles
    additionalCoverages?: AdditionalCoverage[]
  }
  
  /**
   * Coverage limits
   */
  export interface CoverageLimits {
    generalLiability?: {
      aggregateLimit?: number
      perOccurrenceLimit?: number
      productsCompletedOps?: number
      personalAdvertisingInjury?: number
      medicalExpense?: number
    }
    property?: {
      building?: number
      businessPersonalProperty?: number
      businessIncome?: number
      extraExpense?: number
    }
    crime?: {
      employeeTheft?: number
      forgeryAlteration?: number
    }
    umbrella?: {
      limit?: number
    }
  }
  
  /**
   * Deductibles structure
   */
  export interface Deductibles {
    property?: number
    windHail?: number
    earthquake?: number
    flood?: number
    crime?: number
  }
  
  /**
   * Additional coverage item
   */
  export interface AdditionalCoverage {
    name: string
    limit?: number
    premium?: number
    included: boolean
  }
  
  /**
   * Metadata about the merged dataset
   */
  export interface MergedDataMetadata {
    mergedAt: string
    sourceFileCount: number
    sourceFiles: string[]
    confidence: number
    completeness: number
    warnings: string[]
    dataQuality: {
      insured: DataQualityScore
      locations: DataQualityScore
      exposures: DataQualityScore
      lossHistory: DataQualityScore
      coverage: DataQualityScore
    }
  }
  
  /**
   * Data quality score for a section
   */
  export interface DataQualityScore {
    score: number // 0-100
    fieldsPopulated: number
    fieldsTotal: number
    missingCriticalFields: string[]
  }
  
  /**
   * Props for merged data field editing
   */
  export interface MergedDataFieldProps {
    value: string | number | boolean | undefined
    label: string
    type?: 'text' | 'number' | 'date' | 'email' | 'phone' | 'currency'
    editable?: boolean
    confidence?: number
    onEdit?: (newValue: string | number | boolean) => void
  }