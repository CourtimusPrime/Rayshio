import { motion } from 'framer-motion';
import { CheckIcon, RotateCcwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLineItemRules, useSetCellCategory, useSetLineItemCategory } from '../api/hooks';
import { categoryColors } from '../categoryColors';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { CATEGORY_META, CATEGORY_PARENTS, type Category, PARENT_LABELS } from '../types';
import { CategoryIcon } from './CategoryIcon';
import { ErrorNote } from './states';

/**
 * Recategorize a line item — and, by doing so, everything like it.
 *
 * The scope control is the feature, not a refinement of it. The same vendor
 * bills the same thing every month, so filing one row by hand and watching next
 * month's invoice arrive misfiled would be a treadmill. Choosing here decides
 * what the org is *teaching*: this exact line from this vendor, or everything
 * the vendor sends.
 *
 * Defaults to the narrower rule. Getting "all Neon invoices are Storage" wrong
 * silently re-files compute lines too; getting the description-level rule wrong
 * affects only the line the user was looking at.
 */
type Scope = 'item' | 'vendor';

export function CategoryPicker({
  lineItemId,
  descriptions,
  description,
  service,
  current,
  anchor,
  onClose,
}: {
  /**
   * Set when filing one line item, from the invoice drawer. Absent for a
   * breakdown cell, which has no single line-item id — it is an aggregate over
   * however many rows share that vendor and category.
   */
  lineItemId?: number;
  /** Every line text the target covers. One entry when filing a single item. */
  descriptions?: string[];
  description: string;
  service: string;
  current: Category;
  /**
   * Where the control that opened this sits, in viewport coordinates.
   *
   * The picker is portalled and `position: fixed`, so it needs this. Rendering
   * it in place looked correct in the invoice drawer and was invisible on the
   * Breakdown page: the accordion body is `overflow-hidden` — it has to be, or
   * the height animation would spill — and an absolutely-positioned popover
   * inside a clipped box is clipped with it.
   */
  anchor: { top: number; bottom: number; right: number };
  onClose: () => void;
}) {
  const prefs = useMotionPrefs();
  const panelRef = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<Scope>('item');
  const { data: rules } = useLineItemRules(lineItemId ?? null);
  const setLineItemCategory = useSetLineItemCategory();
  const setCellCategory = useSetCellCategory();
  // One of the two, chosen by which target this picker was given. Both expose
  // the same mutation surface, so everything below reads from one object.
  const setCategory = lineItemId === undefined ? setCellCategory : setLineItemCategory;

  // Escape closes, and a click outside does too — a picker that traps the user
  // is worse than one they dismiss by accident.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // `click`, not `mousedown`: mousedown fires before the button that opened
    // this has finished its own click, which would close it immediately.
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [onClose]);

  const activeRule = rules?.rules.find((r) => r.scope === scope);
  const classifiedAs = rules?.classified_as;

  /** What the current scope means for this target, as the API expects it. */
  function targetDescriptions(): string[] | null {
    if (scope === 'vendor') return null;
    return descriptions ?? [description];
  }

  function apply(category: Category | null) {
    if (lineItemId === undefined) {
      setCellCategory.mutate(
        { service, descriptions: targetDescriptions(), category },
        { onSuccess: onClose },
      );
    } else {
      setLineItemCategory.mutate({ lineItemId, category, scope }, { onSuccess: onClose });
    }
  }

  const choose = (category: Category) => apply(category);
  const revert = () => apply(null);

  const host = typeof document === 'undefined' ? null : document.getElementById('overlay-root');
  if (!host) return null;

  /*
   * Opens downward unless that would run off the bottom, in which case it flips
   * above the row. `position: fixed` against the viewport, which is what makes
   * it immune to the clipped, scrolling containers it is opened from.
   */
  const PANEL_HEIGHT = 420;
  const flipUp = anchor.bottom + PANEL_HEIGHT > window.innerHeight && anchor.top > PANEL_HEIGHT;

  return createPortal(
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label={`Categorize ${description}`}
      style={{
        position: 'fixed',
        top: flipUp ? undefined : anchor.bottom + 4,
        bottom: flipUp ? window.innerHeight - anchor.top + 4 : undefined,
        right: Math.max(12, window.innerWidth - anchor.right),
      }}
      initial={prefs.pick({ opacity: 0, y: -4, scale: 0.98 }, { opacity: 0 })}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={prefs.pick({ opacity: 0, y: -4, scale: 0.98 }, { opacity: 0 })}
      transition={prefs.spring('quick')}
      className="material-sheet z-popover w-[19rem] max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-line shadow-e3"
    >
      <div className="border-b border-line px-3.5 py-3">
        <p className="truncate text-footnote font-medium text-ink-900">{description}</p>
        <p className="mt-0.5 text-micro text-ink-500">
          {activeRule
            ? `Filed as ${CATEGORY_META[activeRule.category as Category]?.label ?? activeRule.category} by a rule`
            : classifiedAs
              ? `Read as ${CATEGORY_META[classifiedAs]?.label ?? classifiedAs} from the invoice`
              : 'Choose a category'}
        </p>
      </div>

      {/* Scope first, because it changes what every button below means. */}
      <div className="flex gap-1 border-b border-line px-3.5 py-2.5">
        {(
          [
            { value: 'item' as const, label: 'This item', hint: `Lines called "${description}"` },
            { value: 'vendor' as const, label: 'All of ' + service, hint: `Every line from ${service}` },
          ]
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            aria-pressed={scope === option.value}
            onClick={() => setScope(option.value)}
            className={`press tap min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-micro font-medium transition-colors ${
              scope === option.value
                ? 'bg-accent-soft text-accent-strong'
                : 'text-ink-500 hover:bg-canvas hover:text-ink-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {setCategory.error && (
        <div className="px-3.5 py-2">
          <ErrorNote message={(setCategory.error as Error).message} />
        </div>
      )}

      <div className="max-h-72 overflow-y-auto overscroll-contain py-1.5">
        {CATEGORY_PARENTS.map((parent) => {
          const members = (Object.keys(CATEGORY_META) as Category[]).filter(
            (c) => CATEGORY_META[c].parent === parent,
          );
          return (
            <div key={parent} className="px-1.5 py-1">
              <p className="px-2 py-1 text-micro uppercase tracking-wide text-ink-400">
                {PARENT_LABELS[parent]}
              </p>
              {members.map((category) => {
                const selected = category === current;
                return (
                  <button
                    key={category}
                    type="button"
                    disabled={setCategory.isPending}
                    onClick={() => choose(category)}
                    className={`press-row flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-footnote transition-colors disabled:opacity-60 ${
                      selected ? 'bg-canvas text-ink-900' : 'text-ink-700 hover:bg-canvas'
                    }`}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${categoryColors[category]}33`, color: categoryColors[category] }}
                    >
                      <CategoryIcon category={category} className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{CATEGORY_META[category].label}</span>
                    {selected && <CheckIcon className="h-3.5 w-3.5 text-accent" strokeWidth={2} />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {activeRule && (
        <div className="border-t border-line px-3.5 py-2">
          <button
            type="button"
            disabled={setCategory.isPending}
            onClick={revert}
            className="press inline-flex items-center gap-1.5 text-caption text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-60"
          >
            <RotateCcwIcon className="h-3 w-3" strokeWidth={1.75} />
            Remove this rule
          </button>
        </div>
      )}
    </motion.div>,
    host,
  );
}
