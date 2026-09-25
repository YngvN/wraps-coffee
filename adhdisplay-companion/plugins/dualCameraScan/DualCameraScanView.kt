package no.adhdisplay.companion

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Matrix
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.graphics.ImageFormat
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ThemedReactContext

/**
 * Copied into android/ by withDualCameraScan.js on every `expo prebuild` — edit it in
 * adhdisplay-companion/plugins/dualCameraScan/, not in android/.
 *
 * The Register's camera scanning: while this view is on screen it scans with the back camera (the
 * main 1× lens) and the front camera at the same time, so a code can be held up to either side.
 * Every code read goes to JS as an `onDualCameraScan` device event ({ code, camera }); a camera that
 * fails sends `onDualCameraScanError` and the other one keeps going. With `showPreview` on, the two
 * cameras are drawn side by side to help aim; with it off nothing of the image is drawn anywhere.
 * Taking the view off screen releases both cameras.
 */
class DualCameraScanView(private val reactContext: ThemedReactContext) : FrameLayout(reactContext) {
  private val scanners = mutableListOf<CameraScanner>()
  private val previews = mutableListOf<TextureView>()
  private var showPreview = false

  fun setShowPreview(show: Boolean) {
    if (show == showPreview) return
    showPreview = show
    scanners.forEachIndexed { index, scanner -> attachPreview(scanner, previews[index]) }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    start()
  }

  override fun onDetachedFromWindow() {
    stop()
    super.onDetachedFromWindow()
  }

  /** Opens the cameras. Does nothing when they're already open or the CAMERA permission is missing. */
  fun start() {
    if (scanners.isNotEmpty()) return
    if (context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      emitError("both", "Camera permission was not granted")
      return
    }
    for ((id, label) in chooseCameras()) {
      val scanner = try {
        CameraScanner(context, id, label, ::emitCode, ::emitError)
      } catch (e: Exception) {
        emitError(label, e.message ?: "Could not use the camera")
        continue
      }
      val preview = TextureView(context)
      preview.surfaceTextureListener = previewListener(scanner, preview)
      addView(preview)
      scanners += scanner
      previews += preview
      scanner.open()
    }
    if (scanners.isEmpty()) emitError("both", "This device has no camera to scan with")
  }

  /** Releases both cameras. */
  fun stop() {
    scanners.forEach { it.close() }
    scanners.clear()
    previews.clear()
    removeAllViews()
  }

  /**
   * The back camera the system lists first (its main 1× lens) and the first front camera that
   * streams at least 640×480 — some tablets have a second, tiny front sensor that can't read a code.
   */
  private fun chooseCameras(): List<Pair<String, String>> {
    val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    val cameras = manager.cameraIdList.map { it to manager.getCameraCharacteristics(it) }
    fun largestFrame(characteristics: CameraCharacteristics) =
      characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)?.getOutputSizes(ImageFormat.YUV_420_888)?.maxOfOrNull { it.width * it.height } ?: 0
    val back = cameras.firstOrNull { (_, c) -> c.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK }
    val front = cameras.firstOrNull { (_, c) ->
      c.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_FRONT && largestFrame(c) >= CameraScanner.TARGET_SIZE.width * CameraScanner.TARGET_SIZE.height
    }
    return listOfNotNull(back?.let { it.first to "back" }, front?.let { it.first to "front" })
  }

  private fun previewListener(scanner: CameraScanner, preview: TextureView) = object : TextureView.SurfaceTextureListener {
    override fun onSurfaceTextureAvailable(texture: SurfaceTexture, width: Int, height: Int) {
      texture.setDefaultBufferSize(scanner.size.width, scanner.size.height)
      fitPreview(preview, scanner)
      attachPreview(scanner, preview)
    }

    override fun onSurfaceTextureSizeChanged(texture: SurfaceTexture, width: Int, height: Int) = fitPreview(preview, scanner)

    override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
      // Release only once the camera has stopped drawing into it.
      scanner.setPreviewSurface(null) { texture.release() }
      return false
    }

    override fun onSurfaceTextureUpdated(texture: SurfaceTexture) {}
  }

  /** Points the camera at this preview's surface while the preview is shown, and away from it while it isn't. */
  private fun attachPreview(scanner: CameraScanner, preview: TextureView) {
    val texture = preview.surfaceTexture
    scanner.setPreviewSurface(if (showPreview && texture != null) Surface(texture) else null)
  }

  /** Turns and scales the camera image to fill the preview for the screen's current rotation (the TextureView doesn't do this itself). */
  private fun fitPreview(preview: TextureView, scanner: CameraScanner) {
    val width = preview.width.toFloat()
    val height = preview.height.toFloat()
    if (width == 0f || height == 0f) return
    @Suppress("DEPRECATION")
    val rotation = (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.rotation
    val matrix = Matrix()
    val view = RectF(0f, 0f, width, height)
    val buffer = RectF(0f, 0f, scanner.size.height.toFloat(), scanner.size.width.toFloat())
    if (rotation == Surface.ROTATION_90 || rotation == Surface.ROTATION_270) {
      buffer.offset(view.centerX() - buffer.centerX(), view.centerY() - buffer.centerY())
      matrix.setRectToRect(view, buffer, Matrix.ScaleToFit.FILL)
      val scale = maxOf(height / scanner.size.height, width / scanner.size.width)
      matrix.postScale(scale, scale, view.centerX(), view.centerY())
      matrix.postRotate(90f * (rotation - 2), view.centerX(), view.centerY())
    } else if (rotation == Surface.ROTATION_180) {
      matrix.postRotate(180f, view.centerX(), view.centerY())
    }
    preview.setTransform(matrix)
  }

  /** React Native sizes this view but never lays out views added natively, so the previews are placed here: side by side, equal widths. */
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val count = childCount
    if (count == 0) return
    val width = (right - left) / count
    val height = bottom - top
    for (index in 0 until count) {
      val child = getChildAt(index)
      child.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
      child.layout(index * width, 0, (index + 1) * width, height)
    }
  }

  /** New children arrive outside React Native's layout pass; lay them out on the next frame. */
  override fun requestLayout() {
    super.requestLayout()
    post {
      measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
      layout(left, top, right, bottom)
    }
  }

  private fun emitCode(code: String, camera: String) {
    val event = Arguments.createMap()
    event.putString("code", code)
    event.putString("camera", camera)
    emit("onDualCameraScan", event)
  }

  private fun emitError(camera: String, message: String) {
    val event = Arguments.createMap()
    event.putString("camera", camera)
    event.putString("message", message)
    emit("onDualCameraScanError", event)
  }

  private fun emit(name: String, event: com.facebook.react.bridge.WritableMap) {
    if (reactContext.hasActiveReactInstance()) reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, event)
  }
}
