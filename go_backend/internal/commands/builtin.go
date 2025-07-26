package commands

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"go_general_agent/internal/config"
	"go_general_agent/internal/llm/agent"
	"go_general_agent/internal/llm/tools"
)

// BuiltinCommand represents a built-in command
type BuiltinCommand struct {
	name        string
	description string
	handler     func(ctx context.Context, args string) (string, error)
}

func (c *BuiltinCommand) Name() string {
	return c.name
}

func (c *BuiltinCommand) Description() string {
	return c.description
}

func (c *BuiltinCommand) Execute(ctx context.Context, args string) (string, error) {
	return c.handler(ctx, args)
}

// GetBuiltinCommands returns all built-in commands
func GetBuiltinCommands(registry *Registry) map[string]Command {
	return map[string]Command{
		"help": &BuiltinCommand{
			name:        "help",
			description: "Show available commands",
			handler:     createHelpHandler(registry),
		},
		"clear": &BuiltinCommand{
			name:        "clear",
			description: "Clear chat history",
			handler:     createClearHandler(),
		},
		"session": &BuiltinCommand{
			name:        "session",
			description: "Show session information or switch sessions",
			handler:     createSessionHandler(),
		},
		"sessions": &BuiltinCommand{
			name:        "sessions",
			description: "List all available sessions",
			handler:     createSessionsHandler(),
		},
		"mcp": &BuiltinCommand{
			name:        "mcp",
			description: "List configured MCP servers",
			handler:     createMcpHandler(),
		},
	}
}

func createHelpHandler(registry *Registry) func(ctx context.Context, args string) (string, error) {
	return func(ctx context.Context, args string) (string, error) {
		var result strings.Builder
		result.WriteString("Available slash commands:\n\n")

		// Get all commands from registry
		commands := registry.GetAllCommands()

		// Sort command names
		var names []string
		for name := range commands {
			names = append(names, name)
		}
		sort.Strings(names)

		// Format commands
		for _, name := range names {
			cmd := commands[name]
			result.WriteString(fmt.Sprintf("/%s - %s\n", name, cmd.Description()))
		}

		result.WriteString("\nType /help <command> for more details about a specific command.")
		return result.String(), nil
	}
}

func createClearHandler() func(ctx context.Context, args string) (string, error) {
	return func(ctx context.Context, args string) (string, error) {
		return "Chat history cleared. Note: This command is only functional in interactive modes.", nil
	}
}

func createSessionHandler() func(ctx context.Context, args string) (string, error) {
	return func(ctx context.Context, args string) (string, error) {
		args = strings.TrimSpace(args)
		if args == "" {
			// Show current session info
			return "Current session information is available via the HTTP API or database queries.", nil
		} else {
			// Switch to specific session
			return fmt.Sprintf("Session switching to '%s' is available via the HTTP API.", args), nil
		}
	}
}

func createSessionsHandler() func(ctx context.Context, args string) (string, error) {
	return func(ctx context.Context, args string) (string, error) {
		return "Session listing is available via the HTTP API or database queries. Use '--query sessions' for programmatic access.", nil
	}
}

func createMcpHandler() func(ctx context.Context, args string) (string, error) {
	return func(ctx context.Context, args string) (string, error) {
		cfg := config.Get()

		if len(cfg.MCPServers) == 0 {
			return "No MCP servers configured.\n\nTo configure MCP servers, add them to your configuration file under 'mcpServers'.", nil
		}

		var result strings.Builder
		result.WriteString("Available MCP servers:\n\n")

		// Sort server names for consistent output
		var serverNames []string
		for name := range cfg.MCPServers {
			serverNames = append(serverNames, name)
		}
		sort.Strings(serverNames)

		// Get MCP tools to check connection status and group by server
		// Create temporary manager for informational listing
		tempManager := agent.NewMCPClientManager()
		defer tempManager.Close()
		mcpTools := agent.GetMcpTools(ctx, nil, tempManager)

		// Group tools by server name
		serverTools := make(map[string][]tools.BaseTool)
		for _, tool := range mcpTools {
			if toolInfo := tool.Info(); strings.Contains(toolInfo.Name, "_") {
				serverName := strings.Split(toolInfo.Name, "_")[0]
				serverTools[serverName] = append(serverTools[serverName], tool)
			}
		}

		for _, name := range serverNames {
			tools := serverTools[name]
			
			// Determine connection status
			var statusIcon, statusText string
			if len(tools) > 0 {
				statusIcon = "✓"
				statusText = "connected"
			} else {
				statusIcon = "✗"
				statusText = "failed"
			}

			// Server header
			result.WriteString(fmt.Sprintf("• %s %s %s\n", name, statusIcon, statusText))

			// Show tools if connected
			if len(tools) > 0 {
				result.WriteString(fmt.Sprintf("  %d tool%s available:\n", len(tools), func() string {
					if len(tools) == 1 { return "" }
					return "s"
				}()))

				// Sort tools by name for consistent output
				sort.Slice(tools, func(i, j int) bool {
					return tools[i].Info().Name < tools[j].Info().Name
				})

				for _, tool := range tools {
					info := tool.Info()
					// Remove server prefix from tool name for cleaner display
					toolName := info.Name
					if strings.Contains(toolName, "_") {
						parts := strings.SplitN(toolName, "_", 2)
						if len(parts) > 1 {
							toolName = parts[1]
						}
					}
					// result.WriteString(fmt.Sprintf("    - %s: %s\n", toolName, info.Description))
					result.WriteString(fmt.Sprintf("    - %s\n", toolName))
				}
			} else {
				result.WriteString("  No tools available (connection failed)\n")
			}
			result.WriteString("\n")
		}

		return result.String(), nil
	}
}
