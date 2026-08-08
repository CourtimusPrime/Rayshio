---
name: Rayshio
description: A dense, material-first dashboard for reading vendor spend off your own mailbox.
colors:
  accent: "#6d28d9"
  accent-soft: "#f3eeff"
  accent-strong: "#5b21b6"
  canvas: "#fbfbfc"
  canvas-light: "#fbfbfc"
  canvas-dark: "#0f0f12"
  surface: "#ffffff"
  line: "#ececf0"
  line-strong: "#e0e0e6"
  ink-900: "#1c1c20"
  ink-700: "#3f3f46"
  ink-500: "#71717a"
  ink-400: "#6e6e78"
  warn-soft: "#fffbeb"
  warn-text: "#b45309"
  warn-solid: "#f59e0b"
  danger-soft: "#fef2f2"
  danger-text: "#be123c"
  danger-solid: "#f43f5e"
typography:
  hero:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: "2.75rem"
    letterSpacing: "-0.032em"
  hero-lg:
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: "3.75rem"
    letterSpacing: "-0.036em"
  display:
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: "2.25rem"
    letterSpacing: "-0.028em"
  title1:
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.024em"
  title2:
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.021em"
  title3:
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: "1.375rem"
    letterSpacing: "-0.018em"
  lede:
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.75rem"
    letterSpacing: "-0.014em"
  subhead:
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: "1.25rem"
    letterSpacing: "-0.012em"
  body:
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
    letterSpacing: "-0.006em"
  footnote:
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: "1.125rem"
    letterSpacing: "0em"
  caption:
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
    letterSpacing: "0.01em"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.125rem"
    letterSpacing: "0em"
  micro:
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: "0.875rem"
    letterSpacing: "0.055em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "16px"
  2xl: "20px"
  3xl: "28px"
  full: "9999px"
spacing:
  hair: "4px"
  tight: "8px"
  snug: "10px"
  base: "12px"
  card: "20px"
  card-lg: "24px"
  page: "20px"
  page-lg: "32px"
  section: "64px"
  section-lg: "96px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 16px"
    typography: "{typography.footnote}"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-500}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 10px"
    typography: "{typography.footnote}"
  button-secondary-hover:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-900}"
  button-oauth:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.lg}"
    height: "44px"
    padding: "0 20px"
    typography: "{typography.body}"
  input-search:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 12px 0 36px"
    typography: "{typography.body}"
  input-search-focus:
    backgroundColor: "{colors.surface}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  nav-item:
    textColor: "{colors.ink-500}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    typography: "{typography.body}"
  nav-item-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    typography: "{typography.body}"
  badge-parsed:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.caption}"
  badge-pending:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn-text}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.caption}"
  badge-failed:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
    typography: "{typography.caption}"
  table-header-cell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-400}"
    padding: "10px 20px"
    typography: "{typography.micro}"
---

# Design System: Rayshio

## Overview

**Creative North Star: "The Working Desk"**

This is a finance lead's desk, not a data-visualization showcase. Papers are
stacked in a real order — the current one on top and reachable — and the
interface's job is to get out of the way of the document. That produces a shell
rather than a page: a fixed rail on the left, a floating bar at the top, and one
inner scroller in the middle that holds everything the user actually came to
read. Nothing about that shell is decorative. The rail is opaque because nothing
passes behind it; the top bar is translucent because content genuinely scrolls
under it; the invoice drawer slides in over the work and can be thrown back off
with a flick. Depth in this system is a statement about what is physically on
top of what, and it is communicated by material before it is communicated by
shadow.

The personality is dense and unornamented. Type is set on a replaced scale where
every size carries its own leading and tracking, so a screen composed only of
tokens is already typographically correct — reaching for an untuned size is a
visible failure, not a shortcut. Figures are tabular by default because a
currency total that shifts horizontally while it counts up reads as unstable,
and this product's entire claim is that its numbers can be trusted. Colour is
almost absent: four ink greys, two surfaces, two hairlines, and one accent that
behaves like a lit indicator on a panel rather than a brand splash. Status tints
(amber, rose) exist only where a state genuinely needs to be read at a glance.

