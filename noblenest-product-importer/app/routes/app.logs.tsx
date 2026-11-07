import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { LogLevel } from "@prisma/client";
import db from "../db.server";
import { requireShop } from "../services/shop.server";
import { formatDateTime, LOG_LEVEL } from "../lib/format";

const PAGE_SIZE = 50;
const LEVELS: LogLevel[] = ["INFO", "WARNING", "ERROR"];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop } = await requireShop(request);
  const url = new URL(request.url);
  const levelParam = url.searchParams.get("niveau")?.toUpperCase();
  const level = LEVELS.includes(levelParam as LogLevel) ? (levelParam as LogLevel) : null;
  const before = url.searchParams.get("voor");

  const beforeRow = before ? await db.auditLog.findFirst({ where: { id: before, shopId: shop.id }, select: { createdAt: true } }) : null;
  const logs = await db.auditLog.findMany({
    where: { shopId: shop.id, ...(level ? { level } : {}), ...(beforeRow ? { createdAt: { lt: beforeRow.createdAt } } : {}) },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
  });
  const hasMore = logs.length > PAGE_SIZE;
  const page = logs.slice(0, PAGE_SIZE);
  return {
    level,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    logs: page.map((l) => ({ id: l.id, level: l.level, action: l.action, message: l.message, createdAt: l.createdAt.toISOString() })),
  };
};

export default function LogsPage() {
  const { logs, level, nextCursor } = useLoaderData<typeof loader>();
  const filters: { label: string; value: string | null }[] = [
    { label: "Alles", value: null },
    { label: "Info", value: "INFO" },
    { label: "Waarschuwingen", value: "WARNING" },
    { label: "Fouten", value: "ERROR" },
  ];

  return (
    <s-page heading="Logboeken" inlineSize="large">
      <s-section padding="base">
        <s-stack direction="inline" gap="small-200">
          {filters.map((f) => (
            <s-button key={f.label} variant={level === f.value ? "primary" : "secondary"} href={f.value ? `/app/logs?niveau=${f.value}` : "/app/logs"}>
              {f.label}
            </s-button>
          ))}
        </s-stack>
      </s-section>
      <s-section padding="none">
        {logs.length === 0 ? (
          <s-box padding="base">
            <s-paragraph color="subdued">Nog geen logregels.</s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Tijdstip</s-table-header>
              <s-table-header>Niveau</s-table-header>
              <s-table-header listSlot="primary">Melding</s-table-header>
              <s-table-header>Actie</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {logs.map((log) => (
                <s-table-row key={log.id}>
                  <s-table-cell>{formatDateTime(log.createdAt)}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={LOG_LEVEL[log.level]?.tone}>{LOG_LEVEL[log.level]?.label}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{log.message}</s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">{log.action}</s-text>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      {nextCursor ? (
        <s-button href={`/app/logs?${new URLSearchParams({ ...(level ? { niveau: level } : {}), voor: nextCursor })}`}>Oudere regels</s-button>
      ) : null}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
