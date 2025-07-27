package agent

import (
	"context"

	"go_general_agent/internal/history"
	"go_general_agent/internal/llm/tools"
	"go_general_agent/internal/message"
	"go_general_agent/internal/permission"
	"go_general_agent/internal/session"
)

func CoderAgentTools(
	permissions permission.Service,
	sessions session.Service,
	messages message.Service,
	history history.Service,
	manager *MCPClientManager,
) []tools.BaseTool {
	ctx := context.Background()
	otherTools := GetMcpTools(ctx, permissions, manager)
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