Controls are immediate and physical. Press feedback runs on CSS `:active`, so
the pixel moves before React has heard about the event — 4% scale on a small
target, 1.5% on a wide one, and a tint instead of a transform on table rows,
because a full-width row shrinking reads as a glitch. Motion elsewhere is
spring-based and critically damped: it animates from wherever the value
currently is, so new input redirects the motion instead of restarting it.
Overshoot is reserved for gesture release, where the user threw the thing and
bounce is honest physics rather than a wobble.

**Key Characteristics:**

- A fixed app shell with one inner scroller, not a scrolling page.
- Material (blur, translucency) carries depth first; the shadow ramp is the
  fallback for surfaces that cannot be translucent.
- A replaced type scale — thirteen sizes, each with its own leading and tracking.
- Tabular figures everywhere a number can change.
- One accent, used sparingly; status colour only where state must be read fast.
- Press feedback with no JavaScript on the input path.
- Light and dark are two designed themes, not an inversion.

## Colors

A near-monochrome greyscale carrying almost all of the interface, with a single
violet accent and two status tints admitted only where a state has to be
read at a glance.

Every colour is authored as a space-separated sRGB channel triplet in a CSS
custom property, consumed as `rgb(var(--x) / <alpha-value>)` so opacity
modifiers compose. A raw `var()` colour silently discards alpha, which is how
translucent surfaces once rendered fully opaque. The frontmatter records the
light theme, which is normative; every token has a hand-tuned dark counterpart
in `.impeccable/design.json`.

### Primary

- **Violet** (`#6d28d9` light / `#7c3aed` dark): the single accent. It marks the
  active nav item, the connection indicator, the primary action, the "parsed"
  state, the leading series in every chart, and the "View all" link. White on it
  measures 7.10:1 light and 5.70:1 dark, so a filled button passes at 13px in
  both themes.
- **Lavender** (`#c4b5fd`, dark theme only): foreground-only. It is the colour
  of accent text on `accent-soft`, and it is the focus ring in dark mode because
  the accent sits too close to the surface there to read as a ring. Never a
  fill. Measures 9.11:1 on `accent-soft` and 9.68:1 on the dark surface.
- **Violet Wash** (`#f3eeff` light / `#221540` dark): the accent's tint. Active
  nav background and "parsed" badge fill.

**The accent lifts one step in dark, and that is a constraint rather than a
preference.** The burnt orange this replaced held a single value across both
themes, because the brighter orange that reads better on near-black dropped
white-on-accent to 3.6:1. Violet has the opposite problem: it is darker than
orange at equal chroma, so holding `#6d28d9` in dark measures only 2.69:1
against the canvas and a filled button loses its own edge. `#7c3aed` clears
3:1 against the canvas (3.36:1) while still carrying white text (5.70:1). Both
thresholds, neither with much room — this is not a free knob.

**Why violet at all.** Burnt orange was the incumbent and it read as brown,
which is not a styling failure but an arithmetic one: brown *is* dark orange,
and any orange dark enough to carry white text lands there. Hues in the
blue–violet band stay chromatic at the same lightness. Violet was chosen over
indigo and blue for distinctiveness, and over crimson and green because both
collide with meaning already spent — `danger-text` is `#be123c`, and green
reads as "under budget".

**The hue is current, not a commitment.** PRODUCT.md records nothing in the
identity as binding. What *is* durable is the accent's **role structure**:
exactly one accent, plus a soft tint for fills and a bright that only ever
appears as foreground. A replacement hue must supply all three roles and hold
the same contrast relationships, or the focus ring, the badge, and the active
nav item all break together.

### Neutral

- **Paper** (`#fbfbfc` light / `#0f0f12` dark): the canvas the content scroller
  sits on, and the fill for recessed things — table headers, search inputs,
  skeletons, hover backgrounds.
