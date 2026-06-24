// @ts-check
import { DATA, PORTFOLIO, setDATA, setPORTFOLIO, setCanSave, activeTab, setActiveTab, LEARN, setLEARN, canSave, portfolioViewMode, setPortfolioViewMode, currentFilter, setCurrentFilter, posFilter, setPosFilter, newsFilter, setNewsFilter, ipoFilter, setIpoFilter, searchQuery, setSearchQuery, searchTimer, setSearchTimer, sortState, portfolioRendered, setPortfolioRendered, analyticsRendered } from './state.js';
import { today, esc, tickerLink } from './utils.js';
import { renderAll, renderTable, renderPositions, renderPortfolio, renderPortfolioTable, renderEOD, renderAINews, renderAnalytics, findLot } from './renderers.js';
import { banner, openModal, closeModal, updateMacroTimers } from './ui.js';
import { applyChange, fetchMacro, fetchIpos, loadLearn } from './api.js';
import { marketHolidays } from './holidays.js';

async function load() {
  try {
    const [logRes, pfRes, eodRes, newsRes] = await Promise.all([
      fetch('data/advice-log.json', { cache: 'no-store' }),
      fetch('data/portfolio.json', { cache: 'no-store' }),
      fetch('data/eod.md', { cache: 'no-store' }).catch(() => null),
      fetch('data/news.md', { cache: 'no-store' }).catch(() => null)
    ]);
    if (!logRes.ok) throw new Error(logRes.statusText);
    const logData = await logRes.json();
    
    if (eodRes && eodRes.ok) {
        const eodText = await eodRes.text();
        logData.eodReports = eodText.split("\n---\n\n").filter(b => b.trim()).map(block => {
            const lines = block.trim().split("\n");
            if (lines[0].startsWith("# ")) {
                return { date: lines[0].substring(2).trim(), summary: lines.slice(1).join("\n").trim() };
            }
            return { date: "", summary: block };
        });
    } else { logData.eodReports = []; }

    if (newsRes && newsRes.ok) {
        const newsText = await newsRes.text();
        logData.newsSummaries = newsText.split("\n---\n\n").filter(b => b.trim()).map(block => {
            const lines = block.trim().split("\n");
            if (lines[0].startsWith("# ")) {
                return { timestamp: lines[0].substring(2).trim(), summary: lines.slice(1).join("\n").trim() };
            }
            return { timestamp: "", summary: block };
        });
    } else { logData.newsSummaries = []; }

    setDATA(logData);
    setPORTFOLIO(pfRes.ok ? await pfRes.json() : { lastUpdated: null, totalInvested: 0, holdings: [] });
    setCanSave(location.protocol.startsWith('http'));
    if (!canSave) banner('Opened as a local file: buttons are disabled. Start with: python3 yarafolio.py');
    /** @type {HTMLElement} */ (document.getElementById('syncBtn')).style.display = canSave ? 'block' : 'none';
    if (canSave) {
      fetch('/api/locations').then(r => r.json()).then(data => {
        if (data.prefixes && data.prefixes.length > 0) {
          const sel = /** @type {HTMLSelectElement} */ (document.getElementById('locationSelect'));
          sel.innerHTML = data.prefixes.map(p => '<option value="' + esc(p) + '">' + esc(p) + '</option>').join('');
          sel.style.display = 'block';
          
          const saved = localStorage.getItem('etoroLocation');
          if (data.active !== undefined && data.active !== null) {
            sel.value = data.active;
            localStorage.setItem('etoroLocation', data.active);
          } else if (saved && data.prefixes.includes(saved)) {
            sel.value = saved;
          }
          sel.addEventListener('change', () => {
            localStorage.setItem('etoroLocation', sel.value);
          });
        }
      }).catch(() => {});
    }
    // @ts-ignore
    if (!window.updateTimerId) {
      // @ts-ignore
      window.updateTimerId = setInterval(updateTimer, 1000);
    }
    updateTimer();
  } catch (err) {
    banner('Could not load data/advice-log.json. Start the dashboard with: python3 yarafolio.py');
  }
  setPortfolioRendered(false);
  /* analyticsRendered handled in renderers */;
  setLEARN(null);  // refetch stats after data changes
  renderAll();
  // Restore sub-button filter states in UI
  const setFilterActive = (selector, value) => {
    const btn = document.querySelector(`${selector} [data-filter="${value}"], ${selector} [data-posfilter="${value}"], ${selector} [data-newsfilter="${value}"], ${selector} [data-ipofilter="${value}"]`);
    if (btn) {
      document.querySelectorAll(`${selector} button`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  };
  setFilterActive('#filters', currentFilter);
  setFilterActive('#posFilters', posFilter);
  setFilterActive('#rawNewsFilters', newsFilter);
  setFilterActive('#ipoFilters', ipoFilter);

  const savedTab = localStorage.getItem('activeTab');
  if (savedTab && savedTab !== 'advice') {
    const tabBtn = document.querySelector(`.tabs button[data-tab="${savedTab}"]`);
    if (tabBtn instanceof HTMLElement) tabBtn.click();
  }

  // Background check for near-term IPOs to update the tab dot
  if (/** @type {HTMLElement} */ (document.getElementById('iposBody')).innerHTML === '') {
    fetchIpos().catch(() => {});
  }
}

if (portfolioViewMode === 'split') {
  /** @type {HTMLElement} */ (document.getElementById('btnSplit')).classList.add('active');
  /** @type {HTMLElement} */ (document.getElementById('btnCollapse')).classList.remove('active');
} else {
  /** @type {HTMLElement} */ (document.getElementById('btnCollapse')).classList.add('active');
  /** @type {HTMLElement} */ (document.getElementById('btnSplit')).classList.remove('active');
}

/** @type {HTMLElement} */ (document.getElementById('btnCollapse')).addEventListener('click', () => {
  setPortfolioViewMode('collapsed');
  /** @type {HTMLElement} */ (document.getElementById('btnCollapse')).classList.add('active');
  /** @type {HTMLElement} */ (document.getElementById('btnSplit')).classList.remove('active');
  renderPortfolioTable();
});
/** @type {HTMLElement} */ (document.getElementById('btnSplit')).addEventListener('click', () => {
  setPortfolioViewMode('split');
  /** @type {HTMLElement} */ (document.getElementById('btnSplit')).classList.add('active');
  /** @type {HTMLElement} */ (document.getElementById('btnCollapse')).classList.remove('active');
  renderPortfolioTable();
});

/** @type {HTMLElement} */ (document.getElementById('macroModal')).addEventListener('click', e => {
  if (/** @type {HTMLElement} */ (e.target).id === 'macroModal') /** @type {HTMLElement} */ (document.getElementById('macroModal')).hidden = true;
});

document.querySelectorAll('.tabs button').forEach(b => {
  b.addEventListener('click', () => {
    localStorage.setItem('activeTab', /** @type {HTMLButtonElement} */ (b).dataset.tab);
    document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(x => { /** @type {HTMLElement} */ (x).style.display = 'none'; });
    b.classList.add('active');
    document.getElementById('tab-' + /** @type {HTMLButtonElement} */ (b).dataset.tab).style.display = 'block';

    if ((/** @type {HTMLButtonElement} */ (b)).dataset.tab === 'macro' && /** @type {HTMLElement} */ (document.getElementById('macroList')).innerHTML === '') {
      fetchMacro();
    }
    if ((/** @type {HTMLButtonElement} */ (b)).dataset.tab === 'ipos' && /** @type {HTMLElement} */ (document.getElementById('iposBody')).innerHTML === '') {
      fetchIpos();
    }
    const _tab = (/** @type {HTMLButtonElement} */ (b)).dataset.tab;
    const searchable = _tab === 'advice' || _tab === 'archive' || _tab === 'positions' || _tab === 'portfolio';
    /** @type {HTMLInputElement} */ (document.getElementById('search')).disabled = !searchable;
    setActiveTab(_tab);
    if (activeTab === 'advice') renderTable();

    else if (activeTab === 'positions') renderPositions();
    else if (activeTab === 'portfolio') { if (!portfolioRendered) renderPortfolio(); else renderPortfolioTable(); }
    else if (activeTab === 'eod') renderEOD();
    else if (activeTab === 'news') renderAINews();
    else /** @type {HTMLElement} */ (document.getElementById('searchCount')).textContent = '';
    if (activeTab === 'analytics') { loadLearn().then(renderAnalytics); }
      if (activeTab === 'rawnews' && !/** @type {any} */ (window).rawNewsLoaded) {
      /** @type {HTMLElement} */ (document.getElementById('refreshRawNewsBtn')).click();
    }
  });
});

/** @type {HTMLButtonElement} */ (document.getElementById('refreshRawNewsBtn')).addEventListener('click', async () => {
  const btn = /** @type {HTMLButtonElement} */ (document.getElementById('refreshRawNewsBtn'));
  const loading = /** @type {HTMLElement} */ (document.getElementById('newsLoading'));
  const content = /** @type {HTMLElement} */ (document.getElementById('newsContent'));
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
    
    allNews.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    
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
    const activeBtn = /** @type {HTMLElement} */ (document.querySelector('#rawNewsFilters button.active'));
    if (activeBtn) activeBtn.click();
    
    /** @type {any} */ (window).rawNewsLoaded = true;
  } catch (err) {
    banner('Failed to load news: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
    loading.style.display = 'none';
  }
});

/** @type {HTMLElement} */ (document.getElementById('refreshIposBtn')).addEventListener('click', () => fetchIpos(true));
/** @type {HTMLElement} */ (document.getElementById('refreshMacroBtn')).addEventListener('click', () => fetchMacro(true));

function headerSortHandler(tableId, stateKey, render) {
  document.querySelector('#' + tableId + ' thead').addEventListener('click', (ev) => {
    const th = /** @type {HTMLElement} */ (ev.target).closest('th[data-key]');
    if (!th) return;
    const state = sortState[stateKey];
    const key = th.getAttribute('data-key');
    if (state.key === key) state.dir = -state.dir;
    else { state.key = key; state.dir = -1; }
    localStorage.setItem('sortState', JSON.stringify(sortState));
    render();
  });
}
headerSortHandler('adviceTable', 'advice', renderTable);

headerSortHandler('positionsTable', 'positions', renderPositions);
headerSortHandler('portfolioTable', 'portfolio', renderPortfolioTable);

const adviceClickHandler = (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('button');
  if (!btn) {
    // ticker link goes to eToro; anything else on the row opens the drill-down
    if (/** @type {HTMLElement} */ (ev.target).closest('a')) return;
    const row = /** @type {HTMLElement} */ (ev.target).closest('tr[data-id]');
    if (row) openModal((/** @type {HTMLElement} */ (row)).dataset.id);
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
/** @type {HTMLElement} */ (document.querySelector('#adviceTable tbody')).addEventListener('click', adviceClickHandler);


/** @type {HTMLElement} */ (document.getElementById('filters')).addEventListener('click', (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('button');
  if (!btn) return;
  document.querySelectorAll('#filters button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  setCurrentFilter(btn.dataset.filter);
  renderTable();
});

/** @type {HTMLElement} */ (document.getElementById('posFilters')).addEventListener('click', (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('button');
  if (!btn) return;
  document.querySelectorAll('#posFilters button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  setPosFilter(btn.dataset.posfilter);
  renderPositions();
});

/** @type {HTMLElement} */ (document.getElementById('rawNewsFilters')).addEventListener('click', (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('button');
  if (!btn) return;
  document.querySelectorAll('#rawNewsFilters button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filter = btn.dataset.newsfilter;
  setNewsFilter(filter);
  document.querySelectorAll('.news-card').forEach(card => {
    const cardEl = /** @type {HTMLElement} */ (card);
    if (filter === 'all') cardEl.style.display = 'block';
    else if (filter === 'advised' && cardEl.dataset.status === 'watching') cardEl.style.display = 'block';
    else if (filter === 'etoro' && cardEl.dataset.status === 'bought') cardEl.style.display = 'block';
    else cardEl.style.display = 'none';
  });
});

/** @type {HTMLElement} */ (document.getElementById('ipoFilters')).addEventListener('click', (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('button');
  if (!btn) return;
  document.querySelectorAll('#ipoFilters button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filter = btn.dataset.ipofilter;
  setIpoFilter(filter);
  document.querySelectorAll('#iposBody tr').forEach(tr => {
    const row = /** @type {HTMLElement} */ (tr);
    if (row.children.length === 1) return; // header row
    const st = row.getAttribute('data-ipostatus');
    let show = true;
    if (filter === 'listed') show = (st !== 'dropped');
    if (filter === 'dropped') show = (st === 'dropped');
    row.style.display = show ? '' : 'none';
  });
});

/** @type {HTMLElement} */ (document.querySelector('#positionsTable tbody')).addEventListener('click', (ev) => {
  const btn = /** @type {HTMLElement} */ (ev.target).closest('button');
  if (!btn) {
    if (/** @type {HTMLElement} */ (ev.target).closest('input, a')) return;
    const rowEl = /** @type {HTMLElement} */ (ev.target).closest('tr[data-id]');
    if (rowEl) {
      const row = /** @type {HTMLElement} */ (rowEl);
      openModal(row.dataset.id, row.dataset.pos);
    }
    return;
  }
  const cell = /** @type {HTMLElement} */ (btn.closest('td'));
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

/** @type {HTMLElement} */ (document.getElementById('syncBtn')).addEventListener('click', async () => {
  const btn = /** @type {HTMLElement} */ (document.getElementById('syncBtn'));
  const sel = /** @type {HTMLSelectElement} */ (document.getElementById('locationSelect'));
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
    let errs = [];
    if (resRef.demo || resImp.demo) {
      banner('Simulated sync (Demo Mode)', 'success');
    } else {
      if (resRef.ok) msgs.push('Advised quotes updated (' + (resRef.refreshed || 0) + ')');
      else errs.push('Quotes: ' + (resRef.error || 'Failed'));
      
      if (resImp.ok) {
        let eMsg = 'synced';
        if (typeof resImp.merge === 'string') {
          const lines = resImp.merge.split('\n');
          const mergeLine = lines.find(l => l.startsWith('Merged:'));
          if (mergeLine) eMsg = mergeLine.replace('Merged: ', '').trim();
        }
        msgs.push('eToro: ' + eMsg);
      } else {
        errs.push('eToro: ' + (resImp.error || 'Failed'));
      }
      
      if (errs.length) {
        banner('Sync issues: ' + errs.join(' | '));
      } else if (msgs.length) {
        banner(msgs.join(' & ') + '!', 'success');
      } else {
        banner('Sync finished with no changes.');
      }
    }
    await load();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    banner('Sync failed (' + message + '). Is yarafolio.py still running?');
  } finally {
    btn.textContent = label;
    document.body.classList.remove('syncing');
  }
});

/** @type {HTMLElement} */ (document.getElementById('search')).addEventListener('input', (ev) => {
  clearTimeout(searchTimer);
  setSearchTimer(setTimeout(() => {
    setSearchQuery((/** @type {HTMLInputElement} */ (ev.target)).value.trim().toLowerCase());
    if (activeTab === 'advice') renderTable();
    else if (activeTab === 'positions') renderPositions();
    else if (activeTab === 'portfolio') renderPortfolioTable();
  }, 180));
});

const modalEl = /** @type {HTMLElement} */ (document.getElementById('modal'));
modalEl.addEventListener('click', (ev) => {
  if (ev.target === modalEl || /** @type {HTMLElement} */ (ev.target).closest('.modal-close')) closeModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (!modalEl.hidden) closeModal();
    document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(m => /** @type {HTMLElement} */ (m).hidden = true);
  }
});
document.addEventListener('click', (ev) => {
  if (ev.target instanceof HTMLElement && ev.target.classList.contains('modal-backdrop')) {
    ev.target.hidden = true;
  }
});

function updateTimer() {
  const nyDate = new Date(new Date().toLocaleString("en-US", {timeZone: "America/New_York"}));
  const day = nyDate.getDay();
  const yyyy = nyDate.getFullYear();
  const mm = String(nyDate.getMonth() + 1).padStart(2, '0');
  const dd = String(nyDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  const holidays = marketHolidays(yyyy);
  const holidayName = holidays.get(dateStr);

  let st = {
    status: "CLOSED",
    text: holidayName ? `MARKET CLOSED (${holidayName})` : "MARKET CLOSED",
    color: "var(--muted)",
    blink: false,
  };

  if (day === 0 || day === 6 || holidayName) {
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
  
  const el = /** @type {HTMLElement} */ (document.getElementById('marketTimer'));
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

load();

fetch('/api/version').then(r => r.json()).then(data => {
  let vHTML = `v${data.local}`;
  if (data.remote && data.remote !== "unknown" && data.remote !== data.local) {
    vHTML += ` <a href="https://github.com/arnoudhgz/yarafolio/releases/latest" target="_blank" style="color: var(--orange); margin-left: 8px; text-decoration: none;" title="A newer version is available on GitHub!">(Update available: v${data.remote})</a>`;
  }
  const el = document.getElementById('version-info');
  if (el) el.innerHTML = vHTML;
}).catch(e => console.error("Failed to fetch version", e));
