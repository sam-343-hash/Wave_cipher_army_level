# FIELDLINE

**Offline-first field operations and incident-assurance workstation**

[![Platform](https://img.shields.io/badge/platform-local%20web%20app-1f6feb)](fieldline/)
[![Status](https://img.shields.io/badge/status-engineering%20prototype-orange)](#project-status)
[![License](https://img.shields.io/badge/license-not%20specified-lightgrey)](#license)

FIELDLINE is a browser-based engineering prototype for lawful field documentation, safety-readiness workflows, audio diagnostics, and integrity-checked evidence handling in connectivity-restricted environments.

It evolved from the WaveCipher concept and brings local encrypted storage, incident records, evidence-package verification, signal analysis, SOP checklists, and camera-assisted navigation into one workstation.

> **Important:** FIELDLINE is a prototype. It is not certified, is not represented as military-grade, and has not undergone an independent security assessment. Do not use it as the sole system for operational, safety-critical, legal, or evidentiary decisions.

## Project at a glance

| Area | Current implementation |
|---|---|
| Operating model | Browser application served from localhost |
| Data handling | Local browser storage and encrypted evidence packages |
| Cryptography | Web Crypto APIs, AES-256-GCM, PBKDF2-HMAC-SHA256 |
| Signal tools | Waveform, spectrum, spectrogram, recording and WAV analysis |
| Evidence workflow | Export/import packages with SHA-256 integrity checks |
| Camera interaction | Gesture-assisted navigation and guided evidence capture |
| Readiness workflow | Configurable SOP checklists and training exercises |
| Connectivity | Designed for offline use after the application cache is prepared |

See [the technical README](fieldline/README.md) for detailed behaviour, setup steps, and limitations.

## Core workspaces

- **Incident Management** — structured incident records, timelines, attachments, and encrypted exports.
- **Evidence Vault** — import, verify, and manage `.flpkg` evidence packages.
- **Signal Intelligence** — audio capture and analysis, including waveform, frequency spectrum, spectrogram, RMS, peak, clipping, and WAV export.
- **SOP Workbench** — reusable checklists, progress tracking, and report export.
- **Gesture Controls** — camera-assisted navigation with manual and keyboard alternatives.
- **Guided Camera Evidence** — capture-purpose and privacy-review metadata; it does not identify people or automatically redact images.
- **Security Centre** — vault status, backup/restore, session lock, and local-data management.
- **Training Simulator** — synthetic practice workflows kept separate from real incident records.

## Architecture

The current codebase is a modular static web application with a small Python development server.

```text
FIELDLINE
├── Browser UI
│   ├── Incident and evidence workflows
│   ├── Signal analysis and recording
│   ├── SOP and training workspaces
│   └── Camera-assisted navigation
├── Local application modules
│   ├── Cryptography and key derivation
│   ├── Hash chain and package handling
│   ├── Local persistence and vault
│   └── Audio, gesture, and translation utilities
└── Local Python server
    └── Static-file delivery on 127.0.0.1
```

This diagram is a high-level view of the current project structure, not a claim of a hardened or formally verified architecture.

## Quick start

**Requirements:** Python 3.8+ and a modern browser. Node.js and Playwright are only needed for the optional test suite.

1. Clone the repository:

   ```bash
   git clone https://github.com/sam-343-hash/Wave_cipher_army_level.git
   cd Wave_cipher_army_level/fieldline
   ```

2. Start the local server:

   ```bash
   python3 server.py
   ```

   On Windows, use `py server.py` or `python server.py`.

3. Open [http://localhost:8000](http://localhost:8000).

4. Create a vault with a strong passphrase. **The passphrase cannot be recovered.** Create and safely store backups before adding important data.

Stop the server with `Ctrl+C`.

## Offline behaviour

The application is designed to cache its application assets for offline use after the first successful load. Confirm that the UI reports **Offline cache ready** before disconnecting. Browser dictation and optional translation integrations may require network access; these are not equivalent to the core offline workflows.

## Testing

From the `fieldline/` directory:

```bash
sh tests/run_all.sh
```

For test-suite requirements and coverage boundaries, see [TEST_REPORT.md](fieldline/TEST_REPORT.md). The presence of tests does not constitute a security certification or operational validation.

## Documentation

| Document | Description |
|---|---|
| [Application guide](fieldline/README.md) | Detailed features, installation, workflows, and known limitations |
| [Security model](fieldline/SECURITY_MODEL.md) | Intended security controls, assumptions, and threat boundaries |
| [Technical audit](fieldline/TECHNICAL_AUDIT.md) | Engineering review notes |
| [Test report](fieldline/TEST_REPORT.md) | Automated test coverage and limitations |
| [Project assessment](fieldline/PROJECT_ASSESSMENT.md) | Project-level assessment and recommendations |

## Project status

FIELDLINE is an actively evolving engineering prototype. Feature availability, browser compatibility, and test coverage should be confirmed against the current source before relying on a workflow. No claim of field deployment, defence procurement approval, formal certification, or independent penetration testing is made.

## Responsible use

Use only with data you are authorised to collect and process. Obtain consent where required, minimise personal information, protect exported packages, and follow applicable law and organisational policy. Device-clock timestamps are not independently trusted; package hashes detect changes to package contents but do not by themselves prove who created a record or when it was created.

## Contributing

Issues and pull requests are welcome. Please include reproducible steps, browser and operating-system details, expected behaviour, and actual behaviour. Do not include real personal, operational, or sensitive evidence in public issues.

## License

No license is currently specified. Until a license is added, permission to reuse, modify, or distribute this project should not be assumed.
