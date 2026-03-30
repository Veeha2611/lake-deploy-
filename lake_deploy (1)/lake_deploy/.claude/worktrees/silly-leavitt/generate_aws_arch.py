"""
High-Level AWS Architecture Diagram for lake_deploy
OnPoint Insights Data Lake Platform
draw.io XML — flat cell layout, fully editable
"""

from xml.dom import minidom
import xml.etree.ElementTree as ET

# ─────────────────────────────────────────────────────────────────────────────
# XML BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def build_xml(cells):
    model = ET.Element("mxGraphModel", {
        "dx": "1422", "dy": "762", "grid": "1", "gridSize": "10",
        "guides": "1", "tooltips": "1", "connect": "1", "arrows": "1",
        "fold": "1", "page": "1", "pageScale": "1",
        "pageWidth": "3300", "pageHeight": "2200",
        "math": "0", "shadow": "1"
    })
    root_el = ET.SubElement(model, "root")
    ET.SubElement(root_el, "mxCell", {"id": "0"})
    ET.SubElement(root_el, "mxCell", {"id": "1", "parent": "0"})

    for item in cells:
        if item[0] == "v":
            _, attrs, x, y, w, h = item
            cell_el = ET.SubElement(root_el, "mxCell", attrs)
            ET.SubElement(cell_el, "mxGeometry", {
                "x": str(x), "y": str(y), "width": str(w), "height": str(h), "as": "geometry"
            })
        elif item[0] == "e":
            _, attrs = item
            cell_el = ET.SubElement(root_el, "mxCell", attrs)
            geo = ET.SubElement(cell_el, "mxGeometry", {"relative": "1", "as": "geometry"})
            if "pts" in attrs:
                arr = ET.SubElement(geo, "Array", {"as": "points"})
                for px, py in attrs.pop("pts", []):
                    ET.SubElement(arr, "mxPoint", {"x": str(px), "y": str(py)})
    return model


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def v(cells, id, label, x, y, w, h, style):
    cells.append(("v", {"id": id, "value": label, "style": style,
                         "vertex": "1", "parent": "1"}, x, y, w, h))

def e(cells, id, src, tgt, label="", style="", pts=None):
    attrs = {"id": id, "value": label, "style": style,
             "edge": "1", "source": src, "target": tgt, "parent": "1"}
    if pts:
        attrs["pts"] = pts
    cells.append(("e", attrs))

def rect(cells, id, label, x, y, w, h,
         fill="#dae8fc", stroke="#6c8ebf", fc="#000000",
         fs=10, bold=False, rounded=8, opacity=100):
    fstyle = 1 if bold else 0
    style = (f"rounded=1;arcSize={rounded};whiteSpace=wrap;html=1;"
             f"fillColor={fill};strokeColor={stroke};fontSize={fs};"
             f"fontStyle={fstyle};fontColor={fc};verticalAlign=middle;"
             f"align=center;strokeWidth=2;opacity={opacity};")
    v(cells, id, label, x, y, w, h, style)

def group_box(cells, id, label, x, y, w, h,
              fill="#f5f5f5", stroke="#666666", fc="#333333", fs=11):
    style = (f"points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],"
             f"[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];"
             f"shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;"
             f"whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};"
             f"fontSize={fs};fontStyle=1;fontColor={fc};verticalAlign=top;align=center;"
             f"strokeWidth=2;")
    v(cells, id, label, x, y, w, h, style)

def aws_service(cells, id, label, x, y, w, h, shape,
                fill="#ffffff", stroke="#232F3E", fc="#232F3E", fs=9):
    style = (f"outlineConnect=0;fontColor={fc};gradientColor=none;"
             f"strokeColor={stroke};fillColor={fill};labelBackgroundColor=#ffffff;"
             f"align=center;html=1;fontSize={fs};fontStyle=1;aspect=fixed;"
             f"pointerEvents=1;shape={shape};")
    v(cells, id, label, x, y, w, h, style)

def icon_box(cells, id, label, sublabel, x, y, w=130, h=90,
             fill="#ffffff", stroke="#232F3E", fc="#232F3E",
             icon_shape="mxgraph.aws4.resourceIcon", icon="mxgraph.aws4.lambda_function",
             icon_fill="#E7157B"):
    """A box with an AWS icon + label + sublabel."""
    # Icon
    aws_service(cells, f"{id}_ico", "", x + w//2 - 20, y + 8, 40, 40,
                shape=icon, fill=icon_fill, stroke=icon_fill, fc=icon_fill)
    # Label box (transparent background)
    style = (f"text;html=1;strokeColor=none;fillColor=none;"
             f"align=center;verticalAlign=top;whiteSpace=wrap;"
             f"fontSize={9};fontStyle=1;fontColor={fc};")
    v(cells, f"{id}_lbl", label, x, y + 50, w, 20, style)
    style2 = (f"text;html=1;strokeColor=none;fillColor=none;"
              f"align=center;verticalAlign=top;whiteSpace=wrap;"
              f"fontSize=8;fontStyle=0;fontColor=#555555;")
    v(cells, f"{id}_sub", sublabel, x, y + 68, w, 20, style2)
    # Invisible hitbox for arrows
    rect(cells, id, "", x, y, w, h, fill="none", stroke="none",
         fc="none", opacity=0)

