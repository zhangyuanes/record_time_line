const TIMELINE_DOCUMENT_VERSION = "0.1.0";

const DEFAULT_THEME_CONFIG = {
  themeId: "minimal-list",
  motionLevel: "medium"
};

const NODE_TYPES = ["standard", "gallery", "quote", "video"];
const NODE_LAYOUTS = ["left", "right", "center"];
const MOTION_LEVELS = ["low", "medium", "high"];

module.exports = {
  TIMELINE_DOCUMENT_VERSION,
  DEFAULT_THEME_CONFIG,
  NODE_TYPES,
  NODE_LAYOUTS,
  MOTION_LEVELS
};
