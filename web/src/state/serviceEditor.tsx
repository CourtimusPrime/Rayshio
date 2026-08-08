import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ServiceModal } from '../components/ServiceModal';
import { useWorkspace } from './workspace';

/**
 * Makes every vendor logo in the signed-in app a way into that vendor's editor.
 *
 * A context rather than a callback threaded through the six components that
 * render a `ServiceLogo` — those are tables, charts, a calendar and a drawer
 * that otherwise share nothing, and a prop would have to cross each of them
 * whether or not it was used.
 *
 * Its absence is load-bearing. The marketing page renders `ServiceLogo` while
 * signed out, and this provider is mounted inside the authenticated tree, so
 * there the context is null and the logo stays the inert decoration it was.
 * That is the behaviour we want and it needs no flag to remember.
 */
interface ServiceEditorValue {
  open: (service: string) => void;
  /**
   * Vendors with an uploaded logo. `ServiceLogo` resolves a build-time brand
   * mark before it ever asks the server, so without this an upload for a vendor
   * the icon set covers would be stored, served, and never seen.
   */
  customLogos: Set<string>;
}

const ServiceEditorContext = createContext<ServiceEditorValue | null>(null);

export function ServiceEditorProvider({ children }: { children: ReactNode }) {
  const { meta } = useWorkspace();
  const [editing, setEditing] = useState<string | null>(null);

  const customLogos = useMemo(
    () => new Set(meta?.custom_logo_services ?? []),
    [meta?.custom_logo_services],
  );

  const value = useMemo<ServiceEditorValue>(
    () => ({ open: setEditing, customLogos }),
    [customLogos],
  );

  return (
    <ServiceEditorContext.Provider value={value}>
      {children}
      <ServiceModal service={editing} onClose={() => setEditing(null)} />
    </ServiceEditorContext.Provider>
  );
}

/** Null outside the provider — see above, that is deliberate rather than a guard. */
export function useServiceEditor(): ServiceEditorValue | null {
  return useContext(ServiceEditorContext);
}
