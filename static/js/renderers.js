// @ts-check
import { DATA, PORTFOLIO, currentFilter, posFilter, activeTab, portfolioViewMode, LEARN, analyticsCharts, canSave, SECTORS, SECTOR_COLORS, sortState, setSectorChart, setSectorCoverageChart, sectorChart, sectorCoverageChart, setPortfolioRendered, Chart, marked, searchQuery } from './state.js';
import { advised, latestPrice, changePct, fmtPct, esc, tickerLink, fmtPrice, fmtMoney, fmtPL, matchesSearch, sortRows, cssVar, localDate, localDateTime, advisedFor } from './utils.js';
import { markSortedHeader, setSearchCount } from './ui.js';

export function renderAll() {
  const entries = advised();
  /** @type {HTMLElement} */ (document.getElementById('lastUpdated')).textContent =
    'Last updated: ' + localDateTime(DATA.lastUpdated) + ' · ' + entries.length + ' advised picks · ' +
    PORTFOLIO.holdings.length + ' holdings';
  /** @type {HTMLElement} */ (document.getElementById('cTracked')).textContent = String(entries.length);
  /** @type {HTMLElement} */ (document.getElementById('cOpen')).textContent = String(entries.filter(e => e.status === 'bought').length);
  /** @type {HTMLElement} */ (document.getElementById('cClosed')).textContent = String(entries.filter(e => e.status === 'sold').length);
  /** @type {HTMLElement} */ (document.getElementById('cWatching')).textContent = String(entries.filter(e => e.status === 'watching').length);
  /** @type {HTMLElement} */ (document.getElementById('cIgnored')).textContent = String(entries.filter(e => ['dropped', 'avoid', 'blacklisted', 'removed'].includes(e.status)).length);
  renderTable();
  renderPositions();
  if (activeTab === 'portfolio') renderPortfolio();
  if (activeTab === 'analytics' && LEARN) renderAnalytics();
}

