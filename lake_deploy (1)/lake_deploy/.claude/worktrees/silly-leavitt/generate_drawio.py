"""
Generate draw.io XML: Current State + Future State Architecture Diagrams
OnPoint Insights – lake_deploy Data Lake Platform

Uses FLAT cell layout (no swimlane parent nesting) to ensure maximum
compatibility with draw.io desktop and app.diagrams.net.
"""

from xml.dom import minidom
import xml.etree.ElementTree as ET

# ─────────────────────────────────────────────────────────────────────────────
# ID counter (simple global)
# ─────────────────────────────────────────────────────────────────────────────
_ID = 100
def nid(prefix="cell"):
    global _ID
    _ID += 1
    return f"{prefix}_{_ID}"


# ─────────────────────────────────────────────────────────────────────────────
# LOW-LEVEL HELPERS  – all cells go into a flat list, parent is always "1"
# ─────────────────────────────────────────────────────────────────────────────

def vertex(cells, id, label, x, y, w, h, style):
    """Append a vertex mxCell to cells list."""
    c = {
        "id": str(id), "value": label, "style": style,
        "vertex": "1", "parent": "1"
    }
    cells.append(("vertex", c, x, y, w, h))


def edge(cells, id, src, tgt, label="", style=""):
    """Append an edge mxCell to cells list."""
    c = {
        "id": str(id), "value": label, "style": style,
        "edge": "1", "source": str(src), "target": str(tgt), "parent": "1"
    }
    cells.append(("edge", c))


def build_xml(cells):
    """Convert cell list to mxGraphModel XML element."""
    model = ET.Element("mxGraphModel", {
        "dx": "1422", "dy": "762", "grid": "1", "gridSize": "10",
        "guides": "1", "tooltips": "1", "connect": "1", "arrows": "1",
        "fold": "1", "page": "1", "pageScale": "1",
        "pageWidth": "4000", "pageHeight": "5800",
        "math": "0", "shadow": "0"
    })
    root_el = ET.SubElement(model, "root")
    ET.SubElement(root_el, "mxCell", {"id": "0"})
    ET.SubElement(root_el, "mxCell", {"id": "1", "parent": "0"})

    for item in cells:
        if item[0] == "vertex":
            _, attrs, x, y, w, h = item
            cell_el = ET.SubElement(root_el, "mxCell", attrs)
            ET.SubElement(cell_el, "mxGeometry", {
                "x": str(x), "y": str(y),
                "width": str(w), "height": str(h),
                "as": "geometry"
            })
        elif item[0] == "edge":
            _, attrs = item
            cell_el = ET.SubElement(root_el, "mxCell", attrs)
            geo = ET.SubElement(cell_el, "mxGeometry", {"relative": "1", "as": "geometry"})

    return model


# ─────────────────────────────────────────────────────────────────────────────
# STYLE BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def s_box(fill, stroke, fontcolor="#000000", fontsize=10, bold=False, italic=False, rounded=1, align="center", valign="middle"):
    fs = (1 if bold else 0) + (2 if italic else 0)
    return (f"rounded={rounded};whiteSpace=wrap;html=1;fillColor={fill};"
            f"strokeColor={stroke};fontSize={fontsize};fontStyle={fs};"
            f"fontColor={fontcolor};verticalAlign={valign};align={align};strokeWidth=1.5;")

def s_header(fill, stroke, fontcolor="#ffffff", fontsize=12):
    return (f"rounded=1;whiteSpace=wrap;html=1;fillColor={fill};"
            f"strokeColor={stroke};fontSize={fontsize};fontStyle=1;"
            f"fontColor={fontcolor};verticalAlign=middle;align=center;strokeWidth=2;")

def s_lane(fill, stroke, fontcolor, fontsize=11):
    """Column background band."""
    return (f"rounded=1;whiteSpace=wrap;html=1;fillColor={fill};"
            f"strokeColor={stroke};fontSize={fontsize};fontStyle=1;"
            f"fontColor={fontcolor};verticalAlign=top;align=center;strokeWidth=2;arcSize=2;")

def s_arrow(color="#555555", dashed=False, thick=False):
    dash = "dashed=1;dashPattern=8 4;" if dashed else "dashed=0;"
    w = "3" if thick else "2"
    return (f"edgeStyle=orthogonalEdgeStyle;html=1;{dash}"
            f"strokeColor={color};strokeWidth={w};rounded=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;"
            f"entryX=0;entryY=0.5;entryDx=0;entryDy=0;")

def s_arrow_lr(color="#555555", dashed=False, thick=False):
    dash = "dashed=1;dashPattern=8 4;" if dashed else "dashed=0;"
    w = "3" if thick else "2"
    return (f"edgeStyle=orthogonalEdgeStyle;html=1;{dash}"
            f"strokeColor={color};strokeWidth={w};rounded=1;")


# ─────────────────────────────────────────────────────────────────────────────
# SHORTHAND HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def add_box(cells, id, label, x, y, w, h,
            fill="#dae8fc", stroke="#6c8ebf",
            fontcolor="#000000", fontsize=10, bold=False):
    vertex(cells, id, label, x, y, w, h,
           s_box(fill, stroke, fontcolor, fontsize, bold))

def add_header(cells, id, label, x, y, w, h,
               fill="#1a237e", stroke="#0d0d4f",
               fontcolor="#ffffff", fontsize=14):
    vertex(cells, id, label, x, y, w, h,
           s_header(fill, stroke, fontcolor, fontsize))

def add_lane(cells, id, label, x, y, w, h, fill, stroke, fontcolor):
    vertex(cells, id, label, x, y, w, h,
           s_lane(fill, stroke, fontcolor))

def add_note(cells, id, label, x, y, w, h):
    style = ("shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=15;"
             "fillColor=#fff9c4;strokeColor=#f0c000;fontSize=9;fontColor=#333;")
    vertex(cells, id, label, x, y, w, h, style)

def add_arrow(cells, id, src, tgt, label="", color="#555", dashed=False, thick=False):
    edge(cells, id, src, tgt, label, s_arrow(color, dashed, thick))

def add_arrow_lr(cells, id, src, tgt, label="", color="#555", dashed=False, thick=False):
    edge(cells, id, src, tgt, label, s_arrow_lr(color, dashed, thick))

def html(s):
    """Convert newlines to <br> for html=1 labels."""
    return s.replace("\n", "<br>")


# ─────────────────────────────────────────────────────────────────────────────
# CURRENT STATE
# ─────────────────────────────────────────────────────────────────────────────