- **Card** (`#ffffff` light / `#17171b` dark): every raised surface. In dark it
  sits *above* the canvas rather than below it, because a raised panel reads as
  lighter in a dark UI.
- **Hairline** (`#ececf0` light / `#26262c` dark) and **Hairline Strong**
  (`#e0e0e6` light / `#33333b` dark): borders and dividers. The strong variant
  is the input's focused border and little else.
- **Ink 900** (`#1c1c20` light / `#f2f2f4` dark): headings, figures, primary
  text, and the wordmark badge.
- **Ink 700** (`#3f3f46` / `#c8c8ce`): secondary body text.
- **Ink 500** (`#71717a` / `#9a9aa3`): labels, inactive nav, supporting figures.
- **Ink 400** (`#6e6e78` light / `#8d8d96` dark): table header caps, icon
  defaults, placeholders — the quietest step that is still *legible*, which is
  the operative word. It was `#9b9ba3` / `#74747d`, measuring 2.76:1 and 3.86:1,
  and it carries small text everywhere: column heads, stat labels, placeholders,
  the conversion note. All of it failed WCAG AA. The current values are 5.04:1
  on surface and 5.10:1 on the dark surface.

**The two canvases** (`--canvas-light` `#fbfbfc`, `--canvas-dark` `#0f0f12`) are
declared in both themes and never invert. `--canvas` alone cannot answer "what
colour am I flipping *to*", which is what the theme transition needs.

### Tertiary

Status tints, each a soft fill / text / solid-dot triplet so a badge stays
legible in both themes:

- **Amber** (`#fffbeb` / `#b45309` / `#f59e0b`): pending, and — deliberately —
  a month-over-month *increase*. Spending more is not good news, so the delta
  chip is tinted by direction rather than always reading as the accent.
- **Rose** (`#fef2f2` / `#be123c` / `#f43f5e`): failures and error notes.

### Named Rules

**The One Indicator Rule.** The accent is an indicator, not a brand wash. It
appears on the active nav item, one primary action per view, the connection dot,
and the leading chart series — and essentially nowhere else. Its scarcity is
what makes the active state findable in a screen of grey.

**The Direction-Over-Brand Rule.** When a value carries good/bad meaning, tint
it by direction, never by brand. A rising spend chip is amber even though amber
is not the accent; making it violet would flatter a number the user should look at.

**The Two-Themes Rule.** Dark is not an inversion. Every dark value is
hand-picked — the accent lifts exactly one step so it still separates from the
canvas, accent-strong lightens much further because it is foreground, surfaces
rise above the canvas instead of sinking below it, and the shadow tint
multiplies by 3.4 because a dark UI has less contrast to spend. Never derive one
theme from the other programmatically.

**The Measured-Ink Rule.** Every ink step is contrast-checked against the
surface it actually sits on, not eyeballed. The quietest step is the one that
breaks: it is the most tempting to lighten and it carries the most small text.

## Typography

**Body Font:** the platform UI stack — `-apple-system`, `BlinkMacSystemFont`,
`"SF Pro Text"`, `"Segoe UI Variable Text"`, `"Segoe UI"`, `system-ui`,
`Roboto`, `"Helvetica Neue"`, `Arial`, `sans-serif`.

**Mono Font:** `ui-monospace`, `SFMono-Regular`, `"SF Mono"`, `Menlo`, `Monaco`,
`"Cascadia Mono"`, `Consolas`, `"Liberation Mono"`, `monospace`.

**Character:** deliberately not a webfont. The platform face already ships
optical sizing, tracking tables and legibility tuning that a downloaded Inter
does not — on Apple platforms the 32px figures get SF Display metrics and the
11px labels get SF Text, automatically — and it removes a render-blocking
cross-origin request from the critical path. The result reads as native
software rather than as a web app wearing a typeface.

