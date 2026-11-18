import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.join(process.env.LOCALAPPDATA, "Programs", "ArtCraft", "FigCraft", "figcraft-cli.exe");
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "bible-plans");
const DESIGN_DIR = path.join(ROOT, "design");
const FINAL = path.join(DESIGN_DIR, "bible-plan-covers.figcraft");
const TMP = path.join(os.tmpdir(), "bible-plan-covers.tmp.figcraft");
const PASS1 = path.join(os.tmpdir(), "bible-plan-covers-pass1.json");
const PASS2 = path.join(os.tmpdir(), "bible-plan-covers-pass2.json");

const W = 1440;
const H = 810;
const GAP = 64;

const palettes = {
  dawn: {
    bg: ["#FFF7EF", "#FFE3C9", "#F8C08C"], ink: "#2A1B10", muted: "#6E5B4B", accent: "#A9571F",
    motifA: ["#FFD0A3", "#E8874A"], motifB: ["#F3ACC8", "#C8BCE7"], numeral: "#FFFFFF", wordmark: "#2A1B10",
  },
  rose: {
    bg: ["#FFF6F4", "#F9D8D2", "#E9A79E"], ink: "#3A1D1B", muted: "#7A4B47", accent: "#9C4A44",
    motifA: ["#F6C0B8", "#D98A80"], motifB: ["#FFE1C9", "#E8B07E"], numeral: "#FFFFFF", wordmark: "#3A1D1B",
  },
  sage: {
    bg: ["#F7FAF4", "#DCEAD4", "#B7CFAA"], ink: "#1E2E21", muted: "#4F6653", accent: "#3F6B47",
    motifA: ["#C9DDBD", "#7FA27A"], motifB: ["#F4E7C8", "#D6B77A"], numeral: "#FFFFFF", wordmark: "#1E2E21",
  },
  lavender: {
    bg: ["#FAF7FE", "#E7DBF6", "#C8BCE7"], ink: "#2A1F3D", muted: "#5D4A82", accent: "#6B4FA1",
    motifA: ["#D9CBF1", "#A58BC9"], motifB: ["#F9D6E4", "#D89AB8"], numeral: "#FFFFFF", wordmark: "#2A1F3D",
  },
  ocean: {
    bg: ["#F2FBFA", "#CBE9E5", "#8EDCDA"], ink: "#12302F", muted: "#2F5D5A", accent: "#23807A",
    motifA: ["#B7E5E2", "#66B8B0"], motifB: ["#D9F1EF", "#8EDCDA"], numeral: "#FFFFFF", wordmark: "#12302F",
  },
  sand: {
    bg: ["#FCF8F1", "#EDE0C9", "#D8C3A0"], ink: "#33281B", muted: "#6F5D44", accent: "#8A6A3A",
    motifA: ["#E5D3B4", "#C5A06B"], motifB: ["#F6D8B8", "#D9A46B"], numeral: "#FFFFFF", wordmark: "#33281B",
  },
  clay: {
    bg: ["#FFF7F1", "#F6D5C2", "#E4A77F"], ink: "#33201A", muted: "#6E4B3C", accent: "#8F4A2A",
    motifA: ["#F2C6AA", "#C77B4E"], motifB: ["#E7B7C8", "#B76A97"], numeral: "#FFFFFF", wordmark: "#33201A",
  },
  plum: {
    bg: ["#FCF6FA", "#EBCFE0", "#D5A3C0"], ink: "#341C2B", muted: "#6E3F58", accent: "#8A3D64",
    motifA: ["#E9C3D6", "#B76A97"], motifB: ["#F4D9C8", "#D9A46B"], numeral: "#FFFFFF", wordmark: "#341C2B",
  },
  ink: {
    bg: ["#1D232B", "#26303A", "#35424F"], ink: "#FFF9F2", muted: "#D8C8B8", accent: "#FFC79A",
    motifA: ["#FFC79A", "#C97B3F"], motifB: ["#C8BCE7", "#7E6BA8"], numeral: "#FFFFFF", wordmark: "#FFF9F2",
  },
  night: {
    bg: ["#151B2E", "#1F2940", "#2E3A56"], ink: "#F7F3FF", muted: "#C9C0E0", accent: "#C8BCE7",
    motifA: ["#C8BCE7", "#8B76B8"], motifB: ["#8EDCDA", "#3E8F8A"], numeral: "#FFFFFF", wordmark: "#F7F3FF",
  },
  ember: {
    bg: ["#241A16", "#34241D", "#4A3024"], ink: "#FFF6EC", muted: "#E4C6AE", accent: "#FFC79A",
    motifA: ["#E8A06B", "#A9571F"], motifB: ["#F3ACC8", "#9C4A6E"], numeral: "#FFFFFF", wordmark: "#FFF6EC",
  },
};

