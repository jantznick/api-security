package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jantznick/api-security/connectors/go/apiglimpse"
)

type checkoutBody struct {
	OrderID             string  `json:"orderId"`
	Amount              float64 `json:"amount"`
	CardPan             string  `json:"cardPan"`
	TriggerShadowExport bool    `json:"triggerShadowExport"`
}

func main() {
	port := envOr("PORT", "4013")
	ledgerURL := envOr("LEDGER_URL", "http://ledger-api:4014")
	serviceName := envOr("API_SENSOR_SERVICE_NAME", "fulfillment-api")

	r := chi.NewRouter()
	r.Use(apiglimpse.Middleware(apiglimpse.Config{
		AgentURL:    envOr("API_SENSOR_AGENT_URL", "http://localhost:8080"),
		APIKey:      os.Getenv("API_SENSOR_KEY"),
		ServiceName: serviceName,
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": serviceName})
	})

	r.Post("/api/orders", func(w http.ResponseWriter, req *http.Request) {
		var body struct {
			OrderID string  `json:"orderId"`
			Amount  float64 `json:"amount"`
			CardPan string  `json:"cardPan"`
			ShipTo  string  `json:"shipTo"`
		}
		_ = json.NewDecoder(req.Body).Decode(&body)
		if body.CardPan == "" {
			body.CardPan = "4111111111111111"
		}
		last4 := body.CardPan
		if len(last4) > 4 {
			last4 = last4[len(last4)-4:]
		}
		writeJSON(w, http.StatusCreated, map[string]any{
			"orderId":   body.OrderID,
			"amount":    body.Amount,
			"status":    "created",
			"cardLast4": last4,
		})
	})

	r.Post("/api/checkout", func(w http.ResponseWriter, req *http.Request) {
		var body checkoutBody
		_ = json.NewDecoder(req.Body).Decode(&body)
		if body.OrderID == "" {
			body.OrderID = "ord_" + time.Now().Format("150405")
		}
		if body.Amount == 0 {
			body.Amount = 99.99
		}
		if body.CardPan == "" {
			body.CardPan = "4111111111111111"
		}

		ledgerPayload := map[string]any{
			"accountId": "acct_demo_001",
			"amount":    body.Amount,
			"orderId":   body.OrderID,
			"token":     "sk_live_demo_4111111111111111",
		}
		ledgerResp, err := postJSON(ledgerURL+"/api/ledger/entries", ledgerPayload, serviceName)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]any{"error": "ledger unavailable", "detail": err.Error()})
			return
		}

		var shadowExport any
		if body.TriggerShadowExport {
			shadowResp, shadowErr := postJSON(ledgerURL+"/internal/debug/export", map[string]any{"format": "json"}, serviceName)
			if shadowErr == nil {
				shadowExport = shadowResp
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"orderId":      body.OrderID,
			"amount":       body.Amount,
			"fulfillment":  "shipped",
			"ledger":       ledgerResp,
			"shadowExport": shadowExport,
		})
	})

	addr := "0.0.0.0:" + port
	log.Printf("Acme fulfillment-api on :%s", port)
	log.Fatal(http.ListenAndServe(addr, r))
}

func postJSON(url string, payload any, serviceName string) (map[string]any, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Service-Name", serviceName)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	if resp.StatusCode >= 400 {
		return out, &httpStatusError{code: resp.StatusCode}
	}
	return out, nil
}

type httpStatusError struct{ code int }

func (e *httpStatusError) Error() string {
	return http.StatusText(e.code)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
