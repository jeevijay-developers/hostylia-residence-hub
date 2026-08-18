import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInr } from "@/lib/finance";

/**
 * Chart colors are pulled from the semantic Design.md tokens
 * (success/warning/destructive/info) — never brand teal for status series.
 */
const TOKEN = {
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  info: "var(--info)",
  muted: "var(--muted-foreground)",
};

export function OccupancyChart({
  data,
}: {
  data: Array<{ block_name: string; occupancy_pct: number }>;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="block_name" tick={{ fontSize: 12 }} />
          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <Bar dataKey="occupancy_pct" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.occupancy_pct >= 85
                    ? TOKEN.success
                    : d.occupancy_pct >= 60
                      ? TOKEN.info
                      : d.occupancy_pct >= 40
                        ? TOKEN.warning
                        : TOKEN.destructive
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DsoChart({ aging }: { aging: Record<string, number> }) {
  const data = [
    { bucket: "Current", value: aging.current ?? 0, color: TOKEN.success },
    { bucket: "0-30", value: aging["0-30"] ?? 0, color: TOKEN.info },
    { bucket: "31-60", value: aging["31-60"] ?? 0, color: TOKEN.warning },
    { bucket: "60+", value: aging["60+"] ?? 0, color: TOKEN.destructive },
  ];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatInr(v)} width={80} />
          <Tooltip formatter={(v: number) => formatInr(v)} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AttendanceChart({
  data,
}: {
  data: Array<{ full_name: string; attendance_pct: number | null }>;
}) {
  const clean = data.filter((d) => d.attendance_pct !== null) as Array<{
    full_name: string;
    attendance_pct: number;
  }>;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={clean}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="full_name" tick={{ fontSize: 12 }} hide={clean.length > 15} />
          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <Bar dataKey="attendance_pct" radius={[4, 4, 0, 0]}>
            {clean.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.attendance_pct >= 90
                    ? TOKEN.success
                    : d.attendance_pct >= 75
                      ? TOKEN.info
                      : d.attendance_pct >= 50
                        ? TOKEN.warning
                        : TOKEN.destructive
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SlaComplianceChart({
  data,
}: {
  data: Array<{ category_name: string; sla_compliance_pct: number | null }>;
}) {
  const clean = data.filter((d) => d.sla_compliance_pct !== null) as Array<{
    category_name: string;
    sla_compliance_pct: number;
  }>;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={clean}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="category_name" tick={{ fontSize: 12 }} />
          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v: number) => `${v}%`} />
          <Bar dataKey="sla_compliance_pct" radius={[4, 4, 0, 0]}>
            {clean.map((d, i) => (
              <Cell
                key={i}
                fill={
                  d.sla_compliance_pct >= 90
                    ? TOKEN.success
                    : d.sla_compliance_pct >= 75
                      ? TOKEN.info
                      : d.sla_compliance_pct >= 50
                        ? TOKEN.warning
                        : TOKEN.destructive
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
