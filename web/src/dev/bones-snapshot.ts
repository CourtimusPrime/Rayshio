/**
 * Capture-time patch: measure text, not the box the text sits in.
 *
 * Boneyard emits one bone per leaf element at the element's own rect. For a
 * heading in a full-width card that means a bone the width of the card, even
 * when the heading is one short word — so a page of headings and labels
 * captures as a stack of full-bleed bars that look nothing like the text they
 * stand for. Table cells are worse: `td` and `th` are in the library's
 * `DEFAULT_LEAF_TAGS` (`boneyard-js/dist/extract.js`), so every cell emits one
 * bone covering the whole cell box, and adjacent cells leave no gaps — an
 * invoice table captured as a single uniform grey slab.
 *
 * `snapshotConfig` cannot fix either. `leafTags` is *additive*
 * (`new Set([...DEFAULT_LEAF_TAGS, ...config.leafTags])`), so nothing can be
 * removed from it, and `excludeSelectors: ['td']` drops the cell together with
 * everything inside it.
 *
 * So this wraps `window.__BONEYARD_SNAPSHOT`: it measures every text run with a
 * `Range` — which gives the line boxes the glyphs actually occupy — plus the
 * rect of any `img`/`svg`, and replaces the bone the library emitted for that
 * element. Still measured, never guessed. It measures the text instead of the
 * padding around it.
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

/** Elements whose own rect the library would use instead of their text. */
const TEXT_LEAVES = 'p, h1, h2, h3, h4, h5, h6, li, td, th';

/** Rects of every text run and media element inside an element. */
function contentRects(el: Element): DOMRect[] {
  const rects: DOMRect[] = [];

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // One rect per line box, so wrapped text gets a bone per line rather than
    // one bone spanning the ragged union of both lines.
    rects.push(...Array.from(range.getClientRects()));
  }

  for (const media of el.querySelectorAll('img, svg')) {
    rects.push(media.getBoundingClientRect());
  }

  return rects;
}

/** Same box, to the pixel — how a bone is matched back to the element it came from. */
function sameBox(bone: Bone, rect: DOMRect, root: DOMRect): boolean {
  const x = ((rect.left - root.left) / root.width) * 100;
  const w = (rect.width / root.width) * 100;
  return (
    Math.abs(bone.y - Math.round(rect.top - root.top)) <= 1 &&
    Math.abs(bone.h - Math.round(rect.height)) <= 1 &&
    Math.abs(bone.x - x) < 0.2 &&
    Math.abs(bone.w - w) < 0.2
  );
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

      const replaced: Bone[] = [];
      const drop = new Set<Bone>();

      for (const node of el.querySelectorAll(TEXT_LEAVES)) {
        const box = node.getBoundingClientRect();
        const rects = contentRects(node);
        if (rects.length === 0) continue;

        for (const bone of result.bones) {
          if (!bone.c && sameBox(bone, box, root)) drop.add(bone);
        }

        for (const rect of rects) {
          if (rect.width < 1 || rect.height < 1) continue;
          replaced.push({
            x: +(((rect.left - root.left) / root.width) * 100).toFixed(4),
            y: Math.round(rect.top - root.top),
            w: +((rect.width / root.width) * 100).toFixed(4),
            h: Math.round(rect.height),
            r: 4,
          });
        }
      }

      // `extract.js` writes `r: 0` only for table elements, and everything else
      // falls back to 8 — so this drops the cell, row and body bones without
      // needing to track which element produced which bone.
      result.bones = [...result.bones.filter((b) => b.r !== 0 && !drop.has(b)), ...replaced];
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
