import { createWriteStream, existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { fileTypeFromFile } from 'file-type'
import sharp from 'sharp'
import { mirrorFile } from './backup'
import { sendJson } from './http'
import { UPLOADS_DIR, VIDEO_PENDING_DIR } from './uploads'

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobeStatic.path)

export const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024

// A failed transcode's staged source is kept around so "Retry" doesn't need
// a fresh 500MB re-upload — but if nobody retries or deletes it, it would
// otherwise sit forever. Swept once at startup and periodically after that.
const ABANDONED_UPLOAD_TTL_MS = 48 * 60 * 60 * 1000

function processingMarkerPath(filename: string): string {
  return join(UPLOADS_DIR, `${filename}.processing`)
}
function errorMarkerPath(filename: string): string {
  return join(UPLOADS_DIR, `${filename}.error`)
}
function posterPath(id: string): string {
  return join(UPLOADS_DIR, `${id}-thumb.webp`)
}
function stagedSourcePath(id: string): string {
  return join(VIDEO_PENDING_DIR, `${id}.src`)
}

function removeIfExists(path: string) {
  if (existsSync(path)) unlinkSync(path)
  mirrorFile(path)
}

/** Streams the request body straight to disk (rather than buffering up to 500MB in memory) with a hard size cap — aborts and cleans up the partial file if exceeded. */
async function streamBodyToFile(req: IncomingMessage, destPath: string, maxBytes: number): Promise<void> {
  const writeStream = createWriteStream(destPath)
  let total = 0
  try {
    for await (const chunk of req) {
      total += (chunk as Buffer).length
      if (total > maxBytes) throw new Error('PAYLOAD_TOO_LARGE')
      writeStream.write(chunk)
    }
    await new Promise<void>((resolve, reject) => writeStream.end((error?: Error | null) => (error ? reject(error) : resolve())))
  } catch (error) {
    writeStream.destroy()
    if (existsSync(destPath)) unlinkSync(destPath)
    throw error
  }
}

function probeVideo(path: string): Promise<{ durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (error, data) => {
      if (error) {
        reject(new Error('Unrecognized or unsupported video format'))
        return
      }
      const hasVideoStream = data.streams?.some((stream) => stream.codec_type === 'video')
      if (!hasVideoStream) {
        reject(new Error('No video stream found in this file'))
        return
      }
      resolve({ durationSeconds: data.format?.duration ?? 0 })
    })
  })
}

/**
 * Transcodes to H.264/AAC MP4 regardless of source container — this is also
 * "the compressor" the admin can rely on, no separate feature needed.
 * Resolution capped at 1080p width (aspect ratio preserved via the `-2`
 * height), `yuv420p` forced (some exotic/10-bit source colorspaces otherwise
 * produce washed-out or unplayable output in Chromium), `+faststart` moves
 * the `moov` atom to the front for progressive playback.
 */
function runTranscode(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate('128k')
      .outputOptions(['-preset', 'veryfast', '-crf', '23', '-vf', "scale='min(1920,iw)':-2", '-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
      .on('error', (error) => reject(error))
      .on('end', () => resolve())
      .save(outputPath)
  })
}

/** Extracts one frame (via ffmpeg) then compresses it through `sharp` into the same `-thumb.webp` shape an image upload's own poster/thumbnail already uses — reusing `sharp` here (rather than trusting ffmpeg's own image encoder) keeps this guaranteed-WebP regardless of what image codecs a given ffmpeg-static build happens to include. */
async function extractPosterFrame(videoPath: string, outputWebpPath: string, durationSeconds: number): Promise<void> {
  const seekSeconds = durationSeconds > 0 ? Math.min(1, durationSeconds * 0.1) : 0
  const tempFramePath = `${outputWebpPath}.frame.png`
  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(seekSeconds)
      .frames(1)
      .on('error', (error) => reject(error))
      .on('end', () => resolve())
      .save(tempFramePath)
  })
  const frameBuffer = readFileSync(tempFramePath)
  const webp = await sharp(frameBuffer).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 50 }).toBuffer()
  writeFileSync(outputWebpPath, webp)
  unlinkSync(tempFramePath)
}

// One transcode at a time — some kiosks run the server and a display on the
// same PC, and unbounded concurrent ffmpeg processes could visibly stutter
// that PC's own signage.
const transcodeQueue: string[] = []
let transcoding = false

function enqueueTranscode(id: string) {
  if (!transcodeQueue.includes(id)) transcodeQueue.push(id)
  void drainQueue()
}

async function drainQueue() {
  if (transcoding) return
  const id = transcodeQueue.shift()
  if (!id) return
  transcoding = true
  try {
    await transcodeVideo(id)
  } finally {
    transcoding = false
    void drainQueue()
  }
}

