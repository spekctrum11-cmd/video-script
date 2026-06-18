import { spawn } from 'child_process';
import { existsSync } from 'fs';

export type CompressionLevel = 'aggressive' | 'medium' | 'light';

interface LevelConfig {
    label: string;
    args: string[];
    /** Timeout in ms for this compression level */
    timeout: number;
}

/**
 * Resolves the path to the ffmpeg binary.
 * 
 * Uses `ffmpeg-static` which bundles a platform-specific ffmpeg binary
 * for Windows, Linux, and macOS. No system-level ffmpeg installation needed.
 * 
 * Falls back to system PATH if ffmpeg-static is not available.
 * Called at runtime (not module load) to avoid Next.js Turbopack bundling issues
 * with dynamic require() and filesystem operations.
 */
function getFfmpegPath(): string {
    // Primary: use ffmpeg-static (cross-platform, bundles binary for all OS)
    try {
        // Dynamic require to avoid Turbopack bundling issues
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ffmpegPath = require('ffmpeg-static');
        if (ffmpegPath && existsSync(ffmpegPath)) {
            return ffmpegPath;
        }
    } catch {
        // Package not installed, fall through
    }

    // Fallback: try system PATH
    try {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? 'where' : 'which';
        const { execSync } = require('child_process');
        const result = execSync(`${cmd} ffmpeg`, { encoding: 'utf8', timeout: 2000 }).trim().split('\n')[0];
        if (result) return result;
    } catch {
        // ignore
    }

    throw new Error(
        'ffmpeg binary not found. Ensure ffmpeg-static is installed correctly.'
    );
}

/** Lazy-cached ffmpeg path */
let _ffmpegPath: string | null = null;

/**
 * Builds the compression configuration for each level.
 * 
 * Key design decisions:
 * - `-analyzeduration 100M`: Ensures ffmpeg can properly probe piped webm input
 *   without failing (pipe:0 has no seek capability, so ffmpeg needs 
 *   enough analyzeduration budget to figure out the format).
 * - `-probesize 100M`: Same reason — large probe window for pipe input.
 * - `fflags +genpts`: Generates PTS timestamps for piped input, critical for webm
 *   streams from MediaRecorder which may have missing/invalid timestamps.
 * - `vsync cfr`: Forces constant framerate output, handles variable framerate 
 *   webm recordings gracefully.
 * - Each level has its OWN timeout based on preset complexity.
 */
function getLevelConfig(level: CompressionLevel): LevelConfig {
    // Base args for all levels — critical for pipe input reliability
    const baseInput = [
        '-y',
        '-analyzeduration', '100M',
        '-probesize', '100M',
        '-fflags', '+genpts',
        '-i', 'pipe:0',
        '-vsync', 'cfr',
    ];

    switch (level) {
        case 'aggressive':
            return {
                label: 'aggressive (~50x)',
                timeout: 60_000, // ultrafast preset — should finish quickly
                args: [
                    ...baseInput,
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-crf', '35',      // Even more aggressive — 35 vs 30
                    '-vf', 'scale=360:-2', // Lower resolution — 360p vs 480p
                    '-r', '12',         // Lower framerate — 12fps vs 15fps
                    '-c:a', 'aac',
                    '-ac', '1',
                    '-ar', '22050',
                    '-b:a', '24k',      // Lower audio bitrate
                    '-f', 'mp4',
                    '-movflags', '+faststart',
                    'pipe:1',
                ],
            };
        case 'medium':
            return {
                label: 'medium (~20x)',
                timeout: 90_000, // veryfast preset needs more time
                args: [
                    ...baseInput,
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '28',
                    '-vf', 'scale=480:-2',
                    '-r', '18',
                    '-c:a', 'aac',
                    '-ac', '1',
                    '-ar', '22050',
                    '-b:a', '48k',
                    '-f', 'mp4',
                    '-movflags', '+faststart',
                    'pipe:1',
                ],
            };
        case 'light':
            return {
                label: 'light (~5x)',
                timeout: 120_000, // medium preset is slowest — full maxDuration
                args: [
                    ...baseInput,
                    '-c:v', 'libx264',
                    '-preset', 'medium',
                    '-crf', '23',
                    '-vf', 'scale=640:-2',
                    '-r', '24',
                    '-c:a', 'aac',
                    '-ac', '2',
                    '-ar', '44100',
                    '-b:a', '96k',
                    '-f', 'mp4',
                    '-movflags', '+faststart',
                    'pipe:1',
                ],
            };
    }
}

/**
 * Executes a single ffmpeg compression pass.
 * Uses spawn with pipe:0 stdin and pipe:1 stdout for in-memory processing.
 */
