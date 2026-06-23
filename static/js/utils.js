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
export const nowStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };

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
    return (typeof av === 'number' && typeof bv === 'number'
      ? av - bv : String(av).localeCompare(String(bv))) * dir;
  });
}