Tailwind's default size scale is **replaced outright**, not extended. Two curves
run through the whole ramp: tracking tightens as size grows and loosens as it
shrinks, and leading closes as size grows. Body sits near zero tracking.

### Hierarchy

- **Hero** (600, 40px/44px, −0.032em; **Hero Large** 56px/60px, −0.036em at
  `md`): the landing headline, and only that. Used as
  `text-hero md:text-hero-lg`.
- **Lede** (400, 17px/28px, −0.014em): the paragraph under a hero. It
  deliberately loosens back out below body — it is read, not scanned.
- **Display** (600, 32px/36px, −0.028em): the primary figure on a card. The
  spend total, the budget total. Always paired with tabular figures.
- **Title 1 / Title 2 / Title 3** (600, 28px / 22px / 17px): page and section
  headings. Title 2 is the marketing section heading; Title 3 is the largest
  wordmark size.
- **Subhead** (500, 15px/20px, −0.012em): dense sub-headings, the sidebar
  wordmark.
- **Body** (400, 14px/20px, −0.006em): the default. Nav items, table content,
  input text.
- **Footnote** (500, 13px/18px): controls. Button labels, select values, month
  labels, secondary table cells.
- **Caption** (500, 12px/16px, +0.01em): badges, chips, metadata.
- **Code** (400, 12px/18px, mono): endpoints, keys, config snippets. Looser
  leading than proportional text at the same size, which monospace needs.
- **Micro** (500, 11px/14px, +0.055em, uppercase): table column headers and the
  smallest labels. The wide tracking is an override of Tailwind's 0.025em and
  exists specifically because uppercase at 11px needs materially more space
  than lowercase at the same size.

### Named Rules

**The Tuned-Size Rule.** A size token carries its leading and tracking as one
decision. `text-base`, `text-lg` and `text-xl` do not exist in this project, and
an arbitrary bracket value (`text-[15px]`) is a defect. If no token fits, the
scale is wrong and gets fixed — not bypassed.

**The Tabular Rule.** Any number that can change, animate, or sit in a column
gets `.tnum`. The system font ships proportional figures, so without it a
counting currency value jitters horizontally on every tick.

**The Case-Is-A-Size Rule.** Uppercase is only used at Micro, and only with
0.055em tracking. Uppercase at body size, or at default tracking, is not part of
this system.

## Layout

**The shell.** Above `md` (768px) the app is a fixed-height flex row: a 240px
rail, then a column holding the sticky top bar and one scrolling `<main>`.

**What lives where.** The rail carries the wordmark, invoice search, the six
nav items, Settings and the theme toggle. The header carries the month
navigation at the far left, then display currency and the account, right
aligned. Search sits in the rail rather than the header because it searches
*invoices* specifically, not the page you are on — it belongs beside the thing
it navigates to. The header has **no visible page title**: the month took that
slot, since it qualifies every figure on the page. The title survives as an
`sr-only` `<h1>`, because a page with no heading is one a screen reader cannot
announce on arrival and heading navigation cannot jump to.

The
page itself never scrolls — `overscroll-behavior: none` on `html` and `body`
suppresses rubber-banding and pull-to-refresh, because dragging a fixed shell
away from its edge reveals nothing and pull-to-refresh would discard SPA state
for a gesture that meant to scroll a table. Below `md` the rail becomes a
horizontal strip *above* the header in document order, which is why the sticky
bar's z-index sits above the sidebar's: on mobile they overlap, on desktop they
never do.

**Density and rhythm.** App content is padded 20px, rising to 32px at `md`;
vertical page padding is 24px rising to 32px. Cards are padded 20px, rising to
24px at `md`. The recurring gaps are 8px, 10px and 12px — this is a dense
interface and the spacing scale reflects that.

**Marketing pages** use a different rhythm entirely: a centred `max-w-6xl`
container with 64px section padding rising to 96px at `md`. Density is an app
property, not a system-wide one.

