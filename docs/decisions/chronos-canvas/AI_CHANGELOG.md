# AI Change Log - chronos-canvas

## 2026-03-03

### Scope
- Implemented `03_implementation.md` step 1 bootstrap.
- Added forward-looking system hooks for step 9 prototype integration.

### Added
- Workspace bootstrap:
  - `package.json`
  - `scripts/check-ports.js`
- Local server baseline:
  - `apps/local-server/package.json`
  - `apps/local-server/.env.example`
  - `apps/local-server/src/index.js`
- Web baseline:
  - `apps/web/package.json`
  - `apps/web/.env.example`
  - `apps/web/src/dev-server.js`
  - `apps/web/index.html`
- Step 9 preparation:
  - `apps/web/src/features/prototype/prototype-registry.json`
  - `docs/ref/prototype_to_system_mapping.md`

### Decisions
- Use minimal Node-only bootstrap first, avoid early framework lock-in.
- Reserve API port `8787` and web port `5173`.
- Use registry-driven prototype mapping to keep visual source and implementation traceable.

### Next
- Implement step 2 domain schema and JSON validator.
- Implement step 3 project APIs based on `02_interface.md`.

## 2026-03-04

### Scope
- Implemented `03_implementation.md` step 2 domain model and validation baseline.
- Added migration + normalization flow for timeline documents.

### Added
- Domain constants:
  - `apps/local-server/src/domain/constants.js`
- Domain constructors:
  - `apps/local-server/src/domain/timeline.js`
- Domain validation and migration:
  - `apps/local-server/src/domain/validation.js`
- Project bootstrap storage:
  - `apps/local-server/src/domain/storage.js`

### Changed
- Extended `apps/local-server/src/index.js` with:
  - `GET /api/domain/version`
  - `POST /api/domain/validate`
  - `POST /api/domain/init-project`

### Validation Notes
- `init-project` now writes legal `project.json` + `data.json`.
- `validate` enforces asset path constraints (must start with `./assets/`).
- Invalid external/absolute media paths are rejected with readable errors.

### Next
- Implement step 3 project list/detail/update API.
- Add conflict handling for duplicate slug at project creation.

### Step 3 Completed (same day)
- Added project management APIs aligned with `02_interface.md`:
  - `POST /api/projects`
  - `GET /api/projects`
  - `GET /api/projects/:projectId`
  - `PATCH /api/projects/:projectId`
- Added error response helper and `PROJECT_NOT_FOUND` behavior.
- Added slug conflict auto-resolution (`-1`, `-2` suffix strategy).
- Added list/detail/update storage operations in `domain/storage.js`.

### Step 3 Verification
- Create -> List -> Detail -> Patch flow passed.
- Not-found project returns `PROJECT_NOT_FOUND`.
- Duplicate slug creation auto-generates unique slug.

### Demo For Steps 1-3
- Upgraded `apps/web/index.html` from static page to interactive demo console:
  - Step 1 checks: config + health + bootstrap + version + prototype registry.
  - Step 2 validation playground with valid/invalid payload presets.
  - Step 3 project management panel for create/list/detail/patch.
- Added CORS support in `apps/local-server/src/index.js` to allow browser calls from web port to API port.
- Verified demo startup at custom ports:
  - web: `http://127.0.0.1:5174`
  - api: `http://127.0.0.1:8791`

### Step 4 Completed
- Added node management APIs aligned with `02_interface.md`:
  - `POST /api/projects/:projectId/nodes`
  - `PATCH /api/projects/:projectId/nodes/:nodeId`
  - `DELETE /api/projects/:projectId/nodes/:nodeId`
  - `POST /api/projects/:projectId/nodes/reorder`
- Implemented node domain operations in `apps/local-server/src/domain/storage.js`:
  - create / update / delete / reorder
  - timeline + project `updatedAt` sync
  - fallback timestamp ordering for non-specified nodes during reorder
- Added `NODE_NOT_FOUND` error handling in route layer.

### Step 4 Verification
- Create two nodes -> patch one -> reorder -> delete one passed.
- Deleting non-existing node returns `NODE_NOT_FOUND`.

### Step 5 Completed
- Added asset management APIs in `apps/local-server/src/index.js`:
  - `GET /api/projects/:projectId/assets`
  - `POST /api/projects/:projectId/assets`
  - `DELETE /api/projects/:projectId/assets/:assetId`
- Added asset storage logic in `apps/local-server/src/domain/storage.js`:
  - base64 upload to project `assets/` directory
  - project-level asset listing with `inUse` flag
  - delete protection when asset is referenced by timeline nodes/meta
  - `force=true` deletion override for debugging
- Expanded Step 5 demo in `apps/web/index.html`:
  - file upload panel
  - asset list panel
  - delete + force delete controls
  - one-click fill selected asset src into node media input

### Step 5 Verification
- Upload asset succeeded and returned relative path `./assets/...`.
- Asset list returns `inUse` status.
- Deleting referenced asset returns `ASSET_IN_USE`.
- Force delete succeeds with `?force=true`.

### Step 5 Adjustment (project-bound media ref)
- Switched media binding model from node-owned `src` only to project-owned asset library:
  - `timeline.meta.assets[]` is now authoritative project asset registry.
  - node media supports `assetId` ref and auto-binds `src` from project asset registry.
- Updated demo step4 media input to prefer `assetId` tokens (comma separated).
- Updated demo asset-fill action to write `assetId` into node media input.

### Frontend Core Pages Started
- Rebuilt `apps/web/index.html` into a real frontend shell with four core routes:
  - Dash 页面
  - 编辑页面
  - 预览与导出页面
  - 导出管理页
- Kept demo/debug capability as an always-available “调试板块”.
- Connected page actions to existing backend APIs for:
  - project create/list/detail
  - node create/update/delete
  - asset upload/list
