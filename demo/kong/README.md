# Kong gateway demo (API Glimpse)

Runs Kong 3.6 with the in-repo `apiglimpse` Lua plugin, an echo upstream, and a
mock collector that records `POST /v1/samples`.

## Run

```bash
docker compose up -d
./test.sh
```

| Port | Service |
| --- | --- |
| 18002 | Kong proxy |
| 18003 | Kong admin |
| 18081 | Mock collector |

Plugin code is bind-mounted from `connectors/kong/kong/plugins`.

## Tear down

```bash
docker compose down -v
```
