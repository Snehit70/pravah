import { v, type Infer } from "convex/values";

export const taskImageOperationalCategoryValidator = v.union(
  v.literal("grant"),
  v.literal("verification"),
  v.literal("resolution"),
  v.literal("cleanup"),
  v.literal("normalization"),
  v.literal("resource")
);

export const taskImageOperationalCodeValidator = v.union(
  v.literal("success"),
  v.literal("usage_blocked"),
  v.literal("provider_unavailable"),
  v.literal("provider_usage_unavailable"),
  v.literal("usage_refresh_success"),
  v.literal("provider_ambiguous"),
  v.literal("normalization_failed"),
  v.literal("master_too_large"),
  v.literal("variant_too_large"),
  v.literal("unsupported_format"),
  v.literal("animated_image"),
  v.literal("source_too_large"),
  v.literal("dimensions_too_large"),
  v.literal("aspect_ratio_unsupported"),
  v.literal("clipboard_too_large"),
  v.literal("storage_unavailable"),
  v.literal("memory_unavailable"),
  v.literal("source_unavailable"),
  v.literal("authorization_failed"),
  v.literal("network_error"),
  v.literal("upload_failed")
);

export type TaskImageOperationalCategory = Infer<
  typeof taskImageOperationalCategoryValidator
>;
export type TaskImageOperationalCode = Infer<
  typeof taskImageOperationalCodeValidator
>;

export const TASK_IMAGE_SAFE_FAILURE_CODES = new Set<TaskImageOperationalCode>([
  "normalization_failed",
  "master_too_large",
  "variant_too_large",
  "unsupported_format",
  "animated_image",
  "source_too_large",
  "dimensions_too_large",
  "aspect_ratio_unsupported",
  "clipboard_too_large",
  "storage_unavailable",
  "memory_unavailable",
  "source_unavailable",
  "authorization_failed",
  "network_error",
  "upload_failed",
]);
