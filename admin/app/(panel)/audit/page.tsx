"use client";

import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate } from "@/lib/format";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";

export default function AuditPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => auditApi.list(100),
  });

  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message={apiError(error)} />;
  if (!data || data.length === 0)
    return <EmptyState message="Hali audit yozuvlari yo'q." />;

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b bg-gray-50/60">
              <th className="px-4 py-3 font-medium">Sana</th>
              <th className="px-4 py-3 font-medium">Amal</th>
              <th className="px-4 py-3 font-medium">Obyekt</th>
              <th className="px-4 py-3 font-medium">Yangi qiymat</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {data.map((log) => (
              <tr key={log.id} className="border-b last:border-0 align-top">
                <td className="px-4 py-3 whitespace-nowrap text-muted">
                  {formatDate(log.created_at)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="blue">{log.action}</Badge>
                </td>
                <td className="px-4 py-3">
                  {log.entity_type ?? "—"}
                  {log.entity_id ? (
                    <span className="text-muted font-mono text-xs">
                      {" "}
                      {log.entity_id.slice(0, 8)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <code className="text-xs text-muted break-words">
                    {log.new_value ? JSON.stringify(log.new_value) : "—"}
                  </code>
                </td>
                <td className="px-4 py-3 text-muted">{log.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
