'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  KeyRound,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  User,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  createIntegrationConnection,
  getIntegrationConnections,
  getIntegrationProviders,
} from '@/lib/api-client'
import type { CreateIntegrationConnectionRequest, IntegrationConnection, IntegrationProvider } from '@/types'

type ReviewThreshold = 'strict' | 'balanced' | 'relaxed'

type SettingsState = {
  workspaceName: string
  reviewThreshold: ReviewThreshold
  notifyOnExtraction: boolean
  notifyOnLowConfidence: boolean
  autoOpenReview: boolean
}

const STORAGE_KEY = 'autofil.settings'

const DEFAULT_SETTINGS: SettingsState = {
  workspaceName: 'My Workspace',
  reviewThreshold: 'balanced',
  notifyOnExtraction: true,
  notifyOnLowConfidence: true,
  autoOpenReview: true,
}

const REVIEW_OPTIONS: Array<{
  id: ReviewThreshold
  label: string
  description: string
}> = [
  {
    id: 'strict',
    label: 'Strict',
    description: 'Flag more fields for manual review. Best for demos and early validation.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Use normal confidence thresholds for everyday submission review.',
  },
  {
    id: 'relaxed',
    label: 'Relaxed',
    description: 'Reduce review prompts when speed matters more than maximum caution.',
  },
]

