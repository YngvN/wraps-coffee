package no.adhdisplay.companion

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Range
import android.util.Size
import android.view.Surface
import android.view.WindowManager
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

/**
 * Copied into android/ by withDualCameraScan.js on every `expo prebuild` — edit it in
 * adhdisplay-companion/plugins/dualCameraScan/, not in android/.
 *
 * One camera that reads barcodes: it streams small frames (about [TARGET_SIZE], about [TARGET_FPS]
 * fps — enough for a code held up to the tablet, and light enough that two cameras run at once) into
 * ML Kit, and reports each code it reads through [onCode]. It can also draw into a preview surface,
 * which it adds to and removes from the capture session on the fly. All camera work runs on this
 * scanner's own thread; [close] releases the camera and ends the thread.
 */
class CameraScanner(
  private val context: Context,
  private val cameraId: String,
  /** "back" or "front": passed along with every code and error. */
  private val label: String,
  private val onCode: (code: String, camera: String) -> Unit,
  private val onError: (camera: String, message: String) -> Unit,
) {
  private val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
  private val characteristics = manager.getCameraCharacteristics(cameraId)
  private val thread = HandlerThread("barcode-scan-$label").apply { start() }
  private val handler = Handler(thread.looper)
  private val barcodeScanner = BarcodeScanning.getClient(
    BarcodeScannerOptions.Builder()
      .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E, Barcode.FORMAT_QR_CODE)
      .build(),
  )

  /** The frame size the camera streams at, and the size a preview surface's buffer should have. */
  val size: Size = chooseSize()
  private val reader = ImageReader.newInstance(size.width, size.height, ImageFormat.YUV_420_888, 3)

  private var device: CameraDevice? = null
  private var session: CameraCaptureSession? = null
  private var previewSurface: Surface? = null
  private var closed = false
  @Volatile private var analysing = false
  private var lastAnalysedAt = 0L

  init {
    reader.setOnImageAvailableListener({ analyse(it) }, handler)
  }

  /** Opens the camera and starts reading codes. Needs the CAMERA permission (asked for on the JS side first). */
  @SuppressLint("MissingPermission")
  fun open() {
    handler.post {
      if (closed) return@post
      try {
        manager.openCamera(cameraId, deviceCallback, handler)
      } catch (e: Exception) {
        onError(label, e.message ?: "Could not open the camera")
      }
    }
  }

  /**
   * Starts drawing into [surface], or stops drawing a preview when it's null. The session is rebuilt
   * when it changes; [then] runs once the old session no longer uses the previous surface, so the
   * caller can release its texture. The previous [Surface] wrapper is released here.
   */
  fun setPreviewSurface(surface: Surface?, then: () -> Unit = {}) {
    handler.post {
      val previous = previewSurface
      if (surface == null && previous == null) {
        then()
        return@post
      }
      previewSurface = surface
      session?.close()
      session = null
      previous?.release()
      then()
      if (!closed) startSession()
    }
  }

  /** Releases the camera, the reader and the thread. The scanner can't be reopened afterwards. */
  fun close() {
    handler.post {
      closed = true
      session?.close()
      session = null
      device?.close()
      device = null
      previewSurface?.release()
      previewSurface = null
      reader.close()
      barcodeScanner.close()
      thread.quitSafely()
    }
  }

  private val deviceCallback = object : CameraDevice.StateCallback() {
    override fun onOpened(camera: CameraDevice) {
      if (closed) {
        camera.close()
        return
      }
      device = camera
      startSession()
    }

    override fun onDisconnected(camera: CameraDevice) {
      camera.close()
      if (device === camera) device = null
      if (!closed) onError(label, "The camera was taken by another app")
    }

    override fun onError(camera: CameraDevice, error: Int) {
      camera.close()
      if (device === camera) device = null
      if (!closed) onError(label, "Camera error $error")
    }
  }

  @Suppress("DEPRECATION") // The List<Surface> overload is the one that works back to API 24.
  private fun startSession() {
    val camera = device ?: return
    val targets = currentTargets()
    try {
      val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
        targets.forEach { addTarget(it) }
        fpsRange()?.let { set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it) }
        val afModes = characteristics.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES) ?: IntArray(0)
        if (CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE in afModes) set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
      }.build()
      camera.createCaptureSession(
        targets,
        object : CameraCaptureSession.StateCallback() {
          override fun onConfigured(configured: CameraCaptureSession) {
            if (closed || device !== camera || currentTargets() != targets) {
              configured.close()
              return
            }
            session = configured
            try {
              configured.setRepeatingRequest(request, null, handler)
            } catch (e: Exception) {
              onError(label, e.message ?: "Could not start the camera")
            }
          }

          override fun onConfigureFailed(failed: CameraCaptureSession) {
            if (!closed) onError(label, "The camera could not be configured")
          }
        },
        handler,
      )
    } catch (e: Exception) {
      onError(label, e.message ?: "Could not start the camera")
    }
  }

  /** What a session should draw into right now. Compared again in onConfigured, so a session built before the preview changed is dropped. */
  private fun currentTargets(): List<Surface> = listOfNotNull(reader.surface, previewSurface)

  /** Hands at most one frame per [ANALYSE_INTERVAL_MS] to ML Kit, one at a time; every other frame is dropped at once so the camera never stalls. */
  private fun analyse(imageReader: ImageReader) {
    val image = try {
      imageReader.acquireLatestImage()
    } catch (e: IllegalStateException) {
      null
    } ?: return
    val now = SystemClock.elapsedRealtime()
    if (analysing || now - lastAnalysedAt < ANALYSE_INTERVAL_MS) {
      image.close()
      return
    }
    analysing = true
    lastAnalysedAt = now
    barcodeScanner.process(InputImage.fromMediaImage(image, rotationDegrees()))
      .addOnSuccessListener { barcodes -> barcodes.mapNotNull { it.rawValue }.forEach { onCode(it, label) } }
      .addOnCompleteListener {
        image.close()
        analysing = false
      }
  }

  /** How far the frame is turned from upright on screen, which ML Kit needs to read 1D barcodes. */
  private fun rotationDegrees(): Int {
    val sensor = characteristics.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
    @Suppress("DEPRECATION")
    val display = (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.rotation * 90
    val front = characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT
    return if (front) (sensor + display) % 360 else (sensor - display + 360) % 360
  }

  /** The smallest stream size that's at least [TARGET_SIZE] both ways, or the largest there is. */
  private fun chooseSize(): Size {
    val sizes = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)?.getOutputSizes(ImageFormat.YUV_420_888).orEmpty()
    return sizes.filter { it.width >= TARGET_SIZE.width && it.height >= TARGET_SIZE.height }.minByOrNull { it.width * it.height }
      ?: sizes.maxByOrNull { it.width * it.height }
      ?: TARGET_SIZE
  }

  /** The lowest frame rate range that still reaches [TARGET_FPS], preferring a steady one. Null leaves the camera's default. */
  private fun fpsRange(): Range<Int>? =
    characteristics.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
      ?.filter { it.upper >= TARGET_FPS }
      ?.sortedWith(compareBy<Range<Int>> { it.upper }.thenByDescending { it.lower })
      ?.firstOrNull()

  companion object {
    val TARGET_SIZE = Size(640, 480)
    const val TARGET_FPS = 10
    const val ANALYSE_INTERVAL_MS = 100L
  }
}
