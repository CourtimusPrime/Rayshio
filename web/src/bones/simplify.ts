/**
 * Turns a capture into a skeleton.
 *
 * A Boneyard capture traces the page: every text run, every icon, every
 * hairline gets its own bone at its exact size. That is the right raw material
 * and the wrong finished product. Measured on the committed captures, one
 * invoice page came out as 98 bones — 24 of them under 24px wide, 9 pairs
 * overlapping, 29 distinct widths, one of them a 1px divider — and Reports had
 * 17 distinct heights across 33 bones. Nothing repeats, so the eye finds no
 * pattern and reads noise rather than "content shaped like this".
 *
 * A skeleton works by suggestion, and suggestion needs rhythm. So the captured
 * geometry is kept — positions are still measured, never guessed — and the
 * *variation* is thrown away: fragments merge, dust is dropped, sizes snap to a
 * short scale, repeated rows are cut to five, and anything big enough to be a
 * card is drawn as an outline instead of a filled slab.
 *
 * Deterministic and re-runnable: it takes the JSON as input, so a re-capture
 * needs no re-tuning here.
 */

/**
 * `[x%, y, w%, h, radius]` — the compact form Boneyard reads.
 *
 * Five elements exactly: the library's own tuple type makes the sixth
 * (container) element required when present, and containers never survive this
 * pass anyway — they are drawn as outlines instead.
 */
export type RawBone = [number, number, number, number, number | string];

export interface Breakpoint {
  name?: string;
  viewportWidth?: number;
  width: number;
  height: number;
  /* Loose on input: this is read straight from a generated JSON file, which
     TypeScript widens to `number[][]`. Narrowed on the way in, not at the type. */
  bones: readonly (readonly (number | string | boolean)[])[];
}

export interface CapturedBones {
  breakpoints: Record<string, Breakpoint>;
}

/** A box drawn as a 1px outline rather than a filled bone. */
export interface Outline {
  /** Percent of the container width. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SimplifiedBreakpoint {
  name: string;
  viewportWidth: number;
  width: number;
  height: number;
  bones: RawBone[];
  outlines: Outline[];
}

export interface Simplified {
  breakpoints: Record<number, SimplifiedBreakpoint>;
}

/** Below this a bone is a fragment — a currency symbol, an icon, a divider. */
const MIN_WIDTH_PX = 24;
const MIN_HEIGHT_PX = 8;

/** Bones this close together on one line are one phrase split by markup. */
const MERGE_GAP_PX = 8;

/** Vertical slack when deciding two bones sit on the same line. */
const BAND_TOLERANCE_PX = 6;

/** Text, control, block. Three sizes is a rhythm; seventeen is noise. */
const TEXT_HEIGHT = 14;
const CONTROL_HEIGHT = 32;
const BLOCK_HEIGHT = 80;
const TEXT_MAX_PX = 24;
const CONTROL_MAX_PX = 64;

/** Taller than this and it is a card or a chart, not a line of content. */
const OUTLINE_MIN_HEIGHT_PX = 120;

/**
 * An outline smaller than this is not a card.
 *
 * Captured containers include things like a segmented control or a filter pill,
 * and a 1px box drawn tight around a single bone reads as a mistake rather than
 * as structure.
 */
const OUTLINE_MIN_BOX_HEIGHT_PX = 64;
const OUTLINE_MIN_BOX_WIDTH_PCT = 20;

/** How many rows of a repeating list to keep. */
const MAX_REPEAT_ROWS = 5;

/** How many columns of a repeating row to keep. */
const MAX_COLUMNS = 3;

/** Two bones belong to the same column if their centres are within this. */
const COLUMN_TOLERANCE_PX = 40;

/** A run this long is a list, not a coincidence. */
const MIN_REPEAT_RUN = 4;

/** Bands further apart than this start a new row of the list. */
const ROW_GAP_PX = 24;

/** Widths snap to this grid, in percent, so lengths stop looking arbitrary. */
const WIDTH_STEP = 2;

/** Breathing room between the outline of a list and the bones inside it. */
const OUTLINE_PADDING_PX = 16;

interface Bone {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number | string;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
};

function quantizeHeight(h: number): number {
  if (h <= TEXT_MAX_PX) return TEXT_HEIGHT;
  if (h <= CONTROL_MAX_PX) return CONTROL_HEIGHT;
  // Anything taller than this is an outline, so this is the only block size.
  return BLOCK_HEIGHT;
}

/** Bones grouped by the line they sit on, each group sorted left to right. */
function toBands(bones: Bone[]): Bone[][] {
  const bands: Bone[][] = [];

  for (const bone of [...bones].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const band = bands.at(-1);
    if (band && Math.abs(bone.y - (band[0] as Bone).y) <= BAND_TOLERANCE_PX) {
      band.push(bone);
    } else {
      bands.push([bone]);
    }
  }

  for (const band of bands) band.sort((a, b) => a.x - b.x);
  return bands;
}

/**
 * Joins bones that are really one phrase.
 *
 * A vendor cell holds a name and an invoice number in different elements, so it
 * captures as two bones a few pixels apart at slightly different heights — which
 * draws as a torn, stepped bar. One bone spanning both is what a person would
 * have drawn.
 */
function mergeRun(band: Bone[], pxPerPercent: number): Bone[] {
  const merged: Bone[] = [];

  for (const bone of band) {
    const previous = merged.at(-1);
    const gap = previous ? (bone.x - (previous.x + previous.w)) * pxPerPercent : Number.POSITIVE_INFINITY;

    if (previous && gap < MERGE_GAP_PX) {
      const right = Math.max(previous.x + previous.w, bone.x + bone.w);
      previous.x = Math.min(previous.x, bone.x);
      previous.w = right - previous.x;
      previous.h = Math.max(previous.h, bone.h);
      previous.y = Math.min(previous.y, bone.y);
      continue;
    }

    merged.push({ ...bone });
  }

  return merged;
}

/**
 * Bands grouped into rows.
 *
 * A table row is more than one band: the vendor name and the invoice number
 * under it are separate lines a few pixels apart. Treating each band as a row
 * makes the shapes alternate, and a run detector that wants consistency finds
 * none — which is why the first version of this left the invoice table at 60
 * bones. Anything closer together than a row gap belongs to the row above.
 */
function toRows(bands: Bone[][]): Bone[][][] {
  const rows: Bone[][][] = [];

  for (const band of bands) {
    const row = rows.at(-1);
    const previous = row?.at(-1);
    const gap = previous ? (band[0] as Bone).y - ((previous[0] as Bone).y + (previous[0] as Bone).h) : Number.POSITIVE_INFINITY;

    if (row && gap <= ROW_GAP_PX) row.push(band);
    else rows.push([band]);
  }

  return rows;
}

/**
 * The longest run of consecutive rows that look like one list.
 *
 * "Look like" means the same number of bones at a steady vertical pitch — what a
 * table gives and a page header does not. Returns row indices, empty when the
 * page has no list on it.
 */
function findRepeatingRun(rows: Bone[][][]): number[] {
  const count = (row: Bone[][]) => row.reduce((n, band) => n + band.length, 0);
  const top = (row: Bone[][]) => ((row[0] as Bone[])[0] as Bone).y;

  let best: number[] = [];
  let current: number[] = [];
  let pitch = 0;

  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1] as Bone[][];
    const row = rows[i] as Bone[][];
    const step = top(row) - top(previous);
    const sameShape = count(row) === count(previous) && count(row) > 1;
    const samePitch = pitch === 0 || Math.abs(step - pitch) <= BAND_TOLERANCE_PX;

