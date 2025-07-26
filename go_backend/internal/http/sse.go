package http

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"go_general_agent/internal/api"
	"go_general_agent/internal/commands"
	"go_general_agent/internal/llm/agent"
)

// Session message queues for persistent SSE connections
var (
	sessionQueues = make(map[string]chan string)
	queuesMutex   = sync.RWMutex{}
)

// Session pause state management
var (
	pausedSessions = make(map[string]bool)
	pauseMutex     = sync.RWMutex{}
)

// Session pause signaling channels
var (
	pauseSignals  = make(map[string]chan struct{})
	resumeSignals = make(map[string]chan struct{})
	signalsMutex  = sync.RWMutex{}
)

// getOrCreateMessageQueue gets or creates a message queue for a session
func getOrCreateMessageQueue(sessionID string) chan string {
	queuesMutex.Lock()
	defer queuesMutex.Unlock()
	
	if queue, exists := sessionQueues[sessionID]; exists {
		fmt.Printf("[SSE Queue] Retrieved existing queue for session %s. Total active sessions: %d\n", sessionID, len(sessionQueues))
		return queue
	}
	
	queue := make(chan string, 100) // Buffered channel for message queue
	sessionQueues[sessionID] = queue
	fmt.Printf("[SSE Queue] Created new queue for session %s. Total active sessions: %d\n", sessionID, len(sessionQueues))
	return queue
}

// getQueueLength safely returns the current length of a session's queue
func getQueueLength(sessionID string) int {
	queuesMutex.RLock()
	defer queuesMutex.RUnlock()
	
	if queue, exists := sessionQueues[sessionID]; exists {
		return len(queue)
	}
	return 0
}

// getOrCreatePauseSignals gets or creates pause/resume signal channels for a session
func getOrCreatePauseSignals(sessionID string) (pauseCh, resumeCh chan struct{}) {
	signalsMutex.Lock()
	defer signalsMutex.Unlock()
	
	pauseCh, pauseExists := pauseSignals[sessionID]
	if !pauseExists {
		pauseCh = make(chan struct{}, 1)
		pauseSignals[sessionID] = pauseCh
	}
	
	resumeCh, resumeExists := resumeSignals[sessionID]
	if !resumeExists {
		resumeCh = make(chan struct{}, 1)
		resumeSignals[sessionID] = resumeCh
	}
	
	if !pauseExists || !resumeExists {
		fmt.Printf("[SSE Signals] Created pause/resume channels for session %s\n", sessionID)
	}
	
	return pauseCh, resumeCh
}

// queueMessage adds a message to the session's queue
func queueMessage(sessionID, content string) {
	queuesMutex.RLock()
	
	queue, exists := sessionQueues[sessionID]
	if !exists {
		queuesMutex.RUnlock()
		fmt.Printf("[SSE Queue] No queue exists for session %s, message dropped\n", sessionID)
		return
	}
	
	// Hold read lock during entire channel operation to prevent cleanup race
	select {
	case queue <- content:
		// Message queued successfully - no log needed for normal operation
	default:
		queueLen := len(queue)
		fmt.Printf("[SSE Queue] Queue full for session %s! Message dropped. Queue length: %d\n", sessionID, queueLen)
	}
	
	queuesMutex.RUnlock()
}

// cleanupMessageQueue removes the message queue for a session
func cleanupMessageQueue(sessionID string) {
	queuesMutex.Lock()
	defer queuesMutex.Unlock()
	
	if queue, exists := sessionQueues[sessionID]; exists {
		queueLen := len(queue)
		close(queue)
		delete(sessionQueues, sessionID)
		fmt.Printf("[SSE Queue] Cleaned up queue for session %s. Final queue length: %d. Remaining active sessions: %d\n", sessionID, queueLen, len(sessionQueues))
	} else {
		fmt.Printf("[SSE Queue] Attempted to cleanup non-existent queue for session %s\n", sessionID)
	}
	
	// Clean up pause state
	pauseMutex.Lock()
	delete(pausedSessions, sessionID)
	pauseMutex.Unlock()
	
	// Clean up pause signal channels
	signalsMutex.Lock()
	if pauseCh, exists := pauseSignals[sessionID]; exists {
		close(pauseCh)
		delete(pauseSignals, sessionID)
	}
	if resumeCh, exists := resumeSignals[sessionID]; exists {
		close(resumeCh)
		delete(resumeSignals, sessionID)
	}
	signalsMutex.Unlock()
	fmt.Printf("[SSE Signals] Cleaned up pause/resume channels for session %s\n", sessionID)
}

