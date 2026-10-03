/**
 * Pusula müşterilerinin ülkeleri — dünyada işaretlenir (ag-arkaplan.tsx).
 *
 * Kaynak: PusulaCRM `firma_il_dagilimi` (customers.city) + CRM'in il/ülke çözücüsü
 * (`src/lib/data/il-koordinatlari.ts` → cozumleKonum). Türkiye illeri tek "Türkiye" altında toplandı;
 * konumu çözülemeyen firmalar (≈880) dahil değil. Koordinat: ülkenin yaklaşık merkezi.
 * Üretildi: 03.10.2026 — müşteri olunan yeni bir ülke çıkarsa elle eklenir.
 */
export type MusteriUlkesi = { ad: string; konum: [number, number]; firma: number };

export const MUSTERI_ULKELERI: MusteriUlkesi[] = [
  { ad: "Türkiye", konum: [39.0, 35.0], firma: 4933 },
  { ad: "Almanya", konum: [51.16, 10.45], firma: 33 },
  { ad: "Fransa", konum: [46.6, 1.89], firma: 6 },
  { ad: "Hollanda", konum: [52.13, 5.29], firma: 6 },
  { ad: "Belçika", konum: [50.5, 4.47], firma: 3 },
  { ad: "Irak", konum: [33.22, 43.68], firma: 3 },
  { ad: "ABD", konum: [39.83, -98.58], firma: 2 },
  { ad: "Romanya", konum: [45.94, 24.97], firma: 2 },
  { ad: "Afganistan", konum: [33.94, 67.71], firma: 1 },
  { ad: "Azerbaycan", konum: [40.14, 47.58], firma: 1 },
  { ad: "Bosna Hersek", konum: [43.92, 17.68], firma: 1 },
  { ad: "Polonya", konum: [51.92, 19.15], firma: 1 },
  { ad: "Kazakistan", konum: [48.02, 66.92], firma: 1 },
  { ad: "BAE", konum: [23.42, 53.85], firma: 1 },
];
