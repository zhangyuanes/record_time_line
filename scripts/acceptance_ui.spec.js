const { test } = require('playwright/test');
const fs = require('fs');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function collectOverlayState(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity || '1') < 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const cssPath = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    };

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fixedLarge = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!isVisible(el)) continue;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (s.position === 'fixed' && r.width >= vw * 0.4 && r.height >= vh * 0.4) {
        fixedLarge.push({
          selector: cssPath(el),
          zIndex: s.zIndex,
          rect: { x: r.x, y: r.y, w: r.width, h: r.height }
        });
      }
    }

    const dialogLike = Array.from(document.querySelectorAll('[role="dialog"], dialog, [class*="modal"], [class*="lightbox"], [class*="preview"]'))
      .filter(isVisible)
      .slice(0, 8)
      .map((el) => ({ selector: cssPath(el), tag: el.tagName.toLowerCase() }));

    return {
      fixedLargeCount: fixedLarge.length,
      fixedLargeTop: fixedLarge.slice(0, 5),
      dialogLike,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
}

async function findFirstTwoImageNode(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity || '1') < 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 5 && r.height > 5;
    };

    const cssPath = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.');
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    };

    const imgs = Array.from(document.querySelectorAll('img')).filter(isVisible);
    const seen = new Set();
    const nodes = [];

    const pickContainer = (img) => {
      let cur = img;
      for (let i = 0; i < 8 && cur; i += 1) {
        const visibleImgs = Array.from(cur.querySelectorAll('img')).filter(isVisible);
        if (visibleImgs.length >= 2) return cur;
        cur = cur.parentElement;
      }
      return null;
    };

    for (const img of imgs) {
      const c = pickContainer(img);
      if (!c || seen.has(c)) continue;
      seen.add(c);
      const visibleImgs = Array.from(c.querySelectorAll('img')).filter(isVisible);
      if (visibleImgs.length < 2) continue;
      const r = c.getBoundingClientRect();
      nodes.push({
        containerSelector: cssPath(c),
        top: r.top,
        imgs: visibleImgs.slice(0, 3).map((el) => {
          const ir = el.getBoundingClientRect();
          return {
            selector: cssPath(el),
            rect: { x: ir.x, y: ir.y, w: ir.width, h: ir.height },
            alt: el.getAttribute('alt') || '',
            src: el.getAttribute('src') || ''
          };
        })
      });
    }

    nodes.sort((a, b) => a.top - b.top);
    const first = nodes[0] || null;
    if (!first) return { found: false };

    const a = first.imgs[0].rect;
    const b = first.imgs[1].rect;
    const sameRow = Math.abs(a.y - b.y) <= Math.min(a.h, b.h) * 0.35 + 8;
    const sideBySide = Math.abs(a.x - b.x) >= Math.min(a.w, b.w) * 0.35;
    const isTwoColumn = sameRow && sideBySide;

    return {
      found: true,
      containerSelector: first.containerSelector,
      image1: first.imgs[0],
      image2: first.imgs[1],
      sameRow,
      sideBySide,
      isTwoColumn,
    };
  });
}

async function findRightGuideInfo(page) {
  return page.evaluate(() => {
    const isVisible = (el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity || '1') < 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const cssPath = (el) => {
      if (!el) return '';
      if (el.id) return `#${el.id}`;
      const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 4).join('.');
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    };

    const vw = window.innerWidth;
    const candidates = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < vw * 0.72) continue;
      const points = Array.from(el.querySelectorAll('button, a, li, div, span')).filter((n) => {
        if (!isVisible(n)) return false;
        const nr = n.getBoundingClientRect();
        return nr.width >= 6 && nr.width <= 30 && nr.height >= 6 && nr.height <= 30;
      });
      if (points.length >= 3) {
        candidates.push({
          selector: cssPath(el),
          pointCount: points.length,
          left: r.left,
          top: r.top,
          height: r.height,
        });
      }
    }

    candidates.sort((a, b) => b.pointCount - a.pointCount);
    return { hasGuide: candidates.length > 0, candidates: candidates.slice(0, 5) };
  });
}

async function pickGuidePoint(page) {
  const locators = [
    '[class*="nav"] [class*="dot"]',
    '[class*="guide"] [class*="dot"]',
    '[class*="quick"] [class*="dot"]',
    '[class*="dot"]',
    'aside button',
    '.right button',
  ];
  for (const sel of locators) {
    const locator = page.locator(sel).filter({ hasNotText: '' });
    const count = await locator.count();
    if (count > 0) {
      for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i);
        if (await item.isVisible().catch(() => false)) return { selector: sel, index: i, locator: item };
      }
    }
  }
  return null;
}

async function maybeHighlightChanged(page) {
  return page.evaluate(() => {
    const anyActive = document.querySelector('[class*="active"], [class*="current"], [class*="highlight"], [aria-current="true"]');
    return !!anyActive;
  });
}

