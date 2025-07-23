package agent

// Documentation: https://pkg.go.dev/github.com/mark3labs/mcp-go/client

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"go_general_agent/internal/config"
	"go_general_agent/internal/llm/tools"
	"go_general_agent/internal/logging"
	"go_general_agent/internal/permission"
	"go_general_agent/internal/version"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
)

type mcpTool struct {
	mcpName     string
	tool        mcp.Tool
	mcpConfig   config.MCPServer
	permissions permission.Service
	manager     *MCPClientManager
}

type MCPClient interface {
	Initialize(
		ctx context.Context,
		request mcp.InitializeRequest,
	) (*mcp.InitializeResult, error)
	ListTools(ctx context.Context, request mcp.ListToolsRequest) (*mcp.ListToolsResult, error)
	CallTool(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error)
	Close() error
	Start(ctx context.Context) error
	IsInitialized() bool
	Ping(ctx context.Context) error
}

type MCPClientManager struct {
	mu      sync.RWMutex
	clients map[string]*client.Client
}

func NewMCPClientManager() *MCPClientManager {
	return &MCPClientManager{
		clients: make(map[string]*client.Client),
	}
}

func (m *MCPClientManager) GetClient(ctx context.Context, serverName string, mcpConfig config.MCPServer) (*client.Client, error) {
	m.mu.RLock()
	if c, exists := m.clients[serverName]; exists {
		// Check if client is healthy
		if c.IsInitialized() {
			if err := c.Ping(ctx); err == nil {
				m.mu.RUnlock()
				return c, nil
			}
		}
		// Client is unhealthy, close it
		c.Close()
		delete(m.clients, serverName)
	}
	m.mu.RUnlock()

	// Create new client with write lock
	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if c, exists := m.clients[serverName]; exists {
		if c.IsInitialized() {
			if err := c.Ping(ctx); err == nil {
				return c, nil
			}
		}
		c.Close()
		delete(m.clients, serverName)
	}

	// Create new client
	var newClient *client.Client
	var err error

	switch mcpConfig.Type {
	case config.MCPStdio:
		newClient, err = client.NewStdioMCPClient(
			mcpConfig.Command,
			mcpConfig.Env,
			mcpConfig.Args...,
		)
	case config.MCPSse:
		newClient, err = client.NewSSEMCPClient(
			mcpConfig.URL,
			client.WithHeaders(mcpConfig.Headers),
		)
	default:
		return nil, fmt.Errorf("invalid mcp type: %s", mcpConfig.Type)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create mcp client: %w", err)
	}

	// Initialize the client
	initRequest := mcp.InitializeRequest{}
	initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initRequest.Params.ClientInfo = mcp.Implementation{
		Name:    "OpenCode",
		Version: version.Version,
	}

	_, err = newClient.Initialize(ctx, initRequest)
	if err != nil {
		newClient.Close()
		return nil, fmt.Errorf("failed to initialize mcp client: %w", err)
	}

	// Store the client
	m.clients[serverName] = newClient
	return newClient, nil
}

func (m *MCPClientManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for name, client := range m.clients {
		if err := client.Close(); err != nil {
			logging.Error("error closing mcp client", "server", name, "error", err)
		}
	}
	m.clients = make(map[string]*client.Client)
}

func (m *MCPClientManager) CloseClient(serverName string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if client, exists := m.clients[serverName]; exists {
		if err := client.Close(); err != nil {
			logging.Error("error closing mcp client", "server", serverName, "error", err)
		}
		delete(m.clients, serverName)
	}
}

func (b *mcpTool) Info() tools.ToolInfo {
	required := b.tool.InputSchema.Required
	if required == nil {
		required = make([]string, 0)
	}
	var parameters map[string]any
	if b.tool.InputSchema.Properties != nil {
		parameters = b.tool.InputSchema.Properties
	} else {
		parameters = make(map[string]any)
	}

	return tools.ToolInfo{
		Name:        fmt.Sprintf("%s_%s", b.mcpName, b.tool.Name),
		Description: b.tool.Description,
		Parameters:  parameters,
		Required:    required,
	}
}

func runTool(ctx context.Context, c *client.Client, toolName string, input string) (tools.ToolResponse, error) {
	// Client is already initialized by the manager, just call the tool
	toolRequest := mcp.CallToolRequest{}
	toolRequest.Params.Name = toolName
	var args map[string]any
	if err := json.Unmarshal([]byte(input), &args); err != nil {
		return tools.NewTextErrorResponse(fmt.Sprintf("error parsing parameters: %s", err)), nil
	}
	toolRequest.Params.Arguments = args
	result, err := c.CallTool(ctx, toolRequest)
	if err != nil {
		return tools.NewTextErrorResponse(err.Error()), nil
	}

	output := ""
	for _, v := range result.Content {
		if v, ok := v.(mcp.TextContent); ok {
			output = v.Text
		} else {
			output = fmt.Sprintf("%v", v)
		}
	}

	return tools.NewTextResponse(output), nil
}

