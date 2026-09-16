import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  AlertTriangle,
  FileCheck
} from 'lucide-react';
import { BrandMark } from './Brand';

export default function HealthReportModal({ isOpen, onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch('/api/report/generate')
        .then((res) => res.json())
        .then((data) => {
          setReport(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="modal-shell max-w-3xl">

        {/* Modal Header */}
        <div className="modal-head">
          <div className="flex items-center gap-3">
            <BrandMark size={36} />
            <div className="leading-none">
              <h3 className="font-cond font-bold text-base text-zinc-100 tracking-wide">
                GARUDA<span className="text-steel-400">TWIN</span>
                <span className="text-zinc-500 text-xs font-normal ml-2">Propulsion Health &amp; Airworthiness Certificate</span>
              </h3>
              <span className="font-mono text-2xs uppercase tracking-[0.16em] text-zinc-600 mt-[3px] block">
                DRDO · ADE &nbsp;|&nbsp; DDP / IDEX DEFENCE PROPULSION AUDIT
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="btn-quiet">
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Print / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Certificate Content */}
        <div className="p-6 text-zinc-200 text-xs space-y-5 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-zinc-400">Generating debriefing report from telemetry...</div>
          ) : report ? (
            <>
              {/* Mission Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tile">
                <div>
                  <span className="text-zinc-500 text-[10px] uppercase tracking-wide block mb-0.5">Report ID</span>
                  <span className="font-semibold font-mono text-zinc-100">{report.report_id}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] uppercase tracking-wide block mb-0.5">Aircraft Tail</span>
                  <span className="font-semibold font-mono text-steel-400">{report.aircraft_tail_no}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] uppercase tracking-wide block mb-0.5">Engine Serial</span>
                  <span className="font-semibold font-mono text-zinc-100">{report.engine_serial}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] uppercase tracking-wide block mb-0.5">Flight Accumulated</span>
                  <span className="font-semibold font-mono text-zinc-100">{report.accumulated_engine_hours} hrs</span>
                </div>
              </div>

              {/* Airworthiness Decision Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                report.certification_status === 'GO FOR SORTIE'
                  ? 'bg-ok-dim border-ok/40 text-ok'
                  : 'bg-crit-dim border-crit/50 text-crit'
              }`}>
                <div className="flex items-center gap-3">
                  {report.certification_status === 'GO FOR SORTIE' ? (
                    <FileCheck className="w-7 h-7" />
                  ) : (
                    <AlertTriangle className="w-7 h-7" />
                  )}
                  <div>
                    <span className="text-[11px] text-zinc-400 uppercase tracking-wide block">Airworthiness Dispatch Decision</span>
                    <span className="font-cond font-bold text-lg tracking-wide">
                      {report.certification_status}
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wide block">Health Index</span>
                  <span className="text-2xl font-bold">{report.overall_health_index}%</span>
                </div>
              </div>

              {/* Subsystem Health Audit */}
              <div>
                <span className="label block mb-2">1. Subsystem Health Assessment</span>
                <div className="grid grid-cols-5 gap-2 text-center">
                  {Object.entries(report.subsystem_health_audit || {}).map(([sub, val]) => (
                    <div key={sub} className="tile !p-2">
                      <span className="text-[10px] text-zinc-500 uppercase block mb-0.5">{sub}</span>
                      <span className="font-semibold font-mono text-sm text-steel-300">{val}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Component Wear Breakdown */}
              <div>
                <span className="label block mb-2">2. Hardware Degradation Audit</span>
                <div className="tile space-y-2">
                  {Object.entries(report.component_wear_audit || {}).map(([comp, val]) => (
                    <div key={comp} className="flex justify-between items-center text-[11px]">
                      <span className="text-zinc-400 capitalize">{comp.replace('_pct', '').replace(/_/g, ' ')}</span>
                      <span className={`font-semibold font-mono ${val > 50 ? 'text-warn' : 'text-zinc-200'}`}>{val}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagnosed In-Flight Faults */}
              <div>
                <span className="label block mb-2">3. Anomaly Log &amp; Root Cause Analysis</span>
                {report.diagnosed_anomalies?.length === 0 ? (
                  <p className="tile !bg-ok-dim text-ok">
                    No physical anomalies logged during mission profile.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {report.diagnosed_anomalies.map((f, i) => (
                      <div key={i} className="tile !bg-crit-dim border-l-2 border-crit">
                        <div className="flex justify-between text-crit font-semibold mb-1">
                          <span>{f.title}</span>
                          <span>Confidence {f.confidence}%</span>
                        </div>
                        <p className="text-zinc-300 text-[11px]">{f.evidence}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Maintenance Advisories */}
              <div>
                <span className="label block mb-2">4. Pre-Flight Maintenance Mandate</span>
                <div className="space-y-1.5">
                  {report.airworthiness_prescriptions?.map((p, i) => (
                    <div key={i} className="tile !p-2.5 flex justify-between items-center">
                      <span className="text-zinc-200">{p.action}</span>
                      <span className="text-steel-400 text-[10px] font-mono whitespace-nowrap ml-3">{p.downtime_est}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DRDO Certification Sign-off */}
              <div className="border-t border-white/[0.06] pt-4 flex justify-between items-end text-zinc-500 text-[10px]">
                <div>
                  <span>Aeronautical Development Establishment (ADE)</span>
                  <br />
                  <span>Digital Twin Diagnostic Core v1.0.0</span>
                </div>
                <div className="text-right">
                  <span>Chief Propulsion Engineer Sign-off</span>
                  <div className="border-b border-white/10 w-48 mt-4 mb-1" />
                  <span>Autonomous AI-Twin Verified</span>
                </div>
              </div>
            </>
          ) : null}
        </div>

      </div>
    </div>
  );
}
