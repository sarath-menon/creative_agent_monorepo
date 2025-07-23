package tui

import "github.com/charmbracelet/lipgloss"

var (
	// Colors
	primaryColor     = lipgloss.Color("#FFFFFF")
	secondaryColor   = lipgloss.Color("#9CA3AF")
	accentColor      = lipgloss.Color("#EC4899")
	bgColor          = lipgloss.Color("#1F2937")
	borderColor      = lipgloss.Color("#374151")
	inputBorderColor = lipgloss.Color("#6B7280")

	// Semantic text colors
	errorColor = lipgloss.Color("#EF4444")

	// Base styles
	baseStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			Background(bgColor)

	// Header styles
	headerStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			Bold(true).
			Padding(0, 1).
			MarginBottom(1)

	// Input styles
	inputStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(borderColor).
			MarginRight(1).
			MarginLeft(1)

	inputFocusedStyle = inputStyle.Copy().
				BorderForeground(inputBorderColor)

	// Message styles
	userMessageStyle = lipgloss.NewStyle().
				Foreground(secondaryColor).
				Bold(true)

	assistantMessageStyle = lipgloss.NewStyle().
				Foreground(primaryColor)

	// Role-specific content styles
	userMessageContentStyle = lipgloss.NewStyle().
				Foreground(secondaryColor).
				PaddingLeft(1).
				MarginLeft(3)

	assistantMessageContentStyle = lipgloss.NewStyle().
					Foreground(primaryColor).
					PaddingLeft(1).
					MarginLeft(3)

	// Status styles
	statusStyle = lipgloss.NewStyle().
			Foreground(secondaryColor).
			Italic(true).
			Padding(0, 1)

	processingStyle = lipgloss.NewStyle().
			Foreground(secondaryColor).
			Bold(true).
			Padding(0, 1)

	// Error styles
	errorStyle = lipgloss.NewStyle().
			Foreground(errorColor).
			Bold(true)

	// Textarea styles (clean, no highlighting)
	textareaFocusedStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Background(lipgloss.NoColor{})

	textareaBlurredStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Background(lipgloss.NoColor{})

	textareaPlaceholderStyle = lipgloss.NewStyle().
					Foreground(secondaryColor).
					Background(lipgloss.NoColor{})

	textareaCursorStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Background(lipgloss.NoColor{})

	// Suggestion styles
	suggestionBoxStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(primaryColor).
				Padding(0, 1).
				MarginTop(1).
				Background(bgColor).
				Foreground(primaryColor)

	suggestionHeaderStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Bold(true)

	suggestionStyle = lipgloss.NewStyle().
			Foreground(primaryColor).
			PaddingLeft(1)

	suggestionSelectedStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Bold(true).
				Background(lipgloss.Color("#2D1B69")).
				PaddingLeft(1)

	// Viewport styles
	viewportStyle = lipgloss.NewStyle()

	viewportFocusedStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(borderColor)
)
