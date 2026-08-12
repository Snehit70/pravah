export function reorderTaskImagesByDrag<T>(images: T[], index: number, translationX: number, slotWidth: number) {
  const targetIndex = Math.max(0, Math.min(images.length - 1, index + Math.round(translationX / slotWidth)));
  if (targetIndex === index) return images;
  const next = [...images];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}
