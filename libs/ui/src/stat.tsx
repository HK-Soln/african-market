import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: IconName;
  /** A line under the number, e.g. "+12% on last week"; `trend` colours it. */
  delta?: ReactNode;
  trend?: 'up' | 'down';
  className?: string;
}

/** One number that matters, with what it counts. */
export function StatCard({ label, value, icon, delta, trend, className }: StatCardProps) {
  return (
    <div className={cx('am-stat', className)}>
      <p className="am-stat-label">
        {icon && <Icon name={icon} size={18} />}
        {label}
      </p>
      <p className="am-stat-value">{value}</p>
      {delta && (
        <p
          className={cx('am-stat-delta', trend === 'up' && 'am-up', trend === 'down' && 'am-down')}
        >
          {delta}
        </p>
      )}
    </div>
  );
}

export interface ChartSeries {
  key: string;
  label: string;
  /** A token colour, e.g. `var(--color-chart-1)`. */
  color: string;
}

export interface ChartColumn {
  /** Says the whole column, for screen readers and the hover title: "Mon 12 Oct". */
  label: string;
  /** Shown under the column; leave empty to keep the axis uncluttered. */
  axisLabel?: string;
  values: Record<string, number>;
}

export interface BarChartProps {
  title: string;
  series: ChartSeries[];
  columns: ChartColumn[];
  /** Height of the bars' area in px. */
  height?: number;
  className?: string;
}

/**
 * Stacked columns, oldest first in the reading direction. The bars are hidden from screen readers,
 * which get the same numbers as a table.
 */
export function BarChart({ title, series, columns, height = 160, className }: BarChartProps) {
  const totals = columns.map((c) => series.reduce((sum, s) => sum + (c.values[s.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  return (
    <figure className={cx('am-chart', className)}>
      <figcaption className="am-chart-title">{title}</figcaption>
      <div className="am-chart-legend" aria-hidden>
        {series.map((s) => (
          <span key={s.key}>
            <i className="am-swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div
        className="am-chart-plot"
        style={{ height, gap: columns.length > 14 ? 2 : undefined }}
        aria-hidden
      >
        {columns.map((c, i) => (
          <div
            key={c.label}
            className="am-chart-col"
            title={`${c.label}: ${series.map((s) => `${s.label} ${c.values[s.key] ?? 0}`).join(', ')}`}
          >
            <div className="am-chart-stack" style={{ height: `${(totals[i] / max) * 100}%` }}>
              {series.map((s) =>
                c.values[s.key] ? (
                  <span
                    key={s.key}
                    style={{ background: s.color, flexGrow: c.values[s.key], flexBasis: 0 }}
                  />
                ) : null,
              )}
            </div>
            {c.axisLabel && <span className="am-chart-x">{c.axisLabel}</span>}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <td />
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((c) => (
            <tr key={c.label}>
              <th scope="row">{c.label}</th>
              {series.map((s) => (
                <td key={s.key}>{c.values[s.key] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
