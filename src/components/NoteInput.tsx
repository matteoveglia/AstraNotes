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
  onSave: (content: string, labelId: string, attachments?: Attachment[]) => void;
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
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments || []);
  const markdownEditorRef = useRef<MarkdownEditorRef>(null);
  const componentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    setLabelId(initialLabelId);
  }, [initialLabelId]);

  // Setup paste event listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (status === "published") return; // Don't allow paste if published
      
      if (e.clipboardData?.items) {
        const items = Array.from(e.clipboardData.items);
        
        const imageItems = items.filter(item => 
          item.kind === 'file' && item.type.startsWith('image/')
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
            setAttachments(prev => [...prev, ...newAttachments]);
            
            // Also save the note with the new attachments
            onSave(content, labelId || "", [...attachments, ...newAttachments]);
          }
        }
      }
    };

    // Add the event listener to the component
    const element = componentRef.current;
    if (element) {
      element.addEventListener('paste', handlePaste);
    }

    // Clean up
    return () => {
      if (element) {
        element.removeEventListener('paste', handlePaste);
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
    attachments.forEach(attachment => {
      URL.revokeObjectURL(attachment.previewUrl);
    });
    
    setAttachments([]);
    onClear();
  };

  const handleAddAttachments = useCallback((newAttachments: Attachment[]) => {
    setAttachments(prev => {
      const updated = [...prev, ...newAttachments];
      onSave(content, labelId || "", updated);
      return updated;
    });
  }, [content, labelId, onSave]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      // Find the attachment to remove its preview URL
      const attachment = prev.find(att => att.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      
      // Filter out the removed attachment
      const updated = prev.filter(attachment => attachment.id !== id);
      onSave(content, labelId || "", updated);
      return updated;
    });
  }, [content, labelId, onSave]);

  // Function to prepare content for ftrack
  const prepareContentForFtrack = (content: string) => {
    // First use the editor's method if available
    if (markdownEditorRef.current) {
      return markdownEditorRef.current.processContentForFtrack(content);
    }
    // Fallback implementation
    return content.replace(/\n/g, '\n\n');
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
        "flex gap-4 p-4 bg-white rounded-lg border",
        manuallyAdded && "border-purple-500 border-2",
      )}
    >
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
              <h3 className="font-semibold truncate">
                {versionName}
              </h3>
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
