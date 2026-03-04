# Q: 初始描述。

我现在需要设计一个用户：以网页形式输出界面优雅的时间线记录的平台，我的目的是把一段时间的回忆收集串联起来。
1、形式不限制，最好是web，这样可以在平台中实时创建实时预览。
2、操作动线：打开web网页，可以选择日期时间，然后添加文字、图片或者链接，保存为节点后，此节点视作一个时间点上的点，并且可以选择不同的主题来预览：包括拖动时间线、查看单个节点，调整动效等。
3、导出：不能只在本地运行，我需要可以把媒体材料、做好的时间线，一起输出打包到一个文件夹中，之后我可以把这个文件夹打包发给朋友，朋友解压后运行其中的index网页就可以看到我制作的时间线了。
4、项目化：我期望把这个做成平台化，可以新建项目，每个项目中维护一个时间线。所有材料和内容都保存在本地，无云端存储，可以使用不同文件夹存储。
5、技术：方案倾向纯本地nodejs项目，平台npm启动后编辑、预览、导出。

针对以上：请以专业用户体验官和资深软件设计师角度，拆解出几个输出：
1、输出符合需求的给UI生成AI的prompt描述，我会用这个输出来产出多种UI，需要涵盖必要的需求页面；
2、输出整体的产品描述和预期，我会用这个输出来给到代码生成AI，来帮我实现这个项目，请务必注意产出的完备性、AI和人类易读。

# AI Answer

你好！作为一个“回忆串联者”的工具，这个想法非常动人。从产品设计和UX角度看，这不仅仅是一个记事本，它更像是一个**“数字策展工具”**。你强调的“优雅”与“离线导出”是核心差异化竞争力。

为了让 AI 能够精准理解并产出高质量的代码和 UI，我将这个项目命名为：**"Chronos Canvas" (时光画布)**。

以下是按照你的要求进行的专业拆解：

## 1. 核心产品需求文档 (给代码生成 AI 的指令)

### 项目概览

* **项目名称：** Chronos Canvas
* **定位：** 基于 Node.js 的本地化、项目制时间线创作与导出平台。
* **技术栈建议：** * **后端：** Node.js + Express (用于本地文件系统 FS 操作)。
* **前端：** React/Vue + Tailwind CSS + Framer Motion (动画)。
* **存储：** 本地 JSON 数据库 + 静态资源文件夹。

### 核心功能与逻辑

#### A. 项目化管理 (Project Logic)

* **目录结构：** 每个项目对应磁盘上的一个文件夹。
* `/projects/[project_name]/data.json` (存储节点信息)
* `/projects/[project_name]/assets/` (存储上传的图片/媒体)


* **Dashboard：** 读取根目录下所有文件夹，扫描 `data.json` 并展示项目列表。

#### B. 编辑器与动态预览 (The Workbench)

* **实时保存：** 任何改动即时写入本地 `data.json`。
* **节点属性：** `id`, `timestamp`, `title`, `content` (Markdown支持), `media_path[]`, `link_url`.
* **实时预览：** 右侧预览窗口与左侧编辑器状态同步。支持“拖拽时间轴”进行快速定位。

#### C. 导出机制 (Portable Export) - **核心点**

* **导出逻辑：** 系统需内置一套 **"Static Runner" (静态渲染器)**。
* **打包过程：** 1.  创建一个 `export` 模板文件夹（包含轻量化只读版的 HTML/JS/CSS）。
2.  将该项目的 `data.json` 拷贝进去。
3.  将该项目的所有 `assets` 图片拷贝进去。
4.  通过脚本重写 `index.html` 中的资源引用路径为相对路径。
* **交付物：** 一个独立的文件夹，用户解压后点击 `index.html` 即可在浏览器中以完整的动效查看时间线，无需运行 Node.js。

## 2. 设计师的专业建议 (UX Enhancement)

* **时间刻度感：** 不要只做离散的点，增加“时间跨度”的表现形式（例如：某一段时间的背景色块），这能更好地体现回忆的连续性。
* **导出包的体积优化：** 导出时可以加入一个“压缩资源”的可选项，通过 `sharp` 库自动压缩高清图片，确保发给朋友的压缩包不会太大。
* **PWA 支持：** 既然是纯本地项目，可以让导出的 `index.html` 支持 PWA，这样朋友收到后甚至可以“安装”到桌面，像一个独立 App 一样打开。

---

# Q：data.json 设计。

# AI Answer：