def current_state(cells):
    OX, OY = 40, 40

    # ── Title ─────────────────────────────────────────────────────────────────
    add_header(cells, "CS_TITLE",
        html("🏗️  CURRENT STATE ARCHITECTURE\nOnPoint Insights – lake_deploy Data Lake Platform"),
        OX, OY, 3360, 55, fill="#1a237e", stroke="#0d0d4f", fontcolor="#ffffff", fontsize=16)

    # ── Stats bar ─────────────────────────────────────────────────────────────
    stats = [("5","Data Sources"),("20+","Raw Tables"),("109","Curated Entities"),
             ("92%","Virtual Views ⚠️"),("18","Physical SSOT Tables"),("3","Tenants")]
    sx = OX + 5
    for v, l in stats:
        add_box(cells, f"CS_STAT_{l[:8].replace(' ','_')}",
                f"<b><font style='font-size:16px'>{v}</font></b><br><font style='font-size:9px'>{l}</font>",
                sx, OY+60, 550, 50, fill="#283593", stroke="#1a237e", fontcolor="#ffffff")
        sx += 555

    # ── Column background bands ────────────────────────────────────────────────
    COL_TOP   = OY + 120
    COL_H     = 1960
    col_cfg = [
        (OX,        480, "DATA SOURCES",                          "#e3f2fd","#1565c0","#0d47a1"),
        (OX+500,    470, "INGESTION SERVICES (AWS)",              "#f3e5f5","#6a1b9a","#4a148c"),
        (OX+990,    580, "RAW LAYER  (S3 + Glue + Athena)",       "#e8f5e9","#2e7d32","#1b5e20"),
        (OX+1590,   620, "CURATED LAYER  (92% Virtual Views ⚠️)", "#fff8e1","#e65100","#bf360c"),
        (OX+2230,   1170,"SSOT LAYER  (18 Physical Tables)",      "#fce4ec","#880e4f","#6a1527"),
    ]
    col_x = []
    for cx, cw, lbl, fill, stroke, fc in col_cfg:
        add_lane(cells, f"CS_LANE_{lbl[:6].replace(' ','_')}", lbl, cx, COL_TOP, cw, COL_H,
                 fill, stroke, fc)
        col_x.append((cx, cw))

    # ═══════════════════════════════════════════════════════
    # COLUMN 0 – DATA SOURCES
    # ═══════════════════════════════════════════════════════
    sx0, sw0 = col_x[0]
    sy = COL_TOP + 48

    sources = [
        ("CS_SRC_GAIIA",    "🔷 <b>Gaiia</b>",
         "GraphQL API | Daily Lambda<br>Entities: accounts, customers, invoices,<br>subscriptions, products, tickets, work orders<br>Multi-tenant ✅ (gwi | lymefiber | dvfiber)",
         "#bbdefb","#1565c0"),
        ("CS_SRC_VETRO",    "🗺️ <b>VETRO</b>",
         "REST API | Daily Lambda<br>Network plans, GIS layers, passings<br>Rate-limited (429 backoff)<br>GWI-only ⚠️  Multi-tenant: NOT YET",
         "#bbdefb","#1565c0"),
        ("CS_SRC_PLATT",    "📄 <b>Platt</b>",
         "Pipe-delimited CSV extract<br>Billing, subscribers, rate codes<br>Manual S3 upload<br>Fragile (embedded pipes ⚠️)",
         "#c8e6c9","#2e7d32"),
        ("CS_SRC_INTACCT",  "📊 <b>Intacct</b>",
         "SOAP/XML + JSON | ECS Task<br>GL entries, AP/AR, vendors<br>24-month mirror: PASS ✅<br>Full-history mirror: FAIL ❌",
         "#d1c4e9","#4527a0"),
        ("CS_SRC_SF",       "☁️ <b>Salesforce</b>",
         "AWS AppFlow (console-only ⚠️)<br>Accounts, Opportunities<br>Daily schedule<br>NOT in IaC ❌",
         "#ffccbc","#bf360c"),
    ]
    src_ids = {}
    for sid, title, desc, fill, stroke in sources:
        lbl = f"{title}<br><font style='font-size:9px'>{desc}</font>"
        add_box(cells, sid, lbl, sx0+15, sy, sw0-30, 145, fill, stroke, fontcolor="#1a1a1a")
        src_ids[sid] = sy
        sy += 160

    # ═══════════════════════════════════════════════════════
    # COLUMN 1 – INGESTION SERVICES
    # ═══════════════════════════════════════════════════════
    sx1, sw1 = col_x[1]
    iy = COL_TOP + 48

    ingestion = [
        ("CS_ING_GAIIA",
         "⚡ <b>Lambda: gaiia_ingest</b>",
         "EventBridge daily schedule<br>GraphQL query registry (S3 JSON)<br>Secrets Manager: X-Gaiia-Api-Key<br>IaC: gaiia_ingest_stack.yaml ✅",
         "#e1bee7","#6a1b9a"),
        ("CS_ING_VETRO",
         "⚡ <b>Lambda: vetro_export</b>",
         "EventBridge daily schedule<br>Rate-limit 429 backoff<br>State: plan_index.json (S3) ⚠️<br>SQS DLQ (not alarmed ⚠️)",
         "#e1bee7","#6a1b9a"),
        ("CS_ING_PLATT",
         "🗂️ <b>Manual Upload + Glue</b>",
         "Manual CSV → S3<br>Glue Crawler: raw_platt<br>NOT in IaC ⚠️<br>No schema validation ⚠️",
         "#c8e6c9","#2e7d32"),
        ("CS_ING_INTACCT",
         "🐳 <b>ECS Task: intacct_ingest</b>",
         "EventBridge schedule<br>SOAP/XML → S3 cursor<br>IaC: intacct_ecs_stack.yaml ✅<br>Cursor: file-based ⚠️",
         "#d1c4e9","#4527a0"),
        ("CS_ING_SF",
         "🔄 <b>AWS AppFlow</b>",
         "Console-deployed ONLY ⚠️<br>Salesforce → S3 daily<br>NOT in CloudFormation ❌<br>Single GWI connection only",
         "#ffccbc","#bf360c"),
    ]
    ing_ids = {}
    for iid, title, desc, fill, stroke in ingestion:
        lbl = f"{title}<br><font style='font-size:9px'>{desc}</font>"
        add_box(cells, iid, lbl, sx1+15, iy, sw1-30, 145, fill, stroke, fontcolor="#1a1a1a")
        ing_ids[iid] = iy
        iy += 160

    # EventBridge + Secrets banner
    add_box(cells, "CS_AWS_CORE",
            "🔐 <b>AWS Core Services</b><br>"
            "<font style='font-size:9px'>"
            "Secrets Manager (API keys)<br>"
            "EventBridge (schedules)<br>"
            "CloudWatch (basic logs only ⚠️)<br>"
            "No SLA alarms configured ⚠️</font>",
            sx1+15, iy+20, sw1-30, 110,
            fill="#ede7f6", stroke="#4527a0", fontcolor="#1a1a1a")

    # ═══════════════════════════════════════════════════════
    # COLUMN 2 – RAW LAYER
    # ═══════════════════════════════════════════════════════
    sx2, sw2 = col_x[2]
    ry = COL_TOP + 48

    # S3 bucket label
    add_box(cells, "CS_S3_HDR",
            "🪣 <b>s3://gwi-raw-us-east-2-pc/</b><br>"
            "<font style='font-size:9px'>Single bucket: raw/ + curated/ + ssot/ + orchestration/</font>",
            sx2+10, ry, sw2-20, 48, fill="#a5d6a7", stroke="#2e7d32", fontcolor="#1a2e1a")
    ry += 56

    raw_tables = [
        ("CS_RAW_GAIIA",
         "📁 <b>raw_gaiia.*</b>",
         "raw/gaiia/graphql/&lt;entity&gt;/<br>tenant=&lt;gwi|lymefiber|dvfiber&gt;/dt=YYYY-MM-DD/<br>Format: NDJSON | Glue Crawler ✅<br>DB: raw_gaiia",
         "#c8e6c9","#2e7d32"),
        ("CS_RAW_VETRO",
         "📁 <b>raw_vetro.*</b>",
         "raw/vetro/plan_id=&lt;ID&gt;/dt=YYYY-MM-DD/<br>raw/vetro_layers/dt=YYYY-MM-DD/<br>Format: GeoJSON/CSV | DB: raw_vetro<br>State: plan_index.json ⚠️",
         "#c8e6c9","#2e7d32"),
        ("CS_RAW_PLATT",
         "📁 <b>raw_platt.*</b>",
         "raw/platt/customer/ iheader/ idetail/<br>billing/ custrate/ *_history/<br>Format: Pipe-CSV | DB: raw_platt<br>Glue Crawler (console ⚠️)",
         "#c8e6c9","#2e7d32"),
        ("CS_RAW_INTACCT",
         "📁 <b>raw_intacct.*</b>",
         "raw/intacct_xml/&lt;entity&gt;/YYYY-MM-DD/<br>raw/intacct_json/gl_entries/run_date=<br>Format: XML + JSON | DB: raw_intacct<br>24-month validated ✅",
         "#c8e6c9","#2e7d32"),
        ("CS_RAW_SF",
         "📁 <b>raw_salesforce.*</b>",
         "raw/salesforce_prod_appflow/<br>account/ + opportunity/<br>Partition: year=/month=/day= ⚠️<br>DB: raw_salesforce",
         "#c8e6c9","#2e7d32"),
    ]
    raw_ids = {}
    for rid, title, desc, fill, stroke in raw_tables:
        lbl = f"{title}<br><font style='font-size:9px'>{desc}</font>"
        add_box(cells, rid, lbl, sx2+10, ry, sw2-20, 133, fill, stroke, fontcolor="#1a1a1a")
        raw_ids[rid] = ry
        ry += 148

    # Glue + state note
    add_note(cells, "CS_STATE_NOTE",
             "⚠️ State files (S3)\nplan_index.json\nbackfill_queue.json\n→ Fragile! Full restart\n   if deleted.",
             sx2+10, ry+8, 170, 100)
    add_box(cells, "CS_GLUE_HDR",
            "🔍 <b>Glue Data Catalog</b><br>"
            "<font style='font-size:9px'>Crawlers (console-deployed ⚠️ Not IaC)<br>"
            "Partition projection: dt=, plan_id=<br>"
            "Schema discovery → Athena DDL</font>",
            sx2+190, ry+8, sw2-200, 100,
            fill="#a5d6a7", stroke="#2e7d32", fontcolor="#1a1a1a")

    # ═══════════════════════════════════════════════════════
    # COLUMN 3 – CURATED LAYER
    # ═══════════════════════════════════════════════════════
    sx3, sw3 = col_x[3]
    cy = COL_TOP + 48

    # Warning box
    add_box(cells, "CS_CUR_WARN",
            "⚠️ <b>92% VIRTUAL — NO PHYSICAL STORAGE</b><br>"
            "<font style='font-size:9px'>"
            "Every query triggers full raw S3 scan<br>"
            "Cost: $0.05–$0.25 / query | Latency: 15–60s p95<br>"
            "5 concurrent users = 5× parallel full scans<br>"
            "Deepest view chain: 3 levels deep</font>",
            sx3+10, cy, sw3-20, 75,
            fill="#d32f2f", stroke="#b71c1c", fontcolor="#ffffff", bold=True)
    cy += 85

    curated = [
        ("CS_CUR_GAIIA",
         "🔷 <b>Gaiia Curated</b>",
         "gaiia_accounts_current (VIEW)<br>gaiia_customers_curated_raw (PHYS)<br>gaiia_invoices_curated_raw (PHYS)<br>gaiia_subscriptions_current (VIEW)<br>gaiia_billing_subscriptions_current (VIEW)<br>gaiia_products_current (VIEW)",
         "#fff9c4","#f9a825"),
        ("CS_CUR_VETRO",
         "🗺️ <b>Vetro Curated</b>",
         "v_vetro_plans_as_built (VIEW, phase_id=3)<br>v_vetro_passings_by_plan (VIEW)<br>v_vetro_service_locations (VIEW)<br>v_vetro_network_map_layers_v1 (VIEW)<br>vetro_plan_map (PHYSICAL)",
         "#fff9c4","#f9a825"),
        ("CS_CUR_PLATT",
         "📄 <b>Platt Curated</b>",
         "platt_customer_current (VIEW)<br>platt_billing_summary (PHYSICAL)<br>v_monthly_revenue_platt_long (VIEW)<br>invoice_line_item_repro_v1 (VIEW)",
         "#fff9c4","#f9a825"),
        ("CS_CUR_INTACCT",
         "📊 <b>Intacct Curated</b>",
         "intacct_gl_entries_current (VIEW)<br>intacct_gl_entries_current_ssot (VIEW)<br>Joined: COA + Sage dimensions<br>curated_finance.*",
         "#fff9c4","#f9a825"),
        ("CS_CUR_SF",
         "☁️ <b>Salesforce Curated</b>",
         "salesforce_account_current (VIEW)<br>salesforce_opportunity_current (VIEW)<br>projects_enriched (VIEW — blended)<br>customers_spine (VIEW — partial)",
         "#fff9c4","#f9a825"),
        ("CS_CUR_XW",
         "🔗 <b>Cross-Source Reconciliation</b>",
         "sf_account_to_intacct_customer_final<br>sf_intacct_crosswalk_gaps<br>gaiia_customers_exceptions<br>vetro_network_alias_override<br>dq_run_log (PHYSICAL)",
         "#ffe0b2","#e65100"),
    ]
    cur_ids = {}
    for cid, title, desc, fill, stroke in curated:
        lbl = f"{title}<br><font style='font-size:9px'>{desc}</font>"
        add_box(cells, cid, lbl, sx3+10, cy, sw3-20, 143, fill, stroke, fontcolor="#1a1a1a")
        cur_ids[cid] = cy
        cy += 158

    # ═══════════════════════════════════════════════════════
    # COLUMN 4 – SSOT LAYER
    # ═══════════════════════════════════════════════════════
    sx4, sw4 = col_x[4]
    half = (sw4-30)//2 - 5

    sy4 = COL_TOP + 48

    # Cert status header
    add_box(cells, "CS_SSOT_HDR",
            "📋 <b>Certification Status  (2026-02-16)</b><br>"
            "<font style='font-size:9px'>"
            "Platt mirror: PASS ✅ | Intacct 24-month: PASS ✅<br>"
            "Intacct full-history: FAIL ❌ | SF crosswalk: CONDITIONAL ⚠️<br>"
            "Ownership bucket parity: FAIL ❌ | Finance KPI: PASS ✅</font>",
            sx4+10, sy4, sw4-20, 72,
            fill="#880e4f", stroke="#6a1527", fontcolor="#ffffff")
    sy4 += 82

    # Dim tables (left column) + Xwalk tables (right column)
    dims = [
        ("CS_DIM_ACCT",  "dim_account",   "SF primary\nCONDITIONAL ⚠️\n(non-1:1 crosswalk)",  "#f8bbd0","#880e4f"),
        ("CS_DIM_LOC",   "dim_location",  "Vetro + Gaiia\nService Locations / NAPs\nDEGRADED ⚠️", "#f8bbd0","#880e4f"),
        ("CS_DIM_ASSET", "dim_asset",     "Vetro primary\nNetwork Elements\nDEGRADED ⚠️",      "#f8bbd0","#880e4f"),
        ("CS_DIM_PROD",  "dim_product",   "SF / Vetro / Platt\nService Offerings\nPARTIAL ⚠️",  "#f8bbd0","#880e4f"),
        ("CS_DIM_INV",   "dim_invoice",   "Intacct primary\nFinancial Invoices\nPASS ✅",       "#c8e6c9","#2e7d32"),
        ("CS_DIM_PAY",   "dim_payment",   "Intacct primary\nPayments Received\nPASS ✅",        "#c8e6c9","#2e7d32"),
        ("CS_DIM_TICK",  "dim_ticket",    "Gaiia primary\nSupport Tickets\nCONDITIONAL ⚠️",    "#f8bbd0","#880e4f"),
    ]
    xwalks = [
        ("CS_XW_ACCT",  "xwalk_account",  "SF ID ↔ Platt ID\n↔ Intacct ID"),
        ("CS_XW_LOC",   "xwalk_location", "Vetro ↔ Platt\n↔ Gaiia site"),
        ("CS_XW_ASSET", "xwalk_asset",    "Vetro asset\n↔ NetBox ID"),
        ("CS_XW_PROD",  "xwalk_product",  "SF prod ↔ Platt\n↔ Vetro type"),
        ("CS_XW_INV",   "xwalk_invoice",  "Intacct ↔ Platt\n↔ SF quote"),
        ("CS_XW_PAY",   "xwalk_payment",  "Intacct pmt\n↔ Platt receipt"),
        ("CS_XW_TICK",  "xwalk_ticket",   "Gaiia ticket\n↔ SF case"),
    ]
    for i, ((did, dname, ddesc, dfill, dstroke), (xid, xname, xdesc)) in enumerate(zip(dims, xwalks)):
        lbl_d = f"<b><font style='font-size:9px'>{dname}</font></b><br><font style='font-size:8px'>{html(ddesc)}</font>"
        lbl_x = f"<b><font style='font-size:8px'>{xname}</font></b><br><font style='font-size:7.5px'>{html(xdesc)}</font>"
        add_box(cells, did, lbl_d, sx4+10, sy4, half, 95, dfill, dstroke, fontcolor="#1a1a1a")
        add_box(cells, xid, lbl_x, sx4+half+20, sy4, half, 95, "#fce4ec","#ad1457", fontcolor="#1a1a1a")
        sy4 += 105

    # Orchestration footer
    add_box(cells, "CS_ORCH",
            "⚙️ <b>Orchestration (Current)</b><br>"
            "<font style='font-size:9px'>"
            "EventBridge → ssot_daily.sh (sequential bash)<br>"
            "No DAG, no dependency gates — silent failures ⚠️<br>"
            "Manifests: s3://…/orchestration/&lt;source&gt;_daily/run_date=<br>"
            "Athena: single workgroup, no cost allocation ⚠️</font>",
            sx4+10, sy4+10, sw4-20, 78,
            fill="#ede7f6", stroke="#4527a0", fontcolor="#1a1a1a")

    # ═══════════════════════════════════════════════════════
    # ARROWS: Source → Ingestion → Raw → Curated → SSOT
    # ═══════════════════════════════════════════════════════
    src_ing_pairs = [
        ("CS_SRC_GAIIA",   "CS_ING_GAIIA"),
        ("CS_SRC_VETRO",   "CS_ING_VETRO"),
        ("CS_SRC_PLATT",   "CS_ING_PLATT"),
        ("CS_SRC_INTACCT", "CS_ING_INTACCT"),
        ("CS_SRC_SF",      "CS_ING_SF"),
    ]
    for i, (s, t) in enumerate(src_ing_pairs):
        add_arrow(cells, f"CS_A_SI_{i}", s, t, color="#1565c0")

    ing_raw_pairs = [
        ("CS_ING_GAIIA",   "CS_RAW_GAIIA"),
        ("CS_ING_VETRO",   "CS_RAW_VETRO"),
        ("CS_ING_PLATT",   "CS_RAW_PLATT"),
        ("CS_ING_INTACCT", "CS_RAW_INTACCT"),
        ("CS_ING_SF",      "CS_RAW_SF"),
    ]
    for i, (s, t) in enumerate(ing_raw_pairs):
        add_arrow(cells, f"CS_A_IR_{i}", s, t, color="#2e7d32")

    raw_cur_pairs = [
        ("CS_RAW_GAIIA",   "CS_CUR_GAIIA",   "VIEW"),
        ("CS_RAW_VETRO",   "CS_CUR_VETRO",   "VIEW"),
        ("CS_RAW_PLATT",   "CS_CUR_PLATT",   "VIEW"),
        ("CS_RAW_INTACCT", "CS_CUR_INTACCT", "VIEW"),
        ("CS_RAW_SF",      "CS_CUR_SF",      "VIEW"),
    ]
    for i, (s, t, l) in enumerate(raw_cur_pairs):
        add_arrow(cells, f"CS_A_RC_{i}", s, t, label=l, color="#e65100", dashed=True)

    cur_ssot_pairs = [
        ("CS_CUR_GAIIA",   "CS_DIM_ACCT"),
        ("CS_CUR_VETRO",   "CS_DIM_LOC"),
        ("CS_CUR_PLATT",   "CS_DIM_INV"),
        ("CS_CUR_INTACCT", "CS_DIM_INV"),
        ("CS_CUR_SF",      "CS_DIM_ACCT"),
        ("CS_CUR_XW",      "CS_XW_ACCT"),
    ]
    for i, (s, t) in enumerate(cur_ssot_pairs):
        add_arrow(cells, f"CS_A_CS_{i}", s, t, color="#880e4f", dashed=True)

    # Consumer row
    consumer_y = COL_TOP + COL_H + 30
    add_box(cells, "CS_CONSUMER",
            "👥 <b>Consumers</b>  —  Athena ad-hoc | Base44 Dashboard (Amplify) | Investor Workbooks | BI Reports",
            OX, consumer_y, 3360, 52,
            fill="#e3f2fd", stroke="#1565c0", fontcolor="#0d47a1", fontsize=11)


