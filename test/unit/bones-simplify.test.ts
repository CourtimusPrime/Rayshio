import { describe, expect, it } from 'vitest';
import routeInvoices from '../../web/src/bones/route-invoices.bones.json';
import { type CapturedBones, simplifyBones } from '../../web/src/bones/simplify';

/**
 * These assert the *shape* of the output, not exact numbers, because the input
 * is a capture that legitimately changes whenever a page changes. What must not
 * change is the property that makes a skeleton read as a skeleton: a short size
 * scale, no dust, no seams, and a bounded number of repeated rows.
 */

const bone = (
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number, number, number, number] => [x, y, w, h, 8];

/** Six rows of three cells, at a steady pitch — a table by any measure. */
function tableCapture(): CapturedBones {
  const bones: [number, number, number, number, number][] = [];
  for (let row = 0; row < 6; row++) {
    const y = 100 + row * 60;
    bones.push(bone(5, y, 20, 17), bone(30, y, 15, 19), bone(60, y, 12, 16));
  }
  return { breakpoints: { 1440: { width: 1440, height: 600, bones } } };
}

describe('simplifyBones', () => {
  it('keeps at most five rows of a repeating list', () => {
    const [bp] = Object.values(simplifyBones(tableCapture()).breakpoints);
    const rows = new Set(bp?.bones.map((b) => b[1]));
    expect(rows.size).toBe(5);
  });

  it('gives every column one width, so rows stop jittering', () => {
    const [bp] = Object.values(simplifyBones(tableCapture()).breakpoints);
    const widths = new Set(bp?.bones.map((b) => b[2]));
    expect(widths.size).toBe(3);
  });

  it('draws the list it kept inside an outline', () => {
    const [bp] = Object.values(simplifyBones(tableCapture()).breakpoints);
    expect(bp?.outlines).toHaveLength(1);
  });

  it('drops fragments too small to read as content', () => {
    const capture: CapturedBones = {
      breakpoints: {
        1440: {
          width: 1440,
          height: 200,
          // A 1px divider and an 8px-wide currency symbol, either side of real text.
          bones: [bone(5, 10, 40, 1), bone(5, 40, 0.5, 16), bone(5, 80, 30, 16)],
        },
      },
    };
    const [bp] = Object.values(simplifyBones(capture).breakpoints);
    expect(bp?.bones).toHaveLength(1);
  });

  it('merges bones that are one phrase split by markup', () => {
    const capture: CapturedBones = {
      breakpoints: {
        1440: {
          width: 1440,
          height: 100,
          // Two runs 4px apart — a vendor name and the number beside it.
          bones: [bone(5, 10, 10, 16), bone(15.28, 10, 8, 14)],
        },
      },
    };
    const [bp] = Object.values(simplifyBones(capture).breakpoints);
    expect(bp?.bones).toHaveLength(1);
  });

  it('emits at most three heights for a real capture', () => {
    const simplified = simplifyBones(routeInvoices as CapturedBones);
    for (const bp of Object.values(simplified.breakpoints)) {
      expect(new Set(bp.bones.map((b) => b[3])).size).toBeLessThanOrEqual(3);
    }
  });

  it('cuts a real capture down by at least half', () => {
    const before = (routeInvoices as CapturedBones).breakpoints['1440']?.bones.length ?? 0;
    const after =
      simplifyBones(routeInvoices as CapturedBones).breakpoints[1440]?.bones.length ?? 0;
    expect(after).toBeLessThan(before / 2);
  });
});
