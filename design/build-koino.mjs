import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLI = path.join(process.env.LOCALAPPDATA, "Programs", "ArtCraft", "FigCraft", "figcraft-cli.exe");
const OUT_DIR = "C:\\Users\\alexh\\Downloads\\koino-codex\\design";
const FINAL = path.join(OUT_DIR, "Koino Onboarding.figcraft");
const TMP1 = path.join(OUT_DIR, "koino-pass1.tmp.figcraft");
const TMP2 = path.join(OUT_DIR, "koino-pass2.tmp.figcraft");
const PASS1 = path.join(OUT_DIR, "koino-pass1.json");
const PASS2 = path.join(OUT_DIR, "koino-pass2.json");
const PASS3 = path.join(OUT_DIR, "koino-pass3.json");

// ---------- palette ----------
const C = {
  canvas: "#FAF8F4",
  paper: "#FFFFFC",
  navy: "#0B1220",
  stone: "#6F6B64",
  line: "#E9E4DC",
  peach: "#FFC79A",
  blush: "#F3ACC8",
  lavender: "#C8BCE7",
  cyan: "#8EDCDA",
  wash: "#F6F2EA",
  terracotta: "#A96948",
};
const shadowSoft = [{ type: "dropShadow", color: "#0B122024", offset: [0, 16], radius: 36, spread: 0 }];
const shadowCard = [{ type: "dropShadow", color: "#0B12201F", offset: [0, 12], radius: 30, spread: 0 }];
const shadowFloating = [{ type: "dropShadow", color: "#0B122026", offset: [0, 10], radius: 24, spread: 0 }];

// ---------- command helpers ----------
let commands = [];
function add(command, params) { commands.push({ command, params }); }

function frame(name, x, y, opts = {}) {
  add("frame.create", {
    x, y, width: 390, height: 844, name, select: false,
    props: { fill: opts.fill || C.canvas, clip: true },
  });
}

function rect(name, parent, x, y, w, h, opts = {}) {
  add("node.create", {
    type: "rectangle", parent, x, y, width: w, height: h, name, select: false,
    props: {
      ...(opts.fills ? { fills: opts.fills } : { fill: opts.fill ?? "#00000000" }),
      ...(opts.radius !== undefined ? { cornerRadius: opts.radius } : {}),
      ...(opts.stroke ? { stroke: opts.stroke, strokeWeight: opts.strokeWeight || 1, strokeAlign: "inside" } : {}),
      ...(opts.effects ? { effects: opts.effects } : {}),
      ...(opts.rotation !== undefined ? { rotation: opts.rotation } : {}),
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    },
  });
}

function ellipse(name, parent, x, y, w, h, opts = {}) {
  add("node.create", {
    type: "ellipse", parent, x, y, width: w, height: h, name, select: false,
    props: {
      ...(opts.fills ? { fills: opts.fills } : { fill: opts.fill ?? "#00000000" }),
      ...(opts.stroke ? { stroke: opts.stroke, strokeWeight: opts.strokeWeight || 1, strokeAlign: opts.strokeAlign || "inside" } : {}),
      ...(opts.effects ? { effects: opts.effects } : {}),
      ...(opts.rotation !== undefined ? { rotation: opts.rotation } : {}),
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    },
  });
}

function text(name, parent, x, y, w, content, opts = {}) {
  const props = {
    fontFamily: opts.family || "Inter",
    fontStyle: opts.style || "Regular",
    fontSize: opts.size || 15,
    lineHeight: opts.lineHeight || Math.round((opts.size || 15) * 1.45),
    letterSpacing: opts.letterSpacing || 0,
    fill: opts.fill || C.navy,
    textAlign: opts.align || "left",
    textAutoResize: "height",
    ...(opts.italic ? { fontStyle: "Italic" } : {}),
    ...(opts.case ? { textCase: opts.case } : {}),
    ...(opts.decoration ? { textDecoration: opts.decoration } : {}),
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
  };
  add("text.create", { text: content, x, y, parent, name, width: w, props, select: false });
}

function icon(name, parent, x, y, size, d, opts = {}) {
  add("node.create", {
    type: "vector", parent, x, y, width: size, height: size, name,
    path: d,
    props: {
      fill: opts.fill || "none",
      ...(opts.stroke ? { stroke: opts.stroke, strokeWeight: opts.strokeWeight || 1.7, strokeCap: "round", strokeJoin: "round" } : {}),
      ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
      ...(opts.rotation !== undefined ? { rotation: opts.rotation } : {}),
    },
    select: false,
  });
}

function image(name, parent, file, x, y, w, h) {
  add("image.place", { path: file, parent, x, y, width: w, height: h, name });
}