def arrow(cells, id, src, tgt, label="", color="#232F3E",
          dashed=False, thick=False, exit_side="right", entry_side="left"):
    ex = {"right": 1, "left": 0, "bottom": 0.5, "top": 0.5}
    ey = {"right": 0.5, "left": 0.5, "bottom": 1, "top": 0}
    nx = {"right": 0, "left": 1, "bottom": 0.5, "top": 0.5}
    ny = {"right": 0.5, "left": 0.5, "bottom": 0, "top": 1}
    dash = "dashed=1;dashPattern=6 3;" if dashed else "dashed=0;"
    w = "3" if thick else "2"
    style = (f"edgeStyle=orthogonalEdgeStyle;html=1;{dash}"
             f"strokeColor={color};strokeWidth={w};rounded=1;"
             f"exitX={ex[exit_side]};exitY={ey[exit_side]};exitDx=0;exitDy=0;"
             f"entryX={nx[entry_side]};entryY={ny[entry_side]};entryDx=0;entryDy=0;"
             f"endArrow=block;endFill=1;")
    e(cells, id, src, tgt, label, style)

def bidir_arrow(cells, id, src, tgt, label="", color="#232F3E"):
    style = (f"edgeStyle=orthogonalEdgeStyle;html=1;dashed=0;"
             f"strokeColor={color};strokeWidth=2;rounded=1;"
             f"startArrow=block;startFill=1;endArrow=block;endFill=1;")
    e(cells, id, src, tgt, label, style)

def label_tag(cells, id, text, x, y, fill="#ff9900", fc="#ffffff"):
    style = (f"rounded=1;whiteSpace=wrap;html=1;fillColor={fill};"
             f"strokeColor=none;fontSize=8;fontStyle=1;fontColor={fc};"
             f"arcSize=50;verticalAlign=middle;align=center;")
    v(cells, id, text, x, y, 55, 18, style)

def section_label(cells, id, text, x, y, w=200, fc="#232F3E"):
    style = (f"text;html=1;strokeColor=none;fillColor=none;"
             f"align=center;verticalAlign=middle;whiteSpace=wrap;"
             f"fontSize=13;fontStyle=1;fontColor={fc};")
    v(cells, id, text, x, y, w, 30, style)

def note(cells, id, text, x, y, w=180, h=55):
    style = ("shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;size=12;"
             "fillColor=#fff9c4;strokeColor=#e6b800;fontSize=8.5;fontColor=#333;")
    v(cells, id, text, x, y, w, h, style)


# ─────────────────────────────────────────────────────────────────────────────
# COLOUR PALETTE  (AWS orange palette + layer colours)
# ─────────────────────────────────────────────────────────────────────────────
AWS_ORANGE   = "#FF9900"
AWS_DARK     = "#232F3E"
AWS_BLUE     = "#007BC7"
C_GREEN      = "#1b5e20"
C_LT_GREEN   = "#e8f5e9"
C_ORANGE     = "#e65100"
C_LT_ORANGE  = "#fff8e1"
C_PURPLE     = "#4a0e8f"
C_LT_PURPLE  = "#f3e5f5"
C_TEAL       = "#00695c"
C_LT_TEAL    = "#e0f2f1"
C_RED        = "#c62828"
C_LT_RED     = "#ffebee"
C_BLUE       = "#0d47a1"
C_LT_BLUE    = "#e3f2fd"
C_PINK       = "#880e4f"
C_LT_PINK    = "#fce4ec"
C_GREY       = "#455a64"
C_LT_GREY    = "#eceff1"

# AWS service icon fills (official brand colours)
FILL_LAMBDA    = "#E7157B"
FILL_S3        = "#3F8624"
FILL_ATHENA    = "#8C4FFF"
FILL_GLUE      = "#8C4FFF"
FILL_EB        = "#E7157B"
FILL_ECS       = "#F58534"
FILL_APPFLOW   = "#007BC7"
FILL_DYNAMO    = "#4053D6"
FILL_SQS       = "#FF4F8B"
FILL_CW        = "#E7157B"
FILL_CF        = "#E7157B"
FILL_SECRETS   = "#DD344C"
FILL_AMPLIFY   = "#FF9900"
FILL_STEPFN    = "#C925D1"
FILL_SNS       = "#E7157B"
FILL_IAM       = "#DD344C"


# ─────────────────────────────────────────────────────────────────────────────
# MAIN DIAGRAM
# ─────────────────────────────────────────────────────────────────────────────

