package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"mix/internal/config"
	"mix/internal/permission"
	"mix/internal/utils"
)

type PixelmatorParams struct {
	Operation string      `json:"operation"`
	Args      interface{} `json:"args"`
}

// Operation-specific parameter structs
type OpenParams struct {
	Filepath string `json:"filepath"`
}

type CropParams struct {
	Bounds [4]int `json:"bounds"` // [x, y, width, height]
}

type ResizeParams struct {
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Algorithm string `json:"algorithm,omitempty"`
}

type ExportParams struct {
	OutputPath string `json:"output_path"`
	Format     string `json:"format,omitempty"`
	Quality    int    `json:"quality,omitempty"`
}

type CloseParams struct {
	Save bool `json:"save,omitempty"`
}

type CreateLayerParams struct {
	LayerType string     `json:"layer_type"`
	Name      string     `json:"name,omitempty"`
	Text      string     `json:"text,omitempty"`
	FontSize  int        `json:"font_size,omitempty"`
	Color     [3]float64 `json:"color,omitempty"`
	ShapeType string     `json:"shape_type,omitempty"`
}

type LayerParams struct {
	LayerName string `json:"layer_name"`
}

type DocumentInfo struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Width        int     `json:"width"`
	Height       int     `json:"height"`
	Resolution   float64 `json:"resolution"`
	ColorProfile string  `json:"color_profile"`
}

type LayerInfo struct {
	Name      string  `json:"name"`
	Type      string  `json:"type"`
	Visible   bool    `json:"visible"`
	Opacity   float64 `json:"opacity"`
	BlendMode string  `json:"blend_mode"`
}

type ExportInfo struct {
	OutputPath string `json:"output_path"`
	Format     string `json:"format"`
	FileSize   int64  `json:"file_size"`
	Success    bool   `json:"success"`
}

type pixelmatorTool struct {
	permissions permission.Service
}

const (
	PixelmatorToolName = "pixelmator"
)

func pixelmatorDescription() string {
	return LoadToolDescription("pixelmator")
}

func NewPixelmatorTool(permission permission.Service, bashTool BaseTool) BaseTool {
	return &pixelmatorTool{
		permissions: permission,
	}
}

func (p *pixelmatorTool) Info() ToolInfo {
	return ToolInfo{
		Name:        PixelmatorToolName,
		Description: pixelmatorDescription(),
		Parameters: map[string]any{
			"operation": map[string]any{
				"type":        "string",
				"description": "The operation to perform (open_document, get_document_info, crop_document, resize_document, export_document, close_document, get_layers, create_layer, duplicate_layer, delete_layer, export_current_view)",
			},
			"args": map[string]any{
				"type":        "object",
				"description": "Operation-specific arguments",
			},
		},
		Required: []string{"operation"},
	}
}

func (p *pixelmatorTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params PixelmatorParams
	if err := json.Unmarshal([]byte(call.Input), &params); err != nil {
		return NewTextErrorResponse("invalid parameters"), nil
	}

	if params.Operation == "" {
		return NewTextErrorResponse("missing operation"), nil
	}

	sessionID, messageID := GetContextValues(ctx)
	if sessionID == "" || messageID == "" {
		return ToolResponse{}, fmt.Errorf("session ID and message ID are required for pixelmator operations")
	}

	granted := p.permissions.Request(
		permission.CreatePermissionRequest{
			SessionID:   sessionID,
			Path:        config.WorkingDirectory(),
			ToolName:    PixelmatorToolName,
			Action:      params.Operation,
			Description: fmt.Sprintf("Execute Pixelmator operation: %s", params.Operation),
			Params:      params,
		},
	)
	if !granted {
		return ToolResponse{}, permission.ErrorPermissionDenied
	}

	var result interface{}
	var err error

	switch params.Operation {
	case "open_document":
		result, err = p.openDocument(ctx, params.Args)
	case "get_document_info":
		result, err = p.getDocumentInfo(ctx)
	case "crop_document":
		result, err = p.cropDocument(ctx, params.Args)
	case "resize_document":
		result, err = p.resizeDocument(ctx, params.Args)
	case "export_document":
		result, err = p.exportDocument(ctx, params.Args)
	case "close_document":
		result, err = p.closeDocument(ctx, params.Args)
	case "get_layers":
		result, err = p.getLayers(ctx)
	case "create_layer":
		result, err = p.createLayer(ctx, params.Args)
	case "duplicate_layer":
		result, err = p.duplicateLayer(ctx, params.Args)
	case "delete_layer":
		result, err = p.deleteLayer(ctx, params.Args)
	case "export_current_view":
		result, err = p.exportCurrentView(ctx, params.Args)
	default:
		return NewTextErrorResponse(fmt.Sprintf("unknown operation: %s", params.Operation)), nil
	}

	if err != nil {
		return ToolResponse{}, fmt.Errorf("pixelmator operation failed: %w", err)
	}

	resultJSON, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return NewTextErrorResponse("failed to serialize result"), nil
	}

	return NewTextResponse(string(resultJSON)), nil
}

