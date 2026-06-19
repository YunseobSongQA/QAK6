// app.js — k6 Report Hub 대시보드 동작(로직)
//
// 구조(HTML)·디자인(CSS)·동작(JS) 분리 원칙에 따라
// 모든 동작은 이 파일에서 관리한다.
// 외부 의존성은 Chart.js(CDN, index.html에서 로드) 하나뿐이며,
// localStorage는 사용하지 않는다(테마는 현재 세션에서만 유지).

// ── 페이지 로드 시 바로 보여줄 샘플 데이터 (내장) ──────────────
const SAMPLE = {
  verdict: 'PASS',
  duration: 30,
  vus: 10,
  totalRequests: 287,
  rps: 9.56,
  failRate: 0.0,
  latency: { avg: 28.4, med: 26.1, p90: 42.3, p95: 47.8, p99: 49.6, max: 51.2, min: 1.3 },
  thresholds: [
    { name: 'http_req_duration: p(95)<500', ok: true },
    { name: 'http_req_failed: rate<0.01', ok: true },
  ],
  checks: [
    { name: '상태 코드가 200', passes: 287, fails: 0 },
    { name: '응답시간 < 200ms', passes: 287, fails: 0 },
  ],
};

const $ = (id) => document.getElementById(id);
let currentData = null;   // 현재 렌더 중인 데이터 (CSV/차트 재렌더에 사용)
let chart = null;         // Chart.js 인스턴스
let currentView = 'overview';

