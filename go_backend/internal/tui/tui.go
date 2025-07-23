package tui

import (
	"context"
	"fmt"
	"os"

	"go_general_agent/internal/app"
	"go_general_agent/internal/logging"

	tea "github.com/charmbracelet/bubbletea"
)

// Run starts the TUI application
func Run(ctx context.Context, app *app.App) error {
	// Create the model
	model, err := NewModel(ctx, app)
	if err != nil {
		return fmt.Errorf("failed to create TUI model: %w", err)
	}

	// Create TUI configuration
	config := NewConfig()

	// Build dynamic program options like mods-main
	opts := []tea.ProgramOption{}

	if !isInputTTY() || config.Raw {
		opts = append(opts, tea.WithInput(nil))
	}
	if isOutputTTY() && !config.Raw {
		opts = append(opts, tea.WithOutput(os.Stderr))
	} else {
		opts = append(opts, tea.WithoutRenderer())
	}

	// Create the Bubble Tea program with dynamic options
	program := tea.NewProgram(model, opts...)

	// Set up context cancellation
	go func() {
		<-ctx.Done()
		program.Quit()
	}()

	logging.Info("Starting TUI interface")

	// Run the program
	_, err = program.Run()
	if err != nil {
		return fmt.Errorf("failed to run TUI program: %w", err)
	}

	logging.Info("TUI interface closed")
	return nil
}
