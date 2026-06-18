let DATA = { lastUpdated: '?', entries: [] };
let PORTFOLIO = { lastUpdated: null, totalInvested: 0, holdings: [] };
let sectorChart = null;
let sectorCoverageChart = null;
let currentFilter = 'watching';
let posFilter = 'open';
let activeTab = 'advice';
let portfolioRendered = false;
let canSave = false;
let LEARN = null;
let analyticsRendered = false;
let searchQuery = '';
let searchTimer = null;
const analyticsCharts = {};
let modalChart = null;

const SECTOR_COLORS = {
  'Basic Materials': '#9b59b6', 'Conglomerates': '#f1c40f', 'Consumer Goods': '#2ecc71',
  'Financial': '#3498db', 'Healthcare': '#e74c3c', 'Industrial Goods': '#e67e22',
  'Services': '#1abc9c', 'Technology': '#fd79a8', 'Utilities': '#f39c12', 'ETF / Other': '#95a5a6',
};
// mirrors the SECTORS tuple in scripts/advice_log.py (eToro taxonomy)
const SECTORS = ['Basic Materials', 'Conglomerates', 'Consumer Goods', 'Financial', 'Healthcare',
  'Industrial Goods', 'Services', 'Technology', 'Utilities', 'ETF / Other'];

const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
// imported-only holdings stay in the log for check-ins, but the advice view is about advice performance
const advised = () => DATA.entries.filter(e => e.source !== 'import');
const latestPrice = (e) => e.priceHistory.length ? e.priceHistory[e.priceHistory.length - 1].price : e.priceAtAdvice;
const changePct = (e) => {
  const base = (e.status === 'bought' || e.status === 'sold') && e.boughtAt ? e.boughtAt : e.priceAtAdvice;
  const now = e.status === 'sold' && e.soldAt ? e.soldAt : latestPrice(e);
  return ((now - base) / base) * 100;
};
// realized $ on a closed trade, unrealized $ on an open one; null when units are unknown
const realizedPL = (e) => (e.status === 'sold' && e.soldAt != null && e.boughtAt != null && e.units != null)
  ? (e.soldAt - e.boughtAt) * e.units : null;
const unrealizedPL = (e) => (e.status === 'bought' && e.boughtAt != null && e.units != null)
  ? (latestPrice(e) - e.boughtAt) * e.units : null;
const fmtPct = (p) => (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tickerLink = (t, display) => {
  let warning = '';
  const e = DATA.entries.find(x => x.ticker === t);
  if (e && e.earningsDate) {
    const d = new Date(e.earningsDate);
    if (!isNaN(d)) {
      const days = (d - new Date()) / 86400000;
      if (days >= -1 && days <= 7) {
        warning = ' <span title="Earnings: ' + esc(e.earningsDate) + '" class="earnings-dot"></span>';
      }
    }
  }
  return '<a class="tlink" style="font-weight: 800;" href="https://www.etoro.com/markets/' + encodeURIComponent(t.toLowerCase()) +
    '" target="_blank" rel="noopener"><strong>' + esc(display || t) + '</strong></a>' + warning;
};
const fmtPrice = (p) => p == null ? '-' : '$' + Number(p).toFixed(2);
const fmtMoney = (p) => p == null ? '-' : '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPL = (v) => v == null ? '-' : (v >= 0 ? '+' : '-') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const matchesSearch = (fields) =>
  !searchQuery || fields.some(v => v && String(v).toLowerCase().includes(searchQuery));

const sortState = {
  advice: { key: 'buyProx', dir: 1 },
  archive: { key: 'firstAdvised', dir: -1 },
  positions: { key: 'firstAdvised', dir: -1 },
  portfolio: { key: 'plPct', dir: -1 },
};

function sortRows(rows, { key, dir }) {
  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (typeof av === 'number' && typeof bv === 'number'
      ? av - bv : String(av).localeCompare(String(bv))) * dir;
  });
}

function markSortedHeader(table, { key, dir }) {
  table.querySelectorAll('th[data-key]').forEach(th => {
    th.classList.toggle('sorted-asc', th.dataset.key === key && dir === 1);
    th.classList.toggle('sorted-desc', th.dataset.key === key && dir === -1);
  });
}

function banner(msg, type) {
  const el = document.getElementById('banner');
  el.textContent = msg;
  el.className = type === 'success' ? 'success' : '';
  el.style.display = msg ? 'block' : 'none';
}

async function load() {
  try {
    const [logRes, pfRes] = await Promise.all([
      fetch('data/advice-log.json', { cache: 'no-store' }),
      fetch('data/portfolio.json', { cache: 'no-store' }),
    ]);
    if (!logRes.ok) throw new Error(logRes.statusText);
    DATA = await logRes.json();
    PORTFOLIO = pfRes.ok ? await pfRes.json() : { lastUpdated: null, totalInvested: 0, holdings: [] };
    canSave = location.protocol.startsWith('http');
    if (!canSave) banner('Opened as a local file: buttons are disabled. Start with: python3 serve.py');
    document.getElementById('syncBtn').style.display = canSave ? 'block' : 'none';
    if (canSave) {
      fetch('/api/locations').then(r => r.json()).then(data => {
        if (data.prefixes && data.prefixes.length > 0) {
          const sel = document.getElementById('locationSelect');
          sel.innerHTML = data.prefixes.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('');
          sel.style.display = 'block';
          
          const saved = localStorage.getItem('etoroLocation');
          if (saved && data.prefixes.includes(saved)) {
            sel.value = saved;
          }
          sel.addEventListener('change', () => {
            localStorage.setItem('etoroLocation', sel.value);
          });
        }
      }).catch(() => {});
    }
    setInterval(updateTimer, 1000);
    updateTimer();
  } catch (err) {
    banner('Could not load data/advice-log.json. Start the dashboard with: python3 serve.py');
  }
  portfolioRendered = false;
  analyticsRendered = false;
  LEARN = null;  // refetch stats after data changes
  renderAll();
  const savedTab = localStorage.getItem('activeTab');
  if (savedTab && savedTab !== 'advice') {
    const tabBtn = document.querySelector(`.tabs button[data-tab="${savedTab}"]`);
    if (tabBtn) tabBtn.click();
  }

  // Background check for near-term IPOs to update the tab dot
  if (document.getElementById('iposBody').innerHTML === '') {
    fetchIpos().catch(() => {});
  }
}

async function save() {
  DATA.lastUpdated = today();
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DATA, null, 2),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function applyChange(mutate) {
  try {
    mutate();
    await save();
    banner('');
  } catch (err) {
    banner('Save failed (' + err.message + '). Is serve.py still running?');
  }
  renderAll();
}

function renderAll() {
  const entries = advised();
  document.getElementById('lastUpdated').textContent =
    'Last updated: ' + DATA.lastUpdated + ' · ' + entries.length + ' advised picks · ' +
    PORTFOLIO.holdings.length + ' holdings';
  document.getElementById('cTracked').textContent = entries.length;
  document.getElementById('cOpen').textContent = entries.filter(e => e.status === 'bought').length;
  document.getElementById('cWatching').textContent = entries.filter(e => e.status === 'watching').length;
  renderTable();
  renderArchive();
  renderPositions();
  if (activeTab === 'portfolio') renderPortfolio();
  else portfolioRendered = false;
  if (activeTab === 'analytics' && LEARN) renderAnalytics();
}

function adviceRows() {
  return advised().map(e => {
    const priceNow = e.status === 'sold' && e.soldAt ? e.soldAt : latestPrice(e);
    return {
      e,
      firstAdvised: e.firstAdvised,
      ticker: e.ticker,
      priceThen: (e.status === 'bought' || e.status === 'sold') ? (e.boughtAt ?? e.priceAtAdvice) : e.priceAtAdvice,
      priceNow,
      changePct: changePct(e),
      rating: e.rating || null,
      rsi: e.rsiAtAdvice ?? null,
      sector: e.sector || null,
      buyBelow: e.buyBelow ?? null,
      dropBelow: e.dropBelow ?? null,
      dropAbove: e.dropAbove ?? null,
      buyProx: (priceNow && e.buyBelow) ? (priceNow - e.buyBelow) / e.buyBelow : 999,
      status: e.status,
    };
  });
}

function tippingFlags(r) {
  const p = latestPrice(r.e);
  const dropHit = r.dropBelow != null && p <= r.dropBelow && (r.status === 'watching' || r.status === 'bought');
  const buyHit = !dropHit && r.status === 'watching' && r.buyBelow != null && p <= r.buyBelow;
  // missed: a watching pick whose price ran above the entry band, the oversold bounce already happened
  const missedHit = r.status === 'watching' && r.dropAbove != null && p >= r.dropAbove;
  return { dropHit, buyHit, missedHit };
}

