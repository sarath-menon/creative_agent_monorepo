package tui

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/cursor"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"go_general_agent/internal/app"
	"go_general_agent/internal/commands"
	"go_general_agent/internal/permission"
	"go_general_agent/internal/pubsub"
	"go_general_agent/internal/session"
)

// Mode represents the current UI mode
type Mode int

const (
	ModeNormal         Mode = iota // Default chat mode
	ModeFilePicker                 // File selection overlay
	ModeSessionBrowser             // Session selection interface
	ModePermissionPrompt           // Permission approval prompt
)

// Message represents a chat message
type Message struct {
	Role    string // "user" or "assistant"
	Content string
}

// Model represents the state of our TUI application
type Model struct {
	app     *app.App
	ctx     context.Context
	session session.Session

	// UI state
	mode Mode

	// UI components
	textArea textarea.Model
	viewport viewport.Model
	spinner  spinner.Model

	// File picker
	filePicker FilePickerModel

	// Session browser
	sessionTable table.Model
	sessions     []session.Session

	// Permission handling
	currentPermissionRequest *permission.PermissionRequest
	permissionEvents         <-chan pubsub.Event[permission.PermissionRequest]

	// Commands
	commandRegistry *commands.Registry

	// Suggestions
	suggestions        []string
	selectedSuggestion int

	// State
	messages   []Message
	processing bool
	error      string
	width      int
	height     int
	ready      bool

	// Message history navigation
	historyIndex     int      // -1 = current input, 0+ = history index
	currentInput     string   // preserve text when navigating
	userMessageCache []string // lazy-loaded cross-session user messages
}

// NewModel creates a new TUI model
func NewModel(ctx context.Context, app *app.App) (*Model, error) {
	// Create a new session for this TUI session
	sess, err := app.Sessions.Create(ctx, "TUI Session")
	if err != nil {
		return nil, err
	}

	// Initialize text area
	ta := textarea.New()
	ta.Cursor.SetMode(cursor.CursorStatic)
	ta.Placeholder = "Type your message..."
	ta.Focus()
	ta.CharLimit = 1000
	ta.SetWidth(50)
	ta.SetHeight(3)
	ta.ShowLineNumbers = false

	// Apply custom styling to remove grey highlighting
	ta.FocusedStyle.Base = textareaFocusedStyle
	ta.FocusedStyle.Text = textareaFocusedStyle
	ta.BlurredStyle.Base = textareaBlurredStyle
	ta.BlurredStyle.Text = textareaBlurredStyle
	ta.FocusedStyle.Placeholder = textareaPlaceholderStyle
	ta.BlurredStyle.Placeholder = textareaPlaceholderStyle
	ta.FocusedStyle.CursorLine = textareaCursorStyle
	ta.BlurredStyle.CursorLine = textareaCursorStyle

	// Initialize viewport
	vp := viewport.New(80, 20)
	vp.SetContent("Welcome to OpenCode TUI! Type your message below and press Enter.\n\n")

	// Initialize spinner
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = processingStyle

	// Initialize command registry
	registry := commands.NewRegistry()
	if err := registry.LoadCommands(); err != nil {
		return nil, err
	}

	// Initialize file picker
	fp := NewFilePickerModel()

	model := &Model{
		app:                app,
		ctx:                ctx,
		session:            sess,
		mode:               ModeNormal,
		textArea:           ta,
		viewport:           vp,
		spinner:            s,
		filePicker:         fp,
		commandRegistry:    registry,
		suggestions:        []string{},
		selectedSuggestion: 0,
		messages:           []Message{},
		processing:         false,
		ready:              false,
		historyIndex:       -1,
		currentInput:       "",
		userMessageCache:   []string{},
	}

	// Subscribe to permission events
	model.permissionEvents = app.Permissions.Subscribe(ctx)

	return model, nil
}

// Init initializes the model
func (m Model) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		m.listenForPermissionEvents(),
	)
}

// listenForPermissionEvents returns a command that listens for permission events
func (m Model) listenForPermissionEvents() tea.Cmd {
	return func() tea.Msg {
		select {
		case event := <-m.permissionEvents:
			if event.Type == pubsub.CreatedEvent {
				return permissionRequestMsg{request: event.Payload}
			}
		}
		return nil
	}
}

