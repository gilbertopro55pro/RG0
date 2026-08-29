"use client";

import { Component, type ReactNode } from "react";

// A render-time crash anywhere inside `children` used to leave the surrounding modal/backdrop
// mounted but empty — a silent blank screen with no way to tell what happened. This catches that
// and shows the actual error instead, so a broken state is at least diagnosable/reportable.
export default class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center">
          <p className="text-sm font-semibold text-rose mb-2">
            {this.props.label ?? "אירעה שגיאה"} — משהו השתבש בטעינה
          </p>
          <p className="text-xs text-ink-soft font-data break-all">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold bg-white border border-line text-ink"
          >
            נסה שוב
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
