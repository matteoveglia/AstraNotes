# AstraNotes Code Audit

## Executive Summary

I've performed a thorough audit of the image attachment functionality in AstraNotes. The feature works well overall, but there are several issues that need addressing:

1. **State persistence issue**: Attachments disappear when switching between playlists due to improper state management
2. **Data serialization error**: Clearing notes with attachments fails due to Blob/File serialization issues
3. **UI improvement needed**: Attachment dropdown doesn't close when clicking outside

## Issue 1: Attachments Disappearing When Switching Playlists

The problem occurs because when switching playlists and returning, the attachment state is not properly preserved. This appears to be due to how the attachments are serialized and loaded from IndexedDB.

### Root Cause
In `useNoteManagement.ts`, attachments are stored in state but aren't properly reloaded when switching back to a playlist. The issue stems from how file objects are reconstructed from the database.

### Solution

```typescript
// In src/features/notes/hooks/useNoteManagement.ts

// Update the useEffect that loads drafts when playlist ID changes
useEffect(() => {
  // Reset selections when switching playlists
  setSelectedVersions([]);
  
  if (playlist.id) {
    console.log(`[useNoteManagement] Playlist ID changed to ${playlist.id}, loading attachments`);
    
    // Clear current state before loading new data to prevent stale attachments
    setNoteDrafts({});
    setNoteStatuses({});
    setNoteLabelIds({});
    setNoteAttachments({});
    
    // Load immediately instead of using setTimeout
    loadDrafts();
  }
}, [playlist.id, loadDrafts]);

// Improve the attachment loading logic in loadDrafts function
const loadDrafts = useCallback(async () => {
  try {
    console.debug(`[useNoteManagement] Loading drafts for playlist ${playlist.id}`);

    // Load versions and attachments directly from db in one go
    const [versions, attachments] = await Promise.all([
      db.versions
        .where("playlistId")
        .equals(playlist.id)
        .filter(v => !v.isRemoved)
        .toArray(),
      db.attachments
        .where("playlistId")
        .equals(playlist.id)
        .toArray()
    ]);
    
    // Process versions first
    const draftMap: Record<string, string> = {};
    const statusMap: Record<string, NoteStatus> = {};
    const labelMap: Record<string, string> = {};
    
    versions.forEach(version => {
      draftMap[version.id] = version.draftContent || "";
      statusMap[version.id] = version.noteStatus || "empty";
      labelMap[version.id] = version.labelId || "";
    });
    
    // Process attachments with better error handling
    const attachmentMap: Record<string, Attachment[]> = {};
    
    // Group by version ID first
    const attachmentsByVersion = new Map<string, NoteAttachment[]>();
    attachments.forEach(att => {
      if (!attachmentsByVersion.has(att.versionId)) {
        attachmentsByVersion.set(att.versionId, []);
      }
      attachmentsByVersion.get(att.versionId)!.push(att);
    });
    
    // Then convert to UI attachment objects
    for (const [versionId, versionAttachments] of attachmentsByVersion.entries()) {
      if (!attachmentMap[versionId]) {
        attachmentMap[versionId] = [];
      }
      
      versionAttachments.forEach(att => {
        try {
          // Create an appropriate file object with proper error handling
          let fileObj: File | string;
          
          if (att.data) {
            try {
              fileObj = new File([att.data], att.name, { type: att.type });
            } catch (fileError) {
              console.warn(`Could not create File from Blob for ${att.name}:`, fileError);
              fileObj = new File([], att.name, { type: att.type });
            }
          } else if ((att as any).filePath) {
            fileObj = (att as any).filePath;
          } else {
            fileObj = new File([], att.name, { type: att.type });
          }
          
          attachmentMap[versionId].push({
            id: att.id,
            name: att.name,
            type: att.type,
            previewUrl: att.previewUrl || "",
            file: fileObj
          });
        } catch (attError) {
          console.error(`Error processing attachment ${att.id}:`, attError);
        }
      });
    }
    
    // Update states with a slight delay to ensure they're processed in order
    setNoteDrafts(draftMap);
    setNoteStatuses(statusMap);
    setNoteLabelIds(labelMap);
    setNoteAttachments(attachmentMap);
    
    console.log(`[useNoteManagement] Successfully loaded drafts and ${Object.keys(attachmentMap).length} attachments`);
  } catch (error) {
    console.error("Failed to load drafts:", error);
  }
}, [playlist.id]);
```

## Issue 2: Error When Clearing Notes with Attachments

