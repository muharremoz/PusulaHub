-- 2026-04-22: per-app "viewer" rolü kaldırıldı → "user"'a düşür.
-- UserApps.Role CHECK constraint 'admin'/'user'/'viewer' ise constraint'i de güncellemek gerekebilir.

UPDATE dbo.UserApps SET [Role] = 'user' WHERE [Role] = 'viewer';

-- CHECK constraint güncellemesi (varsa). Constraint ismi ortama göre değişebilir —
-- önce sys.check_constraints'ten bul, sonra drop/add:
DECLARE @cname NVARCHAR(200)
SELECT @cname = cc.name
FROM   sys.check_constraints cc
JOIN   sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
WHERE  cc.parent_object_id = OBJECT_ID('dbo.UserApps') AND c.name = 'Role'

IF @cname IS NOT NULL
BEGIN
  EXEC('ALTER TABLE dbo.UserApps DROP CONSTRAINT ' + @cname)
END

ALTER TABLE dbo.UserApps
  ADD CONSTRAINT CK_UserApps_Role CHECK ([Role] IN ('admin','user'))
