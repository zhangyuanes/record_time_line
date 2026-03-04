const {
  TIMELINE_DOCUMENT_VERSION,
  NODE_TYPES,
  NODE_LAYOUTS,
  MOTION_LEVELS
} = require("./constants");
const { nowIso } = require("./timeline");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  return !Number.isNaN(Date.parse(value));
}

function isRelativeAssetPath(value) {
  if (typeof value !== "string") return false;
  if (!value.startsWith("./assets/")) return false;
  if (value.includes("..")) return false;
  return true;
}

function isSafeHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function validateThemeConfig(themeConfig, errors, pathPrefix) {
  if (!isObject(themeConfig)) {
    errors.push(`${pathPrefix} 必须是对象`);
    return;
  }
  if (themeConfig.themeId !== undefined && typeof themeConfig.themeId !== "string") {
    errors.push(`${pathPrefix}.themeId 必须是字符串`);
  }
  if (
    themeConfig.motionLevel !== undefined &&
    !MOTION_LEVELS.includes(themeConfig.motionLevel)
  ) {
    errors.push(`${pathPrefix}.motionLevel 必须是 low|medium|high`);
  }
}

function validateMedia(media, errors, pathPrefix) {
  if (!Array.isArray(media)) {
    errors.push(`${pathPrefix} 必须是数组`);
    return;
  }
  media.forEach((item, idx) => {
    const p = `${pathPrefix}[${idx}]`;
    if (!isObject(item)) {
      errors.push(`${p} 必须是对象`);
      return;
    }
    if (item.assetId !== undefined && typeof item.assetId !== "string") {
      errors.push(`${p}.assetId 必须是字符串`);
    }
    if (item.src !== undefined && !isRelativeAssetPath(item.src)) {
      errors.push(`${p}.src 必须是相对资源路径，且以 ./assets/ 开头`);
    }
    if (item.assetId === undefined && item.src === undefined) {
      errors.push(`${p} 至少需要 assetId 或 src`);
    }
    if (item.thumbnail !== undefined && !isRelativeAssetPath(item.thumbnail)) {
      errors.push(`${p}.thumbnail 必须是相对资源路径，且以 ./assets/ 开头`);
    }
    if (item.width !== undefined && (!Number.isInteger(item.width) || item.width <= 0)) {
      errors.push(`${p}.width 必须是正整数`);
    }
    if (item.height !== undefined && (!Number.isInteger(item.height) || item.height <= 0)) {
      errors.push(`${p}.height 必须是正整数`);
    }
  });
}

function validateAssetLibrary(assets, errors, pathPrefix) {
  if (!Array.isArray(assets)) {
    errors.push(`${pathPrefix} 必须是数组`);
    return;
  }
  assets.forEach((asset, idx) => {
    const p = `${pathPrefix}[${idx}]`;
    if (!isObject(asset)) {
      errors.push(`${p} 必须是对象`);
      return;
    }
    if (typeof asset.id !== "string" || !asset.id) {
      errors.push(`${p}.id 必须是非空字符串`);
    }
    if (!["image", "video", "audio"].includes(asset.kind)) {
      errors.push(`${p}.kind 必须是 image|video|audio`);
    }
    if (!isRelativeAssetPath(asset.src)) {
      errors.push(`${p}.src 必须是相对资源路径，且以 ./assets/ 开头`);
    }
  });
}

function validateNode(node, index, errors) {
  const p = `nodes[${index}]`;
  if (!isObject(node)) {
    errors.push(`${p} 必须是对象`);
    return;
  }

  if (typeof node.id !== "string" || !node.id) {
    errors.push(`${p}.id 必须是非空字符串`);
  }
  if (!isIsoDate(node.timestamp)) {
    errors.push(`${p}.timestamp 必须是 ISO 日期字符串`);
  }
  if (typeof node.title !== "string" || node.title.length < 1 || node.title.length > 120) {
    errors.push(`${p}.title 长度必须在 1-120 之间`);
  }
  if (node.type !== undefined && !NODE_TYPES.includes(node.type)) {
    errors.push(`${p}.type 必须是 ${NODE_TYPES.join("|")}`);
  }
  if (node.layout !== undefined && !NODE_LAYOUTS.includes(node.layout)) {
    errors.push(`${p}.layout 必须是 ${NODE_LAYOUTS.join("|")}`);
  }
  if (node.link !== undefined) {
    if (!isObject(node.link)) {
      errors.push(`${p}.link 必须是对象`);
    } else if (!isSafeHttpUrl(node.link.url)) {
      errors.push(`${p}.link.url 必须是 http/https URL`);
    }
  }
  if (node.media !== undefined) {
    validateMedia(node.media, errors, `${p}.media`);
  }
  if (!isIsoDate(node.createdAt) || !isIsoDate(node.updatedAt)) {
    errors.push(`${p}.createdAt/updatedAt 必须是 ISO 日期字符串`);
  }
}

