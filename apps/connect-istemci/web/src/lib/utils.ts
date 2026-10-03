import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Pusula VPN'inde kullanıcıya atanmış sabit IP'ler 172.22.204.x aralığındadır. Başka bir adres geldiyse
 * FortiGate havuzdan dinamik vermiş demektir: her bağlanışta değişebilir, Pusula X'teki yazıcı adresi tutmaz.
 */
export const SABIT_VPN_ONEKI = "172.22.204.";
export const vpnIpSabitMi = (ip: string | null | undefined) => !!ip && ip.startsWith(SABIT_VPN_ONEKI);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