    if (sameShape && samePitch) {
      if (current.length === 0) current.push(i - 1);
      current.push(i);
      pitch = step;
    } else {
      if (current.length > best.length) best = current;
      current = [];
      pitch = 0;
    }
  }

  return current.length > best.length ? current : best;
}

/** Column index per bone, left to right, clustered on centre. */
function columnsOf(bands: Bone[][], pxPerPercent: number): Map<Bone, number> {
  const centres: number[] = [];
  const assignment = new Map<Bone, number>();

  for (const band of bands) {
    for (const bone of band) {
      const centre = (bone.x + bone.w / 2) * pxPerPercent;
      const found = centres.findIndex((c) => Math.abs(c - centre) <= COLUMN_TOLERANCE_PX);
      if (found === -1) {
        centres.push(centre);
        assignment.set(bone, centres.length - 1);
      } else {
        assignment.set(bone, found);
      }
    }
  }

  // Cluster ids are creation order; re-map to left-to-right order.
  const order = centres
    .map((centre, id) => ({ centre, id }))
    .sort((a, b) => a.centre - b.centre)
    .map((entry, rank) => [entry.id, rank] as const);
  const rank = new Map(order);

  for (const [bone, id] of assignment) assignment.set(bone, rank.get(id) ?? id);
  return assignment;
}

