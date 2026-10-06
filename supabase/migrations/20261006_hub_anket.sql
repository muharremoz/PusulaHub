-- Anket: soruları olan mesaj.
--
-- messages.survey             → {"sorular":[{id,tip,soru,secenekler?,zorunlu}]}  (null = düz mesaj)
-- message_recipients.answers  → {"s1":"Memnunum","s2":4,...}  (kullanıcının cevabı; okundu ile birlikte gelir)
--
-- Cevap agent'ın ACK kanalından döner (msgId + "~a~" + base64url JSON) — bkz. apps/web/src/lib/anket.ts.

alter table hub.messages           add column if not exists survey  jsonb;
alter table hub.message_recipients add column if not exists answers jsonb;
