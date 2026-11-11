import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, LANGUAGES, dictionaryFor, auditReason, checkSentence, errorText, translateTerms } from "./dictionaries.js";

const STORAGE_KEY = "finops.language";

const stored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some((l) => l.code === value) ? value : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

const Context = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(stored);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A blocked storage is not a reason to refuse the language change.
    }
  }, []);

  // Without this a screen reader reads English text with German phonetics.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = dictionaryFor(lang).ui.documentTitle;
  }, [lang]);

  const value = useMemo(() => {
    const dict = dictionaryFor(lang);
    const money = new Intl.NumberFormat(dict.locale, { style: "currency", currency: "EUR" });
    const date = new Intl.DateTimeFormat(dict.locale, { day: "2-digit", month: "2-digit", year: "numeric" });
    const dateTime = new Intl.DateTimeFormat(dict.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return {
      lang,
      setLang,
      dict,
      /** A chrome string. Entries that take parameters are functions. */
      t: (key, ...args) => {
        const entry = dict.ui[key];
        return typeof entry === "function" ? entry(...args) : (entry ?? key);
      },
      state: (code) => dict.state[code] ?? code,
      action: (code) => dict.action[code] ?? code,
      role: (code) => dict.role[code] ?? code,
      changeState: (code) => dict.changeState[code] ?? code,
      changeAction: (code) => dict.changeAction[code] ?? code,
      reviewReason: (code) => dict.reviewReason[code] ?? code,
      matchReason: (code) => dict.matchReason[code] ?? code,
      source: (code) => dict.source[code] ?? code,
      sourceExplanation: (code) => dict.sourceExplanation[code] ?? code,
      aiStep: (code) => dict.aiStep[code] ?? code,
      checkStatus: (code) => dict.checkStatus[code] ?? code,
      severity: (code) => dict.severity[code] ?? code,
      stepStatus: (code) => dict.stepStatus[code] ?? code,
      paymentStatus: (code) => dict.paymentStatus[code] ?? code,
      channel: (code) => dict.channel[code] ?? code,
      checkSentence: (result) => checkSentence(dict, result),
      term: (value) => translateTerms(dict, value),
      auditReason: (reason) => auditReason(dict, reason),
      errorText: (error) => errorText(dict, error ?? {}),
      formatMoney: (value) => (value === null || value === undefined ? "—" : money.format(Number(value))),
      formatDate: (value) => (value ? date.format(new Date(value)) : "—"),
      formatDateTime: (value) => (value ? dateTime.format(new Date(value)) : "—"),
      formatNumber: (value, options) => new Intl.NumberFormat(dict.locale, options).format(value),
    };
  }, [lang, setLang]);

  return createElement(Context.Provider, { value }, children);
}

export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n must be used inside a LanguageProvider");
  return value;
}

export { LANGUAGES };
