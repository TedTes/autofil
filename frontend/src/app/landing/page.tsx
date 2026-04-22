'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Zap, Download, CheckCircle, ArrowRight, Loader2 } from 'lucide-react'
import AnimatedDemo from '@/components/landing/AnimatedDemo'
import FieldLocatorDemo from '@/components/landing/FieldLocatorDemo'
import LandingUploadPanel from '@/components/landing/LandingUploadPanel'
import AuthPromptModal from '@/components/auth/AuthPromptModal'
import { useAuth } from '@/contexts/AuthContext'
import { useLandingUpload } from '@/contexts/LandingUploadContext'
import { createClient, getClients, previewExtractLandingFile } from '@/lib/api-client'

const LANDING_DEFAULT_CLIENT_NAME = 'My Workspace'

export default function LandingPage() {
  const router = useRouter()
  const { user, isLoading: isAuthLoading } = useAuth()
  const {
    files,
    addFiles,
    removeFile,
    clearFiles,
    hasFiles,
    previewFileIndex,
    previewResult,
    setPreviewResult,
    isPreviewLoading,
    setIsPreviewLoading,
    previewError,
    setPreviewError,
  } = useLandingUpload()
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false)
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null)
  const [pendingCtaLabel, setPendingCtaLabel] = useState<string | null>(null)
  const [queuedAuthCtaLabel, setQueuedAuthCtaLabel] = useState<string | null>(null)
  const [previewProgress, setPreviewProgress] = useState(0)
  const [previewStageLabel, setPreviewStageLabel] = useState<string>('Preparing preview')
  const inFlightPreviewKeyRef = useRef<string | null>(null)
  const settledPreviewKeyRef = useRef<string | null>(null)

  const getOrCreateLandingClient = useCallback(async () => {
    const clients = await getClients()
    const exactMatch = clients.find(
      (client) => client.name.trim().toLowerCase() === LANDING_DEFAULT_CLIENT_NAME.toLowerCase()
    )

    if (exactMatch) {
      return exactMatch
    }

    if (clients.length === 0) {
      return createClient(LANDING_DEFAULT_CLIENT_NAME)
    }

    return clients[0]
  }, [])

  const previewFile = useMemo(() => {
    if (previewFileIndex === null) return null
    return files[previewFileIndex] ?? null
  }, [files, previewFileIndex])

  const previewKey = useMemo(() => {
    if (!previewFile) return null
    return `${previewFile.name}:${previewFile.size}:${previewFile.lastModified}`
  }, [previewFile])

  const continueGetStarted = useCallback(async (actionLabel = 'start your workspace') => {
    if (user) {
      if (!hasFiles) {
        router.push('/dashboard')
        return
      }

      const landingClient = await getOrCreateLandingClient()
      const params = new URLSearchParams()
      params.set('name', landingClient.name)
      params.set('landing', '1')
      router.push(`/dashboard/clients/${landingClient.client_id}?${params.toString()}`)
      return
    }

    setPendingActionLabel(actionLabel)
    setIsAuthPromptOpen(true)
  }, [getOrCreateLandingClient, hasFiles, router, user])

  const handleGetStarted = useCallback((actionLabel = 'start your workspace') => {
    if (pendingCtaLabel) return

    setPendingActionLabel(actionLabel)

    if (isAuthLoading) {
      setPendingCtaLabel(actionLabel)
      setQueuedAuthCtaLabel(actionLabel)
      return
    }

    setPendingCtaLabel(actionLabel)
    void continueGetStarted(actionLabel)
      .then(() => {
        if (!user) {
          setPendingCtaLabel(null)
        }
      })
      .catch((error) => {
        console.error('Unable to continue from landing page', error)
        setPendingCtaLabel(null)
      })
  }, [continueGetStarted, isAuthLoading, pendingCtaLabel, user])

  useEffect(() => {
    if (!queuedAuthCtaLabel || isAuthLoading) return

    setQueuedAuthCtaLabel(null)
    void continueGetStarted(queuedAuthCtaLabel)
      .then(() => {
        if (!user) {
          setPendingCtaLabel(null)
        }
      })
      .catch((error) => {
        console.error('Unable to continue from landing page', error)
        setPendingCtaLabel(null)
      })
  }, [continueGetStarted, isAuthLoading, queuedAuthCtaLabel, user])

  const isCtaPending = useCallback(
    (actionLabel: string) => pendingCtaLabel === actionLabel,
    [pendingCtaLabel]
  )

  const handleAuthPromptClose = useCallback(() => {
    setPendingActionLabel(null)
    setPendingCtaLabel(null)
    setQueuedAuthCtaLabel(null)
    setIsAuthPromptOpen(false)
  }, [])

  const handleAuthenticated = useCallback(async () => {
    setPendingActionLabel(null)
    if (!hasFiles) {
      router.push('/dashboard')
      return
    }

    const landingClient = await getOrCreateLandingClient()
    const params = new URLSearchParams()
    params.set('name', landingClient.name)
    params.set('landing', '1')
    router.push(`/dashboard/clients/${landingClient.client_id}?${params.toString()}`)
  }, [getOrCreateLandingClient, hasFiles, router])

  useEffect(() => {
    if (!previewFile || !previewKey || user) {
      return
    }

    if (
      settledPreviewKeyRef.current === previewKey ||
      inFlightPreviewKeyRef.current === previewKey
    ) {
      return
    }

    let isCancelled = false
    inFlightPreviewKeyRef.current = previewKey
    setIsPreviewLoading(true)
    setPreviewError(null)
    setPreviewProgress(8)
    setPreviewStageLabel('Uploading preview file')

    void previewExtractLandingFile(previewFile)
      .then((result) => {
        if (isCancelled) return
        settledPreviewKeyRef.current = previewKey
        setPreviewProgress(100)
        setPreviewStageLabel('Preview ready')
        setPreviewResult(result)
      })
      .catch((error) => {
        if (isCancelled) return
        settledPreviewKeyRef.current = previewKey
        setPreviewProgress(100)
        setPreviewStageLabel('Preview failed')
        setPreviewResult(null)
        setPreviewError(
          error instanceof Error
            ? error.message
            : 'Preview extraction failed'
        )
      })
      .finally(() => {
        if (isCancelled) return
        inFlightPreviewKeyRef.current = null
        setIsPreviewLoading(false)
      })

    return () => {
      isCancelled = true
      if (inFlightPreviewKeyRef.current === previewKey) {
        inFlightPreviewKeyRef.current = null
      }
    }
  }, [
    previewFile,
    previewKey,
    setIsPreviewLoading,
    setPreviewError,
    setPreviewResult,
    user,
  ])

  useEffect(() => {
    if (!previewKey) {
      inFlightPreviewKeyRef.current = null
      settledPreviewKeyRef.current = null
      setPreviewProgress(0)
      setPreviewStageLabel('Preparing preview')
      return
    }

    if (settledPreviewKeyRef.current && settledPreviewKeyRef.current !== previewKey) {
      settledPreviewKeyRef.current = null
      setPreviewResult(null)
      setPreviewError(null)
    }
  }, [previewKey, setPreviewError, setPreviewResult])

  useEffect(() => {
    if (!isPreviewLoading) {
      if (!previewResult && !previewError) {
        setPreviewProgress(0)
        setPreviewStageLabel('Preparing preview')
      }
      return
    }

    setPreviewStageLabel((current) =>
      current === 'Uploading preview file' ? current : 'Extracting sample fields'
    )

    const timer = window.setInterval(() => {
      setPreviewProgress((current) => {
        if (current < 24) {
          setPreviewStageLabel('Uploading preview file')
          return Math.min(current + 8, 24)
        }
        setPreviewStageLabel('Extracting sample fields')
        if (current >= 92) {
          return current
        }
        return Math.min(current + Math.max(2, Math.round((92 - current) / 4)), 92)
      })
    }, 180)

    return () => window.clearInterval(timer)
  }, [isPreviewLoading, previewError, previewResult])

  return (
    <div className="min-h-screen bg-white">
      <AuthPromptModal
        isOpen={isAuthPromptOpen}
        actionLabel={pendingActionLabel}
        onClose={handleAuthPromptClose}
        onAuthenticated={handleAuthenticated}
      />

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">AutoFil</h1>
              <p className="text-[10px] text-gray-500 leading-tight">Smart Form Automation</p>
            </div>
          </div>

          <button
            onClick={() => handleGetStarted('start your workspace')}
            disabled={isCtaPending('start your workspace')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:shadow-md disabled:cursor-wait disabled:bg-blue-500 sm:px-5 sm:py-2.5"
          >
            {isCtaPending('start your workspace') && <Loader2 className="h-4 w-4 animate-spin" />}
            Get Started
          </button>
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="relative bg-gradient-to-b from-blue-50 via-white to-white py-16 sm:py-24 lg:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto mb-12 max-w-4xl text-center sm:mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                Built for Insurance Teams
              </div>

              <h2 className="mb-5 text-3xl font-bold leading-tight text-gray-900 sm:mb-6 sm:text-5xl lg:text-6xl">
                Automate Insurance Document Submission Flow
              </h2>
              
              <p className="mx-auto mb-8 max-w-3xl text-base text-gray-600 sm:text-xl">
                Upload client forms, policies, or templates — AutoFil extracts structured data and generates ready-to-send filled outputs in seconds.
              </p>

              <div className="mb-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4">
                <button
                  onClick={() => handleGetStarted('start using AutoFil')}
                  disabled={isCtaPending('start using AutoFil')}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl disabled:cursor-wait disabled:bg-blue-500 sm:px-8 sm:py-4 sm:text-lg"
                >
                  {isCtaPending('start using AutoFil') && <Loader2 className="h-5 w-5 animate-spin" />}
                  Try AutoFil Free
                  {!isCtaPending('start using AutoFil') && <ArrowRight className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('demo-section')
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-6 py-3.5 text-base font-semibold text-gray-900 transition-all hover:bg-gray-50 sm:px-8 sm:py-4 sm:text-lg"
                >
                  Watch Demo
                </button>
              </div>

              <p className="text-sm text-gray-500">
                No credit card required • Free trial • ACORD 125/126/140 supported
              </p>
            </div>

            {/* Value Props Grid */}
            <div className="mx-auto mb-12 grid max-w-5xl grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:mb-16 md:grid-cols-4 md:gap-6">
              {[
                { label: 'Hours saved per submission', value: '2-4h' },
                { label: 'Accuracy rate', value: '98%+' },
                { label: 'Processing speed', value: '<60s' },
                { label: 'Supported formats', value: '10+' },
              ].map((stat, i) => (
                <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm sm:p-6">
                  <div className="mb-2 text-2xl font-bold text-blue-600 sm:text-3xl">{stat.value}</div>
                  <div className="text-sm text-gray-600">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <LandingUploadPanel
          files={files}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          onClearFiles={clearFiles}
          onContinue={() => handleGetStarted('continue with this extraction preview')}
          isAuthenticated={Boolean(user)}
          previewFile={previewFile}
          previewResult={previewResult}
          isPreviewLoading={isPreviewLoading}
          previewError={previewError}
          previewProgress={previewProgress}
          previewStageLabel={previewStageLabel}
          isContinuePending={isCtaPending('continue with this extraction preview')}
        />

        {/* ANIMATED DEMO SECTION */}
        <section id="demo-section" className="overflow-hidden bg-gray-50 py-14 sm:py-20">
          <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
            <AnimatedDemo
              onPrimaryCta={() => handleGetStarted('download a carrier package')}
              onSecondaryCta={() => handleGetStarted('open the submission workspace')}
            />
          </div>
        </section>

        <FieldLocatorDemo />

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="bg-white py-14 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center sm:mb-16">
              <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">How It Works</h3>
              <p className="mx-auto max-w-2xl text-base text-gray-600 sm:text-xl">
                Three simple steps to automate your insurance document workflow
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3 md:gap-8">
              {/* Step 1 */}
              <div className="relative">
                <div className="h-full rounded-2xl border-2 border-gray-200 bg-white p-6 transition-all hover:border-blue-300 hover:shadow-lg sm:p-8">
                  <div className="absolute -top-4 -left-4 w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xl font-bold shadow-lg">
                    1
                  </div>
                  <div className="w-16 h-16 mx-auto bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mt-4">
                    <Upload className="w-8 h-8 text-blue-600" />
                  </div>
                  <h4 className="text-xl font-bold mb-3 text-gray-900">Upload Documents</h4>
                  <p className="text-gray-600">
                    Drag and drop your PDFs, Excel files, or CSVs. AutoFil automatically scans and extracts all relevant data.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-blue-300 hover:shadow-lg transition-all h-full">
                  <div className="absolute -top-4 -left-4 w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xl font-bold shadow-lg">
                    2
                  </div>
                  <div className="w-16 h-16 mx-auto bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mt-4">
                    <Zap className="w-8 h-8 text-blue-600" />
                  </div>
                  <h4 className="text-xl font-bold mb-3 text-gray-900">Review & Edit</h4>
                  <p className="text-gray-600">
                    Verify extracted fields with confidence scores. Make quick edits if needed before processing.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-blue-300 hover:shadow-lg transition-all h-full">
                  <div className="absolute -top-4 -left-4 w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center text-xl font-bold shadow-lg">
                    3
                  </div>
                  <div className="w-16 h-16 mx-auto bg-blue-100 rounded-2xl flex items-center justify-center mb-6 mt-4">
                    <Download className="w-8 h-8 text-blue-600" />
                  </div>
                  <h4 className="text-xl font-bold mb-3 text-gray-900">Export & Download</h4>
                  <p className="text-gray-600">
                    Download filled forms instantly. Batch process multiple documents with one click.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="bg-gray-50 py-14 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center sm:mb-16">
              <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Powerful Features</h3>
              <p className="mx-auto max-w-2xl text-base text-gray-600 sm:text-xl">
                Everything you need to streamline insurance document processing
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {[
                {
                  icon: '📄',
                  title: 'Universal Form Support',
                  desc: 'Works with ACORD forms, carrier applications, loss runs, SOVs, and custom documents.',
                },
                {
                  icon: '⚡',
                  title: 'Batch Processing',
                  desc: 'Upload and process multiple documents simultaneously. Handle entire client folders at once.',
                },
                {
                  icon: '🎯',
                  title: 'Smart Data Extraction',
                  desc: 'AI-powered OCR and NLP extract fields with 98%+ accuracy across various document types.',
                },
                {
                  icon: '✅',
                  title: 'Confidence Indicators',
                  desc: 'See extraction confidence scores for every field. Quickly identify items needing review.',
                },
                {
                  icon: '🔒',
                  title: 'Secure & Private',
                  desc: 'All processing happens locally in your browser. Your documents never leave your device.',
                },
                {
                  icon: '📊',
                  title: 'Audit Trail',
                  desc: 'Track all changes and maintain complete version history for compliance and record-keeping.',
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-blue-200 transition-all"
                >
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h4 className="text-lg font-bold mb-2 text-gray-900">{feature.title}</h4>
                  <p className="text-gray-600 text-sm">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* USE CASES */}
        <section className="bg-white py-14 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center sm:mb-16">
              <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Built for Insurance Workflows
              </h3>
              <p className="mx-auto max-w-2xl text-base text-gray-600 sm:text-xl">
                Trusted by brokers, underwriters, and agencies for document-heavy tasks
              </p>
            </div>

            <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:gap-8">
              <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 p-6 sm:p-8">
                <h4 className="text-2xl font-bold mb-4 text-gray-900">For Brokers</h4>
                <ul className="space-y-3">
                  {[
                    'Prepare submissions 10x faster',
                    'Reduce manual data entry errors',
                    'Handle renewals in minutes, not hours',
                    'Process multiple quotes simultaneously',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 p-6 sm:p-8">
                <h4 className="text-2xl font-bold mb-4 text-gray-900">For Agencies</h4>
                <ul className="space-y-3">
                  {[
                    'Standardize document workflows across teams',
                    'Maintain consistency in client communications',
                    'Scale operations without adding headcount',
                    'Reduce E&O exposure from manual errors',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-r from-blue-600 to-blue-700 py-14 sm:py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h3 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to Save Hours Every Week?
            </h3>
            <p className="mb-8 text-base text-blue-100 sm:text-xl">
              Join insurance professionals who have automated their document workflows with AutoFil.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
              <button
                onClick={() => handleGetStarted('start your free trial')}
                disabled={isCtaPending('start your free trial')}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-blue-700 shadow-xl transition-all hover:bg-gray-50 disabled:cursor-wait disabled:bg-blue-50 sm:px-8 sm:py-4 sm:text-lg"
              >
                {isCtaPending('start your free trial') && <Loader2 className="h-5 w-5 animate-spin" />}
                Start Free Trial
                {!isCtaPending('start your free trial') && <ArrowRight className="w-5 h-5" />}
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById('demo-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-blue-500 bg-blue-800 px-6 py-3.5 text-base font-semibold text-white transition-all hover:bg-blue-900 sm:px-8 sm:py-4 sm:text-lg"
              >
                Watch Demo
              </button>
            </div>
            <p className="text-sm text-blue-200 mt-6">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-gray-50 border-t border-gray-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-gray-600 font-medium">AutoFil</span>
            </div>
            <div className="text-sm text-gray-500">
              © {new Date().getFullYear()} AutoFil. Smart Form Automation for Insurance.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
