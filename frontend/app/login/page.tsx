"use client"

import { FormEvent, useState } from 'react'
import { Mail, Lock, Shield, User, AlertCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'

export default function LoginPage() {
  const { login, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      await login(email, password)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surfaceContainer via-surfaceContainerHigh to-surfaceContainer p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-5xl">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Left side - Login Form */}
          <div className="w-full">
            <div className="bg-surface rounded-xl shadow-card border border-border p-8 lg:p-10">
              {/* Logo/Brand Section */}
              <div className="mb-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary-bg mb-4">
                  <Shield className="w-8 h-8 text-primary" />
                </div>
                <h1 className="page-title mb-2">Welcome back</h1>
                <p className="text-body text-text-tertiary">Sign in to Rule Management Studio</p>
              </div>

              {/* Form */}
              <form className="space-y-5" onSubmit={handleSubmit}>
                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-text-muted" />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 rounded-lg border border-border bg-surface focus:border-primary focus:ring-2 focus:ring-primary/10 transition-smooth text-text-primary placeholder:text-text-muted"
                      placeholder="rule.admin@local"
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-text-muted" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-3 py-3 rounded-lg border border-border bg-surface focus:border-primary focus:ring-2 focus:ring-primary/10 transition-smooth text-text-primary placeholder:text-text-muted"
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {/* Error Message */}
                {(formError || error) && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-error-bg border border-error/20" role="alert">
                    <AlertCircle className="h-5 w-5 text-error flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-error">{formError || error}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg bg-primary text-white font-medium hover:bg-primary-light disabled:opacity-60 disabled:cursor-not-allowed transition-smooth shadow-sm cursor-pointer flex items-center justify-center gap-2"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right side - Test Users Info */}
          <div className="w-full hidden lg:block">
            <div className="bg-surface rounded-xl shadow-card border border-border p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-accent-bg">
                  <User className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h2 className="h4 text-text-primary">Test Accounts</h2>
                  <p className="text-body-sm text-text-tertiary">For development and staging</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                {/* Administrator Account */}
                <div className="rounded-lg border border-border bg-surfaceContainerHigh p-4 hover:bg-surfaceContainerHighest transition-smooth cursor-pointer group">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-primary-bg group-hover:bg-primary-bg/80 transition-smooth">
                        <Shield className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Administrator</p>
                        <p className="text-sm font-semibold text-text-primary mt-0.5">Full Access</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-text-muted" />
                      <code className="text-xs font-mono text-text-primary bg-surface px-2 py-1 rounded">rule.admin@local</code>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Lock className="h-4 w-4 text-text-muted" />
                      <code className="text-xs font-mono text-text-secondary bg-surface px-2 py-1 rounded">ChangeMe123!</code>
                    </div>
                  </div>
                  <p className="text-xs text-text-tertiary mt-2">Complete access to all rule operations and system settings.</p>
                </div>

                {/* Editor Account */}
                <div className="rounded-lg border border-border bg-surfaceContainerHigh p-4 hover:bg-surfaceContainerHighest transition-smooth cursor-pointer group">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-secondary-bg group-hover:bg-secondary-bg/80 transition-smooth">
                        <User className="h-4 w-4 text-secondary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Editor</p>
                        <p className="text-sm font-semibold text-text-primary mt-0.5">Limited Access</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-text-muted" />
                      <code className="text-xs font-mono text-text-primary bg-surface px-2 py-1 rounded">rule.editor@local</code>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Lock className="h-4 w-4 text-text-muted" />
                      <code className="text-xs font-mono text-text-secondary bg-surface px-2 py-1 rounded">ChangeMe123!</code>
                    </div>
                  </div>
                  <p className="text-xs text-text-tertiary mt-2">Edit rules but limited administrative controls.</p>
                </div>
              </div>

              {/* Security Notice */}
              <div className="rounded-lg border border-warning/20 bg-warning-bg/30 p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-warning mb-1">Security Notice</p>
                    <p className="text-xs text-text-tertiary">
                      These are default test credentials. Update <code className="px-1 py-0.5 rounded bg-surface text-text-primary text-[10px]">AUTH_BOOTSTRAP_*</code> environment variables before deploying to production.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Test Users Section */}
          <div className="w-full lg:hidden mt-6">
            <details className="bg-surface rounded-xl shadow-card border border-border overflow-hidden">
              <summary className="p-4 cursor-pointer flex items-center justify-between text-sm font-medium text-text-secondary hover:text-text-primary transition-smooth">
                <span>View test accounts</span>
                <User className="h-5 w-5" />
              </summary>
              <div className="p-4 pt-0 space-y-3 border-t border-border mt-4">
                <div className="rounded-lg border border-border bg-surfaceContainerHigh p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Administrator</p>
                  <p className="text-sm font-semibold text-text-primary mb-1">rule.admin@local</p>
                  <p className="text-xs font-mono text-text-secondary">ChangeMe123!</p>
                </div>
                <div className="rounded-lg border border-border bg-surfaceContainerHigh p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Editor</p>
                  <p className="text-sm font-semibold text-text-primary mb-1">rule.editor@local</p>
                  <p className="text-xs font-mono text-text-secondary">ChangeMe123!</p>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}