export function adviceRows() {
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

export function tippingFlags(r) {
  const p = latestPrice(r.e);
  const dropHit = r.dropBelow != null && p <= r.dropBelow && (r.status === 'watching' || r.status === 'bought');
  const buyHit = !dropHit && r.status === 'watching' && r.buyBelow != null && p <= r.buyBelow;
  // missed: a watching pick whose price ran above the entry band, the oversold bounce already happened
  const missedHit = r.status === 'watching' && r.dropAbove != null && p >= r.dropAbove;
  return { dropHit, buyHit, missedHit };
}

export function sparkline(canvas, e) {
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
        borderColor: up ? cssVar('--green') : cssVar('--red'),
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

export function actionButtons(e) {
  // positions come from the eToro import now; the watchlist only needs Drop
  if (!canSave) return '';
  if (e.status === 'watching') {
    return '<button class="drop" data-act="drop" data-id="' + e.id + '">Drop</button>' +
           '<button class="drop" data-act="blacklist" data-id="' + e.id + '">Blacklist</button>';
  }
  if (e.status === 'dropped' || e.status === 'blacklisted') {
    return '<button class="buy" data-act="rewatch" data-id="' + e.id + '">Re-watch</button>' +
           '<button class="drop" data-act="remove" data-id="' + e.id + '">Remove</button>';
  }
  return '';
}

export function sectorPctMap() {
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
export function sectorFlag(secPct, sector) {
  if (!secPct || !sector || sector === 'ETF / Other') return '';
  const p = secPct[sector];
  if (p === 0) return 'gap';
  if (p < 5) return 'under';
  return '';
}

export function renderTable() {
  const tbody = /** @type {HTMLElement} */ (document.querySelector('#adviceTable tbody'));
  tbody.innerHTML = '';
  const secPct = sectorPctMap();
  const rows = sortRows(
    adviceRows().filter(r => {
      if (currentFilter === 'dropped') {
        if (r.status !== 'dropped') return false;
      } else if (currentFilter === 'blacklisted') {
        if (r.status !== 'blacklisted') return false;
      } else {
        if (r.status !== 'watching') return false;
        if (r.e.lots && r.e.lots.length) return false;
      }
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
  markSortedHeader(/** @type {HTMLElement} */ (document.getElementById('adviceTable')), sortState.advice);
  const emptyMsgEl = /** @type {HTMLElement} */ (document.getElementById('emptyMsg'));
  
  let msg = 'No watched picks yet. Run /advice, /premarket or /import in the AI CLI to fill this in.';
  if (currentFilter === 'dropped') msg = 'No dropped picks yet.';
  else if (currentFilter === 'blacklisted') msg = 'No blacklisted picks yet.';
  else if (currentFilter === 'buyzone') msg = 'No watched picks currently in the buy zone.';
  else if (currentFilter === 'drophit') msg = 'No watched picks have hit their drop alert level.';
  else if (currentFilter === 'missed') msg = 'No watched picks have hit their drop above level (missed).';
  else if (currentFilter === 'gap') msg = 'No watched picks in sectors you have a gap in.';
  else if (currentFilter === 'under') msg = 'No watched picks in underweight sectors.';
  
  if (searchQuery && rows.length === 0) {
    msg = `No results with your current filter ('${esc(searchQuery)}'). <a href="#" onclick="document.getElementById('search').value=''; document.getElementById('search').dispatchEvent(new Event('input')); return false;">Clear filter</a>`;
  }
  
  emptyMsgEl.innerHTML = msg;
  emptyMsgEl.style.display = rows.length ? 'none' : 'block';
  /** @type {HTMLElement} */ (document.getElementById('adviceTable')).style.display = rows.length ? '' : 'none';
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
      '<td>' + (r.rsi != null ? Math.round(r.rsi) : '-') + '</td>' +
      '<td' + (sf ? ' class="sec-' + sf + '"' : '') + '>' + (r.sector || '-') + '</td>' +
      '<td>' + fmtPrice(r.buyBelow) + '</td>' +
      '<td>' + fmtPrice(r.dropBelow) + '</td>' +
      '<td class="' + (e.status === 'watching' && e.dropAbove && latestPrice(e) >= e.dropAbove ? 'sec-gap' : '') + '">' + fmtPrice(e.dropAbove) + '</td>' +
      '<td class="spark-col"><div style="width:70px; height:30px;"><canvas class="spark"></canvas></div></td>' +
      '<td><span class="badge ' + r.status + '" title="' + esc(r.status) + '">' + (r.status === 'blacklisted' && e['blacklistReason'] ? esc(e['blacklistReason']) : r.status) + '</span></td>' +
      '<td class="actions">' + actionButtons(e) + '</td>';
    tbody.appendChild(tr);
    sparkline(tr.querySelector('canvas'), e);
  });
}

export function findLot(positionID) {
  for (const e of DATA.entries) {
    for (const lot of (e.lots || [])) {
      if (String(lot.positionID) === String(positionID)) return { e, lot };
    }
  }
  return null;
}

export function positionLotRows() {
  const rows = [];
  advised().forEach(e => (e.lots || []).forEach(lot => {
    const closed = lot.soldAt != null;
    const exit = closed ? lot.soldAt : lot.lastPrice;
    const open = lot.openRate;
    const adv = advisedFor(e, lot);
    rows.push({
      e, positionID: lot.positionID,
      firstAdvised: adv.date,
      openDate: lot.openDateTime || lot.openDate,
      openDateTime: lot.openDateTime,
      closedDate: lot.closedDate,
      ticker: e.ticker,
      rating: e.rating,
      priceAtAdvice: adv.price != null ? adv.price : e.priceAtAdvice,
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

export function renderPositions() {
  const all = positionLotRows();
  const closed = all.filter(r => r.status === 'sold');
  const openRows = all.filter(r => r.status === 'bought');
  const needsConfirm = all.filter(r => r.exitEstimated).length;
  /** @type {HTMLElement} */ (document.querySelector('button[data-tab="positions"]')).innerHTML = 'Positions' + (needsConfirm ? ' <span style="color:var(--orange);font-weight:bold;margin-left:4px">🔴 ' + needsConfirm + '</span>' : '');
  const wins = closed.filter(r => r.exitOrNow > r.boughtAt).length;
  const realizedTotal = closed.reduce((s, r) => s + r.plDollar, 0);
  const realizedInv = closed.reduce((s, r) => s + (r.boughtAt * r.units), 0);
  const realizedPct = realizedInv ? (realizedTotal / realizedInv * 100) : 0;
  
  const openTotal = openRows.reduce((s, r) => s + r.plDollar, 0);
  const openInv = openRows.reduce((s, r) => s + (r.boughtAt * r.units), 0);
  const openPct = openInv ? (openTotal / openInv * 100) : 0;
  
  /** @type {HTMLElement} */ (document.getElementById('pWinRate')).textContent = closed.length ? Math.round(100 * wins / closed.length) + '%' : '-';
  const pRealized = /** @type {HTMLElement} */ (document.getElementById('pRealized'));
  const pOpen = /** @type {HTMLElement} */ (document.getElementById('pOpen'));
  const pTotal = /** @type {HTMLElement} */ (document.getElementById('pTotal'));
  
  pRealized.innerHTML = closed.length ? fmtPL(realizedTotal) + ' <span style="font-size:13px;opacity:0.8;margin-left:4px">(' + (realizedPct > 0 ? '+' : '') + realizedPct.toFixed(2) + '%)</span>' : '-';
  pRealized.className = 'value ' + (closed.length && realizedTotal < 0 ? 'neg' : closed.length ? 'pos' : '');
  
  pOpen.innerHTML = openRows.length ? fmtPL(openTotal) + ' <span style="font-size:13px;opacity:0.8;margin-left:4px">(' + (openPct > 0 ? '+' : '') + openPct.toFixed(2) + '%)</span>' : '-';
  pOpen.className = 'value ' + (openRows.length && openTotal < 0 ? 'neg' : openRows.length ? 'pos' : '');

  const totalSum = realizedTotal + openTotal;
  const totalInv = realizedInv + openInv;
  const totalPct = totalInv ? (totalSum / totalInv * 100) : 0;
  const hasPositions = closed.length || openRows.length;

  pTotal.innerHTML = hasPositions ? fmtPL(totalSum) + ' <span style="font-size:13px;opacity:0.8;margin-left:4px">(' + (totalPct > 0 ? '+' : '') + totalPct.toFixed(2) + '%)</span>' : '-';
  pTotal.className = 'value ' + (hasPositions && totalSum < 0 ? 'neg' : hasPositions ? 'pos' : '');

  const activeSortState = sortState['positions_' + posFilter] || { key: 'firstAdvised', dir: -1 };
  const rows = sortRows(all.filter(r => {
    if (!matchesSearch([r.ticker, r.e.name, r.e.reason, r.e.sector])) return false;
    if (posFilter === 'open') return r.status === 'bought';
    if (posFilter === 'closed') return r.status === 'sold';
    if (posFilter === 'needsconfirm') return r.exitEstimated;
    return true;
  }), activeSortState);
  if (activeTab === 'positions') setSearchCount(rows.length);
  markSortedHeader(/** @type {HTMLElement} */ (document.getElementById('positionsTable')), activeSortState);
  const emptyMsgEl = /** @type {HTMLElement} */ (document.getElementById('positionsEmpty'));
  let msg = 'No open positions linked to advice yet.';
  if (posFilter === 'closed') msg = 'No closed positions yet.';
  else if (posFilter === 'needsconfirm') msg = 'No positions needing exit confirmation.';
  
  if (searchQuery && rows.length === 0) {
    msg = `No results with your current filter ('${esc(searchQuery)}'). <a href="#" onclick="document.getElementById('search').value=''; document.getElementById('search').dispatchEvent(new Event('input')); return false;">Clear filter</a>`;
  }
  
  emptyMsgEl.innerHTML = msg;
  emptyMsgEl.style.display = rows.length ? 'none' : 'block';
  /** @type {HTMLElement} */ (document.getElementById('positionsTable')).style.display = rows.length ? '' : 'none';
  const tbody = /** @type {HTMLElement} */ (document.querySelector('#positionsTable tbody'));
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.id = r.e.id;
    tr.dataset.pos = String(r.positionID);
    const estBadge = r.exitEstimated ? '<span class="badge est">est</span>' : '';
    const tslBadge = (r.status === 'bought' && r.plPct >= 5 && !r.tslEnabled) ? '<span class="badge" style="background:rgba(231,76,60,0.15);color:var(--red);margin-left:4px;" title="Set a trailing stop loss on eToro!">⚠️ NO TSL</span>' : '';
    const confirmBtn = r.exitEstimated && canSave
      ? '<button class="sell" data-confirm="' + r.positionID + '">Confirm exit</button>' : '';
    tr.innerHTML =
      '<td>' + (r.firstAdvised || '-') + '</td>' +
      '<td>' + (r.openDateTime ? localDate(r.openDateTime) : (r.openDate || '-')) + '</td>' +
      '<td>' + (r.status === 'sold' && r.closedDate ? r.closedDate : '-') + '</td>' +
      '<td title="' + esc(r.e.reason || '') + '">' + tickerLink(r.ticker) +
        (r.e.name ? '<span class="sub">' + esc(r.e.name) + '</span>' : '') + '</td>' +
      '<td>' + (r.e.rating || '-') + '</td>' +
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
  
  renderEquityChart('7d');
}

export function renderPortfolio() {
  renderSectorCoverage();
  renderSectorChart();
  renderPortfolioTable();
  setPortfolioRendered(true);
}

export function renderPortfolioTable() {
  const table = /** @type {HTMLElement} */ (document.getElementById('portfolioTable'));
  const emptyMsgEl = /** @type {HTMLElement} */ (document.getElementById('portfolioEmpty'));

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
            invested: lot.invested || (lot.units * lot.openRate),
            avgOpen: lot.openRate,
            currentPrice: h.currentPrice,
            plDollar: lot.units * (h.currentPrice - lot.openRate),
            plPct: (lot.invested || (lot.units * lot.openRate)) > 0 ? (lot.units * (h.currentPrice - lot.openRate)) / (lot.invested || (lot.units * lot.openRate)) * 100 : 0,
            firstOpen: lot.openDate,
            positions: 1
          });
        });
      }
    });
    holdings = splitHoldings;
  }
  
  const empty = !holdings.length;
  let msg = 'No portfolio snapshot yet. Click "Update from eToro" or run /import in the AI CLI.';
  if (searchQuery && holdings.length === 0) {
    msg = `No results with your current filter ('${esc(searchQuery)}'). <a href="#" onclick="document.getElementById('search').value=''; document.getElementById('search').dispatchEvent(new Event('input')); return false;">Clear filter</a>`;
  }
  
  emptyMsgEl.innerHTML = msg;
  emptyMsgEl.style.display = empty ? 'block' : 'none';
  /** @type {HTMLElement} */ (document.getElementById('portfolioTable')).style.display = empty ? 'none' : '';
  if (activeTab === 'portfolio') setSearchCount(holdings.length);
  const tbody = /** @type {HTMLElement} */ (document.querySelector('#portfolioTable tbody'));
  tbody.innerHTML = '';
  markSortedHeader(/** @type {HTMLElement} */ (document.getElementById('portfolioTable')), sortState.portfolio);
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

function renderSectorChart() {
  if (sectorChart) { sectorChart.destroy(); setSectorChart(null); }
  const bySector = new Map();
  PORTFOLIO.holdings.forEach(h => {
    const s = h.sector || 'ETF / Other';
    bySector.set(s, (bySector.get(s) || 0) + h.invested);
  });
  const sorted = [...bySector.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, v]) => sum + v, 0);
  const list = /** @type {HTMLElement} */ (document.getElementById('sectorList'));
  list.innerHTML = sorted.map(([s, v]) =>
    '<li><span class="dot" style="background:' + (SECTOR_COLORS[s] || '#7f8c8d') + '"></span>' + s +
    '<span class="amt">' + fmtMoney(v) + ' · ' + (100 * v / total).toFixed(1) + '%</span></li>').join('');
  if (!sorted.length) return;
  setSectorChart(new Chart(/** @type {HTMLElement} */ (document.getElementById('sectorChart')), {
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
  }));
}

export function renderSectorCoverage() {
  if (sectorCoverageChart) { sectorCoverageChart.destroy(); setSectorCoverageChart(null); }
  const invested = {};
  const total = PORTFOLIO.holdings.reduce((s, h) => s + (h.invested || 0), 0);
  PORTFOLIO.holdings.forEach(h => {
    const s = h.sector || 'ETF / Other';
    invested[s] = (invested[s] || 0) + (h.invested || 0);
  });
  const adviceCount = {};
  advised().forEach(e => { if (e.sector) adviceCount[e.sector] = (adviceCount[e.sector] || 0) + 1; });
  const pct = (s) => total ? (invested[s] || 0) / total * 100 : 0;
  /** @type {HTMLElement} */ (document.getElementById('sectorGaps')).innerHTML = SECTORS.map(s => {
    const p = pct(s), ac = adviceCount[s] || 0;
    let tag = '';
    if (s !== 'ETF / Other' && p === 0) tag = ' <span class="tag gap">gap</span>';
    else if (s !== 'ETF / Other' && p < 5) tag = ' <span class="tag under">under</span>';
    return '<li><span class="dot" style="background:' + (SECTOR_COLORS[s] || '#7f8c8d') + '"></span>' +
      s + tag + '<span class="gp">' + p.toFixed(1) + '% · ' + ac + ' advice</span></li>';
  }).join('');
  if (!PORTFOLIO.holdings.length) return;
  setSectorCoverageChart(new Chart(/** @type {HTMLElement} */ (document.getElementById('sectorCoverageChart')), {
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
        x: { min: 0, ticks: { color: cssVar('--muted'), callback: (v) => v + '%' }, grid: { color: cssVar('--border') } },
        y: { ticks: { color: cssVar('--text') }, grid: { display: false } }
      }
    }
  }));
}

