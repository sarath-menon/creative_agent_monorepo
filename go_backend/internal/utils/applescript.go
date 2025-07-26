package utils

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// ExecuteAppleScript executes an AppleScript command and returns the output
func ExecuteAppleScript(ctx context.Context, script string) (string, error) {
	cmd := exec.CommandContext(ctx, "osascript", "-e", script)
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("applescript execution failed: %w", err)
	}
	return strings.TrimSpace(string(output)), nil
}