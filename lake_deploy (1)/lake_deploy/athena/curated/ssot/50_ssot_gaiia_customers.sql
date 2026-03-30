-- SSOT-ready Gaiia customers (derived from GraphQL accounts current)
CREATE OR REPLACE VIEW curated_core.gaiia_customers_current AS
SELECT
  id AS gaiia_account_id,
  readableid AS gaiia_readable_id,
  name,
  displayname,
  COALESCE(name, displayname) AS account_name,
  primarycontact.id AS primarycontact_id,
  status.id AS status_id,
  type.id AS type_id,
  internetprovider,
  physicaladdress.id AS physicaladdress_id,
  mailingaddress.id AS mailingaddress_id,
  clientportaluser.id AS clientportaluser_id,
  customfields.platid AS plat_id,
  customfields.vetroid AS vetro_id,
  customfields.dropactive AS drop_active,
  customfields.leadsource AS lead_source,
  customfields.salesperson AS salesperson,
  customfields.systemid AS system_id,
  activationdate,
  deactivationdate,
  createdat,
  updatedat,
  tenant,
  dt,
  _fetched_at
FROM curated_core.gaiia_accounts_current;

CREATE OR REPLACE VIEW curated_recon.gaiia_customers_exceptions AS
SELECT
  CASE
    WHEN gaiia_account_id IS NULL OR gaiia_account_id = '' THEN 'missing_account_id'
    WHEN account_name IS NULL OR account_name = '' THEN 'missing_name'
    WHEN tenant IS NULL OR tenant = '' THEN 'missing_tenant'
    ELSE 'other'
  END AS reason_code,
  *
FROM curated_core.gaiia_customers_current
WHERE gaiia_account_id IS NULL OR gaiia_account_id = ''
   OR account_name IS NULL OR account_name = ''
   OR tenant IS NULL OR tenant = '';
