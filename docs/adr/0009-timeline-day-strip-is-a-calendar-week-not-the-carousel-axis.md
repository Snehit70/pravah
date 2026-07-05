# Timeline day strip presents a calendar week, not the carousel axis

The Timeline's comfortable-mode carousel has a **sparse axis**: it renders one card per day that has tasks, plus a leading Overdue card — days with no tasks produce no card, so Monday's card and Friday's card can sit adjacent with no gap between them. The day strip that navigates this carousel deliberately does **not** mirror that axis one-to-one. Instead it presents an honest Sunday–Saturday **calendar week**: every weekday gets a cell, days that hold tasks are full-strength and tappable, and days without tasks are dimmed and non-tappable (shown for orientation, not as destinations). The strip is a calendar the user reads, laid over a card list the user navigates — the two do not have the same shape, and the strip reconciles the difference rather than exposing it.

## Considered options

- **Axis strip (one cell per card).** Rejected. A perfect 1:1 position indicator where every tap has a target, but it lies about time (Mon and Fri adjacent, no sense of the intervening empty days) and visually degenerates into "dots with letters" — which is exactly the capped-dot indicator that was built and thrown away earlier in this work for being unable to convey depth.
- **Calendar week with density states (chosen).** A real week is legible at a glance and makes emptiness *information* ("Wednesday is free") instead of a broken tap target. It preserves what made the reference mockup ("design C") appealing while turning the sparse axis into a feature.

## Consequences

- **Days-with-tasks vs. empty days must be distinguishable beyond navigation.** A card-bearing day carries a small presence dot; an empty day does not. The dot means "this day has at least one live task," so it disappears when a day is cleared (the held Day-clear state). This reintroduces a dot in a *presence* role after dots were rejected as a *position axis* role — a different job, deliberately.
- **Overdue has no cell.** Overdue is a doorway, not a dated destination; the landing logic already refuses to land there. While the Overdue card is current the strip stays on today's week with no active marker. Reaching Overdue is by swipe only.
- **The strip follows the viewed card.** Because the axis can run weeks into the future, the visible week is whichever week contains the current card; crossing a week boundary slides the strip to the new week. This keeps the active-marker-as-position-indicator contract intact everywhere on the axis, at the cost of the strip not being a fixed, independently-browsable week (deferred).
- **Carousel-only.** The strip lives inside the carousel layout and does not appear in list mode, where all days are already visible by scrolling and there is no horizontal position to indicate.
- **Fully OTA-safe.** The strip is JS/asset-only (Reanimated + the existing horizontal FlatList), no native dependency.
