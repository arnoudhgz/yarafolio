// @ts-check
/** @type {any} */
export let Chart;
if (typeof window !== 'undefined') Chart = /** @type {any} */ (window).Chart;

/** @type {any} */
export let marked;
if (typeof window !== 'undefined') marked = /** @type {any} */ (window).marked;

/**
 * @typedef {Object} PricePoint
 * @property {number} price
 * @property {string} date
 * 
 * @typedef {Object} AdviceEntry
 * @property {string} id
 * @property {string} ticker
 * @property {string} status
 * @property {string} [source]
 * @property {string} firstAdvised
 * @property {{date: string, price: number}[]} [adviceEvents]
 * @property {number} priceAtAdvice
 * @property {PricePoint[]} priceHistory
 * @property {string} [droppedDate]
 * @property {{date: string, text: string}[]} [notes]
 * @property {string[]} [sources]
 * @property {string} [name]
 * @property {string} [rating]
 * @property {string} [earningsDate]
 * @property {number} [rsiAtAdvice]
 * @property {string} [sector]
 * @property {number} [buyBelow]
 * @property {number} [dropBelow]
 * @property {number} [dropAbove]
 * @property {string} [reason]
 * @property {string} [risk]
 * @property {number} [boughtAt]
 * @property {number} [soldAt]
 * @property {number} [units]
 * @property {any[]} [lots]
 * 
 * @typedef {Object} AppData
 * @property {string} lastUpdated
 * @property {AdviceEntry[]} entries
 * @property {any[]} [eodReports]
 * @property {any[]} [newsSummaries]
 * 
 * @typedef {Object} PortfolioData
 * @property {string|null} lastUpdated
 * @property {number} totalInvested
 * @property {any[]} holdings
 */

/** @type {AppData} */
export let DATA = { lastUpdated: '?', entries: [] };

/** @type {PortfolioData} */
export let PORTFOLIO = { lastUpdated: null, totalInvested: 0, holdings: [] };

/** @type {any} */
export let sectorChart = null;

/** @type {any} */
export let sectorCoverageChart = null;

/** @type {string} */
export let currentFilter = localStorage.getItem('currentFilter') || 'watching';

/** @type {string} */
export let posFilter = localStorage.getItem('posFilter') || 'open';

/** @type {string} */
export let newsFilter = localStorage.getItem('newsFilter') || 'all';

/** @type {string} */
export let ipoFilter = localStorage.getItem('ipoFilter') || 'listed';

/** @type {string} */
export let activeTab = localStorage.getItem('activeTab') || 'advice';

/** @type {boolean} */
export let portfolioRendered = false;

/** @type {boolean} */
export let canSave = false;

/** @type {any} */
export let LEARN = null;

/** @type {boolean} */
export let analyticsRendered = false;

/** @type {string} */
export let searchQuery = '';

/** @type {number|null} */
export let searchTimer = null;

/** @type {Record<string, any>} */
export const analyticsCharts = {};

/** @type {any} */
export let modalChart = null;

export const SECTOR_COLORS = {
  'Basic Materials': '#9b59b6', 'Conglomerates': '#f1c40f', 'Consumer Goods': '#2ecc71',
  'Financial': '#3498db', 'Healthcare': '#e74c3c', 'Industrial Goods': '#e67e22',
  'Services': '#1abc9c', 'Technology': '#fd79a8', 'Utilities': '#f39c12', 'ETF / Other': '#95a5a6',
};
// mirrors the SECTORS tuple in scripts/advice_log.py (eToro taxonomy)
export const SECTORS = ['Basic Materials', 'Conglomerates', 'Consumer Goods', 'Financial', 'Healthcare',
  'Industrial Goods', 'Services', 'Technology', 'Utilities', 'ETF / Other'];

/** @type {string} */
export let portfolioViewMode = localStorage.getItem('portfolioViewMode') || 'collapsed';

const savedSortState = localStorage.getItem('sortState');
const defaultSortState = {
  advice: { key: 'buyProx', dir: 1 },
  archive: { key: 'firstAdvised', dir: -1 },
  positions_all: { key: 'firstAdvised', dir: -1 },
  positions_open: { key: 'firstAdvised', dir: -1 },
  positions_closed: { key: 'firstAdvised', dir: -1 },
  positions_needsconfirm: { key: 'firstAdvised', dir: -1 },
  portfolio: { key: 'plPct', dir: -1 },
};
let initialSortState = defaultSortState;
try {
  if (savedSortState) {
    initialSortState = { ...defaultSortState, ...JSON.parse(savedSortState) };
  }
} catch (e) {}

/** @type {Record<string, {key: string, dir: number}>} */
export const sortState = initialSortState;

/** @param {AppData} val */
export function setDATA(val) { DATA = val; }
/** @param {PortfolioData} val */
export function setPORTFOLIO(val) { PORTFOLIO = val; }
/** @param {any} val */
export function setSectorChart(val) { sectorChart = val; }
/** @param {any} val */
export function setSectorCoverageChart(val) { sectorCoverageChart = val; }
/** @param {string} val */
export function setCurrentFilter(val) { currentFilter = val; localStorage.setItem('currentFilter', val); }
/** @param {string} val */
export function setPosFilter(val) { posFilter = val; localStorage.setItem('posFilter', val); }
/** @param {string} val */
export function setNewsFilter(val) { newsFilter = val; localStorage.setItem('newsFilter', val); }
/** @param {string} val */
export function setIpoFilter(val) { ipoFilter = val; localStorage.setItem('ipoFilter', val); }
/** @param {string} val */
export function setActiveTab(val) { activeTab = val; localStorage.setItem('activeTab', val); }
/** @param {boolean} val */
export function setPortfolioRendered(val) { portfolioRendered = val; }
/** @param {boolean} val */
export function setCanSave(val) { canSave = val; }
/** @param {any} val */
export function setLEARN(val) { LEARN = val; }
/** @param {boolean} val */
export function setAnalyticsRendered(val) { analyticsRendered = val; }
/** @param {string} val */
export function setSearchQuery(val) { searchQuery = val; }
/** @param {number|null} val */
export function setSearchTimer(val) { searchTimer = val; }
/** @param {any} val */
export function setModalChart(val) { modalChart = val; }
/** @param {string} val */
export function setPortfolioViewMode(val) { portfolioViewMode = val; localStorage.setItem('portfolioViewMode', val); }