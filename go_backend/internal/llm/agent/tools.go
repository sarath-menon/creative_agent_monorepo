package agent

import (
	"context"
	"fmt"

	"go_general_agent/internal/config"
	"go_general_agent/internal/history"
	"go_general_agent/internal/llm/tools"
	"go_general_agent/internal/message"
	"go_general_agent/internal/permission"
	"go_general_agent/internal/session"

	"github.com/mark3labs/mcp-go/mcp"
)

func CoderAgentTools(
	permissions permission.Service,
	sessions session.Service,
	messages message.Service,
	history history.Service,
) []tools.BaseTool {
	ctx := context.Background()
	otherTools := GetMcpTools(ctx, permissions)
	blenderExecutor := createBlenderExecutor()
	bashTool := tools.NewBashTool(permissions)
	return append(
		[]tools.BaseTool{
			bashTool,
			tools.NewEditTool(permissions, history),
			tools.NewFetchTool(permissions),
			tools.NewGlobTool(),
			tools.NewGrepTool(),
			tools.NewLsTool(),
			tools.NewViewTool(),
			tools.NewWriteTool(permissions, history),
			tools.NewBlenderTool(permissions, blenderExecutor),
			// tools.NewPixelmatorTool(permissions, bashTool),
			// tools.NewNotesTool(permissions, bashTool),
			NewAgentTool(sessions, messages),
		}, otherTools...,
	)
}

func TaskAgentTools() []tools.BaseTool {
	return []tools.BaseTool{
		tools.NewGlobTool(),
		tools.NewGrepTool(),
		tools.NewLsTool(),
		tools.NewViewTool(),
	}
}

// createBlenderExecutor creates a function that can execute Python code in Blender via MCP
func createBlenderExecutor() tools.BlenderCodeExecutor {
	return func(ctx context.Context, code string) (tools.ToolResponse, error) {
		const blenderMCPName = "blender"
		const executeCodeTool = "execute_blender_code"

		// Get the global MCP manager (initialize if needed)
		if globalMCPManager == nil {
			globalMCPManager = NewMCPClientManager()
		}
		mcpManager := globalMCPManager

		// Get Blender MCP configuration
		mcpConfig, exists := config.Get().MCPServers[blenderMCPName]
		if !exists {
			return tools.NewTextErrorResponse("Blender MCP server not configured"), nil
		}

		// Get MCP client
		client, err := mcpManager.GetClient(ctx, blenderMCPName, mcpConfig)
		if err != nil {
			return tools.NewTextErrorResponse(fmt.Sprintf("error connecting to Blender MCP: %s", err)), nil
		}

		// Prepare MCP call parameters
		executeParams := map[string]any{
			"code": code,
		}

		// Call the execute_blender_code tool via MCP
		toolRequest := mcp.CallToolRequest{}
		toolRequest.Params.Name = executeCodeTool
		toolRequest.Params.Arguments = executeParams

		result, err := client.CallTool(ctx, toolRequest)
		if err != nil {
			return tools.NewTextErrorResponse(fmt.Sprintf("error calling Blender MCP: %s", err)), nil
		}

		// Extract output from MCP response
		output := ""
		for _, v := range result.Content {
			if textContent, ok := v.(mcp.TextContent); ok {
				output = textContent.Text
			} else {
				output = fmt.Sprintf("%v", v)
			}
		}

		return tools.NewTextResponse(output), nil
	}
}
