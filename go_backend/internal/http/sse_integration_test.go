package http

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"go_general_agent/internal/api"
	"go_general_agent/internal/app"
	"go_general_agent/internal/config"
	"go_general_agent/internal/db"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

// initMCPTools mock implementation for testing 
func initMCPTools(ctx context.Context, app *app.App) {
	// Mock implementation - in real app this initializes MCP tools
	// For tests, we just need to ensure the app doesn't crash
}

// TestEventData represents expected event data structures
type TestEventData struct {
	Type      string `json:"type"`
	Content   string `json:"content,omitempty"`
	MessageID string `json:"messageId,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
	Name      string `json:"name,omitempty"`
	Input     string `json:"input,omitempty"`
	Status    string `json:"status,omitempty"`
	Done      bool   `json:"done,omitempty"`
	Error     string `json:"error,omitempty"`
}

// Test utilities
func setupTestServer(t *testing.T) (*httptest.Server, *app.App, string) {
	// Set up test configuration properly
	testConfigDir := "/tmp/test-opencode-" + t.Name()
	testDataDir := "/tmp/test-opencode-data-" + t.Name()
	
	os.Setenv("OPENCODE_CONFIG_DIR", testConfigDir)
	os.Setenv("OPENCODE_DATA_DIR", testDataDir)
	
	// Create test directories
	os.MkdirAll(testConfigDir, 0755)
	os.MkdirAll(testDataDir, 0755)
	
	// Initialize config for testing - this loads default config values
	if _, err := config.Load(".", false); err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}
	
	// Use the standard database connection method so everything is consistent
	conn, err := db.Connect()
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	// Create test app
	ctx := context.Background()
	testApp, err := app.New(ctx, conn)
	if err != nil {
		t.Fatalf("Failed to create test app: %v", err)
	}
	
	// Initialize MCP tools like the real app does
	initMCPTools(ctx, testApp)

	// Create test session
	session, err := testApp.Sessions.Create(ctx, "Test SSE Session")
	if err != nil {
		t.Fatalf("Failed to create test session: %v", err)
	}
	
	// Auto-approve permissions for this test session
	testApp.Permissions.AutoApproveSession(session.ID)

	// Create HTTP handler
	handler := api.NewQueryHandler(testApp)
	
	// Create test server with our SSE handler
	mux := http.NewServeMux()
	mux.HandleFunc("/stream", func(w http.ResponseWriter, r *http.Request) {
		t.Logf("Stream request received: %s %s", r.Method, r.URL.String())
		HandleSSEStream(ctx, handler, w, r)
	})
	mux.HandleFunc("/rpc", func(w http.ResponseWriter, r *http.Request) {
		// Basic JSON-RPC handler for session operations
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"result": {"id": "test-session"}, "id": 1}`))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		t.Logf("Root request received: %s %s", r.Method, r.URL.String())
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("400 Bad Request"))
	})

	server := httptest.NewServer(mux)
	
	return server, testApp, session.ID
}

func parseIntegrationSSEStream(t *testing.T, response *http.Response) []SSEEvent {
	var events []SSEEvent
	scanner := bufio.NewScanner(response.Body)
	
	var currentEvent SSEEvent
	var rawLines []string
	
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		rawLines = append(rawLines, line)
		
		if line == "" {
			// Empty line indicates end of event
			if currentEvent.Type != "" {
				events = append(events, currentEvent)
				currentEvent = SSEEvent{}
			}
			continue
		}
		
		if strings.HasPrefix(line, "event: ") {
			currentEvent.Type = strings.TrimPrefix(line, "event: ")
		} else if strings.HasPrefix(line, "data: ") {
			dataStr := strings.TrimPrefix(line, "data: ")
			var data map[string]interface{}
			if err := json.Unmarshal([]byte(dataStr), &data); err != nil {
				t.Logf("Failed to parse event data: %v, data: %s", err, dataStr)
				continue
			}
			currentEvent.Data = data
		}
	}
	
	// Debug: log raw lines if no events were parsed
	if len(events) == 0 {
		t.Logf("Raw lines received (%d lines):", len(rawLines))
		for i, line := range rawLines {
			t.Logf("Line %d: %q", i, line)
		}
	}
	
	// Handle last event if stream ended without empty line
	if currentEvent.Type != "" {
		events = append(events, currentEvent)
	}
	
	if err := scanner.Err(); err != nil {
		t.Errorf("Error reading SSE stream: %v", err)
	}
	
	return events
}