// setMode changes the UI mode with proper setup/cleanup
func (m *Model) setMode(mode Mode) tea.Cmd {
	// Exit current mode
	switch m.mode {
	case ModeFilePicker:
		m.filePicker.SetFilter("") // clear filter
	case ModeSessionBrowser:
		m.sessions = nil // clear cached sessions
	}

	// Set new mode
	m.mode = mode

	// Enter new mode
	switch mode {
	case ModeFilePicker:
		return m.filePicker.Init()
	case ModeSessionBrowser:
		return m.setupSessionBrowser()
	case ModePermissionPrompt:
		// No special setup needed for permission prompt
		return nil
	}

	return nil
}

// setupSessionBrowser initializes the session browser table
func (m *Model) setupSessionBrowser() tea.Cmd {
	// Load sessions from the service
	sessions, err := m.app.Sessions.List(m.ctx)
	if err != nil {
		m.error = fmt.Sprintf("Error loading sessions: %v", err)
		m.mode = ModeNormal
		return nil
	}

	if len(sessions) == 0 {
		m.error = "No sessions found"
		m.mode = ModeNormal
		return nil
	}

	// Cache sessions for later use
	m.sessions = sessions

	// Define table columns (optimized for navigation)
	columns := []table.Column{
		{Title: " ", Width: 3},        // Status
		{Title: "Title", Width: 25},   // Title (wider for better readability)
		{Title: "Msgs", Width: 4},     // Messages
		{Title: "Tokens", Width: 7},   // Tokens
		{Title: "Cost", Width: 7},     // Cost
		{Title: "Created", Width: 12}, // Created
	}

	// Build table rows
	var rows []table.Row
	for _, s := range sessions {
		// Status indicator
		status := " "
		if s.ID == m.session.ID {
			status = "●"
		}

		// Format title (truncate if too long)
		title := s.Title
		if len(title) > 23 {
			title = title[:20] + "..."
		}

		// Format tokens
		totalTokens := s.PromptTokens + s.CompletionTokens
		tokensStr := "-"
		if totalTokens > 0 {
			if totalTokens >= 1000 {
				tokensStr = fmt.Sprintf("%dk", totalTokens/1000)
			} else {
				tokensStr = fmt.Sprintf("%d", totalTokens)
			}
		}

		// Format cost
		costStr := "-"
		if s.Cost > 0 {
			if s.Cost >= 1.0 {
				costStr = fmt.Sprintf("$%.2f", s.Cost)
			} else {
				costStr = fmt.Sprintf("$%.3f", s.Cost)
			}
		}

		// Format creation date
		created := time.Unix(s.CreatedAt, 0).Format("Jan 2 15:04")

		rows = append(rows, table.Row{
			status,
			title,
			fmt.Sprintf("%d", s.MessageCount),
			tokensStr,
			costStr,
			created,
		})
	}

	// Create and configure the table
	height := len(rows) + 2 // +2 for header and padding
	if height > 15 {
		height = 15 // Max height of 15
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithFocused(true), // Enable keyboard navigation
		table.WithHeight(height),
	)

	// Apply clean styling
	tableStyle := table.DefaultStyles()
	tableStyle.Header = tableStyle.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240")).
		BorderBottom(true).
		Bold(false).
		Foreground(lipgloss.Color("245"))

	tableStyle.Cell = tableStyle.Cell.
		Foreground(lipgloss.Color("252"))

	tableStyle.Selected = tableStyle.Selected.
		Foreground(lipgloss.Color("229")).
		Background(lipgloss.Color("57")).
		Bold(false)

	t.SetStyles(tableStyle)

	// Set the table
	m.sessionTable = t

	return nil
}