const covers = [
  { id: "whole-bible-1-year", numeral: "365", motif: "horizon", palette: "dawn" },
  { id: "whole-bible-2-year", numeral: "730", motif: "mountain", palette: "sand" },
  { id: "new-testament-90", numeral: "90", motif: "waves", palette: "ocean" },
  { id: "new-testament-1-year", numeral: "365", motif: "stars", palette: "lavender" },
  { id: "gospels-30", numeral: "30", motif: "sun", palette: "clay" },
  { id: "jesus-life-21", numeral: "21", motif: "arch", palette: "rose" },
  { id: "psalms-30", numeral: "30", motif: "ripple", palette: "lavender" },
  { id: "psalms-90", numeral: "90", motif: "ripple", palette: "ocean" },
  { id: "proverbs-31", numeral: "31", motif: "leaf", palette: "sage" },
  { id: "wisdom-21", numeral: "21", motif: "arch", palette: "sand" },
  { id: "anxiety-14", numeral: "14", motif: "horizon", palette: "ocean" },
  { id: "hope-21", numeral: "21", motif: "sun", palette: "dawn" },
  { id: "prayer-14", numeral: "14", motif: "arch", palette: "lavender" },
  { id: "gratitude-7", numeral: "7", motif: "sun", palette: "sand" },
  { id: "love-14", numeral: "14", motif: "ripple", palette: "rose" },
  { id: "forgiveness-14", numeral: "14", motif: "path", palette: "sage" },
  { id: "paul-30", numeral: "30", motif: "cross", palette: "ink" },
  { id: "story-30", numeral: "30", motif: "stars", palette: "night" },
  { id: "women-21", numeral: "21", motif: "leaf", palette: "plum" },
  { id: "new-believer-14", numeral: "14", motif: "sail", palette: "ocean" },
  { id: "custom", numeral: "01", motif: "sail", palette: "ember" },
];

let commands = [];
const add = (command, params) => commands.push({ command, params });
const fill = (stops, from = [0, 0], to = [1, 1]) => ({ type: "linearGradient", stops, from, to });

function rect(parent, x, y, w, h, opts = {}) {
  add("node.create", {
    type: "rectangle", parent, x, y, width: w, height: h, name: opts.name ?? "shape", select: false,
    props: {
      ...(opts.fills ? { fills: opts.fills } : { fill: opts.fill ?? "#00000000" }),
      ...(opts.radius !== undefined ? { cornerRadius: opts.radius } : {}),
      ...(opts.stroke ? { stroke: opts.stroke, strokeWeight: opts.strokeWeight ?? 1, strokeAlign: "inside" } : {}),
      ...(opts.effects ? { effects: opts.effects } : {}),
      ...(opts.rotation !== undefined ? { rotation: opts.rotation } : {}),
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    },
  });
}

function ellipse(parent, x, y, w, h, opts = {}) {
  add("node.create", {
    type: "ellipse", parent, x, y, width: w, height: h, name: opts.name ?? "ellipse", select: false,
    props: {
      ...(opts.fills ? { fills: opts.fills } : { fill: opts.fill ?? "#00000000" }),
      ...(opts.stroke ? { stroke: opts.stroke, strokeWeight: opts.strokeWeight ?? 1, strokeAlign: opts.strokeAlign ?? "inside" } : {}),
      ...(opts.rotation !== undefined ? { rotation: opts.rotation } : {}),
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    },
  });
}

