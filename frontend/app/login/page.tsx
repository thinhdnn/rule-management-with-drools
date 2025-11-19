"use client"

import { FormEvent, useState } from 'react'
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
    <div className="min-h-screen flex items-center justify-center bg-surfaceContainer">
      <div className="w-full max-w-xl p-8 bg-white rounded-2xl shadow-lg border border-slate-100 space-y-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Sign in to Rule Studio</h1>
          <p className="text-sm text-slate-500">Use your admin credentials</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="rule.admin@local"
                  required
                />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="ChangeMe123!"
                  required
                />
              </label>
            </div>
            {(formError || error) && (
              <p className="text-sm text-red-600" role="alert">
                {formError || error}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Test users</p>
            <p className="text-xs text-slate-500 mb-3">Use these accounts in development/staging only.</p>
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Rule Administrator</p>
                <p className="font-semibold">rule.admin@local</p>
                <p className="font-mono text-xs">password: ChangeMe123!</p>
                <p className="text-xs text-slate-500 mt-1">Full access to all rule operations.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Rule Editor</p>
                <p className="font-semibold">rule.editor@local</p>
                <p className="font-mono text-xs">password: ChangeMe123!</p>
                <p className="text-xs text-slate-500 mt-1">Edit rights but limited administrative controls.</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Update <code>AUTH_BOOTSTRAP_*</code> env vars before production to disable default credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}