// processMessageCmd is a command that processes a user message
func (m *Model) processMessageCmd(message string) tea.Cmd {
	return func() tea.Msg {
		// Add user message to history
		m.messages = append(m.messages, Message{
			Role:    "user",
			Content: message,
		})

		// Clear message history cache since we added a new user message
		m.clearMessageHistoryCache()


		// Start processing with the agent
		done, err := m.app.CoderAgent.Run(m.ctx, m.session.ID, message)
		if err != nil {
			return errorMsg{error: err}
		}

		// Wait for the result
		result := <-done
		if result.Error != nil {
			return errorMsg{error: result.Error}
		}

		// Get the content from the response message
		content := "No content available"
		if result.Message.Content().String() != "" {
			content = result.Message.Content().String()
		}

		// Add assistant response to history
		return responseMsg{content: content}
	}
}

// Message types for the Bubble Tea update loop
type errorMsg struct{ error }
type responseMsg struct{ content string }
type processingMsg struct{}
type commandMsg struct{ content string }
type permissionRequestMsg struct{ request permission.PermissionRequest }

// handleFileSelection handles a selected file
func (m *Model) handleFileSelection(path string) {
	// Find the @ character in the current text
	currentText := m.textArea.Value()

	// Keep the @ and add the file path after it
	atIndex := strings.LastIndex(currentText, "@")
	if atIndex != -1 {
		// Keep the @ and add the file path after it
		newText := currentText[:atIndex] + "@" + path
		m.textArea.SetValue(newText)

		// Move cursor to the end of inserted path
		m.textArea.SetCursor(atIndex + len(path) + 1) // +1 for the @ character

		// Add a subtle notification to the viewport
		m.addMessageToViewport("assistant", "File referenced: @"+path)
	} else {
		// Fallback: append to the end if @ not found
		newText := currentText + "@" + path
		m.textArea.SetValue(newText)
		m.textArea.SetCursor(len(newText))
	}
}

// updateFilePicker handles messages when in file picker mode
func (m Model) updateFilePicker(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case FilePickerMsg:
		// File was selected
		m.handleFileSelection(msg.FilePath)
		return m, m.setMode(ModeNormal)

	case FilePickerCancelMsg:
		// File picker was cancelled
		return m, m.setMode(ModeNormal)

	case tea.KeyMsg:
		// Only pass navigation keys to file picker, let typing keys fall through to text area
		if isNavigationKey(msg.String()) {
			updated, cmd := m.filePicker.Update(msg)
			m.filePicker = updated
			return m, cmd
		}
		// Let typing keys fall through to normal handling for text area
	}

	// Update text area for typing while file picker is open
	var cmd tea.Cmd
	oldValue := m.textArea.Value()
	m.textArea, cmd = m.textArea.Update(msg)
	cmds = append(cmds, cmd)

	// Update suggestions if text changed (this handles @ detection)
	if m.textArea.Value() != oldValue {
		m.updateSuggestions()
	}

	// Pass other messages to file picker
	updated, cmd := m.filePicker.Update(msg)
	m.filePicker = updated
	cmds = append(cmds, cmd)

	return m, tea.Batch(cmds...)
}

// updateSessionBrowser handles messages when in session browser mode
func (m Model) updateSessionBrowser(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k", "down", "j":
			// Navigate up/down in table
			var cmd tea.Cmd
			m.sessionTable, cmd = m.sessionTable.Update(msg)
			return m, cmd

		case "enter":
			// Select current session and exit browser mode
			selectedRow := m.sessionTable.SelectedRow()
			if len(selectedRow) > 0 && len(m.sessions) > m.sessionTable.Cursor() {
				selectedSession := m.sessions[m.sessionTable.Cursor()]
				m.setMode(ModeNormal)

				// If it's not the current session, switch to it
				if selectedSession.ID != m.session.ID {
					err := m.loadSessionMessages(selectedSession.ID)
					if err != nil {
						m.error = fmt.Sprintf("Error loading session: %v", err)
					} else {
						m.session = selectedSession
						m.addMessageToViewport("assistant", fmt.Sprintf("Switched to session: %s", selectedSession.Title))
					}
				}
			}
			return m, nil

		case "esc", "q":
			// Exit browser mode without selecting
			return m, m.setMode(ModeNormal)
		}

	default:
		// Pass other messages to table
		var cmd tea.Cmd
		m.sessionTable, cmd = m.sessionTable.Update(msg)
		return m, cmd
	}

	return m, nil
}

