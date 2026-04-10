'use client'

import React, { useMemo, useRef, useState } from 'react'
import {
  HelpCircle,
  BookOpen,
  MessageCircle,
  Mail,
  ExternalLink,
  Search,
  FileText,
  Lightbulb,
  Upload,
  FolderKanban,
  Wand2,
  ShieldCheck,
} from 'lucide-react'

interface HelpViewProps {
  onContactSupport?: () => void
}

type ResourceCard = {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName: string
  bgClassName: string
  topics: string[]
}

type HelpArticle = {
  title: string
  category: string
  body: string
}

const RESOURCE_CARDS: ResourceCard[] = [
  {
    title: 'Getting Started',
    description: 'Upload your first document, create an account workspace, and start a submission.',
    icon: Upload,
    iconClassName: 'text-blue-600',
    bgClassName: 'bg-blue-100',
    topics: ['Accounts', 'Documents', 'Workflow'],
  },
  {
    title: 'Submission Workflow',
    description: 'Understand how files, merged data, review, and generation fit together.',
    icon: FolderKanban,
    iconClassName: 'text-emerald-600',
    bgClassName: 'bg-emerald-100',
    topics: ['Workflow', 'Review', 'Accounts'],
  },
  {
    title: 'Generate Outputs',
    description: 'Choose supported templates, preview results, and download generated forms.',
    icon: Wand2,
    iconClassName: 'text-violet-600',
    bgClassName: 'bg-violet-100',
    topics: ['Generation', 'Review'],
  },
  {
    title: 'Data Quality Tips',
    description: 'Use cleaner inputs and review extracted fields before generating outputs.',
    icon: ShieldCheck,
    iconClassName: 'text-amber-600',
    bgClassName: 'bg-amber-100',
    topics: ['Extraction', 'Review', 'Documents'],
  },
]

const HELP_ARTICLES: HelpArticle[] = [
  {
    category: 'Workflow',
    title: 'What is the main AutoFil workflow?',
    body:
      'The intended flow is: upload source documents, review extracted data, refine fields if needed, then generate a supported output form or export from the merged submission data.',
  },
  {
    category: 'Accounts',
    title: 'How should I start a new submission?',
    body:
      'Use New Submission from the dashboard, choose the account workspace, then upload documents directly into that submission. Uploading is intended to happen inside an account/submission context.',
  },
  {
    category: 'Documents',
    title: 'What files can I upload?',
    body:
      'The app currently supports PDF, Excel, and CSV uploads. Structured ACORD PDFs work best when they are fillable or have a clean text layer.',
  },
  {
    category: 'Extraction',
    title: 'How accurate is extraction?',
    body:
      'Accuracy depends on the source file quality and the document type. Fillable ACORD PDFs are usually the strongest case. You should still review extracted fields before generating outputs.',
  },
  {
    category: 'Generation',
    title: 'Why is a template missing from Generate Documents?',
    body:
      'Only templates available through the storage-backed template library should appear in the Generate panel. If a template does not exist in template storage with its matching YAML and PDF, it should not be shown.',
  },
  {
    category: 'Generation',
    title: 'What happens after I click Generate?',
    body:
      'The app fills the selected output template using merged canonical submission data, then returns a previewable artifact when generation succeeds. If a template is unavailable or the fill fails, generation should return an error rather than a usable output.',
  },
  {
    category: 'Review',
    title: 'Should I edit extracted data before generating?',
    body:
      'Yes. Review and update important fields first, especially insured name, carrier, dates, policy numbers, certificate holder, and remarks. The generated output depends on the merged reviewed data.',
  },
  {
    category: 'Support',
    title: 'What is the fastest way to get help?',
    body:
      'Use the support action in the app or email support with the submission id, template id, and a short description of the failure. That makes debugging much faster than a generic screenshot alone.',
  },
]

export function HelpView({ onContactSupport }: HelpViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTopics, setActiveTopics] = useState<string[]>([])
  const knowledgeBaseRef = useRef<HTMLDivElement | null>(null)

  const filteredArticles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return HELP_ARTICLES.filter((article) => {
      const matchesTopics = activeTopics.length === 0 || activeTopics.includes(article.category)
      const matchesQuery =
        !query ||
        `${article.category} ${article.title} ${article.body}`.toLowerCase().includes(query)
      return matchesTopics && matchesQuery
    })
  }, [activeTopics, searchQuery])

  const handleResourceClick = (topics: string[]) => {
    setActiveTopics(topics)
    setSearchQuery('')
    requestAnimationFrame(() => {
      knowledgeBaseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Help & Resource Center</h1>
              <p className="text-sm text-gray-600">
                Guidance for uploading, reviewing, and generating forms from submission data.
              </p>
            </div>
          </div>
          <button
            onClick={onContactSupport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <MessageCircle className="w-4 h-4" />
            Contact Support
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search workflow help, generation issues, or template questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {activeTopics.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {activeTopics.map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 border border-blue-200"
              >
                {topic}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setActiveTopics([])}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear topic filter
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">Core Resources</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {RESOURCE_CARDS.map((card) => {
              const Icon = card.icon
              return (
                <button
                  type="button"
                  key={card.title}
                  onClick={() => handleResourceClick(card.topics)}
                  className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center mb-4 ${card.bgClassName}`}>
                    <Icon className={`w-5 h-5 ${card.iconClassName}`} />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{card.title}</h3>
                  <p className="text-sm text-gray-600">{card.description}</p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div ref={knowledgeBaseRef} className="xl:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Knowledge Base</h2>
            <div className="space-y-4">
              {filteredArticles.length > 0 ? (
                filteredArticles.map((article) => (
                  <div key={`${article.category}-${article.title}`} className="border-b border-gray-200 last:border-0 pb-4 last:pb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                        {article.category}
                      </span>
                    </div>
                    <h3 className="font-medium text-gray-900 mb-2">{article.title}</h3>
                    <p className="text-sm text-gray-600">{article.body}</p>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center">
                  <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-900">No matching help articles</p>
                  <p className="text-sm text-gray-500 mt-1">Try a broader search like “template”, “upload”, or “generate”.</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recommended Workflow</h2>
              <ol className="space-y-3 text-sm text-gray-600">
                <li>
                  <span className="font-medium text-gray-900">1. Create or open an account</span>
                  <div>Use an account as the workspace for submissions and generated outputs.</div>
                </li>
                <li>
                  <span className="font-medium text-gray-900">2. Start a submission</span>
                  <div>Upload source documents into the submission instead of using a generic upload page.</div>
                </li>
                <li>
                  <span className="font-medium text-gray-900">3. Review merged data</span>
                  <div>Check extracted policy, insured, and coverage values before generating.</div>
                </li>
                <li>
                  <span className="font-medium text-gray-900">4. Generate the output</span>
                  <div>Select only storage-backed templates that are available for the submission.</div>
                </li>
              </ol>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Support Channels</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Email Support</h3>
                    <p className="text-sm text-gray-600 mb-1">Best for template failures, generation issues, and reproducible bugs.</p>
                    <a
                      href="mailto:support@autofil.app"
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                    >
                      support@autofil.app
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">In-App Support</h3>
                    <p className="text-sm text-gray-600 mb-1">Use this when you want help while working inside a submission.</p>
                    <button
                      onClick={onContactSupport}
                      className="text-sm text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1"
                    >
                      Start support request
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Useful bug report details</h3>
                  <p className="text-sm text-gray-700">
                    Include the submission id, selected template id, uploaded file names, and the exact error text. That is much more useful than “Generate failed.”
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
