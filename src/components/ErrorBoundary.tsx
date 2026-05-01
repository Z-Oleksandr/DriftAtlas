/**
 * App-level error boundary. Catches render-time exceptions, logs them via the
 * shared logger, and shows a friendly fallback. Per code_rules §7.2: never
 * surface raw stack traces to the user.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { log } from '../lib/log';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error('app', 'render error', error.message, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: '2rem',
              color: '#b91c1c',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              maxWidth: '600px',
              margin: '2rem auto',
            }}
          >
            <h2 style={{ marginTop: 0 }}>Something went wrong.</h2>
            <p>
              The view failed to render. Try refreshing; if the problem persists, the data artifacts
              may be out of sync — rerun <code>npm run preprocess</code>.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
