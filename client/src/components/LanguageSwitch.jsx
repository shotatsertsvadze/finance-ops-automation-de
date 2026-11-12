import { LANGUAGES, useI18n } from "../lib/i18n.js";

/**
 * German is the product's language; English exists so the same demo can be
 * shown to an audience that does not read German. The choice is per browser,
 * not per account: it changes nothing the server stores.
 */
export default function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="lang-switch" role="group" aria-label={t("languageSwitch")}>
      {LANGUAGES.map((option) => (
        <button
          key={option.code}
          type="button"
          className={option.code === lang ? "is-active" : ""}
          aria-pressed={option.code === lang}
          onClick={() => setLang(option.code)}
        >
          {option.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