function migrateTimelineDocument(rawInput) {
  const now = nowIso();
  const raw = isObject(rawInput) ? { ...rawInput } : {};
  const meta = isObject(raw.meta) ? { ...raw.meta } : {};
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];

  const migrated = {
    version: TIMELINE_DOCUMENT_VERSION,
    meta: {
      projectId: typeof meta.projectId === "string" ? meta.projectId : "unknown_project",
      title: typeof meta.title === "string" && meta.title ? meta.title : "未命名时间线",
      description: typeof meta.description === "string" ? meta.description : "",
      coverImage: meta.coverImage,
      music: meta.music,
      assets: Array.isArray(meta.assets) ? meta.assets : [],
      themeConfig: isObject(meta.themeConfig) ? meta.themeConfig : { themeId: "minimal-list", motionLevel: "medium" }
    },
    nodes: nodes.map((n, idx) => {
      const node = isObject(n) ? n : {};
      const nodeNow = nowIso();
      return {
        id: typeof node.id === "string" && node.id ? node.id : `node_${idx + 1}`,
        timestamp: typeof node.timestamp === "string" ? node.timestamp : nodeNow,
        displayDateOverride:
          typeof node.displayDateOverride === "string" ? node.displayDateOverride : undefined,
        title: typeof node.title === "string" && node.title ? node.title : "未命名节点",
        body: typeof node.body === "string" ? node.body : "",
        type: NODE_TYPES.includes(node.type) ? node.type : "standard",
        layout: NODE_LAYOUTS.includes(node.layout) ? node.layout : "left",
        highlight: Boolean(node.highlight),
        media: Array.isArray(node.media) ? node.media : [],
        link: isObject(node.link) ? node.link : undefined,
        createdAt: isIsoDate(node.createdAt) ? node.createdAt : nodeNow,
        updatedAt: isIsoDate(node.updatedAt) ? node.updatedAt : nodeNow
      };
    }),
    createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : now,
    updatedAt: now
  };

  return migrated;
}

function validateTimelineDocument(input) {
  const errors = [];
  const doc = migrateTimelineDocument(input);

  if (doc.version !== TIMELINE_DOCUMENT_VERSION) {
    errors.push(`version 必须是 ${TIMELINE_DOCUMENT_VERSION}`);
  }
  if (!isObject(doc.meta)) {
    errors.push("meta 必须是对象");
  } else {
    if (typeof doc.meta.projectId !== "string" || !doc.meta.projectId) {
      errors.push("meta.projectId 必须是非空字符串");
    }
    if (typeof doc.meta.title !== "string" || !doc.meta.title) {
      errors.push("meta.title 必须是非空字符串");
    }
    validateThemeConfig(doc.meta.themeConfig, errors, "meta.themeConfig");

    if (doc.meta.coverImage !== undefined && !isRelativeAssetPath(doc.meta.coverImage)) {
      errors.push("meta.coverImage 必须是相对资源路径，且以 ./assets/ 开头");
    }
    if (doc.meta.music !== undefined) {
      if (!isObject(doc.meta.music)) {
        errors.push("meta.music 必须是对象");
      } else if (!isRelativeAssetPath(doc.meta.music.src || "")) {
        errors.push("meta.music.src 必须是相对资源路径，且以 ./assets/ 开头");
      }
    }
    if (doc.meta.assets !== undefined) {
      validateAssetLibrary(doc.meta.assets, errors, "meta.assets");
    }
  }

  if (!Array.isArray(doc.nodes)) {
    errors.push("nodes 必须是数组");
  } else {
    doc.nodes.forEach((node, idx) => validateNode(node, idx, errors));
  }

  if (!isIsoDate(doc.createdAt) || !isIsoDate(doc.updatedAt)) {
    errors.push("createdAt/updatedAt 必须是 ISO 日期字符串");
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized: doc
  };
}

module.exports = {
  migrateTimelineDocument,
  validateTimelineDocument
};
