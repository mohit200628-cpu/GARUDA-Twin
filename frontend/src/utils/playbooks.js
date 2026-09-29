// Operator playbooks for the fault codes raised by backend/app/ai/anomaly_detector.py.
//
// The backend says what is wrong (root cause + evidence) and gives one summary action.
// These turn each code into an ordered set of steps for the GCS operator. Steps are
// deliberately conservative engine-management advice; the airframe's own flight
// manual and SOPs take precedence.

const GCS = 'GCS';
const SHOP = 'Ground crew';

const PLAYBOOKS = [
  {
    test: /^MISFIRE_CYL_(\d)$/,
    rank: 1,
    build: ([, n]) => ({
      headline: `Combustion lost on cylinder ${n}`,
      voice: `Cylinder ${n} misfire. Reduce throttle and return to base.`,
      impact: 'Torsional load is climbing and a second cylinder may follow.',
      steps: [
        { who: GCS, text: 'Reduce throttle to 60% or below to cut torsional load, then confirm vibration is falling.' },
        { who: GCS, text: 'Abort the mission task and command return-to-base by the shortest route.' },
        { who: GCS, text: `Watch EGT on cylinder ${n} and its neighbours. If a second cylinder drops, head for the nearest recovery point.` },
      ],
      postFlight: `Inspect spark plug and ignition coil on cylinder ${n}, and check injector ${n} before the next sortie.`,
    }),
  },
  {
    test: /^OIL_PRESSURE_CRITICAL_LOW$/,
    rank: 0,
    build: () => ({
      headline: 'Oil pressure loss',
      voice: 'Oil pressure loss. Command emergency return to base now.',
      impact: 'Bearing damage and engine seizure are possible within 15 to 20 minutes.',
      steps: [
        { who: GCS, text: 'Command emergency return-to-base, or the nearest recovery point if it is closer.' },
        { who: GCS, text: 'Bring power down to the minimum that holds altitude. Avoid throttle snaps and high RPM.' },
        { who: GCS, text: 'Watch oil pressure and oil temperature. Falling pressure with rising temperature means the engine is starving.' },
        { who: GCS, text: 'If pressure keeps falling, plan a controlled forced landing rather than a long transit.' },
      ],
      postFlight: 'Ground the engine. Check the scavenge pump, oil filter and lines for leaks before any further running.',
    }),
  },
  {
    test: /^COOLING_SYSTEM_DEGRADATION$/,
    rank: 2,
    build: () => ({
      headline: 'Cooling system over redline',
      voice: 'Engine overtemperature. Reduce power, increase airspeed.',
      impact: 'Sustained overtemperature risks detonation and head or piston damage.',
      steps: [
        { who: GCS, text: 'Reduce throttle to lower heat rejection.' },
        { who: GCS, text: 'Increase airspeed for more ram air over the radiator. Descend into cooler, denser air if terrain allows.' },
        { who: GCS, text: 'If CHT and coolant temperature keep rising after 30 seconds, command return-to-base.' },
      ],
      postFlight: 'Inspect the coolant pump impeller, and check the radiator core for FOD or restriction.',
    }),
  },
  {
    test: /^INJECTOR_LEAN_CYL_(\d)$/,
    rank: 3,
    build: ([, n]) => ({
      headline: `Lean spike on cylinder ${n}`,
      voice: `Cylinder ${n} lean condition. Derate throttle.`,
      impact: 'Excess EGT can lead to piston crown detonation damage.',
      steps: [
        { who: GCS, text: 'Derate throttle until cylinder EGT is back under 875 °C.' },
        { who: GCS, text: `Monitor cylinder ${n} EGT. Return to base if it will not come down.` },
      ],
      postFlight: `Clean or replace fuel injector ${n}.`,
    }),
  },
  {
    test: /^BEARING_WEAR_VIBRATION$/,
    rank: 4,
    build: () => ({
      headline: 'Severe engine vibration',
      voice: 'Severe vibration. Reduce RPM and return to base.',
      impact: 'Possible crankshaft bearing degradation or propeller imbalance.',
      steps: [
        { who: GCS, text: 'Change RPM to move out of the vibration band, and watch the vibration spectrum.' },
        { who: GCS, text: 'Command return-to-base if vibration stays above the limit.' },
      ],
      postFlight: 'Borescope the crankshaft bearings and check propeller dynamic balance.',
    }),
  },
  {
    test: /^OIL_OVERHEATING$/,
    rank: 5,
    build: () => ({
      headline: 'Oil overtemperature',
      voice: 'Oil overtemperature. Reduce power.',
      impact: 'Oil loses film strength as temperature climbs.',
      steps: [
        { who: GCS, text: 'Reduce continuous power setting and watch oil temperature settle.' },
      ],
      postFlight: 'Inspect the oil cooler and its thermostat valve.',
    }),
  },
  {
    test: /^TURBO_BOOST_DEFICIT$/,
    rank: 6,
    build: () => ({
      headline: 'Turbo boost deficit',
      voice: 'Boost deficit. Limit throttle.',
      impact: 'Available power is below what the throttle setting implies.',
      steps: [
        { who: GCS, text: 'Limit throttle demand and descend if altitude margin allows.' },
      ],
      postFlight: 'Inspect the wastegate linkage and charge-air piping for leaks.',
    }),
  },
];

/** Resolve a backend root cause to its playbook. Unknown codes get a generic one. */
export function resolvePlaybook(cause) {
  const code = cause?.code || '';
  for (const p of PLAYBOOKS) {
    const m = code.match(p.test);
    if (m) return { rank: p.rank, ...p.build(m) };
  }
  return {
    rank: 99,
    headline: cause?.title || 'Engine fault',
    voice: `${cause?.title || 'Engine fault'}.`,
    impact: '',
    steps: [{ who: GCS, text: 'Follow the analyzer directive below and consider returning to base.' }],
    postFlight: '',
  };
}

/** Root causes ordered most urgent first. */
export function rankCauses(causes = []) {
  return causes
    .map((c) => ({ cause: c, playbook: resolvePlaybook(c) }))
    .sort((a, b) => a.playbook.rank - b.playbook.rank);
}

/** Spoken text for the whole alert: the most urgent cause's callout. */
export function voiceLine(causes = []) {
  const ranked = rankCauses(causes);
  if (!ranked.length) return 'Critical engine alert.';
  const extra = ranked.length > 1 ? ` ${ranked.length - 1} further fault${ranked.length > 2 ? 's' : ''} active.` : '';
  return `Critical alert. ${ranked[0].playbook.voice}${extra}`;
}
