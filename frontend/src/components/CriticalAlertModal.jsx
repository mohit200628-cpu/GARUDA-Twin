import React, { useEffect, useState } from 'react';
import {
  Siren, ShieldAlert, Check, CheckSquare, Square, VolumeX, FileText, RotateCcw, Wrench, X,
} from 'lucide-react';
import { rankCauses } from '../utils/playbooks';

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// Limits mirror backend/app/ai/anomaly_detector.py so the tiles go red where the
// analyzer starts flagging. Change them together.
function readings(t) {
  const cht = t.cht?.length ? t.cht : [0];
  const egt = t.egt?.length ? t.egt : [0];
  const chtMean = cht.reduce((a, b) => a + b, 0) / cht.length;
  const egtMax = Math.max(...egt);
  const egtMin = Math.min(...egt);
  return [
    { label: 'Oil pressure', value: (t.oil_pressure_kpa ?? 0).toFixed(0), unit: 'kPa', bad: (t.oil_pressure_kpa ?? 0) < 210 && (t.rpm ?? 0) > 3500 },
    { label: 'CHT mean', value: chtMean.toFixed(0), unit: '°C', bad: chtMean > 138 },
    { label: 'EGT max', value: egtMax.toFixed(0), unit: '°C', bad: egtMax > 875 },
    { label: 'EGT min', value: egtMin.toFixed(0), unit: '°C', bad: egtMin < 450 && (t.rpm ?? 0) > 2500 },
    { label: 'Oil temp', value: (t.oil_temp_c ?? 0).toFixed(0), unit: '°C', bad: (t.oil_temp_c ?? 0) > 118 },
    { label: 'Vibration', value: (t.vibration_rms_g ?? 0).toFixed(2), unit: 'g', bad: (t.vibration_rms_g ?? 0) > 3.2 },
    { label: 'RPM', value: (t.rpm ?? 0).toFixed(0), unit: '', bad: false },
  ];
}

