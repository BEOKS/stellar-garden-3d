# 별먼지 정원

SQLite에 저장된 별 기록을 Three.js 3D 궤도 정원으로 보여주는 작은 토이 프로젝트입니다. 새 별을 심으면 DB에 저장되고, 화면의 별 목록과 3D 씬이 함께 갱신됩니다.

## 실행

```bash
npm install
npm run build
npm start
```

기본 포트는 `4877` 입니다.

## Docker Compose

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

## GitHub Actions 배포

`main` 브랜치에 push되면 `.github/workflows/deploy.yml`이 빌드를 확인한 뒤 Dokploy `compose.deploy` TRPC 엔드포인트를 호출합니다.

처음 한 번은 로컬 환경변수에 저장된 API 키로 Dokploy compose 리소스를 만들고 GitHub Actions secrets를 동기화합니다.

```bash
export DOKPLOY_URL="https://console.onestack.run"
export DOKPLOY_API_KEY="<로컬에 저장된 Dokploy API key>"
export CF_ACCESS_CLIENT_ID="<Cloudflare Access client id>"
export CF_ACCESS_CLIENT_SECRET="<Cloudflare Access client secret>"
npm run dokploy:configure
```

GitHub 저장소에는 다음 Actions secrets가 설정됩니다.

```text
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
DOKPLOY_COMPOSE_ID
DOKPLOY_API_KEY
```

Dokploy compose는 이 저장소의 `main` 브랜치와 루트의 `docker-compose.yml`을 바라봅니다. 컨테이너 포트는 `4877`, 헬스 체크 경로는 `/api/health`입니다.

## 검증

```bash
npm run build
npm run verify
```

검증 스크립트는 임시 서버를 띄운 뒤 API CRUD, 데스크톱/모바일 렌더링, Three.js 캔버스 픽셀 신호를 확인합니다.

## 데이터

SQLite 파일은 `data/stellar-garden.sqlite`에 생성됩니다. 처음 실행하면 샘플 별 다섯 개가 자동으로 들어갑니다.
