/**
 * @fileoverview attachmentService.ts
 * Service for handling file attachments and uploading to ftrack.
 */

import { Session } from "@ftrack/api";
// Import existing modules from the project
import { playlistStore } from "@/store/playlistStore";

export interface Attachment {
  id: string;
  name: string;
  type: string;
  previewUrl: string;
  file: File | string; // Can be a browser File object or a Tauri file path string
}

interface AttachmentUploadResult {
  success: boolean;
  componentId?: string;
  error?: Error;
}

/**
 * Helper function to convert a File to an ArrayBuffer
 */
async function fileToArrayBuffer(file: File | string): Promise<ArrayBuffer> {
  // Check if we're in a Tauri environment using a type-safe approach
  const isTauri = typeof window !== 'undefined' && 'window' in globalThis && window.__TAURI__ !== undefined;
  
  // If it's a file path string and we're in Tauri environment
  if (typeof file === 'string' && isTauri) {
    try {
      // Import the Tauri filesystem plugin
      const fs = await import('@tauri-apps/plugin-fs');
      
      // Read the file as binary data
      const fileData = await fs.readFile(file);
      
      // Return the buffer directly
      if (fileData.buffer) {
        return fileData.buffer;
      }
      
      // If buffer is not directly accessible, create a new one
      return new Uint8Array(fileData).buffer;
    } catch (error) {
      console.error('Error reading file with Tauri fs plugin:', error);
      
      // Try alternative approach using file path without fetch to avoid CORS issues
      try {
        console.log('Attempting alternative file read approach for:', file);
        // Log the path format we're trying to read
        console.log('File path format:', file);
        
        // For Tauri, we should avoid using fetch with file:// URLs
        // Instead, we'll use the readFile function again but with different options
        const fs = await import('@tauri-apps/plugin-fs');
        const fileData = await fs.readFile(file);
        return fileData.buffer;
      } catch (altError) {
        console.error('Alternative file read approach failed:', altError);
        throw new Error(`Failed to read file ${file}: ${altError instanceof Error ? altError.message : String(altError)}`);
      }
    }
  }
  
  // If it's a File object, use the standard FileReader API
  if (file instanceof File) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // If we got here, it's an unsupported file type
  throw new Error('Unsupported file type: file must be a File object or a file path string in Tauri environment');
}

/**
 * Service for uploading attachments to ftrack
 */
