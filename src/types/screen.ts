import type { LanguageCode } from '../i18n'

/** How an image slide's picture fills its slot: shrunk to fit without cropping (the default), or scaled to fill the entire container, cropping as needed. */
export type ImageFit = 'contain' | 'cover'

/** How a background image is tinted, both for readability and to pick a matching text color: unmodified, lightened (paired with black text), or darkened (paired with white text). */
export type BackgroundImageOverlay = 'none' | 'light' | 'dark'

/** A background image behind a slot's (or one of its slides') own content — always scaled to cover its whole pane, with an optional tint that also decides whether the text drawn over it is forced to black or white. */
export interface BackgroundImage {
  imageUrl: string
  overlay: BackgroundImageOverlay
  /** Whether the image is softened (see `.split-layout__pane-bg-image`'s own `filter: blur`) — falls back to `true` (blurred, matching this feature's original always-blurred behavior) when absent, so existing saved images stay looking the same. */
  blur?: boolean
}

/** Shared by every `ScreenSlotContent` variant: lets one slide opt out of its slot's own `backgroundImage` and use its own instead — set, simply by providing one, no separate opt-in flag needed. */
interface OwnBackgroundImageFields {
  backgroundImage?: BackgroundImage
}

/**
 * What a slot shows at one of its own content timeline's checkpoints
 * (see `ScreenSlot.content`): nothing, a catalogue (every one of its
 * categories with available items, laid out the same way as the public Menu
 * page — falls back to the first catalogue when `catalogueId` is unset, and
 * via `categories`, just a chosen subset of that catalogue's own categories,
 * e.g. to split a big catalogue across more than one screen, or narrow it to
 * a single category), one of
 * the `'event'` kind's own `displayMode`s (see `EventDisplayMode` — an
 * upcoming-events calendar list, a single upcoming event's own photo or
 * details by ordinal position, or every event in the current month), a
 * single centered image (e.g. a logo or an Instagram photo, pasted in as a
 * URL), or a scannable QR code linking to an admin-typed `url` — drawn in a
 * single flat color (whichever of black/white the pane's own contrast-based
 * `--screen-text` resolves to, see `getScreenColorVars`) with no background
 * box of its own, so it reads as part of the pane rather than a pasted-in
 * sticker. A catalogue/event checkpoint's
 * own `textSizes` is independent of its slot's other stages — e.g. it can
 * be bigger than the slot's other checkpoints — since editing one step's
 * pane is only ever meant to change how that one step looks. It falls back
 * to the slot's own shared/fallback size (then the screen's default) only
 * until it's first edited, at which point it starts writing here instead.
 * An image checkpoint has no text of its own, so it has no text-size fields
 * at all; `fit` instead controls
 * how its picture fills the slide, falling back to `'contain'` when absent.
 * `resizeToFit` (image and video checkpoints only) instead makes its own
 * *pane* grow or shrink to match the media's own aspect ratio — capped at
 * `resizeScale` (defaulting to 40%, `MEDIA_RESIZE_MAX_VIEWPORT_FRACTION`) of
 * the screen's viewport width and height (see `mediaResizeRatioPatch`) —
 * while it's the one showing, sliding back to the slot's own set size once
 * the stage sequence advances to a checkpoint with different content.
 * `resizeScale` can be dragged smaller or bigger via the pane's own borders
 * on the live display, the same handles an arrangement's own dividers use —
 * both axes always move together from this one shared value, so the
 * media's own aspect ratio stays locked no matter which border is dragged.
 * Only one resize-to-fit pane (image or video) is ever active at once per
 * stage, across the whole screen — see `isResizeToFitConflict`. Every
 * kind can independently opt out of its slot's own `backgroundImage` by
 * setting its own `backgroundImage`, regardless of whether it has text of
 * its own. `'announcement'` is a short admin-authored call-to-action — a
 * title (e.g. "Buy tickets now!") and an optional description below it,
 * written once in whichever single language the owner types it in (not
 * per-language, unlike the rest of this app's admin-authored content) — for
 * a one-off message unrelated to the menu/events/message-board systems. Two
 * further kinds are backed by live
 * external data rather than admin-authored content, configured from the
 * admin's Integrations tab (see `useIntegrationsConfig`): `'transit'` shows
 * real-time departures from one of the cafe's configured nearby stops
 * (`stopId`, referencing either `IntegrationsConfig['transit']['selectedStops']`
 * or `IntegrationsConfig['entur']['selectedStops']` depending on the pane's own
 * `brand`), and `'weather'` shows an hourly forecast for the cafe's own address —
 * neither renders anything (see `TransitSlide`/`WeatherSlide`) unless its
 * integration is enabled. Unlike transit, `'weather'`'s own display
 * settings (`forecastHours`, `showWind`, `showHumidity`,
 * `showPrecipitationProbability`, `showUvIndex`, `showPressure`) live on
 * the slide itself rather than in `IntegrationsConfig` — the Integrations tab
 * only toggles whether weather is enabled at all, so different weather
 * panes across a screen (or across screens) can each show different detail
 * fields. `'time'` is a live-ticking clock/date/weekday/week
 * number (see `TimeDisplayMode`) — its own `fontSize` is independent of
 * every other kind's `textSizes`, and its `'time'` display mode's `units`
 * can be narrowed to a single digit group so a full clock can be split
 * across sibling panes (see `TimeSlide`).
 */