function sparkline(canvas, e) {
  // anchor the line at the advised price so it starts where the advice did, and color it by the
  // same baseline as the Change % column (advised -> now), so trend colour always matches Change
  const hist = e.priceHistory || [];
  const pts = [];
  if (e.priceAtAdvice != null && (!hist.length || hist[0].price !== e.priceAtAdvice)) {
    pts.push({ date: e.firstAdvised, price: e.priceAtAdvice });
  }
  pts.push(...hist);
  if (pts.length < 2) { canvas.style.display = 'none'; return; }
  const up = changePct(e) >= 0;
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: pts.map(h => h.date),
      datasets: [{
        data: pts.map(h => h.price),
        borderColor: up ? '#2ecc71' : '#e74c3c',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: false,
    }
  });
}

function actionButtons(e) {
  // positions come from the eToro import now; the watchlist only needs Drop
  if (!canSave) return '';
  if (e.status === 'watching') {
    return '<button class="drop" data-act="drop" data-id="' + e.id + '">Drop</button>';
  }
  if (e.status === 'dropped') {
    return '<button class="buy" data-act="rewatch" data-id="' + e.id + '">Re-watch</button>' +
           '<button class="drop" data-act="remove" data-id="' + e.id + '">Remove</button>';
  }
  return '';
}

function sectorPctMap() {
  const total = PORTFOLIO.holdings.reduce((s, h) => s + (h.invested || 0), 0);
  if (!total) return null;
  const invested = {};
  PORTFOLIO.holdings.forEach(h => {
    const s = h.sector || 'ETF / Other';
    invested[s] = (invested[s] || 0) + (h.invested || 0);
  });
  const pct = {};
  SECTORS.forEach(s => { pct[s] = (invested[s] || 0) / total * 100; });
  return pct;
}

// 'gap' when the pick's sector is 0% of the portfolio, 'under' when below 5%; same rule as the diversify view
function sectorFlag(secPct, sector) {
  if (!secPct || !sector || sector === 'ETF / Other') return '';
  const p = secPct[sector];
  if (p === 0) return 'gap';
  if (p < 5) return 'under';
  return '';
}

function renderTable() {
  const tbody = document.querySelector('#adviceTable tbody');
  tbody.innerHTML = '';
  const secPct = sectorPctMap();
  const rows = sortRows(
    adviceRows().filter(r => {
      if (r.status !== 'watching') return false;
      if (r.e.lots && r.e.lots.length) return false;
      if (!matchesSearch([r.ticker, r.e.name, r.e.reason, r.sector])) return false;
      if (currentFilter === 'gap') return sectorFlag(secPct, r.sector) === 'gap';
      if (currentFilter === 'under') return sectorFlag(secPct, r.sector) === 'under';
      if (currentFilter === 'buyzone') return tippingFlags(r).buyHit;
      if (currentFilter === 'drophit') return tippingFlags(r).dropHit;
      if (currentFilter === 'missed') return tippingFlags(r).missedHit;
      return true;
    }),
    sortState.advice);
  if (activeTab === 'advice') setSearchCount(rows.length);
  markSortedHeader(document.getElementById('adviceTable'), sortState.advice);
  document.getElementById('emptyMsg').style.display = rows.length ? 'none' : 'block';
  document.getElementById('adviceTable').style.display = rows.length ? '' : 'none';
  rows.forEach(r => {
    const e = r.e;
    const { dropHit, buyHit, missedHit } = tippingFlags(r);
    const sf = sectorFlag(secPct, r.sector);
    const tr = document.createElement('tr');
    tr.dataset.id = e.id;
    if (dropHit) tr.classList.add('hit-drop');
    else if (buyHit) tr.classList.add('hit-buy');
    else if (missedHit) tr.classList.add('hit-missed');
    tr.innerHTML =
      '<td>' + r.firstAdvised + '</td>' +
      '<td title="' + esc(e.reason || '') + '">' +
        tickerLink(r.ticker) +
        (e.name ? '<span class="sub">' + esc(e.name) + '</span>' : '') + '</td>' +
      '<td>' + fmtPrice(r.priceThen) + '</td>' +
      '<td>' + fmtPrice(r.priceNow) + '</td>' +
      '<td class="' + (r.changePct >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.changePct) + '</td>' +
      '<td>' + (r.rating || '-') + '</td>' +
      '<td>' + (r.rsi ?? '-') + '</td>' +
      '<td' + (sf ? ' class="sec-' + sf + '"' : '') + '>' + (r.sector || '-') + '</td>' +
      '<td>' + fmtPrice(r.buyBelow) + '</td>' +
      '<td>' + fmtPrice(r.dropBelow) + '</td>' +
      '<td class="' + (e.status === 'watching' && e.dropAbove && latestPrice(e) >= e.dropAbove ? 'sec-gap' : '') + '">' + fmtPrice(e.dropAbove) + '</td>' +
      '<td class="spark-col"><div style="width:70px; height:30px;"><canvas class="spark"></canvas></div></td>' +
      '<td><span class="badge ' + r.status + '">' + r.status + '</span></td>' +
      '<td class="actions">' + actionButtons(e) + '</td>';
    tbody.appendChild(tr);
    sparkline(tr.querySelector('canvas'), e);
  });
}

function renderArchive() {
  const tbody = document.querySelector('#archiveTable tbody');
  tbody.innerHTML = '';
  const rows = sortRows(
    adviceRows().filter(r => {
      if (r.status !== 'dropped') return false;
      if (!matchesSearch([r.ticker, r.e.name, r.e.reason, r.sector])) return false;
      return true;
    }),
    sortState.archive);
  if (activeTab === 'archive') setSearchCount(rows.length);
  markSortedHeader(document.getElementById('archiveTable'), sortState.archive);
  document.getElementById('archiveEmptyMsg').style.display = rows.length ? 'none' : 'block';
  document.getElementById('archiveTable').style.display = rows.length ? '' : 'none';
  rows.forEach(r => {
    const e = r.e;
    const tr = document.createElement('tr');
    tr.dataset.id = e.id;
    tr.innerHTML =
      '<td>' + r.firstAdvised + '</td>' +
      '<td title="' + esc(e.reason || '') + '">' +
        tickerLink(r.ticker) +
        (e.name ? '<span class="sub">' + esc(e.name) + '</span>' : '') + '</td>' +
      '<td>' + fmtPrice(r.priceThen) + '</td>' +
      '<td>' + fmtPrice(r.priceNow) + '</td>' +
      '<td class="' + (r.changePct >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.changePct) + '</td>' +
      '<td>' + (r.rating || '-') + '</td>' +
      '<td>' + (r.rsi ?? '-') + '</td>' +
      '<td>' + (r.sector || '-') + '</td>' +
      '<td><span class="badge ' + r.status + '">' + r.status + '</span></td>' +
      '<td class="actions">' + actionButtons(e) + '</td>';
    tbody.appendChild(tr);
  });
}

function findLot(positionID) {
  for (const e of DATA.entries) {
    for (const lot of (e.lots || [])) {
      if (String(lot.positionID) === String(positionID)) return { e, lot };
    }
  }
  return null;
}

function positionLotRows() {
  const rows = [];
  advised().forEach(e => (e.lots || []).forEach(lot => {
    const closed = lot.soldAt != null;
    const exit = closed ? lot.soldAt : lot.lastPrice;
    const open = lot.openRate;
    rows.push({
      e, positionID: lot.positionID,
      firstAdvised: e.firstAdvised,
      openDate: lot.openDate,
      closedDate: lot.closedDate,
      ticker: e.ticker,
      priceAtAdvice: e.priceAtAdvice,
      boughtAt: open,                 // matches the Bought column's data-key
      units: lot.units,
      exitOrNow: exit,
      plPct: open ? (exit - open) / open * 100 : 0,
      plDollar: (exit - open) * lot.units,
      status: closed ? 'sold' : 'bought',
      exitEstimated: !!lot.exitEstimated,
      tslEnabled: !!lot.tslEnabled,
    });
  }));
  return rows;
}