The error occurs because when clearing notes, the system is trying to modify database objects with Blob/File references which can't be serialized properly.

### Root Cause
In `clearAllNotes`, the code is trying to update versions with attachment data which fails because Blob/File objects can't be serialized directly in IndexedDB.

### Solution

```typescript
// In src/features/notes/hooks/useNoteManagement.ts

// Update the clearAllNotes function
const clearAllNotes = async () => {
  try {
    // Clean up attachment previews
    Object.values(noteAttachments).forEach(attachments => {
      attachments.forEach(attachment => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    });
    
    // Clear attachments from database FIRST
    const versionIds = Object.keys(noteDrafts);
    console.log(`Clearing attachments for ${versionIds.length} versions`);
    
    // Use a batched approach to avoid overwhelming IndexedDB
    const batchSize = 5;
    for (let i = 0; i < versionIds.length; i += batchSize) {
      const batch = versionIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(versionId => playlistStore.clearAttachments(versionId, playlist.id))
      );
    }
    
    // Then clear note content
    for (let i = 0; i < versionIds.length; i += batchSize) {
      const batch = versionIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(versionId => playlistStore.saveDraft(versionId, playlist.id, "", ""))
      );
    }
    
    // Finally update statuses
    for (let i = 0; i < versionIds.length; i += batchSize) {
      const batch = versionIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(versionId => playlistStore.saveNoteStatus(versionId, playlist.id, "empty", ""))
      );
    }

    // Update in memory
    setNoteStatuses({});
    setNoteDrafts({});
    setNoteLabelIds({});
    setNoteAttachments({});
    setSelectedVersions([]);
  } catch (error) {
    console.error("Failed to clear all notes:", error);
    throw error;
  }
};
```

Also, update the `saveNoteStatus` function in `playlistStore.ts` to handle potential Blob data better:

```typescript
// In src/store/playlistStore.ts

async saveNoteStatus(
  versionId: string,
  playlistId: string,
  status: NoteStatus,
  content?: string,
  hasAttachments: boolean = false,
): Promise<void> {
  try {
    // If content is empty but has attachments, still set as draft
    let actualStatus = status;
    if (status === 'empty' && hasAttachments) {
      actualStatus = 'draft';
    }
    
    const modification: any = {
      noteStatus: actualStatus,
      lastModified: Date.now(),
    };

    // If content is provided, update it as well
    if (content !== undefined) {
      modification.draftContent = content;
    }

    log(`[PlaylistStore] Saving note status for version ${versionId}: ${actualStatus} (has attachments: ${hasAttachments})`);

    try {
      // Safer approach: first get the version to check for Blob data
      const version = await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, versionId])
        .first();
      
      if (version) {
        // If attachments exist, remove them from the version object before modifying
        if (version.attachments) {
          delete version.attachments;
        }
        
        // Update the version with our modifications
        Object.assign(version, modification);
        
        // Put back the modified version
        await db.versions.put(version);
      } else {
        // If version doesn't exist, no need to modify
        log(`[PlaylistStore] Version ${versionId} not found, skipping status update`);
      }
    } catch (modifyError) {
      // Fallback to basic update if full object update fails
      console.warn(`[PlaylistStore] Failed to update full version, trying direct modification:`, modifyError);
      
      await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, versionId])
        .modify(modification);
    }
  } catch (error) {
    console.error("Failed to save note status:", error);
    throw error;
  }
}
```

## Issue 3: Attachment List Doesn't Close When Clicking Away

The attachment dropdown needs to be modified to close when the user clicks outside of it.

### Root Cause
The `NoteAttachments` component lacks click-away functionality to detect when a user clicks outside the dropdown.

### Solution

```tsx
// In src/components/NoteAttachments.tsx

// Add these imports
import { useEffect, useRef } from "react";

export const NoteAttachments: React.FC<NoteAttachmentsProps> = ({
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Add click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (showAttachments && 
          dropdownRef.current && 
          buttonRef.current && 
          !dropdownRef.current.contains(event.target as Node) &&
          !buttonRef.current.contains(event.target as Node)) {
        setShowAttachments(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAttachments]);
  
  // Rest of component code...
  
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
          ref={buttonRef}
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
        <div 
          ref={dropdownRef}
          className="absolute z-50 bg-background border border-border rounded-md shadow-md p-3 mt-2 w-72"
        >
          {/* Rest of dropdown content */}
        </div>
      )}
    </div>
  );
};
```

## Additional Improvements

### Better Attachment Loading Consistency