function wave(name, parent, x, y, w, h, opts = {}) {
  const d = opts.d || "M0 12 C 38 2 72 2 108 12 S 180 22 216 12 S 288 2 324 12 S 388 20 410 12";
  add("node.create", {
    type: "vector", parent, x, y, width: w, height: h, name, path: d,
    props: {
      fill: "none",
      stroke: opts.stroke || C.peach,
      strokeWeight: opts.strokeWeight || 1.8,
      strokeCap: "round",
      opacity: opts.opacity ?? 0.5,
    },
    select: false,
  });
}

function hotspot(name, parent, x, y, w, h) {
  rect(name, parent, x, y, w, h, { fill: "#FFFFFF01", radius: 0 });
}

function cta(name, parent, x, y, label, opts = {}) {
  const w = opts.w || 326, h = opts.h || 58;
  const dark = opts.variant === "peach";
  const bg = dark ? C.peach : C.navy;
  const fg = dark ? C.navy : C.paper;
  rect(`${name} · pill`, parent, x, y, w, h, { fill: bg, radius: 29, effects: shadowSoft });
  text(`${name} · label`, parent, x + 26, y + 18, w - 100, label, {
    family: "Inter", style: "SemiBold", size: 15, lineHeight: 22, fill: fg,
  });
  ellipse(`${name} · arrow bg`, parent, x + w - 48, y + 11, 36, 36, {
    fill: dark ? "#FFFFFF5C" : "#FFFFFF16",
  });
  icon(`${name} · arrow`, parent, x + w - 39, y + 20, 18,
    "M4 9h10 M10 4l5 5-5 5", { stroke: fg, strokeWeight: 1.8 });
  hotspot(name, parent, x, y, w, h);
}

function dots(parent, active, y, dark = false) {
  const w = 22 + 6 * 3 + 7 * 3;
  let x = (390 - w) / 2;
  for (let i = 0; i < 4; i += 1) {
    const isActive = i === active;
    rect(`Pager dot ${i + 1}`, parent, x, y, isActive ? 22 : 6, 6, {
      fill: isActive ? (dark ? C.peach : C.navy) : (dark ? "#FFFFFF" : "#0B1220"),
      radius: 3,
      opacity: isActive ? 1 : (dark ? 0.22 : 0.16),
    });
    x += (isActive ? 22 : 6) + 7;
  }
}

function backButton(parent, x, y, name = "Back", dark = false) {
  ellipse(`${name} · circle`, parent, x, y, 40, 40, {
    fill: dark ? "#FFFFFF0D" : C.paper,
    stroke: dark ? "#FFFFFF22" : C.line,
    strokeWeight: 1,
  });
  icon(`${name} · chevron`, parent, x + 12, y + 12, 16, "M10 3L4 9l6 6", {
    stroke: dark ? C.paper : C.navy, strokeWeight: 1.7,
  });
  hotspot(name, parent, x, y, 40, 40);
}

function eyebrow(parent, x, y, label, opts = {}) {
  const color = opts.fill || C.stone;
  ellipse(`${label} · dot`, parent, x, y + 6, 4, 4, { fill: opts.dot || C.peach });
  text(`${label} · text`, parent, x + 12, y, 220, label, {
    family: "Inter", style: "SemiBold", size: 10.5, lineHeight: 16,
    letterSpacing: 1.7, fill: color, case: "upper", opacity: opts.opacity ?? 1,
  });
}

function miniIcon(parent, name, x, y, bg, iconPath, iconFill, size = 34) {
  ellipse(`${name} · circle`, parent, x, y, size, size, { fill: bg });
  const inner = size <= 30 ? 15 : 17;
  icon(`${name} · icon`, parent, x + (size - inner) / 2, y + (size - inner) / 2, inner, iconPath, {
    stroke: iconFill, strokeWeight: 1.6,
  });
}

function avatar(parent, name, x, y, size, initial, gradient) {
  ellipse(`${name} · avatar`, parent, x, y, size, size, {
    fills: [{ type: "linearGradient", stops: gradient, from: [0, 0], to: [1, 1] }],
    stroke: C.paper, strokeWeight: 2.4,
  });
  text(`${name} · initial`, parent, x, y + (size - 16) / 2 - 1, size, initial, {
    family: "Montserrat", style: "SemiBold", size: 13, lineHeight: 16,
    fill: C.paper, align: "center",
  });
}

// ---------- pass 1: document + frames ----------
commands = [];
add("file.new", {});
add("file.rename", { name: "Koino Onboarding" });
add("page.rename", { name: "Onboarding" });
add("page.setBackground", { color: "#F1EEE7" });
add("node.create", {
  type: "rectangle", x: -60, y: -260, width: 1824, height: 1240,
  name: "Board · background", index: 0, select: false,
  props: { fill: "#F1EEE7" },
});
frame("01 · Välkommen", 0, 0);
frame("02 · Bibeln", 438, 0);
frame("03 · Gemenskap", 876, 0);
frame("04 · Din rytm", 1314, 0, { fill: C.navy });

