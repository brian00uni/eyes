import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { findOpportunityVideos } from './youtube.js';
import { getNaverSearchTrends } from './naver.js';
import { summarizeVideos } from './scoring.js';
import { streamYoutubeDownload } from './download.js';

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '127.0.0.1';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, '../../client/dist');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/youtube/opportunities', async (req, res, next) => {
  try {
    const videos = await findOpportunityVideos(req.body);
    res.json({
      count: videos.length,
      summary: summarizeVideos(videos),
      items: videos,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/youtube/download/:videoId', streamYoutubeDownload);

app.post('/api/naver/trends', async (req, res, next) => {
  try {
    const data = await getNaverSearchTrends(req.body);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

app.post('/api/analyze/summary', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  res.json(summarizeVideos(items));
});

app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDistPath, 'index.html'), (error) => {
    if (error) next();
  });
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    message: error.message || '서버 오류가 발생했습니다.',
    details: error.details || undefined,
  });
});

const server = app.listen(port, host, () => {
  console.log(`YouTube AI Trend Finder running on http://${host}:${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set PORT=4001 or stop the existing process.`);
    process.exit(1);
  }
  throw error;
});