这是一个非常关键的环节。**`data.json` 是这个平台的灵魂，它决定了数据的上限；而前端方案决定了用户体验的下限。**

为了满足你提到的“优雅”、“导出后可离线运行”、“多主题切换”的需求，我为你设计了一套**“以节点为核心，元数据驱动视图”**的方案。

### 第一部分：`data.json` 数据结构设计

这个 JSON 文件不仅要存内容，还要存“配置”。为了保证导出后的兼容性，**所有资源路径必须是相对路径**。

```json
{
  "meta": {
    "projectId": "uuid-v4-generated-id",
    "title": "2025 · 穿越阿尔卑斯", 
    "description": "一段关于雪山、湖泊与自我的旅程",
    "created_at": "2026-03-02T10:00:00Z",
    "updated_at": "2026-03-05T14:20:00Z",
    "author": "小高老师",
    "cover_image": "./assets/cover_main.jpg", // 封面图，导出时位于根目录 assets 文件夹
    "theme_config": {
      "theme_id": "minimal-dark", // 当前选用的主题ID
      "accent_color": "#FF5733",  // 用户自定义的主题色
      "font_family": "Noto Serif SC" // 字体偏好
    },
    "music": {
      "autoplay": true,
      "src": "./assets/bgm.mp3" // 背景音乐（可选）
    }
  },
  "nodes": [
    {
      "id": "node-1740928392",
      "timestamp": "2025-05-20T14:30:00Z", // 标准 ISO 时间，用于排序
      "display_date_override": "初抵苏黎世", // 可选：用户想自定义显示的日期文案，覆盖自动格式化
      "type": "standard", // 类型：standard(图文), gallery(多图), quote(纯引用), video(视频)
      "layout": "left", // 布局偏好：left, right, center (用于交错式时间线)
      "content": {
        "title": "第一次见到如此清澈的湖水",
        "body": "这里是正文内容，支持 **Markdown** 语法。\\n可以换行。",
        "media": [
          {
            "type": "image",
            "src": "./assets/img_001.jpg",
            "caption": "苏黎世湖畔的白天鹅",
            "width": 1920, // 记录尺寸有助于防止页面抖动 (CLS)
            "height": 1080
          },
          {
            "type": "video",
            "src": "./assets/vid_002.mp4",
            "poster": "./assets/vid_002_thumb.jpg"
          }
        ],
        "link": {
          "url": "https://maps.google.com/...",
          "text": "查看地理位置",
          "icon": "map-pin"
        }
      },
      "style": {
        "highlight": true, // 是否作为“高光节点”放大显示
        "background_color": "#2A2A2A" // 单个节点的特殊背景（可选）
      }
    }
    // ... 更多节点
  ]
}

```
#### 设计亮点：

1. **相对路径 (`./assets/...`)**：这是“导出即运行”的核心。无论在 Node 环境还是静态 HTML 环境，这个路径都能被正确解析。
2. **`layout` 字段**：允许用户在编辑时手动干预节点在时间轴的左/右位置，或者设为 Center（全宽），打破单调的列表感。
3. **`highlight` 字段**：在“优雅”的时间线中，不是每个点都一样大。重要的回忆（如婚礼、毕业）应该被放大，这个字段控制 UI 的权重。

### 第二部分：前端 Timeline 组件架构方案

为了实现“实时预览”和“多主题”，前端不应把 UI 写死，而应该采用**适配器模式**。

假设技术栈为 **React + Framer Motion (动画) + Tailwind CSS**。

#### 1. 数据处理层 (Data Hook)

在渲染 UI 之前，需要先处理数据。Raw JSON 是扁平的，但优雅的时间线通常需要按“年”或“月”分组。

```javascript
// useTimelineData.js
// 职责：读取 JSON，排序，并按时间粒度分组
const useTimelineData = (jsonData) => {
  // 1. 排序：确保时间线绝对有序
  const sortedNodes = jsonData.nodes.sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  // 2. 分组：将节点转换为嵌套结构，方便 UI 渲染“年份标题”
  // 结构变为： { "2025": { "05": [Node, Node], "06": [Node] } }
  const groupedNodes = groupNodesByYearAndMonth(sortedNodes);

  return { meta: jsonData.meta, groups: groupedNodes };
};

```

#### 2. 组件层级设计

