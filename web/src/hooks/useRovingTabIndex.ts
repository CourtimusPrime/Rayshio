import type { KeyboardEvent } from 'react';
import { useCallback, useRef } from 'react';

/**
 * Arrow-key navigation with a single tab stop, for `tablist` and `radiogroup`.
 *
 * Both roles *require* this. Declaring the role without it is worse than
 * declaring nothing: assistive tech announces a composite widget whose
 * documented keyboard contract then does not work, so a user who knows the
 * pattern is misled rather than merely unaided.
 *
 * Activation follows focus, which is the APG default for both roles and
 * matches what clicking already does here.
 */
export function useRovingTabIndex<T extends string>({
  values,
  active,
  onActivate,
  orientation = 'horizontal',
}: {
  values: readonly T[];
  active: T;
  onActivate: (value: T) => void;
  orientation?: 'horizontal' | 'vertical';
}) {
  const nodes = useRef(new Map<T, HTMLElement | null>());

  const focusAt = useCallback(
    (index: number) => {
      const wrapped = (index + values.length) % values.length;
      const next = values[wrapped];
      if (next === undefined) return;
      nodes.current.get(next)?.focus();
      onActivate(next);
    },
    [onActivate, values],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const index = values.indexOf(active);
      if (index === -1) return;

      const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

      switch (event.key) {
        case prevKey:
          event.preventDefault();
          focusAt(index - 1);
          break;
        case nextKey:
          event.preventDefault();
          focusAt(index + 1);
          break;
        case 'Home':
          event.preventDefault();
          focusAt(0);
          break;
        case 'End':
          event.preventDefault();
          focusAt(values.length - 1);
          break;
        default:
          break;
      }
    },
    [active, focusAt, orientation, values],
  );

  /** Spread onto each item in the group. */
  const itemProps = useCallback(
    (value: T) => ({
      ref: (el: HTMLElement | null) => {
        nodes.current.set(value, el);
      },
      tabIndex: value === active ? 0 : -1,
      onKeyDown,
    }),
    [active, onKeyDown],
  );

  return { itemProps };
}