let analyticsRendered = false;

export function renderAnalytics() {
  analyticsRendered = true;
  renderEquityChart('24h');
  const empty = /** @type {HTMLElement} */ (document.getElementById('analyticsEmpty'));
  if (!LEARN) {
    /** @type {HTMLElement} */ (document.getElementById('analyticsCards')).innerHTML = '';
    /** @type {HTMLElement} */ (document.getElementById('sevenDayBox')).innerHTML = '';
    ['chartRating', 'chartRsiBand', 'chartSector', 'chartSource'].forEach(id => renderBucketChart(id, {}));
    ['chartGainVsDays', 'chartDayOfWeek', 'chartWinRateTrend', 'chartEntryDiscipline', 'chartDaysVsRsi'].forEach(id => {
      if (analyticsCharts[id]) { analyticsCharts[id].destroy(); delete analyticsCharts[id]; }
    });
    empty.textContent = canSave ? 'No stats available yet. Run /review to generate outcomes.'
      : 'Analytics needs the server. Start it with: python3 yarafolio.py';
    empty.style.display = 'block';
    return;
  }
  /** @type {HTMLElement} */ (document.getElementById('analyticsCards')).innerHTML = [
    ['Advised entries', LEARN.advisedEntries], ['Measurable outcomes', LEARN.measurableOutcomes],
    ['Watching now', LEARN.watchingNow],
  ].map(([l, v]) => '<div class="card"><div class="label">' + l + '</div><div class="value">' + (v ?? 0) + '</div></div>').join('');
  const sd = LEARN.sevenDayAfterAdvice || { n: 0 };
  /** @type {HTMLElement} */ (document.getElementById('sevenDayBox')).innerHTML = sd.n
    ? '<span class="' + (sd.avg >= 0 ? 'pos' : 'neg') + '">avg ' + fmtPct(sd.avg) + '</span> · median <span class="' +
      (sd.median >= 0 ? 'pos' : 'neg') + '">' + fmtPct(sd.median) + '</span> (n=' + sd.n + ')'
    : '<div class="insufficient">No 7-day windows yet.</div>';
  const b = LEARN.buckets || {};
  renderBucketChart('chartRating', b.rating);
  renderBucketChart('chartRsiBand', b.rsiBand);
  renderBucketChart('chartSector', b.sector);
  renderBucketChart('chartSource', b.source);
  
  const soldLots = positionLotRows().filter(r => r.status === 'sold');
  renderGainVsDaysChart('chartGainVsDays', soldLots);
  renderDayOfWeekChart('chartDayOfWeek', soldLots);
  renderWinRateTrendChart('chartWinRateTrend', soldLots);
  renderEntryDisciplineChart('chartEntryDiscipline', soldLots);
  renderDaysVsRsiChart('chartDaysVsRsi', soldLots);
  empty.textContent = 'Not enough finished advice yet to learn from. Outcomes appear once picks are sold, dropped, or 7+ days old.';
  empty.style.display = LEARN.measurableOutcomes ? 'none' : 'block';
}

