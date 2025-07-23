.PHONY: build dev clean install-air help

# Variables
BINARY_NAME=go_general_agent
BUILD_DIR=build
MAIN_PATH=./main.go

# Default target
help:
	@echo "Available targets:"
	@echo "  build       - Build the binary to $(BUILD_DIR)/ directory"
	@echo "  dev         - Run Air for hot reloading development"
	@echo "  clean       - Clean build artifacts"
	@echo "  install-air - Install Air if not present"
	@echo "  help        - Show this help message"
	@echo "  tail-log  - Show the last 100 lines of the log"

# Build binary to build directory
build:
	@mkdir -p $(BUILD_DIR)
	go build -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "Binary built: $(BUILD_DIR)/$(BINARY_NAME)"

# Run development server with hot reloading
dev:
	@ENV=development ./scripts/shoreman.sh
	
# Clean build artifacts
clean:
	rm -rf $(BUILD_DIR)
	rm -f tmp/
	rm -f build-errors.log
	@echo "Build artifacts cleaned"

# Display the last 100 lines of development log with ANSI codes stripped
tail-log:
	@tail -100 ./dev.log | perl -pe 's/\e\[[0-9;]*m(?:\e\[K)?//g'