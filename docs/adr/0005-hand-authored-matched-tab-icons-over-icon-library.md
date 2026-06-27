# Hand-author matched outline+fill tab icons instead of an icon library

The bottom navigation icons are hand-authored as **matched outline + filled SVG pairs** rather than pulled from an icon library such as `lucide-react-native`. The active-tab affordance is a *fill*, not a pill: the inactive icon is a stroke outline and the active icon is the same shape with its area filled in accent, cross-faded between the two. Mainstream icon libraries (Lucide included) ship **outline-only** glyphs with no filled twin, so adopting one would force the active state to fall back to a colour/weight/background change and lose the fill model. We keep the icons hand-coded so every tab can share one coherent outline→fill (area-fill) active animation, at the cost of drawing and maintaining the marks by hand.

## Considered options

- **`lucide-react-native` (or similar library).** Rejected: outline-only, no filled variants, so the fill-based active state can't be expressed. It would also re-tie icon weight/sizing to the library's conventions. The convenience isn't worth abandoning the active-state design.
- **Hand-authored matched pairs (chosen).** Each mark exists as an outline and a filled silhouette. Line-based marks (timeline agenda, progress trend) define "filled" as an *area* fill (dots fill, area-under-curve) so the whole set animates consistently.
- **Use the library outline + author only the filled twins.** Rejected: ends up as hand-authoring anyway, but with two sources of truth (library geometry vs. our fills) that drift in stroke weight and optical size.

## Consequences

- New tabs/icons require drawing both an outline and a filled variant by hand; there is no drop-in library glyph.
- The set stays fully OTA-safe — icons are inline `react-native-svg` paths, no native dependency.
- The active animation is content-aware (silhouette/area fill rising in), which is only possible because we control both variants.
