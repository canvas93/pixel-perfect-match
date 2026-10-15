import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/**
 * Agents can emit charts as a fenced block:
 * ```chart
 * {"type":"bar","title":"Sales","xKey":"month","series":["revenue"],"data":[{"month":"Jan","revenue":10}]}
 * ```
 */
export type ChartSpec = {
  type: "bar" | "line" | "area" | "pie";
  title?: string;
  xKey: string;
  series: string[];
  data: Record<string, any>[];
};

export function parseChartSpec(raw: string, explicit: boolean): ChartSpec | null {
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j?.data) || !j.data.length) return null;
    if (!explicit && !j.type) return null;
    const first = j.data[0];
    const xKey = j.xKey ?? j.x ?? Object.keys(first).find((k) => typeof first[k] === "string") ?? Object.keys(first)[0];
    const series: string[] =
      j.series ?? j.y ?? (j.yKey ? [j.yKey] : Object.keys(first).filter((k) => k !== xKey && typeof first[k] === "number"));
    return { type: ["bar", "line", "area", "pie"].includes(j.type) ? j.type : "bar", title: j.title, xKey, series: [].concat(series as any), data: j.data };
  } catch {
    return null;
  }
}

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" } };

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  const axis = { stroke: "var(--muted-foreground)", fontSize: 12 };
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey={spec.xKey} {...axis} />
      <YAxis {...axis} />
      <Tooltip {...tip} />
      {spec.series.length > 1 && <Legend />}
    </>
  );
  return (
    <div className="rounded-xl border bg-card p-4">
      {spec.title && <div className="mb-3 text-sm font-semibold">{spec.title}</div>}
      <div className="h-64 w-full">
        <ResponsiveContainer>
          {spec.type === "pie" ? (
            <PieChart>
              <Tooltip {...tip} />
              <Legend />
              <Pie data={spec.data} dataKey={spec.series[0] ?? "value"} nameKey={spec.xKey} outerRadius={90} innerRadius={45}>
                {spec.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </PieChart>
          ) : spec.type === "line" ? (
            <LineChart data={spec.data}>{common}{spec.series.map((s, i) => <Line key={s} dataKey={s} stroke={COLORS[i % 5]} strokeWidth={2} dot={false} />)}</LineChart>
          ) : spec.type === "area" ? (
            <AreaChart data={spec.data}>{common}{spec.series.map((s, i) => <Area key={s} dataKey={s} stroke={COLORS[i % 5]} fill={COLORS[i % 5]} fillOpacity={0.25} />)}</AreaChart>
          ) : (
            <BarChart data={spec.data}>{common}{spec.series.map((s, i) => <Bar key={s} dataKey={s} fill={COLORS[i % 5]} radius={[4, 4, 0, 0]} />)}</BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
