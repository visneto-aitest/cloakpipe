# CloakPipe

Privacy middleware for LLM & RAG pipelines. CloakPipe sits between your application and the LLM API, automatically detecting and pseudonymizing sensitive entities in prompts, then rehydrating them in responses — so your models never see real data.

## How It Works

```
Your App  -->  CloakPipe Proxy  -->  LLM API
                  |                     |
            Detect & Replace      Process safely
            "Tata Motors" -> "ORG_1"    |
                  |                     |
            Rehydrate Response    <-----+
            "ORG_1" -> "Tata Motors"
```

1. **Detect** — Multi-layer engine finds sensitive entities (emails, API keys, financial amounts, custom patterns)
2. **Pseudonymize** — Replace with consistent tokens (`ORG_1`, `EMAIL_3`, `AMOUNT_7`) stored in an encrypted vault
3. **Forward** — Send sanitized prompt to your LLM provider
4. **Rehydrate** — Swap tokens back to original values in the response (including SSE streaming)

## Features

- **Drop-in proxy** — OpenAI-compatible API, change one URL and you're protected
- **Multi-layer detection** — Regex patterns, financial intelligence, custom TOML rules, optional NER
- **Consistent pseudonymization** — Same entity always maps to the same token across sessions
- **Encrypted vault** — AES-256-GCM encryption at rest, zeroize memory safety
- **SSE streaming** — Token-aware rehydration for streaming responses
- **Audit logging** — JSONL structured logs for compliance (metadata only, never raw values)
- **TOML configuration** — Full control over what gets detected and how

## Quick Start

### Build

```bash
cargo build --release
```

### Initialize config

```bash
./target/release/cloakpipe init
```

This creates a `cloakpipe.toml` with sensible defaults.

### Set environment variables

```bash
# Your LLM API key
export OPENAI_API_KEY="sk-..."

# Vault encryption key (32 bytes as hex)
export CLOAKPIPE_VAULT_KEY=$(openssl rand -hex 32)
```

### Start the proxy

```bash
./target/release/cloakpipe start
```

### Point your app at CloakPipe

```python
# Before
client = OpenAI(api_key="sk-...")

# After
client = OpenAI(api_key="sk-...", base_url="http://127.0.0.1:8900/v1")
```

### Test detection

```bash
# With default sample text
./target/release/cloakpipe test

# With custom text
./target/release/cloakpipe test --text "Send $1.2M to alice@acme.com"

# From file
./target/release/cloakpipe test --file document.txt
```

## Configuration

`cloakpipe.toml`:

```toml
[proxy]
listen = "127.0.0.1:8900"
upstream = "https://api.openai.com"
api_key_env = "OPENAI_API_KEY"

[vault]
path = "./vault.enc"
encryption = "aes-256-gcm"
key_env = "CLOAKPIPE_VAULT_KEY"

[detection]
secrets = true       # API keys, JWTs, connection strings
financial = true     # Currency amounts, percentages
dates = true         # Fiscal dates (Q3 2025, FY24)
emails = true
phone_numbers = false
ip_addresses = false
urls_internal = false

[detection.custom]
patterns = [
    { name = "project_codename", regex = "Project\\s+(Alpha|Beta|Gamma)", category = "PROJECT" }
]

[detection.overrides]
preserve = ["OpenAI", "GPT-4"]    # Never anonymize these
force = ["internal-secret"]        # Always anonymize these

[audit]
enabled = true
log_path = "./audit/"
log_entities = true
```

## Project Structure

```
crates/
  cloakpipe-core/     # Detection, pseudonymization, vault, rehydration
  cloakpipe-proxy/    # Axum HTTP proxy server
  cloakpipe-cli/      # CLI binary (start, test, stats, init)
  cloakpipe-audit/    # JSONL audit logging
  cloakpipe-tree/     # CloakTree: vectorless retrieval (v0.2)
  cloakpipe-vector/   # ADCPE vector encryption (v0.4)
  cloakpipe-local/    # Local-only RAG mode (v0.5)
```

## Detection Layers

| Layer | Detects | Source |
|-------|---------|--------|
| Pattern | AWS keys, API tokens, JWTs, connection strings, emails, IPs, internal URLs | Regex |
| Financial | Currency amounts ($1.2M, Rs 3.4L Cr), percentages, fiscal dates | Regex |
| Custom | User-defined patterns from TOML config | Regex |
| NER | Persons, organizations, locations | ONNX (optional, `--features ner`) |

## Running Tests

```bash
cargo test
```

## License

MIT OR Apache-2.0
