/** Minor units (cents) → the display string the MCP tools have always emitted. */
export function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
