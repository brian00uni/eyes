# YouTube AI Trend Finder MVP

최근 7일 안에 올라온 유튜브 영상 중 **구독자는 적은데 조회수가 많이 나온 영상**을 찾아주는 MVP입니다.

## 핵심 기능

- 키워드별 YouTube 최근 영상 검색
- 최근 N일 영상 필터
- 채널 구독자 수 수집
- 조회수 / 구독자 수 / 댓글 수 / 좋아요 수 기반 기회점수 계산
- 구독자 수가 적은 채널만 필터링
- 네이버 데이터랩 검색어 추이 비교
- 영상 목록 기반 간단한 AI식 요약 리포트 생성

## 준비물

1. Node.js 18 이상
2. YouTube Data API Key
3. 선택: 네이버 데이터랩 API Client ID / Secret

## API 키 준비

API 키는 `server/.env` 파일에 넣습니다.

```env
PORT=4000
USE_MOCK_DATA=false
YOUTUBE_API_KEY=발급받은_YouTube_Data_API_Key
NAVER_CLIENT_ID=발급받은_Naver_Client_ID
NAVER_CLIENT_SECRET=발급받은_Naver_Client_Secret
```

키가 아직 없으면 `USE_MOCK_DATA=true`로 두고 샘플 데이터로 화면과 점수 계산을 먼저 확인할 수 있습니다. 실제 YouTube/Naver 데이터를 조회하려면 `USE_MOCK_DATA=false`로 바꾸고 아래 키를 발급받아 입력해야 합니다.

### YouTube
Google Cloud Console에서 YouTube Data API v3를 활성화하고 API Key를 발급합니다. 이 앱은 공개 영상 검색, 영상 통계, 채널 구독자 수 조회에 `YOUTUBE_API_KEY`를 사용합니다.

### NAVER DataLab
네이버 개발자센터에서 DataLab 애플리케이션을 등록하고 Client ID / Client Secret을 발급합니다. 네이버 검색 추이 기능에만 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`이 필요합니다.

## 설치

```bash
yarn install:all
cp server/.env.example server/.env
```

`server/.env` 파일에 API 키를 입력한 뒤 개발 서버를 실행합니다.

```bash
yarn dev
```

브라우저에서 Vite가 안내하는 주소를 엽니다. 보통 `http://127.0.0.1:5173` 입니다.

프로덕션처럼 한 서버로 확인하려면 클라이언트를 빌드한 뒤 API 서버를 실행합니다.

```bash
yarn build
yarn start
```

이 경우 `http://127.0.0.1:4000` 에서 앱과 API가 함께 제공됩니다.

## 서버 .env 예시

```env
PORT=4000
USE_MOCK_DATA=false
YOUTUBE_API_KEY=your_youtube_api_key
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
```

## 검색 예시

키워드:

```txt
주식, 부업, 쇼츠, 목포 맛집, K뷰티
```

조건:

```txt
최근 7일
구독자 50,000명 이하
쇼츠 중심이면 short 선택
최소 조회수 10,000회
```

## 점수 계산 기준

기본 기회점수는 아래 요소를 섞어서 계산합니다.

```txt
기회점수 = 조회수 / sqrt(구독자수) + 시간당 조회수 * 2 + 댓글수 * 3 + 좋아요수 * 0.2
```

구독자 수가 숨겨진 채널은 필터 계산이 어렵기 때문에 별도 표시합니다.

## 중요한 한계

- 남의 영상의 정확한 검색 노출수, CTR, 검색어별 유입은 공개 API로 확인할 수 없습니다.
- YouTube API의 search.list는 호출 1회당 쿼터가 큽니다. 키워드를 너무 많이 넣으면 하루 쿼터가 빨리 소진됩니다.
- 조회수 증가량은 API가 과거 데이터를 주는 것이 아니라, 이 프로그램이 일정 간격으로 저장해야 계산할 수 있습니다.
- 네이버 데이터랩은 실시간 검색어 순위를 제공하는 API가 아니라, 입력한 검색어 그룹의 검색 추이를 비교하는 API입니다.

## 다음 단계로 확장할 수 있는 기능

- SQLite / PostgreSQL 저장
- 1시간마다 자동 수집
- 조회수 증가량 랭킹
- 엑셀 다운로드
- 카테고리별 대시보드
- YouTube Shorts 전용 필터 강화
- GPT API 연결 후 영상 제목/썸네일 아이디어 자동 생성