function renderPositions() {
  const all = positionLotRows();
  const closed = all.filter(r => r.status === 'sold');
  const openRows = all.filter(r => r.status === 'bought');
  const needsConfirm = all.filter(r => r.exitEstimated).length;
  document.querySelector('button[data-tab="positions"]').innerHTML = 'Positions' + (needsConfirm ? ' <span style="color:var(--orange);font-weight:bold;margin-left:4px">🔴 ' + needsConfirm + '</span>' : '');
  const wins = closed.filter(r => r.exitOrNow > r.boughtAt).length;
  const realizedTotal = closed.reduce((s, r) => s + r.plDollar, 0);
  const realizedInv = closed.reduce((s, r) => s + (r.boughtAt * r.units), 0);
  const realizedPct = realizedInv ? (realizedTotal / realizedInv * 100) : 0;
  
  const openTotal = openRows.reduce((s, r) => s + r.plDollar, 0);
  const openInv = openRows.reduce((s, r) => s + (r.boughtAt * r.units), 0);
  const openPct = openInv ? (openTotal / openInv * 100) : 0;
  
  document.getElementById('pWinRate').textContent = closed.length ? Math.round(100 * wins / closed.length) + '%' : '-';
  const pRealized = document.getElementById('pRealized');
  const pOpen = document.getElementById('pOpen');
  
  pRealized.innerHTML = closed.length ? fmtPL(realizedTotal) + ' <span style="font-size:13px;opacity:0.8;margin-left:4px">(' + (realizedPct > 0 ? '+' : '') + realizedPct.toFixed(2) + '%)</span>' : '-';
  pRealized.className = 'value ' + (closed.length && realizedTotal < 0 ? 'neg' : closed.length ? 'pos' : '');
  
  pOpen.innerHTML = openRows.length ? fmtPL(openTotal) + ' <span style="font-size:13px;opacity:0.8;margin-left:4px">(' + (openPct > 0 ? '+' : '') + openPct.toFixed(2) + '%)</span>' : '-';
  pOpen.className = 'value ' + (openRows.length && openTotal < 0 ? 'neg' : openRows.length ? 'pos' : '');

  const rows = sortRows(all.filter(r => {
    if (!matchesSearch([r.ticker, r.e.name, r.e.reason, r.e.sector])) return false;
    if (posFilter === 'open') return r.status === 'bought';
    if (posFilter === 'closed') return r.status === 'sold';
    if (posFilter === 'needsconfirm') return r.exitEstimated;
    return true;
  }), sortState.positions);
  if (activeTab === 'positions') setSearchCount(rows.length);
  markSortedHeader(document.getElementById('positionsTable'), sortState.positions);
  document.getElementById('positionsEmpty').style.display = rows.length ? 'none' : 'block';
  document.getElementById('positionsTable').style.display = rows.length ? '' : 'none';
  const tbody = document.querySelector('#positionsTable tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.id = r.e.id;
    const estBadge = r.exitEstimated ? '<span class="badge est">est</span>' : '';
    const tslBadge = (r.status === 'bought' && r.plPct >= 5 && !r.tslEnabled) ? '<span class="badge" style="background:rgba(231,76,60,0.15);color:var(--red);margin-left:4px;" title="Set a trailing stop loss on eToro!">⚠️ NO TSL</span>' : '';
    const confirmBtn = r.exitEstimated && canSave
      ? '<button class="sell" data-confirm="' + r.positionID + '">Confirm exit</button>' : '';
    tr.innerHTML =
      '<td>' + r.firstAdvised + '</td>' +
      '<td>' + (r.openDate || '-') + '</td>' +
      '<td>' + (r.status === 'sold' && r.closedDate ? r.closedDate : '-') + '</td>' +
      '<td title="' + esc(r.e.reason || '') + '">' + tickerLink(r.ticker) +
        (r.e.name ? '<span class="sub">' + esc(r.e.name) + '</span>' : '') + '</td>' +
      '<td>' + fmtPrice(r.priceAtAdvice) + '</td>' +
      '<td>' + fmtPrice(r.boughtAt) + '</td>' +
      '<td>' + r.units + '</td>' +
      '<td>' + fmtPrice(r.exitOrNow) + '</td>' +
      '<td class="' + (r.plPct >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.plPct) + '</td>' +
      '<td class="' + (r.plDollar >= 0 ? 'pos' : 'neg') + '">' + fmtPL(r.plDollar) + '</td>' +
      '<td><span class="badge ' + r.status + '">' + r.status + '</span>' + estBadge + tslBadge + '</td>' +
      '<td class="actions">' + confirmBtn + '</td>';
    tbody.appendChild(tr);
  });
}

function renderPortfolio() {
  renderSectorCoverage();
  renderSectorChart();
  renderPortfolioTable();
  portfolioRendered = true;
}

function renderPortfolioTable() {
  let holdings = PORTFOLIO.holdings.filter(h => matchesSearch([h.ticker, h.name, h.sector]));
  
  if (portfolioViewMode === 'split') {
    const splitHoldings = [];
    holdings.forEach(h => {
      if (!h.lots || h.lots.length <= 1) {
        splitHoldings.push(h);
      } else {
        h.lots.forEach((lot, idx) => {
          splitHoldings.push({
            ticker: h.ticker,
            displayTicker: h.ticker + ' (Lot ' + (idx + 1) + ')',
            name: h.name,
            sector: h.sector,
            units: lot.units,
            invested: lot.units * lot.openRate,
            avgOpen: lot.openRate,
            currentPrice: h.currentPrice,
            plDollar: lot.units * (h.currentPrice - lot.openRate),
            plPct: lot.openRate > 0.01 ? (h.currentPrice - lot.openRate) / lot.openRate * 100 : 0,
            firstOpen: lot.openDate,
            positions: 1
          });
        });
      }
    });
    holdings = splitHoldings;
  }
  
  const empty = !holdings.length;
  document.getElementById('portfolioEmpty').style.display = empty ? 'block' : 'none';
  document.getElementById('portfolioTable').style.display = empty ? 'none' : '';
  if (activeTab === 'portfolio') setSearchCount(holdings.length);
  const tbody = document.querySelector('#portfolioTable tbody');
  tbody.innerHTML = '';
  markSortedHeader(document.getElementById('portfolioTable'), sortState.portfolio);
  sortRows(holdings, sortState.portfolio).forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + tickerLink(h.ticker, h.displayTicker) + '</td>' +
      '<td>' + (h.name || '') + '</td>' +
      '<td>' + (h.sector || '-') + '</td>' +
      '<td>' + h.units + '</td>' +
      '<td>' + fmtPrice(h.invested) + '</td>' +
      '<td>' + fmtPrice(h.avgOpen) + '</td>' +
      '<td>' + fmtPrice(h.currentPrice) + '</td>' +
      '<td class="' + ((h.plDollar ?? 0) >= 0 ? 'pos' : 'neg') + '">' + fmtPrice(h.plDollar) + '</td>' +
      '<td class="' + ((h.plPct ?? 0) >= 0 ? 'pos' : 'neg') + '">' + (h.plPct == null ? '-' : fmtPct(h.plPct)) + '</td>' +
      '<td>' + h.firstOpen + '</td>' +
      '<td>' + h.positions + '</td>';
    tbody.appendChild(tr);
  });
}

let portfolioViewMode = 'collapsed';
document.getElementById('btnCollapse').addEventListener('click', () => {
  portfolioViewMode = 'collapsed';
  document.getElementById('btnCollapse').classList.add('active');
  document.getElementById('btnSplit').classList.remove('active');
  renderPortfolioTable();
});
document.getElementById('btnSplit').addEventListener('click', () => {
  portfolioViewMode = 'split';
  document.getElementById('btnSplit').classList.add('active');
  document.getElementById('btnCollapse').classList.remove('active');
  renderPortfolioTable();
});

function renderSectorChart() {
  if (sectorChart) { sectorChart.destroy(); sectorChart = null; }
  const bySector = new Map();
  PORTFOLIO.holdings.forEach(h => {
    const s = h.sector || 'ETF / Other';
    bySector.set(s, (bySector.get(s) || 0) + h.invested);
  });
  const sorted = [...bySector.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, v]) => sum + v, 0);
  const list = document.getElementById('sectorList');
  list.innerHTML = sorted.map(([s, v]) =>
    '<li><span class="dot" style="background:' + (SECTOR_COLORS[s] || '#7f8c8d') + '"></span>' + s +
    '<span class="amt">' + fmtMoney(v) + ' · ' + (100 * v / total).toFixed(1) + '%</span></li>').join('');
  if (!sorted.length) return;
  sectorChart = new Chart(document.getElementById('sectorChart'), {
    type: 'doughnut',
    data: {
      labels: sorted.map(([s]) => s),
      datasets: [{
        data: sorted.map(([, v]) => v),
        backgroundColor: sorted.map(([s]) => SECTOR_COLORS[s] || '#7f8c8d'),
        borderColor: '#1a2129',
        borderWidth: 2,
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.label + ': ' + fmtMoney(ctx.parsed) +
              ' (' + (100 * ctx.parsed / total).toFixed(1) + '%)'
          }
        }
      }
    }
  });
}

function setSearchCount(n) {
  document.getElementById('searchCount').textContent =
    searchQuery ? n + ' result' + (n === 1 ? '' : 's') : '';
}

function renderSectorCoverage() {
  if (sectorCoverageChart) { sectorCoverageChart.destroy(); sectorCoverageChart = null; }
  const invested = {};
  const total = PORTFOLIO.holdings.reduce((s, h) => s + (h.invested || 0), 0);
  PORTFOLIO.holdings.forEach(h => {
    const s = h.sector || 'ETF / Other';
    invested[s] = (invested[s] || 0) + (h.invested || 0);
  });
  const adviceCount = {};
  advised().forEach(e => { if (e.sector) adviceCount[e.sector] = (adviceCount[e.sector] || 0) + 1; });
  const pct = (s) => total ? (invested[s] || 0) / total * 100 : 0;
  document.getElementById('sectorGaps').innerHTML = SECTORS.map(s => {
    const p = pct(s), ac = adviceCount[s] || 0;
    let tag = '';
    if (s !== 'ETF / Other' && p === 0) tag = ' <span class="tag gap">gap</span>';
    else if (s !== 'ETF / Other' && p < 5) tag = ' <span class="tag under">under</span>';
    return '<li><span class="dot" style="background:' + (SECTOR_COLORS[s] || '#7f8c8d') + '"></span>' +
      s + tag + '<span class="gp">' + p.toFixed(1) + '% · ' + ac + ' advice</span></li>';
  }).join('');
  if (!PORTFOLIO.holdings.length) return;
  sectorCoverageChart = new Chart(document.getElementById('sectorCoverageChart'), {
    type: 'bar',
    data: {
      labels: SECTORS,
      datasets: [{
        label: 'Allocation %',
        data: SECTORS.map(s => +pct(s).toFixed(2)),
        backgroundColor: SECTORS.map(s => SECTOR_COLORS[s] || '#7f8c8d'),
      }]
    },
    options: {
      indexAxis: 'y', maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) =>
          ctx.parsed.x.toFixed(1) + '% · ' + (adviceCount[ctx.label] || 0) + ' advice pick(s)' } }
      },
      scales: {
        x: { min: 0, ticks: { color: '#8b98a5', callback: (v) => v + '%' }, grid: { color: '#2a3441' } },
        y: { ticks: { color: '#e6edf3' }, grid: { display: false } }
      }
    }
  });
}

