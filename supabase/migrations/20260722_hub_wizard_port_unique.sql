-- Port tahsisinde race-safe insert için UNIQUE(port_range_id, port).
-- setup/run allocatePort: aynı anda iki kurulum aynı portu almaya çalışırsa
-- ikincisi UNIQUE ihlaliyle düşer, kod bir sonraki portu dener.
create unique index if not exists wpa_range_port_uq
  on hub.wizard_port_assignments (port_range_id, port);
