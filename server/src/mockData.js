import { calculateOpportunityScore, toNumber } from './scoring.js';

export function useMockData() {
  return String(process.env.USE_MOCK_DATA || '').toLowerCase() === 'true';
}

export function getMockOpportunityVideos(options = {}) {
  const {
    keywords = [],
    maxSubscribers = 50000,
    minViews = 0,
  } = options;

  const cleanKeywords = Array.isArray(keywords)
    ? keywords.map((k) => String(k).trim()).filter(Boolean)
    : String(keywords).split(',').map((k) => k.trim()).filter(Boolean);

  const fallbackKeywords = cleanKeywords.length ? cleanKeywords : ['AI', '쇼츠', '부업'];
  const now = Date.now();

  return MOCK_VIDEOS.map((video, index) => calculateOpportunityScore({
    ...video,
    matchedKeyword: fallbackKeywords[index % fallbackKeywords.length],
    publishedAt: new Date(now - video.hoursAgo * 60 * 60 * 1000).toISOString(),
  }))
    .filter((video) => toNumber(video.viewCount) >= toNumber(minViews, 0))
    .filter((video) => video.hiddenSubscriberCount || toNumber(video.subscriberCount, 0) <= toNumber(maxSubscribers, 50000))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

export function getMockNaverSearchTrends(options = {}) {
  const {
    keywords = [],
    startDate,
    endDate,
  } = options;

  const cleanKeywords = Array.isArray(keywords)
    ? keywords.map((k) => String(k).trim()).filter(Boolean)
    : String(keywords).split(',').map((k) => k.trim()).filter(Boolean);

  const today = new Date();
  const end = endDate || today.toISOString().slice(0, 10);
  const start = startDate || new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const groups = (cleanKeywords.length ? cleanKeywords : ['AI 쇼츠', '부업', 'K뷰티']).slice(0, 5);

  const results = groups.map((keyword, index) => {
    const first = 20 + index * 9;
    const last = Math.min(100, first + 24 - index * 3);
    return {
      title: keyword,
      keywords: [keyword],
      data: [
        { period: start, ratio: first },
        { period: end, ratio: last },
      ],
    };
  });

  return {
    startDate: start,
    endDate: end,
    timeUnit: 'date',
    results,
    growth: results.map((group) => {
      const first = group.data[0].ratio;
      const last = group.data[1].ratio;
      const diff = last - first;
      return {
        keyword: group.title,
        first,
        last,
        diff,
        growthRate: (diff / first) * 100,
      };
    }).sort((a, b) => b.diff - a.diff),
  };
}

const MOCK_VIDEOS = [
  {
    videoId: 'demo-ai-shorts',
    title: 'AI 쇼츠 자동화로 3일 만에 조회수 터진 과정',
    description: 'Demo data',
    channelId: 'demo-channel-1',
    channelTitle: '작은채널 실험실',
    thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    viewCount: 184000,
    likeCount: 4200,
    commentCount: 318,
    subscriberCount: 8200,
    hiddenSubscriberCount: false,
    duration: 'PT58S',
    url: 'https://www.youtube.com/',
    hoursAgo: 18,
  },
  {
    videoId: 'demo-side-hustle',
    title: '초보 부업 아이디어 5개 직접 해보고 남긴 현실 후기',
    description: 'Demo data',
    channelId: 'demo-channel-2',
    channelTitle: '퇴근후실험',
    thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/mqdefault.jpg',
    viewCount: 96500,
    likeCount: 2100,
    commentCount: 186,
    subscriberCount: 4300,
    hiddenSubscriberCount: false,
    duration: 'PT3M21S',
    url: 'https://www.youtube.com/',
    hoursAgo: 34,
  },
  {
    videoId: 'demo-kbeauty',
    title: '해외에서 갑자기 뜨는 K뷰티 키워드 정리',
    description: 'Demo data',
    channelId: 'demo-channel-3',
    channelTitle: '뷰티데이터',
    thumbnail: 'https://i.ytimg.com/vi/jNQXAC9IVRw/mqdefault.jpg',
    viewCount: 71200,
    likeCount: 1350,
    commentCount: 94,
    subscriberCount: 12800,
    hiddenSubscriberCount: false,
    duration: 'PT6M02S',
    url: 'https://www.youtube.com/',
    hoursAgo: 52,
  },
];
