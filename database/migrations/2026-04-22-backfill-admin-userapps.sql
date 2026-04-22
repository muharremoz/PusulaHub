-- ============================================================================
-- Admin kullanicilarin UserApps satirlarini backfill eder.
-- ============================================================================
-- Onceki surum `userCanAccessApp` icinde admin icin short-circuit yapiyordu
-- (admin => tum app'lere erisim). Per-app rol modelinde bu kaldirildi; admin
-- kullanicilarin da Apps'teki tum aktif app'ler icin UserApps satirina ihtiyaci
-- var. Bu migration eksik satirlari ekler.
-- ============================================================================

INSERT INTO dbo.UserApps (UserId, AppId, [Role])
SELECT u.Id, a.Id, 'admin'
FROM dbo.AppUsers u
CROSS JOIN dbo.Apps a
WHERE u.[Role] = 'admin'
  AND a.IsActive = 1
  AND NOT EXISTS (
    SELECT 1 FROM dbo.UserApps ua
    WHERE ua.UserId = u.Id AND ua.AppId = a.Id
  );

DECLARE @added INT = @@ROWCOUNT;
PRINT CONCAT('Admin kullanicilara ', @added, ' UserApps satiri backfill edildi.');
