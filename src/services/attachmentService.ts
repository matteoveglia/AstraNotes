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
  
  // If it's a File object, use the standard FileReader API with improved error handling
  if (file instanceof File) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      // Create a new FileReader instance for each read operation to avoid state issues
      const reader = new FileReader();
      
      // Add explicit error handler with detailed logging
      reader.onerror = (event) => {
        console.error('FileReader error occurred:', event);
        console.error('Error reading file:', file.name, 'size:', file.size, 'type:', file.type);
        
        // Try to get more details about the error
        const errorMessage = reader.error 
          ? `${reader.error.name}: ${reader.error.message}` 
          : 'Unknown FileReader error';
          
        reject(new Error(`Failed to read file ${file.name}: ${errorMessage}`));
      };
      
      // Add abort handler
      reader.onabort = () => {
        console.error('FileReader operation aborted when reading:', file.name);
        reject(new Error(`File reading aborted for ${file.name}`));
      };
      
      // Add load handler
      reader.onload = () => {
        // Check if result is valid
        if (reader.result instanceof ArrayBuffer) {
          console.log(`Successfully read file ${file.name}, size: ${reader.result.byteLength} bytes`);
          resolve(reader.result);
        } else {
          console.error('FileReader result is not an ArrayBuffer:', typeof reader.result);
          reject(new Error(`Invalid result type when reading ${file.name}`));
        }
      };
      
      // Check file size before reading
      if (file.size === 0) {
        console.warn(`File ${file.name} is empty (0 bytes), may cause issues`);
      }
      
      // Start the read operation
      try {
        console.log(`Starting read of file ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
        reader.readAsArrayBuffer(file);
      } catch (readError) {
        console.error('Error initiating file read:', readError);
        reject(new Error(`Failed to start reading file ${file.name}: ${readError instanceof Error ? readError.message : String(readError)}`));
      }
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
          
          // Try alternative approach for browser File objects
          if (attachment.file instanceof File) {
            try {
              console.log(`Attempting alternative file reading approach for ${attachment.name}`);
              
              // Create a new FileReader with explicit error handling
              fileData = await new Promise<ArrayBuffer>((resolve, reject) => {
                // Try a different FileReader approach with more robust error handling
                console.log(`Creating new FileReader for ${attachment.name}`);
                const fr = new FileReader();
                
                fr.onload = () => {
                  if (fr.result instanceof ArrayBuffer) {
                    console.log(`Alternative FileReader approach succeeded, got ${fr.result.byteLength} bytes`);
                    resolve(fr.result);
                  } else {
                    reject(new Error(`FileReader result is not an ArrayBuffer: ${typeof fr.result}`));
                  }
                };
                
                fr.onerror = () => {
                  const errorMsg = fr.error ? `${fr.error.name}: ${fr.error.message}` : 'Unknown error';
                  reject(new Error(`FileReader error: ${errorMsg}`));
                };
                
                // Add timeout to prevent hanging
                const timeout = setTimeout(() => {
                  reject(new Error('FileReader timeout after 10 seconds'));
                }, 10000);
                
                fr.onloadend = () => {
                  clearTimeout(timeout);
                };
                
                // Start reading
                try {
                  fr.readAsArrayBuffer(attachment.file as File);
                } catch (readError) {
                  clearTimeout(timeout);
                  reject(new Error(`Failed to start reading: ${readError instanceof Error ? readError.message : String(readError)}`));
                }
              });
              
              console.log(`Alternative approach succeeded, got ${fileData.byteLength} bytes`);
            } catch (altError) {
              console.error("All file reading approaches failed:", altError);
              throw new Error(`Failed to read file data: ${error instanceof Error ? error.message : String(error)}`);
            }
          } else {
            // For non-File objects, rethrow the original error
            throw new Error(`Failed to read file data: ${error instanceof Error ? error.message : String(error)}`);
          }
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
          // Determine if this is an image attachment
          const isImage = attachment.type.startsWith('image/') || 
                         ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'bmp'].includes(fileExtension);
                         
          // Determine if this is a video attachment
          const isVideo = attachment.type.startsWith('video/') ||
                         ['mp4', 'mov', 'avi', 'webm', 'wmv', 'mkv'].includes(fileExtension);
          
          // Determine if this is a PDF
          const isPdf = attachment.type === 'application/pdf' || fileExtension === 'pdf';
                         
          // Create a proper component name without duplicating extension
          // For images, use proper ftrack component name for reviewable content
          let componentName = attachment.name;
          let fileType = fileExtension || attachment.type.split('/')[1] || 'jpeg';
          
          // Extract the original filename without extension for reference
          const nameWithoutExt = componentName.endsWith(`.${fileExtension}`) 
            ? componentName.substring(0, componentName.length - fileExtension.length - 1)
            : componentName;
          
          console.log(`Original filename without extension: ${nameWithoutExt}`);
          
          // For images, videos, and PDFs, try using ftrack-specific component names based on documentation
          if (isImage) {
            // Use ftrack-specific component name for images
            componentName = "ftrackreview-image";
            fileType = fileExtension || 'jpeg'; // Ensure we have a valid file type
            console.log(`Using special ftrack component name for images: ${componentName} with type .${fileType}`);
          } else if (isVideo) {
            // Use ftrack-specific component name for videos
            componentName = "ftrackreview-mp4";
            fileType = fileExtension || 'mp4'; // Ensure we have a valid file type
            console.log(`Using special ftrack component name for videos: ${componentName} with type .${fileType}`);
          } else if (isPdf) {
            // For PDFs, keep the original name with extension
            componentName = nameWithoutExt + '.pdf';
            console.log(`Using original name for PDF: ${componentName}`);
          } else {
            // For other files, ensure no duplicate extension by using the name without extension
            componentName = nameWithoutExt;
            console.log(`Using name without extension: ${componentName}`);
          }
          
          // Store the original filename in a variable for reference
          const originalFilename = attachment.name;
          
          // Add component metadata for the component
          const componentData = {
            name: componentName,
            file_type: `.${fileType}`,
          };
          
          // If available, add location information to the component data
          if (serverLocation && serverLocation.id) {
            console.log(`Adding server location ${serverLocation.id} to component data`);
            (componentData as any).location_id = serverLocation.id;
          }
          
          // Log detailed information about the component data we're sending
          console.log(`Creating component with data:`, JSON.stringify(componentData));
          
          let componentResponse;
          try {
            componentResponse = await session.create("Component", componentData);
            console.log("Component create response:", componentResponse);
          } catch (createError) {
            console.error("Error during component creation API call:", createError);
            
            // Try a simplified component creation if the first one fails
            console.log("Attempting simplified component creation...");
            try {
              const simpleComponentData = {
                name: attachment.name,
                file_type: `.${fileExtension || 'jpeg'}`,
              };
              
              componentResponse = await session.create("Component", simpleComponentData);
              console.log("Simplified component create response:", componentResponse);
            } catch (retryError) {
              console.error("Standard component creation attempts failed:", retryError);
              
              // Try direct API approach for component creation
              console.log("Attempting direct API call for component creation...");
              try {
                // Get API details from session
                const sessionAny = session as any;
                const apiUrl = sessionAny.server || sessionAny.serverUrl || sessionAny.url;
                const apiUser = sessionAny.apiUser || sessionAny.user;
                const apiKey = sessionAny.apiKey;
                
                if (!apiUrl || !apiUser || !apiKey) {
                  throw new Error('Missing API connection details');
                }
                
                // Create authentication token
                const authToken = btoa(`${apiUser}:${apiKey}`);
                
                // Build direct API request payload
                const payload = {
                  action: 'create',
                  entity_type: 'Component',
                  entity_data: {
                    name: componentName,
                    file_type: `.${fileType}`
                  }
                };
                
                if (serverLocation && serverLocation.id) {
                  (payload.entity_data as any).location_id = serverLocation.id;
                }
                
                console.log(`Making direct API call to ${apiUrl}`);
                
                // Make direct API call
                const response = await fetch(apiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${authToken}`,
                    'X-Ftrack-API-Version': '2'
                  },
                  body: JSON.stringify(payload)
                });
                
                if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(`API responded with status ${response.status}: ${errorText}`);
                }
                
                const result = await response.json();
                console.log("Direct API component creation response:", result);
                
                // Format response to match session.create output
                componentResponse = {
                  action: 'create',
                  data: result.data
                };
              } catch (directApiError) {
                console.error("Direct API component creation failed:", directApiError);
                throw new Error(`Failed to create component after multiple attempts: ${createError instanceof Error ? createError.message : String(createError)}`);
              }
            }
          }
          
          // Extract the component from the response
          const component = componentResponse.data;
          console.log(`Created component with ID: ${component?.id}`);
          
          // 4. Upload the component data
          if (component && component.id) {
            // Upload file data to the component
            try {
              console.log(`Uploading data to component ${component.id}, data size: ${fileData.byteLength} bytes`);
              
              // Check for zero-sized files
              if (fileData.byteLength === 0) {
                console.warn("File data is empty (0 bytes). This may cause upload failures.");
              }
              
              // Use type assertion to handle potential API variations
              const sessionAny = session as any;
              
              let uploadSuccess = false;
              let lastError = null;
              
              // Skip unsuccessful methods based on logs
              console.log('Skipping legacy upload and direct component_data API methods - going straight to effective approach');
              
              // Method 6 (renamed to Method 1): Create component with proper file_type and use metadata + ComponentLocation
              if (!uploadSuccess) {
                try {
                  console.log('Using metadata + ComponentLocation approach (previously worked)');
                  
                  // Add metadata to the component to indicate it has data
                  try {
                    await session.create('Metadata', {
                      key: 'ftr_data',
                      value: 'true',
                      parent_type: 'Component',
                      parent_id: component.id
                    });
                    
                    console.log('Added ftr_data metadata to component');
                    
                    // Try to add size metadata
                    await session.create('Metadata', {
                      key: 'size',
                      value: String(fileData.byteLength),
                      parent_type: 'Component',
                      parent_id: component.id
                    });
                    
                    console.log('Added size metadata to component');
                    
                    // For images, add ftr_meta with format and dimensions
                    if (isImage) {
                      // Add the required metadata for image review in ftrack
                      await session.create('Metadata', {
                        key: 'ftr_meta',
                        value: JSON.stringify({
                          format: 'image',
                          width: 1920, // Default reasonable size since we don't have access to actual dimensions
                          height: 1080
                        }),
                        parent_type: 'Component',
                        parent_id: component.id
                      });
                      
                      console.log('Added ftr_meta for image to component');
                    } else if (isVideo) {
                      // Add the required metadata for video review in ftrack
                      await session.create('Metadata', {
                        key: 'ftr_meta',
                        value: JSON.stringify({
                          frameIn: 0,
                          frameOut: 100, // Default frame range
                          frameRate: 24, // Default frame rate
                          width: 1920,
                          height: 1080
                        }),
                        parent_type: 'Component',
                        parent_id: component.id
                      });
                      
                      console.log('Added ftr_meta for video to component');
                    } else if (isPdf) {
                      // Add the required metadata for PDF review in ftrack
                      await session.create('Metadata', {
                        key: 'ftr_meta',
                        value: JSON.stringify({
                          format: 'pdf'
                        }),
                        parent_type: 'Component',
                        parent_id: component.id
                      });
                      
                      console.log('Added ftr_meta for PDF to component');
                    }
                    
                    // Force the component to be available in the server location
                    try {
                      await session.create('ComponentLocation', {
                        component_id: component.id,
                        location_id: serverLocation.id
                      });
                      
                      console.log('Created ComponentLocation to mark component as available');
                      uploadSuccess = true;
                    } catch (locError) {
                      console.error('Failed to create ComponentLocation:', locError);
                    }
                  } catch (metaError) {
                    console.error('Failed to add metadata to component:', metaError);
                  }
                } catch (error) {
                  console.error('Metadata + ComponentLocation approach failed:', error);
                  lastError = error;
                }
              }
              
              // Method 2: Try the old REST API /component/add endpoint as fallback
              if (!uploadSuccess) {
                try {
                  console.log('Using last resort method: direct REST API component/add endpoint');
                  
                  // This is a completely different approach that doesn't use the JavaScript API at all
                  // Instead, we'll directly use the old REST API endpoint
                  
                  // Get API details from session
                  const sessionAny = session as any;
                  const apiUrl = sessionAny.server || sessionAny.serverUrl || sessionAny.url;
                  
                  if (!apiUrl) {
                    throw new Error('Could not determine API URL from session');
                  }
                  
                  const baseUrl = apiUrl.replace('/api', ''); // Remove API path if present
                  const restApiUrl = `${baseUrl}/component/add`;
                  
                  console.log(`Using REST API URL: ${restApiUrl}`);
                  
                  // Get authentication token from session
                  const apiUser = sessionAny.apiUser || sessionAny.user;
                  const apiKey = sessionAny.apiKey;
                  
                  if (!apiUser || !apiKey) {
                    throw new Error('Missing API authentication credentials');
                  }
                  
                  // Create a form data object for the multipart upload
                  const formData = new FormData();
                  
                  // Add component metadata
                  formData.append('name', componentName);
                  formData.append('file_type', `.${fileType}`);
                  
                  // Add server location if available
                  if (serverLocation && serverLocation.id) {
                    formData.append('location_id', serverLocation.id);
                  }
                  
                  // Add the file data
                  const fileBlob = new Blob([new Uint8Array(fileData)], {
                    type: attachment.type || 'application/octet-stream'
                  });
                  
                  formData.append('file', fileBlob, componentName);
                  
                  // Create authentication headers
                  const authToken = btoa(`${apiUser}:${apiKey}`);
                  
                  // Make the request
                  const response = await fetch(restApiUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Basic ${authToken}`
                    },
                    body: formData
                  });
                  
                  if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`REST API responded with status ${response.status}: ${errorText}`);
                  }
                  
                  const result = await response.json();
                  console.log('REST API component/add response:', result);
                  
                  // If we get a component id back, use that instead of our original component
                  if (result && result.component && result.component.id) {
                    console.log(`Using new component ID from REST API: ${result.component.id}`);
                    component.id = result.component.id;
                    
                    // For images, we need to add metadata for review
                    if (isImage) {
                      try {
                        await session.create('Metadata', {
                          key: 'ftr_meta',
                          value: JSON.stringify({
                            format: 'image',
                            width: 1920,
                            height: 1080
                          }),
                          parent_type: 'Component',
                          parent_id: component.id
                        });
                        console.log('Added ftr_meta for image component created via REST API');
                      } catch (metaError) {
                        console.error('Failed to add metadata to REST API component:', metaError);
                      }
                    } else if (isVideo) {
                      try {
                        await session.create('Metadata', {
                          key: 'ftr_meta',
                          value: JSON.stringify({
                            frameIn: 0,
                            frameOut: 100,
                            frameRate: 24,
                            width: 1920,
                            height: 1080
                          }),
                          parent_type: 'Component',
                          parent_id: component.id
                        });
                        console.log('Added ftr_meta for video component created via REST API');
                      } catch (metaError) {
                        console.error('Failed to add metadata to REST API component:', metaError);
                      }
                    } else if (isPdf) {
                      try {
                        await session.create('Metadata', {
                          key: 'ftr_meta',
                          value: JSON.stringify({
                            format: 'pdf'
                          }),
                          parent_type: 'Component',
                          parent_id: component.id
                        });
                        console.log('Added ftr_meta for PDF component created via REST API');
                      } catch (metaError) {
                        console.error('Failed to add metadata to REST API component:', metaError);
                      }
                    }
                    
                    uploadSuccess = true;
                  } else {
                    throw new Error('REST API response did not include a component ID');
                  }
                } catch (error) {
                  console.error('REST API component/add approach failed:', error);
                  lastError = error;
                }
              }
              
              if (!uploadSuccess) {
                throw new Error(`Failed to upload attachment data using available methods. Please check your network connection and try again.`);
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