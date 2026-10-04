import { NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type ImagePasteEvent = { session: string; uri?: string; error?: string };

type ImageInputEvents = { onImagePaste: (event: ImagePasteEvent) => void };
declare class ImageInputModule extends NativeModule<ImageInputEvents> {
  attach(viewTag: number, session: string): Promise<void>;
  detach(viewTag: number, session: string): Promise<void>;
  release(uri: string): Promise<void>;
}

export const taskImageInput = Platform.OS === "android"
  ? requireOptionalNativeModule<ImageInputModule>("PravahImageInput")
  : null;
