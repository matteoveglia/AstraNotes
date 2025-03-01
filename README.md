# AstraNotes
_by Astra Lumen Images Inc._

A desktop app aiming to provide a better note-taking experience with ftrack.

## ✨ Features

- 🔐 Secure ftrack integration, data is stored locally, keys encrypted and nothing sent via 3rd party
- 📝 Text-only for now, rich text planned
- 📋 Multiple playlist management
- 🏷️ Note labelling, inline with ftrack
- 🔍 Ability to quick-add versions with an advanced search tool
- 💅 Modern, responsive UI built with React and Tailwind CSS
- 🚀 Native performance with Tauri

## 🚀 Getting Started

### Prerequisites

- Node.js (v20 or later)
- [pnpm](https://pnpm.io/) package management
- Rust toolchain (for Tauri development)
- ftrack account and API credentials

## 🛠️ Development
### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/astranotes.git
cd astranotes
```

2. Install dependencies:
```bash
pnpm install
```

3. Start the development server, for Web development:
```bash
pnpm dev
```

4. Start the development server, for Tauri development:
```bash
pnpm tauri:dev
```
### Configuration

Please create a `.env` file in the project root with your `VITE_SENTRY_DSN`: Sentry DSN for error tracking
And run the Sentry wizard to generate your `SENTRY_AUTH_TOKEN` environment variable

### Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build
- `pnpm lint` - Lint code with ESLint
- `pnpm format` - Format code with Prettier
- `pnpm test` - Run tests
- `pnpm typecheck` - Type check TypeScript code

### Building for Different Platforms

- macOS (Apple Silicon):
  ```bash
  pnpm tauri:build:mac
  ```
- macOS (Universal):
  ```bash
  pnpm tauri:build:macuniversal
  ```
- Windows:
  ```bash
  pnpm tauri:build:win
  ```

## 🏗️ Tech Stack

- **Frontend Framework**: React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Build Tool**: Vite
- **Desktop Framework**: Tauri 2
- **State Management**: Zustand
- **Database**: Dexie (IndexedDB wrapper)
- **API Integration**: @ftrack/api

## 🗂️ Project Structure

```
astranotes/
├── src/                  # React application code
│   ├── components/       # React components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions and libraries
│   ├── stores/           # Zustand state stores
│   ├── types/            # TypeScript type definitions
│   └── MainContent.tsx   # Main application component
├── src-tauri/            # Tauri backend code
│   ├── src/              # Rust source files
│   └── Cargo.toml        # Rust package configuration
├── tests/                # Test files
├── .env                  # Environment variables
├── .eslintrc.js          # ESLint configuration
├── .prettierrc           # Prettier configuration
├── package.json          # Node.js package configuration
├── pnpm-lock.yaml        # pnpm lock file
└── tsconfig.json         # TypeScript configuration
```

## 🛠️ Development Practices

- **Type Safety**: Strict TypeScript configuration with no implicit any
- **Code Formatting**: Prettier for consistent code style
- **Linting**: ESLint with React and TypeScript rules
- **Testing**: Jest with React Testing Library for unit tests
- **State Management**: Zustand for global state management
- **API Integration**: ftrack API package for ftrack integration

## 🚀 Deployment Process

1. Build the application:
   ```bash
   pnpm build
   ```
2. Run tests:
   ```bash
   pnpm test
   ```
3. Package the application for the target platform:
   ```bash
   pnpm tauri:build
   ```
4. The built application will be available in the `src-tauri/target/release` directory

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MPL 2.0 License - see the [LICENSE.txt](LICENSE.txt) file for details.