async function loadLearn() {
  if (LEARN) return;
  for (const url of ['/api/stats', 'data/learn-stats.json']) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) { LEARN = await res.json(); return; }
    } catch (err) { /* try next source */ }
  }
  LEARN = null;
}

function renderAnalytics() {
  analyticsRendered = true;
  const empty = document.getElementById('analyticsEmpty');
  if (!LEARN) {
    document.getElementById('analyticsCards').innerHTML = '';
    document.getElementById('sevenDayBox').innerHTML = '';
    ['chartRating', 'chartRsiBand', 'chartSector', 'chartSource'].forEach(id => renderBucketChart(id, {}));
    empty.textContent = canSave ? 'No stats available yet. Run /learn to generate outcomes.'
      : 'Analytics needs the server. Start it with: python3 serve.py';
    empty.style.display = 'block';
    return;
  }
  document.getElementById('analyticsCards').innerHTML = [
    ['Advised entries', LEARN.advisedEntries], ['Measurable outcomes', LEARN.measurableOutcomes],
    ['Watching now', LEARN.watchingNow],
  ].map(([l, v]) => '<div class="card"><div class="label">' + l + '</div><div class="value">' + (v ?? 0) + '</div></div>').join('');
  const sd = LEARN.sevenDayAfterAdvice || { n: 0 };
  document.getElementById('sevenDayBox').innerHTML = sd.n
    ? '<span class="' + (sd.avg >= 0 ? 'pos' : 'neg') + '">avg ' + fmtPct(sd.avg) + '</span> · median <span class="' +
      (sd.median >= 0 ? 'pos' : 'neg') + '">' + fmtPct(sd.median) + '</span> (n=' + sd.n + ')'
    : '<div class="insufficient">No 7-day windows yet.</div>';
  const b = LEARN.buckets || {};
  renderBucketChart('chartRating', b.rating);
  renderBucketChart('chartRsiBand', b.rsiBand);
  renderBucketChart('chartSector', b.sector);
  renderBucketChart('chartSource', b.source);
  empty.textContent = 'Not enough finished advice yet to learn from. Outcomes appear once picks are sold, dropped, or 7+ days old.';
  empty.style.display = LEARN.measurableOutcomes ? 'none' : 'block';
}

function renderBucketChart(canvasId, buckets) {
  if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
  buckets = buckets || {};
  const note = document.getElementById(canvasId + 'Note');
  const canvas = document.getElementById(canvasId);
  const keys = Object.keys(buckets);
  const ok = keys.filter(k => !buckets[k].insufficient);
  const weak = keys.filter(k => buckets[k].insufficient);
  if (note) note.innerHTML = weak.length
    ? '<div class="insufficient">Insufficient (n&lt;3): ' + weak.map(k => k + ' (n=' + buckets[k].n + ')').join(', ') + '</div>'
    : '';
  if (!ok.length) {
    canvas.style.display = 'none';
    if (note && !weak.length) note.innerHTML = '<div class="insufficient">No finished outcomes in this dimension yet.</div>';
    return;
  }
  canvas.style.display = '';
  analyticsCharts[canvasId] = new Chart(canvas, {
    data: {
      labels: ok,
      datasets: [
        { type: 'line', label: 'Win rate %', yAxisID: 'y', data: ok.map(k => buckets[k].winRate), borderColor: '#3498db', backgroundColor: '#3498db', borderWidth: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2, pointRadius: 5, tension: 0.3 },
        { type: 'bar', label: 'Avg move %', yAxisID: 'y1', data: ok.map(k => buckets[k].avg),
          backgroundColor: ok.map(k => buckets[k].avg >= 0 ? 'rgba(46, 204, 113, 0.8)' : 'rgba(231, 76, 60, 0.8)'), borderRadius: 6, maxBarThickness: 50 },
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { position: 'left', min: 0, max: 100, title: { display: true, text: 'Win %', color: '#8b98a5' },
             ticks: { color: '#8b98a5' }, grid: { color: '#2a3441', drawBorder: false } },
        y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'Avg %', color: '#8b98a5' },
              ticks: { color: '#8b98a5' } },
        x: { ticks: { color: '#8b98a5' }, grid: { display: false, drawBorder: false } }
      },
      plugins: {
        legend: { labels: { color: '#e6edf3', usePointStyle: true, boxWidth: 10 } },
        tooltip: {
          backgroundColor: 'rgba(13, 17, 23, 0.9)',
          titleColor: '#e6edf3',
          bodyColor: '#e6edf3',
          borderColor: '#30363d',
          borderWidth: 1,
          padding: 12,
          callbacks: { afterBody: (items) => {
            const s = buckets[items[0].label];
            return ['n = ' + s.n, 'median: ' + fmtPct(s.median)];
          } }
        }
      }
    }
  });
}

function openModal(id) {
  let e = DATA.entries.find(x => x.id === id);
  if (!e) e = DATA.entries.find(x => x.ticker === id);
  if (!e) return;
  const notes = e.notes || [];
  const links = Array.isArray(e.sources) ? e.sources : [];
  document.getElementById('modalBody').innerHTML =
    '<div style="flex: 1; overflow-y: auto; padding-right: 16px; display: flex; flex-direction: column;">' +
      '<h2>' + tickerLink(e.ticker) + '</h2>' +
      '<div class="modal-meta">' +
        (e.name ? '<span>' + esc(e.name) + '</span>' : '') +
        '<span class="badge ' + e.status + '">' + e.status + '</span>' +
        (e.rating ? '<span>Rating ' + esc(e.rating) + '</span>' : '') +
        (e.earningsDate ? '<span style="color:var(--orange)">Earnings ' + esc(e.earningsDate) + '</span>' : '') +
        (e.rsiAtAdvice != null ? '<span>RSI ' + e.rsiAtAdvice + '</span>' : '') +
        (e.sector ? '<span>' + esc(e.sector) + '</span>' : '') +
        (e.buyBelow != null ? '<span>buy below ' + fmtPrice(e.buyBelow) + '</span>' : '') +
        (e.dropBelow != null ? '<span>drop below ' + fmtPrice(e.dropBelow) + '</span>' : '') +
        (e.dropAbove != null ? '<span>drop above ' + fmtPrice(e.dropAbove) + '</span>' : '') +
        (realizedPL(e) != null ? '<span>realized <span class="' + (realizedPL(e) >= 0 ? 'pos' : 'neg') + '">' + fmtPL(realizedPL(e)) + '</span></span>' : '') +
        (unrealizedPL(e) != null ? '<span>open P/L <span class="' + (unrealizedPL(e) >= 0 ? 'pos' : 'neg') + '">' + fmtPL(unrealizedPL(e)) + '</span></span>' : '') +
        (e.exitEstimated ? '<span class="badge est">estimated exit</span>' : '') +
      '</div>' +
      (e.reason ? '<h4>Thesis</h4><div>' + esc(e.reason) + '</div>' : '') +
      (e.risk ? '<h4>Risk</h4><div>' + esc(e.risk) + '</div>' : '') +
      ((e.lots && e.lots.length) ? '<h4>Advice-Tracked Lots</h4><ul class="note-list">' +
        e.lots.map(l => {
          const closed = l.soldAt != null;
          const exit = closed ? l.soldAt : l.lastPrice;
          const pl = (exit - l.openRate) * l.units;
          return '<li><span class="nd">' + l.openDate + '</span><span>' + l.units + ' @ ' +
            fmtPrice(l.openRate) + ' &rarr; ' + fmtPrice(exit) + ' <span class="' + (pl >= 0 ? 'pos' : 'neg') +
            '">' + fmtPL(pl) + '</span> ' + (closed ? '(closed' + (l.exitEstimated ? ', est' : '') + ')' : '(open)') +
            '</span></li>';
        }).join('') + '</ul>' : '') +
      (() => {
        const pfH = PORTFOLIO.holdings.find(h => h.ticker === e.ticker);
        if (pfH && pfH.lots && pfH.lots.length) {
          return '<h4>Current eToro Holdings</h4><ul class="note-list">' +
            pfH.lots.map(l => {
              const pl = (pfH.currentPrice - l.openRate) * l.units;
              const pct = (pfH.currentPrice - l.openRate) / l.openRate * 100;
              return '<li><span class="nd">' + l.openDate + '</span><span>' + l.units + ' @ ' +
                fmtPrice(l.openRate) + ' <span class="' + (pl >= 0 ? 'pos' : 'neg') +
                '">' + fmtPL(pl) + ' (' + fmtPct(pct) + ')</span></span></li>';
            }).join('') + '</ul>';
        }
        return '';
      })() +
      (notes.length ? '<h4>Notes</h4><ul class="note-list">' +
        [...notes].reverse().map(n => '<li><span class="nd">' + n.date + '</span><span>' + esc(n.text) + '</span></li>').join('') + '</ul>' : '') +
      (links.length ? '<h4>Sources</h4>' + links.map(u =>
        '<div><a class="tlink" href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a></div>').join('') : '') +
    '</div>' +
    '<div style="flex: 1.5; display: flex; flex-direction: column;">' +
      '<div class="modal-chart" style="flex: 1; height: 100%; margin: 0;"><canvas id="modalChartCanvas"></canvas></div>' +
    '</div>';
  document.getElementById('modal').hidden = false;
  drawModalChart(e);
}

