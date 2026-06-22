// @ts-check
import { DATA, PORTFOLIO, modalChart, setModalChart, SECTOR_COLORS, SECTORS, searchQuery } from './state.js';
import { fmtPrice, fmtPL, fmtPct, fmtMoney, tickerLink, esc, realizedPL, unrealizedPL, today } from './utils.js';

/**
 * @param {HTMLElement} table
 * @param {{key: string, dir: number}} options
 */
export function markSortedHeader(table, { key, dir }) {
  table.querySelectorAll('th[data-key]').forEach(th => {
    th.classList.toggle('sorted-asc', /** @type {HTMLElement} */ (th).dataset.key === key && dir === 1);
    th.classList.toggle('sorted-desc', /** @type {HTMLElement} */ (th).dataset.key === key && dir === -1);
  });
}

/**
 * @param {string} msg
 * @param {string} [type]
 */
export function banner(msg, type) {
  const el = /** @type {HTMLElement} */ (document.getElementById('banner'));
  if (el) {
    el.textContent = msg;
    el.className = type === 'success' ? 'success' : '';
    el.style.display = msg ? 'block' : 'none';
  }
}

/**
 * @param {number} n
 */
export function setSearchCount(n) {
  const el = /** @type {HTMLElement} */ (document.getElementById('searchCount'));
  if (el) el.textContent = searchQuery ? n + ' result' + (n === 1 ? '' : 's') : '';
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

/**
 * @param {string} title
 * @param {string} impact
 * @param {string} forecast
 * @param {string} previous
 * @param {string} country
 * @param {string} date
 */
export function openMacroModal(title, impact, forecast, previous, country, date) {
  const scenarioHTML = getMacroScenario(title);
  const contextHTML = getMacroContext(title, forecast, previous);
  const safeTitle = esc(title);
  
  /** @type {HTMLElement} */ (document.getElementById('macroModalBody')).innerHTML = 
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
  /** @type {HTMLElement} */ (document.getElementById('macroModal')).hidden = false;
}
// @ts-ignore
window.openMacroModal = openMacroModal;

/**
 * @param {string} id
 */
export function openModal(id) {
  let e = DATA.entries.find(x => x.id === id);
  if (!e) e = DATA.entries.find(x => x.ticker === id);
  if (!e) return;
  const notes = e.notes || [];
  const links = Array.isArray(e.sources) ? e.sources : [];
  /** @type {HTMLElement} */ (document.getElementById('modalBody')).innerHTML =
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
        (Array.isArray(e.lots) && e.lots.some(l => l.exitEstimated) ? '<span class="badge est">estimated exit</span>' : '') +
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
  /** @type {HTMLElement} */ (document.getElementById('modal')).hidden = false;
  drawModalChart(e);
}

/**
 * @param {import('./state.js').AdviceEntry} e
 */
export function drawModalChart(e) {
  if (modalChart) { modalChart.destroy(); setModalChart(null); }
  let hist = [...(e.priceHistory || [])];
  if (e.firstAdvised) {
    hist = hist.filter(h => h.date >= e.firstAdvised);
  }
  if (e.priceAtAdvice != null && e.firstAdvised) {
    if (hist.length === 0 || hist[0].price !== e.priceAtAdvice || hist[0].date.indexOf(e.firstAdvised) !== 0) {
      hist.unshift({ date: e.firstAdvised + ' (Added)', price: e.priceAtAdvice });
    }
  }
  const canvas = /** @type {HTMLElement} */ (document.getElementById('modalChartCanvas'));
  if (!canvas || hist.length < 1) return;
  const t = today();
  const labels = hist.map(h => {
    if (!h.date) return '';
    let dStr = h.date;
    const isAdded = dStr.includes('(Added)');
    if (isAdded) dStr = dStr.replace(' (Added)', '');
    
    let label = '';
    if (dStr.length > 10) {
      label = dStr.slice(11, 16);
    } else {
      label = dStr;
    }
    return label + (isAdded ? ' (Added)' : '');
  });
  const datasets = [{ label: 'Price', data: hist.map(h => h.price), 
    borderColor: '#3b82f6', borderWidth: 3, pointRadius: 3, tension: 0.4,
    fill: true, backgroundColor: 'rgba(59, 130, 246, 0.1)',
    pointBackgroundColor: '#3b82f6', pointBorderColor: '#fff', pointBorderWidth: 1 }];
  const extraDatasetProps = {
    tension: 0,
    fill: false,
    backgroundColor: 'transparent',
    pointBackgroundColor: '#fff',
    pointBorderColor: '#fff',
    pointBorderWidth: 1
  };
  if (e.buyBelow != null) datasets.push({ label: 'Buy below', data: labels.map(() => e.buyBelow),
    borderColor: '#2ecc71', borderDash: [5, 5], borderWidth: 1, pointRadius: 0, ...extraDatasetProps });
  if (e.dropBelow != null) datasets.push({ label: 'Drop below', data: labels.map(() => e.dropBelow),
    borderColor: '#e74c3c', borderDash: [5, 5], borderWidth: 1, pointRadius: 0, ...extraDatasetProps });
  if (e.dropAbove != null) datasets.push({ label: 'Drop above', data: labels.map(() => e.dropAbove),
    borderColor: '#8b98a5', borderDash: [5, 5], borderWidth: 1, pointRadius: 0, ...extraDatasetProps });

  if (e.boughtAt && e.status === 'bought') {
    datasets.push({ label: 'Bought', data: labels.map(() => e.boughtAt),
      borderColor: '#3498db', borderDash: [2, 2], borderWidth: 1, pointRadius: 0, ...extraDatasetProps });
    
    datasets.push({ label: 'TSL Target (+5%)', data: labels.map(() => e.boughtAt * 1.05),
      borderColor: '#f1c40f', borderDash: [2, 2], borderWidth: 1, pointRadius: 0, ...extraDatasetProps });
  }

  // @ts-ignore
  setModalChart(new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      maintainAspectRatio: false,
      plugins: { 
        legend: { labels: { color: '#e6edf3' } },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              return hist[idx] ? hist[idx].date : items[0].label;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8b98a5' }, grid: { color: '#2a3441', drawBorder: false } },
        y: { ticks: { color: '#8b98a5' }, grid: { color: '#2a3441', drawBorder: false } }
      }
    }
  }));
}

export function closeModal() {
  const m = /** @type {HTMLElement} */ (document.getElementById('modal'));
  const mm = /** @type {HTMLElement} */ (document.getElementById('macroModal'));
  if (m) m.hidden = true;
  if (mm) mm.hidden = true;
  if (modalChart) { modalChart.destroy(); setModalChart(null); }
}

/**
 * @param {Date} nyDate
 */
export function updateMacroTimers(nyDate) {
  document.querySelectorAll('.macro-timer').forEach(el => {
    const element = /** @type {HTMLElement} */ (el);
    const timeStr = element.dataset.time;
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
    
    const diffMs = eventTime.getTime() - nyDate.getTime();
    if (diffMs < 0) {
      element.textContent = " (Passed)";
      element.style.color = "var(--muted)";
    } else {
      const diffS = Math.floor(diffMs / 1000);
      const hrs = Math.floor(diffS / 3600);
      const mins = Math.floor((diffS % 3600) / 60);
      const secs = String(diffS % 60).padStart(2, '0');
      if (hrs > 0) {
        element.textContent = ` (in ${hrs}h ${mins}m)`;
      } else {
        element.textContent = ` (in ${mins}m ${secs}s)`;
        element.style.color = "var(--orange)";
      }
    }
  });
}