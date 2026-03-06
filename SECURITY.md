# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in CloakPipe, please report it privately via [GitHub Security Advisories](https://github.com/rohansx/cloakpipe/security/advisories/new).

**Do not open a public issue for security vulnerabilities.**

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

## Scope

CloakPipe handles sensitive data by design. The following are in scope:

- Vault encryption weaknesses (key handling, nonce reuse, ciphertext integrity)
- Memory safety issues (sensitive data not being zeroed, buffer overflows)
- Proxy bypass (requests that skip pseudonymization)
- Audit log leaking raw entity values
- Detection engine bypasses that allow sensitive data through

## Design Principles

- **Vault keys** are never written to disk -- sourced from environment variables only
- **Sensitive memory** is deterministically zeroed via `zeroize`
- **Audit logs** record metadata (entity counts, categories, timing) but never raw values
- **No telemetry** -- CloakPipe sends zero data anywhere except your configured upstream