export function renderBucketChart(canvasId, buckets) {
  if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
  buckets = buckets || {};
  const note = document.getElementById(canvasId + 'Note');
  const canvas = document.getElementById(canvasId);
  let keys = Object.keys(buckets);
  if (canvasId === 'chartRating') {
    const order = { 'A+': 1, 'A': 2, 'A-': 3, 'B+': 4, 'B': 5, 'B-': 6, 'C+': 7, 'C': 8, 'C-': 9 };
    keys.sort((a, b) => (order[a] || 99) - (order[b] || 99));
  }
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
        y: { position: 'left', min: 0, max: 100, title: { display: true, text: 'Win %', color: cssVar('--muted') },
             ticks: { color: cssVar('--muted') }, grid: { color: cssVar('--border'), drawBorder: false } },
        y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'Avg %', color: cssVar('--muted') },
              ticks: { color: cssVar('--muted') } },
        x: { ticks: { color: cssVar('--muted') }, grid: { display: false, drawBorder: false } }
      },
      plugins: {
        legend: { labels: { color: cssVar('--text'), usePointStyle: true, boxWidth: 10 } },
        tooltip: {
          backgroundColor: cssVar('--card'),
          titleColor: cssVar('--text'),
          bodyColor: cssVar('--text'),
          borderColor: cssVar('--border'),
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

export function renderAINews() {
  const summaryContainer = /** @type {HTMLElement} */ (document.getElementById('newsSummary'));
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

      let linkedSummary = contentStr.replace(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/g, (match, ticker) => {
        const isAdvised = DATA.entries && DATA.entries.some(e => e.ticker === ticker);
        const isHolding = PORTFOLIO.holdings && PORTFOLIO.holdings.some(h => h.ticker === ticker);
        if (isAdvised || isHolding) {
          return tickerLink(ticker);
        }
        return match;
      });

      let content = marked.parse(linkedSummary.trim());

      html += `
        <div class="ai-article">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            <h3 style="margin:0; font-size:16px;">${title}</h3>
            <span style="font-size:12px; color:var(--muted);">${esc(s.timestamp ? localDateTime(s.timestamp) : (s.date ? localDateTime(s.date) : ''))}</span>
          </div>
          <div style="line-height: 1.6; font-size: 14px;" class="article-content news-markdown">${content}</div>
        </div>
      `;
    }
    summaryContainer.innerHTML = html;
  } else {
    summaryContainer.innerHTML = '<div class="empty">No AI summaries found. Run /news in the terminal to generate one!</div>';
  }
}