```text
<TimelineApp>
  │
  ├── <ThemeProvider theme={meta.theme_config.theme_id}>  // 注入 CSS 变量
  │
  ├── <BackgroundLayer />  // 动态背景（粒子、渐变等，随主题变）
  │
  ├── <Header /> // 封面、标题、背景乐控制
  │
  └── <TimelineContainer> // 核心滚动区域
        │
        ├── <YearMarker year="2025" /> // 年份大标题
        │
        └── <MonthGroup month="05">
              │
              ├── <NodeItem variant="left" />
              ├── <NodeItem variant="right" highlight={true} />
              └── <NodeItem variant="center" type="gallery" />
        </MonthGroup>

```

#### 3. 核心交互动线 (Editor vs Viewer)

我们需要区分**编辑态**和**预览态**（导出态）。

* **编辑态 (Editor Mode):**
* `<NodeItem>` 组件被包裹在 `<SortableItem>` (dnd-kit) 中，允许微调顺序。
* 点击节点 -> 弹出右侧/浮窗编辑器。
* 图片区域 -> 显示“替换/删除”按钮。
* 文本区域 -> `contenteditable` 或点击转为 Input。


* **预览态 (Viewer Mode - Exported):**
* 去除所有编辑钩子。
* 点击图片 -> 触发 **Lightbox (灯箱)** 查看大图。
* 滚动页面 -> 触发 **Scroll Scroll-linked Animations** (时间轴线条随滚动点亮)。


#### 4. 主题系统的实现逻辑

为了让用户能“选择不同的主题来预览”，不要写多套完全不同的组件，而是使用 **CSS Module / Tailwind 策略模式**。

**方案：** 每个主题本质上是一个配置对象，控制布局参数和样式类名。

```javascript
// themes/config.js
export const themes = {
  "minimal-list": {
    containerClass: "max-w-2xl mx-auto border-l-2 border-gray-200", // 垂直线居左
    nodeClass: "pl-8 mb-12 relative", // 只有左侧内容
    animation: "fade-up"
  },
  "snake-path": {
    containerClass: "max-w-4xl mx-auto relative", // 垂直线居中
    nodeClass: "w-1/2 px-8 mb-24", // 左右交错
    animation: "slide-in" // 左边从左入，右边从右入
  },
  "horizontal-film": {
    containerClass: "flex flex-nowrap overflow-x-auto h-screen items-center gap-12 px-20", // 横向滚动
    nodeClass: "w-[400px] flex-shrink-0",
    animation: "scale-up"
  }
};

```

组件中根据 `meta.theme_config.theme_id` 动态读取这些 class。


### 第三部分：关键技术难点与解决方案

针对你的需求，这几个点必须在设计阶段考虑到：

1. **图片加载与防抖动 (CLS)**：
* **问题**：导出为本地 HTML 后，图片加载速度取决于磁盘或网络。如果不预设高度，时间线会随着图片加载完成而乱跳，体验极差。
* **解决**：在 `data.json` 的 `media` 字段中**强制写入图片的 `width` 和 `height**`。前端在图片加载前，利用 `aspect-ratio` CSS 属性先占位。


2. **大文件与性能**：
* **问题**：如果用户上传了 50MB 的视频，打包后的文件夹会巨大，且网页加载卡顿。
* **解决**：Node.js 后端在保存文件时（User Upload -> `/assets`），应调用 `sharp` (图片) 和 `ffmpeg` (视频) 生成**缩略图**。
* 前端 `data.json` 存两个路径：`src` (原图) 和 `thumbnail` (缩略图)。时间线流显示缩略图，点击 Lightbox 显示原图。


3. **本地运行的路由问题**：
* **问题**：React Router 通常依赖 History API，这在纯本地 `file://` 协议打开 index.html 时会失效（导致刷新白屏）。
* **解决**：导出版本的代码必须使用 **HashRouter** (`/#/timeline`)，或者干脆不做路由，做单页应用 (SPA) 的滚动锚点定位。对于本项目，**HashRouter 是最稳妥的导出方案**。

### 总结

这套方案的核心在于：

1. **JSON 结构** 既包含数据也包含表现层配置（Layout/Theme），实现了数据驱动 UI。
2. **相对路径设计** 完美解决了“打包发给朋友解压即用”的需求。
3. **主题策略模式** 满足了你对“优雅”和多视图预览的期望。

---

# 前端设计

你好！作为一名关注用户体验的前端设计师，我非常喜欢**Chronos Canvas (时光画布)**这个概念。

要让这个平台既“优雅”又“好用”，我们需要在**“沉浸式回忆”**（Preview）和**“高效结构化记录”**（Editor）之间找到平衡。不能让工具的繁琐打断了回忆的涌现。

