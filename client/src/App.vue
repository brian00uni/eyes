<script setup>
import { computed, ref } from 'vue';

const form = ref({
  keywords: '주식, 부업, 쇼츠, 목포 맛집, K뷰티',
  days: 7,
  maxSubscribers: 50000,
  minViews: 10000,
  regionCode: 'KR',
  relevanceLanguage: 'ko',
  videoDuration: 'short',
  maxResults: 25,
});

const loading = ref(false);
const downloadingVideoId = ref('');
const directDownloadUrl = ref('');
const error = ref('');
const toast = ref(null);
let toastTimer = null;
const result = ref(null);
const trendResult = ref(null);

const items = computed(() => result.value?.items || []);
const summary = computed(() => result.value?.summary);
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function searchVideos() {
  loading.value = true;
  error.value = '';
  result.value = null;

  try {
    result.value = await fetchJson('/api/youtube/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form.value,
        keywords: form.value.keywords.split(',').map((v) => v.trim()).filter(Boolean),
      }),
    });
  } catch (e) {
    error.value = e.message;
    showToast('error', e.message);
  } finally {
    loading.value = false;
  }
}

async function searchTrends() {
  loading.value = true;
  error.value = '';
  trendResult.value = null;

  try {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDate = new Date(today.getTime() - Number(form.value.days) * 86400000).toISOString().slice(0, 10);

    trendResult.value = await fetchJson('/api/naver/trends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: form.value.keywords.split(',').map((v) => v.trim()).filter(Boolean),
        startDate,
        endDate,
        timeUnit: 'date',
      }),
    });
  } catch (e) {
    error.value = e.message;
    showToast('error', e.message);
  } finally {
    loading.value = false;
  }
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ko-KR');
}

async function downloadVideo(item) {
  downloadingVideoId.value = item.videoId;
  error.value = '';

  try {
    const res = await fetch(downloadUrl(item));
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      const data = contentType.includes('application/json') ? await res.json() : null;
      throw new Error(data?.message || '다운로드 실패');
    }

    if (!contentType.startsWith('video/')) {
      throw new Error(contentType.includes('text/html') ? apiUnavailableMessage() : '영상 파일이 아닌 응답을 받았습니다.');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = getDownloadFilename(res, item);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('success', '다운로드를 시작했습니다.');
  } catch (e) {
    error.value = e.message;
    showToast('error', e.message || '다운로드 실패');
  } finally {
    downloadingVideoId.value = '';
  }
}

async function downloadDirectVideo() {
  const videoId = extractYouTubeVideoId(directDownloadUrl.value);
  if (!videoId) {
    error.value = '올바른 유튜브 URL을 입력하세요.';
    showToast('error', error.value);
    return;
  }

  await downloadVideo({
    videoId,
    title: `youtube-${videoId}`,
  });
}

function downloadUrl(item) {
  const params = new URLSearchParams({ title: item.title || item.videoId });
  return apiUrl(`/api/youtube/download/${item.videoId}?${params.toString()}`);
}

function getDownloadFilename(res, item) {
  const disposition = res.headers.get('content-disposition') || '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = disposition.match(/filename="([^"]+)"/i);
  const rawName = utf8Match?.[1] ? decodeURIComponent(utf8Match[1]) : asciiMatch?.[1];

  return rawName || `${sanitizeFilename(item.title || item.videoId)}.mp4`;
}

function sanitizeFilename(value) {
  return String(value)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'youtube-video';
}

function extractYouTubeVideoId(value) {
  const raw = String(value || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : '';
    }

    if (host.endsWith('youtube.com')) {
      const watchId = url.searchParams.get('v');
      if (/^[a-zA-Z0-9_-]{11}$/.test(watchId || '')) return watchId;

      const pathParts = url.pathname.split('/').filter(Boolean);
      const videoId = pathParts.find((part) => /^[a-zA-Z0-9_-]{11}$/.test(part));
      return videoId || '';
    }
  } catch {
    return '';
  }

  return '';
}

function showToast(type, message) {
  toast.value = { type, message };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = null;
    toastTimer = null;
  }, 3500);
}

async function fetchJson(path, options = {}) {
  const res = await fetch(apiUrl(path), options);
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    throw new Error(apiUnavailableMessage());
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'API 요청 실패');
  return data;
}

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function apiUnavailableMessage() {
  if (!API_BASE_URL && window.location.hostname.endsWith('github.io')) {
    return 'GitHub Pages에는 API 서버가 없습니다. 검색/다운로드를 쓰려면 백엔드 서버를 따로 배포하고 VITE_API_BASE_URL을 설정해야 합니다.';
  }
  return 'API 서버에서 올바른 JSON 응답을 받지 못했습니다. 서버가 실행 중인지 확인하세요.';
}
</script>

