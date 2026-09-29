-- One-time prototype reset requested on 2026-09-28. Clerk-linked identities
-- and staff roles remain; all participant activity starts fresh.
DELETE FROM document_recipients;
DELETE FROM tasks;
DELETE FROM messages;
DELETE FROM service_requests;
DELETE FROM audit_events;
DELETE FROM documents;
DELETE FROM threads;
DELETE FROM transaction_participants;
DELETE FROM transactions;
