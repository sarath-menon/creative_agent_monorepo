package styles

import "github.com/charmbracelet/lipgloss"

var (
	// Colors
	secondaryColor = lipgloss.Color("#9CA3AF")

	// Shared styles
	FooterStyle = lipgloss.NewStyle().
			Foreground(secondaryColor).
			MarginLeft(2).
			MarginBottom(2)
)
