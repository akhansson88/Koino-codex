import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLI = path.join(process.env.LOCALAPPDATA, "Programs", "ArtCraft", "FigCraft", "figcraft-cli.exe");
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "bible-plans");
const PAGE_NAME = "Bible Plan Illustrations";
const W = 1440;
const H = 810;
const GAP = 80;
// The hero arch. The app overlays its title on the bottom ~40% of the cover,
// so every scene keeps its story in the arch's upper-middle band (local y 90..440).
const AX = 770;
const AY = 44;
const AW = 560;
const AH = 650;

// ---------------------------------------------------------------- MCP
const child = spawn(CLI, ["mcp", "--attach", "3999", "--timeout", "300"], { stdio: ["pipe", "pipe", "pipe"] });
let nextId = 1;
const pending = new Map();
let buffer = "";
let stderr = "";
child.stderr.on("data", (data) => { stderr += data.toString(); });
child.stdout.on("data", (data) => {
  buffer += data.toString();
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line.startsWith("{")) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  }
});
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
async function tool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (text) { try { return JSON.parse(text); } catch { return text; } }
  return result;
}
const run = (command, params = {}) => tool("run_command", { command, params });
const batch = (label, commands) => tool("batch", { label, commands });
async function screenshot(ids, pathOut, maxSize = 1800) {
  const result = await rpc("tools/call", { name: "screenshot", arguments: { ids, maxSize } });
  const image = result?.content?.find((item) => item.type === "image");
  if (image?.data) {
    fs.mkdirSync(path.dirname(pathOut), { recursive: true });
    fs.writeFileSync(pathOut, Buffer.from(image.data, "base64"));
  }
  return result;
}

// ---------------------------------------------------------------- palette
const C = {
  ink: "#231A13", cream: "#FFF9F2", paper: "#FFF4E9", gold: "#D9A441",
  peach: "#FFC79A", apricot: "#FFD9BA", blush: "#F3ACC8", lavender: "#C8BCE7", cyan: "#8EDCDA",
  olive: "#7D8A5C", oliveDark: "#55633F", oliveLight: "#A9B58C", oliveFruit: "#5C4A2E",
  stone: "#D8C6AF", stoneDark: "#8A7560", stoneLight: "#EFE2D2",
  wood: "#A9744A", woodDark: "#6E4A2F", waterLight: "#E8F7F4", waterMid: "#B9E1DC", waterDark: "#6FB5AE",
  flame: "#F2A24A", flameCore: "#FFF0BF", rose: "#C97B6B", plum: "#8A5A76", shadow: "#3A2418",
};
const P = {
  dawn: { ...C, sky: ["#FFF9F2", "#FFE3C9", "#F8C08C"], sun: "#F0A45F", sunCore: "#FFF6E4", glow: "#FFD9A6", far: "#E4C5A5", mid: "#B98A64", near: "#A97C58", accent: "#A9571F" },
  sand: { ...C, sky: ["#FFF9F2", "#F0E2C9", "#D8BE92"], sun: "#E0A96B", sunCore: "#FFF6E4", glow: "#F3D5A8", far: "#E1D0B5", mid: "#B39A72", near: "#9C8262", accent: "#8A6435" },
  sage: { ...C, sky: ["#FBFDF8", "#E4F0DC", "#C4D9B6"], sun: "#F1C784", sunCore: "#FFF7E2", glow: "#F8E3B8", far: "#CFE0C2", mid: "#8CA477", near: "#75906A", accent: "#3F6B47" },
  lavender: { ...C, sky: ["#FCF9FF", "#EDE3F8", "#D3C4EC"], sun: "#E7C49B", sunCore: "#FFF7E8", glow: "#F3DEC2", far: "#D9CCEB", mid: "#A18BBB", near: "#8672A2", accent: "#6B4FA1" },
  ocean: { ...C, sky: ["#F4FCFB", "#D6F0EC", "#A6DDD8"], sun: "#F5C98E", sunCore: "#FFF8E8", glow: "#FBE4BC", far: "#CBE8E4", mid: "#6FA9A2", near: "#558B85", accent: "#23807A" },
  clay: { ...C, sky: ["#FFF9F3", "#FADCC9", "#EBB18F"], sun: "#F1A066", sunCore: "#FFF7E8", glow: "#F8D0A9", far: "#EBC6AF", mid: "#C0825F", near: "#A96A48", accent: "#8F4A2A" },
  rose: { ...C, sky: ["#FFF9F6", "#FCE2DB", "#F0B3AA"], sun: "#EFB485", sunCore: "#FFF8EE", glow: "#F8DAC2", far: "#F0CBC1", mid: "#C58C80", near: "#A96A60", accent: "#9C4A44" },
  plum: { ...C, sky: ["#FDF8FC", "#F2DCEA", "#DDB0CB"], sun: "#F0C08A", sunCore: "#FFF8EE", glow: "#F7DCC1", far: "#E8C4D6", mid: "#AD7792", near: "#8E5C74", accent: "#8A3D64" },
  ink: { ...C, dark: true, outer: ["#FCF9FF", "#EDE3F8", "#D3C4EC"], outerSun: "#E7C49B", outerSunCore: "#FFF7E8", outerGlow: "#F3DEC2", sky: ["#2f2a45", "#3b3153", "#4a3f63"], sun: "#FFC79A", sunCore: "#FFF0D8", glow: "#E8A66B", far: "#5c5079", mid: "#4a3f63", near: "#3b3153", accent: "#FFC79A" },
  night: { ...C, dark: true, outer: ["#FCF9FF", "#E9E0F6", "#CFC0E8"], outerSun: "#E7C49B", outerSunCore: "#FFF7E8", outerGlow: "#F3DEC2", sky: ["#2f2a45", "#3b3153", "#4a3f63"], sun: "#D8CBF2", sunCore: "#FBF6FF", glow: "#A98BC9", far: "#5c5079", mid: "#4a3f63", near: "#3b3153", accent: "#C8BCE7" },
  ember: { ...C, dark: true, outer: ["#FFF9F6", "#FCE2DB", "#F0B3AA"], outerSun: "#EFB485", outerSunCore: "#FFF8EE", outerGlow: "#F8DAC2", sky: ["#2f2a45", "#3b3153", "#4a3f63"], sun: "#FFC79A", sunCore: "#FFF0D8", glow: "#E8A06B", far: "#5c5079", mid: "#4a3f63", near: "#3b3153", accent: "#FFC79A" },
};

