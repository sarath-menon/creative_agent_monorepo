package tui

import "os"

// Config holds TUI-specific configuration
type Config struct {
	Raw bool // Raw mode disables fancy TUI rendering
}

// NewConfig creates a new TUI configuration with defaults
func NewConfig() *Config {
	config := &Config{
		Raw: false,
	}

	// Check environment variable for raw mode
	if os.Getenv("OPENCODE_RAW") == "true" || os.Getenv("RAW") == "true" {
		config.Raw = true
	}

	return config
}