import {
  BedDoubleIcon,
  BoxesIcon,
  BrainCircuitIcon,
  CalendarSyncIcon,
  CarFrontIcon,
  CircleDashedIcon,
  CoinsIcon,
  CpuIcon,
  DatabaseIcon,
  GlobeIcon,
  GraduationCapIcon,
  HandCoinsIcon,
  LampDeskIcon,
  LinkIcon,
  LockOpenIcon,
  MegaphoneIcon,
  NotebookPenIcon,
  PlaneIcon,
  Share2Icon,
  ShieldIcon,
  ToolboxIcon,
  UtensilsIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CATEGORY_META, type Category } from '../types';

/**
 * The Lucide mark for a category.
 *
 * An explicit map rather than `import * as icons from 'lucide-react'` and a
 * lookup by name. The namespace import defeats tree-shaking and pulls the
 * entire icon set — well over a thousand components — into the bundle to use
 * twenty-two of them. Naming each one costs a line and keeps the import
 * graph honest.
 *
 * Keyed by the icon name in `CATEGORY_META` so the taxonomy stays the single
 * place a category's mark is chosen.
 */
const ICONS: Record<string, LucideIcon> = {
  Cpu: CpuIcon,
  BrainCircuit: BrainCircuitIcon,
  Globe: GlobeIcon,
  Database: DatabaseIcon,
  Link: LinkIcon,
  Share2: Share2Icon,
  LockOpen: LockOpenIcon,
  Shield: ShieldIcon,
  CalendarSync: CalendarSyncIcon,
  Megaphone: MegaphoneIcon,
  Utensils: UtensilsIcon,
  CarFront: CarFrontIcon,
  Plane: PlaneIcon,
  BedDouble: BedDoubleIcon,
  HandCoins: HandCoinsIcon,
  GraduationCap: GraduationCapIcon,
  Boxes: BoxesIcon,
  NotebookPen: NotebookPenIcon,
  LampDesk: LampDeskIcon,
  Toolbox: ToolboxIcon,
  Coins: CoinsIcon,
  CircleDashed: CircleDashedIcon,
};

export function CategoryIcon({
  category,
  className = 'h-4 w-4',
}: {
  category: Category | string;
  className?: string;
}) {
  const meta = CATEGORY_META[category as Category];
  // An unknown category is a taxonomy drift, not a crash: render the same mark
  // `normalizeCategory` would have resolved it to.
  const Icon = ICONS[meta?.icon ?? 'CircleDashed'] ?? CircleDashedIcon;
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}