fs.writeFileSync(PASS1, JSON.stringify(commands, null, 2), "utf8");
const out1 = execFileSync(CLI, ["run", PASS1, "--out", TMP1], { encoding: "utf8" });
const results1 = out1.trim().split(/\r?\n/).filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
const frameIds = results1.filter((r) => r.command === "frame.create").map((r) => r.result.id);
if (frameIds.length !== 4) throw new Error(`Expected 4 frame ids, got ${frameIds.length}`);
const [f1, f2, f3, f4] = frameIds;

// ---------- pass 2: screens ----------
commands = [];

// ============ SCREEN 1 · VÄLKOMMEN ============
// warm halo behind the mark
ellipse("Hero · sunrise halo", f1, 96, 36, 332, 332, {
  fills: [{ type: "radialGradient", stops: ["#FFC79A70", "#F3ACC83D", "#FAF8F400"], from: [0.48, 0.45], to: [1, 1] }],
});
ellipse("Hero · lavender breath", f1, 192, 156, 214, 214, {
  fills: [{ type: "radialGradient", stops: ["#C8BCE740", "#FAF8F400"], from: [0.5, 0.5], to: [1, 1] }],
});
image("Hero · KOINO mark", f1, "C:\\Users\\alexh\\Downloads\\koino-codex\\koino-logo.png", 170, 104, 190, 190);

// horizon waves flowing out from the mark
wave("Horizon wave · peach", f1, -12, 296, 414, 26, { stroke: C.peach, opacity: 0.62, strokeWeight: 2 });
wave("Horizon wave · blush", f1, -12, 312, 414, 26, { stroke: C.blush, opacity: 0.46, strokeWeight: 2 });
wave("Horizon wave · lavender", f1, -12, 328, 414, 26, { stroke: C.lavender, opacity: 0.38, strokeWeight: 2 });
wave("Horizon wave · cyan", f1, -12, 344, 414, 26, { stroke: C.cyan, opacity: 0.28, strokeWeight: 2 });

// brand bar
text("Wordmark · KOINO", f1, 32, 50, 120, "KOINO", {
  family: "Montserrat", style: "SemiBold", size: 12, lineHeight: 18, letterSpacing: 3.1, fill: C.navy,
});
ellipse("Wordmark · full stop", f1, 100, 59, 5, 5, { fill: C.peach });
rect("Language · pill", f1, 318, 48, 40, 30, { fill: "#FFFFFCCC", radius: 15, stroke: C.line });
text("Language · SV", f1, 318, 55, 40, "SV", {
  family: "Inter", style: "SemiBold", size: 10.5, lineHeight: 16, letterSpacing: 1, fill: C.stone, align: "center",
});

// headline
text("01 · Headline line 1", f1, 32, 390, 326, "Ett stilla rum", {
  family: "Montserrat", style: "Light", size: 40, lineHeight: 46, letterSpacing: -0.9, fill: C.navy,
});
text("01 · Headline line 2", f1, 32, 436, 326, "för tro och liv.", {
  family: "Montserrat", style: "Light", size: 40, lineHeight: 46, letterSpacing: -0.9, fill: C.navy,
});
wave("01 · Hand-drawn underline", f1, 224, 474, 62, 12, {
  d: "M2 8 C 18 3 40 2 60 6", stroke: C.peach, strokeWeight: 4.5, opacity: 0.9,
});
text("01 · Body", f1, 32, 512, 310, "Bibel, bön och gemenskap —\npå din tid, i ditt tempo.", {
  family: "Inter", size: 15.5, lineHeight: 24, fill: C.stone,
});
dots(f1, 0, 596);
cta("CTA 01", f1, 32, 632, "Kom igång");
text("CTAlink 01 · Logga in", f1, 32, 708, 326, "Jag har redan ett konto", {
  family: "Inter", style: "Medium", size: 13.5, lineHeight: 20, fill: C.navy, align: "center",
});
text("01 · Terms", f1, 32, 782, 326,
  "Genom att fortsätta godkänner du våra villkor och vår integritetspolicy.", {
    family: "Inter", size: 10.5, lineHeight: 16, fill: C.stone, align: "center", opacity: 0.7,
  });

