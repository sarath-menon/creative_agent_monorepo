package tui

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// fileIcons maps file extensions to their display emojis
var fileIcons = map[string]string{
	".txt":  "📝",
	".md":   "📝",
	".png":  "🖼️",
	".jpg":  "🖼️",
	".jpeg": "🖼️",
	".gif":  "🖼️",
	".mp4":  "🎬",
	".mov":  "🎬",
	".avi":  "🎬",
	".mkv":  "🎬",
	".mp3":  "🎵",
	".wav":  "🎵",
	".flac": "🎵",
	".m4a":  "🎵",
}

// getFileIcon returns the emoji icon for a file based on its extension
func getFileIcon(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	if icon, exists := fileIcons[ext]; exists {
		return icon + " "
	}
	return ""
}

// FilePickerMsg is sent when a file is selected
type FilePickerMsg struct {
	FilePath string
}

// FilePickerCancelMsg is sent when the file picker is cancelled
type FilePickerCancelMsg struct{}

// FileItem represents a file or directory in the picker
type FileItem struct {
	Name     string
	Path     string
	IsDir    bool
	IsParent bool // true for ".." parent directory entry
	IsHidden bool
	Size     int64
}

// FilePickerModel represents a file picker component
type FilePickerModel struct {
	currentDirectory string
	files            []FileItem
	selectedIndex    int
	selectedFile     string
	allowedTypes     []string
	showHidden       bool
	err              error
	maxItems         int    // maximum number of items to display at once
	filter           string // filter text for filename matching
}

// clearErrorMsg clears an error after a delay
type clearErrorMsg struct{}

// NewFilePickerModel creates a new file picker model
func NewFilePickerModel() FilePickerModel {
	// Start in the current working directory
	currentDir, err := os.Getwd()
	if err != nil {
		// Fallback to home directory if we can't get current dir
		currentDir, _ = os.UserHomeDir()
	}

	fm := FilePickerModel{
		currentDirectory: currentDir,
		selectedIndex:    0,
		allowedTypes:     []string{},
		showHidden:       false,
		maxItems:         10, // show at most 10 items at once
	}

	// Load the initial directory
	fm.loadDirectory(fm.currentDirectory)

	return fm
}

// loadDirectory loads files from the given directory
func (m *FilePickerModel) loadDirectory(dir string) error {
	// Clear the current file list
	m.files = []FileItem{}

	// Add parent directory entry (..) if not at root
	parent := filepath.Dir(dir)
	if parent != dir {
		m.files = append(m.files, FileItem{
			Name:     "..",
			Path:     parent,
			IsDir:    true,
			IsParent: true,
		})
	}

	// Read directory entries
	entries, err := os.ReadDir(dir)
	if err != nil {
		m.err = err
		return err
	}

	// Process each entry
	for _, entry := range entries {
		name := entry.Name()
		path := filepath.Join(dir, name)
		isHidden := strings.HasPrefix(name, ".")

		// Skip hidden files if not showing them
		if isHidden && !m.showHidden {
			continue
		}

		// Get file info
		info, err := entry.Info()
		if err != nil {
			continue // skip if we can't get info
		}

		// Only show files with supported icons (and directories)
		if !entry.IsDir() {
			extension := strings.ToLower(filepath.Ext(name))
			if _, hasIcon := fileIcons[extension]; !hasIcon {
				continue // skip files without supported emoji icons
			}
		}

		// Check if it matches the filename filter (case-insensitive)
		if m.filter != "" && !strings.Contains(strings.ToLower(name), strings.ToLower(m.filter)) {
			continue // skip if it doesn't match the filter
		}

		// Add to list
		m.files = append(m.files, FileItem{
			Name:     name,
			Path:     path,
			IsDir:    entry.IsDir(),
			IsParent: false,
			IsHidden: isHidden,
			Size:     info.Size(),
		})
	}

	// Sort directories first, then by name
	sort.Slice(m.files, func(i, j int) bool {
		// Always put parent directory first
		if m.files[i].IsParent {
			return true
		}
		if m.files[j].IsParent {
			return false
		}

		// Then directories before files
		if m.files[i].IsDir != m.files[j].IsDir {
			return m.files[i].IsDir
		}

		// Then alphabetically
		return m.files[i].Name < m.files[j].Name
	})

	// Reset the selected index
	m.selectedIndex = 0
	m.currentDirectory = dir
	return nil
}

// Init initializes the file picker
func (m FilePickerModel) Init() tea.Cmd {
	// Reload the current directory
	m.loadDirectory(m.currentDirectory)
	return nil
}

// clearErrorAfter returns a command to clear an error after a delay
func clearErrorAfter(t time.Duration) tea.Cmd {
	return tea.Tick(t, func(_ time.Time) tea.Msg {
		return clearErrorMsg{}
	})
}

// Update handles messages and updates the model
func (m FilePickerModel) Update(msg tea.Msg) (FilePickerModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "esc":
			// Cancel the file picker
			return m, func() tea.Msg {
				return FilePickerCancelMsg{}
			}

		case "enter":
			// Select the current file/directory
			if len(m.files) == 0 {
				return m, nil
			}

			selected := m.files[m.selectedIndex]

			// If directory, navigate into it
			if selected.IsDir {
				err := m.loadDirectory(selected.Path)
				if err != nil {
					m.err = err
					return m, clearErrorAfter(2 * time.Second)
				}
				return m, nil
			}

			// Otherwise select the file
			m.selectedFile = selected.Path
			return m, func() tea.Msg {
				return FilePickerMsg{FilePath: selected.Path}
			}

		case "up", "k":
			// Move selection up
			m.selectedIndex--
			if m.selectedIndex < 0 {
				m.selectedIndex = len(m.files) - 1
			}
			return m, nil

		case "down", "j":
			// Move selection down
			m.selectedIndex++
			if m.selectedIndex >= len(m.files) {
				m.selectedIndex = 0
			}
			return m, nil

		case "backspace":
			// Go up one directory (same as selecting ..)
			parent := filepath.Dir(m.currentDirectory)
			if parent != m.currentDirectory {
				err := m.loadDirectory(parent)
				if err != nil {
					m.err = err
					return m, clearErrorAfter(2 * time.Second)
				}
			}
			return m, nil

		case "h", ".": // h for hidden toggle, . because hidden files start with a dot
			// Toggle showing hidden files
			m.showHidden = !m.showHidden
			err := m.loadDirectory(m.currentDirectory)
			if err != nil {
				m.err = err
				return m, clearErrorAfter(2 * time.Second)
			}
			return m, nil
		}

	case clearErrorMsg:
		m.err = nil
	}

	return m, nil
}

