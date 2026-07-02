// @ts-check
import { DATA, searchQuery } from './state.js';

/**
 * Read a CSS custom property off :root, so JS-side colors (charts, sparklines) stay in
 * sync with the one palette defined in styles.css instead of duplicating hex values.
 * @param {string} name e.g. '--green'
 * @returns {string}
 */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** @returns {string} */
export const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
export const nowStr = () => new Date().toISOString();

/**
 * Render an ISO/UTC instant as a YYYY-MM-DD date in the viewer's own timezone.
 * eToro stamps openDateTime in UTC; this shows the buy on the local calendar day.
 * Falls back to the raw value (sliced to a date) when it can't be parsed.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export const localDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso).slice(0, 10) : d.toLocaleDateString('en-CA');
};

/**
 * Render an ISO/UTC instant as a YYYY-MM-DD HH:MM string in local time.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export const localDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
};

/**
 * The advice that prompted a given lot: the latest adviceEvents entry (date + price)
 * on/before the lot's buy date, falling back to the entry's first advice for legacy
 * entries (no adviceEvents). Compares against the lot's buy date in the viewer's
 * timezone (from openDateTime), so a buy that's the 24th locally matches a same-day
 * advice even though its UTC openDate slice says the 23rd.
 * @param {import('./state.js').AdviceEntry} e
 * @param {{openDate?: string|null, openDateTime?: string|null}} lot
 * @returns {{date: string|undefined, price: number|undefined}}
 */
export const advisedFor = (e, lot) => {
  const events = e.adviceEvents || [];
  const buy = lot && (lot.openDateTime ? localDate(lot.openDateTime) : lot.openDate);
  const prior = buy ? events.filter(ev => ev.date <= buy) : events.slice();
  if (prior.length) return prior[prior.length - 1];
  return { date: e.firstAdvised, price: e.priceAtAdvice };
};

/** @returns {import('./state.js').AdviceEntry[]} */
export const advised = () => DATA.entries.filter(e => e.source !== 'import');

/** 
 * @param {import('./state.js').AdviceEntry} e 
 * @returns {number} 
 */
export const latestPrice = (e) => e.priceHistory.length ? e.priceHistory[e.priceHistory.length - 1].price : e.priceAtAdvice;

/** 
 * @param {import('./state.js').AdviceEntry} e 
 * @returns {number} 
 */
export const changePct = (e) => {
  const base = (e.status === 'bought' || e.status === 'sold') && e.boughtAt ? e.boughtAt : e.priceAtAdvice;
  const now = e.status === 'sold' && e.soldAt ? e.soldAt : latestPrice(e);
  return ((now - base) / base) * 100;
};

/** 
 * @param {import('./state.js').AdviceEntry} e 
 * @returns {number | null} 
 */
export const realizedPL = (e) => (e.status === 'sold' && e.soldAt != null && e.boughtAt != null && e.units != null)
  ? (e.soldAt - e.boughtAt) * e.units : null;

/** 
 * @param {import('./state.js').AdviceEntry} e 
 * @returns {number | null} 
 */
export const unrealizedPL = (e) => (e.status === 'bought' && e.boughtAt != null && e.units != null)
  ? (latestPrice(e) - e.boughtAt) * e.units : null;

/** 
 * @param {number} p 
 * @returns {string} 
 */
export const fmtPct = (p) => (p >= 0 ? '+' : '') + p.toFixed(1) + '%';

/** 
 * @param {any} s 
 * @returns {string} 
 */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 
 * @param {string} t 
 * @param {string} [display] 
 * @returns {string} 
 */
export const tickerLink = (t, display) => {
  let warning = '';
  const e = DATA.entries.find(x => x.ticker === t);
  if (e && e.earningsDate) {
    const d = new Date(e.earningsDate);
    if (!isNaN(d.getTime())) {
      const days = (d.getTime() - new Date().getTime()) / 86400000;
      if (days >= -1 && days <= 7) {
        warning = ' <span title="Earnings: ' + esc(e.earningsDate) + '" class="earnings-dot"></span>';
      }
    }
  }
  return '<a class="tlink" style="font-weight: 800;" href="https://www.etoro.com/markets/' + encodeURIComponent(t.toLowerCase()) +
    '" target="_blank" rel="noopener"><strong>' + esc(display || t) + '</strong></a>' + warning;
};

/** 
 * @param {number|null|undefined} p 
 * @returns {string} 
 */
export const fmtPrice = (p) => p == null ? '-' : '$' + Number(p).toFixed(2);

/** 
 * @param {number|null|undefined} p 
 * @returns {string} 
 */
export const fmtMoney = (p) => p == null ? '-' : '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 
 * @param {number|null|undefined} v 
 * @returns {string} 
 */
export const fmtPL = (v) => v == null ? '-' : (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 
 * @param {any[]} fields 
 * @returns {boolean} 
 */
export const matchesSearch = (fields) =>
  !searchQuery || fields.some(v => v && String(v).toLowerCase().includes(searchQuery));

/** 
 * @template T 
 * @param {T[]} rows 
 * @param {{key: string, dir: number}} options 
 * @returns {T[]} 
 */
export function sortRows(rows, { key, dir }) {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    let cmp = (typeof av === 'number' && typeof bv === 'number')
      ? (av - bv) * dir : String(av).localeCompare(String(bv)) * dir;
    if (cmp === 0) {
      const an = a.name || (a.e && a.e.name) || a.ticker || (a.e && a.e.ticker) || '';
      const bn = b.name || (b.e && b.e.name) || b.ticker || (b.e && b.e.ticker) || '';
      cmp = String(an).localeCompare(String(bn));
    }
    return cmp;
  });
}