export function renderEOD() {
  const eodList = /** @type {HTMLElement} */ (document.getElementById('eodList'));
  const empty = /** @type {HTMLElement} */ (document.getElementById('eodEmpty'));
  const reports = [...(DATA.eodReports || [])].reverse();
  if (reports.length === 0) {
    eodList.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    eodList.innerHTML = reports.map(r => {
      let contentStr = r.summary || '';
      let title = 'EOD Report';
      const titleMatch = contentStr.match(/^###\s*(.*?)(\n|$)/);
      if (titleMatch) {
        title = esc(titleMatch[1]);
        contentStr = contentStr.replace(/^###\s*(.*?)(\n|$)/, '');
      }

      let linkedSummary = contentStr.replace(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/g, (match, ticker) => {
        const isAdvised = DATA.entries && DATA.entries.some(e => e.ticker === ticker);
        const isHolding = PORTFOLIO.holdings && PORTFOLIO.holdings.some(h => h.ticker === ticker);
        if (isAdvised || isHolding) {
          return tickerLink(ticker);
        }
        return match;
      });

      let content = marked.parse(linkedSummary.trim());

      return `
        <div class="ai-article">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            <h3 style="margin:0; font-size:16px;">${title}</h3>
            <span style="font-size:12px; color:var(--muted);">${esc(r.date ? localDateTime(r.date) : '')}</span>
          </div>
          <div style="line-height: 1.6; font-size: 14px;" class="article-content news-markdown">${content}</div>
        </div>
      `;
    }).join('');
  }
}

export function renderReviews() {
  const container = /** @type {HTMLElement} */ (document.getElementById('reviewsContent'));
  const reviewsMd = DATA['reviewsMd'];
  if (reviewsMd ?? false) {
    let contentStr = /** @type {string} */ (reviewsMd);
    
    let linkedContent = contentStr.replace(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/g, (match, ticker) => {
      const isAdvised = DATA.entries && DATA.entries.some(e => e.ticker === ticker);
      const isHolding = PORTFOLIO.holdings && PORTFOLIO.holdings.some(h => h.ticker === ticker);
      return (isAdvised || isHolding) ? tickerLink(ticker) : match;
    });

    const blocks = linkedContent.split(/(?=^##\s+\[)/m);
    let html = '';
    
    blocks.forEach(block => {
      block = block.trim();
      if (!block.startsWith('## [')) return;
      
      const lines = block.split('\n');
      const header = lines.shift().trim();
      const dateMatch = header.match(/\[(.*?)\]/);
      let dateStr = dateMatch ? dateMatch[1] : '';
      const extraMatch = header.match(/\]\s+(.*)/);
      if (extraMatch) {
         dateStr += ' ' + extraMatch[1];
      }
      
      let bodyText = lines.join('\n').trim();
      if (!bodyText.startsWith('###')) {
         bodyText = '### Strategy Review\n' + bodyText;
      }
      
      const subBlocks = bodyText.split(/(?=^###\s+)/m);
      subBlocks.forEach(sub => {
         sub = sub.trim();
         if (!sub.startsWith('###')) return;
         
         const subLines = sub.split('\n');
         const titleLine = subLines.shift().trim();
         const title = titleLine.replace(/^###\s*/, '');
         const subContent = subLines.join('\n').trim();
         
         html += `
        <div class="ai-article">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            <h3 style="margin:0; font-size:16px;">${esc(title)}</h3>
            <span style="font-size:12px; color:var(--muted);">${esc(dateStr)}</span>
          </div>
          <div style="line-height: 1.6; font-size: 14px;" class="article-content news-markdown">${marked.parse(subContent)}</div>
        </div>
      `;
      });
    });
    
    container.innerHTML = html || '<div class="empty">No learnings or deep dives logged yet. Run /review or ask the AI to analyze a specific ticker!</div>';
  } else {
    container.innerHTML = '<div class="empty">No learnings or deep dives logged yet. Run /review or ask the AI to analyze a specific ticker!</div>';
  }
}

export function renderGainVsDaysChart(canvasId, rows) {
  if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const note = document.getElementById(canvasId + 'Note');
  if (!rows || !rows.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No closed positions available for this chart yet.</div>';
    return;
  }
  
  const buckets = {};
  rows.forEach(r => {
    const d1 = new Date(r.openDate).getTime();
    const d2 = new Date(r.closedDate).getTime();
    let days = Math.round((d2 - d1) / (1000 * 3600 * 24));
    if (isNaN(days)) return;
    if (days < 0) days = 0;
    if (!buckets[days]) buckets[days] = { sum: 0, count: 0, min: r.plPct, max: r.plPct };
    buckets[days].sum += r.plPct;
    buckets[days].count += 1;
    if (r.plPct < buckets[days].min) buckets[days].min = r.plPct;
    if (r.plPct > buckets[days].max) buckets[days].max = r.plPct;
  });

  const daysKeys = Object.keys(buckets).map(Number).sort((a,b) => a - b);
  
  if (!daysKeys.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No closed positions with valid dates yet.</div>';
    return;
  }

  canvas.style.display = '';
  if (note) note.innerHTML = '';

  const labels = daysKeys.map(d => d + (d === 1 ? ' day' : ' days'));
  const averages = daysKeys.map(d => buckets[d].sum / buckets[d].count);
  const counts = daysKeys.map(d => buckets[d].count);
  const highs = daysKeys.map(d => buckets[d].max);
  const lows = daysKeys.map(d => buckets[d].min);
  
  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Avg P/L %',
        data: averages,
        backgroundColor: averages.map(y => y >= 0 ? 'rgba(46, 204, 113, 0.8)' : 'rgba(231, 76, 60, 0.8)'),
        borderRadius: 6,
        maxBarThickness: 50
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const idx = ctx.dataIndex;
              const y = ctx.raw;
              const n = counts[idx];
              const h = highs[idx];
              const l = lows[idx];
              const hStr = h > 0 ? '+' + h.toFixed(2) : h.toFixed(2);
              const lStr = l > 0 ? '+' + l.toFixed(2) : l.toFixed(2);
              return [
                `Avg: ${y > 0 ? '+' : ''}${y.toFixed(2)}% (n=${n})`,
                `High: ${hStr}%`,
                `Low: ${lStr}%`
              ];
            }
          }
        }
      },
      scales: {
        y: { title: { display: true, text: 'Avg P/L %' } }
      }
    }
  });
}

