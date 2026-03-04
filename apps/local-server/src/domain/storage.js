const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createTimelineDocument, buildProjectMeta } = require("./timeline");
const { validateTimelineDocument } = require("./validation");
const { nowIso } = require("./timeline");

function safeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function uniqueId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function resolveUniqueSlug(projectsRoot, preferredSlug) {
  const base = preferredSlug || uniqueId("project");
  let candidate = base;
  let index = 1;
  while (fs.existsSync(path.join(projectsRoot, candidate))) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function createProjectSkeleton(projectsRoot, input) {
  ensureDir(projectsRoot);
  const requestedSlug = safeSlug(input.slug || input.name || "") || uniqueId("project");
  const slug = resolveUniqueSlug(projectsRoot, requestedSlug);
  const projectId = uniqueId("project");
  const projectDir = path.join(projectsRoot, slug);
  const assetsDir = path.join(projectDir, "assets");

  ensureDir(projectDir);
  ensureDir(assetsDir);

  const project = buildProjectMeta({
    id: projectId,
    name: input.name || "未命名项目",
    slug,
    title: input.title || input.name || "未命名项目",
    description: input.description || "",
    themeConfig: input.themeConfig
  });

  const timeline = createTimelineDocument({
    projectId,
    title: project.title,
    description: project.description,
    themeConfig: project.themeConfig
  });

  const validation = validateTimelineDocument(timeline);
  if (!validation.valid) {
    throw new Error(`INIT_TIMELINE_INVALID: ${validation.errors.join("; ")}`);
  }

  writeJsonFile(path.join(projectDir, "project.json"), project);
  writeJsonFile(path.join(projectDir, "data.json"), validation.normalized);

  return {
    projectDir,
    assetsDir,
    project,
    timeline: validation.normalized
  };
}

function listProjects(projectsRoot) {
  ensureDir(projectsRoot);
  const dirs = fs
    .readdirSync(projectsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const projects = [];
  for (const dirName of dirs) {
    const dirPath = path.join(projectsRoot, dirName);
    const projectPath = path.join(dirPath, "project.json");
    const timelinePath = path.join(dirPath, "data.json");
    const project = readJsonFile(projectPath);
    const timeline = readJsonFile(timelinePath);
    if (!project || !timeline) continue;
    projects.push({
      ...project,
      storagePath: dirPath,
      nodeCount: Array.isArray(timeline.nodes) ? timeline.nodes.length : 0
    });
  }

  projects.sort((a, b) => {
    const ta = Date.parse(a.updatedAt || 0);
    const tb = Date.parse(b.updatedAt || 0);
    return tb - ta;
  });

  return projects;
}

function getProjectById(projectsRoot, projectId) {
  const projects = listProjects(projectsRoot);
  const project = projects.find((p) => p.id === projectId);
  if (!project) return null;

  const timeline = readJsonFile(path.join(project.storagePath, "data.json"));
  if (!timeline) return null;

  return { project, timeline };
}

function persistProjectAndTimeline(found, project, timeline) {
  const projectPath = path.join(found.project.storagePath, "project.json");
  const timelinePath = path.join(found.project.storagePath, "data.json");
  writeJsonFile(projectPath, project);
  writeJsonFile(timelinePath, timeline);
}

function ensureProjectExists(projectsRoot, projectId) {
  const found = getProjectById(projectsRoot, projectId);
  if (!found) {
    const e = new Error("PROJECT_NOT_FOUND");
    e.code = "PROJECT_NOT_FOUND";
    throw e;
  }
  return found;
}

function sortNodesByTimestamp(nodes) {
  return [...nodes].sort((a, b) => {
    const ta = Date.parse(a.timestamp || 0);
    const tb = Date.parse(b.timestamp || 0);
    if (ta !== tb) return ta - tb;
    return (a.id || "").localeCompare(b.id || "");
  });
}

function safeFileBaseName(filename) {
  const base = path.basename(String(filename || "file.bin"));
  const MAX_FILENAME_BYTES = 255;
  // 保留中文与常见 Unicode 字符，仅清理路径危险字符与控制字符
  const cleaned = base
    .replace(/[\\/\0]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim() || "file.bin";

  // 尽量保留扩展名，并按 UTF-8 字节限制进行截断，避免跨平台文件系统异常
  if (Buffer.byteLength(cleaned, "utf8") <= MAX_FILENAME_BYTES) {
    return cleaned;
  }

  const ext = path.extname(cleaned);
  const nameOnly = ext ? cleaned.slice(0, -ext.length) : cleaned;
  const extBytes = Buffer.byteLength(ext, "utf8");
  const budget = Math.max(1, MAX_FILENAME_BYTES - extBytes);

  let out = "";
  for (const ch of nameOnly) {
    const next = out + ch;
    if (Buffer.byteLength(next, "utf8") > budget) break;
    out = next;
  }
  return `${out || "file"}${ext}`;
}

function guessKindByExt(ext) {
  const e = String(ext || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"].includes(e)) return "image";
  if ([".mp4", ".mov", ".webm", ".mkv"].includes(e)) return "video";
  if ([".mp3", ".wav", ".m4a", ".ogg"].includes(e)) return "audio";
  return "image";
}

function collectReferencedAssetRefs(timeline) {
  const refs = new Set();
  const meta = timeline && timeline.meta ? timeline.meta : {};
  if (typeof meta.coverImage === "string") refs.add(meta.coverImage);
  if (meta.music && typeof meta.music.src === "string") refs.add(meta.music.src);
  const nodes = Array.isArray(timeline?.nodes) ? timeline.nodes : [];
  for (const node of nodes) {
    const media = Array.isArray(node?.media) ? node.media : [];
    for (const item of media) {
      if (typeof item?.assetId === "string") refs.add(`id:${item.assetId}`);
      if (typeof item?.src === "string") refs.add(item.src);
      if (typeof item?.thumbnail === "string") refs.add(item.thumbnail);
    }
  }
  return refs;
}

function normalizeMediaRefs(mediaInput) {
  if (!Array.isArray(mediaInput)) return [];
  return mediaInput
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const out = {};
      if (typeof item.assetId === "string" && item.assetId) out.assetId = item.assetId;
      if (typeof item.src === "string" && item.src) out.src = item.src;
      if (typeof item.caption === "string") out.caption = item.caption;
      if (typeof item.thumbnail === "string") out.thumbnail = item.thumbnail;
      if (typeof item.width === "number") out.width = item.width;
      if (typeof item.height === "number") out.height = item.height;
      return out.assetId || out.src ? out : null;
    })
    .filter(Boolean);
}

function bindNodeMediaToProjectAssets(mediaInput, assetLibrary) {
  const assets = Array.isArray(assetLibrary) ? assetLibrary : [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const bySrc = new Map(assets.map((a) => [a.src, a]));

  return mediaInput.map((item) => {
    const out = { ...item };
    if (out.assetId) {
      const asset = byId.get(out.assetId);
      if (!asset) {
        const e = new Error(`INVALID_INPUT: media.assetId 不存在 ${out.assetId}`);
        e.code = "INVALID_INPUT";
        throw e;
      }
      if (!out.src) out.src = asset.src;
      return out;
    }
    if (out.src) {
      const asset = bySrc.get(out.src);
      if (asset) out.assetId = asset.id;
      return out;
    }
    return out;
  });
}

function normalizeNodeInput(input) {
  const now = nowIso();
  return {
    id: `node_${crypto.randomBytes(5).toString("hex")}`,
    timestamp: input.timestamp || now,
    displayDateOverride:
      typeof input.displayDateOverride === "string" ? input.displayDateOverride : undefined,
    title: typeof input.title === "string" ? input.title : "",
    body: typeof input.body === "string" ? input.body : "",
    type: input.type || "standard",
    layout: input.layout || "left",
    highlight: Boolean(input.highlight),
    media: normalizeMediaRefs(input.media),
    link: input.link && typeof input.link === "object" ? input.link : undefined,
    createdAt: now,
    updatedAt: now
  };
}

function updateProjectMeta(projectsRoot, projectId, patch) {
  const found = ensureProjectExists(projectsRoot, projectId);

  const project = { ...found.project };
  const timeline = { ...found.timeline };

  if (typeof patch.title === "string") {
    project.title = patch.title;
    timeline.meta = { ...(timeline.meta || {}), title: patch.title };
  }
  if (typeof patch.description === "string") {
    project.description = patch.description;
    timeline.meta = { ...(timeline.meta || {}), description: patch.description };
  }
  if (patch.themeConfig && typeof patch.themeConfig === "object") {
    project.themeConfig = { ...(project.themeConfig || {}), ...patch.themeConfig };
    timeline.meta = {
      ...(timeline.meta || {}),
      themeConfig: { ...(timeline.meta?.themeConfig || {}), ...patch.themeConfig }
    };
  }

  const now = nowIso();
  project.updatedAt = now;
  timeline.updatedAt = now;
  const validated = validateTimelineDocument(timeline);
  if (!validated.valid) {
    const e = new Error(`INVALID_INPUT: ${validated.errors.join("; ")}`);
    e.code = "INVALID_INPUT";
    throw e;
  }

  persistProjectAndTimeline(found, project, validated.normalized);

  return {
    ...project,
    storagePath: found.project.storagePath,
    nodeCount: Array.isArray(validated.normalized.nodes)
      ? validated.normalized.nodes.length
      : 0
  };
}

function createNode(projectsRoot, projectId, nodeInput) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const project = { ...found.project };
  const timeline = { ...found.timeline, nodes: Array.isArray(found.timeline.nodes) ? [...found.timeline.nodes] : [] };

  const node = normalizeNodeInput(nodeInput || {});
  node.media = bindNodeMediaToProjectAssets(
    node.media,
    timeline?.meta?.assets
  );
  timeline.nodes.push(node);
  timeline.nodes = sortNodesByTimestamp(timeline.nodes);

  const now = nowIso();
  timeline.updatedAt = now;
  project.updatedAt = now;

  const validated = validateTimelineDocument(timeline);
  if (!validated.valid) {
    const e = new Error(`INVALID_INPUT: ${validated.errors.join("; ")}`);
    e.code = "INVALID_INPUT";
    throw e;
  }

  persistProjectAndTimeline(found, project, validated.normalized);
  return validated.normalized.nodes.find((n) => n.id === node.id);
}

function updateNode(projectsRoot, projectId, nodeId, nodePatch) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const project = { ...found.project };
  const timeline = { ...found.timeline, nodes: Array.isArray(found.timeline.nodes) ? [...found.timeline.nodes] : [] };
  const index = timeline.nodes.findIndex((n) => n.id === nodeId);
  if (index === -1) {
    const e = new Error("NODE_NOT_FOUND");
    e.code = "NODE_NOT_FOUND";
    throw e;
  }

  const current = { ...timeline.nodes[index] };
  const next = {
    ...current,
    ...nodePatch,
    media: nodePatch.media !== undefined ? normalizeMediaRefs(nodePatch.media) : current.media,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: nowIso()
  };
  next.media = bindNodeMediaToProjectAssets(
    normalizeMediaRefs(next.media),
    timeline?.meta?.assets
  );
  timeline.nodes[index] = next;
  timeline.nodes = sortNodesByTimestamp(timeline.nodes);

  const now = nowIso();
  timeline.updatedAt = now;
  project.updatedAt = now;
  const validated = validateTimelineDocument(timeline);
  if (!validated.valid) {
    const e = new Error(`INVALID_INPUT: ${validated.errors.join("; ")}`);
    e.code = "INVALID_INPUT";
    throw e;
  }

  persistProjectAndTimeline(found, project, validated.normalized);
  return validated.normalized.nodes.find((n) => n.id === nodeId);
}

function deleteNode(projectsRoot, projectId, nodeId) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const project = { ...found.project };
  const timeline = { ...found.timeline, nodes: Array.isArray(found.timeline.nodes) ? [...found.timeline.nodes] : [] };
  const before = timeline.nodes.length;
  timeline.nodes = timeline.nodes.filter((n) => n.id !== nodeId);
  if (timeline.nodes.length === before) {
    const e = new Error("NODE_NOT_FOUND");
    e.code = "NODE_NOT_FOUND";
    throw e;
  }

  const now = nowIso();
  timeline.updatedAt = now;
  project.updatedAt = now;
  const validated = validateTimelineDocument(timeline);
  if (!validated.valid) {
    const e = new Error(`INVALID_INPUT: ${validated.errors.join("; ")}`);
    e.code = "INVALID_INPUT";
    throw e;
  }

  persistProjectAndTimeline(found, project, validated.normalized);
  return true;
}