// ============ SCREEN 2 · BIBELN ============
ellipse("02 · sunrise glow", f2, 128, 188, 330, 330, {
  fills: [{ type: "radialGradient", stops: ["#FFC79A66", "#F3ACC83A", "#FAF8F400"], from: [0.5, 0.45], to: [1, 1] }],
});
ellipse("02 · lavender glow", f2, -82, 464, 240, 240, {
  fills: [{ type: "radialGradient", stops: ["#C8BCE740", "#FAF8F400"], from: [0.5, 0.5], to: [1, 1] }],
});
backButton(f2, 32, 44, "Back 02");
text("Skip 02 · label", f2, 282, 55, 76, "Hoppa över", {
  family: "Inter", style: "Medium", size: 11.5, lineHeight: 18, fill: C.stone, align: "right",
});
hotspot("Skip 02", f2, 276, 42, 82, 34);

eyebrow(f2, 32, 118, "Bibeln");
text("02 · Headline line 1", f2, 32, 144, 326, "Ord för", {
  family: "Montserrat", style: "Light", size: 40, lineHeight: 46, letterSpacing: -0.9, fill: C.navy,
});
text("02 · Headline line 2", f2, 32, 190, 326, "varje dag.", {
  family: "Montserrat", style: "Medium", size: 40, lineHeight: 46, letterSpacing: -0.9, fill: C.navy,
});
text("02 · Body", f2, 32, 254, 314, "Läs, lyssna och sök i Bibeln —\nhemma, på språng eller helt offline.", {
  family: "Inter", size: 15.5, lineHeight: 24, fill: C.stone,
});

// scripture card
rect("02 · Verse card", f2, 32, 322, 326, 330, {
  fill: C.paper, radius: 28, stroke: "#E9E4DCCC", effects: shadowCard,
});
ellipse("02 · Card icon bg", f2, 56, 342, 30, 30, { fill: "#FFC79A33" });
icon("02 · Card book icon", f2, 63, 349, 16,
  "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z", {
    stroke: C.terracotta, strokeWeight: 1.7,
  });
text("02 · Card eyebrow", f2, 96, 349, 170, "DAGENS ORD", {
  family: "Inter", style: "SemiBold", size: 9.5, lineHeight: 14, letterSpacing: 1.25, fill: C.stone,
});
text("02 · Card time", f2, 286, 349, 48, "3 min", {
  family: "Inter", style: "Medium", size: 10.5, lineHeight: 16, fill: C.stone, align: "right",
});
text("02 · Verse text", f2, 56, 386, 278,
  "Om vi bekänner våra synder, är han trofast och rättfärdig, så att han förlåter oss våra synder och renar oss från all orättfärdighet.", {
    family: "Montserrat", style: "Light", size: 20, lineHeight: 30, letterSpacing: -0.25, fill: C.navy,
  });
text("02 · Verse reference", f2, 56, 544, 278, "Första Johannesbrevet 1:9", {
  family: "Inter", style: "SemiBold", size: 10.5, lineHeight: 16, fill: C.stone,
});
rect("02 · Card divider", f2, 56, 570, 278, 1, { fill: C.line });
ellipse("02 · Play circle", f2, 56, 586, 36, 36, { fill: C.navy });
icon("02 · Play triangle", f2, 68, 596, 14, "M5 3.8v12.4L15 10z", { fill: C.paper });
text("02 · Audio title", f2, 102, 588, 130, "Lyssna på kapitlet", {
  family: "Inter", style: "SemiBold", size: 12.5, lineHeight: 18, fill: C.navy,
});
text("02 · Audio source", f2, 102, 606, 150, "Reformationsbibeln 2026", {
  family: "Inter", size: 9.5, lineHeight: 14, fill: C.stone,
});
// waveform
const bars = [7, 13, 20, 11, 17, 25, 13, 19, 9];
bars.forEach((barH, i) => {
  rect(`02 · Wave bar ${i + 1}`, f2, 242 + i * 5, 604 - barH / 2, 2.4, barH, {
    fill: [C.peach, C.blush, C.lavender, C.cyan][i % 4], radius: 1.2,
  });
});
text("02 · Audio length", f2, 292, 594, 34, "2:14", {
  family: "Inter", style: "Medium", size: 10, lineHeight: 15, fill: C.stone, align: "right",
});

// feature chips
function chip(name, x, w, label, iconPath) {
  rect(`${name} · chip`, f2, x, 676, w, 34, { fill: C.paper, radius: 17, stroke: C.line });
  icon(`${name} · icon`, f2, x + 11, 687, 12, iconPath, { stroke: C.stone, strokeWeight: 1.6 });
  text(`${name} · label`, f2, x + 31, 686, w - 35, label, {
    family: "Inter", style: "Medium", size: 10.2, lineHeight: 15, fill: C.navy,
  });
}
chip("Chip · hela bibeln", 32, 104, "Hela Bibeln",
  "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z");
chip("Chip · ljud", 144, 104, "Ljud & text",
  "M3 18v-6a9 9 0 0 1 18 0v6 M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z");