**Tables** are horizontal scroll regions with a real tab stop (`tabIndex={0}`,
`role="region"`), because without one Safari and Firefox cannot scroll them by
keyboard at all — Chrome adds one implicitly, which is exactly why it is easy to
miss. Minimum table width is 640px.

**Stacking** is a named ladder, never an ad-hoc number: raised (10), sidebar
(20), chrome (30), scrim (40), sheet (50), popover (60), toast (70).

### Named Rules

**The One-Scroller Rule.** The app shell is fixed; exactly one element scrolls.
Anything that needs to scroll independently is a scroll region with its own tab
stop, not a second page-level scroller.

**The Clip-Not-Hidden Rule.** Use `overflow-x: clip` on the body and
`.clip-card` (`overflow: clip` + `overflow-clip-margin: 6px`) on cards.
`overflow: hidden` makes an element a scroll container, which silently breaks
every `position: sticky` descendant and shears the focus ring off any control
flush to a card edge.

## Elevation & Depth

**Material first, shadow second.** Where something genuinely passes behind a
surface, that surface is a real translucent material with backdrop blur and
saturation. Where nothing passes behind it, it stays opaque and borrows the same
vocabulary — the sidebar is a flex sibling with nothing underneath it, so
blurring a flat colour would cost a compositor layer and buy nothing. The shadow
ramp is what carries depth for surfaces that cannot be translucent, and for
stating stacking order between opaque objects.

The ramp is **one geometry for both themes**, differing only in tint colour and
a boost multiplier (×1 light, ×3.4 dark) — two values, not eight, so a change to
the ramp is a change in one place.

### Material Vocabulary

- **Chrome** (`--material-chrome-bg`, blur 24px, saturate 180%; 0.72 alpha
  light / 0.66 dark): the sticky top bar. Its bottom border is declared
  transparent up front and only *colours in* once content is actually
  underneath, so at rest the chrome has no seam at all.
- **Sheet** (`--material-sheet-bg`, blur 30px; 0.94 alpha light / 0.92 dark):
  the invoice drawer. Deliberately near-opaque — it sits over an already-blurred
  scrim, and stacking two light materials destroys legibility, so 6% reads as a
  hint of depth and nothing more. While dragging, the blur is dropped entirely
  and the surface goes opaque: a backdrop-filter re-samples everything behind it
  every frame, and nothing is legible through a sheet travelling under a finger.
- **Rail** (opaque surface + hairline + inset rim light): the sidebar. Same
  vocabulary, no blur.
- **Scrim** (blur 8px, saturate 105%, 0.32 alpha light / 0.55 dark): a *dimmer*,
  so it is a fixed near-black in both themes rather than `ink-900` — which
  inverts, and in dark would lighten the page instead of pushing it back.

### Shadow Vocabulary

- **e1** (`0 1px 2px -1px …, 0 2px 6px -2px …`): a card at rest. An object,
  permanently.
- **e2**: hover on a raised object.
- **e3**: sticky chrome and popovers.
- **e4**: the full-height drawer.
- **edge** (`0 1px 0 0 line, 0 10px 18px -14px …`): where content meets floating
  chrome. A hairline and a short falloff, not a drop shadow — and only painted
  once something actually scrolls underneath.

### Named Rules

**The Honest-Blur Rule.** Translucency is only used where content genuinely
passes behind the surface. If nothing moves underneath, the surface is opaque.

**The Bigger-Reads-Thicker Rule.** Elevation maps to stacking level, not to
emphasis: e1 cards, e2 hover, e3 sticky chrome, e4 drawer. A shadow that does
not correspond to a stacking level is a bug.

**The Graceful-Material Rule.** Every material has three fallbacks and they are
not optional: `prefers-reduced-transparency` makes it solid *and* makes the
chrome's border permanent (without translucency, the scroll edge no longer
communicates overlap on its own); `prefers-contrast: more` makes it solid with a
45%-ink border; and `@supports not (backdrop-filter)` gives a near-solid surface
rather than an unreadable wash.