export function SettingsView() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  const userEmail = user?.email || 'Not signed in'

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<SettingsState>
      setSettings({ ...DEFAULT_SETTINGS, ...parsed })
    } catch {
      setSettings(DEFAULT_SETTINGS)
    }
  }, [])

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  const saveSettings = () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  const clearLocalSettings = () => {
    window.localStorage.removeItem(STORAGE_KEY)
    setSettings(DEFAULT_SETTINGS)
    setSaved(false)
  }

  return (
    <div className="mx-auto max-w-6xl py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-950">Settings</h1>
              <p className="text-sm text-gray-500">
                Manage workspace preferences, review behavior, and integration details.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={saveSettings}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Saved' : 'Save Settings'}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader
            icon={Building2}
            title="Workspace"
            description="Basic workspace details used across dashboard screens."
          />
          <div className="space-y-5 p-6">
            <label className="block">
              <span className="text-sm font-semibold text-gray-800">Workspace name</span>
              <input
                value={settings.workspaceName}
                onChange={(event) => updateSetting('workspaceName', event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                placeholder="Example: Smith Brokerage"
              />
            </label>
            <div className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
              <InfoRow icon={User} label="Signed in as" value={userEmail} />
              <InfoRow icon={ShieldCheck} label="Role" value="Workspace admin" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
          <SectionHeader
            icon={Bell}
            title="Review Preferences"
            description="Tune how aggressively extracted fields should be flagged for review."
          />
          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <p className="mb-3 text-sm font-semibold text-gray-800">Confidence review mode</p>
              <div className="grid gap-3 md:grid-cols-3">
                {REVIEW_OPTIONS.map((option) => {
                  const selected = settings.reviewThreshold === option.id
                  return (
                    <button
                      key={option.id}
                      onClick={() => updateSetting('reviewThreshold', option.id)}
                      className={`rounded-xl border p-4 text-left transition ${
                        selected
                          ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-100'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-gray-950">{option.label}</span>
                        {selected && <Check className="h-4 w-4 text-blue-600" />}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-600">{option.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3">
              <ToggleRow
                title="Notify when extraction completes"
                description="Show a dashboard alert when a submission is ready to review."
                checked={settings.notifyOnExtraction}
                onChange={(checked) => updateSetting('notifyOnExtraction', checked)}
              />
              <ToggleRow
                title="Notify on low-confidence fields"
                description="Flag output forms that use uncertain source values."
                checked={settings.notifyOnLowConfidence}
                onChange={(checked) => updateSetting('notifyOnLowConfidence', checked)}
              />
              <ToggleRow
                title="Open review after upload"
                description="Route completed uploads directly into the extraction review flow."
                checked={settings.autoOpenReview}
                onChange={(checked) => updateSetting('autoOpenReview', checked)}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader
            icon={KeyRound}
            title="Integrations"
            description="Connection points for automation and downstream systems."
          />
          <IntegrationSettingsPanel />
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <SectionHeader
            icon={Database}
            title="Local Data"
            description="Browser-only preferences used on this device."
          />
          <div className="space-y-4 p-6">
            <p className="text-sm leading-6 text-gray-600">
              These settings are currently saved locally in this browser. Submission data, account data, and generated documents remain managed by the backend.
            </p>
            <button
              onClick={clearLocalSettings}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              Reset local settings
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="border-b border-gray-100 px-6 py-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-gray-950">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-gray-400" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="truncate text-sm font-semibold text-gray-800">{value}</p>
      </div>
    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 p-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function IntegrationSettingsPanel() {
  const [providers, setProviders] = useState<IntegrationProvider[]>([])
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('webhook')
  const [connectionName, setConnectionName] = useState('')
  const [scopeKey, setScopeKey] = useState('workspace')
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)

  const loadIntegrations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [providerRows, connectionRows] = await Promise.all([
        getIntegrationProviders(),
        getIntegrationConnections(),
      ])
      setProviders(providerRows)
      setConnections(connectionRows)
      if (!providerRows.some((provider) => provider.provider === selectedProviderId)) {
        setSelectedProviderId(providerRows[0]?.provider || 'webhook')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }, [selectedProviderId])

  useEffect(() => {
    loadIntegrations()
  }, [loadIntegrations])

  const connectedCount = connections.filter((connection) => connection.enabled).length
  const amsProviderCount = providers.filter((provider) => provider.category === 'ams').length
  const availableProviderCount = providers.filter((provider) => provider.status === 'available').length
  const selectedProvider = providers.find((provider) => provider.provider === selectedProviderId)
  const authFields = selectedProvider?.authConfig.fields || []

  const updateCredential = (name: string, value: string) => {
    setCredentialValues((current) => ({ ...current, [name]: value }))
    setFormMessage(null)
  }

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find((item) => item.provider === providerId)
    setSelectedProviderId(providerId)
    setConnectionName(provider?.displayName ? `${provider.displayName} connection` : '')
    setCredentialValues({})
    setFormMessage(null)
  }

  const handleCreateConnection = async () => {
    if (!selectedProvider) return
    setSaving(true)
    setFormMessage(null)
    setError(null)
    try {
      const missingField = authFields.find(
        (field) => field.required && !String(credentialValues[field.name] || '').trim()
      )
      if (missingField) {
        throw new Error(`${missingField.label} is required`)
      }
      const authConfig = authFields.reduce<Record<string, string>>((values, field) => {
        const value = String(credentialValues[field.name] || '').trim()
        if (value) values[field.name] = value
        return values
      }, {})
      const payload: CreateIntegrationConnectionRequest = {
        client_id: scopeKey.trim() || 'workspace',
        name: connectionName.trim() || `${selectedProvider.displayName} connection`,
        type: selectedProvider.category === 'generic' ? 'webhook' : 'ams',
        provider: selectedProvider.provider,
        auth_type: selectedProvider.authType,
        auth_config: authConfig,
        capabilities: selectedProvider.capabilities,
        connection_status: selectedProvider.provider === 'webhook' ? 'configured' : 'not_configured',
      }
      if (authConfig.url) payload.url = authConfig.url
      if (authConfig.secretRef) payload.secret_ref = authConfig.secretRef

      await createIntegrationConnection(payload)
      setCredentialValues({})
      setFormMessage('Connection saved. Test it before sending production submissions.')
      await loadIntegrations()
    } catch (err) {
      setFormMessage(err instanceof Error ? err.message : 'Failed to save connection')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricPill icon={PlugZap} label="Connections" value={String(connectedCount)} />
        <MetricPill icon={Database} label="AMS providers" value={String(amsProviderCount)} />
        <MetricPill icon={CheckCircle2} label="Available now" value={String(availableProviderCount)} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-800">Provider registry</p>
        <button
          type="button"
          onClick={loadIntegrations}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => {
            const providerConnections = connections.filter(
              (connection) => connection.provider === provider.provider && connection.enabled
            )
            return (
              <ProviderRow
                key={provider.provider}
                provider={provider}
                connectionCount={providerConnections.length}
              />
            )
          })}
        </div>
      )}

      {selectedProvider && (
        <div className="border-t border-gray-100 pt-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">Add connection</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Fields are generated from the selected provider configuration.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <label className="block">
              <span className="text-xs font-bold uppercase text-gray-500">Provider</span>
              <select
                value={selectedProviderId}
                onChange={(event) => handleProviderChange(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {providers.map((provider) => (
                  <option key={provider.provider} value={provider.provider}>
                    {provider.displayName}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase text-gray-500">Connection name</span>
                <input
                  value={connectionName}
                  onChange={(event) => setConnectionName(event.target.value)}
                  placeholder={`${selectedProvider.displayName} connection`}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase text-gray-500">Scope key</span>
                <input
                  value={scopeKey}
                  onChange={(event) => setScopeKey(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
            </div>

            {authFields.map((field) => (
              <label key={field.name} className="block">
                <span className="text-xs font-bold uppercase text-gray-500">
                  {field.label}
                  {field.required ? ' *' : ''}
                </span>
                <input
                  type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
                  value={credentialValues[field.name] || ''}
                  onChange={(event) => updateCredential(field.name, event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                {field.helpText && <span className="mt-1 block text-xs text-gray-500">{field.helpText}</span>}
              </label>
            ))}

            {formMessage && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm font-semibold text-gray-700">
                {formMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleCreateConnection}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Save Connection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
      <Icon className="h-4 w-4 text-gray-500" />
      <div>
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <p className="text-sm font-black text-gray-950">{value}</p>
      </div>
    </div>
  )
}

function ProviderRow({
  provider,
  connectionCount,
}: {
  provider: IntegrationProvider
  connectionCount: number
}) {
  const statusMeta = provider.status === 'available'
    ? {
        icon: CheckCircle2,
        label: 'Available',
        className: 'bg-green-50 text-green-700 ring-green-100',
      }
    : provider.status === 'planned'
      ? {
          icon: Clock3,
          label: 'Planned',
          className: 'bg-amber-50 text-amber-700 ring-amber-100',
        }
      : {
          icon: AlertCircle,
          label: 'Disabled',
          className: 'bg-gray-50 text-gray-600 ring-gray-100',
        }
  const StatusIcon = statusMeta.icon

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-gray-900">{provider.displayName}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold uppercase text-gray-500">
            {provider.category}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{provider.description}</p>
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusMeta.className}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {statusMeta.label}
        </span>
        <span className="text-xs font-semibold text-gray-500">
          {connectionCount === 1 ? '1 connection' : `${connectionCount} connections`}
        </span>
      </div>
    </div>
  )
}
