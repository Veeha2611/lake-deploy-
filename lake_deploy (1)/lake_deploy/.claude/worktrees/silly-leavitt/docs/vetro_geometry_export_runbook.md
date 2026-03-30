## Vetro Geometry Extract Guide

### 1. Data Source
- `vetro_raw_db.vetro_raw_json_lines` stores each export line as a JSON array inside `raw_line`.
- Use `CROSS JOIN UNNEST(CAST(json_parse(raw_line) AS array(json))) AS t(f)` to yield each GeoJSON feature along with its `$.geometry` and `$.properties`.

### 2. Curated Views
- **Point layers:** Filter `geom_type = 'Point'`, derive latitude/longitude from `geometry.coordinates`, and coalesce identifiers from `properties.ID` variants.
- **Line layers:** Filter on `geom_type IN ('LineString','MultiLineString')`, keep the geometry JSON, and assign a `layer_key` (e.g., aerial/underground/mixed or owner-based) for downstream rendering.
- **Polygon layers:** Similar pattern for `Polygon`/`MultiPolygon` features for area overlays.

### 3. SQL Pattern
- Use a reusable `features` CTE that explodes the JSON array once.
- Apply consistent type checks (numeric coordinates, non-null IDs) and limit results to 2000 rows per query so the downstream UI stays responsive.

### 4. Sharing Protocol
- Capture Athena execution IDs and generated SQL for each view and log them alongside the curated view definitions.
- When handing this off:
  * Provide the view names (points, lines, polygons).
  * Document the base explode strategy (`vetro_raw_db.vetro_raw_json_lines` → `features`).
  * Mention any row limits or guardrail-safe field names.
  * Reference the target S3/Glue objects so the next chat can verify the data.

Update this guide whenever the view names, logic, or target tables change so it remains the canonical reference for Vet‌ro geometry exports.
