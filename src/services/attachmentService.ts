/**
 * @fileoverview attachmentService.ts
 * Service for handling file attachments and uploading to ftrack using Tauri HTTP plugin.
 */

import { Session, SERVER_LOCATION_ID } from "@ftrack/api";
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { v4 as uuidv4 } from 'uuid';

export interface Attachment {
  id: string;
  name: string;
  type: string;
  previewUrl: string;
  file: File | string; // Can be a File object or a Tauri file path
}

interface AttachmentUploadResult {
  success: boolean;
  componentId?: string;
  error?: Error;
}

interface UploadMetadataResponse {
  url?: string;
  headers?: Record<string, string>;
  urls?: Array<{
    part_number: number;
    signed_url: string;
  }>;
  upload_id?: string;
}

/**
 * Helper function to convert a string file path to a File object
 * (only when using in Tauri environment)
 */
async function getFileFromPath(filePath: string): Promise<File> {
    try {
      // Import the Tauri filesystem plugin
      const fs = await import('@tauri-apps/plugin-fs');
      
    // Read the file
    const fileData = await fs.readFile(filePath);
    
    // Get file name from path
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || 'file';
    
    // Get MIME type based on extension
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    let mimeType = 'application/octet-stream'; // Default
    
    // Simple MIME type mapping
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      json: 'application/json',
    };
    
    if (extension && mimeTypes[extension]) {
      mimeType = mimeTypes[extension];
    }
    
    // Create a Blob with the file data
    const blob = new Blob([fileData], { type: mimeType });
    
    // Convert Blob to File
    return new File([blob], fileName, { type: mimeType });
    } catch (error) {
      console.error('Error reading file with Tauri fs plugin:', error);
    throw new Error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Helper function to extract image dimensions when possible
 * Returns default dimensions if extraction fails
 */
async function getImageDimensions(file: File): Promise<{width: number, height: number}> {
  // Default dimensions if we can't extract actual dimensions
  const defaultDimensions = { width: 1920, height: 1080 };
  
  // Only attempt for image files
  if (!file.type.startsWith('image/')) {
    return defaultDimensions;
  }
  
  try {
    // Create an object URL for the image
    const objectUrl = URL.createObjectURL(file);
    
    // Create a promise that resolves with the image dimensions
    const dimensions = await new Promise<{width: number, height: number}>((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
        URL.revokeObjectURL(objectUrl);
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image for dimension extraction'));
        URL.revokeObjectURL(objectUrl);
      };
      
      img.src = objectUrl;
    });
    
    console.log(`Extracted image dimensions: ${dimensions.width}x${dimensions.height}`);
    return dimensions;
  } catch (error) {
    console.warn('Failed to extract image dimensions, using defaults:', error);
    return defaultDimensions;
  }
}

/**
 * Helper function to convert ArrayBuffer to base64 string
 * Processes in batches to avoid call stack size errors with large files
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const batchSize = 1024; // Process 1KB at a time to avoid stack overflow
  
  for (let i = 0; i < bytes.length; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, bytes.length);
    const batchArray = bytes.slice(i, batchEnd);
    binary += String.fromCharCode.apply(null, Array.from(batchArray));
  }
  
  return btoa(binary);
}

/**
 * Convert a file to a base64 string without the data URL prefix
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Get only the base64 part after the comma
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Service for uploading attachments to ftrack using Tauri HTTP plugin
 */
export class AttachmentService {
  /**
   * Get API authentication headers from session
   */
  private static getAuthHeaders(session: Session): Record<string, string> {
    // Extract authentication details from the session
    const sessionAny = session as any;
    const apiUser = sessionAny.apiUser;
    const apiKey = sessionAny.apiKey;
    
    if (!apiUser || !apiKey) {
      throw new Error('Missing API authentication credentials');
    }
    
    // Create Basic Auth token
    const authToken = btoa(`${apiUser}:${apiKey}`);
    
    // Return headers object
    return {
      'Authorization': `Basic ${authToken}`
    };
  }
  
  /**
   * Get server URL from session
   */
  private static getServerUrl(session: Session): string {
    const sessionAny = session as any;
    const apiUrl = sessionAny.server || sessionAny.serverUrl || sessionAny.url;
    
    if (!apiUrl) {
      throw new Error('Could not determine API URL from session');
    }
    
    return apiUrl.replace('/api', ''); // Remove API path if present
  }
  
