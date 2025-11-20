/**
 * HelpView Component
 * COMMIT 2: Placeholder for Help & Support
 */

'use client'

import React, { useState } from 'react'
import { 
  HelpCircle, 
  Book, 
  MessageCircle, 
  Mail, 
  ExternalLink, 
  Search,
  FileText,
  Video,
  Lightbulb
} from 'lucide-react'

interface HelpViewProps {
  onContactSupport?: () => void
}

export function HelpView({ onContactSupport }: HelpViewProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const quickLinks = [
    {
      title: 'Getting Started Guide',
      description: 'Learn the basics of AutoFil',
      icon: Book,
      color: 'blue',
    },
    {
      title: 'Video Tutorials',
      description: 'Watch step-by-step walkthroughs',
      icon: Video,
      color: 'purple',
    },
    {
      title: 'Form Templates',
      description: 'Browse available ACORD forms',
      icon: FileText,
      color: 'green',
    },
    {
      title: 'Best Practices',
      description: 'Tips for optimal results',
      icon: Lightbulb,
      color: 'yellow',
    },
  ]

  const faqs = [
    {
      question: 'How do I upload documents?',
      answer: 'Go to Dashboard and use the upload zone, or drag files directly into the window.',
    },
    {
      question: 'Which ACORD forms are supported?',
      answer: 'Currently supporting ACORD 126, with more forms coming soon.',
    },
    {
      question: 'How accurate is the extraction?',
      answer: 'Our AI achieves 90%+ accuracy on clean documents. You can review and edit before finalizing.',
    },
    {
      question: 'Can I export filled forms?',
      answer: 'Yes, export as PDF or push data to your AMS via API.',
    },
  ]

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Help & Support</h1>
              <p className="text-sm text-gray-600">Get help and learn how to use AutoFil</p>
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

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search help articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Quick Links */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon
              return (
                <button
                  key={link.title}
                  className="bg-white border border-gray-200 rounded-xl p-6 text-left hover:border-blue-500 hover:shadow-md transition-all group"
                >
                  <div className={`w-12 h-12 bg-${link.color}-100 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 text-${link.color}-600`} />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                    {link.title}
                  </h3>
                  <p className="text-sm text-gray-600">{link.description}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* FAQs */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="border-b border-gray-200 last:border-0 pb-4 last:pb-0">
                <h3 className="font-medium text-gray-900 mb-2">{faq.question}</h3>
                <p className="text-sm text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Contact Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Email Support */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Mail className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">Email Support</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Get help via email. We typically respond within 24 hours.
                </p>
                <a
                  href="mailto:support@autofil.app"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                >
                  support@autofil.app
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Live Chat */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-2">Live Chat</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Chat with our support team in real-time.
                </p>
                <button
                  onClick={onContactSupport}
                  className="text-sm text-green-600 hover:text-green-700 font-medium inline-flex items-center gap-1"
                >
                  Start a conversation
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Documentation Link */}
        <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <Book className="w-8 h-8 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2">Full Documentation</h3>
              <p className="text-sm text-gray-700 mb-3">
                Explore our complete documentation with detailed guides, API references, and examples.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                View Documentation
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}