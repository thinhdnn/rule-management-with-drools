import './globals.css'
import type { ReactNode } from 'react'
import { Providers } from '@/components/Providers'
import { AuthProvider } from '@/components/AuthProvider'
import { AuthGate } from '@/components/AuthGate'
import { AppShell } from '@/components/AppShell'

export const metadata = {
  title: 'Rule Management',
  description: 'Rule Management Studio',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <AuthProvider>
            <AuthGate>
              <AppShell>
                {children}
              </AppShell>
            </AuthGate>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  )
}


