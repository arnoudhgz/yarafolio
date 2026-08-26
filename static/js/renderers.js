// @ts-check
import { DATA, PORTFOLIO, currentFilter, posFilter, activeTab, portfolioViewMode, portfolioTabMode, heatmapTimeframe, LEARN, analyticsCharts, canSave, SECTORS, SECTOR_COLORS, sortState, setSectorChart, setSectorCoverageChart, portfolioHeatmapChart, setPortfolioHeatmapChart, sectorChart, sectorCoverageChart, setPortfolioRendered, Chart, marked, searchQuery } from './state.js';
import { advised, latestPrice, changePct, periodChangePct, fmtPct, esc, tickerLink, fmtPrice, fmtMoney, fmtPL, matchesSearch, sortRows, cssVar, localDate, localDateTime, advisedFor } from './utils.js';
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
  if (activeTab === 'history') renderHistoryTab();
  if (activeTab === 'commodities') renderCommoditiesTab();
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
      todayChangePct: periodChangePct(e, 'today'),
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

function hasPendingAdvice(e) {
  if (e.status !== 'bought') return true;
  if (!e.lots || !e.lots.length) return false; // If bought but no lots, it's manually marked bought. We don't want it stuck forever. Wait, actually if no lots, let's say false to hide it? If they just bought it, it's fulfilled.
  if (!e.adviceEvents || !e.adviceEvents.length) return false;
  
  let maxAdv = '';
  for (const ev of e.adviceEvents) {
    if (ev.date > maxAdv) maxAdv = ev.date.substring(0, 10);
  }
  
  let maxLot = '';
  for (const l of e.lots) {
    const ld = l.openDate ? l.openDate.substring(0, 10) : '';
    if (ld > maxLot) maxLot = ld;
  }
  
  return maxAdv > maxLot;
}

export function tippingFlags(r) {
  const p = latestPrice(r.e);
  
  let pending = r.status === 'watching';
  if (r.status === 'bought') {
    if (!r.e.lots || !r.e.lots.length) {
      pending = false; 
    } else {
      let maxAdv = '';
      for (const ev of (r.e.adviceEvents || [])) {
        if (ev.date > maxAdv) maxAdv = ev.date.substring(0, 10);
      }
      let maxLot = '';
      for (const l of r.e.lots) {
        const ld = l.openDate ? l.openDate.substring(0, 10) : '';
        if (ld > maxLot) maxLot = ld;
      }
      pending = maxAdv > maxLot;
    }
  }

  const dropHit = r.dropBelow != null && p <= r.dropBelow && pending;
  const buyHit = !dropHit && pending && r.buyBelow != null && p <= r.buyBelow;
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

export function mapSector(sector) {
  if (!sector) return 'ETF / Other';
  if (SECTORS.includes(sector)) return sector;
  const legacy = {
    'Basic Materials': 'Materials', 'Conglomerates': 'Industrials',
    'Consumer Goods': 'Consumer Staples', 'Financial': 'Financials',
    'Industrial Goods': 'Industrials', 'Services': 'Consumer Discretionary'
  };
  return legacy[sector] || 'ETF / Other';
}


export function sectorPctMap() {
  if (!PORTFOLIO || !PORTFOLIO.holdings) return null;
  const total = PORTFOLIO.holdings.reduce((s, h) => s + (h.invested || 0), 0);
  if (!total) return null;
  const invested = {};
  PORTFOLIO.holdings.forEach(h => {
    const s = mapSector(h.sector);
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
  renderPortfolioTable();
  setPortfolioRendered(true);
}

export function renderPortfolioTable() {
  const table = /** @type {HTMLElement} */ (document.getElementById('portfolioTable'));
  const emptyMsgEl = /** @type {HTMLElement} */ (document.getElementById('portfolioEmpty'));

  const tableContainer = document.getElementById('portfolioTableContainer');
  const heatmapContainer = document.getElementById('portfolioHeatmapContainer');
  if (tableContainer && heatmapContainer) {
    if (portfolioTabMode === 'table') {
      tableContainer.style.display = 'block';
      heatmapContainer.style.display = 'none';
    } else {
      tableContainer.style.display = 'none';
      heatmapContainer.style.display = 'block';
    }
  }

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
            plDollar: lot.isBuy === false ? lot.units * (lot.openRate - h.currentPrice) : lot.units * (h.currentPrice - lot.openRate),
            plPct: (lot.invested || (lot.units * lot.openRate)) > 0 ? (lot.isBuy === false ? (lot.units * (lot.openRate - h.currentPrice)) : (lot.units * (h.currentPrice - lot.openRate))) / (lot.invested || (lot.units * lot.openRate)) * 100 : 0,
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

  const advisedMap = new Map();
  if (DATA && DATA.entries) {
    DATA.entries.forEach(e => advisedMap.set(e.ticker, e));
  }
  holdings.forEach(h => {
    h.heatmapPct = h.plPct || 0;
    h.heatmapDollar = h.plDollar || 0;
  });

  renderPortfolioTreemap(holdings);
}

function renderPortfolioTreemap(holdings) {
  const ctx = /** @type {HTMLCanvasElement} */ (document.getElementById('chartPortfolioHeatmap'));
  if (Chart.getChart(ctx)) Chart.getChart(ctx).destroy();
  if (portfolioHeatmapChart) { portfolioHeatmapChart.destroy(); setPortfolioHeatmapChart(null); }
  if (portfolioTabMode === 'table') return;

  const filteredHoldings = holdings.filter(h => h.invested > 0);
  let treeData = filteredHoldings;
  if (portfolioTabMode === 'heatmap') {
    // AI Advised Only: filter out holdings not actively held in advice DB (exclude 'import', 'sold', 'dropped', 'blacklisted')
    const activeAdvisedTickers = new Set(
      advised()
        .filter(e => e.status === 'bought' || e.status === 'watching')
        .map(e => e.ticker)
    );
    treeData = filteredHoldings.filter(h => activeAdvisedTickers.has(h.ticker));
  }

  if (treeData.length === 0) return;

  // Group by sector, then ticker
  treeData.forEach(h => {
    h.cleanSector = h.sector || 'ETF / Other';
  });

  setPortfolioHeatmapChart(new Chart(ctx, {
    type: 'treemap',
    data: {
      datasets: [{
        tree: treeData,
        key: 'invested',
        groups: ['cleanSector', 'ticker'],
        spacing: 1,
        borderWidth: 0,
        backgroundColor: (ctx) => {
          if (ctx.type !== 'data') return 'transparent';
          if (ctx.raw.l === 0) return 'rgba(255, 255, 255, 0.03)'; // sector background
          
          const raw = ctx.raw;
          const items = Array.isArray(raw._data) ? raw._data : (raw._data && Array.isArray(raw._data.children) ? raw._data.children : [raw._data]);
          
          const totalInvested = items.reduce((sum, item) => sum + (item.invested || 0), 0);
          const totalHeatmapDollar = items.reduce((sum, item) => sum + (item.heatmapDollar || 0), 0);
          const plPct = totalInvested > 0 ? (totalHeatmapDollar / totalInvested) * 100 : 0;
          
          let thresholds = [15.0, 0];

          if (plPct > thresholds[0]) return '#10b981'; // bright green
          if (plPct > thresholds[1]) return '#059669'; // dark green
          if (plPct < -thresholds[0]) return '#ef4444'; // bright red
          if (plPct < thresholds[1]) return '#b91c1c'; // dark red
          return '#374151'; // flat gray
        },
        labels: {
          display: true,
          color: '#fff',
          font: [{ size: 14, weight: 'bold' }, { size: 12 }],
          formatter: (ctx) => {
            if (ctx.type !== 'data') return '';
            if (ctx.raw.l === 0) return ''; // We use captions for sector names
            const raw = ctx.raw;
            const items = Array.isArray(raw._data) ? raw._data : (raw._data && Array.isArray(raw._data.children) ? raw._data.children : [raw._data]);
            const ticker = raw.g || (items[0] && (items[0].displayTicker || items[0].ticker)) || '';
            const totalInvested = items.reduce((sum, item) => sum + (item.invested || 0), 0);
            const totalHeatmapDollar = items.reduce((sum, item) => sum + (item.heatmapDollar || 0), 0);
            const plPct = totalInvested > 0 ? (totalHeatmapDollar / totalInvested) * 100 : 0;
            return [ticker, fmtPct(plPct)];
          }
        },
        captions: {
          display: true,
          color: 'rgba(255, 255, 255, 0.8)',
          font: { size: 14, weight: 'bold' }
        }
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const raw = items[0].raw;
              if (raw.l === 0) return raw.g; // sector
              const dataItems = Array.isArray(raw._data) ? raw._data : (raw._data && Array.isArray(raw._data.children) ? raw._data.children : [raw._data]);
              return raw.g || (dataItems[0] && (dataItems[0].displayTicker || dataItems[0].ticker)) || '';
            },
            label: (ctx) => {
              const raw = ctx.raw;
              if (raw.l === 0) return '';
              const items = Array.isArray(raw._data) ? raw._data : (raw._data && Array.isArray(raw._data.children) ? raw._data.children : [raw._data]);
              const name = (items[0] && items[0].name) || '';
              const totalInvested = items.reduce((sum, item) => sum + (item.invested || 0), 0);
              const totalHeatmapDollar = items.reduce((sum, item) => sum + (item.heatmapDollar || 0), 0);
              const plPct = totalInvested > 0 ? (totalHeatmapDollar / totalInvested) * 100 : 0;
              let labelPrefix = "Open P/L";
              return [name, `Invested: ${fmtPrice(totalInvested)}`, `${labelPrefix}: ${fmtPrice(totalHeatmapDollar)} (${fmtPct(plPct)})`];
            }
          }
        }
      }
    }
  }));
}

function renderSectorChart() {
  if (sectorChart) { sectorChart.destroy(); setSectorChart(null); }
  const bySector = new Map();
  PORTFOLIO.holdings.forEach(h => {
    const s = mapSector(h.sector);
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
    const s = mapSector(h.sector);
    invested[s] = (invested[s] || 0) + (h.invested || 0);
  });
  const adviceCount = {};
  advised().forEach(e => {
    const s = mapSector(e.sector);
    if (s !== 'ETF / Other' || e.sector) {
      adviceCount[s] = (adviceCount[s] || 0) + 1;
    }
  });
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
        y: { ticks: { autoSkip: false, color: cssVar('--text') }, grid: { display: false } }
      }
    }
  }));
}

