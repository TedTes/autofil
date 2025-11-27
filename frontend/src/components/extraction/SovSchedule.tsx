'use client'

import React from 'react'
import { Warehouse, MapPin, Table as TableIcon, AlertCircle } from 'lucide-react'
import type { SovScheduleData, SovProperty, SovTotals } from '@/types'

export function getSovScheduleData(value: unknown): SovScheduleData | null {
  if (!value || typeof value !== 'object') return null
  if (
    'document_type' in value &&
    (value as { document_type?: string }).document_type === 'sov'
  ) {
    return value as SovScheduleData
  }
  if ('data' in value && typeof (value as { data?: unknown }).data === 'object') {
    return getSovScheduleData((value as { data?: unknown }).data)
  }
  return null
}

export function isSovScheduleData(value: unknown): value is SovScheduleData {
  return getSovScheduleData(value) !== null
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const propertyColumns: Array<{ key: keyof SovProperty; label: string; type?: 'money' | 'number' }> = [
  { key: 'location_number', label: 'Location #' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'building_value', label: 'Building Value', type: 'money' },
  { key: 'contents_value', label: 'Contents Value', type: 'money' },
  { key: 'business_income', label: 'Business Income', type: 'money' },
  { key: 'total_value', label: 'Total Value', type: 'money' },
  { key: 'construction', label: 'Construction' },
  { key: 'occupancy', label: 'Occupancy' },
  { key: 'square_feet', label: 'Sq. Ft.', type: 'number' },
  { key: 'stories', label: 'Stories', type: 'number' },
  { key: 'year_built', label: 'Year Built', type: 'number' },
]

function formatValue(value: unknown, type?: 'money' | 'number') {
  if (value === null || value === undefined || value === '') return '—'
  if (type === 'money') {
    const num = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(num)) return currencyFormatter.format(num)
  }
  if (type === 'number') {
    const num = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(num)) return numberFormatter.format(num)
  }
  if (typeof value === 'string') return value
  return String(value)
}

function TotalsGrid({ totals, propertyCount }: { totals?: SovTotals; propertyCount?: number }) {
  const cards = [
    {
      label: 'Total Locations',
      value:
        totals?.total_locations ??
        propertyCount ??
        (totals && ('total_locations' in totals ? totals.total_locations : undefined)) ??
        '—',
    },
    { label: 'Total Building', value: totals?.total_building_value, type: 'money' },
    { label: 'Total Contents', value: totals?.total_contents_value, type: 'money' },
    { label: 'Business Income', value: totals?.total_business_income, type: 'money' },
    { label: 'Total Insured Value', value: totals?.total_insured_value, type: 'money' },
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">{card.label}</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {card.type === 'money'
              ? formatValue(card.value, 'money')
              : typeof card.value === 'number'
              ? numberFormatter.format(card.value)
              : card.value ?? '—'}
          </p>
        </div>
      ))}
    </div>
  )
}

interface SovScheduleProps {
  schedule: SovScheduleData
}

export function SovScheduleView({ schedule }: SovScheduleProps) {
  const properties = schedule.properties || []
  const hasProperties = properties.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
          <TableIcon className="w-4 h-4" />
          Schedule of Values
        </div>
        {schedule.extraction_date && (
          <p className="text-xs text-gray-500">
            Extracted on {new Date(schedule.extraction_date).toLocaleString()}
          </p>
        )}
      </div>

      <TotalsGrid totals={schedule.totals} propertyCount={schedule.property_count} />

      {!hasProperties ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 flex gap-3 items-start">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-yellow-800 mb-1">No properties found</h4>
            <p className="text-sm text-yellow-700">
              The extractor did not detect any property rows in this schedule.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Warehouse className="w-4 h-4 text-gray-500" />
              <h4 className="text-sm font-semibold text-gray-900">
                Properties ({properties.length})
              </h4>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <MapPin className="w-3 h-3" />
              Showing key location and value fields
            </div>
          </div>
          <div className="overflow-auto max-h-[480px]">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  {propertyColumns.map((col) => (
                    <th
                      key={col.key as string}
                      className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {properties.map((property, idx) => (
                  <tr
                    key={`${property.location_number || idx}-${idx}`}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    {propertyColumns.map((col) => (
                      <td key={col.key as string} className="px-4 py-2 text-gray-900 whitespace-nowrap">
                        {formatValue(property[col.key], col.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