function reorderNodes(projectsRoot, projectId, orderedNodeIds) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const project = { ...found.project };
  const timeline = { ...found.timeline, nodes: Array.isArray(found.timeline.nodes) ? [...found.timeline.nodes] : [] };
  if (!Array.isArray(orderedNodeIds)) {
    const e = new Error("INVALID_INPUT");
    e.code = "INVALID_INPUT";
    throw e;
  }

  const byId = new Map(timeline.nodes.map((n) => [n.id, n]));
  const used = new Set();
  const reordered = [];

  for (const id of orderedNodeIds) {
    if (typeof id !== "string") continue;
    const node = byId.get(id);
    if (!node) continue;
    used.add(id);
    reordered.push(node);
  }

  const remained = sortNodesByTimestamp(
    timeline.nodes.filter((n) => !used.has(n.id))
  );

  timeline.nodes = [...reordered, ...remained];
  timeline.updatedAt = nowIso();
  project.updatedAt = timeline.updatedAt;

  const validated = validateTimelineDocument(timeline);
  if (!validated.valid) {
    const e = new Error(`INVALID_INPUT: ${validated.errors.join("; ")}`);
    e.code = "INVALID_INPUT";
    throw e;
  }

  persistProjectAndTimeline(found, project, validated.normalized);
  return validated.normalized.nodes;
}