基于你的需求，我为你设计了以下 UI 布局方案和动线。我将使用 Mermaid 流程图和 ASCII 布局图来直观展示。

---

### 一、 设计哲学 (Design Philosophy)

1. **内容即UI (Content is UI):** 减少装饰性边框和复杂的菜单。让用户的照片、文字成为界面的主角。
2. **玻璃与纸张 (Glass & Paper):**
* **承载层（背景/底层）：** 使用微噪点的纸张纹理或动态模糊流体，营造“回忆”的朦胧感。
* **操作层（面板）：** 使用 Glassmorphism (毛玻璃) 效果，悬浮于内容之上，暗示它是“工具”，不破坏底层内容的完整性。


3. **非破坏性编辑:** 编辑面板应是“悬浮”或“抽屉式”的，永远不要遮挡当前正在编辑的时间节点在时间轴上的预览效果。

---

### 二、 核心界面布局拆解

#### 1. 项目启动页 (Dashboard) - "记忆的档案馆"

这不是一个简单的文件列表，而是一个**画廊**。

```text
+-----------------------------------------------------------------------+
|  [Logo: Chronos]                                        [+] 新建项目   |
+-----------------------------------------------------------------------+
|                                                                       |
|  欢迎回来，小高老师。                                                   |
|                                                                       |
|  +----------------+    +----------------+    +----------------+       |
|  |                |    |                |    |                |       |
|  |   [封面图]      |    |   [封面图]     |    |   [虚线框]     |       |
|  |   2025欧洲之旅  |    |   宝贝成长记录  |    |                |       |
|  |                |    |                |    |   创建新回忆   |       |
|  |   12 Nodes     |    |   45 Nodes     |    |                |       |
|  |   Last: 2m ago |    |   Last: 2d ago |    |                |       |
|  +----------------+    +----------------+    +----------------+       |
|                                                                       |
+-----------------------------------------------------------------------+

```

* **交互动线：**
* 鼠标悬停在卡片上：封面图轻微放大（Scale Up），出现“导出”和“删除”的小图标。
* 点击卡片：卡片封面图放大填满全屏（Shared Element Transition），平滑过渡到编辑器界面。



#### 2. 核心工作台 (The Workbench) - "左侧叙事，右侧预览"

这是用户停留时间最长的页面。我建议采用 **"分栏 + 实时渲染"** 的布局。

* **左侧 (30% - 350px固定宽)**：**叙事流 (Narrative Stream)**。这是一个线性的、大纲式的节点列表。方便快速录入、拖拽排序。
* **右侧 (70% - 自适应)**：**画布 (The Canvas)**。这是最终效果的 1:1 实时预览。

```text
+----------------------+------------------------------------------------+
| [Back]  [设置/导出]   |  [主题切换: 瀑布流 | 胶片 | 极简]      [预览模式] |
+----------------------+------------------------------------------------+
| 节点大纲 (Sortable)   |                                                |
|                      |             (实时预览区域 - Canvas)             |
| [DRAG] 2025.05.20    |                                                |
| 抵达苏黎世            |          [ 2025 ]                              |
|                      |             |                                  |
| [DRAG] 2025.05.21    |        (May 20)           [ 图: 苏黎世湖 ]      |
| 第一次吃Fondue        |       抵达苏黎世 ----------- 第一次见到...       |
| [Active State]       |             |             (高亮状态)            |
|                      |             |                                  |
| [ + 添加节点 ]        |             |                                  |
|                      |                                                |
+----------------------+------------------------------------------------+
| 属性编辑器 (抽屉/浮窗) |                                                |
| 日期: [2025-05-21]    |                                                |
| 标题: [输入...]       |                                                |
| 媒体: [Upload Area]   |                                                |
+----------------------+------------------------------------------------+

```

* **交互细节：**
* **联动：** 点击左侧列表的某个 Item，右侧时间轴自动滚动到对应位置，并高亮该节点。
* **编辑：** 点击左侧 Item，底部（或侧边）滑出详细属性编辑器（日期、文字、图片上传）。
* **所见即所得：** 在编辑器修改文字，右侧 Canvas 毫秒级同步刷新。



---

### 三、 三种核心主题 (Themes) 视觉设计

为了满足“优雅”和“不同场景”的需求，我们设计三套截然不同的 CSS 布局策略：

#### 1. 经典时间轴 (Classic Vertical) - "严谨的记录者"

