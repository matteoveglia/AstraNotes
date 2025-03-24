/**
 * @fileoverview NoteInput.tsx
 * Reusable component for inputting and managing version-associated notes.
 * Provides markdown editor, label selection, status indication (draft/published/empty),
 * version selection, visual feedback, and thumbnail preview support.
 * @component
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { NoteStatus } from "../types";
import { cn } from "../lib/utils";
import { NoteLabelSelect } from "./NoteLabelSelect";
import { ThumbnailModal } from "./ThumbnailModal";
import { BorderTrail } from "@/components/ui/border-trail";
import { Loader2 } from "lucide-react";
// Import our custom MarkdownEditor
import { MarkdownEditor, MarkdownEditorRef } from "./MarkdownEditor";
// Import the new NoteAttachments component
import { NoteAttachments, Attachment } from "./NoteAttachments";

export interface NoteInputProps {
  versionName: string;
  versionNumber: string;
  thumbnailUrl?: string;
  status: NoteStatus;
  selected: boolean;
  initialContent?: string;
  initialLabelId?: string;
  initialAttachments?: Attachment[];
  manuallyAdded?: boolean;
  onSave: (
    content: string,
    labelId: string,
    attachments?: Attachment[],
  ) => void;
  onClear: () => void;
  onSelectToggle: () => void;
}

export const NoteInput: React.FC<NoteInputProps> = ({
  versionName,
  versionNumber,
  thumbnailUrl,
  status,
  selected,
  initialContent = "",
  initialLabelId,
  initialAttachments = [],
  manuallyAdded = false,
  onSave,
  onClear,
  onSelectToggle,
}) => {
  const [content, setContent] = useState(initialContent);
  const [labelId, setLabelId] = useState(initialLabelId);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>(
    initialAttachments || [],
  );
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const markdownEditorRef = useRef<MarkdownEditorRef>(null);
  const componentRef = useRef<HTMLDivElement>(null);
  const dragCountRef = useRef(0);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    setLabelId(initialLabelId);
  }, [initialLabelId]);

  // Update attachments when initialAttachments changes
  useEffect(() => {
    // Only log when there are attachments to reduce noise
    if (initialAttachments?.length > 0) {
      console.debug(
        `[NoteInput] Updating attachments for ${versionName}: ${initialAttachments.length} attachments`,
      );
    }
    setAttachments(initialAttachments || []);
  }, [initialAttachments, versionName]);

  // Setup paste event listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (status === "published") return; // Don't allow paste if published

      if (e.clipboardData?.items) {
        const items = Array.from(e.clipboardData.items);

        const imageItems = items.filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        );

        if (imageItems.length > 0) {
          e.preventDefault(); // Prevent default paste behavior for images

          const newAttachments: Attachment[] = [];

          imageItems.forEach((item, index) => {
            const file = item.getAsFile();
            if (file) {
              const id = `pasted-${Date.now()}-${index}`;
              const previewUrl = URL.createObjectURL(file);

              newAttachments.push({
                id,
                file,
                name: file.name || `pasted-image-${index}.png`,
                type: file.type,
                previewUrl,
              });
            }
          });

          if (newAttachments.length > 0) {
            setAttachments((prev) => [...prev, ...newAttachments]);

            // Also save the note with the new attachments
            onSave(content, labelId || "", [...attachments, ...newAttachments]);
          }
        }
      }
    };

    // Add the event listener to the component
    const element = componentRef.current;
    if (element) {
      element.addEventListener("paste", handlePaste);
    }

    // Clean up
    return () => {
      if (element) {
        element.removeEventListener("paste", handlePaste);
      }
    };
  }, [content, labelId, attachments, onSave, status]);

  const handleChange = (value: string) => {
    setContent(value);
    onSave(value, labelId || "", attachments);
  };

  const handleLabelChange = (newLabelId: string) => {
    setLabelId(newLabelId);
    onSave(content, newLabelId, attachments);
  };

  const handleClear = () => {
    setContent("");

    // Clean up attachment preview URLs
    attachments.forEach((attachment) => {
      URL.revokeObjectURL(attachment.previewUrl);
    });

    setAttachments([]);
    onClear();
  };

  // Add global document-level handlers for better drag event capture
  useEffect(() => {
    const handleDocumentDragEnd = (e: DragEvent) => {
      // Reset all drag states when dragging ends anywhere in the document
      dragCountRef.current = 0;
      setIsDraggingOver(false);
    };

    document.addEventListener("dragend", handleDocumentDragEnd);
    document.addEventListener("drop", handleDocumentDragEnd);

    return () => {
      document.removeEventListener("dragend", handleDocumentDragEnd);
      document.removeEventListener("drop", handleDocumentDragEnd);
    };
  }, []);

  // Completely rewrite the drag handlers to fix the issues
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (status === "published") return;

    dragCountRef.current++;
    setIsDraggingOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Critical for enabling drop
    // No need to modify state here as it's handled in dragEnter
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (status === "published") return;

    dragCountRef.current--;
    // Only reset state when counter reaches 0 (all drag leaves completed)
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0; // Ensure non-negative
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    console.log("[DragDebug] Drop event", {
      fileCount: e.dataTransfer.files.length,
      target: e.target,
      currentTarget: e.currentTarget,
    });

    e.preventDefault();
    e.stopPropagation();

    // Reset counter and visual state
    dragCountRef.current = 0;
    setIsDraggingOver(false);

    // Skip if published
    if (status === "published") return;

    // Process dropped files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      console.log(
        "[DragDebug] Processing dropped files:",
        e.dataTransfer.files.length,
      );
      const fileNames = Array.from(e.dataTransfer.files)
        .map((f) => f.name)
        .join(", ");
      console.log("[DragDebug] Dropped file names:", fileNames);

      handleAddFiles(e.dataTransfer.files);
    } else {
      console.log("[DragDebug] Drop event contained no files");
    }
  };

  // Enhanced file processing with better logging
  const handleAddFiles = (files: FileList) => {
    console.log("Processing dropped/selected files:", files.length);
    const imageFiles = Array.from(files).filter((file) => {
      const isImage = file.type.startsWith("image/");
      console.log(
        `File: ${file.name}, type: ${file.type}, is image: ${isImage}`,
      );
      return isImage;
    });

    console.log("Image files found:", imageFiles.length);
    if (imageFiles.length > 0) {
      const newAttachments: Attachment[] = imageFiles.map((file, index) => {
        const id = `file-${Date.now()}-${index}`;
        const previewUrl = URL.createObjectURL(file);
        console.log(
          `Created attachment: ${id}, ${file.name}, preview URL created`,
        );

        return {
          id,
          file,
          name: file.name,
          type: file.type,
          previewUrl,
        };
      });

      const updatedAttachments = [...attachments, ...newAttachments];
      setAttachments(updatedAttachments);

      // Debounce the save operation to avoid race conditions
      console.log(`Saving ${updatedAttachments.length} attachments`);
      onSave(content, labelId || "", updatedAttachments);
    }
  };

  const handleAddAttachments = useCallback(
    (newAttachments: Attachment[]) => {
      setAttachments((prev) => {
        const updated = [...prev, ...newAttachments];
        onSave(content, labelId || "", updated);
        return updated;
      });
    },
    [content, labelId, onSave],
  );

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      setAttachments((prev) => {
        // Find the attachment to remove its preview URL
        const attachment = prev.find((att) => att.id === id);
        if (attachment) {
          URL.revokeObjectURL(attachment.previewUrl);
        }

        // Filter out the removed attachment
        const updated = prev.filter((attachment) => attachment.id !== id);
        onSave(content, labelId || "", updated);
        return updated;
      });
    },
    [content, labelId, onSave],
  );

  // Function to prepare content for ftrack
  const prepareContentForFtrack = (content: string) => {
    // First use the editor's method if available
    if (markdownEditorRef.current) {
      return markdownEditorRef.current.processContentForFtrack(content);
    }
    // Fallback implementation
    return content.replace(/\n/g, "\n\n");
  };

  const getStatusColor = () => {
    if (selected) return "bg-blue-500 hover:bg-blue-600"; // Blue for selected
    switch (status) {
      case "draft":
        return "bg-yellow-500 hover:bg-yellow-600"; // Yellow for draft
      case "published":
        return "bg-green-500 hover:bg-green-600"; // Green for published
      default:
        return "bg-gray-200"; // Gray for empty
    }
  };

  const getStatusTitle = () => {
    if (selected) return "Selected";
    switch (status) {
      case "draft":
        return "Draft saved";
      case "published":
        return "Published";
      default:
        return "No note";
    }
  };

  const openThumbnailModal = () => {
    if (thumbnailUrl) {
      setIsModalOpen(true);
    }
  };

  return (
    <div
      ref={componentRef}
      className={cn(
        "flex gap-4 p-4 bg-white rounded-lg border relative",
        manuallyAdded && "border-purple-500 border-2",
        isDraggingOver &&
          status !== "published" &&
          "bg-blue-100 border-2 border-dashed border-blue-300",
        "transition-colors duration-150",
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Show a semi-transparent overlay when dragging */}
      {isDraggingOver && status !== "published" && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-100/70 z-20 rounded">
          <p className="text-blue-800 font-medium">Drop images to attach</p>
        </div>
      )}

      <div
        className={cn(
          "flex-shrink-0 w-32 min-h-[85px] bg-gray-100 rounded overflow-hidden",
          thumbnailUrl ? "cursor-pointer" : "cursor-default",
        )}
        onClick={openThumbnailModal}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={versionName}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="relative flex h-full w-full flex-col items-center justify-center rounded-md bg-zinc-200 px-5 py-2 dark:bg-zinc-800">
            <BorderTrail
              style={{
                boxShadow:
                  "0px 0px 60px 30px rgb(255 255 255 / 50%), 0 0 100px 60px rgb(0 0 0 / 50%), 0 0 140px 90px rgb(0 0 0 / 50%)",
              }}
              size={100}
            />
            <div
              className="flex h-full animate-pulse flex-col items-start justify-center space-y-2"
              role="status"
              aria-label="Loading..."
            >
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="font-semibold truncate">{versionName}</h3>
              <span className="font-medium text-base text-gray-500">
                - v{versionNumber}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <div className="flex gap-2">
              <MarkdownEditor
                ref={markdownEditorRef}
                value={content}
                onChange={handleChange}
                disabled={status === "published"}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              {status !== "empty" && (
                <div className="flex items-center justify-between w-full mt-3">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClear}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </Button>

                    {/* Add the attachment component */}
                    <NoteAttachments
                      attachments={attachments}
                      onAddAttachments={handleAddAttachments}
                      onRemoveAttachment={handleRemoveAttachment}
                      disabled={status === "published"}
                    />
                  </div>

                  {content && (
                    <NoteLabelSelect
                      value={labelId ?? ""}
                      onChange={handleLabelChange}
                      disabled={status === "published"}
                      className="h-8 w-40 ml-auto"
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            onClick={
              status === "empty" || status === "published"
                ? undefined
                : onSelectToggle
            }
            className={cn(
              "w-5 rounded-full transition-colors",
              status === "empty" || status === "published"
                ? "cursor-default"
                : "cursor-pointer",
              getStatusColor(),
            )}
            title={getStatusTitle()}
          />
        </div>
      </div>

      {thumbnailUrl && (
        <ThumbnailModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          thumbnailUrl={thumbnailUrl}
          versionName={versionName}
          versionNumber={versionNumber}
        />
      )}
    </div>
  );
};
