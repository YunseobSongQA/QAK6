// load-test.js — k6 부하 테스트 스크립트
//
// 실행: k6 run load-test.js   (server.js 가 먼저 떠 있어야 함)
// 대상: http://localhost:3000  (오직 내 로컬 서버만 — 외부 금지)
//
// 핵심 개념:
//  - options.thresholds 중 하나라도 깨지면 k6 가 exit code 1 로 종료된다.
//    => CI 에서 "자동 불합격" 판정으로 쓸 수 있다.
//  - handleSummary 로 결과를 summary.json 에 우리가 원하는 형태로 저장한다.

import http from 'k6/http';
import { check, sleep } from 'k6';

// ── 테스트 옵션 ────────────────────────────────────────
export const options = {
  vus: 10,            // 가상 사용자(Virtual Users) 10명
  duration: '30s',    // 30초 동안 부하

  // 임계값(threshold): 통과 못 하면 k6 가 불합격(exit 1) 처리
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% 요청이 500ms 미만이어야 함
    http_req_failed: ['rate<0.01'],   // 실패율 1% 미만이어야 함
  },

  // 요약 통계에 p(99) 까지 포함시킨다 (기본값엔 p99 가 없음)
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ── 가상 사용자 1명이 반복 수행하는 시나리오 ──────────────
export default function () {
  // 내 로컬 서버에 GET 요청
  const res = http.get('http://localhost:3000');

  // 응답 검증: 상태코드 200 인지, 응답시간 200ms 미만인지
  check(res, {
    '상태 코드가 200': (r) => r.status === 200,
    '응답시간 < 200ms': (r) => r.timings.duration < 200,
  });

  // 1초 쉬었다가 다시 반복 (실제 사용자 think time 흉내)
  sleep(1);
}

// ── 결과 요약을 summary.json 으로 저장 ────────────────────
// k6 가 테스트 종료 후 전체 metrics(data) 를 넘겨준다.
// 우리는 그 중 필요한 값만 뽑아 대시보드(k6-report.html)가 읽기 쉬운
// 평평한 구조로 가공한다.
export function handleSummary(data) {
  const metrics = data.metrics;

  // 안전하게 값 꺼내기 (메트릭이 없을 수 있으니 옵셔널 체이닝)
  const dur = metrics.http_req_duration ? metrics.http_req_duration.values : {};
  const reqs = metrics.http_reqs ? metrics.http_reqs.values : {};
  const failed = metrics.http_req_failed ? metrics.http_req_failed.values : {};

  // 임계값 통과 여부 추출
  // k6 는 각 메트릭의 thresholds 결과를 metric.thresholds 에 담아준다.
  const thresholdResults = [];
  for (const metricName in metrics) {
    const m = metrics[metricName];
    if (m.thresholds) {
      for (const expr in m.thresholds) {
        // ok === true 면 통과. (구버전 호환: !failed 도 고려)
        const t = m.thresholds[expr];
        const ok = t.ok !== undefined ? t.ok : !t.fails;
        thresholdResults.push({
          name: `${metricName}: ${expr}`,
          ok: ok,
        });
      }
    }
  }

  // check 통과/실패 집계
  // data.root_group 트리를 재귀적으로 돌며 모든 check 를 수집한다.
  const checks = [];
  function collectChecks(group) {
    if (group.checks) {
      for (const c of group.checks) {
        checks.push({
          name: c.name,
          passes: c.passes,
          fails: c.fails,
        });
      }
    }
    if (group.groups) {
      for (const g of group.groups) collectChecks(g);
    }
  }
  if (data.root_group) collectChecks(data.root_group);

  // 전체 판정: 모든 임계값이 통과면 PASS, 아니면 FAIL
  const allThresholdsOk = thresholdResults.every((t) => t.ok);
  const verdict = allThresholdsOk ? 'PASS' : 'FAIL';

  // 테스트 총 시간(초). state.testRunDurationMs 사용, 없으면 옵션값 추정.
  const durationSec = data.state && data.state.testRunDurationMs
    ? data.state.testRunDurationMs / 1000
    : 30;

  const totalRequests = reqs.count || 0;

  // 최종 요약 객체 — 대시보드가 그대로 읽는다.
  const summary = {
    verdict: verdict,
    duration: Math.round(durationSec),
    vus: options.vus,
    totalRequests: totalRequests,
    rps: reqs.rate ? Number(reqs.rate.toFixed(2)) : 0,
    failRate: failed.rate !== undefined ? Number(failed.rate.toFixed(4)) : 0,
    latency: {
      avg: round2(dur.avg),
      med: round2(dur.med),
      p90: round2(dur['p(90)']),
      p95: round2(dur['p(95)']),
      p99: round2(dur['p(99)']),
      max: round2(dur.max),
      min: round2(dur.min),
    },
    thresholds: thresholdResults,
    checks: checks,
  };

  // 콘솔에도 짧게 찍어주고, 파일로 저장
  console.log(`\n판정: ${verdict} | 총요청: ${totalRequests} | p95: ${summary.latency.p95}ms`);

  return {
    'summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(summary),
  };
}

// 소수점 2자리 반올림 (undefined 안전)
function round2(n) {
  if (n === undefined || n === null) return 0;
  return Number(n.toFixed(2));
}

// 터미널에 보기 좋게 출력할 간단한 텍스트 요약
function textSummary(s) {
  const line = '─'.repeat(40);
  return [
    '',
    line,
    `  판정(Verdict): ${s.verdict}`,
    `  총 요청수     : ${s.totalRequests}`,
    `  RPS          : ${s.rps}`,
    `  실패율        : ${(s.failRate * 100).toFixed(2)}%`,
    `  지연(avg/p95/p99/max): ${s.latency.avg} / ${s.latency.p95} / ${s.latency.p99} / ${s.latency.max} ms`,
    line,
    '',
  ].join('\n');
}
