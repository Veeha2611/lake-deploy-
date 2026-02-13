-- SSOT-ready Gaiia subscriptions/services (derived from GraphQL billing subscriptions + products)
CREATE OR REPLACE VIEW curated_core.gaiia_subscriptions_services_current AS
SELECT
  s.id AS subscription_id,
  s.status AS subscription_status,
  s.quantity,
  s.priceoverrideincents,
  s.priceoverridereason,
  s.assignedat,
  s.activatedat,
  s.suspendedat,
  s.unassignedat,
  s.unassignat,
  s.startsat,
  s.expiresat,
  s.createdat,
  s.updatedat,
  s.productversion.id AS product_version_id,
  s.bundle.id AS bundle_id,
  s.bundleassignationid,
  s.invoicenameoverride,
  s.invoicedescriptionoverride,
  p.id AS product_id,
  p.slug AS product_slug,
  p.name AS product_name,
  p.description AS product_description,
  p.type AS product_type,
  p.productcategory.id AS product_category_id,
  p.generalledgercode AS product_gl_code,
  p.rawspecificationvalue.uploadspeedinkbps AS upload_speed_kbps,
  p.rawspecificationvalue.downloadspeedinkbps AS download_speed_kbps,
  s.tenant,
  s.dt,
  s._fetched_at
FROM curated_core.gaiia_billing_subscriptions_current s
LEFT JOIN curated_core.gaiia_products_current p
  ON p.primaryproductversion.id = s.productversion.id
 AND p.tenant = s.tenant;

CREATE OR REPLACE VIEW curated_recon.gaiia_subscriptions_services_exceptions AS
SELECT
  CASE
    WHEN subscription_id IS NULL OR subscription_id = '' THEN 'missing_subscription_id'
    WHEN product_version_id IS NULL OR product_version_id = '' THEN 'missing_product_version_id'
    WHEN tenant IS NULL OR tenant = '' THEN 'missing_tenant'
    ELSE 'other'
  END AS reason_code,
  *
FROM curated_core.gaiia_subscriptions_services_current
WHERE subscription_id IS NULL OR subscription_id = ''
   OR product_version_id IS NULL OR product_version_id = ''
   OR tenant IS NULL OR tenant = '';
