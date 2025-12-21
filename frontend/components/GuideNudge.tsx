'use client';

import { useState } from 'react';
import { Bot, X, ArrowRight } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

export function GuideNudge() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  // Hide on login page and when already on the guide page
  if (pathname === '/login' || pathname.startsWith('/rules/guide')) {
    return null;
  }

  const goToGuide = () => {
    router.push('/rules/guide');
    setOpen(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="max-w-[280px] rounded-lg border border-outlineVariant bg-surface p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
              <Bot className="h-4 w-4" />
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-text-primary">Need a guided flow?</p>
              <p className="text-text-secondary">
                Start the Rule Guide: choose manual vs AI, validate, and raise a change request.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={goToGuide}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 focus-ring"
                >
                  Open guide
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Not now
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-1 text-text-tertiary hover:text-text-secondary"
              aria-label="Dismiss guide"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={goToGuide}
        className="group flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-primary/90 focus-ring"
        aria-label="Open rule guide"
      >
        <Bot className="h-4 w-4" />
        <span>Rule Guide</span>
      </button>
    </div>
  );
}