export type ScreenSlotContent =
  | ({ kind: 'none' } & OwnBackgroundImageFields)
  | ({ kind: 'catalogue'; catalogueId?: string; categories?: string[]; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({
      kind: 'event'
      /** Falls back to `'calendar'` when unset. */
      displayMode?: EventDisplayMode
      /** Used only when `displayMode` is `'image'`/`'details'` — 1-based position in the live event timeline (see `getUpcomingEvents`); a cancelled event still occupies its own position there (never removed until the admin deletes it outright), so this can resolve to a cancelled entry. Falls back to `1` when unset. */
      eventOrdinal?: number
      /** Used only when `displayMode` is `'calendar'` (or unset) — how many timeline entries it shows. Falls back to `DEFAULT_EVENT_CALENDAR_COUNT`. */
      count?: number
      /** Used only when `displayMode` is `'month'` — whether each listed event also shows its own price. Falls back to `false`. */
      showPrice?: boolean
      /** Used only when `displayMode` is `'month'` — whether each listed event also shows its own description. Falls back to `false`. */
      showDescription?: boolean
      /** Irrelevant for `'image'` — it has no text of its own. */
      textSizes?: TextSizes
    } & OwnBackgroundImageFields)
  | ({ kind: 'image'; imageUrl: string; fit?: ImageFit; resizeToFit?: boolean; resizeScale?: number } & OwnBackgroundImageFields)
  | ({
      kind: 'video'
      videoUrl: string
      /** Falls back to `'contain'`, same meaning as an image checkpoint's own `fit`. Irrelevant while `resizeToFit` is on — the pane is already sized to hug the video, so there's no extra space left to `'contain'`/`'cover'` differently within. */
      fit?: ImageFit
      /** Same meaning as an image checkpoint's own `resizeToFit` — grows or shrinks this slide's own *pane* to match the video's natural aspect ratio (once its dimensions are known, see `SplitLayout`'s own natural-size loading), capped at `resizeScale` of the screen's own viewport. Still draggable like any other pane border while on — dragging one of its own resizable axes changes `resizeScale` instead of writing straight to the tree's own ratio (see `mediaResizeScaleFromDrag`), so the video's own aspect ratio stays locked no matter which edge is dragged. Falls back to `false`. Only one resize-to-fit pane (image or video) is ever allowed active at once per stage — see `isResizeToFitConflict`. */
      resizeToFit?: boolean
      /** Same meaning, units, and default (`MEDIA_RESIZE_MAX_VIEWPORT_FRACTION`) as an image checkpoint's own `resizeScale` — only relevant while `resizeToFit` is on. */
      resizeScale?: number
      /** Live mute toggle, not a transcode-time change — falls back to `false` (audio plays). */
      removeAudio?: boolean
      /** 0-1, falls back to `1`. Only relevant while `removeAudio` is `false`. */
      volume?: number
      /**
       * When `true`, this video plays once (no loop) and, on its own
       * `ended` event, immediately advances the screen's shared stage
       * rotation instead of waiting for the normal timed interval. Falls
       * back to `false` (loop for as long as this checkpoint is showing,
       * matching every other slide kind's steady-state behavior). Stage
       * rotation is one timer shared by the whole screen (see
       * `ScreenDisplay.tsx`'s own `tick` interval), not per-pane —
       * enabling this on a video pane advances every other pane on the
       * screen early too, not just this one.
       */
      advanceStageOnEnd?: boolean
      /**
       * Restarts this video from 0 whenever the screen's shared stage
       * rotation transitions back to stage 1 — e.g. a video meant to tell a
       * story alongside the rotation, so it's back at its own beginning
       * exactly when the whole sequence starts over, rather than sitting at
       * whatever arbitrary point it naturally reached by then. Falls back
       * to `false` (keeps playing straight through, same as every other
       * stage transition). A no-op on a screen with only one stage, since
       * there's no rotation to ever transition back from.
       */
      restartOnStageOne?: boolean
    } & OwnBackgroundImageFields)
  | ({
      kind: 'qrcode'
      /** Used only while `linkMode` is `'custom'` (or unset). */
      url: string
      /** Percentage (`MIN_QR_CODE_SIZE`-100) of the pane's own available space the code fills. Falls back to `DEFAULT_QR_CODE_SIZE` (as large as it can be) when unset. */
      size?: number
      /** `'custom'` encodes `url` as typed; `'news'` instead encodes whichever article `newsSourceMode` resolves to, refreshing as new headlines arrive. Falls back to `'custom'` — existing panes keep working unchanged. */
      linkMode?: 'custom' | 'news'
      /** Only relevant while `linkMode` is `'news'`. `'automatic'` (the default) follows whichever headline a `'news'`-kind pane on this same screen is currently showing — see `newsSlotOrdinal` for picking *which* one, when there's more than one. `'specific'` instead always links to `linkedNewsSourceId`'s own latest headline, independent of any News pane. */
      newsSourceMode?: 'automatic' | 'specific'
      /** Which of `IntegrationsConfig['news']['enabledSourceIds']` this code links to. Only relevant while `newsSourceMode` is `'specific'` — a QR code encodes one URL, so this is a single pick, not a multi-select like a `'news'` slide's own `sourceIds`. */
      linkedNewsSourceId?: string
      /** Which `'news'`-kind pane on this same screen/stage to follow, by 1-based position among them — only relevant (and only meaningful with more than one) while `newsSourceMode` is `'automatic'`. Same "simple admin-set ordinal" pattern as `'event'`'s own `eventOrdinal`. Falls back to `1`. */
      newsSlotOrdinal?: number
      /** Embeds the linked source's own logo in the code's center (see `FetchedLogo`'s fallback monogram when no real logo file exists yet), with the surrounding modules excavated and error-correction raised so it stays scannable. Only relevant while `linkMode` is `'news'`. Falls back to `true`. */
      showSourceLogo?: boolean
      /** Overrides the pane's own background with the linked source's own brand color instead of the screen's normal styling. Only relevant while `linkMode` is `'news'`. Falls back to `true`. */
      useSourceTheme?: boolean
    } & OwnBackgroundImageFields)
  | ({
      kind: 'transit'
      /**
       * Which brand's own stop pool this pane picks `stopId` from —
       * `IntegrationsConfig['transit']['selectedStops']` for `'ruter'`,
       * `IntegrationsConfig['entur']['selectedStops']` for `'entur'` (see the
       * admin's own "Ruter# - Departures"/"Entur - Departures" options for
       * this slide kind, `SlideFields.tsx`). Falls back to `'ruter'` for
       * panes saved before this field existed. Also decides which of the
       * two look-alike themes `useBrandTheme` applies.
       */
      brand?: 'ruter' | 'entur'
      stopId?: string
      /** How many upcoming departures the list shows. Falls back to `DEFAULT_TRANSIT_DEPARTURE_COUNT`. */
      departureCount?: number
      /** Show each departure's quay/platform (e.g. `"A"`), when Entur reports one for this stop. Falls back to `false`. */
      showPlatform?: boolean
      /** Show the line's full name (e.g. "Ekebergbanen") instead of just its public code (e.g. "18"). Falls back to `false`. */
      showLineName?: boolean
      /** Hide schedule-only departures Entur hasn't started tracking live yet, keeping only `realtime: true` ones. Falls back to `false`. */
      realtimeOnly?: boolean
      /** Transport modes (matching `NearbyStop['modes']`, e.g. `"bus"`, `"rail"`) to include — empty/unset means every mode at the stop is shown, unfiltered. */
      modeFilter?: string[]
      /** Which icon set the mode icons next to each departure are drawn from — see `TransitIconPack`. Falls back to `DEFAULT_TRANSIT_ICON_PACK`. */
      iconPack?: TransitIconPack
      /** Overrides the pane's own background/font/text colors with a look-alike of whichever brand this pane is (see `brand`) instead of the screen's normal styling. Falls back to `true`. */
      useBrandTheme?: boolean
      /** Shows the pane's own brand's logo in its top-left corner. Only relevant while `useBrandTheme` is on. Falls back to `true`. */
      showBrandLogo?: boolean
      textSizes?: TextSizes
    } & OwnBackgroundImageFields)
  | ({
      kind: 'weather'
      /**
       * Which of `IntegrationsConfig['weather']['locations']` this pane shows
       * the forecast for, by id. Unset — or referencing a location that's
       * since been removed — falls back to the store's own address
       * (`addressLookup.coordinates`) while `useStoreLocation` is on, else
       * the first remaining configured location; see `WeatherSlide`'s
       * resolution order.
       */
      locationId?: string
      /** How many hours ahead the forecast list shows. Falls back to `DEFAULT_WEATHER_FORECAST_HOURS`. */
      forecastHours?: number
      /** Show wind speed (m/s) alongside temperature. Falls back to `false`. */
      showWind?: boolean
      /** Show relative humidity (%). Falls back to `false`. */
      showHumidity?: boolean
      /** Show precipitation probability (%), when MET's forecast includes one for that hour. Falls back to `false`. */
      showPrecipitationProbability?: boolean
      /** Show the UV index, when MET reports one (daylight hours only). Falls back to `false`. */
      showUvIndex?: boolean
      /** Show air pressure at sea level (hPa). Falls back to `false`. */
      showPressure?: boolean
      /** Which icon set each hour's own weather symbol is drawn from — see `WeatherIconPack`. Falls back to `DEFAULT_WEATHER_ICON_PACK`. */
      iconPack?: WeatherIconPack
      /** Overrides the pane's own background/font/text colors with a Yr look-alike theme instead of the screen's normal styling. Falls back to `true`. */
      useBrandTheme?: boolean
      /** Shows the Yr logo in the pane's top-left corner. Only relevant while `useBrandTheme` is on. Falls back to `true`. */
      showBrandLogo?: boolean
      textSizes?: TextSizes
    } & OwnBackgroundImageFields)
  | ({
      kind: 'news'
      /** Which of `IntegrationsConfig['news']['enabledSourceIds']` this pane pulls headlines from. Empty/unset means every cafe-wide-enabled source. */
      sourceIds?: string[]
      /** How many headlines this pane cycles through. Falls back to `DEFAULT_NEWS_HEADLINE_COUNT`. */
      headlineCount?: number
      /** Seconds between headlines — this pane's own internal rotation timer, independent of the screen's shared stage rotation (same posture as a `'messageboard'` slide's own `'rotating'` mode). Falls back to `DEFAULT_NEWS_ROTATE_SECONDS`. */
      rotateSeconds?: number
      /** Overrides the pane's own background with whichever source the currently-shown headline is from, swapping as it rotates between sources. Falls back to `true`. */
      useBrandTheme?: boolean
      /** Shows the current headline's own source logo in the pane's top-left corner. Only relevant while `useBrandTheme` is on. Falls back to `true`. */
      showBrandLogo?: boolean
      textSizes?: TextSizes
    } & OwnBackgroundImageFields)
  | ({ kind: 'announcement'; title: string; description: string; textSizes?: TextSizes } & OwnBackgroundImageFields)
  | ({
      kind: 'messageboard'
      /** Which `MessageBoard` (see `src/types/messageBoard.ts`) this slot shows — unset renders nothing, same posture as an unset transit `stopId`. */
      boardId?: string
      /** Falls back to `'rotating'` when unset. */
      displayMode?: MessageBoardDisplayMode
      /** Used only when `displayMode` is `'single'` — which of `boardId`'s own posts to show. */
      postId?: string
      /** Used only when `displayMode` is `'list'`. Falls back to `'newestFirst'`. */
      order?: MessageBoardOrder
      /** Used only when `displayMode` is `'rotating'` — seconds between posts. Falls back to `DEFAULT_MESSAGE_BOARD_ROTATE_SECONDS`. */
      rotateSeconds?: number
      /** Caps how many posts feed `'rotating'`/`'list'`. Falls back to `DEFAULT_MESSAGE_BOARD_COUNT`. */
      count?: number
      textSizes?: TextSizes
    } & OwnBackgroundImageFields)
  | ({
      kind: 'time'
      /** Falls back to `'time'` (a live clock) when unset. */
      displayMode?: TimeDisplayMode
      /** Used only when `displayMode` is `'time'` (or unset) — which of the clock's own digit groups this pane shows, in canonical hour/minute/second order regardless of this array's own order. Narrowing it to a single unit (e.g. just `['hours']`) is what lets a clock be split across more than one pane — one pane showing just the hour, a sibling pane just the minute — for a big segmented-clock look. Falls back to all three. */
      units?: TimeUnit[]
      /** Used only when `displayMode` is `'time'` (or unset) — whether the colon(s) between shown digit groups blink once per second, classic-digital-clock style. Has no visible effect with only one unit shown (no colon to blink at all). Falls back to `true`. */
      blinkColon?: boolean
      /** Used only when `displayMode` is `'date'` — how much of the date is spelled out, from the weekday name plus full month (`'full'`) down to all-numeric (`'short'`); see `getDateFormatOptions`, which maps this to `Intl.DateTimeFormat` options by hand rather than its own `dateStyle` shorthand, since that shorthand can't have its year suppressed. Falls back to `'long'`. */
      dateStyle?: TimeDateStyle
      /** Used only when `displayMode` is `'date'` — whether the year is included. Falls back to `false`: a screen showing today's date usually doesn't need the year restated. */
      showYear?: boolean
      /** Used only when `displayMode` is `'weekday'` — `Intl.DateTimeFormat`'s own `weekday` granularity, from the full day name (`'long'`, e.g. "Monday") down to a single letter (`'narrow'`, e.g. "M"). Falls back to `'long'`. */
      weekdayStyle?: TimeWeekdayStyle
      /**
       * This pane's own font size — a percentage of the pane's own smaller
       * dimension, same `cqmin`-based unit as `TextSizes` (see its own doc
       * comment) — deliberately independent of the shared per-slot
       * `textSizes` system (`heading`/`itemTitle`/etc.) — a clock/date
       * pane's ideal size (e.g. one huge digit filling a narrow split-off
       * pane) doesn't correspond to any of those roles. Falls back to
       * `DEFAULT_TIME_FONT_SIZE`.
       */
      fontSize?: number
    } & OwnBackgroundImageFields)

/** How a `'messageboard'` slide shows its board's posts: one admin-picked post, an auto-rotating carousel, or every post stacked in a scrollable column. */
export type MessageBoardDisplayMode = 'single' | 'rotating' | 'list'

/** Sort direction for a `'messageboard'` slide's own `'list'` display mode. */
export type MessageBoardOrder = 'newestFirst' | 'oldestFirst'

/** Used when a `'messageboard'` slide's own `rotateSeconds` is unset. */
export const DEFAULT_MESSAGE_BOARD_ROTATE_SECONDS = 8

/** Used when a `'messageboard'` slide's own `count` is unset. */
export const DEFAULT_MESSAGE_BOARD_COUNT = 10

/** Used when a `'news'` slide's own `headlineCount` is unset. */
export const DEFAULT_NEWS_HEADLINE_COUNT = 8

/** Used when a `'news'` slide's own `rotateSeconds` is unset. */
export const DEFAULT_NEWS_ROTATE_SECONDS = 8

/** What a `'time'` slide shows: a live clock, the full date, just the weekday name, or the ISO week number. */
export type TimeDisplayMode = 'time' | 'date' | 'weekday' | 'weekNumber'

/** One digit group of a `'time'` slide's own clock, in `'time'` display mode. */
export type TimeUnit = 'hours' | 'minutes' | 'seconds'

/** `Intl.DateTimeFormatOptions['dateStyle']`, reused as-is for a `'time'` slide's `'date'` display mode. */
export type TimeDateStyle = 'full' | 'long' | 'medium' | 'short'

/** `Intl.DateTimeFormatOptions['weekday']`, reused as-is for a `'time'` slide's `'weekday'` display mode. */
export type TimeWeekdayStyle = 'long' | 'short' | 'narrow'

/** Used when a `'time'` slide's own `units` is unset (`'time'` display mode only) — a full clock. */
export const DEFAULT_TIME_UNITS: TimeUnit[] = ['hours', 'minutes', 'seconds']

/** Used when a `'time'` slide's own `fontSize` is unset. Deliberately larger than `DEFAULT_TEXT_SIZES.heading` — a clock is usually the sole focus of its pane. Same percentage/`cqmin` unit as `TextSizes` — see its own doc comment. */
export const DEFAULT_TIME_FONT_SIZE = 19

/**
 * How an `'event'` slide shows the cafe's events: `'calendar'` lists the
 * next few upcoming ones (soonest first), `'image'`/`'details'` each
 * pin to a single event by its 1-based ordinal position in that same
 * upcoming timeline (see `getUpcomingEvents`) — one showing just its photo,
 * the other its title/date/description — and `'month'` lists every event
 * occurring in the current calendar month, headed by the month's own name.
 */
export type EventDisplayMode = 'calendar' | 'image' | 'details' | 'month'

/** Used when an `'event'` slide's own `count` is unset (`'calendar'` mode only). */
export const DEFAULT_EVENT_CALENDAR_COUNT = 4

/** Used when a `'weather'` slide's own `forecastHours` is unset. */
export const DEFAULT_WEATHER_FORECAST_HOURS = 6

/** Used when a `'transit'` slide's own `departureCount` is unset. */
export const DEFAULT_TRANSIT_DEPARTURE_COUNT = 5

/**
 * Which built-in icon set a `'transit'` slide's mode icons are drawn from
 * (see `TransitModeIcon`). `'standard'` is a familiar, widely-recognized
 * transit icon style adapted from the open-source Lucide icon set.
 * `'simple'` is this app's own original hand-drawn outline set, kept around
 * for existing screens/anyone who prefers it.
 */
export type TransitIconPack = 'standard' | 'simple'

/** Used when a `'transit'` slide's own `iconPack` is unset. */
export const DEFAULT_TRANSIT_ICON_PACK: TransitIconPack = 'standard'

/**
 * Which built-in icon set a `'weather'` slide's hourly symbols are drawn
 * from (see `WeatherSymbolIcon`). `'outline'` is a set of dedicated outline
 * glyphs (sun/cloud/rain/etc, with day/night variants where it has them).
 * `'system'` is this app's original approach — the device/browser's own
 * emoji font (see `weatherSymbolToEmoji`) — kept around for existing
 * screens/anyone who prefers it.
 */
export type WeatherIconPack = 'outline' | 'system'

/** Used when a `'weather'` slide's own `iconPack` is unset. */
export const DEFAULT_WEATHER_ICON_PACK: WeatherIconPack = 'outline'

/** Used when a `'qrcode'` slide's own `size` is unset — fills as much of its pane as it can. */
export const DEFAULT_QR_CODE_SIZE = 100

/** Smallest percentage a `'qrcode'` slide's own `size` can be dragged down to. */
export const MIN_QR_CODE_SIZE = 10

/**
 * A sparse per-stage "checkpoint" map for one field's value — only stages
 * where an explicit value was set have an entry. A field's effective value
 * at a given stage is the entry at the closest stage number at or below it,
 * or (if none exists below it) the entry at the highest stage number at
 * all, wrapping around circularly, since the whole sequence loops back to
 * stage 1 after the last one. Resolve with the helpers in
 * `src/utils/screenStages.ts` — never index this map directly, since a
 * present-but-`undefined` entry (an explicit "nothing at this stage") must
 * be distinguished from no entry at all (nothing set here, inherit from
 * elsewhere), which a plain `timeline[stage]` lookup can't tell apart.
 */
export type StageTimeline<T> = Record<number, T>

/**
 * One of a screen's up to 4 content slots. When `ScreenConfig.useStages` is
 * on, every slot advances through the same shared sequence of numbered
 * stages together (see `ScreenConfig.stageCount`), using
 * `slideDurationSeconds` as the shared timer. A slot doesn't need its own
 * value at every stage — each of its own fields below is an independent
 * `StageTimeline`, only checkpointed at the stages where the owner actually
 * changed *that* field, holding its last explicit value until the next one.
 * The four timelines are deliberately independent of each other: changing a
 * slot's content at stage 5 doesn't disturb whatever stage its own
 * background color was last set at. When `useStages` is off, every slot
 * always resolves as if there's exactly one stage (stage 1).
 */
export interface ScreenSlot {
  content: StageTimeline<ScreenSlotContent>
  /** This slot's own background color (hex, from `SCREEN_BACKGROUND_COLORS`) timeline, independent of the screen's own. An entry's value may itself be `undefined` (explicitly transparent at that stage, showing the screen's own background through) — distinct from no entry at all at that stage (inherit from an earlier one). */
  backgroundColor: StageTimeline<string | undefined>
  /** This slot's own background image (blurred, scaled to cover the pane) timeline, shown behind whichever content is currently active. A slide with its own `backgroundImage` set overrides this one just for itself. */
  backgroundImage: StageTimeline<BackgroundImage | undefined>
  /** This slot's own shared/fallback text size timeline — replaces the old screen-level `slotTextSizes`. Falls back to the screen's own `textSizes` (then `DEFAULT_TEXT_SIZES`) at any stage without an entry. */
  textSizes: StageTimeline<TextSizes | undefined>
  /** This slot's own language override timeline — an entry's value may itself be `undefined` (explicitly "use the cafe's own Standard pane language" at that stage, see `useDefaultPaneLanguage`), distinct from no entry at all (inherit from an earlier stage's own override, then the standard). Optional (rather than always-present like the fields above) since it's a newer field — a slot with none set at all falls back to the standard everywhere, exactly as if this were `{}`. */
  language?: StageTimeline<LanguageCode | undefined>
  /** Whether this pane is locked at a given stage — while locked, its own content/background/text-size edits, splitting, deleting, and its own divider(s) are all disabled (see `resolveSlotLocked`, `subtreeHasLockedLeaf`), until toggled off again with the same lock button. Optional (like `language`) since it's a newer field — a slot with none set at all is unlocked everywhere. Purely an accidental-edit guard for an admin already in the editor, not a security boundary — there's no PIN or confirmation to unlock, just the same button again. */
  locked?: StageTimeline<boolean>
  /** Which "Group" (see the screen editor toolbar's own button) this pane belongs to at a given stage, if any — a fresh id generated per `Group` action, shared by every pane grouped together at that same action. Checkpointed per-stage exactly like every other field here, so grouping (or a later split back apart) at one stage never retroactively changes an earlier or later one: the group only ever exists at stages it was explicitly written to. Optional since it's a newer field — a slot with none set at all was never grouped. Purely a derived-rendering hint (see `LayoutTree.tsx`'s own border-color override) — deleting/moving a pane doesn't clean up its old groupmates' own entries, same "orphaned checkpoint data left in place" posture as everything else here. */
  groupId?: StageTimeline<string | undefined>
  /**
   * Whether this pane's own content shrinks to fit its available space
   * (never overflows, never scrolls) or is instead allowed to render at its
   * full requested size and scroll if that's taller than the pane —
   * checkpointed per-stage like every other field here. Optional since it's
   * a newer field — a slot with none set at all falls back to `'shrink'`
   * everywhere (see `resolveSlotOverflowMode`). Horizontal overflow is
   * never allowed in either mode, only vertical, and only in `'scroll'`
   * mode — see `LayoutPane.tsx`/`useShrinkToFitScale`.
   */
  overflowMode?: StageTimeline<'shrink' | 'scroll' | undefined>
}

/** How a screen's panes are arranged along their split axis: side by side, or stacked. */
export type SplitDirection = 'row' | 'column'

/** Opaque, stable identifier for one pane — generated once (see `createLeaf` in `src/utils/layoutTree.ts`) and never reused or positional, so a pane keeps its own identity (content, `editingFocus`, drag/drop targets) across arbitrary tree edits and across whichever of a screen's stages happen to include it. */
export type PaneId = string

/**
 * A screen's pane arrangement — structure only, no content (see
 * `ScreenConfig.paneSlots` for that). A `'leaf'` is one visible pane,
 * referenced by its stable `PaneId`. A `'split'` divides its own box in two
 * along `direction` ('row' = side by side, a vertical divider; 'column' =
 * stacked, a horizontal one) at `ratio` (percentage, 10-90, the `first`
 * child's own share — see `MIN_RATIO`/`MAX_RATIO` in `screenLayout.ts`),
 * containing two further `LayoutNode`s, each in turn a leaf or another
 * split — arbitrarily deep, arbitrarily wide. Rendered recursively as
 * nested CSS grids, one per `split` node (see `LayoutTree.tsx`). `ratio` is
 * a plain number, not its own per-stage timeline, because the whole tree is
 * already checkpointed as one unit at the outer `ScreenConfig.layout` level
 * (see there) — nesting a second per-stage timeline inside an
 * already-per-stage-resolved value would be redundant.
 */
export type LayoutNode = { type: 'leaf'; id: PaneId } | { type: 'split'; direction: SplitDirection; ratio: number; first: LayoutNode; second: LayoutNode }

/** How a slide change is animated for any slot's own in-place rotation. Kept as its own union so more styles can be added later without changing `ScreenConfig`'s shape. */
export type ScreenTransitionStyle = 'fade' | 'slide'

/** The fallback entrance/exit a pane uses when it has no existing internal divider to grow from/collapse into — see `ScreenConfig.paneGrowthFallback`. */
export type PaneGrowthFallback = 'screenEdge' | 'fade'

/** Which side a `'slide'`-style transition's incoming slide enters from — the outgoing one exits toward the opposite side. Only relevant when `transitionStyle` is `'slide'`; computed per pane from the arrangement itself (see `paneDefaultSlideDirection`) rather than stored on `ScreenConfig`, so a slide never has to enter/exit through a border it shares with a neighboring pane. */
export type SlideTransitionDirection = 'left' | 'right' | 'up' | 'down'

/** One selectable screen background color: a fixed hex value from the project's brand palette (not a theme variable), so it looks the same regardless of the viewer's light/dark mode. */
export interface ScreenBackgroundColorOption {
  key: string
  hex: string
}

/** Fixed background color choices for screens, drawn from the site's brand palette (`src/styles/_variables.scss`) plus a couple of neutrals. Deliberately literal hex values, not theme-dependent CSS variables. */
export const SCREEN_BACKGROUND_COLORS: ScreenBackgroundColorOption[] = [
  { key: 'white', hex: '#ffffff' },
  { key: 'cream', hex: '#fffaf2' },
  { key: 'black', hex: '#000000' },
  { key: 'mustard', hex: '#dfa93e' },
  { key: 'neutralGreen', hex: '#626c66' },
  { key: 'burgundy', hex: '#8f250c' },
  { key: 'lime', hex: '#88d18a' },
]

/** Used when a screen has no `backgroundColor` of its own yet. */
export const DEFAULT_SCREEN_BACKGROUND_COLOR = '#ffffff'

/** A ratio (e.g. `{ width: 16, height: 9 }` for "16:9") a screen's own preview is shaped to — see `ScaledScreenPreview`'s own doc comment for how this drives its internal reference resolution. */
export interface PreviewAspectRatio {
  width: number
  height: number
}

/** Used when a screen has no `previewAspectRatio` of its own yet — a standard landscape display. */
export const DEFAULT_PREVIEW_ASPECT_RATIO: PreviewAspectRatio = { width: 16, height: 9 }

/**
 * Font sizes for the text roles shared by every slide, adjustable per screen
 * via the in-display text size editor. Each number is a percentage of the
 * pane's own smaller dimension (CSS `cqmin` container-query units — 1 means
 * 1% of `min(pane width, pane height)`), not a fixed absolute size, so the
 * same value scales naturally across differently-sized/shaped panes instead
 * of looking disproportionate — see `textSizesToCssVars`. `price` is a
 * category's own default price (shown once in its header); `itemPrice` is
 * each individual product's own price — kept separate since a category that
 * shows one header price (e.g. Nachos) and a category whose items each show
 * their own price (e.g. Coffee & Drinks) aren't necessarily meant to match.
 */
export interface TextSizes {
  heading: number
  itemTitle: number
  description: number
  price: number
  itemPrice: number
}

/**
 * Percentages matching the slides' original hardcoded rem values (roughly,
 * against a reference pane whose own smaller dimension is ~500px, i.e. 1% ≈
 * 5px there), used when a screen has no `textSizes` of its own yet. Existing
 * screens saved before this field meant a percentage are converted by
 * `migrateTextSizesToPercent` in `useScreens.ts`, not read as-is.
 */
export const DEFAULT_TEXT_SIZES: TextSizes = {
  heading: 11,
  itemTitle: 5.5,
  description: 4,
  price: 5,
  itemPrice: 5,
}

/**
 * The subset of `ScreenConfig` fields that determine what a screen actually
 * renders, and can therefore be staged privately in `ScreenConfig.draft`
 * before publishing. Excludes identity/metadata (`screenID`, `name`,
 * `previewAspectRatio`) and ephemeral live-signal fields (`useScreensaver`,
 * `screensaverTestActive`, `editingFocus`), which are always live.
 */
export type DraftableScreenFields = Pick<
  ScreenConfig,
  | 'layout'
  | 'paneSlots'
  | 'backgroundColor'
  | 'backgroundImage'
  | 'showSlotBorders'
  | 'borderColor'
  | 'useStages'
  | 'stageCount'
  | 'slideDurationSeconds'
  | 'transitionStyle'
  | 'paneGrowthFallback'
  | 'textSizes'
  | 'hideScrollbar'
>

/** A configured fullscreen display, editable via the admin Screens view and rendered at `/screens/:screenId`. */
export interface ScreenConfig {
  screenID: string
  name: string
  /**
   * This screen's pane arrangement, per stage — same `StageTimeline`
   * resolution every other per-stage field already uses (nearest checkpoint
   * at-or-below the stage, else wraps to the highest). A single-stage
   * screen just has one checkpoint at stage 1, always resolved regardless
   * of the queried stage. Splitting/deleting a pane at stage N writes a
   * whole new tree checkpoint at N, inherited by every later stage until
   * its own checkpoint exists — exactly how a content edit "changes this
   * step onward" already works. This is what lets a multi-stage screen add
   * or remove panes as its sequence advances.
   */
  layout: StageTimeline<LayoutNode>
  /**
   * Every pane's own content/background/text-size, keyed by its stable
   * `PaneId` — deliberately NOT itself per-stage (each field inside
   * `ScreenSlot` already is, unchanged). Kept separate from `layout` so a
   * pane's content stays the single continuous source of truth regardless
   * of which stages' tree checkpoints happen to reference it — editing a
   * pane's content while viewing stage 2 is visible at stage 5 too (if
   * stage 5 inherits stage 2's tree shape) with no need to know or care
   * about tree-checkpoint boundaries. A `PaneId` no longer referenced by
   * any stage's tree is simply unreachable — left as harmless orphaned
   * data (nothing else in this app prunes "unused" data either).
   */
  paneSlots: Record<PaneId, ScreenSlot>
  /** Whether every pane advances through a shared sequence of numbered stages together (see `stageCount`). Falls back to `false` (a single static stage) when absent — turning it off never deletes checkpoint data beyond stage 1, so turning it back on (or growing `stageCount` back up) restores exactly where the owner left off. */
  useStages?: boolean
  /** Total number of shared stages, 1 and up — only relevant/edited while `useStages` is true. Falls back to 1 when absent. Shrinking this never prunes checkpoints beyond the new count; they simply become unreachable until it's grown back. */
  stageCount?: number
  /** Seconds each stage is shown before advancing to the next, shared by every pane's own rotation. Only meaningful while `useStages` is on and `stageCount` is more than 1. */
  slideDurationSeconds: number
  transitionStyle: ScreenTransitionStyle
  /** Which entrance/exit a newly-appeared or just-removed pane uses when no existing internal divider qualifies as a border to grow from/collapse into (see `resolvePaneGrowthOrigin` in `src/utils/paneGrowth.ts`) — e.g. splitting a screen's very first/only pane, where there's nothing else yet to grow from. `'screenEdge'` grows in from (or collapses back into) whichever of the pane's own edges lies on the screen's outer boundary. `'fade'` skips the directional wipe entirely and just crossfades in/out in place. Falls back to `'screenEdge'` when absent. */
  paneGrowthFallback?: PaneGrowthFallback
  /** Optional per-screen text size override, set via the display's own "Edit appearance" panel. Falls back to `DEFAULT_TEXT_SIZES` when absent. */
  textSizes?: TextSizes
  /**
   * Internal migration marker, not user-facing: whether every `TextSizes`/
   * `'time'` `fontSize` value reachable from this screen has already been
   * converted from the old fixed-`rem` unit to the current `cqmin`-percentage
   * one (see `TextSizes`' own doc comment). Absent/`false` means this screen
   * predates that rework — `useScreens.ts`'s `normalizeScreen` converts its
   * values (and sets this to `true`) every time it's read, same read-time-
   * only posture as this file's other migrations, until it's next actually
   * saved, which is what makes the conversion (and this flag) stick.
   */
  usesPercentTextSizes?: boolean
  /** Whether visible borders are drawn between panes. Falls back to `false` (hidden) when absent — the divider gap's own translucent tint (see `--screen-border`) reads as an unwanted glow/shadow against a whole-screen background image, so a screen only gets visible borders once explicitly opted into. */
  showSlotBorders?: boolean
  /** Fixed border color (hex, from `SCREEN_BACKGROUND_COLORS`) between panes. Falls back to an automatic contrast-based color (`--screen-border`) when absent. Only relevant while `showSlotBorders` is on and there's more than one pane. */
  borderColor?: string
  /** Whether a pane's own scrollbar is hidden — only relevant for a pane whose own `ScreenSlot.overflowMode` is `'scroll'` (the `'shrink'` default never scrolls at all, so has no scrollbar to hide). Content stays scrollable either way — this only hides the scrollbar UI. Falls back to `false` (shown) when absent. */
  hideScrollbar?: boolean
  /** Fixed background color (hex) for this screen, chosen from `SCREEN_BACKGROUND_COLORS`. Falls back to `DEFAULT_SCREEN_BACKGROUND_COLOR` when absent. Not affected by the site's light/dark mode. */
  backgroundColor?: string
  /** A background image for the whole screen (blurred, scaled to cover, same technique as a slot's own — see `BackgroundImage`), shown behind every pane that doesn't have its own background color/image. Falls back to none when absent. */
  backgroundImage?: BackgroundImage
  /** Which physical display shape this screen is meant for — purely a sanity-check/preview aid (the "Layout" tab's own live preview, and each screen's card in the admin Screens list), never affects the real kiosk display itself (`ScreenDisplay` always fills whatever the actual browser/device window's own shape is). Falls back to `DEFAULT_PREVIEW_ASPECT_RATIO` (16:9) when absent. */
  previewAspectRatio?: PreviewAspectRatio
  /** Whether this screen goes black during the shared screensaver schedule's own window (set once, for every screen, from the admin dashboard's "Screen saver" button — see `useScreensaverSchedule`). A whole-screen effect, not per-slot. Has no effect at all — and its own checkbox stays hidden — until a schedule's actually been set. Falls back to `false` (never) when absent. */
  useScreensaver?: boolean
  /** Live-toggled preview of the screensaver ("Test screensaver"), independent of the actual schedule — shows the same black overlay immediately regardless of the time of day (or whether `useScreensaver` is even on), on this screen and any other open tab of it. Manually turned back off the same way; falls back to `false` when absent. */
  screensaverTestActive?: boolean
  /**
   * Which of this screen's own panes the admin's editor is currently
   * focused on — an ephemeral, live-synced signal (same mechanism as
   * `screensaverTestActive`) rather than real screen configuration, so the
   * actual live display (see `SplitLayout`) can flash the matching pane and
   * make clear, even when that display is showing somewhere else entirely
   * (a kiosk, another tab/window), which part is currently being edited.
   * `tab` is a `PaneId` (or `'global'` for the whole screen), not a
   * positional index, so it stays valid across arbitrary tree edits.
   * `pulse` increments on every focus change, even a repeat one on the pane
   * that's already active, purely so the display can restart its flash
   * animation from scratch regardless of how fast it's re-triggered.
   * Cleared to `undefined` when the editor closes.
   */
  editingFocus?: { tab: 'global' | PaneId; pulse: number }
  /**
   * Unpublished edits staged by an editable viewer with "Live editing" off
   * (see `ScreenDisplay`'s own toolbar) — a partial overlay of
   * `DraftableScreenFields`, invisible to every other viewer (including a
   * *different* editable viewer who still has Live editing on) until
   * "Publish" merges it onto this screen's own top-level fields and clears
   * it back to `undefined`. Absent means no pending draft.
   */
  draft?: Partial<DraftableScreenFields>
}

/** A named, reusable set of text sizes, saved from one screen's editor and applicable to any screen. */
export interface TextSizePreset {
  presetID: string
  name: string
  textSizes: TextSizes
  /** Same migration marker as `ScreenConfig.usesPercentTextSizes` — absent/`false` means `textSizes` here is still in the old fixed-`rem` unit, converted (and tagged `'percent'`) every time `useTextSizePresets` reads it. */
  unit?: 'percent'
}
