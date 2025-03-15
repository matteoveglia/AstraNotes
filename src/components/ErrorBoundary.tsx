import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, resetError: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // Log to an error tracking service if available
    console.error('Component error caught by ErrorBoundary:', error, errorInfo);
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null
    });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (typeof fallback === 'function') {
        return fallback(error, this.resetError);
      }

      if (fallback) {
        return fallback;
      }

      // Default fallback UI with Tailwind classes
      return (
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-lg font-medium text-red-700">Something went wrong</h2>
          <p className="mt-2 text-sm text-red-600">An error occurred in this component:</p>
          <pre className="mt-2 p-3 bg-red-100 text-red-800 text-sm rounded overflow-auto">
            {error.message}
          </pre>
          <button 
            onClick={this.resetError}
            className="mt-4 px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}

// Default error fallback component with Tailwind styling
export const DefaultErrorFallback = ({ 
  error, 
  resetError 
}: { 
  error: Error; 
  resetError: () => void 
}) => (
  <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
    <h2 className="text-lg font-medium text-red-700">Something went wrong</h2>
    <p className="mt-2 text-sm text-red-600">An error occurred in this component:</p>
    <pre className="mt-2 p-3 bg-red-100 text-red-800 text-sm rounded overflow-auto">
      {error.message}
    </pre>
    <button 
      onClick={resetError}
      className="mt-4 px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
    >
      Try again
    </button>
  </div>
);

export default ErrorBoundary;