// updatePermissionPrompt handles messages when in permission prompt mode
func (m Model) updatePermissionPrompt(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "y", "Y", "enter":
			// Approve the permission
			if m.currentPermissionRequest != nil {
				m.app.Permissions.Grant(*m.currentPermissionRequest)
				m.currentPermissionRequest = nil
				m.addMessageToViewport("assistant", "Permission granted.")
			}
			return m, tea.Batch(m.setMode(ModeNormal), m.listenForPermissionEvents())

		case "n", "N", "esc":
			// Deny the permission
			if m.currentPermissionRequest != nil {
				m.app.Permissions.Deny(*m.currentPermissionRequest)
				m.currentPermissionRequest = nil
				m.addMessageToViewport("assistant", "Permission denied.")
			}
			return m, tea.Batch(m.setMode(ModeNormal), m.listenForPermissionEvents())

		case "ctrl+c":
			// Still allow quit even in permission mode
			return m, tea.Quit
		}
	}

	return m, nil
}

// updateNormal handles messages when in normal chat mode
func (m Model) updateNormal(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		headerHeight := lipgloss.Height(headerStyle.Render("OpenCode TUI"))
		footerHeight := 6 // Input area height (increased for textarea)

		if !m.ready {
			m.viewport = viewport.New(msg.Width, msg.Height-headerHeight-footerHeight)
			m.viewport.SetContent("Welcome to OpenCode TUI! Type your message below and press Enter.\n\n")
			m.ready = true
		} else {
			m.viewport.Width = msg.Width
			m.viewport.Height = msg.Height - headerHeight - footerHeight
		}

		m.textArea.SetWidth(msg.Width - 4)
		m.width = msg.Width
		m.height = msg.Height

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit

		case "esc":
			// Hide suggestions on escape
			if len(m.suggestions) > 0 {
				m.suggestions = []string{}
				m.selectedSuggestion = 0
				return m, nil
			}

		case "tab":
			// Accept suggestion on tab
			if len(m.suggestions) > 0 {
				m.acceptSuggestion()
				return m, nil
			}

		case "up":
			// Navigate suggestions up
			if len(m.suggestions) > 0 {
				m.selectedSuggestion--
				if m.selectedSuggestion < 0 {
					m.selectedSuggestion = len(m.suggestions) - 1
				}
				return m, nil
			}

			// Navigate message history backwards (older messages)
			history := m.getUserMessageHistory()
			if len(history) > 0 {
				// Save current input when starting history navigation
				if m.historyIndex == -1 {
					m.currentInput = m.textArea.Value()
				}

				// Move to older message
				m.historyIndex++
				if m.historyIndex >= len(history) {
					m.historyIndex = len(history) - 1 // Stay at oldest message
				}

				// Load the message into text area
				m.textArea.SetValue(history[m.historyIndex])
				m.textArea.SetCursor(len(history[m.historyIndex]))
				return m, nil
			}

		case "down":
			// Navigate suggestions down
			if len(m.suggestions) > 0 {
				m.selectedSuggestion++
				if m.selectedSuggestion >= len(m.suggestions) {
					m.selectedSuggestion = 0
				}
				return m, nil
			}

			// Navigate message history forwards (newer messages)
			if m.historyIndex >= 0 { // Only if we're in history navigation
				history := m.getUserMessageHistory()

				// Move to newer message
				m.historyIndex--

				if m.historyIndex < 0 {
					// Return to current input
					m.historyIndex = -1
					m.textArea.SetValue(m.currentInput)
					m.textArea.SetCursor(len(m.currentInput))
				} else {
					// Load the newer message from history
					m.textArea.SetValue(history[m.historyIndex])
					m.textArea.SetCursor(len(history[m.historyIndex]))
				}
				return m, nil
			}

		case "enter":
			// Accept suggestion on enter if showing suggestions
			if len(m.suggestions) > 0 {
				m.acceptSuggestion()
				return m, nil
			}

			if !m.processing && strings.TrimSpace(m.textArea.Value()) != "" {
				message := strings.TrimSpace(m.textArea.Value())
				m.textArea.SetValue("")

				// Check for slash commands
				if commands.IsSlashCommand(message) {
					return m.handleSlashCommand(message)
				}

				m.processing = true
				m.error = ""

				// Update viewport with user message
				m.addMessageToViewport("user", message)

				return m, tea.Batch(
					m.processMessageCmd(message),
					m.spinner.Tick,
				)
			}

		case "ctrl+l":
			// Clear the screen
			m.messages = []Message{}
			m.viewport.SetContent("Welcome to OpenCode TUI! Type your message below and press Enter.\n\n")
			// Clear message history cache since screen was cleared
			m.clearMessageHistoryCache()
		}

	case responseMsg:
		m.processing = false
		m.messages = append(m.messages, Message{
			Role:    "assistant",
			Content: msg.content,
		})
		m.addMessageToViewport("assistant", msg.content)

	case errorMsg:
		m.processing = false
		m.error = msg.error.Error()

	case commandMsg:
		// Handle special command responses
		if msg.content == "CLEAR_CHAT" {
			m.messages = []Message{}
			m.viewport.SetContent("Welcome to OpenCode TUI! Type your message below and press Enter.\n\n")
			// Clear message history cache since chat was cleared
			m.clearMessageHistoryCache()
		} else if msg.content == "SESSION_BROWSER_MODE" {
			// Enter session browser mode
			return m, m.setMode(ModeSessionBrowser)
		} else {
			// Regular command response
			m.addMessageToViewport("assistant", msg.content)
		}

	case spinner.TickMsg:
		if m.processing {
			var cmd tea.Cmd
			m.spinner, cmd = m.spinner.Update(msg)
			cmds = append(cmds, cmd)
		}
	}

	// Update text area
	var cmd tea.Cmd
	oldValue := m.textArea.Value()
	m.textArea, cmd = m.textArea.Update(msg)
	cmds = append(cmds, cmd)

	// Update suggestions if text changed
	if m.textArea.Value() != oldValue {
		m.updateSuggestions()
	}

	// Update viewport only for viewport-relevant messages (not text input)
	switch msg.(type) {
	case tea.WindowSizeMsg:
		// Window resize should update viewport
		m.viewport, cmd = m.viewport.Update(msg)
		cmds = append(cmds, cmd)
	case tea.KeyMsg:
		// Only update viewport for navigation keys, not text input
		if keyMsg := msg.(tea.KeyMsg); isViewportNavigationKey(keyMsg.String()) {
			m.viewport, cmd = m.viewport.Update(msg)
			cmds = append(cmds, cmd)
		}
	default:
		// Update viewport for other message types
		m.viewport, cmd = m.viewport.Update(msg)
		cmds = append(cmds, cmd)
	}

	return m, tea.Batch(cmds...)
}