let analyticsRendered = false;

export const bucketModes = {
  chartRating: 'pct',
  chartRsiBand: 'pct',
  chartSector: 'pct',
  chartSource: 'pct',
  chartGainVsDays: 'pct'
};

export function reRenderAnalyticsChart(targetChart) {
  const allLots = positionLotRows();
  const soldLots = allLots.filter(r => r.status === 'sold');
  
  const b = (LEARN && LEARN.buckets) ? LEARN.buckets : {};

  if (targetChart === 'chartGainVsDays') {
    renderGainVsDaysChart(targetChart, soldLots);
  } else if (targetChart === 'chartWinRateTrend') {
    renderWinRateTrendChart(targetChart, soldLots);
  } else if (targetChart === 'chartRating') {
    renderBucketChart('chartRating', b.rating, r => r.e.rating, soldLots);
  } else if (targetChart === 'chartSector') {
    renderBucketChart('chartSector', b.sector, r => r.e.sector, soldLots);
  } else if (targetChart === 'chartSource') {
    renderBucketChart('chartSource', b.source, r => r.e.source, soldLots);
  } else if (targetChart === 'chartRsiBand') {
    renderBucketChart('chartRsiBand', b.rsiBand, r => {
      const v = r.e.rsiAtAdvice;
      if (v == null) return null;
      if (v < 20) return '<20';
      if (v < 30) return '20-30';
      if (v < 40) return '30-40';
      if (v < 50) return '40-50';
      if (v < 60) return '50-60';
      if (v < 70) return '60-70';
      return '70+';
    }, soldLots);
  }
}

export function renderAnalytics() {
  analyticsRendered = true;
  renderEquityChart('24h');
  renderDrawdownChart('24h');
  renderRealizedPnlChart();
  renderSectorCoverage();
  renderSectorChart();
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
  const allLots = positionLotRows();
  const soldLots = allLots.filter(r => r.status === 'sold');
  renderBucketChart('chartRating', b.rating, r => r.e.rating, soldLots);
  renderBucketChart('chartRsiBand', b.rsiBand, r => {
    const v = r.e.rsiAtAdvice;
    if (v == null) return null;
    if (v < 20) return '<20';
    if (v < 30) return '20-30';
    if (v < 40) return '30-40';
    if (v < 50) return '40-50';
    if (v < 60) return '50-60';
    if (v < 70) return '60-70';
    return '70+';
  }, soldLots);
  renderBucketChart('chartSector', b.sector, r => r.e.sector, soldLots);
  renderBucketChart('chartSource', b.source, r => r.e.source, soldLots);
  
  
  renderGainVsDaysChart('chartGainVsDays', soldLots);
  renderDayOfWeekChart('chartDayOfWeek', soldLots);
  renderWinRateTrendChart('chartWinRateTrend', soldLots);
  renderEntryDisciplineChart('chartEntryDiscipline', soldLots);
  renderDaysVsRsiChart('chartDaysVsRsi', soldLots);
  empty.textContent = 'Not enough finished advice yet to learn from. Outcomes appear once picks are sold, dropped, or 7+ days old.';
  empty.style.display = LEARN.measurableOutcomes ? 'none' : 'block';
}

