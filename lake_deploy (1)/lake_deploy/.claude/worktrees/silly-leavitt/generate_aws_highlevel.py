"""
High-Level AWS Architecture Diagram — lake_deploy
Clean icon-based layout using official AWS shape library in draw.io
Each zone shows AWS service icons only — no granular detail
"""

from xml.dom import minidom
import xml.etree.ElementTree as ET

# ─────────────────────────────────────────────────────────────────────────────
# XML BUILDER  (flat parent="1" — draw.io safe)
# ─────────────────────────────────────────────────────────────────────────────

def build_xml(cells):
    model = ET.Element("mxGraphModel", {
        "dx": "1422", "dy": "762", "grid": "1", "gridSize": "10",
        "guides": "1", "tooltips": "1", "connect": "1", "arrows": "1",
        "fold": "1", "page": "1", "pageScale": "1",
        "pageWidth": "2800", "pageHeight": "1800",
        "math": "0", "shadow": "0"
    })
    root_el = ET.SubElement(model, "root")
    ET.SubElement(root_el, "mxCell", {"id": "0"})
    ET.SubElement(root_el, "mxCell", {"id": "1", "parent": "0"})

    for item in cells:
        if item[0] == "v":
            _, attrs, x, y, w, h = item
            el = ET.SubElement(root_el, "mxCell", attrs)
            ET.SubElement(el, "mxGeometry",
                          {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "as": "geometry"})
        elif item[0] == "e":
            _, attrs = item
            el = ET.SubElement(root_el, "mxCell", attrs)
            geo = ET.SubElement(el, "mxGeometry", {"relative": "1", "as": "geometry"})
            if "pts" in attrs:
                pts = attrs.pop("pts")
                arr = ET.SubElement(geo, "Array", {"as": "points"})
                for px, py in pts:
                    ET.SubElement(arr, "mxPoint", {"x": str(px), "y": str(py)})
    return model


# ─────────────────────────────────────────────────────────────────────────────
# PRIMITIVE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def v(cells, id, label, x, y, w, h, style):
    cells.append(("v", {"id": id, "value": label, "style": style,
                         "vertex": "1", "parent": "1"}, x, y, w, h))

def e(cells, id, src, tgt, label="", style="", pts=None):
    a = {"id": id, "value": label, "style": style,
         "edge": "1", "source": src, "target": tgt, "parent": "1"}
    if pts:
        a["pts"] = pts
    cells.append(("e", a))


# ─────────────────────────────────────────────────────────────────────────────
# ZONE / GROUP BOX
# ─────────────────────────────────────────────────────────────────────────────

def zone(cells, id, title, x, y, w, h, fill, stroke, fc="#232F3E", fs=11):
    style = (f"rounded=1;arcSize=3;whiteSpace=wrap;html=1;"
             f"fillColor={fill};strokeColor={stroke};strokeWidth=2;"
             f"fontSize={fs};fontStyle=1;fontColor={fc};"
             f"verticalAlign=top;align=center;spacingTop=6;")
    v(cells, id, title, x, y, w, h, style)


# ─────────────────────────────────────────────────────────────────────────────
# AWS SERVICE ICON  (uses official mxgraph.aws4 shapes)
# Each icon is placed as a fixed-size shape with a label below
# ─────────────────────────────────────────────────────────────────────────────

# Official AWS4 resource icon shapes
SHAPES = {
    "lambda":       "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda",
    "s3":           "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3",
    "athena":       "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.athena",
    "glue":         "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.glue",
    "eventbridge":  "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.eventbridge",
    "ecs":          "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecs",
    "appflow":      "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.appflow",
    "dynamodb":     "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb",
    "sqs":          "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs",
    "cloudwatch":   "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudwatch",
    "cloudformation":"mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudformation",
    "secrets":      "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.secrets_manager",
    "amplify":      "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.amplify",
    "stepfn":       "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.step_functions",
    "sns":          "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sns",
    "iam":          "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.role",
    "iceberg":      "mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3_glacier",  # closest
}

