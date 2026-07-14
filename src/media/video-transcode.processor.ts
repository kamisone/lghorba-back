import { Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpeg = require('fluent-ffmpeg');
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { path as ffprobePath } from '@ffprobe-installer/ffprobe';
import { DlqAwareWorker } from '../dlq/dlq-aware.worker';
import { DlqService } from '../dlq/dlq.service';
import { GcsService } from '../gcs/gcs.service';
import { MediaAsset } from './media-asset.entity';
import { TranscodeJobData, VIDEO_TRANSCODE_QUEUE } from './video-transcode.constants';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/** Quality ladder — rungs above the source height are skipped. */
const HLS_RUNGS = [
  { height: 1080, videoBitrate: '5000k', maxrate: '5350k', bufsize: '7500k', audioBitrate: '128k' },
  { height: 720,  videoBitrate: '2800k', maxrate: '2996k', bufsize: '4200k', audioBitrate: '128k' },
  { height: 480,  videoBitrate: '1200k', maxrate: '1284k', bufsize: '1800k', audioBitrate: '96k'  },
] as const;

const SEGMENT_SECONDS = 4;

/** Segments are content-addressed by asset id and never mutate once transcoded. */
const HLS_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.m4s':  'video/iso.segment',
  '.mp4':  'video/mp4',
  '.jpg':  'image/jpeg',
};

@Processor(VIDEO_TRANSCODE_QUEUE)
export class VideoTranscodeProcessor extends DlqAwareWorker {
  protected readonly queueName = VIDEO_TRANSCODE_QUEUE;
  private readonly logger = new Logger(VideoTranscodeProcessor.name);

  constructor(
    dlqService: DlqService,
    @InjectRepository(MediaAsset) private readonly assetRepo: Repository<MediaAsset>,
    private readonly gcs: GcsService,
  ) {
    super(dlqService);
  }