chip("Chip · sök", 256, 102, "Sök offline",
  "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M16.5 16.5L21 21");

cta("CTA 02", f2, 32, 736, "Nästa");
dots(f2, 1, 814);

// ============ SCREEN 3 · GEMENSKAP ============
ellipse("03 · blush glow", f3, 188, 70, 266, 266, {
  fills: [{ type: "radialGradient", stops: ["#F3ACC855", "#C8BCE72E", "#FAF8F400"], from: [0.5, 0.45], to: [1, 1] }],
});
ellipse("03 · peach glow", f3, -86, 450, 240, 240, {
  fills: [{ type: "radialGradient", stops: ["#FFC79A40", "#FAF8F400"], from: [0.5, 0.5], to: [1, 1] }],
});
backButton(f3, 32, 44, "Back 03");
text("Skip 03 · label", f3, 282, 55, 76, "Hoppa över", {
  family: "Inter", style: "Medium", size: 11.5, lineHeight: 18, fill: C.stone, align: "right",
});
hotspot("Skip 03", f3, 276, 42, 82, 34);

eyebrow(f3, 32, 118, "Gemenskap");
text("03 · Headline line 1", f3, 32, 144, 326, "Tro växer", {
  family: "Montserrat", style: "Light", size: 40, lineHeight: 46, letterSpacing: -0.9, fill: C.navy,
});
text("03 · Headline line 2", f3, 32, 190, 326, "tillsammans.", {
  family: "Montserrat", style: "Medium", size: 40, lineHeight: 46, letterSpacing: -1.1, fill: C.navy,
});
text("03 · Body", f3, 32, 254, 314, "Dela det som är svårt, be för varandra\noch fira de små stegen.", {
  family: "Inter", size: 15.5, lineHeight: 24, fill: C.stone,
});

// community cluster
avatar(f3, "Avatar · A", 32, 318, 36, "A", [C.peach, C.blush]);
avatar(f3, "Avatar · M", 58, 318, 36, "M", [C.blush, C.lavender]);
avatar(f3, "Avatar · J", 84, 318, 36, "J", [C.lavender, C.cyan]);
avatar(f3, "Avatar · S", 110, 318, 36, "S", [C.cyan, C.lavender]);
text("03 · Cluster caption", f3, 154, 326, 180, "12 vänner i ditt rum", {
  family: "Inter", style: "Medium", size: 11, lineHeight: 16, fill: C.stone,
});

// stacked prayer note
rect("03 · Prayer card", f3, 32, 360, 326, 214, {
  fill: C.paper, radius: 28, stroke: "#E9E4DCCC", effects: shadowCard,
});
avatar(f3, "Anna", 54, 380, 36, "A", [C.peach, C.blush]);
text("03 · Name", f3, 100, 382, 120, "Anna", {
  family: "Inter", style: "SemiBold", size: 12.5, lineHeight: 18, fill: C.navy,
});
text("03 · Time", f3, 100, 400, 150, "för 2 min sedan", {
  family: "Inter", size: 9.5, lineHeight: 14, fill: C.stone,
});
rect("03 · Tag bg", f3, 298, 384, 38, 22, { fill: "#F3ACC82E", radius: 11 });
text("03 · Tag", f3, 298, 388, 38, "Bön", {
  family: "Inter", style: "SemiBold", size: 9, lineHeight: 13, fill: C.navy, align: "center",
});
text("03 · Prayer text", f3, 54, 436, 284, "Be för mig — jag har en tuff vecka.", {
  family: "Montserrat", style: "Light", size: 21, lineHeight: 30, letterSpacing: -0.25, fill: C.navy,
});
rect("03 · Card divider", f3, 54, 508, 282, 1, { fill: C.line });
icon("03 · Heart", f3, 54, 525, 15,
  "M12 20.7l-1.1-1C5.5 14.9 2 11.7 2 7.9 2 5.1 4.2 3 7 3c1.6 0 3.1.8 4 2 .9-1.2 2.4-2 4-2 2.8 0 5 2.1 5 4.9 0 3.8-3.5 7-8.9 11.8z", {
    fill: C.blush,
  });
text("03 · Prayer count", f3, 76, 523, 180, "12 vänner har bett för dig", {
  family: "Inter", size: 10.5, lineHeight: 16, fill: C.stone,
});
rect("03 · Amen bg", f3, 282, 516, 54, 32, { fill: "#FFC79A38", radius: 16 });
text("03 · Amen", f3, 282, 524, 54, "Amen", {
  family: "Inter", style: "SemiBold", size: 11, lineHeight: 16, fill: C.navy, align: "center",
});