export function renderBucketChart(canvasId, buckets, keyFn = null, allLots = null) {
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
  const toggle = document.querySelector(`.toggle-bucket[data-target="${canvasId}"]`);
  
  if (note) note.innerHTML = weak.length
    ? '<div class="insufficient">Insufficient (n&lt;3): ' + weak.map(k => k + ' (n=' + buckets[k].n + ')').join(', ') + '</div>'
    : '';
    
  if (!ok.length) {
    canvas.style.display = 'none';
    if (toggle instanceof HTMLElement) toggle.style.display = 'none';
    if (note && !weak.length) note.innerHTML = '<div class="insufficient">No finished outcomes in this dimension yet.</div>';
    if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
    return;
  }
  
  if (toggle instanceof HTMLElement) toggle.style.display = '';
  
  const dols = {};
  ok.forEach(k => dols[k] = 0);
  if (allLots && keyFn) {
    allLots.forEach(r => {
      const k = keyFn(r);
      if (k && dols[k] !== undefined) dols[k] += (r.plDollar || 0);
    });
  }

  const isDol = bucketModes[canvasId] === 'dol';
  const barData = isDol ? ok.map(k => dols[k]) : ok.map(k => buckets[k].avg);
  const barColors = isDol 
    ? ok.map(k => dols[k] >= 0 ? 'rgba(46, 204, 113, 0.8)' : 'rgba(231, 76, 60, 0.8)')
    : ok.map(k => buckets[k].avg >= 0 ? 'rgba(46, 204, 113, 0.8)' : 'rgba(231, 76, 60, 0.8)');

  canvas.style.display = '';

  if (analyticsCharts[canvasId]) {
    const chart = analyticsCharts[canvasId];
    chart.data.labels = ok;
    chart.data.datasets[0].data = ok.map(k => buckets[k].winRate);
    chart.data.datasets[1].data = barData;
    chart.data.datasets[1].backgroundColor = barColors;
    chart.data.datasets[1].label = isDol ? 'Total Profit $' : 'Avg move %';
    chart.options.scales.y1.title.text = isDol ? 'Total $' : 'Avg %';
    chart.options.scales.y1.ticks.callback = isDol ? (v => '$' + v) : undefined;
    chart.update();
    return;
  }

  analyticsCharts[canvasId] = new Chart(canvas, {
    data: {
      labels: ok,
      datasets: [
        { type: 'line', label: 'Win rate %', yAxisID: 'y', data: ok.map(k => buckets[k].winRate), borderColor: '#3498db', backgroundColor: '#3498db', borderWidth: 3, pointBackgroundColor: '#fff', pointBorderWidth: 2, pointRadius: 5, tension: 0.3, fill: false },
        { type: 'bar', label: isDol ? 'Total Profit $' : 'Avg move %', yAxisID: 'y1', data: barData,
          backgroundColor: barColors, borderRadius: 6, maxBarThickness: 50 },
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { position: 'left', min: 0, max: 100, title: { display: true, text: 'Win %', color: cssVar('--muted') },
             ticks: { color: cssVar('--muted') }, grid: { color: cssVar('--border'), drawBorder: false } },
        y1: { position: 'right', grid: { display: false }, title: { display: true, text: isDol ? 'Total $' : 'Avg %', color: cssVar('--muted') },
              ticks: { color: cssVar('--muted'), callback: isDol ? (v => '$' + v) : undefined } },
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
            const label = items[0].label;
            const s = buckets[label];
            const arr = ['n = ' + s.n, 'median: ' + fmtPct(s.median)];
            if (dols[label] !== undefined) {
              const dol = dols[label];
              const dollarStr = dol >= 0 ? '+$' + dol.toFixed(2) : '-$' + Math.abs(dol).toFixed(2);
              arr.push('Total Profit: ' + dollarStr);
            }
            return arr;
          } }
        }
      }
    }
  });
}

function linkifyHtml(html) {
  const parts = html.split(/(<[^>]*>)/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      parts[i] = parts[i].replace(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/g, (match, ticker) => {
        const isAdvised = DATA.entries && DATA.entries.some(e => e.ticker === ticker);
        const isHolding = PORTFOLIO.holdings && PORTFOLIO.holdings.some(h => h.ticker === ticker);
        return (isAdvised || isHolding) ? tickerLink(ticker) : match;
      });
    }
  }
  return parts.join('');
}

