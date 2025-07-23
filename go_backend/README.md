# OpenCode Codebase Analysis

## Executive Summary

**OpenCode** is a sophisticated AI-powered assistant for general-purpose task automation and AI assistance. It features an interactive terminal user interface (TUI) as the primary mode, with CLI-only mode for scripting and structured data queries. The system is designed as a standalone interactive tool with a clean, minimal interface that prioritizes simplicity and reliability.

## Project Overview

### Core Technology Stack
- **Language**: Go 1.24.0
- **Database**: SQLite with SQLC for type-safe queries
- **CLI Framework**: Cobra for command-line interface
- **TUI Framework**: Charm Bubbles for interactive terminal interface
- **Configuration**: Viper for configuration management
- **Build System**: Go modules with custom build scripts

### Architecture Philosophy
- **Minimal Complexity**: Simple, maintainable code with clean interfaces
- **Dual Interface Model**: Interactive TUI for users, CLI for scripting and data queries
- **Data Query System**: JSON-RPC structured data access via CLI
- **Multi-Provider AI**: Support for multiple AI backends (Anthropic, OpenAI, etc.)
- **Tool Extensibility**: MCP protocol for external integrations

## Main Components

### 1. Entry Points (`main.go`, `cmd/`)
- Single main entry point with Cobra CLI framework
- **Default**: Interactive TUI mode for user conversations
- CLI-only mode for scripting and automation (`-p "prompt"`)
- **Data query mode** for structured data access (`--query <type>`)
- Graceful shutdown and panic recovery

### 2. Terminal User Interface (`internal/tui/`)
- **Interactive chat interface** using Charm Bubbles framework
- Real-time conversation with AI assistant
- **Slash Commands**: Type `/` for interactive command suggestions with autocomplete
- **Keyboard shortcuts**: Enter (send), Ctrl+L (clear), Ctrl+C/Esc (quit), Tab (accept suggestion)
- Styled components with lipgloss for visual appeal
- Scrollable message history with syntax highlighting

### 3. Core Application (`internal/app/`)
- Central app orchestrator managing all services
- Session management and message handling
- CLI-only execution flow for scripting
- Automatic permission approval for non-interactive sessions

### 4. LLM Integration (`internal/llm/`)
- **Agents**: Main coder agent with tool orchestration
- **Models**: Support for multiple AI providers (OpenAI, Anthropic, Azure, Gemini, Groq, etc.)
- **Providers**: Provider-specific implementations for each AI service
- **Tools**: Comprehensive AI assistant tools (bash, file ops, grep, edit, etc.)
- **Prompts**: Embedded markdown prompts with templating support

### 5. Data Query Interface (`internal/api/`)
- **JSON-RPC query system** for structured data access
- **CLI interface**: `--query <type> --output-format json`
- **Query types**: `sessions`, `tools`, `mcp`, `commands`
- Perfect for **native app integration** (Swift, Electron, etc.)

### 6. Data Layer (`internal/db/`)
- SQLite database with proper migrations
- Three core entities: Sessions, Messages, Files
- SQLC for type-safe database operations
- Automatic timestamping and relationship management

### 7. Supporting Services
- **Permissions**: Request approval system
- **Logging**: Structured logging throughout
- **File Operations**: Safe file manipulation with history tracking
- **Session Management**: Conversation state management
- **Message Handling**: Multi-part message processing with attachments

## Database Schema
```sql
sessions (conversations)
├── messages (user/assistant exchanges)
└── files (file versions and content tracking)
```

## CLI Data Query Interface

OpenCode provides a powerful structured data access system through its CLI interface that enables programmatic interaction with sessions, tools, and system state. This command-line API is designed for seamless integration with native applications and scripts.

### CLI Query Interface

Get structured JSON data directly via stdout:

```bash
# Get all sessions
./build/go_general_agent --query sessions --output-format json

# Get available tools (including MCP tools)
./build/go_general_agent --query tools --output-format json

# Get MCP server status and their tools
./build/go_general_agent --query mcp --output-format json

# Get available slash commands
./build/go_general_agent --query commands --output-format json
```

### HTTP Server Interface

OpenCode also provides an HTTP JSON-RPC server for web-based integrations:

```bash
# Start HTTP server on default port (localhost:8080)
./build/go_general_agent --http-port 8080

# Start HTTP server on custom host and port
./build/go_general_agent --http-port 3000 --http-host 0.0.0.0

# Run both TUI and HTTP server simultaneously
./build/go_general_agent --http-port 8080 --debug
```

#### HTTP API Usage

The HTTP server accepts JSON-RPC requests at the `/rpc` endpoint:

```bash
# Get sessions via HTTP
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "sessions.list", "id": 1}'

# Create new session via HTTP
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "sessions.create", "params": {"title": "New Session"}, "id": 1}'

# Send message to session
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "messages.send", "params": {"sessionId": "uuid", "content": "Hello"}, "id": 1}'
```

### Native Integration Examples

#### Swift/macOS Integration

**Via CLI:**
```swift
// Get sessions data for Swift app
let process = Process()
process.executableURL = URL(fileURLWithPath: "./build/go_general_agent")
process.arguments = ["--query", "sessions", "--output-format", "json"]

let pipe = Pipe()
process.standardOutput = pipe
process.launch()

let data = pipe.fileHandleForReading.readDataToEndOfFile()
let sessions = try JSONDecoder().decode([SessionData].self, from: data)
```

**Via HTTP:**
```swift
// HTTP JSON-RPC request from Swift
struct RPCRequest: Codable {
    let method: String
    let params: [String: Any]?
    let id: Int
}

let request = RPCRequest(method: "sessions.list", params: nil, id: 1)
let url = URL(string: "http://localhost:8080/rpc")!
var urlRequest = URLRequest(url: url)
urlRequest.httpMethod = "POST"
urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
urlRequest.httpBody = try JSONEncoder().encode(request)

let (data, _) = try await URLSession.shared.data(for: urlRequest)
let sessions = try JSONDecoder().decode([SessionData].self, from: data)
```

#### Session Management API (2-Way Communication)

```bash
# Create a new session
echo '{"method": "sessions.create", "params": {"title": "New Analysis", "setCurrent": true}, "id": 1}' | \
./build/go_general_agent --query json --output-format json

# Select a different session
echo '{"method": "sessions.select", "params": {"id": "session-uuid"}, "id": 1}' | \
./build/go_general_agent --query json --output-format json

# Get current session
echo '{"method": "sessions.current", "id": 1}' | \
./build/go_general_agent --query json --output-format json

# Delete a session
echo '{"method": "sessions.delete", "params": {"id": "session-uuid"}, "id": 1}' | \
./build/go_general_agent --query json --output-format json
```

Both CLI and HTTP interfaces provide full 2-way communication for session management, enabling programmatic control of OpenCode from external applications or scripts. The HTTP interface offers better performance for web-based integrations, while the CLI interface is ideal for shell scripts and simple integrations.

### Query Response Formats

**Sessions Response:**
```json
[{
  "id": "uuid",
  "title": "Session Title", 
  "messageCount": 5,
  "promptTokens": 1000,
  "completionTokens": 800,
  "cost": 0.0023,
  "createdAt": "2024-07-22T18:57:03+02:00"
}]
```

**MCP Response:**
```json
[{
  "name": "blender",
  "connected": true,
  "status": "connected",
  "tools": [{"name": "execute_blender_code", "description": "..."}]
}]
```

**Tools Response:**
```json
[{"name": "bash", "description": "Execute shell commands"}]
```
