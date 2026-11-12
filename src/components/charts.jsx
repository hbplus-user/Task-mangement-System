import React, { useState } from 'react';

function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, text) => setTip({ x: e.clientX + 12, y: e.clientY - 34, text });
  const hide = () => setTip(null);
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  ) : null;
  return { show, hide, node };
}

const niceMax = (m) => {
  if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

// Vertical bars, one series. data: [{label, value, tip}]
export function ColumnChart({ data, height = 200, color = 'var(--primary)', unit = '', max }) {
  const { show, hide, node } = useTip();
  const W = 600;
  const H = height;
  const pad = { l: 34, r: 8, t: 10, b: 26 };
  const top = max ?? niceMax(Math.max(...data.map((d) => d.value), 0));
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img">
        <g className="grid">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} />
              <text x={pad.l - 6} y={y(top * f) + 4} textAnchor="end">
                {Math.round(top * f)}
                {unit}
              </text>
            </g>
          ))}
        </g>
        {data.map((d, i) => {
          const h = Math.max(0, y(0) - y(d.value));
          const x = pad.l + i * bw + bw * 0.2;
          const w = bw * 0.6;
          return (
            <g key={i} onMouseMove={(e) => show(e, d.tip || `${d.label}: ${d.value}${unit}`)} onMouseLeave={hide}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              <path d={h > 0 ? `M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z` : ''} fill={d.color || color} />
              <text x={x + w / 2} y={H - 8} textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {node}
    </>
  );
}

// One line, optional target reference line. data: [{label, value}]
export function LineChart({ data, height = 200, color = 'var(--primary)', unit = '', max, target, targetLabel }) {
  const { show, hide, node } = useTip();
  const [hover, setHover] = useState(null);
  const W = 600;
  const H = height;
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const vals = data.map((d) => d.value).filter((v) => v != null);
  const top = max ?? niceMax(Math.max(...vals, target || 0, 1));
  const x = (i) => pad.l + (data.length <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (data.length - 1));
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const pts = data.map((d, i) => (d.value == null ? null : [x(i), y(d.value)])).filter(Boolean);
  return (
    <>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        onMouseLeave={() => {
          setHover(null);
          hide();
        }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1))));
          setHover(i);
          const d = data[i];
          show(e, `${d.label}: ${d.value == null ? '—' : d.value + unit}`);
        }}
      >
        <g className="grid">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y(top * f)} y2={y(top * f)} />
              <text x={pad.l - 6} y={y(top * f) + 4} textAnchor="end">
                {Math.round(top * f)}
                {unit}
              </text>
            </g>
          ))}
        </g>
        {target != null && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--gold)" strokeDasharray="5 4" strokeWidth="1.5" />
            <text x={W - pad.r} y={y(target) - 5} textAnchor="end">
              {targetLabel || `Target ${target}${unit}`}
            </text>
          </g>
        )}
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--line)" />}
        {data.map((d, i) =>
          d.value == null ? null : <circle key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 5 : 4} fill={color} stroke="#fff" strokeWidth="2" />
        )}
        {data.map((d, i) => (
          <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle">
            {d.label}
          </text>
        ))}
      </svg>
      {node}
    </>
  );
}

// Horizontal bars in HTML so long labels wrap nicely. data: [{label, value, display}]
export function HBars({ data, max, color = 'var(--primary)', unit = '' }) {
  const { show, hide, node } = useTip();
  const top = max ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} className="hbar" onMouseMove={(e) => show(e, d.tip || `${d.label}: ${d.display ?? d.value}${unit}`)} onMouseLeave={hide}>
          <span className="ellipsis">{d.label}</span>
          <div className="track">
            <div className="fill" style={{ width: `${Math.max(0, (d.value / top) * 100)}%`, background: d.color || color }} />
          </div>
          <span className="right b small">
            {d.display ?? d.value}
            {unit}
          </span>
        </div>
      ))}
      {node}
    </div>
  );
}
