package prompt

import (
	"context"
	"embed"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"

	"go_general_agent/internal/config"
	"go_general_agent/internal/llm/tools"
)

//go:embed prompts/*.md
var promptFiles embed.FS

// LoadPrompt loads a prompt from embedded markdown files
func LoadPrompt(name string) string {
	return LoadPromptWithVars(name, nil)
}

// LoadPromptWithVars loads a prompt from embedded markdown files and replaces $<name> placeholders
func LoadPromptWithVars(name string, vars map[string]string) string {
	content, err := promptFiles.ReadFile(path.Join("prompts", name+".md"))
	if err != nil {
		// This should not happen with embedded files, but provide minimal fallback
		return "Error loading prompt: " + name
	}

	result := string(content)

	// Replace $<name> placeholders with values
	if vars != nil {
		for key, value := range vars {
			placeholder := "$<" + key + ">"
			result = strings.ReplaceAll(result, placeholder, value)
		}
	}

	return strings.TrimSpace(result)
}

// getStandardVars returns standard variables available to all prompts
func getStandardVars() map[string]string {
	cwd := config.WorkingDirectory()
	isGit := isGitRepo(cwd)
	platform := runtime.GOOS
	ls := tools.NewLsTool()
	r, _ := ls.Run(context.Background(), tools.ToolCall{
		Input: `{"path":"."}`,
	})

	return map[string]string{
		"workdir":     cwd,
		"platform":    platform,
		"is_git_repo": boolToYesNo(isGit),
		"project_ls":  r.Content,
	}
}

// LoadPromptWithStandardVars loads a prompt with standard environment variables plus custom vars
func LoadPromptWithStandardVars(name string, customVars map[string]string) string {
	// Merge standard vars with custom vars
	allVars := getStandardVars()
	for k, v := range customVars {
		allVars[k] = v
	}

	return LoadPromptWithVars(name, allVars)
}

func isGitRepo(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, ".git"))
	return err == nil
}

func boolToYesNo(b bool) string {
	if b {
		return "Yes"
	}
	return "No"
}