function uploadAssetBase64(projectsRoot, projectId, input) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const project = { ...found.project };
  const timeline = {
    ...found.timeline,
    meta: {
      ...(found.timeline.meta || {}),
      assets: Array.isArray(found.timeline?.meta?.assets)
        ? [...found.timeline.meta.assets]
        : []
    }
  };
  const assetsDir = path.join(found.project.storagePath, "assets");
  ensureDir(assetsDir);

  const contentBase64 = String(input.contentBase64 || "").trim();
  if (!contentBase64) {
    const e = new Error("INVALID_INPUT: contentBase64 不能为空");
    e.code = "INVALID_INPUT";
    throw e;
  }

  let fileBuffer;
  try {
    fileBuffer = Buffer.from(contentBase64, "base64");
  } catch (_) {
    const e = new Error("INVALID_INPUT: contentBase64 非法");
    e.code = "INVALID_INPUT";
    throw e;
  }
  if (!fileBuffer || !fileBuffer.length) {
    const e = new Error("INVALID_INPUT: 上传内容为空");
    e.code = "INVALID_INPUT";
    throw e;
  }

  const originName = safeFileBaseName(input.filename || "file.bin");
  const ext = path.extname(originName);
  const kind = input.kind || guessKindByExt(ext);
  const assetId = uniqueId("asset");
  const finalName = `${assetId}${ext || ""}`;
  const fullPath = path.join(assetsDir, finalName);

  fs.writeFileSync(fullPath, fileBuffer);
  const asset = {
    id: assetId,
    kind,
    src: `./assets/${finalName}`,
    sizeBytes: fileBuffer.length,
    originalName: originName
  };

  timeline.meta.assets.push(asset);
  const now = nowIso();
  timeline.updatedAt = now;
  project.updatedAt = now;
  const validated = validateTimelineDocument(timeline);
  if (!validated.valid) {
    const e = new Error(`INVALID_INPUT: ${validated.errors.join("; ")}`);
    e.code = "INVALID_INPUT";
    throw e;
  }
  persistProjectAndTimeline(found, project, validated.normalized);
  return asset;
}

