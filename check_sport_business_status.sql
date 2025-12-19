-- Query pentru a verifica statusul business-ului sport@voob.io
SELECT 
  id, 
  name, 
  domain, 
  email,
  status, 
  "businessType",
  "createdAt",
  "updatedAt"
FROM "Business" 
WHERE 
  domain = 'sport-outdoor-center' 
  OR email = 'contact@sportoutdoor.ro'
  OR id IN (
    SELECT "ownerId" FROM "Business" WHERE domain = 'sport-outdoor-center'
  );
