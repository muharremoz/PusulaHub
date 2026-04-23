-- Pusula Kur - 5 upstream için keyword monitor ekle.
-- Her biri /health endpoint'ini çağırır ve JSON yanıtında kaynağa özel
-- "status":"ok" pattern'ini arar. Upstream down olursa o kaynağın
-- pattern'i yanıttan kaybolur → keyword bulunamaz → monitor DOWN.

INSERT INTO monitor (name, active, user_id, interval, url, type, weight,
                     keyword, maxretries, ignore_tls, upside_down, maxredirects,
                     accepted_statuscodes_json, dns_resolve_type, dns_resolve_server,
                     retry_interval, method, expiry_notification, packet_size,
                     http_body_encoding, invert_keyword, timeout, grpc_enable_tls,
                     gamedig_given_port_only, kafka_producer_ssl,
                     kafka_producer_allow_auto_topic_creation,
                     kafka_producer_brokers, kafka_producer_sasl_options,
                     oauth_auth_method)
VALUES
  ('Döviz - Datshop',      1, 1, 60, 'http://10.15.2.6:8080/health', 'keyword', 2000,
   '"datshop":{"status":"ok"',     2, 0, 0, 10,
   '["200-299"]', 'A', '1.1.1.1',
   60, 'GET', 0, 56,
   'json', 0, 48.0, 0, 1, 0, 0,
   '[]', '{"mechanism":"None"}', 'client_secret_basic'),

  ('Döviz - Ozankur',      1, 1, 60, 'http://10.15.2.6:8080/health', 'keyword', 2000,
   '"ozankur":{"status":"ok"',     2, 0, 0, 10,
   '["200-299"]', 'A', '1.1.1.1',
   60, 'GET', 0, 56,
   'json', 0, 48.0, 0, 1, 0, 0,
   '[]', '{"mechanism":"None"}', 'client_secret_basic'),

  ('Döviz - Altınkaynak',  1, 1, 60, 'http://10.15.2.6:8080/health', 'keyword', 2000,
   '"altinkaynak":{"status":"ok"', 2, 0, 0, 10,
   '["200-299"]', 'A', '1.1.1.1',
   60, 'GET', 0, 56,
   'json', 0, 48.0, 0, 1, 0, 0,
   '[]', '{"mechanism":"None"}', 'client_secret_basic'),

  ('Döviz - TCMB',         1, 1, 60, 'http://10.15.2.6:8080/health', 'keyword', 2000,
   '"tcmb":{"status":"ok"',        2, 0, 0, 10,
   '["200-299"]', 'A', '1.1.1.1',
   60, 'GET', 0, 56,
   'json', 0, 48.0, 0, 1, 0, 0,
   '[]', '{"mechanism":"None"}', 'client_secret_basic'),

  ('Döviz - Pusula',       1, 1, 60, 'http://10.15.2.6:8080/health', 'keyword', 2000,
   '"pusula":{"status":"ok"',      2, 0, 0, 10,
   '["200-299"]', 'A', '1.1.1.1',
   60, 'GET', 0, 56,
   'json', 0, 48.0, 0, 1, 0, 0,
   '[]', '{"mechanism":"None"}', 'client_secret_basic');

-- 5 yeni monitor'ü Telegram notification'a bağla (notification id=1)
INSERT INTO monitor_notification (monitor_id, notification_id)
SELECT id, 1 FROM monitor WHERE name LIKE 'Döviz - %';

-- Özet
SELECT id, name, type, keyword FROM monitor WHERE name LIKE 'Döviz - %';
