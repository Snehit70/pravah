package expo.modules.pravahimageinput

import android.content.Context
import android.net.Uri
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.core.view.ContentInfoCompat
import androidx.core.view.ViewCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Adds rich-content support to existing RN/AppCompat inputs without replacing them. */
class PravahImageInputModule : Module() {
  private data class Registration(val view: View, val session: String)
  private val registrations = ConcurrentHashMap<Int, Registration>()
  private val cachedImages = ConcurrentHashMap<String, File>()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

  override fun definition() = ModuleDefinition {
    Name("PravahImageInput")
    Events("onImagePaste")

    AsyncFunction("attach") { viewTag: Int, session: String ->
      val view = appContext.findView<View>(viewTag) as? EditText
        ?: throw IllegalStateException("Image paste requires a text input")
      val registration = Registration(view, session)
      registrations[viewTag] = registration
      ViewCompat.setOnReceiveContentListener(view, arrayOf("image/*")) { _, payload ->
        val split = payload.partition { item ->
          item.uri != null && (payload.clip.description.hasMimeType("image/*") ||
            runCatching { view.context.contentResolver.getType(item.uri)?.startsWith("image/") == true }.getOrDefault(false))
        }
        split.first?.let { images ->
          // Keep the payload alive while copying: it owns the keyboard's temporary URI grant.
          scope.launch {
            for (index in 0 until images.clip.itemCount) {
              if (registrations[viewTag] !== registration) break
              var file: File? = null
              try {
                // Assign inside IO so cancellation during the return to Main still owns the file.
                withContext(Dispatchers.IO) { file = copyImage(view.context, images, index) }
                val copiedFile = requireNotNull(file)
                if (registrations[viewTag] !== registration) {
                  copiedFile.delete()
                  continue
                }
                val uri = Uri.fromFile(copiedFile).toString()
                cachedImages[uri] = copiedFile
                sendEvent("onImagePaste", mapOf("session" to session, "uri" to uri))
              } catch (_: Exception) {
                file?.delete()
                if (registrations[viewTag] === registration) {
                  sendEvent("onImagePaste", mapOf("session" to session, "error" to "Could not paste this image. Try copying it again."))
                }
              }
            }
          }
        }
        split.second // Leave ordinary text to the original input connection.
      }
      if (view.hasFocus()) restartInput(view)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("detach") { viewTag: Int, session: String ->
      val registration = registrations[viewTag]
      if (registration?.session == session) {
        registrations.remove(viewTag)
        ViewCompat.setOnReceiveContentListener(registration.view, null, null)
        if (registration.view.hasFocus()) restartInput(registration.view)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("release") { rawUri: String ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val uri = Uri.parse(rawUri)
      if (uri.scheme == "file") {
        val file = File(uri.path ?: return@AsyncFunction)
        val directory = File(context.cacheDir, "keyboard-task-images")
        if (file.parentFile?.canonicalFile == directory.canonicalFile) {
          file.delete()
          cachedImages.remove(rawUri)
        }
      }
    }

    OnDestroy {
      scope.cancel()
      val views = registrations.values.map { it.view }
      registrations.clear()
      cachedImages.values.forEach { it.delete() }
      cachedImages.clear()
      views.forEach { view -> view.post { ViewCompat.setOnReceiveContentListener(view, null, null) } }
    }
  }

  private fun restartInput(view: View) {
    (view.context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).restartInput(view)
  }

  private fun copyImage(context: Context, payload: ContentInfoCompat, index: Int): File {
    val directory = File(context.cacheDir, "keyboard-task-images").apply { mkdirs() }
    val file = File(directory, "${UUID.randomUUID()}.image")
    try {
      context.contentResolver.openInputStream(payload.clip.getItemAt(index).uri!!).use { input ->
        requireNotNull(input)
        file.outputStream().use { output ->
          val buffer = ByteArray(64 * 1024)
          var total = 0L
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            require(total <= 20 * 1024 * 1024) { "Image is too large" }
            output.write(buffer, 0, read)
          }
          require(total > 0) { "Image is empty" }
        }
      }
      return file
    } catch (error: Exception) {
      file.delete()
      throw error
    }
  }
}
