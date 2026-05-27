import { getMockNaverSearchTrends, useMockData } from './mockData.js';

function requireNaverKeys() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const err = new Error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 .env에 없습니다.');
    err.statusCode = 400;
    throw err;
  }
  return { clientId, clientSecret };
}

export async function getNaverSearchTrends(options = {}) {
  const {
    keywords = [],
    startDate,
    endDate,
    timeUnit = 'date',
    device,
    gender,
    ages,
  } = options;

  const cleanKeywords = Array.isArray(keywords)
    ? keywords.map((k) => String(k).trim()).filter(Boolean)
    : String(keywords).split(',').map((k) => k.trim()).filter(Boolean);

  if (!cleanKeywords.length) {
    const err = new Error('트렌드를 비교할 키워드를 1개 이상 입력하세요.');
    err.statusCode = 400;
    throw err;
  }

  if (useMockData()) {
    return getMockNaverSearchTrends({ ...options, keywords: cleanKeywords });
  }

  const { clientId, clientSecret } = requireNaverKeys();

  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const body = {
    startDate: startDate || defaultStart,
    endDate: endDate || defaultEnd,
    timeUnit,
    keywordGroups: cleanKeywords.map((keyword) => ({ groupName: keyword, keywords: [keyword] })),
  };

  if (device) body.device = device;
  if (gender) body.gender = gender;
  if (ages) body.ages = ages;

  const res = await fetch('https://openapi.naver.com/v1/datalab/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.errorMessage || 'NAVER DataLab API 요청 실패');
    err.statusCode = res.status;
    err.details = data;
    throw err;
  }

  return {
    ...data,
    growth: calculateTrendGrowth(data.results || []),
  };
}

function calculateTrendGrowth(results) {
  return results.map((group) => {
    const data = group.data || [];
    const first = data[0]?.ratio ?? 0;
    const last = data[data.length - 1]?.ratio ?? 0;
    const diff = last - first;
    const growthRate = first > 0 ? (diff / first) * 100 : null;
    return {
      keyword: group.title,
      first,
      last,
      diff,
      growthRate,
    };
  }).sort((a, b) => b.diff - a.diff);
}