async function compressAtLevel(inputBuffer: Buffer, level: CompressionLevel): Promise<Buffer> {
    if (!_ffmpegPath) {
        _ffmpegPath = getFfmpegPath();
        console.log(`[Compress] ffmpeg resolved to: ${_ffmpegPath}`);
    }

    const config = getLevelConfig(level);

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let stderr = '';
        const startTime = Date.now();

        const ffmpeg = spawn(_ffmpegPath!, config.args, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Per-level timeout based on preset complexity
        const timeout = setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            reject(new Error(
                `[TIMEOUT ${config.timeout / 1000}s] ${config.label}. ` +
                `Video size: ${(inputBuffer.length / 1024 / 1024).toFixed(2)}MB. ` +
                `Last stderr: ${stderr.slice(-300)}`
            ));
        }, config.timeout);

        ffmpeg.stdout.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
        });

        ffmpeg.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        ffmpeg.on('error', (err) => {
            clearTimeout(timeout);
            reject(new Error(`[SPAWN_ERROR] ${config.label}: ${err.message}. Path: ${_ffmpegPath}`));
        });

        ffmpeg.on('close', (code) => {
            clearTimeout(timeout);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const compressed = Buffer.concat(chunks);
            const ratio = inputBuffer.length / compressed.length;
            const inMB = (inputBuffer.length / 1024 / 1024).toFixed(2);
            const outMB = (compressed.length / 1024 / 1024).toFixed(2);

            // Log stderr for diagnostics even on success
            const stderrTail = stderr.slice(-500).replace(/\n/g, ' | ');
            console.log(
                `[Compress] ${config.label}: ${inMB}MB→${outMB}MB (${ratio.toFixed(1)}x) ` +
                `code=${code} time=${elapsed}s stderr="${stderrTail}"`
            );

            if (code === 0) {
                if (compressed.length === 0) {
                    reject(new Error(`[EMPTY_OUTPUT] ${config.label}: ffmpeg produced zero bytes`));
                    return;
                }
                resolve(compressed);
            } else {
                // Non-zero exit — include full context
                reject(new Error(
                    `[EXIT_CODE=${code}] ${config.label}. ` +
                    `${inMB}MB input, ${compressed.length > 0 ? outMB + 'MB output' : 'zero output'}, ` +
                    `${elapsed}s elapsed. stderr: ${stderr.slice(-500)}`
                ));
            }
        });

        // Feed input
        try {
            ffmpeg.stdin.write(inputBuffer);
            ffmpeg.stdin.end();
        } catch (err) {
            clearTimeout(timeout);
            reject(new Error(`[STDIN_ERROR] ${config.label}: ${err}`));
        }
    });
}

/**
 * Compresses a video buffer with progressive fallback across 3 quality levels.
 * 
 * Strategy:
 * 1. Aggressive (~50x): CRF 35, 360p, 12fps — maximum size reduction (fastest preset)
 * 2. Medium   (~20x): CRF 28, 480p, 18fps — balanced quality/size (fast preset)
 * 3. Light    (~5x):  CRF 23, 640p, 24fps — near-lossless (medium preset)
 * 
 * Each level:
 * - Has its own timeout calibrated to the preset speed
 * - Uses optimized pipe input flags for reliable webm handling
 * - Logs detailed stderr for diagnostics
 * 
 * @param inputBuffer - Raw video file buffer (e.g., from a recorded webm)
 * @returns Compressed MP4 buffer (guaranteed smaller than input)
 * @throws Error if all compression levels fail
 */
export async function compressVideo(inputBuffer: Buffer): Promise<Buffer> {
    const inputMB = (inputBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`[Compress] Starting compression: ${inputMB}MB input`);

    const levels: CompressionLevel[] = ['aggressive', 'medium', 'light'];
    let lastError: Error | null = null;

    for (const level of levels) {
        const config = getLevelConfig(level);

        try {
            const compressed = await compressAtLevel(inputBuffer, level);
            const ratio = inputBuffer.length / compressed.length;
            const inMB = (inputBuffer.length / 1024 / 1024).toFixed(2);
            const outMB = (compressed.length / 1024 / 1024).toFixed(2);

            console.log(`[Compress] ✓ ${config.label}: ${inMB}MB → ${outMB}MB (${ratio.toFixed(1)}x)`);

            // Accept ANY reduction in size
            if (compressed.length < inputBuffer.length) {
                return compressed;
            }

            console.warn(`[Compress] ✗ ${config.label}: No reduction (${ratio.toFixed(2)}x), trying next level...`);
            lastError = new Error(`${config.label}: produced no reduction (${ratio.toFixed(2)}x)`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[Compress] ✗ ${config.label} failed: ${msg}`);

            // ffmpeg not available — propagate immediately
            if (msg.includes('SPAWN_ERROR') || msg.includes('ENOENT') || msg.includes('ffmpeg binary not found')) {
                throw new Error('Video processing tool (ffmpeg) is not available on the server. Please contact support.');
            }

            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    // All 3 levels failed
    const diag = lastError ? ` Last error: ${lastError.message}` : '';
    throw new Error(
        `Failed to compress video after 3 attempts.${diag}`
    );
}