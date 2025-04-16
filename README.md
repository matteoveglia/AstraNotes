# AstraNotes

AstraNotes is a desktop app, for Windows and macOS, that integrates with [ftrack](https://www.ftrack.com/) to provide an better experience for note taking.

## Features

- 🎬 **Playlist Management**: Browse and view ftrack client review playlists
- ✍️ **Note Creation**: Create, edit, and publish notes on versions
- 🏷️ **Label Support**: Categorise notes with customizable labels pulled from ftrack
- 🔄 **Real-time Updates**: Get notified of playlist changes in real-time
- 🔍 **Version Search**: Find and manually add specific versions to playlists (local only)
- 💾 **Offline Mode**: Draft notes offline and publish when connected
- 📊 **Quick Notes**: Create notes on any version, on the fly, without a playlist
- 📤 **CSV Export**: Export notes to CSV
- 🖼️ **Thumbnail Previews**
- 🔄 **Auto-update**

## Installation

### Requirements

- Windows 10/11 or macOS 10.13+
- [ftrack](https://www.ftrack.com/) credentials (API key, server URL, and user)

### Download

Download the latest release for your platform:

- [Windows Installer (.msi)](https://github.com/matteoveglia/AstraNotes/releases/latest)
- [macOS App (.dmg)](https://github.com/matteoveglia/AstraNotes/releases/latest)

## Configuration

AstraNotes requires ftrack credentials for authentication. Upon first launch, you'll need to configure:

1. **ftrack Server URL**: Your ftrack instance URL (e.g., `https://yourcompany.ftrackapp.com`)
2. **API Key**: Your ftrack API key
3. **API User**: Your ftrack username (email)

These settings can be updated anytime through the settings panel.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or later)
- [PNPM](https://pnpm.io/) (v9.x or later)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/matteoveglia/AstraNotes.git
   cd AstraNotes
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create a `.env` file with your Sentry DSN (optional for error tracking):
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

4. Start the development server:
   ```bash
   pnpm tauri:dev
   ```

### Build

AstraNotes uses a custom build script for building platform-specific binaries:

#### macOS (Apple Silicon):
```bash
pnpm tauri:build:mac
```

#### macOS (Universal) - Not Tested:
```bash
pnpm tauri:build:macuniversal
```

#### Windows:
```bash
pnpm tauri:build:win
```

The build script handles versioning, signing, and creating updater artifacts automatically.

### Testing

AstraNotes uses Vitest for testing. Run tests with:

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

See [Testing Quick Reference](./docs/testing-quickref.md) and [Testing Guide](./docs/testing-guide.md) for detailed testing practices.
## Project Structure

```
AstraNotes/
├── src/                      # React frontend source code
│   ├── components/           # UI components
│   ├── features/             # Feature-organized components and hooks
│   ├── services/             # External service integrations
│   ├── store/                # Zustand state management
│   ├── utils/                # Utility functions
│   └── test/                 # Test files
├── src-tauri/                # Tauri backend code
│   └── src/                  # Rust source code
├── docs/                     # Documentation
└── public/                   # Static assets
```

## Release Process

1. Run the build script with the target platform:
   ```bash
   node build.js [mac|macuniversal|win]
   ```

2. The script will:
   - Prompt for a new version number
   - Build the application for the target platform
   - Create signature files for updates
   - Generate update metadata in `latest.json`
   - Move build artifacts to `dist-tauri/`

3. Upload the generated artifacts and `latest.json` to GitHub releases

## Troubleshooting

### Common Issues

- **Connection Error**: Verify your ftrack credentials in Settings
- **Missing Thumbnails**: Check your connection to ftrack
- **Update Failed**: Manually download the latest version and reinstall

### Logs

AstraNotes logs can be exported from the Settings panel for troubleshooting. Click "Export Logs" to save a log file with the last 24 hours of activity.
## 🛡️ Security

### VirusTotal Scan

AstraNotes has been scanned with VirusTotal to ensure it's free from malware and other security threats.

You can view the scan results here, for release v0.5.0.

#### Windows
- **File Hash**: 22805666b48e7040d39e8f0d0f6cfb2af47848d375aa6f1b6b019a188a32984a
- **Scan Results**: [View on VirusTotal](https://www.virustotal.com/gui/file/22805666b48e7040d39e8f0d0f6cfb2af47848d375aa6f1b6b019a188a32984a/detection)

#### macOS
- **File Hash**: 82fa15154ba4d13ed974ed6c0c0b101ad027776a785a2f0412b695950db5c50f
- **Scan Results**: [View on VirusTotal](https://www.virustotal.com/gui/file/82fa15154ba4d13ed974ed6c0c0b101ad027776a785a2f0412b695950db5c50f?nocache=1)

We are committed to providing a secure application and regularly scan our releases to ensure your safety.

## Credits

AstraNotes is developed by [Astra Lumen Images](https://astralumen.co/).

## License

Copyright © 2025 Astra Lumen Images Inc. All rights reserved.
