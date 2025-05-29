# AstraNotes

AstraNotes is a desktop app, for Windows and macOS, that integrates with [ftrack](https://www.ftrack.com/) to provide an better experience for note taking.

## Features

- 🎬 **Playlist Management**: Browse and view ftrack client review playlists
- ✍️ **Note Creation**: Create, edit, and publish notes on versions
- 🏷️ **Label Support**: Categorise notes with customizable labels pulled from ftrack
- ⚙️ **Status Management**: View and update shot and version statuses directly
- 📊 **Quick Notes**: Create notes on any version, on the fly, without a playlist
- 🔄 **Real-time Updates**: Get notified of playlist changes in real-time
- 🔍 **Version Search**: Find and manually add specific versions to playlists (local only)
- 💾 **Offline Mode**: Draft notes offline and publish when connected
- 📤 **CSV Export**: Export notes to CSV
- 🖼️ **Thumbnail Previews**
- 🔄 **Auto-updates**
- 🌙 **Dark Mode**

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

**For compatibility details, see [Ftrack API Objects & Attributes](./docs/ftrack-api-objects.md).**

These settings can be updated anytime through the settings panel.

## Development
**For detailed development instructions, see [Development Guide](./docs/development.md).**

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

You can view the scan results here, for release v0.7.0.

#### Windows
- **File Hash**: 70d17e96e37e2bc73a9ab715e226597f20bcabfc790076bc3b8747b98876955c
- **Scan Results**: [View on VirusTotal](https://www.virustotal.com/gui/file/70d17e96e37e2bc73a9ab715e226597f20bcabfc790076bc3b8747b98876955c?nocache=1)

#### macOS
- **File Hash**: d7fc36e47eb78ca1a53e16c5d07b98402cb6ad82c767600b903e0aa9f1eac7fb
- **Scan Results**: [View on VirusTotal](https://www.virustotal.com/gui/file/d7fc36e47eb78ca1a53e16c5d07b98402cb6ad82c767600b903e0aa9f1eac7fb/detection)

We are committed to providing a secure application and regularly scan our releases to ensure your safety.

## Credits

AstraNotes is developed by [Astra Lumen Images](https://astralumen.co/).

## License

Copyright © 2025 Astra Lumen Images Inc. All rights reserved.
