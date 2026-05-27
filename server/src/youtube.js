import { calculateOpportunityScore, toNumber } from './scoring.js';
import { getMockOpportunityVideos, useMockData } from './mockData.js';

const YOUTUBE_BASE_URL = 'https://www.googleapis.com/youtube/v3';

function requireYouTubeKey() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    const err = new Error('YOUTUBE_API_KEY가 .env에 없습니다.');
    err.statusCode = 400;
    throw err;
  }
  return key;
}

async function youtubeGet(path, params) {
  const key = requireYouTubeKey();
  const url = new URL(`${YOUTUBE_BASE_URL}${path}`);
  for (const [k, v] of Object.entries({ ...params, key })) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || 'YouTube API 요청 실패';
    const err = new Error(message);
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

export async function findOpportunityVideos(options = {}) {
  const {
    keywords = [],
    days = 7,
    maxSubscribers = 50000,
    minViews = 0,
    regionCode = 'KR',
    relevanceLanguage = 'ko',
    videoDuration = 'any',
    maxResults = 25,
  } = options;

  const cleanKeywords = Array.isArray(keywords)
    ? keywords.map((k) => String(k).trim()).filter(Boolean)
    : String(keywords).split(',').map((k) => k.trim()).filter(Boolean);

  if (!cleanKeywords.length) {
    const err = new Error('검색할 키워드를 1개 이상 입력하세요.');
    err.statusCode = 400;
    throw err;
  }

  if (useMockData()) {
    return getMockOpportunityVideos({ ...options, keywords: cleanKeywords });
  }

  const publishedAfter = new Date(Date.now() - toNumber(days, 7) * 24 * 60 * 60 * 1000).toISOString();
  const searchResults = [];

  for (const keyword of cleanKeywords) {
    const data = await youtubeGet('/search', {
      part: 'snippet',
      type: 'video',
      q: keyword,
      order: 'viewCount',
      maxResults: Math.min(toNumber(maxResults, 25), 50),
      publishedAfter,
      regionCode,
      relevanceLanguage,
      safeSearch: 'moderate',
      videoDuration,
    });

    for (const item of data.items || []) {
      if (item?.id?.videoId) {
        searchResults.push({
          keyword,
          videoId: item.id.videoId,
          channelId: item.snippet.channelId,
        });
      }
    }
  }

  const uniqueVideoIds = [...new Set(searchResults.map((x) => x.videoId))];
  if (!uniqueVideoIds.length) return [];

  const videos = await getVideosByIds(uniqueVideoIds);
  const channelIds = [...new Set(videos.map((v) => v.channelId).filter(Boolean))];
  const channels = await getChannelsByIds(channelIds);
  const channelMap = new Map(channels.map((c) => [c.channelId, c]));
  const keywordMap = new Map(searchResults.map((x) => [x.videoId, x.keyword]));

  return videos
    .map((video) => {
      const channel = channelMap.get(video.channelId) || {};
      return calculateOpportunityScore({
        ...video,
        matchedKeyword: keywordMap.get(video.videoId),
        channelTitle: channel.channelTitle || video.channelTitle,
        subscriberCount: channel.subscriberCount,
        hiddenSubscriberCount: channel.hiddenSubscriberCount,
      });
    })
    .filter((video) => toNumber(video.viewCount) >= toNumber(minViews, 0))
    .filter((video) => {
      if (video.hiddenSubscriberCount) return true;
      const subs = toNumber(video.subscriberCount, 0);
      return subs <= toNumber(maxSubscribers, 50000);
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

async function getVideosByIds(videoIds) {
  const chunks = chunk(videoIds, 50);
  const all = [];

  for (const ids of chunks) {
    const data = await youtubeGet('/videos', {
      part: 'snippet,statistics,contentDetails',
      id: ids.join(','),
      maxResults: 50,
    });

    for (const item of data.items || []) {
      all.push({
        videoId: item.id,
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        publishedAt: item.snippet?.publishedAt,
        channelId: item.snippet?.channelId,
        channelTitle: item.snippet?.channelTitle,
        thumbnail: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url,
        viewCount: toNumber(item.statistics?.viewCount),
        likeCount: toNumber(item.statistics?.likeCount),
        commentCount: toNumber(item.statistics?.commentCount),
        duration: item.contentDetails?.duration,
        url: `https://www.youtube.com/watch?v=${item.id}`,
      });
    }
  }

  return all;
}

async function getChannelsByIds(channelIds) {
  const chunks = chunk(channelIds, 50);
  const all = [];

  for (const ids of chunks) {
    const data = await youtubeGet('/channels', {
      part: 'snippet,statistics',
      id: ids.join(','),
      maxResults: 50,
    });

    for (const item of data.items || []) {
      all.push({
        channelId: item.id,
        channelTitle: item.snippet?.title || '',
        subscriberCount: item.statistics?.subscriberCount ? toNumber(item.statistics.subscriberCount) : null,
        hiddenSubscriberCount: Boolean(item.statistics?.hiddenSubscriberCount),
        channelViewCount: toNumber(item.statistics?.viewCount),
        videoCount: toNumber(item.statistics?.videoCount),
      });
    }
  }

  return all;
}

function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}
