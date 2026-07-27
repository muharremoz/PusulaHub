// Oturum cookie yardımcıları — alt-domain SSO için domain enjeksiyonu.
// Tüm platform uygulamaları *.pusulanet.net'te tek Supabase cookie'sini paylaşır.
// NEXT_PUBLIC_COOKIE_DOMAIN=.pusulanet.net (prod) → alt-domain SSO. Boşsa localhost.

type CookieOpts = {
  path?: string;
  domain?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
  httpOnly?: boolean;
  maxAge?: number;
  expires?: Date | number | string;
};

const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN || undefined;

export function withDomain<T extends CookieOpts>(options?: T): T {
  const base = (options ?? {}) as T;
  if (COOKIE_DOMAIN && !base.domain) return { ...base, domain: COOKIE_DOMAIN };
  return base;
}

/**
 * TV panosu isteği mi? Agent TV modunda User-Agent'a "PusulaCRM-TV" imzası ekler.
 *
 * TV bir kiosk ekranı: PC her açıldığında birinin gidip giriş yapması beklenemez,
 * bu yüzden onun oturumu kalıcı olmalı. Personel makinelerinde "uygulama kapanınca
 * çıkış" davranışı aynen korunur.
 */
export function tvIstegiMi(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.includes("PusulaCRM-TV");
}

/** `kalici` verilirse (TV panosu) kalıcılık KORUNUR. */
export function stripPersistence<T extends CookieOpts>(
  value: string,
  options?: T,
  kalici = false,
): T | undefined {
  const withDom = withDomain(options);
  const deleting = value === "" || (typeof withDom.maxAge === "number" && withDom.maxAge <= 0);
  if (deleting) return withDom;
  if (kalici) return withDom;
  const rest = { ...withDom };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
