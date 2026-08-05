import { useEffect } from 'react';

const TAG_ID = 'runtime-robots';

/**
 * Marks the current page noindex from the client.
 *
 * This is the direction that works. A `noindex` in the *initial* HTML is fatal:
 * Googlebot drops the page before it runs any JavaScript, so a tag removed at
 * runtime is never seen removed — which is why `index.html` no longer ships
 * one. Adding the tag at runtime is the opposite case, and is honoured, because
 * the crawler renders the page before deciding.
 *
 * Used on the signed-in shell, the sign-in page and 404 — pages that have no
 * business in an index — while `/`, `/privacy` and `/terms` stay indexable.
 */
export function useNoindex(): void {
  useEffect(() => {
    let tag = document.head.querySelector<HTMLMetaElement>(`meta#${TAG_ID}`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.id = TAG_ID;
      tag.name = 'robots';
      document.head.appendChild(tag);
    }
    tag.content = 'noindex, nofollow';

    return () => {
      tag?.remove();
    };
  }, []);
}
