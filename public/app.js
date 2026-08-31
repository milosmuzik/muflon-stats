const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const updatedAt = document.getElementById('updatedAt');

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateShort(ts) {
  return new Date(ts * 1000).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
  });
}

// Okno je klouzavé ("posledních N dní od teď") - přesně rangeHours hodin,
// ne zarovnané na půlnoc. Zobrazení jen data (bez času) proto zavádělo:
// 168hodinové okno končící v poledne zasahuje do 8 různých kalendářních
// dat (kus prvního dne + 6 celých + kus posledního), i když jde přesně
// o 7 dní. S časem u obou konců je vidět, že jde o stejný čas o N dní
// zpátky, ne o 8 kalendářních dní.
function renderRangeLabel(generatedAt, rangeHours) {
  const from = generatedAt - rangeHours * 3600;
  const rangeDays = Math.round(rangeHours / 24);
  const el = document.getElementById('rangeLabel');
  if (el) {
    el.textContent = `posledních ${rangeDays} dní · ${fmtTime(from)}–${fmtTime(generatedAt)}`;
  }
}

function setStatus(state, text) {
  statusDot.className = 'status-dot' + (state ? ' ' + state : '');
  statusText.textContent = text;
}

function renderHero(summary) {
  document.getElementById('numPlays').textContent = summary.totalPlays;
  document.getElementById('numUnique').textContent = summary.uniqueTracks;
  document.getElementById('numHours').textContent = summary.hoursPlayed;
}

function renderLeaderboard(list) {
  const el = document.getElementById('leaderboard');
  if (!list.length) {
    el.innerHTML = '<li class="empty">Zatím žádná data.</li>';
    return;
  }
  el.innerHTML = list
    .map(
      (item, i) => `
      <li>
        <span class="rank">${i + 1}</span>
        <span class="track"><b>${escapeHtml(item.artist)}</b> <span>– ${escapeHtml(item.title)}</span></span>
        <span class="count">${item.count}×</span>
      </li>`
    )
    .join('');
}

function renderChart(hourly) {
  const el = document.getElementById('chart');
  const max = Math.max(1, ...hourly);
  el.innerHTML = hourly
    .map((count, hour) => {
      const heightPct = Math.max(2, Math.round((count / max) * 100));
      return `<div class="chart-bar" data-hour="${hour}" style="height:${heightPct}%" title="${hour}:00 – ${count}×"></div>`;
    })
    .join('');
}

function renderLiveLog(list) {
  const el = document.getElementById('liveLog');
  if (!list.length) {
    el.innerHTML = '<li class="empty">Zatím žádná data.</li>';
    return;
  }
  el.innerHTML = list
    .map(
      (item) => `
      <li>
        <time>${fmtTime(item.ts)}</time>
        <span class="track"><b>${escapeHtml(item.artist)}</b> <span>– ${escapeHtml(item.title)}</span></span>
      </li>`
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function loadData() {
  setStatus('', 'načítám…');
  try {
    const res = await fetch('/api/data?range_hours=168');
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'neznámá chyba');

    renderHero(data.summary);
    renderRangeLabel(data.generated_at, data.range_hours);
    renderLeaderboard(data.leaderboard);
    renderChart(data.hourly);
    renderLiveLog(data.liveLog);
    document.getElementById('socialText').value = data.socialText;

    updatedAt.textContent = 'Aktualizováno: ' + fmtTime(data.generated_at);
    setStatus('ok', 'živě sleduje');
  } catch (e) {
    setStatus('err', 'chyba načítání dat');
    updatedAt.textContent = 'Chyba: ' + e.message;
  }
}

document.getElementById('refreshBtn').addEventListener('click', loadData);

document.getElementById('copyBtn').addEventListener('click', async () => {
  const textarea = document.getElementById('socialText');
  try {
    await navigator.clipboard.writeText(textarea.value);
    const btn = document.getElementById('copyBtn');
    const original = btn.textContent;
    btn.textContent = 'Zkopírováno ✓';
    setTimeout(() => (btn.textContent = original), 1500);
  } catch {
    textarea.select();
    document.execCommand('copy');
  }
});

loadData();
