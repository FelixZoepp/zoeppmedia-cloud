'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import { CountUp } from './motion';

interface StatCardProps {
  title: string;
  /** Zahl → zählt hoch; Text → wird direkt angezeigt */
  value: number | string;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  note?: ReactNode;
  /** Veränderung in % – positiv/negativ bestimmt Pfeil */
  trend?: number;
  trendLabel?: string;
  /** Dunkelroter Verlauf (erste Karte im Fernly-Dashboard) */
  hero?: boolean;
  href?: string;
  /** Werte für die kleine Flächenkurve unten */
  spark?: number[];
  icon?: ReactNode;
  className?: string;
}

function Sparkline({ values, hero }: { values: number[]; hero?: boolean }) {
  if (values.length < 2) return null;
  const w = 300;
  const h = 56;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 6 - ((v - min) / span) * (h - 16)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const stroke = hero ? '#f7c9c5' : '#a3201a';
  const fill = hero ? '#f7c9c533' : '#fbe3e1';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="-mx-[22px] -mb-[22px] mt-4 block h-14 w-[calc(100%+44px)]" aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function StatCard({
  title,
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  note,
  trend,
  trendLabel,
  hero = false,
  href,
  spark,
  icon,
  className = '',
}: StatCardProps) {
  const up = (trend ?? 0) >= 0;
  const arrowCls = hero
    ? 'bg-red-50 text-red-950 hover:bg-red-300'
    : 'shadow-[inset_0_0_0_1.5px_currentColor] text-ink hover:bg-ink hover:text-card hover:shadow-none';

  return (
    <div
      data-rise=""
      className={`fx-lift relative flex min-h-[178px] min-w-0 flex-col overflow-hidden rounded-xl p-[22px] ${
        hero ? 'fx-hero' : 'bg-card shadow-sm'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.015em]">
          {icon && <span className={hero ? 'text-red-200' : 'text-red-700'}>{icon}</span>}
          {title}
        </div>
        {href && (
          <Link
            href={href}
            aria-label={`${title} öffnen`}
            className={`grid h-[38px] w-[38px] flex-none place-items-center rounded-full transition-[transform,background,color] duration-300 ease-fern hover:rotate-45 ${arrowCls}`}
          >
            <ArrowUpRight className="h-[18px] w-[18px]" />
          </Link>
        )}
      </div>

      <div className="mb-2.5 mt-auto pt-[18px] text-[clamp(40px,3.6vw,54px)] font-semibold leading-none tracking-[-0.04em]">
        {typeof value === 'number' ? <CountUp value={value} decimals={decimals} prefix={prefix} suffix={suffix} /> : value}
      </div>

      {(trend !== undefined || note) && (
        <div className={`flex items-center gap-2 text-[13.5px] ${hero ? 'text-red-200' : 'text-gray-600'}`}>
          {trend !== undefined && (
            <span
              className={`inline-flex items-center gap-px rounded-[5px] px-1 text-[10.5px] leading-4 shadow-[inset_0_0_0_1px_currentColor] ${
                hero ? 'text-red-100' : up ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {Math.abs(trend).toLocaleString('de-DE', { maximumFractionDigits: 1 })}%
              {up ? <ChevronUp className="h-2.5 w-2.5" strokeWidth={2.6} /> : <ChevronDown className="h-2.5 w-2.5" strokeWidth={2.6} />}
            </span>
          )}
          {trendLabel && <span>{trendLabel}</span>}
          {note && <span>{note}</span>}
        </div>
      )}

      {spark && <Sparkline values={spark} hero={hero} />}
    </div>
  );
}
