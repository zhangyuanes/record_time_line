const http = require("http");
const fs = require("fs");
const path = require("path");
const { TIMELINE_DOCUMENT_VERSION } = require("./domain/constants");
const { validateTimelineDocument } = require("./domain/validation");
const {
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
} = require("./domain/storage");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const PROJECTS_ROOT = path.resolve(__dirname, "..", "..", "..", "projects");

function sendJson(res, code, payload) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendError(res, status, code, message) {
  return sendJson(res, status, {
    ok: false,
    error: code,
    message
  });
}

function ensureProjectsRoot() {
  if (!fs.existsSync(PROJECTS_ROOT)) {
    fs.mkdirSync(PROJECTS_ROOT, { recursive: true });
  }
}

function readJsonBody(req) {
  const maxBytes = Number(process.env.MAX_JSON_BODY_BYTES || 30 * 1024 * 1024);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > maxBytes) {
        reject(new Error("BODY_TOO_LARGE"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", () => reject(new Error("READ_BODY_FAILED")));
  });
}

function parseProjectId(pathname) {
  const m = pathname.match(/^\/api\/projects\/([^/]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseNodePath(pathname) {
  const m = pathname.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)$/);
  if (!m) return null;
  return {
    projectId: decodeURIComponent(m[1]),
    nodeId: decodeURIComponent(m[2])
  };
}

function parseReorderPath(pathname) {
  const m = pathname.match(/^\/api\/projects\/([^/]+)\/nodes\/reorder$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseAssetsPath(pathname) {
  const m = pathname.match(/^\/api\/projects\/([^/]+)\/assets$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function parseAssetDeletePath(pathname) {
  const m = pathname.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)$/);
  if (!m) return null;
  return {
    projectId: decodeURIComponent(m[1]),
    assetId: decodeURIComponent(m[2])
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      service: "local-server",
      host: HOST,
      port: PORT,
      projectsRoot: PROJECTS_ROOT
    });
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    ensureProjectsRoot();
    return sendJson(res, 200, {
      ok: true,
      message: "Step 1 bootstrap completed",
      structure: {
        projectsRoot: PROJECTS_ROOT,
        expectedApps: ["apps/web", "apps/local-server"]
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/api/domain/version") {
    return sendJson(res, 200, {
      ok: true,
      timelineVersion: TIMELINE_DOCUMENT_VERSION
    });
  }

  if (req.method === "POST" && url.pathname === "/api/domain/validate") {
    return readJsonBody(req)
      .then((body) => {
        const validation = validateTimelineDocument(body.timeline || {});
        return sendJson(res, validation.valid ? 200 : 422, {
          ok: validation.valid,
          valid: validation.valid,
          errors: validation.errors,
          normalized: validation.normalized
        });
      })
      .catch((err) =>
        sendJson(res, 400, {
          ok: false,
          error: err.message || "BAD_REQUEST"
        })
      );
  }

  if (req.method === "POST" && url.pathname === "/api/domain/init-project") {
    return readJsonBody(req)
      .then((body) => {
        ensureProjectsRoot();
        const result = createProjectSkeleton(PROJECTS_ROOT, {
          name: body.name,
          slug: body.slug,
          title: body.title,
          description: body.description,
          themeConfig: body.themeConfig
        });
        return sendJson(res, 201, {
          ok: true,
          project: result.project,
          projectDir: result.projectDir,
          dataPath: path.join(result.projectDir, "data.json")
        });
      })
      .catch((err) =>
        sendJson(res, 400, {
          ok: false,
          error: err.message || "INIT_PROJECT_FAILED"
        })
      );
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    return readJsonBody(req)
      .then((body) => {
        if (typeof body.name !== "string" || body.name.trim().length < 1 || body.name.length > 64) {
          return sendError(res, 400, "INVALID_INPUT", "name 必须是 1-64 字符串");
        }
        ensureProjectsRoot();
        const result = createProjectSkeleton(PROJECTS_ROOT, {
          name: body.name.trim(),
          slug: body.slug,
          title: body.title,
          description: body.description,
          themeConfig: body.themeConfig
        });
        return sendJson(res, 201, {
          ok: true,
          project: {
            ...result.project,
            storagePath: result.projectDir
          }
        });
      })
      .catch((err) => sendError(res, 400, err.message || "INVALID_INPUT", "创建项目失败"));
  }

  if (req.method === "GET") {
    const projectId = parseAssetsPath(url.pathname);
    if (projectId) {
      try {
        const assets = listProjectAssets(PROJECTS_ROOT, projectId);
        return sendJson(res, 200, { ok: true, assets });
      } catch (err) {
        if (err.code === "PROJECT_NOT_FOUND") {
          return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
        }
        return sendError(res, 400, err.code || "INVALID_INPUT", err.message || "读取资源失败");
      }
    }
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    ensureProjectsRoot();
    return sendJson(res, 200, {
      ok: true,
      projects: listProjects(PROJECTS_ROOT)
    });
  }

  if (req.method === "GET") {
    const projectId = parseProjectId(url.pathname);
    if (projectId) {
      ensureProjectsRoot();
      const found = getProjectById(PROJECTS_ROOT, projectId);
      if (!found) {
        return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
      }
      return sendJson(res, 200, {
        ok: true,
        project: found.project,
        timeline: found.timeline
      });
    }
  }

  if (req.method === "PATCH") {
    const projectId = parseProjectId(url.pathname);
    if (projectId) {
      return readJsonBody(req)
        .then((body) => {
          const updated = updateProjectMeta(PROJECTS_ROOT, projectId, {
            title: body.title,
            description: body.description,
            themeConfig: body.themeConfig
          });
          return sendJson(res, 200, { ok: true, project: updated });
        })
        .catch((err) => {
          if (err.code === "PROJECT_NOT_FOUND") {
            return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
          }
          return sendError(res, 400, err.code || "INVALID_INPUT", err.message || "更新失败");
        });
    }
  }

  if (req.method === "POST") {
    const projectId = parseReorderPath(url.pathname);
    if (projectId) {
      return readJsonBody(req)
        .then((body) => {
          const nodes = reorderNodes(PROJECTS_ROOT, projectId, body.orderedNodeIds);
          return sendJson(res, 200, { ok: true, nodes });
        })
        .catch((err) => {
          if (err.code === "PROJECT_NOT_FOUND") {
            return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
          }
          return sendError(res, 400, err.code || "INVALID_INPUT", err.message || "重排失败");
        });
    }
  }

  if (req.method === "POST") {
    const projectId = parseAssetsPath(url.pathname);
    if (projectId) {
      return readJsonBody(req)
        .then((body) => {
          const asset = uploadAssetBase64(PROJECTS_ROOT, projectId, {
            filename: body.filename,
            kind: body.kind,
            contentBase64: body.contentBase64
          });
          return sendJson(res, 201, { ok: true, asset });
        })
        .catch((err) => {
          if (err.code === "PROJECT_NOT_FOUND") {
            return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
          }
          return sendError(res, 400, err.code || "INVALID_INPUT", err.message || "上传资源失败");
        });
    }
  }

  if (req.method === "POST") {
    const m = url.pathname.match(/^\/api\/projects\/([^/]+)\/nodes$/);
    if (m) {
      const projectId = decodeURIComponent(m[1]);
      return readJsonBody(req)
        .then((body) => {
          const node = createNode(PROJECTS_ROOT, projectId, body.node || {});
          return sendJson(res, 201, { ok: true, node });
        })
        .catch((err) => {
          if (err.code === "PROJECT_NOT_FOUND") {
            return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
          }
          return sendError(res, 400, err.code || "INVALID_INPUT", err.message || "创建节点失败");
        });
    }
  }

  if (req.method === "PATCH") {
    const parsed = parseNodePath(url.pathname);
    if (parsed) {
      return readJsonBody(req)
        .then((body) => {
          const node = updateNode(PROJECTS_ROOT, parsed.projectId, parsed.nodeId, body.node || {});
          return sendJson(res, 200, { ok: true, node });
        })
        .catch((err) => {
          if (err.code === "PROJECT_NOT_FOUND") {
            return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
          }
          if (err.code === "NODE_NOT_FOUND") {
            return sendError(res, 404, "NODE_NOT_FOUND", "节点不存在");
          }
          return sendError(res, 400, err.code || "INVALID_INPUT", err.message || "更新节点失败");
        });
    }
  }

  if (req.method === "DELETE") {
    const parsed = parseNodePath(url.pathname);
    if (parsed) {
      try {
        const success = deleteNode(PROJECTS_ROOT, parsed.projectId, parsed.nodeId);
        return sendJson(res, 200, { ok: true, success });
      } catch (err) {
        if (err.code === "PROJECT_NOT_FOUND") {
          return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
        }
        if (err.code === "NODE_NOT_FOUND") {
          return sendError(res, 404, "NODE_NOT_FOUND", "节点不存在");
        }
        return sendError(res, 400, err.code || "INVALID_INPUT", err.message || "删除节点失败");
      }
    }
  }

  if (req.method === "DELETE") {
    const parsed = parseAssetDeletePath(url.pathname);
    if (parsed) {
      try {
        const force = url.searchParams.get("force") === "true";
        const result = deleteAsset(PROJECTS_ROOT, parsed.projectId, parsed.assetId, { force });
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        if (err.code === "PROJECT_NOT_FOUND") {
          return sendError(res, 404, "PROJECT_NOT_FOUND", "项目不存在");
        }
        if (err.code === "ASSET_NOT_FOUND") {
          return sendError(res, 404, "ASSET_NOT_FOUND", "资源不存在");
        }
        if (err.code === "ASSET_IN_USE") {
          return sendError(res, 409, "ASSET_IN_USE", "资源已被节点引用");
        }
        return sendError(res, 400, err.code || "INVALID_INPUT", err.message || "删除资源失败");
      }
    }
  }

  return sendError(res, 404, "NOT_FOUND", "路由不存在");
});

server.listen(PORT, HOST, () => {
  ensureProjectsRoot();
  console.log(`[local-server] running at http://${HOST}:${PORT}`);
  console.log(`[local-server] projects root: ${PROJECTS_ROOT}`);
});
