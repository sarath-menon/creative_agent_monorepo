package provider

import (
	"bufio"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"mix/internal/logging"
)

// OAuthCredentials holds OAuth token information
type OAuthCredentials struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresAt    int64  `json:"expires_at"`
	ClientID     string `json:"client_id"`
	Provider     string `json:"provider"`
}

// CredentialStorage manages encrypted OAuth credentials
type CredentialStorage struct {
	configDir string
	keyFile   string
	credFile  string
	mu        sync.RWMutex
}

// OAuthFlow handles the OAuth authentication flow
type OAuthFlow struct {
	ClientID      string
	CodeVerifier  string
	CodeChallenge string
	State         string
	RedirectURI   string
}

const (
	fallbackClientID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e" // Claude Pro Max fallback
	authURL          = "https://claude.ai/oauth/authorize"
	tokenURL         = "https://console.anthropic.com/v1/oauth/token"
	redirectURI      = "https://console.anthropic.com/oauth/code/callback"
	requiredScopes   = "org:create_api_key user:profile user:inference"
)

// NewCredentialStorage creates a new credential storage instance
func NewCredentialStorage() (*CredentialStorage, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	configDir := filepath.Join(homeDir, ".creative_agent")
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create config directory: %w", err)
	}

	return &CredentialStorage{
		configDir: configDir,
		keyFile:   filepath.Join(configDir, "key.enc"),
		credFile:  filepath.Join(configDir, "credentials.enc"),
	}, nil
}

// generateEncryptionKey creates or loads an encryption key
func (cs *CredentialStorage) generateEncryptionKey() ([]byte, error) {
	// Try to load existing key
	if keyData, err := os.ReadFile(cs.keyFile); err == nil {
		return keyData, nil
	}

	// Generate new key
	key := make([]byte, 32) // AES-256
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("failed to generate key: %w", err)
	}

	// Save key with restricted permissions
	if err := os.WriteFile(cs.keyFile, key, 0600); err != nil {
		return nil, fmt.Errorf("failed to save key: %w", err)
	}

	return key, nil
}

// encrypt encrypts data using AES-GCM
func (cs *CredentialStorage) encrypt(data []byte) ([]byte, error) {
	key, err := cs.generateEncryptionKey()
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	ciphertext := gcm.Seal(nonce, nonce, data, nil)
	return ciphertext, nil
}

// decrypt decrypts data using AES-GCM
func (cs *CredentialStorage) decrypt(data []byte) ([]byte, error) {
	key, err := cs.generateEncryptionKey()
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	if len(data) < gcm.NonceSize() {
		return nil, errors.New("invalid encrypted data")
	}

	nonce := data[:gcm.NonceSize()]
	ciphertext := data[gcm.NonceSize():]

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}

// StoreOAuthCredentials stores OAuth credentials securely
func (cs *CredentialStorage) StoreOAuthCredentials(provider string, accessToken, refreshToken string, expiresAt int64, clientID string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	credentials := map[string]OAuthCredentials{}

	// Load existing credentials if they exist
	if data, err := os.ReadFile(cs.credFile); err == nil {
		if decrypted, err := cs.decrypt(data); err == nil {
			json.Unmarshal(decrypted, &credentials)
		}
	}

	// Add/update credentials for this provider
	credentials[provider] = OAuthCredentials{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresAt:    expiresAt,
		ClientID:     clientID,
		Provider:     provider,
	}

	// Encrypt and save
	jsonData, err := json.Marshal(credentials)
	if err != nil {
		return fmt.Errorf("failed to marshal credentials: %w", err)
	}

	encrypted, err := cs.encrypt(jsonData)
	if err != nil {
		return fmt.Errorf("failed to encrypt credentials: %w", err)
	}

	if err := os.WriteFile(cs.credFile, encrypted, 0600); err != nil {
		return fmt.Errorf("failed to save credentials: %w", err)
	}

	logging.Info("OAuth credentials stored for provider", "provider", provider)
	return nil
}

// GetOAuthCredentials retrieves OAuth credentials for a provider
func (cs *CredentialStorage) GetOAuthCredentials(provider string) (*OAuthCredentials, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	data, err := os.ReadFile(cs.credFile)
	if err != nil {
		return nil, nil // No credentials file exists
	}

	decrypted, err := cs.decrypt(data)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt credentials: %w", err)
	}

	var credentials map[string]OAuthCredentials
	if err := json.Unmarshal(decrypted, &credentials); err != nil {
		return nil, fmt.Errorf("failed to unmarshal credentials: %w", err)
	}

	cred, exists := credentials[provider]
	if !exists {
		return nil, nil
	}

	return &cred, nil
}

