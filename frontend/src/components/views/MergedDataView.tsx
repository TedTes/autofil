'use client'

import React from 'react'
import {
  Building2,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Shield,
  Calendar,
  DollarSign,
  Users,
  FileText,
  Edit2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import type {
  MergedData,
  Location,
  LossSummary,
  LossRecord,
} from '@/types/merged-data'

interface MergedDataViewProps {
  mergedData: MergedData | null
  onEditField?: (fieldPath: string, value: string | number | boolean) => void
  isLoading?: boolean
}

/**
 * MergedDataView Component
 * 
 * Displays the canonical merged dataset in a clean, sectioned layout.
 * Shows data extracted and normalized from multiple uploaded documents.
 */
export default function MergedDataView({
  mergedData,
  onEditField,
  isLoading = false,
}: MergedDataViewProps) {
  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (!mergedData) {
    return <EmptyState />
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Merged Submission Data</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Extracted from {mergedData.metadata.sourceFileCount} document
              {mergedData.metadata.sourceFileCount !== 1 ? 's' : ''}
            </p>
          </div>
          <DataQualityBadge
            score={mergedData.metadata.completeness}
            confidence={mergedData.metadata.confidence}
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Insured Information Section */}
          <Section
            title="Insured Information"
            icon={Building2}
            qualityScore={mergedData.metadata.dataQuality.insured}
          >
            <FieldGrid>
              <Field
                label="Business Name"
                value={mergedData.insured.businessName}
                onEdit={onEditField ? (v) => onEditField('insured.businessName', v) : undefined}
              />
              <Field
                label="DBA"
                value={mergedData.insured.dba}
                onEdit={onEditField ? (v) => onEditField('insured.dba', v) : undefined}
              />
              <Field
                label="Entity Type"
                value={mergedData.insured.entityType}
                onEdit={onEditField ? (v) => onEditField('insured.entityType', v) : undefined}
              />
              <Field
                label="Year Established"
                value={mergedData.insured.yearEstablished}
                type="number"
                onEdit={onEditField ? (v) => onEditField('insured.yearEstablished', v) : undefined}
              />
              <Field
                label="Federal ID"
                value={mergedData.insured.federalId}
                onEdit={onEditField ? (v) => onEditField('insured.federalId', v) : undefined}
              />
              <Field
                label="Website"
                value={mergedData.insured.website}
                onEdit={onEditField ? (v) => onEditField('insured.website', v) : undefined}
              />
            </FieldGrid>

            <Subsection title="Mailing Address">
              <FieldGrid>
                <Field
                  label="Street"
                  value={mergedData.insured.mailingAddress.street}
                  onEdit={onEditField ? (v) => onEditField('insured.mailingAddress.street', v) : undefined}
                />
                <Field
                  label="City"
                  value={mergedData.insured.mailingAddress.city}
                  onEdit={onEditField ? (v) => onEditField('insured.mailingAddress.city', v) : undefined}
                />
                <Field
                  label="State"
                  value={mergedData.insured.mailingAddress.state}
                  onEdit={onEditField ? (v) => onEditField('insured.mailingAddress.state', v) : undefined}
                />
                <Field
                  label="ZIP"
                  value={mergedData.insured.mailingAddress.zip}
                  onEdit={onEditField ? (v) => onEditField('insured.mailingAddress.zip', v) : undefined}
                />
              </FieldGrid>
            </Subsection>

            <Subsection title="Primary Contact">
              <FieldGrid>
                <Field
                  label="Name"
                  value={mergedData.insured.primaryContact.name}
                  onEdit={onEditField ? (v) => onEditField('insured.primaryContact.name', v) : undefined}
                />
                <Field
                  label="Title"
                  value={mergedData.insured.primaryContact.title}
                  onEdit={onEditField ? (v) => onEditField('insured.primaryContact.title', v) : undefined}
                />
                <Field
                  label="Phone"
                  value={mergedData.insured.primaryContact.phone}
                  type="phone"
                  onEdit={onEditField ? (v) => onEditField('insured.primaryContact.phone', v) : undefined}
                />
                <Field
                  label="Email"
                  value={mergedData.insured.primaryContact.email}
                  type="email"
                  onEdit={onEditField ? (v) => onEditField('insured.primaryContact.email', v) : undefined}
                />
              </FieldGrid>
            </Subsection>
          </Section>

          {/* Locations Section */}
          <Section
            title="Locations"
            icon={MapPin}
            qualityScore={mergedData.metadata.dataQuality.locations}
          >
            {mergedData.locations.length === 0 ? (
              <EmptySection message="No locations found" />
            ) : (
              <div className="space-y-4">
                {mergedData.locations.map((location, index) => (
                  <LocationCard
                    key={location.id}
                    location={location}
                    index={index}
                    onEditField={onEditField}
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Exposures Section */}
          <Section
            title="Exposures"
            icon={TrendingUp}
            qualityScore={mergedData.metadata.dataQuality.exposures}
          >
            <FieldGrid>
              <Field
                label="Annual Revenue"
                value={mergedData.exposures.annualRevenue}
                type="currency"
                onEdit={onEditField ? (v) => onEditField('exposures.annualRevenue', v) : undefined}
              />
              <Field
                label="Annual Payroll"
                value={mergedData.exposures.annualPayroll}
                type="currency"
                onEdit={onEditField ? (v) => onEditField('exposures.annualPayroll', v) : undefined}
              />
              <Field
                label="Total Employees"
                value={mergedData.exposures.numberOfEmployees}
                type="number"
                onEdit={onEditField ? (v) => onEditField('exposures.numberOfEmployees', v) : undefined}
              />
              <Field
                label="Full-Time"
                value={mergedData.exposures.fullTimeEmployees}
                type="number"
                onEdit={onEditField ? (v) => onEditField('exposures.fullTimeEmployees', v) : undefined}
              />
            </FieldGrid>
          </Section>

          {/* Loss History Section */}
          <Section
            title="Loss History"
            icon={AlertTriangle}
            qualityScore={mergedData.metadata.dataQuality.lossHistory}
          >
            {mergedData.lossHistory.losses.length === 0 ? (
              <EmptySection message="No loss history found" />
            ) : (
              <>
                <LossSummaryCard summary={mergedData.lossHistory.summary} />
                <div className="mt-4 space-y-2">
                  {mergedData.lossHistory.losses.map((loss) => (
                    <LossRecordCard key={loss.id} loss={loss} />
                  ))}
                </div>
              </>
            )}
          </Section>

          {/* Coverage Section */}
          <Section
            title="Coverage"
            icon={Shield}
            qualityScore={mergedData.metadata.dataQuality.coverage}
          >
            <FieldGrid>
              <Field
                label="Current Carrier"
                value={mergedData.coverage.currentCarrier}
                onEdit={onEditField ? (v) => onEditField('coverage.currentCarrier', v) : undefined}
              />
              <Field
                label="Policy Number"
                value={mergedData.coverage.policyNumber}
                onEdit={onEditField ? (v) => onEditField('coverage.policyNumber', v) : undefined}
              />
              <Field
                label="Effective Date"
                value={mergedData.coverage.effectiveDate}
                type="date"
                onEdit={onEditField ? (v) => onEditField('coverage.effectiveDate', v) : undefined}
              />
              <Field
                label="Expiration Date"
                value={mergedData.coverage.expirationDate}
                type="date"
                onEdit={onEditField ? (v) => onEditField('coverage.expirationDate', v) : undefined}
              />
            </FieldGrid>

            {mergedData.coverage.limits.generalLiability && (
              <Subsection title="General Liability Limits">
                <FieldGrid>
                  <Field
                    label="Aggregate Limit"
                    value={mergedData.coverage.limits.generalLiability.aggregateLimit}
                    type="currency"
                  />
                  <Field
                    label="Per Occurrence"
                    value={mergedData.coverage.limits.generalLiability.perOccurrenceLimit}
                    type="currency"
                  />
                  <Field
                    label="Products/Completed Ops"
                    value={mergedData.coverage.limits.generalLiability.productsCompletedOps}
                    type="currency"
                  />
                  <Field
                    label="Personal & Advertising Injury"
                    value={mergedData.coverage.limits.generalLiability.personalAdvertisingInjury}
                    type="currency"
                  />
                </FieldGrid>
              </Subsection>
            )}
          </Section>
        </div>
      </div>

      {/* Warnings Footer (if any) */}
      {mergedData.metadata.warnings.length > 0 && (
        <div className="flex-shrink-0 bg-amber-50 border-t border-amber-200 px-6 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-amber-900">Data Quality Warnings</p>
              <ul className="mt-1 text-xs text-amber-700 space-y-0.5">
                {mergedData.metadata.warnings.slice(0, 3).map((warning, i) => (
                  <li key={i}>• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function Section({
  title,
  icon: Icon,
  qualityScore,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  qualityScore?: { score: number; fieldsPopulated: number; fieldsTotal: number }
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        {qualityScore && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>
              {qualityScore.fieldsPopulated}/{qualityScore.fieldsTotal} fields
            </span>
            <div
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                qualityScore.score >= 80
                  ? 'bg-green-100 text-green-700'
                  : qualityScore.score >= 60
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {qualityScore.score}%
            </div>
          </div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <h4 className="text-xs font-semibold text-gray-700 mb-3">{title}</h4>
      {children}
    </div>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
}

function Field({
  label,
  value,
  type = 'text',
  onEdit,
}: {
  label: string
  value: string | number | boolean | undefined
  type?: 'text' | 'number' | 'currency' | 'date' | 'email' | 'phone'
  onEdit?: (value: string | number | boolean) => void
}) {
  const formattedValue = formatFieldValue(value, type)
  const isEmpty = value === undefined || value === null || value === ''

  return (
    <div className="group">
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <div
          className={`px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm ${
            isEmpty ? 'text-gray-400 italic' : 'text-gray-900'
          }`}
        >
          {isEmpty ? 'Not provided' : formattedValue}
        </div>
        {onEdit && !isEmpty && (
          <button
            onClick={() => {
              // Edit stub - will be implemented later
              console.log('Edit field:', label)
            }}
            className="absolute right-2 top-2 p-1 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit field"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function LocationCard({
  location,
  index,
  onEditField,
}: {
  location: Location
  index: number
  onEditField?: (path: string, value: string | number | boolean) => void
}) {
  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-900">
          Location {location.locationNumber || index + 1}
        </h4>
        {location.sprinklered && (
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
            Sprinklered
          </span>
        )}
      </div>
      <FieldGrid>
        <Field label="Street" value={location.address.street} />
        <Field label="City" value={location.address.city} />
        <Field label="State" value={location.address.state} />
        <Field label="ZIP" value={location.address.zip} />
        <Field label="Building Value" value={location.buildingValue} type="currency" />
        <Field label="Contents Value" value={location.contentValue} type="currency" />
        <Field label="Occupancy" value={location.occupancy} />
        <Field label="Construction Type" value={location.constructionType} />
        <Field label="Year Built" value={location.yearBuilt} type="number" />
        <Field label="Square Footage" value={location.squareFootage} type="number" />
      </FieldGrid>
    </div>
  )
}

function LossSummaryCard({ summary }: { summary: LossSummary }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-amber-700 font-medium">Total Claims</p>
          <p className="text-xl font-bold text-amber-900 mt-1">{summary.totalClaims}</p>
        </div>
        <div>
          <p className="text-xs text-amber-700 font-medium">Total Paid</p>
          <p className="text-xl font-bold text-amber-900 mt-1">
            {formatCurrency(summary.totalPaid)}
          </p>
        </div>
        <div>
          <p className="text-xs text-amber-700 font-medium">Total Incurred</p>
          <p className="text-xl font-bold text-amber-900 mt-1">
            {formatCurrency(summary.totalIncurred)}
          </p>
        </div>
        <div>
          <p className="text-xs text-amber-700 font-medium">Avg Claim Size</p>
          <p className="text-xl font-bold text-amber-900 mt-1">
            {formatCurrency(summary.averageClaimSize)}
          </p>
        </div>
      </div>
    </div>
  )
}

function LossRecordCard({ loss }: { loss: LossRecord }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-900">{loss.lossType}</span>
            <span
              className={`px-1.5 py-0.5 text-xs rounded-full ${
                loss.claimStatus === 'Closed'
                  ? 'bg-gray-100 text-gray-700'
                  : loss.claimStatus === 'Open'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {loss.claimStatus}
            </span>
          </div>
          <p className="text-xs text-gray-600 mb-2">{loss.description}</p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{new Date(loss.date).toLocaleDateString()}</span>
            {loss.claimNumber && <span>Claim #{loss.claimNumber}</span>}
          </div>
        </div>
        <div className="text-right ml-4 flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">
            {formatCurrency(loss.totalIncurred || loss.paidAmount || 0)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Incurred</p>
        </div>
      </div>
    </div>
  )
}

function DataQualityBadge({ score, confidence }: { score: number; confidence: number }) {
  const avgScore = (score + confidence) / 2
  return (
    <div className="flex items-center gap-2">
      {avgScore >= 80 ? (
        <CheckCircle2 className="w-5 h-5 text-green-600" />
      ) : (
        <AlertCircle className="w-5 h-5 text-amber-600" />
      )}
      <div className="text-right">
        <p className="text-xs font-medium text-gray-900">{Math.round(avgScore)}% Complete</p>
        <p className="text-xs text-gray-500">{Math.round(confidence)}% Confidence</p>
      </div>
    </div>
  )
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="text-center py-8">
      <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="h-full flex flex-col bg-gray-50 animate-pulse">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/4" />
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="h-5 bg-gray-200 rounded w-1/4 mb-4" />
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-sm font-medium text-gray-900 mb-1">No merged data available</h3>
        <p className="text-xs text-gray-500">
          Upload and extract files to see merged submission data
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatFieldValue(
  value: string | number | boolean | undefined,
  type: string
): string {
  if (value === undefined || value === null) return ''

  switch (type) {
    case 'currency':
      return formatCurrency(Number(value))
    case 'date':
      return new Date(value as string).toLocaleDateString()
    case 'phone':
      return formatPhone(String(value))
    case 'number':
      return Number(value).toLocaleString()
    default:
      return String(value)
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPhone(value: string): string {
  const cleaned = value.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  return value
}
