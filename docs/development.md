# Development

This document describes how to set up the development environment and build AstraNotes.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or later)
- [PNPM](https://pnpm.io/) (v9.x or later)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri v2](https://tauri.app/start/prerequisites/)

## Setup

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

## Build

AstraNotes uses a custom build script for building platform-specific binaries:

### macOS (Apple Silicon):
```bash
pnpm tauri:build:mac
```

### macOS (Universal) - Not Tested:
```bash
pnpm tauri:build:macuniversal
```

### Windows:
```bash
pnpm tauri:build:win
```

The build script handles versioning, signing, and creating updater artifacts automatically.

## Testing

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

See [Testing Quick Reference](./testing-quickref.md) and [Testing Guide](./testing-guide.md) for detailed testing practices. 

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