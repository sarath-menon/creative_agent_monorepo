# Creative Agent Monorepo

This monorepo contains two main projects:

## Projects

### go_backend
A Go-based general agent with CLI interface and API endpoints.

**Key features:**
- Command-line interface
- API server functionality  
- Database integration with SQLite
- Multiple LLM provider support (Anthropic, OpenAI, Azure, etc.)
- File operations and tool integrations

**Getting started:**
```bash
cd go_backend
make build
./go_general_agent
```

### recreate_tauri_app
A Tauri-based desktop application with React frontend for chat functionality.

**Key features:**
- Cross-platform desktop app built with Tauri
- React frontend with TypeScript
- Chat interface with AI integration
- Modern UI components

**Getting started:**
```bash
cd recreate_tauri_app
npm install
npm run tauri dev
```

## Development

Each project maintains its own build system and dependencies. Refer to the individual README files in each project directory for specific development instructions.

## Structure

```
├── go_backend/          # Go backend service
├── recreate_tauri_app/  # Tauri desktop application
├── .gitignore          # Monorepo gitignore
└── README.md           # This file
```