import type { WebinarStatus } from "@/lib/data";
import { LIVE_DEFAULTS, type LiveSettings, type RoomFormat } from "@/lib/room-logic";
import {
  DEFAULT_PRELIVE_TEMPLATE,
  normalizeAppearance,
  type PreliveAppearance,
} from "@/lib/prelive-templates";

/** O formulário do editor: os campos de `webinars` como texto, tal como os campos os mostram. */
export function emptyEditorForm() {
  return {
    internal_name: "",
    public_title: "",
    description: "",
    host_name: "",
    host_role: "",
    host_avatar_url: "",
    chat_pin_title: "Participe no chat!",
    chat_pin_message: "",
    offer_pin_title: "Vagas abertas :",
    offer_pin_message: "",
    slug: "",
    scheduled_at: "",
    session_end_time: "",
    status: "draft" as WebinarStatus,
    video_source_id: "none",
    replay_enabled: true,
    waiting_room_enabled: true,
    prelive_enabled: false,
    prelive_seconds: 300,
    prelive_sound: true,
    prelive_message: "A transmissão começa já a seguir",
    prelive_template: DEFAULT_PRELIVE_TEMPLATE as string,
    prelive_appearance: normalizeAppearance(DEFAULT_PRELIVE_TEMPLATE, null) as PreliveAppearance,
    schedule_mode: "single" as "single" | "jit",
    recurrence_enabled: false,
    recurrence_pattern: "daily" as "daily" | "weekly",
    recurrence_weekday: "1",
    recurrence_start_time: "",
    recurrence_end_time: "",
    jit_interval_minutes: "15",
    timezone: "Europe/Lisbon",
    easy_access: false,
    sync_video_with_start: false,
    cta_text: "",
    cta_url: "",
    cta_color: "green",
    cta_price_original: "",
    cta_price_now: "",
    cta_image_url: "",
    cta_countdown_seconds: "300",
    cta_start_seconds: "",
    cta_end_seconds: "",
    registration_headline: "",
    registration_subtitle: "",
    registration_button_text: "Entrar na sala",
    registration_collect_phone: true,
    registration_require_phone: false,
    registration_cover_url: "",
    registration_badge_text: "",
    registration_progress_enabled: false,
    registration_progress_value: "92",
    registration_scarcity_note: "",
    room_theme: "dark" as "dark" | "light",
    share_title: "",
    share_description: "",
    share_image_url: "",
    webhook_url: "",
    webhook_enabled: false,
    host_verified: true,
    room_theme_system: false,
    // Guardado em chat_settings.room_format (ver roomFormat).
    room_format: "webinar" as RoomFormat,
    // Onde as pessoas se inscrevem: a página do Novawebinar ou uma página externa. Guardado em chat_settings.entry_mode.
    entry_mode: "page" as "page" | "own",
    // Guardado em chat_settings.live (ver liveSettings).
    live: { ...LIVE_DEFAULTS, links: {}, moments: [] } as LiveSettings,
    entry_card_color: "#141414",
    entry_button_color: "#E8440C",
    offer_utm: true,
    offer_countdown_end: "keep" as "keep" | "close",
    offer_deadline: "",
    sales_show_real: false,
    sales_where: "both" as "chat" | "video" | "both",
    recurrence_days: [] as number[],
    recurrence_times: [] as string[],
    jit_skip_night: false,
  };
}

export type EditorForm = ReturnType<typeof emptyEditorForm>;
export type SetForm = (patch: Partial<EditorForm>) => void;

/** O que realça um elemento na pré-visualização enquanto o campo está em foco. */
export type FocusProps = (key: string) => { onFocus: () => void; onBlur: () => void };
