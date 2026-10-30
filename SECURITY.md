# Security policy

## Supported version

Until stable releases exist, only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's **Security → Advisories → Report a vulnerability** flow.
Private vulnerability reporting must be enabled before this repository is opened to public
contributions. No verified fallback address is published yet; maintainers must add one here before
launch rather than inventing or publishing an unmonitored address.

Include affected files or versions, impact, reproduction steps, and any suggested mitigation. Do
not include live credentials or personal data. Please allow a reasonable period for acknowledgement,
validation, and coordinated disclosure before publishing details.

## Sensitive areas

Reports are especially useful when they concern:

- Gate configuration generation, activation, rollback, or local command execution;
- accidental exposure of provider credentials, paths, logs, or account data;
- unsafe parsing of remotely refreshed evidence;
- supply-chain or workflow changes that could alter published data without review;
- cross-site scripting or unsafe form handling on the static site.

Scientific disagreements, stale prices, and data corrections are not security vulnerabilities; use
the dedicated issue templates for those.