* **布局：** 垂直中轴线。
* **逻辑：** 节点左右交错分布（Zig-zag）。左侧是时间戳，右侧是内容；或者左右交替。
* **动效：** 随着页面向下滚动，中轴线像导火索一样向下延伸（SVG Path 动画），经过节点时，节点淡入并轻微上浮。
* **适用：** 游记、成长记录、编年史。

#### 2. 横向胶片 (Horizontal Film) - "流动的电影"

* **布局：** 横向滚动 (Horizontal Scroll)。
* **视觉：** 模仿电影胶卷或画廊长廊。背景可以是固定的全屏模糊图。
* **动效：** 视差滚动 (Parallax)。文字层移动速度慢，图片层移动速度快，产生纵深感。
* **适用：** 摄影集、艺术作品展示。

#### 3. 极简呼吸 (Zen Mode) - "情绪的独白"

* **布局：** 单栏居中，大留白。
* **视觉：** 去掉明显的线条。只保留日期和内容。图片采用全宽（Full-width）展示。
* **动效：** 类似 Keynote 的“神奇移动”。当前阅读的节点不透明度 100%，上下节点 30%。聚焦感极强。
* **适用：** 日记、心情随笔、诗歌。

---

### 四、 关键功能动线 (User Flow)

#### 流程图：从创建到导出

```mermaid
graph TD
    A[启动应用] --> B{有项目吗?}
    B -- 无 --> C[新建项目 Dashboard]
    B -- 有 --> D[项目卡片列表]
    
    C --> E[输入项目名 & 封面]
    E --> F[进入工作台]
    D --> F
    
    subgraph "工作台 (Edit & Preview)"
        F --> G[左侧: 点击+号添加节点]
        G --> H[底部面板: 输入日期/文字/上传图片]
        H --> I[自动保存至本地 JSON]
        I --> J[右侧: 实时刷新预览效果]
        J --> K{调整效果?}
        K -- 切换主题 --> L[顶部栏: 选择新主题]
        K -- 调整顺序 --> M[左侧: 拖拽节点排序]
    end
    
    F --> N[点击导出]
    N --> O[生成静态资源包]
    O --> P[打开文件夹 (Zip/Folder)]

```

---

### 五、 给 UI 生成 AI 的具体提示词 (Design Prompts)

你可以直接使用以下 Prompt 在 **Midjourney** 或 **v0.dev** 中生成参考图。

**Prompt 1 (整体风格 - Dashboard):**

> **Web UI design for a personal timeline project manager. Style: Apple Human Interface mixed with refined editorial design. Light mode. Main view is a grid of 'Memory Cards'. Each card has a high-quality photo cover, elegant serif typography for the title, and a subtle date badge. Background is a soft, off-white texture. Navigation bar is glassmorphism style. Clean, spacious, breathable layout. 8k resolution, Figma style.**

**Prompt 2 (编辑器 - Workbench):**

> **Split-screen web interface for a timeline editor. Left side (30% width) is a clean, minimal list of timeline nodes with drag handles, styled like a distinct sidebar. Right side (70% width) is a rich, interactive vertical timeline visualization with photos and text. A floating 'Edit Panel' at the bottom features a Markdown input area and a drag-and-drop image zone. The aesthetic is 'Modern Obsidian', dark grey and soft gold accents. High fidelity, UI/UX portfolio.**

**Prompt 3 (预览主题 - Horizontal):**

> **Horizontal timeline web UI design. A continuous stream of photos and text cards scrolling horizontally. Parallax effect depth. The connecting line is a subtle glowing gradient. Dark cinematic background. The focus is on high-resolution photography. Minimalist typography. 8k render.**

---

### 六、 前端技术选型建议 (给开发者的 Note)

作为设计师，为了保证视觉还原，我建议在代码实现阶段强调以下技术点：

1. **字体栈 (Typography):**
* 中文：`Noto Serif SC` (宋体，用于标题，更有回忆感) + `Inter` / `PingFang SC` (正文)。
* 英文：`Playfair Display` (标题) + `Inter` (正文)。


2. **动画库:** 强烈推荐 **Framer Motion** (React) 或 **Motion One** (Vue)。我们需要“弹簧 (Spring)”物理效果，而不是生硬的线性过渡。
3. **图片处理:** CSS 属性 `object-fit: cover` 是必须的。同时给所有图片容器加上 `border-radius: 12px` (大圆角) 和轻微的 `box-shadow`，能瞬间提升高级感。
4. **滚动条:** 务必自定义滚动条样式 (Webkit scrollbar)，隐藏默认的丑陋滚动条，使用极细的、半透明的滚动条。