// pauseSession pauses message processing for a session
func pauseSession(sessionID string) {
	pauseMutex.Lock()
	defer pauseMutex.Unlock()
	pausedSessions[sessionID] = true
	
	// Send pause signal to active SSE connections
	signalsMutex.RLock()
	if pauseCh, exists := pauseSignals[sessionID]; exists {
		select {
		case pauseCh <- struct{}{}:
			fmt.Printf("[SSE Pause] Session %s paused and signal sent\n", sessionID)
		default:
			// Channel buffer full, signal already sent
			fmt.Printf("[SSE Pause] Session %s paused (signal already pending)\n", sessionID)
		}
	} else {
		fmt.Printf("[SSE Pause] Session %s paused (no active SSE connection)\n", sessionID)
	}
	signalsMutex.RUnlock()
}

// resumeSession resumes message processing for a session
func resumeSession(sessionID string) {
	pauseMutex.Lock()
	defer pauseMutex.Unlock()
	delete(pausedSessions, sessionID)
	
	// Send resume signal to active SSE connections
	signalsMutex.RLock()
	if resumeCh, exists := resumeSignals[sessionID]; exists {
		select {
		case resumeCh <- struct{}{}:
			fmt.Printf("[SSE Pause] Session %s resumed and signal sent\n", sessionID)
		default:
			// Channel buffer full, signal already sent
			fmt.Printf("[SSE Pause] Session %s resumed (signal already pending)\n", sessionID)
		}
	} else {
		fmt.Printf("[SSE Pause] Session %s resumed (no active SSE connection)\n", sessionID)
	}
	signalsMutex.RUnlock()
}

// isSessionPaused checks if a session is currently paused
func isSessionPaused(sessionID string) bool {
	pauseMutex.RLock()
	defer pauseMutex.RUnlock()
	return pausedSessions[sessionID]
}

// HandleSSEStream handles persistent Server-Sent Events streaming for agent responses
func HandleSSEStream(ctx context.Context, handler *api.QueryHandler, w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Cache-Control")

	// Handle preflight OPTIONS request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Only get sessionID from query params (no content in SSE connection)
	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Missing sessionId parameter\"}\n\n")
		return
	}

	// Set the session as current
	if err := handler.GetApp().SetCurrentSession(sessionID); err != nil {
		fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Failed to set session: %s\"}\n\n", err.Error())
		return
	}

	// Create a flusher for immediate SSE delivery
	flusher, ok := w.(http.Flusher)
	if !ok {
		fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Streaming not supported\"}\n\n")
		return
	}

	// Get or create message queue for this session
	messageQueue := getOrCreateMessageQueue(sessionID)
	
	// Get or create pause/resume signal channels for this session
	pauseCh, resumeCh := getOrCreatePauseSignals(sessionID)
	
	// Clean up when connection closes
	defer cleanupMessageQueue(sessionID)

	// Send initial connection event
	fmt.Fprintf(w, "event: connected\ndata: {\"sessionId\": \"%s\"}\n\n", sessionID)
	flusher.Flush()

	// Monitor for client disconnect
	clientGone := r.Context().Done()
	
	// Track whether we're currently paused
	isPaused := isSessionPaused(sessionID)

	// Create heartbeat ticker to prevent browser timeout
	heartbeat := time.NewTicker(45 * time.Second)
	defer heartbeat.Stop()

	// Keep connection alive and process messages from queue
	for {
		if isPaused {
			// Session is paused, wait for resume signal or client disconnect
			select {
			case <-clientGone:
				// Client disconnected, cancel any running agent
				handler.GetApp().CoderAgent.Cancel(sessionID)
				return
			case <-resumeCh:
				// Session resumed, continue processing
				isPaused = false
				fmt.Printf("[SSE Pause] Session %s resumed, continuing message processing\n", sessionID)
			case <-heartbeat.C:
				// Send heartbeat to keep connection alive
				fmt.Fprintf(w, "event: heartbeat\ndata: {\"type\":\"ping\"}\n\n")
				flusher.Flush()
			}
		} else {
			// Session is not paused, process messages normally
			select {
			case <-clientGone:
				// Client disconnected, cancel any running agent
				handler.GetApp().CoderAgent.Cancel(sessionID)
				return
				
			case <-pauseCh:
				// Session paused, set flag and continue loop
				isPaused = true
				
			case <-heartbeat.C:
				// Send heartbeat to keep connection alive
				fmt.Fprintf(w, "event: heartbeat\ndata: {\"type\":\"ping\"}\n\n")
				flusher.Flush()
				
			case content, ok := <-messageQueue:
				if !ok {
					// Queue closed, end connection
					return
				}
				
				// Process the message
				if err := processMessage(ctx, handler, w, flusher, sessionID, content); err != nil {
					fmt.Printf("Error processing message: %v\n", err)
					return
				}
			}
		}
	}
}