def build(cells):

    # ══════════════════════════════════════════════════════════════════════════
    # TITLE BAR
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "TITLE",
         "☁️  <b>OnPoint Insights — AWS Data Lake Architecture</b><br>"
         "<font style='font-size:10px; font-weight:normal'>"
         "High-Level Overview  ·  lake_deploy Platform  ·  us-east-2</font>",
         20, 10, 3240, 60,
         fill=AWS_DARK, stroke=AWS_DARK, fc="#ffffff", fs=16, bold=True)

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 0 — EXTERNAL DATA SOURCES  (outside AWS)
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "EXT_BG",
         "EXTERNAL DATA SOURCES",
         20, 90, 3240, 150,
         fill="#f9f9f9", stroke="#bbbbbb", fc="#555555", fs=10, bold=True, rounded=4)

    ext_sources = [
        ("EXT_GAIIA",   "Gaiia",      "GraphQL API\n(Billing / CRM)",          "#bbdefb", "#1565c0"),
        ("EXT_VETRO",   "VETRO",       "REST API\n(Network / GIS)",             "#bbdefb", "#1565c0"),
        ("EXT_PLATT",   "Platt",       "CSV Extract\n(Billing / Subscribers)",  "#c8e6c9", "#2e7d32"),
        ("EXT_INTACCT", "Intacct",     "SOAP / XML\n(General Ledger)",          "#d1c4e9", "#4527a0"),
        ("EXT_SF",      "Salesforce",  "CRM\n(Accounts / Opps)",               "#ffccbc", "#bf360c"),
    ]
    ex = 60
    for eid, name, desc, fill, stroke in ext_sources:
        rect(cells, eid,
             f"<b>{name}</b><br><font style='font-size:8px'>{desc}</font>",
             ex, 115, 190, 100, fill=fill, stroke=stroke, fc="#1a1a1a", fs=10)
        ex += 620

    # ══════════════════════════════════════════════════════════════════════════
    # AWS CLOUD BOUNDARY
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "AWS_BG",
         "",
         20, 260, 3240, 1870,
         fill="#fafcff", stroke="#FF9900", fc=AWS_DARK, fs=12, bold=True,
         rounded=6, opacity=40)

    # AWS logo text
    style_aws = ("text;html=1;strokeColor=none;fillColor=none;"
                 "align=left;verticalAlign=top;whiteSpace=wrap;"
                 "fontSize=11;fontStyle=1;fontColor=#FF9900;")
    v(cells, "AWS_LBL", "☁️  AWS Cloud  (us-east-2)", 35, 268, 250, 24, style_aws)

    # ══════════════════════════════════════════════════════════════════════════
    # ZONE 1 — INGESTION LAYER  (top strip inside AWS)
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "ING_BG",
         "INGESTION LAYER",
         30, 300, 3220, 260,
         fill=C_LT_PURPLE, stroke=C_PURPLE, fc=C_PURPLE, fs=11, bold=True, rounded=4)

    # ── Gaiia ingestion cluster ───────────────────────────────────────────────
    rect(cells, "ING_GAIIA_BG", "", 50, 330, 580, 210,
         fill="#ede7f6", stroke=C_PURPLE, fc=C_PURPLE, rounded=4)
    section_label(cells, "ING_GAIIA_LBL", "Gaiia", 50, 330, 580, fc=C_PURPLE)

    rect(cells, "ING_GAIIA_LAMBDA",
         "⚡ <b>Lambda</b><br><font style='font-size:8px'>gaiia_ingest_lambda<br>GraphQL query executor<br>Multi-tenant loop</font>",
         65, 360, 155, 90, fill="#f3e5f5", stroke=C_PURPLE, fc="#1a1a1a", fs=9)
    rect(cells, "ING_GAIIA_EB",
         "⏱️ <b>EventBridge</b><br><font style='font-size:8px'>Daily schedule rule<br>gaiia-ingest-schedule</font>",
         240, 360, 155, 90, fill="#f3e5f5", stroke=C_PURPLE, fc="#1a1a1a", fs=9)
    rect(cells, "ING_GAIIA_SM",
         "🔐 <b>Secrets Mgr</b><br><font style='font-size:8px'>X-Gaiia-Api-Key<br>Per tenant</font>",
         415, 360, 155, 90, fill="#f3e5f5", stroke=C_PURPLE, fc="#1a1a1a", fs=9)

    # ── Vetro ingestion cluster ───────────────────────────────────────────────
    rect(cells, "ING_VETRO_BG", "", 645, 330, 580, 210,
         fill="#ede7f6", stroke=C_PURPLE, fc=C_PURPLE, rounded=4)
    section_label(cells, "ING_VETRO_LBL", "VETRO", 645, 330, 580, fc=C_PURPLE)

    rect(cells, "ING_VETRO_LAMBDA",
         "⚡ <b>Lambda</b><br><font style='font-size:8px'>vetro_export_lambda<br>REST API + 429 backoff<br>plan_index state</font>",
         660, 360, 155, 90, fill="#f3e5f5", stroke=C_PURPLE, fc="#1a1a1a", fs=9)
    rect(cells, "ING_VETRO_SQS",
         "📬 <b>SQS DLQ</b><br><font style='font-size:8px'>Rate-limit dead letters<br>vetro-export-dlq</font>",
         835, 360, 155, 90, fill="#f3e5f5", stroke=C_PURPLE, fc="#1a1a1a", fs=9)
    rect(cells, "ING_VETRO_EB",
         "⏱️ <b>EventBridge</b><br><font style='font-size:8px'>Daily schedule rule<br>vetro-export-schedule</font>",
         1010, 360, 155, 90, fill="#f3e5f5", stroke=C_PURPLE, fc="#1a1a1a", fs=9)

    # ── Platt  (manual) ───────────────────────────────────────────────────────
    rect(cells, "ING_PLATT_BG", "", 1240, 330, 300, 210,
         fill="#e8f5e9", stroke=C_GREEN, fc=C_GREEN, rounded=4)
    section_label(cells, "ING_PLATT_LBL", "Platt", 1240, 330, 300, fc=C_GREEN)
    rect(cells, "ING_PLATT",
         "🗂️ <b>Manual S3 Upload</b><br><font style='font-size:8px'>+ Glue Crawler<br>(console-deployed ⚠️)</font>",
         1260, 360, 260, 90, fill="#c8e6c9", stroke=C_GREEN, fc="#1a1a1a", fs=9)

    # ── Intacct (ECS) ─────────────────────────────────────────────────────────
    rect(cells, "ING_INTACCT_BG", "", 1555, 330, 430, 210,
         fill="#ede7f6", stroke=C_PURPLE, fc=C_PURPLE, rounded=4)
    section_label(cells, "ING_INTACCT_LBL", "Intacct", 1555, 330, 430, fc=C_PURPLE)
    rect(cells, "ING_INTACCT_ECS",
         "🐳 <b>ECS Task</b><br><font style='font-size:8px'>intacct_ingest<br>SOAP/XML fetch<br>IaC: CF stack ✅</font>",
         1570, 360, 190, 90, fill="#d1c4e9", stroke=C_PURPLE, fc="#1a1a1a", fs=9)
    rect(cells, "ING_INTACCT_EB",
         "⏱️ <b>EventBridge</b><br><font style='font-size:8px'>Daily schedule<br>intacct-ingest-schedule</font>",
         1775, 360, 190, 90, fill="#d1c4e9", stroke=C_PURPLE, fc="#1a1a1a", fs=9)

    # ── Salesforce (AppFlow) ──────────────────────────────────────────────────
    rect(cells, "ING_SF_BG", "", 2000, 330, 390, 210,
         fill="#fff3e0", stroke="#e65100", fc="#e65100", rounded=4)
    section_label(cells, "ING_SF_LBL", "Salesforce", 2000, 330, 390, fc="#e65100")
    rect(cells, "ING_SF_APPFLOW",
         "🔄 <b>AWS AppFlow</b><br><font style='font-size:8px'>SF → S3 connector<br>Console-deployed ⚠️<br>Daily trigger</font>",
         2015, 360, 360, 90, fill="#ffccbc", stroke="#e65100", fc="#1a1a1a", fs=9)

    # ── Secrets Manager (shared) ──────────────────────────────────────────────
    rect(cells, "ING_SM_SHARED",
         "🔐 <b>Secrets Manager</b><br><font style='font-size:8px'>VETRO_API_KEY<br>INTACCT_CREDS<br>SF_CREDS</font>",
         2415, 330, 200, 150, fill="#fce4ec", stroke="#c62828", fc="#1a1a1a", fs=9)

    # CloudFormation label
    label_tag(cells, "ING_CF_TAG", "IaC: CF", 2630, 335, fill=AWS_ORANGE, fc="#232F3E")

    # ══════════════════════════════════════════════════════════════════════════
    # ZONE 2 — RAW LAYER  (S3 + Glue)
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "RAW_BG",
         "RAW LAYER",
         30, 580, 3220, 280,
         fill=C_LT_GREEN, stroke=C_GREEN, fc=C_GREEN, fs=11, bold=True, rounded=4)

    # S3 bucket
    rect(cells, "RAW_S3",
         "🪣 <b>Amazon S3</b>  —  gwi-raw-us-east-2-pc<br>"
         "<font style='font-size:8px'>"
         "raw/gaiia/graphql/&lt;entity&gt;/tenant=&lt;t&gt;/dt=  &nbsp;|&nbsp;  "
         "raw/vetro/plan_id=/dt=  &nbsp;|&nbsp;  raw/platt/*  &nbsp;|&nbsp;  "
         "raw/intacct_xml/ + intacct_json/  &nbsp;|&nbsp;  raw/salesforce_prod_appflow/<br>"
         "orchestration/&lt;source&gt;_daily/run_date=/manifest.json  &nbsp;|&nbsp;  "
         "vetro_export_state/plan_index.json  &nbsp;|&nbsp;  curated_core/ + curated_recon/ + ssot/</font>",
         50, 610, 2160, 90,
         fill="#c8e6c9", stroke=C_GREEN, fc="#1a1a1a", fs=9, bold=False)

    # Glue Crawler
    rect(cells, "RAW_GLUE",
         "🔍 <b>AWS Glue</b><br>"
         "<font style='font-size:8px'>"
         "Data Catalog + Crawlers<br>"
         "DBs: raw_gaiia, raw_vetro,<br>"
         "raw_platt, raw_intacct,<br>"
         "raw_salesforce<br>"
         "Partition projection ✅<br>"
         "⚠️ Console-deployed</font>",
         2240, 610, 220, 240,
         fill="#a5d6a7", stroke=C_GREEN, fc="#1a1a1a", fs=9)

    # Orchestration manifests
    rect(cells, "RAW_ORCH",
         "📋 <b>Orchestration State</b><br>"
         "<font style='font-size:8px'>"
         "ssot_daily.sh (sequential ⚠️)<br>"
         "EventBridge trigger (02:00 UTC)<br>"
         "Manifests in S3<br>"
         "plan_index.json (state file ⚠️)</font>",
         2480, 610, 250, 150,
         fill="#fff9c4", stroke="#f57f17", fc="#1a1a1a", fs=9)

    # Partition projection note
    note(cells, "RAW_PART_NOTE",
         "Partition strategy ⚠️\nGaiia: tenant= + dt=\nVetro: plan_id= + dt=\nSalesforce: year/month/day\nIntacct: run_date= ← inconsistent",
         50, 715, 420, 80)

    # ══════════════════════════════════════════════════════════════════════════
    # ZONE 3 — QUERY ENGINE: ATHENA
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "ATHENA_BG",
         "QUERY ENGINE",
         30, 880, 3220, 110,
         fill="#f3e5f5", stroke="#6a1b9a", fc="#6a1b9a", fs=11, bold=True, rounded=4)

    rect(cells, "ATHENA",
         "🔎 <b>Amazon Athena</b> (Serverless SQL)<br>"
         "<font style='font-size:8px'>"
         "Workgroup: primary (single, no cost isolation ⚠️)  &nbsp;·&nbsp;  "
         "$5 / TB scanned  &nbsp;·&nbsp;  "
         "Partition projection on raw tables  &nbsp;·&nbsp;  "
         "Query Result Reuse: NOT enabled ⚠️  &nbsp;·&nbsp;  "
         "UNNEST + json_extract_scalar + ROW_NUMBER() dedup  &nbsp;·&nbsp;  "
         "CTAS for physical curated tables</font>",
         50, 900, 2700, 70,
         fill="#e1bee7", stroke="#6a1b9a", fc="#1a1a1a", fs=9)

    rect(cells, "ATHENA_WG",
         "⚙️ <b>Workgroups</b><br>"
         "<font style='font-size:8px'>"
         "primary (all-in-one ⚠️)<br>"
         "No per-stage cost<br>"
         "attribution</font>",
         2775, 900, 445, 70,
         fill="#ce93d8", stroke="#6a1b9a", fc="#1a1a1a", fs=9)

    # ══════════════════════════════════════════════════════════════════════════
    # ZONE 4 — CURATED LAYER
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "CUR_BG",
         "CURATED LAYER  (Athena Views — 92% Virtual ⚠️)",
         30, 1010, 3220, 290,
         fill=C_LT_ORANGE, stroke=C_ORANGE, fc=C_ORANGE, fs=11, bold=True, rounded=4)

    curated_items = [
        ("CUR_GAIIA",   "🔷 Gaiia Curated",
         "gaiia_accounts_current (VIEW)<br>"
         "gaiia_subscriptions_current (VIEW)<br>"
         "gaiia_invoices_curated_raw (PHYS)<br>"
         "gaiia_products_current (VIEW)",
         "#fff9c4", "#f9a825"),
        ("CUR_VETRO",   "🗺️ Vetro Curated",
         "v_vetro_plans_as_built (VIEW)<br>"
         "v_vetro_passings_by_plan (VIEW)<br>"
         "v_vetro_network_map_layers (VIEW)<br>"
         "vetro_plan_map (PHYS)",
         "#fff9c4", "#f9a825"),
        ("CUR_PLATT",   "📄 Platt Curated",
         "platt_customer_current (VIEW)<br>"
         "platt_billing_summary (PHYS)<br>"
         "v_monthly_revenue_platt (VIEW)",
         "#fff9c4", "#f9a825"),
        ("CUR_INTACCT", "📊 Intacct Curated",
         "intacct_gl_entries_current (VIEW)<br>"
         "intacct_gl_entries_ssot (VIEW)<br>"
         "+ COA + Sage dims join",
         "#fff9c4", "#f9a825"),
        ("CUR_SF",      "☁️ Salesforce Curated",
         "salesforce_account_current (VIEW)<br>"
         "salesforce_opportunity_current<br>"
         "projects_enriched (VIEW — blended)",
         "#fff9c4", "#f9a825"),
        ("CUR_XW",      "🔗 Crosswalk & Recon",
         "sf_account_to_intacct_final<br>"
         "sf_intacct_crosswalk_gaps<br>"
         "gaiia_customers_exceptions<br>"
         "dq_run_log (PHYS)",
         "#ffe0b2", "#e65100"),
    ]
    cx = 50
    for cid, title, desc, fill, stroke in curated_items:
        rect(cells, cid,
             f"<b><font style='font-size:9px'>{title}</font></b><br>"
             f"<font style='font-size:7.5px'>{desc}</font>",
             cx, 1040, 500, 240,
             fill=fill, stroke=stroke, fc="#1a1a1a", fs=9)
        cx += 520

    # ══════════════════════════════════════════════════════════════════════════
    # ZONE 5 — SSOT LAYER
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "SSOT_BG",
         "SSOT LAYER  (18 Physical Tables — Single Source of Truth)",
         30, 1320, 3220, 290,
         fill=C_LT_TEAL, stroke=C_TEAL, fc=C_TEAL, fs=11, bold=True, rounded=4)

    ssot_dims = [
        ("SSOT_ACCT",  "dim_account",   "SF primary\nCONDITIONAL ⚠️",   "#b2dfdb", C_TEAL),
        ("SSOT_LOC",   "dim_location",  "Vetro+Gaiia\nDEGRADED ⚠️",     "#b2dfdb", C_TEAL),
        ("SSOT_ASSET", "dim_asset",     "Vetro primary\nDEGRADED ⚠️",   "#b2dfdb", C_TEAL),
        ("SSOT_PROD",  "dim_product",   "SF/Vetro/Platt\nPARTIAL ⚠️",   "#b2dfdb", C_TEAL),
        ("SSOT_INV",   "dim_invoice",   "Intacct primary\nPASS ✅",      "#a5d6a7", C_GREEN),
        ("SSOT_PAY",   "dim_payment",   "Intacct primary\nPASS ✅",      "#a5d6a7", C_GREEN),
        ("SSOT_TICK",  "dim_ticket",    "Gaiia primary\nCONDITIONAL",   "#b2dfdb", C_TEAL),
    ]
    dx = 50
    for sid, name, desc, fill, stroke in ssot_dims:
        rect(cells, sid,
             f"<b><font style='font-size:9px'>{name}</font></b><br>"
             f"<font style='font-size:8px'>{desc}</font>",
             dx, 1350, 290, 105,
             fill=fill, stroke=stroke, fc="#1a1a1a", fs=9)
        dx += 300

    # Crosswalk tables
    dx2 = 50
    xwalks_list = [
        ("XW_ACCT",  "xwalk_account\nSF↔Platt↔Intacct"),
        ("XW_LOC",   "xwalk_location\nVetro↔Platt↔Gaiia"),
        ("XW_PROD",  "xwalk_product\nSF↔Platt↔Vetro"),
        ("XW_INV",   "xwalk_invoice\nIntacct↔Platt↔SF"),
    ]
    for xid, xdesc in xwalks_list:
        rect(cells, xid,
             f"<font style='font-size:8px'>{xdesc}</font>",
             dx2, 1465, 432, 60,
             fill="#e0f2f1", stroke="#00897b", fc="#1a1a1a", fs=8)
        dx2 += 442

    # Certification banner
    rect(cells, "SSOT_CERT",
         "📋 <b>SSOT Certification Status (2026-02-16)</b><br>"
         "<font style='font-size:8px'>"
         "Platt mirror: PASS ✅  &nbsp;·&nbsp;  "
         "Intacct 24-month: PASS ✅  &nbsp;·&nbsp;  "
         "Intacct full-history: FAIL ❌  &nbsp;·&nbsp;  "
         "SF crosswalk: CONDITIONAL ⚠️  &nbsp;·&nbsp;  "
         "Ownership parity: FAIL ❌  &nbsp;·&nbsp;  "
         "Finance KPI: PASS ✅</font>",
         50, 1540, 3180, 50,
         fill="#004d40", stroke=C_TEAL, fc="#ffffff", fs=9)

    # ══════════════════════════════════════════════════════════════════════════
    # ZONE 6 — OBSERVABILITY & GOVERNANCE  (right sidebar)
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "OBS_BG",
         "OBSERVABILITY & GOVERNANCE",
         2750, 580, 510, 710,
         fill=C_LT_GREY, stroke=C_GREY, fc=C_GREY, fs=11, bold=True, rounded=4)

    obs_items = [
        ("OBS_CW",      "☁️ CloudWatch",
         "Logs (basic only ⚠️)\nNo SLA alarms ⚠️\nNo DLQ alarm ⚠️",
         "#fce4ec", C_RED),
        ("OBS_CF",      "🏗️ CloudFormation",
         "Gaiia stack ✅\nVetro stack ✅\nIntacct ECS ✅\nGlue/AppFlow ❌",
         "#fff9c4", "#f57f17"),
        ("OBS_IAM",     "🔒 IAM / OIDC",
         "Lambda exec roles\nECS task roles\nLong-lived keys ⚠️",
         "#fce4ec", C_RED),
        ("OBS_SM2",     "🔐 Secrets Manager",
         "All API keys stored\nNo rotation config ⚠️",
         "#e8f5e9", C_GREEN),
        ("OBS_AMPLIFY", "📱 Amplify",
         "Base44 frontend app\nManual artifact upload ⚠️\nNo CI/CD pipeline",
         "#fff9c4", "#f57f17"),
    ]
    oy = 610
    for oid, title, desc, fill, stroke in obs_items:
        rect(cells, oid,
             f"<b><font style='font-size:9px'>{title}</font></b><br>"
             f"<font style='font-size:8px'>{desc}</font>",
             2765, oy, 480, 110,
             fill=fill, stroke=stroke, fc="#1a1a1a", fs=9)
        oy += 120

    # ══════════════════════════════════════════════════════════════════════════
    # ZONE 7 — CONSUMERS
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "CON_BG",
         "CONSUMERS",
         30, 1630, 3220, 150,
         fill=C_LT_BLUE, stroke=C_BLUE, fc=C_BLUE, fs=11, bold=True, rounded=4)

    consumers = [
        ("CON_ATHENA",   "🔎 Athena Ad-Hoc",   "Direct SQL queries\nData analysts",         "#bbdefb", C_BLUE),
        ("CON_DASH",     "📊 Dashboards",       "Base44 (Amplify)\nBI tools / reports",      "#bbdefb", C_BLUE),
        ("CON_INV",      "📈 Investor Reports", "Workbook reconciliation\nProof artifacts",  "#bbdefb", C_BLUE),
        ("CON_API",      "🔌 API / Apps",       "Downstream services\nData products",        "#bbdefb", C_BLUE),
        ("CON_NOTION",   "📝 Notion / Docs",    "Knowledge base\nRunbook access",            "#bbdefb", C_BLUE),
    ]
    cx2 = 50
    for cid, title, desc, fill, stroke in consumers:
        rect(cells, cid,
             f"<b><font style='font-size:9px'>{title}</font></b><br>"
             f"<font style='font-size:8px'>{desc}</font>",
             cx2, 1660, 580, 100,
             fill=fill, stroke=stroke, fc="#1a1a1a", fs=9)
        cx2 += 600

    # ══════════════════════════════════════════════════════════════════════════
    # ZONE 8 — MULTI-TENANCY LEGEND
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "MT_BG",
         "MULTI-TENANCY STATUS",
         30, 1800, 3220, 110,
         fill="#f3f3f3", stroke="#aaaaaa", fc="#333333", fs=10, bold=True, rounded=4)

    mt_items = [
        ("MT_GAIIA",   "🔷 Gaiia",    "✅ Multi-tenant\ngwi | lymefiber | dvfiber\ntenant= partition",  "#bbdefb", C_BLUE),
        ("MT_VETRO",   "🗺️ VETRO",   "❌ GWI-only\nNo tenant partition\nPlan→tenant xwalk needed",     "#ffccbc", C_ORANGE),
        ("MT_PLATT",   "📄 Platt",    "❌ GWI-only\nOperator code exists\nNot partitioned yet",         "#ffccbc", C_ORANGE),
        ("MT_INTACCT", "📊 Intacct",  "❌ GWI-only\nSingle entity\nNeeds entity_id→tenant",            "#ffccbc", C_ORANGE),
        ("MT_SF",      "☁️ Salesforce","❌ GWI-only\nSingle AppFlow\nPer-tenant connector needed",     "#ffccbc", C_ORANGE),
    ]
    mx2 = 50
    for mid, title, desc, fill, stroke in mt_items:
        rect(cells, mid,
             f"<b><font style='font-size:9px'>{title}</font></b><br>"
             f"<font style='font-size:8px'>{desc}</font>",
             mx2, 1820, 580, 80,
             fill=fill, stroke=stroke, fc="#1a1a1a", fs=9)
        mx2 += 600

    # ══════════════════════════════════════════════════════════════════════════
    # LEGEND BOX (bottom right)
    # ══════════════════════════════════════════════════════════════════════════
    rect(cells, "LEG_BG", "LEGEND", 2780, 1800, 480, 230,
         fill="#ffffff", stroke="#aaaaaa", fc="#333333", fs=10, bold=True, rounded=4)

    legend_items = [
        ("LEG_PASS",  "PASS ✅  — Evidence validated",        "#c8e6c9", C_GREEN),
        ("LEG_COND",  "CONDITIONAL ⚠️ — Partial / caveats",   "#fff9c4", "#f57f17"),
        ("LEG_FAIL",  "FAIL ❌  — Gap / not implemented",     "#ffcdd2", C_RED),
        ("LEG_IaC",   "IaC ✅  — CloudFormation deployed",    "#e1bee7", C_PURPLE),
        ("LEG_CONS",  "Console ⚠️ — Manual, not in IaC",     "#ffe0b2", C_ORANGE),
    ]
    ly = 1835
    for lid, ldesc, fill, stroke in legend_items:
        rect(cells, lid, ldesc, 2795, ly, 455, 32,
             fill=fill, stroke=stroke, fc="#1a1a1a", fs=9)
        ly += 37

    # ══════════════════════════════════════════════════════════════════════════
    # DATA FLOW ARROWS
    # ══════════════════════════════════════════════════════════════════════════

    # External → Ingestion
    arrow(cells, "A_E_GAIIA",   "EXT_GAIIA",   "ING_GAIIA_LAMBDA",  color=C_BLUE,   exit_side="bottom", entry_side="top")
    arrow(cells, "A_E_VETRO",   "EXT_VETRO",   "ING_VETRO_LAMBDA",  color=C_BLUE,   exit_side="bottom", entry_side="top")
    arrow(cells, "A_E_PLATT",   "EXT_PLATT",   "ING_PLATT",         color=C_GREEN,  exit_side="bottom", entry_side="top")
    arrow(cells, "A_E_INTACCT", "EXT_INTACCT", "ING_INTACCT_ECS",   color=C_PURPLE, exit_side="bottom", entry_side="top")
    arrow(cells, "A_E_SF",      "EXT_SF",      "ING_SF_APPFLOW",    color=C_ORANGE, exit_side="bottom", entry_side="top")

    # EventBridge → Lambda
    arrow(cells, "A_EB_GAIIA",   "ING_GAIIA_EB",   "ING_GAIIA_LAMBDA",  color=C_PURPLE, exit_side="left",  entry_side="right")
    arrow(cells, "A_EB_VETRO",   "ING_VETRO_EB",   "ING_VETRO_LAMBDA",  color=C_PURPLE, exit_side="left",  entry_side="right")
    arrow(cells, "A_EB_INTACCT", "ING_INTACCT_EB", "ING_INTACCT_ECS",   color=C_PURPLE, exit_side="left",  entry_side="right")

    # Ingestion → S3 Raw
    arrow(cells, "A_ING_S3_1", "ING_GAIIA_LAMBDA", "RAW_S3", color=C_GREEN, exit_side="bottom", entry_side="top")
    arrow(cells, "A_ING_S3_2", "ING_VETRO_LAMBDA",  "RAW_S3", color=C_GREEN, exit_side="bottom", entry_side="top")
    arrow(cells, "A_ING_S3_3", "ING_PLATT",         "RAW_S3", color=C_GREEN, exit_side="bottom", entry_side="top")
    arrow(cells, "A_ING_S3_4", "ING_INTACCT_ECS",   "RAW_S3", color=C_GREEN, exit_side="bottom", entry_side="top")
    arrow(cells, "A_ING_S3_5", "ING_SF_APPFLOW",    "RAW_S3", color=C_GREEN, exit_side="bottom", entry_side="top")

    # S3 → Glue Crawler
    arrow(cells, "A_S3_GLUE", "RAW_S3", "RAW_GLUE", color=C_GREEN, exit_side="right", entry_side="left")

    # Glue → Athena
    arrow(cells, "A_GLUE_ATH", "RAW_GLUE", "ATHENA", color="#6a1b9a", exit_side="bottom", entry_side="top")

    # S3 → Athena (direct for CTAS)
    arrow(cells, "A_S3_ATH", "RAW_S3", "ATHENA",
          label="CTAS / View", color="#6a1b9a", exit_side="bottom", entry_side="top",
          dashed=True)

    # Athena → Curated (views read from S3 via Glue catalog)
    arrow(cells, "A_ATH_CUR", "ATHENA", "CUR_GAIIA",
          label="Athena Views\n→ Curated", color=C_ORANGE, exit_side="bottom", entry_side="top")

    # Curated → SSOT
    arrow(cells, "A_CUR_SSOT", "CUR_GAIIA",  "SSOT_ACCT", color=C_TEAL, exit_side="bottom", entry_side="top")
    arrow(cells, "A_CUR_SSOT2","CUR_VETRO",  "SSOT_LOC",  color=C_TEAL, exit_side="bottom", entry_side="top")
    arrow(cells, "A_CUR_SSOT3","CUR_PLATT",  "SSOT_INV",  color=C_TEAL, exit_side="bottom", entry_side="top")
    arrow(cells, "A_CUR_SSOT4","CUR_INTACCT","SSOT_INV",  color=C_TEAL, exit_side="bottom", entry_side="top")
    arrow(cells, "A_CUR_SSOT5","CUR_SF",     "SSOT_ACCT", color=C_TEAL, exit_side="bottom", entry_side="top")

    # SSOT → Consumers
    arrow(cells, "A_SSOT_CON", "SSOT_ACCT", "CON_DASH",
          label="Query via\nAthena", color=C_BLUE, exit_side="bottom", entry_side="top")
    arrow(cells, "A_SSOT_CON2","SSOT_INV",  "CON_INV",
          color=C_BLUE, exit_side="bottom", entry_side="top")

    # SQS DLQ ↔ Lambda
    arrow(cells, "A_SQS_VETRO", "ING_VETRO_LAMBDA", "ING_VETRO_SQS",
          label="429 DLQ", color="#c62828", dashed=True, exit_side="right", entry_side="left")

    # Secrets → Lambda
    arrow(cells, "A_SM_GAIIA",   "ING_GAIIA_SM",   "ING_GAIIA_LAMBDA",
          color=C_RED, dashed=True, exit_side="left", entry_side="right")
    arrow(cells, "A_SM_SHARED",  "ING_SM_SHARED",  "ING_INTACCT_ECS",
          color=C_RED, dashed=True, exit_side="left", entry_side="right")

    # CloudWatch monitors Lambdas
    arrow(cells, "A_CW_ING", "OBS_CW", "ING_GAIIA_LAMBDA",
          label="logs", color="#aaaaaa", dashed=True, exit_side="left", entry_side="right")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    cells = []
    build(cells)

    model = build_xml(cells)
    xml_str = ET.tostring(model, encoding="unicode")
    pretty = minidom.parseString(xml_str).toprettyxml(indent="  ", encoding=None)
    lines = [l for l in pretty.split("\n") if not l.startswith("<?xml")]
    final_xml = "\n".join(lines)

    drawio_xml = (
        '<mxfile host="app.diagrams.net" modified="2026-02-23T00:00:00.000Z" '
        'agent="Claude" version="21.0.0" type="device">\n'
        '  <diagram id="aws-arch" name="AWS High-Level Architecture">\n'
        f'{final_xml}\n'
        '  </diagram>\n'
        '</mxfile>'
    )

    out = ("/Users/vinaymistry/Library/CloudStorage/OneDrive-OnPointInsightsLLC"
           "/GitRepo/lake_deploy/.claude/worktrees/silly-leavitt/lake_deploy_aws_architecture.drawio")
    with open(out, "w", encoding="utf-8") as f:
        f.write(drawio_xml)

    # Validate
    import xml.etree.ElementTree as ET2
    tree = ET2.parse(out)
    all_cells = tree.findall(".//mxCell")
    all_ids   = {c.get("id") for c in all_cells}
    edges     = [c for c in all_cells if c.get("edge") == "1"]
    vtx       = [c for c in all_cells if c.get("vertex") == "1"]
    broken    = []
    for ed in edges:
        for attr in ("source", "target"):
            val = ed.get(attr, "")
            if val and val not in all_ids:
                broken.append(f"MISSING {attr}: {ed.get('id')} → {val}")

    import os
    size = os.path.getsize(out)
    print(f"✅  Saved: {out}")
    print(f"    Size       : {size//1024} KB")
    print(f"    Vertices   : {len(vtx)}")
    print(f"    Edges      : {len(edges)}")
    print(f"    Dangling   : {len(broken)}  {'✅' if not broken else '❌'}")
    if broken:
        for b in broken: print(f"      {b}")
    print()
    print("    Open: app.diagrams.net → File → Open from Device")

if __name__ == "__main__":
    main()
