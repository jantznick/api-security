module github.com/jantznick/api-security/demo/acme/fulfillment-api

go 1.22

require (
	github.com/go-chi/chi/v5 v5.1.0
	github.com/jantznick/api-security/connectors/go v0.0.0
)

replace github.com/jantznick/api-security/connectors/go => ../../../connectors/go
