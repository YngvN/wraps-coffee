package no.adhdisplay.companion

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.annotations.ReactProp

/**
 * Copied into android/ by withDualCameraScan.js on every `expo prebuild` — edit it in
 * adhdisplay-companion/plugins/dualCameraScan/, not in android/.
 *
 * Exposes DualCameraScanView.kt to JS as the native component `DualCameraScanView` (see
 * adhdisplay-companion/src/components/CameraScanOverlay.tsx), with one prop, `showPreview`.
 */
class DualCameraScanViewManager : SimpleViewManager<DualCameraScanView>() {
  override fun getName() = "DualCameraScanView"

  override fun createViewInstance(context: ThemedReactContext) = DualCameraScanView(context)

  @ReactProp(name = "showPreview")
  fun setShowPreview(view: DualCameraScanView, show: Boolean) = view.setShowPreview(show)

  override fun onDropViewInstance(view: DualCameraScanView) {
    view.stop()
    super.onDropViewInstance(view)
  }
}

/** Registers DualCameraScanViewManager. */
class DualCameraScanPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = emptyList()

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = listOf(DualCameraScanViewManager())
}
