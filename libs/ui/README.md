# @am/ui

The shared design system for the three Next.js apps: tokens, component styles, fonts, logos and
React components. The brand is **Market clay**.

**Source of truth:** the design system "African Market UAE" in Claude Design, with the screen
designs in "Customer app". This package is a port of that system, not a second design. Change the
design there first, then bring the change here (decision T-17).

## What is in here

| Path                            | What                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `theme.css`                     | Every token. Colours, fonts, radii and shadows are also Tailwind utilities. Light and dark. |
| `components.css`                | Component styles, copied from the design system bundle. Class names are `am-*`.             |
| `fonts/`                        | Plus Jakarta Sans (Latin, variable 200 to 800) and IBM Plex Sans Arabic (400 to 700).       |
| `assets/logos/`                 | The mark, the wordmark (light and dark grounds), a one-ink mark and the maskable app icon.  |
| `src/`                          | Typed React components. `src/icon-paths.ts` holds the Tabler outline icons the system uses. |
| `apps/web` → `/<locale>/dev/ui` | Every component in English beside Arabic. Not linked, not indexed.                          |

## Using it in an app

`globals.css`:

```css
@import 'tailwindcss';
@import '@am/ui/theme.css';
@import '@am/ui/components.css';
@source '../../../../libs/ui/src';
```

Fonts are loaded with `next/font/local` in each app's `src/app/fonts.ts`, which sets
`--am-font-latin` and `--am-font-arabic`; put `fontVariables` on `<html>`. Arabic pages switch to
the Arabic stack automatically from `lang="ar"`.

Layout uses Tailwind with the tokens: `bg-surface`, `bg-surface-raised`, `text-ink`,
`text-ink-muted`, `border-line`, `bg-clay`, `rounded-lg`, `shadow-md`. Tailwind's default colour
palette is switched off, so only design-system colours exist.

## Components

`Logo`, `Icon`, `Button`, `LinkButton`, `IconButton`, `Input`, `Select`, `PhoneInput`, `OtpInput`,
`Checkbox`, `Radio`, `Toggle`, `Tabs`, `Chip`, `Badge`, `OriginBadge`, `Price`, `Card`, `Skeleton`,
`Stepper`, `Toast`, `EmptyState`, `BottomSheet`, `Modal`, `LanguageSwitcher`, `ContactButtons`,
plus `formatAED`, `COUNTRIES` and `cx`.

`AuthFlow` (`src/auth/`) is the whole sign-up and sign-in flow from the Customer app design:
phone number, WhatsApp code, a short profile for a new account, and email and password as the
second way in. It holds no words and no fetch code. The app passes `labels` (one string per key in
`AUTH_LABEL_KEYS`, from its messages), `errorText` (error code to sentence), `actions` (from
`createAuthActions` in `@am/api-client`) and `onDone`. The steps (`PhoneStep`, `CodeStep`,
`ProfileStep`, `EmailStep`, `ForgotStep`, `ResetStep`) are exported for previews and tests.

The design system also defines `SearchBar`, `ShopCard`, `ProductCard`, `BranchRow`, `ContactBar`,
`MapPin`, `MapCluster`, `StatusTimeline`, `DataTable`, `StatTile`, `BarChart` and `ChatBubble`.
Their styles are already in `components.css`; the React components are added by the phase that
first uses them.

The apps import the built package (`dist`), so run `pnpm nx build @am/ui` after changing a
component while a dev server is running.

## Rules

- **No hard-coded words.** Every visible or spoken string is a prop, so the app passes it from its
  messages in the current language. The only fixed strings are the brand name and each language's
  own name.
- **Logical properties only.** No `left` or `right`; a test fails if one appears in
  `components.css`. Phone numbers, codes and prices are isolated left-to-right inside Arabic.
- **One clay (`primary`) button per screen.** `whatsapp` is only for opening a WhatsApp chat.
  `Badge tone="verified"` is only for shops that passed KYC.
- **Tap targets are at least 44px**; buttons and inputs are 48px. `size="sm"` is for the admin
  console on pointer devices.
- **Focus is always visible** (`shadow-focus`). Dialogs trap focus, close on Escape and return
  focus to their trigger.
- **Icons:** add one by copying its paths from Tabler Icons into `src/icon-paths.ts` under the
  same name. Directional icons are listed there too and mirror in RTL.

## Updating from the design system

1. Replace `components.css` with the new bundle stylesheet (keep the header comment).
2. Copy changed values from the design system's tokens into `theme.css`.
3. Port any new or changed component from the bundle into `src/`, with labels as props.
4. Run `pnpm nx test @am/ui` and check `/en/dev/ui` and `/ar/dev/ui`.