export class AttachmentService {
  /**
   * Upload a single attachment to ftrack
   */
  static async uploadAttachment(
    session: Session,
    attachment: Attachment
  ): Promise<AttachmentUploadResult> {
    try {
      console.log(`Uploading attachment: ${attachment.name} (${attachment.type})`);

      // 1. Get the ftrack server location using correct SQL syntax
      try {
        console.log("Querying for server location...");
        const serverLocationQuery = await session.query(
          "select Location where name is 'ftrack.server'"
        );
        console.log("Server location query result:", serverLocationQuery);
        
        // Add fallback if the query fails - try to get location by name directly
        let serverLocation = serverLocationQuery.data[0];
        
        if (!serverLocation) {
          console.log("Trying alternative query for server location...");
          // Try alternative approach to get the server location
          try {
            const locationsQuery = await session.query("select Location");
            console.log(`Found ${locationsQuery.data.length} locations`);
            
            serverLocation = locationsQuery.data.find(
              (loc: any) => loc.name === 'ftrack.server'
            );
            
            if (serverLocation) {
              console.log("Found server location via alternative query:", serverLocation.id);
            }
          } catch (altQueryError) {
            console.error("Alternative query failed:", altQueryError);
          }
        }

        if (!serverLocation) {
          throw new Error("Could not find ftrack server location");
        }

        // 2. Convert the file to ArrayBuffer
        let fileData: ArrayBuffer;
        try {
          console.log(`Converting file to ArrayBuffer: ${typeof attachment.file === 'string' ? attachment.file : attachment.file.name}`);
          fileData = await fileToArrayBuffer(attachment.file);
          
          // Check if we have valid file data
          if (fileData.byteLength === 0) {
            console.warn(`File data for ${attachment.name} is empty (0 bytes), attachment may fail`);
          } else {
            console.log(`Successfully read file data, size: ${fileData.byteLength} bytes`);
          }
        } catch (error) {
          console.error("Error processing file data:", error);
          throw new Error(`Failed to read file data: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Get file extension from name for file_type
        const fileExtension = attachment.name.split('.').pop()?.toLowerCase() || '';
        console.log(`Using file extension: ${fileExtension} for component creation`);
        
        // 3. Create a component in ftrack using the create method
        console.log("Creating component in ftrack...");
        const componentResponse = await session.create("Component", {
          name: attachment.name,
          file_type: fileExtension || attachment.type.split('/')[1] || 'jpeg',
        });
        
        console.log("Component create response:", componentResponse);
        
        // Extract the component from the response
        const component = componentResponse.data;
        console.log(`Created component with ID: ${component?.id}`);
        
        // 4. Upload the component data
        if (component && component.id) {
          // Upload file data to the component
          try {
            console.log(`Uploading data to component ${component.id}, data size: ${fileData.byteLength} bytes`);
            
            // Use type assertion to handle potential API variations
            const sessionAny = session as any;
            
            // Try different upload methods based on API version
            if (typeof sessionAny.uploadComponent === 'function') {
              console.log('Using uploadComponent method');
              await sessionAny.uploadComponent(
                component.id,
                new Uint8Array(fileData),
                serverLocation.id
              );
            } else if (typeof sessionAny.upload === 'function') {
              console.log('Using upload method');
              await sessionAny.upload(
                component.id, 
                new Uint8Array(fileData),
                {
                  serverLocation: serverLocation.id
                }
              );
            } else {
              // Fallback approach using generic call method
              console.log('Using generic call method with upload_component action');
              await session.call([{
                action: 'upload_component',
                component_id: component.id,
                component_data: new Uint8Array(fileData),
                location_id: serverLocation.id
              }]);
            }
            
            console.log(`Successfully uploaded data for component ${component.id}`);
          } catch (error) {
            console.error(`Error uploading component data for ${attachment.name}:`, error);
            throw new Error(`Failed to upload component data: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else {
          throw new Error("Failed to create component in ftrack");
        }

        console.log(`Successfully uploaded attachment: ${attachment.name}, id: ${component.id}`);

        return {
          success: true,
          componentId: component.id,
        };
      } catch (queryError) {
        console.error("Error querying for server location:", queryError);
        throw queryError;
      }
    } catch (error) {
      console.error("Failed to upload attachment:", error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Upload multiple attachments to ftrack
   */
  static async uploadAttachments(
    session: Session,
    attachments: Attachment[]
  ): Promise<{ 
    success: Attachment[]; 
    failed: Attachment[];
    componentIds: string[];
  }> {
    const success: Attachment[] = [];
    const failed: Attachment[] = [];
    const componentIds: string[] = [];

    for (const attachment of attachments) {
      const result = await this.uploadAttachment(session, attachment);
      
      if (result.success && result.componentId) {
        success.push(attachment);
        componentIds.push(result.componentId);
      } else {
        failed.push(attachment);
      }
    }

    return { 
      success, 
      failed,
      componentIds,
    };
  }

  /**
   * Attach uploaded components to a note
   */
  static async attachComponentsToNote(
    session: Session,
    noteId: string,
    componentIds: string[]
  ): Promise<boolean> {
    try {
      const noteComponents = await Promise.all(
        componentIds.map(componentId => 
          session.create(
            "NoteComponent",
            {
              component_id: componentId,
              note_id: noteId
            }
          )
        )
      );

      return noteComponents.every(comp => !!comp);
    } catch (error) {
      console.error("Error attaching components to note:", error);
      return false;
    }
  }
}
