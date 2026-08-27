import { execFile } from 'node:child_process';

export function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffmpeg',
      ['-y', '-hide_banner', ...args],
      { maxBuffer: 1024 * 1024 * 64 },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`ffmpeg failed: ${err.message}\n${stderr}`));
        } else {
          resolve(stderr);
        }
      },
    );
  });
}

export type ProbeResult = { durationSec: number; width: number; height: number };

export function probe(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v', 'error',
        '-print_format', 'json',
        '-show_entries', 'format=duration:stream=width,height,codec_type',
        filePath,
      ],
      { maxBuffer: 1024 * 1024 * 16 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`ffprobe failed: ${err.message}\n${stderr}`));
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
          resolve({
            durationSec: parseFloat(data.format.duration),
            width: videoStream?.width ?? 0,
            height: videoStream?.height ?? 0,
          });
        } catch (parseErr) {
          reject(parseErr);
        }
      },
    );
  });
}

/** Escapes a filesystem path for safe use inside an ffmpeg filtergraph argument (e.g. subtitles=path). */
export function escapeFfmpegFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}
