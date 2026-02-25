# Dashboard Conventions

## Styling

Three approaches coexist. Use each for its strength:

| Approach | Use For | Example |
|----------|---------|---------|
| **CSS Variables** | Semantic colors, spacing tokens, theme values | `var(--color-surface)`, `var(--color-border)` |
| **Tailwind** | Layout, spacing, flexbox, grid, responsive | `flex items-center gap-2 p-4` |
| **Hex literals** | Brand colors, one-off chrome accents | `#DA7756` (Claude orange), `#2a2a2a` |

**Rules:**
- CSS vars for any color that changes with theme (light/dark). Defined in `globals.css`.
- Tailwind for layout and spacing: never for semantic colors (no `text-gray-400` for themed text).
- Hex only for brand constants (`#DA7756`) or truly static chrome. If you're reaching for a gray hex, use a CSS var instead.
- No inline `style={{}}` for colors. Use CSS vars or Tailwind classes.
- `className` over `style` in all cases except dynamic computed values (grid dimensions, absolute positioning).

## Component Patterns

- Shared components live in `components/shared/` (e.g., `Section`, `SettingRow`).
- App-specific components live in `components/desktop/apps/{app}/`.
- One canonical copy of reusable components: import, don't duplicate. `ClaudeLogo` lives at `components/ClaudePanel/ClaudeLogo.tsx`.

## Data Fetching

- Use React Query for all server state. Hook definitions in `hooks/queries/`.
- SSE events invalidate query keys via `queryClient.ts` event mappings.
- No raw `fetch` + `useState` for data that comes from the backend: use the query layer.

## Testing

- See `.claude/skills/playwright/SKILL.md` for Playwright conventions.
- All interactive elements need `data-testid` attributes.
- App window content roots use `data-testid="{app}-content"`.
