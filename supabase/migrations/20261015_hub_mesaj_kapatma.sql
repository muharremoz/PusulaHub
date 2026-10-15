-- Mesaj penceresini X ile (ya da süre dolunca) kapatma — 15.10.2026.
--
-- Yeni WebView2 popup'ında "Okudum" dışında X ile çıkılabiliyor; eskiden bu ACK göndermiyordu,
-- kullanıcı "İletildi"de kalıyordu. Artık popup ACK msgId'sine "~k" ekler (apps/web/src/lib/anket.ts
-- ackAyir), poller alıcıyı status='closed' + closed_at yapar. read_count ARTMAZ.
-- Sonradan okudum gelirse (ör. ikinci pencere) status 'read' olur, closed_at kalır.

alter table hub.message_recipients add column if not exists closed_at timestamptz;