export function renderAINews() {
  const summaryContainer = /** @type {HTMLElement} */ (document.getElementById('newsSummary'));
  if (DATA.newsSummaries && DATA.newsSummaries.length > 0) {
    let html = '';
    const summaries = [...DATA.newsSummaries].reverse();
    for (const s of summaries) {
      let contentStr = s.article || s.summary || '';
      let title = 'News Summary';
      const titleMatch = contentStr.match(/^###\s*(.*?)(\r?\n|$)/);
      if (titleMatch) {
        title = esc(titleMatch[1]);
        contentStr = contentStr.replace(/^###\s*(.*?)(\r?\n|$)/, '');
      }

      let content = linkifyHtml(marked.parse(contentStr.trim()));

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
      const titleMatch = contentStr.match(/^###\s*(.*?)(\r?\n|$)/);
      if (titleMatch) {
        title = esc(titleMatch[1]);
        contentStr = contentStr.replace(/^###\s*(.*?)(\r?\n|$)/, '');
      }

      let content = linkifyHtml(marked.parse(contentStr.trim()));

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
    
    const blocks = contentStr.split(/(?=^##\s+\[)/m);
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
            <span style="font-size:12px; color:var(--muted);">${esc(localDateTime(dateStr))}</span>
          </div>
          <div style="line-height: 1.6; font-size: 14px;" class="article-content news-markdown">${linkifyHtml(marked.parse(subContent))}</div>
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
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const note = document.getElementById(canvasId + 'Note');
  const toggle = document.querySelector(`.toggle-bucket[data-target="${canvasId}"]`);
  
  if (!rows || !rows.length) {
    canvas.style.display = 'none';
    if (toggle instanceof HTMLElement) toggle.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No closed positions available for this chart yet.</div>';
    if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
    return;
  }
  
  if (toggle instanceof HTMLElement) toggle.style.display = '';

  const isDol = bucketModes[canvasId] === 'dol';
  const scatterData = [];
  rows.forEach(r => {
    const d1 = new Date(r.openDate).getTime();
    const d2 = new Date(r.closedDate).getTime();
    let days = Math.round((d2 - d1) / (1000 * 3600 * 24));
    if (isNaN(days)) return;
    if (days < 0) days = 0;
    const yVal = isDol ? (r.plDollar || 0) : r.plPct;
    scatterData.push({ x: days, y: yVal, ticker: r.ticker, plDollar: r.plDollar || 0, plPct: r.plPct });
  });

  if (!scatterData.length) {
    canvas.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No closed positions with valid dates yet.</div>';
    return;
  }

  canvas.style.display = '';
  if (note) note.innerHTML = '';

  if (analyticsCharts[canvasId]) {
    const chart = analyticsCharts[canvasId];
    chart.data.datasets[0].data = scatterData;
    chart.data.datasets[0].backgroundColor = scatterData.map(d => d.plPct >= 0 ? 'rgba(46, 204, 113, 0.6)' : 'rgba(231, 76, 60, 0.6)');
    chart.data.datasets[0].borderColor = scatterData.map(d => d.plPct >= 0 ? 'rgba(46, 204, 113, 1)' : 'rgba(231, 76, 60, 1)');
    chart.options.scales.y.title.text = isDol ? 'Realized Profit $' : 'Realized Return %';
    chart.options.scales.y.ticks.callback = isDol ? (v => '$' + v) : (v => v + '%');
    chart.update();
    return;
  }

  analyticsCharts[canvasId] = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Trades',
        data: scatterData,
        backgroundColor: scatterData.map(d => d.plPct >= 0 ? 'rgba(46, 204, 113, 0.6)' : 'rgba(231, 76, 60, 0.6)'),
        borderColor: scatterData.map(d => d.plPct >= 0 ? 'rgba(46, 204, 113, 1)' : 'rgba(231, 76, 60, 1)'),
        borderWidth: 1,
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar('--card'),
          titleColor: cssVar('--text'),
          bodyColor: cssVar('--text'),
          borderColor: cssVar('--border'),
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const d = ctx.raw;
              const yStr = d.plPct > 0 ? '+' + d.plPct.toFixed(2) : d.plPct.toFixed(2);
              const dollarStr = d.plDollar >= 0 ? '+$' + d.plDollar.toFixed(2) : '-$' + Math.abs(d.plDollar).toFixed(2);
              return `${d.ticker}: ${yStr}% (${dollarStr}) in ${d.x} days`;
            }
          }
        }
      },
      scales: {
        x: { 
          title: { display: true, text: 'Days Held', color: cssVar('--muted') },
          ticks: { color: cssVar('--muted') },
          grid: { color: cssVar('--border') }
        },
        y: { 
          title: { display: true, text: isDol ? 'Realized Profit $' : 'Realized Return %', color: cssVar('--muted') },
          ticks: { color: cssVar('--muted'), callback: isDol ? (v => '$' + v) : (v => v + '%') },
          grid: { color: cssVar('--border') }
        }
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
  const buckets = [0,1,2,3,4,5,6].map(i => ({ sum: 0, count: 0, plSum: 0, name: daysStr[i] }));
  
  const activeToggle = document.querySelector('#dayOfWeekToggles button.active');
  const type = activeToggle instanceof HTMLElement ? activeToggle.dataset.type || 'bought' : 'bought';

  rows.forEach(r => {
    let dateStr = type === 'bought' ? r.openDateTime : r.firstAdvised;
    if (!dateStr) return;
    const d = new Date(dateStr).getDay();
    if (isNaN(d)) return;
    buckets[d].sum += r.plPct;
    buckets[d].count += 1;
    buckets[d].plSum += (r.plDollar || 0);
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
  const plSums = validBuckets.map(b => b.plSum);

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
              const dol = plSums[ctx.dataIndex];
              const dollarStr = dol >= 0 ? '+$' + dol.toFixed(2) : '-$' + Math.abs(dol).toFixed(2);
              return [
                `Avg: ${y > 0 ? '+' : ''}${y.toFixed(2)}%`,
                `Total: ${dollarStr} (n=${n})`
              ];
            }
          }
        }
      },
      scales: { y: { title: { display: true, text: 'Avg P/L %' } } }
    }
  });
}

export function renderWinRateTrendChart(canvasId, rows) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const note = document.getElementById(canvasId + 'Note');
  const toggle = /** @type {HTMLElement | null} */ (document.querySelector(`.toggle-bucket[data-target="${canvasId}"]`));
  
  if (!rows || !rows.length) {
    canvas.style.display = 'none';
    if (toggle) toggle.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No closed positions available for this chart yet.</div>';
    if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
    return;
  }
  if (toggle) toggle.style.display = '';

  const buckets = {};
  rows.forEach(r => {
    if (!r.firstAdvised) return;
    const d = new Date(r.firstAdvised);
    if (isNaN(d.getTime())) return;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets[month]) buckets[month] = { wins: 0, total: 0, plSum: 0, dolSum: 0 };
    if (r.plPct > 0) buckets[month].wins += 1;
    buckets[month].total += 1;
    buckets[month].plSum += r.plPct;
    buckets[month].dolSum += (r.plDollar || 0);
  });

  const sortedMonths = Object.keys(buckets).sort();
  if (!sortedMonths.length) {
    canvas.style.display = 'none';
    if (toggle) toggle.style.display = 'none';
    if (note) note.innerHTML = '<div class="insufficient">No valid advice dates found.</div>';
    if (analyticsCharts[canvasId]) { analyticsCharts[canvasId].destroy(); delete analyticsCharts[canvasId]; }
    return;
  }
  canvas.style.display = '';
  if (note) note.innerHTML = '';

  const labels = sortedMonths;
  const winRates = sortedMonths.map(m => (buckets[m].wins / buckets[m].total) * 100);
  const counts = sortedMonths.map(m => buckets[m].total);

  if (analyticsCharts[canvasId]) {
    const chart = analyticsCharts[canvasId];
    chart.data.labels = labels;
    chart.data.datasets[0].data = winRates;
    chart.update();
    return;
  }

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
            afterBody: (items) => {
              const label = items[0].label;
              const idx = sortedMonths.indexOf(label);
              if (idx === -1) return '';
              return 'n = ' + counts[idx];
            }
          }
        }
      },
      scales: {
        y: { 
          title: { display: true, text: 'Win Rate %', color: cssVar('--muted') }, 
          min: 0, max: 100,
          ticks: { color: cssVar('--muted') },
          grid: { color: cssVar('--border') }
        },
        x: { ticks: { color: cssVar('--muted') }, grid: { display: false } }
      }
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
    'Below Drop Below': { plSum: 0, total: 0, minPl: Infinity, maxPl: -Infinity, dolSum: 0 },
    'In Buy Zone': { plSum: 0, total: 0, minPl: Infinity, maxPl: -Infinity, dolSum: 0 },
    'Chased': { plSum: 0, total: 0, minPl: Infinity, maxPl: -Infinity, dolSum: 0 },
    'Above Drop Above': { plSum: 0, total: 0, minPl: Infinity, maxPl: -Infinity, dolSum: 0 }
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
    buckets[category].dolSum += (r.plDollar || 0);
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
  const dols = labels.map(l => buckets[l].dolSum);

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
              const dol = dols[ctx.dataIndex];
              const dollarStr = dol >= 0 ? '+$' + dol.toFixed(2) : '-$' + Math.abs(dol).toFixed(2);
              return [
                `Avg P/L: ${y > 0 ? '+' : ''}${y.toFixed(2)}% | Total: ${dollarStr}`,
                `Range: ${min > 0 ? '+' : ''}${min.toFixed(2)}% to ${max > 0 ? '+' : ''}${max.toFixed(2)}%`,
                `Trades: n=${n}`
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
    
    if (!buckets[rsiBand]) buckets[rsiBand] = { sum: 0, count: 0, dolSum: 0 };
    buckets[rsiBand].sum += days;
    buckets[rsiBand].count += 1;
    buckets[rsiBand].dolSum += (r.plDollar || 0);
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
  const dols = labels.map(l => buckets[l].dolSum);

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
              const dol = dols[ctx.dataIndex];
              const dollarStr = dol >= 0 ? '+$' + dol.toFixed(2) : '-$' + Math.abs(dol).toFixed(2);
              return [
                `Avg Days Held: ${y.toFixed(1)} (n=${n})`,
                `Total Profit: ${dollarStr}`
              ];
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
          const d = new Date(p.timestamp);
          const t = d.getTime();
          if (tf === '24h' && t >= oneHourAgo) {
              recentPoints.push(p);
          } else {
              let bucket;
              if (tf === '30d') {
                  bucket = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
              } else {
                  bucket = Math.floor(t / bucketMs) * bucketMs;
              }
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
        { label: 'Total P/L', data: pts.map(p => p.total), yAxisID: 'y', borderColor: text, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true },
        { label: 'Realized P/L', data: pts.map(p => p.realized), yAxisID: 'y', borderColor: green, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true },
        { label: 'Open P/L', data: pts.map(p => p.open), yAxisID: 'y', borderColor: blue, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true },
        { label: 'Portfolio Return %', data: totalPctData, yAxisID: 'y1', borderColor: yellow, borderDash: [5, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true },
        { label: 'Nasdaq %', data: nasdaqData, yAxisID: 'y1', borderColor: cyan, borderDash: [5, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true },
        { label: 'S&P 500 %', data: sp500Data, yAxisID: 'y1', borderColor: cssVar('--orange'), borderDash: [5, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true },
        { label: 'Dow %', data: dowData, yAxisID: 'y1', borderColor: cssVar('--red'), borderDash: [5, 5], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.1, spanGaps: true }
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
            ticks: { color: cssVar('--muted'), callback: v => (typeof v === 'number' ? parseFloat(v.toFixed(2)) : v) + '%' } 
        }
      }
    }
  });
}

