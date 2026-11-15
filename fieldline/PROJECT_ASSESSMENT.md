# FIELDLINE: competition assessment and camera plan

## Provisional expert assessment

**Idea: 5.5/10 for national-level university competition potential. Current evidence/readiness: 3/10.** These are provisional scores based on the `fieldline-v1.zip` source and its accompanying project notes in this repository, not a judging result or a claim of deployment readiness. A strong, measured demo and a clearly scoped user problem could raise the score; a broad feature list without validation would lower it.

| Criterion | Score / 10 | Assessment |
|---|---:|---|
| Problem relevance | 7 | Offline incident documentation, equipment checks, and secure handover address real constraints for maintenance, disaster response, and field support. The target user and task need to be narrowed and interviewed. |
| Differentiation | 5 | A local-first evidence workflow that combines encrypted records, attachment hashes, event history, and offline use is a useful integration. Each constituent capability is established; the integration alone is not a research novelty. |
| Technical execution in the supplied prototype | 6 | The source has modular browser code, IndexedDB encryption, package validation, a hash chain, offline caching, audio diagnostics, and unit/browser test assets. These are prototype-level controls and need independent reproduction. |
| Camera contribution today | 2 | Existing camera use is gesture navigation: low-resolution, in-memory silhouette processing. Incident photos can be attached, but there is no guided inspection workflow, annotation, change comparison, or image-quality feedback in the supplied source. |
| Validation and evidence | 3 | The ZIP includes a test report and test scripts/results, but those are project-authored and not a substitute for independently rerun tests, representative field trials, or measured comparisons. |
| Deployment and trust readiness | 2 | The project documentation itself identifies no independent security review, no signatures or trusted timestamps, no formal accessibility audit, and no operational certification. |

### What is differentiated and what is commonplace

The credible differentiator is the proposed **offline-first evidence workflow**: incident context, encrypted local attachments, package integrity checks, event history, and manual transfer in one browser application. The combination can be valuable if it saves time and produces more complete, reviewable records under poor connectivity.

Encryption with AES-GCM, SHA-256 file checksums, browser camera capture, checklists, audio visualization, offline web caching, and gesture controls are established techniques. Hash chains provide tamper evidence against casual edits; they do not prove authorship, trusted capture time, or legal chain of custody. A camera capture plus a hash is not novel on its own.

The strongest competition story is therefore a testable workflow outcome, not “AI” or “military-grade” positioning: fewer omitted inspection details, faster incident handover, and reliable local operation on representative low-cost devices.

### Technical gaps and risks

- No named user study or requirements traceability is supplied. Defence-support language is broad; validate an appropriate civilian maintenance, emergency-response, or safety-support use case first.
- No independent security review, signed release, trusted timestamp, signer identity, role model, or secure multi-user handoff exists. Local encryption does not defend an unlocked or compromised device.
- Device-clock time and locally generated hash chains can be rewritten by someone controlling the device. Do not claim forensic authenticity, legal admissibility, or tamper-proof evidence.
- Image quality alone does not determine that a photo documents the right component or defect. Any automated vision must be bounded, interpretable, validated on representative images, and subordinate to operator review.
- Browser permission, storage eviction, camera variation, low light, glare, and memory pressure can break field workflows. Existing attachment handling is memory-bound and capped.
- The included E2E report is not yet independent reproduction. Camera behavior, offline startup, accessibility, and privacy leakage need fresh runs on real devices and browsers.

### Readiness evidence before making a national-level claim

1. Reproducible build and test instructions, pinned runtime versions, clean test logs, and a demonstration from the current repository branch.
2. A small, documented user study with a specific user group, task baseline, consent, and measurable outcomes (completion time, required fields omitted, handover errors).
3. A representative camera dataset with consent and privacy handling, a predefined quality rubric, and reported false warnings/missed warnings across lighting, device, and equipment conditions.
4. Offline and performance measurements on the target low-cost phone/tablet, including startup, capture-to-attach time, memory, storage limits, and interrupted workflows.
5. Threat model, independent security review, release integrity strategy, and a clear statement of what package hashes, encryption, and timestamps do and do not establish.
6. Accessibility review with keyboard and screen reader users, plus measured contrast and language usability for the target population.
7. A live demonstration plus a failure demonstration: rejected oversized/corrupt input, unavailable camera, low-quality photo warning, privacy review, offline export/import, and integrity failure.

## Camera subsystem MVP

### Product scope

Build a **guided equipment/incident photo record** inside an existing incident. The operator selects a capture purpose, adds a concise factual observation, reviews the image for bystanders or sensitive details, receives local resolution/brightness feedback, then attaches the original image. Existing encrypted storage, attachment SHA-256, event history, and encrypted package export carry the record forward.

This is the first increment. It deliberately does not claim automatic blur, object recognition, damage diagnosis, identity recognition, tracking, targeting, or tactical support. A future comparison feature should be a human-reviewed side-by-side view for the same equipment label, never an identity or person-tracking feature.

### Current implementation and architecture

The supplied app is a no-dependency ES-module PWA served from localhost. `views_core.js` owns incident creation and photo/file attachments; `vault.js` encrypts records/bytes in IndexedDB; `attachBytes` hashes image bytes and appends an attachment event; `pkg.js` packages attachment source metadata and bytes; `sw.js` precaches app modules.

This increment adds a pure quality-check module and extends the existing incident photo input. Sampling and checks run on-device; no image request is sent. It records purpose, operator note, device-clock time, image dimensions, mean luminance, quality warnings, and an explicit operator privacy review. Existing attachment code hashes and encrypts the unchanged original. The quality check does not judge focus, defect visibility, or semantic completeness.

### Milestones

1. **Guided capture and evidence metadata (implemented):** purpose, factual note, local dimension/brightness checks, privacy-review confirmation, unchanged source image, existing encrypted storage and package flow.
2. **Inspection completeness:** configurable, non-sensitive equipment inspection templates; prompt for overview/detail/label views; show missing views without blocking emergency capture; test usability with maintainers.
3. **Human-reviewed comparison:** select two images explicitly for the same user-entered equipment label and date; show side-by-side/difference overlay locally; record user confirmation and limitations. No automatic identity or tracking.
4. **Privacy tooling:** optional manual region redaction on a copy with reversible original retention disabled by default; conspicuous preview; tests proving the exported derivative is the image reviewed and the original is not accidentally attached.
5. **Trust and deployment:** signed application releases, independent review, hardware tests, offline performance budgets, and a documented transfer procedure. Trusted timestamps/signatures require a separate threat model and authority model.

### Rigorous test plan

- Unit: luminance math, invalid pixel buffers, malformed dimensions, thresholds, and deterministic warning output.
- Browser integration: choose/capture an image; require purpose, note, and privacy review; verify local metadata and unchanged photo bytes; verify the existing SHA-256 equals the attached bytes; lock/reopen and export/import a package with metadata intact.
- Privacy: inspect network requests while capturing, attach and export with network disconnected; assert no camera data leaves localhost; verify no facial/identity model or tracking API is present.
- Quality fixtures: dark, bright, low-resolution, normal daylight, glare, and rotated images across multiple device cameras; compare warning behavior to a predeclared rubric and report errors.
- Failure and accessibility: camera denied/unavailable, unsupported image decode, oversized file, storage quota, repeated selection, keyboard-only use, screen reader labels, and privacy-checkbox state.
- Field study: consented, non-sensitive equipment inspection tasks with trained participants; compare completeness and time against the current paper/photo process. Publish sample size, device list, protocol, and limitations.

Do not describe the MVP as evidence-grade or national-level validated until these independent tests and user studies are complete.