func (b *mcpTool) Run(ctx context.Context, params tools.ToolCall) (tools.ToolResponse, error) {
	sessionID, messageID := tools.GetContextValues(ctx)
	if sessionID == "" || messageID == "" {
		return tools.ToolResponse{}, fmt.Errorf("session ID and message ID are required for creating a new file")
	}
	permissionDescription := fmt.Sprintf("execute %s with the following parameters: %s", b.Info().Name, params.Input)
	p := b.permissions.Request(
		permission.CreatePermissionRequest{
			SessionID:   sessionID,
			Path:        config.WorkingDirectory(),
			ToolName:    b.Info().Name,
			Action:      "execute",
			Description: permissionDescription,
			Params:      params.Input,
		},
	)
	if !p {
		return tools.NewTextErrorResponse("permission denied"), nil
	}

	// Get client from manager (handles creation, caching, and health checking)
	c, err := b.manager.GetClient(ctx, b.mcpName, b.mcpConfig)
	if err != nil {
		return tools.NewTextErrorResponse(err.Error()), nil
	}

	return runTool(ctx, c, b.tool.Name, params.Input)
}

func NewMcpTool(name string, tool mcp.Tool, permissions permission.Service, mcpConfig config.MCPServer, manager *MCPClientManager) tools.BaseTool {
	return &mcpTool{
		mcpName:     name,
		tool:        tool,
		mcpConfig:   mcpConfig,
		permissions: permissions,
		manager:     manager,
	}
}

// shouldIncludeTool determines if a tool should be included based on allow/deny lists
func shouldIncludeTool(toolName string, allowedTools []string, deniedTools []string) bool {
	// If allowedTools is specified and not empty, only include tools in the allowlist
	if len(allowedTools) > 0 {
		for _, allowed := range allowedTools {
			if allowed == toolName {
				return true
			}
		}
		return false // Tool not in allowlist
	}
	
	// If deniedTools is specified and not empty, exclude tools in the denylist
	if len(deniedTools) > 0 {
		for _, denied := range deniedTools {
			if denied == toolName {
				return false // Tool is in denylist
			}
		}
	}
	
	// Default: include the tool (no filtering or tool not in denylist)
	return true
}

var mcpTools []tools.BaseTool
var globalMCPManager *MCPClientManager

func getTools(ctx context.Context, name string, m config.MCPServer, permissions permission.Service, manager *MCPClientManager) []tools.BaseTool {
	var stdioTools []tools.BaseTool

	// Get client from manager (this will handle creation and initialization)
	c, err := manager.GetClient(ctx, name, m)
	if err != nil {
		logging.Error("error getting mcp client", "server", name, "error", err)
		return stdioTools
	}

	// List tools from the initialized client
	toolsRequest := mcp.ListToolsRequest{}
	tools, err := c.ListTools(ctx, toolsRequest)
	if err != nil {
		logging.Error("error listing tools", "server", name, "error", err)
		return stdioTools
	}

	// Create tool instances with the manager, applying filtering if configured
	for _, t := range tools.Tools {
		toolName := t.Name
		
		// Apply tool filtering based on configuration
		if shouldIncludeTool(toolName, m.AllowedTools, m.DeniedTools) {
			stdioTools = append(stdioTools, NewMcpTool(name, t, permissions, m, manager))
		}
	}

	return stdioTools
}

func GetMcpTools(ctx context.Context, permissions permission.Service) []tools.BaseTool {
	if len(mcpTools) > 0 {
		return mcpTools
	}

	// Initialize the global manager if not already done
	if globalMCPManager == nil {
		globalMCPManager = NewMCPClientManager()
	}

	for name, m := range config.Get().MCPServers {
		mcpTools = append(mcpTools, getTools(ctx, name, m, permissions, globalMCPManager)...)
	}

	return mcpTools
}

// ShutdownMCPManager closes all MCP clients and cleans up resources
func ShutdownMCPManager() {
	if globalMCPManager != nil {
		globalMCPManager.Close()
		globalMCPManager = nil
	}
	// Clear the cached tools so they can be recreated with a new manager if needed
	mcpTools = nil
}