function simplifyBreakpoint(bp: Breakpoint): SimplifiedBreakpoint {
  const pxPerPercent = bp.width / 100;
  const outlines: Outline[] = [];
  const content: Bone[] = [];

  for (const raw of bp.bones) {
    const x = Number(raw[0]);
    const y = Number(raw[1]);
    const w = Number(raw[2]);
    const h = Number(raw[3]);
    const r = typeof raw[4] === 'string' ? raw[4] : Number(raw[4]);
    const container = raw[5] === true;

    // Container bones are never drawn by the renderer, and anything this tall is
    // a card or a chart — a filled block that size is the ugliest thing on the
    // page. Both become outlines.
    if (container || h >= OUTLINE_MIN_HEIGHT_PX) {
      // The full-bleed page bone is the scroll container, not a card.
      if (w > 98 && x < 1 && h > bp.height * 0.9) continue;
      if (h >= OUTLINE_MIN_BOX_HEIGHT_PX && w >= OUTLINE_MIN_BOX_WIDTH_PCT) outlines.push({ x, y, w, h });
      continue;
    }
    if (w * pxPerPercent < MIN_WIDTH_PX || h < MIN_HEIGHT_PX) continue;
    content.push({ x, y, w, h, r });
  }

  const bands = toBands(content).map((band) => mergeRun(band, pxPerPercent));
  const rows = toRows(bands);
  const run = findRepeatingRun(rows);
  const keep: Bone[] = [];

  if (run.length >= MIN_REPEAT_RUN) {
    const kept = new Set(run.slice(0, MAX_REPEAT_ROWS));
    const keptRows = run.slice(0, MAX_REPEAT_ROWS).map((i) => (rows[i] as Bone[][]).flat());
    const column = columnsOf(keptRows, pxPerPercent);

    // One width per column, so rows line up instead of jittering with whatever
    // the fixture vendor happened to be called.
    const widths = new Map<number, number[]>();
    for (const row of keptRows) {
      for (const bone of row) {
        const id = column.get(bone) ?? 0;
        if (id >= MAX_COLUMNS) continue;
        widths.set(id, [...(widths.get(id) ?? []), bone.w]);
      }
    }

    const inside: Bone[] = [];
    for (const [index, row] of rows.entries()) {
      if (!run.includes(index)) {
        keep.push(...row.flat());
        continue;
      }
      if (!kept.has(index)) continue;
      for (const bone of row.flat()) {
        const id = column.get(bone) ?? 0;
        if (id >= MAX_COLUMNS) continue;
        inside.push({ ...bone, w: median(widths.get(id) ?? [bone.w]) });
      }
    }

    // The card the list sits in captures as nothing — a surface with a border
    // is not a bone — so the rows would float on the canvas with no edge to sit
    // against. Drawing the block they occupy gives the structure back, and it
    // is derived from the bones rather than invented.
    //
    // Bounds come from the rows *before* the column cut, plus the band directly
    // above them when it looks like a column header: an outline drawn around
    // only the surviving columns stops short of the header it belongs to, which
    // reads as a box that missed.
    const spanning = run.slice(0, MAX_REPEAT_ROWS).flatMap((i) => (rows[i] as Bone[][]).flat());
    const first = run[0] as number;
    const header = first > 0 ? (rows[first - 1] as Bone[][]).flat() : [];
    const headerGap = header.length
      ? ((spanning[0] as Bone).y - Math.max(...header.map((b) => b.y + b.h)))
      : Number.POSITIVE_INFINITY;
    const bounds = headerGap <= ROW_GAP_PX * 2 ? [...header, ...spanning] : spanning;

    if (bounds.length > 0) {
      const pad = OUTLINE_PADDING_PX / pxPerPercent;
      const left = Math.min(...bounds.map((b) => b.x));
      const right = Math.max(...bounds.map((b) => b.x + b.w));
      const topY = Math.min(...bounds.map((b) => b.y));
      const bottom = Math.max(...spanning.map((b) => b.y + b.h));
      outlines.push({
        x: Math.max(0, left - pad),
        y: topY - OUTLINE_PADDING_PX,
        w: Math.min(100 - Math.max(0, left - pad), right - left + pad * 2),
        h: bottom - topY + OUTLINE_PADDING_PX * 2,
      });
    }

    keep.push(...inside);
  } else {
    for (const band of bands) keep.push(...band);
  }

  const bones: RawBone[] = keep
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((bone) => [
      +bone.x.toFixed(4),
      bone.y,
      +(Math.max(WIDTH_STEP, Math.round(bone.w / WIDTH_STEP) * WIDTH_STEP)).toFixed(4),
      quantizeHeight(bone.h),
      typeof bone.r === 'number' ? Math.min(bone.r, 6) : bone.r,
    ]);

  return {
    name: bp.name ?? 'route',
    viewportWidth: bp.viewportWidth ?? bp.width,
    width: bp.width,
    height: bp.height,
    bones,
    outlines: innermost(outlines),
  };
}

/**
 * Drops any outline that wholly contains another.
 *
 * A table inside a card captures both, and drawing both puts a box 16px inside
 * a box — visual noise that says nothing the inner one does not. The innermost
 * is the one a person reads as "the card".
 */
function innermost(outlines: Outline[]): Outline[] {
  return outlines.filter(
    (outer) =>
      !outlines.some(
        (inner) =>
          inner !== outer &&
          inner.x >= outer.x &&
          inner.y >= outer.y &&
          inner.x + inner.w <= outer.x + outer.w &&
          inner.y + inner.h <= outer.y + outer.h,
      ),
  );
}

export function simplifyBones(captured: CapturedBones): Simplified {
  const breakpoints: Record<number, SimplifiedBreakpoint> = {};
  for (const [width, bp] of Object.entries(captured.breakpoints)) {
    breakpoints[Number(width)] = simplifyBreakpoint(bp);
  }
  return { breakpoints };
}
