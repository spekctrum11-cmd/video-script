import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Resolves the path to the ffmpeg binary.
 * 
 * Strategy:
 * 1. Windows: Try @ffmpeg-installer/win32-x64 (optional dependency, only resolves on Windows)
 * 2. Linux/Mac: Try system PATH (ffmpeg should be installed via buildpack or apt-get)
 * 3. Fallback: Try common node_modules paths
 * 
 * Called at runtime (not module load) to avoid Next.js Turbopack bundling issues
 * with dynamic require() and filesystem operations.
 */
function getFfmpegPath(): string {
    const platform = process.platform;
    const isWin = platform === 'win32';
    const binaryName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

    // On Windows: try the optional @ffmpeg-installer/win32-x64 package
    if (isWin) {
        try {
            // Dynamic require to avoid Turbopack bundling issues
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const ffmpegInstaller = require('@ffmpeg-installer/win32-x64');
            if (ffmpegInstaller?.path && existsSync(ffmpegInstaller.path)) {
                return ffmpegInstaller.path;
            }
        } catch {
            // Package not installed, fall through
        }

        // Fallback on Windows: check node_modules path directly
        const winPaths: string[] = [
            join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
            join(process.cwd(), '..', 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe'),
        ];

        for (const p of winPaths) {
            try {
                if (existsSync(p)) {
                    return p;
                }
            } catch {
                continue;
            }
        }
    }

    // Try system PATH (works on Linux with ffmpeg installed, and as fallback on Windows)
    try {
        const cmd = isWin ? 'where' : 'which';
        const result = execSync(`${cmd} ffmpeg`, { encoding: 'utf8', timeout: 2000 }).trim().split('\n')[0];
        if (result) return result;
    } catch {
        // ignore
    }

    throw new Error(
        `ffmpeg binary not found. ${isWin
            ? 'Ensure @ffmpeg-installer/win32-x64 is installed correctly.'
            : 'Ensure ffmpeg is installed on your system (e.g., apt-get install ffmpeg).'
        }`
    );
}

/** Lazy-cached ffmpeg path */
let _ffmpegPath: string | null = null;

/**
 * Compresses a video buffer targeting ~50x reduction in size.
 * Uses ffmpeg with aggressive compression settings suitable for verification videos
 * where content must be understandable but visual quality is not critical.
 *
 * Compression strategy:
 * - Resolution: 480px width (scaled from any input, maintains aspect ratio)
 * - Framerate: 15 fps (halves data from typical 30fps recording)
 * - Codec: libx264 with CRF 30 (high compression)
 * - Preset: ultrafast (fast encoding, minimal CPU impact)
 * - Audio: mono 22kHz at 32kbps (bare-minimum voice quality)
 *
 * @param inputBuffer - Raw video file buffer (e.g., from a recorded webm)
 * @returns Compressed MP4 buffer
 */
export async function compressVideo(inputBuffer: Buffer): Promise<Buffer> {
    // Resolve ffmpeg path lazily (first call only)
    if (!_ffmpegPath) {
        _ffmpegPath = getFfmpegPath();
        console.log(`[Compress] ffmpeg resolved to: ${_ffmpegPath}`);
    }

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let stderr = '';
        const startTime = Date.now();

        const ffmpeg = spawn(_ffmpegPath!, [
            '-y',
            '-i', 'pipe:0',
            // Video: libx264 with aggressive compression
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '30',
            // Scale to 480p width (maintains aspect)
            '-vf', 'scale=480:-2',
            // Drop framerate to 15fps
            '-r', '15',
            // Audio: minimal viable
            '-c:a', 'aac',
            '-ac', '1',
            '-ar', '22050',
            '-b:a', '32k',
            // Output
            '-f', 'mp4',
            '-movflags', '+faststart',
            'pipe:1',
        ], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // 60-second safety timeout
        const timeout = setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error('ffmpeg compression timed out after 60 seconds'));
        }, 60_000);

        ffmpeg.stdout.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });

        ffmpeg.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        ffmpeg.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`ffmpeg spawn error: ${err.message}. Path: ${_ffmpegPath}`));
        });

        ffmpeg.on('close', (code) => {
            clearTimeout(timeout);

            if (code === 0) {
                const compressed = Buffer.concat(chunks);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const ratio = inputBuffer.length / compressed.length;
                const inMB = (inputBuffer.length / 1024 / 1024).toFixed(2);
                const outMB = (compressed.length / 1024 / 1024).toFixed(2);

                console.log(
                    `[Compress] ${inMB}MB → ${outMB}MB (${ratio.toFixed(1)}x) in ${elapsed}s`
                );

                // Warn if compression is too low (indicates input may not need it)
                if (ratio < 2 && inputBuffer.length > 500_000) {
                    console.warn(
                        `[Compress] WARNING: Compression ratio only ${ratio.toFixed(1)}x. ` +
                        `Expected ~50x from raw recordings. Input may already be compressed.`
                    );
                }

                resolve(compressed);
            } else {
                reject(new Error(
                    `ffmpeg exited with code ${code}. ` +
                    `stderr: ${stderr.slice(-500)}`
                ));
            }
        });

        // Feed input and start processing
        try {
            ffmpeg.stdin.write(inputBuffer);
            ffmpeg.stdin.end();
        } catch (err) {
            clearTimeout(timeout);
            reject(new Error(`Failed to write to ffmpeg stdin: ${err}`));
        }
    });
}