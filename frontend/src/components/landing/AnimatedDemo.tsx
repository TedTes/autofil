'use client'

import { useState, useEffect } from 'react'
import {
  motion,
  AnimatePresence,
  LayoutGroup,
  useReducedMotion,
} from 'framer-motion'
import {
  Upload,
  FileText,
  Edit,
  CheckCircle,
  Download,
  RotateCcw,
} from 'lucide-react'
import type { ComponentType } from 'react'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

type AnimationScene = 'upload' | 'extract' | 'review' | 'process' | 'export'

interface MockDocument {
  id: string
  filename: string
  status:
    | 'uploading'
    | 'uploaded'
    | 'extracting'
    | 'extracted'
    | 'processing'
    | 'completed'
  progress: number
}

interface MockExtractedData {
  insuredName: string
  policyNumber: string
  effectiveDate: string
  deductibles: string[]
  grossSales: string[]
  lineOfBusiness: string
  mailingAddress: string
  producerName: string
  confidence: number
}

interface AnimationState {
  currentScene: AnimationScene
  sceneProgress: number
  documents: MockDocument[]
  extractedData: MockExtractedData | null
}

interface AnimatedDemoProps {
  onPrimaryCta?: () => void
  onSecondaryCta?: () => void
}

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_DOCUMENTS: MockDocument[] = [
  {
    id: '1',
    filename: 'ACORD_126_filled_input.pdf',
    status: 'uploading',
    progress: 0,
  },
  {
    id: '2',
    filename: 'ACORD_125_application.pdf',
    status: 'uploading',
    progress: 0,
  },
  {
    id: '3',
    filename: 'ACORD_140_property.pdf',
    status: 'uploading',
    progress: 0,
  },
  {
    id: '4',
    filename: 'ACORD_126_filled_copy.pdf',
    status: 'uploading',
    progress: 0,
  },
  {
    id: '5',
    filename: 'loss_runs_2020_2024.pdf',
    status: 'uploading',
    progress: 0,
  },
  {
    id: '6',
    filename: 'harborview_property_sov.csv',
    status: 'uploading',
    progress: 0,
  },
]

const MOCK_EXTRACTED_DATA: MockExtractedData = {
  insuredName: 'Harborview Logistics LLC',
  policyNumber: 'POL-2025-001',
  effectiveDate: '2025-10-01',
  deductibles: ['5,000 PD', '5,000 BI', '10,000 Aggregate'],
  grossSales: ['500,000 Warehousing', '300,000 Distribution'],
  lineOfBusiness:
    'Operates a regional goods distribution warehouse with forklift use and overnight storage.',
  mailingAddress: '123 Main St, Austin, TX 78701',
  producerName: 'Jane Smith (LOC-001)',
  confidence: 98,
}

// ============================================================================
// ANIMATION TIMELINE CONFIGURATION
// ============================================================================

const SCENE_DURATIONS: Record<AnimationScene, number> = {
  upload: 4000,
  extract: 5000,
  review: 4000,
  process: 5000,
  export: 3000,
}

// ============================================================================
// HELPERS – MAP DOC STATUS → PIPELINE STAGE
// ============================================================================

