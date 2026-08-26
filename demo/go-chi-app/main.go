package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jantznick/api-security/connectors/go/apiglimpse"
)

type user struct {
	ID    int    `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

func main() {
	port := envOr("PORT", "4000")

	r := chi.NewRouter()
	r.Use(apiglimpse.Middleware(apiglimpse.Config{
		AgentURL: envOr("API_SENSOR_AGENT_URL", "http://localhost:8080"),
		APIKey:   os.Getenv("API_SENSOR_KEY"),
	}))

	users := []user{
		{ID: 1, Email: "alice@example.com", Name: "Alice", Phone: "555-0100"},
		{ID: 2, Email: "bob@example.com", Name: "Bob", Phone: "555-0101"},
	}

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "demo-go-chi"})
	})

	r.Get("/api/users", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"users": users})
	})

	r.Get("/api/users/{id}", func(w http.ResponseWriter, req *http.Request) {
		id := chi.URLParam(req, "id")
		for _, u := range users {
			if strconv.Itoa(u.ID) == id {
				writeJSON(w, http.StatusOK, map[string]any{"user": u})
				return
			}
		}
		writeJSON(w, http.StatusNotFound, map[string]any{"error": "User not found"})
	})

	r.Post("/api/users", func(w http.ResponseWriter, req *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Name     string `json:"name"`
			Phone    string `json:"phone"`
			Password string `json:"password"`
			SSN      string `json:"ssn"`
		}
		_ = json.NewDecoder(req.Body).Decode(&body)
		u := user{ID: len(users) + 1, Email: body.Email, Name: body.Name, Phone: body.Phone}
		users = append(users, u)
		writeJSON(w, http.StatusCreated, map[string]any{
			"user": map[string]any{
				"id":          u.ID,
				"email":       u.Email,
				"name":        u.Name,
				"phone":       u.Phone,
				"hasPassword": body.Password != "",
				"hasSsn":      body.SSN != "",
			},
		})
	})

	r.Post("/api/auth/login", func(w http.ResponseWriter, req *http.Request) {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		_ = json.NewDecoder(req.Body).Decode(&body)
		if body.Email == "" || body.Password == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "email and password required"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.signature",
			"user":  map[string]any{"email": body.Email},
		})
	})

	r.Get("/api/orders/{orderId}/items/{itemId}", func(w http.ResponseWriter, req *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"orderId": chi.URLParam(req, "orderId"),
			"itemId":  chi.URLParam(req, "itemId"),
			"sku":     "SKU-100",
			"qty":     2,
		})
	})

	addr := "0.0.0.0:" + port
	log.Printf("Demo chi app on :%s", port)
	log.Printf("Sensor → %s", envOr("API_SENSOR_AGENT_URL", "http://localhost:8080"))
	log.Fatal(http.ListenAndServe(addr, r))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