// ---------------------------------------------------------------- commands
let cmds = [];
let parentRef = "frame";
const add = (command, params, as) => cmds.push({ command, params, ...(as ? { as } : {}) });
function node(type, x, y, w, h, props = {}, extra = {}) {
  add("node.create", {
    type, parent: { $ref: parentRef }, x, y,
    width: Math.max(1, w), height: Math.max(1, h), props, select: false, ...extra,
  });
}
const rect = (x, y, w, h, props = {}) => node("rectangle", x, y, w, h, props);
const ell = (x, y, w, h, props = {}) => node("ellipse", x, y, w, h, props);
// FigCraft rescales a vector path to the declared width/height, so the box must
// equal the path's own bounds or the drawing gets stretched.
function pathBounds(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g).map(Number);
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    minX = Math.min(minX, nums[i]); maxX = Math.max(maxX, nums[i]);
    minY = Math.min(minY, nums[i + 1]); maxY = Math.max(maxY, nums[i + 1]);
  }
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}
function vecRaw(x, y, d, props = {}) {
  const b = pathBounds(d);
  let n = 0;
  const shifted = d.replace(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (m) => {
    const v = Number(m);
    const out = n % 2 === 0 ? v - b.minX : v - b.minY;
    n += 1;
    return String(Math.round(out * 100) / 100);
  });
  add("node.create", {
    type: "vector", parent: { $ref: parentRef }, x: x + b.minX, y: y + b.minY,
    ...(b.w > 0.5 ? { width: b.w } : {}), ...(b.h > 0.5 ? { height: b.h } : {}),
    path: shifted, props, select: false,
  });
}
const vec = (x, y, w, h, d, props = {}) => vecRaw(x, y, d, props);
const vecBox = (x, y, w, h, d, props = {}) => vecRaw(x, y, d, props);
// Soft light built from flat alpha rings: radial gradients smudge on dark skies.
function glow(x, y, r, color, strength = 1) {
  const rings = [[2.6, "06"], [2.2, "08"], [1.85, "0A"], [1.55, "0C"], [1.3, "0E"], [1.1, "12"]];
  for (const [k, a] of rings) ell(x - r * k, y - r * k, r * k * 2, r * k * 2, { fill: alpha(color, a), opacity: strength });
}
const line = (x1, y1, x2, y2, props = {}) => {
  const x = Math.min(x1, x2); const y = Math.min(y1, y2);
  vecBox(x, y, Math.abs(x2 - x1), Math.abs(y2 - y1), `M${x1 - x} ${y1 - y} L${x2 - x} ${y2 - y}`, { fill: "none", strokeCap: "round", strokeJoin: "round", ...props });
};
const curve = (x1, y1, x2, y2, bend, props = {}) => {
  if (Math.abs(x2 - x1) < 12 || Math.abs(y2 - y1) < 12) {
    line(x1, y1, x2, y2, props);
    return;
  }
  const x = Math.min(x1, x2) - Math.abs(bend); const y = Math.min(y1, y2) - Math.abs(bend);
  const w = Math.abs(x2 - x1) + Math.abs(bend) * 2; const h = Math.abs(y2 - y1) + Math.abs(bend) * 2;
  vecBox(x, y, w, h, `M${x1 - x} ${y1 - y} Q${(x1 + x2) / 2 - x} ${Math.min(y1, y2) + bend - y} ${x2 - x} ${y2 - y}`, { fill: "none", strokeCap: "round", ...props });
};
const txt = (x, y, w, text, props = {}) => node("text", x, y, w, Math.round((props.fontSize || 16) * 1.4), props, { text });
const lin = (stops, from = [0, 0], to = [0, 1]) => ({ type: "linearGradient", stops, from, to });
const rad = (stops, from = [0.5, 0.5], to = [1, 1]) => ({ type: "radialGradient", stops, from, to });
const alpha = (hex, a) => hex.length === 7 ? `${hex}${a}` : hex;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function smooth(points) {
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1]; const [x1, y1] = points[i];
    const cx = (x0 + x1) / 2;
    d += ` C${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}
const inArch = (fn) => { const prev = parentRef; parentRef = "arch"; fn(); parentRef = prev; };
const ink = (p, a = "66") => alpha(p.dark ? p.cream : p.ink, a);

// ---------------------------------------------------------------- outer background
function outerSky(p, night) {
  rect(0, 0, W, H, { fills: [lin(night ? (p.outer || ["#FCF9FF", "#EDE3F8", "#D3C4EC"]) : (p.outer || p.sky))] });
  rect(0, 0, W, 300, { fills: [lin([alpha(p.cream, "88"), alpha(p.cream, "00")])] });
}
function outerSun(p, x = 250, y = 185, r = 92, night = false) {
  const sun = p.outerSun || p.sun; const core = p.outerSunCore || p.sunCore; const glowC = p.outerGlow || p.glow;
  glow(x, y, r, glowC, 0.9);
  ell(x - r, y - r, r * 2, r * 2, { fills: [lin([core, sun])] });
  ell(x - r, y - r, r * 2, r * 2, { fill: "none", stroke: alpha(sun, "88"), strokeWeight: 1 });
  if (night || p.dark) {
    // night: a moon, not a rayed sun
    ell(x - r * 0.42, y - r * 0.3, r * 0.4, r * 0.3, { fill: p.far, opacity: 0.25 });
    ell(x + r * 0.1, y + r * 0.24, r * 0.26, r * 0.2, { fill: p.far, opacity: 0.2 });
    ell(x - r * 0.1, y - r * 0.62, r * 0.18, r * 0.14, { fill: p.far, opacity: 0.18 });
    return;
  }
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = r * (i % 2 ? 1.16 : 1.24); const r1 = r * (i % 2 ? 1.62 : 1.95);
    line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, { stroke: sun, strokeWeight: 1.3, opacity: 0.22 });
  }
}
function outerWaves(p) {
  const layers = [
    { y: 596, amp: 26, phase: 0.2, top: alpha(p.peach, "AA"), bottom: p.peach, line: p.accent },
    { y: 648, amp: 24, phase: 1.1, top: alpha(p.blush, "88"), bottom: p.blush, line: p.rose },
    { y: 700, amp: 30, phase: 2.0, top: alpha(p.lavender, "77"), bottom: p.lavender, line: p.plum },
    { y: 752, amp: 22, phase: 2.8, top: alpha(p.cyan, "66"), bottom: p.cyan, line: p.accent },
  ];
  layers.forEach((layer, index) => {
    const points = [];
    for (let x = 0; x <= W; x += W / 8) points.push([x, layer.y + Math.sin((x / W) * Math.PI * 4 + layer.phase) * layer.amp]);
    vec(0, 0, W, H, `${smooth(points)} L${W} ${H} L0 ${H} Z`, { fills: [lin([layer.top, layer.bottom])], opacity: 0.5 - index * 0.05 });
    vecBox(0, 0, W, H, smooth(points), { fill: "none", stroke: layer.line, strokeWeight: 1, opacity: 0.22 });
  });
}
function outerBotanicals(p, seed) {
  const r = rng(seed);
  const sprig = (bx, by, dir, len) => {
    curve(bx, by, bx + dir * len, by - len * 0.55, -34 * dir, { stroke: p.oliveDark, strokeWeight: 1.6, opacity: 0.4 });
    for (let j = 0; j < 10; j += 1) {
      const t = j / 10;
      const lx = bx + dir * (14 + t * (len - 20)); const ly = by - t * len * 0.5 - 6;
      ell(lx, ly + (j % 2) * 10, 24, 9, { fill: p.olive, opacity: 0.34, rotation: dir * (30 + j * 3) });
      ell(lx + dir * 6, ly + 12 - (j % 2) * 10, 20, 8, { fill: p.oliveLight, opacity: 0.3, rotation: -dir * (26 + j * 3) });
    }
    for (let j = 0; j < 4; j += 1) ell(bx + dir * (30 + j * 26), by - 18 - j * 12, 5, 5, { fill: p.oliveFruit, opacity: 0.4 });
  };
  sprig(52, 726, 1, 190);
  sprig(1330, 150, -1, 170);
  for (let i = 0; i < 40; i += 1) ell(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2, { fill: p.dark ? p.cream : p.accent, opacity: 0.06 + r() * 0.1 });
}
function outerChrome(p) {
  rect(24, 24, W - 48, H - 48, { fill: "none", stroke: alpha(C.ink, "3D"), strokeWeight: 1 });
  rect(60, 54, 44, 3, { fill: p.accent, opacity: 0.9 });
  txt(60, 72, 420, "KOINO", { fontFamily: "Montserrat", fontStyle: "SemiBold", fontSize: 20, lineHeight: 26, letterSpacing: 8, fill: C.ink, opacity: 0.42 });
  vecBox(1150, 60, 220, 36, "M0 18 C35 2, 70 34, 105 18 S175 2, 210 18", { fill: "none", stroke: p.accent, strokeWeight: 2, opacity: 0.35 });
  vecBox(1150, 72, 220, 36, "M0 18 C35 2, 70 34, 105 18 S175 2, 210 18", { fill: "none", stroke: alpha(C.ink, "55"), strokeWeight: 1, opacity: 0.5 });
  const r = rng(7);
  for (let i = 0; i < 110; i += 1) ell(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2, { fill: r() < 0.5 ? p.cream : C.ink, opacity: 0.012 + r() * 0.028 });
}

// ---------------------------------------------------------------- arch shell
function archFrame(p) {
  rect(AX - 6, AY - 6, AW + 12, AH + 12, { fill: p.shadow, opacity: 0.06, cornerRadius: [(AW + 12) / 2, (AW + 12) / 2, 0, 0] });
  add("frame.create", {
    parent: { $ref: "frame" },
    x: AX, y: AY, width: AW, height: AH, name: "arch", select: false,
    props: { fill: p.paper, clip: true, cornerRadius: [AW / 2, AW / 2, 0, 0], stroke: alpha(C.ink, "77"), strokeWeight: 1.6 },
  }, "arch");
  inArch(() => {
    rect(12, 12, AW - 24, AH - 24, { fill: "none", stroke: alpha(p.accent, "55"), strokeWeight: 1, cornerRadius: [(AW - 24) / 2, (AW - 24) / 2, 0, 0] });
  });
}


// ---------------------------------------------------------------- arch backdrop pieces
function archInnerLine(p) {
  inArch(() => {
    rect(12, 12, AW - 24, AH - 24, { fill: "none", stroke: alpha(p.accent, "44"), strokeWeight: 1, cornerRadius: [(AW - 24) / 2, (AW - 24) / 2, 0, 0] });
  });
}
function archSky(p, night) {
  inArch(() => {
    rect(0, 0, AW, AH, { fills: [lin(night ? ["#2f2a45", "#3b3153", "#5c5079"] : p.sky)] });
    rect(0, 0, AW, 200, { fills: [lin([alpha(p.cream, night ? "10" : "66"), alpha(p.cream, "00")])] });
  });
}
function archSun(p, { x = 300, y = 140, r = 56 } = {}) {
  inArch(() => {
    glow(x, y, r, p.glow, 0.9);
    ell(x - r, y - r, r * 2, r * 2, { fills: [lin([p.sunCore, p.sun])] });
    for (let i = 0; i < 20; i += 1) {
      const a = (i / 20) * Math.PI * 2;
      const r0 = r * (i % 2 ? 1.14 : 1.22); const r1 = r * (i % 2 ? 1.5 : 1.78);
      line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, { stroke: p.sun, strokeWeight: 1.2, opacity: 0.24 });
    }
  });
}
function archMoon(p, { x = 400, y = 110, r = 40 } = {}) {
  inArch(() => {
    glow(x, y, r, p.glow, 0.8);
    ell(x - r, y - r, r * 2, r * 2, { fill: p.sunCore, opacity: 0.96 });
    ell(x - r * 0.42, y - r * 0.3, r * 0.4, r * 0.3, { fill: p.far, opacity: 0.22 });
    ell(x + r * 0.1, y + r * 0.24, r * 0.26, r * 0.2, { fill: p.far, opacity: 0.18 });
    ell(x - r * 0.1, y - r * 0.62, r * 0.18, r * 0.14, { fill: p.far, opacity: 0.16 });
  });
}
function archStars(p, count, seed) {
  inArch(() => {
    const r = rng(seed);
    for (let i = 0; i < count; i += 1) {
      ell(24 + r() * (AW - 48), 24 + r() * 250, 1.2 + r() * 2, 1.2 + r() * 2, { fill: p.sunCore, opacity: 0.25 + r() * 0.55 });
    }
    for (let i = 0; i < Math.max(3, Math.floor(count / 18)); i += 1) {
      node("star", 40 + r() * (AW - 90), 30 + r() * 220, 7 + r() * 9, 7 + r() * 9, { pointCount: 4, innerRadius: 0.22, fill: p.sunCore, opacity: 0.5 + r() * 0.3 });
    }
  });
}
function archClouds(p, seed, night) {
  inArch(() => {
    const r = rng(seed);
    for (let i = 0; i < 3; i += 1) {
      const cx = 70 + r() * (AW - 160); const cy = 70 + r() * 130; const s = 0.7 + r() * 0.7;
      const fill = night ? alpha(p.cream, "12") : alpha(p.cream, "CC");
      ell(cx, cy, 120 * s, 34 * s, { fill });
      ell(cx + 26 * s, cy - 16 * s, 70 * s, 30 * s, { fill });
      ell(cx + 66 * s, cy - 6 * s, 56 * s, 24 * s, { fill });
    }
  });
}
function archBirds(p, seed, count = 5, y = 120) {
  inArch(() => {
    const r = rng(seed);
    for (let i = 0; i < count; i += 1) {
      const bx = 60 + r() * (AW - 140); const by = y + (r() - 0.5) * 90; const s = 7 + r() * 8;
      const v = i % 3;
      const d = v === 0 ? `M0 ${s * 0.6} Q${s * 0.5} 0 ${s} ${s * 0.5} Q${s * 1.5} 0 ${s * 2} ${s * 0.6} Q${s * 1.5} ${s * 0.42} ${s} ${s * 0.62} Q${s * 0.5} ${s * 0.42} 0 ${s * 0.6} Z`
        : v === 1 ? `M0 ${s * 0.4} Q${s * 0.5} ${s * 0.1} ${s} ${s * 0.34} Q${s * 1.5} ${s * 0.1} ${s * 2} ${s * 0.4} Q${s * 1.5} ${s * 0.3} ${s} ${s * 0.46} Q${s * 0.5} ${s * 0.3} 0 ${s * 0.4} Z`
          : `M0 ${s * 0.75} Q${s * 0.45} 0 ${s * 0.95} ${s * 0.3} Q${s * 1.45} ${s * 0.1} ${s * 2} ${s * 0.65} Q${s * 1.45} ${s * 0.45} ${s * 0.95} ${s * 0.44} Q${s * 0.45} ${s * 0.5} 0 ${s * 0.75} Z`;
      vecBox(bx, by, s * 2, s, d, { fill: ink(p, "99"), opacity: 0.4 + r() * 0.3 });
    }
  });
}
function ridgePoints(y, amp, phase, slope = 0) {
  const points = [];
  for (let x = -20; x <= AW + 20; x += AW / 8) points.push([x, y + Math.sin((x / AW) * Math.PI * 3 + phase) * amp + (x / AW) * slope]);
  return points;
}
function archHills(p, y = 280, colors = [p.far, p.mid], seed = 3) {
  inArch(() => {
    const far = ridgePoints(y - 26, 16, 1.7, -14);
    vec(0, 0, AW, AH, `${smooth(far)} L${AW + 20} ${AH} L-20 ${AH} Z`, { fill: colors[0], opacity: 0.75 });
    vecBox(0, 0, AW, AH, smooth(far), { fill: "none", stroke: ink(p, "33"), strokeWeight: 1 });
    const near = ridgePoints(y, 20, 0.6, 16);
    vec(0, 0, AW, AH, `${smooth(near)} L${AW + 20} ${AH} L-20 ${AH} Z`, { fills: [lin([colors[0], colors[1]])] });
    vecBox(0, 0, AW, AH, smooth(near), { fill: "none", stroke: ink(p, "55"), strokeWeight: 1.2 });
    const r = rng(seed);
    for (let i = 0; i < 5; i += 1) {
      const off = 14 + i * 13;
      const contour = near.map(([x, yy]) => [x, yy + off + Math.sin(x / 60 + i) * 3]);
      vecBox(0, 0, AW, AH, smooth(contour), { fill: "none", stroke: ink(p, "22"), strokeWeight: 0.8, opacity: 0.7 - i * 0.1 });
    }
    for (let i = 0; i < 26; i += 1) {
      const x = r() * AW; const yy = y + 30 + r() * 60;
      line(x, yy, x + 8 + r() * 10, yy - 3, { stroke: ink(p, "26"), strokeWeight: 0.7 });
    }
  });
}
function archGround(p, y = 340, color) {
  inArch(() => {
    const points = ridgePoints(y, 8, 2.2, 6);
    vec(0, 0, AW, AH, `${smooth(points)} L${AW + 20} ${AH} L-20 ${AH} Z`, { fills: [lin([alpha(color || p.mid, "DD"), color || p.near])] });
    vecBox(0, 0, AW, AH, smooth(points), { fill: "none", stroke: ink(p, "44"), strokeWeight: 1 });
  });
}
function archWater(p, y = 340, night = false) {
  inArch(() => {
    rect(0, y, AW, AH - y, { fills: [lin(night ? ["#4a3f63", "#3b3153", "#2f2a45"] : [p.waterLight, p.waterMid, p.waterDark])] });
    line(0, y, AW, y, { stroke: ink(p, "44"), strokeWeight: 1.2 });
    for (let i = 0; i < 30; i += 1) {
      const yy = y + 10 + i * 9;
      const x = 16 + (i * 53) % (AW - 150);
      curve(x, yy, x + 70 + (i % 4) * 34, yy, 2.5, { stroke: night ? alpha(p.sunCore, "33") : (i % 3 ? p.waterLight : ink(p, "22")), strokeWeight: 1, opacity: 0.4 });
    }
  });
}
function headland(p, x, y, w, color) {
  inArch(() => {
    vec(x - w / 2, y - 14, w, 26, `M0 26 C${w * 0.16} 6, ${w * 0.34} 0, ${w * 0.5} 0 C${w * 0.7} 0, ${w * 0.86} 8, ${w} 26 Z`, { fill: color || p.mid, stroke: ink(p, "44"), strokeWeight: 1 });
  });
}
function sunGlitter(p, x, y, count = 12) {
  inArch(() => {
    const r = rng(91);
    for (let i = 0; i < count; i += 1) {
      const yy = y + 8 + i * 12; const w = 26 + r() * 60;
      line(x - w / 2 + (r() - 0.5) * 24, yy, x + w / 2 + (r() - 0.5) * 24, yy, { stroke: p.sunCore, strokeWeight: 1.6, opacity: 0.5 - i * 0.03, dashes: [7, 6] });
    }
  });
}
function archGrass(p, y, seed, count = 60, spread = AH) {
  inArch(() => {
    const r = rng(seed);
    for (let i = 0; i < count; i += 1) {
      const x = 18 + r() * (AW - 36);
      const yy = y + r() * spread;
      const h = 6 + r() * 20;
      line(x, yy, x + (r() - 0.5) * 10, yy - h, { stroke: r() < 0.5 ? p.oliveDark : p.olive, strokeWeight: 1, opacity: 0.4 });
    }
  });
}
function archFlowers(p, y, seed, count = 18, spread = 60) {
  inArch(() => {
    const r = rng(seed);
    for (let i = 0; i < count; i += 1) {
      const x = 20 + r() * (AW - 40); const yy = y + r() * spread; const s = 2.5 + r() * 3;
      line(x, yy, x, yy - 10, { stroke: p.oliveDark, strokeWeight: 0.8, opacity: 0.45 });
      ell(x - s / 2, yy - s - 4, s, s, { fill: r() < 0.5 ? p.accent : p.cream, opacity: 0.85 });
    }
  });
}
function meadow(p, y, seed) {
  inArch(() => {
    const r = rng(seed);
    // soft foreground mound to break the flat field
    const pts = [];
    for (let x = -20; x <= AW + 20; x += AW / 6) pts.push([x, y + Math.sin((x / AW) * Math.PI * 2 + seed) * 10]);
    vec(0, 0, AW, AH, `${smooth(pts)} L${AW + 20} ${AH} L-20 ${AH} Z`, { fill: alpha(p.near, "3D") });
    vecBox(0, 0, AW, AH, smooth(pts), { fill: "none", stroke: ink(p, "26"), strokeWeight: 1 });
    // grass tufts: 3 variants, scale jitter, density falls off toward horizon
    for (let i = 0; i < 30; i += 1) {
      const x = 20 + r() * (AW - 40);
      const t = r(); const yy = y - 12 + t * t * 92;
      const sc = 0.7 + r() * 0.9; const h = (8 + r() * 12) * sc;
      const c = r() < 0.5 ? p.oliveDark : p.olive; const lean = (r() - 0.5) * 6;
      const v = i % 3;
      if (v === 0) {
        line(x, yy, x - 4 * sc + lean, yy - h, { stroke: c, strokeWeight: 1, opacity: 0.55 });
        line(x, yy, x + lean, yy - h - 3 * sc, { stroke: c, strokeWeight: 1, opacity: 0.55 });
        line(x, yy, x + 4 * sc + lean, yy - h, { stroke: c, strokeWeight: 1, opacity: 0.55 });
      } else if (v === 1) {
        for (let b = -2; b <= 2; b += 1) line(x, yy, x + b * 3 * sc + lean, yy - h + Math.abs(b) * 3 * sc, { stroke: c, strokeWeight: 0.9, opacity: 0.5 });
      } else {
        line(x, yy, x - 3 * sc + lean, yy - h, { stroke: c, strokeWeight: 1, opacity: 0.5 });
        line(x, yy, x + 3 * sc + lean, yy - h * 0.8, { stroke: c, strokeWeight: 1, opacity: 0.5 });
        ell(x + lean - 1, yy - h - 3, 2.4, 3.4, { fill: p.oliveFruit, opacity: 0.5 });
      }
    }
    // pebble clusters (2-3 stones together)
    for (let g = 0; g < 4; g += 1) {
      const cx = 30 + r() * (AW - 70); const cy = y + 6 + r() * 60;
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k += 1) ell(cx + k * 9 + r() * 4, cy + (k % 2) * 4, (8 + r() * 8) * (1 - k * 0.2), (4 + r() * 3) * (1 - k * 0.2), { fill: p.stone, opacity: 0.5, stroke: ink(p, "33"), strokeWeight: 0.5 });
    }
  });
}
function archReeds(p, x, y, count, seed) {
  inArch(() => {
    const r = rng(seed);
    for (let i = 0; i < count; i += 1) {
      const bx = x + r() * 90; const h = 40 + r() * 70;
      curve(bx, y, bx + (r() - 0.5) * 16, y - h, 5, { stroke: r() < 0.5 ? p.oliveDark : p.olive, strokeWeight: 1.3, opacity: 0.6 });
      ell(bx + (r() - 0.5) * 16 - 2, y - h - 8, 4, 12, { fill: p.oliveFruit, opacity: 0.6 });
    }
  });
}
function archHatch(x, y, w, h, count, p, angle = 0) {
  inArch(() => {
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      line(x, y + t * h, x + w, y + t * h - angle * w, { stroke: ink(p, "22"), strokeWeight: 0.7 });
    }
  });
}
function stoneLedge(p, x, y, w, h) {
  inArch(() => {
    rect(x, y, w, h, { fill: p.stoneLight, stroke: ink(p, "77"), strokeWeight: 1.2 });
    rect(x, y, w, 6, { fill: p.cream, opacity: 0.7 });
    for (let i = 1; i < Math.floor(w / 46); i += 1) line(x + i * 46, y + 6, x + i * 46, y + h, { stroke: ink(p, "33"), strokeWeight: 0.8 });
    line(x, y + h * 0.55, x + w, y + h * 0.55, { stroke: ink(p, "26"), strokeWeight: 0.8 });
  });
}

// ---------------------------------------------------------------- emblems (arch coords)
function oliveTree(p, x, baseY, s = 1, seed = 1, olives = true) {
  inArch(() => {
    const r = rng(seed);
    ell(x - 84 * s, baseY - 4 * s, 168 * s, 20 * s, { fill: p.shadow, opacity: 0.16 });
    vec(x - 16 * s, baseY - 190 * s, 32 * s, 190 * s, `M4 190 C-2 120, 16 84, 8 0 L22 0 C30 84, 14 128, 28 190 Z`, { fill: p.wood, stroke: ink(p, "99"), strokeWeight: 1.4 });
    for (let i = 0; i < 4; i += 1) curve(x - 8 * s + i * 6 * s, baseY - 20 * s, x - 4 * s + i * 5 * s, baseY - 150 * s, 4, { stroke: p.woodDark, strokeWeight: 0.8, opacity: 0.5 });
    const tips = [];
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI / 2 + (i - 3) * 0.3;
      const bx = x + Math.cos(a) * 78 * s; const by = baseY - 128 * s + Math.sin(a) * 58 * s;
      curve(x, baseY - 120 * s, bx, by, 14, { stroke: p.woodDark, strokeWeight: 3.4 * s });
      tips.push([bx, by]);
    }
    // canopy mass first so the crown reads as one tree, then leaf detail on top
    ell(x - 92 * s, baseY - 208 * s, 184 * s, 108 * s, { fill: p.olive, opacity: 0.9 });
    ell(x - 66 * s, baseY - 224 * s, 132 * s, 84 * s, { fill: p.oliveLight, opacity: 0.75 });
    ell(x - 104 * s, baseY - 176 * s, 90 * s, 62 * s, { fill: p.oliveDark, opacity: 0.55 });
    ell(x + 20 * s, baseY - 180 * s, 88 * s, 60 * s, { fill: p.oliveDark, opacity: 0.45 });
    // sun-side rim (light from top-right)
    curve(x + 6 * s, baseY - 216 * s, x + 84 * s, baseY - 158 * s, 22, { stroke: alpha(p.sunCore, "88"), strokeWeight: 2, opacity: 0.7 });
    for (let i = 0; i < 54; i += 1) {
      const [tx, ty] = tips[Math.floor(r() * tips.length)];
      const dx = (r() - 0.5) * 108 * s; const dy = (r() - 0.5) * 66 * s;
      const size = (9 + r() * 13) * s;
      const tone = r();
      const color = tone < 0.34 ? p.oliveDark : tone < 0.72 ? p.olive : p.oliveLight;
      ell(tx + dx - size / 2, ty + dy - size / 2, size, size * 0.62, { fill: color, opacity: 0.92, stroke: ink(p, "44"), strokeWeight: 0.5, rotation: (r() - 0.5) * 50 });
    }
    if (olives) for (let i = 0; i < 12; i += 1) {
      const [tx, ty] = tips[Math.floor(r() * tips.length)];
      ell(tx + (r() - 0.5) * 84 * s, ty + (r() - 0.5) * 56 * s, 4 * s, 4 * s, { fill: p.oliveFruit, stroke: ink(p, "55"), strokeWeight: 0.4 });
    }
  });
}
function cypress(p, x, baseY, h, s = 1) {
  inArch(() => {
    ell(x - 12 * s, baseY - 3, 24 * s, 8, { fill: p.shadow, opacity: 0.15 });
    vec(x - 12 * s, baseY - h, 24 * s, h, `M12 0 C22 ${h * 0.3}, 24 ${h * 0.7}, 16 ${h} L8 ${h} C0 ${h * 0.7}, 2 ${h * 0.3}, 12 0 Z`, { fill: p.oliveDark, stroke: ink(p, "66"), strokeWeight: 1 });
    for (let i = 1; i < 5; i += 1) curve(x - 6 * s, baseY - h + (h / 5) * i, x + 6 * s, baseY - h + (h / 5) * i - 4, 3, { stroke: p.olive, strokeWeight: 0.8, opacity: 0.6 });
    line(x, baseY, x, baseY + 8, { stroke: p.woodDark, strokeWeight: 2 });
  });
}
function palm(p, x, baseY, s = 1) {
  inArch(() => {
    curve(x, baseY, x + 14 * s, baseY - 150 * s, -18 * s, { stroke: p.wood, strokeWeight: 6 * s });
    for (let i = 0; i < 8; i += 1) line(x - 4 * s + i * 1.6 * s, baseY - 18 * s - i * 16 * s, x + 8 * s + i * 1.6 * s, baseY - 22 * s - i * 16 * s, { stroke: p.woodDark, strokeWeight: 1, opacity: 0.5 });
    const tx = x + 14 * s; const ty = baseY - 150 * s;
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI * 0.92 + i * (Math.PI * 0.84 / 6);
      const ex = tx + Math.cos(a) * 74 * s; const ey = ty + Math.sin(a) * 46 * s + 22 * s;
      const mx = (tx + ex) / 2; const my = (ty + ey) / 2 - 16 * s;
      vec(Math.min(tx, ex) - 6, Math.min(ty, ey, my) - 6, Math.abs(ex - tx) + 12, Math.abs(ey - ty) + 24,
        `M${tx - Math.min(tx, ex) + 6} ${ty - Math.min(ty, ey, my) + 6} Q${mx - Math.min(tx, ex) + 6} ${my - Math.min(ty, ey, my) + 6} ${ex - Math.min(tx, ex) + 6} ${ey - Math.min(ty, ey, my) + 6} Q${mx - Math.min(tx, ex) + 6} ${my - Math.min(ty, ey, my) + 14} ${tx - Math.min(tx, ex) + 6} ${ty - Math.min(ty, ey, my) + 6} Z`,
        { fill: i % 2 ? p.olive : p.oliveDark, stroke: ink(p, "44"), strokeWeight: 0.6, opacity: 0.95 });
      line(tx, ty, ex, ey, { stroke: p.oliveLight, strokeWeight: 0.8, opacity: 0.6 });
    }
    ell(tx - 5 * s, ty - 2 * s, 8 * s, 8 * s, { fill: p.oliveFruit });
    ell(tx + 2 * s, ty + 2 * s, 7 * s, 7 * s, { fill: p.oliveFruit });
  });
}
function house(p, x, baseY, w, h, { dome = false, tower = false } = {}) {
  inArch(() => {
    rect(x, baseY - h, w, h, { fill: p.stoneLight, stroke: ink(p, "88"), strokeWeight: 1.1 });
    rect(x, baseY - h, w, 5, { fill: p.stone, opacity: 0.9 });
    for (let i = 0; i < 3; i += 1) line(x + 3, baseY - h + 12 + i * (h / 4), x + w - 3, baseY - h + 12 + i * (h / 4), { stroke: ink(p, "1C"), strokeWeight: 0.6 });
    const dw = w * 0.26;
    vec(x + w / 2 - dw / 2, baseY - h * 0.42, dw, h * 0.42, `M0 ${h * 0.42} L0 ${dw / 2} Q${dw / 2} 0 ${dw} ${dw / 2} L${dw} ${h * 0.42} Z`, { fill: p.woodDark, stroke: ink(p, "88"), strokeWeight: 0.9 });
    for (const wx of [x + w * 0.16, x + w * 0.66]) {
      const ww = w * 0.16; const wh = h * 0.2;
      vec(wx, baseY - h * 0.78, ww, wh, `M0 ${wh} L0 ${ww / 2} Q${ww / 2} 0 ${ww} ${ww / 2} L${ww} ${wh} Z`, { fill: p.sunCore, opacity: 0.85, stroke: ink(p, "77"), strokeWeight: 0.8 });
    }
    if (dome) {
      rect(x + w * 0.16, baseY - h - 12, w * 0.68, 12, { fill: p.stoneLight, stroke: ink(p, "77"), strokeWeight: 0.9 });
      ell(x + w * 0.1, baseY - h - 12 - w * 0.4, w * 0.8, w * 0.8, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1.1 });
      rect(x + w * 0.1, baseY - h - 14, w * 0.8, 4, { fill: p.stoneLight });
      for (let i = 1; i < 4; i += 1) curve(x + w * 0.1 + (w * 0.8 / 4) * i, baseY - h - 12 - w * 0.38, x + w / 2, baseY - h - 12 - w * 0.4, 6, { stroke: ink(p, "33"), strokeWeight: 0.7 });
      line(x + w / 2, baseY - h - 12 - w * 0.4, x + w / 2, baseY - h - 12 - w * 0.4 - 10, { stroke: p.stoneDark, strokeWeight: 1.6 });
    } else if (tower) {
      rect(x + w * 0.2, baseY - h - 26, w * 0.6, 26, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1 });
      vec(x + w * 0.14, baseY - h - 40, w * 0.72, 16, `M0 16 L${w * 0.36} 0 L${w * 0.72} 16 Z`, { fill: p.wood, stroke: ink(p, "88"), strokeWeight: 1 });
      rect(x + w * 0.4, baseY - h - 20, w * 0.2, 12, { fill: p.sunCore, opacity: 0.8 });
    } else {
      for (let i = 0; i < Math.floor(w / 12); i += 1) rect(x + 2 + i * 12, baseY - h - 6, 7, 6, { fill: p.stone, stroke: ink(p, "55"), strokeWeight: 0.6 });
    }
  });
}
function village(p, x, baseY, s = 1, seed = 1, variant = 0) {
  inArch(() => {
    const r = rng(seed);
    if (variant !== 2) {
      rect(x - 150 * s, baseY - 22 * s, 300 * s, 22 * s, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1.1 });
      for (let i = 0; i < 10; i += 1) rect(x - 146 * s + i * 30 * s, baseY - 32 * s, 16 * s, 10 * s, { fill: p.stoneLight, stroke: ink(p, "66"), strokeWeight: 0.7 });
      for (let i = 0; i < 8; i += 1) line(x - 140 * s + i * 36 * s, baseY - 18 * s, x - 140 * s + i * 36 * s, baseY - 2 * s, { stroke: ink(p, "26"), strokeWeight: 0.6 });
    } else {
      rect(x - 140 * s, baseY - 10 * s, 280 * s, 10 * s, { fill: p.stone, stroke: ink(p, "77"), strokeWeight: 1 });
    }
    const widths = [44, 36, 52, 40, 34];
    let cx = x - 128 * s;
    widths.forEach((w, i) => {
      const h = (46 + r() * 46) * s;
      const dome = variant === 1 ? i % 2 === 0 : i === 2;
      house(p, cx, baseY - (variant === 2 ? 8 : 20) * s, w * s, h, { dome, tower: variant === 0 && i === 4 });
      cx += (w + 8) * s;
    });
    cypress(p, x - 140 * s, baseY - 18 * s, 74 * s, s);
    cypress(p, x + 138 * s, baseY - 18 * s, 62 * s, s);
  });
}
function boat(p, x, y, s = 1, { reflection = true } = {}) {
  inArch(() => {
    if (reflection) {
      for (let i = 0; i < 6; i += 1) line(x + 20 * s + i * 6, y + 66 * s + i * 9, x + 240 * s - i * 8, y + 66 * s + i * 9, { stroke: ink(p, "33"), strokeWeight: 1.4, opacity: 0.3 - i * 0.04, dashes: [10, 8] });
    }
    ell(x + 6 * s, y + 58 * s, 250 * s, 18 * s, { fill: p.shadow, opacity: 0.16 });
    vec(x, y, 260 * s, 64 * s, `M0 6 C26 52, 224 64, 260 6 L236 52 C196 70, 44 70, 14 46 Z`, { fill: p.wood, stroke: ink(p, "AA"), strokeWeight: 1.8 });
    for (let i = 0; i < 4; i += 1) curve(x + 16 * s, y + 16 * s + i * 9 * s, x + 244 * s, y + 16 * s + i * 9 * s, 4, { stroke: p.woodDark, strokeWeight: 0.8, opacity: 0.55 });
    line(x + 128 * s, y + 6 * s, x + 128 * s, y - 176 * s, { stroke: p.woodDark, strokeWeight: 3 });
    vec(x + 134 * s, y - 168 * s, 104 * s, 140 * s, `M0 0 L104 140 L0 140 Z`, { fill: p.cream, stroke: ink(p, "99"), strokeWeight: 1.4 });
    vec(x + 30 * s, y - 142 * s, 92 * s, 118 * s, `M92 0 L0 118 L92 118 Z`, { fill: p.paper, stroke: ink(p, "99"), strokeWeight: 1.4 });
    for (let i = 1; i < 4; i += 1) line(x + 134 * s, y - 168 * s + i * 35 * s, x + 134 * s + 104 * s * (i * 35 / 140), y - 168 * s + i * 35 * s, { stroke: ink(p, "26"), strokeWeight: 0.7 });
    for (let i = 1; i < 4; i += 1) line(x + 30 * s + 92 * s * (1 - i * 30 / 118), y - 142 * s + i * 30 * s, x + 122 * s, y - 142 * s + i * 30 * s, { stroke: ink(p, "26"), strokeWeight: 0.7 });
    line(x + 128 * s, y - 176 * s, x + 238 * s, y + 6 * s, { stroke: ink(p, "66"), strokeWeight: 0.9 });
    line(x + 128 * s, y - 176 * s, x + 16 * s, y + 6 * s, { stroke: ink(p, "66"), strokeWeight: 0.9 });
    vec(x + 128 * s, y - 190 * s, 26 * s, 14 * s, `M0 0 L26 7 L0 14 Z`, { fill: p.accent, stroke: ink(p, "66"), strokeWeight: 0.7 });
  });
}
function scroll(p, x, y, s = 1) {
  inArch(() => {
    const w = 210 * s; const h = 104 * s;
    ell(x - 6 * s, y + h * 0.62, w * 1.04, h * 0.26, { fill: p.shadow, opacity: 0.16 });
    vec(x, y, w, h, `M${w * 0.08} 0 Q0 ${h * 0.5} ${w * 0.08} ${h} L${w * 0.92} ${h} Q${w} ${h * 0.5} ${w * 0.92} 0 Z`, { fill: p.paper, stroke: ink(p, "AA"), strokeWeight: 1.6 });
    ell(x - w * 0.035, y - h * 0.08, w * 0.12, h * 1.16, { fill: p.cream, stroke: ink(p, "99"), strokeWeight: 1.3 });
    ell(x + w * 0.915, y - h * 0.08, w * 0.12, h * 1.16, { fill: p.cream, stroke: ink(p, "99"), strokeWeight: 1.3 });
    ell(x - w * 0.035 + w * 0.03, y + h * 0.4, w * 0.06, h * 0.2, { fill: "none", stroke: ink(p, "44"), strokeWeight: 0.8 });
    ell(x + w * 0.915 + w * 0.03, y + h * 0.4, w * 0.06, h * 0.2, { fill: "none", stroke: ink(p, "44"), strokeWeight: 0.8 });
    line(x - w * 0.035 + w * 0.06, y - h * 0.08, x - w * 0.035 + w * 0.06, y + h * 1.08, { stroke: ink(p, "33"), strokeWeight: 0.7 });
    line(x + w * 0.915 + w * 0.06, y - h * 0.08, x + w * 0.915 + w * 0.06, y + h * 1.08, { stroke: ink(p, "33"), strokeWeight: 0.7 });
    for (let i = 0; i < 6; i += 1) {
      const col = i % 2; const row = Math.floor(i / 2);
      const lx = x + w * (col ? 0.52 : 0.16); const lw = w * (col ? 0.3 : 0.3) - (row === 2 ? 12 * s : 0);
      for (let j = 0; j < 3; j += 1) line(lx, y + h * (0.16 + row * 0.26 + j * 0.07), lx + lw, y + h * (0.16 + row * 0.26 + j * 0.07), { stroke: ink(p, "44"), strokeWeight: 0.7, opacity: 0.6 });
    }
    // tie ribbon + seal
    curve(x + w * 0.5, y + h, x + w * 0.5 + 16 * s, y + h + 16 * s, 6 * s, { stroke: p.accent, strokeWeight: 1.6 });
    ell(x + w * 0.74, y + h * 0.66, 13 * s, 13 * s, { fill: p.accent, stroke: ink(p, "66"), strokeWeight: 0.7 });
    ell(x + w * 0.74, y + h * 0.66, 6 * s, 6 * s, { fill: "none", stroke: alpha(p.cream, "88"), strokeWeight: 0.8 });
  });
}
function lamp(p, x, y, s = 1) {
  inArch(() => {
    glow(x + 40 * s, y - 14 * s, 34 * s, p.glow, 0.9);
    ell(x - 24 * s, y + 16 * s, 60 * s, 12 * s, { fill: p.shadow, opacity: 0.2 });
    // shallow oil bowl (side view)
    vec(x - 22 * s, y - 4 * s, 44 * s, 18 * s, `M0 4 C4 16, 40 16, 44 4 C38 0, 30 -2, 22 -2 C14 -2, 6 0, 0 4 Z`, { fill: p.rose, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    ell(x - 14 * s, y - 2 * s, 28 * s, 6 * s, { fill: alpha(p.flameCore, "77") });
    // pinched spout to the right
    vec(x + 20 * s, y - 2 * s, 20 * s, 10 * s, `M0 2 L20 4 L0 10 Z`, { fill: p.rose, stroke: ink(p, "99"), strokeWeight: 1.1 });
    // handle loop left
    curve(x - 22 * s, y + 2 * s, x - 34 * s, y + 10 * s, 8 * s, { stroke: ink(p, "AA"), strokeWeight: 2.4 });
    // flame at the spout
    ell(x + 38 * s, y - 6 * s, 8 * s, 6 * s, { fill: p.flameCore });
    vec(x + 36 * s, y - 24 * s, 10 * s, 22 * s, `M5 22 C-1 12, 0 5, 5 0 C10 5, 11 12, 5 22 Z`, { fill: p.flame, stroke: alpha(p.accent, "88"), strokeWeight: 0.6 });
  });
}
function table(p, y = 400, x = 60, w = 440) {
  inArch(() => {
    rect(x, y, w, 18, { fill: p.wood, stroke: ink(p, "99"), strokeWeight: 1.4 });
    rect(x, y, w, 5, { fill: p.apricot, opacity: 0.8 });
    rect(x + 26, y + 18, 16, 64, { fill: p.woodDark, stroke: ink(p, "88"), strokeWeight: 1.1 });
    rect(x + w - 42, y + 18, 16, 64, { fill: p.woodDark, stroke: ink(p, "88"), strokeWeight: 1.1 });
    ell(x + 18, y + 80, 40, 9, { fill: p.shadow, opacity: 0.15 });
    ell(x + w - 50, y + 80, 40, 9, { fill: p.shadow, opacity: 0.15 });
    for (let i = 0; i < 9; i += 1) line(x + 14 + i * (w / 9), y + 9, x + 34 + i * (w / 9), y + 11, { stroke: ink(p, "26"), strokeWeight: 0.6 });
    vec(x + w * 0.2, y - 4, w * 0.6, 10, `M0 10 L${w * 0.06} 0 L${w * 0.54} 0 L${w * 0.6} 10 Z`, { fill: p.cream, opacity: 0.85, stroke: ink(p, "44"), strokeWeight: 0.7 });
  });
}
function bread(p, x, y, s = 1) {
  inArch(() => {
    ell(x, y, 84 * s, 38 * s, { fill: p.gold, stroke: ink(p, "99"), strokeWeight: 1.3 });
    ell(x + 8 * s, y + 4 * s, 60 * s, 24 * s, { fill: alpha(p.flameCore, "88") });
    for (let i = 0; i < 3; i += 1) line(x + 18 * s + i * 16 * s, y + 8 * s, x + 26 * s + i * 16 * s, y + 26 * s, { stroke: p.accent, strokeWeight: 1.1, opacity: 0.7 });
  });
}
function cup(p, x, y, s = 1) {
  inArch(() => {
    // goblet: rounded bowl, stem, flared foot
    vec(x, y, 36 * s, 26 * s, `M0 0 L36 0 C36 16, 28 26, 18 26 C8 26, 0 16, 0 0 Z`, { fill: p.blush, stroke: ink(p, "99"), strokeWeight: 1.3 });
    ell(x + 2 * s, y - 1 * s, 32 * s, 6 * s, { fill: p.plum, opacity: 0.75 });
    rect(x + 15 * s, y + 26 * s, 6 * s, 10 * s, { fill: p.stoneDark, stroke: ink(p, "77"), strokeWeight: 0.6 });
    vec(x + 6 * s, y + 36 * s, 24 * s, 7 * s, `M4 0 L20 0 L24 7 L0 7 Z`, { fill: p.stone, stroke: ink(p, "77"), strokeWeight: 0.8 });
    curve(x + 32 * s, y + 4 * s, x + 44 * s, y + 14 * s, 8 * s, { stroke: ink(p, "99"), strokeWeight: 2 });
  });
}
function grapes(p, x, y, s = 1) {
  inArch(() => {
    const r = rng(23);
    const rows = [4, 3, 2, 1];
    let yy = y;
    rows.forEach((n, ri) => {
      for (let i = 0; i < n; i += 1) ell(x - (n - 1) * 5 * s + i * 10 * s + (r() - 0.5) * 2, yy + ri * 9 * s, 9 * s, 9 * s, { fill: ri % 2 ? p.plum : p.rose, stroke: ink(p, "77"), strokeWeight: 0.7 });
    });
    curve(x, y - 6 * s, x + 16 * s, y - 30 * s, 9 * s, { stroke: p.oliveDark, strokeWeight: 1.6 });
    ell(x + 4 * s, y - 26 * s, 20 * s, 9 * s, { fill: p.olive, stroke: ink(p, "66"), strokeWeight: 0.7, rotation: -24 });
    ell(x - 8 * s, y - 18 * s, 16 * s, 8 * s, { fill: p.oliveLight, stroke: ink(p, "55"), strokeWeight: 0.6, rotation: 18 });
    curve(x + 14 * s, y - 24 * s, x + 30 * s, y - 16 * s, 8 * s, { stroke: p.oliveDark, strokeWeight: 0.9, opacity: 0.8 });
    curve(x + 28 * s, y - 16 * s, x + 24 * s, y - 6 * s, 6 * s, { stroke: p.oliveDark, strokeWeight: 0.9, opacity: 0.8 });
  });
}
function wheat(p, x, y, s = 1) {
  inArch(() => {
    for (let i = 0; i < 5; i += 1) {
      const bx = x + i * 8 * s;
      curve(bx, y, bx + 6 * s, y - 74 * s, 6 * s, { stroke: p.gold, strokeWeight: 1.2 });
      for (let j = 0; j < 5; j += 1) {
        ell(bx + 1 * s + j, y - 20 * s - j * 9 * s, 6 * s, 10 * s, { fill: p.gold, stroke: ink(p, "55"), strokeWeight: 0.5, rotation: 26 });
        ell(bx + 7 * s + j, y - 24 * s - j * 9 * s, 6 * s, 10 * s, { fill: p.gold, stroke: ink(p, "55"), strokeWeight: 0.5, rotation: -26 });
      }
    }
  });
}
function well(p, x, y, s = 1) {
  inArch(() => {
    ell(x - 76 * s, y + 96 * s, 200 * s, 26 * s, { fill: p.shadow, opacity: 0.16 });
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const bx = x - 62 * s + col * 26 * s + (row % 2) * 9 * s;
        const by = y + 40 * s - row * 20 * s;
        rect(bx, by, 23 * s, 17 * s, { fill: row % 2 ? p.stone : p.stoneLight, stroke: ink(p, "77"), strokeWeight: 0.8 });
      }
    }
    ell(x - 56 * s, y - 42 * s, 116 * s, 26 * s, { fill: p.stoneDark, stroke: ink(p, "88"), strokeWeight: 1 });
    ell(x - 46 * s, y - 38 * s, 96 * s, 18 * s, { fill: p.waterDark, opacity: 0.8 });
    rect(x - 72 * s, y - 118 * s, 9 * s, 120 * s, { fill: p.woodDark, stroke: ink(p, "88"), strokeWeight: 1 });
    rect(x + 62 * s, y - 118 * s, 9 * s, 120 * s, { fill: p.woodDark, stroke: ink(p, "88"), strokeWeight: 1 });
    vec(x - 92 * s, y - 148 * s, 184 * s, 34 * s, `M0 34 L92 0 L184 34 Z`, { fill: p.wood, stroke: ink(p, "99"), strokeWeight: 1.3 });
    for (let i = 1; i < 5; i += 1) line(x - 92 * s + i * 36 * s, y - 148 * s + 34 - i * 6, x - 92 * s + i * 36 * s, y - 114 * s, { stroke: ink(p, "26"), strokeWeight: 0.6 });
    line(x - 2 * s, y - 114 * s, x - 2 * s, y - 40 * s, { stroke: ink(p, "88"), strokeWeight: 1.3 });
    rect(x - 14 * s, y - 44 * s, 24 * s, 18 * s, { fill: p.wood, stroke: ink(p, "88"), strokeWeight: 1 });
    ell(x + 66 * s, y + 40 * s, 26 * s, 34 * s, { fill: p.blush, stroke: ink(p, "88"), strokeWeight: 1.1 });
    ell(x + 72 * s, y + 34 * s, 14 * s, 8 * s, { fill: p.cream, opacity: 0.5 });
  });
}
function dove(p, x, y, s = 1) {
  inArch(() => {
    // tail fan
    vec(x - 20 * s, y + 26 * s, 26 * s, 26 * s, `M26 14 L0 4 L6 16 L0 26 L26 22 Z`, { fill: p.cream, stroke: ink(p, "99"), strokeWeight: 1.2 });
    // body
    vec(x, y + 10 * s, 116 * s, 44 * s, `M0 30 C20 12, 50 2, 84 4 C104 6, 116 18, 112 30 C108 42, 84 46, 60 44 C40 42, 16 40, 0 30 Z`, { fill: p.cream, stroke: ink(p, "AA"), strokeWeight: 1.5 });
    // head
    ell(x + 96 * s, y + 2 * s, 22 * s, 20 * s, { fill: p.cream, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    vec(x + 116 * s, y + 8 * s, 14 * s, 8 * s, `M0 4 L14 0 L14 8 Z`, { fill: p.gold, stroke: ink(p, "77"), strokeWeight: 0.6 });
    ell(x + 106 * s, y + 9 * s, 2.6 * s, 2.6 * s, { fill: p.ink });
    // raised wing
    vec(x + 34 * s, y - 16 * s, 66 * s, 40 * s, `M6 40 C14 12, 44 0, 66 8 C50 16, 30 26, 18 40 Z`, { fill: p.paper, stroke: ink(p, "99"), strokeWeight: 1.3 });
    for (let i = 1; i < 4; i += 1) curve(x + 40 * s, y + 2 * s + i * 7 * s, x + 88 * s, y + 4 * s + i * 6 * s, 3, { stroke: ink(p, "33"), strokeWeight: 0.7 });
    // olive branch in beak
    curve(x + 128 * s, y + 12 * s, x + 168 * s, y + 30 * s, -10 * s, { stroke: p.oliveDark, strokeWeight: 1.6 });
    for (let i = 0; i < 5; i += 1) ell(x + 132 * s + i * 8 * s, y + 16 * s + i * 4 * s, 14 * s, 6 * s, { fill: p.olive, stroke: ink(p, "44"), strokeWeight: 0.4, rotation: -28, opacity: 0.95 });
  });
}
function harp(p, x, y, s = 1) {
  inArch(() => {
    ell(x - 74 * s, y + 62 * s, 150 * s, 18 * s, { fill: p.shadow, opacity: 0.16 });
    // soundbox: the slanted base from bottom-left up to the right
    vec(x - 74 * s, y + 8 * s, 148 * s, 58 * s, `M0 44 L148 0 L148 16 L10 58 Z`, { fill: p.woodDark, stroke: ink(p, "AA"), strokeWeight: 1.5 });
    // pillar: left vertical
    rect(x - 74 * s, y - 74 * s, 12 * s, 122 * s, { fill: p.wood, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    // neck: curved top from pillar head to soundbox tip
    vec(x - 74 * s, y - 92 * s, 148 * s, 100 * s, `M0 18 C40 -12, 108 -6, 148 74 L136 82 C100 12, 44 6, 6 30 Z`, { fill: p.wood, stroke: ink(p, "AA"), strokeWeight: 1.5 });
    for (let i = 0; i < 8; i += 1) {
      const t = (i + 1) / 9;
      const sx = x - 62 * s + t * 128 * s;
      const neckY = y - 74 * s + (1 - Math.cos(t * Math.PI / 2)) * 78 * s;
      const boxY = y + 52 * s - t * 44 * s;
      line(sx, neckY, sx, boxY, { stroke: p.cream, strokeWeight: 1, opacity: 0.9 });
    }
    for (let i = 0; i < 4; i += 1) ell(x - 70 * s + i * 3 * s, y - 60 * s + i * 16 * s, 5 * s, 5 * s, { fill: p.gold });
    ell(x + 66 * s, y + 6 * s, 8 * s, 8 * s, { fill: p.gold });
  });
}
function gate(p, x, y, s = 1) {
  inArch(() => {
    ell(x - 80 * s, y - 4 * s, 160 * s, 16 * s, { fill: p.shadow, opacity: 0.15 });
    rect(x - 74 * s, y - 150 * s, 15 * s, 150 * s, { fill: p.woodDark, stroke: ink(p, "99"), strokeWeight: 1.2 });
    rect(x + 59 * s, y - 150 * s, 15 * s, 150 * s, { fill: p.woodDark, stroke: ink(p, "99"), strokeWeight: 1.2 });
    vec(x - 92 * s, y - 178 * s, 184 * s, 34 * s, `M0 34 L92 0 L184 34 Z`, { fill: p.wood, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    for (const side of [-1, 1]) {
      const dx = side * 60 * s;
      vec(x + dx - (side < 0 ? 44 * s : 0), y - 140 * s, 44 * s, 132 * s, `M0 0 L44 ${side < 0 ? 10 : -10} L44 ${132 + (side < 0 ? -10 : 10)} L0 132 Z`, { fill: p.wood, stroke: ink(p, "99"), strokeWeight: 1.2, opacity: 0.95 });
      for (let i = 1; i < 4; i += 1) line(x + dx - (side < 0 ? 44 * s : 0) + i * 11 * s, y - 138 * s, x + dx - (side < 0 ? 44 * s : 0) + i * 11 * s, y - 12 * s, { stroke: ink(p, "33"), strokeWeight: 0.8 });
    }
    for (let i = 0; i < 4; i += 1) ell(x - 14 * s + i * 4 * s, y + 8 * s + i * 14 * s, (24 + i * 10) * s, (7 + i * 3) * s, { fill: i % 2 ? p.stone : p.stoneLight, opacity: 0.85, stroke: ink(p, "33"), strokeWeight: 0.5 });
  });
}
function cross(p, x, y, s = 1) {
  inArch(() => {
    rect(x - 6 * s, y - 116 * s, 12 * s, 152 * s, { fill: p.wood, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    rect(x - 44 * s, y - 80 * s, 88 * s, 12 * s, { fill: p.wood, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    line(x - 2 * s, y - 110 * s, x - 2 * s, y + 30 * s, { stroke: p.woodDark, strokeWeight: 0.8, opacity: 0.6 });
  });
}
function doorway(p, x, baseY, w = 260, h = 330) {
  inArch(() => {
    rect(x - w / 2 - 20, baseY - 14, w + 40, 14, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1.1 });
    rect(x - w / 2 - 34, baseY, w + 68, 12, { fill: p.stoneLight, stroke: ink(p, "77"), strokeWeight: 1 });
    rect(x - w / 2, baseY - h, w, h, { fill: p.stoneLight, stroke: ink(p, "99"), strokeWeight: 1.6, cornerRadius: [w / 2, w / 2, 0, 0] });
    for (let i = 0; i < 7; i += 1) {
      const a = Math.PI + (i / 6) * Math.PI;
      const cx = x + Math.cos(a) * (w / 2 - 8); const cy = baseY - h + w / 2 + Math.sin(a) * (w / 2 - 8);
      line(x + Math.cos(a) * (w / 2), baseY - h + w / 2 + Math.sin(a) * (w / 2), cx, cy, { stroke: ink(p, "44"), strokeWeight: 0.9 });
    }
    const iw = w - 40;
    vec(x - iw / 2, baseY - h + 20, iw, h - 20, `M0 ${h - 20} L0 ${iw / 2} Q${iw / 2} 0 ${iw} ${iw / 2} L${iw} ${h - 20} Z`, { fills: [lin([alpha(p.sunCore, "EE"), alpha(p.glow, "CC"), alpha(p.accent, "66")])] , stroke: ink(p, "88"), strokeWeight: 1.2 });
    for (let i = 1; i < 4; i += 1) line(x - iw / 2 + (iw / 4) * i, baseY - h + 20 + iw / 2, x - iw / 2 + (iw / 4) * i, baseY, { stroke: ink(p, "33"), strokeWeight: 1.4 });
    for (let i = 1; i < 4; i += 1) line(x - iw / 2, baseY - (h - 20) * (i / 4), x + iw / 2, baseY - (h - 20) * (i / 4), { stroke: ink(p, "26"), strokeWeight: 1 });
    const cols = [p.blush, p.lavender, p.cyan, p.peach];
    for (let i = 0; i < 4; i += 1) rect(x - iw / 2 + 6 + (i % 2) * (iw / 2), baseY - h + 40 + Math.floor(i / 2) * ((h - 60) / 2), iw / 2 - 12, (h - 70) / 2, { fill: cols[i], opacity: 0.28 });
  });
}
function road(p, x, y, w = 200, h = 200) {
  inArch(() => {
    // winding path: narrow at the horizon, widening toward the viewer
    vec(x, y, w, h, `M${w * 0.44} 0 C${w * 0.34} ${h * 0.32}, ${w * 0.14} ${h * 0.6}, ${w * 0.06} ${h} L${w * 0.94} ${h} C${w * 0.8} ${h * 0.62}, ${w * 0.62} ${h * 0.34}, ${w * 0.56} 0 Z`, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1.3 });
    for (let i = 1; i < 7; i += 1) {
      const t = i / 7;
      const cx = w * (0.5 - 0.06 * Math.sin(t * 3));
      ell(x + cx - (5 + t * 12), y + h * t - 3, (10 + t * 24), (4 + t * 6), { fill: i % 2 ? p.stoneLight : p.cream, opacity: 0.85, stroke: ink(p, "33"), strokeWeight: 0.5 });
    }
    for (let i = 0; i < 6; i += 1) {
      const t = (i + 0.5) / 6;
      const cx = w * (0.5 - 0.05 * Math.sin(t * 3));
      line(x + cx, y + h * t, x + cx, y + h * t + h * 0.06, { stroke: ink(p, "44"), strokeWeight: 1, dashes: [3, 4] });
    }
    for (let i = 0; i < 8; i += 1) {
      const t = (i + 0.5) / 8;
      const lx = w * (0.44 - 0.36 * t); const rx = w * (0.56 + 0.36 * t);
      ell(x + lx - 6, y + h * t, 6, 3, { fill: p.stone, opacity: 0.6 });
      ell(x + rx + 2, y + h * t + 4, 6, 3, { fill: p.stone, opacity: 0.6 });
    }
  });
}
function tent(p, x, baseY, s = 1) {
  inArch(() => {
    ell(x - 60 * s, baseY - 4 * s, 120 * s, 14 * s, { fill: p.shadow, opacity: 0.16 });
    vec(x - 56 * s, baseY - 78 * s, 112 * s, 78 * s, `M56 0 L112 78 L0 78 Z`, { fill: p.cream, stroke: ink(p, "99"), strokeWeight: 1.4 });
    for (let i = 1; i < 4; i += 1) line(x - 56 * s + 56 * s * (i / 4), baseY - 78 * s + 78 * s * (i / 4), x - 56 * s + 56 * s, baseY - 78 * s + 78 * s, { stroke: ink(p, "26"), strokeWeight: 0.7 });
    vec(x - 14 * s, baseY - 40 * s, 28 * s, 40 * s, `M14 0 L28 40 L0 40 Z`, { fill: p.shadow, opacity: 0.5, stroke: ink(p, "77"), strokeWeight: 0.9 });
    line(x - 56 * s, baseY - 78 * s + 78 * s, x - 74 * s, baseY, { stroke: ink(p, "66"), strokeWeight: 1 });
    line(x + 56 * s, baseY, x + 74 * s, baseY, { stroke: ink(p, "66"), strokeWeight: 1 });
    line(x, baseY - 78 * s, x, baseY - 92 * s, { stroke: p.woodDark, strokeWeight: 1.6 });
  });
}
function columns(p, x, y, s = 1) {
  inArch(() => {
    for (let i = 0; i < 2; i += 1) {
      const cx = x + i * 110 * s;
      rect(cx, y, 26 * s, 140 * s, { fill: p.stoneLight, stroke: ink(p, "99"), strokeWeight: 1.2 });
      for (let j = 1; j < 4; j += 1) line(cx + j * 6.5 * s, y + 6, cx + j * 6.5 * s, y + 134 * s, { stroke: ink(p, "26"), strokeWeight: 0.7 });
      rect(cx - 6 * s, y - 10 * s, 38 * s, 12 * s, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1 });
      rect(cx - 6 * s, y + 138 * s, 38 * s, 12 * s, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1 });
    }
    rect(x - 12 * s, y - 22 * s, 150 * s, 12 * s, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1 });
  });
}
function compass(p, x, y, s = 1) {
  inArch(() => {
    ell(x - 4 * s, y + 8 * s, 176 * s, 176 * s, { fill: p.shadow, opacity: 0.14 });
    ell(x, y, 168 * s, 168 * s, { fill: p.paper, stroke: ink(p, "AA"), strokeWeight: 1.8 });
    ell(x + 9 * s, y + 9 * s, 150 * s, 150 * s, { fill: "none", stroke: p.stone, strokeWeight: 1 });
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      line(x + 84 * s + Math.cos(a) * 66 * s, y + 84 * s + Math.sin(a) * 66 * s, x + 84 * s + Math.cos(a) * (i % 4 ? 72 : 78) * s, y + 84 * s + Math.sin(a) * (i % 4 ? 72 : 78) * s, { stroke: ink(p, "99"), strokeWeight: i % 4 ? 1 : 1.8 });
    }
    vec(x + 40 * s, y + 40 * s, 88 * s, 88 * s, `M44 0 L56 44 L44 88 L32 44 Z`, { fill: p.accent, stroke: ink(p, "77"), strokeWeight: 0.8 });
    vec(x + 40 * s, y + 40 * s, 88 * s, 88 * s, `M0 44 L44 32 L88 44 L44 56 Z`, { fill: p.gold, stroke: ink(p, "77"), strokeWeight: 0.8 });
    ell(x + 79 * s, y + 79 * s, 10 * s, 10 * s, { fill: p.ink });
  });
}
function lighthouse(p, x, baseY, s = 1) {
  inArch(() => {
    vec(x - 40 * s, baseY - 20 * s, 90 * s, 26 * s, `M0 26 C14 6, 66 4, 90 26 Z`, { fill: p.stoneDark, stroke: ink(p, "88"), strokeWeight: 1 });
    vec(x - 24 * s, baseY - 190 * s, 48 * s, 172 * s, `M8 172 L14 26 L34 26 L40 172 Z`, { fill: p.stoneLight, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    for (let i = 0; i < 3; i += 1) vec(x - 22 * s + i * 1.5, baseY - 160 * s + i * 46 * s, 44 * s - i * 3, 16 * s, `M0 16 L4 ${0} L40 0 L44 16 Z`, { fill: p.accent, opacity: 0.75 });
    rect(x - 30 * s, baseY - 200 * s, 60 * s, 12 * s, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1 });
    rect(x - 18 * s, baseY - 228 * s, 36 * s, 28 * s, { fill: p.sunCore, opacity: 0.95, stroke: ink(p, "88"), strokeWeight: 1 });
    line(x - 6 * s, baseY - 228 * s, x - 6 * s, baseY - 200 * s, { stroke: ink(p, "44"), strokeWeight: 0.8 });
    line(x + 6 * s, baseY - 228 * s, x + 6 * s, baseY - 200 * s, { stroke: ink(p, "44"), strokeWeight: 0.8 });
    vec(x - 26 * s, baseY - 244 * s, 52 * s, 16 * s, `M0 16 L26 0 L52 16 Z`, { fill: p.stoneDark, stroke: ink(p, "88"), strokeWeight: 1 });
    vec(x + 18 * s, baseY - 226 * s, 150 * s, 70 * s, `M0 35 L150 0 L150 70 Z`, { fill: p.sunCore, opacity: 0.2 });
    vec(x - 168 * s, baseY - 226 * s, 150 * s, 70 * s, `M150 35 L0 0 L0 70 Z`, { fill: p.sunCore, opacity: 0.14 });
  });
}
function stable(p, x, baseY, s = 1) {
  inArch(() => {
    rect(x - 70 * s, baseY - 74 * s, 140 * s, 74 * s, { fill: p.stone, stroke: ink(p, "99"), strokeWeight: 1.3 });
    for (let i = 0; i < 5; i += 1) line(x - 66 * s + i * 30 * s, baseY - 70 * s, x - 66 * s + i * 30 * s, baseY - 4 * s, { stroke: ink(p, "26"), strokeWeight: 0.7 });
    vec(x - 84 * s, baseY - 104 * s, 168 * s, 32 * s, `M0 32 L84 0 L168 32 Z`, { fill: p.wood, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    for (let i = 1; i < 6; i += 1) line(x - 84 * s + i * 28 * s, baseY - 104 * s + 32 - i * 5, x - 84 * s + i * 28 * s, baseY - 72 * s, { stroke: ink(p, "33"), strokeWeight: 0.7 });
    vec(x - 24 * s, baseY - 56 * s, 48 * s, 56 * s, `M0 56 L0 20 Q24 0 48 20 L48 56 Z`, { fill: p.shadow, opacity: 0.55, stroke: ink(p, "88"), strokeWeight: 1 });
    rect(x - 30 * s, baseY - 26 * s, 60 * s, 16 * s, { fill: p.wood, stroke: ink(p, "99"), strokeWeight: 1 });
    for (let i = 0; i < 5; i += 1) line(x - 26 * s + i * 12 * s, baseY - 26 * s, x - 20 * s + i * 12 * s, baseY - 36 * s, { stroke: p.gold, strokeWeight: 1.2 });
    ell(x - 8 * s, baseY - 34 * s, 16 * s, 10 * s, { fill: p.cream, stroke: ink(p, "77"), strokeWeight: 0.8 });
  });
}
function tomb(p, x, baseY) {
  inArch(() => {
    ell(x - 130, baseY - 6, 260, 18, { fill: p.shadow, opacity: 0.18 });
    // rock face
    vec(x - 140, baseY - 120, 280, 120, `M0 120 C20 40, 80 8, 140 6 C210 8, 262 44, 280 120 Z`, { fill: p.stone, stroke: ink(p, "99"), strokeWeight: 1.4 });
    for (let i = 1; i < 4; i += 1) curve(x - 120 + i * 20, baseY - 100 + i * 18, x + 120 - i * 16, baseY - 96 + i * 20, 6, { stroke: ink(p, "26"), strokeWeight: 0.8 });
    // empty cave mouth (rounded rect, not an arch window)
    rect(x - 50, baseY - 92, 100, 92, { fill: p.shadow, opacity: 0.85, cornerRadius: [16, 16, 0, 0], stroke: ink(p, "AA"), strokeWeight: 1.3 });
    ell(x - 34, baseY - 40, 68, 40, { fills: [lin([alpha(p.sunCore, "CC"), alpha(p.glow, "55")])] , opacity: 0.8 });
    // rolled-away stone
    ell(x + 62, baseY - 62, 66, 66, { fill: p.stoneLight, stroke: ink(p, "AA"), strokeWeight: 1.4 });
    ell(x + 74, baseY - 50, 42, 42, { fill: "none", stroke: ink(p, "33"), strokeWeight: 1 });
    curve(x + 70, baseY - 58, x + 116, baseY - 30, 10, { stroke: alpha(p.sunCore, "88"), strokeWeight: 1.6, opacity: 0.7 });
    // threshold step
    rect(x - 66, baseY - 6, 132, 8, { fill: p.stoneLight, stroke: ink(p, "77"), strokeWeight: 1 });
  });
}
function bigStar(p, x, y, r) {
  inArch(() => {
    glow(x, y, r, p.glow, 0.85);
    node("star", x - r, y - r, r * 2, r * 2, { pointCount: 8, innerRadius: 0.32, fill: p.gold, stroke: alpha(p.sunCore, "AA"), strokeWeight: 1 });
    line(x, y + r, x, y + r + 60, { stroke: p.gold, strokeWeight: 1.4, opacity: 0.6, dashes: [4, 5] });
  });
}

// ---------------------------------------------------------------- scenes
// Every scene keeps its story inside local y ~90..440; below that is a calm
// colour field because the app's title gradient covers the cover's bottom.
const SCENES = {
  "whole-bible-1-year": (p) => {
    archSky(p); archSun(p, { x: 330, y: 130, r: 52 }); archClouds(p, 11); archBirds(p, 12, 4, 110);
    archHills(p, 268, [p.far, p.mid], 13);
    archGround(p, 330, p.olive);
    meadow(p, 430, 16);
    village(p, 380, 330, 0.62, 14, 0);
    oliveTree(p, 120, 352, 0.82, 15);
    stoneLedge(p, 150, 372, 260, 34);
    scroll(p, 180, 292, 0.72);
    lamp(p, 372, 354, 0.8);
    archFlowers(p, 400, 17, 12, 40);
  },
  "whole-bible-2-year": (p) => {
    archSky(p); archSun(p, { x: 180, y: 120, r: 48 }); archClouds(p, 21); archBirds(p, 22, 3, 100);
    archHills(p, 262, [p.far, p.mid], 23);
    archGround(p, 322, p.mid);
    meadow(p, 430, 26);
    oliveTree(p, 380, 340, 0.9, 24);
    oliveTree(p, 120, 324, 0.6, 25);
    road(p, 150, 310, 190, 100);
    for (let i = 0; i < 4; i += 1) {
      inArch(() => { rect(120 + i * 26, 330 - i * 6, 9, 16, { fill: p.stone, stroke: ink(p, "77"), strokeWeight: 0.8 }); });
    }
    cypress(p, 470, 330, 80, 0.9);
    archFlowers(p, 400, 27, 14, 40);
  },
  "new-testament-90": (p) => {
    archSky(p); archSun(p, { x: 170, y: 120, r: 50 }); archClouds(p, 31); archBirds(p, 32, 5, 100);
    archHills(p, 258, [p.far, p.mid], 33);
    headland(p, 420, 302, 160, p.far);
    village(p, 420, 296, 0.42, 34, 2);
    archWater(p, 316);
    sunGlitter(p, 170, 316, 12);
    boat(p, 140, 330, 0.86);
    archReeds(p, 30, 470, 8, 35);
  },
  "new-testament-1-year": (p) => {
    archSky(p, true); archStars(p, 40, 41); archMoon(p, { x: 430, y: 100, r: 34 });
    archHills(p, 300, NH, 42);
    archGround(p, 372, NF);
    meadow(p, 430, 43);
    tomb(p, 280, 380);
    cross(p, 120, 350, 0.6);
    inArch(() => { glow(280, 352, 62, p.sunCore, 0.7); });
    lamp(p, 440, 360, 0.7);
  },
  "gospels-30": (p) => {
    archSky(p); archSun(p, { x: 400, y: 120, r: 46 }); archClouds(p, 51); archBirds(p, 52, 3, 100);
    archHills(p, 262, [p.far, p.mid], 53);
    archGround(p, 330, p.mid);
    meadow(p, 430, 54);
    cypress(p, 70, 320, 90, 0.9); cypress(p, 490, 316, 74, 0.8);
    table(p, 344, 70, 420);
    bread(p, 120, 306, 0.9); cup(p, 214, 301, 0.9); grapes(p, 300, 308, 0.8);
    scroll(p, 330, 288, 0.5); lamp(p, 452, 328, 0.72);
    archFlowers(p, 400, 55, 12, 40);
  },
  "jesus-life-21": (p) => {
    archSky(p, true); archStars(p, 70, 61);
    bigStar(p, 300, 110, 40);
    archHills(p, 292, NH, 62);
    archGround(p, 352, NF);
    meadow(p, 430, 64);
    village(p, 400, 336, 0.5, 63, 1);
    stable(p, 160, 360, 0.9);
    palm(p, 470, 360, 0.7);
  },
  "psalms-30": (p) => {
    archSky(p, true); archStars(p, 70, 71); archMoon(p, { x: 400, y: 104, r: 40 });
    archHills(p, 276, NH, 72);
    archGround(p, 340, NF);
    meadow(p, 430, 75);
    harp(p, 210, 330, 0.9);
    oliveTree(p, 430, 340, 0.62, 73, false);
    archWater(p, 420, true); sunGlitter(p, 400, 420, 10);
    archReeds(p, 40, 430, 7, 74);
  },
  "psalms-90": (p) => {
    archSky(p, true); archStars(p, 60, 81); archMoon(p, { x: 160, y: 110, r: 36 });
    archHills(p, 262, NH, 82);
    archWater(p, 316, true);
    sunGlitter(p, 160, 316, 12);
    boat(p, 210, 324, 0.62);
    inArch(() => {
      vec(90, 310, 60, 84, `M6 84 C10 56, 22 36, 42 24 C40 40, 40 56, 36 84 M42 24 C48 14, 54 8, 60 4 C57 12, 56 18, 55 24`, { fill: "none", stroke: ink(p, "AA"), strokeWeight: 1.6 });
      line(126, 394, 126, 414, { stroke: ink(p, "88"), strokeWeight: 1.2 });
      line(134, 394, 136, 414, { stroke: ink(p, "88"), strokeWeight: 1.2 });
    });
    archReeds(p, 420, 440, 8, 83);
    archGrass(p, 450, 84, 20, 40);
  },
  "proverbs-31": (p) => {
    archSky(p); archSun(p, { x: 400, y: 120, r: 48 }); archClouds(p, 91); archBirds(p, 92, 4, 100);
    archHills(p, 262, [p.far, p.mid], 93);
    archGround(p, 330, p.olive);
    meadow(p, 430, 96);
    for (let i = 0; i < 3; i += 1) stoneLedge(p, 90 + i * 16, 378 - i * 22, 340 - i * 32, 22);
    oliveTree(p, 260, 336, 1.0, 94);
    archFlowers(p, 400, 95, 20, 50);
  },
  "wisdom-21": (p) => {
    archSky(p); archSun(p, { x: 150, y: 110, r: 44 }); archClouds(p, 101);
    archHills(p, 268, [p.far, p.mid], 102);
    archGround(p, 336, p.mid);
    meadow(p, 430, 103);
    inArch(() => {
      rect(50, 296, 460, 64, { fill: p.stone, stroke: ink(p, "88"), strokeWeight: 1.2 });
      for (let i = 0; i < 15; i += 1) rect(56 + i * 30, 286, 16, 10, { fill: p.stoneLight, stroke: ink(p, "66"), strokeWeight: 0.7 });
      for (let i = 0; i < 10; i += 1) line(60 + i * 46, 306, 60 + i * 46, 356, { stroke: ink(p, "26"), strokeWeight: 0.6 });
    });
    gate(p, 280, 360, 0.66);
    table(p, 344, 110, 340);
    scroll(p, 140, 277, 0.6); lamp(p, 330, 327, 0.76); grapes(p, 400, 319, 0.7);
  },
  "anxiety-14": (p) => {
    archSky(p); archClouds(p, 111, false); archSun(p, { x: 160, y: 110, r: 46 }); archBirds(p, 112, 3, 90);
    archHills(p, 262, [p.far, p.mid], 113);
    archWater(p, 316);
    sunGlitter(p, 160, 316, 12);
    lighthouse(p, 420, 330, 0.86);
    boat(p, 90, 336, 0.56);
    archReeds(p, 30, 460, 7, 114);
    archGrass(p, 460, 115, 20, 40);
  },
  "hope-21": (p) => {
    archSky(p); archSun(p, { x: 280, y: 170, r: 66 }); archClouds(p, 121); archBirds(p, 122, 4, 90);
    archHills(p, 280, [p.far, p.mid], 123);
    archGround(p, 344, p.olive);
    meadow(p, 430, 126);
    dove(p, 180, 210, 0.9);
    oliveTree(p, 430, 352, 0.6, 124);
    archFlowers(p, 380, 125, 26, 70);
  },
  "prayer-14": (p) => {
    archSky(p, true); archStars(p, 56, 131); archMoon(p, { x: 410, y: 96, r: 34 });
    archHills(p, 280, NH, 132);
    archGround(p, 348, NF);
    meadow(p, 430, 133);
    stoneLedge(p, 100, 348, 320, 30);
    lamp(p, 340, 329, 0.86);
    scroll(p, 130, 281, 0.6);
    cypress(p, 70, 340, 84, 0.8); cypress(p, 470, 336, 70, 0.7);
  },
  "gratitude-7": (p) => {
    archSky(p); archSun(p, { x: 400, y: 116, r: 46 }); archClouds(p, 141); archBirds(p, 142, 3, 96);
    archHills(p, 262, [p.far, p.mid], 143);
    archGround(p, 330, p.mid);
    meadow(p, 430, 144);
    table(p, 340, 70, 420);
    bread(p, 116, 302, 0.9); cup(p, 208, 297, 0.9); grapes(p, 288, 304, 0.8);
    wheat(p, 350, 340, 0.9); lamp(p, 452, 324, 0.7);
    archFlowers(p, 400, 145, 12, 40);
  },
  "love-14": (p) => {
    archSky(p); archSun(p, { x: 150, y: 116, r: 46 }); archClouds(p, 151); archBirds(p, 152, 3, 96);
    archHills(p, 268, [p.far, p.mid], 153);
    archGround(p, 336, p.olive);
    meadow(p, 430, 155);
    inArch(() => {
      // arbor posts + beam
      ell(96, 376, 60, 12, { fill: p.shadow, opacity: 0.15 });
      ell(416, 376, 60, 12, { fill: p.shadow, opacity: 0.15 });
      curve(120, 380, 160, 210, -46, { stroke: p.woodDark, strokeWeight: 5 });
      curve(440, 380, 400, 210, 46, { stroke: p.woodDark, strokeWeight: 5 });
      curve(160, 210, 400, 210, 26, { stroke: p.woodDark, strokeWeight: 5 });
      // lattice
      for (let i = 0; i < 5; i += 1) line(150 + i * 55, 232, 190 + i * 55, 300, { stroke: p.wood, strokeWeight: 1.4, opacity: 0.6 });
      for (let i = 0; i < 5; i += 1) line(190 + i * 55, 232, 150 + i * 55, 300, { stroke: p.wood, strokeWeight: 1.4, opacity: 0.6 });
      // foliage mass (two overlapping rows)
      for (let i = 0; i < 11; i += 1) ell(140 + i * 26, 214 + (i % 2) * 10, 46, 22, { fill: i % 3 ? p.olive : p.oliveDark, stroke: ink(p, "44"), strokeWeight: 0.5, opacity: 0.95, rotation: (i % 2 ? 10 : -8) });
      for (let i = 0; i < 9; i += 1) ell(152 + i * 28, 200 + (i % 2) * 8, 34, 16, { fill: p.oliveLight, opacity: 0.7, rotation: (i % 2 ? -12 : 10) });
      // climbing vines on posts
      for (let i = 0; i < 6; i += 1) {
        ell(126 + i * 6, 360 - i * 26, 16, 7, { fill: p.olive, rotation: -30, opacity: 0.9 });
        ell(434 - i * 6, 360 - i * 26, 16, 7, { fill: p.olive, rotation: 30, opacity: 0.9 });
      }
      for (let i = 0; i < 7; i += 1) grapes(p, 172 + i * 36 + (i % 2) * 6, 262 + (i % 3) * 16, 0.4 + (i % 3) * 0.12);
      for (let i = 0; i < 5; i += 1) ell(158 + i * 52, 240 + (i % 2) * 14, 13 + (i % 2) * 4, 10 + (i % 2) * 3, { fill: i % 2 ? p.rose : p.blush, stroke: ink(p, "55"), strokeWeight: 0.6 });
    });
    dove(p, 150, 140, 0.6);
    dove(p, 360, 110, 0.45);
    archFlowers(p, 400, 154, 22, 60);
  },
  "forgiveness-14": (p) => {
    archSky(p); archSun(p, { x: 280, y: 120, r: 50 }); archClouds(p, 161); archBirds(p, 162, 4, 100);
    archHills(p, 266, [p.far, p.mid], 163);
    archGround(p, 332, p.olive);
    meadow(p, 430, 167);
    gate(p, 280, 372, 0.92);
    oliveTree(p, 100, 352, 0.56, 164); oliveTree(p, 460, 348, 0.5, 165);
    archFlowers(p, 400, 166, 20, 60);
  },
  "paul-30": (p) => {
    archSky(p, true); archStars(p, 60, 171); archMoon(p, { x: 420, y: 100, r: 36 });
    archHills(p, 276, NH, 172);
    archGround(p, 340, NF);
    meadow(p, 430, 173);
    inArch(() => {
      vec(40, 336, 480, 40, `M0 40 C80 12, 180 4, 260 8 C360 12, 430 22, 480 40 Z`, { fill: alpha(p.mid, "CC"), stroke: ink(p, "44"), strokeWeight: 1 });
      ell(96, 424, 60, 10, { fill: p.shadow, opacity: 0.2 });
      ell(352, 402, 70, 10, { fill: p.shadow, opacity: 0.2 });
    });
    road(p, 210, 296, 150, 130);
    columns(p, 60, 270, 0.6);
    tent(p, 430, 344, 0.6);
    stoneLedge(p, 90, 380, 150, 22);
    scroll(p, 105, 322, 0.5);
    cross(p, 480, 320, 0.45);
  },
  "story-30": (p) => {
    archSky(p, true); archStars(p, 90, 181); archMoon(p, { x: 150, y: 104, r: 36 });
    archHills(p, 280, NH, 182);
    archGround(p, 352, NF);
    meadow(p, 430, 184);
    inArch(() => { vec(120, 356, 320, 34, `M0 34 C60 10, 140 2, 180 6 C250 10, 290 20, 320 34 Z`, { fill: alpha(p.mid, "CC"), stroke: ink(p, "44"), strokeWeight: 1 }); });
    village(p, 280, 360, 0.92, 183, 0);
    palm(p, 480, 364, 0.66);
  },
  "women-21": (p) => {
    archSky(p); archSun(p, { x: 400, y: 116, r: 46 }); archClouds(p, 191); archBirds(p, 192, 3, 96);
    archHills(p, 266, [p.far, p.mid], 193);
    archGround(p, 334, p.mid);
    meadow(p, 430, 196);
    well(p, 270, 310, 0.92);
    oliveTree(p, 90, 346, 0.56, 194);
    archFlowers(p, 400, 195, 18, 60);
  },
  "new-believer-14": (p) => {
    archSky(p); archSun(p, { x: 160, y: 116, r: 48 }); archClouds(p, 201); archBirds(p, 202, 4, 96);
    archHills(p, 262, [p.far, p.mid], 203);
    archWater(p, 316);
    sunGlitter(p, 160, 316, 12);
    boat(p, 110, 332, 0.72);
    headland(p, 438, 346, 150, p.far);
    inArch(() => {
      rect(400, 248, 76, 96, { fill: p.stoneLight, stroke: ink(p, "99"), strokeWeight: 1.2 });
      vec(392, 226, 92, 26, `M0 26 L46 0 L92 26 Z`, { fill: p.wood, stroke: ink(p, "99"), strokeWeight: 1.2 });
      vec(416, 272, 44, 72, `M0 72 L0 22 Q22 0 44 22 L44 72 Z`, { fill: p.sunCore, opacity: 0.85, stroke: ink(p, "88"), strokeWeight: 1 });
      line(438, 226, 438, 206, { stroke: p.stoneDark, strokeWeight: 1.6 });
      line(430, 214, 446, 214, { stroke: p.stoneDark, strokeWeight: 1.6 });
    });
    dove(p, 250, 200, 0.5);
    archReeds(p, 30, 460, 7, 204);
    archGrass(p, 460, 205, 20, 40);
  },
  custom: (p) => {
    archSky(p, true); archStars(p, 80, 211); archMoon(p, { x: 420, y: 96, r: 32 });
    archHills(p, 280, NH, 212);
    archGround(p, 348, NF);
    meadow(p, 430, 213);
    inArch(() => { ell(180, 392, 200, 18, { fill: p.shadow, opacity: 0.16 }); });
    stoneLedge(p, 180, 370, 180, 24);
    inArch(() => { rect(210, 394, 120, 22, { fill: p.stone, stroke: ink(p, "77"), strokeWeight: 1 }); });
    compass(p, 196, 226, 0.86);
    scroll(p, 110, 400, 0.5);
    lamp(p, 420, 348, 0.76);
  },
};

const PALETTE_FOR = {
  "whole-bible-1-year": "dawn",
  "whole-bible-2-year": "sand",
  "new-testament-90": "ocean",
  "new-testament-1-year": "lavender",
  "gospels-30": "clay",
  "jesus-life-21": "rose",
  "psalms-30": "lavender",
  "psalms-90": "ocean",
  "proverbs-31": "sage",
  "wisdom-21": "sand",
  "anxiety-14": "ocean",
  "hope-21": "dawn",
  "prayer-14": "lavender",
  "gratitude-7": "clay",
  "love-14": "rose",
  "forgiveness-14": "sage",
  "paul-30": "ink",
  "story-30": "night",
  "women-21": "plum",
  "new-believer-14": "ocean",
  custom: "ember",
};

const NIGHT_SCENES = new Set(["new-testament-1-year", "jesus-life-21", "psalms-30", "psalms-90", "prayer-14", "paul-30", "story-30", "custom"]);
const NF = "#3b3153"; // night floor (plum-indigo, never near-black)
const NH = ["#5c5079", "#4a3f63"]; // night hills

function frameCommands(sceneId, p, x, y) {
  cmds = [];
  parentRef = "frame";
  const night = NIGHT_SCENES.has(sceneId);
  add("frame.create", {
    x, y, width: W, height: H, name: `illustration:${sceneId}`, select: false,
    props: { fill: (night ? (p.outer || ["#FCF9FF", "#EDE3F8", "#D3C4EC"]) : p.sky)[0], clip: true },
  }, "frame");
  outerSky(p, night);
  outerSun(p, 250, 185, 92, night);
  outerWaves(p);
  outerBotanicals(p, 2);
  archFrame(p);
  SCENES[sceneId](p);
  archInnerLine(p);
  outerChrome(p);
  return [...cmds];
}

async function ensurePage(name, fresh = true) {
  const pages = await run("page.list");
  const existing = pages?.pages?.find((page) => page.name === name);
  if (existing && fresh) await run("page.delete", { id: existing.id });
  else if (existing) return existing.id;
  const created = await run("page.add", { name });
  return created.id;
}

async function main() {
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "koino-illustrations", version: "1.0.0" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  const only = process.env.ONLY;
  const ids = only ? only.split(",") : Object.keys(SCENES);
  const pageId = await ensurePage(process.env.PAGE_NAME || PAGE_NAME, !process.env.KEEP_PAGE);
  await run("page.select", { id: pageId });
  const frames = {};
  let index = 0;
  for (const sceneId of ids) {
    const p = P[PALETTE_FOR[sceneId] || "dawn"];
    const col = index % 4;
    const row = Math.floor(index / 4);
    const commands = frameCommands(sceneId, p, col * (W + GAP), row * (H + GAP));
    if (process.env.TRUNC) commands.length = Number(process.env.TRUNC);
    if (process.env.DUMP) fs.writeFileSync(path.join(ROOT, "design", "debug-commands.json"), JSON.stringify(commands, null, 1));
    if (process.env.DEBUG_STEP) {
      const i = Number(process.env.DEBUG_STEP) - 1;
      console.log("STEP", i, JSON.stringify(commands[i], null, 2));
    }
    const result = await batch(`Illustrate ${sceneId}`, commands);
    if (!Array.isArray(result)) throw new Error(`${sceneId}: ${JSON.stringify(result)}`);
    const frameId = result[0]?.id;
    if (!frameId) throw new Error(`${sceneId}: no frame id`);
    frames[sceneId] = frameId;
    console.log(`${sceneId} -> ${frameId} (${commands.length} commands)`);
    index += 1;
  }
  const previewList = (process.env.PREVIEW_LIST || (only ? only : "")).split(",").filter(Boolean);
  for (const sceneId of previewList) {
    if (!frames[sceneId]) continue;
    await screenshot([frames[sceneId]], path.join(ROOT, "design", `illustration-preview-${sceneId}.png`), 1600);
    console.log(`preview design/illustration-preview-${sceneId}.png`);
  }
  if (!only) {
    await screenshot(Object.values(frames), path.join(ROOT, "design", "bible-plan-illustrations-overview.png"), 3600);
    console.log("overview design/bible-plan-illustrations-overview.png");
    if (!process.env.SKIP_EXPORT) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      for (const [sceneId, frameId] of Object.entries(frames)) {
        await tool("export", { ids: [frameId], path: path.join(OUT_DIR, `${sceneId}.png`), format: "png", scale: 1 });
        console.log(`export ${sceneId}`);
      }
      await tool("save_file", { path: "C:/Users/alexh/Downloads/Koino-codex/design/bible-plan-covers.figcraft" });
      console.log("saved design/bible-plan-covers.figcraft");
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  if (stderr) console.error(stderr);
  process.exitCode = 1;
}).finally(() => child.kill());