// IsTokenExpired checks if a token is expired or will expire soon (5 minutes buffer)
func (cred *OAuthCredentials) IsTokenExpired() bool {
	if cred.ExpiresAt == 0 {
		return false // No expiry time set
	}
	return time.Now().Unix() >= (cred.ExpiresAt - 300) // 5 minute buffer
}

// NewOAuthFlow creates a new OAuth flow with PKCE
func NewOAuthFlow(clientID string) (*OAuthFlow, error) {
	if clientID == "" {
		clientID = fallbackClientID
	}

	// Generate code verifier and challenge for PKCE
	codeVerifier := generateCodeVerifier()
	codeChallenge := generateCodeChallenge(codeVerifier)
	// Use code verifier as state (matches Python implementation)
	state := codeVerifier

	return &OAuthFlow{
		ClientID:      clientID,
		CodeVerifier:  codeVerifier,
		CodeChallenge: codeChallenge,
		State:         state,
		RedirectURI:   redirectURI,
	}, nil
}

// generateCodeVerifier creates a cryptographically random code verifier
func generateCodeVerifier() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(bytes)
}

// generateCodeChallenge creates a code challenge from the verifier
func generateCodeChallenge(verifier string) string {
	hash := sha256.Sum256([]byte(verifier))
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(hash[:])
}

// generateState creates a random state parameter (matches Python secrets.token_urlsafe(32))
func generateState() string {
	bytes := make([]byte, 24) // 24 bytes * 4/3 ≈ 32 characters when base64 encoded
	rand.Read(bytes)
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(bytes)
}

// GetAuthorizationURL generates the OAuth authorization URL
func (flow *OAuthFlow) GetAuthorizationURL() string {
	params := url.Values{
		"client_id":             {flow.ClientID},
		"redirect_uri":          {flow.RedirectURI},
		"response_type":         {"code"},
		"state":                 {flow.State},
		"scope":                 {requiredScopes},
		"code_challenge":        {flow.CodeChallenge},
		"code_challenge_method": {"S256"},
	}

	return fmt.Sprintf("%s?%s", authURL, params.Encode())
}

// OpenBrowser opens the authorization URL in the default browser
func (flow *OAuthFlow) OpenBrowser() error {
	authURL := flow.GetAuthorizationURL()

	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", authURL).Start()
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", authURL).Start()
	case "darwin":
		err = exec.Command("open", authURL).Start()
	default:
		err = fmt.Errorf("unsupported platform")
	}

	return err
}

// ExchangeCodeForTokens exchanges the authorization code for tokens
func (flow *OAuthFlow) ExchangeCodeForTokens(authCode string) (*OAuthCredentials, error) {
	// Parse authorization code in format "code#state"
	authCode = strings.TrimSpace(authCode)

	// Split on # to get code and state parts
	splits := strings.Split(authCode, "#")
	if len(splits) != 2 {
		return nil, fmt.Errorf("invalid authorization code format. Expected 'code#state', got: %s", authCode)
	}

	codePart := strings.TrimSpace(splits[0])
	statePart := strings.TrimSpace(splits[1])

	if codePart == "" {
		return nil, fmt.Errorf("authorization code part is empty")
	}

	if statePart == "" {
		return nil, fmt.Errorf("state part is empty")
	}

	// Verify state matches (optional - Python implementation shows warning but continues)
	if statePart != flow.State {
		logging.Warn("State mismatch: expected %s, got %s - proceeding anyway", flow.State, statePart)
	}

	data := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     flow.ClientID,
		"code":          codePart,
		"state":         statePart,
		"code_verifier": flow.CodeVerifier,
		"redirect_uri":  flow.RedirectURI,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request data: %w", err)
	}

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(string(jsonData)))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "python-requests/2.31.0")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		logging.Warn("Token exchange failed with status %d (expected due to Cloudflare protection): %s", resp.StatusCode, string(body))
		return flow.fallbackToBrowserInstructions(authCode)
	}

	var tokenResponse struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token,omitempty"`
		ExpiresIn    int64  `json:"expires_in"`
		TokenType    string `json:"token_type"`
	}

	if err := json.Unmarshal(body, &tokenResponse); err != nil {
		return nil, fmt.Errorf("failed to parse token response: %w", err)
	}

	expiresAt := time.Now().Unix() + tokenResponse.ExpiresIn

	return &OAuthCredentials{
		AccessToken:  tokenResponse.AccessToken,
		RefreshToken: tokenResponse.RefreshToken,
		ExpiresAt:    expiresAt,
		ClientID:     flow.ClientID,
		Provider:     "anthropic",
	}, nil
}