  /**
   * Upload a component to ftrack using Tauri HTTP plugin
   */
  static async uploadAttachment(
    session: Session,
    attachment: Attachment,
    onProgress?: (progress: number) => void
  ): Promise<AttachmentUploadResult> {
    try {
      console.log(`Uploading attachment: ${attachment.name} (${attachment.type})`);

      // Convert string file path to File object if needed
      let file: File;
      if (typeof attachment.file === 'string') {
        file = await getFileFromPath(attachment.file);
      } else if (attachment.file instanceof File) {
        file = attachment.file;
      } else {
        throw new Error('Attachment file must be a File object or file path string');
      }
      
      // Get file details
      const fileName = file.name;
      const fileSize = file.size;
      const fileType = file.type;
      
      console.log(`File details: name=${fileName}, size=${fileSize}, type=${fileType}`);
      
      // Get file extension
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
      
      // Determine if this is an image, video, or PDF
      const isImage = fileType.startsWith('image/') || 
                     ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'bmp'].includes(fileExtension);
                     
      const isVideo = fileType.startsWith('video/') ||
                     ['mp4', 'mov', 'avi', 'webm', 'wmv', 'mkv'].includes(fileExtension);
      
      const isPdf = fileType === 'application/pdf' || fileExtension === 'pdf';
      
      // Extract the original filename without extension
      const nameWithoutExt = fileName.endsWith(`.${fileExtension}`) 
        ? fileName.substring(0, fileName.length - fileExtension.length - 1)
        : fileName;
      
      // Determine component name based on file type
      let componentName: string;
      
      // Use ftrack-specific component names based on content type
      if (isImage) {
        componentName = "ftrackreview-image";
        console.log(`Using special ftrack component name for images: ${componentName}`);
      } else if (isVideo) {
        componentName = "ftrackreview-mp4";
        console.log(`Using special ftrack component name for videos: ${componentName}`);
      } else if (isPdf) {
        componentName = nameWithoutExt + '.pdf';
        console.log(`Using original name for PDF: ${componentName}`);
      } else {
        componentName = nameWithoutExt;
        console.log(`Using name without extension: ${componentName}`);
      }
      
      // 1. Get the ftrack server location
        console.log("Querying for server location...");
        const serverLocationQuery = await session.query(
          "select id, name from Location where name='ftrack.server'"
        );
      
      if (!serverLocationQuery.data || !serverLocationQuery.data.length) {
        throw new Error("Could not find ftrack server location");
      }
      
      const serverLocation = serverLocationQuery.data[0];
      console.log(`Found server location: ${serverLocation.name} (${serverLocation.id})`);
      
      // Step 1: Create component entity in ftrack
      console.log('Creating component entity in ftrack...');
      
      const componentData = {
        name: componentName,
        file_type: `.${fileExtension}`,
      };
      
      if (serverLocation && serverLocation.id) {
        (componentData as any).location_id = serverLocation.id;
      }
      
      console.log(`Creating component with data:`, JSON.stringify(componentData));
      
      const componentResponse = await session.create("Component", componentData);
      
      if (!componentResponse.data || !componentResponse.data.id) {
        throw new Error('Failed to create component entity');
      }
      
      const component = componentResponse.data;
      console.log(`Created component entity with ID: ${component.id}`);
      
      // Step 2: Set up component metadata based on file type
      console.log(`Setting up component metadata for ${isImage ? 'image' : isVideo ? 'video' : isPdf ? 'PDF' : 'file'} component...`);
      
      // Add type-specific metadata for proper viewing
      if (isImage) {
        // Try to get the actual dimensions for images if possible
        let dimensions;
        try {
          dimensions = await getImageDimensions(file);
        } catch (dimError) {
          console.warn("Could not extract image dimensions, using defaults:", dimError);
          dimensions = { width: 1920, height: 1080 };
        }
        
        await session.create('Metadata', {
          key: 'ftr_meta',
          value: JSON.stringify({
            format: 'image',
            width: dimensions.width,
            height: dimensions.height
          }),
          parent_type: 'Component',
          parent_id: component.id
        });
        console.log(`Added ftr_meta for image to component with dimensions ${dimensions.width}x${dimensions.height}`);
      } else if (isVideo) {
        await session.create('Metadata', {
          key: 'ftr_meta',
          value: JSON.stringify({
            frameIn: 0,
            frameOut: 100,  // Default frame range
            frameRate: 24,  // Default frame rate
            width: 1920,
            height: 1080
          }),
          parent_type: 'Component',
          parent_id: component.id
        });
        console.log('Added ftr_meta for video to component');
      } else if (isPdf) {
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
      
      // Step 3: Convert file to array buffer for upload
      console.log(`Converting file to array buffer for upload...`);
      const fileArrayBuffer = await file.arrayBuffer();
      const fileUint8Array = new Uint8Array(fileArrayBuffer);
      
      // Step 4: Try to get a signed URL for upload
      console.log('Getting upload metadata...');
      
      // Calculate API URL for upload
      const baseUrl = this.getServerUrl(session);
      const authHeaders = this.getAuthHeaders(session);
      
      let uploadSuccess = false;
      
      // Approach 1: Try using the component/upload endpoint
      try {
        console.log('Trying direct component upload with Tauri HTTP plugin');
        
        // Build the upload URL
        const uploadUrl = `${baseUrl}/component/upload`;
        console.log(`Using upload URL: ${uploadUrl}`);
        
        // Create FormData for file upload
        const formData = new FormData();
        
        // Add the component ID
        formData.append('component_id', component.id);
        
        // Add the file data
        const fileBlob = new Blob([fileUint8Array], {
          type: fileType || 'application/octet-stream'
        });
        
        formData.append('file', fileBlob, fileName);
        
        // Make the upload request using Tauri HTTP plugin
        const uploadResponse = await tauriFetch(uploadUrl, {
          method: 'POST',
          headers: authHeaders,
          body: formData
        });
        
        if (!uploadResponse.ok) {
          throw new Error(`Direct upload responded with status ${uploadResponse.status}: ${uploadResponse.statusText}`);
        }
        
        const result = await uploadResponse.json();
        console.log('Direct component upload response:', result);
        
        uploadSuccess = true;
        console.log('Successfully uploaded file content using direct upload endpoint');
        
      } catch (directUploadError) {
        console.error("Direct component upload failed:", directUploadError);
        
        // Approach 2: Try using the component/file endpoint
        try {
          console.log('Trying component/file endpoint with Tauri HTTP plugin');
          
          // Build the file upload URL
          const fileUploadUrl = `${baseUrl}/component/file`;
          console.log(`Using file upload URL: ${fileUploadUrl}`);
          
          // Create FormData for file upload
          const formData = new FormData();
          
          // Add the component ID
          formData.append('id', component.id);
          
          // Add the file data
          const fileBlob = new Blob([fileUint8Array], {
            type: fileType || 'application/octet-stream'
          });
          
          formData.append('file', fileBlob, fileName);
          
          // Make the upload request using Tauri HTTP plugin
          const uploadResponse = await tauriFetch(fileUploadUrl, {
            method: 'POST',
            headers: authHeaders,
            body: formData
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`File upload responded with status ${uploadResponse.status}: ${uploadResponse.statusText}`);
          }
          
          const result = await uploadResponse.json();
          console.log('Component file upload response:', result);
          
          uploadSuccess = true;
          console.log('Successfully uploaded file content using component/file endpoint');
          
        } catch (fileUploadError) {
          console.error("Component/file upload failed:", fileUploadError);
          
          // Approach 3: Try using component get-signed-url approach
          try {
            console.log('Trying signed URL upload with Tauri HTTP plugin');
            
            // Get a signed URL for the component
            const signedUrlResponse = await tauriFetch(`${baseUrl}/component/${component.id}/get-signed-url`, {
              method: 'GET',
              headers: authHeaders
            });
            
            if (!signedUrlResponse.ok) {
              throw new Error(`Failed to get signed URL: ${signedUrlResponse.status}: ${signedUrlResponse.statusText}`);
            }
            
            const signedUrlResult = await signedUrlResponse.json() as UploadMetadataResponse;
            console.log('Signed URL response:', signedUrlResult);
            
            // Check if we got a multipart upload or direct URL
            if (signedUrlResult.urls && signedUrlResult.urls.length > 0 && signedUrlResult.upload_id) {
              // Multi-part upload
              console.log(`Using multi-part upload with ${signedUrlResult.urls.length} parts`);
              
              const parts = [];
              const partSize = Math.ceil(fileSize / signedUrlResult.urls.length);
              
              // Upload each part
              for (let i = 0; i < signedUrlResult.urls.length; i++) {
                const partInfo = signedUrlResult.urls[i];
                const partNumber = partInfo.part_number;
                const partUrl = partInfo.signed_url;
                
                console.log(`Uploading part ${partNumber}/${signedUrlResult.urls.length}`);
                
                // Calculate part boundaries
                const start = (partNumber - 1) * partSize;
                const end = Math.min(start + partSize, fileSize);
                const partData = fileUint8Array.slice(start, end);
                
                if (onProgress) {
                  onProgress(Math.floor((i / signedUrlResult.urls.length) * 90)); // 0-90% for upload
                }
                
                // Upload part using Tauri HTTP plugin
                const partResponse = await tauriFetch(partUrl, {
                  method: 'PUT',
                  body: partData
                });
                
                if (!partResponse.ok) {
                  throw new Error(`Failed to upload part ${partNumber}: ${partResponse.status}`);
                }
                
                // Get ETag from response headers
                const eTag = partResponse.headers.get('ETag');
                
                if (!eTag) {
                  throw new Error(`No ETag received for part ${partNumber}`);
                }
                
                // Strip quotes from ETag
                const cleanETag = eTag.replace(/"/g, '');
                
                // Add to parts array
                parts.push({
                  part_number: partNumber,
                  e_tag: cleanETag
                });
                
                console.log(`Successfully uploaded part ${partNumber}, ETag: ${cleanETag}`);
              }
              
              // Complete multipart upload
              console.log('Completing multipart upload...');
              
              const completeResponse = await tauriFetch(`${baseUrl}/component/${component.id}/complete-multipart-upload`, {
                method: 'POST',
                headers: {
                  ...authHeaders,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  upload_id: signedUrlResult.upload_id,
                  parts: parts
                })
              });
              
              if (!completeResponse.ok) {
                throw new Error(`Failed to complete multipart upload: ${completeResponse.status}`);
              }
              
              console.log('Successfully completed multipart upload');
              uploadSuccess = true;
              
            } else if (signedUrlResult.url) {
              // Direct URL upload
              console.log('Using direct signed URL upload');
              
              // Upload file using Tauri HTTP plugin
              const uploadResponse = await tauriFetch(signedUrlResult.url, {
                method: 'PUT',
                headers: signedUrlResult.headers || {},
                body: fileUint8Array
              });
              
              if (!uploadResponse.ok) {
                throw new Error(`Failed to upload to signed URL: ${uploadResponse.status}`);
              }
              
              console.log('Successfully uploaded file to signed URL');
              
              // Process the component
              const processResponse = await tauriFetch(`${baseUrl}/component/${component.id}/process`, {
                method: 'POST',
                headers: authHeaders
              });
              
              console.log(`Process component response status: ${processResponse.status}`);
              uploadSuccess = true;
          } else {
              throw new Error('Invalid upload metadata: missing url or urls');
            }
            
            if (onProgress) {
              onProgress(95); // Almost done
            }
            
          } catch (signedUrlError) {
            console.error("Signed URL upload failed:", signedUrlError);
            
            // Try data URL approach before falling back to metadata-only
            try {
              console.log("Trying data URL approach by embedding file data in metadata");
              
              // Check file size - data URLs work best with smaller files
              const fileSizeMB = fileSize / (1024 * 1024);
              console.log(`File size is ${fileSizeMB.toFixed(2)} MB`);
              
              // For small files (<= 256KB), use a single data URL
              const MAX_SINGLE_CHUNK = 256 * 1024; // 256KB
              if (fileSize <= MAX_SINGLE_CHUNK) {
                console.log(`File is small enough (${(fileSize/1024).toFixed(2)}KB) for single base64 encoding`);
                
                // Convert to base64
                const base64Data = arrayBufferToBase64(fileArrayBuffer);
                console.log(`Encoded file to base64 string (${base64Data.length} chars)`);
                
                // Create the data URL format that ftrack expects
                const dataUrl = `data:${fileType || 'application/octet-stream'};base64,${base64Data}`;
                
                // Add as ftrack_data metadata (this is the key ftrack looks for)
                await session.create('Metadata', {
                  key: 'ftrack_data',
                  value: dataUrl,
                  parent_type: 'Component',
                  parent_id: component.id
                });
                
                console.log(`Added full data URL as ftrack_data metadata`);
                
                // Important: Also set the format metadata
                await session.create('Metadata', {
                  key: 'format',
                  value: isImage ? 'image' : (isVideo ? 'video' : (isPdf ? 'pdf' : 'binary')),
                  parent_type: 'Component',
                  parent_id: component.id
                });
                
                // For images, add specific dimensions in the data URL approach too
                if (isImage) {
                  // Try to get dimensions if not already retrieved
                  let dimensions;
                  try {
                    dimensions = await getImageDimensions(file);
                    console.log(`Using actual image dimensions for data URL approach: ${dimensions.width}x${dimensions.height}`);
                  } catch (dimError) {
                    console.warn("Could not extract image dimensions for data URL, using defaults:", dimError);
                    dimensions = { width: 1920, height: 1080 };
                  }
                  
                  // Add separate dimension metadata that some ftrack installations use
                  await session.create('Metadata', {
                    key: 'width',
                    value: String(dimensions.width),
                    parent_type: 'Component',
                    parent_id: component.id
                  });
                  
                  await session.create('Metadata', {
                    key: 'height',
                    value: String(dimensions.height),
                    parent_type: 'Component',
                    parent_id: component.id
                  });
                } else if (isVideo) {
                  // For videos, add reasonable default dimension metadata
                  await session.create('Metadata', {
                    key: 'width',
                    value: '1920',
                    parent_type: 'Component',
                    parent_id: component.id
                  });
                  
                  await session.create('Metadata', {
                    key: 'height',
                    value: '1080',
                    parent_type: 'Component',
                    parent_id: component.id
                  });
                  
                  // Also add frame rate
                  await session.create('Metadata', {
                    key: 'frame_rate',
                    value: '24',
                    parent_type: 'Component',
                    parent_id: component.id
                  });
                }
                
                uploadSuccess = true;
                console.log(`Added complete file data as single base64 data URL`);
              } else {
                // For larger files, use chunked approach
                console.log(`Using chunked data URL approach for larger file (${fileSizeMB.toFixed(2)} MB)`);
                
                // Calculate number of chunks (aim for ~256KB chunks)
                const chunkSize = 256 * 1024; // 256KB chunks
                const totalChunks = Math.ceil(fileSize / chunkSize);
                
                console.log(`Splitting file into ${totalChunks} chunks of ~256KB each`);
                
                // Store metadata about the chunking
                await session.create('Metadata', {
                  key: 'ftrack_data_chunked',
                  value: JSON.stringify({
                    totalChunks,
                    totalSize: fileSize,
                    chunkSize,
                    mimeType: fileType || 'application/octet-stream'
                  }),
                  parent_type: 'Component',
                  parent_id: component.id
                });
                
                // Store each chunk
                for (let i = 0; i < totalChunks; i++) {
                  const start = i * chunkSize;
                  const end = Math.min(start + chunkSize, fileSize);
                  const chunkData = fileUint8Array.slice(start, end);
                  
                  // Convert chunk to base64
                  const base64Chunk = arrayBufferToBase64(chunkData.buffer);
                  
                  // Store chunk with ftrack's expected naming pattern
                  await session.create('Metadata', {
                    key: `ftrack_data_chunk_${i}`,
                    value: base64Chunk,
                    parent_type: 'Component',
                    parent_id: component.id
                  });
                  
                  console.log(`Uploaded chunk ${i + 1}/${totalChunks} (${chunkData.length} bytes) as ftrack_data_chunk_${i}`);
                  
                  if (onProgress) {
                    onProgress(85 + Math.floor((i / totalChunks) * 10)); // 85-95% for chunked upload
                  }
                }
                
                uploadSuccess = true;
                console.log(`Successfully uploaded all ${totalChunks} chunks as ftrack_data_chunk_* metadata`);
              }
              
              // Add standard flags that ftrack looks for
              await session.create('Metadata', {
                key: 'data_stored',
                value: 'true',
                parent_type: 'Component',
                parent_id: component.id
              });
              
              await session.create('Metadata', {
                key: 'source_component',
                value: 'true',
                parent_type: 'Component',
                parent_id: component.id
              });
              
              await session.create('Metadata', {
                key: 'ftr_data',
                value: 'true',
                parent_type: 'Component',
                parent_id: component.id
              });
              
              // Extra metadata to help with discovery
              await session.create('Metadata', {
                key: 'size',
                value: String(fileSize),
                parent_type: 'Component',
                parent_id: component.id
              });
              
              await session.create('Metadata', {
                key: 'content_type',
                value: fileType || 'application/octet-stream',
                parent_type: 'Component',
                parent_id: component.id
              });
              
            } catch (dataUrlError) {
              console.error("Data URL approach failed:", dataUrlError);
              
              // Fallback to metadata-only approach if all upload attempts failed
              console.log("Data URL approach failed, falling back to metadata-only approach");
              
              // Add basic metadata to help ftrack find the component
              await session.create('Metadata', {
                key: 'data_stored',
                value: 'true',
                parent_type: 'Component',
                parent_id: component.id
              });
              
              await session.create('Metadata', {
                key: 'source_component',
                value: 'true',
                parent_type: 'Component',
                parent_id: component.id
              });
              
              // Add size metadata
              await session.create('Metadata', {
                key: 'size',
                value: String(fileSize),
                parent_type: 'Component',
                parent_id: component.id
              });
              
              console.log("Added fallback metadata to component");
            }
          }
        }
      }
      
      // Step 5: Mark component as available in server location with enhanced metadata
      console.log('Marking component as available in server location...');
      
      await session.create('ComponentLocation', {
        component_id: component.id,
        location_id: serverLocation.id,
        resource_identifier: `file://${fileName}`,
        available: true
      });
      
      console.log(`Created enhanced ComponentLocation to mark component as available`);
      
      // Try adding component to ftrack.unmanaged location for better compatibility
      try {
        const unmanagedLocationQuery = await session.query(
          "select id, name from Location where name='ftrack.unmanaged'"
        );
        
        if (unmanagedLocationQuery.data && unmanagedLocationQuery.data.length > 0) {
          const unmanagedLocation = unmanagedLocationQuery.data[0];
          
          await session.create('ComponentLocation', {
            component_id: component.id,
            location_id: unmanagedLocation.id,
            resource_identifier: `file://${fileName}`,
            available: true
          });
          
          console.log(`Also added component to ftrack.unmanaged location`);
        }
      } catch (unmanagedError) {
        console.log('No ftrack.unmanaged location found, continuing anyway');
      }
      
      // Try adding component to ftrack.origin location for better compatibility
      try {
        const originLocationQuery = await session.query(
          "select id, name from Location where name='ftrack.origin'"
        );
        
        if (originLocationQuery.data && originLocationQuery.data.length > 0) {
          const originLocation = originLocationQuery.data[0];
          
          await session.create('ComponentLocation', {
            component_id: component.id,
            location_id: originLocation.id,
            resource_identifier: `file://${fileName}`,
            available: true
          });
          
          console.log(`Also added component to ftrack.origin location`);
        }
      } catch (originError) {
        console.log('No ftrack.origin location found, continuing anyway');
      }
      
      if (onProgress) {
        onProgress(100);
      }
      
      // All done
      console.log(`Successfully ${uploadSuccess ? 'uploaded' : 'created metadata for'} component: ${component.id}`);
      
      return {
        success: true,
        componentId: component.id
      };
    } catch (error) {
      console.error("Failed to upload attachment:", error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Simplified image upload using ftrack's expected pattern
   */
  static async uploadImage(
    session: Session,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<AttachmentUploadResult> {
    try {
      console.log(`Uploading image: ${file.name} (${file.size} bytes)`);
      
      // Step 1: Create a FileComponent
      const componentId = uuidv4();
      console.log(`Creating component with ID: ${componentId}`);
      
      const componentResponse = await session.create('FileComponent', {
        id: componentId,
        name: "ftrackreview-image",
        file_type: `.${file.name.split('.').pop()}`,
        size: file.size
      });
      
      console.log(`Component created: ${componentId}`);
      
      // Step 2: Get image dimensions (if possible)
      let width = 1920;  // Default width
      let height = 1080; // Default height
      
      try {
        const dimensions = await getImageDimensions(file);
        width = dimensions.width;
        height = dimensions.height;
        console.log(`Image dimensions: ${width}x${height}`);
      } catch (error) {
        console.warn('Could not get image dimensions, using defaults', error);
      }
      
      // Step 3: Convert image to base64
      const base64 = await fileToBase64(file);
      console.log(`Converted image to base64 (${base64.length} chars)`);
      
      // Step 4: Add metadata for ftrack to recognize this as an image with embedded data
      // Add image-specific metadata
      await session.create('Metadata', {
        key: 'ftr_meta',
        value: JSON.stringify({
          format: 'image',
          width: width,
          height: height
        }),
        parent_type: 'FileComponent',
        parent_id: componentId
      });
      
      // Add the data as a base64 string (without data URL prefix)
      // Use ftrack_image_data specifically for images
      await session.create('Metadata', {
        key: 'ftrack_image_data',  // Key specifically for images
        value: base64,
        parent_type: 'FileComponent',
        parent_id: componentId
      });
      
      // Add standard flags
      await session.create('Metadata', {
        key: 'source_component',
        value: 'true',
        parent_type: 'FileComponent',
        parent_id: componentId
      });
      
      await session.create('Metadata', {
        key: 'data_stored',
        value: 'true',
        parent_type: 'FileComponent',
        parent_id: componentId
      });
      
      // Step 5: Create ComponentLocation
      await session.create('ComponentLocation', {
        component_id: componentId,
        location_id: SERVER_LOCATION_ID,
        resource_identifier: componentId
      });
      
      console.log(`Successfully uploaded image as component: ${componentId}`);
      
      if (onProgress) {
        onProgress(100);
      }
      
      return {
        success: true,
        componentId
      };
    } catch (error) {
      console.error('Error uploading image to ftrack:', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Upload multiple attachments to ftrack
   */
  static async uploadAttachments(
    session: Session,
    attachments: Attachment[],
    onProgress?: (attachment: Attachment, progress: number) => void
  ): Promise<{ 
    success: Attachment[]; 
    failed: Attachment[];
    componentIds: string[];
  }> {
    const success: Attachment[] = [];
    const failed: Attachment[] = [];
    const componentIds: string[] = [];

    for (const attachment of attachments) {
      const result = await this.uploadAttachment(
        session, 
        attachment,
        progress => {
          if (onProgress) {
            onProgress(attachment, progress);
          }
        }
      );
      
      if (result.success && result.componentId) {
        success.push(attachment);
        componentIds.push(result.componentId);
      } else {
        failed.push(attachment);
        console.warn(`Failed to upload attachment: ${attachment.name}`, result.error);
      }
    }

    return { success, failed, componentIds };
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
      console.log(`Attaching ${componentIds.length} components to note ${noteId}`);
      
      if (!componentIds.length) {
        console.log('No components to attach to note');
        return true; // No components to attach is considered a success
      }

      // Log each component being attached
      componentIds.forEach((componentId, index) => {
        console.log(`Component ${index + 1}/${componentIds.length}: ${componentId}`);
      });

      const noteComponents = await Promise.all(
        componentIds.map(async (componentId, index) => {
          try {
            console.log(`Creating NoteComponent link for component ${index + 1}/${componentIds.length} (${componentId})`);
            
            const result = await session.create(
            "NoteComponent",
            {
              component_id: componentId,
              note_id: noteId
            }
            );
            
            console.log(`Successfully linked component ${componentId} to note ${noteId}`);
            return result;
          } catch (error) {
            console.error(`Failed to link component ${componentId} to note ${noteId}:`, error);
            return null;
          }
        })
      );

      const successCount = noteComponents.filter(Boolean).length;
      console.log(`Attached ${successCount}/${componentIds.length} components to note ${noteId}`);
      
      // Consider it successful if at least one component was attached
      // This prevents an all-or-nothing approach that could cause notes to be rejected
      return successCount > 0 || componentIds.length === 0;
    } catch (error) {
      console.error(`Error attaching components to note ${noteId}:`, error);
      return false;
    }
  }

  /**
   * Validate attachments before upload
   * This can be used to ensure attachments meet ftrack requirements
   */
  static validateAttachment(attachment: Attachment): { 
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check for required fields
    if (!attachment.id) {
      errors.push('Attachment is missing an ID');
    }
    
    if (!attachment.name) {
      errors.push('Attachment is missing a name');
    }
    
    if (!attachment.type) {
      warnings.push('Attachment is missing a MIME type');
    }
    
    // Check file
    if (!attachment.file) {
      errors.push('Attachment has no file data');
    } else {
      // Check file type specific validations
      const fileExtension = attachment.name.split('.').pop()?.toLowerCase() || '';
      
      // Check for image files
      const isImage = attachment.type.startsWith('image/') || 
                     ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'bmp'].includes(fileExtension);
      
      // Check for video files
      const isVideo = attachment.type.startsWith('video/') ||
                     ['mp4', 'mov', 'avi', 'webm', 'wmv', 'mkv'].includes(fileExtension);
      
      // Check for PDF files
      const isPdf = attachment.type === 'application/pdf' || fileExtension === 'pdf';
      
      // For image files
      if (isImage) {
        // Check that the file extension matches the MIME type
        if (attachment.type.startsWith('image/')) {
          const mimeSubtype = attachment.type.split('/')[1];
          if (fileExtension && mimeSubtype !== fileExtension && 
              !(mimeSubtype === 'jpeg' && fileExtension === 'jpg')) {
            warnings.push(`Image file extension (${fileExtension}) doesn't match MIME type (${mimeSubtype})`);
          }
        }
      }
      
      // For video files
      if (isVideo) {
        // Check for supported video formats
        if (!['mp4', 'mov', 'avi', 'webm'].includes(fileExtension)) {
          warnings.push(`Video format (${fileExtension}) might not be supported by ftrack web player`);
        }
      }
      
      // Check file size if it's a File object
      if (attachment.file instanceof File) {
        const fileSizeInMB = attachment.file.size / (1024 * 1024);
        if (fileSizeInMB > 100) {
          warnings.push(`File size (${fileSizeInMB.toFixed(2)} MB) exceeds 100 MB, may cause upload issues`);
        }
        
        // Additional warning for common problems
        if (attachment.file.size === 0) {
          errors.push('File has zero bytes, cannot upload');
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Batch validate multiple attachments
   */
  static validateAttachments(attachments: Attachment[]): {
    valid: boolean;
    invalidAttachments: Array<{
      attachment: Attachment;
      errors: string[];
      warnings: string[];
    }>;
    validAttachments: Attachment[];
  } {
    const invalidAttachments: Array<{
      attachment: Attachment;
      errors: string[];
      warnings: string[];
    }> = [];
    
    const validAttachments: Attachment[] = [];
    
    for (const attachment of attachments) {
      const result = this.validateAttachment(attachment);
      
      if (!result.valid) {
        invalidAttachments.push({
          attachment,
          errors: result.errors,
          warnings: result.warnings
        });
      } else {
        // If there are warnings but no errors, it's still valid
        if (result.warnings.length > 0) {
          invalidAttachments.push({
            attachment,
            errors: [],
            warnings: result.warnings
          });
        }
        
        validAttachments.push(attachment);
      }
    }
    
    return {
      valid: invalidAttachments.every(item => item.errors.length === 0),
      invalidAttachments,
      validAttachments
    };
  }

  /**
   * Check if a component exists in ftrack
   */
  static async checkComponentExists(
    session: Session,
    componentId: string
  ): Promise<{exists: boolean, details?: any}> {
    try {
      console.log(`Checking if component ${componentId} exists...`);
      
      // Query the component directly
      const componentQuery = await session.query(
        `select id, name, file_type from Component where id="${componentId}"`
      );
      
      if (componentQuery.data && componentQuery.data.length > 0) {
        console.log(`Component ${componentId} exists with name: ${componentQuery.data[0].name}`);
        return { exists: true, details: componentQuery.data[0] };
      }
      
      console.log(`Component ${componentId} not found in ftrack`);
      return { exists: false };
    } catch (error) {
      console.error(`Error checking if component ${componentId} exists:`, error);
      return { exists: false };
    }
  }

  /**
   * Upload a component to ftrack using FileComponent approach that matches ftrack web UI
   * This solves attachment display issues by using the exact pattern used by ftrack web UI
   */
  static async uploadWebUIStyleAttachment(
    session: Session,
    attachment: Attachment,
    onProgress?: (progress: number) => void
  ): Promise<AttachmentUploadResult> {
    try {
      console.log(`Uploading attachment with web UI pattern: ${attachment.name} (${attachment.type})`);
      
      // Convert string file path to File object if needed
      let file: File;
      if (typeof attachment.file === 'string') {
        file = await getFileFromPath(attachment.file);
      } else if (attachment.file instanceof File) {
        file = attachment.file;
      } else {
        throw new Error('Attachment file must be a File object or file path string');
      }
      
      // Extract file details
      const fileName = file.name;
      const fileSize = file.size;
      const fileType = file.type;
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      
      console.log(`File details: name=${fileName}, size=${fileSize}, type=${fileType}`);
      
      // Step 1: Create a FileComponent with UUID
      let componentId = uuidv4();
      
      console.log(`Creating FileComponent with ID: ${componentId}`);
      
      const componentResponse = await session.create('FileComponent', {
        id: componentId,
        name: fileName.split('.')[0], // Without extension
        file_type: `.${extension}`,
        size: fileSize,
        system_type: 'file'
      });
      
      if (onProgress) {
        onProgress(20); // 20% progress after component creation
      }
      
      // Step 2: Try direct upload with Tauri HTTP
      const serverUrl = this.getServerUrl(session);
      const apiHeaders = this.getAuthHeaders(session);
      
      // Convert file to array buffer for upload
      const fileArrayBuffer = await file.arrayBuffer();
      const fileUint8Array = new Uint8Array(fileArrayBuffer);
      
      let uploadSuccess = false;
      
      // Try upload approach with component/upload endpoint
      try {
        const uploadUrl = `${serverUrl}/component/upload`;
        
        console.log(`Trying upload approach 1: ${uploadUrl}`);
        
        // Create form data
        const formData = new FormData();
        formData.append('component_id', componentId);
        
        // Add the file data
        const blob = new Blob([fileUint8Array], { type: fileType });
        formData.append('file', blob, fileName);
        
        const uploadResponse = await tauriFetch(uploadUrl, {
          method: 'POST',
          headers: apiHeaders,
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`);
        }
        
        console.log('Upload successful!');
        uploadSuccess = true;
        
        if (onProgress) {
          onProgress(80);
        }
      } catch (uploadError) {
        console.error('First upload approach failed:', uploadError);
        
        // Try second approach with component/file endpoint
        try {
          const fileUrl = `${serverUrl}/component/file`;
          
          console.log(`Trying upload approach 2: ${fileUrl}`);
          
          // Create form data
          const formData = new FormData();
          formData.append('id', componentId);
          
          // Add the file data
          const blob = new Blob([fileUint8Array], { type: fileType });
          formData.append('file', blob, fileName);
          
          const uploadResponse = await tauriFetch(fileUrl, {
            method: 'POST',
            headers: apiHeaders,
            body: formData,
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`Upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`);
          }
          
          console.log('Upload successful!');
          uploadSuccess = true;
          
          if (onProgress) {
            onProgress(80);
          }
        } catch (secondError) {
          console.error('Second upload approach failed:', secondError);
          
          // Fall back to third approach: direct file adding with component/add
          try {
            const addUrl = `${serverUrl}/component/add`;
            
            console.log(`Trying upload approach 3: ${addUrl}`);
            
            // Create form data
            const formData = new FormData();
            formData.append('name', fileName.split('.')[0]);
            formData.append('file_type', `.${extension}`);
            formData.append('location_id', SERVER_LOCATION_ID);
            
            // Add the file data
            const blob = new Blob([fileUint8Array], { type: fileType });
            formData.append('file', blob, fileName);
            
            const uploadResponse = await tauriFetch(addUrl, {
              method: 'POST',
              headers: apiHeaders,
              body: formData,
            });
            
            if (!uploadResponse.ok) {
              throw new Error(`Upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`);
            }
            
            const responseData = await uploadResponse.json();
            
            // If response contains a new component ID, use that instead
            if (responseData.component && responseData.component.id) {
              console.log(`Got new component ID from component/add: ${responseData.component.id}`);
              componentId = responseData.component.id;
            }
            
            console.log('Upload successful!');
            uploadSuccess = true;
            
            if (onProgress) {
              onProgress(80);
            }
          } catch (thirdError) {
            console.error('All upload approaches failed:', thirdError);
            console.log('Creating ComponentLocation only, which might not work without file content');
          }
        }
      }
      
      // Step 3: Create ComponentLocation
      console.log('Creating ComponentLocation...');
      
      const componentLocationResponse = await session.create('ComponentLocation', {
        component_id: componentId,
        location_id: SERVER_LOCATION_ID,
        resource_identifier: componentId, // Just use the component ID as resource identifier
      });
      
      console.log(`ComponentLocation created: ${componentLocationResponse?.data?.id || 'unknown'}`);
      
      if (onProgress) {
        onProgress(100);
      }
      
      return {
        success: true,
        componentId
      };
    } catch (error) {
      console.error('Error uploading attachment:', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Create a note with attachments in a single operation using the web UI approach
   */
  static async createNoteWithAttachmentsWebUI(
    session: Session,
    noteContent: string,
    parentId: string,
    parentType: string, 
    attachments: Attachment[],
    onProgress?: (attachment: Attachment, progress: number) => void
  ): Promise<{
    success: boolean;
    noteId?: string;
    attachmentResults?: {
      uploaded: number;
      failed: number;
      componentIds: string[];
    }
  }> {
    try {
      // 1. Upload all attachments first using the web UI pattern
      console.log(`Uploading ${attachments.length} attachments using web UI pattern`);
      
      const results = await Promise.all(
        attachments.map(async (attachment) => {
          const result = await this.uploadWebUIStyleAttachment(
            session, 
            attachment,
            progress => {
              if (onProgress) {
                onProgress(attachment, progress);
              }
            }
          );
          
          return {
            attachment,
            result
          };
        })
      );
      
      const successful = results.filter(r => r.result.success);
      const failed = results.filter(r => !r.result.success);
      const componentIds = successful.map(r => r.result.componentId!);
      
      console.log(`Successfully uploaded ${successful.length} attachments, ${failed.length} failed`);
      
      // 2. Create the note
      console.log(`Creating note with content: ${noteContent.substring(0, 50)}${noteContent.length > 50 ? '...' : ''}`);
      const noteResponse = await session.create('Note', {
        content: noteContent,
        parent_id: parentId,
        parent_type: parentType
      });
      
      const noteId = noteResponse.data.id;
      console.log(`Successfully created note: ${noteId}`);
      
      // 3. Link attachments to the note
      if (componentIds.length > 0) {
        console.log(`Linking ${componentIds.length} attachments to note ${noteId}`);
        const linkResult = await this.attachComponentsToNote(session, noteId, componentIds);
        console.log(`Linking attachments result: ${linkResult ? 'success' : 'failed'}`);
      }
      
      return {
        success: true,
        noteId,
        attachmentResults: {
          uploaded: componentIds.length,
          failed: failed.length,
          componentIds
        }
      };
    } catch (error) {
      console.error('Failed to create note with attachments:', error);
      return {
        success: false
      };
    }
  }

  /**
   * Upload an attachment using the official createComponent method
   */
  static async uploadAttachmentWithCreateComponent(
    session: Session,
    attachment: Attachment,
    onProgress?: (progress: number) => void
  ): Promise<AttachmentUploadResult> {
    try {
      console.log(`Uploading attachment using createComponent: ${attachment.name} (${attachment.type})`);
      
      // Convert string file path to File object if needed
      let file: File;
      if (typeof attachment.file === 'string') {
        file = await getFileFromPath(attachment.file);
      } else if (attachment.file instanceof File) {
        file = attachment.file;
      } else {
        throw new Error('Attachment file must be a File object or file path string');
      }
      
      // Check file properties
      const fileName = file.name;
      const fileSize = file.size;
      const fileType = file.type;
      const extension = fileName.split('.').pop()?.toLowerCase() || '';
      
      console.log(`File details: name=${fileName}, size=${fileSize}, type=${fileType}`);
      
      // Set up optional data for the component
      let componentData: Record<string, any> = {};
      
      // For images, use the special ftrackreview-image component name
      const isImage = fileType.startsWith('image/') || 
                     ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'bmp'].includes(extension);
                       
      // For videos, use the special ftrackreview-mp4 component name
      const isVideo = fileType.startsWith('video/') ||
                     ['mp4', 'mov', 'avi', 'webm', 'wmv', 'mkv'].includes(extension);
      
      // Set special names based on content type
      if (isImage) {
        componentData.name = 'ftrackreview-image';
        console.log('Using special component name for images: ftrackreview-image');
      } else if (isVideo) {
        componentData.name = 'ftrackreview-mp4';
        console.log('Using special component name for videos: ftrackreview-mp4');
      }
      
      // Use the createComponent method from the ftrack API
      console.log('Calling session.createComponent...');
      
      const response = await session.createComponent(file, {
        data: componentData,
        onProgress: progress => {
          console.log(`Upload progress: ${progress}%`);
          if (onProgress) {
            onProgress(progress);
          }
        }
      });
      
      // Extract component ID from the response
      const componentId = response[0].data.id;
      console.log(`Component created successfully with ID: ${componentId}`);
      
      return {
        success: true,
        componentId
      };
    } catch (error) {
      console.error('Error uploading attachment with createComponent:', error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Create a note with attachments using the official createComponent method
   */
  static async createNoteWithAttachmentsAPI(
    session: Session,
    noteContent: string,
    parentId: string,
    parentType: string, 
    attachments: Attachment[],
    userId?: string,
    onProgress?: (attachment: Attachment, progress: number) => void
  ): Promise<{
    success: boolean;
    noteId?: string;
    attachmentResults?: {
      uploaded: number;
      failed: number;
      componentIds: string[];
    }
  }> {
    try {
      console.log(`Creating note with ${attachments.length} attachments using createComponent`);
      
      // 1. Upload all attachments first
      console.log(`Uploading ${attachments.length} attachments`);
      
      const results = await Promise.all(
        attachments.map(async (attachment) => {
          const result = await this.uploadAttachmentWithCreateComponent(
            session, 
            attachment,
            progress => {
              if (onProgress) {
                onProgress(attachment, progress);
              }
            }
          );
          
          return {
            attachment,
            result
          };
        })
      );
      
      const successful = results.filter(r => r.result.success);
      const failed = results.filter(r => !r.result.success);
      const componentIds = successful
        .map(r => r.result.componentId)
        .filter(id => id !== undefined) as string[];
      
      console.log(`Successfully uploaded ${successful.length} attachments, ${failed.length} failed`);
      
      // 2. Create the note
      console.log(`Creating note with content: ${noteContent.substring(0, 50)}${noteContent.length > 50 ? '...' : ''}`);
      
      // Prepare note data
      const noteData: Record<string, any> = {
        content: noteContent,
        parent_id: parentId,
        parent_type: parentType
      };
      
      // Add user_id if provided to fix the NoteUserLink issue
      if (userId) {
        noteData.user_id = userId;
        console.log(`Setting note user_id to: ${userId}`);
      }
      
      const noteResponse = await session.create('Note', noteData);
      
      const noteId = noteResponse.data.id;
      console.log(`Successfully created note: ${noteId}`);
      
      // 3. Link attachments to the note
      if (componentIds.length > 0) {
        console.log(`Linking ${componentIds.length} attachments to note ${noteId}`);
        const linkResult = await this.attachComponentsToNote(session, noteId, componentIds);
        console.log(`Linking attachments result: ${linkResult ? 'success' : 'failed'}`);
      }
      
      return {
        success: true,
        noteId,
        attachmentResults: {
          uploaded: componentIds.length,
          failed: failed.length,
          componentIds
        }
      };
    } catch (error) {
      console.error('Failed to create note with attachments:', error);
      return {
        success: false
      };
    }
  }
}