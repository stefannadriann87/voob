"use client";

import React, { Component, ReactNode } from "react";
import { logger } from "../lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary pentru a prinde erori React și a preveni crash-ul aplicației
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Actualizează state-ul pentru a afișa UI-ul de eroare
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Loghează eroarea pentru debugging
    logger.error("ErrorBoundary caught an error:", error, errorInfo);
    
    // Poți trimite eroarea la un serviciu de logging (Sentry, LogRocket, etc.)
    // Example: logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Renderizează UI-ul de eroare personalizat sau fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#0B0E17] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#1A1F2E] rounded-xl p-8 border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
                <i className="fas fa-exclamation-triangle text-xl" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Ceva nu a mers bine</h2>
                <p className="text-sm text-white/60">A apărut o eroare neașteptată</p>
              </div>
            </div>
            
            {process.env.NODE_ENV === "development" && this.state.error && (
              <div className="mt-4 p-4 bg-black/20 rounded-lg border border-white/5">
                <p className="text-xs font-mono text-red-400 break-all">
                  {this.state.error.message}
                </p>
                {this.state.error.stack && (
                  <details className="mt-2">
                    <summary className="text-xs text-white/60 cursor-pointer">Stack trace</summary>
                    <pre className="text-xs text-white/40 mt-2 overflow-auto max-h-40">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="flex-1 px-4 py-2 bg-[#6366F1] hover:bg-[#5855EB] text-white rounded-lg transition-colors"
              >
                Reîncarcă pagina
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                Acasă
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