function vector(parent, x, y, w, h, d, opts = {}) {
  add("node.create", {
    type: "vector", parent, x, y, width: w, height: h, name: opts.name ?? "vector", path: d, select: false,
    props: {
      ...(opts.fills ? { fills: opts.fills } : { fill: opts.fill ?? "#00000000" }),
      ...(opts.stroke ? { stroke: opts.stroke, strokeWeight: opts.strokeWeight ?? 2, strokeCap: "round", strokeJoin: "round" } : {}),
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    },
  });
}

function text(parent, x, y, w, content, opts = {}) {
  add("text.create", {
    text: content, x, y, parent, name: opts.name ?? "text", width: w, select: false,
    props: {
      fontFamily: opts.family ?? "Montserrat",
      fontStyle: opts.style ?? "Regular",
      fontSize: opts.size ?? 18,
      lineHeight: opts.lineHeight ?? Math.round((opts.size ?? 18) * 1.3),
      letterSpacing: opts.letterSpacing ?? 0,
      fill: opts.fill ?? "#231A13",
      textAlign: opts.align ?? "left",
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
      ...(opts.textCase ? { textCase: opts.textCase } : {}),
    },
  });
}

const motifs = {
  sun(parent, p) {
    rect(parent, 980, -120, 620, 620, { fills: fill(p.motifA), radius: 310, opacity: 0.92, name: "sun" });
    ellipse(parent, 900, 250, 420, 420, { stroke: p.ink, strokeWeight: 2, opacity: 0.18, name: "sun-ring" });
    rect(parent, 760, 606, 680, 3, { fill: p.ink, opacity: 0.18, name: "horizon" });
    rect(parent, 860, 664, 580, 2, { fill: p.ink, opacity: 0.12, name: "horizon-2" });
  },
  horizon(parent, p) {
    rect(parent, 940, -180, 680, 680, { fills: fill(p.motifA), radius: 340, opacity: 0.9, name: "sun" });
    rect(parent, 720, 570, 720, 4, { fill: p.ink, opacity: 0.24, name: "horizon" });
    rect(parent, 780, 634, 660, 3, { fill: p.ink, opacity: 0.16, name: "horizon-2" });
    rect(parent, 840, 696, 600, 2, { fill: p.ink, opacity: 0.1, name: "horizon-3" });
  },
  arch(parent, p) {
    rect(parent, 970, 70, 400, 740, { fills: fill(p.motifA), radius: [200, 200, 0, 0], opacity: 0.88, name: "arch" });
    rect(parent, 1038, 148, 264, 662, { stroke: p.ink, strokeWeight: 2, radius: [132, 132, 0, 0], opacity: 0.22, name: "arch-inner" });
    ellipse(parent, 1190, 20, 96, 96, { fills: fill(p.motifB), opacity: 0.8, name: "orb" });
  },
  waves(parent, p) {
    ellipse(parent, 860, 180, 620, 620, { stroke: p.ink, strokeWeight: 2, opacity: 0.16, name: "wave-1" });
    ellipse(parent, 910, 230, 520, 520, { stroke: p.ink, strokeWeight: 2, opacity: 0.2, name: "wave-2" });
    ellipse(parent, 960, 280, 420, 420, { stroke: p.ink, strokeWeight: 2, opacity: 0.24, name: "wave-3" });
    ellipse(parent, 1010, 330, 320, 320, { strokes: [fill(p.motifA)], strokeWeight: 2, opacity: 0.9, name: "wave-4" });
    ellipse(parent, 1120, 60, 150, 150, { fills: fill(p.motifB), opacity: 0.8, name: "orb" });
  },
  leaf(parent, p) {
    rect(parent, 1040, 150, 150, 430, { fills: fill(p.motifA), radius: 80, rotation: 24, opacity: 0.88, name: "leaf-1" });
    rect(parent, 1160, 260, 120, 360, { fills: fill(p.motifB), radius: 60, rotation: -18, opacity: 0.72, name: "leaf-2" });
    rect(parent, 1112, 340, 3, 390, { fill: p.ink, opacity: 0.2, rotation: 10, name: "stem" });
    ellipse(parent, 900, 120, 90, 90, { fills: fill(p.motifB), opacity: 0.6, name: "orb" });
  },
  path(parent, p) {
    rect(parent, 820, 330, 760, 130, { fills: fill(p.motifA), radius: 65, rotation: -22, opacity: 0.82, name: "path" });
    rect(parent, 880, 470, 660, 10, { fill: p.ink, opacity: 0.2, rotation: -22, name: "path-line" });
    ellipse(parent, 850, 200, 54, 54, { fill: p.accent, opacity: 0.7, name: "dot-1" });
    ellipse(parent, 970, 130, 30, 30, { fill: p.accent, opacity: 0.5, name: "dot-2" });
    ellipse(parent, 1110, 90, 18, 18, { fill: p.accent, opacity: 0.35, name: "dot-3" });
  },
  book(parent, p) {
    rect(parent, 880, 230, 300, 480, { fills: fill(p.motifA), radius: 22, rotation: -8, opacity: 0.86, name: "book-left" });
    rect(parent, 1160, 250, 300, 480, { fills: fill(p.motifB), radius: 22, rotation: 8, opacity: 0.72, name: "book-right" });
    rect(parent, 1128, 250, 4, 470, { fill: p.ink, opacity: 0.24, name: "spine" });
    rect(parent, 940, 740, 420, 4, { fill: p.ink, opacity: 0.18, name: "shelf" });
  },
  mountain(parent, p) {
    ellipse(parent, 1100, -40, 300, 300, { fills: fill(p.motifB), opacity: 0.55, name: "sun" });
    vector(parent, 760, 420, 520, 400, "M0 400 L260 0 L520 400 Z", { fills: fill(p.motifA), opacity: 0.72, name: "mountain-1" });
    vector(parent, 1030, 520, 420, 300, "M0 300 L210 0 L420 300 Z", { fill: p.ink, opacity: 0.22, name: "mountain-2" });
    rect(parent, 720, 720, 720, 3, { fill: p.ink, opacity: 0.18, name: "ground" });
  },
  stars(parent, p) {
    rect(parent, 1080, 160, 4, 360, { fill: p.accent, opacity: 0.55, rotation: 45, name: "star-a" });
    rect(parent, 1080, 160, 4, 360, { fill: p.accent, opacity: 0.55, rotation: -45, name: "star-b" });
    ellipse(parent, 1240, 120, 70, 70, { fill: p.accent, opacity: 0.35, name: "star-dot-1" });
    ellipse(parent, 950, 250, 34, 34, { fill: p.accent, opacity: 0.35, name: "star-dot-2" });
    ellipse(parent, 1190, 330, 18, 18, { fill: p.accent, opacity: 0.3, name: "star-dot-3" });
    ellipse(parent, 900, 420, 10, 10, { fill: p.accent, opacity: 0.25, name: "star-dot-4" });
  },
  cross(parent, p) {
    rect(parent, 1080, 130, 6, 620, { fill: p.accent, opacity: 0.55, name: "cross-vertical" });
    rect(parent, 900, 330, 370, 6, { fill: p.accent, opacity: 0.55, name: "cross-horizontal" });
    ellipse(parent, 1110, 160, 460, 460, { stroke: p.ink, strokeWeight: 2, opacity: 0.12, name: "halo" });
  },
  sail(parent, p) {
    vector(parent, 920, 200, 420, 520, "M0 520 L420 520 L420 0 Z", { fills: fill(p.motifA), opacity: 0.82, name: "sail" });
    rect(parent, 910, 140, 4, 660, { fill: p.ink, opacity: 0.35, name: "mast" });
    rect(parent, 780, 690, 600, 3, { fill: p.ink, opacity: 0.2, name: "water" });
    ellipse(parent, 1220, 90, 110, 110, { fills: fill(p.motifB), opacity: 0.7, name: "sun" });
  },
  ripple(parent, p) {
    ellipse(parent, 1020, 160, 150, 150, { fills: fill(p.motifA), opacity: 0.9, name: "core" });
    ellipse(parent, 950, 90, 290, 290, { stroke: p.ink, strokeWeight: 2, opacity: 0.22, name: "ripple-1" });
    ellipse(parent, 880, 20, 430, 430, { stroke: p.ink, strokeWeight: 2, opacity: 0.16, name: "ripple-2" });
    ellipse(parent, 810, -50, 570, 570, { stroke: p.ink, strokeWeight: 2, opacity: 0.1, name: "ripple-3" });
    rect(parent, 1094, 310, 3, 380, { fill: p.ink, opacity: 0.14, name: "drop-line" });
  },
};