export function renderDayOfWeekChart(canvasId, rows) {
  if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const note = document.getElementById(canvasId + 'Note');
  if (!rows || !rows.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No closed positions available for this chart yet.</div>';
    return;
  }

  const daysStr = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const buckets = [0,1,2,3,4,5,6].map(i => ({ sum: 0, count: 0, name: daysStr[i] }));
  
  rows.forEach(r => {
    if (!r.firstAdvised) return;
    const d = new Date(r.firstAdvised).getDay();
    if (isNaN(d)) return;
    buckets[d].sum += r.plPct;
    buckets[d].count += 1;
  });

  const validBuckets = buckets.filter(b => b.count > 0);
  if (!validBuckets.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No valid advice dates found.</div>';
    return;
  }
  canvas.style.display = '';
  if (note) note.innerHTML = '';

  const labels = validBuckets.map(b => b.name);
  const averages = validBuckets.map(b => b.sum / b.count);
  const counts = validBuckets.map(b => b.count);

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Avg P/L %',
        data: averages,
        backgroundColor: averages.map(y => y >= 0 ? 'rgba(46, 204, 113, 0.8)' : 'rgba(231, 76, 60, 0.8)'),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const y = ctx.raw;
              const n = counts[ctx.dataIndex];
              return `Avg: ${y > 0 ? '+' : ''}${y.toFixed(2)}% (n=${n})`;
            }
          }
        }
      },
      scales: { y: { title: { display: true, text: 'Avg P/L %' } } }
    }
  });
}

export function renderWinRateTrendChart(canvasId, rows) {
  if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const note = document.getElementById(canvasId + 'Note');
  if (!rows || !rows.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No closed positions available for this chart yet.</div>';
    return;
  }

  const buckets = {};
  rows.forEach(r => {
    if (!r.firstAdvised) return;
    const d = new Date(r.firstAdvised);
    if (isNaN(d.getTime())) return;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets[month]) buckets[month] = { wins: 0, total: 0 };
    if (r.plPct > 0) buckets[month].wins += 1;
    buckets[month].total += 1;
  });

  const sortedMonths = Object.keys(buckets).sort();
  if (!sortedMonths.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No valid advice dates found.</div>';
    return;
  }
  canvas.style.display = '';
  if (note) note.innerHTML = '';

  const labels = sortedMonths;
  const winRates = sortedMonths.map(m => (buckets[m].wins / buckets[m].total) * 100);
  const counts = sortedMonths.map(m => buckets[m].total);

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Win Rate %',
        data: winRates,
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.2)',
        fill: true,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const y = ctx.raw;
              const n = counts[ctx.dataIndex];
              return `Win Rate: ${y.toFixed(1)}% (n=${n})`;
            }
          }
        }
      },
      scales: { y: { title: { display: true, text: 'Win Rate %' }, min: 0, max: 100 } }
    }
  });
}

