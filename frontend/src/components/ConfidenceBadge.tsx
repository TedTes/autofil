'use client'

import { CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react'

interface ConfidenceBadgeProps {
  confidence: number
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  showLabel?: boolean
  showPercentage?: boolean
  variant?: 'default' | 'minimal' | 'pill' | 'bar'
  className?: string
}

export function ConfidenceBadge({
  confidence,
  size = 'md',
  showIcon = true,
  showLabel = false,
  showPercentage = true,
  variant = 'default',
  className = '',
}: ConfidenceBadgeProps) {
  const level = getConfidenceLevel(confidence)
  const colors = getConfidenceColors(level)
  const Icon = getConfidenceIcon(level)

  // Size classes
  const sizeClasses = {
    sm: {
      badge: 'px-2 py-0.5 text-xs',
      icon: 'w-3 h-3',
      text: 'text-xs',
    },
    md: {
      badge: 'px-2.5 py-1 text-sm',
      icon: 'w-4 h-4',
      text: 'text-sm',
    },
    lg: {
      badge: 'px-3 py-1.5 text-base',
      icon: 'w-5 h-5',
      text: 'text-base',
    },
  }

  const sizes = sizeClasses[size]

  // Render variants
  switch (variant) {
    case 'minimal':
      return (
        <span
          className={`inline-flex items-center gap-1 ${colors.text} ${sizes.text} font-medium ${className}`}
        >
          {showIcon && <Icon className={sizes.icon} />}
          {showPercentage && `${confidence}%`}
        </span>
      )

    case 'pill':
      return (
        <span
          className={`inline-flex items-center gap-1.5 ${sizes.badge} ${colors.bg} ${colors.text} font-semibold rounded-full ${className}`}
        >
          {showIcon && <Icon className={sizes.icon} />}
          {showLabel && <span>{level}</span>}
          {showPercentage && <span>{confidence}%</span>}
        </span>
      )

    case 'bar':
      return (
        <div className={`space-y-1 ${className}`}>
          {showPercentage && (
            <div className="flex items-center justify-between">
              <span className={`${sizes.text} font-medium ${colors.text}`}>
                {showLabel ? level : 'Confidence'}
              </span>
              <span className={`${sizes.text} font-semibold ${colors.text}`}>
                {confidence}%
              </span>
            </div>
          )}
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 ${colors.barBg} transition-all duration-300`}
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>
      )

    case 'default':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 ${sizes.badge} ${colors.bg} ${colors.border} ${colors.text} font-semibold rounded-lg border ${className}`}
          title={`${level} confidence: ${confidence}%`}
        >
          {showIcon && <Icon className={sizes.icon} />}
          {showLabel && <span>{level}</span>}
          {showPercentage && <span>{confidence}%</span>}
        </span>
      )
  }
}

// Confidence level helpers
type ConfidenceLevel = 'excellent' | 'good' | 'fair' | 'low' | 'poor'

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 95) return 'excellent'
  if (confidence >= 85) return 'good'
  if (confidence >= 70) return 'fair'
  if (confidence >= 50) return 'low'
  return 'poor'
}

function getConfidenceColors(level: ConfidenceLevel) {
  const colorMap = {
    excellent: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
      barBg: 'bg-green-500',
    },
    good: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      barBg: 'bg-blue-500',
    },
    fair: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-200',
      barBg: 'bg-yellow-500',
    },
    low: {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
      barBg: 'bg-orange-500',
    },
    poor: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      barBg: 'bg-red-500',
    },
  }
  return colorMap[level]
}

function getConfidenceIcon(level: ConfidenceLevel) {
  const iconMap = {
    excellent: CheckCircle2,
    good: CheckCircle2,
    fair: Info,
    low: AlertTriangle,
    poor: AlertCircle,
  }
  return iconMap[level]
}

// Pre-configured variants for common use cases
export function ConfidenceBadgeCompact({ confidence }: { confidence: number }) {
  return (
    <ConfidenceBadge
      confidence={confidence}
      size="sm"
      variant="pill"
      showIcon={false}
      showLabel={false}
    />
  )
}

export function ConfidenceBadgeWithLabel({ confidence }: { confidence: number }) {
  return (
    <ConfidenceBadge
      confidence={confidence}
      size="md"
      variant="default"
      showIcon={true}
      showLabel={true}
      showPercentage={true}
    />
  )
}

export function ConfidenceBar({ confidence, label }: { confidence: number; label?: string }) {
  return (
    <div className="w-full">
      {label && <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>}
      <ConfidenceBadge
        confidence={confidence}
        variant="bar"
        showLabel={false}
        showPercentage={true}
      />
    </div>
  )
}