function getMacroScenario(title) {
  const t = title.toLowerCase();
  if (t.includes('cpi') || t.includes('inflation') || t.includes('pce')) {
    return `<strong>Inflation Data:</strong><br>
    <ul style="margin-top: 8px; padding-left: 20px;">
      <li style="margin-bottom: 6px;"><strong style="color:var(--red)">Higher than forecast:</strong> Hawkish for central banks. Bears will sell stocks, bond yields rise, USD strengthens.</li>
      <li><strong style="color:var(--green)">Lower than forecast:</strong> Dovish. Bulls will buy stocks, bond yields fall, USD weakens.</li>
    </ul>`;
  }
  if (t.includes('fed funds rate') || t.includes('fomc') || t.includes('interest rate') || t.includes('ecb')) {
    return `<strong>Central Bank Rates & Statements:</strong><br>
    <ul style="margin-top: 8px; padding-left: 20px;">
      <li style="margin-bottom: 6px;"><strong style="color:var(--red)">Hawkish (Rates Up / Higher for Longer):</strong> Typically bearish for risk assets like stocks; increases borrowing costs.</li>
      <li><strong style="color:var(--green)">Dovish (Rates Down / Cuts):</strong> Bullish for stocks, as money becomes cheaper and flows into equities.</li>
    </ul>`;
  }
  if (t.includes('employment') || t.includes('payrolls') || t.includes('nfp') || t.includes('jobless claims')) {
    return `<strong>Labor Market Data:</strong><br>
    <ul style="margin-top: 8px; padding-left: 20px;">
      <li style="margin-bottom: 6px;"><strong style="color:var(--orange)">Strong Jobs (Higher Payrolls/Lower Claims):</strong> Shows economic strength, but increases fear that the Fed will keep rates high to cool the economy.</li>
      <li><strong style="color:var(--blue)">Weak Jobs (Lower Payrolls/Higher Claims):</strong> Shows economic cooling, which makes the Fed more likely to cut rates (bullish for stocks), but too weak implies a recession (bearish).</li>
    </ul>`;
  }
  if (t.includes('gdp') || t.includes('retail sales') || t.includes('pmi')) {
    return `<strong>Economic Output & Consumer Spending:</strong><br>
    <ul style="margin-top: 8px; padding-left: 20px;">
      <li style="margin-bottom: 6px;"><strong style="color:var(--green)">Higher than forecast:</strong> Good for corporate earnings, generally bullish for stocks unless inflation fears override it.</li>
      <li><strong style="color:var(--red)">Lower than forecast:</strong> Signals economic slowdown or recession risk.</li>
    </ul>`;
  }
  return `<strong>General Macro Event:</strong><br>
  <ul style="margin-top: 8px; padding-left: 20px;">
    <li>This event drives market volatility. Deviations from the "Forecast" will cause sudden price swings in the respective currency and correlated equity markets.</li>
  </ul>`;
}

function getMacroContext(title, forecast, previous) {
  if (!forecast || !previous) return '';
  const t = title.toLowerCase();
  
  const fVal = parseFloat(forecast.replace(/[^0-9.-]/g, ''));
  const pVal = parseFloat(previous.replace(/[^0-9.-]/g, ''));
  if (isNaN(fVal) || isNaN(pVal)) return '';
  
  let trend = '';
  if (fVal > pVal) trend = 'higher than';
  else if (fVal < pVal) trend = 'lower than';
  else trend = 'in line with';
  
  let implication = 'a shift in the current economic trajectory';
  if (t.includes('cpi') || t.includes('inflation') || t.includes('pce')) {
    implication = trend === 'higher than' ? 'inflation is accelerating, which is bearish for risk assets' : 'inflation is cooling, which is bullish for risk assets';
  } else if (t.includes('fed funds rate') || t.includes('interest rate') || t.includes('ecb')) {
    implication = trend === 'higher than' ? 'rates are going up (hawkish)' : 'rates are being cut (dovish)';
  } else if (t.includes('employment') || t.includes('payrolls') || t.includes('nfp')) {
    implication = trend === 'higher than' ? 'a strengthening labor market' : 'a cooling labor market';
  } else if (t.includes('jobless claims')) {
    implication = trend === 'higher than' ? 'rising labor market weakness' : 'labor market resilience';
  } else if (t.includes('gdp') || t.includes('retail sales') || t.includes('pmi')) {
    implication = trend === 'higher than' ? 'economic expansion and consumer strength' : 'an economic slowdown';
  }
  
  return `<div style="margin-bottom: 24px; font-size: 14px; line-height: 1.5; color: var(--text); background: rgba(52,152,219,0.1); padding: 16px; border-radius: 8px; border-left: 4px solid var(--blue);">
    The market forecast of <strong>${esc(forecast)}</strong> is ${trend} the previous period's actual result of <strong>${esc(previous)}</strong>.<br><br>
    <strong>What this implies:</strong> This shift suggests ${implication}. If the actual result deviates from this forecast, expect immediate market volatility.
  </div>`;
}

function openMacroModal(title, impact, forecast, previous, country, date) {
  const scenarioHTML = getMacroScenario(title);
  const contextHTML = getMacroContext(title, forecast, previous);
  const safeTitle = esc(title);
  
  document.getElementById('macroModalBody').innerHTML = 
    '<div style="font-size: 14px; line-height: 1.5;">' +
      '<h2 style="margin-bottom: 8px; font-size: 20px;">' + safeTitle + '</h2>' +
      '<div class="modal-meta" style="margin-bottom: 24px; font-size: 14px;">' +
        '<span>' + esc(date) + '</span>' +
        '<span>' + esc(country) + '</span>' +
        '<span style="color: ' + (impact === 'High' ? 'var(--red)' : 'var(--orange)') + '; font-weight: bold;">' + esc(impact) + ' Impact</span>' +
        (forecast ? '<span>| Forecast: ' + esc(forecast) + '</span>' : '') +
        (previous ? '<span>| Previous: ' + esc(previous) + '</span>' : '') +
      '</div>' +
      contextHTML +
      '<div style="background: rgba(255,255,255,0.03); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">' +
        '<h3 style="margin-top: 0; color: var(--blue); font-size: 16px;">Scenarios & Market Impact</h3>' +
        scenarioHTML +
      '</div>' +
    '</div>';
  document.getElementById('macroModal').hidden = false;
}
window.openMacroModal = openMacroModal;

