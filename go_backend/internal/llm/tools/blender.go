package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"go_general_agent/internal/config"
	"go_general_agent/internal/permission"
)

type BlenderParams struct {
	Function   string         `json:"function"`
	Parameters map[string]any `json:"parameters"`
}

// BlenderCodeExecutor is a function type that executes Python code in Blender
type BlenderCodeExecutor func(ctx context.Context, code string) (ToolResponse, error)

type blenderTool struct {
	permissions permission.Service
	executor    BlenderCodeExecutor
}

const (
	BlenderToolName = "blender"
)

func NewBlenderTool(permissions permission.Service, executor BlenderCodeExecutor) BaseTool {
	return &blenderTool{
		permissions: permissions,
		executor:    executor,
	}
}

func (b *blenderTool) Info() ToolInfo {
	return ToolInfo{
		Name:        BlenderToolName,
		Description: LoadToolDescription("blender"),
		Parameters: map[string]any{
			"function": map[string]any{
				"type":        "string",
				"description": "The Blender function name to call from tools.blender module",
			},
			"parameters": map[string]any{
				"type":        "object",
				"description": "Parameters to pass to the Blender function as keyword arguments",
			},
		},
		Required: []string{"function"},
	}
}

func (b *blenderTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params BlenderParams
	if err := json.Unmarshal([]byte(call.Input), &params); err != nil {
		return NewTextErrorResponse(fmt.Sprintf("error parsing parameters: %s", err)), nil
	}

	if params.Function == "" {
		return NewTextErrorResponse("function name is required"), nil
	}

	// Get session and message IDs for permissions
	sessionID, messageID := GetContextValues(ctx)
	if sessionID == "" || messageID == "" {
		return ToolResponse{}, fmt.Errorf("session ID and message ID are required for Blender tool")
	}

	// Request permission to execute Blender function
	permissionDescription := fmt.Sprintf("Execute Blender function '%s' with parameters: %s", params.Function, call.Input)
	p := b.permissions.Request(
		permission.CreatePermissionRequest{
			SessionID:   sessionID,
			Path:        config.WorkingDirectory(),
			ToolName:    BlenderToolName,
			Action:      "execute",
			Description: permissionDescription,
			Params:      call.Input,
		},
	)
	if !p {
		return NewTextErrorResponse("permission denied"), nil
	}

	// Generate Python code to call the function
	pythonCode := generatePythonCode(params.Function, params.Parameters)

	// Execute the Python code using the BlenderCodeExecutor
	return b.executor(ctx, pythonCode)
}

func generatePythonCode(functionName string, parameters map[string]any) string {
	var code strings.Builder
	
	code.WriteString("import sys, json\n")
	code.WriteString("sys.path.insert(0, \"/Users/sarathmenon/Documents/startup/image_generation/image_gen_monorepo/python_backend/src\")\n")
	code.WriteString(fmt.Sprintf("from tools.blender import %s\n", functionName))
	
	if len(parameters) > 0 {
		parametersJSON, _ := json.Marshal(parameters)
		code.WriteString(fmt.Sprintf("result = %s(**%s)\n", functionName, string(parametersJSON)))
	} else {
		code.WriteString(fmt.Sprintf("result = %s()\n", functionName))
	}
	
	code.WriteString("print(json.dumps(result, indent=2))\n")
	return code.String()
}