// View renders the file picker
func (m FilePickerModel) View() string {
	// Create the file list section
	var fileList strings.Builder

	// If there's an error, show it
	if m.err != nil {
		return errorStyle.Render("Error: " + m.err.Error())
	}

	// Show current directory with filter if active
	dirDisplay := "📁 " + m.currentDirectory
	if m.filter != "" {
		dirDisplay += " [@" + m.filter + "]"
	}
	dirInfo := filePickerDirectoryStyle.Render(dirDisplay)
	fileList.WriteString(dirInfo + "\n")

	// Calculate the range of files to display based on selection and maxItems
	startIdx := 0
	if len(m.files) > m.maxItems {
		// If the selected index is past the midpoint of maxItems,
		// start showing from (selectedIndex - maxItems/2)
		midpoint := m.maxItems / 2
		if m.selectedIndex > midpoint {
			startIdx = m.selectedIndex - midpoint
		}

		// But don't go past the end
		if startIdx+m.maxItems > len(m.files) {
			startIdx = len(m.files) - m.maxItems
		}
	}

	// Calculate the end index
	endIdx := startIdx + m.maxItems
	if endIdx > len(m.files) {
		endIdx = len(m.files)
	}

	// Show files in the range
	for i := startIdx; i < endIdx; i++ {
		file := m.files[i]
		var fileLine string

		// Format the file entry
		prefix := "  "
		if i == m.selectedIndex {
			prefix = "▶ "
		}

		if file.IsParent {
			// Parent directory
			fileLine = prefix + filePickerParentStyle.Render(file.Name)
		} else if file.IsDir {
			// Directory with folder emoji
			fileLine = prefix + filePickerFileStyle.Render("📁 "+file.Name)
		} else {
			// Regular file - add emoji based on file type
			fileName := getFileIcon(file.Name) + file.Name
			fileLine = prefix + filePickerFileStyle.Render(fileName)
		}

		fileList.WriteString(fileLine + "\n")
	}

	// Show pagination info if necessary
	if len(m.files) > m.maxItems {
		total := len(m.files)
		showing := m.selectedIndex + 1
		fileList.WriteString(filePickerPaginationStyle.Render(
			fmt.Sprintf("[%d/%d]\n", showing, total),
		))
	}

	// Show help text
	helpText := filePickerfooterStyle.Render(
		"↑/↓: Navigate • Enter: Select • ESC: Cancel • Backspace: Parent dir • H: Toggle hidden",
	)

	// Wrap everything in a bordered box
	content := lipgloss.JoinVertical(lipgloss.Left, fileList.String(), helpText)

	return filePickerBoxStyle.Render(content)
}

// SetAllowedTypes sets the allowed file types
func (m *FilePickerModel) SetAllowedTypes(types []string) {
	m.allowedTypes = types
	// Reload the directory with new filters
	m.loadDirectory(m.currentDirectory)
}

// SetDirectory sets the current directory
func (m *FilePickerModel) SetDirectory(dir string) {
	m.loadDirectory(dir)
}

// SetMaxItems sets the maximum number of items to display at once
func (m *FilePickerModel) SetMaxItems(max int) {
	if max < 3 {
		max = 3 // minimum reasonable number
	}
	m.maxItems = max
}

// ToggleHidden toggles showing hidden files
func (m *FilePickerModel) ToggleHidden() {
	m.showHidden = !m.showHidden
	m.loadDirectory(m.currentDirectory)
}

// SetFilter sets the filename filter and reloads the directory
func (m *FilePickerModel) SetFilter(filter string) {
	m.filter = filter
	m.loadDirectory(m.currentDirectory)
}

// SelectedFile returns the currently selected file
func (m FilePickerModel) SelectedFile() string {
	return m.selectedFile
}

// File picker specific styles
var (
	// Container styles
	filePickerBoxStyle = lipgloss.NewStyle().
				Padding(0, 1).
				MarginTop(1).
				MaxWidth(100).
				MaxHeight(15)

	filePickerDirectoryStyle = lipgloss.NewStyle().
					Foreground(secondaryColor).
					Bold(true).
					MarginBottom(1)

	filePickerFileStyle = lipgloss.NewStyle().
				Foreground(primaryColor)

	filePickerDirStyle = lipgloss.NewStyle().
				Foreground(secondaryColor).
				Bold(true)

	filePickerParentStyle = lipgloss.NewStyle().
				Foreground(accentColor).
				Bold(true)

	filePickerSelectedStyle = lipgloss.NewStyle().
				Foreground(primaryColor).
				Bold(true).
				Underline(true)

	filePickerPaginationStyle = lipgloss.NewStyle().
					Foreground(secondaryColor).
					Align(lipgloss.Right)

	filePickerfooterStyle = lipgloss.NewStyle().
				Foreground(secondaryColor).
				Align(lipgloss.Center).
				MarginTop(1)
)
