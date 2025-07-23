package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"go_general_agent/internal/styles"
)

// View renders the TUI
func (m Model) View() string {
	if !m.ready {
		return "Initializing..."
	}

	// If in session browser mode, show session table interface
	if m.mode == ModeSessionBrowser {
		return m.sessionBrowserView()
	}

	// If in permission prompt mode, show permission prompt interface
	if m.mode == ModePermissionPrompt {
		return m.permissionPromptView()
	}

	var sections []string

	// Header
	header := headerStyle.Render("🤖 OpenCode TUI - AI Assistant")
	sections = append(sections, header)

	// Main content area (viewport) - always without border
	content := viewportStyle.Render(m.viewport.View())
	sections = append(sections, content)

	// Status line (only show when processing or error)
	if m.processing {
		status := processingStyle.Render(fmt.Sprintf("%s Processing your request...", m.spinner.View()))
		sections = append(sections, status)
	} else if m.error != "" {
		status := errorStyle.Render(fmt.Sprintf("Error: %s", m.error))
		sections = append(sections, status)
	}

	// Suggestions (if showing)
	if len(m.suggestions) > 0 {
		suggestionsView := m.suggestionsView()
		sections = append(sections, suggestionsView)
	}

	// Input area - always show border
	inputSection := inputFocusedStyle.Render(m.textArea.View())
	sections = append(sections, inputSection)

	// File picker (if showing)
	if m.mode == ModeFilePicker {
		filePickerView := m.filePicker.View()
		sections = append(sections, filePickerView)
	}

	// Help text
	help := m.helpView()
	sections = append(sections, help)

	return lipgloss.JoinVertical(lipgloss.Left, sections...)
}

// sessionBrowserView renders the session browser interface
func (m Model) sessionBrowserView() string {
	var sections []string

	// Header
	header := headerStyle.Render("🔍 Session Browser - Select a session")
	sections = append(sections, header)

	// Session table
	tableView := m.sessionTable.View()
	sections = append(sections, tableView)

	// Help text for navigation
	helpText := styles.FooterStyle.Render("↑/↓ or j/k: navigate • Enter: select session • Esc/q: cancel")
	sections = append(sections, helpText)

	return lipgloss.JoinVertical(lipgloss.Left, sections...)
}

// permissionPromptView renders the permission approval interface
func (m Model) permissionPromptView() string {
	var sections []string

	// Header
	header := headerStyle.Render("🔒 Permission Required")
	sections = append(sections, header)

	if m.currentPermissionRequest != nil {
		req := m.currentPermissionRequest

		// Permission details
		details := fmt.Sprintf(`
Tool: %s
Action: %s
Path: %s
Description: %s

The application is requesting permission to execute this action.
Do you want to allow this?`, req.ToolName, req.Action, req.Path, req.Description)

		detailsView := viewportStyle.Render(details)
		sections = append(sections, detailsView)

		// Action buttons
		actions := styles.FooterStyle.Render("Y/Enter: Allow • N/Esc: Deny • Ctrl+C: Quit")
		sections = append(sections, actions)
	} else {
		// Fallback if no request
		noRequest := viewportStyle.Render("No permission request pending.")
		sections = append(sections, noRequest)
		
		fallback := styles.FooterStyle.Render("Esc: Return to chat")
		sections = append(sections, fallback)
	}

	return lipgloss.JoinVertical(lipgloss.Left, sections...)
}

// suggestionsView renders the suggestions dropdown
func (m Model) suggestionsView() string {
	if len(m.suggestions) == 0 {
		return ""
	}

	var lines []string
	for i, suggestion := range m.suggestions {
		prefix := "  "
		if i == m.selectedSuggestion {
			prefix = "► "
			lines = append(lines, suggestionSelectedStyle.Render(prefix+suggestion))
		} else {
			lines = append(lines, suggestionStyle.Render(prefix+suggestion))
		}
	}

	return suggestionBoxStyle.Render(strings.Join(lines, "\n"))
}

// helpView renders the help text
func (m Model) helpView() string {
	return styles.FooterStyle.Render("⏵⏵ auto-accept edits on")
}
