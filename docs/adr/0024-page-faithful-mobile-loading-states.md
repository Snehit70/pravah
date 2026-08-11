---
status: accepted
---

# Page-faithful mobile loading states

Primary mobile pages use page-faithful skeletons during initial load: the page shell and hierarchy remain recognizable, while unavailable records are represented by neutral geometry that matches the loaded layout. Skeleton sections may hydrate independently, but usable cached content always remains visible during refresh or offline revalidation; resolved empty and error states replace skeletons.

## Considered options

- **Reuse one generic list skeleton everywhere.** Rejected because it makes Timeline, Goals, and Progress look like the wrong destination and causes layout jumps when real content arrives.
- **Replace the whole page during every load.** Rejected because refreshes would erase usable content and make the app feel unstable.

## Consequences

Inbox, Timeline, Goals, and Progress each need structural loading seams, and Timeline must respect the user's selected list or carousel layout. Decorative placeholders stay out of the accessibility tree; normal hydration uses a quiet crossfade, while reduced-motion users receive an immediate swap.