function drawModalChart(e) {
  if (modalChart) { modalChart.destroy(); modalChart = null; }
  let hist = [...(e.priceHistory || [])];
  if (e.firstAdvised) {
    hist = hist.filter(h => h.date >= e.firstAdvised);
  }
  if (e.priceAtAdvice != null && e.firstAdvised) {
    if (hist.length === 0 || hist[0].price !== e.priceAtAdvice || hist[0].date.indexOf(e.firstAdvised) !== 0) {
      hist.unshift({ date: e.firstAdvised + ' (Added)', price: e.priceAtAdvice });
    }
  }
  const canvas = document.getElementById('modalChartCanvas');
  if (!canvas || hist.length < 1) return;
  const t = today();
  const labels = hist.map(h => {
    if (!h.date) return '';
    if (h.date.length <= 10) return h.date;
    if (h.date.startsWith(t)) return h.date.slice(11, 16);
    return h.date.slice(5, 16);
  });
  const datasets = [{ label: 'Price', data: hist.map(h => h.price), 
    borderColor: '#3b82f6', borderWidth: 3, pointRadius: 3, tension: 0.4,
    fill: true, backgroundColor: 'rgba(59, 130, 246, 0.1)',
    pointBackgroundColor: '#3b82f6', pointBorderColor: '#fff', pointBorderWidth: 1 }];
  if (e.buyBelow != null) datasets.push({ label: 'Buy below', data: labels.map(() => e.buyBelow),
    borderColor: '#2ecc71', borderDash: [5, 5], borderWidth: 1, pointRadius: 0 });
  if (e.dropBelow != null) datasets.push({ label: 'Drop below', data: labels.map(() => e.dropBelow),
    borderColor: '#e74c3c', borderDash: [5, 5], borderWidth: 1, pointRadius: 0 });
  if (e.dropAbove != null) datasets.push({ label: 'Drop above', data: labels.map(() => e.dropAbove),
    borderColor: '#8b98a5', borderDash: [5, 5], borderWidth: 1, pointRadius: 0 });

  if (e.boughtAt && e.status === 'bought') {
    let maxPrice = e.boughtAt;
    hist.forEach(h => { if (h.price > maxPrice) maxPrice = h.price; });
    if (maxPrice >= e.boughtAt * 1.05) {
      const estTsl = maxPrice * 0.95;
      datasets.push({ label: 'Est. TSL', data: labels.map(() => estTsl),
        borderColor: '#f1c40f', borderDash: [2, 2], borderWidth: 1, pointRadius: 0 });
    }
  }
  const marker = (price, color, style, label) => {
    const idx = hist.findIndex(h => h.price === price);
    if (idx < 0) return null;
    const arr = labels.map(() => null); arr[idx] = price;
    return { label, data: arr, borderColor: color, backgroundColor: color,
      pointRadius: 7, pointStyle: style, showLine: false };
  };
  const bm = e.boughtAt ? marker(e.boughtAt, '#2ecc71', 'triangle', 'Bought') : null;
  const sm = e.soldAt ? marker(e.soldAt, '#f39c12', 'rect', 'Sold') : null;
  if (bm) datasets.push(bm);
  if (sm) datasets.push(sm);
  modalChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#e6edf3' } } },
      scales: {
        x: { ticks: { color: '#8b98a5' }, grid: { color: '#2a3441' } },
        y: { ticks: { color: '#8b98a5' }, grid: { color: '#2a3441' } }
      }
    }
  });
}

function closeModal() {
  document.getElementById('modal').hidden = true;
  document.getElementById('macroModal').hidden = true;
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}

document.getElementById('macroModal').addEventListener('click', e => {
  if (e.target.id === 'macroModal') document.getElementById('macroModal').hidden = true;
});

document.querySelectorAll('.tabs button').forEach(b => {
  b.addEventListener('click', () => {
    localStorage.setItem('activeTab', b.dataset.tab);
    document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(x => x.style.display = 'none');
    b.classList.add('active');
    document.getElementById('tab-' + b.dataset.tab).style.display = 'block';

    if (b.dataset.tab === 'macro' && document.getElementById('macroList').innerHTML === '') {
      fetchMacro();
    }
    if (b.dataset.tab === 'ipos' && document.getElementById('iposBody').innerHTML === '') {
      fetchIpos();
    }
    const searchable = b.dataset.tab === 'advice' || b.dataset.tab === 'archive' || b.dataset.tab === 'positions' || b.dataset.tab === 'portfolio';
    document.getElementById('search').disabled = !searchable;
    activeTab = b.dataset.tab;
    if (activeTab === 'advice') renderTable();
    else if (activeTab === 'archive') renderArchive();
    else if (activeTab === 'positions') renderPositions();
    else if (activeTab === 'portfolio') { if (!portfolioRendered) renderPortfolio(); else renderPortfolioTable(); }
    else if (activeTab === 'eod') renderEOD();
    else if (activeTab === 'news') renderAINews();
    else document.getElementById('searchCount').textContent = '';
    if (activeTab === 'analytics') { loadLearn().then(renderAnalytics); }
    if (activeTab === 'rawnews' && !window.rawNewsLoaded) {
      document.getElementById('refreshRawNewsBtn').click();
    }
  });
});