## Shapes

Rounding is a six-step ramp named after the Tailwind keys that consume it, so
existing classes deepen in place: 6px (sm), 8px (md/default), 10px (lg), 16px
(xl), 20px (2xl), 28px (3xl), plus a full pill for badges and dots.

Nesting stays mathematically correct: a 10px frame with 2px padding around an
8px thumb is exactly right, and the ramp is spaced so that relationship holds at
every step. Controls — buttons, inputs, selects, nav items — are 10px. Cards and
panels are 16px. Badges, chips and status dots are pills.

Borders are hairlines at exactly 1px, in `line` at rest and `line-strong` for a
focused input. Skeletons and empty states use `ring-1` rather than a border so
they do not shift layout when they resolve into real content.

The one non-rounded gesture in the system is the wordmark: a solid `ink-900`
square badge (8px radius at 32px, 16px at 36px) carrying a `canvas`-coloured
"R", set beside the product name at 600 weight. It is the only inverted surface
in the product.

## Components

### Buttons

- **Shape:** softly rounded (10px), fixed heights — 40px for a primary action,
  36px for a control, 44px for the OAuth button.
- **Primary:** accent fill, white label at Footnote (13px/500), 16px horizontal
  padding. Hover deepens to `accent-strong`; disabled drops to 50% opacity.
- **Secondary / icon:** surface fill, 1px hairline border, `ink-500` label that
  darkens to `ink-900` on hover with a `canvas` fill. Disabled drops to 40%
  opacity *and* suppresses the hover fill, so a dead control never lights up.
- **OAuth (Google):** 44px, surface fill, hairline border, `e1` shadow lifting
  to `e2` on hover, with the four-colour mark inlined at 18px. It sits on a
  neutral surface rather than the accent because Google's brand guidelines
  require it — which is why the header CTA stays accent-coloured and links here
  instead of carrying the mark itself.
- **Press:** `.press` (4% scale) on standard targets, `.press-lg` (1.5%) on
  wide ones, `.press-row` (tint only) on rows. All on CSS `:active`, all
  110ms on `--ease-out-apple`.

### Chips & Badges

- **Style:** pill, 10px horizontal / 4px vertical padding, Caption (12px/500),
  soft tint fill with matching text colour and a 6px solid dot where a state is
  being named.
- **States:** Parsed (Violet Wash / accent-strong), Pending (amber),
  Failed (rose). Delta chips reuse the same shape but are tinted by direction:
  amber for an increase, Violet Wash for a decrease, plain `canvas` for no
  change.

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** `surface`, on a `canvas` page.
- **Shadow Strategy:** `e1` at rest — permanent, because a card is an object.
- **Border:** 1px `line`.
- **Internal Padding:** 20px, 24px at `md`.

### Inputs / Fields

- **Style:** 36px tall, 10px radius, 1px `line` border, `canvas` fill (recessed
  relative to the card it sits on), Body text with `ink-400` placeholder. A
  leading icon sits at 12px with the text inset to 36px.
- **Focus:** the fill lifts from `canvas` to `surface` and the border goes to
  `line-strong` — the field comes forward rather than lighting up — plus the
  global focus ring.
- **Selects:** surface fill, hairline border, Footnote text, `canvas` on hover.
  They cannot use `.tap` (replaced elements render no pseudo-elements), so they
  are grown to 44px by the coarse-pointer rule instead.

### Navigation

- **Style:** 10px radius, 8px/12px padding, Body text, 16px Lucide icons at
  1.75 stroke.
- **Default:** `ink-500` label, `ink-400` icon.
- **Hover:** `canvas` fill, `ink-900` label.
- **Active:** Violet Wash fill, `accent-strong` label at 500 weight, accent icon.
- **Mobile:** below `md` the rail becomes a horizontal scroller with its own tab
  stop, since a `overflow-x: auto` list is otherwise unreachable by keyboard.
  The rail's search is `hidden md:block` for the same reason — the collapsed
  strip has no room for a field, and the Invoices page carries its own.

