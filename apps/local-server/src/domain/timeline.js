const crypto = require("crypto");
const {
  TIMELINE_DOCUMENT_VERSION,
  DEFAULT_THEME_CONFIG
} = require("./constants");

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function createTimelineDocument(input) {
  const now = nowIso();
  const projectId = input.projectId || createId("project");

  return {
    version: TIMELINE_DOCUMENT_VERSION,
    meta: {
      projectId,
      title: input.title || input.name || "未命名时间线",
      description: input.description || "",
      themeConfig: {
        ...DEFAULT_THEME_CONFIG,
        ...(input.themeConfig || {})
      }
    },
    nodes: [],
    createdAt: now,
    updatedAt: now
  };
}

function buildProjectMeta(input) {
  const now = nowIso();
  const projectId = input.id || createId("project");

  return {
    id: projectId,
    name: input.name || "未命名项目",
    slug: input.slug || projectId,
    title: input.title || input.name || "未命名项目",
    description: input.description || "",
    createdAt: input.createdAt || now,
    updatedAt: now,
    themeConfig: {
      ...DEFAULT_THEME_CONFIG,
      ...(input.themeConfig || {})
    }
  };
}

module.exports = {
  createTimelineDocument,
  buildProjectMeta,
  nowIso
};
