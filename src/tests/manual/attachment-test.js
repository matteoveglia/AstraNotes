// Manual test script for attachment functionality
// Run this in the browser console or Tauri environment to test the attachment handling

/**
 * Test attachment handling functionality
 */
async function testAttachmentHandling() {
  console.log('Starting attachment handling test...');
  
  try {
    // 1. Import necessary services
    const { ftrackService } = await import('../../services/ftrack.js');
    const { AttachmentService } = await import('../../services/attachmentService.js');
    
    console.log('Services imported successfully');
    
    // 2. Test file reading (if in a Tauri environment)
    const isTauri = typeof window !== 'undefined' && 'window' in globalThis && '__TAURI__' in window;
    if (isTauri) {
      console.log('Running in Tauri environment, testing file reading...');
      
      try {
        // Tauri 2 uses plugin-dialog and plugin-fs packages
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readFile } = await import('@tauri-apps/plugin-fs');
        
        // Prompt user to select a file
        const filePath = await open({
          multiple: false,
          filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }]
        });
        
        if (filePath) {
          console.log(`Selected file: ${filePath}`);
          
          // Test reading the file - Tauri 2 uses readFile instead of readBinaryFile
          const fileContents = await readFile(filePath);
          console.log(`File read successfully, size: ${fileContents.byteLength} bytes`);
          
          // Create an attachment object for testing
          const attachment = {
            id: 'test-' + Date.now(),
            name: filePath.split('/').pop(),
            type: 'image/' + filePath.split('.').pop(),
            previewUrl: '',
            file: filePath
          };
          
          // Test the preview URL creation
          if (window.URL && window.URL.createObjectURL) {
            const blob = new Blob([fileContents], { type: attachment.type });
            attachment.previewUrl = URL.createObjectURL(blob);
            console.log(`Preview URL created: ${attachment.previewUrl}`);
          }
          
          return {
            status: 'success',
            message: 'Attachment test completed successfully',
            attachment
          };
        } else {
          console.log('No file selected');
          return {
            status: 'canceled',
            message: 'No file selected'
          };
        }
      } catch (error) {
        console.error('Error testing file handling:', error);
        return {
          status: 'error',
          message: `Error testing file handling: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    } else {
      console.log('Not running in Tauri environment, skipping file tests');
      return {
        status: 'skipped',
        message: 'Not running in Tauri environment'
      };
    }
  } catch (error) {
    console.error('Test failed:', error);
    return {
      status: 'error',
      message: `Test failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testAttachmentHandling };
}
