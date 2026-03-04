# 02 接口规格说明

## 1. 结构/函数端点/函数签名

### 1.1 系统结构（逻辑分层）
- `Editor UI`：节点编辑、主题切换、实时预览、导出触发。
- `Local API Layer`：前端通过 HTTP 调用本地 Node 服务。
- `Project Service`：项目管理、数据读写、资源管理。
- `Export Service`：构建离线分享包（静态资源 + 数据 + 资源拷贝）。

### 1.2 本地 API 端点（推荐 REST 约定）

#### 项目管理
- `POST /api/projects`
  - 输入：
    - `name: string`（项目名，1-64 字符）
    - `slug?: string`（可选英文标识，未提供则自动生成）
  - 输出：
    - `project: ProjectMeta`

- `GET /api/projects`
  - 输入：无
  - 输出：
    - `projects: ProjectMeta[]`

- `GET /api/projects/:projectId`
  - 输入：
    - `projectId: string`
  - 输出：
    - `project: ProjectMeta`
    - `timeline: TimelineDocument`

- `PATCH /api/projects/:projectId`
  - 输入：
    - `title?: string`
    - `description?: string`
    - `themeConfig?: ThemeConfig`
  - 输出：
    - `project: ProjectMeta`

#### 节点管理
- `POST /api/projects/:projectId/nodes`
  - 输入：
    - `node: TimelineNodeInput`
  - 输出：
    - `node: TimelineNode`

- `PATCH /api/projects/:projectId/nodes/:nodeId`
  - 输入：
    - `node: Partial<TimelineNodeInput>`
  - 输出：
    - `node: TimelineNode`

- `DELETE /api/projects/:projectId/nodes/:nodeId`
  - 输入：路径参数
  - 输出：
    - `success: boolean`

- `POST /api/projects/:projectId/nodes/reorder`
  - 输入：
    - `orderedNodeIds: string[]`
  - 输出：
    - `nodes: TimelineNode[]`

#### 媒体管理
- `POST /api/projects/:projectId/assets`
  - 输入：`multipart/form-data`
    - `file: binary`
    - `kind: "image" | "video" | "audio"`
  - 输出：
    - `asset: MediaAsset`

- `DELETE /api/projects/:projectId/assets/:assetId`
  - 输出：
    - `success: boolean`

#### 导出
- `POST /api/projects/:projectId/export`
  - 输入：
    - `profile?: "standard" | "compressed"`（增强）
    - `includeSource?: boolean`（增强，是否附带原始数据）
  - 输出：
    - `exportPath: string`
    - `warnings: string[]`

### 1.3 前端核心函数签名（建议）
- `loadProject(projectId: string): Promise<{ project: ProjectMeta; timeline: TimelineDocument }>`
- `saveNode(projectId: string, node: TimelineNodeInput, nodeId?: string): Promise<TimelineNode>`
- `switchTheme(projectId: string, theme: ThemeConfig): Promise<ProjectMeta>`
- `exportProject(projectId: string, options?: ExportOptions): Promise<{ exportPath: string; warnings: string[] }>`

## 2. 数据字典

### 2.1 `ProjectMeta`
- `id: string`：项目唯一标识。
- `name: string`：项目名称。
- `slug: string`：目录安全标识（英文小写、连字符）。
- `title: string`：展示标题。
- `description?: string`：项目描述。
- `createdAt: string`：ISO 时间。
- `updatedAt: string`：ISO 时间。
- `storagePath: string`：本地存储目录绝对路径（仅后端持有，前端可脱敏展示）。
- `themeConfig: ThemeConfig`：主题配置对象。

### 2.2 `TimelineDocument`
- `version: string`：文档格式版本，便于后续迁移。
- `meta: TimelineMeta`
- `nodes: TimelineNode[]`

### 2.3 `TimelineMeta`
- `projectId: string`
- `title: string`
- `description?: string`
- `coverImage?: string`：相对路径（如 `./assets/cover.jpg`）。
- `music?: { autoplay: boolean; src: string }`（增强）
- `themeConfig: ThemeConfig`

### 2.4 `ThemeConfig`
- `themeId: "minimal-list" | "snake-path" | "horizontal-film" | string`
- `accentColor?: string`（HEX）
- `fontFamily?: string`
- `motionLevel?: "low" | "medium" | "high"`（用于设备降级）

### 2.5 `TimelineNodeInput`
- `timestamp: string`（ISO，必填）
- `title: string`（1-120 字）
- `body?: string`（Markdown）
- `type?: "standard" | "gallery" | "quote" | "video"`
- `layout?: "left" | "right" | "center"`
- `highlight?: boolean`
- `media?: MediaAssetRef[]`
- `link?: { url: string; text?: string }`

### 2.6 `TimelineNode`（持久化结构）
- `id: string`
- `timestamp: string`
- `displayDateOverride?: string`
- `title: string`
- `body?: string`
- `type: "standard" | "gallery" | "quote" | "video"`
- `layout: "left" | "right" | "center"`
- `highlight: boolean`
- `media: MediaAssetRef[]`
- `link?: { url: string; text?: string; icon?: string }`
- `createdAt: string`
- `updatedAt: string`

### 2.7 `MediaAsset` / `MediaAssetRef`
- `id: string`
- `kind: "image" | "video" | "audio"`
- `src: string`（相对路径，导出兼容）
- `thumbnail?: string`（增强）
- `width?: number`（图片建议必填）
- `height?: number`（图片建议必填）
- `duration?: number`（视频/音频，秒）
- `sizeBytes?: number`

### 2.8 `ExportOptions`
- `profile?: "standard" | "compressed"`
- `includeSource?: boolean`

## 3. 接口约束与错误码
- 时间字段统一使用 ISO 8601。
- 导出场景中所有资源路径必须是相对路径，不允许绝对系统路径写入产物。
- URL 字段必须通过基础校验（协议白名单：`http`、`https`）。
- 错误码建议：
  - `PROJECT_NOT_FOUND`
  - `NODE_NOT_FOUND`
  - `INVALID_INPUT`
  - `ASSET_WRITE_FAILED`
  - `EXPORT_FAILED`
  - `THEME_NOT_SUPPORTED`
