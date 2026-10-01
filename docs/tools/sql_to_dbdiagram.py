#!/usr/bin/env python3
"""Generate dbdiagram.io DBML + simplified SQL from Aegis baseline migration."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "services" / "aegis-api" / "migrations" / "001_baseline.sql"
OUT_DBML = ROOT / "services" / "aegis-api" / "migrations" / "001_baseline.dbml"
OUT_SQL = ROOT / "services" / "aegis-api" / "migrations" / "001_baseline.dbdiagram.sql"

PG_TO_DBML = {
    "UUID": "uuid",
    "TEXT": "text",
    "TIMESTAMPTZ": "timestamptz",
    "BOOLEAN": "boolean",
    "JSONB": "jsonb",
    "INT": "int",
    "INTEGER": "int",
    "BIGINT": "bigint",
    "REAL": "float",
    "DOUBLE PRECISION": "double",
    "DATE": "date",
    "BYTEA": "blob",
    "tsvector": "text",
    "TEXT[]": "text",
}

TABLE_GROUPS = {
    "organization": "core_identity",
    "account": "core_identity",
    "membership": "core_identity",
    "organization_invitation": "core_identity",
    "session": "core_identity",
    "password_reset_token": "core_identity",
    "email_verification_token": "core_identity",
    "account_oauth": "core_identity",
    "organization_sso": "core_identity",
    "account_login_event": "core_identity",
    "ingest_api_key": "ingest",
    "idempotency_record": "ingest",
    "agent": "aegis_agents",
    "signing_key": "aegis_agents",
    "did_document": "aegis_agents",
    "policy": "aegis_policy",
    "policy_rule": "aegis_policy",
    "approval_channel": "aegis_policy",
    "trace": "aegis_ledger",
    "span": "aegis_ledger",
    "event": "aegis_ledger",
    "approval": "aegis_ledger",
    "merkle_root": "aegis_witness",
    "inclusion_proof": "aegis_witness",
    "transparency_log_entry": "aegis_witness",
    "artifact": "aegis_integrations",
    "compliance_export": "aegis_integrations",
    "compliance_export_schedule": "aegis_integrations",
    "siem_destination": "aegis_integrations",
    "webhook_endpoint": "aegis_integrations",
    "anomaly_score": "aegis_analytics",
    "insurance_metric": "aegis_analytics",
    "audit_log": "platform_ops",
    "plan_catalog": "billing",
    "organization_usage_monthly": "billing",
    "organization_billing_event": "billing",
    "workflow_run": "workflows",
    "worker_run": "workflows",
    "contact_messages": "web_cms",
    "marketing_blog_posts": "web_cms",
    "blog_engagement_events": "web_cms",
    "research_posts": "web_cms",
    "open_roles": "web_cms",
    "newsletter_subscribers": "web_cms",
    "newsletter_campaigns": "web_cms",
    "newsletter_campaign_deliveries": "web_cms",
}

GROUP_LABELS = {
    "core_identity": "Core identity",
    "ingest": "Ingest",
    "aegis_agents": "Aegis agents and keys",
    "aegis_policy": "Aegis policy",
    "aegis_ledger": "Aegis traces and events",
    "aegis_witness": "Aegis witness",
    "aegis_integrations": "Aegis exports and webhooks",
    "aegis_analytics": "Aegis analytics",
    "platform_ops": "Platform audit",
    "billing": "Billing and plans",
    "workflows": "Workflows and workers",
    "web_cms": "Web CMS",
}


def extract_create_tables(sql: str) -> list[tuple[str, str]]:
    pattern = re.compile(
        r"CREATE TABLE\s+(\w+)\s*\((.*?)\)\s*;",
        re.DOTALL | re.IGNORECASE,
    )
    return [(m.group(1), m.group(2)) for m in pattern.finditer(sql)]


def strip_table_body(body: str) -> str:
    lines: list[str] = []
    skip = False
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.upper().startswith("CHECK"):
            skip = True
            _ensure_trailing_comma(lines)
            if ")" in line and line.count("(") <= line.count(")"):
                skip = False
            continue
        if skip:
            if ")" in line:
                skip = False
            continue
        if "GENERATED ALWAYS" in line.upper():
            _ensure_trailing_comma(lines)
            continue
        if line.upper().startswith("CONSTRAINT ") and "CHECK" in line.upper():
            continue
        lines.append(raw)
    return "\n".join(lines)


def _ensure_trailing_comma(lines: list[str]) -> None:
    if not lines:
        return
    prev = lines[-1].rstrip()
    if prev.endswith(","):
        return
    lines[-1] = prev + ","


def simplify_for_dbdiagram_sql(name: str, body: str) -> str:
    body = strip_table_body(body)
    return f"CREATE TABLE {name} (\n{body}\n);"


def map_type(pg_type: str) -> str:
    pg_type = re.sub(r"\s+", " ", pg_type.strip().upper())
    for key, val in PG_TO_DBML.items():
        if pg_type.startswith(key.upper()):
            return val
    return "text"


def parse_columns(body: str) -> list[dict]:
    body = strip_table_body(body)
    cols: list[dict] = []
    composite_pk: list[str] = []

    for raw in body.splitlines():
        line = raw.strip().rstrip(",")
        if not line or line.upper().startswith("UNIQUE "):
            continue
        if line.upper().startswith("PRIMARY KEY ("):
            inner = line[line.index("(") + 1 : line.rindex(")")]
            composite_pk = [p.strip() for p in inner.split(",")]
            continue

        m_ref = re.match(
            r"^(\w+)\s+(\w+(?:\[\])?)\s+(.*)$",
            line,
            re.IGNORECASE,
        )
        if not m_ref:
            continue

        col_name, type_raw, rest = m_ref.group(1), m_ref.group(2), m_ref.group(3)
        if col_name.upper() in ("CONSTRAINT", "PRIMARY", "UNIQUE", "FOREIGN"):
            continue

        col: dict = {
            "name": col_name,
            "type": map_type(type_raw),
            "pk": False,
            "not_null": "NOT NULL" in rest.upper(),
            "ref": None,
        }

        if "PRIMARY KEY" in rest.upper():
            col["pk"] = True

        ref_m = re.search(
            r"REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)",
            rest,
            re.IGNORECASE,
        )
        if ref_m:
            col["ref"] = (ref_m.group(1), ref_m.group(2))

        cols.append(col)

    if composite_pk:
        for c in cols:
            if c["name"] in composite_pk:
                c["pk"] = True

    return cols


def emit_dbml(tables: list[tuple[str, str]]) -> str:
    refs: list[str] = []
    blocks: list[str] = []
    blocks.append("// Generated from 001_baseline.sql — import at https://dbdiagram.io")
    blocks.append("// Project > Import > DBML\n")

    for group_id, label in GROUP_LABELS.items():
        group_tables = [tname for tname, _ in tables if TABLE_GROUPS.get(tname) == group_id]
        if not group_tables:
            continue
        blocks.append(f"// {label}")
        blocks.append(f"TableGroup {group_id} {{")
        for tname in group_tables:
            blocks.append(f"  {tname}")
        blocks.append("}\n")

    seen_refs: set[str] = set()

    for tname, body in tables:
        cols = parse_columns(body)
        if not cols:
            continue
        lines = [f"Table {tname} {{"]
        for c in cols:
            attrs: list[str] = []
            if c["pk"]:
                attrs.append("pk")
            if c["not_null"] and not c["pk"]:
                attrs.append("not null")
            attr_str = f" [{', '.join(attrs)}]" if attrs else ""
            lines.append(f"  {c['name']} {c['type']}{attr_str}")
            if c["ref"]:
                rt, rc = c["ref"]
                key = f"{tname}.{c['name']} > {rt}.{rc}"
                if key not in seen_refs:
                    seen_refs.add(key)
                    refs.append(f"Ref: {tname}.{c['name']} > {rt}.{rc}")
        lines.append("}\n")
        blocks.extend(lines)

    blocks.extend(refs)
    return "\n".join(blocks) + "\n"


def main() -> int:
    sql = SRC.read_text(encoding="utf-8")
    tables = extract_create_tables(sql)
    if not tables:
        print("No CREATE TABLE found", file=sys.stderr)
        return 1

    dbml = emit_dbml(tables)
    OUT_DBML.write_text(dbml, encoding="utf-8")

    sql_parts = [
        "-- dbdiagram.io: Import > PostgreSQL (or paste below)",
        "-- Source: 001_baseline.sql (CREATE TABLE only, simplified)",
        "",
    ]
    for name, body in tables:
        sql_parts.append(simplify_for_dbdiagram_sql(name, body))
        sql_parts.append("")
    OUT_SQL.write_text("\n".join(sql_parts), encoding="utf-8")

    print(f"Wrote {OUT_DBML} ({len(tables)} tables)")
    print(f"Wrote {OUT_SQL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