function renderAINews() {
  const summaryContainer = document.getElementById('newsSummary');
  if (DATA.newsSummaries && DATA.newsSummaries.length > 0) {
    let html = '';
    const summaries = [...DATA.newsSummaries].reverse();
    for (const s of summaries) {
      let contentStr = s.article || s.summary || '';
      let title = 'News Summary';
      const titleMatch = contentStr.match(/^###\s*(.*?)(\n|$)/);
      if (titleMatch) {
        title = esc(titleMatch[1]);
        contentStr = contentStr.replace(/^###\s*(.*?)(\n|$)/, '');
      }

      let content = esc(contentStr.trim()).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/###\s*(.*?)(\n|$)/g, '<h3>$1</h3>').replace(/\n/g, '<br>');
      content = content.replace(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/g, (match, ticker) => {
        const isAdvised = DATA.entries && DATA.entries.some(e => e.ticker === ticker);
        const isHolding = PORTFOLIO.holdings && PORTFOLIO.holdings.some(h => h.ticker === ticker);
        if (isAdvised || isHolding) {
          return tickerLink(ticker);
        }
        return match;
      });
      html += `
        <div class="ai-article">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            <h3 style="margin:0; font-size:16px;">${title}</h3>
            <span style="font-size:12px; color:var(--muted);">${esc(s.timestamp || s.date || '')}</span>
          </div>
          <div style="line-height: 1.6; font-size: 14px;" class="article-content">${content}</div>
        </div>
      `;
    }
    summaryContainer.innerHTML = html;
  } else {
    summaryContainer.innerHTML = '<div class="empty">No AI summaries found. Run /news in the terminal to generate one!</div>';
  }
}

document.getElementById('refreshRawNewsBtn').addEventListener('click', async () => {
  const btn = document.getElementById('refreshRawNewsBtn');
  const loading = document.getElementById('newsLoading');
  const content = document.getElementById('newsContent');
  btn.disabled = true;
  loading.style.display = 'block';
  content.innerHTML = '';
  
  try {
    const tickers = (DATA.entries || []).filter(e => e.status === 'watching' || e.status === 'bought').map(e => e.ticker).join(',');
    if (!tickers) throw new Error("No active tickers to fetch news for.");
    
    const res = await fetch('/api/news?tickers=' + encodeURIComponent(tickers));
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    
    const allNews = [];
    for (const [ticker, items] of Object.entries(data.news)) {
      if (!items || items.length === 0 || typeof items[0] === 'string') continue;
      for (const item of items) {
        const d = new Date(item.date);
        allNews.push({ ticker, item, dateObj: d });
      }
    }
    
    allNews.sort((a, b) => b.dateObj - a.dateObj);
    
    const twoDaysAgo = new Date();
    twoDaysAgo.setHours(twoDaysAgo.getHours() - 48);
    
    let html = '';
    for (const entry of allNews) {
      if (entry.dateObj < twoDaysAgo) continue;
      const { ticker, item } = entry;
      const dataEntry = DATA.entries.find(e => e.ticker === ticker);
      const isBought = dataEntry && dataEntry.status === 'bought';
      const statusClass = isBought ? 'bought' : 'watching';
      const badgeHTML = isBought 
        ? `<span class="badge" style="background: rgba(243, 156, 18, 0.1); color: var(--orange); border: 1px solid var(--orange); font-size: 10px; padding: 1px 6px;">eToro</span>`
        : `<span class="badge" style="background: rgba(46, 204, 113, 0.1); color: var(--green); border: 1px solid var(--green); font-size: 10px; padding: 1px 6px;">Advised</span>`;
      
      html += `<div class="news-card" data-status="${statusClass}">
        <div style="display:flex;justify-content:space-between;align-items:center; margin-bottom:8px;">
          <h3 style="margin:0; display:flex; align-items:center; gap:8px;">
            ${tickerLink(ticker)}
            ${badgeHTML}
          </h3>
          <span class="meta" style="margin:0">${esc(item.date)}</span>
        </div>
        <a href="${esc(item.link)}" target="_blank" style="font-weight: 600; display: block; margin-bottom: 6px;">${esc(item.title)}</a>
        <span class="meta">${esc(item.source)}</span>
      </div>`;
    }
    content.innerHTML = html || '<div class="empty">No news found in the last 48 hours for tracked tickers.</div>';
    
    // Apply current filter
    const activeBtn = document.querySelector('#rawNewsFilters button.active');
    if (activeBtn) activeBtn.click();
    
    window.rawNewsLoaded = true;
  } catch (err) {
    banner('Failed to load news: ' + err.message);
  } finally {
    btn.disabled = false;
    loading.style.display = 'none';
  }
});

async function fetchMacro() {
  const btn = document.getElementById('refreshMacroBtn');
  const loading = document.getElementById('macroLoading');
  const list = document.getElementById('macroList');
  const empty = document.getElementById('macroEmpty');
  
  btn.disabled = true;
  loading.style.display = 'block';
  list.innerHTML = '';
  empty.style.display = 'none';
  
  try {
    const res = await fetch('/api/macro');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    
    // Filter to High/Medium impact USD/EUR
    let filtered = (data.events || []).filter(e => 
      (e.country === 'USD' || e.country === 'EUR') && 
      (e.impact === 'High' || e.impact === 'Medium')
    );
    
    if (filtered.length === 0) {
      empty.textContent = "No (more) events this week";
      empty.style.display = 'block';
    } else {
      let html = '';
      for (const e of filtered) {
        let impactColor = e.impact === 'High' ? 'var(--red)' : 'var(--orange)';
        let displayDate = esc(e.date);
        let isPast = false;
        let isToday = false;
        // Format MM-DD-YYYY to DD MMM YYYY if possible
        const parts = displayDate.split('-');
        if (parts.length === 3) {
          const dateObj = new Date(parts[2], parts[0] - 1, parts[1]);
          if (!isNaN(dateObj)) {
            displayDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (dateObj < today) {
              isPast = true;
            } else if (dateObj.getTime() === today.getTime()) {
              isToday = true;
            }
          }
        }
        
        let rowStyle = isPast ? 'opacity: 0.5; cursor: pointer;' : 'cursor: pointer;';
        
        let displayTime = esc(e.time);
        if (isToday && e.time && e.time !== 'All Day' && e.time !== 'Tentative' && !isPast) {
          displayTime += ` <span class="macro-timer" data-time="${esc(e.time)}" style="color:var(--blue); font-size:11px; white-space:nowrap;"></span>`;
        }
        
        const jsDate = esc(displayDate).replace(/&#39;/g, "\\'");
        const jsTitle = esc(e.title).replace(/&#39;/g, "\\'");
        const jsImpact = esc(e.impact).replace(/&#39;/g, "\\'");
        const jsForecast = esc(e.forecast).replace(/&#39;/g, "\\'");
        const jsPrev = esc(e.previous).replace(/&#39;/g, "\\'");
        const jsCountry = esc(e.country).replace(/&#39;/g, "\\'");
        
        html += `<tr style="${rowStyle}" onclick="openMacroModal('${jsTitle}', '${jsImpact}', '${jsForecast}', '${jsPrev}', '${jsCountry}', '${jsDate}')">
          <td style="white-space: nowrap;">${displayDate}</td>
          <td>${displayTime}</td>
          <td style="font-weight:bold">${esc(e.country)}</td>
          <td style="color:${impactColor}">${esc(e.impact)}</td>
          <td>${esc(e.title)}</td>
          <td>${esc(e.forecast)}</td>
          <td>${esc(e.previous)}</td>
        </tr>`;
      }
      list.innerHTML = html;
      if (!html) {
        empty.textContent = "No (more) events this week";
        empty.style.display = 'block';
      }
    }
    window.macroLoaded = true;
  } catch (err) {
    document.getElementById('macroList').innerHTML = '<tr><td colspan="7" class="insufficient">Failed to fetch macro calendar.</td></tr>';
  } finally {
    document.getElementById('macroLoading').style.display = 'none';
    btn.disabled = false;
  }
}

async function fetchIpos() {
  document.getElementById('iposLoading').style.display = 'block';
  try {
    const res = await fetch('/api/ipos');
    const data = await res.json();
    
    let html = '';
    let hasNearIpo = false;
    const now = new Date();
    const tomorrow = new Date(); tomorrow.setDate(now.getDate() + 1);
    
    const isNotListed = (t) => DATA.entries.some(e => e.ticker === t && e.status === 'avoid' && e.reason && e.reason.includes('eToro'));

    if (data.upcoming && data.upcoming.length > 0) {
      html += '<tr><td colspan="6" style="background:var(--contrast);font-weight:bold;color:var(--text)">Upcoming IPOs</td></tr>';
      for (const row of data.upcoming) {
        const avoided = isNotListed(row.ticker);
        const status = avoided ? 'dropped' : 'listed';
        const likely = avoided ? '<span style="color:var(--red);font-weight:bold">Not Listed</span>' : (row.etoroLikely ? '<span style="color:var(--green);font-weight:bold">Yes</span>' : '<span style="color:var(--muted)">No</span>');
        const action = avoided ? '-' : `<button class="drop" onclick="markNotListed('${row.ticker}')">Drop</button>`;
        const tLink = avoided ? `<s style="color:var(--muted)">${row.ticker}</s>` : tickerLink(row.ticker);
        
        html += `<tr data-ipostatus="${status}" style="${avoided ? 'opacity:0.6' : ''}"><td>${row.date}</td><td class="sym">${tLink}</td><td>${row.name}</td><td>-</td><td>${likely}</td><td class="actions" style="text-align:center">${action}</td></tr>`;
        
        if (!avoided) {
          const d = new Date(row.date);
          if (d && !isNaN(d)) {
            if (d.toDateString() === now.toDateString() || d.toDateString() === tomorrow.toDateString()) {
              hasNearIpo = true;
            }
          }
        }
      }
    }

    if (data.recent && data.recent.length > 0) {
      html += '<tr><td colspan="6" style="background:var(--contrast);font-weight:bold;color:var(--text)">Recent IPOs (last 2 months)</td></tr>';
      for (const row of data.recent) {
        const avoided = isNotListed(row.ticker);
        const status = avoided ? 'dropped' : 'listed';
        const likely = avoided ? '<span style="color:var(--red);font-weight:bold">Not Listed</span>' : (row.etoroLikely ? '<span style="color:var(--green);font-weight:bold">Yes</span>' : '<span style="color:var(--muted)">No</span>');
        const action = avoided ? '-' : `<button class="drop" onclick="markNotListed('${row.ticker}')">Drop</button>`;
        const tLink = avoided ? `<s style="color:var(--muted)">${row.ticker}</s>` : tickerLink(row.ticker);
        
        html += `<tr data-ipostatus="${status}" style="${avoided ? 'opacity:0.6' : ''}"><td>${row.date}</td><td class="sym">${tLink}</td><td>${row.name}</td><td>${row.return || '-'}</td><td>${likely}</td><td class="actions" style="text-align:center">${action}</td></tr>`;
      }
    }

    document.getElementById('iposBody').innerHTML = html || '<tr><td colspan="6" class="empty">No IPOs found.</td></tr>';
    
    const tabBtn = document.querySelector('button[data-tab="ipos"]');
    if (hasNearIpo) {
      tabBtn.innerHTML = 'IPO Tracker <span class="blink" style="color:var(--green);font-weight:bold;margin-left:4px">●</span>';
    } else {
      tabBtn.innerHTML = 'IPO Tracker';
    }
    
    // apply current filter
    const activeFilter = document.querySelector('#ipoFilters button.active')?.dataset.ipofilter || 'listed';
    document.querySelectorAll('#iposBody tr').forEach(tr => {
      if (tr.children.length === 1) return;
      const st = tr.getAttribute('data-ipostatus');
      let show = true;
      if (activeFilter === 'listed') show = (st !== 'dropped');
      if (activeFilter === 'dropped') show = (st === 'dropped');
      tr.style.display = show ? '' : 'none';
    });

  } catch (err) {
    document.getElementById('iposBody').innerHTML = '<tr><td colspan="6" class="empty" style="color:var(--red)">Failed to fetch IPOs.</td></tr>';
  } finally {
    document.getElementById('iposLoading').style.display = 'none';
  }
}

window.markNotListed = async function(ticker) {
  if (confirm(`Mark ${ticker} as permanently NOT listed on eToro?`)) {
    const existing = DATA.entries.find(e => e.ticker === ticker);
    if (existing) {
      existing.status = 'avoid';
      existing.reason = 'Not listed on eToro';
    } else {
      DATA.entries.push({
        id: crypto.randomUUID(),
        ticker: ticker,
        status: 'avoid',
        reason: 'Not listed on eToro',
        source: 'manual',
        firstAdvised: today(),
        priceAtAdvice: 0,
        priceHistory: []
      });
    }
    await save();
    fetchIpos(); // Re-render IPO tables
    renderAll(); // Re-render other tabs if needed
  }
};

document.getElementById('refreshIposBtn').addEventListener('click', fetchIpos);
document.getElementById('refreshMacroBtn').addEventListener('click', fetchMacro);

function renderEOD() {
  const eodList = document.getElementById('eodList');
  const empty = document.getElementById('eodEmpty');
  const reports = [...(DATA.eodReports || [])].reverse();
  if (reports.length === 0) {
    eodList.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    eodList.innerHTML = reports.map(r => {
      let htmlContent = esc(r.summary).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/###\s*(.*?)(\n|$)/g, '<h3>$1</h3>').replace(/\n/g, '<br>');
      let linkedSummary = htmlContent.replace(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/g, (match, ticker) => {
        const isAdvised = DATA.entries && DATA.entries.some(e => e.ticker === ticker);
        const isHolding = PORTFOLIO.holdings && PORTFOLIO.holdings.some(h => h.ticker === ticker);
        if (isAdvised || isHolding) {
          return tickerLink(ticker);
        }
        return match;
      });
      return '<div class="eod-card">' +
        '<div style="color: var(--muted); font-size: 12px; margin-bottom: 8px;">' + esc(r.date) + '</div>' +
        '<div style="line-height: 1.5; font-size: 14px; color: var(--text);">' + linkedSummary + '</div>' +
      '</div>';
    }).join('');
  }
}

function headerSortHandler(tableId, stateKey, render) {
  document.querySelector('#' + tableId + ' thead').addEventListener('click', (ev) => {
    const th = ev.target.closest('th[data-key]');
    if (!th) return;
    const state = sortState[stateKey];
    if (state.key === th.dataset.key) state.dir = -state.dir;
    else { state.key = th.dataset.key; state.dir = -1; }
    render();
  });
}
headerSortHandler('adviceTable', 'advice', renderTable);
headerSortHandler('archiveTable', 'archive', renderArchive);
headerSortHandler('positionsTable', 'positions', renderPositions);
headerSortHandler('portfolioTable', 'portfolio', renderPortfolioTable);

const adviceClickHandler = (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) {
    // ticker link goes to eToro; anything else on the row opens the drill-down
    if (ev.target.closest('a')) return;
    const row = ev.target.closest('tr[data-id]');
    if (row) openModal(row.dataset.id);
    return;
  }
  if (btn.dataset.act === 'drop') {
    const entry = DATA.entries.find(e => e.id === btn.dataset.id);
    applyChange(() => { entry.status = 'dropped'; entry.droppedDate = today(); });
  } else if (btn.dataset.act === 'rewatch') {
    const entry = DATA.entries.find(e => e.id === btn.dataset.id);
    applyChange(() => { entry.status = 'watching'; delete entry.droppedDate; });
  } else if (btn.dataset.act === 'remove') {
    if (confirm('Are you sure you want to completely remove ' + btn.dataset.id + ' from the log?')) {
      applyChange(() => { DATA.entries = DATA.entries.filter(e => e.id !== btn.dataset.id); });
    }
  }
};
document.querySelector('#adviceTable tbody').addEventListener('click', adviceClickHandler);
document.querySelector('#archiveTable tbody').addEventListener('click', adviceClickHandler);

document.getElementById('filters').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#filters button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderTable();
});

document.getElementById('posFilters').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#posFilters button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  posFilter = btn.dataset.posfilter;
  renderPositions();
});

document.getElementById('rawNewsFilters').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#rawNewsFilters button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filter = btn.dataset.newsfilter;
  document.querySelectorAll('.news-card').forEach(card => {
    if (filter === 'all') card.style.display = 'block';
    else if (filter === 'advised' && card.dataset.status === 'watching') card.style.display = 'block';
    else if (filter === 'etoro' && card.dataset.status === 'bought') card.style.display = 'block';
    else card.style.display = 'none';
  });
});

document.getElementById('ipoFilters').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#ipoFilters button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filter = btn.dataset.ipofilter;
  document.querySelectorAll('#iposBody tr').forEach(tr => {
    if (tr.children.length === 1) return; // header row
    const st = tr.getAttribute('data-ipostatus');
    let show = true;
    if (filter === 'listed') show = (st !== 'dropped');
    if (filter === 'dropped') show = (st === 'dropped');
    tr.style.display = show ? '' : 'none';
  });
});

