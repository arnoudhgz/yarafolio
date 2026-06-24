// @ts-check
import { DATA, PORTFOLIO, currentFilter, posFilter, activeTab, portfolioViewMode, LEARN, analyticsCharts, canSave, SECTORS, SECTOR_COLORS, sortState, setSectorChart, setSectorCoverageChart, sectorChart, sectorCoverageChart, setPortfolioRendered, Chart, marked, searchQuery } from './state.js';
import { advised, latestPrice, changePct, fmtPct, esc, tickerLink, fmtPrice, fmtMoney, fmtPL, matchesSearch, sortRows, cssVar, localDate, advisedFor } from './utils.js';
import { markSortedHeader, setSearchCount } from './ui.js';

export function renderAll() {
  const entries = advised();
  /** @type {HTMLElement} */ (document.getElementById('lastUpdated')).textContent =
    'Last updated: ' + DATA.lastUpdated + ' · ' + entries.length + ' advised picks · ' +
    PORTFOLIO.holdings.length + ' holdings';
  /** @type {HTMLElement} */ (document.getElementById('cTracked')).textContent = String(entries.length);
  /** @type {HTMLElement} */ (document.getElementById('cOpen')).textContent = String(entries.filter(e => e.status === 'bought').length);
  /** @type {HTMLElement} */ (document.getElementById('cWatching')).textContent = String(entries.filter(e => e.status === 'watching').length);
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
    return '<button class="drop" data-act="drop" data-id="' + e.id + '">Drop</button>';
  }
  if (e.status === 'dropped') {
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
      openDate: lot.openDate,
      openDateTime: lot.openDateTime,
      closedDate: lot.closedDate,
      ticker: e.ticker,
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

  const rows = sortRows(all.filter(r => {
    if (!matchesSearch([r.ticker, r.e.name, r.e.reason, r.e.sector])) return false;
    if (posFilter === 'open') return r.status === 'bought';
    if (posFilter === 'closed') return r.status === 'sold';
    if (posFilter === 'needsconfirm') return r.exitEstimated;
    return true;
  }), sortState.positions);
  if (activeTab === 'positions') setSearchCount(rows.length);
  markSortedHeader(/** @type {HTMLElement} */ (document.getElementById('positionsTable')), sortState.positions);
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

export function renderPortfolio() {
  renderSectorCoverage();
  renderSectorChart();
  renderPortfolioTable();
  setPortfolioRendered(true);
}

export function renderPortfolioTable() {
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
  const emptyMsgEl = /** @type {HTMLElement} */ (document.getElementById('portfolioEmpty'));
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
        x: { min: 0, ticks: { color: '#8b98a5', callback: (v) => v + '%' }, grid: { color: '#2a3441' } },
        y: { ticks: { color: '#e6edf3' }, grid: { display: false } }
      }
    }
  }));
}

let analyticsRendered = false;

export function renderAnalytics() {
  analyticsRendered = true;
  const empty = /** @type {HTMLElement} */ (document.getElementById('analyticsEmpty'));
  if (!LEARN) {
    /** @type {HTMLElement} */ (document.getElementById('analyticsCards')).innerHTML = '';
    /** @type {HTMLElement} */ (document.getElementById('sevenDayBox')).innerHTML = '';
    ['chartRating', 'chartRsiBand', 'chartSector', 'chartSource'].forEach(id => renderBucketChart(id, {}));
    empty.textContent = canSave ? 'No stats available yet. Run /learn to generate outcomes.'
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
  empty.textContent = 'Not enough finished advice yet to learn from. Outcomes appear once picks are sold, dropped, or 7+ days old.';
  empty.style.display = LEARN.measurableOutcomes ? 'none' : 'block';
}

export function renderBucketChart(canvasId, buckets) {
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

      let content = marked.parse(contentStr.trim());
      
      html += `
        <div class="ai-article">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
            <h3 style="margin:0; font-size:16px;">${title}</h3>
            <span style="font-size:12px; color:var(--muted);">${esc(s.timestamp || s.date || '')}</span>
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
            <span style="font-size:12px; color:var(--muted);">${esc(r.date || '')}</span>
          </div>
          <div style="line-height: 1.6; font-size: 14px;" class="article-content news-markdown">${content}</div>
        </div>
      `;
    }).join('');
  }
}