function listProjectAssets(projectsRoot, projectId) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const refs = collectReferencedAssetRefs(found.timeline);
  let assets = Array.isArray(found.timeline?.meta?.assets) ? found.timeline.meta.assets : [];
  if (!assets.length) {
    const assetsDir = path.join(found.project.storagePath, "assets");
    ensureDir(assetsDir);
    const files = fs.readdirSync(assetsDir).filter((name) => !name.startsWith("."));
    assets = files.map((name) => {
      const ext = path.extname(name);
      const stat = fs.statSync(path.join(assetsDir, name));
      return {
        id: path.basename(name, ext),
        kind: guessKindByExt(ext),
        src: `./assets/${name}`,
        sizeBytes: stat.size,
        fileName: name
      };
    });
  }
  const mapped = assets
    .map((asset) => ({
      ...asset,
      inUse: refs.has(`id:${asset.id}`) || refs.has(asset.src),
      fileName: path.basename(asset.src || "")
    }))
    .sort((a, b) => (a.fileName || "").localeCompare(b.fileName || ""));
  return mapped;
}

function deleteAsset(projectsRoot, projectId, assetId, options) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const project = { ...found.project };
  const timeline = {
    ...found.timeline,
    meta: {
      ...(found.timeline.meta || {}),
      assets: Array.isArray(found.timeline?.meta?.assets)
        ? [...found.timeline.meta.assets]
        : []
    },
    nodes: Array.isArray(found.timeline?.nodes) ? [...found.timeline.nodes] : []
  };
  const assetsDir = path.join(found.project.storagePath, "assets");
  ensureDir(assetsDir);
  const targetAsset = timeline.meta.assets.find((a) => a.id === assetId);
  if (!targetAsset) {
    const e = new Error("ASSET_NOT_FOUND");
    e.code = "ASSET_NOT_FOUND";
    throw e;
  }
  const src = targetAsset.src;
  const refs = collectReferencedAssetRefs(found.timeline);
  const inUse = refs.has(`id:${assetId}`) || refs.has(src);
  if (inUse && !options?.force) {
    const e = new Error("ASSET_IN_USE");
    e.code = "ASSET_IN_USE";
    throw e;
  }

  timeline.meta.assets = timeline.meta.assets.filter((a) => a.id !== assetId);
  if (options?.force) {
    timeline.nodes = timeline.nodes.map((node) => ({
      ...node,
      media: Array.isArray(node.media)
        ? node.media.filter((m) => m.assetId !== assetId && m.src !== src)
        : []
    }));
  }

  const filePath = path.join(found.project.storagePath, src.replace("./", ""));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  const now = nowIso();
  timeline.updatedAt = now;
  project.updatedAt = now;
  const validated = validateTimelineDocument(timeline);
  if (!validated.valid) {
    const e = new Error(`INVALID_INPUT: ${validated.errors.join("; ")}`);
    e.code = "INVALID_INPUT";
    throw e;
  }
  persistProjectAndTimeline(found, project, validated.normalized);
  return { success: true, deleted: src, forced: Boolean(options?.force) };
}

module.exports = {
  createProjectSkeleton,
  listProjects,
  getProjectById,
  updateProjectMeta,
  createNode,
  updateNode,
  deleteNode,
  reorderNodes,
  uploadAssetBase64,
  deleteAsset,
  listProjectAssets
};
