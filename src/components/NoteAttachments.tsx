import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";

// TypeScript declaration for Tauri
declare global {
  interface Window {
    __TAURI__?: any;
  }
}

export interface Attachment {
  id: string;
  file: File | string; // Can be a browser File or a Tauri file path string
  name: string;
  type: string;
  previewUrl: string;
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
  const [isDragging, setIsDragging] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to determine mime type from file name
  const getFileTypeFromName = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const imageTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp'
    };
    return imageTypes[extension] || 'image/*';
  };

  // Check if we're in a Tauri environment
  const isTauri = typeof window !== 'undefined' && 'window' in globalThis && window.__TAURI__ !== undefined;

  // Handle file selection from the file picker
  const handleFileSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const newAttachments: Attachment[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        const id = `attachment-${Date.now()}-${i}`;
        const previewUrl = URL.createObjectURL(file);
        
        newAttachments.push({
          id,
          file,
          name: file.name,
          type: file.type,
          previewUrl,
        });
      }
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
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "gif", "webp"]
        }]
      });
      
      if (selected) {
        // Process the selected files
        const newAttachments: Attachment[] = [];
        
        if (Array.isArray(selected)) {
          // Handle multiple file selection
          for (let i = 0; i < selected.length; i++) {
            const path = String(selected[i] || "");
            const fileName = path.indexOf('/') > -1
              ? path.substring(path.lastIndexOf('/') + 1) 
              : path.substring(path.lastIndexOf('\\') + 1);
            
            try {
              // For Tauri, we'll pass the file path directly
              // The fileToArrayBuffer function will handle reading it
              newAttachments.push({
                id: `attachment-${Date.now()}-${i}`,
                file: path, // Store the path directly
                name: fileName,
                type: getFileTypeFromName(fileName),
                previewUrl: "", // Remove invalid base64 placeholder
              });

              // Try to generate a preview if possible
              if (isTauri) {
                try {
                  // We'll load a small preview asynchronously to avoid blocking
                  generateTauriPreview(path, newAttachments[newAttachments.length-1]);
                } catch (previewError) {
                  console.warn(`Could not generate preview for ${fileName}:`, previewError);
                }
              }
            } catch (error) {
              console.error(`Error processing file ${path}:`, error);
            }
          }
        } else if (selected) {
          // Handle single file selection
          const path = String(selected);
          const fileName = path.indexOf('/') > -1
            ? path.substring(path.lastIndexOf('/') + 1) 
            : path.substring(path.lastIndexOf('\\') + 1);
          
          try {
            // For Tauri, we'll pass the file path directly
            const attachment: Attachment = {
              id: `attachment-${Date.now()}-0`,
              file: path, 
              name: fileName,
              type: getFileTypeFromName(fileName),
              previewUrl: "", // Remove invalid base64 placeholder
            };
            
            newAttachments.push(attachment);
            
            // Try to generate a preview if possible
            if (isTauri) {
              try {
                // We'll load a small preview asynchronously to avoid blocking
                generateTauriPreview(path, attachment);
              } catch (previewError) {
                console.warn(`Could not generate preview for ${fileName}:`, previewError);
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
  const generateTauriPreview = async (filePath: string, attachment: Attachment) => {
    try {
      // Check if we can access Tauri file system API
      const fs = await import('@tauri-apps/plugin-fs');
      
      try {
        // Get file metadata for size information
        const fileInfo = await fs.stat(filePath);
        console.log(`File info for ${filePath}:`, fileInfo);
        
        // Read the file as binary data
        const fileData = await fs.readFile(filePath);
        console.log(`Successfully read file: ${filePath}, size: ${fileData.byteLength} bytes`);
        
        // Create a blob URL for preview
        const blob = new Blob([fileData], { type: attachment.type });
        const previewUrl = URL.createObjectURL(blob);
        
        // Update the attachment with the preview URL and file info
        attachment.previewUrl = previewUrl;
        
        // Force a re-render by triggering an update
        onAddAttachments([]);
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
      if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
    
    if (files.length > 0) {
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      handleFileSelection(dataTransfer.files);
    }
  };

  return (
    <div
      className={cn(
        "relative",
        isDragging && "bg-secondary/50 border-2 border-dashed border-primary/50 rounded-md p-2"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <div className="flex items-center space-x-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "flex items-center space-x-1",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onClick={() => setShowAttachments(!showAttachments)}
          disabled={disabled}
        >
          <Paperclip className="h-4 w-4" />
          <span>Attachments {attachments.length > 0 && `(${attachments.length})`}</span>
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
      </div>

      {/* Attachment Dropdown Content */}
      {showAttachments && (
        <div className="absolute z-50 bg-background border border-border rounded-md shadow-md p-3 mt-2 w-72">
          <div className="flex flex-col space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium">Attachments</h3>
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
                <div className="text-xs text-muted-foreground py-2">No attachments added</div>
              ) : (
                attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center justify-between border border-border rounded-md p-2">
                    <div className="flex items-center space-x-2">
                      <img 
                        src={attachment.previewUrl} 
                        alt={attachment.name} 
                        className="h-8 w-8 object-cover rounded-sm" 
                      />
                      <span className="text-xs truncate max-w-[150px]">{attachment.name}</span>
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
                Add Image
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