// Update handles messages and updates the model by routing to mode-specific handlers
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	// Handle permission request messages
	switch msg := msg.(type) {
	case permissionRequestMsg:
		m.currentPermissionRequest = &msg.request
		// Continue listening for more permission events
		return m, tea.Batch(m.setMode(ModePermissionPrompt), m.listenForPermissionEvents())
	}

	// Check for pending permission request before routing to modes
	if m.currentPermissionRequest != nil && m.mode != ModePermissionPrompt {
		// Switch to permission prompt mode
		return m, m.setMode(ModePermissionPrompt)
	}

	// Route to appropriate mode-specific handler
	switch m.mode {
	case ModeFilePicker:
		return m.updateFilePicker(msg)
	case ModeSessionBrowser:
		return m.updateSessionBrowser(msg)
	case ModePermissionPrompt:
		return m.updatePermissionPrompt(msg)
	default:
		return m.updateNormal(msg)
	}
}

// updateSuggestions updates the command suggestions based on current input
// and checks for @ to show file picker
func (m *Model) updateSuggestions() {
	input := m.textArea.Value()

	// For multi-line textarea, only consider the current line
	lines := strings.Split(input, "\n")
	currentLine := ""
	if len(lines) > 0 {
		currentLine = lines[len(lines)-1] // Get the last (current) line
	}

	// Check for @ character to show/update file picker
	if strings.Contains(currentLine, "@") {
		// Find the last @ character and extract filter text after it
		lastAtIndex := strings.LastIndex(currentLine, "@")
		filterText := currentLine[lastAtIndex+1:] // text after the @

		// Show file picker if not already showing
		if m.mode != ModeFilePicker {
			m.setMode(ModeFilePicker)
		}

		// Update the file picker filter with the text after @
		m.filePicker.SetFilter(filterText)
	} else if m.mode == ModeFilePicker {
		// Hide file picker if @ is no longer in the current line
		m.setMode(ModeNormal)
	}

	// Only show command suggestions if current line starts with /
	if !strings.HasPrefix(currentLine, "/") {
		m.suggestions = []string{}
		m.selectedSuggestion = 0
		return
	}

	// Get command name after /
	commandPart := strings.TrimPrefix(currentLine, "/")

	// Get all available commands
	allCommands := m.commandRegistry.GetAllCommands()

	// Filter commands based on input
	var filtered []string
	for name := range allCommands {
		if strings.HasPrefix(name, commandPart) {
			filtered = append(filtered, name)
		}
	}

	// Sort suggestions
	sort.Strings(filtered)

	m.suggestions = filtered

	// Reset selection if suggestions changed
	if m.selectedSuggestion >= len(m.suggestions) {
		m.selectedSuggestion = 0
	}
}