# Official AWS service category fill colours
CFILL = {
    "lambda":        "#E7157B",
    "s3":            "#3F8624",
    "athena":        "#8C4FFF",
    "glue":          "#8C4FFF",
    "eventbridge":   "#E7157B",
    "ecs":           "#F58534",
    "appflow":       "#E7157B",
    "dynamodb":      "#4053D6",
    "sqs":           "#FF4F8B",
    "cloudwatch":    "#E7157B",
    "cloudformation":"#E7157B",
    "secrets":       "#DD344C",
    "amplify":       "#FF9900",
    "stepfn":        "#C925D1",
    "sns":           "#E7157B",
    "iam":           "#DD344C",
    "iceberg":       "#3F8624",
}

def aws_icon(cells, id, svc, label, x, y, sz=52):
    """Place a single AWS service icon + text label below it."""
    shape = SHAPES.get(svc, "mxgraph.aws4.resourceIcon")
    fill  = CFILL.get(svc, "#232F3E")
    icon_style = (
        f"outlineConnect=0;fontColor=#232F3E;gradientColor=none;"
        f"strokeColor=none;fillColor={fill};"
        f"labelBackgroundColor=#ffffff;align=center;html=1;"
        f"fontSize=0;fontStyle=0;aspect=fixed;pointerEvents=1;"
        f"shape={shape};"
    )
    # Icon
    v(cells, f"{id}_ico", "", x, y, sz, sz, icon_style)
    # Label  (centred below icon)
    lbl_style = (
        "text;html=1;strokeColor=none;fillColor=none;"
        "align=center;verticalAlign=top;whiteSpace=wrap;"
        f"fontSize=9;fontStyle=1;fontColor=#232F3E;"
    )
    lbl_w = max(sz + 20, len(label) * 7)
    v(cells, f"{id}_lbl", label, x - (lbl_w - sz)//2, y + sz + 3, lbl_w, 20, lbl_style)
    # Invisible anchor for arrows (covers icon + label)
    anc_style = "opacity=0;fillColor=none;strokeColor=none;"
    v(cells, id, "", x - (lbl_w - sz)//2, y, lbl_w, sz + 24, anc_style)


def ext_box(cells, id, label, sublabel, x, y, w=120, h=70,
            fill="#e3f2fd", stroke="#1565c0"):
    """External source box (non-AWS)."""
    style = (f"rounded=1;arcSize=15;whiteSpace=wrap;html=1;"
             f"fillColor={fill};strokeColor={stroke};strokeWidth=2;"
             f"fontSize=10;fontStyle=1;fontColor=#1a1a1a;"
             f"verticalAlign=middle;align=center;")
    lbl = f"<b>{label}</b><br><font style='font-size:8px;font-weight:normal'>{sublabel}</font>"
    v(cells, id, lbl, x, y, w, h, style)


def flow_arrow(cells, id, src, tgt, label="",
               color="#232F3E", dashed=False, thick=False,
               ex=1, ey=0.5, nx=0, ny=0.5):
    dash = "dashed=1;dashPattern=6 3;" if dashed else "dashed=0;"
    sw   = "3" if thick else "2"
    style = (
        f"edgeStyle=orthogonalEdgeStyle;html=1;rounded=1;{dash}"
        f"strokeColor={color};strokeWidth={sw};"
        f"exitX={ex};exitY={ey};exitDx=0;exitDy=0;"
        f"entryX={nx};entryY={ny};entryDx=0;entryDy=0;"
        f"endArrow=block;endFill=1;"
        f"fontSize=9;fontColor={color};fontStyle=1;"
        f"labelBackgroundColor=#ffffff;labelBorderColor=none;"
    )
    e(cells, id, src, tgt, label, style)


def straight_arrow(cells, id, src, tgt, label="", color="#232F3E", dashed=False):
    dash = "dashed=1;dashPattern=6 3;" if dashed else "dashed=0;"
    style = (
        f"edgeStyle=orthogonalEdgeStyle;html=1;rounded=1;{dash}"
        f"strokeColor={color};strokeWidth=2;"
        f"endArrow=block;endFill=1;"
        f"fontSize=9;fontColor={color};fontStyle=1;"
        f"labelBackgroundColor=#ffffff;"
    )
    e(cells, id, src, tgt, label, style)


def title_bar(cells, id, text, x, y, w, h, fill, fc="#ffffff", fs=13):
    style = (f"rounded=1;arcSize=4;whiteSpace=wrap;html=1;"
             f"fillColor={fill};strokeColor={fill};strokeWidth=0;"
             f"fontSize={fs};fontStyle=1;fontColor={fc};"
             f"verticalAlign=middle;align=center;")
    v(cells, id, text, x, y, w, h, style)


def badge(cells, id, text, x, y, fill="#FF9900", fc="#ffffff"):
    style = (f"rounded=1;arcSize=50;whiteSpace=wrap;html=1;"
             f"fillColor={fill};strokeColor=none;"
             f"fontSize=8;fontStyle=1;fontColor={fc};"
             f"verticalAlign=middle;align=center;")
    v(cells, id, text, x, y, 60, 20, style)


# ─────────────────────────────────────────────────────────────────────────────
# BUILD THE DIAGRAM
# ─────────────────────────────────────────────────────────────────────────────

def build(cells):

    # ══════════════════════════════════════════════════════════════════════════
    # TITLE
    # ══════════════════════════════════════════════════════════════════════════
    title_bar(cells, "TITLE",
              "OnPoint Insights  |  AWS Data Lake Architecture  |  lake_deploy Platform  |  us-east-2",
              20, 10, 2760, 48, fill="#232F3E", fc="#ffffff", fs=14)

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 1 — EXTERNAL SOURCES  (outside AWS boundary)
    # ══════════════════════════════════════════════════════════════════════════
    zone(cells, "Z_EXT", "External Data Sources", 20, 68, 2760, 120,
         fill="#f9f9f9", stroke="#aaaaaa", fc="#555555", fs=10)

    ext_sources = [
        ("EXT_GAIIA",   "Gaiia",      "GraphQL API",    "#bbdefb", "#1565c0"),
        ("EXT_VETRO",   "VETRO",      "REST API",       "#bbdefb", "#1565c0"),
        ("EXT_PLATT",   "Platt",      "CSV / S3",       "#c8e6c9", "#2e7d32"),
        ("EXT_INTACCT", "Intacct",    "SOAP / XML",     "#d1c4e9", "#4527a0"),
        ("EXT_SF",      "Salesforce", "CRM / AppFlow",  "#ffccbc", "#bf360c"),
    ]
    ex = 80
    for eid, name, sub, fill, stroke in ext_sources:
        ext_box(cells, eid, name, sub, ex, 88, 120, 80, fill, stroke)
        ex += 530

    # ══════════════════════════════════════════════════════════════════════════
    # AWS CLOUD BOUNDARY
    # ══════════════════════════════════════════════════════════════════════════
    zone(cells, "Z_AWS", "", 20, 198, 2760, 1540,
         fill="#fafcff", stroke="#FF9900", fc="#FF9900", fs=12)
    badge(cells, "AWS_LBL", "AWS Cloud", 30, 205, fill="#FF9900", fc="#232F3E")

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 2 — INGESTION  (EventBridge + compute)
    # ══════════════════════════════════════════════════════════════════════════
    zone(cells, "Z_ING", "Ingestion & Scheduling", 35, 220, 2730, 200,
         fill="#f3e5f5", stroke="#6a1b9a", fc="#4a148c", fs=11)

    ing_svcs = [
        ("ING_EB",     "eventbridge", "EventBridge\nSchedules"),
        ("ING_LAMBDA", "lambda",      "Lambda\n(Gaiia / VETRO)"),
        ("ING_ECS",    "ecs",         "ECS Task\n(Intacct)"),
        ("ING_APPFLOW","appflow",     "AppFlow\n(Salesforce)"),
        ("ING_SQS",    "sqs",         "SQS DLQ\n(Rate-limit)"),
        ("ING_SM",     "secrets",     "Secrets\nManager"),
        ("ING_CF",     "cloudformation","CloudFormation\nIaC Stacks"),
    ]
    ix = 80
    for iid, svc, lbl in ing_svcs:
        aws_icon(cells, iid, svc, lbl, ix, 248, sz=52)
        ix += 370

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 3 — RAW LAYER  (S3 + Glue)
    # ══════════════════════════════════════════════════════════════════════════
    zone(cells, "Z_RAW", "Raw Layer  —  S3 Data Lake", 35, 435, 2730, 160,
         fill="#e8f5e9", stroke="#2e7d32", fc="#1b5e20", fs=11)

    raw_svcs = [
        ("RAW_S3",   "s3",    "Amazon S3\ngwi-raw-us-east-2-pc"),
        ("RAW_GLUE", "glue",  "AWS Glue\nData Catalog"),
    ]
    rx = 160
    for rid, svc, lbl in raw_svcs:
        aws_icon(cells, rid, svc, lbl, rx, 463, sz=60)
        rx += 420

    # S3 path summary label
    path_style = ("rounded=1;whiteSpace=wrap;html=1;"
                  "fillColor=#c8e6c9;strokeColor=#2e7d32;strokeWidth=1;"
                  "fontSize=9;fontStyle=0;fontColor=#1a2e1a;"
                  "verticalAlign=middle;align=left;spacingLeft=8;")
    v(cells, "RAW_PATHS",
      "<b>S3 Prefixes:</b>  raw/gaiia/ · raw/vetro/ · raw/platt/ · raw/intacct_xml/ · raw/intacct_json/ · raw/salesforce_prod_appflow/<br>"
      "curated_core/ · curated_recon/ · ssot/ · orchestration/&lt;source&gt;_daily/run_date= · vetro_export_state/",
      1000, 455, 1700, 130, path_style)

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 4 — QUERY ENGINE  (Athena)
    # ══════════════════════════════════════════════════════════════════════════
    zone(cells, "Z_QUERY", "Query Engine", 35, 608, 2730, 140,
         fill="#ede7f6", stroke="#6a1b9a", fc="#4a148c", fs=11)

    aws_icon(cells, "QE_ATHENA", "athena", "Amazon Athena\nServerless SQL", 160, 635, sz=60)

    athena_detail = ("rounded=1;whiteSpace=wrap;html=1;"
                     "fillColor=#e1bee7;strokeColor=#6a1b9a;strokeWidth=1;"
                     "fontSize=9;fontStyle=0;fontColor=#1a1a1a;"
                     "verticalAlign=middle;align=left;spacingLeft=8;")
    v(cells, "QE_DETAIL",
      "<b>Patterns:</b>  UNNEST · json_extract_scalar · ROW_NUMBER() dedup · CTAS for physical tables · Partition Projection<br>"
      "<b>Workgroup:</b>  primary (single — no cost isolation ⚠️)  ·  $5 / TB scanned  ·  Query Result Reuse: not enabled ⚠️",
      680, 622, 2030, 110, athena_detail)

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 5 — CURATED LAYER
    # ══════════════════════════════════════════════════════════════════════════
    zone(cells, "Z_CUR", "Curated Layer  —  Athena Views (92% Virtual) + Physical Parquet Tables",
         35, 760, 2730, 185,
         fill="#fff8e1", stroke="#e65100", fc="#bf360c", fs=11)

    cur_items = [
        ("CUR_GAIIA",   "Gaiia\nViews / Tables",   "#fff9c4", "#f9a825"),
        ("CUR_VETRO",   "VETRO\nViews / Tables",    "#fff9c4", "#f9a825"),
        ("CUR_PLATT",   "Platt\nViews / Tables",    "#fff9c4", "#f9a825"),
        ("CUR_INTACCT", "Intacct\nViews / Tables",  "#fff9c4", "#f9a825"),
        ("CUR_SF",      "Salesforce\nViews",        "#fff9c4", "#f9a825"),
        ("CUR_XW",      "Crosswalk &\nRecon Views", "#ffe0b2", "#e65100"),
    ]
    cur_s3 = ("rounded=1;arcSize=8;whiteSpace=wrap;html=1;"
              "fillColor={fill};strokeColor={stroke};strokeWidth=1.5;"
              "fontSize=9;fontStyle=1;fontColor=#1a1a1a;"
              "verticalAlign=middle;align=center;")
    cx = 55
    for cid, lbl, fill, stroke in cur_items:
        style = cur_s3.replace("{fill}", fill).replace("{stroke}", stroke)
        v(cells, cid, lbl, cx, 785, 420, 140, style)
        cx += 435

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 6 — SSOT LAYER  (S3 physical + Iceberg future)
    # ══════════════════════════════════════════════════════════════════════════
    zone(cells, "Z_SSOT", "SSOT Layer  —  18 Physical Tables (Single Source of Truth)",
         35, 958, 2730, 185,
         fill="#e0f2f1", stroke="#00695c", fc="#004d40", fs=11)

    ssot_items = [
        ("SSOT_ACCT",  "dim_account",  "#b2dfdb", "#00695c", "SF primary"),
        ("SSOT_LOC",   "dim_location", "#b2dfdb", "#00695c", "Vetro + Gaiia"),
        ("SSOT_ASSET", "dim_asset",    "#b2dfdb", "#00695c", "Vetro primary"),
        ("SSOT_PROD",  "dim_product",  "#b2dfdb", "#00695c", "SF / Platt"),
        ("SSOT_INV",   "dim_invoice",  "#a5d6a7", "#2e7d32", "Intacct ✅"),
        ("SSOT_PAY",   "dim_payment",  "#a5d6a7", "#2e7d32", "Intacct ✅"),
        ("SSOT_XW",    "Crosswalk\nxwalk_*", "#e0f7fa", "#00838f", "ID resolution"),
    ]
    sx = 55
    ssot_box = ("rounded=1;arcSize=8;whiteSpace=wrap;html=1;"
                "fillColor={fill};strokeColor={stroke};strokeWidth=1.5;"
                "fontSize=9;fontStyle=1;fontColor=#1a1a1a;"
                "verticalAlign=middle;align=center;")
    for sid, lbl, fill, stroke, sub in ssot_items:
        style = ssot_box.replace("{fill}", fill).replace("{stroke}", stroke)
        full_lbl = f"{lbl}<br><font style='font-size:8px;font-weight:normal'>{sub}</font>"
        v(cells, sid, full_lbl, sx, 983, 360, 140, style)
        sx += 373

    # ══════════════════════════════════════════════════════════════════════════
    # ROW 7 — OBSERVABILITY + CONSUMERS  (side by side)
    # ══════════════════════════════════════════════════════════════════════════

    # Observability (left 1500px)
    zone(cells, "Z_OBS", "Observability & Governance", 35, 1155, 1450, 175,
         fill="#eceff1", stroke="#546e7a", fc="#37474f", fs=11)

    obs_svcs = [
        ("OBS_CW",     "cloudwatch",     "CloudWatch"),
        ("OBS_CF2",    "cloudformation", "CloudFormation"),
        ("OBS_IAM",    "iam",            "IAM / OIDC"),
        ("OBS_SM2",    "secrets",        "Secrets Mgr"),
        ("OBS_SNS",    "sns",            "SNS Alerts"),
        ("OBS_AMPLIFY","amplify",        "Amplify"),
    ]
    ox = 65
    for oid, svc, lbl in obs_svcs:
        aws_icon(cells, oid, svc, lbl, ox, 1182, sz=46)
        ox += 235

    # Consumers (right 1260px)
    zone(cells, "Z_CON", "Consumers", 1510, 1155, 1255, 175,
         fill="#e3f2fd", stroke="#1565c0", fc="#0d47a1", fs=11)

    con_items = [
        ("CON_ANALYST", "🔎", "Athena\nAd-Hoc"),
        ("CON_DASH",    "📊", "Dashboards\n(Base44)"),
        ("CON_INV",     "📈", "Investor\nReports"),
        ("CON_API",     "🔌", "APIs /\nApps"),
        ("CON_DOCS",    "📝", "Notion /\nDocs"),
    ]
    con_style = ("rounded=1;arcSize=15;whiteSpace=wrap;html=1;"
                 "fillColor=#bbdefb;strokeColor=#1565c0;strokeWidth=1.5;"
                 "fontSize=10;fontStyle=1;fontColor=#0d47a1;"
                 "verticalAlign=middle;align=center;")
    conx = 1530
    for cid, ico, lbl in con_items:
        v(cells, cid, f"{ico}<br>{lbl}", conx, 1180, 220, 130, con_style)
        conx += 240

    # ══════════════════════════════════════════════════════════════════════════
    # FUTURE STATE SERVICES  (shown as a separate mini-row at bottom)
    # ══════════════════════════════════════════════════════════════════════════
    zone(cells, "Z_FUT", "Future State — Planned AWS Services",
         35, 1342, 2730, 175,
         fill="#e8f5e9", stroke="#1b5e20", fc="#1b5e20", fs=11)

    fut_svcs = [
        ("FUT_STEPFN",  "stepfn",       "Step Functions\nDAG Orchestration"),
        ("FUT_DYNAMO",  "dynamodb",     "DynamoDB\nCheckpoint Ledger"),
        ("FUT_ICEBERG", "iceberg",      "Apache Iceberg\n(SSOT Tables)"),
        ("FUT_SNS",     "sns",          "SNS\nDrift / DQ Alerts"),
        ("FUT_CF3",     "cloudformation","CloudFormation\n100% IaC Coverage"),
    ]
    fx = 130
    for fid, svc, lbl in fut_svcs:
        aws_icon(cells, fid, svc, lbl, fx, 1368, sz=56)
        fx += 520

    fut_note = ("rounded=1;whiteSpace=wrap;html=1;"
                "fillColor=#fff9c4;strokeColor=#f57f17;strokeWidth=1.5;"
                "fontSize=8.5;fontStyle=0;fontColor=#555;verticalAlign=middle;"
                "align=left;spacingLeft=6;")
    v(cells, "FUT_NOTE",
      "📌  Phase 0–1: Enable Athena Query Result Reuse · Materialise top-5 curated entities as Parquet · DynamoDB checkpoint ledger<br>"
      "📌  Phase 2–3: Step Functions DAG · Apache Iceberg SSOT · entity_spine UUID · Schema contracts · 100% CloudFormation IaC",
      2720 - 1100, 1410, 1080, 90, fut_note)

    # ══════════════════════════════════════════════════════════════════════════
    # DATA FLOW ARROWS
    # ══════════════════════════════════════════════════════════════════════════

    # External → EventBridge / Ingestion (top-level flow)
    for i, (src, lbl) in enumerate([
        ("EXT_GAIIA",   "GraphQL"),
        ("EXT_VETRO",   "REST"),
        ("EXT_PLATT",   "CSV"),
        ("EXT_INTACCT", "SOAP"),
        ("EXT_SF",      ""),
    ]):
        flow_arrow(cells, f"A_EXT_ING_{i}", src, "ING_EB",
                   color="#6a1b9a", ex=0.5, ey=1, nx=0.5, ny=0)

    # EventBridge → Lambda / ECS / AppFlow
    straight_arrow(cells, "A_EB_LAMBDA",  "ING_EB",     "ING_LAMBDA",  color="#6a1b9a")
    straight_arrow(cells, "A_EB_ECS",     "ING_EB",     "ING_ECS",     color="#6a1b9a")
    straight_arrow(cells, "A_EB_APPFLOW", "ING_EB",     "ING_APPFLOW", color="#6a1b9a")

    # Lambda → SQS (DLQ)
    straight_arrow(cells, "A_LAMBDA_SQS", "ING_LAMBDA", "ING_SQS",
                   label="429 DLQ", color="#c62828", dashed=True)

    # Secrets → Lambda / ECS
    straight_arrow(cells, "A_SM_LAMBDA",  "ING_SM",     "ING_LAMBDA",  color="#c62828", dashed=True)
    straight_arrow(cells, "A_SM_ECS",     "ING_SM",     "ING_ECS",     color="#c62828", dashed=True)

    # Ingestion → S3
    flow_arrow(cells, "A_ING_S3", "ING_LAMBDA", "RAW_S3",
               label="Write raw\nNDJSON / CSV", color="#2e7d32",
               ex=0.5, ey=1, nx=0.5, ny=0, thick=True)
    flow_arrow(cells, "A_ING_S3B", "ING_ECS", "RAW_S3",
               color="#2e7d32", ex=0.5, ey=1, nx=0.5, ny=0)
    flow_arrow(cells, "A_ING_S3C", "ING_APPFLOW", "RAW_S3",
               color="#2e7d32", ex=0.5, ey=1, nx=0.5, ny=0)

    # S3 → Glue Crawler
    straight_arrow(cells, "A_S3_GLUE", "RAW_S3", "RAW_GLUE",
                   label="Crawl schema", color="#2e7d32")

    # Glue → Athena (catalog)
    flow_arrow(cells, "A_GLUE_ATH", "RAW_GLUE", "QE_ATHENA",
               label="Schema catalog", color="#6a1b9a",
               ex=0.5, ey=1, nx=0.5, ny=0)

    # S3 → Athena (direct query)
    flow_arrow(cells, "A_S3_ATH", "RAW_S3", "QE_ATHENA",
               label="Query raw\n(CTAS / VIEW)", color="#6a1b9a",
               ex=0.9, ey=1, nx=0.1, ny=0, dashed=True)

    # Athena → Curated
    flow_arrow(cells, "A_ATH_CUR", "QE_ATHENA", "CUR_GAIIA",
               label="CREATE VIEW /\nCTAS Parquet", color="#e65100",
               ex=0.5, ey=1, nx=0.5, ny=0, thick=True)

    # Curated → SSOT
    flow_arrow(cells, "A_CUR_SSOT", "CUR_GAIIA", "SSOT_ACCT",
               label="INSERT /\nCTAS", color="#00695c",
               ex=0.5, ey=1, nx=0.5, ny=0, thick=True)

    # SSOT → Consumers
    flow_arrow(cells, "A_SSOT_CON", "SSOT_INV", "CON_DASH",
               label="Athena query\n→ Dashboard", color="#1565c0",
               ex=0.5, ey=1, nx=0.5, ny=0, thick=True)
    flow_arrow(cells, "A_SSOT_ANA", "SSOT_ACCT", "CON_ANALYST",
               color="#1565c0", ex=0.2, ey=1, nx=0.2, ny=0)

    # CloudWatch monitors everything
    straight_arrow(cells, "A_CW_ING",  "OBS_CW", "ING_LAMBDA",
                   label="Logs /\nMetrics", color="#aaaaaa", dashed=True)
    straight_arrow(cells, "A_CW_ATH",  "OBS_CW", "QE_ATHENA",
                   color="#aaaaaa", dashed=True)

    # Future Step Functions replaces EventBridge flow
    straight_arrow(cells, "A_FUT_FLOW", "FUT_STEPFN", "FUT_DYNAMO",
                   label="Checkpoint", color="#1b5e20", dashed=True)
    straight_arrow(cells, "A_FUT_ICE",  "FUT_DYNAMO", "FUT_ICEBERG",
                   color="#1b5e20", dashed=True)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    cells = []
    build(cells)

    model   = build_xml(cells)
    xml_str = ET.tostring(model, encoding="unicode")
    pretty  = minidom.parseString(xml_str).toprettyxml(indent="  ", encoding=None)
    lines   = [l for l in pretty.split("\n") if not l.startswith("<?xml")]
    final   = "\n".join(lines)

    drawio = (
        '<mxfile host="app.diagrams.net" modified="2026-02-23T00:00:00.000Z" '
        'agent="Claude" version="21.0.0" type="device">\n'
        '  <diagram id="aws-hl" name="AWS Architecture">\n'
        f'{final}\n'
        '  </diagram>\n'
        '</mxfile>'
    )

    out = ("/Users/vinaymistry/Library/CloudStorage/OneDrive-OnPointInsightsLLC"
           "/GitRepo/lake_deploy/.claude/worktrees/silly-leavitt/"
           "lake_deploy_aws_highlevel.drawio")

    with open(out, "w", encoding="utf-8") as f:
        f.write(drawio)

    # Validate
    import os, xml.etree.ElementTree as ET2
    tree     = ET2.parse(out)
    all_c    = tree.findall(".//mxCell")
    all_ids  = {c.get("id") for c in all_c}
    edges    = [c for c in all_c if c.get("edge") == "1"]
    vertices = [c for c in all_c if c.get("vertex") == "1"]
    broken   = [f"{e.get('id')} → {e.get(a)}"
                for e in edges for a in ("source","target")
                if e.get(a) and e.get(a) not in all_ids]

    print(f"✅  Saved : {out}")
    print(f"    Size  : {os.path.getsize(out)//1024} KB")
    print(f"    Shapes: {len(vertices)}  |  Arrows: {len(edges)}  |  Dangling: {len(broken)} {'✅' if not broken else '❌'}")
    if broken:
        for b in broken: print(f"      ⚠️  {b}")
    print()
    print("    → Open draw.io  →  File → Open from Device")
    print("    → Press Ctrl+Shift+H (Fit Page) to see full diagram")

if __name__ == "__main__":
    main()
