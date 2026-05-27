import { calculateOpportunityScore, toNumber } from './scoring.js';
import { getMockSocialSearchResults, useMockData } from './mockData.js';

const GRAPH_VERSION = process.env.INSTAGRAM_GRAPH_VERSION || 'v21.0';
const INSTAGRAM_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

function requireInstagramConfig() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || process.env.INSTAGRAM_USER_ID;

  if (!accessToken || !userId) {
    const err = new Error('INSTAGRAM_ACCESS_TOKEN과 INSTAGRAM_BUSINESS_ACCOUNT_ID가 .env에 필요합니다.');
    err.statusCode = 400;
    throw err;
  }

  return { accessToken, userId };
}

async function instagramGet(path, params = {}) {
  const { accessToken } = requireInstagramConfig();
  const url = new URL(`${INSTAGRAM_BASE_URL}${path}`);
  for (const [key, value] of Object.entries({ ...params, access_token: accessToken })) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || 'Instagram API 요청 실패';
    const err = new Error(message);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

export async function searchInstagramMedia(options = {}) {
  const { keywords = [], days = 7, locale = 'KR-ko' } = options;
  const cleanKeywords = normalizeKeywords(keywords);
  if (!cleanKeywords.length) {
    const err = new Error('검색할 키워드를 1개 이상 입력하세요.');
    err.statusCode = 400;
    throw err;
  }

  if (useMockData()) {
    return getMockSocialSearchResults({ platform: 'instagram', keywords: cleanKeywords, days, locale });
  }

  const { userId } = requireInstagramConfig();
  const since = Date.now() - toNumber(days, 7) * 24 * 60 * 60 * 1000;
  const results = [];

  for (const keyword of cleanKeywords) {
    const hashtag = normalizeHashtag(keyword);
    const hashtagData = await instagramGet('/ig_hashtag_search', {
      user_id: userId,
      q: hashtag,
    });
    const hashtagId = hashtagData?.data?.[0]?.id;
    if (!hashtagId) continue;

    const mediaData = await instagramGet(`/${hashtagId}/recent_media`, {
      user_id: userId,
      fields: 'id,caption,comments_count,like_count,media_type,media_url,permalink,timestamp',
      limit: 50,
    });

    for (const item of mediaData.data || []) {
      const publishedAt = item.timestamp || null;
      if (publishedAt && new Date(publishedAt).getTime() < since) continue;
      results.push(normalizeInstagramItem(item, keyword, locale));
    }
  }

  return dedupeById(results)
    .map((item) => calculateOpportunityScore(item))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

function normalizeInstagramItem(item, keyword, locale) {
  const title = item.caption || `${keyword} Instagram media`;
  return {
    platform: 'instagram',
    videoId: item.id,
    title,
    description: item.caption || '',
    matchedKeyword: keyword,
    channelTitle: 'Instagram',
    subscriberCount: null,
    hiddenSubscriberCount: true,
    viewCount: toNumber(item.like_count) + toNumber(item.comments_count) * 10,
    likeCount: toNumber(item.like_count),
    commentCount: toNumber(item.comments_count),
    publishedAt: item.timestamp,
    thumbnail: item.media_type === 'IMAGE' || item.media_type === 'CAROUSEL_ALBUM' ? item.media_url : '',
    url: item.permalink,
    locale,
  };
}

function normalizeKeywords(keywords) {
  return Array.isArray(keywords)
    ? keywords.map((keyword) => String(keyword).trim()).filter(Boolean)
    : String(keywords).split(',').map((keyword) => keyword.trim()).filter(Boolean);
}

function normalizeHashtag(keyword) {
  return String(keyword).replace(/^#/, '').replace(/\s+/g, '');
}

function dedupeById(items) {
  return [...new Map(items.map((item) => [item.videoId, item])).values()];
}