// acceptSuggestion accepts the currently selected suggestion
func (m *Model) acceptSuggestion() {
	if len(m.suggestions) > 0 && m.selectedSuggestion < len(m.suggestions) {
		selectedCmd := m.suggestions[m.selectedSuggestion]

		// Replace the current line with the selected command
		input := m.textArea.Value()
		lines := strings.Split(input, "\n")

		if len(lines) > 0 {
			// Replace the last line with the selected command
			lines[len(lines)-1] = "/" + selectedCmd + " "
			newValue := strings.Join(lines, "\n")
			m.textArea.SetValue(newValue)
			m.textArea.SetCursor(len(newValue))
		} else {
			// Fallback if no lines
			m.textArea.SetValue("/" + selectedCmd + " ")
			m.textArea.SetCursor(len(m.textArea.Value()))
		}

		m.suggestions = []string{}
		m.selectedSuggestion = 0
	}
}

// handleSlashCommand processes slash commands
func (m Model) handleSlashCommand(input string) (Model, tea.Cmd) {
	// Add user input to viewport
	m.addMessageToViewport("user", input)

	return m, func() tea.Msg {
		// Parse command
		parsed, err := commands.ParseCommand(input)
		if err != nil {
			return commandMsg{content: "Error: " + err.Error()}
		}

		// Execute command
		result, err := m.commandRegistry.ExecuteCommand(m.ctx, parsed.Name, parsed.Arguments)
		if err != nil {
			return commandMsg{content: "Error: " + err.Error()}
		}

		// Check for special command responses
		if strings.HasPrefix(result, "CLEAR_CHAT") {
			return commandMsg{content: result}
		}
		if strings.HasPrefix(result, "SESSION_INFO:") {
			return commandMsg{content: m.getCurrentSessionInfo()}
		}
		if strings.HasPrefix(result, "SESSION_LIST") {
			// Signal to enter session browser mode (actual setup happens in Update)
			return commandMsg{content: "SESSION_BROWSER_MODE"}
		}
		if strings.HasPrefix(result, "SESSION_SWITCH:") {
			sessionID := strings.TrimPrefix(result, "SESSION_SWITCH:")
			return commandMsg{content: m.switchToSession(sessionID)}
		}

		// Check if it's a prompt that should be sent to the agent
		if !strings.HasPrefix(result, "Available") &&
			!strings.HasPrefix(result, "Current session") &&
			!strings.HasPrefix(result, "No MCP") {
			// This looks like a prompt for the agent, process it
			done, err := m.app.CoderAgent.Run(m.ctx, m.session.ID, result)
			if err != nil {
				return errorMsg{error: err}
			}

			agentResult := <-done
			if agentResult.Error != nil {
				return errorMsg{error: agentResult.Error}
			}

			content := "No content available"
			if agentResult.Message.Content().String() != "" {
				content = agentResult.Message.Content().String()
			}

			return responseMsg{content: content}
		}

		return commandMsg{content: result}
	}
}

