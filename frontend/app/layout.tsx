import './globals.css'
import type { ReactNode } from 'react'
import { Providers } from '@/components/Providers'
import { AuthProvider } from '@/components/AuthProvider'
import { AuthGate } from '@/components/AuthGate'
import { AppShell } from '@/components/AppShell'
import { ToastProvider } from '@/components/Toast'
import { NotificationProvider } from '@/components/Notification'

export const metadata = {
  title: 'Rule Management',
  description: 'Rule Management Studio',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'system';
                  const resolvedTheme = theme === 'system' 
                    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : theme;
                  if (resolvedTheme === 'dark') {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased">
        <Providers>
          <AuthProvider>
            <ToastProvider>
              <NotificationProvider>
                <AuthGate>
                  <AppShell>
                    {children}
                  </AppShell>
                </AuthGate>
              </NotificationProvider>
            </ToastProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}


