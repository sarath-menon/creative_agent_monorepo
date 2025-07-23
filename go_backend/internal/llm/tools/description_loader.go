package tools

import (
	"embed"
	"path"
	"strings"
)

//go:embed descriptions/*.md
var descriptionFiles embed.FS

// LoadToolDescription loads a tool description from embedded markdown files
func LoadToolDescription(name string) string {
	content, err := descriptionFiles.ReadFile(path.Join("descriptions", name+".md"))
	if err != nil {
		// Fallback for missing description files
		return "Tool description not available"
	}

	return strings.TrimSpace(string(content))
}