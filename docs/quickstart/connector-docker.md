# Quickstart — Connector in Docker

```bash
# After registering the Connector public key in Console → Sources
docker run --rm -e AEGIS_URL="$AEGIS_API_BASE" \
  -e INGEST_BEARER="$AEGIS_INGEST_KEY" \
  -e SOURCE_ID=src_los \
  -e KEY_ID=k_sandbox_los \
  -v "$PWD/keys:/keys" \
  ghcr.io/salanor-ltd/aegis-connector:latest
```

Image tag and registry may differ per release — use the image published with your sandbox docs pack.  
End: case sealed in console → download bundle → `pnpm aegis-verify`.