document.querySelector('#positionsTable tbody').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) {
    if (ev.target.closest('input, a')) return;
    const row = ev.target.closest('tr[data-id]');
    if (row) openModal(row.dataset.id);
    return;
  }
  const cell = btn.closest('td');
  if (btn.dataset.confirm) {  // open an exit-price editor for that lot, pre-filled with the estimate
    const found = findLot(btn.dataset.confirm);
    if (!found) return;
    const suggested = (found.lot.soldAt ?? found.lot.lastPrice ?? found.lot.openRate).toFixed(2);
    cell.innerHTML =
      '<input type="number" step="0.01" min="0" value="' + suggested + '" aria-label="exit price"> ' +
      '<button class="ok" data-act="confirm-exit" data-pid="' + found.lot.positionID + '">OK</button>' +
      '<button class="cancel" data-act="cancel-exit">X</button>';
    cell.querySelector('input').focus();
    return;
  }
  if (btn.dataset.act === 'cancel-exit') { renderPositions(); return; }
  if (btn.dataset.act === 'confirm-exit') {
    const price = parseFloat(cell.querySelector('input').value);
    if (!(price > 0)) return;
    const found = findLot(btn.dataset.pid);
    if (!found) return;
    applyChange(() => { found.lot.soldAt = price; delete found.lot.exitEstimated; });
  }
});

document.getElementById('syncBtn').addEventListener('click', async () => {
  const btn = document.getElementById('syncBtn');
  const sel = document.getElementById('locationSelect');
  const location = sel.style.display !== 'none' ? sel.value : "";
  const label = btn.textContent;
  btn.textContent = 'Syncing...';
  document.body.classList.add('syncing');
  try {
    const pRef = fetch('/api/refresh', { method: 'POST' }).then(r => r.json().catch(() => ({})));
    const pImp = fetch('/api/import', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location })
    }).then(r => r.json().catch(() => ({})));

    const [resRef, resImp] = await Promise.all([pRef, pImp]);
    
    let msgs = [];
    if (resRef.demo || resImp.demo) {
      banner('Simulated sync (Demo Mode)', 'success');
    } else {
      if (resRef.ok) msgs.push('Quotes updated (' + (resRef.refreshed || 0) + ')');
      if (resImp.ok) msgs.push('eToro synced');
      
      if (msgs.length) {
        banner(msgs.join(' & ') + '!', 'success');
      } else {
        banner('Sync failed: Check serve.py logs for details.');
      }
    }
    await load();
  } catch (err) {
    banner('Sync failed (' + err.message + '). Is serve.py still running?');
  } finally {
    btn.textContent = label;
    document.body.classList.remove('syncing');
  }
});

document.getElementById('search').addEventListener('input', (ev) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = ev.target.value.trim().toLowerCase();
    if (activeTab === 'advice') renderTable();
    else if (activeTab === 'positions') renderPositions();
    else if (activeTab === 'portfolio') renderPortfolioTable();
  }, 180);
});

const modalEl = document.getElementById('modal');
modalEl.addEventListener('click', (ev) => {
  if (ev.target === modalEl || ev.target.closest('.modal-close')) closeModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !modalEl.hidden) closeModal();
});

function updateTimer() {
  const nyDate = new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"}));
  const day = nyDate.getDay();
  const yyyy = nyDate.getFullYear();
  const mm = String(nyDate.getMonth() + 1).padStart(2, '0');
  const dd = String(nyDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  const holidays = [
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"
  ];
  
  let st = { status: "CLOSED", text: "MARKET CLOSED", color: "var(--muted)", blink: false };
  
  if (day === 0 || day === 6 || holidays.includes(dateStr)) {
    // Closed
  } else {
    const hours = nyDate.getHours();
    const minutes = nyDate.getMinutes();
    const seconds = nyDate.getSeconds();
    const currentTotalMins = hours * 60 + minutes;
    
    const formatLeft = (targetMins) => {
      let diff = targetMins - currentTotalMins;
      let secDiff = 60 - seconds;
      if (secDiff === 60) { secDiff = 0; } else { diff -= 1; }
      let h = Math.floor(diff / 60);
      let m = diff % 60;
      let s = secDiff.toString().padStart(2, '0');
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m ${s}s`;
    };
    
    if (currentTotalMins < 240) {
      st = { status: "CLOSED", text: "PREMARKET IN " + formatLeft(240), color: "var(--muted)", blink: false };
    } else if (currentTotalMins < 570) {
      st = { status: "PREMARKET", text: "MARKET OPENS IN " + formatLeft(570), color: "var(--blue)", blink: false };
    } else if (currentTotalMins < 960) {
      const minsLeft = 960 - currentTotalMins - (seconds > 0 ? 1 : 0);
      let color = "var(--green)";
      let blink = false;
      if (minsLeft < 30) {
        color = "var(--orange)";
        blink = true;
      }
      st = { status: "OPEN", text: "MARKET CLOSES IN " + formatLeft(960), color: color, blink: blink };
    } else if (currentTotalMins < 1200) {
      st = { status: "AFTERHOURS", text: "AFTER-HOURS CLOSES IN " + formatLeft(1200), color: "var(--orange)", blink: false };
    }
  }
  
  const el = document.getElementById('marketTimer');
  if (!el) return;
  el.textContent = st.text;
  el.style.color = st.color;
  el.style.fontWeight = '600';
  el.style.fontSize = '14px';
  el.style.padding = '6px 12px';
  el.style.border = '1px solid ' + st.color;
  el.style.borderRadius = '6px';
  el.style.animation = st.blink ? 'blink 1.5s ease-in-out infinite' : 'none';
  
  updateMacroTimers(nyDate);
}

function updateMacroTimers(nyDate) {
  document.querySelectorAll('.macro-timer').forEach(el => {
    const timeStr = el.dataset.time;
    if (!timeStr) return;
    
    const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
    if (!match) return;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = match[3].toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    
    const eventTime = new Date(nyDate);
    eventTime.setHours(h, m, 0, 0);
    
    const diffMs = eventTime - nyDate;
    if (diffMs < 0) {
      el.textContent = " (Passed)";
      el.style.color = "var(--muted)";
    } else {
      const diffS = Math.floor(diffMs / 1000);
      const hrs = Math.floor(diffS / 3600);
      const mins = Math.floor((diffS % 3600) / 60);
      const secs = String(diffS % 60).padStart(2, '0');
      if (hrs > 0) {
        el.textContent = ` (in ${hrs}h ${mins}m)`;
      } else {
        el.textContent = ` (in ${mins}m ${secs}s)`;
        el.style.color = "var(--orange)";
      }
    }
  });
}

load();