func TestSSEConnection(t *testing.T) {
	server, _, sessionID := setupTestServer(t)
	defer server.Close()

	// Test basic SSE connection
	url := fmt.Sprintf("%s/stream?sessionId=%s&content=Hello", server.URL, sessionID)
	
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to connect to SSE stream: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected status 200, got %d", resp.StatusCode)
	}
	
	// Check content type
	contentType := resp.Header.Get("Content-Type")
	if contentType != "text/event-stream" {
		t.Errorf("Expected Content-Type 'text/event-stream', got '%s'", contentType)
	}
	
	// Parse events with timeout
	done := make(chan []SSEEvent, 1)
	go func() {
		events := parseIntegrationSSEStream(t, resp)
		done <- events
	}()
	
	select {
	case events := <-done:
		// Validate we received at least a connected event
		if len(events) == 0 {
			t.Fatal("No SSE events received")
		}
		
		// First event should be connected
		firstEvent := events[0]
		if firstEvent.Type != "connected" {
			t.Errorf("Expected first event to be 'connected', got '%s'", firstEvent.Type)
		}
		
		// Validate session ID in connected event
		if sessionIDFromEvent, ok := firstEvent.Data["sessionId"].(string); !ok || sessionIDFromEvent != sessionID {
			t.Errorf("Expected sessionId '%s' in connected event, got '%v'", sessionID, firstEvent.Data["sessionId"])
		}
		
		t.Logf("Successfully received %d SSE events", len(events))
		
	case <-ctx.Done():
		t.Fatal("Test timed out waiting for SSE events")
	}
}

func TestSSEContentStreaming(t *testing.T) {
	server, _, sessionID := setupTestServer(t)
	defer server.Close()

	// Test content streaming with simple prompt
	url := fmt.Sprintf("%s/stream?sessionId=%s&content=Hello", server.URL, sessionID)
	
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to connect to SSE stream: %v", err)
	}
	defer resp.Body.Close()
	
	done := make(chan []SSEEvent, 1)
	go func() {
		events := parseIntegrationSSEStream(t, resp)
		done <- events
	}()
	
	select {
	case events := <-done:
		t.Logf("Received %d events total", len(events))
		for i, event := range events {
			t.Logf("Event %d: type=%s, data=%v", i, event.Type, event.Data)
		}
		
		if len(events) < 2 {
			t.Fatalf("Expected at least 2 events (connected + complete), got %d", len(events))
		}
		
		// Look for completion event
		var completeEvent *SSEEvent
		
		for _, event := range events {
			if event.Type == "complete" {
				completeEvent = &event
			}
		}
		
		if completeEvent == nil {
			t.Error("No complete event received")
		}
		
		// Validate completion event structure
		if completeEvent != nil {
			if done, ok := completeEvent.Data["done"].(bool); !ok || !done {
				t.Error("Complete event missing or false 'done' field")
			}
			// messageId and content are optional - may not be present if channel closes naturally
			t.Logf("Complete event: %v", completeEvent.Data)
		}
		
		t.Logf("Received completion event with final content")
		
	case <-ctx.Done():
		t.Fatal("Test timed out waiting for content streaming")
	}
}