# ─────────────────────────────────────────────────────────────────────────────
# DIVIDER
# ─────────────────────────────────────────────────────────────────────────────

def divider(cells, oy):
    add_box(cells, "DIVIDER",
            "◀──────────  CURRENT STATE (above)   |   FUTURE STATE (below)  ──────────▶",
            40, oy, 3360, 50,
            fill="#37474f", stroke="#1c313a", fontcolor="#ffffff", fontsize=14, bold=True)


# ─────────────────────────────────────────────────────────────────────────────
# FUTURE STATE
# ─────────────────────────────────────────────────────────────────────────────

def future_state(cells, OY):
    OX = 40

    # ── Title ─────────────────────────────────────────────────────────────────
    add_header(cells, "FS_TITLE",
        html("🚀  FUTURE STATE ARCHITECTURE  (Target – 12 Months)\nOnPoint Insights – lake_deploy v2"),
        OX, OY, 3360, 55, fill="#004d40", stroke="#00251a", fontcolor="#ffffff", fontsize=16)

    # ── Stats bar ─────────────────────────────────────────────────────────────
    fstats = [("100%","Parquet Snapshots"),("Iceberg","SSOT Tables"),
              ("Step Fn","DAG Orchestration"),("DynamoDB","Checkpoints"),
              ("<$0.001","Cost/Query"),("50+","Concurrent Users")]
    sx = OX + 5
    for v, l in fstats:
        add_box(cells, f"FS_STAT_{l[:8].replace(' ','_')}",
                f"<b><font style='font-size:16px'>{v}</font></b><br><font style='font-size:9px'>{l}</font>",
                sx, OY+60, 550, 50, fill="#00695c", stroke="#004d40", fontcolor="#ffffff")
        sx += 555

    # ── Column bands ──────────────────────────────────────────────────────────
    COL_TOP = OY + 120
    COL_H   = 1980
    col_cfg = [
        (OX,        480, "DATA SOURCES (Config-Driven Multi-Tenant)",       "#e3f2fd","#0d47a1","#01579b"),
        (OX+500,    470, "INGESTION  (100% IaC | DAG-Orchestrated)",        "#f3e5f5","#4a148c","#311b92"),
        (OX+990,    580, "RAW LAYER  (Standardised: tenant/source/entity/dt=)","#e8f5e9","#1b5e20","#004d40"),
        (OX+1590,   620, "CURATED  (100% Materialised Parquet Snapshots ✅)","#e8f5e9","#1b5e20","#004d40"),
        (OX+2230,   1170,"SSOT  (Apache Iceberg + SCD Type 2 + entity_spine)","#e8f5e9","#1b5e20","#004d40"),
    ]
    col_x = []
    for cx, cw, lbl, fill, stroke, fc in col_cfg:
        add_lane(cells, f"FS_LANE_{lbl[:6].replace(' ','_')}", lbl, cx, COL_TOP, cw, COL_H,
                 fill, stroke, fc)
        col_x.append((cx, cw))

    # ═══════════════════════════════════════════════════════
    # COLUMN 0 – DATA SOURCES (Future)
    # ═══════════════════════════════════════════════════════
    sx0, sw0 = col_x[0]
    sy = COL_TOP + 48

    sources_fs = [
        ("FS_SRC_GAIIA",
         "🔷 <b>Gaiia</b>",
         "GraphQL API | Lambda (IaC ✅)<br>All 3 tenants: gwi | lymefiber | dvfiber<br>Config-driven: tenants.json<br>New tenant = config change only ✅",
         "#bbdefb","#0d47a1"),
        ("FS_SRC_VETRO",
         "🗺️ <b>VETRO</b>",
         "REST API | Lambda (IaC ✅)<br>plan_id → tenant mapping table ✅<br>Multi-tenant support ✅<br>SQS DLQ + CW Alarm ✅",
         "#bbdefb","#0d47a1"),
        ("FS_SRC_PLATT",
         "📄 <b>Platt</b>",
         "CSV + S3 Upload<br>Operator code → tenant partition ✅<br>Schema contract validation ✅<br>Glue Crawler (IaC ✅)",
         "#c8e6c9","#1b5e20"),
        ("FS_SRC_INTACCT",
         "📊 <b>Intacct</b>",
         "SOAP/XML | ECS Task (IaC ✅)<br>entity_id → tenant checkpoint<br>DynamoDB ledger (atomic ✅)<br>Full-history gap resolved ✅",
         "#d1c4e9","#311b92"),
        ("FS_SRC_SF",
         "☁️ <b>Salesforce</b>",
         "AppFlow + Lambda per tenant<br>IaC: CloudFormation deployed ✅<br>OIDC GitHub → AWS Auth ✅<br>Multi-tenant connector ✅",
         "#ffccbc","#bf360c"),
    ]
    fs_src_ids = {}
    for sid, title, desc, fill, stroke in sources_fs:
        lbl = f"{title}<br><font style='font-size:9px'>{desc}</font>"
        add_box(cells, sid, lbl, sx0+15, sy, sw0-30, 145, fill, stroke, fontcolor="#1a1a1a")
        fs_src_ids[sid] = sy
        sy += 160

    # tenants.json config note
    add_note(cells, "FS_TENANT_CFG",
             "tenants.json\n{ gwi, lymefiber,\n  dvfiber, nwfx, … }\nAdd tenant = 1 line\nNo code deploy needed ✅",
             sx0+15, sy+10, sw0-30, 85)

    # ═══════════════════════════════════════════════════════
    # COLUMN 1 – INGESTION (Future)
    # ═══════════════════════════════════════════════════════
    sx1, sw1 = col_x[1]
    iy = COL_TOP + 48

    ingestion_fs = [
        ("FS_ING_GAIIA",
         "⚡ <b>Lambda: gaiia_ingest v2</b>",
         "EventBridge + Step Functions DAG<br>Secrets Manager per-tenant key<br>IaC 100% CloudFormation ✅<br>Schema contract check on ingest",
         "#e1bee7","#4a148c"),
        ("FS_ING_VETRO",
         "⚡ <b>Lambda: vetro_export v2</b>",
         "Step Functions DAG node<br>SQS DLQ + CloudWatch Alarm ✅<br>DynamoDB checkpoint ledger ✅<br>IaC 100% ✅",
         "#e1bee7","#4a148c"),
        ("FS_ING_PLATT",
         "🗂️ <b>S3 Upload + Glue</b>",
         "Glue Crawler in CloudFormation ✅<br>Schema contract validation ✅<br>Drift → SNS Alert ✅<br>tenant= partition enforced",
         "#c8e6c9","#1b5e20"),
        ("FS_ING_INTACCT",
         "🐳 <b>ECS Task: intacct_ingest v2</b>",
         "Step Functions DAG node<br>DynamoDB atomic checkpoint ✅<br>Resume on failure (no full restart ✅)<br>IaC 100% ✅",
         "#d1c4e9","#311b92"),
        ("FS_ING_SF",
         "🔄 <b>AppFlow + Lambda (per tenant)</b>",
         "CloudFormation ConnectorProfile ✅<br>Per-tenant AppFlow flows ✅<br>OIDC GitHub → AWS (no long-lived keys)<br>IaC 100% ✅",
         "#ffccbc","#bf360c"),
    ]
    fs_ing_ids = {}
    for iid, title, desc, fill, stroke in ingestion_fs:
        lbl = f"{title}<br><font style='font-size:9px'>{desc}</font>"
        add_box(cells, iid, lbl, sx1+15, iy, sw1-30, 145, fill, stroke, fontcolor="#1a1a1a")
        fs_ing_ids[iid] = iy
        iy += 160

    # DynamoDB Checkpoint Ledger
    add_box(cells, "FS_DYNAMO",
            "🗄️ <b>DynamoDB: checkpoint_ledger</b><br>"
            "<font style='font-size:9px'>"
            "PK: source#entity | SK: run_date<br>"
            "Fields: last_cursor, status, part_count<br>"
            "error_msg, updated_at<br>"
            "Atomic | Resume on failure ✅</font>",
            sx1+15, iy+15, sw1-30, 95,
            fill="#fff9c4", stroke="#f57f17", fontcolor="#1a1a1a")

    # ═══════════════════════════════════════════════════════
    # COLUMN 2 – RAW LAYER (Future)
    # ═══════════════════════════════════════════════════════
    sx2, sw2 = col_x[2]
    ry = COL_TOP + 48

    add_box(cells, "FS_S3_LAYOUT",
            "🪣 <b>Standardised S3 Layout</b><br>"
            "<font style='font-size:9px'>"
            "s3://gwi-raw-us-east-2-pc/raw/<br>"
            "  &lt;tenant&gt;/&lt;source&gt;/&lt;entity&gt;/dt=YYYY-MM-DD/<br>"
            "  part-0001.ndjson.gz<br>"
            "Consistent partition key: dt= everywhere ✅</font>",
            sx2+10, ry, sw2-20, 70, fill="#a5d6a7", stroke="#1b5e20", fontcolor="#1a2e1a")
    ry += 80

    add_box(cells, "FS_SCHEMA",
            "📋 <b>Schema Contract Files</b><br>"
            "<font style='font-size:9px'>"
            "config/schema/&lt;source&gt;/&lt;entity&gt;.json<br>"
            "Required fields | Null rate threshold<br>"
            "Type checks | Drift → SNS Alert ✅<br>"
            "Versioned in Git ✅</font>",
            sx2+10, ry, sw2-20, 70, fill="#fff9c4", stroke="#f57f17", fontcolor="#1a1a1a")
    ry += 80

    raw_fs = [
        ("FS_RAW_GAIIA",   "📁 <b>raw_gaiia.*</b>",
         "gwi/gaiia/&lt;entity&gt;/dt=YYYY-MM-DD/<br>lymefiber/gaiia/… | dvfiber/gaiia/…<br>Glue Crawler (IaC ✅) | Schema contract ✅",
         "#c8e6c9","#1b5e20"),
        ("FS_RAW_VETRO",   "📁 <b>raw_vetro.*</b>",
         "gwi/vetro/plans/dt= | gwi/vetro/layers/dt=<br>Tenant-tagged via mapping table ✅<br>Glue Crawler (IaC ✅)",
         "#c8e6c9","#1b5e20"),
        ("FS_RAW_PLATT",   "📁 <b>raw_platt.*</b>",
         "gwi/platt/customer/dt= | iheader/ | billing/<br>Operator code → tenant enforced ✅<br>Glue Crawler (IaC ✅)",
         "#c8e6c9","#1b5e20"),
        ("FS_RAW_INTACCT", "📁 <b>raw_intacct.*</b>",
         "gwi/intacct/gl_entries/dt= | vendors/ | ap_bill/<br>tenant= partition consistent ✅<br>Glue Crawler (IaC ✅)",
         "#c8e6c9","#1b5e20"),
        ("FS_RAW_SF",      "📁 <b>raw_salesforce.*</b>",
         "gwi/salesforce/account/dt= | opportunity/dt=<br>Consistent dt= partition (not year/month/day) ✅<br>Glue Crawler (IaC ✅)",
         "#c8e6c9","#1b5e20"),
    ]
    fs_raw_ids = {}
    for rid, title, desc, fill, stroke in raw_fs:
        lbl = f"{title}<br><font style='font-size:9px'>{desc}</font>"
        add_box(cells, rid, lbl, sx2+10, ry, sw2-20, 105, fill, stroke, fontcolor="#1a1a1a")
        fs_raw_ids[rid] = ry
        ry += 118

    # ═══════════════════════════════════════════════════════
    # COLUMN 3 – CURATED (Future — 100% Materialised)
    # ═══════════════════════════════════════════════════════
    sx3, sw3 = col_x[3]
    cy = COL_TOP + 48

    add_box(cells, "FS_CUR_HDR",
            "✅ <b>Daily Pipeline: runs ONCE at 02:00 UTC</b><br>"
            "<font style='font-size:9px'>"
            "JSON extract + UNNEST + ROW_NUMBER → Parquet snapshot<br>"
            "Dashboard queries read ~10 MB Parquet (not raw S3)<br>"
            "Cost: &lt;$0.001/query | Latency: 1–3s | 50+ concurrent ✅</font>",
            sx3+10, cy, sw3-20, 75,
            fill="#1b5e20", stroke="#004d40", fontcolor="#ffffff", bold=True)
    cy += 85

    curated_fs = [
        ("FS_CUR_GAIIA",
         "🔷 <b>Gaiia Curated Parquet ✅</b>",
         "gaiia_accounts_snapshot_dt.parquet<br>gaiia_subscriptions_snapshot_dt<br>gaiia_invoices_snapshot_dt<br>All 9 entities materialised daily<br>DQ checked → dq_run_log ✅",
         "#a5d6a7","#1b5e20"),
        ("FS_CUR_VETRO",
         "🗺️ <b>Vetro Curated Parquet ✅</b>",
         "vetro_plans_as_built_snapshot_dt<br>vetro_passings_snapshot_dt<br>vetro_gis_layers_snapshot_dt<br>Materialised daily ✅",
         "#a5d6a7","#1b5e20"),
        ("FS_CUR_PLATT",
         "📄 <b>Platt Curated Parquet ✅</b>",
         "platt_customer_snapshot_dt<br>platt_billing_summary_snapshot_dt<br>revenue_rollup_snapshot_dt<br>Materialised daily ✅",
         "#a5d6a7","#1b5e20"),
        ("FS_CUR_INTACCT",
         "📊 <b>Intacct Curated Parquet ✅</b>",
         "intacct_gl_entries_snapshot_dt<br>Full GL + COA + Sage dims baked in<br>intacct_ap_snapshot_dt<br>Materialised daily ✅",
         "#a5d6a7","#1b5e20"),
        ("FS_CUR_SF",
         "☁️ <b>Salesforce Curated Parquet ✅</b>",
         "salesforce_account_snapshot_dt<br>salesforce_opportunity_snapshot_dt<br>projects_enriched_snapshot_dt<br>Materialised daily ✅",
         "#a5d6a7","#1b5e20"),
    ]
    fs_cur_ids = {}
    for cid, title, desc, fill, stroke in curated_fs:
        lbl = f"{title}<br><font style='font-size:9px'>{desc}</font>"
        add_box(cells, cid, lbl, sx3+10, cy, sw3-20, 128, fill, stroke, fontcolor="#1a1a1a")
        fs_cur_ids[cid] = cy
        cy += 143

    # DQ framework note
    add_box(cells, "FS_DQ",
            "🧪 <b>Data Quality Framework</b><br>"
            "<font style='font-size:9px'>"
            "curated_recon.dq_run_log (PHYSICAL)<br>"
            "Exception rate → CloudWatch Alarm ✅<br>"
            "config/dq_thresholds.json (versioned ✅)<br>"
            "Schema drift → SNS Alert ✅</font>",
            sx3+10, cy+10, sw3-20, 80,
            fill="#fff9c4", stroke="#f57f17", fontcolor="#1a1a1a")

    # ═══════════════════════════════════════════════════════
    # COLUMN 4 – SSOT (Apache Iceberg + entity_spine)
    # ═══════════════════════════════════════════════════════
    sx4, sw4 = col_x[4]
    third = (sw4-40)//3

    sy4 = COL_TOP + 48

    # entity_spine header
    add_box(cells, "FS_SPINE",
            "🔑 <b>entity_spine  (Apache Iceberg ✅)</b><br>"
            "<font style='font-size:9px'>"
            "Surrogate UUID → ALL source IDs<br>"
            "sf_id | platt_id | intacct_id | gaiia_id | vetro_id<br>"
            "SCD Type 2: valid_from, valid_to, is_current<br>"
            "MERGE INTO upserts | time-travel | auto-compaction</font>",
            sx4+10, sy4, sw4-20, 80,
            fill="#00695c", stroke="#004d40", fontcolor="#ffffff", bold=True)
    sy4 += 90

    dims_fs = [
        ("FS_DIM_ACCT",  "dim_account",   "SF primary\nSCD Type 2 ✅\nPASS ✅",          "#a5d6a7","#1b5e20"),
        ("FS_DIM_LOC",   "dim_location",  "Vetro+Gaiia\nFull multi-tenant\nPASS ✅",     "#a5d6a7","#1b5e20"),
        ("FS_DIM_ASSET", "dim_asset",     "Vetro primary\nGIS geometry\nPASS ✅",        "#a5d6a7","#1b5e20"),
        ("FS_DIM_PROD",  "dim_product",   "SF/Vetro/Platt\nFull crosswalk\nPASS ✅",    "#a5d6a7","#1b5e20"),
        ("FS_DIM_INV",   "dim_invoice",   "Intacct primary\nSCD Type 2 ✅\nPASS ✅",    "#a5d6a7","#1b5e20"),
        ("FS_DIM_PAY",   "dim_payment",   "Intacct primary\nPASS ✅",                   "#a5d6a7","#1b5e20"),
        ("FS_DIM_TICK",  "dim_ticket",    "Gaiia primary\nPASS ✅",                     "#a5d6a7","#1b5e20"),
    ]
    xwalks_fs = [
        ("FS_XW_ACCT",  "xwalk_account",  "1:1 resolved ✅\nConfidence tier"),
        ("FS_XW_LOC",   "xwalk_location", "1:1 resolved ✅"),
        ("FS_XW_ASSET", "xwalk_asset",    "1:1 resolved ✅"),
        ("FS_XW_PROD",  "xwalk_product",  "1:1 resolved ✅"),
        ("FS_XW_INV",   "xwalk_invoice",  "1:1 resolved ✅"),
        ("FS_XW_PAY",   "xwalk_payment",  "1:1 resolved ✅"),
        ("FS_XW_TICK",  "xwalk_ticket",   "1:1 resolved ✅"),
    ]
    facts = [
        ("FS_FACT_MRR",    "fact_mrr",           "Monthly Revenue"),
        ("FS_FACT_PASS",   "fact_passings",       "Network Coverage"),
        ("FS_FACT_PROD",   "fact_subscriptions",  "Active Subs/Churn"),
        ("FS_FACT_BILL",   "fact_billing",        "Billings & Collect."),
        None, None,
        ("FS_FACT_TICK",   "fact_tickets",        "SLA & Resolution"),
    ]
    for i, (dim_row, xw_row, fact_row) in enumerate(zip(dims_fs, xwalks_fs, facts)):
        did, dname, ddesc, dfill, dstroke = dim_row
        xid, xname, xdesc = xw_row

        lbl_d = f"<b><font style='font-size:9px'>{dname}</font></b><br><font style='font-size:8px'>{html(ddesc)}</font>"
        lbl_x = f"<b><font style='font-size:8px'>{xname}</font></b><br><font style='font-size:7.5px'>{html(xdesc)}</font>"
        add_box(cells, did, lbl_d, sx4+10, sy4, third, 95, dfill, dstroke, fontcolor="#1a1a1a")
        add_box(cells, xid, lbl_x, sx4+third+20, sy4, third, 95, "#b2dfdb","#00695c", fontcolor="#1a1a1a")

        if fact_row:
            fid, fname, fdesc = fact_row
            lbl_f = f"<b><font style='font-size:8px'>{fname}</font></b><br><font style='font-size:7.5px'>{fdesc}</font>"
            add_box(cells, fid, lbl_f, sx4+third*2+30, sy4, third-10, 95, "#e8f5e9","#2e7d32", fontcolor="#1a1a1a")

        sy4 += 105

    # ─── Step Functions DAG ────────────────────────────────────────────────────
    dag_y = COL_TOP + COL_H + 30

    add_box(cells, "FS_DAG_HDR",
            "⚙️ <b>Step Functions DAG  (Replaces Sequential Bash Script)</b>",
            OX, dag_y, 3360, 38,
            fill="#311b92", stroke="#1a0050", fontcolor="#ffffff", fontsize=12, bold=True)
    dag_y += 45

    dag_steps = [
        ("FS_DAG_INGEST", "[Parallel]\nIngest All Sources\nGaiia | Vetro | Platt\nIntacct | Salesforce", "#e1bee7","#4a148c", 490),
        ("FS_DAG_GATE1",  "✅ GATE\nAll partitions\nexist? Freshness\ncheck pass?",                       "#fff9c4","#f57f17", 280),
        ("FS_DAG_MAT",    "[Parallel]\nMaterialise Curated\nParquet snapshots\nRun DQ checks",            "#c8e6c9","#1b5e20", 490),
        ("FS_DAG_GATE2",  "✅ GATE\nException rate\n< threshold?\nSchema OK?",                            "#fff9c4","#f57f17", 280),
        ("FS_DAG_SSOT",   "[Parallel]\nSSoT MERGE INTO\nIceberg upserts\nSCD Type 2",                    "#a5d6a7","#004d40", 450),
        ("FS_DAG_OBS",    "Observability\nManifest write\nCW Dashboard\nSLA + Cost report",              "#ede7f6","#4a148c", 390),
        ("FS_DAG_DONE",   "✅ DONE\n< 45 min SLA",                                                        "#a5d6a7","#1b5e20", 200),
    ]
    dx = OX + 20
    dag_ids_list = []
    for did, desc, fill, stroke, w in dag_steps:
        add_box(cells, did, html(desc), dx, dag_y, w, 90, fill, stroke, fontcolor="#1a1a1a")
        dag_ids_list.append(did)
        dx += w + 20

    for i in range(len(dag_ids_list)-1):
        add_arrow(cells, f"FS_DAG_ARR_{i}", dag_ids_list[i], dag_ids_list[i+1],
                  color="#311b92", thick=True)

    # ─── Observability Row ─────────────────────────────────────────────────────
    obs_y = dag_y + 115

    obs_items = [
        ("FS_OBS_FRESH", "⏰ Freshness Alarm\nmax(dt)&lt;NOW-26h\n→ CW Alarm ✅",          "#f3e5f5","#4a148c", 430),
        ("FS_OBS_EXC",   "🚨 Exception Alarm\nexception_rate &gt; threshold\n→ SNS ✅",   "#f3e5f5","#4a148c", 430),
        ("FS_OBS_COST",  "💰 Cost Tracking\nWorkgroup per stage\nraw|curated|ssot ✅",    "#f3e5f5","#4a148c", 430),
        ("FS_OBS_SLA",   "📈 SLA Dashboard\nGreen/Red per source\nP95 duration ✅",       "#f3e5f5","#4a148c", 430),
        ("FS_OBS_SCHEMA","🔍 Schema Drift\nGlue→Lambda→SNS\nContract file ✅",            "#f3e5f5","#4a148c", 430),
        ("FS_OBS_IAC",   "🏗️ IaC 100%\nAll resources CF\nGitHub OIDC ✅",               "#f3e5f5","#4a148c", 430),
        ("FS_OBS_CONS",  "👥 Consumers\nAthena | Amplify (CI/CD ✅)\nDashboards | Reports", "#e3f2fd","#0d47a1", 440),
    ]
    ox2 = OX + 20
    for oid, desc, fill, stroke, w in obs_items:
        add_box(cells, oid, html(desc), ox2, obs_y, w, 80, fill, stroke, fontcolor="#1a1a1a")
        ox2 += w + 15

    # ═══════════════════════════════════════════════════════
    # ARROWS: Future State
    # ═══════════════════════════════════════════════════════
    for i, (s, t) in enumerate([
        ("FS_SRC_GAIIA","FS_ING_GAIIA"),("FS_SRC_VETRO","FS_ING_VETRO"),
        ("FS_SRC_PLATT","FS_ING_PLATT"),("FS_SRC_INTACCT","FS_ING_INTACCT"),
        ("FS_SRC_SF",   "FS_ING_SF")]):
        add_arrow(cells, f"FS_A_SI_{i}", s, t, color="#0d47a1")

    for i, (s, t) in enumerate([
        ("FS_ING_GAIIA","FS_RAW_GAIIA"),("FS_ING_VETRO","FS_RAW_VETRO"),
        ("FS_ING_PLATT","FS_RAW_PLATT"),("FS_ING_INTACCT","FS_RAW_INTACCT"),
        ("FS_ING_SF",   "FS_RAW_SF")]):
        add_arrow(cells, f"FS_A_IR_{i}", s, t, color="#1b5e20")

    for i, (s, t, l) in enumerate([
        ("FS_RAW_GAIIA","FS_CUR_GAIIA","CTAS\nParquet"),
        ("FS_RAW_VETRO","FS_CUR_VETRO","CTAS\nParquet"),
        ("FS_RAW_PLATT","FS_CUR_PLATT","CTAS\nParquet"),
        ("FS_RAW_INTACCT","FS_CUR_INTACCT","CTAS\nParquet"),
        ("FS_RAW_SF","FS_CUR_SF","CTAS\nParquet")]):
        add_arrow(cells, f"FS_A_RC_{i}", s, t, label=l, color="#1b5e20")

    for i, (s, t, l) in enumerate([
        ("FS_CUR_GAIIA","FS_DIM_ACCT","MERGE\nINTO"),
        ("FS_CUR_VETRO","FS_DIM_LOC","MERGE\nINTO"),
        ("FS_CUR_PLATT","FS_DIM_INV","MERGE\nINTO"),
        ("FS_CUR_INTACCT","FS_DIM_INV","MERGE\nINTO"),
        ("FS_CUR_SF","FS_DIM_ACCT","MERGE\nINTO")]):
        add_arrow(cells, f"FS_A_CS_{i}", s, t, label=l, color="#004d40")

    # entity spine connects to all dims
    for i, did in enumerate(["FS_DIM_ACCT","FS_DIM_LOC","FS_DIM_ASSET",
                              "FS_DIM_PROD","FS_DIM_INV","FS_DIM_PAY","FS_DIM_TICK"]):
        add_arrow_lr(cells, f"FS_A_SPINE_{i}", "FS_SPINE", did,
                     color="#00695c", dashed=True)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    cells = []

    # Build both diagrams into the same flat cell list
    current_state(cells)

    # Divider at y=2250
    divider(cells, 2310)

    # Future state starts at y=2390
    future_state(cells, OY=2390)

    # Convert to XML
    model = build_xml(cells)

    # Pretty-print
    xml_str = ET.tostring(model, encoding="unicode")
    pretty = minidom.parseString(xml_str).toprettyxml(indent="  ", encoding=None)
    lines = [l for l in pretty.split("\n") if not l.startswith("<?xml")]
    final_xml = "\n".join(lines)

    drawio_xml = (
        '<mxfile host="app.diagrams.net" modified="2026-02-23T00:00:00.000Z" '
        'agent="Claude" version="21.0.0" type="device">\n'
        '  <diagram id="architecture" name="Current + Future State">\n'
        f'{final_xml}\n'
        '  </diagram>\n'
        '</mxfile>'
    )

    out = ("/Users/vinaymistry/Library/CloudStorage/OneDrive-OnPointInsightsLLC"
           "/GitRepo/lake_deploy/.claude/worktrees/silly-leavitt/lake_deploy_architecture.drawio")
    with open(out, "w", encoding="utf-8") as f:
        f.write(drawio_xml)

    # Validate
    import xml.etree.ElementTree as ET2
    tree = ET2.parse(out)
    root_check = tree.getroot()
    all_cells = root_check.findall(".//mxCell")
    all_ids = {c.get("id") for c in all_cells}
    edges = [c for c in all_cells if c.get("edge") == "1"]
    broken = []
    for e in edges:
        for attr in ("source", "target"):
            v = e.get(attr, "")
            if v and v not in all_ids:
                broken.append(f"MISSING {attr.upper()}: {e.get('id')} → {v}")

    vtx = [c for c in all_cells if c.get("vertex") == "1"]
    print(f"✅ draw.io saved: {out}")
    print(f"   Total cells  : {len(all_cells)}")
    print(f"   Vertices     : {len(vtx)}")
    print(f"   Edges        : {len(edges)}")
    if broken:
        print(f"   ⚠️  Dangling refs: {len(broken)}")
        for b in broken[:10]:
            print(f"      {b}")
    else:
        print(f"   Dangling refs: 0  ✅")
    print()
    print("   Open with: https://app.diagrams.net  OR  draw.io Desktop")
    print("   File → Open from Device → select lake_deploy_architecture.drawio")

if __name__ == "__main__":
    main()
