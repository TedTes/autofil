'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
  Plus,
  RefreshCcw,
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

const steps: DemoStep[] = [
  { id: 'account', label: 'Account', icon: Users },
  { id: 'submission', label: 'Submission', icon: Plus },
]

const sceneDurations: Record<DemoScene, number> = {
  account: 6200,
  submission: 22000,
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
  return (
    <>
      <TopBar crumb="Accounts" />
      <AccountsWorkspace />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{ times: [0, 0.1, 0.16, 0.76, 1], duration: 4.8 }}
        className="absolute inset-0"
      >
        <Modal title="New Account" icon={Users}>
          <label className="text-sm font-semibold text-slate-700">Account Name</label>
          <div className="mt-2 rounded-lg border-2 border-blue-500 px-3 py-2 text-slate-950">
            <TypewriterText text="Redwood Custom Builders" delay={0.75} />
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
              transition={{ delay: 3.35, duration: 0.28 }}
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
        transition={{ delay: 5.05, duration: 0.55, ease: 'easeOut' }}
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
        path={[
          { left: '86%', top: '18%' },
          { left: '86%', top: '18%' },
          { left: '57%', top: '48%' },
          { left: '64%', top: '63%' },
          { left: '64%', top: '63%' },
          { left: '27%', top: '35%' },
        ]}
        times={[0, 0.12, 0.34, 0.58, 0.68, 1]}
        delay={0.05}
        duration={5.2}
      />
    </>
  )
}