let drawdownChart = null;
export function renderDrawdownChart(tf = '24h') {
  const equityHistory = /** @type {any} */ (DATA).equityHistory;
  if (!equityHistory || equityHistory.length === 0) {
    const wrap = document.getElementById('chartDrawdown')?.parentElement;
    if (wrap) wrap.innerHTML = '<div class="insufficient" style="height:100%; display:flex; align-items:center; justify-content:center;">Waiting for more data points.</div>';
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
  if (tf === '24h') bucketMs = 60 * 60 * 1000;
  else if (tf === '7d') bucketMs = 4 * 3600 * 1000;
  else if (tf === '30d') bucketMs = 86400 * 1000;
  else if (tf === '12m') bucketMs = 7 * 86400 * 1000;
  
  if (bucketMs > 0) {
      const buckets = {};
      const recentPoints = [];
      const oneHourAgo = now.getTime() - 60 * 60 * 1000;
      
      pts.forEach(p => {
          const d = new Date(p.timestamp);
          const t = d.getTime();
          if (tf === '24h' && t >= oneHourAgo) {
              recentPoints.push(p);
          } else {
              let bucket;
              if (tf === '30d') {
                  bucket = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
              } else {
                  bucket = Math.floor(t / bucketMs) * bucketMs;
              }
              buckets[bucket] = p; // keep last in bucket
          }
      });
      pts = Object.keys(buckets).sort().map(k => buckets[k]).concat(recentPoints);
      pts = pts.filter((item, pos, ary) => pos === 0 || item !== ary[pos - 1]);
  }

  const wrap = document.getElementById('chartDrawdown')?.parentElement;
  if (!wrap) return;

  if (pts.length < 2) {
    if (!wrap.querySelector('.insufficient')) {
        wrap.innerHTML = '<canvas id="chartDrawdown"></canvas><div class="insufficient" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; text-align:center;">Not enough data points yet.</div>';
    }
  } else {
    if (wrap.querySelector('.insufficient')) {
        wrap.innerHTML = '<canvas id="chartDrawdown"></canvas>';
    }
  }
  
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('chartDrawdown'));
  if (!canvas) return;
  
  if (drawdownChart) drawdownChart.destroy();

  const labels = pts.map((p) => {
      const d = new Date(p.timestamp);
      if (tf === '24h') return d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      if (tf === '7d') return d.toLocaleDateString([], {month: 'short', day: 'numeric'}) + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      if (tf === '30d') return d.toLocaleDateString([], {month: 'short', day: 'numeric'});
      return d.toLocaleDateString([], {year: 'numeric', month: 'short'});
  });

  // Build an indexed equity curve immune to cash deposits/withdrawals
  // We track the percentage change in Total P/L relative to the Invested capital at that moment.
  const eqMap = new Map();
  let currentIndex = 100;
  let runningPeak = 100;
  
  for (let i = 0; i < equityHistory.length; i++) {
      const p = equityHistory[i];
      if (i > 0) {
          const prev = equityHistory[i - 1];
          const delta = (p.total || 0) - (prev.total || 0);
          // If there is active capital, calculate the return. Otherwise 0.
          // We use the max of current or previous invested to be conservative during trades.
          const activeCapital = Math.max(p.invested || 0, prev.invested || 0);
          const r = activeCapital > 0 ? (delta / activeCapital) : 0;
          currentIndex = currentIndex * (1 + r);
      }
      
      if (currentIndex > runningPeak) runningPeak = currentIndex;
      const dd = runningPeak > 0 ? ((currentIndex - runningPeak) / runningPeak) * 100 : 0;
      eqMap.set(p.timestamp, dd);
  }
  
  const ddData = pts.map(p => eqMap.get(p.timestamp) || 0);

  drawdownChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { 
          label: 'Drawdown %', 
          data: ddData, 
          borderColor: 'rgba(231, 76, 60, 1)', 
          backgroundColor: 'rgba(231, 76, 60, 0.2)',
          fill: true,
          borderWidth: 2, 
          pointRadius: 0, 
          pointHoverRadius: 4, 
          tension: 0.1 
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { 
            mode: 'index', intersect: false, 
            callbacks: { 
                label: c => {
                    return c.dataset.label + ': ' + c.raw.toFixed(2) + '%';
                }
            } 
        }
      },
      scales: {
        x: { grid: { color: cssVar('--border') }, ticks: { color: cssVar('--muted'), maxTicksLimit: 8 } },
        y: { 
            type: 'linear', display: true, position: 'left',
            grid: { color: cssVar('--border') }, 
            ticks: { color: cssVar('--muted'), callback: v => (typeof v === 'number' ? parseFloat(v.toFixed(2)) : v) + '%' },
            max: 0
        }
      }
    }
  });
}

