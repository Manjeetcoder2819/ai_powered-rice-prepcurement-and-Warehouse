import type { Metadata } from 'next'
import '@/styles/globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'Smart Rice – Procurement & Warehouse Management',
  description: 'Offline AI-Powered Rice Procurement System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ height: '100vh', overflow: 'hidden' }}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '13px',
              borderRadius: '8px',
              fontWeight: 500,
            },
          }}
        />
      </body>
    </html>
  )
}