### Theme Toggle

A three-option radiogroup (light / dark / system) rather than a two-state
switch: a plain toggle gives no way back to following the OS once touched.

The active option is marked by **one indicator that travels** — a `layoutId`
spring moves the same element between the three buttons rather than fading a
background in on whichever is current. Critically damped, per the motion rules;
under reduced motion it jumps rather than travels. Arrow-key navigation with a
single tab stop, because that is a radiogroup's documented contract.

### Donut Chart

The centre of the ring **is** the readout: "Total" at rest, the hovered
category's name and amount while hovering, with the other slices dropping to
40% opacity. There is no floating tooltip, and that is the point — the donut
sits in a 160px box and Recharts renders tooltips inside it, so a tooltip always
collided with the centre label. Removing the tooltip removes the collision by
construction rather than by positioning.

### Focus Ring

The system's signature accessibility detail: `0 0 0 2px surface, 0 0 0 4px
accent` — a keyline in the *surface* colour, then the ring. The keyline is what
makes the ring readable on any background, including the `accent-soft` fill
under the active nav item and both tablists, where a bare accent outline would
disappear. Painting order does the work: an outer box-shadow paints below the
element's own background, so the ring never covers content. A transparent 2px
`outline` is kept alongside it purely so Windows High Contrast has something to
repaint, since box-shadow is not rendered in forced-colours mode. The whole rule
is wrapped in `:where()` so it carries zero specificity and any component can
override it without `!important`.

### Motion

Springs, not curves, for anything a user can interrupt — a spring animates from
wherever the value currently is, so new input moves the target rather than
restarting the motion. Four presets, expressed in Apple's designer-facing terms
(`visualDuration` = response, `bounce` = 1 − damping ratio):

- **ui** (0.35s, bounce 0): the default; anything the interface initiates.
- **quick** (0.26s, bounce 0): chevrons, chips, an accordion opening.
- **surface** (0.4s, bounce 0): large surfaces arriving on their own.
- **momentum** (0.35s, bounce 0.2): gesture release only.

CSS transitions use `--ease-out-apple` (`cubic-bezier(0.32, 0.72, 0, 1)`) at
120/200/320ms. Direct manipulation uses real physics: exponential-decay flick
projection (deceleration 0.998), asymptotic rubberbanding past a boundary, and
velocity computed over a 100ms window so a finger that has rested for 200ms
reads as zero rather than as whatever it was doing before it stopped.

Reduced motion collapses transitions and animations to 0.01ms and strips the
press *scale* while keeping the press *tint* — the ask is a gentler equivalent,
not the removal of feedback. The one-shot theme cross-fade (260ms) is
deliberately exempt: easing an abrupt brightness jump is precisely what a
reduced-motion user wants, and the alternative is a hard flash, not stillness.

**The theme change is a wipe, not a fade.** Where the browser supports view
transitions, the page is snapshotted before and after and the new theme is
revealed over the old one from the top edge (420ms,
`cubic-bezier(0.76, 0, 0.24, 1)`), with the outgoing snapshot explicitly held
still — the default cross-fade under a clip reveal reads as the page dimming
for no reason. Both layers are real content, so the moving edge is a boundary
between two themes rather than a blank panel passing over the app.

Two things make it work and are easy to lose. The React state change must be
wrapped in `flushSync`, because `startViewTransition` captures the "after" state
when its callback returns and an async setState would snapshot two identical
frames. And browsers without view transitions get a **curtain** fallback: an
opaque panel in the incoming theme's colour sweeps down, the palette swaps
behind it, and it retreats back up the same edge — 380ms per leg, driven by
keyframes rather than a transition, since an element that mounts mid-flip has no
from-state for a transition to animate away from.

Reduced motion mounts neither. A full-viewport reveal is exactly the large-area
movement the preference asks us to drop, so it falls back to the colour
cross-fade alone.

### Data Display

Charts take colours as props from CSS variables rather than classes, with a
dedicated chart token set (grid, cursor, axis, tick, muted bar) tuned per theme.
Usage categories carry one stable colour each, stepping down a single violet
ramp from `#6d28d9` to `#e6dffc` with `other` breaking to neutral grey
(`#d4d4d8`) — compute, storage and network share the accent family because they
are the infrastructure costs most often compared against each other.

