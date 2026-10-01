/**
 * Firma seçicilerinde arama + sıralama — en yakın eşleşme üstte:
 * no birebir → no ile başlayan → ad ile başlayan → no içeren → ad içeren.
 * Eşit puanda kısa numara önce, sonra numerik sıra (346 < 1346 < 3346).
 * Combobox'a `.slice(limit)` ile verilir (cmdk büyük listede yavaşlar).
 */
export function firmaAra<T>(
  liste: readonly T[],
  arama: string,
  kod: (t: T) => string,
  ad: (t: T) => string,
  limit = 50,
): T[] {
  const q = arama.trim().toLocaleLowerCase("tr-TR")
  if (!q) return liste.slice(0, limit)
  const puan = (t: T) => {
    const k = (kod(t) ?? "").toLocaleLowerCase("tr-TR")
    const a = (ad(t) ?? "").toLocaleLowerCase("tr-TR")
    if (k === q) return 0
    if (k.startsWith(q)) return 1
    if (a.startsWith(q)) return 2
    if (k.includes(q)) return 3
    if (a.includes(q)) return 4
    return -1
  }
  return liste
    .map((t) => ({ t, p: puan(t), k: kod(t) ?? "" }))
    .filter((x) => x.p >= 0)
    .sort((x, y) => x.p - y.p || x.k.length - y.k.length || x.k.localeCompare(y.k, "tr", { numeric: true }))
    .slice(0, limit)
    .map((x) => x.t)
}