// isNavigationKey returns true if the key should be handled by the file picker for navigation
func isNavigationKey(key string) bool {
	switch key {
	case "up", "down", "k", "j", "enter", "esc":
		return true
	default:
		return false
	}
}

// isViewportNavigationKey returns true if the key should update the viewport
func isViewportNavigationKey(key string) bool {
	switch key {
	case "pgup", "pgdn", "home", "end":
		return true
	default:
		return false
	}
}

// getUserMessageHistory builds and caches cross-session user message history
func (m *Model) getUserMessageHistory() []string {
	// Return cached history if available
	if len(m.userMessageCache) > 0 {
		return m.userMessageCache
	}

	var history []string

	// First, add user messages from current session (newest first)
	for i := len(m.messages) - 1; i >= 0; i-- {
		if m.messages[i].Role == "user" {
			history = append(history, m.messages[i].Content)
		}
	}

	// Get all sessions sorted by creation time (newest first)
	sessions, err := m.app.Sessions.List(m.ctx)
	if err != nil {
		// If we can't load sessions, return what we have from current session
		m.userMessageCache = history
		return history
	}

	// Sort sessions by creation time (newest first)
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].CreatedAt > sessions[j].CreatedAt
	})

	// Add user messages from previous sessions (skip current session)
	for _, session := range sessions {
		if session.ID == m.session.ID {
			continue // Skip current session as we already processed it
		}

		// Get messages for this session
		messages, err := m.app.Messages.List(m.ctx, session.ID)
		if err != nil {
			continue // Skip this session if we can't load messages
		}

		// Add user messages from this session (newest first)
		for i := len(messages) - 1; i >= 0; i-- {
			if string(messages[i].Role) == "user" {
				textContent := messages[i].Content()
				if textContent.Text != "" {
					history = append(history, textContent.Text)
				}
			}
		}
	}

	// Cache the built history
	m.userMessageCache = history
	return history
}

// clearMessageHistoryCache clears the cached user message history
func (m *Model) clearMessageHistoryCache() {
	m.userMessageCache = []string{}
	m.historyIndex = -1
	m.currentInput = ""
}

// addMessageToViewport adds a message to the viewport content
func (m *Model) addMessageToViewport(role, content string) {
	var styledMessage string

	// Calculate available width for message content
	// Account for margins, padding, and role indicator (margin is now in content style)
	availableWidth := m.viewport.Width - 8 // 4 for margin left, 1 for role indicator, 1 for padding, 2 buffer

	if role == "user" {
		// Prepend role indicator to content and apply style to entire block
		fullContent := "• " + content
		styledMessage = userMessageContentStyle.Copy().Width(availableWidth).Render(fullContent)

	} else {
		// Prepend role indicator to content and apply style to entire block
		fullContent := "> " + content
		styledMessage = assistantMessageContentStyle.Copy().Width(availableWidth).Render(fullContent)
	}

	currentContent := m.viewport.View()
	newContent := currentContent + "\n" + styledMessage + "\n"
	m.viewport.SetContent(newContent)
	m.viewport.ViewDown()
}

// getCurrentSessionInfo returns formatted info about the current session
func (m *Model) getCurrentSessionInfo() string {
	s := m.session
	created := time.Unix(s.CreatedAt, 0).Format("Jan 2, 2006 3:04 PM")

	return fmt.Sprintf(`Current Session Information:
• ID: %s
• Title: %s
• Messages: %d
• Tokens: %d prompt, %d completion
• Cost: $%.4f
• Created: %s`,
		s.ID, s.Title, s.MessageCount, s.PromptTokens, s.CompletionTokens, s.Cost, created)
}

