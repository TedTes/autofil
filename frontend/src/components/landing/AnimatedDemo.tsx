'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'framer-motion'
import {
  BarChart3,
  Building2,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Layers3,
  Loader2,
  MousePointer2,
  Pencil,
  Download,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import type { ComponentType } from 'react'

type DemoScene = 'account' | 'submission'

type DemoStep = {
  id: DemoScene
  label: string
  icon: ComponentType<{ className?: string }>
}

type DemoUploadFile = [name: string, confidence: string, type: string]

interface AnimatedDemoProps {
  onPrimaryCta?: () => void
  onSecondaryCta?: () => void
}

type ProcessingScene = 'upload' | 'extract' | 'review' | 'process' | 'export'

type TimelineScene = {
  durationMs: number
}

type AccountTimeline = TimelineScene & {
  modalDurationMs: number
  modalTimes: number[]
  typeAccountNameMs: number
  clickCreateAccountMs: number
  showCreatedAccountMs: number
  cursorPath: Array<{ left: string; top: string }>
  cursorTimesMs: number[]
}

type SubmissionTimeline = TimelineScene & {
  modalDurationMs: number
  modalTimes: number[]
  typeSubmissionNameMs: number
  clickCreateSubmissionMs: number
  showUploadWorkspaceMs: number
  filePickerStartMs: number
  filePickerDurationMs: number
  filePickerTimes: number[]
  filePickerSelectStartMs: number
  filePickerSelectStaggerMs: number
  filePickerOpenPulseMs: number
  uploadCollapseStartMs: number
  uploadCollapseDurationMs: number
  uploadListStartMs: number
  uploadListStaggerMs: number
  uploadProgressDurationMs: number
  uploadCompleteMs: number
  processingStartMs: number
  processingDurationMs: number
  processingTimes: number[]
  mergedReviewStartMs: number
  generateModalAfterReviewMs: number
  cursorPath: Array<{ left: string; top: string }>
  cursorTimesMs: number[]
}

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

const steps: DemoStep[] = [
  { id: 'account', label: 'Account', icon: Users },
  { id: 'submission', label: 'Submission', icon: Plus },
]

const sec = (ms: number) => ms / 1000
const normalizedTimes = (pointsMs: number[], durationMs: number) =>
  pointsMs.map((point) => point / durationMs)
const lastTimelinePoint = (pointsMs: number[], fallbackMs: number) =>
  pointsMs.length > 0 ? pointsMs[pointsMs.length - 1] : fallbackMs

const DEMO_TIMELINE: {
  account: AccountTimeline
  submission: SubmissionTimeline
} = {
  account: {
    durationMs: 6200,
    modalDurationMs: 5800,
    modalTimes: [0, 0.1, 0.16, 0.76, 1],
    typeAccountNameMs: 750,
    clickCreateAccountMs: 3350,
    showCreatedAccountMs: 5050,
    cursorPath: [
      { left: '86%', top: '18%' },
      { left: '86%', top: '18%' },
      { left: '57%', top: '48%' },
      { left: '65%', top: '66%' },
      { left: '65%', top: '66%' },
      { left: '27%', top: '35%' },
    ],
    cursorTimesMs: [0, 400, 1200, 2400, 3536, 5200],
  },
  submission: {
    durationMs: 26000,
    modalDurationMs: 6200,
    modalTimes: [0, 0.22, 0.28, 0.92, 1],
    typeSubmissionNameMs: 1850,
    clickCreateSubmissionMs: 5350,
    showUploadWorkspaceMs: 6350,
    filePickerStartMs: 7050,
    filePickerDurationMs: 4300,
    filePickerTimes: [0, 0.08, 0.9, 1],
    filePickerSelectStartMs: 7700,
    filePickerSelectStaggerMs: 80,
    filePickerOpenPulseMs: 10100,
    uploadCollapseStartMs: 9650,
    uploadCollapseDurationMs: 2600,
    uploadListStartMs: 11150,
    uploadListStaggerMs: 80,
    uploadProgressDurationMs: 750,
    uploadCompleteMs: 13000,
    processingStartMs: 13800,
    processingDurationMs: 4300,
    processingTimes: [0, 0.16, 0.82, 1],
    mergedReviewStartMs: 17750,
    generateModalAfterReviewMs: 4300,
    cursorPath: [
      { left: '34%', top: '35%' },
      { left: '53%', top: '7.5%' },
      { left: '53%', top: '7.5%' },
      { left: '58%', top: '51%' },
      { left: '65%', top: '66%' },
      { left: '65%', top: '66%' },
      { left: '87%', top: '17%' },
      { left: '87%', top: '17%' },
      { left: '23%', top: '27%' },
      { left: '85%', top: '85%' },
      { left: '73%', top: '56%' },
      { left: '73%', top: '56%' },
      { left: '72%', top: '35%' },
      { left: '72%', top: '48%' },
      { left: '76%', top: '5.5%' },
      { left: '76%', top: '5.5%' },
      { left: '30%', top: '39%' },
      { left: '30%', top: '39%' },
      { left: '61.5%', top: '75.5%' },
      { left: '61.5%', top: '75.5%' },
      { left: '11%', top: '22%' },
    ],
    cursorTimesMs: [
      0,
      450,
      1450,
      2850,
      4700,
      5850,
      6700,
      7469,
      8245,
      10050,
      11250,
      13192,
      14400,
      15850,
      19700,
      21300,
      22250,
      22800,
      23750,
      24750,
      25200,
    ],
  },
}

const sceneDurations: Record<DemoScene, number> = {
  account: DEMO_TIMELINE.account.durationMs,
  submission: DEMO_TIMELINE.submission.durationMs,
}

const PROCESSING_SCENE_DURATIONS: Record<ProcessingScene, number> = {
  upload: 4000,
  extract: 5000,
  review: 4000,
  process: 5000,
  export: 3000,
}

const SUBMISSION_PACKAGE_FILES: DemoUploadFile[] = [
  ['25 Certificat...surance.pdf', '98%', 'pdf'],
  ['27 Evidence...surance.pdf', '98%', 'pdf'],
  ['28 Evidence...surance.pdf', '98%', 'pdf'],
  ['125 Applicati...Section.pdf', '98%', 'pdf'],
  ['126 Commer...2016-09.pdf', '98%', 'pdf'],
  ['130 Workers...2017-05.pdf', '80%', 'pdf'],
  ['2025_profit_and_loss.csv', '90%', 'csv'],
  ['loss_run.csv', '90%', 'csv'],
  ['statement_of_values.csv', '95%', 'csv'],
  ['140 Property Section.pdf', '80%', 'pdf'],
]

const CREATED_SUBMISSION_NAME = 'Redwood renewal'

const MOCK_DOCUMENTS: MockDocument[] = [
  ...SUBMISSION_PACKAGE_FILES.map(([filename], index) => ({
    id: String(index + 1),
    filename,
    status: 'uploading' as const,
    progress: 0,
  })),
]

const MOCK_EXTRACTED_DATA: MockExtractedData = {
  insuredName: 'Redwood Custom Builders LLC',
  policyNumber: 'PKG-TEST-2026-001',
  effectiveDate: '2026-05-01',
  deductibles: ['5,000 PD', '5,000 BI', '10,000 Aggregate'],
  grossSales: ['1,250,000 Revenue', '850,000 Payroll'],
  lineOfBusiness:
    'Residential remodeling, finish carpentry, and light commercial tenant improvements.',
  mailingAddress: '425 Market Street, San Francisco, CA 94105',
  producerName: 'Northstar Risk Partners',
  confidence: 98,
}

export default function AnimatedDemo({
  onPrimaryCta,
  onSecondaryCta,
}: AnimatedDemoProps) {
  const prefersReducedMotion = useReducedMotion()
  const [scene, setScene] = useState<DemoScene>('account')
  const [progressKey, setProgressKey] = useState(0)

  const sceneIndex = steps.findIndex((step) => step.id === scene)

  useEffect(() => {
    if (prefersReducedMotion) return
    const currentIndex = steps.findIndex((step) => step.id === scene)

    if (currentIndex < 0) {
      return
    }

    const timer = window.setTimeout(() => {
      setScene((current) => {
        const nextIndex = steps.findIndex((step) => step.id === current) + 1
        return steps[nextIndex % steps.length].id
      })
      setProgressKey((current) => current + 1)
    }, sceneDurations[scene])

    return () => window.clearTimeout(timer)
  }, [prefersReducedMotion, scene])

  const restart = () => {
    setScene('account')
    setProgressKey((current) => current + 1)
  }

  const selectScene = (next: DemoScene) => {
    setScene(next)
    setProgressKey((current) => current + 1)
  }

  const activeTitle = useMemo(() => {
    switch (scene) {
      case 'account':
        return 'Create an account workspace'
      case 'submission':
        return 'Create the submission and add files'
    }
  }, [scene])

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold text-slate-950 sm:text-4xl">
          See AutoFil in Action
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
          A real submission workflow, recreated from the product screens: workspace setup, submission creation, and document intake.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-200/70">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            {steps.map((step, index) => {
              const Icon = step.icon
              const isActive = step.id === scene
              const isComplete = index < sceneIndex
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => selectScene(step.id)}
                  className="group flex min-w-[132px] flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-200"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-md ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : isComplete
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${isActive ? 'text-slate-950' : 'text-slate-600'}`}>
                      {step.label}
                    </span>
                    {isActive && (
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-blue-100">
                        <motion.span
                          key={progressKey}
                          className="block h-full rounded-full bg-blue-600"
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: sceneDurations[scene] / 1000, ease: 'linear' }}
                        />
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Current step
            </p>
            <h3 className="text-lg font-semibold text-slate-950">{activeTitle}</h3>
          </div>
          <button
            type="button"
            onClick={restart}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Replay
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={scene}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="bg-slate-100 p-4 sm:p-6"
          >
            <AppFrame>
              {scene === 'account' && <AccountScene />}
              {scene === 'submission' && <SubmissionScene />}
            </AppFrame>
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            The animation loops through account setup, submission creation, and document intake.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onSecondaryCta}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Open workspace
            </button>
            <button
              type="button"
              onClick={onPrimaryCta}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Generate package
            </button>
          </div>
        </div>
      </div>

      <LegacyProcessingDemo />
    </div>
  )
}

function getStageForStatus(
  status: MockDocument['status'],
  currentScene: ProcessingScene
): ProcessingScene {
  if (status === 'completed') return 'export'
  if (status === 'processing') return 'process'
  if (status === 'extracted') {
    if (
      currentScene === 'review' ||
      currentScene === 'process' ||
      currentScene === 'export'
    ) {
      return 'review'
    }
    return 'extract'
  }
  if (status === 'extracting') return 'extract'
  return 'upload'
}

function updateProcessingDocuments(
  scene: ProcessingScene,
  progress: number,
  docs: MockDocument[]
): MockDocument[] {
  return docs.map((doc, index) => {
    const stagger = index * 0.08
    const effectiveProgress = Math.max(0, progress - stagger)
    const pct = Math.min(effectiveProgress * 1.4 * 100, 100)

    switch (scene) {
      case 'upload':
        return { ...doc, status: pct >= 100 ? 'uploaded' : 'uploading', progress: pct }
      case 'extract':
        return { ...doc, status: pct >= 100 ? 'extracted' : 'extracting', progress: pct }
      case 'process':
        return { ...doc, status: pct >= 100 ? 'completed' : 'processing', progress: pct }
      default:
        return doc
    }
  })
}

function LegacyProcessingDemo() {
  const prefersReducedMotion = useReducedMotion()
  const [currentScene, setCurrentScene] = useState<ProcessingScene>('upload')
  const [sceneProgress, setSceneProgress] = useState(0)
  const [documents, setDocuments] = useState<MockDocument[]>(MOCK_DOCUMENTS)
  const [extractedData, setExtractedData] = useState<MockExtractedData | null>(null)
  const [animationKey, setAnimationKey] = useState(0)

  useEffect(() => {
    if (prefersReducedMotion) return

    const scenes: ProcessingScene[] = ['upload', 'extract', 'review', 'process', 'export']
    let currentIndex = scenes.indexOf(currentScene)
    let startTime = Date.now()
    let animationFrame = 0

    const animate = () => {
      const elapsed = Date.now() - startTime
      const duration = PROCESSING_SCENE_DURATIONS[scenes[currentIndex]]
      const progress = Math.min(elapsed / duration, 1)

      setSceneProgress(progress)
      setDocuments((prev) =>
        updateProcessingDocuments(scenes[currentIndex], progress, prev)
      )

      if (scenes[currentIndex] === 'extract' && progress > 0.3) {
        setExtractedData(MOCK_EXTRACTED_DATA)
      }

      if (progress >= 1) {
        currentIndex = (currentIndex + 1) % scenes.length

        if (currentIndex === 0) {
          setCurrentScene('upload')
          setSceneProgress(0)
          setDocuments(
            MOCK_DOCUMENTS.map((doc) => ({ ...doc, status: 'uploading', progress: 0 }))
          )
          setExtractedData(null)
        } else {
          setCurrentScene(scenes[currentIndex])
          setSceneProgress(0)
        }

        startTime = Date.now()
      }

      animationFrame = window.requestAnimationFrame(animate)
    }

    animationFrame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [animationKey, currentScene, prefersReducedMotion])

  const scenes: Array<{
    id: ProcessingScene
    label: string
    icon: ComponentType<{ className?: string }>
  }> = [
    { id: 'upload', label: 'Upload', icon: Upload },
    { id: 'extract', label: 'Extract', icon: FileText },
    { id: 'review', label: 'Review', icon: Pencil },
    { id: 'process', label: 'Auto-Fill', icon: CheckCircle },
    { id: 'export', label: 'Export', icon: Download },
  ]

  const currentSceneIndex = scenes.findIndex((scene) => scene.id === currentScene)

  const restart = () => {
    setAnimationKey((prev) => prev + 1)
    setCurrentScene('upload')
    setSceneProgress(0)
    setDocuments(MOCK_DOCUMENTS.map((doc) => ({ ...doc, status: 'uploading', progress: 0 })))
    setExtractedData(null)
  }

  const jumpToScene = (scene: ProcessingScene) => {
    setAnimationKey((prev) => prev + 1)
    setCurrentScene(scene)
    setSceneProgress(0)
  }

  return (
    <div className="mt-12 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-200/60">
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-5">
        <h3 className="text-2xl font-bold text-slate-950">Document Processing Flow</h3>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          The original pipeline demo: upload, extract, review, auto-fill, and export.
        </p>
      </div>

      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {scenes.map((scene, index) => {
            const Icon = scene.icon
            const isActive = currentScene === scene.id
            const isCompleted = index < currentSceneIndex

            return (
              <div key={scene.id} className="flex flex-1 items-center">
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
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                      isCompleted
                        ? 'bg-emerald-500 text-white'
                        : isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-300 text-slate-700'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </motion.div>
                  <span className={`text-xs font-medium ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                    {scene.label}
                  </span>
                </button>
                {index < scenes.length - 1 && (
                  <div className="mx-2 h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
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
                            ? `${sceneProgress * 100}%`
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

      <LegacyDocumentPipelineRail documents={documents} currentScene={currentScene} />

      <div className="min-h-[460px] bg-slate-50 p-8">
        {currentScene === 'upload' && (
          <LegacyUploadScene documents={documents} progress={sceneProgress} />
        )}
        {currentScene === 'extract' && (
          <LegacyExtractScene
            documents={documents}
            extractedData={extractedData}
            progress={sceneProgress}
          />
        )}
        {currentScene === 'review' && (
          <LegacyReviewScene extractedData={extractedData} progress={sceneProgress} />
        )}
        {currentScene === 'process' && (
          <LegacyProcessScene documents={documents} progress={sceneProgress} />
        )}
        {currentScene === 'export' && (
          <LegacyExportScene documents={documents} progress={sceneProgress} />
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4">
        <p className="text-xs text-slate-500">
          Demo only — real app integrates with your AMS, carrier portals, and email workflows.
        </p>
        <button
          type="button"
          onClick={restart}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          <RotateCcw className="h-4 w-4" />
          Replay demo
        </button>
      </div>
    </div>
  )
}

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto aspect-[16/9] min-h-[520px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <aside className="absolute inset-y-0 left-0 w-[72px] border-r border-slate-200 bg-white">
        <div className="flex h-full flex-col items-center gap-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <BarChart3 className="h-4 w-4" />
          </div>
          <span className="text-[10px] font-semibold tracking-wide text-slate-500">AUTOFIL</span>
          <NavIcon icon={BarChart3} label="Dashboard" />
          <NavIcon icon={Layers3} label="Submissions" />
          <NavIcon icon={Users} label="Accounts" />
          <NavIcon icon={Folder} label="Documents" active />
          <NavIcon icon={FileText} label="Library" />
          <NavIcon icon={BarChart3} label="Reports" />
        </div>
      </aside>
      <main className="absolute inset-y-0 left-[72px] right-0 overflow-hidden bg-white">
        {children}
      </main>
    </div>
  )
}

function NavIcon({
  icon: Icon,
  label,
  active,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  active?: boolean
}) {
  return (
    <div className={`flex w-full flex-col items-center gap-1 py-1 text-[10px] ${active ? 'text-blue-700' : 'text-slate-500'}`}>
      <span className={`rounded-lg p-2 ${active ? 'bg-blue-50 ring-1 ring-blue-100' : ''}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span>{label}</span>
    </div>
  )
}

function TopBar({
  crumb,
  parentCrumb,
  actions,
}: {
  crumb: string
  parentCrumb?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-slate-400">Dashboard</span>
        <span className="text-slate-300">›</span>
        {parentCrumb ? (
          <>
            <span className="text-slate-400">{parentCrumb}</span>
            <span className="text-slate-300">›</span>
          </>
        ) : null}
        <span className="font-semibold text-slate-950">{crumb}</span>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <span className="text-sm text-slate-500">tedtfugg@gmail.com</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
          T
        </span>
      </div>
    </div>
  )
}

function TypewriterText({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span className="inline-flex min-h-6 items-center">
      {text.split('').map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + index * 0.055, duration: 0.01 }}
        >
          {char === ' ' ? '\u00a0' : char}
        </motion.span>
      ))}
      <motion.span
        className="ml-0.5 h-5 w-px bg-blue-600"
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, repeat: Infinity }}
      />
    </span>
  )
}

function DemoCursor({
  path,
  times,
  delay = 0,
  duration = 2.55,
}: {
  path: Array<{ left: string; top: string }>
  times?: number[]
  delay?: number
  duration?: number
}) {
  const lastPoint = path[path.length - 1]
  const hasExplicitTimes = times && times.length === path.length
  const cursorPath = hasExplicitTimes ? path : [...path, lastPoint]
  const keyframeTimes = hasExplicitTimes
    ? times
    : cursorPath.map((_, index) =>
        cursorPath.length === 1 ? 0 : index / (cursorPath.length - 1)
      )
  const opacityKeyframes = cursorPath.map((_, index) => (index === 0 ? 0 : 1))
  const scaleKeyframes = cursorPath.map((_, index) =>
    index === cursorPath.length - 1 ? 0.92 : 1
  )

  return (
    <motion.div
      className="pointer-events-none absolute z-50 text-blue-700 drop-shadow-lg"
      initial={{ ...path[0], opacity: 0, scale: 0.92 }}
      animate={{
        left: cursorPath.map((point) => point.left),
        top: cursorPath.map((point) => point.top),
        opacity: opacityKeyframes,
        scale: scaleKeyframes,
      }}
      transition={{
        delay,
        duration,
        ease: 'easeInOut',
        times: keyframeTimes,
      }}
    >
      <MousePointer2 className="h-6 w-6 fill-white stroke-blue-700 stroke-[2.4]" />
    </motion.div>
  )
}

function AccountScene() {
  const timeline = DEMO_TIMELINE.account

  return (
    <>
      <TopBar crumb="Accounts" />
      <AccountsWorkspace />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{
          times: timeline.modalTimes,
          duration: sec(timeline.modalDurationMs),
        }}
        className="absolute inset-0"
      >
        <Modal title="New Account" icon={Users}>
          <label className="text-sm font-semibold text-slate-700">Account Name</label>
          <div className="mt-2 rounded-lg border-2 border-blue-500 px-3 py-2 text-slate-950">
            <TypewriterText text="Redwood Custom Builders" delay={sec(timeline.typeAccountNameMs)} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Choose a descriptive name to help organize your submissions
          </p>
          <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
            <motion.button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              initial={{ scale: 1 }}
              animate={{ scale: [1, 0.97, 1] }}
              transition={{ delay: sec(timeline.clickCreateAccountMs), duration: 0.28 }}
            >
              Create Account
            </motion.button>
          </div>
        </Modal>
      </motion.div>
      <motion.div
        className="absolute left-12 right-12 top-[154px] rounded-lg border border-slate-200 bg-white px-6 py-6 shadow-sm"
        initial={{ opacity: 0, x: 36, y: 4, scale: 0.985 }}
        animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
        transition={{ delay: sec(timeline.showCreatedAccountMs), duration: 0.55, ease: 'easeOut' }}
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-lg font-bold text-slate-950">Redwood Custom Builders</h4>
            <div className="mt-2 flex items-center gap-4 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Layers3 className="h-4 w-4" />
                2 submissions
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Updated 4/20/2026
              </span>
            </div>
          </div>
          <Trash2 className="h-4 w-4 text-slate-400" />
          <ChevronRight className="h-5 w-5 text-slate-400" />
        </div>
      </motion.div>
      <DemoCursor
        path={timeline.cursorPath}
        times={normalizedTimes(
          timeline.cursorTimesMs,
          lastTimelinePoint(timeline.cursorTimesMs, timeline.durationMs)
        )}
        delay={0.05}
        duration={sec(lastTimelinePoint(timeline.cursorTimesMs, timeline.durationMs))}
      />
    </>
  )
}

function SubmissionScene() {
  const selectedUploadFiles = SUBMISSION_PACKAGE_FILES.slice(0, 7)
  const timeline = DEMO_TIMELINE.submission
  const generateModalDelaySeconds = sec(
    timeline.mergedReviewStartMs + timeline.generateModalAfterReviewMs
  )

  return (
    <>
      <TopBar
        crumb="Redwood Custom Builders"
        parentCrumb="Accounts"
        actions={
          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">New Submission</button>
            <motion.button
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              initial={{ opacity: 1 }}
              animate={{ opacity: [1, 1, 0, 0] }}
              transition={{
                delay: sec(timeline.uploadCompleteMs + 250),
                duration: 0.35,
                times: [0, 0.2, 0.9, 1],
              }}
            >
              Add Files
            </motion.button>
            <span className="relative inline-flex">
              <button className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">
                Generate
              </button>
              <motion.button
                className="absolute inset-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                initial={{ opacity: 0, scale: 1 }}
                animate={{
                  opacity: [0, 0, 1, 1, 1],
                  scale: [1, 1, 1, 0.94, 1],
                  backgroundColor: ['#2563eb', '#2563eb', '#2563eb', '#1d4ed8', '#2563eb'],
                }}
                transition={{
                  duration: sec(21680),
                  times: [0, 0.88, 0.895, 0.982, 1],
                }}
              >
                Generate
              </motion.button>
            </span>
          </div>
        }
      />
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 1 }}
        animate={{ opacity: 1 }}
        transition={{
          delay: sec(timeline.showUploadWorkspaceMs - 350),
          duration: 0.35,
          times: [0, 0.2, 1],
        }}
      >
        <AccountDetailWorkspace />
      </motion.div>
      <motion.div
        className="absolute inset-0 z-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{
          times: timeline.modalTimes,
          duration: sec(timeline.modalDurationMs),
        }}
      >
        <Modal title="New Submission" icon={Plus}>
          <label className="text-sm font-semibold text-slate-700">Submission Name</label>
          <div className="mt-2 rounded-lg border-2 border-blue-500 px-3 py-2 text-slate-950">
            <TypewriterText text={CREATED_SUBMISSION_NAME} delay={sec(timeline.typeSubmissionNameMs)} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Choose a descriptive name to help organize your submissions
          </p>
          <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
            <motion.button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              initial={{ scale: 1 }}
              animate={{ scale: [1, 0.98, 1] }}
              transition={{ delay: sec(timeline.clickCreateSubmissionMs), duration: 0.32 }}
            >
              Create Submission
            </motion.button>
          </div>
        </Modal>
      </motion.div>
      <motion.div
        className="absolute left-12 top-[152px] w-[352px]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: sec(timeline.showUploadWorkspaceMs), duration: 0.5 }}
      >
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <ChevronDown className="h-4 w-4 text-slate-500" />
            <Folder className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-blue-800">{CREATED_SUBMISSION_NAME}</span>
            <motion.span
              className="text-sm text-slate-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: sec(timeline.uploadListStartMs + 50) }}
            >
              {selectedUploadFiles.length} files
            </motion.span>
          </div>
          <motion.div
            className="flex overflow-hidden flex-col items-center justify-center text-center text-slate-500"
            initial={{ opacity: 1, height: 120 }}
            animate={{ opacity: [1, 0, 0], height: [120, 0, 0] }}
            transition={{
              times: [0, 0.72, 1],
              delay: sec(timeline.uploadCollapseStartMs),
              duration: sec(timeline.uploadCollapseDurationMs),
            }}
          >
            <FileText className="mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm">No files in this submission yet</p>
          </motion.div>
          <motion.div
            className="space-y-2"
            initial={{ marginTop: 18 }}
            animate={{ marginTop: [18, 14, 14] }}
            transition={{
              times: [0, 0.72, 1],
              delay: sec(timeline.uploadCollapseStartMs),
              duration: sec(timeline.uploadCollapseDurationMs),
            }}
          >
            {selectedUploadFiles.map(([name, confidence, type], index) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sec(timeline.uploadListStartMs + index * timeline.uploadListStaggerMs) }}
                className="rounded-lg border border-blue-100 bg-white/70 px-2 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center rounded border border-blue-500 bg-blue-600">
                    <CheckCircle className="h-3 w-3 text-white" />
                  </span>
                  {type === 'csv' ? (
                    <span className="text-blue-600">▦</span>
                  ) : (
                    <FileText className="h-4 w-4 text-red-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-950">{name}</p>
                    <p className="text-xs text-slate-500">Confidence: {confidence}</p>
                  </div>
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.div>
      <motion.div
        className="absolute top-20 bottom-4 left-[416px] right-12"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: sec(timeline.showUploadWorkspaceMs), duration: 0.5 }}
      >
          <section className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-slate-500" />
                <h4 className="font-semibold text-slate-800">Upload to {CREATED_SUBMISSION_NAME}</h4>
              </div>
              <motion.button
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
                initial={{ opacity: 1 }}
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{
                  delay: sec(timeline.uploadCompleteMs + 250),
                  duration: 0.35,
                  times: [0, 0.2, 0.9, 1],
                }}
              >
                <Plus className="h-4 w-4" />
                Add Files
              </motion.button>
            </div>
            <motion.div
              className="m-4 flex h-[calc(100%-76px)] min-h-[365px] flex-col rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6"
              animate={{ borderColor: ['rgb(203,213,225)', 'rgb(203,213,225)', 'rgb(37,99,235)', 'rgb(203,213,225)'] }}
              transition={{ delay: sec(timeline.filePickerStartMs + 100), duration: 2.3 }}
            >
              <motion.div
                className="flex flex-1 flex-col items-center justify-center text-center"
                initial={{ opacity: 1, height: 300 }}
                animate={{ opacity: 1, height: 300 }}
                transition={{
                  times: [0, 0.72, 1],
                  delay: sec(timeline.uploadCollapseStartMs),
                  duration: sec(timeline.uploadCollapseDurationMs),
                }}
              >
                <Upload className="mb-4 h-12 w-12 text-slate-300" />
                <p className="font-semibold text-slate-950">Drop files here or click to browse</p>
                <p className="mt-1 text-sm text-slate-500">PDF, Excel, and CSV files are supported</p>
              </motion.div>
              <motion.div
                className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sec(timeline.uploadCompleteMs) }}
              >
                {selectedUploadFiles.length} files added to {CREATED_SUBMISSION_NAME}
              </motion.div>
            </motion.div>
          </section>
      </motion.div>
      <motion.div
        className="absolute inset-0 z-40 bg-slate-950/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          delay: sec(timeline.filePickerStartMs),
          times: timeline.filePickerTimes,
          duration: sec(timeline.filePickerDurationMs),
        }}
      >
        <div className="absolute inset-x-[8%] top-[7%] h-[82%] overflow-hidden rounded-md bg-[#1f1f1f] shadow-2xl ring-1 ring-black/40">
          <div className="grid h-[calc(100%-48px)] grid-cols-[230px_240px_240px_240px_1fr] border-b border-[#343434] text-sm text-slate-100">
            <div className="border-r border-[#343434] p-4">
              {[
                '25 Certificat...surance.pdf',
                '27 Evidence...surance.pdf',
                '28 Evidence...surance.pdf',
                '125 Applicati...Section.pdf',
                '126 Commer...2016-09.pdf',
                '130 Workers...2017-05.pdf',
                '140 Property Section.pdf',
              ].map((name, index) => (
                <motion.div
                  key={name}
                  className="mb-2 flex items-center gap-2"
                  initial={{ backgroundColor: 'rgba(37,99,235,0)' }}
                  animate={{ backgroundColor: index < 7 ? 'rgba(37,99,235,0.22)' : 'rgba(37,99,235,0)' }}
                  transition={{ delay: sec(timeline.filePickerSelectStartMs + index * timeline.filePickerSelectStaggerMs) }}
                >
                  <FileText className="h-3.5 w-3.5 text-red-400" />
                  <span className="truncate">{name}</span>
                </motion.div>
              ))}
              <div className="mt-3 flex items-center gap-2 text-sky-400">
                <Folder className="h-4 w-4" />
                csv
              </div>
              <div className="mt-3 flex items-center gap-2 text-sky-400">
                <Folder className="h-4 w-4" />
                filled
              </div>
            </div>
            <div className="border-r border-[#343434]" />
            <div className="border-r border-[#343434]" />
            <div className="border-r border-[#343434]" />
            <div />
          </div>
          <div className="flex h-12 items-center justify-end gap-2 bg-[#202020] px-4">
            <button className="rounded-md bg-[#575757] px-5 py-1.5 text-sm font-semibold text-white">cancel</button>
            <motion.button
              className="rounded-md bg-[#575757] px-6 py-1.5 text-sm font-semibold text-slate-300"
              animate={{
                backgroundColor: ['#575757', '#2563eb', '#1d4ed8', '#2563eb'],
                color: ['rgb(203,213,225)', 'rgb(255,255,255)', 'rgb(255,255,255)', 'rgb(255,255,255)'],
                scale: [1, 1, 0.96, 1],
              }}
              transition={{
                delay: sec(timeline.filePickerOpenPulseMs),
                duration: 0.85,
                times: [0, 0.35, 0.55, 1],
              }}
            >
              Open
            </motion.button>
          </div>
        </div>
      </motion.div>
      <motion.div
        className="absolute top-20 bottom-4 left-[416px] right-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{
          delay: sec(timeline.processingStartMs),
          times: timeline.processingTimes,
          duration: sec(timeline.processingDurationMs),
        }}
      >
        <section className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h4 className="font-semibold text-slate-950">Preparing merged review data</h4>
            <p className="mt-1 text-sm text-slate-500">Extracting fields, resolving duplicates, and building the review set.</p>
          </div>
          <div className="space-y-4 p-6">
            {[
              ['Extracting document fields', 'Reading ACORD forms, PDFs, and CSV schedules', 0.1],
              ['Normalizing values', 'Converting dates, limits, claims, and property schedules', 0.55],
              ['Merging submission data', 'Selecting primary values and preserving source links', 0.95],
            ].map(([title, description, progress], index) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <motion.span
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"
                    animate={{ rotate: index < 2 ? 360 : 0 }}
                    transition={{ repeat: index < 2 ? Infinity : 0, duration: 1.5, ease: 'linear' }}
                  >
                    {index < 2 ? <Loader2 className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-950">{title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{description}</p>
                  </div>
                  <motion.span
                    className="text-sm font-semibold text-blue-700"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: sec(timeline.processingStartMs + 500 + index * 700) }}
                  >
                    {index === 2 ? 'Ready' : 'Running'}
                  </motion.span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                  <motion.div
                    className="h-full rounded-full bg-blue-600"
                    initial={{ width: '0%' }}
                    animate={{ width: `${Number(progress) * 100}%` }}
                    transition={{ delay: sec(timeline.processingStartMs + 400 + index * 750), duration: 1.25 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </motion.div>
      <motion.div
        className="absolute top-20 bottom-4 left-[416px] right-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: sec(timeline.mergedReviewStartMs), duration: 0.6 }}
      >
        <MergedReviewScene />
      </motion.div>
      <GenerateDocumentsOverlay generateModalDelaySeconds={generateModalDelaySeconds} />
      <DemoCursor
        path={timeline.cursorPath}
        times={normalizedTimes(
          timeline.cursorTimesMs,
          lastTimelinePoint(timeline.cursorTimesMs, timeline.durationMs)
        )}
        delay={0.05}
        duration={sec(lastTimelinePoint(timeline.cursorTimesMs, timeline.durationMs))}
      />
    </>
  )
}

function MergedReviewScene() {
  return (
    <section className="h-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div>
          <h4 className="font-semibold text-slate-950">Merged Review Data</h4>
          <p className="mt-1 text-xs text-slate-500">Review and refine the submission data used for generation.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
          <Pencil className="h-4 w-4" />
          Edit
        </button>
      </div>
      <div className="h-[calc(100%-64px)] overflow-y-auto px-5 py-4 pr-4">
        <MergedSection
          title="Insured Information"
          description="Business entity details and contact information"
          count="1 field"
          fields={[['Insured Name', 'Redwood Custom Builders LLC']]}
        />
        <MergedSection
          title="Policy Information"
          description="Policy identifiers, dates, and basic details"
          count="9 fields"
          fields={[
            ['Policy Number', 'PKG-TEST-2026-001'],
            ['Effective Date', 'May 1, 2026'],
            ['Expiration Date', 'May 1, 2027'],
          ]}
        />
        <MergedSection
          title="Locations & Properties"
          description="Physical locations and property details"
          count="4 fields"
          fields={[
            ['Total Insured Value', '$8,950,000'],
            ['Locations', '3 scheduled properties'],
          ]}
        />
      </div>
    </section>
  )
}

function GenerateDocumentsOverlay({
  generateModalDelaySeconds,
}: {
  generateModalDelaySeconds: number
}) {
  const templates = [
    ['ACORD 125 Commercial Insurance Application', 'ACORD 125 Commercial Insurance Application (2016/09) — fillable PDF template mapped to merged review data.', '18/18'],
    ['ACORD 126 Commercial General Liability Section', 'ACORD 126 Commercial General Liability Section (2016/09) — fillable PDF template mapped to merged review data.', '34/42'],
    ['ACORD 130 Workers Compensation Application', 'Generated from fillable ACORD 130 Workers Compensation Application PDF fields in the merged review set.', '278/479'],
    ['ACORD 140 Property Section', 'Generated from fillable ACORD 140 Property Section PDF fields in the merged review set.', '160/356'],
    ['ACORD 25 Certificate of Liability Insurance', 'ACORD 25 Certificate of Liability Insurance (2025/12) — certificate output generated from merged review data.', '60/60'],
    ['ACORD 27 Evidence of Property Insurance', 'Evidence output generated from property and policy values in the merged review data.', '22/22'],
    ['ACORD 28 Evidence of Commercial Property', 'Commercial property evidence generated from SOV and ACORD property details.', '28/30'],
    ['Statement of Values Schedule', 'Property schedule summary generated from uploaded CSV schedules.', '16/16'],
  ]
  const selectionStartSeconds = generateModalDelaySeconds + 0.55
  const outputStartSeconds = selectionStartSeconds + 2.45

  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30"
      initial={{ opacity: 0, pointerEvents: 'none' }}
      animate={{ opacity: 1, pointerEvents: 'auto' }}
      transition={{ delay: generateModalDelaySeconds, duration: 0.35 }}
    >
      <motion.div
        className="relative w-[560px] overflow-hidden rounded-lg bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: generateModalDelaySeconds + 0.03, duration: 0.3 }}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h4 className="text-lg font-semibold text-slate-950">Generate Documents</h4>
            <p className="mt-1 text-sm text-slate-500">Select templates to fill with your merged data</p>
          </div>
          <X className="h-5 w-5 text-slate-400" />
        </div>
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: outputStartSeconds, duration: 0.2 }}
        >
        <div className="border-b border-slate-200 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <span>Available Templates</span>
              <span className="relative inline-block min-w-[76px] font-normal text-xs text-slate-500">
                <motion.span
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ delay: selectionStartSeconds + 0.45, duration: 0.2 }}
                >
                  0 of 8 selected
                </motion.span>
                <motion.span
                  className="absolute left-0 top-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: selectionStartSeconds + 0.45, duration: 0.2 }}
                >
                  1 of 8 selected
                </motion.span>
              </span>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700">Select all</button>
              <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700">Clear</button>
            </div>
          </div>
        </div>
        <div className="max-h-[330px] space-y-2 overflow-y-auto px-4 py-3 pr-3">
          {templates.map(([title, description, fields], index) => (
            <motion.div
              key={title}
              className="rounded-lg border bg-white px-4 py-3"
              initial={{ borderColor: 'rgb(226,232,240)', backgroundColor: 'rgb(255,255,255)' }}
              animate={{
                borderColor: index === 0 ? 'rgb(191,219,254)' : 'rgb(226,232,240)',
                backgroundColor: index === 0 ? 'rgb(248,250,252)' : 'rgb(255,255,255)',
              }}
              transition={{ delay: index === 0 ? selectionStartSeconds : 0, duration: 0.22 }}
            >
              <div className="flex items-start gap-3">
                <motion.span
                  className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border-2"
                  initial={{
                    borderColor: 'rgb(203,213,225)',
                    backgroundColor: 'rgb(255,255,255)',
                  }}
                  animate={{
                    borderColor: index === 0 ? 'rgb(37,99,235)' : 'rgb(203,213,225)',
                    backgroundColor: index === 0 ? 'rgb(37,99,235)' : 'rgb(255,255,255)',
                  }}
                  transition={{ delay: index === 0 ? selectionStartSeconds : 0, duration: 0.2 }}
                >
                  <motion.span
                    className="text-[12px] font-bold leading-none text-white"
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: index === 0 ? 1 : 0, scale: index === 0 ? 1 : 0.4 }}
                    transition={{ delay: index === 0 ? selectionStartSeconds + 0.08 : 0, duration: 0.16 }}
                  >
                    ✓
                  </motion.span>
                </motion.span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Fields</p>
                      <p className="text-xs font-semibold text-slate-950">{fields}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-blue-100">
                    <motion.div
                      className="h-full rounded-full bg-blue-600"
                      initial={{ width: '0%' }}
                      animate={{ width: `${Math.min(100, 46 + index * 13)}%` }}
                      transition={{ delay: generateModalDelaySeconds + 0.15 + index * 0.08, duration: 0.45 }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <button className="text-xs font-medium text-slate-700">Close</button>
          <motion.button
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white"
            animate={{ scale: [1, 1, 0.94, 1], backgroundColor: ['#2563eb', '#2563eb', '#1d4ed8', '#2563eb'] }}
            transition={{
              delay: outputStartSeconds - 0.52,
              duration: 0.42,
              times: [0, 0.2, 0.55, 1],
            }}
          >
            Generate
          </motion.button>
        </div>
        </motion.div>
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: outputStartSeconds + 0.18, duration: 0.3 }}
        >
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
            <div>
              <h4 className="text-lg font-semibold text-slate-950">Generated Output</h4>
              <p className="mt-1 text-sm text-slate-500">Filled PDF created from the selected template.</p>
            </div>
            <X className="h-5 w-5 text-slate-400" />
          </div>
          <div className="px-5 py-4">
            <div className="mb-3 flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">
                  ACORD_125_Commercial_Insurance_Application_filled.pdf
                </p>
                <p className="mt-0.5 text-xs text-emerald-700">Ready to download</p>
              </div>
              <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
                Download
              </button>
            </div>
            <motion.div
              className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: outputStartSeconds + 0.45, duration: 0.3 }}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">Filled PDF preview</p>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                  Ready
                </span>
              </div>
              <div className="mx-auto h-[300px] w-[420px] max-w-full rounded-sm border border-slate-300 bg-white p-4 shadow-sm">
                <div className="border-b border-slate-900 pb-2 text-center">
                  <p className="text-[10px] font-bold text-slate-950">ACORD 125</p>
                  <p className="text-[9px] font-semibold text-slate-700">
                    COMMERCIAL INSURANCE APPLICATION
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ['Applicant', 'Redwood Custom Builders LLC'],
                    ['Policy', 'PKG-TEST-2026-001'],
                    ['Effective', '05/01/2026'],
                    ['Producer', 'Northstar Risk Partners'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-sm border border-slate-300 p-1.5">
                      <p className="text-[7px] font-bold uppercase text-slate-500">{label}</p>
                      <p className="mt-1 truncate text-[8px] font-semibold text-blue-700">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-[1.2fr_0.8fr] gap-2">
                  {[
                    ['Business description', 'Residential remodeling and finish carpentry'],
                    ['Operations', 'Light commercial tenant improvements'],
                    ['Locations', '3 scheduled properties'],
                    ['Total insured value', '$8,950,000'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-sm border border-slate-300 p-1.5">
                      <p className="text-[7px] font-bold uppercase text-slate-500">{label}</p>
                      <p className="mt-1 truncate text-[8px] font-semibold text-blue-700">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-1.5 rounded-sm border border-slate-300 p-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm border border-blue-600 bg-blue-600" />
                    <span className="text-[8px] font-semibold text-slate-700">Selected coverage sections filled</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-blue-100" />
                  <div className="h-1.5 w-5/6 rounded-full bg-blue-100" />
                  <div className="h-1.5 w-2/3 rounded-full bg-blue-100" />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-300 pt-2">
                  <span className="text-[7px] text-slate-500">Generated from merged data</span>
                  <span className="rounded-sm bg-emerald-100 px-1.5 py-0.5 text-[7px] font-bold text-emerald-700">
                    Filled
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700">
                <CheckCircle className="h-4 w-4" />
                Filled PDF preview generated
              </div>
            </motion.div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <button className="text-xs font-medium text-slate-700">Close</button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white">
              Download PDF
            </button>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function MergedSection({
  title,
  description,
  count,
  fields,
}: {
  title: string
  description: string
  count: string
  fields: Array<[string, string]>
}) {
  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between px-5 py-4">
        <div className="flex items-start gap-3">
          <ChevronDown className="mt-1 h-4 w-4 text-slate-500" />
          <div>
            <h5 className="text-base font-semibold text-slate-950">{title}</h5>
            <p className="mt-1 text-xs text-slate-500">{description}</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{count}</span>
      </div>
      <div className="space-y-2.5 px-5 pb-4">
        {fields.map(([label, value]) => (
          <div key={label}>
            <p className="mb-1.5 text-xs font-medium text-slate-700">{label}</p>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Primary</p>
              <p className="mt-1.5 text-sm font-medium text-slate-950">{value}</p>
              <p className="mt-2 text-xs font-semibold text-blue-700">Open source page 1</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Modal({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45">
      <motion.div
        className="w-[450px] rounded-lg bg-white shadow-2xl"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <Icon className="h-4 w-4" />
            </span>
            <h4 className="text-lg font-semibold text-slate-950">{title}</h4>
          </div>
          <X className="h-5 w-5 text-slate-400" />
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </div>
  )
}

function AccountsWorkspace() {
  return (
    <div className="absolute inset-x-0 top-16 bottom-0 bg-slate-50 px-12 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 text-slate-400">
          <Search className="h-4 w-4" />
          <span className="text-sm text-slate-950">Search accounts by name or ID...</span>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />
          New Account
        </button>
      </div>
    </div>
  )
}

function AccountDetailWorkspace() {
  return (
    <div className="absolute inset-x-0 top-16 bottom-0 bg-slate-50 px-12 py-4">
      <div className="grid h-full grid-cols-[352px_1fr] gap-4">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <span className="text-slate-400">›</span>
            <Folder className="h-4 w-4 text-slate-400" />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">Redwood Custo...</span>
            <span className="text-sm text-slate-400">10 files</span>
          </div>
          <div className="flex min-h-[164px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-500">
            <Folder className="mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium">No submission selected</p>
            <p className="mt-1 text-xs">Create a submission to start uploading files.</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-slate-500" />
              <h4 className="font-semibold text-slate-800">Upload files</h4>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-400">
              <Plus className="h-4 w-4" />
              Add Files
            </button>
          </div>
          <div className="m-4 flex h-[calc(100%-76px)] min-h-[365px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <Upload className="mb-4 h-12 w-12 text-slate-300" />
            <p className="font-semibold text-slate-700">Create a submission first</p>
            <p className="mt-1 text-sm text-slate-500">File upload is available after a submission is created.</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function LegacyDocumentPipelineRail({
  documents,
  currentScene,
}: {
  documents: MockDocument[]
  currentScene: ProcessingScene
}) {
  const stages: { id: ProcessingScene; label: string; accent: string }[] = [
    { id: 'upload', label: 'Client Docs In', accent: 'border-blue-500' },
    { id: 'extract', label: 'Smart Extract', accent: 'border-indigo-500' },
    { id: 'review', label: 'Broker Review', accent: 'border-amber-500' },
    { id: 'process', label: 'Auto-Fill Forms', accent: 'border-emerald-500' },
    { id: 'export', label: 'Export Package', accent: 'border-slate-500' },
  ]

  return (
    <div className="border-b border-slate-200 bg-slate-900/3 px-6 py-4">
      <LayoutGroup id="doc-pipeline">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {stages.map((stage) => {
            const docsInStage = documents.filter(
              (doc) => getStageForStatus(doc.status, currentScene) === stage.id
            )
            const isActive = stage.id === currentScene

            return (
              <div
                key={stage.id}
                className={`min-h-[72px] rounded-xl border px-3 py-3 ${
                  isActive
                    ? `${stage.accent} bg-white shadow-sm`
                    : 'border-slate-200 bg-white/80 shadow-xs'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">{stage.label}</span>
                  <span className="text-[10px] text-slate-500">
                    {docsInStage.length} doc{docsInStage.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-1 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {docsInStage.slice(0, 3).map((doc) => (
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
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                        <p className="truncate text-[11px] text-slate-700">{doc.filename}</p>
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

function LegacyUploadScene({
  documents,
  progress,
}: {
  documents: MockDocument[]
  progress: number
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100"
        >
          <Upload className="h-10 w-10 text-blue-600" />
        </motion.div>
        <h3 className="mb-2 text-2xl font-bold text-slate-900">Upload broker files</h3>
        <p className="text-slate-600">
          Drop ACORDs, loss runs, SOVs, and spreadsheets — AutoFil handles them all.
        </p>
      </div>

      <div className="space-y-3">
        {documents
          .slice(0, Math.max(1, Math.ceil(progress * documents.length)))
          .map((doc, index) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <FileText className="h-8 w-8 text-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{doc.filename}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <motion.div
                      className="h-full rounded-full bg-blue-600"
                      animate={{ width: `${doc.progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-500">
                  {Math.round(doc.progress)}%
                </span>
              </div>
            </motion.div>
          ))}
      </div>
    </div>
  )
}

function LegacyExtractScene({
  documents,
  extractedData,
}: {
  documents: MockDocument[]
  extractedData: MockExtractedData | null
  progress: number
}) {
  return (
    <div className="grid h-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-bold text-slate-900">Document extraction</h3>
        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-xl bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-slate-800">{doc.filename}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  {doc.status === 'extracted' ? 'ready' : 'reading'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <motion.div
                  className="h-full rounded-full bg-indigo-600"
                  animate={{ width: `${doc.progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-bold text-slate-900">Live extracted values</h3>
        {extractedData ? (
          <div className="space-y-4">
            <LegacyField label="Insured name" value={extractedData.insuredName} />
            <LegacyField label="Policy number" value={extractedData.policyNumber} />
            <LegacyField label="Effective date" value={extractedData.effectiveDate} />
            <LegacyField label="Producer" value={extractedData.producerName} />
            <LegacyField
              label="Confidence"
              value={`${extractedData.confidence}%`}
              accent="text-emerald-700"
            />
          </div>
        ) : (
          <div className="flex h-full min-h-[280px] items-center justify-center text-slate-400">
            Waiting for extracted values…
          </div>
        )}
      </div>
    </div>
  )
}

function LegacyReviewScene({
  extractedData,
}: {
  extractedData: MockExtractedData | null
  progress: number
}) {
  return (
    <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Broker review</h3>
          <p className="mt-1 text-slate-500">
            Confirm extracted values before forms are filled.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
          <Pencil className="h-4 w-4" />
          Edit values
        </button>
      </div>

      {extractedData ? (
        <div className="grid gap-4 md:grid-cols-2">
          <LegacyFieldCard label="Insured name" value={extractedData.insuredName} />
          <LegacyFieldCard label="Policy number" value={extractedData.policyNumber} />
          <LegacyFieldCard label="Effective date" value={extractedData.effectiveDate} />
          <LegacyFieldCard label="Mailing address" value={extractedData.mailingAddress} />
          <LegacyFieldCard label="Gross sales" value={extractedData.grossSales.join(' / ')} />
          <LegacyFieldCard label="Deductibles" value={extractedData.deductibles.join(' / ')} />
        </div>
      ) : null}
    </div>
  )
}

function LegacyProcessScene({
  documents,
}: {
  documents: MockDocument[]
  progress: number
}) {
  return (
    <div className="grid h-full gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-bold text-slate-900">Auto-filling carrier forms</h3>
        <div className="space-y-3">
          {documents.map((doc, index) => (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.06 }}
              className="rounded-xl bg-slate-50 p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-slate-800">{doc.filename}</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {doc.status === 'completed' ? 'completed' : 'mapping'}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <motion.div
                  className="h-full rounded-full bg-emerald-600"
                  animate={{ width: `${doc.progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-xl font-bold text-slate-900">Output package status</h3>
        <div className="space-y-4">
          {[
            'Mapped merged review data into ACORD forms',
            'Preserved source links for broker validation',
            'Prepared carrier-ready output package',
          ].map((item, index) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.18 }}
              className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4"
            >
              <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-900">{item}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LegacyExportScene({
  documents,
}: {
  documents: MockDocument[]
  progress: number
}) {
  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"
        >
          <Download className="h-10 w-10 text-emerald-600" />
        </motion.div>
        <h3 className="text-2xl font-bold text-slate-900">Carrier-ready package exported</h3>
        <p className="mt-2 text-slate-500">
          Completed documents are bundled and ready to send.
        </p>
      </div>
      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
              {doc.filename}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              exported
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LegacyField({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-base font-semibold text-slate-950 ${accent ?? ''}`}>{value}</p>
    </div>
  )
}

function LegacyFieldCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}
