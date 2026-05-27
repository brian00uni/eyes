import { Readable } from 'node:stream';
import { Innertube, Platform } from 'youtubei.js';

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const DOWNLOAD_OPTIONS = {
  type: 'video+audio',
  quality: 'best',
  format: 'mp4',
};

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

    const youtube = await getYoutubeClient();
    const info = await youtube.getInfo(videoId);
    const format = info.chooseFormat(DOWNLOAD_OPTIONS);

    if (!format) {
      const err = new Error('다운로드 가능한 MP4 형식을 찾지 못했습니다.');
      err.statusCode = 404;
      throw err;
    }

    const title = req.query.title || info.basic_info?.title || videoId;
    const filename = `${sanitizeFilename(title)}.mp4`;
    const stream = await info.download(DOWNLOAD_OPTIONS);

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