// fallbackToBrowserInstructions provides manual token extraction instructions
func (flow *OAuthFlow) fallbackToBrowserInstructions(authCode string) (*OAuthCredentials, error) {
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("🔧 MANUAL TOKEN EXTRACTION REQUIRED")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("The OAuth token endpoint is protected by Cloudflare.")
	fmt.Println("Please extract tokens manually using one of these methods:")
	fmt.Println()
	fmt.Println("METHOD 1: Browser Developer Tools")
	fmt.Println("1. Open https://console.anthropic.com in a new tab")
	fmt.Println("2. Open Developer Tools (F12 or Cmd+Option+I)")
	fmt.Println("3. Go to Application tab > Local Storage > console.anthropic.com")
	fmt.Println("4. Look for keys containing 'token', 'auth', or 'access'")
	fmt.Println("5. Copy the access token value")
	fmt.Println()
	fmt.Println("METHOD 2: API Key Alternative")
	fmt.Println("1. Go to https://console.anthropic.com/settings/keys")
	fmt.Println("2. Create a new API key")
	fmt.Println("3. Use environment variable: export ANTHROPIC_API_KEY=your_api_key")
	fmt.Println()
	authCodePreview := authCode
	if len(authCode) > 20 {
		authCodePreview = authCode[:20] + "..."
	}
	fmt.Printf("Your authorization code (for reference): %s\n", authCodePreview)
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("\nDo you want to enter an access token manually? (y/N): ")

	reader := bufio.NewReader(os.Stdin)
	response, _ := reader.ReadString('\n')
	response = strings.TrimSpace(strings.ToLower(response))

	if response == "y" || response == "yes" {
		fmt.Print("Enter access token: ")
		token, _ := reader.ReadString('\n')
		token = strings.TrimSpace(token)

		if token != "" && strings.HasPrefix(token, "sk-ant-") {
			// Create credentials with manual token
			expiresAt := time.Now().Unix() + 3600 // 1 hour default
			return &OAuthCredentials{
				AccessToken:  token,
				RefreshToken: "", // No refresh token for manual entry
				ExpiresAt:    expiresAt,
				ClientID:     flow.ClientID,
				Provider:     "anthropic",
			}, nil
		} else {
			return nil, fmt.Errorf("invalid access token format - should start with 'sk-ant-'")
		}
	}

	return nil, fmt.Errorf("manual token extraction required - automatic exchange blocked by Cloudflare")
}

// RefreshAccessToken refreshes an expired access token
func RefreshAccessToken(credentials *OAuthCredentials) (*OAuthCredentials, error) {
	if credentials.RefreshToken == "" {
		return nil, errors.New("no refresh token available")
	}

	data := map[string]string{
		"grant_type":    "refresh_token",
		"refresh_token": credentials.RefreshToken,
		"client_id":     credentials.ClientID,
	}

	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal refresh request data: %w", err)
	}

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(string(jsonData)))
	if err != nil {
		return nil, fmt.Errorf("failed to create refresh request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "python-requests/2.31.0")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token refresh failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read refresh response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token refresh failed with status %d: %s", resp.StatusCode, string(body))
	}

	var tokenResponse struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token,omitempty"`
		ExpiresIn    int64  `json:"expires_in"`
		TokenType    string `json:"token_type"`
	}

	if err := json.Unmarshal(body, &tokenResponse); err != nil {
		return nil, fmt.Errorf("failed to parse refresh response: %w", err)
	}

	expiresAt := time.Now().Unix() + tokenResponse.ExpiresIn

	// Keep existing refresh token if new one not provided
	refreshToken := tokenResponse.RefreshToken
	if refreshToken == "" {
		refreshToken = credentials.RefreshToken
	}

	return &OAuthCredentials{
		AccessToken:  tokenResponse.AccessToken,
		RefreshToken: refreshToken,
		ExpiresAt:    expiresAt,
		ClientID:     credentials.ClientID,
		Provider:     credentials.Provider,
	}, nil
}