// extractText parses JSON content to extract the actual text value
func extractText(content string) string {
	var textContent struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal([]byte(content), &textContent); err == nil && textContent.Text != "" {
		return textContent.Text
	}
	return content // fallback for raw text
}

// handleShellCommand executes shell commands for ! prefixed messages
func handleShellCommand(ctx context.Context, w http.ResponseWriter, flusher http.Flusher, text string) error {
	// Strip ! prefix and trim whitespace
	command := strings.TrimSpace(strings.TrimPrefix(text, "!"))
	if command == "" {
		command = "echo 'No command specified'"
	}

	// Execute the command
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	output, err := cmd.CombinedOutput()

	// Prepare result
	result := string(output)
	if err != nil {
		result = fmt.Sprintf("Error: %v\n%s", err, result)
	}

	// Send completion event
	eventData := map[string]interface{}{
		"type":    "complete",
		"content": result,
		"done":    true,
	}
	jsonData, _ := json.Marshal(eventData)
	fmt.Fprintf(w, "event: complete\ndata: %s\n\n", string(jsonData))
	flusher.Flush()

	return nil
}

// handleRegularMessage processes regular messages through the agent
func handleRegularMessage(ctx context.Context, handler *api.QueryHandler, w http.ResponseWriter, flusher http.Flusher, sessionID, content string) error {
	// Start agent processing for regular content
	events, err := handler.GetApp().CoderAgent.Run(ctx, sessionID, content)
	if err != nil {
		eventData := map[string]interface{}{
			"type":  "error",
			"error": fmt.Sprintf("Failed to start agent: %s", err.Error()),
		}
		jsonData, _ := json.Marshal(eventData)
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(jsonData))
		flusher.Flush()
		return nil // Don't close connection on error, just continue
	}

	// Process agent events and convert to SSE
	for {
		select {
		case <-ctx.Done():
			// Connection context cancelled
			handler.GetApp().CoderAgent.Cancel(sessionID)
			return ctx.Err()
			
		case event, ok := <-events:
			if !ok {
				// Channel closed, message processing complete
				eventData := map[string]interface{}{
					"type": "complete",
					"done": true,
				}
				
				// Try to get the final message content from the session
				if messages, err := handler.GetApp().Messages.List(context.Background(), sessionID); err == nil && len(messages) > 0 {
					// Get the last message (should be the assistant's response)
					lastMessage := messages[len(messages)-1]
					content := lastMessage.Content().String()
					if lastMessage.Role == "assistant" && content != "" {
						eventData["content"] = content
						eventData["messageId"] = lastMessage.ID
					}
				}
				
				jsonData, _ := json.Marshal(eventData)
				fmt.Fprintf(w, "event: complete\ndata: %s\n\n", string(jsonData))
				flusher.Flush()
				return nil // Message complete, but keep connection open
			}

			// Convert AgentEvent to SSE format
			if err := WriteSSEEvent(w, event); err != nil {
				return err
			}
			flusher.Flush()

			// If this was an error or completion event, finish this message
			if event.Error != nil || event.Done {
				return nil // Message complete, but keep connection open
			}
		}
	}
}

