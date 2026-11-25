# Quickstarts

Start: you have a **sandbox** and an **ingest API key**.  
End: you **verified an evidence bundle**.

| Guide | Path |
|-------|------|
| curl | [curl.md](./curl.md) |
| TypeScript SDK | [typescript.md](./typescript.md) |
| Python | [python.md](./python.md) |
| Connector (Docker) | [connector-docker.md](./connector-docker.md) |

OpenAPI: [openapi-public.yaml](./openapi-public.yaml)  
Sample reconcile feed: [samples/reconcile-sample.jsonl](./samples/reconcile-sample.jsonl)  
Sample sandbox feed: [samples/sample-feed.jsonl](./samples/sample-feed.jsonl)  
Postman: [salanor-sandbox.postman_collection.json](./salanor-sandbox.postman_collection.json)

Inside a sandbox, download a feed and a verifiable evidence bundle from the console (Send test events). The bundle is the latest sealed case, so you can check it on Verify without wiring your own systems.

Grades: G0 ingest key only → G1 source-signed → G2 reconciled / execution matched → G3 independent capture.
