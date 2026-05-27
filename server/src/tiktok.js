import { calculateOpportunityScore, toNumber } from './scoring.js';
import { getMockSocialSearchResults, useMockData } from './mockData.js';

const TIKTOK_BASE_URL = 'https://open.tiktokapis.com/v2';
const TIKTOK_FIELDS = [
  'id',
  'video_description',
  'create_time',
  'region_code',
  'share_count',
  'view_count',
  'like_count',
  'comment_count',
  'hashtag_names',
  'username',
  'video_duration',
].join(',');

async function getTikTokAccessToken() {
  if (process.env.TIKTOK_ACCESS_TOKEN) return process.env.TIKTOK_ACCESS_TOKEN;

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    const err = new Error('TIKTOK_ACCESS_TOKEN 또는 TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET이 .env에 필요합니다.');
    err.statusCode = 400;
    throw err;
  }

  const res = await fetch(`${TIKTOK_BASE_URL}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error_description || data?.error || 'TikTok OAuth 토큰 발급 실패');
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }

  return data.access_token;
}

async function tiktokPost(path, params = {}, body = {}) {
  const accessToken = await getTikTokAccessToken();
  const url = new URL(`${TIKTOK_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || data?.error?.log_id || 'TikTok API 요청 실패';
    const err = new Error(message);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

export async function searchTikTokVideos(options = {}) {
  const { keywords = [], days = 7, locale = 'KR-ko' } = options;
  const cleanKeywords = normalizeKeywords(keywords);
  if (!cleanKeywords.length) {
    const err = new Error('검색할 키워드를 1개 이상 입력하세요.');
    err.statusCode = 400;
    throw err;
  }

  if (useMockData()) {
    return getMockSocialSearchResults({ platform: 'tiktok', keywords: cleanKeywords, days, locale });
  }

  const regionCode = parseRegionCode(locale);
  const results = [];

  for (const keyword of cleanKeywords) {
    const data = await tiktokPost('/research/video/query/', { fields: TIKTOK_FIELDS }, {
      query: {
        and: [
          {
            operation: 'EQ',
            field_name: 'keyword',
            field_values: [keyword],
          },
          ...(regionCode ? [{
            operation: 'EQ',
            field_name: 'region_code',
            field_values: [regionCode],
          }] : []),
        ],
      },
      max_count: 100,
      start_date: formatDate(Date.now() - toNumber(days, 7) * 24 * 60 * 60 * 1000),
      end_date: formatDate(Date.now()),
      is_random: false,
    });

    const videos = data?.data?.videos || [];
    for (const item of videos) {
      results.push(normalizeTikTokItem(item, keyword, locale));
    }
  }

  return dedupeById(results)
    .map((item) => calculateOpportunityScore(item))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

function normalizeTikTokItem(item, keyword, locale) {
  const id = String(item.id || '');
  const username = item.username || 'TikTok';
  return {
    platform: 'tiktok',
    videoId: id,
    title: item.video_description || `${keyword} TikTok video`,
    description: item.video_description || '',
    matchedKeyword: keyword,
    channelTitle: username,
    subscriberCount: null,
    hiddenSubscriberCount: true,
    viewCount: toNumber(item.view_count),
    likeCount: toNumber(item.like_count),
    commentCount: toNumber(item.comment_count),
    shareCount: toNumber(item.share_count),
    publishedAt: item.create_time ? new Date(toNumber(item.create_time) * 1000).toISOString() : null,
    thumbnail: '',
    url: username && id ? `https://www.tiktok.com/@${username}/video/${id}` : 'https://www.tiktok.com/',
    regionCode: item.region_code,
    locale,
    hashtags: item.hashtag_names || [],
  };
}

function normalizeKeywords(keywords) {
  return Array.isArray(keywords)
    ? keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
    : String(keywords).split(',').map((keyword) => keyword.trim()).filter(Boolean);
}

function parseRegionCode(locale) {
  return String(locale || '').split('-')[0] || '';
}

function formatDate(value) {
  return new Date(value).toISOString().slice(0, 10).replace(/-/g, '');
}

function dedupeById(items) {
  return [...new Map(items.map((item) => [item.videoId, item])).values()];
}