```typescript
// In src/store/playlistStore.ts

// Improve the attachment state handling in the getPlaylist method
async getPlaylist(id: string): Promise<CachedPlaylist | null> {
  try {
    // ... existing code ...
    
    // Load attachments with better error handling
    const attachments = await db.attachments
      .where("playlistId")
      .equals(id)
      .toArray();
    
    // Make a deep copy of attachments to avoid reference issues
    const safeAttachments = attachments.map(att => ({
      ...att,
      // Don't include the data property to avoid serialization issues
      data: undefined
    }));
    
    // Store serialization-safe attachments on version objects
    cached.versions = cached.versions.map(version => {
      const versionAttachments = safeAttachments.filter(att => att.versionId === version.id);
      
      // Store the raw attachment data without any File/Blob objects
      (version as any).rawAttachments = versionAttachments;
      
      return version;
    });
    
    return cached;
  } catch (error) {
    console.error("Failed to get playlist:", error);
    return null;
  }
}
```

### Improved Attachment Serialization

```typescript
// In src/features/notes/hooks/useNoteManagement.ts

// Helper function to safely create UI attachments from raw stored attachments
const createUIAttachments = useCallback((rawAttachments: any[]): Attachment[] => {
  if (!rawAttachments || !Array.isArray(rawAttachments)) return [];
  
  return rawAttachments.map(att => {
    try {
      // Create a suitable file object that won't cause serialization issues
      let fileObj: File | string;
      
      if ((att as any).filePath) {
        fileObj = (att as any).filePath;
      } else {
        // Create an empty File object as a placeholder
        // The real file data will be accessed from the database when needed
        fileObj = new File([], att.name, { type: att.type });
      }
      
      return {
        id: att.id,
        name: att.name,
        type: att.type,
        previewUrl: att.previewUrl || "",
        file: fileObj
      };
    } catch (error) {
      console.error(`Error creating UI attachment for ${att.id}:`, error);
      return {
        id: att.id || crypto.randomUUID(),
        name: att.name || "Unknown file",
        type: att.type || "application/octet-stream",
        previewUrl: "",
        file: new File([], "placeholder.dat")
      };
    }
  });
}, []);
```

## Comprehensive Fix for Clearing Notes

```typescript
// In src/store/playlistStore.ts

// Improve the clearAttachments method to be more robust
async clearAttachments(
  versionId: string,
  playlistId: string
): Promise<void> {
  try {
    log(`[PlaylistStore] Clearing attachments for version ${versionId}`);
    
    // First get a count of attachments to confirm they exist
    const attachmentCount = await db.attachments
      .where("[versionId+playlistId]")
      .equals([versionId, playlistId])
      .count();
    
    log(`[PlaylistStore] Found ${attachmentCount} attachments to delete`);
    
    if (attachmentCount > 0) {
      // Delete all attachments for this version from the attachments table
      await db.attachments
        .where("[versionId+playlistId]")
        .equals([versionId, playlistId])
        .delete();
      
      log(`[PlaylistStore] Deleted ${attachmentCount} attachments`);
    }
    
    // Now update the version record to remove attachment references
    try {
      // Get the version first
      const version = await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, versionId])
        .first();
      
      if (version) {
        // Remove any attachment properties to avoid serialization issues
        if (version.attachments) delete version.attachments;
        if ((version as any).rawAttachments) delete (version as any).rawAttachments;
        
        // Update the modified timestamp
        version.lastModified = Date.now();
        
        // Put the modified version back
        await db.versions.put(version);
        log(`[PlaylistStore] Updated version ${versionId} to remove attachment references`);
      } else {
        log(`[PlaylistStore] Version ${versionId} not found, skipping update`);
      }
    } catch (versionError) {
      console.error(`[PlaylistStore] Error updating version ${versionId}:`, versionError);
      
      // Fallback to simple modification if full update fails
      await db.versions
        .where("[playlistId+id]")
        .equals([playlistId, versionId])
        .modify({ 
          lastModified: Date.now()
        });
    }
  } catch (error) {
    console.error("Failed to clear attachments:", error);
    throw error;
  }
}
```

## Final Recommendations

1. **Database operations**: Consider using a transaction for related database operations to ensure atomicity
2. **State management**: Simplify state management and carefully control how and when state is updated
3. **Error handling**: Implement better error recovery for attachment operations
4. **UI improvements**: Add more visual feedback when attachments are being processed
5. **Performance**: Consider lazy loading attachment data only when needed

These changes should address the three specific issues and provide a more robust attachment handling system in the application.