"use client"

import Link from 'next/link'
import { ArrowRight, PenLine, PlusCircle, Sparkles, UploadCloud } from 'lucide-react'

const actions = [
  {
    title: 'Create Rule',
    description: 'Start a new rule for Goods Declaration or Cargo Report.',
    icon: PlusCircle,
    href: '/rules/new',
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    title: 'Upload Package',
    description: 'Deploy a DRL package to the decision engine.',
    icon: UploadCloud,
    href: '/package',
    color: 'text-sky-600 bg-sky-50',
  },
  {
    title: 'Generate with AI',
    description: 'Let AI draft a rule variant to review and tweak.',
    icon: Sparkles,
    href: '/ai',
    color: 'text-pink-600 bg-pink-50',
  },
  {
    title: 'Review Requests',
    description: 'Approve or reject pending change requests.',
    icon: PenLine,
    href: '/change-requests',
    color: 'text-emerald-600 bg-emerald-50',
  },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {actions.map((action) => (
        <Link
          key={action.title}
          href={action.href}
          className="group flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
        >
          <span
            className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl ${action.color}`}
          >
            <action.icon className="h-5 w-5" />
          </span>
          <h3 className="text-lg font-semibold text-slate-900">{action.title}</h3>
          <p className="mt-2 flex-1 text-sm text-slate-500">{action.description}</p>
          <span className="mt-4 inline-flex items-center text-sm font-medium text-indigo-600">
            Go <ArrowRight className="ml-1 h-3.5 w-3.5 transition group-hover:translate-x-1" />
          </span>
        </Link>
      ))}
    </div>
  )
}

