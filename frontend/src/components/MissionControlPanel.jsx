import React, { useState } from 'react';
import { Play, Square, RotateCcw, Lock } from 'lucide-react';

const PROFILES = [
  { key: 'ISR_LOITER', label: 'ISR Loiter', sub: '15,000 ft · 74% pwr' },
  { key: 'ALTITUDE_CLIMB', label: 'Tactical Climb', sub: '0 → 22,000 ft' },
  { key: 'DESERT_HEAT_SOAK', label: 'Desert Soak', sub: 'Thar · +45 °C' },
  { key: 'SNAP_THROTTLE', label: 'Snap Throttle', sub: '35% → 98% steps' },
];

export default function MissionControlPanel({
  currentProfile,
  activeFaults,
  onSelectProfile,
  onInjectFault,
  onClearFaults,
  replayState,
  onReplayControl,
  selectedDataset = 'SORTIE_TAPAS_08_MISFIRE',
  onSelectDataset,
  uploadedDataset,
  onOpenUpload,
}) {
  const isReplaying = Boolean(replayState?.is_replay);
  const isUploadedDataset = selectedDataset === 'UPLOADED_DATASET';

  // Dynamic heading representing currently selected dataset/context
  const headingText = isUploadedDataset ? 'Uploaded Dataset' : 'Testing Data';

  const faults = [
    {
      id: 'misfire',
      label: 'Cyl #3 misfire',
      effect: 'EGT collapse · torsional jitter',
      active: activeFaults?.misfire_cyl === 3,
      toggle: () => {
        if (isUploadedDataset) return;
        onInjectFault('misfire_cyl', activeFaults?.misfire_cyl === 3 ? null : 3);
      },
    },
    {
      id: 'injector',
      label: 'Injector #1 restriction',
      effect: 'Lean burn > 875 °C',
      active: activeFaults?.clogged_injector_cyl === 1,
      toggle: () => {
        if (isUploadedDataset) return;
        onInjectFault('clogged_injector_cyl', activeFaults?.clogged_injector_cyl === 1 ? null : 1);
      },
    },
    {
      id: 'radiator',
      label: 'Radiator restriction',
      effect: 'Cooling loss · CHT > 140 °C',
      active: activeFaults?.cooling_degradation_factor < 0.8,
      toggle: () => {
        if (isUploadedDataset) return;
        onInjectFault('cooling_degradation_factor', activeFaults?.cooling_degradation_factor < 0.8 ? 1.0 : 0.45);
      },
    },
    {
      id: 'oil',
      label: 'Oil scavenge leak',
      effect: 'Pressure below 190 kPa',
      active: activeFaults?.oil_leak_severity > 0,
      toggle: () => {
        if (isUploadedDataset) return;
        onInjectFault('oil_leak_severity', activeFaults?.oil_leak_severity > 0 ? 0.0 : 0.75);
      },
    },
    {
      id: 'bearing',
      label: 'Bearing degradation',
      effect: 'Harmonic spike > 3.5 G',
      active: activeFaults?.bearing_wear_severity > 0,
      toggle: () => {
        if (isUploadedDataset) return;
        onInjectFault('bearing_wear_severity', activeFaults?.bearing_wear_severity > 0 ? 0.0 : 0.85);
      },
    },
    {
      id: 'wastegate',
      label: 'Wastegate leak',
      effect: 'Boost deficit at altitude',
      active: Boolean(activeFaults?.turbo_wastegate_leak),
      toggle: () => {
        if (isUploadedDataset) return;
        onInjectFault('turbo_wastegate_leak', !activeFaults?.turbo_wastegate_leak);
      },
    },
  ];

  const activeCount = isUploadedDataset ? 0 : faults.filter((f) => f.active).length;

  return (
    <section className="card p-4 flex flex-col">
      <div className="sec-head">
        <h2 className="sec-title">Simulation Console</h2>
        {activeCount > 0 && !isUploadedDataset && (
          <button onClick={onClearFaults} className="btn-quiet !text-crit !border-crit/30 hover:!bg-crit-dim">
            <RotateCcw className="w-3 h-3" />
            Clear {activeCount} fault{activeCount === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {/* Mission regime */}
      <div className="mb-4">
        <span className="label block mb-2">Mission regime</span>
        <div className="grid grid-cols-2 gap-2">
          {PROFILES.map((p) => {
            const active = currentProfile === p.key && !isUploadedDataset;
            return (
              <button
                key={p.key}
                onClick={() => onSelectProfile(p.key)}
                className={`text-left px-3 py-2 rounded border transition-colors ${
                  active
                    ? 'bg-steel-500/15 border-steel-500/50'
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {active && <span className="w-1 h-1 rounded-full bg-steel-300" />}
                  <span className={`font-cond font-semibold text-[13px] ${active ? 'text-steel-200' : 'text-zinc-300'}`}>
                    {p.label}
                  </span>
                </div>
                <span className="font-mono text-2xs text-zinc-600 block mt-0.5">{p.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Testing Data Heading, Dataset Selector & Fault injection controls */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="label block">{headingText}</span>
          {isUploadedDataset && (
            <span className="font-mono text-2xs text-zinc-500 flex items-center gap-1">
              <Lock className="w-3 h-3 text-zinc-500" />
              Locked
            </span>
          )}
        </div>

        {/* Dataset selection moved directly below heading */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="label">Choose dataset from below</span>
            <span className={`font-mono text-2xs uppercase tracking-[0.1em] ${isReplaying ? 'text-steel-300' : 'text-zinc-600'}`}>
              {isReplaying ? 'Playback' : 'Standby'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={isUploadedDataset ? 'UPLOADED_DATASET' : selectedDataset}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'UPLOADED_DATASET') {
                  if (uploadedDataset) {
                    onSelectDataset && onSelectDataset('UPLOADED_DATASET');
                  } else {
                    if (onOpenUpload) onOpenUpload();
                  }
                } else if (val === 'UPLOAD_NEW') {
                  if (onOpenUpload) onOpenUpload();
                } else {
                  onSelectDataset && onSelectDataset(val);
                }
              }}
              className="input flex-1 min-w-0"
            >
              <option value="SORTIE_TAPAS_07_NOMINAL">Sortie #104 — nominal ISR loiter (Pokhran)</option>
              <option value="SORTIE_TAPAS_08_MISFIRE">Sortie #108 — Cyl #3 ignition misfire</option>
              <option value="UPLOADED_DATASET">
                {uploadedDataset ? `Uploaded Dataset (${uploadedDataset.fileName})` : 'Upload Dataset (JSON/XML)'}
              </option>
              {uploadedDataset && (
                <option value="UPLOAD_NEW">+ Upload New Dataset (JSON/XML)...</option>
              )}
            </select>

            {!isReplaying ? (
              <button
                disabled={isUploadedDataset}
                onClick={() => {
                  if (!isUploadedDataset) {
                    onReplayControl({ action: 'start', sortie_id: selectedDataset });
                  }
                }}
                className={`btn-accent flex-shrink-0 ${isUploadedDataset ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Play className="w-3 h-3 fill-current" />
                Replay
              </button>
            ) : (
              <button onClick={() => onReplayControl({ action: 'stop' })} className="btn-quiet flex-shrink-0">
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Small message when uploaded dataset is active */}
        {isUploadedDataset && (
          <div className="mb-2.5 p-2 rounded bg-white/[0.03] border border-white/[0.08] text-zinc-400 text-xs flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            <span className="font-mono text-2xs text-zinc-400">
              Fault injection unavailable for uploaded dataset.
            </span>
          </div>
        )}

        <div className="row-div">
          {faults.map((f) => (
            <button
              key={f.id}
              disabled={isUploadedDataset}
              onClick={f.toggle}
              title={isUploadedDataset ? 'Fault injection unavailable for uploaded dataset.' : f.effect}
              className={`w-full flex items-center justify-between gap-3 py-2 px-1 text-left transition-colors rounded ${
                isUploadedDataset
                  ? 'opacity-40 cursor-not-allowed select-none'
                  : 'group hover:bg-white/[0.025]'
              }`}
            >
              <div className="min-w-0">
                <span className={`text-xs block ${!isUploadedDataset && f.active ? 'text-crit font-medium' : 'text-zinc-300'}`}>
                  {f.label}
                </span>
                <span className="font-mono text-2xs text-zinc-600">{f.effect}</span>
              </div>

              {/* switch */}
              <span
                className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${
                  isUploadedDataset
                    ? 'bg-white/[0.06]'
                    : f.active
                    ? 'bg-crit/70'
                    : 'bg-white/[0.10] group-hover:bg-white/[0.16]'
                }`}
              >
                <span
                  className={`absolute top-[3px] w-3 h-3 rounded-full bg-zinc-100 transition-all ${
                    !isUploadedDataset && f.active ? 'left-[17px]' : 'left-[3px]'
                  }`}
                />
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