const layout = (index) => ({
  x: (index % 4) * (W + GAP),
  y: Math.floor(index / 4) * (H + GAP),
});

commands = [];
add("file.new", {});
add("file.rename", { name: "KOINO Bible Plan Covers" });
add("page.rename", { name: "Covers" });
add("page.setBackground", { color: "#F3EDE4" });
covers.forEach((cover, index) => {
  const position = layout(index);
  add("frame.create", {
    x: position.x, y: position.y, width: W, height: H, name: `cover:${cover.id}`, select: false,
    props: { fill: "#FFF9F2", clip: true },
  });
});
fs.writeFileSync(PASS1, JSON.stringify(commands, null, 2), "utf8");
const out1 = execFileSync(CLI, ["run", PASS1, "--out", TMP], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
const results1 = out1.trim().split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
const frameIds = results1.filter((line) => line.command === "frame.create" && line.ok).map((line) => line.result.id);
if (frameIds.length !== covers.length) throw new Error(`Expected ${covers.length} frames, got ${frameIds.length}`);

commands = [];
covers.forEach((cover, index) => {
  const parent = frameIds[index];
  const p = palettes[cover.palette];
  rect(parent, 0, 0, W, H, { fills: fill(p.bg), name: "background" });
  rect(parent, 28, 28, W - 56, H - 56, { stroke: p.ink, strokeWeight: 1, opacity: 0.14, name: "inset-border" });
  rect(parent, 72, 64, 48, 3, { fill: p.accent, opacity: 0.9, name: "accent-rule" });
  motifs[cover.motif](parent, p);
  const numeralSize = cover.numeral.length >= 3 ? 168 : 200;
  text(parent, 930, 470, 430, cover.numeral, {
    name: "numeral", family: "Playfair Display", style: "SemiBold", size: numeralSize,
    lineHeight: numeralSize, letterSpacing: -6, fill: p.numeral, opacity: 0.24, align: "center",
  });
  text(parent, 72, 84, 400, "KOINO", {
    name: "wordmark", family: "Montserrat", style: "SemiBold", size: 22, lineHeight: 28,
    letterSpacing: 9, fill: p.wordmark, opacity: 0.5,
  });
});
fs.writeFileSync(PASS2, JSON.stringify(commands, null, 2), "utf8");
const out2 = execFileSync(CLI, ["run", PASS2, "--in", TMP, "--out", FINAL], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
const results2 = out2.trim().split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
const failures = results2.filter((line) => !line.ok);
if (failures.length) throw new Error(JSON.stringify(failures, null, 2));

fs.mkdirSync(OUT_DIR, { recursive: true });
covers.forEach((cover, index) => {
  execFileSync(CLI, ["export", FINAL, "--node", String(frameIds[index]), "--out", path.join(OUT_DIR, `${cover.id}.png`), "--scale", "1"], {
    encoding: "utf8", maxBuffer: 30 * 1024 * 1024,
  });
});

execFileSync(CLI, ["render", FINAL, "--out", path.join(DESIGN_DIR, "bible-plan-covers-overview.png"), "--scale", "0.22"], {
  encoding: "utf8", maxBuffer: 60 * 1024 * 1024,
});
console.log(JSON.stringify({ file: FINAL, covers: covers.length, dir: OUT_DIR }, null, 2));
