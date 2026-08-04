import type { Category } from './types';

/**
 * One stable colour per category. Compute/storage/network share the teal family
 * because they are the infrastructure costs most often compared against each
 * other; subscriptions and tax-style lines sit further from the accent.
 */
export const categoryColors: Record<Category, string> = {
  compute: '#0f766e',
  storage: '#2f8f86',
  api_usage: '#57a89f',
  ai_invocations: '#8bc4be',
  network: '#b3d8d3',
  subscription: '#cfe4e2',
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
