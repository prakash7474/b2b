/**
 * Utility helpers — shared across the app.
 */

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const day = d.getDate();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = months[d.getMonth()];
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${h}:${m}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

export function riskColor(label: string): string {
  if (!label) return '#BDC3C7';
  const l = label.toLowerCase();
  if (l.includes('low'))    return '#27AE60';
  if (l.includes('medium')) return '#F39C12';
  if (l.includes('high'))   return '#E74C3C';
  return '#BDC3C7';
}

export function freshnessColor(score: number): string {
  if (score <= 0.3) return '#27AE60';
  if (score <= 0.7) return '#F39C12';
  return '#E74C3C';
}