function getStageForStatus(
  status: MockDocument['status'],
  currentScene: AnimationScene
): AnimationScene {
  if (status === 'completed') return 'export'
  if (status === 'processing') return 'process'

  if (status === 'extracted') {
    // Once extracted, they sit in "Review" while the demo is in or past review
    if (currentScene === 'review' || currentScene === 'process' || currentScene === 'export') {
      return 'review'
    }
    return 'extract'
  }

  if (status === 'extracting') return 'extract'
  // uploading / uploaded
  return 'upload'
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AnimatedDemo({
  onPrimaryCta,
  onSecondaryCta,
}: AnimatedDemoProps) {
  const prefersReducedMotion = useReducedMotion()

  const [state, setState] = useState<AnimationState>({
    currentScene: 'upload',
    sceneProgress: 0,
    documents: MOCK_DOCUMENTS,
    extractedData: null,
  })

  const [animationKey, setAnimationKey] = useState(0)

  const restart = () => {
    setAnimationKey(prev => prev + 1)
    setState({
      currentScene: 'upload',
      sceneProgress: 0,
      documents: MOCK_DOCUMENTS.map(doc => ({
        ...doc,
        status: 'uploading',
        progress: 0,
      })),
      extractedData: null,
    })
  }

  const jumpToScene = (scene: AnimationScene) => {
    setState(prev => ({
      ...prev,
      currentScene: scene,
      sceneProgress: 0,
    }))
  }

  // ============================================================================
  // AUTO-PLAY ANIMATION LOOP
  // ============================================================================

  useEffect(() => {
    if (prefersReducedMotion) return

    const scenes: AnimationScene[] = [
      'upload',
      'extract',
      'review',
      'process',
      'export',
    ]
    let currentIndex = scenes.indexOf(state.currentScene)
    let startTime = Date.now()
    let animationFrame: number

    const animate = () => {
      const elapsed = Date.now() - startTime
      const duration = SCENE_DURATIONS[scenes[currentIndex]]
      const progress = Math.min(elapsed / duration, 1)

      setState(prev => {
        const newState: AnimationState = {
          ...prev,
          sceneProgress: progress,
          documents: updateDocumentStates(
            scenes[currentIndex],
            progress,
            prev.documents
          ),
        }

        if (scenes[currentIndex] === 'extract' && progress > 0.3) {
          newState.extractedData = MOCK_EXTRACTED_DATA
        }

        return newState
      })

      if (progress >= 1) {
        currentIndex = (currentIndex + 1) % scenes.length

        if (currentIndex === 0) {
          setState({
            currentScene: scenes[0],
            sceneProgress: 0,
            documents: MOCK_DOCUMENTS.map(doc => ({
              ...doc,
              status: 'uploading',
              progress: 0,
            })),
            extractedData: null,
          })
        } else {
          setState(prev => ({
            ...prev,
            currentScene: scenes[currentIndex],
            sceneProgress: 0,
          }))
        }

        startTime = Date.now()
      }

      animationFrame = requestAnimationFrame(animate)
    }

    animationFrame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationFrame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationKey, prefersReducedMotion])

  // ============================================================================
  // HELPER – UPDATE DOC STATES PER SCENE
  // ============================================================================

  const updateDocumentStates = (
    scene: AnimationScene,
    progress: number,
    docs: MockDocument[]
  ): MockDocument[] => {
    return docs.map((doc, index) => {
      const stagger = index * 0.08
      const effectiveProgress = Math.max(0, progress - stagger)
      const pct = Math.min(effectiveProgress * 1.4 * 100, 100)

      switch (scene) {
        case 'upload':
          return {
            ...doc,
            status: pct >= 100 ? 'uploaded' : 'uploading',
            progress: pct,
          }
        case 'extract':
          return {
            ...doc,
            status: pct >= 100 ? 'extracted' : 'extracting',
            progress: pct,
          }
        case 'process':
          return {
            ...doc,
            status: pct >= 100 ? 'completed' : 'processing',
            progress: pct,
          }
        default:
          return doc
      }
    })
  }

  // ============================================================================
  // SCENE DEFINITIONS
  // ============================================================================

  const scenes: Array<{
    id: AnimationScene
    label: string
    icon: ComponentType<{ className?: string }>
  }> = [
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'extract', label: 'Extract', icon: FileText },
    { id: 'review', label: 'Review', icon: Edit },
    { id: 'process', label: 'Auto-Fill', icon: CheckCircle },
    { id: 'export', label: 'Export', icon: Download },
  ]

  const currentSceneIndex = scenes.findIndex(s => s.id === state.currentScene)

  const renderSceneContent = () => {
    switch (state.currentScene) {
      case 'upload':
        return (
          <UploadScene
            documents={state.documents}
            progress={state.sceneProgress}
          />
        )
      case 'extract':
        return (
          <ExtractScene
            documents={state.documents}
            extractedData={state.extractedData}
            progress={state.sceneProgress}
          />
        )
      case 'review':
        return (
          <ReviewScene
            extractedData={state.extractedData}
            progress={state.sceneProgress}
          />
        )
      case 'process':
        return (
          <ProcessScene
            documents={state.documents}
            progress={state.sceneProgress}
          />
        )
      case 'export':
        return (
          <ExportScene
            documents={state.documents}
            progress={state.sceneProgress}
            onPrimaryCta={onPrimaryCta}
            onSecondaryCta={onSecondaryCta}
          />
        )
      default:
        return null
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
          See AutoFil in Action
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Watch how broker documents flow from upload to clean, carrier-ready
          submissions.
        </p>
      </motion.div>

      {/* Animation Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Progress Steps */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            {scenes.map((scene, index) => {
              const Icon = scene.icon
              const isActive = state.currentScene === scene.id
              const isCompleted = index < currentSceneIndex

              return (
                <div key={scene.id} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => jumpToScene(scene.id)}
                    className="flex flex-col items-center gap-2"
                  >
                    <motion.div
                      animate={{
                        scale: isActive ? 1.1 : 1,
                        opacity: isActive ? 1 : 0.6,
                      }}
                      whileHover={{ scale: 1.15, opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        isCompleted
                          ? 'bg-emerald-500 text-white'
                          : isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-300 text-slate-700'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </motion.div>
                    <span
                      className={`text-xs font-medium ${
                        isActive ? 'text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      {scene.label}
                    </span>
                  </button>
                  {index < scenes.length - 1 && (
                    <div className="flex-1 h-1 mx-2 bg-slate-200 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${
                          isCompleted
                            ? 'bg-emerald-500'
                            : isActive
                            ? 'bg-blue-600'
                            : 'bg-slate-200'
                        }`}
                        initial={{ width: '0%' }}
                        animate={{
                          width: isCompleted
                            ? '100%'
                            : isActive
                            ? `${state.sceneProgress * 100}%`
                            : '0%',
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Document Pipeline Rail – shows where each doc is in the flow */}
        <DocumentPipelineRail
          documents={state.documents}
          currentScene={state.currentScene}
        />

        {/* Scene content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={state.currentScene}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4 }}
            className="p-8 min-h-[460px] bg-slate-50"
          >
            {renderSceneContent()}
          </motion.div>
        </AnimatePresence>

        {/* Controls */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Demo only — real app integrates with your AMS, carrier portals, and
            email workflows.
          </p>
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <RotateCcw className="w-4 h-4" />
            Replay demo
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================================================
// DOCUMENT PIPELINE RAIL
// ============================================================================

function DocumentPipelineRail({
  documents,
  currentScene,
}: {
  documents: MockDocument[]
  currentScene: AnimationScene
}) {
  const stages: { id: AnimationScene; label: string; accent: string }[] = [
    { id: 'upload', label: 'Client Docs In', accent: 'border-blue-500' },
    { id: 'extract', label: 'Smart Extract', accent: 'border-indigo-500' },
    { id: 'review', label: 'Broker Review', accent: 'border-amber-500' },
    { id: 'process', label: 'Auto-Fill Forms', accent: 'border-emerald-500' },
    { id: 'export', label: 'Export Package', accent: 'border-slate-500' },
  ]

  return (
    <div className="bg-slate-900/3 border-b border-slate-200 px-6 py-4">
      <LayoutGroup id="doc-pipeline">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {stages.map(stage => {
            const docsInStage = documents.filter(
              d => getStageForStatus(d.status, currentScene) === stage.id
            )
            const isActive = stage.id === currentScene

            return (
              <div
                key={stage.id}
                className={`rounded-xl bg-white/80 backdrop-blur-sm border px-3 py-3 min-h-[72px] flex flex-col ${
                  isActive
                    ? `${stage.accent} shadow-sm`
                    : 'border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-800">
                    {stage.label}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {docsInStage.length} doc
                    {docsInStage.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-1 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {docsInStage.slice(0, 3).map(doc => (
                      <motion.div
                        key={doc.id}
                        layout
                        layoutId={doc.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <p className="truncate text-[11px] text-slate-700">
                          {doc.filename}
                        </p>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {docsInStage.length > 3 && (
                    <p className="text-[10px] text-slate-400">
                      +{docsInStage.length - 3} more…
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </LayoutGroup>
    </div>
  )
}

// ============================================================================
// SCENE COMPONENTS
// ============================================================================

function UploadScene({
  documents,
  progress,
}: {
  documents: MockDocument[]
  progress: number
}) {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Upload Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <Upload className="w-10 h-10 text-blue-600" />
        </motion.div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">
          Upload broker files
        </h3>
        <p className="text-slate-600">
          Drop ACORDs, loss runs, SOVs, and spreadsheets — AutoFil handles them
          all.
        </p>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {documents
          .slice(0, Math.max(1, Math.ceil(progress * documents.length)))
          .map((doc, index) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {doc.filename}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="bg-blue-600 h-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${doc.progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <span className="text-xs text-slate-500">
                    {Math.round(doc.progress)}%
                  </span>
                </div>
              </div>
              {doc.status === 'uploaded' && (
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              )}
            </motion.div>
          ))}
      </div>
    </div>
  )
}

function ExtractScene({
  documents,
  extractedData,
  progress,
}: {
  documents: MockDocument[]
  extractedData: MockExtractedData | null
  progress: number
}) {
  const activeDoc =
    documents.find(d => d.status === 'extracting') ||
    documents.find(d => d.status === 'extracted') ||
    documents[0]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Document Preview */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-3">
            Reading your ACORD
          </h3>
          <div className="bg-white rounded-lg border-2 border-dashed border-slate-300 p-4 aspect-[8.5/11] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-red-100 rounded flex items-center justify-center">
                  <FileText className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-800 truncate max-w-[180px]">
                    {activeDoc?.filename}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    ACORD 126 • Commercial GL
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                OCR + NLP
              </span>
            </div>

            <div className="flex-1 bg-slate-50 rounded-lg relative overflow-hidden">
              {/* Fake field highlights */}
              <motion.div
                className="absolute inset-0"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2.4, repeat: Infinity }}
              >
                <div className="absolute top-6 left-6 h-4 w-32 bg-blue-200/60 rounded-sm" />
                <div className="absolute top-12 left-6 h-4 w-40 bg-blue-200/60 rounded-sm" />
                <div className="absolute top-24 left-6 h-4 w-48 bg-emerald-200/70 rounded-sm" />
                <div className="absolute top-40 left-6 h-4 w-28 bg-amber-200/70 rounded-sm" />
                <div className="absolute bottom-10 right-10 h-4 w-40 bg-blue-200/60 rounded-sm" />
              </motion.div>

              {/* Spinner */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mb-2"
                />
                <p className="text-xs text-slate-600">
                  Detecting fields, tables, and checkboxes…
                </p>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              Layout-aware engine maps each field to your submission template
              (limits, deductibles, exposures, mailing address, and more).
            </p>
          </div>
        </div>

        {/* Right: Extracted Data */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-3">
            Structured submission data
          </h3>
          <div className="space-y-3">
            {extractedData && progress > 0.3 ? (
              <>
                <FieldCard
                  label="Insured name"
                  value={extractedData.insuredName}
                />
                <FieldCard
                  label="Policy number"
                  value={extractedData.policyNumber}
                  delay={0.05}
                />
                <FieldCard
                  label="Effective date"
                  value={extractedData.effectiveDate}
                  delay={0.1}
                />
                <FieldCard
                  label="Deductibles"
                  value={extractedData.deductibles.join(' • ')}
                  delay={0.15}
                />
                <FieldCard
                  label="Gross sales"
                  value={`$${extractedData.grossSales.join(' • $')}`}
                  delay={0.2}
                />
                <FieldCard
                  label="Line of business"
                  value={extractedData.lineOfBusiness}
                  multiline
                  delay={0.25}
                />

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 flex items-center gap-2 mt-2"
                >
                  <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-emerald-800">
                      Extraction complete
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      Average field confidence:{' '}
                      <span className="font-semibold">
                        {extractedData.confidence}%
                      </span>
                    </p>
                  </div>
                </motion.div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-slate-500 mb-1">
                  Extracting key fields…
                </p>
                <p className="text-xs text-slate-400">
                  Limits, deductibles, locations, gross sales, operations
                  description and more.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldCard({
  label,
  value,
  multiline,
  delay = 0,
}: {
  label: string
  value: string
  multiline?: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="bg-white rounded-lg border border-slate-200 p-3"
    >
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
        {label}
      </p>
      {multiline ? (
        <p className="text-sm font-semibold text-slate-900 mt-1 leading-snug">
          {value}
        </p>
      ) : (
        <p className="text-sm font-semibold text-slate-900 mt-1 truncate">
          {value}
        </p>
      )}
    </motion.div>
  )
}

// Review Scene
function ReviewScene({
  extractedData,
  progress,
}: {
  extractedData: MockExtractedData | null
  progress: number
}) {
  if (!extractedData) return null

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 mb-1">
            Quick broker review
          </h3>
          <p className="text-slate-600 text-sm">
            Spot-check critical fields before AutoFil pushes data into carrier
            forms.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Autosave on edit
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: key fields */}
          <div className="space-y-4">
            <LabeledReadOnlyInput
              label="Insured name"
              value={extractedData.insuredName}
            />
            <LabeledReadOnlyInput
              label="Policy number"
              value={extractedData.policyNumber}
            />
            <LabeledReadOnlyInput
              label="Effective date"
              value={extractedData.effectiveDate}
              type="date"
            />
            <LabeledReadOnlyInput
              label="Producer"
              value={extractedData.producerName}
            />
          </div>

          {/* Right: ops + notes */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Operations description
              </label>
              <textarea
                value={extractedData.lineOfBusiness}
                readOnly
                rows={4}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Underwriter notes (example)
              </label>
              <textarea
                readOnly
                rows={3}
                value="Forklift use inside warehouse only. No public access. Sprinklered. No hazardous storage."
                className="w-full px-4 py-2 border border-dashed border-amber-300 rounded-lg bg-amber-50/60 text-xs text-slate-800"
              />
            </div>
          </div>
        </div>

        {progress > 0.7 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex justify-end"
          >
            <button
              type="button"
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-blue-700"
            >
              Confirm & Auto-Fill forms
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function LabeledReadOnlyInput({
  label,
  value,
  type = 'text',
}: {
  label: string
  value: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        readOnly
        className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-50 text-sm"
      />
    </div>
  )
}

// Process Scene
function ProcessScene({
  documents,
}: {
  documents: MockDocument[]
  progress: number
}) {
  const processedCount = documents.filter(d => d.status === 'completed').length

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <CheckCircle className="w-10 h-10 text-purple-600" />
        </motion.div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">
          Auto-filling carrier forms
        </h3>
        <p className="text-slate-600">
          Mapping your normalized data into ACORD 125/126/140 and carrier
          supplements.
        </p>
      </div>

      {/* Progress Overview */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-slate-700">
            Overall batch progress
          </span>
          <span className="text-sm font-semibold text-slate-900">
            {processedCount} / {documents.length} documents
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
          <motion.div
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-full"
            initial={{ width: '0%' }}
            animate={{
              width: `${(processedCount / documents.length) * 100}%`,
            }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Document Processing List */}
      <div className="space-y-2">
        {documents.map((doc, index) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                doc.status === 'completed' ? 'bg-emerald-100' : 'bg-blue-100'
              }`}
            >
              {doc.status === 'completed' ? (
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              ) : (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {doc.filename}
              </p>
              <p className="text-xs text-slate-500">
                {doc.status === 'completed'
                  ? 'Filled and ready to send'
                  : 'Applying data to carrier forms…'}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// Export Scene
function ExportScene({
  documents,
  progress,
  onPrimaryCta,
  onSecondaryCta,
}: {
  documents: MockDocument[]
  progress: number
  onPrimaryCta?: () => void
  onSecondaryCta?: () => void
}) {
  return (
    <div className="max-w-4xl mx-auto text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"
      >
        <Download className="w-12 h-12 text-emerald-600" />
      </motion.div>

      <h3 className="text-3xl font-bold text-slate-900 mb-3">
        Ready for underwriters
      </h3>
      <p className="text-lg text-slate-600 mb-8">
        Auto-generated packet: filled ACORDs, JSON/CSV data, and a clean manifest
        for your AMS.
      </p>

      <div className="bg-white rounded-lg border border-slate-200 p-6 max-w-md mx-auto mb-6 text-left">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Forms filled</span>
            <span className="font-semibold text-slate-900">
              {documents.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Estimated fields filled</span>
            <span className="font-semibold text-slate-900">
              {documents.length * 45}+
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Estimated time saved</span>
            <span className="font-semibold text-emerald-600">2–3 hrs</span>
          </div>
        </div>
      </div>

      {progress > 0.5 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-4 justify-center"
        >
          <button
            type="button"
            onClick={onPrimaryCta}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm"
          >
            Download carrier package
          </button>
          <button
            type="button"
            onClick={onSecondaryCta}
            className="px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-medium rounded-lg"
          >
            View in submission workspace
          </button>
        </motion.div>
      )}
    </div>
  )
}
