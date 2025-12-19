/**
 * @fileoverview SuspenseErrorBoundary.tsx
 * Enhanced error boundary specifically designed for Suspense components.
 * Provides better error handling, recovery options, and performance monitoring.
 */

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";

interface SuspenseErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode | ((error: Error, resetError: () => void) => ReactNode);
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
	/** Component name for better error reporting */
	componentName?: string;
	/** Enable performance monitoring */
	enablePerformanceMonitoring?: boolean;
}

interface SuspenseErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
	retryCount: number;
	lastErrorTime: number;
}

export class SuspenseErrorBoundary extends Component<
	SuspenseErrorBoundaryProps,
	SuspenseErrorBoundaryState
> {
	private performanceStartTime: number = 0;

	constructor(props: SuspenseErrorBoundaryProps) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
			retryCount: 0,
			lastErrorTime: 0,
		};
	}

	static getDerivedStateFromError(
		error: Error,
	): Partial<SuspenseErrorBoundaryState> {
		return {
			hasError: true,
			error,
			lastErrorTime: Date.now(),
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		const { onError, componentName } = this.props;

		// Enhanced error logging with component context
		console.error(
			`[SuspenseErrorBoundary${componentName ? ` - ${componentName}` : ""}] Error caught:`,
			error,
			errorInfo,
		);

		// Store error info for debugging
		this.setState({ errorInfo });

		// Call custom error handler
		if (onError) {
			onError(error, errorInfo);
		}

		// Report to error tracking service if available
		if (typeof window !== "undefined" && (window as any).errorTracker) {
			(window as any).errorTracker.captureException(error, {
				extra: {
					componentName,
					errorInfo,
					retryCount: this.state.retryCount,
				},
			});
		}
	}

	componentDidMount(): void {
		if (this.props.enablePerformanceMonitoring) {
			this.performanceStartTime = performance.now();
		}
	}

	componentDidUpdate(prevProps: SuspenseErrorBoundaryProps): void {
		// Auto-reset error after successful re-render if children changed
		if (this.state.hasError && prevProps.children !== this.props.children) {
			console.debug(
				`[SuspenseErrorBoundary${this.props.componentName ? ` - ${this.props.componentName}` : ""}] Auto-resetting error after content change`,
			);
			this.resetError();
		}

		// Performance monitoring
		if (
			this.props.enablePerformanceMonitoring &&
			this.performanceStartTime > 0
		) {
			const renderTime = performance.now() - this.performanceStartTime;
			if (renderTime > 100) {
				// Log slow renders
				console.debug(
					`[SuspenseErrorBoundary${this.props.componentName ? ` - ${this.props.componentName}` : ""}] Slow render detected: ${renderTime.toFixed(2)}ms`,
				);
			}
		}
	}

	resetError = (): void => {
		const now = Date.now();
		const timeSinceLastError = now - this.state.lastErrorTime;

		// Prevent rapid retries (minimum 1 second between attempts)
		if (timeSinceLastError < 1000) {
			console.warn(
				`[SuspenseErrorBoundary${this.props.componentName ? ` - ${this.props.componentName}` : ""}] Retry attempted too quickly, ignoring`,
			);
			return;
		}

		console.debug(
			`[SuspenseErrorBoundary${this.props.componentName ? ` - ${this.props.componentName}` : ""}] Resetting error (retry ${this.state.retryCount + 1})`,
		);

		this.setState((prevState) => ({
			hasError: false,
			error: null,
			errorInfo: null,
			retryCount: prevState.retryCount + 1,
			lastErrorTime: now,
		}));

		// Reset performance timer
		if (this.props.enablePerformanceMonitoring) {
			this.performanceStartTime = performance.now();
		}
	};

	render(): ReactNode {
		const { hasError, error, errorInfo, retryCount } = this.state;
		const { children, fallback, componentName } = this.props;

		if (hasError && error) {
			// Use custom fallback if provided
			if (typeof fallback === "function") {
				return fallback(error, this.resetError);
			}

			if (fallback) {
				return fallback;
			}

			// Default enhanced fallback UI
			const isNetworkError =
				error.message.includes("fetch") || error.message.includes("network");
			const isTimeoutError = error.message.includes("timeout");
			const tooManyRetries = retryCount >= 3;

			return (
				<div className="p-6 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
					<div className="flex items-start gap-3">
						<AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
						<div className="flex-1">
							<h3 className="text-base font-medium text-red-800 dark:text-red-200 mb-2">
								{componentName
									? `${componentName} Error`
									: "Something went wrong"}
							</h3>

							<div className="text-sm text-red-700 dark:text-red-300 mb-3">
								{isNetworkError && (
									<p>
										Network connection issue. Please check your internet
										connection.
									</p>
								)}
								{isTimeoutError && (
									<p>
										Request timed out. The service might be temporarily
										unavailable.
									</p>
								)}
								{!isNetworkError && !isTimeoutError && (
									<p>
										An unexpected error occurred while loading this content.
									</p>
								)}
							</div>

							{retryCount > 0 && (
								<p className="text-xs text-red-600 dark:text-red-400 mb-3">
									Retry attempts: {retryCount}
								</p>
							)}

							<div className="flex gap-2">
								<Button
									onClick={this.resetError}
									size="sm"
									variant="outline"
									className="border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20"
									disabled={tooManyRetries}
								>
									<RefreshCw className="h-4 w-4 mr-1" />
									{tooManyRetries ? "Max retries reached" : "Try again"}
								</Button>

								{process.env.NODE_ENV === "development" && (
									<details className="mt-2">
										<summary className="text-xs text-red-600 dark:text-red-400 cursor-pointer">
											Show error details
										</summary>
										<pre className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 text-xs rounded overflow-auto max-h-32">
											{error.message}
											{errorInfo &&
												`\n\nComponent Stack:\n${errorInfo.componentStack}`}
										</pre>
									</details>
								)}
							</div>
						</div>
					</div>
				</div>
			);
		}

		return children;
	}
}

/**
 * Hook for using error boundary context (if needed in the future)
 */
export function useSuspenseErrorContext() {
	// This could be extended to provide error context to child components
	return {
		reportError: (error: Error, context?: string) => {
			console.error(`[SuspenseError${context ? ` - ${context}` : ""}]:`, error);
		},
	};
}
