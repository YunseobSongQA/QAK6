#!/usr/bin/env bash
# setup.sh — GitHub Codespaces(Ubuntu)에서 k6 설치 스크립트
#
# 사용법:  bash setup.sh
# 한 번 실행으로 k6 를 설치하고 'k6 version' 으로 확인한다.
#
# 두 가지 방법을 순서대로 시도한다:
#   A) k6 공식 apt 저장소 (권장, 공식 문서 방식)
#   B) A 가 실패하면 GitHub 릴리스 바이너리를 직접 내려받아 설치 (폴백)
#      - 일부 컨테이너에서는 gpg 키서버(dirmngr)에 접속이 막혀 A 가 실패하므로
#        폴백을 둔다.

set -e  # 명령이 하나라도 실패하면 즉시 중단

K6_VERSION="v0.50.0"  # 폴백(바이너리)에서 받을 버전

echo "📦 k6 설치를 시작합니다 (Ubuntu/Debian)..."

# 이미 설치되어 있으면 건너뛴다
if command -v k6 >/dev/null 2>&1; then
  echo "ℹ️  k6 가 이미 설치되어 있습니다."
  k6 version
  exit 0
fi

# ── 방법 A: 공식 apt 저장소 ────────────────────────────────
install_via_apt() {
  echo "[A] 공식 apt 저장소로 설치 시도..."
  sudo apt-get update
  sudo apt-get install -y gnupg curl ca-certificates

  # gpg 키 등록 (dirmngr 가 없는 환경을 위해 홈 디렉터리 보장)
  sudo mkdir -p /root/.gnupg && sudo chmod 700 /root/.gnupg
  sudo gpg --no-default-keyring \
    --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
    --keyserver hkp://keyserver.ubuntu.com:80 \
    --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69

  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
    | sudo tee /etc/apt/sources.list.d/k6.list

  sudo apt-get update
  sudo apt-get install -y k6
}

# ── 방법 B: GitHub 릴리스 바이너리 직접 설치 (폴백) ──────────
install_via_binary() {
  echo "[B] GitHub 릴리스 바이너리로 설치 시도 (${K6_VERSION})..."
  local arch tarball tmp
  arch="$(uname -m)"
  case "$arch" in
    x86_64)  arch="amd64" ;;
    aarch64) arch="arm64" ;;
    *) echo "지원하지 않는 아키텍처: $arch"; return 1 ;;
  esac

  tarball="k6-${K6_VERSION}-linux-${arch}.tar.gz"
  tmp="$(mktemp -d)"
  curl -sfL "https://github.com/grafana/k6/releases/download/${K6_VERSION}/${tarball}" \
    -o "${tmp}/${tarball}"
  tar xzf "${tmp}/${tarball}" -C "${tmp}"
  sudo cp "${tmp}/k6-${K6_VERSION}-linux-${arch}/k6" /usr/local/bin/k6
  sudo chmod +x /usr/local/bin/k6
  rm -rf "${tmp}"
}

# A 실패 시 B 로 자동 폴백
if install_via_apt; then
  echo "✅ apt 저장소 설치 성공"
else
  echo "⚠️  apt 설치 실패 → 바이너리 폴백으로 전환합니다."
  install_via_binary
fi

# ── 설치 확인 ─────────────────────────────────────────────
echo ""
echo "✅ 설치 완료! 버전 확인:"
k6 version
