# KOINO — Brand guide 2.0

**Status:** proposal for review · November 2026
**Scope:** KOINO mobile app (iOS + Android), app-adjacent web surfaces
**Companion files:** `koino-design-directions-2026.figcraft` · `koino.tokens.json` · `directions/*.png`

---

## Why this version exists

The 1.x brand had the right feeling — warm, quiet, human — but it carried too many soft accents, too many tiny uppercase labels, and no tested dark theme. The result read as gentle, not necessarily professional, and a few important states were hard to see.

2.0 keeps the mark, the peach, Georgia and the calm. It makes the system **measurable**:

- one action colour instead of four competing pastels
- a type scale with real minimums
- separate, contrast-tested dark tokens
- visible focus, 44 px targets and colour-independent states

Everything below is checked against **WCAG 2.2 AA**. Ratios are calculated, not estimated.

---

## 1. Principles

| Principle | What it means in practice |
|---|---|
| **Still** | One idea per screen. Generous space. No glow, no gradient decoration, no motion for its own sake. |
| **Warm** | Paper, ink and a single ember accent. Warmth comes from tone and photography, not from saturated UI. |
| **Clear** | Reading before navigation. One primary action per view. Labels say what happens. |
| **Reverent** | Scripture gets the best typography and the quietest chrome. Never sell inside a reading surface. |
| **Honest** | Real states, real contrast, real performance. No decorative fake data in shipped screens. |

---

## 2. Logo and mark

The existing mark — sun, cross, water — is the brand. Keep it.

| Rule | Value |
|---|---|
| Clear space | At least the height of the cross stroke on every side |
| Minimum size | 24 px for the full mark; 16 px only as a mono stamp |
| On light | Full-colour mark on Paper `#FAF6F0` or White `#FFFFFF` |
| On dark | Full-colour mark on Night `#14100D`; never on photography |
| Below 24 px | Use the one-colour Ink or Parchment version (small pastel gradients lose the cross) |
| Don't | Recolour, outline, add glow, rotate, crop the water, or place on a busy photo |

**Wordmark:** Montserrat Medium, 12–13 px, letter-spacing 4.2. All caps. Never bold, never tracked tighter than 3.

**Lockup:** wordmark left, mark right, 12 px gap. On the splash screen the mark may stand alone.

> Action: commission an SVG mono mark and a horizontal lockup. The current PNG is 512 px and will blur on 3× displays.

---

## 3. Colour

Persimmon/peach is the emotional colour, not the action colour. Actions are Ink on light and Amber on dark.

### 3.1 Light theme

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `canvas` | `#FAF6F0` | App background | — |
| `surface` | `#FFFFFF` | Cards, sheets, inputs | — |
| `ink` | `#1D1611` | Primary text, primary buttons | **16.6:1** on canvas |
| `body` | `#3A2E26` | Secondary paragraphs | **12.2:1** on canvas |
| `muted` | `#6A5A4C` | Metadata, helper text | **6.1:1** on canvas |
| `line` | `#E7DCCE` | Hairlines, dividers, decorative borders | 1.3:1 — decoration only |
| `ember` | `#A64B21` | Links, active labels, small accents | **5.3:1** on canvas, 5.7:1 on white |
| `sand` | `#F3E3D5` | Quiet highlight surfaces, chips | Ink on sand **14.3:1** |
| `peach` | `#F8D9BE` | Illustration and hero art only | 1.45:1 vs canvas — never a control boundary |
| `primary` | `#1D1611` | Primary button background | White on it **16.6:1** |
| `danger` | `#B3261E` | Destructive actions and errors | 6.5:1 on white |

### 3.2 Dark theme (new)

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `canvas` | `#14100D` | Night background | — |
| `surface` | `#1D1813` | Cards, player, sheets | — |
| `raised` | `#231C16` | Nested surfaces | — |
| `ink` | `#F4EADF` | Primary text (parchment) | **15.9:1** on canvas |
| `body` | `#DCCDBD` | Secondary paragraphs | 11.9:1 |
| `muted` | `#B9A997` | Metadata | **8.3:1** on canvas |
| `line` | `#332A22` | Hairlines | 1.6:1 — decoration only |
| `accent` | `#E8A45C` | Actions, active states, links | **8.9:1** on canvas |
| `accentInk` | `#2A1B10` | Text/icons on amber | 8.9:1 |
| `danger` | `#F2B8B5` | Errors | 11.1:1 on canvas |

