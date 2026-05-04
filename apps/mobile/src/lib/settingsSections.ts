export type SectionOffset<K extends string> = {
  key: K;
  offset: number;
};

// Pure helper: given a scroll position and the ordered section offsets
// captured via onLayout, returns the last section header that has scrolled
// past the probe line (scrollY + bias). The bias offsets the probe down
// from the very top of the viewport so the section feels "active" once its
// header is comfortably visible, not the moment its top edge appears.
export function selectActiveSection<K extends string>(
  scrollY: number,
  offsets: ReadonlyArray<SectionOffset<K>>,
  bias = 0,
): K | null {
  if (offsets.length === 0) return null;
  const probe = scrollY + bias;
  let active: K = offsets[0].key;
  for (const { key, offset } of offsets) {
    if (offset <= probe) {
      active = key;
    } else {
      break;
    }
  }
  return active;
}