func (p *pixelmatorTool) openDocument(ctx context.Context, args interface{}) (*DocumentInfo, error) {
	var params OpenParams
	if err := p.parseArgs(args, &params); err != nil {
		return nil, err
	}

	if _, err := os.Stat(params.Filepath); os.IsNotExist(err) {
		return nil, fmt.Errorf("file not found: %s", params.Filepath)
	}

	script := fmt.Sprintf(`tell application "Pixelmator Pro" to open POSIX file "%s"`, params.Filepath)
	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return nil, err
	}

	return p.getDocumentInfo(ctx)
}

func (p *pixelmatorTool) getDocumentInfo(ctx context.Context) (*DocumentInfo, error) {
	script := `tell application "Pixelmator Pro" to tell front document to return (width as string) & "|" & (height as string) & "|" & name & "|" & id`
	result, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		if strings.Contains(err.Error(), "front document") {
			return nil, fmt.Errorf("no document is currently open")
		}
		return nil, err
	}

	parts := strings.Split(result, "|")
	if len(parts) < 4 {
		return nil, fmt.Errorf("invalid document info response")
	}

	width, _ := strconv.Atoi(parts[0])
	height, _ := strconv.Atoi(parts[1])

	return &DocumentInfo{
		ID:           parts[3],
		Name:         parts[2],
		Width:        width,
		Height:       height,
		Resolution:   72.0,
		ColorProfile: "sRGB",
	}, nil
}

func (p *pixelmatorTool) cropDocument(ctx context.Context, args interface{}) (*DocumentInfo, error) {
	var params CropParams
	if err := p.parseArgs(args, &params); err != nil {
		return nil, err
	}

	x, y, width, height := params.Bounds[0], params.Bounds[1], params.Bounds[2], params.Bounds[3]
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("width and height must be positive")
	}

	script := fmt.Sprintf(`tell application "Pixelmator Pro" to tell front document to crop bounds {%d, %d, %d, %d}`, x, y, x+width, y+height)
	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return nil, err
	}

	return p.getDocumentInfo(ctx)
}

func (p *pixelmatorTool) resizeDocument(ctx context.Context, args interface{}) (*DocumentInfo, error) {
	var params ResizeParams
	if err := p.parseArgs(args, &params); err != nil {
		return nil, err
	}

	if params.Width <= 0 || params.Height <= 0 {
		return nil, fmt.Errorf("width and height must be positive")
	}

	algorithm := "Lanczos"
	if params.Algorithm != "" {
		algorithmMap := map[string]string{
			"LANCZOS":  "Lanczos",
			"BILINEAR": "bilinear",
			"NEAREST":  "nearest neighbor",
		}
		if a, ok := algorithmMap[params.Algorithm]; ok {
			algorithm = a
		}
	}

	script := fmt.Sprintf(`tell application "Pixelmator Pro" to tell front document to resize to dimensions {%d, %d} algorithm "%s"`, params.Width, params.Height, algorithm)
	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return nil, err
	}

	return p.getDocumentInfo(ctx)
}

func (p *pixelmatorTool) exportDocument(ctx context.Context, args interface{}) (*ExportInfo, error) {
	var params ExportParams
	if err := p.parseArgs(args, &params); err != nil {
		return nil, err
	}

	format := "PNG"
	if params.Format != "" {
		format = params.Format
	}

	quality := 100
	if params.Quality > 0 {
		quality = params.Quality
	}

	outputDir := filepath.Dir(params.OutputPath)
	if outputDir != "" {
		os.MkdirAll(outputDir, 0755)
	}

	var script string
	if format == "JPEG" && quality < 100 {
		compressionFactor := float64(quality) / 100.0
		script = fmt.Sprintf(`tell application "Pixelmator Pro" to export front document to POSIX file "%s" as JPEG with compression factor %f`, params.OutputPath, compressionFactor)
	} else {
		script = fmt.Sprintf(`tell application "Pixelmator Pro" to export front document to POSIX file "%s" as %s`, params.OutputPath, format)
	}

	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return nil, err
	}

	fileInfo, _ := os.Stat(params.OutputPath)
	fileSize := int64(0)
	if fileInfo != nil {
		fileSize = fileInfo.Size()
	}

	return &ExportInfo{
		OutputPath: params.OutputPath,
		Format:     format,
		FileSize:   fileSize,
		Success:    true,
	}, nil
}

func (p *pixelmatorTool) closeDocument(ctx context.Context, args interface{}) (bool, error) {
	var params CloseParams
	p.parseArgs(args, &params) // Ignore errors for optional params

	if params.Save {
		script := `tell application "Pixelmator Pro" to save front document`
		utils.ExecuteAppleScript(ctx, script) // Ignore save errors
	}

	script := `tell application "Pixelmator Pro" to close front document`
	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return false, fmt.Errorf("failed to close document")
	}

	return true, nil
}

