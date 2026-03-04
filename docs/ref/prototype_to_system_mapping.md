# Prototype To System Mapping (Step 9 Preview)

## Goal
Provide a single mapping source from prototype assets in `pages_ui/` to implementation modules and acceptance checkpoints.

## Input Assets
- `pages_ui/dash页/code.html`
- `pages_ui/编辑页/code.html`
- `pages_ui/导出页/code.html`
- `pages_ui/预览与导出后页面/code.html`

## Mapping Rules
1. Every prototype page must map to exactly one primary route in web app.
2. Every mapped page must have a target feature folder under `apps/web/src/features/`.
3. Motion and interaction requirements must use tokenized config, not hard-coded values.
4. Prototype-system mismatch must be recorded before code change.

## Route Mapping
- Dashboard prototype -> `/dashboard`
- Editor prototype -> `/editor/:projectId`
- Export prototype -> `/export/:projectId`
- Viewer prototype -> `/viewer/:projectId`

## System Hooks Reserved For Step 9
- Registry file: `apps/web/src/features/prototype/prototype-registry.json`
- Runtime config endpoint: `GET /api/config` from web dev server
- Motion token baseline: `motionTokens` in prototype registry

## Planned Verification (Step 9)
- Page parity check: visual structure matches prototype sections.
- Interaction parity check: key operations include equivalent state and feedback.
- Motion parity check: duration/easing traceable to tokens.
- Mismatch report: documented before implementation updates.