test('manual acceptance automation', async ({ page }) => {
  test.setTimeout(120000);

  const outDir = `artifacts/acceptance-${ts()}`;
  ensureDir(outDir);
  const result = { items: [] };

  async function addItem(step, title, pass, evidence, reason = '') {
    result.items.push({ step, title, pass, evidence, reason });
  }

  // 1) open preview
  await page.goto('http://127.0.0.1:5173/export?projectId=project_4eef3ce6cd', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const previewOpen = page.url().includes('/export');
  await page.screenshot({ path: `${outDir}/preview-open.png`, fullPage: true });
  await addItem(1, '打开预览页', previewOpen, { url: page.url(), screenshot: `${outDir}/preview-open.png` }, previewOpen ? '' : '页面未成功打开');

  // 2) two-column on first node with 2 images
  const previewNode = await findFirstTwoImageNode(page);
  await addItem(
    2,
    '预览页两图节点双列平铺',
    !!previewNode.found && !!previewNode.isTwoColumn,
    previewNode,
    !previewNode.found ? '未找到含两张图的可见节点' : (previewNode.isTwoColumn ? '' : '图片呈上下或未同排展示')
  );

  // 3) click image open modal, Esc close
  let previewModalPass = false;
  let previewModalEvidence = {};
  let previewModalReason = '';
  if (previewNode.found) {
    const imgSelector = previewNode.image1.selector || 'img';
    const before = await collectOverlayState(page);
    await page.locator(imgSelector).first().click({ timeout: 5000 }).catch(async () => {
      await page.locator('img').first().click({ timeout: 5000 });
    });
    await page.waitForTimeout(600);
    const afterOpen = await collectOverlayState(page);
    const opened = afterOpen.fixedLargeCount > before.fixedLargeCount || afterOpen.dialogLike.length > before.dialogLike.length || afterOpen.bodyOverflow === 'hidden';

    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const afterEsc = await collectOverlayState(page);
    const closed = afterEsc.fixedLargeCount < afterOpen.fixedLargeCount || (afterEsc.dialogLike.length <= before.dialogLike.length && afterEsc.bodyOverflow !== 'hidden');

    previewModalPass = opened && closed;
    previewModalEvidence = { imgSelector, before, afterOpen, afterEsc, opened, closed };
    previewModalReason = opened ? (closed ? '' : '按Esc后预览层未关闭') : '点击图片后未检测到预览层';
  } else {
    previewModalReason = '未找到可点击图片节点';
  }
  await page.screenshot({ path: `${outDir}/preview-modal-state.png`, fullPage: true });
  previewModalEvidence.screenshot = `${outDir}/preview-modal-state.png`;
  await addItem(3, '预览页图片预览层打开并Esc关闭', previewModalPass, previewModalEvidence, previewModalReason);

  // 4) open bundle page
  await page.goto('http://127.0.0.1:9099/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const bundleOpen = page.url().includes('127.0.0.1:9099');
  await page.screenshot({ path: `${outDir}/bundle-open.png`, fullPage: true });
  await addItem(4, '打开导出页', bundleOpen, { url: page.url(), screenshot: `${outDir}/bundle-open.png` }, bundleOpen ? '' : '导出页未成功打开');

  // 5) two-column in bundle
  const bundleNode = await findFirstTwoImageNode(page);
  await addItem(
    5,
    '导出页两图节点双列平铺',
    !!bundleNode.found && !!bundleNode.isTwoColumn,
    bundleNode,
    !bundleNode.found ? '未找到含两张图的可见节点' : (bundleNode.isTwoColumn ? '' : '图片呈上下或未同排展示')
  );

  // 6) click image open, mask or close button close
  let bundleModalPass = false;
  let bundleModalEvidence = {};
  let bundleModalReason = '';
  if (bundleNode.found) {
    const imgSelector = bundleNode.image1.selector || 'img';
    const before = await collectOverlayState(page);
    await page.locator(imgSelector).first().click({ timeout: 5000 }).catch(async () => {
      await page.locator('img').first().click({ timeout: 5000 });
    });
    await page.waitForTimeout(600);
    const afterOpen = await collectOverlayState(page);
    const opened = afterOpen.fixedLargeCount > before.fixedLargeCount || afterOpen.dialogLike.length > before.dialogLike.length || afterOpen.bodyOverflow === 'hidden';

    let closedByMaskOrBtn = false;
    const closeBtn = page.locator('button[aria-label*="关闭"], button[title*="关闭"], [class*="close"], .close-button, .modal-close').first();
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      const afterBtn = await collectOverlayState(page);
      closedByMaskOrBtn = afterBtn.fixedLargeCount < afterOpen.fixedLargeCount || (afterBtn.dialogLike.length < afterOpen.dialogLike.length && afterBtn.bodyOverflow !== 'hidden');
      bundleModalEvidence.closeAction = 'button';
      bundleModalEvidence.afterClose = afterBtn;
    }
    if (!closedByMaskOrBtn) {
      await page.mouse.click(15, 15);
      await page.waitForTimeout(500);
      const afterMask = await collectOverlayState(page);
      closedByMaskOrBtn = afterMask.fixedLargeCount < afterOpen.fixedLargeCount || (afterMask.dialogLike.length < afterOpen.dialogLike.length && afterMask.bodyOverflow !== 'hidden');
      bundleModalEvidence.closeAction = 'mask';
      bundleModalEvidence.afterClose = afterMask;
    }

    bundleModalPass = opened && closedByMaskOrBtn;
    bundleModalEvidence = { ...bundleModalEvidence, imgSelector, before, afterOpen, opened, closedByMaskOrBtn };
    bundleModalReason = opened ? (closedByMaskOrBtn ? '' : '点击遮罩或右上角关闭按钮后未关闭') : '点击图片后未检测到预览层';
  } else {
    bundleModalReason = '未找到可点击图片节点';
  }
  await page.screenshot({ path: `${outDir}/bundle-modal-state.png`, fullPage: true });
  bundleModalEvidence.screenshot = `${outDir}/bundle-modal-state.png`;
  await addItem(6, '导出页图片预览层打开并遮罩/按钮关闭', bundleModalPass, bundleModalEvidence, bundleModalReason);

  // 7) right quick guide exists
  const guideInfo = await findRightGuideInfo(page);
  await addItem(7, '右侧快速导览节点条存在', !!guideInfo.hasGuide, guideInfo, guideInfo.hasGuide ? '' : '未检测到右侧导览点集合');

  // 8) hover guide point show time tooltip and node highlight
  let hoverPass = false;
  let hoverEvidence = {};
  let hoverReason = '';
  const point = await pickGuidePoint(page);
  if (point) {
    const beforeText = await page.locator('body').innerText();
    await point.locator.hover();
    await page.waitForTimeout(500);
    const tooltip = await page.evaluate(() => {
      const isVisible = (el) => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity || '1') < 0.05) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      };
      const matched = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!isVisible(el)) continue;
        const t = (el.textContent || '').trim();
        if (!t || t.length > 40) continue;
        if (/\d{1,2}:\d{2}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}月\d{1,2}日/.test(t)) {
          const r = el.getBoundingClientRect();
          matched.push({ text: t, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, cls: el.className || '', tag: el.tagName.toLowerCase() });
        }
      }
      return matched.slice(0, 10);
    });
    const hasTimeTooltip = tooltip.length > 0;
    const highlightChanged = await maybeHighlightChanged(page);
    hoverPass = hasTimeTooltip && highlightChanged;
    hoverEvidence = { pointSelector: point.selector, pointIndex: point.index, tooltip, highlightChanged, beforeTextSample: beforeText.slice(0, 80) };
    hoverReason = hasTimeTooltip ? (highlightChanged ? '' : '未检测到对应节点高亮状态变化') : '悬浮后未检测到时间提示';
  } else {
    hoverReason = '未定位到可悬浮的导览点';
  }
  await page.screenshot({ path: `${outDir}/bundle-guide-hover.png`, fullPage: true });
  hoverEvidence.screenshot = `${outDir}/bundle-guide-hover.png`;
  await addItem(8, '悬浮导览点出现时间提示且对应节点高亮', hoverPass, hoverEvidence, hoverReason);

  // 9) click guide point scroll to node
  let clickPass = false;
  let clickEvidence = {};
  let clickReason = '';
  const point2 = point || (await pickGuidePoint(page));
  if (point2) {
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await point2.locator.click();
    await page.waitForTimeout(700);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const delta = Math.abs(scrollAfter - scrollBefore);
    const activeNow = await maybeHighlightChanged(page);
    clickPass = delta > 30 || activeNow;
    clickEvidence = { pointSelector: point2.selector, pointIndex: point2.index, scrollBefore, scrollAfter, delta, activeNow };
    clickReason = clickPass ? '' : '点击导览点后未发生可观察滚动/定位';
  } else {
    clickReason = '未定位到可点击的导览点';
  }
  await page.screenshot({ path: `${outDir}/bundle-guide-click.png`, fullPage: true });
  clickEvidence.screenshot = `${outDir}/bundle-guide-click.png`;
  await addItem(9, '点击导览点滚动定位到对应节点', clickPass, clickEvidence, clickReason);

  result.summary = {
    passCount: result.items.filter((i) => i.pass).length,
    total: result.items.length,
    outputDir: outDir,
  };

  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  console.log('ACCEPTANCE_RESULT_FILE=' + `${outDir}/result.json`);
});
