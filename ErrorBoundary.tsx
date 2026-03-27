import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = parsed.error;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-sky-100 via-white to-cyan-100 text-sky-900">
          <div className="bg-white/80 backdrop-blur-sm p-8 rounded-3xl shadow-xl max-w-md w-full border-2 border-white">
            <h2 className="text-2xl font-black text-sky-500 mb-4 uppercase tracking-wider">Oops! A little freeze.</h2>
            <p className="text-sky-700 mb-6 font-medium">{errorMessage}</p>
            <button
              className="w-full py-4 bg-gradient-to-r from-sky-400 to-cyan-400 text-white rounded-2xl font-black uppercase tracking-wider hover:from-sky-500 hover:to-cyan-500 transition-all shadow-[0_8px_20px_rgba(14,165,233,0.3)] hover:-translate-y-1 border-2 border-white"
              onClick={() => window.location.reload()}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