function SubmissionScene() {
  const selectedUploadFiles: DemoUploadFile[] = [
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

  return (
    <>
      <TopBar
        crumb="Redwood Custom Builders"
        parentCrumb="Accounts"
        actions={
          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">New Submission</button>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Add Files</button>
            <button className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">Generate</button>
          </div>
        }
      />
      <AccountDetailWorkspace />
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 1, 0] }}
        transition={{ times: [0, 0.16, 0.22, 0.78, 1], duration: 6.2 }}
      >
        <Modal title="New Submission" icon={Plus}>
          <label className="text-sm font-semibold text-slate-700">Submission Name</label>
          <div className="mt-2 rounded-lg border-2 border-blue-500 px-3 py-2 text-slate-950">
            <TypewriterText text="Redwood renewal" delay={1.45} />
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
              transition={{ delay: 4.5, duration: 0.32 }}
            >
              Create Submission
            </motion.button>
          </div>
        </Modal>
      </motion.div>
      <motion.div
        className="absolute inset-x-0 top-16 bottom-0 bg-slate-50 px-12 py-4"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 6.0, duration: 0.5 }}
      >
        <div className="grid h-full grid-cols-[352px_1fr] gap-4">
          <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <span className="text-slate-400">›</span>
              <Folder className="h-4 w-4 text-slate-400" />
              <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">Redwood Custo...</span>
              <span className="text-sm text-slate-400">10 files</span>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <ChevronDown className="h-4 w-4 text-slate-500" />
                <Folder className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-blue-800">Submission 2</span>
                <motion.span
                  className="text-sm text-slate-400"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 11.2 }}
                >
                  10 files
                </motion.span>
              </div>
              <motion.div
                className="flex overflow-hidden flex-col items-center justify-center text-center text-slate-500"
                initial={{ opacity: 1, height: 120 }}
                animate={{ opacity: [1, 0, 0], height: [120, 0, 0] }}
                transition={{ times: [0, 0.72, 1], delay: 9.65, duration: 2.6 }}
              >
                <FileText className="mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm">No files in this submission yet</p>
              </motion.div>
              <motion.div
                className="mt-3 space-y-2"
                initial={{ marginTop: 12 }}
                animate={{ marginTop: [12, 0, 0] }}
                transition={{ times: [0, 0.72, 1], delay: 9.65, duration: 2.6 }}
              >
                {selectedUploadFiles.map(([name, confidence, type], index) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 11.15 + index * 0.08 }}
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
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-slate-500" />
                <h4 className="font-semibold text-slate-800">Upload to Submission 2</h4>
              </div>
              <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
                <Plus className="h-4 w-4" />
                Add Files
              </button>
            </div>
            <motion.div
              className="m-4 flex h-[calc(100%-76px)] min-h-[365px] flex-col rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6"
              animate={{ borderColor: ['rgb(203,213,225)', 'rgb(203,213,225)', 'rgb(37,99,235)', 'rgb(203,213,225)'] }}
              transition={{ delay: 7.15, duration: 2.3 }}
            >
              <motion.div
                className="flex overflow-hidden flex-col items-center justify-center text-center"
                initial={{ opacity: 1, height: 300 }}
                animate={{ opacity: [1, 0, 0], height: [300, 0, 0] }}
                transition={{ times: [0, 0.72, 1], delay: 9.65, duration: 2.6 }}
              >
                <Upload className="mb-4 h-12 w-12 text-slate-300" />
                <p className="font-semibold text-slate-950">Drop files here or click to browse</p>
                <p className="mt-1 text-sm text-slate-500">PDF, Excel, and CSV files are supported</p>
              </motion.div>
              <motion.div
                className="min-h-0 overflow-hidden"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 11.15, duration: 0.35 }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Uploading selected files</p>
                  <span className="text-xs font-semibold text-blue-700">10 files</span>
                </div>
                <div className="space-y-2">
                  {selectedUploadFiles.slice(0, 7).map(([name, , type], index) => (
                    <motion.div
                      key={name}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 11.25 + index * 0.08 }}
                    >
                      <div className="flex items-center gap-2">
                        {type === 'csv' ? (
                          <span className="text-blue-600">▦</span>
                        ) : (
                          <FileText className="h-4 w-4 text-red-500" />
                        )}
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{name}</p>
                        <motion.span
                          className="text-xs font-semibold text-emerald-700"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 12.0 + index * 0.08 }}
                        >
                          Done
                        </motion.span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
                        <motion.div
                          className="h-full rounded-full bg-blue-600"
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ delay: 11.35 + index * 0.08, duration: 0.75 }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
              <motion.div
                className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 13.0 }}
              >
                10 files added to Submission 2
              </motion.div>
            </motion.div>
          </section>
        </div>
      </motion.div>
      <motion.div
        className="absolute inset-0 z-40 bg-slate-950/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ delay: 7.05, times: [0, 0.1, 0.84, 1], duration: 3.2 }}
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
                  transition={{ delay: 7.7 + index * 0.08 }}
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
              animate={{ backgroundColor: ['#575757', '#2563eb', '#2563eb'] }}
              transition={{ delay: 9.2, duration: 0.7 }}
            >
              Open
            </motion.button>
          </div>
        </div>
      </motion.div>
      <motion.div
        className="absolute inset-x-0 top-16 bottom-0 z-30 bg-slate-50 px-12 py-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ delay: 13.8, times: [0, 0.16, 0.82, 1], duration: 4.3 }}
      >
        <div className="grid h-full grid-cols-[352px_1fr] gap-4">
          <UploadedInputFilesPanel files={selectedUploadFiles} />
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
                      transition={{ delay: 14.3 + index * 0.7 }}
                    >
                      {index === 2 ? 'Ready' : 'Running'}
                    </motion.span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                    <motion.div
                      className="h-full rounded-full bg-blue-600"
                      initial={{ width: '0%' }}
                      animate={{ width: `${Number(progress) * 100}%` }}
                      transition={{ delay: 14.2 + index * 0.75, duration: 1.25 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </motion.div>
      <motion.div
        className="absolute inset-0 z-40 bg-slate-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 17.75, duration: 0.6 }}
      >
        <MergedReviewScene files={selectedUploadFiles} />
      </motion.div>
      <DemoCursor
        path={[
          { left: '34%', top: '35%' },
          { left: '57%', top: '5.5%' },
          { left: '57%', top: '5.5%' },
          { left: '58%', top: '51%' },
          { left: '64%', top: '63%' },
          { left: '64%', top: '63%' },
          { left: '87%', top: '17%' },
          { left: '87%', top: '17%' },
          { left: '23%', top: '27%' },
          { left: '93%', top: '90%' },
          { left: '73%', top: '56%' },
          { left: '73%', top: '56%' },
          { left: '72%', top: '35%' },
          { left: '72%', top: '48%' },
          { left: '76%', top: '5.5%' },
          { left: '76%', top: '5.5%' },
          { left: '11%', top: '22%' },
        ]}
        times={[
          0,
          0.035,
          0.09,
          0.18,
          0.235,
          0.265,
          0.36,
          0.385,
          0.425,
          0.5,
          0.61,
          0.68,
          0.76,
          0.84,
          0.945,
          0.97,
          1,
        ]}
        delay={0.05}
        duration={19.4}
      />
    </>
  )
}

