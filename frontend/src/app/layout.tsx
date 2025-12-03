import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/contexts/ToastContext'
import { FieldCatalogProvider } from '@/contexts/FieldCatalogContext'
import ToastContainer from '@/components/ToastContainer'
import BackendStatusBanner from '@/components/BackendStatusBanner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AutoFil - ACORD Form Filler',
  description: 'Automated ACORD form filling application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <FieldCatalogProvider>
          <ToastProvider>
            <div className="min-h-screen">
              {children}
            </div>
            <ToastContainer />
          </ToastProvider>
        </FieldCatalogProvider>
      </body>
    </html>
  )
}
