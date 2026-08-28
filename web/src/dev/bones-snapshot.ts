/**
 * Capture-time patch: turn table cells into text-shaped bones.
 *
 * Boneyard treats `td` and `th` as leaf elements (`DEFAULT_LEAF_TAGS` in
 * `boneyard-js/dist/extract.js`), so each cell emits exactly one bone covering
 * the whole cell box — full column width, full row height, zero radius. Rows of
 * those butt against each other with no gaps, and an invoice table captures as
 * one uniform grey slab: pixel-accurate and unreadable as a loading state.
 *
 * The library's `snapshotConfig.leafTags` cannot fix this. It is *additive* —
 * `new Set([...DEFAULT_LEAF_TAGS, ...config.leafTags])` — so there is no way to
 * stop a cell being a leaf, and `excludeSelectors: ['td']` would drop the cell
 * and everything inside it.
 *
 * So we replace the cell bones after the fact, with bones measured from the
 * same DOM: a `Range` over each text node gives the line box the text actually
 * occupies, and `img`/`svg` descendants give their own rects. That keeps the
 * "measured, never guessed" property — nothing here is a hand-tuned width — it
 * just measures the text rather than the cell padding around it.
 *
 * Table bones are identifiable without tracking elements: `extract.js` writes
 * `r: 0` only for `table`/`thead`/`tbody`/`tr`/`td`/`th`. Every other bone falls
 * back to a radius of 8. So dropping `r === 0` drops the cells and the row and
 * body containers, and nothing else.
 *
 * Dev-only, and only while a capture is running.
 */

interface Bone {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number | string;
  c?: boolean;
}

type SnapshotFn = (
  el: HTMLElement,
  name?: string,
  config?: unknown,
) => { bones: Bone[]; [k: string]: unknown };

/** Rects of every text run and media element inside a cell, in viewport space. */
function contentRects(cell: Element): DOMRect[] {
  const rects: DOMRect[] = [];

  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // One rect per line box, so a wrapped cell gets a bone per line rather than
    // one bone spanning the ragged union of both lines.
    rects.push(...Array.from(range.getClientRects()));
  }

  for (const media of cell.querySelectorAll('img, svg')) {
    rects.push(media.getBoundingClientRect());
  }

  return rects;
}

export function patchBonesSnapshot(): void {
  const install = () => {
    const w = window as unknown as { __BONEYARD_SNAPSHOT?: SnapshotFn; __BONES_PATCHED?: boolean };
    const original = w.__BONEYARD_SNAPSHOT;
    if (!original) return false;
    if (w.__BONES_PATCHED) return true;

    w.__BONES_PATCHED = true;
    w.__BONEYARD_SNAPSHOT = (el, name, config) => {
      const result = original(el, name, config);
      const root = el.getBoundingClientRect();
      if (root.width <= 0) return result;

      const bones = result.bones.filter((b) => b.r !== 0);

      for (const cell of el.querySelectorAll('td, th')) {
        for (const rect of contentRects(cell)) {
          if (rect.width < 1 || rect.height < 1) continue;
          bones.push({
            x: +(((rect.left - root.left) / root.width) * 100).toFixed(4),
            y: Math.round(rect.top - root.top),
            w: +((rect.width / root.width) * 100).toFixed(4),
            h: Math.round(rect.height),
            r: 4,
          });
        }
      }

      result.bones = bones;
      return result;
    };
    return true;
  };

  if (install()) return;
  // `<Skeleton>` registers the snapshot fn when its module evaluates. If this
  // runs first, wait for it — the capture holds the page open for seconds.
  const timer = setInterval(() => {
    if (install()) clearInterval(timer);
  }, 50);
  setTimeout(() => clearInterval(timer), 10_000);
}