  async process(job: Job<TranscodeJobData>): Promise<void> {
    const asset = await this.assetRepo.findOne({ where: { id: job.data.assetId } });
    if (!asset) {
      this.logger.warn(`Transcode skipped — asset ${job.data.assetId} not found`);
      return;
    }
    if (!asset.mimeType.startsWith('video/')) {
      this.logger.warn(`Transcode skipped — asset ${asset.id} is not a video (${asset.mimeType})`);
      return;
    }

    await this.assetRepo.update(asset.id, { transcodeStatus: 'processing' });
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transcode-'));

    try {
      const sourcePath = path.join(tmpDir, `source${path.extname(asset.storageKey) || '.mp4'}`);
      await this.gcs.downloadToFile(asset.storageKey, sourcePath);

      const { width, height, duration, hasAudio } = await probe(sourcePath);
      this.logger.log(`Transcoding asset ${asset.id}: ${width}x${height}, ${duration.toFixed(1)}s`);

      // Rungs at or below the source height; always keep at least the smallest.
      const rungs = HLS_RUNGS.filter(r => r.height <= height);
      if (rungs.length === 0) rungs.push(HLS_RUNGS[HLS_RUNGS.length - 1]);

      const outDir = path.join(tmpDir, 'out');
      await fs.mkdir(outDir);

      // ── HLS renditions (one pass per rung) + hand-written master playlist ──
      for (const rung of rungs) {
        await this.encodeHlsRendition(sourcePath, outDir, rung, hasAudio);
      }
      const masterName = 'master.m3u8';
      await fs.writeFile(path.join(outDir, masterName), buildMasterPlaylist(rungs, width, height), 'utf8');

      // ── Optimized MP4 fallback (720p cap) ──
      const mp4Name = 'fallback.mp4';
      await this.encodeMp4Fallback(sourcePath, path.join(outDir, mp4Name), Math.min(height, 720), hasAudio);

      // ── Poster frame ──
      const posterName = 'poster.jpg';
      await extractPoster(sourcePath, outDir, posterName, Math.min(duration / 2, 1));

      // ── Upload everything under the public media/ prefix ──
      const keyPrefix = `media/hls/${asset.id}`;
      const files = await fs.readdir(outDir);
      for (const file of files) {
        const contentType = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
        await this.gcs.uploadFromFile(
          path.join(outDir, file),
          `${keyPrefix}/${file}`,
          contentType,
          'publicRead',
          HLS_CACHE_CONTROL,
        );
      }

      await this.assetRepo.update(asset.id, {
        hlsKey:          `${keyPrefix}/${masterName}`,
        mp4Key:          `${keyPrefix}/${mp4Name}`,
        autoPosterKey:   `${keyPrefix}/${posterName}`,
        transcodeStatus: 'ready',
        // Source dimensions weren't extracted at upload time for videos
        ...(asset.width == null ? { width } : {}),
        ...(asset.height == null ? { height } : {}),
        ...(asset.durationSeconds == null ? { durationSeconds: Math.round(duration) } : {}),
      });
      this.logger.log(`Transcode ready for asset ${asset.id} (${rungs.length} rendition(s))`);
    } catch (err) {
      await this.assetRepo.update(asset.id, { transcodeStatus: 'failed' });
      throw err;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private encodeHlsRendition(
    sourcePath: string,
    outDir: string,
    rung: (typeof HLS_RUNGS)[number],
    hasAudio: boolean,
  ): Promise<void> {
    const name = `${rung.height}p`;
    return runFfmpeg(
      ffmpeg(sourcePath)
        .videoCodec('libx264')
        .outputOptions([
          '-preset', 'medium',
          '-profile:v', 'main',
          '-vf', `scale=-2:${rung.height}`,
          '-b:v', rung.videoBitrate,
          '-maxrate', rung.maxrate,
          '-bufsize', rung.bufsize,
          // Closed GOP aligned to the segment length so segments are independently decodable
          '-g', String(SEGMENT_SECONDS * 30),
          '-keyint_min', String(SEGMENT_SECONDS * 30),
          '-sc_threshold', '0',
          ...(hasAudio ? ['-c:a', 'aac', '-b:a', rung.audioBitrate, '-ac', '2'] : ['-an']),
          '-hls_time', String(SEGMENT_SECONDS),
          '-hls_playlist_type', 'vod',
          '-hls_segment_type', 'fmp4',
          '-hls_fmp4_init_filename', `${name}_init.mp4`,
          '-hls_segment_filename', path.join(outDir, `${name}_%03d.m4s`),
        ])
        .output(path.join(outDir, `${name}.m3u8`)),
    );
  }

  private encodeMp4Fallback(sourcePath: string, outPath: string, height: number, hasAudio: boolean): Promise<void> {
    return runFfmpeg(
      ffmpeg(sourcePath)
        .videoCodec('libx264')
        .outputOptions([
          '-preset', 'medium',
          '-profile:v', 'main',
          '-vf', `scale=-2:${height}`,
          '-crf', '23',
          '-maxrate', '3000k',
          '-bufsize', '4500k',
          ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an']),
          '-movflags', '+faststart',
        ])
        .output(outPath),
    );
  }
}

// ── ffmpeg helpers (pure, promise wrappers) ──────────────────────────────────

function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .on('error', (err: Error, _stdout: string, stderr: string) =>
        reject(new Error(`ffmpeg failed: ${err.message}\n${(stderr ?? '').slice(-2000)}`)))
      .on('end', () => resolve())
      .run();
  });
}

function probe(sourcePath: string): Promise<{ width: number; height: number; duration: number; hasAudio: boolean }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(sourcePath, (err, data) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      const video = data.streams.find(s => s.codec_type === 'video');
      if (!video?.width || !video?.height) return reject(new Error('No decodable video stream found'));
      resolve({
        width:    video.width,
        height:   video.height,
        duration: Number(data.format?.duration ?? video.duration ?? 0),
        hasAudio: data.streams.some(s => s.codec_type === 'audio'),
      });
    });
  });
}

function extractPoster(sourcePath: string, outDir: string, filename: string, atSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .on('error', (err: Error) => reject(new Error(`poster extraction failed: ${err.message}`)))
      .on('end', () => resolve())
      .screenshots({
        timestamps: [Math.max(atSeconds, 0)],
        filename,
        folder: outDir,
        size: '1280x?',
      });
  });
}

function buildMasterPlaylist(
  rungs: ReadonlyArray<(typeof HLS_RUNGS)[number]>,
  sourceWidth: number,
  sourceHeight: number,
): string {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7'];
  for (const rung of rungs) {
    // Even-rounded width matching ffmpeg's scale=-2:<height>
    const width = Math.round((sourceWidth / sourceHeight) * rung.height / 2) * 2;
    const bandwidth = Math.round(
      (parseInt(rung.videoBitrate, 10) + parseInt(rung.audioBitrate, 10)) * 1000 * 1.1,
    );
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${rung.height},CODECS="avc1.4d401f,mp4a.40.2"`,
      `${rung.height}p.m3u8`,
    );
  }
  return lines.join('\n') + '\n';
}