// getSessionsList returns formatted table of all sessions
func (m *Model) getSessionsList() string {
	sessions, err := m.app.Sessions.List(m.ctx)
	if err != nil {
		return fmt.Sprintf("Error loading sessions: %v", err)
	}

	if len(sessions) == 0 {
		return "No sessions found."
	}

	// Define optimized table columns (total width: ~60 chars)
	columns := []table.Column{
		{Title: " ", Width: 3},       // Status
		{Title: "Title", Width: 20},  // Title
		{Title: "Msgs", Width: 4},    // Messages
		{Title: "Tokens", Width: 6},  // Tokens
		{Title: "Cost", Width: 6},    // Cost
		{Title: "Created", Width: 8}, // Created
		{Title: "ID", Width: 8},      // ID
	}

	// Build table rows
	var rows []table.Row
	for _, s := range sessions {
		// Status indicator - cleaner formatting
		status := " "
		if s.ID == m.session.ID {
			status = "●"
		}

		// Format title (truncate if too long)
		title := s.Title
		if len(title) > 18 {
			title = title[:15] + "..."
		}

		// Format tokens (right-aligned)
		totalTokens := s.PromptTokens + s.CompletionTokens
		tokensStr := "-"
		if totalTokens > 0 {
			if totalTokens >= 1000 {
				tokensStr = fmt.Sprintf("%dk", totalTokens/1000)
			} else {
				tokensStr = fmt.Sprintf("%d", totalTokens)
			}
		}

		// Format cost (right-aligned)
		costStr := "-"
		if s.Cost > 0 {
			if s.Cost >= 1.0 {
				costStr = fmt.Sprintf("$%.2f", s.Cost)
			} else {
				costStr = fmt.Sprintf("$%.3f", s.Cost)
			}
		}

		// Format creation date (compact)
		created := time.Unix(s.CreatedAt, 0).Format("Jan02")

		// Format ID (first 6 chars)
		idStr := s.ID
		if len(idStr) > 6 {
			idStr = idStr[:6] + ".."
		}

		rows = append(rows, table.Row{
			status,
			title,
			fmt.Sprintf("%d", s.MessageCount),
			tokensStr,
			costStr,
			created,
			idStr,
		})
	}

	// Create table with simplified styling
	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithFocused(false),
		table.WithHeight(len(rows)+2), // +2 for header and padding
	)

	// Apply clean, minimal styling
	tableStyle := table.DefaultStyles()
	tableStyle.Header = tableStyle.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(lipgloss.Color("240")).
		BorderBottom(true).
		Bold(false).
		Foreground(lipgloss.Color("245"))

	tableStyle.Cell = tableStyle.Cell.
		Foreground(lipgloss.Color("252"))

	// No selected style needed since table is not focused
	t.SetStyles(tableStyle)

	// Build final output - NO external borders/styling
	var result strings.Builder
	result.WriteString("Available Sessions:\n\n")
	result.WriteString(t.View())
	result.WriteString("\n\nUse /session <id> to switch to a specific session.")
	result.WriteString("\n● indicates current session")

	return result.String()
}

// switchToSession switches to the specified session and loads its messages
func (m *Model) switchToSession(sessionID string) string {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return "Error: No session ID provided"
	}

	// Check if already on this session
	if sessionID == m.session.ID {
		return "Already on session: " + m.session.Title
	}

	// Get the session
	newSession, err := m.app.Sessions.Get(m.ctx, sessionID)
	if err != nil {
		return fmt.Sprintf("Error: Session not found: %s", sessionID)
	}

	// Load messages for the new session
	err = m.loadSessionMessages(newSession.ID)
	if err != nil {
		return fmt.Sprintf("Error loading session messages: %v", err)
	}

	// Update current session
	m.session = newSession

	return fmt.Sprintf("Switched to session: %s", newSession.Title)
}

// loadSessionMessages loads messages from database for the specified session
func (m *Model) loadSessionMessages(sessionID string) error {
	// Get messages from database using the Messages service
	messages, err := m.app.Messages.List(m.ctx, sessionID)
	if err != nil {
		return err
	}

	// Clear current messages and viewport
	m.messages = []Message{}
	m.viewport.SetContent("")

	// Clear message history cache since we're loading a different session
	m.clearMessageHistoryCache()

	// Convert service messages to TUI messages and populate viewport
	for _, msg := range messages {
		// Extract text content from message parts
		textContent := msg.Content()
		if textContent.Text != "" {
			tuiMessage := Message{
				Role:    string(msg.Role),
				Content: textContent.Text,
			}
			m.messages = append(m.messages, tuiMessage)
			m.addMessageToViewport(tuiMessage.Role, tuiMessage.Content)
		}
	}

	return nil
}