let pnlChart = null;
let pnlTf = 'month'; // 'month', 'year'
let pnlYearGroup = 'month'; // 'week', 'month', 'quarter'
let pnlCurrentDate = new Date(); // To track current month/year being viewed

export function setPnlTf(tf) { pnlTf = tf; renderRealizedPnlChart(); }
export function setPnlYearGroup(group) { pnlYearGroup = group; renderRealizedPnlChart(); }
export function shiftPnlDate(dir) {
    if (pnlTf === 'month') {
        pnlCurrentDate.setMonth(pnlCurrentDate.getMonth() + dir);
    } else {
        pnlCurrentDate.setFullYear(pnlCurrentDate.getFullYear() + dir);
    }
    renderRealizedPnlChart();
}

function getWeekNumber(d) {
    const dStr = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = dStr.getUTCDay() || 7;
    dStr.setUTCDate(dStr.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dStr.getUTCFullYear(),0,1));
    return Math.ceil((((dStr.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
}

export function renderRealizedPnlChart() {
    if (!DATA || !DATA.entries) return;
    
    // 1. Gather all closed lots and compute P/L
    let allLots = [];
    DATA.entries.forEach(e => {
        if (e.lots) {
            e.lots.forEach(lot => {
                if (lot.closedDate && lot.soldAt && lot.openRate && lot.units) {
                    const pl = (lot.soldAt - lot.openRate) * lot.units;
                    allLots.push({ date: new Date(lot.closedDate), pl: pl });
                }
            });
        }
    });
    
    // Sort lots by date
    allLots.sort((a, b) => a.date - b.date);

    const canvas = document.getElementById('chartRealizedPnl');
    if (!canvas) return;

    // 2. Filter by timeframe
    let filteredLots = [];
    const year = pnlCurrentDate.getFullYear();
    const month = pnlCurrentDate.getMonth();
    
    if (pnlTf === 'month') {
        filteredLots = allLots.filter(l => l.date.getFullYear() === year && l.date.getMonth() === month);
        const monthNames = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ];
        document.getElementById('pnlLabel').textContent = `${monthNames[month]} ${year}`;
        /** @type {HTMLButtonElement} */ (document.getElementById('pnlPrevBtn')).disabled = allLots.length === 0 || (allLots[0].date.getFullYear() > year || (allLots[0].date.getFullYear() === year && allLots[0].date.getMonth() >= month));
        /** @type {HTMLButtonElement} */ (document.getElementById('pnlNextBtn')).disabled = allLots.length === 0 || (allLots[allLots.length-1].date.getFullYear() < year || (allLots[allLots.length-1].date.getFullYear() === year && allLots[allLots.length-1].date.getMonth() <= month));
        document.getElementById('pnlYearGroupToggles').style.display = 'none';
    } else {
        filteredLots = allLots.filter(l => l.date.getFullYear() === year);
        document.getElementById('pnlLabel').textContent = `${year}`;
        /** @type {HTMLButtonElement} */ (document.getElementById('pnlPrevBtn')).disabled = allLots.length === 0 || allLots[0].date.getFullYear() >= year;
        /** @type {HTMLButtonElement} */ (document.getElementById('pnlNextBtn')).disabled = allLots.length === 0 || allLots[allLots.length-1].date.getFullYear() <= year;
        document.getElementById('pnlYearGroupToggles').style.display = 'flex';
    }

    // 3. Group by bucket
    const buckets = {};
    if (pnlTf === 'month') {
        // Group by Day
        // Pre-fill all days in the month
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            buckets[`${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`] = 0;
        }
        filteredLots.forEach(l => {
            const dayStr = `${l.date.getFullYear()}-${String(l.date.getMonth()+1).padStart(2,'0')}-${String(l.date.getDate()).padStart(2,'0')}`;
            buckets[dayStr] += l.pl;
        });
    } else { // Year view
        if (pnlYearGroup === 'week') {
            // Group by Week
            for (let i = 1; i <= 52; i++) buckets[`W${i}`] = 0;
            filteredLots.forEach(l => {
                const w = getWeekNumber(l.date);
                if (buckets[`W${w}`] !== undefined) buckets[`W${w}`] += l.pl;
                else buckets[`W${w}`] = l.pl;
            });
        } else if (pnlYearGroup === 'month') {
            // Group by Month
            const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            shortMonths.forEach(m => buckets[m] = 0);
            filteredLots.forEach(l => {
                const m = shortMonths[l.date.getMonth()];
                buckets[m] += l.pl;
            });
        } else if (pnlYearGroup === 'quarter') {
            // Group by Quarter
            ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => buckets[q] = 0);
            filteredLots.forEach(l => {
                const q = Math.floor(l.date.getMonth() / 3) + 1;
                buckets[`Q${q}`] += l.pl;
            });
        }
    }

    const labels = Object.keys(buckets);
    const data = labels.map(k => buckets[k]);
    const bgColors = data.map(v => v >= 0 ? cssVar('--green') : cssVar('--red'));

    if (pnlChart) pnlChart.destroy();
    
    // Check if there is data
    const wrap = canvas.parentElement;
    if (data.every(v => v === 0)) {
        if (!wrap.querySelector('.insufficient')) {
            wrap.innerHTML = '<canvas id="chartRealizedPnl"></canvas><div class="insufficient" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:100%; text-align:center;">No realized P/L for this period.</div>';
        }
    } else {
        if (wrap.querySelector('.insufficient')) {
            wrap.innerHTML = '<canvas id="chartRealizedPnl"></canvas>';
        }
    }

    const newCanvas = document.getElementById('chartRealizedPnl');
    pnlChart = new Chart(newCanvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Realized P/L',
                data: data,
                backgroundColor: bgColors,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => '$' + c.raw.toFixed(2)
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: cssVar('--muted') } },
                y: { 
                    type: 'linear', display: true, position: 'left',
                    grid: { color: cssVar('--border') }, 
                    ticks: { color: cssVar('--muted'), callback: v => '$' + v } 
                }
            }
        }
    });
}


function getTickerName(ticker) {
  if (window.ETORO_CACHE && window.ETORO_CACHE[ticker] && window.ETORO_CACHE[ticker].name) return window.ETORO_CACHE[ticker].name;
  if (DATA && DATA.entries) {
    const e = DATA.entries.find(x => x.ticker === ticker);
    if (e && e.name) return e.name;
  }
  if (typeof PORTFOLIO !== 'undefined' && PORTFOLIO && PORTFOLIO.holdings) {
    const h = PORTFOLIO.holdings.find(x => x.ticker === ticker);
    if (h && h.name) return h.name;
  }
  return '';
}

