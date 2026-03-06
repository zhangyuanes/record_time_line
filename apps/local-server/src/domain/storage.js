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
  return "file";
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

function addAssetObject(projectsRoot, projectId, input) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const project = { ...found.project };
  const timeline = {
    ...found.timeline,
    meta: {
      ...(found.timeline.meta || {}),
      assets: Array.isArray(found.timeline?.meta?.assets) ? [...found.timeline.meta.assets] : []
    }
  };

  const raw = input && typeof input === "object" ? input : {};
  const kind = raw.kind;
  const src = raw.src;
  if (!["image", "video", "audio", "file"].includes(kind)) {
    const e = new Error("INVALID_INPUT: kind 必须是 image|video|audio|file");
    e.code = "INVALID_INPUT";
    throw e;
  }
  if (typeof src !== "string" || !src.startsWith("./assets/") || src.includes("..")) {
    const e = new Error("INVALID_INPUT: src 必须以 ./assets/ 开头且不包含 ..");
    e.code = "INVALID_INPUT";
    throw e;
  }

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : uniqueId("asset");
  if (timeline.meta.assets.some((a) => a.id === id)) {
    const e = new Error("INVALID_INPUT: asset id 已存在");
    e.code = "INVALID_INPUT";
    throw e;
  }

  const asset = {
    id,
    kind,
    src,
    originalName: typeof raw.originalName === "string" ? raw.originalName : path.basename(src)
  };
  if (typeof raw.thumbnail === "string") asset.thumbnail = raw.thumbnail;
  if (Number.isInteger(raw.width) && raw.width > 0) asset.width = raw.width;
  if (Number.isInteger(raw.height) && raw.height > 0) asset.height = raw.height;
  if (typeof raw.duration === "number" && raw.duration >= 0) asset.duration = raw.duration;
  if (Number.isInteger(raw.sizeBytes) && raw.sizeBytes >= 0) asset.sizeBytes = raw.sizeBytes;

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

function stripTimelineMetadataForExport(inputTimeline) {
  const timeline = JSON.parse(JSON.stringify(inputTimeline || {}));
  delete timeline.createdAt;
  delete timeline.updatedAt;
  if (Array.isArray(timeline?.nodes)) {
    timeline.nodes = timeline.nodes.map((node) => {
      const next = { ...node };
      delete next.createdAt;
      delete next.updatedAt;
      return next;
    });
  }
  if (Array.isArray(timeline?.meta?.assets)) {
    timeline.meta.assets = timeline.meta.assets.map((asset) => {
      const next = { ...asset };
      delete next.sizeBytes;
      delete next.originalName;
      delete next.fileName;
      return next;
    });
  }
  return timeline;
}