function UploadedInputFilesPanel({ files }: { files: DemoUploadFile[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <ChevronDown className="h-4 w-4 text-slate-500" />
        <Folder className="h-4 w-4 text-blue-600" />
        <span className="min-w-0 flex-1 truncate font-semibold text-blue-800">Redwood Custo...</span>
        <span className="text-sm text-slate-400">10 files</span>
      </div>
      <div className="px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Input Files (10)</p>
          <span className="inline-flex items-center gap-1 text-sm text-slate-600">
            <span className="flex h-4 w-4 items-center justify-center rounded border border-blue-500 bg-blue-600">
              <CheckCircle className="h-3 w-3 text-white" />
            </span>
            All
          </span>
        </div>
        <div className="space-y-2">
          {files.map(([name, confidence, type]) => (
            <div key={name} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
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
                <Trash2 className="h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">›</span>
          <Folder className="h-4 w-4 text-slate-400" />
          <span className="font-semibold text-slate-800">Submission 2</span>
        </div>
      </div>
    </section>
  )
}

function MergedReviewScene({ files }: { files: DemoUploadFile[] }) {
  const templates = [
    ['ACORD 125 Commercial Insurance Application', 'ACORD 125 Commercial Insurance Application (2016/09) — fillable PDF template mapped to merged review data.', '18/18'],
    ['ACORD 126 Commercial General Liability Section', 'ACORD 126 Commercial General Liability Section (2016/09) — fillable PDF template mapped to merged review data.', '34/42'],
    ['ACORD 130 Workers Compensation Application', 'Generated from fillable ACORD 130 Workers Compensation Application PDF fields in the merged review set.', '278/479'],
    ['ACORD 140 Property Section', 'Generated from fillable ACORD 140 Property Section PDF fields in the merged review set.', '160/356'],
    ['ACORD 25 Certificate of Liability Insurance', 'ACORD 25 Certificate of Liability Insurance (2025/12) — certificate output generated from merged review data.', '60/60'],
  ]

  return (
    <>
      <TopBar
        crumb="Redwood Custom Builders"
        parentCrumb="Accounts"
        actions={
          <div className="flex gap-2">
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">New Submission</button>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Add Files</button>
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Generate</button>
          </div>
        }
      />
      <div className="absolute inset-x-0 top-16 bottom-0 grid grid-cols-[360px_1fr] gap-4 bg-slate-50 px-12 py-4">
        <UploadedInputFilesPanel files={files} />
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div>
              <h4 className="font-semibold text-slate-950">Merged Review Data</h4>
              <p className="mt-1 text-sm text-slate-500">Review and refine the submission data used for generation.</p>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          </div>
          <div className="h-[calc(100%-68px)] overflow-hidden px-6 py-5">
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
      </div>
      <motion.div
        className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.05, duration: 0.35 }}
      >
        <motion.div
          className="w-[680px] overflow-hidden rounded-lg bg-white shadow-2xl"
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 1.08, duration: 0.3 }}
        >
          <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h4 className="text-2xl font-semibold text-slate-950">Generate Documents</h4>
              <p className="mt-1 text-base text-slate-500">Select templates to fill with your merged data</p>
            </div>
            <X className="h-6 w-6 text-slate-400" />
          </div>
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <span>Available Templates</span>
                <span className="font-normal text-base text-slate-500">0 of 8 selected</span>
              </div>
              <div className="flex gap-3">
                <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">Select all</button>
                <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">Clear</button>
              </div>
            </div>
          </div>
          <div className="space-y-3 px-5 py-4">
            {templates.map(([title, description, fields], index) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white px-5 py-4">
                <div className="flex items-start gap-4">
                  <span className="mt-1 h-6 w-6 rounded-md border-2 border-slate-300 bg-white" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-semibold text-slate-950">{title}</p>
                        <p className="mt-1 truncate text-[15px] text-slate-500">{description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500">Fields</p>
                        <p className="text-[15px] font-semibold text-slate-950">{fields}</p>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-blue-100">
                      <motion.div
                        className="h-full rounded-full bg-blue-600"
                        initial={{ width: '0%' }}
                        animate={{ width: `${Math.min(100, 46 + index * 13)}%` }}
                        transition={{ delay: 1.2 + index * 0.08, duration: 0.45 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-200 px-6 py-4 text-sm text-slate-700">Close</div>
        </motion.div>
      </motion.div>
    </>
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
    <div className="mb-4 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between px-6 py-5">
        <div className="flex items-start gap-3">
          <ChevronDown className="mt-1 h-4 w-4 text-slate-500" />
          <div>
            <h5 className="text-xl font-bold text-slate-950">{title}</h5>
            <p className="mt-1 text-slate-500">{description}</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">{count}</span>
      </div>
      <div className="space-y-3 px-5 pb-5">
        {fields.map(([label, value]) => (
          <div key={label}>
            <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Primary</p>
              <p className="mt-2 font-medium text-slate-950">{value}</p>
              <p className="mt-3 text-sm font-semibold text-blue-700">Open source page 1</p>
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
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4 shadow-sm">
            <div className="flex items-center gap-3">
              <ChevronDown className="h-4 w-4 text-slate-500" />
              <Folder className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-blue-800">Submission 2</span>
            </div>
            <div className="flex min-h-[132px] flex-col items-center justify-center text-center text-slate-500">
              <FileText className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm">No files in this submission yet</p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-slate-500" />
              <h4 className="font-semibold text-slate-800">Upload to Submission 2</h4>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" />
              Add Files
            </button>
          </div>
          <div className="m-4 flex h-[calc(100%-76px)] min-h-[365px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <Upload className="mb-4 h-12 w-12 text-slate-300" />
            <p className="font-semibold text-slate-950">Drop files here or click to browse</p>
            <p className="mt-1 text-sm text-slate-500">PDF, Excel, and CSV files are supported</p>
          </div>
        </section>
      </div>
    </div>
  )
}
