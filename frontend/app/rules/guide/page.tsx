'use client';

import { RuleCreationFlow } from '@/components/rules/RuleCreationFlow';

export default function RuleGuidePage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="page-title">Rule creation guide</h1>
        <p className="text-sm text-text-secondary">
          A guided, step-by-step flow to help users choose manual or AI
          drafting, validate, and raise a change request before deployment.
        </p>
      </header>
      <RuleCreationFlow />
    </div>
  );
}