// 임계값에서 p95 기준값 파싱 (예: "...p(95)<500" -> 500)
function parseP95Limit(thresholds) {
  if (!thresholds) return null;
  for (const t of thresholds) {
    const m = /p\(95\)\s*<\s*(\d+(\.\d+)?)/.exec(t.name || '');
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function showError(msg) { const b = $('errorBox'); b.textContent = '⚠️ ' + msg; b.style.display = 'block'; }
function clearError() { $('errorBox').style.display = 'none'; }

// ── 뷰 전환 ────────────────────────────────────────
// 네비 버튼 클릭 → 색 변경(active) + 해당 뷰로 전환
function showView(name) {
  currentView = name;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('view-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === name));
  // 응답시간 뷰는 캔버스가 보일 때 차트를 그려야 크기가 올바르다
  if (name === 'latency' && currentData) renderChart(currentData.latency, parseP95Limit(currentData.thresholds));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── 메인 렌더 ──────────────────────────────────────
function render(data) {
  if (!data || typeof data !== 'object' || !data.latency) {
    showError('유효한 summary.json 형식이 아닙니다. (latency 필드 필요)');
    return;
  }
  clearError();
  currentData = data;

  // 판정 배너
  const isPass = String(data.verdict).toUpperCase() === 'PASS';
  const banner = $('verdictBanner');
  banner.className = 'verdict ' + (isPass ? 'pass' : 'fail');
  $('verdictText').textContent = isPass ? '✅ PASS · 합격' : '❌ FAIL · 불합격';
  $('verdictMeta').textContent =
    `VUs ${data.vus ?? '-'} · ${data.duration ?? '-'}s · 총 ${fmt(data.totalRequests)} 요청`;

  // 요약 카드
  const p95Limit = parseP95Limit(data.thresholds);
  const p95 = data.latency.p95 ?? 0;
  const p95Over = p95Limit !== null && p95 > p95Limit;
  const failPct = (data.failRate ?? 0) * 100;
  const failOver = failPct >= 1;

  const cards = [
    { k: '총 요청수', v: fmt(data.totalRequests), sub: `${data.duration ?? '-'}초 동안` },
    { k: 'RPS (초당 요청)', v: fmt(data.rps), sub: 'requests/sec' },
    { k: 'p95 지연', v: fmt(p95) + ' ms', cls: p95Over ? 'warn' : 'good',
      sub: p95Limit !== null ? `임계값 < ${p95Limit}ms` : '' },
    { k: '실패율', v: failPct.toFixed(2) + '%', cls: failOver ? 'warn' : 'good', sub: '임계값 < 1%' },
  ];
  $('cards').innerHTML = cards.map((c) => `
    <div class="card">
      <div class="k">${c.k}</div>
      <div class="v ${c.cls || ''}">${c.v}</div>
      <div class="sub">${c.sub || ''}</div>
    </div>`).join('');

  // 임계값 표
  $('thresholdsBody').innerHTML = (data.thresholds || []).map((t) => `
    <tr>
      <td>${escapeHtml(t.name)}</td>
      <td style="text-align:right"><span class="badge ${t.ok ? 'ok' : 'no'}">${t.ok ? '통과' : '실패'}</span></td>
    </tr>`).join('') || '<tr><td colspan="2" style="color:var(--muted)">임계값 없음</td></tr>';

  // checks 표
  $('checksBody').innerHTML = (data.checks || []).map((c) => {
    const ok = (c.fails || 0) === 0;
    return `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${fmt(c.passes)}</td>
        <td>${fmt(c.fails)}</td>
        <td style="text-align:right"><span class="badge ${ok ? 'ok' : 'no'}">${ok ? 'OK' : 'FAIL'}</span></td>
      </tr>`;
  }).join('') || '<tr><td colspan="4" style="color:var(--muted)">checks 없음</td></tr>';

  // 현재 응답시간 뷰가 열려 있으면 차트도 갱신
  if (currentView === 'latency') renderChart(data.latency, p95Limit);
}

// 현재 테마에 맞는 차트 색상
function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    grid: cs.getPropertyValue('--border').trim(),
    tick: cs.getPropertyValue('--muted').trim(),
    primary: cs.getPropertyValue('--primary').trim(),
    green: cs.getPropertyValue('--green').trim(),
    red: cs.getPropertyValue('--red').trim(),
    muted: cs.getPropertyValue('--muted').trim(),
  };
}

// 백분위 막대차트: median, p90, p95, p99, max (p95 임계값 초과 시 빨강)
function renderChart(lat, p95Limit) {
  const c = themeColors();
  const labels = ['median', 'p90', 'p95', 'p99', 'max'];
  const values = [lat.med, lat.p90, lat.p95, lat.p99, lat.max].map((v) => v ?? 0);
  const p95Over = p95Limit !== null && (lat.p95 ?? 0) > p95Limit;
  const colors = [c.primary, c.primary, p95Over ? c.red : c.green, c.primary, c.muted];

  if (chart) chart.destroy();
  chart = new Chart($('latencyChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: '응답시간 (ms)', data: values, backgroundColor: colors, borderRadius: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => `${x.parsed.y} ms` } } },
      scales: {
        y: { beginAtZero: true, ticks: { color: c.tick }, grid: { color: c.grid },
             title: { display: true, text: 'ms', color: c.tick } },
        x: { ticks: { color: c.tick }, grid: { display: false } },
      },
    },
  });
}

// ── CSV 내보내기 ───────────────────────────────────
function exportCsv() {
  if (!currentData) { showError('내보낼 데이터가 없습니다.'); return; }
  const d = currentData;
  const rows = [
    ['항목', '값'],
    ['verdict', d.verdict], ['duration(s)', d.duration], ['vus', d.vus],
    ['totalRequests', d.totalRequests], ['rps', d.rps], ['failRate', d.failRate],
    ['latency.avg', d.latency.avg], ['latency.med', d.latency.med], ['latency.p90', d.latency.p90],
    ['latency.p95', d.latency.p95], ['latency.p99', d.latency.p99],
    ['latency.max', d.latency.max], ['latency.min', d.latency.min],
  ];
  (d.thresholds || []).forEach((t) => rows.push(['threshold: ' + t.name, t.ok ? 'PASS' : 'FAIL']));
  (d.checks || []).forEach((c) => rows.push(['check: ' + c.name, `pass=${c.passes} fail=${c.fails}`]));

  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM: 엑셀 한글 방지
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'k6-report.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ── 유틸 ───────────────────────────────────────────
function fmt(n) {
  if (n === undefined || n === null || n === '') return '-';
  return typeof n === 'number' ? n.toLocaleString('ko-KR') : n;
}
function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 테마 토글 (localStorage 미사용 — 세션 내에서만 유지) ──
function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  $('themeBtn').textContent = next === 'dark' ? '🌙' : '☀️';
  // 차트가 떠 있으면 새 테마 색으로 다시 그린다
  if (currentView === 'latency' && currentData) renderChart(currentData.latency, parseP95Limit(currentData.thresholds));
}

// ── 이벤트 연결 ────────────────────────────────────
// 네비 버튼 → 뷰 전환
document.querySelectorAll('.nav-btn').forEach((b) =>
  b.addEventListener('click', () => showView(b.dataset.view)));

// 브랜드 심볼 → 홈(개요)
$('homeBtn').addEventListener('click', () => showView('overview'));

// 테마 토글
$('themeBtn').addEventListener('click', toggleTheme);

// 파일 업로드
$('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { render(JSON.parse(reader.result)); showView('overview'); }
    catch (err) { showError('JSON 파싱 실패: ' + err.message); }
  };
  reader.readAsText(file);
});
// 업로드 라벨 키보드 접근성
$('uploadLabel').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('fileInput').click(); }
});

// 붙여넣기 렌더
$('renderPasteBtn').addEventListener('click', () => {
  const txt = $('pasteArea').value.trim();
  if (!txt) { showError('붙여넣은 내용이 없습니다.'); return; }
  try { render(JSON.parse(txt)); showView('overview'); }
  catch (err) { showError('JSON 파싱 실패: ' + err.message); }
});

// 샘플 / CSV
$('loadSampleBtn').addEventListener('click', () => { render(SAMPLE); showView('overview'); });
$('exportCsvBtn').addEventListener('click', exportCsv);

// 첫 화면: 샘플 자동 렌더
render(SAMPLE);