// processMessage processes a single message and streams the response
func processMessage(ctx context.Context, handler *api.QueryHandler, w http.ResponseWriter, flusher http.Flusher, sessionID, content string) error {
	// Create a cancellable context for this message
	msgCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Extract actual text from JSON content
	text := extractText(content)

	// Route based on command prefix
	switch {
	case strings.HasPrefix(text, "/"):
		return handleSlashCommandStreaming(msgCtx, handler, w, flusher, sessionID, text)
	case strings.HasPrefix(text, "!"):
		return handleShellCommand(msgCtx, w, flusher, text)
	default:
		return handleRegularMessage(msgCtx, handler, w, flusher, sessionID, content)
	}
}

// handleSlashCommandStreaming processes slash commands for persistent connections
func handleSlashCommandStreaming(ctx context.Context, handler *api.QueryHandler, w http.ResponseWriter, flusher http.Flusher, sessionID, content string) error {
	// Parse the slash command
	parsedCmd, err := commands.ParseCommand(content)
	if err != nil {
		eventData := map[string]interface{}{
			"type":  "error",
			"error": fmt.Sprintf("Invalid slash command: %s", err.Error()),
		}
		jsonData, _ := json.Marshal(eventData)
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(jsonData))
		flusher.Flush()
		return nil // Don't close connection on error
	}

	// Create a command registry and load built-in commands
	registry := commands.NewRegistry()
	if err := registry.LoadCommands(); err != nil {
		eventData := map[string]interface{}{
			"type":  "error",
			"error": fmt.Sprintf("Failed to load commands: %s", err.Error()),
		}
		jsonData, _ := json.Marshal(eventData)
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(jsonData))
		flusher.Flush()
		return nil // Don't close connection on error
	}

	// Execute the command
	result, err := registry.ExecuteCommand(ctx, parsedCmd.Name, parsedCmd.Arguments)
	if err != nil {
		eventData := map[string]interface{}{
			"type":  "error",
			"error": fmt.Sprintf("Command execution failed: %s", err.Error()),
		}
		jsonData, _ := json.Marshal(eventData)
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(jsonData))
		flusher.Flush()
		return nil // Don't close connection on error
	}

	// Send completion event with the command result
	eventData := map[string]interface{}{
		"type":    "complete",
		"content": result,
		"done":    true,
	}
	jsonData, _ := json.Marshal(eventData)
	fmt.Fprintf(w, "event: complete\ndata: %s\n\n", string(jsonData))
	flusher.Flush()
	
	return nil // Command complete, keep connection open
}

// HandleMessageQueue handles POST requests to add messages to session queues
func HandleMessageQueue(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight OPTIONS request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Only POST method allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract sessionID from URL path
	// Assuming URL pattern: /stream/{sessionId}/message
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 2 || pathParts[0] != "stream" {
		http.Error(w, "Invalid URL path", http.StatusBadRequest)
		return
	}
	sessionID := pathParts[1]

	// Read and parse JSON body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	var reqData struct {
		Content string `json:"content"`
	}
	if err := json.Unmarshal(body, &reqData); err != nil {
		http.Error(w, "Invalid JSON in request body", http.StatusBadRequest)
		return
	}

	if reqData.Content == "" {
		http.Error(w, "Missing content parameter", http.StatusBadRequest)
		return
	}

	// Queue the message
	queueMessage(sessionID, reqData.Content)

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]interface{}{
		"status":    "queued",
		"sessionId": sessionID,
	}
	json.NewEncoder(w).Encode(response)
}