<template>
  <main class="page">
    <div v-if="toast" class="toast" :class="toast.type" role="status" aria-live="polite">
      {{ toast.message }}
    </div>

    <section class="hero">
      <p class="eyebrow">YouTube AI Trend Finder MVP</p>
      <h1>구독자는 적은데 조회수가 터진 영상 찾기</h1>
      <p class="desc">
        최근 N일 안에 올라온 영상 중 조회수, 구독자 수, 댓글 수, 좋아요 수를 기반으로 기회점수를 계산합니다.
      </p>
    </section>

    <section class="panel form-grid">
      <label>
        키워드, 쉼표로 구분
        <textarea v-model="form.keywords" rows="3" />
      </label>

      <label>
        기간 / 최근 N일
        <input v-model.number="form.days" type="number" min="1" max="30" />
      </label>

      <label>
        최대 구독자 수
        <input v-model.number="form.maxSubscribers" type="number" min="0" />
      </label>

      <label>
        최소 조회수
        <input v-model.number="form.minViews" type="number" min="0" />
      </label>

      <label>
        국가 코드
        <input v-model="form.regionCode" />
      </label>

      <label>
        언어 코드
        <input v-model="form.relevanceLanguage" />
      </label>

      <label>
        영상 길이
        <select v-model="form.videoDuration">
          <option value="any">전체</option>
          <option value="short">4분 미만</option>
          <option value="medium">4분~20분</option>
          <option value="long">20분 초과</option>
        </select>
      </label>

      <label>
        키워드당 검색 수
        <input v-model.number="form.maxResults" type="number" min="1" max="50" />
      </label>

      <div class="actions">
        <button :disabled="loading" @click="searchVideos">
          {{ loading ? '검색 중...' : '유튜브 후보 찾기' }}
        </button>
        <button class="secondary" :disabled="loading" @click="searchTrends">
          네이버 검색 추이 보기
        </button>
      </div>
    </section>

    <section class="panel direct-download">
      <label>
        유튜브 URL 직접 다운로드
        <div class="direct-download-row">
          <input
            v-model="directDownloadUrl"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            @keydown.enter.prevent="downloadDirectVideo"
          />
          <button :disabled="Boolean(downloadingVideoId)" @click="downloadDirectVideo">
            {{ downloadingVideoId ? '받는 중...' : '다운로드' }}
          </button>
        </div>
      </label>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="summary" class="panel summary">
      <h2>AI식 요약</h2>
      <h3>{{ summary.headline }}</h3>
      <ul>
        <li v-for="bullet in summary.bullets" :key="bullet">{{ bullet }}</li>
      </ul>
    </section>

    <section v-if="trendResult" class="panel">
      <h2>네이버 검색 추이 증가 후보</h2>
      <div class="trend-list">
        <article v-for="row in trendResult.growth" :key="row.keyword" class="trend-card">
          <strong>{{ row.keyword }}</strong>
          <span>처음 {{ formatNumber(row.first) }} → 최근 {{ formatNumber(row.last) }}</span>
          <em>증가폭 {{ formatNumber(row.diff) }}</em>
        </article>
      </div>
    </section>

    <section v-if="items.length" class="panel table-panel">
      <div class="table-head">
        <h2>검색 결과 {{ items.length }}개</h2>
        <p>기회점수 높은 순</p>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>영상</th>
              <th>키워드</th>
              <th>채널</th>
              <th>구독자</th>
              <th>조회수</th>
              <th>조회/구독</th>
              <th>시간당 조회</th>
              <th>댓글</th>
              <th>점수</th>
              <th>업로드</th>
              <th>다운로드</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.videoId">
              <td class="video-cell">
                <img v-if="item.thumbnail" :src="item.thumbnail" alt="" />
                <a :href="item.url" target="_blank" rel="noreferrer">{{ item.title }}</a>
              </td>
              <td>{{ item.matchedKeyword }}</td>
              <td>{{ item.channelTitle }}</td>
              <td>{{ item.hiddenSubscriberCount ? '숨김' : formatNumber(item.subscriberCount) }}</td>
              <td>{{ formatNumber(item.viewCount) }}</td>
              <td>{{ formatNumber(item.viewSubscriberRatio) }}</td>
              <td>{{ formatNumber(item.viewsPerHour) }}</td>
              <td>{{ formatNumber(item.commentCount) }}</td>
              <td>{{ formatNumber(item.opportunityScore) }}</td>
              <td>{{ formatDate(item.publishedAt) }}</td>
              <td>
                <button
                  class="download-button"
                  :disabled="downloadingVideoId === item.videoId"
                  @click="downloadVideo(item)"
                >
                  {{ downloadingVideoId === item.videoId ? '받는 중...' : '다운로드' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>
