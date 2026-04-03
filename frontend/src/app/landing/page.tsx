'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Zap, Download, CheckCircle, ArrowRight } from 'lucide-react'
import AnimatedDemo from '@/components/landing/AnimatedDemo'
import LandingUploadPanel from '@/components/landing/LandingUploadPanel'
import AuthPromptModal from '@/components/auth/AuthPromptModal'
import { useAuth } from '@/contexts/AuthContext'
import { useLandingUpload } from '@/contexts/LandingUploadContext'

export default function LandingPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { files, addFiles, removeFile, clearFiles } = useLandingUpload()
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false)
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null)

  const handleGetStarted = useCallback((actionLabel = 'start your workspace') => {
    if (user) {
      router.push('/dashboard')
      return
    }

    setPendingActionLabel(actionLabel)
    setIsAuthPromptOpen(true)
  }, [router, user])

  return (
    <div className="min-h-screen bg-white">
      <AuthPromptModal
        isOpen={isAuthPromptOpen}
        actionLabel={pendingActionLabel}
        onClose={() => {
          setPendingActionLabel(null)
          setIsAuthPromptOpen(false)
        }}
        onAuthenticated={() => {
          setPendingActionLabel(null)
          setIsAuthPromptOpen(false)
          router.push('/dashboard')
        }}
      />

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
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
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all shadow-sm hover:shadow-md"
          >
            Get Started
          </button>
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="relative bg-gradient-to-b from-blue-50 via-white to-white py-20 sm:py-28">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-4xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-medium text-blue-700 mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                Built for Insurance Teams
              </div>

              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Automate Insurance Document Submission Flow
              </h2>
              
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
                Upload client forms, policies, or templates — AutoFil extracts structured data and generates ready-to-send filled outputs in seconds.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
                <button
                  onClick={() => handleGetStarted('start using AutoFil')}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                >
                  Try AutoFil Free
                  <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('demo-section')
                    if (el) el.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white hover:bg-gray-50 text-gray-900 text-lg font-semibold rounded-xl border-2 border-gray-200 transition-all"
                >
                  Watch Demo
                </button>
              </div>

              <p className="text-sm text-gray-500">
                No credit card required • Free trial • ACORD 125/126/140 supported
              </p>
            </div>

            {/* Value Props Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto mb-16">
              {[
                { label: 'Hours saved per submission', value: '2-4h' },
                { label: 'Accuracy rate', value: '98%+' },
                { label: 'Processing speed', value: '<60s' },
                { label: 'Supported formats', value: '10+' },
              ].map((stat, i) => (
                <div key={i} className="bg-white rounded-xl p-6 text-center border border-gray-200 shadow-sm">
                  <div className="text-3xl font-bold text-blue-600 mb-2">{stat.value}</div>
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
          onContinue={() => handleGetStarted('process these staged files')}
        />

        {/* ANIMATED DEMO SECTION */}
        <section id="demo-section" className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <AnimatedDemo
              onPrimaryCta={() => handleGetStarted('download a carrier package')}
              onSecondaryCta={() => handleGetStarted('open the submission workspace')}
            />
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">How It Works</h3>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Three simple steps to automate your insurance document workflow
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Step 1 */}
              <div className="relative">
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-blue-300 hover:shadow-lg transition-all h-full">
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
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Powerful Features</h3>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Everything you need to streamline insurance document processing
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                Built for Insurance Workflows
              </h3>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Trusted by brokers, underwriters, and agencies for document-heavy tasks
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-8">
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

              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-8">
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
        <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h3 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to Save Hours Every Week?
            </h3>
            <p className="text-xl text-blue-100 mb-8">
              Join insurance professionals who have automated their document workflows with AutoFil.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => handleGetStarted('start your free trial')}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-700 text-lg font-semibold rounded-xl hover:bg-gray-50 shadow-xl transition-all transform hover:scale-105"
              >
                Start Free Trial
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById('demo-section')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-800 text-white text-lg font-semibold rounded-xl hover:bg-blue-900 border-2 border-blue-500 transition-all"
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
