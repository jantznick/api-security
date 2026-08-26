FROM golang:1.22-alpine AS build

WORKDIR /workspace/demo/acme/fulfillment-api
COPY demo/acme/fulfillment-api/go.mod demo/acme/fulfillment-api/go.sum ./
COPY connectors/go /workspace/connectors/go
RUN go mod download

COPY demo/acme/fulfillment-api/main.go ./
RUN CGO_ENABLED=0 go build -o /fulfillment-api .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /fulfillment-api .
ENV PORT=4013
EXPOSE 4013
CMD ["./fulfillment-api"]