function buildExportRunnerHtml(options) {
  const title = String(options?.title || "Chronos Canvas 导出预览");
  const passwordHash = options?.passwordHash || "";
  const exportedDocLiteral = JSON.stringify(options?.timeline || {})
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</title>
    <style>
      :root { color-scheme: dark; --bg:#1a100c; --line:#503122; --text:#f4efe9; --muted:#c5ab97; --accent:#ec5b13; --gold:#d4af37; }
      * { box-sizing:border-box; }
      body { margin:0; background:linear-gradient(180deg,#23140e,#1a100c); color:var(--text); font-family: Inter, "PingFang SC", sans-serif; }
      .top { position:sticky; top:0; z-index:10; display:flex; justify-content:space-between; align-items:center; padding:14px 18px; border-bottom:1px solid rgba(255,255,255,.08); background:rgba(26,16,12,.86); backdrop-filter: blur(8px);}
      .title { font-size:18px; font-weight:700; letter-spacing:.03em; }
      .meta { color:var(--muted); font-size:12px; }
      .wrap { max-width:1240px; margin:0 auto; padding:28px 126px 90px 18px; position:relative; }
      .line { position:absolute; top:0; bottom:0; left:calc(50% - 54px); width:2px; transform:translateX(-1px); background:linear-gradient(180deg,transparent,var(--gold) 14%, var(--accent) 55%, transparent);}
      .hero { text-align:center; padding:20px 0 36px; }
      .hero h1 { margin:10px 0 8px; font-size:52px; font-family:"Noto Serif SC", serif; }
      .hero p { margin:0; color:var(--muted); }
      .node { --node-w:min(620px, calc(50% - 40px)); position:relative; width:var(--node-w); min-width:460px; margin:0 0 28px 0; border:1px solid rgba(255,255,255,.1); border-radius:16px; padding:14px; background:rgba(17,12,9,.58); transition: transform .24s ease, border-color .24s ease, box-shadow .24s ease; scroll-margin-top: 84px; }
      .node:hover { transform: translateY(-3px); border-color: rgba(212,175,55,.68); box-shadow: 0 16px 28px rgba(0,0,0,.32); }
      .node.is-active { border-color: rgba(236,91,19,.88); box-shadow: 0 0 0 1px rgba(236,91,19,.45), 0 16px 28px rgba(0,0,0,.34); }
      .node::before { content:""; position:absolute; top:24px; width:11px; height:11px; border-radius:999px; background:var(--gold); box-shadow:0 0 0 4px rgba(212,175,55,.2), 0 0 18px rgba(212,175,55,.55); }
      .node.left { margin-right: calc(50% + 28px); }
      .node.right { margin-left: calc(50% + 28px); }
      .node.left::before { right:-34px; }
      .node.right::before { left:-34px; }
      .node.rhythm-a { margin-bottom: 36px; }
      .node.rhythm-b { margin-top: 20px; margin-bottom: 40px; }
      .node.rhythm-c { margin-top: 8px; margin-bottom: 30px; }
      .node.type-gallery { --node-w:min(620px, calc(50% - 36px)); }
      .node.type-gallery h3 { color:#f8ddb1; }
      .node.type-gallery .body { text-align:center; margin-left:auto; margin-right:auto; max-width:560px; }
      .node.type-gallery .media { justify-content:center; }
      .node.type-gallery .card { width:min(260px,100%); }
      .node.type-quote { --node-w:min(430px, calc(50% - 92px)); border-left:3px solid rgba(212,175,55,.9); background:linear-gradient(150deg, rgba(212,175,55,.1), rgba(27,21,16,.8)); }
      .node.type-quote .body { font-family:"Noto Serif SC", serif; font-size:28px; line-height:1.5; color:#f6f2ea; }
      .node.type-quote .body p::before { content:"“"; color:var(--gold); margin-right:2px; }
      .node.type-quote .body p::after { content:"”"; color:var(--gold); margin-left:2px; }
      .node.type-video { --node-w:min(580px, calc(50% - 48px)); }
      .node.type-video .card { width:100%; }
      .node.media-0 { --node-w:min(450px, calc(50% - 104px)); }
      .node.media-1 { --node-w:min(510px, calc(50% - 78px)); }
      .node.media-2,.node.media-3 { --node-w:min(680px, calc(50% - 24px)); min-width:500px; }
      .node.center::before { left:50%; transform:translateX(-50%); top:-17px; }
      .node h3 { margin:8px 0; font-size:34px; font-family:"Noto Serif SC", serif; }
      .node .date { color:var(--gold); font-size:12px; letter-spacing:.08em; text-transform:uppercase; }
      .body { color:#e8ddcf; line-height:1.75; }
      .body p { margin:8px 0; }
      .body h2,.body h3,.body h4 { margin:10px 0 6px; color:#f5ede3; font-family:"Noto Serif SC", serif; }
      .body ul,.body ol { margin:8px 0; padding-left:20px; }
      .body blockquote { margin:10px 0; padding:8px 10px; border-left:3px solid rgba(212,175,55,.8); background:rgba(212,175,55,.08); border-radius:8px; color:#f1e7d7; }
      .body code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(255,255,255,.08); border-radius: 6px; padding: 1px 4px; }
      .body pre { margin:10px 0; background:#0d1015; border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:10px 12px; overflow:auto; }
      .body pre code { background: transparent; padding: 0; }
      .body a { color:#ffd7b2; text-decoration: underline; }
      .media { margin-top:10px; display:grid; grid-template-columns:minmax(0,1fr); gap:8px; }
      .media.two-col { grid-template-columns:repeat(2, minmax(0,1fr)); }
      .card { width:100%; border-radius:12px; overflow:hidden; border:1px solid rgba(212,175,55,.25); background:#0f0f12; }
      .card img, .card video { width:100%; height:140px; object-fit:cover; display:block; }
      .card audio { width:100%; padding:10px; }
      .img-trigger { width:100%; border:0; padding:0; cursor:zoom-in; display:block; background:transparent; }
      .file { display:flex; align-items:center; gap:10px; text-decoration:none; color:#f2eadf; padding:12px; }
      .icon { width:40px; height:40px; border-radius:8px; border:1px solid rgba(255,255,255,.2); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; letter-spacing:.03em; }
      .icon.pdf { color:#fee2e2; background:#4a1515; border-color:#a53535; }
      .icon.doc { color:#dbeafe; background:#152e59; border-color:#2f67cb; }
      .icon.xls { color:#dcfce7; background:#143826; border-color:#2e8b57; }
      .icon.ppt { color:#ffedd5; background:#4b240d; border-color:#b75a24; }
      .icon.xml { color:#f3e8ff; background:#3a1d54; border-color:#7642b4; }
      .icon.zip { color:#fef3c7; background:#49340f; border-color:#b28724; }
      .icon.txt { color:#e5e7eb; background:#2a3341; border-color:#4b5563; }
      .link { margin-top:10px; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border:1px solid rgba(255,255,255,.1); border-radius:12px; text-decoration:none; color:#f4efe9; background:linear-gradient(130deg,rgba(255,255,255,.03),rgba(255,255,255,.01)); transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease; }
      .link:hover { transform: translateY(-2px); border-color: rgba(212,175,55,.68); box-shadow: 0 12px 20px rgba(0,0,0,.24); }
      .quote .body { font-family:"Noto Serif SC", serif; font-size:30px; line-height:1.55; color:#f9f5ef; }
      .empty { text-align:center; color:var(--muted); padding:40px 0; }
      .quick-nav { position:fixed; right:18px; top:50%; transform:translateY(-50%); z-index:20; width:84px; max-height:calc(100vh - 120px); overflow:auto; padding:8px 6px; border:1px solid rgba(255,255,255,.16); border-radius:12px; background:rgba(21,14,11,.72); backdrop-filter: blur(6px); }
      .q-item { position:relative; width:100%; display:flex; justify-content:center; align-items:center; background:transparent; border:0; padding:6px 0; cursor:pointer; color:#f4efe9; }
      .q-dot { width:10px; height:10px; border-radius:999px; border:1px solid rgba(255,255,255,.55); background:rgba(255,255,255,.28); box-shadow:0 0 0 3px rgba(255,255,255,.06); transition: background .2s ease, border-color .2s ease, transform .2s ease, box-shadow .2s ease; }
      .q-item:hover .q-dot,.q-item.active .q-dot { background:var(--accent); border-color:#ffb07f; transform:scale(1.08); box-shadow:0 0 0 4px rgba(236,91,19,.22); }
      .q-tip { position:absolute; right:100%; margin-right:10px; top:50%; transform:translateY(-50%); white-space:nowrap; padding:4px 8px; border-radius:8px; border:1px solid rgba(255,255,255,.18); background:rgba(13,9,7,.92); color:#f7efe4; font-size:11px; opacity:0; pointer-events:none; transition:opacity .18s ease; }
      .q-item:hover .q-tip,.q-item.active .q-tip { opacity:1; }
      .lightbox { position:fixed; inset:0; z-index:40; display:none; align-items:center; justify-content:center; background:rgba(8,6,5,.9); backdrop-filter: blur(4px); padding:24px; }
      .lightbox.open { display:flex; }
      .lightbox img { max-width:min(1320px, calc(100vw - 60px)); max-height:calc(100vh - 80px); border-radius:12px; border:1px solid rgba(255,255,255,.22); box-shadow:0 24px 44px rgba(0,0,0,.5); }
      .lightbox-close { position:absolute; top:14px; right:18px; width:36px; height:36px; border-radius:999px; border:1px solid rgba(255,255,255,.3); background:rgba(0,0,0,.35); color:#fff; font-size:24px; cursor:pointer; line-height:1; }
      .lock-mask { position:fixed; inset:0; z-index:30; display:none; align-items:center; justify-content:center; background:rgba(10,7,6,.88); backdrop-filter: blur(8px); }
      .lock-card { width:min(420px, calc(100vw - 20px)); border:1px solid rgba(212,175,55,.35); border-radius:14px; background:rgba(25,17,13,.96); padding:16px; }
      .lock-title { font-size:24px; margin:0 0 6px; font-family:"Noto Serif SC", serif; }
      .lock-tip { color:var(--muted); font-size:13px; margin:0 0 12px; }
      .lock-input { width:100%; border:1px solid #6a4a35; border-radius:10px; background:#130f0c; color:#f7efe5; padding:10px; }
      .lock-btn { margin-top:10px; width:100%; border:none; border-radius:10px; padding:10px; cursor:pointer; background:linear-gradient(180deg,#ff782e,#ec5b13); color:#fff; font-weight:700; }
      .lock-err { margin-top:8px; color:#ffb4a1; font-size:12px; min-height:16px; }
      @media (max-width:900px){ .wrap{padding-right:18px;} .quick-nav{display:none;} .line{left:24px; transform:none;} .node{margin-left:44px !important; width:calc(100% - 44px); min-width:0;} .media.two-col{grid-template-columns:minmax(0,1fr);} .node::before{left:-26px !important; right:auto !important; transform:none !important; top:22px !important;} .hero h1{font-size:38px;} .node h3{font-size:28px;} }
    </style>
  </head>
  <body>
    <header class="top">
      <div class="title">Chronos Canvas</div>
      <div class="meta" id="meta"></div>
    </header>
    <main class="wrap">
      <div class="line"></div>
      <section class="hero">
        <div class="meta" id="hero-date"></div>
        <h1 id="hero-title">时间线</h1>
        <p id="hero-desc"></p>
      </section>
      <section id="timeline"></section>
    </main>
    <aside class="quick-nav" id="quick-nav"></aside>
    <div class="lightbox" id="lightbox">
      <button class="lightbox-close" id="lightbox-close" type="button" aria-label="关闭大图">×</button>
      <img id="lightbox-img" src="" alt="" />
    </div>
    <div class="lock-mask" id="lock-mask">
      <div class="lock-card">
        <h2 class="lock-title">输入访问密码</h2>
        <p class="lock-tip">该导出包已启用密码保护，请输入口令继续浏览。</p>
        <input class="lock-input" id="lock-input" type="password" placeholder="请输入密码" />
        <button class="lock-btn" id="lock-btn">解锁时间线</button>
        <div class="lock-err" id="lock-err"></div>
      </div>
    </div>
    <script>
      const PASSWORD_HASH = "${passwordHash}";
      const EXPORTED_DOC = ${exportedDocLiteral};
      function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
      function escAttr(s){return esc(s).replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
      function hashSha256(text){const data=new TextEncoder().encode(text);return crypto.subtle.digest("SHA-256",data).then(buf=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("")); }
      function fileIcon(name){const n=String(name||"").toLowerCase();if(n.endsWith(".pdf"))return "PDF";if(n.endsWith(".doc")||n.endsWith(".docx"))return "DOC";if(n.endsWith(".xls")||n.endsWith(".xlsx"))return "XLS";if(n.endsWith(".ppt")||n.endsWith(".pptx"))return "PPT";if(n.endsWith(".xml"))return "XML";if(n.endsWith(".zip")||n.endsWith(".7z")||n.endsWith(".rar"))return "ZIP";if(n.endsWith(".txt")||n.endsWith(".csv")||n.endsWith(".json"))return "TXT";return "FILE";}
      function fileIconClass(name){const n=String(name||"").toLowerCase();if(n.endsWith(".pdf"))return "pdf";if(n.endsWith(".doc")||n.endsWith(".docx"))return "doc";if(n.endsWith(".xls")||n.endsWith(".xlsx"))return "xls";if(n.endsWith(".ppt")||n.endsWith(".pptx"))return "ppt";if(n.endsWith(".xml"))return "xml";if(n.endsWith(".zip")||n.endsWith(".7z")||n.endsWith(".rar"))return "zip";if(n.endsWith(".txt")||n.endsWith(".csv")||n.endsWith(".json"))return "txt";return "txt";}
      function md(input){
        const raw = String(input||"").replace(/\\r\\n/g,"\\n");
        if(!raw.trim()) return "";
        const tick = String.fromCharCode(96);
        const fenceMark = tick + tick + tick;
        const lines = raw.split("\\n");
        const out = [];
        let listType = "";
        let quoteBuf = [];
        let inCode = false;
        let codeBuf = [];
        function closeList(){ if(!listType) return; out.push(listType==="ol"?"</ol>":"</ul>"); listType=""; }
        function flushQuote(){ if(!quoteBuf.length) return; out.push("<blockquote>"+quoteBuf.map(q=>"<p>"+inlineMd(q)+"</p>").join("")+"</blockquote>"); quoteBuf=[]; }
        function flushCode(){ if(!inCode) return; out.push("<pre><code>"+esc(codeBuf.join("\\n"))+"</code></pre>"); inCode=false; codeBuf=[]; }
        for(const line of lines){
          const t = line.trim();
          if(t.startsWith(fenceMark)){ flushQuote(); closeList(); if(inCode) flushCode(); else { inCode=true; codeBuf=[]; } continue; }
          if(inCode){ codeBuf.push(line); continue; }
          if(/^>\\s?/.test(t)){ closeList(); quoteBuf.push(t.replace(/^>\\s?/,"")); continue; } else { flushQuote(); }
          if(!t){ closeList(); continue; }
          if(/^[-*]\\s+/.test(t) || /^\\d+\\.\\s+/.test(t)){
            const next = /^\\d+\\.\\s+/.test(t) ? "ol" : "ul";
            if(listType && listType !== next) closeList();
            if(!listType){ out.push(next==="ol"?"<ol>":"<ul>"); listType=next; }
            const item = next==="ol" ? t.replace(/^\\d+\\.\\s+/,"") : t.replace(/^[-*]\\s+/,"");
            out.push("<li>"+inlineMd(item)+"</li>");
            continue;
          }
          closeList();
          if(/^###\\s+/.test(t)) out.push("<h4>"+inlineMd(t.replace(/^###\\s+/,""))+"</h4>");
          else if(/^##\\s+/.test(t)) out.push("<h3>"+inlineMd(t.replace(/^##\\s+/,""))+"</h3>");
          else if(/^#\\s+/.test(t)) out.push("<h2>"+inlineMd(t.replace(/^#\\s+/,""))+"</h2>");
          else out.push("<p>"+inlineMd(t)+"</p>");
        }
        flushQuote(); closeList(); flushCode();
        return out.join("");
      }
      function inlineMd(s){ const tick=String.fromCharCode(96); let x=esc(s); x=x.replace(new RegExp(tick+"([^"+tick+"]+)"+tick,"g"),"<code>$1</code>"); x=x.replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>"); x=x.replace(/\\*([^*]+)\\*/g,"<em>$1</em>"); x=x.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)/g,'<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>'); return x; }
      function kindFrom(item, assets){if(item.assetId && assets[item.assetId]) return assets[item.assetId].kind || "image"; const s=String(item.src||"").toLowerCase(); if(/\\.(mp4|mov|webm|mkv)$/.test(s))return "video"; if(/\\.(mp3|wav|m4a|ogg)$/.test(s))return "audio"; if(/\\.(pdf|xml|ppt|pptx|doc|docx|xls|xlsx|txt|csv|json|zip|7z|rar)$/.test(s))return "file"; return "image";}
      function bindLightbox(){
        const root = document.getElementById("timeline");
        const box = document.getElementById("lightbox");
        const img = document.getElementById("lightbox-img");
        const closeBtn = document.getElementById("lightbox-close");
        if(!root || !box || !img || !closeBtn) return;
        const close = ()=> box.classList.remove("open");
        root.addEventListener("click",(e)=>{
          const trigger = e.target.closest("[data-preview-src]");
          if(!trigger) return;
          img.src = trigger.getAttribute("data-preview-src") || "";
          img.alt = trigger.getAttribute("data-preview-alt") || "";
          box.classList.add("open");
        });
        closeBtn.addEventListener("click", close);
        box.addEventListener("click", (e)=>{ if(e.target === box) close(); });
        document.addEventListener("keydown", (e)=>{ if(e.key === "Escape") close(); });
      }
      function bindQuickNav(nodes){
        const nav = document.getElementById("quick-nav");
        if(!nav) return;
        if(!nodes.length){ nav.style.display = "none"; return; }
        nav.innerHTML = nodes.map((n, idx)=>{
          const date = n.displayDateOverride || new Date(n.timestamp||Date.now()).toLocaleString();
          return "<button class='q-item' type='button' data-node-index='"+idx+"'><span class='q-dot'></span><span class='q-tip'>"+esc(date)+"</span></button>";
        }).join("");
        const allNodes = ()=>Array.from(document.querySelectorAll("#timeline .node"));
        function clearActive(){
          allNodes().forEach((el)=>el.classList.remove("is-active"));
          nav.querySelectorAll(".q-item").forEach((el)=>el.classList.remove("active"));
        }
        nav.addEventListener("click", (e)=>{
          const item = e.target.closest(".q-item");
          if(!item) return;
          const idx = Number(item.getAttribute("data-node-index"));
          const target = document.getElementById("node-" + idx);
          if(!target) return;
          clearActive();
          item.classList.add("active");
          target.classList.add("is-active");
          target.scrollIntoView({ behavior:"smooth", block:"center" });
        });
        nav.addEventListener("mouseover", (e)=>{
          const item = e.target.closest(".q-item");
          if(!item) return;
          const idx = Number(item.getAttribute("data-node-index"));
          const target = document.getElementById("node-" + idx);
          if(!target) return;
          clearActive();
          item.classList.add("active");
          target.classList.add("is-active");
        });
        nav.addEventListener("mouseout", (e)=>{
          const item = e.target.closest(".q-item");
          if(!item) return;
          clearActive();
        });
      }
      function ensureUnlocked(){
        if(!PASSWORD_HASH) return Promise.resolve(true);
        const mask = document.getElementById("lock-mask");
        const input = document.getElementById("lock-input");
        const btn = document.getElementById("lock-btn");
        const err = document.getElementById("lock-err");
        if(!mask || !input || !btn || !err) return Promise.resolve(false);
        mask.style.display = "flex";
        return new Promise((resolve)=>{
          async function tryUnlock(){
            const pwd = String(input.value || "");
            if(!pwd.trim()){ err.textContent = "请输入密码"; return; }
            const hashed = await hashSha256(pwd);
            if(hashed !== PASSWORD_HASH){ err.textContent = "密码错误，请重试"; return; }
            mask.style.display = "none";
            resolve(true);
          }
          btn.addEventListener("click", tryUnlock);
          input.addEventListener("keydown", (e)=>{ if(e.key === "Enter") tryUnlock(); });
          setTimeout(()=>input.focus(), 60);
        });
      }
      async function run(){
        const ok = await ensureUnlocked();
        if(!ok){ document.getElementById("timeline").innerHTML = "<div class='empty'>密码校验失败，无法加载。</div>"; return; }
        const doc = EXPORTED_DOC || {};
        const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
        const assets = {}; (Array.isArray(doc.meta?.assets)?doc.meta.assets:[]).forEach(a=>assets[a.id]=a);
        document.getElementById("meta").textContent = nodes.length + " 个节点";
        document.getElementById("hero-title").textContent = doc.meta?.title || "时间线";
        document.getElementById("hero-desc").textContent = doc.meta?.description || "";
        if(nodes.length){ document.getElementById("hero-date").textContent = new Date(nodes[0].timestamp||Date.now()).toLocaleDateString(); }
        const root = document.getElementById("timeline");
        if(!nodes.length){ root.innerHTML = "<div class='empty'>暂无节点内容</div>"; return; }
        root.innerHTML = nodes.map((n,idx)=>{
          const layout = idx % 2 ? "right" : "left";
          const nodeType = ["standard","gallery","quote","video"].includes(n.type) ? n.type : "standard";
          const rhythm = idx % 3 === 0 ? "rhythm-a" : idx % 3 === 1 ? "rhythm-b" : "rhythm-c";
          const mediaCount = Math.min(3, Math.max(0, Array.isArray(n.media) ? n.media.length : 0));
          const mediaCls = (Array.isArray(n.media) ? n.media.length : 0) >= 2 ? "media two-col" : "media";
          const media = (Array.isArray(n.media)?n.media:[]).map(m=>{
            const asset = m.assetId ? assets[m.assetId] : null;
            const src = asset?.src || m.src || "";
            const name = asset?.originalName || asset?.fileName || m.assetId || src || "文件";
            const kind = kindFrom(m, assets);
            if(kind === "video") return "<div class='card'><video src='"+escAttr(src)+"' controls preload='metadata'></video></div>";
            if(kind === "audio") return "<div class='card'><audio src='"+escAttr(src)+"' controls preload='metadata'></audio></div>";
            if(kind === "file") return "<div class='card'><a class='file' href='"+escAttr(src)+"' target='_blank' rel='noreferrer noopener'><span class='icon "+fileIconClass(name)+"'>"+esc(fileIcon(name))+"</span><span>"+esc(name)+"</span></a></div>";
            return "<div class='card'><button class='img-trigger' type='button' data-preview-src='"+escAttr(src)+"' data-preview-alt='"+escAttr(name)+"'><img src='"+escAttr(src)+"' alt='"+escAttr(name)+"'/></button></div>";
          }).join("");
          const link = n.link?.url ? "<a class='link' href='"+escAttr(n.link.url)+"' target='_blank' rel='noreferrer noopener'><span>"+esc(n.link.text || n.link.url)+"</span><span>open</span></a>" : "";
          return "<article id='node-"+idx+"' class='node "+layout+" type-"+nodeType+" media-"+mediaCount+" "+rhythm+"'><div class='date'>"+esc(n.displayDateOverride || new Date(n.timestamp||Date.now()).toLocaleString())+"</div><h3>"+esc(n.title||"未命名节点")+"</h3><div class='body'>"+(md(n.body||"")||"<p>(无内容)</p>")+"</div>"+(media?"<div class='"+mediaCls+"'>"+media+"</div>":"")+link+"</article>";
        }).join("");
        bindLightbox();
        bindQuickNav(nodes);
      }
      run().catch((e)=>{document.getElementById("timeline").innerHTML="<div class='empty'>加载导出内容失败："+esc(e.message||"未知错误")+"</div>";});
    </script>
  </body>
</html>`;
}

function exportProjectBundle(projectsRoot, projectId, options) {
  const found = ensureProjectExists(projectsRoot, projectId);
  const warnings = [];
  const opts = options && typeof options === "object" ? options : {};

  if (opts.passwordProtect && !opts.password) {
    warnings.push("已启用密码保护，但未提供密码，导出包不设密码。");
  }
  if (opts.losslessAssets === false) {
    warnings.push("资源压缩暂未实现，当前仍以无损方式拷贝原始资产。");
  }
  if (opts.removeMetadata) {
    warnings.push("已按“移除元数据”选项清理时间戳与部分资产技术字段。");
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(
    2,
    "0"
  )}${String(now.getSeconds()).padStart(2, "0")}`;
  const exportRoot = path.join(found.project.storagePath, "exports");
  ensureDir(exportRoot);
  const exportDir = path.join(exportRoot, `bundle_${stamp}_${crypto.randomBytes(2).toString("hex")}`);
  const exportAssetsDir = path.join(exportDir, "assets");
  ensureDir(exportDir);
  ensureDir(exportAssetsDir);

  const timeline = opts.removeMetadata
    ? stripTimelineMetadataForExport(found.timeline)
    : JSON.parse(JSON.stringify(found.timeline || {}));

  const project = {
    id: found.project.id,
    name: found.project.name,
    slug: found.project.slug,
    title: found.project.title,
    description: found.project.description,
    themeConfig: found.project.themeConfig
  };

  const passwordHash =
    opts.passwordProtect && typeof opts.password === "string" && opts.password
      ? crypto.createHash("sha256").update(opts.password).digest("hex")
      : "";

  writeJsonFile(path.join(exportDir, "project.json"), project);
  writeJsonFile(path.join(exportDir, "data.json"), timeline);
  fs.writeFileSync(
    path.join(exportDir, "index.html"),
    buildExportRunnerHtml({ title: timeline?.meta?.title || project.title, passwordHash, timeline }),
    "utf8"
  );

  const sourceAssetsDir = path.join(found.project.storagePath, "assets");
  let copiedAssets = 0;
  if (fs.existsSync(sourceAssetsDir)) {
    const files = fs.readdirSync(sourceAssetsDir).filter((name) => !name.startsWith("."));
    for (const fileName of files) {
      const src = path.join(sourceAssetsDir, fileName);
      const stat = fs.statSync(src);
      if (!stat.isFile()) continue;
      fs.copyFileSync(src, path.join(exportAssetsDir, fileName));
      copiedAssets += 1;
    }
  }

  return {
    exportPath: exportDir,
    warnings,
    copiedAssets,
    nodeCount: Array.isArray(timeline?.nodes) ? timeline.nodes.length : 0
  };
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
  addAssetObject,
  exportProjectBundle,
  deleteAsset,
  listProjectAssets
};