func (p *pixelmatorTool) getLayers(ctx context.Context) ([]LayerInfo, error) {
	script := `tell application "Pixelmator Pro" to get name of every layer of front document`
	result, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return nil, fmt.Errorf("no document is currently open")
	}

	if result == "" {
		return []LayerInfo{}, nil
	}

	layerNames := strings.Split(result, ", ")
	layers := make([]LayerInfo, 0, len(layerNames))

	for _, name := range layerNames {
		name = strings.TrimSpace(name)
		layers = append(layers, LayerInfo{
			Name:      name,
			Type:      "layer",
			Visible:   true,
			Opacity:   1.0,
			BlendMode: "normal",
		})
	}

	return layers, nil
}

func (p *pixelmatorTool) createLayer(ctx context.Context, args interface{}) (*LayerInfo, error) {
	var params CreateLayerParams
	if err := p.parseArgs(args, &params); err != nil {
		return nil, err
	}

	name := params.Name
	if name == "" {
		name = fmt.Sprintf("%s_layer", params.LayerType)
	}

	var script string
	switch params.LayerType {
	case "text":
		text := "Sample Text"
		if params.Text != "" {
			text = params.Text
		}
		fontSize := 48
		if params.FontSize > 0 {
			fontSize = params.FontSize
		}
		script = fmt.Sprintf(`tell application "Pixelmator Pro" to tell front document to make new text layer with properties {name:"%s", text:"%s", font size:%d}`, name, text, fontSize)

	case "color":
		r, g, b := 1.0, 1.0, 1.0
		if params.Color[0] != 0 || params.Color[1] != 0 || params.Color[2] != 0 {
			r, g, b = params.Color[0], params.Color[1], params.Color[2]
		}
		script = fmt.Sprintf(`tell application "Pixelmator Pro" to tell front document to make new color layer with properties {name:"%s", color:{%f, %f, %f}}`, name, r, g, b)

	case "shape":
		shapeType := "rectangle"
		if params.ShapeType != "" {
			shapeType = params.ShapeType
		}
		script = fmt.Sprintf(`tell application "Pixelmator Pro" to tell front document to make new %s shape layer with properties {name:"%s"}`, shapeType, name)

	default:
		return nil, fmt.Errorf("invalid layer_type: %s", params.LayerType)
	}

	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return nil, err
	}

	return &LayerInfo{
		Name:      name,
		Type:      params.LayerType,
		Visible:   true,
		Opacity:   1.0,
		BlendMode: "normal",
	}, nil
}

func (p *pixelmatorTool) duplicateLayer(ctx context.Context, args interface{}) (*LayerInfo, error) {
	var params LayerParams
	if err := p.parseArgs(args, &params); err != nil {
		return nil, err
	}

	script := fmt.Sprintf(`tell application "Pixelmator Pro" to duplicate layer "%s" of front document`, params.LayerName)
	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return nil, err
	}

	return &LayerInfo{
		Name:      params.LayerName + " copy",
		Type:      "layer",
		Visible:   true,
		Opacity:   1.0,
		BlendMode: "normal",
	}, nil
}

func (p *pixelmatorTool) deleteLayer(ctx context.Context, args interface{}) (bool, error) {
	var params LayerParams
	if err := p.parseArgs(args, &params); err != nil {
		return false, err
	}

	script := fmt.Sprintf(`tell application "Pixelmator Pro" to delete layer "%s" of front document`, params.LayerName)
	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return false, err
	}

	return true, nil
}

func (p *pixelmatorTool) exportCurrentView(ctx context.Context, args interface{}) (*ExportInfo, error) {
	var params ExportParams
	if err := p.parseArgs(args, &params); err != nil {
		return nil, err
	}

	format := "PNG"
	if params.Format != "" {
		format = params.Format
	}

	outputDir := filepath.Dir(params.OutputPath)
	if outputDir != "" {
		os.MkdirAll(outputDir, 0755)
	}

	script := fmt.Sprintf(`tell application "Pixelmator Pro" to export current view to POSIX file "%s" as %s`, params.OutputPath, format)
	_, err := utils.ExecuteAppleScript(ctx, script)
	if err != nil {
		return nil, err
	}

	fileInfo, _ := os.Stat(params.OutputPath)
	fileSize := int64(0)
	if fileInfo != nil {
		fileSize = fileInfo.Size()
	}

	return &ExportInfo{
		OutputPath: params.OutputPath,
		Format:     format,
		FileSize:   fileSize,
		Success:    true,
	}, nil
}

// parseArgs is a helper function to parse arguments into the appropriate struct
func (p *pixelmatorTool) parseArgs(args interface{}, target interface{}) error {
	if args == nil {
		return nil
	}

	argBytes, err := json.Marshal(args)
	if err != nil {
		return fmt.Errorf("failed to marshal args: %w", err)
	}

	if err := json.Unmarshal(argBytes, target); err != nil {
		return fmt.Errorf("failed to parse arguments: %w", err)
	}

	return nil
}
