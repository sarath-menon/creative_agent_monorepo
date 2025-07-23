package http

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"go_general_agent/internal/api"
	"go_general_agent/internal/llm/agent"
)

// HandleSSEStream handles Server-Sent Events streaming for agent responses
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

	// Parse parameters from query string or POST body
	var sessionID, content string
	if r.Method == "GET" {
		sessionID = r.URL.Query().Get("sessionId")
		content = r.URL.Query().Get("content")
	} else if r.Method == "POST" {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Failed to read request body\"}\n\n")
			return
		}
		
		var reqData struct {
			SessionID string `json:"sessionId"`
			Content   string `json:"content"`
		}
		if err := json.Unmarshal(body, &reqData); err != nil {
			fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Invalid JSON in request body\"}\n\n")
			return
		}
		sessionID = reqData.SessionID
		content = reqData.Content
	}

	if sessionID == "" || content == "" {
		fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Missing sessionId or content parameter\"}\n\n")
		return
	}

	// Create a cancellable context for this request
	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Set the session as current
	if err := handler.GetApp().SetCurrentSession(sessionID); err != nil {
		fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Failed to set session: %s\"}\n\n", err.Error())
		return
	}

	// Start agent processing
	events, err := handler.GetApp().CoderAgent.Run(streamCtx, sessionID, content)
	if err != nil {
		fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Failed to start agent: %s\"}\n\n", err.Error())
		return
	}

	// Create a flusher for immediate SSE delivery
	flusher, ok := w.(http.Flusher)
	if !ok {
		fmt.Fprintf(w, "event: error\ndata: {\"error\": \"Streaming not supported\"}\n\n")
		return
	}

	// Send initial connection event
	fmt.Fprintf(w, "event: connected\ndata: {\"sessionId\": \"%s\"}\n\n", sessionID)
	flusher.Flush()

	// Monitor for client disconnect
	clientGone := r.Context().Done()

	// Process agent events and convert to SSE
	for {
		select {
		case <-clientGone:
			// Client disconnected, cancel the agent
			handler.GetApp().CoderAgent.Cancel(sessionID)
			return
		case event, ok := <-events:
			if !ok {
				// Channel closed, we're done - send proper completion event
				eventData := map[string]interface{}{
					"type": "complete",
					"done": true,
				}
				jsonData, _ := json.Marshal(eventData)
				fmt.Fprintf(w, "event: complete\ndata: %s\n\n", string(jsonData))
				flusher.Flush()
				return
			}

			// Convert AgentEvent to SSE format
			if err := WriteSSEEvent(w, event); err != nil {
				fmt.Printf("Error writing SSE event: %v\n", err)
				return
			}
			flusher.Flush()

			// If this was an error or completion event, we're done
			if event.Error != nil || event.Done {
				return
			}
		}
	}
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