export function renderEntryDisciplineChart(canvasId, rows) {
  if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const note = document.getElementById(canvasId + 'Note');
  if (!rows || !rows.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No closed positions available for this chart yet.</div>';
    return;
  }

  const buckets = {
    'Below Drop Below': { plSum: 0, total: 0, minPl: Infinity, maxPl: -Infinity },
    'In Buy Zone': { plSum: 0, total: 0, minPl: Infinity, maxPl: -Infinity },
    'Chased': { plSum: 0, total: 0, minPl: Infinity, maxPl: -Infinity },
    'Above Drop Above': { plSum: 0, total: 0, minPl: Infinity, maxPl: -Infinity }
  };
  
  rows.forEach(r => {
    const buyBelow = r.e.buyBelow;
    if (buyBelow == null || !r.boughtAt) return;
    
    let category = 'In Buy Zone';
    if (r.e.dropBelow && r.boughtAt < r.e.dropBelow) {
      category = 'Below Drop Below';
    } else if (r.boughtAt <= buyBelow + 0.01) {
      category = 'In Buy Zone';
    } else if (r.e.dropAbove && r.boughtAt > r.e.dropAbove) {
      category = 'Above Drop Above';
    } else {
      category = 'Chased';
    }
    
    buckets[category].plSum += r.plPct;
    buckets[category].total += 1;
    if (r.plPct < buckets[category].minPl) buckets[category].minPl = r.plPct;
    if (r.plPct > buckets[category].maxPl) buckets[category].maxPl = r.plPct;
  });

  const labels = Object.keys(buckets).filter(k => buckets[k].total > 0);
  if (!labels.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">Not enough buy target data available.</div>';
    return;
  }
  
  canvas.style.display = '';
  if (note) note.innerHTML = '';

  const avgPls = labels.map(l => buckets[l].plSum / buckets[l].total);
  const counts = labels.map(l => buckets[l].total);
  const mins = labels.map(l => buckets[l].minPl);
  const maxes = labels.map(l => buckets[l].maxPl);

  const colors = {
    'Below Drop Below': 'rgba(231, 76, 60, 0.8)',
    'In Buy Zone': 'rgba(46, 204, 113, 0.8)',
    'Chased': 'rgba(243, 156, 18, 0.8)',
    'Above Drop Above': 'rgba(231, 76, 60, 0.8)'
  };

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Avg P/L %',
        data: avgPls,
        backgroundColor: labels.map(l => colors[l]),
        borderRadius: 6,
        maxBarThickness: 60
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const y = ctx.raw;
              const n = counts[ctx.dataIndex];
              const min = mins[ctx.dataIndex];
              const max = maxes[ctx.dataIndex];
              return [
                `Avg P/L: ${y > 0 ? '+' : ''}${y.toFixed(2)}% (n=${n})`,
                `Range: ${min > 0 ? '+' : ''}${min.toFixed(2)}% to ${max > 0 ? '+' : ''}${max.toFixed(2)}%`
              ];
            }
          }
        }
      },
      scales: { y: { title: { display: true, text: 'Average P/L %' } } }
    }
  });
}

