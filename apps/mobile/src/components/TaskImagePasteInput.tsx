import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { findNodeHandle, TextInput, type TextInputProps } from "react-native";
import { taskImageInput } from "../lib/taskImageInput";
import type { AcquiredTaskImageSource } from "../lib/taskImageCoordinator";

type Props = TextInputProps & {
  imagePasteEnabled?: boolean;
  pasteSession?: string;
  onPasteImage: (source: AcquiredTaskImageSource) => Promise<void>;
  onPasteError: (message: string) => void;
};

/** Keeps RN text editing intact; only image insertion is handled separately. */
export const TaskImagePasteInput = forwardRef<TextInput, Props>(function TaskImagePasteInput(
  { imagePasteEnabled = true, pasteSession, onPasteImage, onPasteError, ...props }, ref,
) {
  const [viewTag, setViewTag] = useState<number | null>(null);
  const callbacks = useRef({ onPasteImage, onPasteError });
  callbacks.current = { onPasteImage, onPasteError };
  const setInput = useCallback((input: TextInput | null) => {
    if (typeof ref === "function") ref(input);
    else if (ref) ref.current = input;
    setViewTag(input && taskImageInput ? findNodeHandle(input) : null);
  }, [ref]);

  useEffect(() => {
    if (!imagePasteEnabled || !taskImageInput || viewTag === null) return;
    const native = taskImageInput;
    const session = `${viewTag}-${Date.now()}-${Math.random()}`;
    let active = true;
    let queue = Promise.resolve();
    const subscription = native.addListener("onImagePaste", (event) => {
      if (event.session !== session) return;
      queue = queue.then(async () => {
        try {
          if (!active) return;
          const handlers = callbacks.current;
          if (event.error) handlers.onPasteError(event.error);
          else if (event.uri) {
            await handlers.onPasteImage({ kind: "paste", uri: event.uri, previewUri: event.uri });
          }
        } catch {
          if (active) callbacks.current.onPasteError("Could not paste this image. Try again.");
        } finally {
          if (event.uri) await native.release(event.uri).catch(() => undefined);
        }
      });
    });
    void native.attach(viewTag, session).catch(() => {
      if (active) callbacks.current.onPasteError("Image paste is unavailable. Use Add a visual reference.");
    });
    return () => {
      active = false;
      subscription.remove();
      void native.detach(viewTag, session).catch(() => undefined);
    };
  }, [imagePasteEnabled, pasteSession, viewTag]);

  return <TextInput {...props} ref={setInput} />;
});
