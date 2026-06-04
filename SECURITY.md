# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | ✅ Active  |
| < 0.4.0 | ❌ No longer supported |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately via **GitHub Security Advisories**:

1. Go to the [Security tab](https://github.com/Schalkez/i18n-sharpen/security/advisories) of this repository
2. Click **"New draft security advisory"**
3. Describe the vulnerability, steps to reproduce, and potential impact

You will receive a response within **72 hours**. We aim to release a fix within **14 days** of confirmation.

## Scope

`i18n-sharpen` is a **build-time / CI-time static analysis tool** that reads source files and locale JSON files. It does not:

- Accept network input
- Execute user-provided code at runtime
- Handle authentication or sensitive user data

Relevant security concerns include:
- **Malicious config files** causing unexpected file reads or writes
- **Crafted locale/source files** causing parser crashes or path traversal
- **Supply chain issues** in dependencies
