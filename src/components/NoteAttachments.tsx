import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { useToast } from "@/components/ui/toast";
import { motion } from "motion/react";
import * as fs from "@tauri-apps/plugin-fs";

// TypeScript declaration for Tauri
declare global {
  interface Window {
    __TAURI__?: any;
  }
}

// Add these constants at the top of the file
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB absolute maximum
const WARNING_FILE_SIZE = 5 * 1024 * 1024; // 5MB warning threshold

export interface Attachment {
  id: string;
  file: File | string; // Can be a browser File or a Tauri file path string
  name: string;
  type: string;
  previewUrl: string;
  size?: number; // Add size property for proper tracking
}

interface NoteAttachmentsProps {
  attachments: Attachment[];
  onAddAttachments: (newAttachments: Attachment[]) => void;
  onRemoveAttachment: (id: string) => void;
  disabled?: boolean;
}

export const NoteAttachments: React.FC<NoteAttachmentsProps> = ({
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  disabled = false,
}) => {
  const [_isDragging, setIsDragging] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [shouldOpenUpward, setShouldOpenUpward] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  // Check if panel should open upward to avoid overflow
  useEffect(() => {
    if (showAttachments && buttonRef.current) {
      const checkPosition = () => {
        const rect = buttonRef.current!.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const panelHeight = 300; // Approximate panel height with padding

        // Only open upward if there's insufficient space below AND sufficient space above
        const shouldOpen = spaceBelow < panelHeight && rect.top > panelHeight;
        setShouldOpenUpward(shouldOpen);
      };

      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(checkPosition);
    }
  }, [showAttachments]);

  // Add click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Only close dropdown if it's open and click was outside dropdown and button
      if (
        showAttachments &&
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowAttachments(false);
      }
    }

    // Add global event listeners
    document.addEventListener("mousedown", handleClickOutside);

    // Cleanup on unmount
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showAttachments]);

  // Helper function to determine mime type from file name
  const getFileTypeFromName = (fileName: string): string => {
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    const imageTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    return imageTypes[extension] || "image/*";
  };

  // Check if we're in a Tauri environment
  const isTauri =
    typeof window !== "undefined" &&
    "window" in globalThis &&
    window.__TAURI__ !== undefined;

  // Handle file selection from the file picker
  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newAttachments: Attachment[] = [];
    const oversizedFiles: string[] = [];
    const largeFiles: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileSize = file.size;

      // Check if file exceeds maximum size
      if (fileSize > MAX_FILE_SIZE) {
        oversizedFiles.push(
          `${file.name} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`,
        );
        continue;
      }

      // Track large files for warning
      if (fileSize > WARNING_FILE_SIZE) {
        largeFiles.push(
          `${file.name} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`,
        );
      }

      if (file.type.startsWith("image/")) {
        const id = `attachment-${Date.now()}-${i}`;
        const previewUrl = URL.createObjectURL(file);

        newAttachments.push({
          id,
          file,
          name: file.name,
          type: file.type,
          previewUrl,
          size: fileSize,
        });
      }
    }

    // Show warnings if any files were too large
    if (oversizedFiles.length > 0) {
      toast.showError(
        `The following files exceed the 15MB limit: ${oversizedFiles.join(", ")}`,
      );
    }

    // Show warnings for large files that were accepted but may cause performance issues
    if (largeFiles.length > 0) {
      toast.showWarning(
        `The following files are large and may cause performance issues: ${largeFiles.join(", ")}`,
      );
    }

    if (newAttachments.length > 0) {
      onAddAttachments(newAttachments);
    }
  };

  // Handle click on the attachment button
  const handleAttachmentClick = async () => {
    if (!isTauri) {
      // In browser, use the standard file input
      fileInputRef.current?.click();
      return;
    }

    try {
      // Open file dialog using Tauri plugin
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp"],
          },
        ],
      });

      if (selected) {
        // Process the selected files
        const newAttachments: Attachment[] = [];
        const _oversizedFiles: string[] = [];
        const _largeFiles: string[] = [];

        if (Array.isArray(selected)) {
          // Handle multiple file selection
          for (let i = 0; i < selected.length; i++) {
            const path = String(selected[i] || "");
            const fileName =
              path.indexOf("/") > -1
                ? path.substring(path.lastIndexOf("/") + 1)
                : path.substring(path.lastIndexOf("\\") + 1);

            try {
              // For Tauri, we'll pass the file path directly
              // Size validation will happen in generateTauriPreview
              const attachment: Attachment = {
                id: `attachment-${Date.now()}-${i}`,
                file: path, // Store the path directly
                name: fileName,
                type: getFileTypeFromName(fileName),
                previewUrl: "", // Will be populated in generateTauriPreview
              };

              newAttachments.push(attachment);

              // Generate preview and perform size validation
              if (isTauri) {
                try {
                  // We'll load a small preview asynchronously and also check file size
                  generateTauriPreview(path, attachment);
                } catch (previewError) {
                  console.warn(
                    `Could not generate preview for ${fileName}:`,
                    previewError,
                  );
                }
              }
            } catch (error) {
              console.error(`Error processing file ${path}:`, error);
            }
          }
        } else if (selected) {
          // Handle single file selection (same structure as above)
          const path = String(selected);
          const fileName =
            path.indexOf("/") > -1
              ? path.substring(path.lastIndexOf("/") + 1)
              : path.substring(path.lastIndexOf("\\") + 1);

          try {
            // For Tauri, we'll pass the file path directly
            const attachment: Attachment = {
              id: `attachment-${Date.now()}-0`,
              file: path,
              name: fileName,
              type: getFileTypeFromName(fileName),
              previewUrl: "", // Will be populated in generateTauriPreview
            };

            newAttachments.push(attachment);

            // Generate preview and perform size validation
            if (isTauri) {
              try {
                // We'll load a small preview asynchronously and also check file size
                generateTauriPreview(path, attachment);
              } catch (previewError) {
                console.warn(
                  `Could not generate preview for ${fileName}:`,
                  previewError,
                );
              }
            }
          } catch (error) {
            console.error(`Error processing file ${path}:`, error);
          }
        }

        if (newAttachments.length > 0) {
          onAddAttachments(newAttachments);
        }
      }
    } catch (error) {
      console.error("Error selecting files:", error);
    }
  };

  // Helper function to generate preview for Tauri file paths
  const generateTauriPreview = async (
    filePath: string,
    attachment: Attachment,
  ) => {
    try {
      // Check if we can access Tauri file system API
      try {
        // Get file metadata for size information
        const fileInfo = await fs.stat(filePath);
        const fileSize = fileInfo.size || 0;

        console.log(`File info for ${filePath}:`, fileInfo);

        // Set the size on the attachment
        attachment.size = fileSize;

        // Check if file is too large and provide warning
        if (fileSize > MAX_FILE_SIZE) {
          toast.showError(
            `File ${attachment.name} exceeds the 15MB limit (${(fileSize / (1024 * 1024)).toFixed(2)} MB) and may cause issues`,
          );
          return; // Skip loading the preview for oversized files
        }

        // Warn about large files
        if (fileSize > WARNING_FILE_SIZE) {
          toast.showWarning(
            `File ${attachment.name} is large (${(fileSize / (1024 * 1024)).toFixed(2)} MB) and may cause performance issues`,
          );
        }

        // Read the file as binary data - only if below the extreme size limit
        if (fileSize < MAX_FILE_SIZE * 2) {
          // Extra safety margin, don't even try to load truly huge files
          const fileData = await fs.readFile(filePath);
          console.log(
            `Successfully read file: ${filePath}, size: ${fileData.byteLength} bytes`,
          );

          // Create a blob URL for preview
          const arrayBuffer = new ArrayBuffer(fileData.byteLength);
          new Uint8Array(arrayBuffer).set(fileData);
          const blob = new Blob([arrayBuffer], { type: attachment.type });
          const previewUrl = URL.createObjectURL(blob);

          // Update the attachment with the preview URL and file info
          attachment.previewUrl = previewUrl;

          // Force a re-render by triggering an update
          onAddAttachments([]);
        }
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        // We'll keep the placeholder image
      }
    } catch (error) {
      console.error(`Error importing Tauri FS module:`, error);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelection(e.dataTransfer.files);
  };

  // Handle paste events
  const handlePaste = (e: React.ClipboardEvent) => {
    // Prevent handling if the parent NoteInput component will handle it
    if (e.currentTarget !== e.target) {
      return;
    }

    const items = e.clipboardData.items;
    const files = [] as File[];

    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file" && items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      const dataTransfer = new DataTransfer();
      files.forEach((file) => dataTransfer.items.add(file));
      handleFileSelection(dataTransfer.files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <div className="relative flex items-center">
        <Button
          ref={buttonRef}
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "flex items-center space-x-1",
            disabled && "opacity-50 cursor-not-allowed",
          )}
          onClick={() => setShowAttachments(!showAttachments)}
          disabled={disabled}
        >
          <Paperclip className="h-4 w-4" />
          <span>
            Attachments {attachments.length > 0 && `(${attachments.length})`}
          </span>
        </Button>

        {/* Hidden file input for browser file selection */}
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          multiple
          onChange={(e) => handleFileSelection(e.target.files)}
          disabled={disabled}
        />

        {/* Attachment Dropdown Content */}
        {showAttachments && (
          <motion.div
            ref={dropdownRef}
            className={cn(
              "absolute left-0 z-50 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-md shadow-xl p-3 w-72",
              shouldOpenUpward ? "bottom-full mb-2" : "top-full mt-2",
            )}
            initial={{ opacity: 0, scale: 0.95, y: 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 0 }}
            transition={{ type: "spring", duration: 0.25 }}
          >
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold">Attachments</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAttachments(false)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Attachment List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {attachments.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">
                    Drop images or click to add
                  </div>
                ) : (
                  attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between border border-zinc-200 dark:border-zinc-600 rounded-md p-2 bg-zinc-50 dark:bg-zinc-700"
                    >
                      <div className="flex items-center space-x-2">
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          className="h-8 w-8 object-cover rounded-sm"
                        />
                        <span className="text-xs truncate max-w-[150px]">
                          {attachment.name}
                        </span>
                      </div>
                      {!disabled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveAttachment(attachment.id)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add Attachment Button */}
              {!disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAttachmentClick}
                  className="w-full"
                >
                  Add Attachment
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
