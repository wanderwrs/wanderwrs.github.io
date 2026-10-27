// ============================================================
// 思维导图渲染引擎 v4.0 - mindmap.js
// 功能：章节水平树状布局、碰撞检测、自适应跳转、增强详情面板
// 特性：335+节点无遮挡布局，面包屑导航，条款全文展示
// ============================================================

(function() {
  'use strict';

  // ===== 状态管理 =====
  var state = {
    svg: null,
    canvasWrap: null,
    viewBox: { x: 0, y: 0, w: 16000, h: 12000 },
    zoom: 1,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    nodePositions: {},  // id -> {x, y, w, h}
    linkElements: [],   // SVG path elements for links
    nodeElements: {},   // id -> SVG group element
    initialized: false,
    nodeMap: {},        // id -> node object (for fast lookup)
    childrenMap: {},    // parent id -> [child ids]
    parentMap: {},      // child id -> parent id
    rendered: false,
    renderTimer: null,
    highlightedId: null
  };

  // ===== 画布参数 =====
  var CANVAS = {
    cx: 8000, cy: 6000,         // 画布中心
    chapterSpacingX: 1800,      // 章节水平间距
    chapterY: 6000,             // 章节所在Y轴
    sectionOffsetX: 280,        // 小节相对章节X偏移（左右交错）
    sectionSpacingY: 460,       // 小节垂直间距（增大，确保条款不越界到下一行）
    sectionStartOffset: 130,    // 小节起始Y偏移
    articleStartOffsetY: 100,   // 条款起始Y偏移（距小节）
    articleSpacingY: 58,        // 条款垂直间距
    articleOffsetX: 210,        // 条款列间距
    articleMaxPerCol: 5,        // 每列最多条款数（控制垂直延伸在sectionSpacingY内）
    appendixY: 6000,            // 附录Y轴
    appendixSpacing: 1500       // 附录间距
  };

  // ===== 节点尺寸常量（布局与渲染统一使用最大值） =====
  var NODE_SIZE = {
    chapter:  { w: 220, h: 46 },
    section:  { w: 170, h: 36 },
    article:  { w: 170, h: 32 },
    appendix: { w: 180, h: 38 }
  };

  // ===== 文字宽度估算与截断 =====
  function estimateTextWidth(text, fontSize) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code > 0x2E80) {
        // CJK 字符（中文、日文、韩文）
        w += fontSize * 1.0;
      } else if (code >= 0x30 && code <= 0x39) {
        // 数字
        w += fontSize * 0.58;
      } else if (code >= 0x41 && code <= 0x5A || code >= 0x61 && code <= 0x7A) {
        // 英文字母
        w += fontSize * 0.55;
      } else {
        // 标点等
        w += fontSize * 0.5;
      }
    }
    return w;
  }

  function truncateText(text, maxWidth, fontSize) {
    var ellipsis = '…';
    var ellipsisW = fontSize * 0.8;
    var limit = maxWidth - ellipsisW;
    if (estimateTextWidth(text, fontSize) <= maxWidth) return text;
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      var cw = code > 0x2E80 ? fontSize : (code >= 0x30 && code <= 0x39 ? fontSize * 0.58 : fontSize * 0.55);
      if (w + cw > limit) return text.substring(0, i) + ellipsis;
      w += cw;
    }
    return text;
  }

  // ===== 初始化 =====
  function init() {
    state.svg = document.getElementById('mindmap-svg');
    state.canvasWrap = document.getElementById('mindmap-canvas-wrap');
    if (!state.svg || !state.canvasWrap) return;

    // 构建快速查找表
    KNOWLEDGE_MAP.nodes.forEach(function(n) {
      state.nodeMap[n.id] = n;
    });

    // 构建父子关系表
    KNOWLEDGE_MAP.nodes.forEach(function(n) {
      if (n.parent) {
        if (!state.childrenMap[n.parent]) state.childrenMap[n.parent] = [];
        state.childrenMap[n.parent].push(n.id);
        state.parentMap[n.id] = n.parent;
      }
    });

    calculateLayout();
    resolveCollisions();
    fixArticlePositions();
    resolveArticleCollisions();
    setupInteraction();
    state.initialized = true;

    // 首次加载自动适应所有节点
    autoFitAll();
  }

  // ===== 自动适应所有节点 =====
  function autoFitAll() {
    var bounds = getBounds();
    var padding = 300;
    state.viewBox = {
      x: bounds.minX - padding,
      y: bounds.minY - padding,
      w: bounds.maxX - bounds.minX + padding * 2,
      h: bounds.maxY - bounds.minY + padding * 2
    };
  }

  // ===== 计算所有节点边界 =====
  function getBounds() {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    Object.keys(state.nodePositions).forEach(function(id) {
      var p = state.nodePositions[id];
      var w = p.w || 100, h = p.h || 30;
      minX = Math.min(minX, p.x - w/2);
      minY = Math.min(minY, p.y - h/2);
      maxX = Math.max(maxX, p.x + w/2);
      maxY = Math.max(maxY, p.y + h/2);
    });
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // ===== 分层布局计算（v4.0：章节水平树状布局） =====
  function calculateLayout() {
    if (typeof KNOWLEDGE_MAP === 'undefined') return;

    var cx = CANVAS.cx, cy = CANVAS.cy;

    // 1. 章节节点：沿水平线均匀分布（9章一字排开）
    var chapters = KNOWLEDGE_MAP.nodes.filter(function(n) { return n.level === 'chapter'; });
    var chapterCount = chapters.length;
    var totalWidth = (chapterCount - 1) * CANVAS.chapterSpacingX;
    var startX = cx - totalWidth / 2;

    chapters.forEach(function(n, i) {
      n.x = startX + i * CANVAS.chapterSpacingX;
      n.y = CANVAS.chapterY;
      state.nodePositions[n.id] = { x: n.x, y: n.y, w: NODE_SIZE.chapter.w, h: NODE_SIZE.chapter.h };
    });

    // 2. 小节节点：围绕章节垂直上下分布，左右交错
    var sections = KNOWLEDGE_MAP.nodes.filter(function(n) { return n.level === 'section'; });

    // 按父章节分组
    var sectionsByChapter = {};
    sections.forEach(function(n) {
      if (!sectionsByChapter[n.parent]) sectionsByChapter[n.parent] = [];
      sectionsByChapter[n.parent].push(n);
    });

    Object.keys(sectionsByChapter).forEach(function(chapterId) {
      var chapterPos = state.nodePositions[chapterId];
      if (!chapterPos) return;

      var group = sectionsByChapter[chapterId];
      var count = group.length;
      var halfUp = Math.ceil(count / 2);
      var halfDown = Math.floor(count / 2);

      group.forEach(function(n, i) {
        var isUp = i < halfUp;         // 前半部分向上
        var idxInHalf = isUp ? i : (i - halfUp);
        var dir = isUp ? -1 : 1;       // 向上为负，向下为正

        // 左右交错：偶数索引在右，奇数在左
        var xDir = (idxInHalf % 2 === 0) ? 1 : -1;
        var xOffset = CANVAS.sectionOffsetX * (Math.floor(idxInHalf / 2) + 1) * xDir;
        var yOffset = dir * (CANVAS.sectionStartOffset + Math.ceil((idxInHalf + 1) / 2) * CANVAS.sectionSpacingY);

        n.x = chapterPos.x + xOffset;
        n.y = chapterPos.y + yOffset;
        state.nodePositions[n.id] = { x: n.x, y: n.y, w: NODE_SIZE.section.w, h: NODE_SIZE.section.h };
      });
    });

    // 3. 条款节点：从小节向下延伸成列，每列最多N条
    var articles = KNOWLEDGE_MAP.nodes.filter(function(n) { return n.level === 'article'; });

    // 按父小节分组
    var articlesBySection = {};
    articles.forEach(function(n) {
      if (!articlesBySection[n.parent]) articlesBySection[n.parent] = [];
      articlesBySection[n.parent].push(n);
    });

    Object.keys(articlesBySection).forEach(function(sectionId) {
      var sectionPos = state.nodePositions[sectionId];
      if (!sectionPos) return;

      var group = articlesBySection[sectionId];
      var count = group.length;
      var numCols = Math.ceil(count / CANVAS.articleMaxPerCol);
      if (numCols < 1) numCols = 1;

      // 列间距方向：基于小节相对章节的位置决定展开方向
      // 小节在章节右侧→向右展开，小节在章节左侧→向左展开，避免条款与章节重叠
      var chapterId = state.parentMap[sectionId];
      var chapterPos = chapterId ? state.nodePositions[chapterId] : null;
      var expandDir;
      if (chapterPos) {
        if (sectionPos.x >= chapterPos.x) {
          expandDir = 1;   // 小节在右侧：向右展开
        } else {
          expandDir = -1;  // 小节在左侧：向左展开
        }
      } else {
        expandDir = 1;
      }

      group.forEach(function(n, i) {
        var col = Math.floor(i / CANVAS.articleMaxPerCol);
        var row = i % CANVAS.articleMaxPerCol;

        var x = sectionPos.x + expandDir * (col + 1) * CANVAS.articleOffsetX;
        var y = sectionPos.y + CANVAS.articleStartOffsetY + row * CANVAS.articleSpacingY;

        // 如果小节在章节上方，条款向上延伸
        if (chapterPos && sectionPos.y < chapterPos.y) {
          y = sectionPos.y - CANVAS.articleStartOffsetY - row * CANVAS.articleSpacingY;
        }

        n.x = x;
        n.y = y;
        state.nodePositions[n.id] = { x: n.x, y: n.y, w: NODE_SIZE.article.w, h: NODE_SIZE.article.h };
      });
    });

    // 4. 附录节点：底部水平排列
    var appendices = KNOWLEDGE_MAP.nodes.filter(function(n) { return n.level === 'appendix'; });
    var appCount = appendices.length;
    var appTotalWidth = (appCount - 1) * CANVAS.appendixSpacing;
    var appStartX = cx - appTotalWidth / 2;

    appendices.forEach(function(n, i) {
      n.x = appStartX + i * CANVAS.appendixSpacing;
      n.y = CANVAS.appendixY + 2200;
      state.nodePositions[n.id] = { x: n.x, y: n.y, w: NODE_SIZE.appendix.w, h: NODE_SIZE.appendix.h };
    });
  }

  // ===== 碰撞检测与修正（仅处理章节/小节/附录，条款由布局保证） =====
  function resolveCollisions() {
    var allNodes = KNOWLEDGE_MAP.nodes;
    var iterations = 8;

    for (var iter = 0; iter < iterations; iter++) {
      for (var i = 0; i < allNodes.length; i++) {
        for (var j = i + 1; j < allNodes.length; j++) {
          // 跳过条款节点（条款位置由小节位置决定，不参与碰撞检测）
          if (allNodes[i].level === 'article' || allNodes[j].level === 'article') continue;

          var a = state.nodePositions[allNodes[i].id];
          var b = state.nodePositions[allNodes[j].id];
          if (!a || !b) continue;

          var aw = a.w || 100, ah = a.h || 30;
          var bw = b.w || 100, bh = b.h || 30;

          // 矩形碰撞检测
          var dx = Math.abs(b.x - a.x);
          var dy = Math.abs(b.y - a.y);
          var minDx = (aw + bw) / 2 + 12;  // 水平最小间距
          var minDy = (ah + bh) / 2 + 8;   // 垂直最小间距

          if (dx < minDx && dy < minDy) {
            // 计算推离方向：选择需要推离量较小的轴
            var pushX = minDx - dx;
            var pushY = minDy - dy;

            if (pushX < pushY) {
              // 水平推离
              var sign = b.x >= a.x ? 1 : -1;
              var push = pushX / 2;
              a.x -= sign * push;
              b.x += sign * push;
            } else {
              // 垂直推离
              var signY = b.y >= a.y ? 1 : -1;
              var pushY2 = pushY / 2;
              a.y -= signY * pushY2;
              b.y += signY * pushY2;
            }
          }
        }
      }
    }
  }

  // ===== 修正条款坐标（碰撞检测后根据小节最终位置重新计算条款X/Y） =====
  function fixArticlePositions() {
    var articles = KNOWLEDGE_MAP.nodes.filter(function(n) { return n.level === 'article'; });
    var articlesBySection = {};
    articles.forEach(function(n) {
      if (!articlesBySection[n.parent]) articlesBySection[n.parent] = [];
      articlesBySection[n.parent].push(n);
    });

    Object.keys(articlesBySection).forEach(function(sectionId) {
      var sectionPos = state.nodePositions[sectionId];
      if (!sectionPos) return;

      var group = articlesBySection[sectionId];
      var chapterId = state.parentMap[sectionId];
      var chapterPos = chapterId ? state.nodePositions[chapterId] : null;
      var isAbove = chapterPos && sectionPos.y < chapterPos.y;

      // 展开方向：基于小节相对章节的位置（右侧→右展开，左侧→左展开）
      var expandDir;
      if (chapterPos) {
        expandDir = sectionPos.x >= chapterPos.x ? 1 : -1;
      } else {
        expandDir = 1;
      }

      group.forEach(function(n, i) {
        var col = Math.floor(i / CANVAS.articleMaxPerCol);
        var row = i % CANVAS.articleMaxPerCol;
        var pos = state.nodePositions[n.id];
        if (!pos) return;

        // 根据小节最终位置重新计算条款坐标
        pos.x = sectionPos.x + expandDir * (col + 1) * CANVAS.articleOffsetX;
        if (isAbove) {
          pos.y = sectionPos.y - CANVAS.articleStartOffsetY - row * CANVAS.articleSpacingY;
        } else {
          pos.y = sectionPos.y + CANVAS.articleStartOffsetY + row * CANVAS.articleSpacingY;
        }
      });
    });
  }

  // ===== 条款碰撞检测与修正（仅移动条款，保持小节/章节固定） =====
  function resolveArticleCollisions() {
    var articles = KNOWLEDGE_MAP.nodes.filter(function(n) { return n.level === 'article'; });
    var allNodes = KNOWLEDGE_MAP.nodes;
    var iterations = 12;
    var gapX = 20;   // 水平最小间距
    var gapY = 6;    // 垂直最小间距

    for (var iter = 0; iter < iterations; iter++) {
      var moved = false;
      for (var ai = 0; ai < articles.length; ai++) {
        var aNode = articles[ai];
        var a = state.nodePositions[aNode.id];
        if (!a) continue;
        var aw = a.w || 170, ah = a.h || 32;

        for (var bi = 0; bi < allNodes.length; bi++) {
          var bNode = allNodes[bi];
          if (bNode.id === aNode.id) continue;
          var b = state.nodePositions[bNode.id];
          if (!b) continue;
          var bw = b.w || 170, bh = b.h || 32;

          var dx = Math.abs(b.x - a.x);
          var dy = Math.abs(b.y - a.y);
          var minDx = (aw + bw) / 2 + gapX;
          var minDy = (ah + bh) / 2 + gapY;

          if (dx < minDx && dy < minDy) {
            var sign = b.x >= a.x ? -1 : 1;
            var push = minDx - dx;
            if (bNode.level === 'article') {
              // 两个条款重叠：双方各推一半
              a.x += sign * (push / 2);
              b.x -= sign * (push / 2);
            } else {
              // 条款与非条款重叠：仅移动条款
              a.x += sign * push;
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }

  // ===== 判断节点是否在视口内 =====
  function isNodeVisible(pos) {
    var vb = state.viewBox;
    var margin = 300;
    return pos.x >= vb.x - margin && pos.x <= vb.x + vb.w + margin &&
           pos.y >= vb.y - margin && pos.y <= vb.y + vb.h + margin;
  }

  // ===== 获取缩放级别 =====
  function getZoomLevel() {
    var vb = state.viewBox;
    if (vb.w > 10000) return 'far';
    if (vb.w > 5000) return 'medium';
    if (vb.w > 2500) return 'near';
    return 'close';
  }

  // ===== 渲染SVG =====
  function render() {
    if (!state.initialized) init();
    if (!state.svg) return;

    var svg = state.svg;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', state.viewBox.x + ' ' + state.viewBox.y + ' ' + state.viewBox.w + ' ' + state.viewBox.h);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    var ns = 'http://www.w3.org/2000/svg';
    var zl = getZoomLevel();

    // 1. 绘制模块颜色图例（左上角）
    if (zl === 'far' || zl === 'medium') {
      drawModuleLegend(svg, ns);
    }

    // 2. 绘制父子连接线
    KNOWLEDGE_MAP.nodes.forEach(function(n) {
      if (!n.parent) return;
      var childPos = state.nodePositions[n.id];
      var parentPos = state.nodePositions[n.parent];
      if (!childPos || !parentPos) return;
      if (!isNodeVisible(childPos) && !isNodeVisible(parentPos)) return;

      // 用贝塞尔曲线连接，更自然
      var path = document.createElementNS(ns, 'path');
      var d;

      if (n.level === 'article') {
        // 条款连接线：从父节点底部到条款顶部
        var midY = (parentPos.y + childPos.y) / 2;
        d = 'M ' + parentPos.x + ' ' + (parentPos.y + (parentPos.h || 34)/2) +
            ' C ' + parentPos.x + ' ' + midY +
            ' ' + childPos.x + ' ' + midY +
            ' ' + childPos.x + ' ' + (childPos.y - (childPos.h || 24)/2);
      } else {
        // 小节连接线：从章节到小节
        d = 'M ' + parentPos.x + ' ' + parentPos.y +
            ' L ' + childPos.x + ' ' + childPos.y;
      }

      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');

      if (n.level === 'article') {
        path.setAttribute('stroke', '#cbd5e0');
        path.setAttribute('stroke-width', '0.5');
        path.setAttribute('stroke-opacity', '0.25');
      } else {
        path.setAttribute('stroke', '#a0aec0');
        path.setAttribute('stroke-width', '0.8');
        path.setAttribute('stroke-opacity', '0.4');
      }
      svg.appendChild(path);
    });

    // 3. 绘制关联连接线
    state.linkElements = [];
    KNOWLEDGE_MAP.links.forEach(function(link) {
      var src = state.nodePositions[link.source];
      var tgt = state.nodePositions[link.target];
      if (!src || !tgt) return;
      if (!isNodeVisible(src) && !isNodeVisible(tgt)) return;

      var path = document.createElementNS(ns, 'path');
      var mx = (src.x + tgt.x) / 2;
      var my = (src.y + tgt.y) / 2;
      var dx = tgt.x - src.x;
      var dy = tgt.y - src.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;
      var offset = dist * 0.15;
      var ctrlX = mx - dy / dist * offset;
      var ctrlY = my + dx / dist * offset;

      var d = 'M ' + src.x + ' ' + src.y + ' Q ' + ctrlX + ' ' + ctrlY + ' ' + tgt.x + ' ' + tgt.y;
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');

      if (link.relevance === 'strong') {
        path.setAttribute('stroke', '#DD6B20');
        path.setAttribute('stroke-width', '1.3');
        path.setAttribute('stroke-opacity', '0.35');
      } else if (link.relevance === 'medium') {
        path.setAttribute('stroke', '#805AD5');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('stroke-opacity', '0.22');
        path.setAttribute('stroke-dasharray', '6 3');
      } else {
        path.setAttribute('stroke', '#A0AEC0');
        path.setAttribute('stroke-width', '0.7');
        path.setAttribute('stroke-opacity', '0.12');
        path.setAttribute('stroke-dasharray', '2 4');
      }

      path.setAttribute('data-source', link.source);
      path.setAttribute('data-target', link.target);
      svg.appendChild(path);
      state.linkElements.push(path);
    });

    // 4. 绘制全部节点
    state.nodeElements = {};
    KNOWLEDGE_MAP.nodes.forEach(function(n) {
      var pos = state.nodePositions[n.id];
      if (!pos) return;
      if (!isNodeVisible(pos)) return;

      drawNode(svg, ns, n, pos, zl);
    });

    // 点击空白处关闭面板
    svg.addEventListener('click', function() {
      closeMindmapInfo();
    });

    state.rendered = true;
  }

  // ===== 绘制模块图例 =====
  function drawModuleLegend(svg, ns) {
    var legendX = state.viewBox.x + 50;
    var legendY = state.viewBox.y + 50;
    var itemH = 28;

    var g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', 'translate(' + legendX + ',' + legendY + ')');

    var bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', -10);
    bg.setAttribute('y', -10);
    bg.setAttribute('width', 180);
    bg.setAttribute('height', KNOWLEDGE_MAP.modules.length * itemH + 20);
    bg.setAttribute('fill', 'white');
    bg.setAttribute('fill-opacity', '0.9');
    bg.setAttribute('stroke', '#e2e8f0');
    bg.setAttribute('rx', '6');
    g.appendChild(bg);

    var title = document.createElementNS(ns, 'text');
    title.setAttribute('x', 5);
    title.setAttribute('y', 5);
    title.setAttribute('font-size', '11');
    title.setAttribute('font-weight', '700');
    title.setAttribute('fill', '#4a5568');
    title.textContent = '模块图例';
    g.appendChild(title);

    KNOWLEDGE_MAP.modules.forEach(function(m, i) {
      var y = 20 + i * itemH;
      var dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', 10);
      dot.setAttribute('cy', y);
      dot.setAttribute('r', 5);
      dot.setAttribute('fill', m.color);
      g.appendChild(dot);

      var text = document.createElementNS(ns, 'text');
      text.setAttribute('x', 22);
      text.setAttribute('y', y + 4);
      text.setAttribute('font-size', '10');
      text.setAttribute('fill', '#4a5568');
      text.textContent = m.label;
      g.appendChild(text);
    });

    svg.appendChild(g);
  }

  // ===== 绘制单个节点 =====
  function drawNode(svg, ns, n, pos, zl) {
    var g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', 'translate(' + pos.x + ',' + pos.y + ')');
    g.setAttribute('class', 'mm-node');
    g.setAttribute('data-id', n.id);
    g.style.cursor = 'pointer';

    // 节点大小随级别和缩放自适应
    var w, h, fontSize, fontWeight, rx;
    if (n.level === 'chapter') {
      if (zl === 'far') { w = 180; h = 38; fontSize = 13; }
      else if (zl === 'medium') { w = 200; h = 42; fontSize = 14; }
      else { w = 220; h = 46; fontSize = 15; }
      fontWeight = 700; rx = 6;
    } else if (n.level === 'section') {
      if (zl === 'far') { w = 140; h = 28; fontSize = 9; }
      else if (zl === 'medium') { w = 155; h = 32; fontSize = 10; }
      else { w = 170; h = 36; fontSize = 11; }
      fontWeight = 600; rx = 5;
    } else if (n.level === 'appendix') {
      if (zl === 'far') { w = 150; h = 30; fontSize = 9; }
      else if (zl === 'medium') { w = 165; h = 34; fontSize = 10; }
      else { w = 180; h = 38; fontSize = 11; }
      fontWeight = 600; rx = 5;
    } else {
      if (zl === 'far') { w = 95; h = 18; fontSize = 6; }
      else if (zl === 'medium') { w = 115; h = 22; fontSize = 7.5; }
      else if (zl === 'near') { w = 140; h = 26; fontSize = 9.5; }
      else { w = 170; h = 32; fontSize = 11; }
      fontWeight = 500; rx = 4;
    }

    var mod = KNOWLEDGE_MAP.modules.find(function(m) { return m.id === n.module; });
    var color = mod ? mod.color : '#666';

    // 背景矩形
    var rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', -w / 2);
    rect.setAttribute('y', -h / 2);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', rx);

    if (n.level === 'chapter') {
      rect.setAttribute('fill', color);
      rect.setAttribute('fill-opacity', '0.15');
      rect.setAttribute('stroke-width', '2');
    } else if (n.level === 'section') {
      rect.setAttribute('fill', 'white');
      rect.setAttribute('fill-opacity', '0.95');
      rect.setAttribute('stroke-width', '1.5');
    } else if (n.level === 'appendix') {
      rect.setAttribute('fill', '#fef3c7');
      rect.setAttribute('fill-opacity', '0.9');
      rect.setAttribute('stroke-width', '1.5');
    } else {
      rect.setAttribute('fill', 'white');
      rect.setAttribute('fill-opacity', '0.92');
      rect.setAttribute('stroke-width', '0.8');
    }
    rect.setAttribute('stroke', color);
    g.appendChild(rect);

    // 左侧颜色条（模块标识）
    if (n.level !== 'chapter' && zl !== 'far') {
      var bar = document.createElementNS(ns, 'rect');
      bar.setAttribute('x', -w/2);
      bar.setAttribute('y', -h/2);
      bar.setAttribute('width', 3);
      bar.setAttribute('height', h);
      bar.setAttribute('fill', color);
      bar.setAttribute('rx', rx);
      g.appendChild(bar);
    }

    // 文字
    var text = document.createElementNS(ns, 'text');
    var isChapterNode = n.level === 'chapter';
    var isFarNode = zl === 'far';
    // 非章节节点：文字从左侧颜色条之后开始（x = -w/2 + 8）
    // 章节节点或远景：文字居中
    text.setAttribute('x', (!isChapterNode && !isFarNode) ? (-w/2 + 8) : 0);
    text.setAttribute('y', 0);
    text.setAttribute('text-anchor', (!isChapterNode && !isFarNode) ? 'start' : 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-size', fontSize);
    text.setAttribute('font-weight', fontWeight);
    text.setAttribute('fill', color);

    var label = n.label;
    // 基于实际渲染宽度动态截断，确保文字在框内
    // 非章节节点：左侧8px(颜色条+间距) + 右侧4px = 12px
    // 章节节点：左右各7px = 14px
    var textPad = (!isChapterNode && !isFarNode) ? 12 : 14;
    var availWidth = w - textPad;
    label = truncateText(label, availWidth, fontSize);
    text.textContent = label;
    g.appendChild(text);

    // 条款编号标签（条款级）
    if (n.level === 'article' && zl !== 'far') {
      var codeLabel = document.createElementNS(ns, 'text');
      codeLabel.setAttribute('x', -w/2 + 6);
      codeLabel.setAttribute('y', -h/2 - 3);
      codeLabel.setAttribute('font-size', '5.5');
      codeLabel.setAttribute('fill', color);
      codeLabel.setAttribute('opacity', '0.5');
      codeLabel.textContent = n.code;
      g.appendChild(codeLabel);
    }

    // 点击事件
    g.addEventListener('click', function(e) {
      e.stopPropagation();
      if (n.level === 'appendix') {
        showAppendixPopup(n.id);
      } else {
        showNodeInfo(n.id);
      }
    });

    svg.appendChild(g);
    state.nodeElements[n.id] = g;
  }

  // ===== 获取面包屑路径 =====
  function getBreadcrumb(nodeId) {
    var crumbs = [];
    var currentId = nodeId;
    var depth = 0;
    while (currentId && depth < 5) {
      var node = state.nodeMap[currentId];
      if (!node) break;
      crumbs.unshift({ id: currentId, label: node.label, level: node.level });
      currentId = state.parentMap[currentId];
      depth++;
    }
    return crumbs;
  }

  // ===== 获取模块信息 =====
  function getModuleInfo(moduleId) {
    return KNOWLEDGE_MAP.modules.find(function(m) { return m.id === moduleId; });
  }

  // ===== 显示节点信息面板（v4.0 增强版） =====
  function showNodeInfo(nodeId) {
    var node = state.nodeMap[nodeId];
    if (!node) return;

    var panel = document.getElementById('mindmap-info-panel');
    var titleEl = document.getElementById('mindmap-info-title');
    var bodyEl = document.getElementById('mindmap-info-body');

    // 面包屑路径
    var crumbs = getBreadcrumb(nodeId);
    var modInfo = getModuleInfo(node.module);

    titleEl.innerHTML = '';
    // 面包屑
    var crumbHtml = '<div class="mm-breadcrumb">';
    crumbs.forEach(function(c, i) {
      if (i > 0) crumbHtml += '<span class="mm-crumb-sep">›</span>';
      crumbHtml += '<span class="mm-crumb" onclick="zoomToNode(\'' + c.id + '\')">' + escapeHtmlSimple(c.label) + '</span>';
    });
    crumbHtml += '</div>';
    titleEl.innerHTML = crumbHtml + '<div class="mm-node-title">' + escapeHtmlSimple(node.label) + '</div>';

    // 找关联
    var related = [];
    KNOWLEDGE_MAP.links.forEach(function(link) {
      if (link.source === nodeId) {
        var target = state.nodeMap[link.target];
        if (target) related.push({ node: target, label: link.label, relevance: link.relevance, chapter: target.code });
      } else if (link.target === nodeId) {
        var source = state.nodeMap[link.source];
        if (source) related.push({ node: source, label: link.label, relevance: link.relevance, chapter: source.code });
      }
    });

    var children = state.childrenMap[nodeId] || [];

    related.sort(function(a, b) {
      var order = { strong: 0, medium: 1, weak: 2 };
      return (order[a.relevance] || 3) - (order[b.relevance] || 3);
    });

    var html = '';

    // 模块标签 + 章节路径
    if (modInfo) {
      html += '<div class="mm-tags">';
      html += '<span class="mm-tag mm-tag-module" style="border-color:' + modInfo.color + ';color:' + modInfo.color + ';">' + modInfo.label + '</span>';
      html += '<span class="mm-tag mm-tag-level">' + getLevelLabel(node.level) + '</span>';
      html += '<span class="mm-tag mm-tag-code">' + node.code + '</span>';
      html += '</div>';
    }

    // 概述（支持HTML格式）
    if (node.desc) {
      var isHtml = node.desc.charAt(0) === '<';
      html += '<div class="mm-desc">' + (isHtml ? node.desc : escapeHtmlSimple(node.desc)) + '</div>';
    }

    // 条款全文（仅条款级节点）
    if (node.level === 'article' && typeof ARTICLE_FULLTEXT !== 'undefined') {
      var fullText = ARTICLE_FULLTEXT[nodeId];
      if (fullText && fullText.length > 0) {
        html += '<div class="mm-section-label">📖 条款全文</div>';
        html += '<div class="mm-fulltext">' + escapeHtmlSimple(fullText) + '</div>';
      }
    }

    // 子节点列表
    if (children.length > 0) {
      html += '<div class="mm-section-label">📋 包含' + getLevelLabel(node.level === 'chapter' ? 'section' : 'article') + ' (' + children.length + ')</div>';
      html += '<div class="mm-children-list">';
      children.forEach(function(cid) {
        var cnode = state.nodeMap[cid];
        if (cnode) {
          html += '<div class="mm-link-item" onclick="zoomToNode(\'' + cid + '\')">';
          html += '<span class="mm-li-label">' + escapeHtmlSimple(cnode.label) + '</span>';
          if (cnode.desc) {
            var plainDesc = cnode.desc.charAt(0) === '<' ? stripHtmlTags(cnode.desc) : cnode.desc;
            html += '<span class="mm-li-desc">' + escapeHtmlSimple(plainDesc.substring(0, 30) + (plainDesc.length > 30 ? '…' : '')) + '</span>';
          }
          html += '<span class="mm-li-code">' + cnode.code + '</span>';
          html += '</div>';
        }
      });
      html += '</div>';
    }

    // 关联知识点
    if (related.length > 0) {
      html += '<div class="mm-section-label">🔗 关联知识点 (' + related.length + ')</div>';
      html += '<div class="mm-related-list">';
      related.forEach(function(r) {
        var relLabel = { strong: '强关联', medium: '中关联', weak: '弱关联' }[r.relevance] || '关联';
        var relClass = 'mm-rel-' + (r.relevance || 'weak');
        html += '<div class="mm-link-item mm-rel-item ' + relClass + '" onclick="zoomToNode(\'' + r.node.id + '\')">';
        html += '<span class="mm-li-label">' + escapeHtmlSimple(r.node.label) + '</span>';
        if (r.label) {
          html += '<span class="mm-li-reason">' + escapeHtmlSimple(r.label) + '</span>';
        }
        html += '<span class="mm-li-code">' + r.chapter + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // 快速操作
    html += '<div class="mm-section-label">⚡ 快速操作</div>';
    html += '<div class="mm-actions">';
    html += '<button class="mm-action-btn" onclick="mindmapZoom(1.5)">🔍 放大查看</button>';
    html += '<button class="mm-action-btn" onclick="mindmapFit()">⊞ 适应视图</button>';
    // 如果有对应的知识模块，提供跳转
    if (node.module) {
      html += '<button class="mm-action-btn" onclick="jumpToModule(\'' + node.module + '\')">📚 查看' + (modInfo ? modInfo.label : '知识模块') + '</button>';
    }
    html += '</div>';

    if (related.length === 0 && children.length === 0 && (!node.desc)) {
      html += '<div class="mm-empty">暂无详细信息</div>';
    }

    bodyEl.innerHTML = html;
    panel.classList.remove('hide');

    highlightNode(nodeId);
  }

  // ===== 获取级别标签 =====
  function getLevelLabel(level) {
    var labels = {
      chapter: '章',
      section: '节',
      article: '条款',
      appendix: '附录'
    };
    return labels[level] || level;
  }

  // ===== 跳转到知识模块 =====
  function jumpToModule(moduleId) {
    if (typeof showView === 'function') {
      showView('modules');
      if (typeof selectModule === 'function') {
        setTimeout(function() { selectModule(moduleId); }, 100);
      }
    }
  }

  // ===== 高亮节点 =====
  function highlightNode(nodeId) {
    state.highlightedId = nodeId;

    Object.keys(state.nodeElements).forEach(function(id) {
      var el = state.nodeElements[id];
      if (el) {
        var rect = el.querySelector('rect');
        if (rect) rect.setAttribute('stroke-width', id === nodeId ? '3' : '1.5');
      }
    });

    state.linkElements.forEach(function(p) {
      var isActive = p.getAttribute('data-source') === nodeId || p.getAttribute('data-target') === nodeId;
      if (isActive) {
        p.setAttribute('stroke-opacity', '0.9');
        p.setAttribute('stroke-width', '2.5');
      } else {
        p.setAttribute('stroke-opacity', p.getAttribute('stroke-dasharray') ? '0.15' : '0.2');
        p.setAttribute('stroke-width', p.getAttribute('stroke-dasharray') ? '0.7' : '1');
      }
    });
  }

  // ===== 自动缩放定位（v4.0：按节点类型自适应视口） =====
  function zoomToNode(nodeId) {
    var pos = state.nodePositions[nodeId];
    if (!pos) return;

    var node = state.nodeMap[nodeId];
    if (!node) return;

    // 按节点类型决定视口大小
    var zoomMap = {
      chapter: 3500,
      section: 1800,
      article: 900,
      appendix: 2200
    };
    var targetW = zoomMap[node.level] || 1800;
    var targetH = targetW * 0.72;

    var newX = pos.x - targetW / 2;
    var newY = pos.y - targetH / 2;

    animateViewBox(newX, newY, targetW, targetH, 700);
    setTimeout(function() {
      showNodeInfo(nodeId);
    }, 800);
  }

  // ===== viewBox动画过渡 =====
  function animateViewBox(targetX, targetY, targetW, targetH, duration) {
    var svg = state.svg;
    var startX = state.viewBox.x;
    var startY = state.viewBox.y;
    var startW = state.viewBox.w;
    var startH = state.viewBox.h;
    var startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var t = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      state.viewBox.x = startX + (targetX - startX) * t;
      state.viewBox.y = startY + (targetY - startY) * t;
      state.viewBox.w = startW + (targetW - startW) * t;
      state.viewBox.h = startH + (targetH - startH) * t;

      svg.setAttribute('viewBox', state.viewBox.x + ' ' + state.viewBox.y + ' ' + state.viewBox.w + ' ' + state.viewBox.h);

      // 动画过程中也渲染（每3帧一次，避免性能问题）
      if (Math.floor(progress * 10) % 3 === 0) {
        render();
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        updateRender();
      }
    }
    requestAnimationFrame(step);
  }

  // ===== 增量更新 =====
  function updateRender() {
    render();
  }

  // ===== 缩放/拖拽交互 =====
  function setupInteraction() {
    var wrap = state.canvasWrap;
    var svg = state.svg;

    // 滚轮缩放
    wrap.addEventListener('wheel', function(e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? 1.15 : 0.87;
      var newW = state.viewBox.w * delta;
      var newH = state.viewBox.h * delta;

      if (newW < 500 || newW > 20000) return;

      var rect = wrap.getBoundingClientRect();
      var mx = (e.clientX - rect.left) / rect.width;
      var my = (e.clientY - rect.top) / rect.height;

      state.viewBox.x += (state.viewBox.w - newW) * mx;
      state.viewBox.y += (state.viewBox.h - newH) * my;
      state.viewBox.w = newW;
      state.viewBox.h = newH;

      svg.setAttribute('viewBox', state.viewBox.x + ' ' + state.viewBox.y + ' ' + state.viewBox.w + ' ' + state.viewBox.h);

      clearTimeout(state.renderTimer);
      state.renderTimer = setTimeout(function() { updateRender(); }, 120);
    });

    // 拖拽平移
    wrap.addEventListener('mousedown', function(e) {
      if (e.target.closest('.mm-node')) return;
      state.isDragging = true;
      state.dragStart.x = e.clientX;
      state.dragStart.y = e.clientY;
      wrap.classList.add('grabbing');
    });

    document.addEventListener('mousemove', function(e) {
      if (!state.isDragging) return;
      var rect = wrap.getBoundingClientRect();
      var dx = (e.clientX - state.dragStart.x) * state.viewBox.w / rect.width;
      var dy = (e.clientY - state.dragStart.y) * state.viewBox.h / rect.height;

      state.viewBox.x -= dx;
      state.viewBox.y -= dy;
      state.dragStart.x = e.clientX;
      state.dragStart.y = e.clientY;

      svg.setAttribute('viewBox', state.viewBox.x + ' ' + state.viewBox.y + ' ' + state.viewBox.w + ' ' + state.viewBox.h);

      clearTimeout(state.renderTimer);
      state.renderTimer = setTimeout(function() { updateRender(); }, 120);
    });

    document.addEventListener('mouseup', function() {
      state.isDragging = false;
      wrap.classList.remove('grabbing');
      clearTimeout(state.renderTimer);
      state.renderTimer = setTimeout(function() { updateRender(); }, 80);
    });
  }

  // ===== 搜索功能 =====
  function search(keyword) {
    var resultsEl = document.getElementById('mindmap-search-results');
    if (!keyword || keyword.trim().length < 1) {
      resultsEl.classList.add('hide');
      resultsEl.innerHTML = '';
      return;
    }

    keyword = keyword.toLowerCase().trim();
    var matches = [];

    KNOWLEDGE_MAP.nodes.forEach(function(n) {
      var labelMatch = n.label.toLowerCase().includes(keyword);
      var descMatch = n.desc && n.desc.toLowerCase().includes(keyword);
      var codeMatch = n.code && n.code.toLowerCase().includes(keyword);

      // 也搜索条款全文
      var fullTextMatch = false;
      if (n.level === 'article' && typeof ARTICLE_FULLTEXT !== 'undefined') {
        var ft = ARTICLE_FULLTEXT[n.id];
        if (ft && ft.toLowerCase().includes(keyword)) fullTextMatch = true;
      }

      if (labelMatch || descMatch || codeMatch || fullTextMatch) {
        matches.push(n);
      }
    });

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="search-item" style="color:var(--muted);">未找到匹配的知识点</div>';
    } else {
      var display = matches.slice(0, 50);
      var html = '';
      if (matches.length > 50) {
        html += '<div style="font-size:0.7rem; color:var(--muted); padding:0.3rem; border-bottom:1px solid var(--border);">找到 ' + matches.length + ' 条结果，显示前50条</div>';
      }
      display.forEach(function(n) {
        var mod = KNOWLEDGE_MAP.modules.find(function(m) { return m.id === n.module; });
        var modLabel = mod ? mod.label : '';
        html += '<div class="search-item" onclick="selectMindmapSearchResult(\'' + n.id + '\')">';
        html += '<span>' + escapeHtmlSimple(n.label) + '</span>';
        html += '<span class="si-chapter">' + n.code + ' · ' + modLabel + '</span>';
        html += '</div>';
      });
      resultsEl.innerHTML = html;
    }
    resultsEl.classList.remove('hide');
  }

  function selectSearchResult(nodeId) {
    document.getElementById('mindmap-search-results').classList.add('hide');
    document.getElementById('mindmap-search-input').value = '';
    zoomToNode(nodeId);
  }

  // ===== 工具函数 =====
  function closeMindmapInfo() {
    var panel = document.getElementById('mindmap-info-panel');
    if (panel) panel.classList.add('hide');
    Object.keys(state.nodeElements).forEach(function(id) {
      var el = state.nodeElements[id];
      if (el) {
        var rect = el.querySelector('rect');
        if (rect) rect.setAttribute('stroke-width', '1.5');
      }
    });
    state.linkElements.forEach(function(p) {
      var isDashed = p.getAttribute('stroke-dasharray');
      p.setAttribute('stroke-opacity', isDashed ? '0.2' : '0.3');
      p.setAttribute('stroke-width', isDashed ? '0.8' : '1.2');
    });
  }

  // ===== 附录全文弹窗 =====
  function showAppendixPopup(nodeId) {
    var node = state.nodeMap[nodeId];
    if (!node) return;

    var overlay = document.getElementById('appx-popup-overlay');
    var titleEl = document.getElementById('appx-popup-title');
    var bodyEl = document.getElementById('appx-popup-body');
    if (!overlay || !titleEl || !bodyEl) return;

    // 设置标题
    titleEl.textContent = node.label;

    // 获取附录全文HTML
    var fullText = '';
    if (typeof APPENDIX_FULLTEXT !== 'undefined' && APPENDIX_FULLTEXT[nodeId]) {
      fullText = APPENDIX_FULLTEXT[nodeId];
    }

    if (!fullText) {
      bodyEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">暂无附录全文内容</p>';
    } else {
      bodyEl.innerHTML = fullText;
    }

    // 显示弹窗
    overlay.classList.add('show');

    // 高亮节点
    highlightNode(nodeId);

    // 缩放到附录节点
    zoomToNode(nodeId);
  }

  function closeAppendixPopup() {
    var overlay = document.getElementById('appx-popup-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  function zoomBy(factor) {
    var cx = state.viewBox.x + state.viewBox.w / 2;
    var cy = state.viewBox.y + state.viewBox.h / 2;
    var newW = state.viewBox.w / factor;
    var newH = state.viewBox.h / factor;
    if (newW < 500 || newW > 20000) return;
    state.viewBox.x = cx - newW / 2;
    state.viewBox.y = cy - newH / 2;
    state.viewBox.w = newW;
    state.viewBox.h = newH;
    state.svg.setAttribute('viewBox', state.viewBox.x + ' ' + state.viewBox.y + ' ' + state.viewBox.w + ' ' + state.viewBox.h);
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(function() { updateRender(); }, 80);
  }

  function reset() {
    var bounds = getBounds();
    var padding = 300;
    animateViewBox(bounds.minX - padding, bounds.minY - padding, bounds.maxX - bounds.minX + padding * 2, bounds.maxY - bounds.minY + padding * 2, 400);
  }

  function fit() {
    reset();
  }

  function escapeHtmlSimple(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 剥离HTML标签，返回纯文本
  function stripHtmlTags(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  // ===== 全局接口 =====
  window.renderMindmap = render;
  window.mindmapSearch = search;
  window.selectMindmapSearchResult = selectSearchResult;
  window.zoomToNode = zoomToNode;
  window.closeMindmapInfo = closeMindmapInfo;
  window.mindmapZoom = zoomBy;
  window.mindmapReset = reset;
  window.mindmapFit = fit;
  window.jumpToModule = jumpToModule;
  window.showAppendixPopup = showAppendixPopup;
  window.closeAppendixPopup = closeAppendixPopup;

})();
