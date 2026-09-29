import React from 'react';
import { FileText, RotateCcw, SlidersHorizontal, Volume2, VolumeX, BellRing } from 'lucide-react';
import { BrandLockup } from './Brand';

function Readout({ label, value, unit }) {
  return (
    <div className="flex flex-col">
      <span className="label">{label}</span>
      <span className="num text-[13px] mt-[3px]">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </span>
    </div>
  );
}

const SEVERITY = {
  NOMINAL:  { cls: 'chip-ok',   text: 'Nominal' },
  CAUTION:  { cls: 'chip-warn', text: 'Caution' },
  WARNING:  { cls: 'chip-warn', text: 'Warning' },
  CRITICAL: { cls: 'chip-crit', text: 'Critical' },
};

export default function CommandBar({
  telemetry,
  isConnected,
  aiDiagnostics,
  onOpenReport,
  onOpenPhysics,
  onClearFaults,
  isReplaying,
  alarm,
}) {
  const severity = aiDiagnostics?.severity || 'NOMINAL';
  const sev = SEVERITY[severity] || SEVERITY.NOMINAL;
  const isCritical = severity === 'CRITICAL';

  const missionTime = telemetry?.mission_time_s || 0;
  const mm = String(Math.floor(missionTime / 60)).padStart(2, '0');
  const ss = String(Math.floor(missionTime % 60)).padStart(2, '0');

  return (
    <header className="sticky top-0 z-30 bg-base-1/95 backdrop-blur border-b border-white/[0.07]">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 h-[62px] flex items-center justify-between gap-6">

        {/* Identity + airframe */}
        <div className="flex items-center gap-5 min-w-0">
          <BrandLockup />

          <div className="hidden md:flex items-center gap-2 pl-5 border-l border-white/[0.08]">
            <span className="font-mono text-xs text-zinc-300">UAV-TAPAS-07</span>
            <span className="chip chip-mute">Boxer-4C Turbo</span>
          </div>
        </div>

        {/* Flight condition strip */}
        <div className="hidden xl:flex items-center gap-7">
          <Readout label="ALT" value={(telemetry?.altitude_ft || 0).toLocaleString()} unit="ft" />
          <Readout label="IAS" value={telemetry?.airspeed_kts ?? 0} unit="kt" />
          <Readout label="OAT" value={telemetry?.oat_c ?? 0} unit="°C" />
          <Readout label="T+" value={`${mm}:${ss}`} />
          <div className="flex flex-col">
            <span className="label">Mission</span>
            <span className="font-cond font-semibold text-[13px] text-zinc-200 mt-[3px]">
              {(telemetry?.mission_profile || 'ISR_LOITER').replace(/_/g, ' ')}
              {isReplaying && <span className="chip chip-mute ml-2 !text-steel-300 !border-steel-500/40">Replay</span>}
            </span>
          </div>
        </div>

        {/* Status + actions */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 mr-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-ok' : 'bg-crit'}`} />
            <span className="font-mono text-2xs uppercase tracking-[0.1em] text-zinc-500">
              {isConnected ? 'Link' : 'No link'}
            </span>
          </div>

          <div className={`chip ${sev.cls} ${isCritical ? 'animate-alert-breathe' : ''} !px-2.5 !py-1`}>
            {sev.text}
          </div>

          {alarm && (
            <>
              <button
                onClick={() => alarm.setMuted(!alarm.muted)}
                className={`btn-quiet ${alarm.muted ? '!text-warn !border-warn/40' : ''}`}
                title={alarm.muted ? 'Alarm sound is muted. Click to unmute.' : 'Alarm sound on. Click to mute.'}
                aria-pressed={alarm.muted}
              >
                {alarm.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span className="hidden lg:inline">{alarm.muted ? 'Muted' : 'Sound'}</span>
              </button>
              <button onClick={alarm.testAlarm} className="btn-quiet" title="Play a short alarm to check volume">
                <BellRing className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">Test</span>
              </button>
            </>
          )}

          <button onClick={onOpenPhysics} className="btn-quiet" title="Physics model vs measured residuals">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Residuals</span>
          </button>

          <button onClick={onClearFaults} className="btn-quiet" title="Reset all injected faults">
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Reset</span>
          </button>

          <button onClick={onOpenReport} className="btn-accent">
            <FileText className="w-3.5 h-3.5" />
            <span>Report</span>
          </button>
        </div>

      </div>
    </header>
  );
}
