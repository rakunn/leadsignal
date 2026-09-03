-- Freeze the historical HQ definition here; applied migrations must not depend
-- on future TypeScript scoring rules. This update is idempotent in values.
UPDATE rollups AS r
SET hq_revenue_cents = COALESCE((
  SELECT SUM(l.revenue_cents)
  FROM leads AS l
  WHERE l.dataset_id = r.dataset_id
    AND (l.created_at AT TIME ZONE 'UTC')::date = r.day
    AND l.composite_score >= 70
    AND l.segment <> 'suppress'
    AND CASE r.dimension
      WHEN 'campaign' THEN l.campaign
      WHEN 'ad_set' THEN l.ad_set
      WHEN 'creative' THEN l.creative
      WHEN 'platform' THEN l.platform
      WHEN 'landing_page' THEN l.landing_page
    END = r.dimension_value
), 0);
