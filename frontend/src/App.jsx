import React, { useState, useEffect, useRef, useCallback } from 'react';
import CommandBar from './components/CommandBar';
import VitalsStrip from './components/VitalsStrip';
import EngineDigitalTwin3D from './components/EngineDigitalTwin3D';
import CylinderAnalysis from './components/CylinderAnalysis';
import VibrationSpectrum from './components/VibrationSpectrum';
import AnomalyTimeline from './components/AnomalyTimeline';
import HealthPrognostics from './components/HealthPrognostics';
import MissionControlPanel from './components/MissionControlPanel';
import HealthReportModal from './components/HealthReportModal';
import PhysicsResidualModal from './components/PhysicsResidualModal';
import CriticalAlertModal, { CriticalBanner } from './components/CriticalAlertModal';
import { useCriticalAlarm } from './hooks/useCriticalAlarm';

const HISTORY_LEN = 150;
// The sim streams at 10 Hz. Recording every frame would give a 15-second window,
// short enough that an injected fault scrolls off the trend while it is still
// being discussed. Downsampling to 2 Hz holds ~75 s at the same buffer size.
const MIN_SAMPLE_GAP_S = 0.5;

export default function App() {
  const [systemState, setSystemState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isPhysicsOpen, setIsPhysicsOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const wsRef = useRef(null);
  const lastStampRef = useRef(null);
  const replayModeRef = useRef(false);

  // Append a sample to the rolling trend buffer, skipping duplicates.
  // The WebSocket and the fallback poll both feed setSystemState, so the
  // payload timestamp is the only reliable de-duplication key.
  const record = useCallback((data) => {
    const stamp = data?.timestamp;
    if (stamp == null) return;

    // Replay data must not splice onto the live trace.
    const inReplay = Boolean(data?.replay_state?.is_replay);
    if (inReplay !== replayModeRef.current) {
      replayModeRef.current = inReplay;
      lastStampRef.current = stamp;
      setHistory([]);
      return;
    }

    // Drop duplicates (the socket and the fallback poll both deliver frames) and
    // thin the stream to MIN_SAMPLE_GAP_S. A stamp that moves backwards means the
    // clock was re-based, so let it through and re-baseline rather than stalling.
    const prev = lastStampRef.current;
    if (prev != null) {
      const gap = stamp - prev;
      if (gap >= 0 && gap < MIN_SAMPLE_GAP_S) return;
    }
    lastStampRef.current = stamp;

    const t = data.telemetry || {};
    const cht = t.cht || [];
    const egt = t.egt || [];
    const sample = {
      t: stamp,
      rpm: t.rpm ?? 0,
      map: t.map_kpa ?? 0,
      oilP: t.oil_pressure_kpa ?? 0,
      oilT: t.oil_temp_c ?? 0,
      coolant: t.coolant_temp_c ?? 0,
      vib: t.vibration_rms_g ?? 0,
      fuel: t.fuel_flow_lph ?? 0,
      bhp: t.brake_hp ?? 0,
      volts: t.bus_voltage_v ?? 0,
      chtMax: cht.length ? Math.max(...cht) : 0,
      chtSpread: cht.length ? Math.max(...cht) - Math.min(...cht) : 0,
      egtSpread: egt.length ? Math.max(...egt) - Math.min(...egt) : 0,
      score: data.ai_diagnostics?.anomaly_score ?? 0,
      ehi: data.prognostics?.overall_health_index ?? 0,
    };

    setHistory((prev) => {
      const next = prev.length >= HISTORY_LEN ? prev.slice(prev.length - HISTORY_LEN + 1) : prev.slice();
      next.push(sample);
      return next;
    });
  }, []);

  const ingest = useCallback((data) => {
    if (!data || !data.telemetry) return;
    setSystemState(data);
    record(data);
  }, [record]);

  useEffect(() => {
    let reconnectTimeout = null;

    const connect = () => {
      const host = window.location.hostname || '127.0.0.1';
      const wsUrl = `ws://${host}:${import.meta.env.VITE_API_PORT || '8000'}/ws/telemetry`;

      let socket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 2000);
        return;
      }
      wsRef.current = socket;

      socket.onopen = () => setIsConnected(true);

      socket.onmessage = (event) => {
        try {
          ingest(JSON.parse(event.data));
        } catch (e) {
          console.error('Failed to parse telemetry:', e);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        reconnectTimeout = setTimeout(connect, 1500);
      };

      socket.onerror = () => socket.close();
    };

    connect();

    const pollInterval = setInterval(() => {
      fetch('/api/telemetry/latest')
        .then((res) => res.json())
        .then(ingest)
        .catch(() => {});
    }, 1000);

    return () => {
      if (wsRef.current) wsRef.current.close();
      clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
    };
  }, [ingest]);

  const post = (url, body) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

  const handleSelectProfile = (profileKey) => post('/api/simulation/profile', { profile_key: profileKey });
  const handleInjectFault = (faultName, value) => post('/api/simulation/fault', { fault_name: faultName, value });
  const handleClearFaults = () => post('/api/simulation/clear-faults');
  const handleReplayControl = (req) => post('/api/replay/control', req);

  const telemetry = systemState?.telemetry || {
    rpm: 0, altitude_ft: 0, altitude_m: 0, airspeed_kts: 0, oat_c: 0,
    map_kpa: 0, map_inhg: 0, cht: [0, 0, 0, 0], egt: [0, 0, 0, 0],
    oil_pressure_kpa: 0, oil_pressure_psi: 0, oil_temp_c: 0, coolant_temp_c: 0,
    vibration_rms_g: 0, fuel_flow_lph: 0, bsfc_g_kwh: 0, bus_voltage_v: 0,
    alternator_current_a: 0, mission_profile: 'ISR_LOITER', turbo_rpm: 0,
    brake_hp: 0, throttle_pct: 0, torque_nm: 0, battery_soc_pct: 0, mission_time_s: 0,
  };

  const idealPhysics = systemState?.ideal_physics || telemetry;

  const aiDiagnostics = systemState?.ai_diagnostics || {
    anomaly_score: 0, is_anomalous: false, severity: 'NOMINAL', root_causes: [],
    physics_residuals: {
      cht_residuals_c: [0, 0, 0, 0], egt_residuals_c: [0, 0, 0, 0],
      map_residual_kpa: 0, oil_pressure_residual_kpa: 0,
      oil_temp_residual_c: 0, vibration_residual_g: 0,
    },
    maintenance_advisories: [],
  };

  const prognostics = systemState?.prognostics || {
    overall_health_index: 0, accumulated_flight_hours: 0, tbo_limit_hours: 1200,
    subsystem_health: { combustion: 0, thermal: 0, lubrication: 0, mechanical: 0, electrical: 0 },
    wear_metrics: {
      valve_seat_wear_pct: 0, turbo_bearing_wear_pct: 0, piston_ring_wear_pct: 0,
      oil_degradation_pct: 0, spark_plug_erosion_pct: 0,
    },
    rul_hours: { mean: 0, lower_95_ci: 0, upper_95_ci: 0 },
  };

  const severity = aiDiagnostics.severity || 'NOMINAL';
  const alarm = useCriticalAlarm({ severity, rootCauses: aiDiagnostics.root_causes });
  const awaitingData = !systemState;

  return (
    <div className="min-h-screen flex flex-col">

      <CommandBar
        telemetry={telemetry}
        isConnected={isConnected}
        aiDiagnostics={aiDiagnostics}
        onOpenReport={() => setIsReportOpen(true)}
        onOpenPhysics={() => setIsPhysicsOpen(true)}
        onClearFaults={handleClearFaults}
        isReplaying={Boolean(systemState?.replay_state?.is_replay)}
        alarm={alarm}
      />

      <CriticalBanner alarm={alarm} aiDiagnostics={aiDiagnostics} />

      <main className="flex-1 w-full max-w-[1800px] mx-auto px-4 sm:px-6 py-5 space-y-5">

        {awaitingData && (
          <div className="card px-4 py-3 text-xs text-zinc-500 font-mono">
            Awaiting telemetry link…
          </div>
        )}

        {/* Primary vitals — the always-on instrument row */}
        <VitalsStrip telemetry={telemetry} history={history} />

        {/* Engine schematic (hero) + live condition analysis */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7">
            <EngineDigitalTwin3D
              telemetry={telemetry}
              idealPhysics={idealPhysics}
              aiDiagnostics={aiDiagnostics}
            />
          </div>
          <div className="xl:col-span-5 flex flex-col gap-5">
            <CylinderAnalysis telemetry={telemetry} aiDiagnostics={aiDiagnostics} />
            <VibrationSpectrum telemetry={telemetry} history={history} />
          </div>
        </section>

        {/* The missing time axis: anomaly score + severity over the sortie */}
        <AnomalyTimeline history={history} aiDiagnostics={aiDiagnostics} severity={severity} />

        {/* Prognostics and the operator console */}
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-7">
            <HealthPrognostics
              aiDiagnostics={aiDiagnostics}
              prognostics={prognostics}
              history={history}
            />
          </div>
          <div className="xl:col-span-5">
            <MissionControlPanel
              currentProfile={systemState?.mission_profile || 'ISR_LOITER'}
              activeFaults={systemState?.active_faults}
              onSelectProfile={handleSelectProfile}
              onInjectFault={handleInjectFault}
              onClearFaults={handleClearFaults}
              replayState={systemState?.replay_state}
              onReplayControl={handleReplayControl}
            />
          </div>
        </section>

      </main>

      <CriticalAlertModal
        alarm={alarm}
        telemetry={telemetry}
        aiDiagnostics={aiDiagnostics}
        onOpenReport={() => setIsReportOpen(true)}
        onClearFaults={handleClearFaults}
      />

      <HealthReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />

      <PhysicsResidualModal
        isOpen={isPhysicsOpen}
        onClose={() => setIsPhysicsOpen(false)}
        telemetry={telemetry}
        idealPhysics={idealPhysics}
        aiDiagnostics={aiDiagnostics}
      />

      <footer className="border-t border-white/[0.06] mt-2">
        <div className="max-w-[1800px] mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
          <span className="font-mono text-2xs uppercase tracking-[0.1em] text-zinc-600">
            Aeronautical Development Establishment · Garuda Twin Diagnostic Core v1.0
          </span>
          <div className="flex items-center gap-x-5 gap-y-1 flex-wrap font-mono text-2xs uppercase tracking-[0.1em] text-zinc-600">
            <span>Zero-D MVEM</span>
            <span>Isolation Forest</span>
            <span>SAE J1939 · 500 kbps</span>
            <span>MIL-STD-1553B ready</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
