// server.js — k6 부하 테스트의 "대상"이 될 로컬 테스트 서버
//
// 목적: 외부 의존성 0 (Node 기본 http 모듈만)으로 localhost:3000 에서
//       JSON 을 돌려주는 아주 단순한 서버를 띄운다.
// 안전: 이 서버는 오직 localhost 에 바인딩된다. 외부로 노출하거나
//       외부 서버를 대상으로 삼는 코드는 어디에도 없다.

const http = require('http');

// ── 설정값 ─────────────────────────────────────────────
// MAX_DELAY_MS 를 키우면 서버가 더 느려진다(=처리시간 흉내).
// 부하 테스트에서 p95/p99 지연이 어떻게 변하는지 실험해볼 때 조절하면 된다.
const PORT = 3000;
const HOST = '127.0.0.1'; // localhost 전용 바인딩 (외부 노출 방지)
const MAX_DELAY_MS = 50;  // 0~50ms 사이 랜덤 지연

// 요청 카운터 (응답에 같이 실어 보낸다 — 디버깅/관찰용)
let requestCount = 0;

const server = http.createServer((req, res) => {
  requestCount++;

  // 0 ~ MAX_DELAY_MS 사이의 랜덤 지연으로 "처리 시간"을 흉내낸다.
  const delay = Math.floor(Math.random() * (MAX_DELAY_MS + 1));

  setTimeout(() => {
    // 모든 경로에 대해 동일한 JSON 을 돌려주는 단순 핸들러
    const body = JSON.stringify({
      ok: true,
      message: 'k6 부하 테스트용 로컬 서버 응답',
      path: req.url,
      method: req.method,
      requestCount,
      delayMs: delay,
      timestamp: new Date().toISOString(),
    });

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }, delay);
});

server.listen(PORT, HOST, () => {
  console.log(`✅ 테스트 서버 실행 중: http://${HOST}:${PORT}`);
  console.log(`   - 랜덤 지연: 0~${MAX_DELAY_MS}ms (MAX_DELAY_MS 로 조절)`);
  console.log('   - 종료하려면 Ctrl+C');
});
