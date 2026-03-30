import re, os
from pathlib import Path

WORKDIR=os.getcwd()
DB=os.environ["DB"]
BASE=os.environ["BASE"]
DT_START=os.environ.get("DT_START","2000-01-01")
TABLES=os.environ["TABLES"].split(",")

def sanitize(name: str) -> str:
    name=name.strip().strip('"')
    name=re.sub(r'[^A-Za-z0-9_]', '_', name)
    if not name:
        name="col"
    if re.match(r'^[0-9]', name):
        name="c_"+name
    return name.lower()

def parse_header(line: str):
    out=[]; cur=""; inq=False
    for ch in line:
        if ch=='"':
            inq=not inq
        elif ch==',' and not inq:
            out.append(cur); cur=""
        else:
            cur+=ch
    out.append(cur)
    cols=[]; seen=set()
    for c in out:
        s=sanitize(c)
        if s in seen:
            k=2
            while f"{s}_{k}" in seen:
                k+=1
            s=f"{s}_{k}"
        seen.add(s)
        cols.append(s)
    return cols

ddls=[f"CREATE DATABASE IF NOT EXISTS {DB};\n"]
for t in TABLES:
    header_path=f"{WORKDIR}/headers/{t}.header"
    if not os.path.exists(header_path):
        raise SystemExit(f"Missing header file: {header_path}")
    header=open(header_path,"r",encoding="utf-8").read().strip()
    cols=parse_header(header)

    cols_sql=",\n  ".join([f'"{c}" string' for c in cols])
    table_name=f"{DB}_{t}"

    ddls.append(f"""CREATE TABLE IF NOT EXISTS {DB}.{table_name} (
  {cols_sql}
)
PARTITIONED BY (dt string)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES (
  'separatorChar' = ',',
  'quoteChar' = '\"',
  'escapeChar' = '\\\\'
)
STORED AS TEXTFILE
LOCATION '{BASE}/{t}/'
TBLPROPERTIES (
  'skip.header.line.count'='1',
  'projection.enabled'='true',
  'projection.dt.type'='date',
  'projection.dt.format'='yyyy-MM-dd',
  'projection.dt.range'='{DT_START},NOW',
  'storage.location.template'='{BASE}/{t}/dt=${{dt}}/'
);
""")

open('ddls.sql','w',encoding='utf-8').write('\n'.join(ddls))
print(Path('ddls.sql').absolute())