export function renderHistoryTab() {
  const table = document.getElementById('historyTable');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const state = sortState.history || { key: 'closeTimestamp', dir: -1 };
  markSortedHeader(table, state);

  let h = DATA.tradeHistory || [];
  if (window.ETORO_CACHE) {
    const rev = {};
    for (const [k, v] of Object.entries(window.ETORO_CACHE)) {
        rev[v.InstrumentID] = k;
    }
    for (const t of h) {
      if (!t.ticker && t.instrumentId && rev[t.instrumentId]) {
        t.ticker = rev[t.instrumentId];
      }
    }
  }

  if (searchQuery) h = h.filter(t => matchesSearch(t, searchQuery));

  let wins = 0, total = 0, profit = 0, fees = 0;
  for (const t of h) {
    total++;
    if (t.netProfit > 0) wins++;
    profit += (t.netProfit || 0);
    fees += (t.fees || 0);
  }

  h = [...h].sort((a, b) => {
    let va = a[state.key];
    let vb = b[state.key];
    if (state.key === 'ticker') {
        va = a.ticker || String(a.instrumentId);
        vb = b.ticker || String(b.instrumentId);
    }
    if (va < vb) return -state.dir;
    if (va > vb) return state.dir;
    return 0;
  });

  let html = '';
  for (const t of h) {
    let name = getTickerName(t.ticker);
    let tickerHtml = t.ticker ? tickerLink(t.ticker) : esc(String(t.instrumentId));
    if (name) tickerHtml += '<span class="sub">' + esc(name) + '</span>';
    html += `<tr>
      <td>${tickerHtml}</td>
      <td>${t.isBuy ? 'Buy' : 'Sell'}</td>
      <td>${localDate(t.openTimestamp)}</td>
      <td>${localDate(t.closeTimestamp)}</td>
      <td>${fmtPrice(t.openRate)}</td>
      <td>${fmtPrice(t.closeRate)}</td>
      <td>${(t.units || 0).toFixed(2)}</td>
      <td class="${t.netProfit >= 0 ? 'pos' : 'neg'}">${fmtMoney(t.netProfit)}</td>
      <td class="${t.fees > 0 ? 'neg' : (t.fees < 0 ? 'pos' : '')}">${fmtMoney(t.fees)}</td>
    </tr>`;
  }
  tbody.innerHTML = html;

  const vWin = document.getElementById('hWinRate');
  if (vWin) vWin.textContent = total > 0 ? (wins / total * 100).toFixed(1) + '%' : '-';
  const vReal = document.getElementById('hRealized');
  if (vReal) { vReal.textContent = fmtMoney(profit); vReal.className = 'value ' + (profit >= 0 ? 'pos' : 'neg'); }
  const vFees = document.getElementById('hFees');
  if (vFees) vFees.textContent = fmtMoney(fees);
  const vTrades = document.getElementById('hTrades');
  if (vTrades) vTrades.textContent = String(total);
  setSearchCount(total);
  
  const vHistDate = document.getElementById('infoHistStartDate');
  if (vHistDate && (DATA.tradeHistory || []).length > 0) {
     const earliest = DATA.tradeHistory.reduce((min, t) => t.closeTimestamp < min ? t.closeTimestamp : min, DATA.tradeHistory[0].closeTimestamp);
     vHistDate.textContent = 'Historical data goes back to: ' + localDate(earliest);
  }
}