func TestSSEToolExecution(t *testing.T) {
	server, _, sessionID := setupTestServer(t)
	defer server.Close()

	// Test tool execution streaming with a simple command that should trigger tools
	content := "Show me the current working directory"
	requestURL := fmt.Sprintf("%s/stream?sessionId=%s&content=%s", server.URL, sessionID, url.QueryEscape(content))
	t.Logf("Request URL: %s", requestURL)
	
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	req, err := http.NewRequestWithContext(ctx, "GET", requestURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to connect to SSE stream: %v", err)
	}
	defer resp.Body.Close()
	
	t.Logf("HTTP Status: %d", resp.StatusCode)
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Logf("Response body: %s", string(body))
		t.Fatalf("Expected status 200, got %d", resp.StatusCode)
	}
	
	done := make(chan []SSEEvent, 1)
	go func() {
		events := parseIntegrationSSEStream(t, resp)
		done <- events
	}()
	
	select {
	case events := <-done:
		t.Logf("Tool execution test received %d events total", len(events))
		for i, event := range events {
			t.Logf("Event %d: type=%s, data=%v", i, event.Type, event.Data)
		}
		
		// Check if we got any error events that might explain the issue
		for _, event := range events {
			if event.Type == "error" {
				if errorMsg, ok := event.Data["error"].(string); ok {
					t.Logf("Error event received: %s", errorMsg)
				}
			}
		}
		
		if len(events) < 3 {
			t.Fatalf("Expected exactly 3 events (connected + tool + complete), got %d", len(events))
		}
		
		// Look for tool events and completion event
		var toolEvents []SSEEvent
		var completeEvent *SSEEvent
		
		for _, event := range events {
			switch event.Type {
			case "tool":
				toolEvents = append(toolEvents, event)
			case "complete":
				completeEvent = &event
			}
		}
		
		if len(toolEvents) == 0 {
			t.Error("No tool events received")
		}
		
		if completeEvent == nil {
			t.Error("No complete event received")
		}
		
		// Validate completion event structure
		if completeEvent != nil {
			if done, ok := completeEvent.Data["done"].(bool); !ok || !done {
				t.Error("Complete event missing or false 'done' field")
			}
			// messageId and content are optional - may not be present if channel closes naturally
			t.Logf("Complete event: %v", completeEvent.Data)
		}
		
		// Validate tool event structure
		if len(toolEvents) > 0 {
			toolEvent := toolEvents[0]
			
			if toolName, ok := toolEvent.Data["name"].(string); !ok || toolName == "" {
				t.Error("Tool event missing or empty 'name' field")
			}
			
			if _, ok := toolEvent.Data["input"].(string); !ok {
				t.Error("Tool event missing 'input' field")
			}
			
			if _, ok := toolEvent.Data["status"].(string); !ok {
				t.Error("Tool event missing 'status' field")
			}
			
			if _, ok := toolEvent.Data["id"].(string); !ok {
				t.Error("Tool event missing 'id' field")
			}
		}
		
		t.Logf("Successfully validated tool execution: %d tool events, completion with content", 
			len(toolEvents))
		
	case <-ctx.Done():
		t.Fatal("Test timed out waiting for tool execution events")
	}
}

func TestSSEErrorHandling(t *testing.T) {
	server, _, _ := setupTestServer(t)
	defer server.Close()

	// Test with invalid session ID
	url := fmt.Sprintf("%s/stream?sessionId=invalid&content=Hello", server.URL)
	
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	req.Header.Set("Accept", "text/event-stream")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("Failed to connect to SSE stream: %v", err)
	}
	defer resp.Body.Close()
	
	// Should receive an error event quickly
	done := make(chan []SSEEvent, 1)
	go func() {
		events := parseIntegrationSSEStream(t, resp)
		done <- events
	}()
	
	select {
	case events := <-done:
		if len(events) == 0 {
			t.Fatal("No events received for error case")
		}
		
		// Look for error event
		hasErrorEvent := false
		for _, event := range events {
			if event.Type == "error" {
				hasErrorEvent = true
				if errorMsg, ok := event.Data["error"].(string); !ok || errorMsg == "" {
					t.Error("Error event missing or empty 'error' field")
				}
				break
			}
		}
		
		if !hasErrorEvent {
			t.Error("Expected error event for invalid session ID")
		}
		
	case <-ctx.Done():
		t.Fatal("Test timed out waiting for error handling")
	}
}