export function renderDaysVsRsiChart(canvasId, rows) {
  if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const note = document.getElementById(canvasId + 'Note');
  
  const winningRows = (rows || []).filter(r => r.plPct > 0);
  if (!winningRows.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No winning trades available for this chart yet.</div>';
    return;
  }

  const buckets = {};
  winningRows.forEach(r => {
    let rsiBand = 'Unknown';
    if (r.e.rsiAtAdvice != null) {
      const v = r.e.rsiAtAdvice;
      if (v < 20) rsiBand = '< 20 (Deep)';
      else if (v < 25) rsiBand = '20 - 25';
      else if (v < 30) rsiBand = '25 - 30';
      else if (v < 35) rsiBand = '30 - 35';
      else if (v < 40) rsiBand = '35 - 40';
      else rsiBand = '40+';
    } else {
      return;
    }
    
    const d1 = new Date(r.openDate).getTime();
    const d2 = new Date(r.closedDate).getTime();
    let days = Math.round((d2 - d1) / (1000 * 3600 * 24));
    if (isNaN(days)) return;
    if (days < 0) days = 0;
    
    if (!buckets[rsiBand]) buckets[rsiBand] = { sum: 0, count: 0 };
    buckets[rsiBand].sum += days;
    buckets[rsiBand].count += 1;
  });

  const order = ['< 20 (Deep)', '20 - 25', '25 - 30', '30 - 35', '35 - 40', '40+'];
  const labels = Object.keys(buckets).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  
  if (!labels.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No RSI data available for winning trades.</div>';
    return;
  }
  
  canvas.style.display = '';
  if (note) note.innerHTML = '';

  const averages = labels.map(l => buckets[l].sum / buckets[l].count);
  const counts = labels.map(l => buckets[l].count);

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Avg Days to Bounce',
        data: averages,
        backgroundColor: 'rgba(155, 89, 182, 0.8)',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const y = ctx.raw;
              const n = counts[ctx.dataIndex];
              return `Avg: ${y.toFixed(1)} days (n=${n})`;
            }
          }
        }
      },
      scales: { y: { title: { display: true, text: 'Avg Days Held' } } }
    }
  });
}
let equityChart = null;
export function renderEquityChart(tf = '7d') {
  const equityHistory = /** @type {any} */ (DATA).equityHistory;
  if (!equityHistory || equityHistory.length === 0) {
    const wrap = document.getElementById('chartEquity')?.parentElement;
    if (wrap) wrap.innerHTML = '<div class="insufficient" style="height:100%; display:flex; align-items:center; justify-content:center;">Waiting for more data points. Chart will appear soon.</div>';
    return;
  }
  
  const now = new Date();
  let msAgo = 0;
  if (tf === '24h') msAgo = 24 * 3600 * 1000;
  else if (tf === '7d') msAgo = 7 * 86400 * 1000;
  else if (tf === '30d') msAgo = 30 * 86400 * 1000;
  else if (tf === '12m') msAgo = 365 * 86400 * 1000;
  
  let pts = equityHistory;
  if (msAgo > 0) {
    const cutoff = new Date(now.getTime() - msAgo);
    pts = pts.filter((p) => new Date(p.timestamp) >= cutoff);
    if (pts.length < equityHistory.length) {
      const earlier = equityHistory.slice(0, equityHistory.length - pts.length);
      if (earlier.length) pts.unshift(earlier[earlier.length - 1]);
    }
  }

  let bucketMs = 0;
  if (tf === '24h') bucketMs = 60 * 60 * 1000; // 1 hour buckets
  else if (tf === '7d') bucketMs = 4 * 3600 * 1000;
  else if (tf === '30d') bucketMs = 86400 * 1000;
  else if (tf === '12m') bucketMs = 7 * 86400 * 1000;
  
  if (bucketMs > 0) {
      const buckets = {};
      const recentPoints = [];
      const oneHourAgo = now.getTime() - 60 * 60 * 1000;
      
      pts.forEach(p => {
          const t = new Date(p.timestamp).getTime();
          if (tf === '24h' && t >= oneHourAgo) {
              recentPoints.push(p);
          } else {
              const bucket = Math.floor(t / bucketMs) * bucketMs;
              buckets[bucket] = p; // keep last in bucket
          }
      });
      pts = Object.keys(buckets).sort().map(k => buckets[k]).concat(recentPoints);
      pts = pts.filter((item, pos, ary) => pos === 0 || item !== ary[pos - 1]);
  }

  const wrap = document.getElementById('chartEquity')?.parentElement;
  if (!wrap) return;

  if (pts.length < 2) {
    if (!wrap.querySelector('.insufficient')) {
        wrap.innerHTML = '<canvas id="chartEquity"></canvas><div class="insufficient" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; text-align:center;">Not enough data points yet.</div>';
    }
  } else {
    if (wrap.querySelector('.insufficient')) {
        wrap.innerHTML = '<canvas id="chartEquity"></canvas>';
    }
  }
  
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('chartEquity'));
  if (!canvas) return;
  
  if (equityChart) equityChart.destroy();

  const labels = pts.map((p) => {
      const d = new Date(p.timestamp);
      if (tf === '24h') return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      if (tf === '7d') return d.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      if (tf === '30d') return d.toLocaleDateString([], {month: 'short', day: 'numeric'});
      return d.toLocaleDateString([], {year: 'numeric', month: 'short'});
  });

  const green = cssVar('--green');
  const blue = cssVar('--blue');
  const text = cssVar('--text');
  const cyan = cssVar('--cyan');
  const yellow = cssVar('--yellow');

  const basePoint = pts.find(p => p.invested);
  const nasdaqBase = pts.find(p => p.nasdaq);
  const sp500Base = pts.find(p => p.sp500);
  const dowBase = pts.find(p => p.dow);

  const nasdaqData = pts.map(p => (nasdaqBase && p.nasdaq) ? ((p.nasdaq - nasdaqBase.nasdaq) / nasdaqBase.nasdaq * 100) : null);
  const sp500Data = pts.map(p => (sp500Base && p.sp500) ? ((p.sp500 - sp500Base.sp500) / sp500Base.sp500 * 100) : null);
  const dowData = pts.map(p => (dowBase && p.dow) ? ((p.dow - dowBase.dow) / dowBase.dow * 100) : null);

  // Calculate portfolio return over the timeframe by looking at the change in Total P/L relative to the starting invested capital
  const totalPctData = pts.map(p => (basePoint && basePoint.invested) ? ((p.total - basePoint.total) / basePoint.invested * 100) : null);

  equityChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Total P/L', data: pts.map(p => p.total), yAxisID: 'y', borderColor: text, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 },
        { label: 'Realized P/L', data: pts.map(p => p.realized), yAxisID: 'y', borderColor: green, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 },
        { label: 'Open P/L', data: pts.map(p => p.open), yAxisID: 'y', borderColor: blue, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 },
        { label: 'Portfolio Return %', data: totalPctData, yAxisID: 'y1', borderColor: yellow, borderDash: [5, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 },
        { label: 'Nasdaq %', data: nasdaqData, yAxisID: 'y1', borderColor: cyan, borderDash: [5, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 },
        { label: 'S&P 500 %', data: sp500Data, yAxisID: 'y1', borderColor: cssVar('--orange'), borderDash: [5, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 },
        { label: 'Dow %', data: dowData, yAxisID: 'y1', borderColor: cssVar('--red'), borderDash: [5, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: cssVar('--muted') } },
        tooltip: { 
            mode: 'index', intersect: false, 
            callbacks: { 
                label: c => {
                    if (c.dataset.yAxisID === 'y1') return c.dataset.label + ': ' + (c.raw != null ? c.raw.toFixed(2) + '%' : 'N/A');
                    return c.dataset.label + ': $' + (c.raw != null ? c.raw.toFixed(2) : 'N/A');
                }
            } 
        }
      },
      scales: {
        x: { grid: { color: cssVar('--border') }, ticks: { color: cssVar('--muted'), maxTicksLimit: 8 } },
        y: { 
            type: 'linear', display: true, position: 'left',
            grid: { color: cssVar('--border') }, 
            ticks: { color: cssVar('--muted'), callback: v => '$' + v } 
        },
        y1: { 
            type: 'linear', display: true, position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: cssVar('--muted'), callback: v => (typeof v === 'number' ? v.toFixed(2) : v) + '%' } 
        }
      }
    }
  });
}
