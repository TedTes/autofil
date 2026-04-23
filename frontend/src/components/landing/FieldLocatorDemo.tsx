'use client'

import { CheckCircle2, FileSearch, MousePointer2, ShieldCheck } from 'lucide-react'

const demoHighlights = [
  'Extracted values stay visible beside the document',
  'Selecting a value moves attention to the matching PDF field',
  'Reviewers can confirm source context before approving data',
]

export default function FieldLocatorDemo() {
  return (
    <section className="bg-white py-14 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-600">
              Source trace
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Click extracted data and see where it came from.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg lg:justify-self-end">
            The review screen keeps the PDF and extracted field values together, so a broker can validate each value against the original form before generating outputs.
          </p>
        </div>

        <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/70 lg:grid-cols-[1fr_310px]">
          <div className="bg-slate-950 p-2 sm:p-3">
            <div className="overflow-hidden rounded-md border border-white/10 bg-slate-900">
              <div className="flex h-10 items-center gap-2 border-b border-white/10 px-3">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-amber-300" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="ml-3 truncate text-xs font-medium text-slate-300">
                  ACORD field selection review
                </span>
              </div>
              <video
                className="aspect-video w-full bg-slate-950 object-contain"
                src="/landing/assets/field_selection_demo.mov"
                autoPlay
                loop
                muted
                playsInline
                controls
                preload="metadata"
                aria-label="Field selection demo showing extracted values linked to source PDF fields"
              />
            </div>
          </div>

          <aside className="border-t border-slate-200 bg-slate-50 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
              <FileSearch className="h-4 w-4" />
              Source-backed review
            </div>

            <div className="space-y-3">
              {demoHighlights.map((item) => (
                <div key={item} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p className="text-sm font-medium leading-6 text-slate-700">{item}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <MousePointer2 className="mb-3 h-5 w-5 text-blue-600" />
                <p className="text-2xl font-bold text-slate-950">1-click</p>
                <p className="mt-1 text-sm text-slate-500">field lookup</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-emerald-600" />
                <p className="text-2xl font-bold text-slate-950">Traceable</p>
                <p className="mt-1 text-sm text-slate-500">data review</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
