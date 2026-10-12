// Editor di pixel art ispirato ad Aseprite (strumenti e scorciatoie),
// scritto da zero: nessun codice di Aseprite è stato copiato.
(function () {
  var POKEMON = window.POKEMON; // [numero, nome, [id tipi], complessità]
  var W = 96, H = 96;
  var MIN_ZOOM = 1, MAX_ZOOM = 32;
  var MAX_UNDO = 100;
  var COLOR_TOLERANCE = 48; // distanza RGB entro cui un colore conta come "giusto"
  var TOOL_KEYS = { b: 'pencil', e: 'eraser', g: 'bucket', i: 'picker', l: 'line', u: 'rect', o: 'ellipse', m: 'select', v: 'move', h: 'hand' };
  var TOOL_NAMES = {
    pencil: 'Matita', eraser: 'Gomma', bucket: 'Secchiello', picker: 'Contagocce', line: 'Linea',
    rect: 'Rettangolo', ellipse: 'Ellisse', select: 'Selezione', move: 'Sposta', hand: 'Mano'
  };

  var $ = function (id) { return document.getElementById(id); };
  var viewport = $('viewport'), stage = $('stage');
  var ctx = $('canvas').getContext('2d');
  var diffCtx = $('diff').getContext('2d');
  var previewCtx = $('preview').getContext('2d');
  var refCtx = $('ref').getContext('2d', { willReadFrequently: true });

  // I pixel sono interi a 32 bit 0xAABBGGRR (ordine dei byte di ImageData); 0 = trasparente
  var image = ctx.createImageData(W, H);
  var px = new Uint32Array(image.data.buffer);
  var refPx = new Uint32Array(W * H);

  var id = 1;
  var tool = 'pencil';
  var zoom = 4;
  var fg = pack(0, 0, 0), bg = pack(255, 255, 255);
  var sel = null;      // selezione {x, y, w, h} oppure null
  var stroke = null;   // gesto in corso
  var undoStack = [], redoStack = [];
  var hover = null;    // pixel sotto il cursore

  // ---------- colori ----------
  function pack(r, g, b) { return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }
  function toHex(c) {
    return '#' + [c & 255, (c >> 8) & 255, (c >> 16) & 255]
      .map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function fromHex(hex) {
    return pack(parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16));
  }
  function colorDistance(a, b) {
    var dr = (a & 255) - (b & 255), dg = ((a >> 8) & 255) - ((b >> 8) & 255), db = ((a >> 16) & 255) - ((b >> 16) & 255);
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function setColors(newFg, newBg) {
    fg = newFg;
    bg = newBg;
    $('fg').style.background = toHex(fg);
    $('bg').style.background = toHex(bg);
    $('custom').value = toHex(fg);
    Array.prototype.forEach.call($('palette').children, function (s) {
      s.classList.toggle('sel', +s.getAttribute('data-color') === fg);
    });
  }

  function buildPalette() {
    var seen = {}, colors = [];
    for (var i = 0; i < refPx.length; i++) {
      if (refPx[i] && !seen[refPx[i]]) { seen[refPx[i]] = 1; colors.push(refPx[i]); }
    }
    var luma = function (c) { return (c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11; };
    colors.sort(function (a, b) { return luma(a) - luma(b); });
    var box = $('palette');
    box.textContent = '';
    colors.forEach(function (c) {
      var s = document.createElement('span');
      s.className = 'swatch';
      s.style.background = toHex(c);
      s.title = toHex(c);
      s.setAttribute('data-color', c);
      s.addEventListener('click', function () { setColors(c, bg); });
      s.addEventListener('contextmenu', function (e) { e.preventDefault(); setColors(fg, c); });
      box.appendChild(s);
    });
    return colors;
  }

  // ---------- disegno di base ----------
  function render() { ctx.putImageData(image, 0, 0); }

  function inSelection(x, y) {
    return !sel || (x >= sel.x && x < sel.x + sel.w && y >= sel.y && y < sel.y + sel.h);
  }

  // come in Aseprite, con una selezione attiva si disegna solo al suo interno
  function setPixel(x, y, c) {
    if (x < 0 || y < 0 || x >= W || y >= H || !inSelection(x, y)) return;
    px[y * W + x] = c;
  }

  function mirrored() { return $('opt-sym').checked; }

  function dot(x, y, c) {
    setPixel(x, y, c);
    if (mirrored()) setPixel(W - 1 - x, y, c);
  }

  // timbro del pennello (tondo dalle dimensioni 4 in su)
  function stamp(x, y, c) {
    var s = +$('size').value;
    if (s === 1) { dot(x, y, c); return; }
    var off = Math.floor(s / 2), mid = (s - 1) / 2, r2 = s * s / 4;
    for (var dy = 0; dy < s; dy++) {
      for (var dx = 0; dx < s; dx++) {
        if ((dx - mid) * (dx - mid) + (dy - mid) * (dy - mid) <= r2) dot(x - off + dx, y - off + dy, c);
      }
    }
  }

  function line(x0, y0, x1, y1, plot) {
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (;;) {
      plot(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // ellisse inscritta in un rettangolo (algoritmo di Zingl)
  function ellipse(x0, y0, x1, y1, plot) {
    var a = Math.abs(x1 - x0), b = Math.abs(y1 - y0), b1 = b & 1;
    var dx = 4 * (1 - a) * b * b, dy = 4 * (b1 + 1) * a * a;
    var err = dx + dy + b1 * a * a, e2;
    if (x0 > x1) { x0 = x1; x1 += a; }
    if (y0 > y1) y0 = y1;
    y0 += (b + 1) >> 1;
    y1 = y0 - b1;
    a = 8 * a * a;
    b1 = 8 * b * b;
    do {
      plot(x1, y0); plot(x0, y0); plot(x0, y1); plot(x1, y1);
      e2 = 2 * err;
      if (e2 <= dy) { y0++; y1--; err += dy += a; }
      if (e2 >= dx || 2 * err > dy) { x0++; x1--; err += dx += b1; }
    } while (x0 <= x1);
    while (y0 - y1 <= b) {
      plot(x0 - 1, y0); plot(x1 + 1, y0++);
      plot(x0 - 1, y1); plot(x1 + 1, y1--);
    }
  }

  function drawShape(kind, x0, y0, x1, y1, c) {
    var filled = $('opt-fill').checked;
    var brush = function (x, y) { stamp(x, y, c); };
    if (kind === 'line') { line(x0, y0, x1, y1, brush); return; }

    var left = Math.min(x0, x1), right = Math.max(x0, x1), top = Math.min(y0, y1), bottom = Math.max(y0, y1), x, y;
    if (kind === 'rect') {
      if (filled) {
        for (y = top; y <= bottom; y++) for (x = left; x <= right; x++) dot(x, y, c);
      } else {
        for (x = left; x <= right; x++) { brush(x, top); brush(x, bottom); }
        for (y = top; y <= bottom; y++) { brush(left, y); brush(right, y); }
      }
      return;
    }
    // ellisse: se piena, riempie le righe tra i due bordi
    if (!filled) { ellipse(left, top, right, bottom, brush); return; }
    var spans = {};
    ellipse(left, top, right, bottom, function (ex, ey) {
      var s = spans[ey] || (spans[ey] = [ex, ex]);
      if (ex < s[0]) s[0] = ex;
      if (ex > s[1]) s[1] = ex;
    });
    Object.keys(spans).forEach(function (key) {
      for (var fx = spans[key][0]; fx <= spans[key][1]; fx++) dot(fx, +key, c);
    });
  }

  function floodFill(x, y, c) {
    var target = px[y * W + x];
    if (target === c) return;
    var stack = [x, y];
    while (stack.length) {
      var cy = stack.pop(), cx = stack.pop();
      if (cx < 0 || cy < 0 || cx >= W || cy >= H || !inSelection(cx, cy) || px[cy * W + cx] !== target) continue;
      px[cy * W + cx] = c;
      stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
    }
  }

  // ---------- annulla / ripeti / salvataggio ----------
  function storageKey() { return 'pg-draw-' + id; }

  function save() {
    try { localStorage.setItem(storageKey(), $('canvas').toDataURL()); } catch (e) {}
  }

  // registra una modifica: `before` è la copia dei pixel prima del gesto
  function commit(before) {
    for (var i = 0; i < px.length; i++) {
      if (px[i] !== before[i]) {
        undoStack.push(before);
        if (undoStack.length > MAX_UNDO) undoStack.shift();
        redoStack = [];
        afterChange();
        return;
      }
    }
    render();
  }

  function afterChange() {
    render();
    save();
    if ($('opt-diff').checked) check();
  }

  function undo() { step(undoStack, redoStack); }
  function redo() { step(redoStack, undoStack); }
  function step(from, to) {
    if (stroke || !from.length) return;
    to.push(px.slice());
    px.set(from.pop());
    afterChange();
  }

  // ---------- selezione ----------
  function updateMarquee() {
    var m = $('marquee');
    m.hidden = !sel;
    if (!sel) return;
    m.style.left = sel.x * zoom + 'px';
    m.style.top = sel.y * zoom + 'px';
    m.style.width = sel.w * zoom + 'px';
    m.style.height = sel.h * zoom + 'px';
  }

  function setSelection(s) {
    if (s) {
      // taglia la selezione ai bordi della tela
      var x0 = Math.max(0, s.x), y0 = Math.max(0, s.y);
      var x1 = Math.min(W, s.x + s.w), y1 = Math.min(H, s.y + s.h);
      s = x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
    }
    sel = s;
    updateMarquee();
  }

  function clearSelection() {
    var before = px.slice();
    var r = sel || { x: 0, y: 0, w: W, h: H };
    for (var y = r.y; y < r.y + r.h; y++) for (var x = r.x; x < r.x + r.w; x++) px[y * W + x] = 0;
    commit(before);
  }

  // ---------- zoom ----------
  function setZoom(z, clientX, clientY) {
    z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    var rect = stage.getBoundingClientRect(), view = viewport.getBoundingClientRect();
    if (clientX == null) { clientX = view.left + view.width / 2; clientY = view.top + view.height / 2; }
    // punto della tela (in pixel dello sprite) che deve restare fermo sotto il cursore
    var ax = (clientX - rect.left) / zoom, ay = (clientY - rect.top) / zoom;
    zoom = z;
    stage.style.width = W * zoom + 'px';
    stage.style.height = H * zoom + 'px';
    $('grid').style.backgroundSize = zoom + 'px ' + zoom + 'px';
    updateGrid();
    updateMarquee();
    var after = stage.getBoundingClientRect();
    viewport.scrollLeft += after.left + ax * zoom - clientX;
    viewport.scrollTop += after.top + ay * zoom - clientY;
    updateStatus();
  }

  function updateGrid() {
    $('grid').hidden = !$('opt-grid').checked || zoom < 4;
  }

  function fitZoom() {
    var room = Math.min(viewport.clientWidth, viewport.clientHeight) - 8;
    setZoom(Math.max(2, Math.floor(room / W)));
  }

  // ---------- interfaccia ----------
  function setTool(name) {
    tool = name;
    Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tool') === name);
    });
    stage.style.cursor = name === 'hand' ? 'grab' : name === 'move' ? 'move' : 'crosshair';
    drawPreview();
    updateStatus();
  }

  function updateStatus() {
    var pos = hover ? 'x: ' + hover.x + '  y: ' + hover.y : 'x: --  y: --';
    var extra = sel ? '  |  selezione ' + sel.w + 'x' + sel.h : '';
    $('status').textContent = pos + '  |  zoom ' + zoom + 'x  |  ' + TOOL_NAMES[tool] + extra;
  }

  // anteprima del pennello sotto il mouse + segnalino sullo stesso punto del riferimento
  function drawPreview() {
    previewCtx.clearRect(0, 0, W, H);
    var marker = $('ref-marker');
    marker.hidden = !hover;
    if (!hover) return;
    var cell = $('ref-wrap').clientWidth / W;
    marker.style.left = hover.x * cell + 'px';
    marker.style.top = hover.y * cell + 'px';
    marker.style.width = marker.style.height = Math.max(cell, 3) + 'px';
    if (stroke || ['pencil', 'eraser', 'line', 'rect', 'ellipse'].indexOf(tool) === -1) return;
    var s = tool === 'pencil' || tool === 'eraser' || !$('opt-fill').checked ? +$('size').value : 1;
    var off = Math.floor(s / 2);
    previewCtx.fillStyle = tool === 'eraser' ? 'rgba(255,0,0,.45)' : toHex(fg);
    previewCtx.globalAlpha = tool === 'eraser' ? 1 : 0.6;
    previewCtx.fillRect(hover.x - off, hover.y - off, s, s);
    previewCtx.globalAlpha = 1;
  }

  function toPixel(e) {
    var rect = stage.getBoundingClientRect();
    return { x: Math.floor((e.clientX - rect.left) / zoom), y: Math.floor((e.clientY - rect.top) / zoom) };
  }

  // ---------- gesti con mouse, penna e dita ----------
  var pointers = {}, pinch = null, blocked = false;

  function pointerCount() { return Object.keys(pointers).length; }

  function pinchState() {
    var k = Object.keys(pointers), a = pointers[k[0]], b = pointers[k[1]];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function beginStroke(e) {
    var p = toPixel(e);
    var secondary = e.button === 2;
    var activeTool = e.altKey ? 'picker' : tool;
    stroke = {
      tool: activeTool, before: px.slice(), x0: p.x, y0: p.y, last: p, points: [],
      color: activeTool === 'eraser' ? 0 : secondary ? bg : fg, secondary: secondary,
      clientX: e.clientX, clientY: e.clientY
    };
    if (activeTool === 'bucket') {
      if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < H) {
        floodFill(p.x, p.y, stroke.color);
        if (mirrored()) floodFill(W - 1 - p.x, p.y, stroke.color);
      }
    } else if (activeTool === 'move') {
      var r = sel || { x: 0, y: 0, w: W, h: H };
      stroke.region = { x: r.x, y: r.y, w: r.w, h: r.h };
      stroke.floating = new Uint32Array(r.w * r.h);
      for (var y = 0; y < r.h; y++) {
        for (var x = 0; x < r.w; x++) {
          var i = (r.y + y) * W + r.x + x;
          stroke.floating[y * r.w + x] = px[i];
          px[i] = 0;
        }
      }
      stroke.cleared = px.slice();
      stroke.hadSelection = !!sel;
    }
    continueStroke(e);
  }

  // matita "pixel perfect": toglie i pixel d'angolo che formano una L
  function pencilPoint(x, y) {
    var pts = stroke.points, n = pts.length;
    if (n && pts[n - 1].x === x && pts[n - 1].y === y) return;
    stamp(x, y, stroke.color);
    pts.push({ x: x, y: y });
    if (!$('opt-perfect').checked || +$('size').value !== 1 || pts.length < 3) return;
    var a = pts[pts.length - 3], b = pts[pts.length - 2], c = pts[pts.length - 1];
    if ((a.x === b.x || a.y === b.y) && (b.x === c.x || b.y === c.y) && a.x !== c.x && a.y !== c.y) {
      restore(b.x, b.y);
      if (mirrored()) restore(W - 1 - b.x, b.y);
      pts.splice(pts.length - 2, 1);
    }
  }

  function restore(x, y) {
    if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = stroke.before[y * W + x];
  }

  function continueStroke(e) {
    var p = toPixel(e), s = stroke, t = s.tool;
    if (t === 'pencil' || t === 'eraser') {
      line(s.last.x, s.last.y, p.x, p.y, pencilPoint);
    } else if (t === 'line' || t === 'rect' || t === 'ellipse') {
      var x1 = p.x, y1 = p.y;
      if (e.shiftKey) {
        var dx = x1 - s.x0, dy = y1 - s.y0, m = Math.max(Math.abs(dx), Math.abs(dy));
        if (t === 'line' && Math.abs(dx) > 2 * Math.abs(dy)) dy = 0;
        else if (t === 'line' && Math.abs(dy) > 2 * Math.abs(dx)) dx = 0;
        else { dx = m * (dx < 0 ? -1 : 1); dy = m * (dy < 0 ? -1 : 1); }
        x1 = s.x0 + dx;
        y1 = s.y0 + dy;
      }
      px.set(s.before);
      drawShape(t, s.x0, s.y0, x1, y1, s.color);
    } else if (t === 'picker') {
      if (p.x >= 0 && p.y >= 0 && p.x < W && p.y < H && px[p.y * W + p.x]) {
        if (s.secondary) setColors(fg, px[p.y * W + p.x]); else setColors(px[p.y * W + p.x], bg);
      }
    } else if (t === 'select') {
      var cx = Math.max(0, Math.min(W - 1, p.x)), cy = Math.max(0, Math.min(H - 1, p.y));
      var sx = Math.max(0, Math.min(W - 1, s.x0)), sy = Math.max(0, Math.min(H - 1, s.y0));
      s.moved = s.moved || p.x !== s.x0 || p.y !== s.y0;
      setSelection(s.moved
        ? { x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx) + 1, h: Math.abs(cy - sy) + 1 }
        : null);
    } else if (t === 'move') {
      var ox = p.x - s.x0, oy = p.y - s.y0, r = s.region;
      px.set(s.cleared);
      for (var y = 0; y < r.h; y++) {
        for (var x = 0; x < r.w; x++) {
          var c = s.floating[y * r.w + x], tx = r.x + x + ox, ty = r.y + y + oy;
          if (c && tx >= 0 && ty >= 0 && tx < W && ty < H) px[ty * W + tx] = c;
        }
      }
      if (s.hadSelection) {
        sel = { x: r.x + ox, y: r.y + oy, w: r.w, h: r.h };
        updateMarquee();
      }
    } else if (t === 'hand') {
      viewport.scrollLeft -= e.clientX - s.clientX;
      viewport.scrollTop -= e.clientY - s.clientY;
      s.clientX = e.clientX;
      s.clientY = e.clientY;
    }
    s.last = p;
    render();
  }

  function endStroke() {
    var s = stroke;
    stroke = null;
    if (s.tool === 'move' && s.hadSelection) setSelection(sel);
    commit(s.before);
    updateStatus();
  }

  function abortStroke() {
    if (!stroke) return;
    px.set(stroke.before);
    if (stroke.tool === 'move' && stroke.hadSelection) setSelection(stroke.region);
    stroke = null;
    render();
  }

  stage.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pointerCount() === 2) {
      // secondo dito: il tratto appena iniziato viene annullato e si passa a spostare/ingrandire
      abortStroke();
      pinch = pinchState();
      pinch.zoom = zoom;
      blocked = true;
      return;
    }
    if (blocked || pointerCount() > 2) return;
    hover = e.pointerType === 'mouse' ? toPixel(e) : null;
    beginStroke(e);
    drawPreview();
  });

  window.addEventListener('pointermove', function (e) {
    if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch && pointerCount() >= 2) {
      var now = pinchState();
      var z = Math.round(pinch.zoom * now.d / pinch.d);
      if (z !== zoom) setZoom(z, now.x, now.y);
      viewport.scrollLeft -= now.x - pinch.x;
      viewport.scrollTop -= now.y - pinch.y;
      pinch.x = now.x;
      pinch.y = now.y;
      return;
    }
    if (stroke) {
      if (e.pointerType === 'mouse') hover = toPixel(e);
      continueStroke(e);
      drawPreview();
      updateStatus();
      return;
    }
    if (e.pointerType !== 'touch') {
      var p = toPixel(e);
      hover = stage.contains(e.target) && p.x >= 0 && p.y >= 0 && p.x < W && p.y < H ? p : null;
      drawPreview();
      updateStatus();
    }
  });

  function pointerEnd(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    if (pointerCount() < 2) pinch = null;
    if (pointerCount() === 0) blocked = false;
    if (!stroke) return;
    if (e.type === 'pointercancel') abortStroke(); else endStroke();
    drawPreview();
  }
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  stage.addEventListener('pointerleave', function () {
    if (!stroke) { hover = null; drawPreview(); updateStatus(); }
  });

  viewport.addEventListener('wheel', function (e) {
    e.preventDefault();
    setZoom(zoom + (e.deltaY < 0 ? 1 : -1), e.clientX, e.clientY);
  }, { passive: false });

  // click sul riferimento = contagocce
  $('ref-wrap').addEventListener('pointerdown', function (e) {
    var rect = $('ref').getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left) / rect.width * W), y = Math.floor((e.clientY - rect.top) / rect.height * H);
    var c = x >= 0 && y >= 0 && x < W && y < H ? refPx[y * W + x] : 0;
    if (!c) return;
    if (e.button === 2) setColors(fg, c); else setColors(c, bg);
  });
  $('ref-wrap').addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- controllo del match ----------
  var DIFF_OK = pack(47, 191, 58), DIFF_COLOR = pack(255, 154, 26), DIFF_MISS = pack(255, 232, 26), DIFF_EXTRA = pack(232, 26, 26);

  function check() {
    var out = diffCtx.createImageData(W, H), o = new Uint32Array(out.data.buffer);
    var ok = 0, wrongColor = 0, missing = 0, extra = 0;
    for (var i = 0; i < px.length; i++) {
      var r = refPx[i], d = px[i];
      if (r && d) {
        if (colorDistance(r, d) <= COLOR_TOLERANCE) { ok++; o[i] = DIFF_OK; } else { wrongColor++; o[i] = DIFF_COLOR; }
      } else if (r) { missing++; o[i] = DIFF_MISS; } else if (d) { extra++; o[i] = DIFF_EXTRA; }
    }
    diffCtx.putImageData(out, 0, 0);

    var overlap = ok + wrongColor, union = overlap + missing + extra;
    var shape = union ? overlap / union : 0;
    var color = overlap ? ok / overlap : 0;
    var total = union ? ok / union : 0;
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var verdict = total >= 0.999 ? 'PERFETTO!! Identico allo sprite.'
      : total >= 0.9 ? 'Ottimo lavoro, quasi identico!'
      : total >= 0.7 ? 'Molto bene, mancano i dettagli.'
      : total >= 0.4 ? 'Ci siamo quasi, continua così.'
      : total > 0 ? 'Sei all\'inizio, non mollare!'
      : 'Tela vuota: comincia a disegnare!';

    var box = $('score');
    box.textContent = '';
    var big = document.createElement('div');
    big.className = 'big';
    big.textContent = 'Match: ' + pct(total);
    box.appendChild(big);
    [
      'Sagoma: ' + pct(shape) + '  —  Colori: ' + pct(color),
      'Giusti ' + ok + ', colore sbagliato ' + wrongColor + ', mancanti ' + missing + ', di troppo ' + extra,
      verdict
    ].forEach(function (text) {
      var row = document.createElement('div');
      row.textContent = text;
      box.appendChild(row);
    });
    return total;
  }

  function showDiff(on) {
    $('opt-diff').checked = on;
    $('diff').hidden = !on;
    $('legend').hidden = !on;
    if (on) check();
  }

  // ---------- scelta del Pokémon ----------
  function loadPokemon(newId) {
    id = newId;
    var p = POKEMON[id - 1];
    abortStroke();
    undoStack = [];
    redoStack = [];
    setSelection(null);
    px.fill(0);
    render();

    document.title = 'PokéGenerator Forum :: Disegna ' + p[1];
    $('crumb').textContent = p[1];
    $('name').textContent = p[1];
    $('number').textContent = 'N° ' + padNumber(id) + ' — complessità ' + p[3] + '/10';
    $('types').textContent = '';
    p[2].forEach(function (t) { $('types').appendChild(typeBadge(t)); });
    $('sheet').href = 'pokemon.html?id=' + id;
    $('pick').value = p[1];
    $('onion').src = $('mini').src = 'sprites/' + id + '.png';
    try { history.replaceState(null, '', 'draw.html?id=' + id); } catch (e) {}

    var sprite = new Image();
    sprite.onload = function () {
      if (id !== newId) return;
      refCtx.clearRect(0, 0, W, H);
      refCtx.drawImage(sprite, 0, 0);
      var data = new Uint32Array(refCtx.getImageData(0, 0, W, H).data.buffer);
      for (var i = 0; i < data.length; i++) refPx[i] = (data[i] >>> 24) >= 128 ? (data[i] | 0xff000000) >>> 0 : 0;
      var colors = buildPalette();
      setColors(colors[0] || pack(0, 0, 0), pack(255, 255, 255));
      if ($('opt-diff').checked) check();
    };
    sprite.src = 'sprites/' + id + '.png';

    var saved = null;
    try { saved = localStorage.getItem(storageKey()); } catch (e) {}
    if (saved) {
      var old = new Image();
      old.onload = function () {
        if (id !== newId) return;
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(old, 0, 0);
        px.set(new Uint32Array(ctx.getImageData(0, 0, W, H).data.buffer));
        if ($('opt-diff').checked) check();
      };
      old.src = saved;
    }
    $('score').textContent = 'Premi "Controlla!" per vedere quanto il disegno somiglia allo sprite.';
  }

  function pickFromInput() {
    var text = $('pick').value.trim().toLowerCase();
    var n = parseInt(text, 10), found = 0;
    if (String(n) === text.replace(/^0+/, '') && n >= 1 && n <= POKEMON.length) found = n;
    for (var i = 0; !found && i < POKEMON.length; i++) if (POKEMON[i][1].toLowerCase() === text) found = i + 1;
    for (i = 0; !found && text && i < POKEMON.length; i++) if (POKEMON[i][1].toLowerCase().indexOf(text) === 0) found = i + 1;
    if (found) loadPokemon(found); else $('pick').value = POKEMON[id - 1][1];
  }

  POKEMON.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p[1];
    $('names').appendChild(o);
  });
  $('pick-go').addEventListener('click', pickFromInput);
  $('pick').addEventListener('change', pickFromInput);
  $('pick').addEventListener('focus', function () { $('pick').select(); });
  $('pick-prev').addEventListener('click', function () { loadPokemon(id === 1 ? POKEMON.length : id - 1); });
  $('pick-next').addEventListener('click', function () { loadPokemon(id === POKEMON.length ? 1 : id + 1); });
  $('pick-random').addEventListener('click', function () { loadPokemon(1 + Math.floor(Math.random() * POKEMON.length)); });

  // ---------- bottoni e opzioni ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-tool]'), function (b) {
    b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); });
  });
  for (var n = 1; n <= 8; n++) {
    var o = document.createElement('option');
    o.value = o.textContent = n;
    $('size').appendChild(o);
  }
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('zoom-in').addEventListener('click', function () { setZoom(zoom + 1); });
  $('zoom-out').addEventListener('click', function () { setZoom(zoom - 1); });
  $('deselect').addEventListener('click', function () { setSelection(null); updateStatus(); });
  $('clear').addEventListener('click', function () {
    if (!confirm('Cancellare tutto il disegno? (puoi comunque annullare)')) return;
    var before = px.slice();
    px.fill(0);
    commit(before);
  });
  $('swap').addEventListener('click', function () { setColors(bg, fg); });
  $('custom').addEventListener('input', function () { setColors(fromHex($('custom').value), bg); });
  $('opt-grid').addEventListener('change', updateGrid);
  $('opt-sym').addEventListener('change', function () { $('axis').hidden = !mirrored(); });
  $('opt-checker').addEventListener('change', function () { stage.classList.toggle('checker', $('opt-checker').checked); });
  $('opt-onion').addEventListener('change', function () { $('onion').hidden = !$('opt-onion').checked; });
  $('opt-mini').addEventListener('change', function () { $('mini').hidden = !$('opt-mini').checked; });
  $('opt-diff').addEventListener('change', function () { showDiff($('opt-diff').checked); });
  $('check').addEventListener('click', function () { showDiff(true); });

  function download(scale) {
    var out = document.createElement('canvas');
    out.width = W * scale;
    out.height = H * scale;
    var c = out.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage($('canvas'), 0, 0, out.width, out.height);
    var a = document.createElement('a');
    a.download = POKEMON[id - 1][1].toLowerCase().replace(/[^a-z0-9]+/g, '-') + (scale > 1 ? '-x' + scale : '') + '.png';
    a.href = out.toDataURL();
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  $('export').addEventListener('click', function () { download(1); });
  $('export-big').addEventListener('click', function () { download(8); });

  window.addEventListener('keydown', function (e) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox') return;
    var key = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && key === 'z') { e.shiftKey ? redo() : undo(); }
    else if (ctrl && key === 'y') redo();
    else if (ctrl && key === 'a') setSelection({ x: 0, y: 0, w: W, h: H });
    else if (ctrl && key === 'd') setSelection(null);
    else if (ctrl) return;
    else if (TOOL_KEYS[key]) setTool(TOOL_KEYS[key]);
    else if (key === 'x') setColors(bg, fg);
    else if (key === '+' || key === '=') setZoom(zoom + 1);
    else if (key === '-') setZoom(zoom - 1);
    else if (key === 'delete' || key === 'backspace') clearSelection();
    else if (key === 'escape') { if (stroke) abortStroke(); else setSelection(null); }
    else return;
    e.preventDefault();
    updateStatus();
  });

  // ---------- avvio ----------
  var wanted = parseInt(new URLSearchParams(location.search).get('id'), 10);
  setTool('pencil');
  // su schermi stretti il riferimento finisce sopra la tela: lo si tiene visibile in un angolo
  if (window.matchMedia('(max-width: 600px)').matches) $('opt-mini').click();
  fitZoom();
  loadPokemon(wanted >= 1 && wanted <= POKEMON.length ? wanted : 25);
})();
