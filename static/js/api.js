// @ts-check
import { DATA, LEARN, setLEARN } from './state.js';
import { banner } from './ui.js';
import { today, nowStr, tickerLink, esc } from './utils.js';
import { renderAll } from './renderers.js';

async function save() {
  DATA.lastUpdated = nowStr();
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DATA, null, 2),
  });
  if (!res.ok) throw new Error(await res.text());
}

/**
 * @param {() => void} mutate
 */
export async function applyChange(mutate) {
  try {
    mutate();
    await save();
    banner('');
  } catch (err) {
    // @ts-ignore
    banner('Save failed (' + err.message + '). Is yarafolio.py still running?');
  }
  renderAll();
}

export async function loadLearn() {
  if (LEARN) return;
  for (const url of ['/api/stats', 'data/review-stats.json']) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) { setLEARN(await res.json()); return; }
    } catch (err) { /* try next source */ }
  }
  setLEARN(null);
}

export async function fetchMacro(force = false) {
  const btn = /** @type {HTMLButtonElement} */ (document.getElementById('refreshMacroBtn'));
  const loading = /** @type {HTMLElement} */ (document.getElementById('macroLoading'));
  const list = /** @type {HTMLElement} */ (document.getElementById('macroList'));
  const empty = /** @type {HTMLElement} */ (document.getElementById('macroEmpty'));
  
  btn.disabled = true;
  loading.style.display = 'block';
  list.innerHTML = '';
  empty.style.display = 'none';
  
  try {
    const url = force ? '/api/macro?force=1' : '/api/macro';
    const res = await fetch(url);
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
          const dateObj = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
          if (!isNaN(dateObj.getTime())) {
            displayDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const nyStr = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
            const nyDate = new Date(nyStr);
            const today = new Date(nyDate.getFullYear(), nyDate.getMonth(), nyDate.getDate());
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
          displayTime += ` <span class="macro-timer" data-time="${esc(e.time)}" style="color:var(--blue); font-size:11px; white-space:nowrap; font-variant-numeric:tabular-nums; display:inline-block; min-width:80px;"></span>`;
        }
        
        const jsDate = esc(displayDate).replace(/&#39;/g, "\\'");
        const jsTitle = esc(e.title).replace(/&#39;/g, "\\'");
        const jsImpact = esc(e.impact).replace(/&#39;/g, "\\'");
        const jsForecast = esc(e.forecast || '').replace(/&#39;/g, "\\'");
        const jsPrev = esc(e.previous || '').replace(/&#39;/g, "\\'");
        const jsCountry = esc(e.country || '').replace(/&#39;/g, "\\'");
        
        html += `<tr style="${rowStyle}" onclick="openMacroModal('${jsTitle}', '${jsImpact}', '${jsPrev}', '${jsForecast}', '${jsCountry}', '${jsDate}')">
          <td style="white-space: nowrap;">${displayDate}</td>
          <td>${displayTime}</td>
          <td style="font-weight:bold">${esc(e.country || '')}</td>
          <td style="color:${impactColor}">${esc(e.impact || '')}</td>
          <td>${esc(e.title || '')}</td>
          <td>${esc(e.forecast || '')}</td>
          <td>${esc(e.previous || '')}</td>
        </tr>`;
      }
      list.innerHTML = html;
      if (!html) {
        empty.textContent = "No (more) events this week";
        empty.style.display = 'block';
      }
    }
    /** @type {any} */ (window).macroLoaded = true;
  } catch (err) {
    const macroList = /** @type {HTMLElement} */ (document.getElementById('macroList'));
    macroList.innerHTML = '<tr><td colspan="7" class="insufficient">Failed to fetch macro calendar. <button type="button" class="retry-btn">Retry</button></td></tr>';
    macroList.querySelector('.retry-btn')?.addEventListener('click', () => fetchMacro(true));
  } finally {
    /** @type {HTMLElement} */ (document.getElementById('macroLoading')).style.display = 'none';
    btn.disabled = false;
  }
}

/**
 * @param {boolean} force
 */
export async function fetchIpos(force = false) {
  /** @type {HTMLElement} */ (document.getElementById('iposLoading')).style.display = 'block';
  try {
    const url = force ? '/api/ipos?force=1' : '/api/ipos';
    const res = await fetch(url);
    const data = await res.json();
    
    let html = '';
    let hasNearIpo = false;
    const nyStr = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
    const nyDate = new Date(nyStr);
    const now = new Date(nyDate.getFullYear(), nyDate.getMonth(), nyDate.getDate());
    const tomorrow = new Date(nyDate.getFullYear(), nyDate.getMonth(), nyDate.getDate() + 1);
    
    /**
     * @param {string} t
     * @returns {boolean}
     */
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
          const date = new Date(row.date);
          if (date && !isNaN(date.getTime())) {
            if (date.toDateString() === now.toDateString()) {
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

    /** @type {HTMLElement} */ (document.getElementById('iposBody')).innerHTML = html || '<tr><td colspan="6" class="empty">No IPOs found.</td></tr>';
    
    const tabBtn = /** @type {HTMLElement} */ (document.querySelector('button[data-tab="ipos"]'));
    if (hasNearIpo) {
      tabBtn.innerHTML = 'IPO Tracker <span class="blink" style="color:var(--green);font-weight:bold;margin-left:4px">●</span>';
    } else {
      tabBtn.innerHTML = 'IPO Tracker';
    }
    
    // apply current filter
    const activeFilter = /** @type {HTMLElement} */ (document.querySelector('#ipoFilters button.active'))?.dataset.ipofilter || 'listed';
    document.querySelectorAll('#iposBody tr').forEach(tr => {
      const trEl = /** @type {HTMLElement} */ (tr);
      if (trEl.children.length === 1) return;
      const st = trEl.getAttribute('data-ipostatus');
      let show = true;
      if (activeFilter === 'listed') show = (st !== 'dropped');
      if (activeFilter === 'dropped') show = (st === 'dropped');
      trEl.style.display = show ? '' : 'none';
    });

  } catch (err) {
    const iposBody = /** @type {HTMLElement} */ (document.getElementById('iposBody'));
    iposBody.innerHTML = '<tr><td colspan="6" class="empty" style="color:var(--red)">Failed to fetch IPOs. <button type="button" class="retry-btn">Retry</button></td></tr>';
    iposBody.querySelector('.retry-btn')?.addEventListener('click', () => fetchIpos());
  } finally {
    /** @type {HTMLElement} */ (document.getElementById('iposLoading')).style.display = 'none';
  }
}

/**
 * @param {string} ticker
 */
// @ts-ignore
window.markNotListed = async function(ticker) {
  const openConfirmModal = /** @type {any} */ (window).openConfirmModal;
  openConfirmModal(
    'Mark Not Listed',
    `Mark ${ticker} as permanently NOT listed on eToro?`,
    'Mark',
    'red',
    async () => {
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
  );
};