// HandlePauseSession handles PUT requests to pause a session
func HandlePauseSession(handler *api.QueryHandler, w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight OPTIONS request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "PUT" {
		http.Error(w, "Only PUT method allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract sessionID from URL path
	// Assuming URL pattern: /stream/{sessionId}/pause
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 2 || pathParts[0] != "stream" {
		http.Error(w, "Invalid URL path", http.StatusBadRequest)
		return
	}
	sessionID := pathParts[1]

	// Check if session is currently processing and add interruption message if so
	if handler.GetApp().CoderAgent.IsSessionBusy(sessionID) {
		fmt.Printf("[SSE Pause] Session %s was busy, adding interruption message (TODO: implement message creation)\n", sessionID)
		// TODO: Add interruption message to conversation once message interface is clarified
	}
	
	// Cancel any active processing for this session 
	handler.GetApp().CoderAgent.Cancel(sessionID)
	
	// Pause the session
	pauseSession(sessionID)

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]interface{}{
		"status":    "paused",
		"sessionId": sessionID,
	}
	json.NewEncoder(w).Encode(response)
}

// HandleResumeSession handles PUT requests to resume a session
func HandleResumeSession(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	// Handle preflight OPTIONS request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "PUT" {
		http.Error(w, "Only PUT method allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract sessionID from URL path
	// Assuming URL pattern: /stream/{sessionId}/resume
	pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(pathParts) < 2 || pathParts[0] != "stream" {
		http.Error(w, "Invalid URL path", http.StatusBadRequest)
		return
	}
	sessionID := pathParts[1]

	// Resume the session
	resumeSession(sessionID)

	// Return success response
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	response := map[string]interface{}{
		"status":    "resumed",
		"sessionId": sessionID,
	}
	json.NewEncoder(w).Encode(response)
}

// WriteSSEEvent converts an AgentEvent to SSE format and writes it to the response
func WriteSSEEvent(w http.ResponseWriter, event agent.AgentEvent) error {
	switch event.Type {
	case agent.AgentEventTypeResponse:
		// Content and thinking streaming removed - only stream agent progress (tools)

		// Stream tool calls - detect new tool calls by checking completion status
		toolCalls := event.Message.ToolCalls()
		for _, toolCall := range toolCalls {
			// Determine tool status
			status := "pending"
			if toolCall.Input != "" {
				if len(toolCall.Input) > 0 {
					status = "running"
				}
				// Check if tool call is complete (has been finished)
				// This is a simple heuristic - you might want to improve this based on your message structure
				if event.Message.FinishReason() != "" && !event.Done {
					status = "completed"
				}
			}

			eventData := map[string]interface{}{
				"type":   "tool",
				"name":   toolCall.Name,
				"input":  toolCall.Input,
				"id":     toolCall.ID,
				"status": status,
			}
			jsonData, _ := json.Marshal(eventData)
			fmt.Fprintf(w, "event: tool\ndata: %s\n\n", string(jsonData))
		}

		// Send completion event only for final events, include final content
		if event.Done {
			// Check if this is a permission denied error
			if event.Message.FinishReason() == "permission_denied" {
				eventData := map[string]interface{}{
					"type":  "error",
					"error": "Permission denied",
				}
				jsonData, _ := json.Marshal(eventData)
				fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(jsonData))
			} else {
				content := event.Message.Content().String()
				eventData := map[string]interface{}{
					"type":      "complete",
					"messageId": event.Message.ID,
					"done":      true,
				}
				// Only include content if it's not empty
				if content != "" {
					eventData["content"] = content
				}
				jsonData, _ := json.Marshal(eventData)
				fmt.Fprintf(w, "event: complete\ndata: %s\n\n", string(jsonData))
			}
		}

	case agent.AgentEventTypeError:
		eventData := map[string]interface{}{
			"type":  "error",
			"error": event.Error.Error(),
		}
		jsonData, _ := json.Marshal(eventData)
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", string(jsonData))

	case agent.AgentEventTypeSummarize:
		eventData := map[string]interface{}{
			"type":     "summarize",
			"progress": event.Progress,
			"done":     event.Done,
		}
		jsonData, _ := json.Marshal(eventData)
		fmt.Fprintf(w, "event: summarize\ndata: %s\n\n", string(jsonData))
	}

	return nil
}

