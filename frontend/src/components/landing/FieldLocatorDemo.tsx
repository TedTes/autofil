'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Download, Edit3, MousePointer2, ZoomIn } from 'lucide-react'

const cursorPath = [
  { left: '86%', top: '42%' },
  { left: '86%', top: '42%' },
  { left: '86%', top: '42%' },
  { left: '86%', top: '42%' },
  { left: '86%', top: '54%' },
  { left: '86%', top: '54%' },
  { left: '86%', top: '54%' },
  { left: '86%', top: '54%' },
]

const cursorTimes = [0, 0.12, 0.26, 0.42, 0.56, 0.68, 0.82, 1]

export default function FieldLocatorDemo() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <section className="bg-white py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl sm:mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">
            Source trace
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Click a value. Jump to the source field.
          </h2>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">
            Review extracted values with the source PDF beside them. Every key field keeps a link back to its exact location.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl shadow-slate-200/60">
          <div className="relative min-h-[620px] overflow-hidden bg-white lg:min-h-[680px]">
            <div className="grid min-h-[620px] grid-cols-1 lg:min-h-[680px] lg:grid-cols-[1.02fr_0.98fr]">
              <PdfPane />
              <ExtractedDataPane />
            </div>

            {!prefersReducedMotion && (
              <motion.div
                className="pointer-events-none absolute z-30 text-blue-700 drop-shadow-lg"
                initial={{ ...cursorPath[0], opacity: 0, scale: 0.95 }}
                animate={{
                  left: cursorPath.map((point) => point.left),
                  top: cursorPath.map((point) => point.top),
                  opacity: [0, 1, 1, 1, 1, 1, 1, 0],
                  scale: [0.95, 1, 1, 0.94, 1, 1, 0.94, 0.95],
                }}
                transition={{
                  duration: 8.5,
                  repeat: Infinity,
                  repeatDelay: 1.1,
                  ease: 'easeInOut',
                  times: cursorTimes,
                }}
              >
                <MousePointer2 className="h-7 w-7 fill-white stroke-blue-700 stroke-[2.4]" />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function PdfPane() {
  return (
    <div className="relative min-h-[420px] border-b border-slate-200 bg-slate-100 lg:min-h-0 lg:border-b-0 lg:border-r">
      <div className="flex h-12 items-center gap-3 bg-slate-900 px-4 text-sm text-white">
        <span className="max-w-[210px] truncate font-semibold">acord_28_test_filled.pdf</span>
        <span className="text-slate-300">Page 1 of 1</span>
        <span className="ml-auto inline-flex items-center gap-2 text-slate-300">
          <ZoomIn className="h-4 w-4" />
          100%
        </span>
        <Download className="h-4 w-4 text-slate-300" />
      </div>

      <div className="relative h-[calc(100%-48px)] overflow-hidden p-4 sm:p-6">
        <div className="relative mx-auto h-full min-h-[350px] max-w-[520px] bg-white shadow-sm ring-1 ring-slate-200">
          <PdfMock />
          <SourceHighlight className="left-[63%] top-[31.5%] h-[3.2%] w-[24%]" delay={2.25} />
          <SourceHighlight className="left-[25%] top-[35.4%] h-[3.2%] w-[14%]" delay={7} />
        </div>
      </div>
    </div>
  )
}

function ExtractedDataPane() {
  return (
    <div className="relative bg-white p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-950">Extracted Data</h3>
          <p className="mt-1 text-sm text-slate-600">
            Review the extracted information or click Edit to make changes.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
          <Edit3 className="h-4 w-4" />
          Edit
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Overall Extraction Confidence</span>
          <span className="font-semibold text-emerald-700">80%</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
          <div className="h-full w-4/5 rounded-full bg-emerald-500" />
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h4 className="font-semibold text-slate-950">Policy</h4>
            <p className="text-sm text-slate-500">Policy identifiers, dates and basic details</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </div>
        <div className="space-y-4 p-4">
          <LocatorField label="Policy Number" value="PKG-TEST-2026-001" delay={0.95} />
          <LocatorField label="Effective Date" value="05/01/2026" delay={5.05} />
          <LocatorField label="Expiration Date" value="05/01/2027" />
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h4 className="font-semibold text-slate-950">Locations</h4>
            <p className="text-sm text-slate-500">Physical locations and property details</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </div>
        <div className="space-y-4 p-4">
          <LocatorField label="Total Insured Value" value="2,600,000" />
        </div>
      </section>
    </div>
  )
}

function LocatorField({
  label,
  value,
  delay,
}: {
  label: string
  value: string
  delay?: number
}) {
  return (
    <motion.div
      className="rounded-lg border border-transparent bg-slate-50 px-3 py-3"
      animate={
        delay === undefined
          ? undefined
          : {
              borderColor: [
                'rgba(59,130,246,0)',
                'rgba(59,130,246,0)',
                'rgba(59,130,246,1)',
                'rgba(59,130,246,1)',
                'rgba(59,130,246,0)',
              ],
              backgroundColor: [
                'rgb(248,250,252)',
                'rgb(248,250,252)',
                'rgb(239,246,255)',
                'rgb(239,246,255)',
                'rgb(248,250,252)',
              ],
            }
      }
      transition={
        delay === undefined
          ? undefined
          : {
              delay,
              duration: 2.2,
              repeat: Infinity,
              repeatDelay: 7.4,
              times: [0, 0.08, 0.2, 0.75, 1],
            }
      }
    >
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-2 text-base font-medium text-slate-950">{value}</p>
    </motion.div>
  )
}

function SourceHighlight({ className, delay }: { className: string; delay: number }) {
  return (
    <motion.div
      className={`absolute rounded-sm border-2 border-blue-500 bg-blue-500/10 ${className}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{
        opacity: [0, 0, 1, 1, 0],
        scale: [0.98, 0.98, 1.05, 1, 1],
        boxShadow: [
          '0 0 0 0 rgba(37,99,235,0)',
          '0 0 0 0 rgba(37,99,235,0)',
          '0 0 0 7px rgba(37,99,235,0.18)',
          '0 0 0 2px rgba(37,99,235,0.08)',
          '0 0 0 0 rgba(37,99,235,0)',
        ],
      }}
      transition={{
        delay,
        duration: 2.2,
        repeat: Infinity,
        repeatDelay: 7.4,
        times: [0, 0.08, 0.24, 0.78, 1],
      }}
    />
  )
}

function PdfMock() {
  return (
    <div className="absolute inset-0 p-4 text-[6px] text-black sm:text-[7px]">
      <div className="mb-2 flex items-end justify-between border-b border-black pb-1">
        <div className="text-[12px] font-black italic">ACORD</div>
        <div className="text-center text-[11px] font-black">EVIDENCE OF COMMERCIAL PROPERTY INSURANCE</div>
        <div className="border border-black px-4 py-1 text-[5px]">DATE</div>
      </div>
      <div className="grid grid-cols-2 border border-black">
        {[
          ['PRODUCER', 'Northstar Risk Partners\n100 King Street'],
          ['COMPANY NAME AND ADDRESS', 'Test Mutual Insurance Co.\n200 Carrier Plaza'],
          ['INSURED', 'Redwood Custom Builders LLC\n425 Market Street'],
          ['LOAN NUMBER', 'TEST-001'],
        ].map(([head, body]) => (
          <div key={head} className="min-h-12 border-b border-r border-black p-1 last:border-r-0">
            <p className="font-black">{head}</p>
            <p className="whitespace-pre-line">{body}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr] border-x border-b border-black">
        <div className="border-r border-black p-1">
          <p className="font-black">POLICY TYPE</p>
          <p>Commercial Package Policy</p>
        </div>
        <div className="border-r border-black p-1">
          <p className="font-black">POLICY NUMBER</p>
          <p>PKG-TEST-2026-001</p>
        </div>
        <div className="p-1">
          <p className="font-black">EFFECTIVE / EXPIRATION</p>
          <p>05/01/2026 - 05/01/2027</p>
        </div>
      </div>
      <div className="mt-3 border border-black">
        <p className="border-b border-black bg-slate-100 p-1 text-center font-black">COVERAGE INFORMATION</p>
        {Array.from({ length: 13 }).map((_, row) => (
          <div key={row} className="grid grid-cols-[1.4fr_0.5fr_0.7fr_0.7fr_0.7fr] border-b border-black last:border-b-0">
            {['Commercial Property', '$2,250,000', 'YES', '$5,000', '$1,000,000'].map((cell, index) => (
              <span key={`${row}-${index}`} className="border-r border-black px-1 py-0.5 last:border-r-0">
                {row === 0 ? cell : row % 3 === index % 3 ? cell : ''}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="h-6 border border-black" />
        ))}
      </div>
    </div>
  )
}