### 3.3 Functional accents

Four candy colours (pink, lavender, cyan, teal) become three muted, labelled functions. They are **never** the only signal.

| Function | Light | On canvas | Dark | On night |
|---|---|---|---|---|
| Prayer | `#8C3A56` | 6.8:1 | `#E7A8BD` | 9.7:1 |
| Reflection | `#4B4879` | 7.8:1 | `#B9B3E8` | 9.6:1 |
| Rhythm / growth | `#47624A` | 6.3:1 | `#A9C3A9` | 10.0:1 |

Rules:

1. `peach` is a surface tint, never a button fill and never text.
2. Only one accent per view. The active tab, the primary button and a link do not all get different colours.
3. Accent colours pair with an icon **and** a text label.
4. Disabled text must still reach 4.5:1; use `muted` at 60% opacity on `canvas`, not a lighter grey on white.

---

## 4. Typography

Three voices, one system:

- **Georgia** — scripture, quotes, editorial headlines. It is already the reader's default and ships on both platforms.
- **Montserrat** — product headings, numbers, wordmark.
- **Inter** — interface, body, labels.

| Role | Family | Size / line | Tracking | Use |
|---|---|---|---|---|
| Display | Georgia | 40 / 46 | −0.5 | Night verse, editorial openers |
| H1 | Montserrat SemiBold | 32 / 38 | −0.6 | Screen title |
| H2 | Montserrat SemiBold | 24 / 30 | −0.4 | Section, card group |
| H3 | Montserrat SemiBold | 19 / 26 | −0.2 | Card title, sheet title |
| Scripture | Georgia | 20.5 / 31 | 0 | Reader body |
| Body | Inter Regular | 16 / 24 | 0 | Paragraphs, settings |
| Body small | Inter Regular | 15 / 22 | 0 | Dense lists |
| Caption | Inter Regular | 13 / 20 | 0 | Metadata, helper |
| Label | Inter SemiBold | 12 / 16 | 0 | Buttons, fields, tabs |
| Micro | Inter Medium | 10 / 14 | 1.4 | Overline only above 10 px |

Hard rules:

- Body never below **15 px** in the app; 16 px is the default.
- Caption never below **13 px**.
- No uppercase-with-tracking below 10 px. Section labels are sentence case, 13 px SemiBold.
- Line length 45–68 characters. Scripture max 72.
- Never centre-align more than two lines.
- Numbers in Montserrat tabular where available (`tnum`).

---

## 5. Space, shape, elevation

**Spacing:** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Screen gutter 24. Card padding 20–24. Section gap 32.

**Radius:** 8 control · 12 field · 20 card · 28 sheet · 999 pill. Do not mix 10, 14, 16, 18 ad hoc.

**Elevation:** one hairline `line` plus one soft shadow. No glow.
- card: `0 1px 2px rgba(88,52,25,.04), 0 6px 18px rgba(88,52,25,.05)`
- sheet: `0 14px 34px rgba(88,52,25,.08)`
- On dark, use `line` only; shadows disappear on near-black.

**Grid:** 4 px baseline, 8 px rhythm. Target 390 × 844, verify 320 and 430 widths, and 200 % text scale.

---

## 6. Iconography

- Primary family: **Feather**, the set the app already ships, for every control, tab and navigation glyph. No custom-drawn icons.
- Filled reaction states may use the existing Ionicons/MaterialCommunityIcons glyphs (`heart`, `star`, `hands-pray`) where Feather has no filled equivalent; never mix families inside one control.
- 1.75–2 px stroke, round caps and joins.
- Sizes 20 and 24 only; 16 for inline metadata.
- Use the official glyph names (`book-open`, `heart`, `users`, `sun`, `user`, `play`, `chevron-right`, `arrow-right`, `bell`, `search`, `plus`, `moon`) — never redraw a glyph by hand.
- Icons are never the only label for a primary action.
- Active tab = icon + label + a 16 × 2 px marker (light) or 4 px dot (dark).
- Icon buttons: 44 × 44 target, 20 px glyph, 12 px visual padding.

---

## 7. Components