// feature rows
miniIcon(f3, "Feature · prayer", 32, 610, "#F3ACC82E",
  "M12 20.7l-1.1-1C5.5 14.9 2 11.7 2 7.9 2 5.1 4.2 3 7 3c1.6 0 3.1.8 4 2 .9-1.2 2.4-2 4-2 2.8 0 5 2.1 5 4.9 0 3.8-3.5 7-8.9 11.8z",
  C.blush);
text("Feature · prayer title", f3, 78, 608, 260, "Be för varandra", {
  family: "Inter", style: "SemiBold", size: 13.5, lineHeight: 19, fill: C.navy,
});
text("Feature · prayer sub", f3, 78, 627, 270, "Bön delas bara med dem du väljer.", {
  family: "Inter", size: 11, lineHeight: 16, fill: C.stone,
});
miniIcon(f3, "Feature · rooms", 32, 668, "#C8BCE72E",
  "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  C.lavender);
text("Feature · rooms title", f3, 78, 666, 260, "Väx i små rum", {
  family: "Inter", style: "SemiBold", size: 13.5, lineHeight: 19, fill: C.navy,
});
text("Feature · rooms sub", f3, 78, 685, 270, "Ärliga samtal, utan brus.", {
  family: "Inter", size: 11, lineHeight: 16, fill: C.stone,
});

cta("CTA 03", f3, 32, 734, "Fortsätt");
dots(f3, 2, 814);

// ============ SCREEN 4 · DIN RYTM ============
ellipse("04 · top glow", f4, 118, -212, 400, 400, {
  fills: [{ type: "radialGradient", stops: ["#FFC79A4D", "#F3ACC833", "#0B122000"], from: [0.5, 0.5], to: [1, 1] }],
});
ellipse("04 · rising sun", f4, 210, -180, 280, 280, {
  fills: [{ type: "linearGradient", stops: ["#FFD9B8", "#F3ACC8", "#C8BCE7"], from: [0.2, 0], to: [0.8, 1] }],
  opacity: 0.7,
});
ellipse("04 · sun ring", f4, 194, -196, 312, 312, {
  fill: "none", stroke: "#FFC79A33", strokeWeight: 1, strokeAlign: "center",
});
// quiet stars, kept away from the type
[[44, 104, 2], [92, 66, 1.5], [360, 236, 1.5], [372, 284, 1.1]].forEach(([sx, sy, ss], i) => {
  ellipse(`04 · Star ${i + 1}`, f4, sx, sy, ss, ss, { fill: C.paper, opacity: 0.34 });
});

backButton(f4, 32, 44, "Back 04", true);
text("04 · Step", f4, 300, 55, 58, "4 / 4", {
  family: "Inter", style: "Medium", size: 11, lineHeight: 18, letterSpacing: 1.1, fill: C.navy, align: "right", opacity: 0.5,
});
eyebrow(f4, 32, 118, "Din rytm", { fill: C.peach, dot: C.peach, opacity: 0.95 });
text("04 · Headline line 1", f4, 32, 144, 326, "Hitta din", {
  family: "Montserrat", style: "Light", size: 40, lineHeight: 46, letterSpacing: -0.9, fill: C.paper,
});
text("04 · Headline line 2", f4, 32, 190, 326, "stilla stund.", {
  family: "Montserrat", style: "Medium", size: 40, lineHeight: 46, letterSpacing: -1.1, fill: C.paper,
});
text("04 · Body", f4, 32, 254, 314, "Välj en tid för en kort påminnelse.\nInget mer, inget mindre.", {
  family: "Inter", size: 15.5, lineHeight: 24, fill: C.paper, opacity: 0.66,
});

// rhythm card
rect("04 · Rhythm card", f4, 32, 322, 326, 312, {
  fill: C.paper, radius: 30, effects: [{ type: "dropShadow", color: "#0000005C", offset: [0, 18], radius: 44, spread: 0 }],
});
ellipse("04 · Bell bg", f4, 52, 340, 30, 30, { fill: "#FFC79A33" });
icon("04 · Bell", f4, 60, 348, 14,
  "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0", {
    stroke: C.terracotta, strokeWeight: 1.6,
  });
text("04 · Card eyebrow", f4, 90, 347, 174, "DAGLIG PÅMINNELSE", {
  family: "Inter", style: "SemiBold", size: 9.2, lineHeight: 14, letterSpacing: 1.1, fill: C.stone,
});
rect("04 · Toggle track", f4, 268, 344, 40, 22, { fill: C.cyan, radius: 11 });
ellipse("04 · Toggle knob", f4, 288, 346, 18, 18, {
  fill: C.paper, effects: [{ type: "dropShadow", color: "#0B122033", offset: [0, 1], radius: 3, spread: 0 }],
});
text("04 · Card title", f4, 52, 378, 280, "När vill du landa?", {
  family: "Montserrat", style: "Medium", size: 19, lineHeight: 25, letterSpacing: -0.2, fill: C.navy,
});

function rhythmOption(index, label, time, kind, selected) {
  const y = 414 + index * 58;
  const bg = selected ? C.navy : C.wash;
  const fg = selected ? C.paper : C.navy;
  const sub = selected ? 0.62 : 0.55;
  rect(`04 · Option ${index + 1}`, f4, 52, y, 286, 50, { fill: bg, radius: 14 });
  ellipse(`04 · Option ${index + 1} icon bg`, f4, 62, y + 11, 28, 28, {
    fill: selected ? "#FFFFFF14" : "#FFC79A33",
  });
  const iconPath = kind === "sun"
    ? "M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"
    : kind === "dawn"
      ? "M17 18a5 5 0 0 0-10 0 M12 2v4 M4.22 10.22l1.42 1.42 M1 18h22 M3 22h18"
      : "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z";
  icon(`04 · Option ${index + 1} icon`, f4, 68, y + 17, 16, iconPath, {
    stroke: selected ? C.peach : C.terracotta, strokeWeight: 1.6,
  });
  text(`04 · Option ${index + 1} label`, f4, 102, y + 15, 110, label, {
    family: "Inter", style: "SemiBold", size: 12.5, lineHeight: 18, fill: fg,
  });
  text(`04 · Option ${index + 1} time`, f4, 220, y + 15, 46, time, {
    family: "Inter", style: "Medium", size: 11, lineHeight: 18, fill: fg, align: "right", opacity: 1 - (selected ? 0.3 : 0.35),
  });
  if (selected) {
    ellipse(`04 · Option ${index + 1} check bg`, f4, 274, y + 14, 22, 22, { fill: C.peach });
    icon(`04 · Option ${index + 1} check`, f4, 279, y + 19, 12, "M2.5 6.5L5 9l4.5-5", {
      stroke: C.navy, strokeWeight: 1.8,
    });
  } else {
    ellipse(`04 · Option ${index + 1} radio`, f4, 278, y + 17, 15, 15, {
      fill: "none", stroke: "#0B122033", strokeWeight: 1.2,
    });
  }
}
rhythmOption(0, "Morgon", "07:00", "dawn", false);
rhythmOption(1, "Middag", "12:30", "sun", false);
rhythmOption(2, "Kväll", "21:00", "moon", true);
text("04 · Card note", f4, 52, 596, 286, "Du kan ändra det när som helst.", {
  family: "Inter", size: 10, lineHeight: 15, fill: C.stone, opacity: 0.75,
});

dots(f4, 3, 678, true);
cta("CTA 04", f4, 32, 708, "Börja min resa", { variant: "peach" });
text("CTAlink 04 · Logga in", f4, 32, 784, 326, "Jag har redan ett konto", {
  family: "Inter", style: "Medium", size: 13.5, lineHeight: 20, fill: C.paper, align: "center", opacity: 0.62,
});
text("04 · Trust note", f4, 32, 814, 326, "Dina uppgifter stannar hos dig.", {
  family: "Inter", size: 10, lineHeight: 15, fill: C.paper, align: "center", opacity: 0.32,
});

// ---------- presentation board ----------
text("Board · wordmark", null, 0, -198, 400, "KOINO  ·  ONBOARDING", {
  family: "Montserrat", style: "SemiBold", size: 11, lineHeight: 18, letterSpacing: 2.6, fill: C.stone,
});
text("Board · title", null, 0, -172, 900, "Onboarding", {
  family: "Montserrat", style: "Light", size: 54, lineHeight: 62, letterSpacing: -1.8, fill: C.navy,
});
text("Board · subtitle", null, 0, -92, 820,
  "En stilla start för en app som ger plats för tro, bön och gemenskap.", {
    family: "Inter", size: 15, lineHeight: 23, fill: C.stone,
  });
text("Board · meta", null, 0, -58, 820, "4 skärmar  ·  390 × 844  ·  iOS & Android  ·  v1.0", {
  family: "Inter", style: "Medium", size: 10, lineHeight: 16, letterSpacing: 0.6, fill: C.stone, opacity: 0.65,
});
// palette swatches, right aligned with the board
const swatches = [
  ["Warm canvas", C.canvas], ["Deep navy", C.navy], ["Persika", C.peach],
  ["Blush", C.blush], ["Lavender", C.lavender], ["Cyan", C.cyan],
];
const swatchStart = 1704 - (swatches.length * 24 - 8);
swatches.forEach(([label, color], i) => {
  ellipse(`Palette · ${label}`, null, swatchStart + i * 24, -112, 16, 16, { fill: color, stroke: C.line, strokeWeight: 1 });
});
text("Palette · caption", null, swatchStart, -132, 160, "KOINO PALETT", {
  family: "Inter", style: "SemiBold", size: 9, lineHeight: 13, letterSpacing: 1.2, fill: C.stone, opacity: 0.7,
});
rect("Board · rule", null, 0, 870, 1704, 1, { fill: "#DED8CE" });
const captions = [
  ["01 · Välkommen", "Ett första andetag."],
  ["02 · Bibeln", "Ord för varje dag."],
  ["03 · Gemenskap", "Tro växer tillsammans."],
  ["04 · Din rytm", "En stund som blir din."],
];
captions.forEach(([title, sub], i) => {
  const x = i * 438;
  text(`Caption ${i + 1} · title`, null, x, 890, 390, title, {
    family: "Inter", style: "SemiBold", size: 11, lineHeight: 16, letterSpacing: 0.2, fill: C.navy,
  });
  text(`Caption ${i + 1} · sub`, null, x, 908, 390, sub, {
    family: "Inter", size: 10.5, lineHeight: 15, fill: C.stone, opacity: 0.8,
  });
});

fs.writeFileSync(PASS2, JSON.stringify(commands, null, 2), "utf8");
const out2 = execFileSync(CLI, ["run", PASS2, "--in", TMP1, "--out", TMP2], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
const results2 = out2.trim().split(/\r?\n/).filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
const failed2 = results2.filter((r) => r.ok === false);
if (failed2.length) {
  console.error(JSON.stringify(failed2, null, 2));
  throw new Error("Pass 2 failed");
}

// ---------- pass 3: prototype links ----------
commands = [];
function addLink(name, destFrame, transition) {
  add("node.find", { name, limit: 5 });
  // We cannot use the result in the same run; instead interactions are added in a follow-up pass.
}

// resolve hotspot ids by name in a read-only run
const lookupNames = [
  "CTA 01", "CTA 02", "CTA 03", "CTA 04",
  "Back 02", "Back 03", "Back 04", "Skip 02", "Skip 03",
];
const lookupCmds = lookupNames.map((name) => ({ command: "node.find", params: { name, limit: 10 } }));
fs.writeFileSync(PASS3, JSON.stringify(lookupCmds, null, 2), "utf8");
const out3 = execFileSync(CLI, ["run", PASS3, "--in", TMP2], { encoding: "utf8" });
const results3 = out3.trim().split(/\r?\n/).filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
const idByName = {};
results3.forEach((r, i) => {
  const ids = r.result?.ids || [];
  if (ids.length) idByName[lookupNames[i]] = ids[0];
});

commands = [];
add("proto.flow.add", { start: f1, name: "Onboarding" });
function link(name, dest, direction = "left") {
  const id = idByName[name];
  if (!id) return;
  add("proto.interaction.add", {
    id,
    trigger: { type: "onClick" },
    action: { type: "navigate", dest },
    transition: { type: "slideIn", direction, durationMs: 360, easing: "easeInOut" },
  });
}
link("CTA 01", f2, "left");
link("CTA 02", f3, "left");
link("CTA 03", f4, "left");
link("Back 02", f1, "right");
link("Back 03", f2, "right");
link("Back 04", f3, "right");
link("Skip 02", f4, "left");
link("Skip 03", f4, "left");

fs.writeFileSync(PASS3, JSON.stringify(commands, null, 2), "utf8");
const out4 = execFileSync(CLI, ["run", PASS3, "--in", TMP2, "--out", FINAL], { encoding: "utf8" });
const results4 = out4.trim().split(/\r?\n/).filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
const failed4 = results4.filter((r) => r.ok === false);
if (failed4.length) {
  console.error(JSON.stringify(failed4, null, 2));
  throw new Error("Prototype pass failed");
}

// ---------- exports ----------
const exportDir = path.join(OUT_DIR, "exports");
fs.mkdirSync(exportDir, { recursive: true });
const exportNames = ["01-valkommen", "02-bibeln", "03-gemenskap", "04-din-rytm"];
frameIds.forEach((id, i) => {
  execFileSync(CLI, ["export", FINAL, "--node", String(id), "--out", path.join(exportDir, `${exportNames[i]}.png`), "--scale", "2"], { encoding: "utf8" });
});
execFileSync(CLI, ["render", FINAL, "--out", path.join(exportDir, "board.png"), "--scale", "1"], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });

const info = JSON.parse(execFileSync(CLI, ["info", FINAL, "--json"], { encoding: "utf8" }));
console.log(JSON.stringify({ file: FINAL, frames: frameIds, nodes: info.nodes, images: info.images, interactions: results4.length }, null, 2));