Bar charts fill the highest bar in the accent and every other bar in
`--chart-bar-muted` (`#e2d7f9` light / `#452e78` dark), so rank is readable
without a legend.

Every data-backed section renders `LoadingBlock` / `LoadingLines` (pulsing
`canvas` fill with a `line` ring), `ErrorNote` (rose fill, alert or status role
by whether the error just happened), or `EmptyNote` (canvas fill, inbox icon,
`ink-500` text) — never a bare chart.

## Do's and Don'ts

### Do:

- **Do** use the shell: fixed rail, sticky chrome, one inner scroller. Anything
  else that scrolls is a scroll region with a real tab stop.
- **Do** reach for a material before a shadow when something passes behind a
  surface, and give every material its three fallbacks
  (`prefers-reduced-transparency`, `prefers-contrast: more`, `@supports not
  (backdrop-filter)`).
- **Do** put `.tnum` on every number that can change, animate, or sit in a
  column.
- **Do** use a named type token for every piece of text, and a named z-index
  token for every stacking decision.
- **Do** tint by direction, not by brand, when a value carries good/bad meaning.
- **Do** hand-pick dark values. Surfaces rise above the canvas in dark; the
  accent lifts one step and the accent-strong lightens much further.
- **Do** expand a touch target with `.tap` rather than by growing the control —
  and remember it cannot reach `<select>` or `<input>`, which the coarse-pointer
  rule grows to 44px instead.

### Don't:

- **Don't** use an untuned type size. `text-base`, `text-lg` and `text-xl` do
  not exist here, and `text-[15px]` is a defect. Every size token carries its
  own leading and tracking as one decision.
- **Don't** put bounce on a state change. Springs are critically damped
  everywhere except gesture release; overshoot on something the user did not
  throw reads as a wobble, not as physics.
- **Don't** render an empty chart for absent data. Missing itemization, no
  invoices, no prior month — each gets an explicit empty or error state. A chart
  with no bars implies zero, and zero is a different claim.
- **Don't** blur a surface with nothing behind it. The sidebar is opaque on
  purpose; blurring a flat colour costs a compositor layer and buys nothing.
- **Don't** use `overflow: hidden` for clipping. It makes the element a scroll
  container, which breaks every sticky descendant and shears focus rings off
  edge-flush controls. Use `clip` (plus `overflow-clip-margin`).
- **Don't** author a colour as a bare `var()`. Every palette entry is a channel
  triplet consumed as `rgb(var(--x) / <alpha-value>)`, or opacity modifiers
  silently stop working.
- **Don't** spread the accent. One indicator per view, not a brand wash — and
  do not substitute a new hue without supplying all three accent roles (fill,
  soft tint, foreground-only bright).
- **Don't** reach for `whileTap` or any JS-driven press. Press feedback runs on
  CSS `:active` so the pixel moves before React hears the event.
- **Don't** ship an ink or accent value without measuring it against the surface
  it sits on. The quietest ink step failed AA for months precisely because it
  looked fine.
- **Don't** put a Recharts tooltip inside a small fixed-size chart box. It
  renders within the container and will collide with anything centred there;
  either the centre becomes the readout, or the tooltip needs
  `allowEscapeViewBox`.
- **Don't** change `tailwind.config.js` and expect HMR to pick it up. The
  utility is never generated and the class silently resolves to nothing, which
  looks exactly like a CSS bug. Restart the dev server.
