# k6 부하 테스트 학습용 프로젝트

주니어 QA를 위한, **localhost 전용** k6 부하 테스트 미니 프로젝트입니다.
백엔드/DB 없이 정적 파일과 Node 기본 모듈만 사용합니다.

---

## 안전 규칙 (가장 중요)

- **부하 테스트 대상은 `localhost` 또는 내가 명시적으로 소유·허가한 서버만** 허용됩니다.
- 외부 사이트/운영 서버를 대상으로 삼는 것은 **DoS(서비스 거부 공격)** 이며 불법입니다. 절대 하지 마세요.
- 이 프로젝트에는 "임의의 도메인을 입력받아 부하를 거는" 기능이 **의도적으로 없습니다.**
- `load-test.js` 의 대상은 `http://localhost:3000` 으로 고정되어 있습니다.

---

## 파일 구성

```
QAK6/
├── public/              ← Cloudflare Pages 가 배포하는 정적 대시보드
│   ├── index.html       ·  구조 (HTML)
│   ├── styles.css       ·  디자인 (CSS) — 다크/라이트 테마
│   ├── app.js           ·  동작 (JS) — 렌더·뷰전환·CSV
│   └── _headers         ·  Pages 보안 헤더
├── server.js            ← 부하 대상 로컬 테스트 서버 (로컬 도구, 배포 X)
├── load-test.js         ← k6 부하 테스트 스크립트 (로컬 도구, 배포 X)
├── setup.sh             ← Codespaces(Ubuntu)용 k6 설치 스크립트
├── wrangler.toml        ← Cloudflare Pages 배포 설정
└── README.md
```

> **왜 HTML/CSS/JS 를 나눴나? (관심사 분리, Separation of Concerns)**
> 구조·디자인·동작을 분리하면 ① 각각 따로 수정·협업하기 쉽고,
> ② CSS/JS 가 브라우저에 캐시돼 재방문 시 빨라지며,
> ③ 여러 페이지가 같은 CSS/JS 를 재사용할 수 있습니다. 실무 표준 방식입니다.

---

## 실행 순서

### 0) k6 설치 (최초 1회)

```bash
bash setup.sh
```

설치가 끝나면 자동으로 `k6 version` 이 출력됩니다.

### 1) 탭 1 — 테스트 서버 띄우기

```bash
node server.js
```

→ `http://localhost:3000` 에서 JSON 을 응답하는 서버가 뜹니다. (0~50ms 랜덤 지연)
이 터미널은 켜둔 채로 둡니다.

### 2) 탭 2 — k6 부하 테스트 실행

새 터미널을 열고:

```bash
k6 run load-test.js
```

- 가상 사용자(VUs) 10명이 30초 동안 요청을 보냅니다.
- 임계값(`p95<500ms`, 실패율 `<1%`)을 **하나라도 못 지키면 k6 가 exit code 1 (불합격)** 로 끝납니다.
- 종료되면 같은 폴더에 **`summary.json`** 이 생성됩니다.

### 3) 대시보드에서 결과 보기

`public/index.html` 을 브라우저로 엽니다. (배포본은 아래 Cloudflare Pages 주소에서 바로 볼 수 있습니다)

- 페이지를 열면 **샘플 데이터**가 먼저 보입니다.
- **summary.json 업로드** 버튼으로 방금 만든 실제 결과를 불러옵니다.
- 모바일이라 파일 선택이 불편하면 **JSON 직접 붙여넣기** 를 사용하세요.

대시보드 표시 항목:
- PASS/FAIL 판정 (녹색/적색)
- 요약 카드 (총 요청 · RPS · p95 · 실패율)
- 응답시간 백분위 막대차트 (p95가 임계값 초과 시 빨강)
- checks 통과/실패 표
- **CSV 내보내기** 버튼

---

## Cloudflare Pages 배포 (qak6.pages.dev)

대시보드(`public/`)는 정적 파일이라 Cloudflare Pages 로 무료 배포할 수 있습니다.
두 가지 방법 중 하나를 쓰면 됩니다.

### 방법 A — GitHub 연동 (권장, 자동 배포)

이 저장소(`qass96/QAK6`)를 Cloudflare 에 연결하면 **push 할 때마다 자동 배포**됩니다.

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. `qass96/QAK6` 저장소 선택
3. 빌드 설정:
   - **Framework preset**: `None`
   - **Build command**: (비움)
   - **Build output directory**: `public`
4. **Save and Deploy** → 잠시 후 `https://qak6.pages.dev` 에서 확인

> ※ 이 단계는 본인 Cloudflare 계정 로그인이 필요해 대신 해드릴 수 없습니다.
> 단, 빌드 설정(`output = public`)은 `wrangler.toml` 에 미리 맞춰 두었습니다.

### 방법 B — wrangler CLI 로 직접 배포

```bash
npx wrangler login                 # 브라우저로 1회 로그인
npx wrangler pages deploy public   # public/ 폴더를 배포
```

> Codespaces 터미널에서 로그인 창이 안 열리면, 프롬프트에 `! npx wrangler login` 으로 실행하세요.

---

## 실험해보기

- `server.js` 의 `MAX_DELAY_MS` 값을 키우면 서버가 느려져 p95/p99 가 올라갑니다.
  충분히 키우면 임계값을 넘겨 **FAIL** 판정이 나는 것도 확인할 수 있습니다.
- `load-test.js` 의 `vus`, `duration` 을 바꿔 부하 강도를 조절해보세요.

---

## summary.json 구조

```json
{
  "verdict": "PASS",
  "duration": 30,
  "vus": 10,
  "totalRequests": 287,
  "rps": 9.56,
  "failRate": 0.0,
  "latency": { "avg": 28.4, "med": 26.1, "p90": 42.3, "p95": 47.8, "p99": 49.6, "max": 51.2, "min": 1.3 },
  "thresholds": [{ "name": "http_req_duration: p(95)<500", "ok": true }],
  "checks": [{ "name": "상태 코드가 200", "passes": 287, "fails": 0 }]
}
```
