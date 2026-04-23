import en from "./en";
import es from "./es";
import type { Translations } from "./en";

export type Language = "en" | "es";

const locales: Record<Language, Translations> = { en, es };

export function getTranslations(lang: Language): Translations {
  return locales[lang] ?? locales["en"];
}

export type { Translations };
export { en, es };
