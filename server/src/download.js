import { Readable } from 'node:stream';
import { Innertube, Platform } from 'youtubei.js';

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const DOWNLOAD_OPTIONS = {
  type: 'video+audio',
  quality: 'best',
  format: 'mp4',
};
const DOWNLOAD_CLIENTS = ['ANDROID', 'MWEB', 'TV_SIMPLY', 'WEB'];

let youtubeClientPromise = null;

Platform.shim.eval = async (data) => new Function(data.output)();

export async function streamYoutubeDownload(req, res, next) {
  try {
    const videoId = String(req.params.videoId || '').trim();
    if (!VIDEO_ID_PATTERN.test(videoId)) {
      const err = new Error('유효하지 않은 YouTube videoId입니다.');
      err.statusCode = 400;
      throw err;
    }

    const { info, format, stream } = await getDownloadStream(videoId);

    if (!format) {
      const err = new Error('다운로드 가능한 MP4 형식을 찾지 못했습니다.');
      err.statusCode = 404;
      throw err;
    }

    const title = req.query.title || info.basic_info?.title || videoId;
    const filename = `${sanitizeFilename(title)}.mp4`;

    res.attachment(filename);
    res.type(format.mime_type?.split(';')[0] || 'video/mp4');
    if (format.content_length) res.setHeader('Content-Length', format.content_length);

    Readable.fromWeb(stream).on('error', next).pipe(res);
  } catch (error) {
    next(normalizeDownloadError(error));
  }
}

async function getYoutubeClient() {
  if (!youtubeClientPromise) youtubeClientPromise = Innertube.create();
  return youtubeClientPromise;
}

async function getDownloadStream(videoId) {
  const youtube = await getYoutubeClient();
  const errors = [];

  for (const client of DOWNLOAD_CLIENTS) {
    try {
      const options = { ...DOWNLOAD_OPTIONS, client };
      const info = await youtube.getInfo(videoId, { client });
      const format = info.chooseFormat(options);
      const stream = await info.download(options);
      return { info, format, stream };
    } catch (error) {
      errors.push(`${client}: ${error?.info?.response?.status || ''} ${error?.message || error}`);
    }
  }

  const err = new Error(errors.join(' | ') || 'No download clients succeeded');
  err.statusCode = 502;
  throw err;
}

function normalizeDownloadError(error) {
  const message = String(error?.message || '');
  const err = new Error(toUserDownloadMessage(message));
  err.statusCode = error?.statusCode || 502;
  err.details = process.env.NODE_ENV === 'development' ? message : undefined;
  return err;
}

function toUserDownloadMessage(message) {
  if (/login required/i.test(message)) return '로그인이 필요한 영상이라 다운로드할 수 없습니다.';
  if (/unavailable|unplayable/i.test(message)) return 'YouTube에서 재생할 수 없는 영상이라 다운로드할 수 없습니다.';
  if (/403|Forbidden/i.test(message)) return 'YouTube가 이 영상 스트림 요청을 거부했습니다.';
  if (/No matching formats|playable formats|format/i.test(message)) {
    return '이 영상에서 다운로드 가능한 MP4 형식을 찾지 못했습니다.';
  }
  return 'YouTube 다운로드 스트림을 가져오지 못했습니다.';
}

function sanitizeFilename(value) {
  const clean = String(value)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return clean || 'youtube-video';
}