export function renderCommoditiesTab() {
  let h = DATA.tradeHistory || [];
  if (window.ETORO_CACHE) {
    const rev = {};
    for (const [k, v] of Object.entries(window.ETORO_CACHE)) {
        rev[v.InstrumentID] = k;
    }
    for (const t of h) {
      if (!t.ticker && t.instrumentId && rev[t.instrumentId]) {
        t.ticker = rev[t.instrumentId];
      }
      const comms = ['GOLD', 'SILVER', 'OIL', 'COPPER', 'PLATINUM', 'PALLADIUM', 'NATGAS', 'COFFEE.FUT', 'COTTON.FUT', 'WHEAT', 'CORN', 'SUGAR', 'COCOA.FUT'];
      if (comms.includes(t.ticker) || (window.ETORO_CACHE[t.ticker] && (window.ETORO_CACHE[t.ticker].Industry === 'Commodities' || window.ETORO_CACHE[t.ticker].Sector === 'Commodities'))) {
        t.sector = 'Commodities';
      }
    }
  }
  h = h.filter(t => t.sector === 'Commodities');
  if (searchQuery) h = h.filter(t => matchesSearch(t, searchQuery));

  let wins = 0, total = 0, profit = 0;
  let mornW = 0, mornT = 0;
  let aftW = 0, aftT = 0;
  let qW = 0, qT = 0;
  
  for (const t of h) {
    total++;
    if (t.netProfit > 0) wins++;
    profit += (t.netProfit || 0);
    
    const dOpen = new Date(t.openTimestamp);
    const dClose = new Date(t.closeTimestamp);
    const isMorn = dOpen.getHours() < 12;
    if (isMorn) { mornT++; if (t.netProfit > 0) mornW++; }
    else { aftT++; if (t.netProfit > 0) aftW++; }
    
    const hrs = (dClose.getTime() - dOpen.getTime()) / 3600000;
    if (hrs < 1) { qT++; if (t.netProfit > 0) qW++; }
    t.duration = hrs;
  }
  
  const commHistoryTable = document.getElementById('commHistoryTable');
  if (commHistoryTable) {
      const state = sortState.commHistory || { key: 'closeTimestamp', dir: -1 };
      markSortedHeader(commHistoryTable, state);
      h = [...h].sort((a, b) => {
        let va = a[state.key];
        let vb = b[state.key];
        if (state.key === 'ticker') {
            va = a.ticker || String(a.instrumentId);
            vb = b.ticker || String(b.instrumentId);
        }
        if (va < vb) return -state.dir;
        if (va > vb) return state.dir;
        return 0;
      });
      let histHtml = '';
      for (const t of h) {
        let name = getTickerName(t.ticker);
        let tickerHtml = tickerLink(t.ticker);
        if (name) tickerHtml += '<span class="sub">' + esc(name) + '</span>';
        let durStr = t.duration < 1 ? Math.round(t.duration * 60) + 'm' : (t.duration < 24 ? Math.round(t.duration) + 'h' : Math.round(t.duration/24) + 'd');
        histHtml += `<tr>
          <td>${tickerHtml}</td>
          <td>${t.isBuy ? 'Buy' : 'Sell'}</td>
          <td>${durStr}</td>
          <td class="${t.netProfit >= 0 ? 'pos' : 'neg'}">${fmtMoney(t.netProfit)}</td>
          <td class="${t.fees > 0 ? 'neg' : (t.fees < 0 ? 'pos' : '')}">${fmtMoney(t.fees)}</td>
        </tr>`;
      }
      const tbodyHist = commHistoryTable.querySelector('tbody');
      if (tbodyHist) tbodyHist.innerHTML = histHtml;
  }
  
  const vWin = document.getElementById('cWinRate');
  if(vWin) vWin.textContent = total > 0 ? (wins / total * 100).toFixed(1) + '%' : '-';
  const vPnl = document.getElementById('cRealized');
  if(vPnl) { vPnl.textContent = fmtMoney(profit); vPnl.className = 'value ' + (profit >= 0 ? 'pos' : 'neg'); }
  const vMorn = document.getElementById('cMorning');
  if(vMorn) vMorn.textContent = mornT > 0 ? (mornW / mornT * 100).toFixed(1) + '%' + ' (' + mornT + ')' : '-';
  const vAft = document.getElementById('cAfternoon');
  if(vAft) vAft.textContent = aftT > 0 ? (aftW / aftT * 100).toFixed(1) + '%' + ' (' + aftT + ')' : '-';
  const vQuick = document.getElementById('cQuick');
  if(vQuick) vQuick.textContent = qT > 0 ? (qW / qT * 100).toFixed(1) + '%' + ' (' + qT + ')' : '-';
  
  const totalsMap = {};
  for (const t of (DATA.tradeHistory || [])) {
    if (t.sector !== 'Commodities') continue;
    if (!totalsMap[t.ticker]) totalsMap[t.ticker] = { ticker: t.ticker, realized: 0, maxProfit: 0, maxLoss: 0, wins: 0, trades: 0, fees: 0 };
    const m = totalsMap[t.ticker];
    m.trades++;
    m.realized += (t.netProfit || 0);
    m.fees += (t.fees || 0);
    if ((t.netProfit || 0) > m.maxProfit) m.maxProfit = t.netProfit;
    if ((t.netProfit || 0) < m.maxLoss) m.maxLoss = t.netProfit;
    if (t.netProfit > 0) m.wins++;
  }
  let totalsArr = Object.values(totalsMap);
  const tTable = document.getElementById('commTotalsTable');
  if (tTable) {
      const state = sortState.commTotals || { key: 'realized', dir: -1 };
      markSortedHeader(tTable, state);
      totalsArr = totalsArr.sort((a, b) => {
        let va = a[state.key];
        let vb = b[state.key];
        if (state.key === 'winRate') {
            va = a.trades ? (a.wins/a.trades) : 0;
            vb = b.trades ? (b.wins/b.trades) : 0;
        }
        if (va < vb) return -state.dir;
        if (va > vb) return state.dir;
        return 0;
      });
      let totHtml = '';
      for (const m of totalsArr) {
        let name = getTickerName(m.ticker);
        let tickerHtml = tickerLink(m.ticker);
        if (name) tickerHtml += '<span class="sub">' + esc(name) + '</span>';
        let winStr = m.trades ? (m.wins / m.trades * 100).toFixed(1) + '%' : '-';
        totHtml += `<tr>
          <td>${tickerHtml}</td>
          <td class="${m.realized >= 0 ? 'pos' : 'neg'}">${fmtMoney(m.realized)}</td>
          <td class="pos">${fmtMoney(m.maxProfit)}</td>
          <td class="neg">${fmtMoney(m.maxLoss)}</td>
          <td>${winStr}</td>
          <td>${m.trades}</td>
          <td class="${m.fees > 0 ? 'neg' : (m.fees < 0 ? 'pos' : '')}">${fmtMoney(m.fees)}</td>
        </tr>`;
      }
      const tbodyTot = tTable.querySelector('tbody');
      if (tbodyTot) tbodyTot.innerHTML = totHtml;
  }
  
  const actTable = document.getElementById('commActiveTable');
  if (actTable) {
      let active = (PORTFOLIO.holdings || []).filter(p => {
        const comms = ['GOLD', 'SILVER', 'OIL', 'COPPER', 'PLATINUM', 'PALLADIUM', 'NATGAS', 'COFFEE.FUT', 'COTTON.FUT', 'WHEAT', 'CORN', 'SUGAR', 'COCOA.FUT'];
        return p.sector === 'Commodities' || comms.includes(p.ticker) || (window.ETORO_CACHE && window.ETORO_CACHE[p.ticker] && (window.ETORO_CACHE[p.ticker].Industry === 'Commodities' || window.ETORO_CACHE[p.ticker].Sector === 'Commodities'));
      });
      let expandedActive = [];
      for (const p of active) {
        if (p.lots && p.lots.length > 0) {
          for (const lot of p.lots) {
            const isBuy = lot.isBuy !== false;
            const pl = isBuy ? (p.currentPrice - lot.openRate) * lot.units : (lot.openRate - p.currentPrice) * lot.units;
            expandedActive.push({
              ...p,
              firstOpen: lot.openDate || p.firstOpen,
              avgOpen: lot.openRate || p.avgOpen,
              units: lot.units,
              plDollar: pl,
              positionID: lot.positionID,
              isBuy: isBuy
            });
          }
        } else {
          expandedActive.push(p);
        }
      }
      active = expandedActive;
      if (searchQuery) active = active.filter(t => matchesSearch(t, searchQuery));
      const state = sortState.commActive || { key: 'firstOpen', dir: -1 };
      markSortedHeader(actTable, state);
      active = [...active].sort((a, b) => {
        let va = a[state.key];
        let vb = b[state.key];
        if (va < vb) return -state.dir;
        if (va > vb) return state.dir;
        return 0;
      });
      let actHtml = '';
      for (const p of active) {
        let name = getTickerName(p.ticker);
        let tickerHtml = tickerLink(p.ticker);
        if (p.isBuy === false) tickerHtml += ' <span style="font-size:10px; padding:2px 4px; border-radius:3px; background:var(--neg-bg); color:var(--neg); margin-left:6px; vertical-align:middle; line-height:1;">SHORT</span>';
        if (name) tickerHtml += '<span class="sub">' + esc(name) + '</span>';
        actHtml += `<tr>
          <td>${tickerHtml}</td>
          <td>${localDate(p.firstOpen)}</td>
          <td>${fmtPrice(p.avgOpen)}</td>
          <td>${fmtPrice(p.currentPrice)}</td>
          <td>${(p.units || 0).toFixed(2)}</td>
          <td class="${p.plDollar >= 0 ? 'pos' : 'neg'}">${fmtMoney(p.plDollar)}</td>
        </tr>`;
      }
      const tbodyAct = actTable.querySelector('tbody');
      if (tbodyAct) tbodyAct.innerHTML = actHtml;
      setSearchCount(total + active.length);
  } else {
      setSearchCount(total);
  }
}
