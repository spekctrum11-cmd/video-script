import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export type CompressionLevel = 'aggressive' | 'medium' | 'light';

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

/** Returns ffmpeg args for a given compression level */
function getCompressionArgs(level: CompressionLevel): string[] {
    switch (level) {
        case 'aggressive':
            return [
                '-y',
                '-i', 'pipe:0',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '30',
                '-vf', 'scale=480:-2',
                '-r', '15',
                '-c:a', 'aac',
                '-ac', '1',
                '-ar', '22050',
                '-b:a', '32k',
                '-f', 'mp4',
                '-movflags', '+faststart',
                'pipe:1',
            ];
        case 'medium':
            return [
                '-y',
                '-i', 'pipe:0',
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '23',
                '-vf', 'scale=640:-2',
                '-r', '20',
                '-c:a', 'aac',
                '-ac', '1',
                '-ar', '22050',
                '-b:a', '48k',
                '-f', 'mp4',
                '-movflags', '+faststart',
                'pipe:1',
            ];
        case 'light':
            return [
                '-y',
                '-i', 'pipe:0',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '18',
                '-vf', 'scale=854:-2',
                '-r', '24',
                '-c:a', 'aac',
                '-ac', '2',
                '-ar', '44100',
                '-b:a', '96k',
                '-f', 'mp4',
                '-movflags', '+faststart',
                'pipe:1',
            ];
    }
}

/** Returns a human-readable label for the compression level */
function getLevelLabel(level: CompressionLevel): string {
    switch (level) {
        case 'aggressive': return 'aggressive (~50x)';
        case 'medium': return 'medium (~20x)';
        case 'light': return 'light (~5x)';
    }
}

/**
 * Compresses a video buffer at the given quality level.
 * Each level progressively reduces compression to ensure output is always
 * smaller than input when possible.
 *
 * @param inputBuffer - Raw video file buffer
 * @param level - Compression quality level (default: aggressive)
 * @returns Compressed MP4 buffer
 */
async function compressAtLevel(inputBuffer: Buffer, level: CompressionLevel): Promise<Buffer> {
    // Resolve ffmpeg path lazily (first call only)
    if (!_ffmpegPath) {
        _ffmpegPath = getFfmpegPath();
        console.log(`[Compress] ffmpeg resolved to: ${_ffmpegPath}`);
    }

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let stderr = '';
        const startTime = Date.now();
        const args = getCompressionArgs(level);

        const ffmpeg = spawn(_ffmpegPath!, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // 60-second safety timeout
        const timeout = setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error(`ffmpeg ${getLevelLabel(level)} compression timed out after 60 seconds`));
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
                    `[Compress] ${getLevelLabel(level)}: ${inMB}MB → ${outMB}MB (${ratio.toFixed(1)}x) in ${elapsed}s`
                );

                resolve(compressed);
            } else {
                reject(new Error(
                    `ffmpeg ${getLevelLabel(level)} exited with code ${code}. ` +
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

/**
 * Compresses a video buffer with progressive fallback.
 * 
 * Tries aggressive compression first, then falls back to lighter levels
 * if the output is not smaller than the input. This guarantees that the
 * returned buffer is ALWAYS compressed (smaller than input), unless
 * all three levels fail.
 * 
 * Levels tried in order:
 * 1. Aggressive  (~50x): CRF 30, 480p, 15fps, mono 22kHz 32kbps
 * 2. Medium      (~20x): CRF 23, 640p, 20fps, mono 22kHz 48kbps
 * 3. Light       (~5x):  CRF 18, 854p, 24fps, stereo 44kHz 96kbps
 *
 * @param inputBuffer - Raw video file buffer
 * @returns Compressed MP4 buffer (always smaller than input)
 * @throws Error if all compression levels fail
 */
export async function compressVideo(inputBuffer: Buffer): Promise<Buffer> {
    const levels: CompressionLevel[] = ['aggressive', 'medium', 'light'];

    for (const level of levels) {
        try {
            const compressed = await compressAtLevel(inputBuffer, level);
            const inMB = (inputBuffer.length / 1024 / 1024).toFixed(2);
            const outMB = (compressed.length / 1024 / 1024).toFixed(2);
            const ratio = inputBuffer.length / compressed.length;

            console.log(`[Compress] ${getLevelLabel(level)}: ${inMB}MB → ${outMB}MB (${ratio.toFixed(1)}x)`);

            // Accept ANY reduction in size
            if (compressed.length < inputBuffer.length) {
                return compressed;
            }

            console.warn(`[Compress] ${getLevelLabel(level)} produced no reduction (${ratio.toFixed(2)}x), trying next level...`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[Compress] ${getLevelLabel(level)} failed: ${msg}`);

            // If ffmpeg is not available, propagate immediately
            if (msg.includes("spawn") || msg.includes("ENOENT") || msg.includes("ffmpeg binary not found")) {
                throw new Error("Video processing tool (ffmpeg) is not available on the server. Please contact support.");
            }
        }
    }

    // All levels either failed or produced no reduction
    throw new Error(
        "Failed to compress video. All compression levels were attempted but none could reduce the file size. " +
        "Please try again with a different video format or a shorter recording."
    );
}