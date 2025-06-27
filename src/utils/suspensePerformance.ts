/**
 * @fileoverview suspensePerformance.ts
 * Performance monitoring utilities for Suspense components.
 * Tracks loading times, cache hit rates, and provides optimization insights.
 */

interface PerformanceMetric {
  componentName: string;
  operationType: 'fetch' | 'cache_hit' | 'cache_miss' | 'error';
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  totalRequests: number;
  hitRate: number;
}

interface ComponentPerformanceData {
  averageLoadTime: number;
  fastestLoad: number;
  slowestLoad: number;
  totalLoads: number;
  cacheMetrics: CacheMetrics;
  errorRate: number;
  recentMetrics: PerformanceMetric[];
}

class SuspensePerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly MAX_METRICS = 1000; // Keep last 1000 metrics
  private readonly DEBUG_MODE = process.env.NODE_ENV === 'development';

  /**
   * Records a performance metric for a Suspense component
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    const timestampedMetric: PerformanceMetric = {
      ...metric,
      timestamp: Date.now(),
    };

    this.metrics.push(timestampedMetric);

    // Keep only the most recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS);
    }

    // Log performance issues in debug mode
    if (this.DEBUG_MODE) {
      this.logPerformanceIssues(timestampedMetric);
    }
  }

  /**
   * Records the start of a Suspense operation
   */
  startOperation(componentName: string, operationType: 'fetch' | 'cache_lookup'): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      const metricType = operationType === 'fetch' ? 'fetch' : 
                        operationType === 'cache_lookup' ? 'cache_hit' : 'cache_miss';
      
      this.recordMetric({
        componentName,
        operationType: metricType,
        duration,
      });
    };
  }

  /**
   * Records a cache hit
   */
  recordCacheHit(componentName: string, cacheKey?: string): void {
    this.recordMetric({
      componentName,
      operationType: 'cache_hit',
      duration: 0, // Cache hits are essentially instant
      metadata: { cacheKey },
    });
  }

  /**
   * Records a cache miss
   */
  recordCacheMiss(componentName: string, cacheKey?: string): void {
    this.recordMetric({
      componentName,
      operationType: 'cache_miss',
      duration: 0,
      metadata: { cacheKey },
    });
  }

  /**
   * Records an error
   */
  recordError(componentName: string, error: Error): void {
    this.recordMetric({
      componentName,
      operationType: 'error',
      duration: 0,
      metadata: { 
        errorMessage: error.message,
        errorType: error.constructor.name,
      },
    });
  }

  /**
   * Gets performance data for a specific component
   */
  getComponentPerformance(componentName: string): ComponentPerformanceData {
    const componentMetrics = this.metrics.filter(m => m.componentName === componentName);
    const fetchMetrics = componentMetrics.filter(m => m.operationType === 'fetch');
    const cacheHits = componentMetrics.filter(m => m.operationType === 'cache_hit').length;
    const cacheMisses = componentMetrics.filter(m => m.operationType === 'cache_miss').length;
    const errors = componentMetrics.filter(m => m.operationType === 'error').length;

    const totalCacheRequests = cacheHits + cacheMisses;
    const loadTimes = fetchMetrics.map(m => m.duration);

    return {
      averageLoadTime: loadTimes.length > 0 ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length : 0,
      fastestLoad: loadTimes.length > 0 ? Math.min(...loadTimes) : 0,
      slowestLoad: loadTimes.length > 0 ? Math.max(...loadTimes) : 0,
      totalLoads: fetchMetrics.length,
      cacheMetrics: {
        hits: cacheHits,
        misses: cacheMisses,
        totalRequests: totalCacheRequests,
        hitRate: totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) * 100 : 0,
      },
      errorRate: componentMetrics.length > 0 ? (errors / componentMetrics.length) * 100 : 0,
      recentMetrics: componentMetrics.slice(-10), // Last 10 metrics
    };
  }

  /**
   * Gets all component names that have been monitored
   */
  getMonitoredComponents(): string[] {
    const componentNames = new Set(this.metrics.map(m => m.componentName));
    return Array.from(componentNames).sort();
  }

  /**
   * Gets overall performance summary
   */
  getOverallSummary(): Record<string, ComponentPerformanceData> {
    const components = this.getMonitoredComponents();
    const summary: Record<string, ComponentPerformanceData> = {};

    components.forEach(componentName => {
      summary[componentName] = this.getComponentPerformance(componentName);
    });

    return summary;
  }

  /**
   * Logs performance summary to console (development only)
   */
  logPerformanceSummary(): void {
    if (!this.DEBUG_MODE) return;

    const summary = this.getOverallSummary();
    console.group('🚀 Suspense Performance Summary');
    
    Object.entries(summary).forEach(([componentName, data]) => {
      console.group(`📊 ${componentName}`);
      console.log(`Average Load Time: ${data.averageLoadTime.toFixed(2)}ms`);
      console.log(`Cache Hit Rate: ${data.cacheMetrics.hitRate.toFixed(1)}%`);
      console.log(`Total Loads: ${data.totalLoads}`);
      console.log(`Error Rate: ${data.errorRate.toFixed(1)}%`);
      
      if (data.averageLoadTime > 1000) {
        console.warn('⚠️ Slow average load time detected');
      }
      if (data.cacheMetrics.hitRate < 50 && data.cacheMetrics.totalRequests > 5) {
        console.warn('⚠️ Low cache hit rate detected');
      }
      if (data.errorRate > 10) {
        console.warn('⚠️ High error rate detected');
      }
      
      console.groupEnd();
    });
    
    console.groupEnd();
  }

  /**
   * Logs performance issues for individual metrics
   */
  private logPerformanceIssues(metric: PerformanceMetric): void {
    const { componentName, operationType, duration } = metric;

    // Log slow operations
    if (operationType === 'fetch' && duration > 2000) {
      console.warn(
        `🐌 Slow Suspense operation: ${componentName} took ${duration.toFixed(2)}ms`
      );
    }

    // Log errors
    if (operationType === 'error') {
      console.error(
        `❌ Suspense error in ${componentName}:`,
        metric.metadata?.errorMessage
      );
    }

    // Log cache effectiveness
    const componentData = this.getComponentPerformance(componentName);
    if (componentData.cacheMetrics.totalRequests >= 10) {
      const hitRate = componentData.cacheMetrics.hitRate;
      if (hitRate < 30) {
        console.warn(
          `📉 Low cache hit rate for ${componentName}: ${hitRate.toFixed(1)}%`
        );
      }
    }
  }

  /**
   * Clears all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Exports metrics data (useful for debugging)
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

// Singleton instance
export const suspensePerformanceMonitor = new SuspensePerformanceMonitor();

/**
 * React hook for easy performance monitoring in Suspense components
 */
export function useSuspensePerformanceMonitoring(componentName: string) {
  return {
    startOperation: (operationType: 'fetch' | 'cache_lookup') => 
      suspensePerformanceMonitor.startOperation(componentName, operationType),
    
    recordCacheHit: (cacheKey?: string) => 
      suspensePerformanceMonitor.recordCacheHit(componentName, cacheKey),
    
    recordCacheMiss: (cacheKey?: string) => 
      suspensePerformanceMonitor.recordCacheMiss(componentName, cacheKey),
    
    recordError: (error: Error) => 
      suspensePerformanceMonitor.recordError(componentName, error),
    
    getPerformanceData: () => 
      suspensePerformanceMonitor.getComponentPerformance(componentName),
  };
}

/**
 * Utility to expose performance data globally for debugging
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).suspensePerformance = {
    getSummary: () => suspensePerformanceMonitor.getOverallSummary(),
    logSummary: () => suspensePerformanceMonitor.logPerformanceSummary(),
    getComponentData: (name: string) => suspensePerformanceMonitor.getComponentPerformance(name),
    exportMetrics: () => suspensePerformanceMonitor.exportMetrics(),
  };
} 