export default function CriticalAlertModal({
  alarm, telemetry, aiDiagnostics, onOpenReport, onClearFaults,
}) {
  const [done, setDone] = useState({});
  useEffect(() => setDone({}), [alarm.episode]);

  if (!alarm.popupOpen) return null;

  const ranked = rankCauses(aiDiagnostics?.root_causes);
  const directives = (aiDiagnostics?.maintenance_advisories || []).filter((a) => a.priority === 'CRITICAL');
  const toggle = (key) => setDone((d) => ({ ...d, [key]: !d[key] }));

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="crit-title"
    >
      <div className="modal-shell max-w-3xl !border-crit/60 shadow-[0_0_0_1px_rgba(217,107,107,0.35),0_0_60px_-10px_rgba(217,107,107,0.45)]">

        <div className="modal-head !bg-crit/15 !border-crit/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg bg-crit/20 border border-crit/50 flex items-center justify-center ${alarm.ringing ? 'animate-pulse' : ''}`}>
              <Siren className="w-5 h-5 text-crit" />
            </div>
            <div className="leading-tight min-w-0">
              <h3 id="crit-title" className="font-cond font-bold text-[17px] tracking-wide text-zinc-50">
                CRITICAL ENGINE ALERT
              </h3>
              <span className="font-mono text-2xs uppercase tracking-[0.12em] text-crit">
                Active for {fmt(alarm.elapsedS)} · UAV-TAPAS-07
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {alarm.muted ? (
              <span className="chip chip-mute"><VolumeX className="w-3 h-3" />Sound muted</span>
            ) : (
              <span className={`chip ${alarm.ringing ? 'chip-crit' : 'chip-mute'}`}>{alarm.ringing ? 'Alarm sounding' : 'Silenced'}</span>
            )}
          </div>
        </div>

        <div className="p-5 space-y-5 max-h-[72vh] overflow-y-auto">

          {alarm.audioBlocked && (
            <button
              onClick={alarm.enableAudio}
              className="w-full text-left rounded border border-warn/40 bg-warn-dim px-3 py-2.5 text-xs text-warn hover:bg-warn/20 transition-colors"
            >
              Your browser is blocking the alarm sound. <strong>Click here to enable it.</strong>
            </button>
          )}

          {/* Live readings */}
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {readings(telemetry).map((r) => (
              <div key={r.label} className={`tile !p-2.5 ${r.bad ? '!border-crit/50 !bg-crit-dim' : ''}`}>
                <span className="label block">{r.label}</span>
                <span className={`num-md mt-1.5 block ${r.bad ? '!text-crit' : ''}`}>
                  {r.value}<span className="unit">{r.unit}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Causes and what to do about each */}
          {ranked.length === 0 && (
            <div className="tile text-xs text-zinc-300">
              The analyzer has flagged a critical state but has not isolated a root cause yet. Review the trends
              and consider returning to base.
            </div>
          )}

          {ranked.map(({ cause, playbook }, i) => (
            <section key={cause.code} className="rounded-lg border border-white/[0.08] bg-base-3 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-crit shrink-0" />
                    <h4 className="font-cond font-semibold text-[15px] text-zinc-100">{playbook.headline}</h4>
                    {i === 0 && ranked.length > 1 && <span className="chip chip-crit">Most urgent</span>}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1.5">{cause.evidence}</p>
                  {playbook.impact && <p className="text-xs text-zinc-300 mt-1">{playbook.impact}</p>}
                </div>
                <span className="chip chip-mute shrink-0">{cause.confidence}% conf.</span>
              </div>

              <ol className="px-4 py-2 row-div">
                {playbook.steps.map((s, idx) => {
                  const key = `${cause.code}:${idx}`;
                  const checked = Boolean(done[key]);
                  return (
                    <li key={key}>
                      <button
                        onClick={() => toggle(key)}
                        className="w-full flex items-start gap-3 py-2.5 text-left group"
                        aria-pressed={checked}
                      >
                        {checked
                          ? <CheckSquare className="w-4 h-4 mt-0.5 text-ok shrink-0" />
                          : <Square className="w-4 h-4 mt-0.5 text-zinc-500 group-hover:text-zinc-300 shrink-0" />}
                        <span className={`text-sm flex-1 ${checked ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                          {s.text}
                        </span>
                        <span className="chip chip-mute shrink-0">{s.who}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {playbook.postFlight && (
                <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-start gap-2 text-xs text-zinc-400">
                  <Wrench className="w-3.5 h-3.5 mt-0.5 shrink-0 text-steel-400" />
                  <span><span className="text-zinc-300">After landing:</span> {playbook.postFlight}</span>
                </div>
              )}
            </section>
          ))}

          {directives.length > 0 && (
            <div className="tile">
              <span className="label block mb-2">Analyzer directive</span>
              <ul className="space-y-1.5">
                {directives.map((d, i) => (
                  <li key={i} className="text-xs text-zinc-200 flex items-start justify-between gap-3">
                    <span>{d.action}</span>
                    <span className="font-mono text-2xs text-zinc-500 shrink-0">est. downtime {d.downtime_est}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-white/[0.07] bg-base-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button onClick={onOpenReport} className="btn-quiet"><FileText className="w-3.5 h-3.5" />Health report</button>
            <button onClick={onClearFaults} className="btn-quiet" title="Simulation only: clear injected faults">
              <RotateCcw className="w-3.5 h-3.5" />Clear injected faults
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!alarm.ringing && (
              <button onClick={alarm.acknowledge} className="btn-quiet"><X className="w-3.5 h-3.5" />Close</button>
            )}
            {alarm.ringing && (
              <button
                onClick={alarm.acknowledge}
                autoFocus
                className="btn !bg-crit/90 !border-crit text-white hover:!bg-crit font-semibold px-4"
              >
                <Check className="w-3.5 h-3.5" />Acknowledge &amp; silence
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Thin bar under the header: stays up after acknowledgement until the condition clears. */
export function CriticalBanner({ alarm, aiDiagnostics }) {
  if (alarm.clearedAt && !alarm.active) {
    return (
      <div className="sticky top-[62px] z-20 bg-ok-dim border-b border-ok/30 px-6 py-2 text-xs text-ok font-mono uppercase tracking-[0.08em]">
        Critical condition cleared. Engine parameters are back within limits.
      </div>
    );
  }
  if (!alarm.active || alarm.popupOpen) return null;

  const top = rankCauses(aiDiagnostics?.root_causes)[0];
  return (
    <div className="sticky top-[62px] z-20 bg-crit/15 border-b border-crit/40 backdrop-blur">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0 text-xs">
          <Siren className="w-4 h-4 text-crit shrink-0" />
          <span className="font-mono uppercase tracking-[0.08em] text-crit shrink-0">Critical · acknowledged · {fmt(alarm.elapsedS)}</span>
          {top && <span className="text-zinc-200 truncate">{top.playbook.headline}</span>}
        </div>
        <button onClick={alarm.reopen} className="btn-quiet !border-crit/40 !text-crit shrink-0">Review actions</button>
      </div>
    </div>
  );
}