async function transcodeVideo(id: string) {
  const stagedPath = stagedSourcePath(id)
  const filename = `${id}.mp4`
  const outputPath = join(UPLOADS_DIR, filename)
  const thumbPath = posterPath(id)

  try {
    const detected = await fileTypeFromFile(stagedPath).catch(() => undefined)
    if (detected && !detected.mime.startsWith('video/')) throw new Error("This doesn't look like a video file")

    const probe = await probeVideo(stagedPath)
    await runTranscode(stagedPath, outputPath)
    mirrorFile(outputPath)
    await extractPosterFrame(outputPath, thumbPath, probe.durationSeconds)
    mirrorFile(thumbPath)

    removeIfExists(processingMarkerPath(filename))
    removeIfExists(errorMarkerPath(filename)) // clears a previous failed attempt on a successful retry
    removeIfExists(stagedPath) // only discarded once the transcode actually succeeds — see the retry flow
    console.log(`[videoUploads] transcoded ${filename}`)
  } catch (error) {
    console.error(`[videoUploads] transcode failed for ${filename}:`, error)
    // `listUploads()` discovers every entry by scanning `UPLOADS_DIR` for a
    // real `filename` and only then checks for `.error`/`.processing`
    // marker siblings — so `outputPath` must still exist (even as an empty
    // placeholder) or a failed upload becomes invisible to the client
    // entirely, with no file for that scan to find and no way to surface
    // its own error. Overwritten with real content on a later successful
    // retry, exactly like a fresh upload's own placeholder below.
    writeFileSync(outputPath, '')
    mirrorFile(outputPath)
    removeIfExists(thumbPath) // no valid poster to show while failed — `MediaLibraryView`/`StoredImagePickerModal` render a status badge instead
    const message = error instanceof Error ? error.message : 'Video processing failed'
    writeFileSync(errorMarkerPath(filename), message, 'utf-8')
    mirrorFile(errorMarkerPath(filename))
    removeIfExists(processingMarkerPath(filename))
    // Staged source deliberately kept — this is what lets "Retry" work without re-uploading.
  }
}

/** `POST /uploads/video` — saves the raw upload, responds 202 immediately, and transcodes in the background (see the queue above) so the HTTP response isn't blocked on a multi-minute ffmpeg run. */
export async function handleVideoUpload(req: IncomingMessage, res: ServerResponse, host: string) {
  const id = randomUUID()
  const stagedPath = stagedSourcePath(id)

  try {
    await streamBodyToFile(req, stagedPath, MAX_VIDEO_UPLOAD_BYTES)
  } catch {
    sendJson(res, 413, { error: 'File too large (500MB limit)' })
    return
  }
  mirrorFile(stagedPath)

  const filename = `${id}.mp4`
  // `listUploads()` discovers every entry by scanning `UPLOADS_DIR` for a
  // real `filename`, only then checking for `.processing`/`.error` marker
  // siblings — so this placeholder needs to exist from the very start, or a
  // client that polls `GET /uploads` right after this 202 (before the
  // transcode even starts) won't see this upload at all. `runTranscode`
  // overwrites it with the real output once it succeeds.
  writeFileSync(join(UPLOADS_DIR, filename), '')
  mirrorFile(join(UPLOADS_DIR, filename))
  writeFileSync(processingMarkerPath(filename), '', 'utf-8')
  mirrorFile(processingMarkerPath(filename))

  sendJson(res, 202, { id, filename, url: `http://${host}/uploads/${filename}`, status: 'processing' })
  enqueueTranscode(id)
}

/** `POST /uploads/video/<id>/retry` — re-attempts a failed transcode against the still-staged source, without requiring the 500MB file to be re-uploaded. */
export function handleVideoRetry(res: ServerResponse, id: string) {
  const stagedPath = stagedSourcePath(id)
  const filename = `${id}.mp4`
  if (!existsSync(stagedPath) || !existsSync(errorMarkerPath(filename))) {
    sendJson(res, 404, { error: 'No failed upload found to retry — it may have already succeeded, been deleted, or its staged source was cleaned up.' })
    return
  }
  writeFileSync(processingMarkerPath(filename), '', 'utf-8')
  mirrorFile(processingMarkerPath(filename))
  sendJson(res, 202, { id, filename, status: 'processing' })
  enqueueTranscode(id)
}

/** Deletes any staged source whose paired `.error` marker is older than 48h and was never retried or explicitly deleted — otherwise an abandoned failed upload's staging copy would sit on disk forever. Runs once at startup and every few hours after that. */
function sweepAbandonedVideoUploads() {
  const errorMarkers = existsSync(UPLOADS_DIR) ? readdirSync(UPLOADS_DIR).filter((name) => name.endsWith('.mp4.error')) : []
  const now = Date.now()
  for (const errorMarkerName of errorMarkers) {
    const id = errorMarkerName.slice(0, -'.mp4.error'.length)
    const stagedPath = stagedSourcePath(id)
    if (!existsSync(stagedPath)) continue
    const ageMs = now - statSync(join(UPLOADS_DIR, errorMarkerName)).mtime.getTime()
    if (ageMs < ABANDONED_UPLOAD_TTL_MS) continue
    removeIfExists(stagedPath)
    console.log(`[videoUploads] swept abandoned failed upload ${id} (staged source older than 48h)`)
  }
}

let abandonedUploadSweepTimer: ReturnType<typeof setInterval> | null = null

/** Guards against a duplicate, permanently-running interval if this is ever accidentally called more than once (same guard `woltPoller.start`/`foodoraPoller.start` already have). */
export function startAbandonedVideoUploadSweep() {
  sweepAbandonedVideoUploads()
  if (abandonedUploadSweepTimer) clearInterval(abandonedUploadSweepTimer)
  abandonedUploadSweepTimer = setInterval(sweepAbandonedVideoUploads, 6 * 60 * 60 * 1000)
}
