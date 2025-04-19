import {
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
} from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";

// Define toast types
export type ToastType = "default" | "success" | "error" | "warning";
export type ToastDuration = number | "persistent";

export interface ToastItem {
  id: string;
  message: string;
  toastType: ToastType;
  duration: ToastDuration;
}

// Toast component that uses Tailwind classes for styling instead of Stitches
const Toast = ({
  className,
  toastType = "default",
  ...props
}: ToastPrimitive.ToastProps & { toastType?: ToastType }) => {
  // Map toast types to Tailwind classes
  const typeClasses: Record<ToastType, string> = {
    default: "border-l-4 border-zinc-400 bg-white",
    success: "border-l-4 border-green-500 bg-green-50 dark:bg-green-900",
    error: "border-l-4 border-red-500 bg-red-50 dark:bg-red-900",
    warning: "border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900",
  };

  return (
    <ToastPrimitive.Root
      className={cn(
        "rounded-md shadow-lg p-4 grid grid-cols-[1fr_auto] gap-4 items-center relative",
        typeClasses[toastType],
        className,
      )}
      {...props}
    />
  );
};

// Context for managing toast state
interface ToastProviderState {
  toasts: ToastItem[];
  showToast: (
    message: string,
    toastType?: ToastType,
    duration?: ToastDuration,
  ) => string;
  showSuccess: (message: string, duration?: ToastDuration) => string;
  showError: (message: string, duration?: ToastDuration) => string;
  showWarning: (message: string, duration?: ToastDuration) => string;
  showPersistentError: (message: string) => string;
  removeToast: (id: string) => void;
  addToBatch: (
    batchKey: string,
    message: string,
    toastType?: ToastType,
  ) => void;
  flushBatchedToasts: () => void;
  showApiCredentialsError: (message: string) => string;
  showPlaylistLoadError: (message: string) => string;
  showPublishResult: (
    successCount: number,
    failedCount: number,
    batchKey?: string,
  ) => void;
}

const ToastContext = createContext<ToastProviderState | null>(null);

// Custom provider hook that contains all toast logic
function useToastProvider(): ToastProviderState {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [batchedToasts, setBatchedToasts] = useState<
    Record<string, BatchedToast>
  >({});

  // Generate a unique ID for each toast
  const generateId = () =>
    `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Remove toast by ID
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Add a toast to the list
  const showToast = useCallback(
    (
      message: string,
      toastType: ToastType = "default",
      duration: ToastDuration = 5000,
    ) => {
      const id = generateId();
      setToasts((prev) => [...prev, { id, message, toastType, duration }]);
      return id;
    },
    [],
  );

  // Convenience methods for different toast types
  const showSuccess = useCallback(
    (message: string, duration: ToastDuration = 5000) => {
      return showToast(message, "success", duration);
    },
    [showToast],
  );

  const showError = useCallback(
    (message: string, duration: ToastDuration = 5000) => {
      return showToast(message, "error", duration);
    },
    [showToast],
  );

  const showWarning = useCallback(
    (message: string, duration: ToastDuration = 5000) => {
      return showToast(message, "warning", duration);
    },
    [showToast],
  );

  const showPersistentError = useCallback(
    (message: string) => {
      return showToast(message, "error", "persistent");
    },
    [showToast],
  );

  // For batch publishing operations
  const addToBatch = useCallback(
    (batchKey: string, message: string, toastType: ToastType = "default") => {
      setBatchedToasts((prev) => {
        const existing = prev[batchKey] || { toastType, messages: [] };
        return {
          ...prev,
          [batchKey]: {
            toastType,
            messages: [...existing.messages, message],
          },
        };
      });
    },
    [],
  );

  // Flush all batched toasts
  const flushBatchedToasts = useCallback(() => {
    Object.entries(batchedToasts).forEach(([key, { toastType, messages }]) => {
      if (messages.length === 1) {
        showToast(messages[0], toastType);
      } else if (messages.length > 1) {
        showToast(
          `${messages.length} operations completed: ${messages.length} successful`,
          toastType,
        );
      }
    });
    setBatchedToasts({});
  }, [batchedToasts, showToast]);

  // API credentials error (persistent)
  const showApiCredentialsError = useCallback(
    (message: string) => {
      return showPersistentError(`API Connection Error: ${message}`);
    },
    [showPersistentError],
  );

  // Playlist loading error
  const showPlaylistLoadError = useCallback(
    (message: string) => {
      return showError(`Failed to load playlist: ${message}`);
    },
    [showError],
  );

  // Publish operation notification handling
  const showPublishResult = useCallback(
    (
      successCount: number,
      failedCount: number,
      batchKey: string = "publish",
    ) => {
      if (failedCount === 0) {
        showSuccess(
          `Successfully published ${successCount} note${successCount !== 1 ? "s" : ""}`,
        );
      } else if (successCount === 0) {
        showError(
          `Failed to publish ${failedCount} note${failedCount !== 1 ? "s" : ""}`,
        );
      } else {
        showWarning(
          `Published ${successCount} note${successCount !== 1 ? "s" : ""}, but ${failedCount} failed`,
        );
      }

      // Clear the batch
      setBatchedToasts((prev) => {
        const { [batchKey]: _, ...rest } = prev;
        return rest;
      });
    },
    [showSuccess, showError, showWarning],
  );

  // Set up auto-dismissing toasts
  useEffect(() => {
    const timers = toasts
      .filter((toast) => toast.duration !== "persistent")
      .map((toast) => {
        return setTimeout(() => {
          removeToast(toast.id);
        }, toast.duration as number);
      });

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [toasts, removeToast]);

  return {
    toasts,
    showToast,
    showSuccess,
    showError,
    showWarning,
    showPersistentError,
    removeToast,
    addToBatch,
    flushBatchedToasts,
    showApiCredentialsError,
    showPlaylistLoadError,
    showPublishResult,
  };
}

interface ToastProviderProps {
  children: React.ReactNode;
}

// Create the toast provider component
export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const contextValue = useToastProvider();

  return (
    <ToastContext.Provider value={contextValue}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}

        {contextValue.toasts.map((toast) => (
          <Toast
            key={toast.id}
            toastType={toast.toastType}
            onOpenChange={(open) => {
              if (!open) contextValue.removeToast(toast.id);
            }}
          >
            <div className="flex flex-col">
              <div className="font-medium text-sm mb-1">
                {toast.toastType === "success" && "Success"}
                {toast.toastType === "error" && "Error"}
                {toast.toastType === "warning" && "Warning"}
                {toast.toastType === "default" && "Notification"}
              </div>
              <div className="text-sm">{toast.message}</div>
            </div>
            <ToastPrimitive.Close
              className="rounded-full p-1 text-zinc-400 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 absolute top-4 right-4"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </ToastPrimitive.Close>
          </Toast>
        ))}

        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 flex flex-col p-6 gap-2 w-[390px] max-w-[100vw] m-0 list-none z-[9999]" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
};

// Batch processing for multiple notifications
interface BatchedToast {
  toastType: ToastType;
  messages: string[];
}

// Hook for consuming the toast context
export function useToast(): ToastProviderState {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// Export all the Radix Toast components with Tailwind styling
const ToastTitle = ToastPrimitive.Title;
const ToastDescription = ToastPrimitive.Description;
const ToastAction = ToastPrimitive.Action;
const ToastClose = ToastPrimitive.Close;
const ToastViewport = ToastPrimitive.Viewport;

export {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
  ToastViewport,
};
