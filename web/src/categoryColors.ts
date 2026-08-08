import type { Category } from './types';

/**
 * One stable colour per category. Compute/storage/network share the accent
 * family because they are the infrastructure costs most often compared against
 * each other; subscriptions and tax-style lines sit further from the accent.
 */
export const categoryColors: Record<Category, string> = {
  compute: '#c2410c',
  storage: '#d2691e',
  api_usage: '#e08b4f',
  ai_invocations: '#eeb384',
  network: '#f5cfae',
  subscription: '#fae3d0',
  other: '#d4d4d8',
};

const LABELS: Record<Category, string> = {
  compute: 'Compute',
  storage: 'Storage',
  api_usage: 'API usage',
  ai_invocations: 'AI invocations',
  network: 'Network',
  subscription: 'Subscriptions',
  other: 'Other',
};

/** Stored values are snake_case; screens show these. */
export function categoryLabel(category: Category): string {
  return LABELS[category] ?? category;
}
