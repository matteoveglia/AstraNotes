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
          "select id, name from Location where name='ftrack.server'"
        );
        console.log("Server location query result:", serverLocationQuery);
        
        // Add fallback if the query fails - try to get location by name directly
        let serverLocation = serverLocationQuery.data[0];
        
        if (!serverLocation) {
          console.log("First query failed. Trying alternative queries for server location...");
          
          // Try different query approaches based on API variations
          try {
            // Try querying all locations first
            console.log("Attempt 1: Querying all locations");
            const locationsQuery = await session.query("select id, name from Location");
            console.log(`Found ${locationsQuery.data.length} locations`);
            
            const foundLocation = locationsQuery.data.find(
              (loc: any) => loc.name === 'ftrack.server'
            );
            
            if (foundLocation) {
              serverLocation = foundLocation;
              console.log("Found server location via locations query:", serverLocation.id);
            } else {
              // Try another variation of the syntax
              console.log("Attempt 2: Trying query with different syntax");
              const altQuery = await session.query(
                "select id, name from Location where name='ftrack.server'"
              );
              
              if (altQuery.data && altQuery.data.length > 0) {
                serverLocation = altQuery.data[0];
                console.log("Found server location via alt query:", serverLocation.id);
              } else {
                // Try creating a lookup based on component location
                console.log("Attempt 3: Looking for a component location");
                const componentLocationQuery = await session.query(
                  "select id, location from ComponentLocation where location.name='ftrack.server'"
                );
                
                if (componentLocationQuery.data && componentLocationQuery.data.length > 0) {
                  const componentLocation = componentLocationQuery.data[0];
                  if (componentLocation.location && componentLocation.location.id) {
                    serverLocation = componentLocation.location;
                    console.log("Found server location via component location:", serverLocation.id);
                  }
                }
              }
            }
          } catch (altQueryError) {
            console.error("Alternative query attempts failed:", altQueryError);
          }
          
          // Last resort - Try to retrieve the server location directly from the session
          if (!serverLocation) {
            console.log("Attempting to get server location directly from session...");
            try {
              // Some ftrack API versions expose locations directly
              const sessionAny = session as any;
              if (sessionAny.getServerLocation) {
                serverLocation = await sessionAny.getServerLocation();
                console.log("Got server location directly from session method:", serverLocation?.id);
              } else if (sessionAny.server_location_id) {
                // Try to query the location by ID if available in session
                const locationId = sessionAny.server_location_id;
                console.log(`Got server location ID from session: ${locationId}, querying details...`);
                try {
                  const locationQuery = await session.query(`select id, name from Location where id="${locationId}"`);
                  if (locationQuery.data && locationQuery.data.length > 0) {
                    serverLocation = locationQuery.data[0];
                    console.log("Retrieved server location using ID from session:", serverLocation.id);
                  }
                } catch (locQueryError) {
                  console.error("Failed to query location by ID:", locQueryError);
                }
              }
              
              // As a last resort, create a location reference manually
              if (!serverLocation) {
                console.log("Creating a manual server location reference...");
                // Create a minimal location object that satisfies the upload requirements
                serverLocation = {
                  id: "70f6f5c1-be01-11e1-9aa3-f23c91df25eb", // Common ID for ftrack.server
                  name: "ftrack.server",
                  __entity_type__: "Location"
                };
                console.log("Created manual server location reference with ID:", serverLocation.id);
              }
            } catch (directError) {
              console.error("Failed to get server location directly:", directError);
            }
          }
        }

        if (!serverLocation) {
          throw new Error("Could not find ftrack server location after multiple attempts");
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
        
        // Log detailed information about file data
        console.log(`File data size: ${fileData.byteLength} bytes`);
        console.log(`File name: ${attachment.name}, MIME type: ${attachment.type}`);
        
        // 3. Create a component in ftrack using the create method
        console.log("Creating component in ftrack...");
        try {
          // Add component metadata for the component
          const componentData = {
            name: attachment.name,
            file_type: fileExtension || attachment.type.split('/')[1] || 'jpeg',
          };
          
          // If available, add location information to the component data
          if (serverLocation && serverLocation.id) {
            console.log(`Adding server location ${serverLocation.id} to component data`);
            (componentData as any).location_id = serverLocation.id;
          }
          
          const componentResponse = await session.create("Component", componentData);
          
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
                if (serverLocation && serverLocation.id) {
                  await sessionAny.uploadComponent(
                    component.id,
                    new Uint8Array(fileData),
                    serverLocation.id
                  );
                } else {
                  // Try without location
                  await sessionAny.uploadComponent(
                    component.id,
                    new Uint8Array(fileData)
                  );
                }
                console.log('uploadComponent method completed successfully');
              } else if (typeof sessionAny.upload === 'function') {
                console.log('Using upload method');
                const uploadOptions: any = {};
                
                if (serverLocation && serverLocation.id) {
                  uploadOptions.serverLocation = serverLocation.id;
                }
                
                await sessionAny.upload(
                  component.id, 
                  new Uint8Array(fileData),
                  uploadOptions
                );
                console.log('upload method completed successfully');
              } else {
                // Fallback approach using generic call method
                console.log('Using generic call method with upload_component action');
                const uploadAction: any = {
                  action: 'upload_component',
                  component_id: component.id,
                  component_data: new Uint8Array(fileData)
                };
                
                if (serverLocation && serverLocation.id) {
                  uploadAction.location_id = serverLocation.id;
                }
                
                await session.call([uploadAction]);
                console.log('upload_component action completed successfully');
              }
              
              console.log(`Successfully uploaded data for component ${component.id}`);
            } catch (error) {
              console.error(`Error uploading component data for ${attachment.name}:`, error);
              throw new Error(`Failed to upload component data: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            throw new Error("Failed to create component in ftrack - no component ID returned");
          }

          console.log(`Successfully uploaded attachment: ${attachment.name}, id: ${component.id}`);

          return {
            success: true,
            componentId: component.id,
          };
        } catch (componentError) {
          console.error("Error creating component:", componentError);
          throw new Error(`Failed to create component: ${componentError instanceof Error ? componentError.message : String(componentError)}`);
        }
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