| Component | Spec |
|---|---|
| Primary button | Ink fill, Parchment text, 52 px tall, radius 14, 16 side padding, 15 px Medium |
| Secondary | Transparent, 1.5 px Ink border, Ink text |
| On dark | Amber fill `#E8A45C`, `#2A1B10` text, 50 px tall |
| Text link | Ember, underline on press/focus, never colour alone |
| Chip | 30–32 px tall, radius full, 12 px Medium; active = Sand fill + Ember text |
| Input | 52 px tall, radius 12, 16 px text; label above 12 px; focus 2 px Ember ring + 2 px offset |
| Card | Surface, 1 px line, radius 20, 20–24 padding |
| Tab bar | 64–80 px, active state has icon + label + marker; 44 px targets |
| Sheet | Radius 28 top, drag handle 36 × 4, 24 padding |
| Toast | Ink surface, Parchment text, 4 s, never over a player |

Buttons say what happens: **Fortsätt läsa**, **Spara**, **Gå med** — not **OK** or **Klicka här**.

---

## 8. Motion

| Token | Value |
|---|---|
| micro | 120 ms, ease-out |
| enter | 180–220 ms, cubic-bezier(.2,.7,.2,1) |
| sheet | 260 ms, spring, no bounce |
| reduced motion | cross-fade 120 ms, no transforms |

Never animate scripture. Never loop a decorative element. Respect `prefers-reduced-motion` / OS reduce motion.

---

## 9. Accessibility standard

Target: **WCAG 2.2 AA**, with AAA for primary reading text.

| Requirement | Rule |
|---|---|
| Contrast | 4.5:1 text · 3:1 large text (≥ 19 px bold / 24 px) and UI boundaries |
| Targets | ≥ 44 × 44 px, ≥ 8 px apart |
| Focus | 2 px ring, 2 px offset, never removed |
| Colour | Never the only carrier; pair with icon + label + count |
| Text scaling | 200 % without clipping; no fixed-height text containers |
| Screen readers | Every icon button has a label; headings use `accessibilityRole="header"`; verse numbers are read as “vers 11” |
| Motion | Reduced motion honoured; no autoplay audio without a visible stop |
| Forms | Visible labels, inline errors next to the field, error text + icon |
| Audio | Player controls labelled; progress announced as time, not percent only |
| Dark mode | Separate tokens, tested for contrast; no pure black, no inverted images |

**Contrast proof**

| Pair | Ratio | Level |
|---|---|---|
| Ink on paper | 16.6:1 | AAA |
| Body on paper | 12.2:1 | AAA |
| Muted on paper | 6.1:1 | AA |
| Ember on paper | 5.3:1 | AA |
| White on Ember | 5.7:1 | AA |
| Parchment on night | 15.9:1 | AAA |
| Amber on night | 8.9:1 | AAA |
| Night on amber | 8.9:1 | AAA |
| Muted dark on night | 8.3:1 | AAA |

The old peach-on-cream button sat at **1.45:1** against its own card — visible as a shape, not as an action. Peach remains for art; actions moved to ink.

---

## 10. Voice

Warm, plain, unhurried. Swedish first, English localised.

- Say **du**, never **ni**.
- Short sentences. One idea each.
- No Christian jargon where a plain word works: “läs” before “reflektera”.
- Never shame: “Du kan börja igen i morgon” — not “Du missade dagen”.
- Microcopy is specific: “12 vänner ber för varandra idag” — not “Engagera dig”.
- No exclamation marks in the product. One is allowed in a celebration, never in an error.

---

## 11. Implementation

`ui/theme.ts` today exposes `brandPalette`, `shadcn`, `colors`, `typography`, `radius`, `shadows`. 2.0 maps cleanly:

```ts
// light
colors.background   = "#FAF6F0"; // canvas
colors.surface      = "#FFFFFF";
colors.textPrimary  = "#1D1611"; // ink
colors.textSecondary= "#3A2E26";
colors.textMuted    = "#6A5A4C";
colors.border       = "#E7DCCE";
colors.accentWarm   = "#A64B21"; // ember — text/accent, not a fill
colors.onAccent     = "#FFFFFF";

// dark (new mode)
dark.background = "#14100D";
dark.surface    = "#1D1813";
dark.text       = "#F4EADF";
dark.muted      = "#B9A997";
dark.border     = "#332A22";
dark.accent     = "#E8A45C";
dark.onAccent   = "#2A1B10";
```

`koino.tokens.json` carries the same values for design handoff and codegen. Suggested React Native mapping:

- `typography.body` 15 → **16 / 24**
- `typography.caption` 12 → **13 / 20**
- `typography.sectionLabel` 11 uppercase → **13 / 18 SemiBold, sentence case**
- `typography.navLabel` 11 → **12 / 16**
- `radius` 6/8/10/12/20 → **8/12/20/28/full**
- `colors.accentWarm` (#A9571F) → **#A64B21** for text, with `#1D1611` as the primary fill.

Screens to migrate first: **Idag, Biblern (reader chrome), Gemenskap, Inställningar**. The reader body itself already meets the type rules and should not change.

---

## 12. The three directions

All three use the same tokens, spacing, type scale and accessibility rules. They differ in temperature and chrome.

| | A · Sanctuary | B · Daylight | C · Vigil |
|---|---|---|---|
| Mood | Editorial, paper, timeless | Structured, warm, everyday | Contemplative, night |
| Background | Paper `#FAF6F0` | Off-white `#FCFAF7` | Night `#14100D` |
| Display | Georgia | Montserrat | Georgia |
| Accent | Ember `#A64B21` | Amber `#A94A12` | Amber `#E8A45C` |
| Cards | Hairline, no shadow | White, soft shadow | Hairline on night |
| Navigation | Flat bar, top marker | Floating pill dock | Flat bar, amber dot |
| Best for | Reading, devotionals, App Store | Default v1.1 | Automatic dark mode |
| Risk | Can feel literary if overused | Busy if every card gets equal weight | Brand recall depends on the mark |

**Recommendation:** ship **B · Daylight** as the default, use **A · Sanctuary** for reading and editorial surfaces (onboarding, verse of the day, plan covers), and ship **C · Vigil** as the automatic night theme. This gives one product, three temperatures, and no second design language to maintain.

---

## 13. QA checklist

- [ ] Every text/background pair in the changed screen is in the contrast table and passes.
- [ ] Active states include icon + label + marker.
- [ ] Every icon-only control has an accessibility label and a 44 px target.
- [ ] 200 % text scale on Home, Bible, Community and Settings — nothing clipped.
- [ ] Dark mode checked on the same four screens.
- [ ] Focus ring visible on every interactive element (web and hardware keyboard).
- [ ] Reduced motion respected.
- [ ] No peach button, no gradient glow, no uppercase section label under 10 px.
- [ ] Screen reader pass on the reader and the player.

---

## 14. Open decisions for you

1. Approve the direction (recommend B, with A for reading and C for night).
2. Approve a mono SVG mark and horizontal lockup.
3. Decide whether the app UI language becomes Swedish-first (the designs use Swedish; the current build mixes English tab labels with Swedish content).
4. Confirm the reading font: Georgia is free and already present; a licensed Source Serif 4 would be more distinctive but adds ~140 KB per weight.

## 15. Implementation status — 21 November 2026

The system layer is live on branch `feat/brand-2-daylight`:

- `ui/theme.ts` now carries Daylight and Vigil palettes, the 2.0 type scale, the 8pt spacing scale and the new radius/shadow values. `colors` and `shadcn` are applied in place by the theme provider.
- `ui/theme-provider.tsx` follows the device by default, persists Light/Dark/System in AsyncStorage, and updates the native background.
- **Appearance** is in Jag → settings, with System / Light / Dark. Swedish and English copy included.
- Primary actions are ink on light and amber on dark; peach is illustration only.
- The moving gradient wash is gone; the app sits on flat paper (`AmbientBackground` is now a flat canvas).
- Tab dock, tab header, cards, buttons, inputs, chips, badges and the prayer moment all use the new tokens; the Bible reader has its own Sanctuary (light) and Vigil (dark) palettes.

Verified: `tsc --noEmit` passes; the welcome and sign-in screens were rendered on a Pixel emulator in both Daylight and Vigil. The authenticated Home, Bible and Community screens are wired to the same tokens but were not screenshot-tested in this pass because no test account was available.

Still open:

1. A native rebuild is needed for `userInterfaceStyle: "automatic"` to reach the OS (the JS palette already switches; the built app still declares a light UI style).
2. The Home, Bible and Community layouts keep their existing information architecture; they adopt the 2.0 surface language but are not pixel-for-pixel the mock layouts. That is the next design-engineering pass.
3. A one-colour SVG mark and horizontal lockup are still to be drawn.
4. Onboarding and donation keep their current layout, now with 2.0 colour and type.

The written guide above remains the source of truth; the app is the first implementation of it.
