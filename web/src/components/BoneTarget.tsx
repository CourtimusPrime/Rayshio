import { Skeleton } from 'boneyard-js/react';
import type { ReactNode } from 'react';

/**
 * Marks a page as something Boneyard should measure.
 *
 * The capture works by finding `<Skeleton name="...">` elements and snapshotting
 * where their *children* landed — so the wrapper has to be around the real page,
 * not around the loading state. But a wrapper that shipped to production would
 * add a container div around every route for the sake of a build step, so this
 * is a passthrough everywhere except during a capture run.
 *
 * `import.meta.env.DEV` is replaced with `false` at build time, which makes the
 * whole branch dead code and drops `boneyard-js/react` out of the production
 * bundle rather than shipping it dormant.
 */
export function BoneTarget({ name, children }: { name: string; children: ReactNode }) {
  const capturing =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    ((window as { __BONEYARD_BUILD?: boolean }).__BONEYARD_BUILD === true ||
      new URLSearchParams(window.location.search).has('bones'));

  if (!capturing) return <>{children}</>;

  return (
    <Skeleton
      loading={false}
      name={name}
      select="viewport"
      /*
       * The rail and top bar are already on screen — they live in the app
       * shell, outside the route being replaced — so bones for them would draw
       * a second nav on top of the real one.
       *
       * Table cells are handled elsewhere: `snapshotConfig` cannot fix them,
       * because `leafTags` is additive and `td`/`th` are leaves by default. See
       * `src/dev/bones-snapshot.ts`.
       */
      snapshotConfig={{
        excludeSelectors: ['aside', 'header', '[data-scroll-container] > header'],
      }}
    >
      {children}
    </Skeleton>
  );
}
