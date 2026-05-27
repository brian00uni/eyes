export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function hoursSince(dateString) {
  const published = new Date(dateString).getTime();
  if (!Number.isFinite(published)) return 1;
  const diff = Date.now() - published;
  return Math.max(diff / 1000 / 60 / 60, 1);
}

export function calculateOpportunityScore(video) {
  const views = toNumber(video.viewCount);
  const likes = toNumber(video.likeCount);
  const comments = toNumber(video.commentCount);
  const subscribers = video.hiddenSubscriberCount ? null : toNumber(video.subscriberCount, null);
  const hours = hoursSince(video.publishedAt);

  const safeSubscribers = subscribers && subscribers > 0 ? subscribers : 1;
  const viewSubscriberRatio = subscribers && subscribers > 0 ? views / subscribers : null;
  const viewsPerHour = views / hours;

  const opportunityScore =
    views / Math.sqrt(safeSubscribers) +
    viewsPerHour * 2 +
    comments * 3 +
    likes * 0.2;

  return {
    ...video,
    viewSubscriberRatio,
    viewsPerHour,
    opportunityScore,
  };
}

export function summarizeVideos(videos) {
  if (!videos.length) {
    return {
      headline: '조건에 맞는 영상이 없습니다.',
      bullets: ['키워드를 넓히거나 최소 조회수/구독자 제한을 낮춰보세요.'],
      hotKeywords: [],
    };
  }

  const top = videos[0];
  const hotKeywords = extractTitleKeywords(videos.map((v) => v.title));
  const smallChannelHits = videos.filter((v) => Number(v.subscriberCount) <= 10000 && Number(v.viewCount) >= 10000);

  return {
    headline: `가장 강한 후보는 "${top.title}" 입니다.`,
    bullets: [
      `최고 기회점수: ${Math.round(top.opportunityScore).toLocaleString('ko-KR')}`,
      `상위권 반복 키워드: ${hotKeywords.slice(0, 8).join(', ') || '분석 불가'}`,
      `구독자 1만 이하이면서 조회수 1만 이상 후보: ${smallChannelHits.length}개`,
      '정확한 검색 유입/CTR은 남의 채널에서는 확인할 수 없고, 조회수·구독자·댓글·업로드 시간을 기반으로 추정합니다.',
    ],
    hotKeywords,
  };
}

function extractTitleKeywords(titles) {
  const stopWords = new Set([
    '그리고', '그러나', '이렇게', '저렇게', '오늘', '진짜', '정말', '영상', 'shorts', 'short', 'youtube', '유튜브', '쇼츠', 'feat', 'with', 'the', 'and', 'for', 'you', 'of', 'to', 'in', 'a', 'is'
  ]);

  const counts = new Map();
  for (const title of titles) {
    const words = String(title)
      .toLowerCase()
      .replace(/[\[\](){}.,!?"'“”‘’:;|]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && !stopWords.has(w));

    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}
