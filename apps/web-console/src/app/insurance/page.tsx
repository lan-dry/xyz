"use client";

import { useQuery } from "@tanstack/react-query";

import {
  ConsolePage,
  EmptyState,
  LoadingBlock,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { insuranceApi } from "@/lib/insurance-api";

type Overview = {
  product: string;
  organization_id: string;
  metrics: unknown[];
  scaffold: boolean;
  note?: string;
};

export default function InsuranceOverviewPage() {
  const overview = useQuery({
    queryKey: ["insurance", "overview"],
    queryFn: () => insuranceApi<Overview>("/console/overview"),
  });

  return (
    <ConsolePage>
      <PageHeader
        title="Insurance"
        subtitle="Risk metrics and reinsurance bridge (preview). Built on the same Salanor identity and ledger as Aegis."
      />

      {overview.isPending ? <LoadingBlock /> : null}
      {overview.isError ? (
        <>
          <div className={`${ui.alert} ${ui.alertInfo}`}>
            Insurance API is not connected in this environment yet. Preview UI only —
            risk metrics will appear here once the insurance service is deployed.
          </div>
          <div className={ui.statGrid}>
            <div className={`${ui.card} ${ui.cardPad}`}>
              <p className={ui.cardTitle}>Metrics</p>
              <p className={ui.cardValue}>—</p>
              <p className={ui.cardHint}>Awaiting service</p>
            </div>
            <div className={`${ui.card} ${ui.cardPad}`}>
              <p className={ui.cardTitle}>Product</p>
              <p className={ui.cardValue} style={{ fontSize: "1.25rem" }}>
                insurance
              </p>
              <p className={ui.cardHint}>Stage 11 scaffold</p>
            </div>
          </div>
          <div className={ui.tableWrap}>
            <EmptyState
              title="Preview — no live metrics"
              description="Aegis ledger identity is shared. Connect INSURANCE_API_URL to a running insurance service to load organization-scoped risk data."
            />
          </div>
        </>
      ) : null}

      {overview.data ? (
        <>
          {overview.data.note ? (
            <div className={`${ui.alert} ${ui.alertInfo}`}>{overview.data.note}</div>
          ) : null}
          <div className={ui.statGrid}>
            <div className={`${ui.card} ${ui.cardPad}`}>
              <p className={ui.cardTitle}>Metrics</p>
              <p className={ui.cardValue}>{overview.data.metrics.length}</p>
              <p className={ui.cardHint}>Organization-scoped (preview)</p>
            </div>
            <div className={`${ui.card} ${ui.cardPad}`}>
              <p className={ui.cardTitle}>Product</p>
              <p className={ui.cardValue} style={{ fontSize: "1.25rem" }}>
                {overview.data.product}
              </p>
              <p className={ui.cardHint}>Stage 11 scaffold</p>
            </div>
          </div>
          {overview.data.metrics.length === 0 ? (
            <div className={ui.tableWrap}>
              <EmptyState
                title="No insurance metrics yet"
                description="Telemetry exports from Aegis will feed this product in later phases."
              />
            </div>
          ) : (
            <pre className={ui.pre}>{JSON.stringify(overview.data, null, 2)}</pre>
          )}
        </>
      ) : null}
    </ConsolePage>
  );
}
