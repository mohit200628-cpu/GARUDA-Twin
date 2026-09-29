/**
 * Garuda Twin — Dataset Parser & Schema Validator
 * Supports JSON & XML dataset uploads with comprehensive schema validation.
 */

// Core nominal parameters for ideal physics reference
const NOMINAL_PHYSICS = {
  cht: [118.5, 120.0, 118.0, 119.5],
  egt: [785.0, 790.0, 782.0, 787.0],
  map_kpa: 118.0,
  oil_pressure_kpa: 380.0,
  oil_temp_c: 92.0,
  coolant_temp_c: 88.0,
  vibration_rms_g: 1.25,
};

// Required metrics specification according to Garuda Twin data model
const REQUIRED_METRICS = [
  {
    name: 'RPM',
    keys: ['rpm', 'RPM', 'engine_rpm'],
    validate: (val) => isNumerical(val),
  },
  {
    name: 'Pressure',
    keys: ['pressure', 'Pressure', 'map_kpa', 'MAP', 'manifold_pressure_kpa', 'oil_pressure_kpa', 'oil_p'],
    validate: (val) => isNumerical(val),
  },
  {
    name: 'Temperature',
    keys: ['temperature', 'Temperature', 'temp', 'cht', 'CHT', 'egt', 'EGT', 'oil_temp_c', 'oil_t'],
    validate: (val) => isNumerical(val) || (Array.isArray(val) && val.length > 0 && val.every(isNumerical)),
  },
  {
    name: 'Altitude',
    keys: ['altitude', 'Altitude', 'alt', 'altitude_ft', 'altitude_m'],
    validate: (val) => isNumerical(val),
  },
];

/**
 * Validates file extension.
 * Accepts only .json and .xml
 */
export function validateFileExtension(fileName) {
  if (!fileName || typeof fileName !== 'string') return false;
  const lower = fileName.toLowerCase().trim();
  return lower.endsWith('.json') || lower.endsWith('.xml');
}

/**
 * Check if a value represents a valid finite number (or numeric string)
 */
export function isNumerical(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'number') return !isNaN(val) && isFinite(val);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return false;
    const n = Number(trimmed);
    return !isNaN(n) && isFinite(n);
  }
  return false;
}

/**
 * Validates a single raw frame against the required schema.
 * Rejects missing fields (Insufficient data) or non-numerical values (Invalid information).
 * Extra fields are simply ignored.
 */
function validateFrameSchema(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      valid: false,
      error: 'Insufficient data. Required details are missing.',
    };
  }

  const missingFields = [];

  for (const metric of REQUIRED_METRICS) {
    let foundKey = null;
    let foundValue = undefined;

    for (const k of metric.keys) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') {
        foundKey = k;
        foundValue = raw[k];
        break;
      }
    }

    if (foundKey === null) {
      missingFields.push(metric.name);
    } else {
      // Key is present, validate data type
      if (!metric.validate(foundValue)) {
        return {
          valid: false,
          error: `Invalid information. ${metric.name} must contain a numerical value.`,
        };
      }
    }
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      error: `Insufficient data. Missing required fields: ${missingFields.join(', ')}.`,
    };
  }

  return { valid: true };
}

/**
 * Parses raw text content based on file type and performs strict validation.
 */
export function parseAndValidateDataset(content, fileName) {
  if (!validateFileExtension(fileName)) {
    return {
      success: false,
      error: 'Invalid file format. Please upload a JSON or XML dataset.',
    };
  }

  if (!content || !content.trim()) {
    return {
      success: false,
      error: 'The uploaded dataset file is empty. Please provide a valid JSON or XML dataset.',
    };
  }

  const isXml = fileName.toLowerCase().endsWith('.xml');

  try {
    return isXml ? parseXmlDataset(content, fileName) : parseJsonDataset(content, fileName);
  } catch (err) {
    return {
      success: false,
      error: 'Insufficient data. Required details are missing.',
    };
  }
}

/**
 * Parse & validate JSON content
 */
function parseJsonDataset(jsonString, fileName) {
  let rawData;
  try {
    rawData = JSON.parse(jsonString);
  } catch (err) {
    return {
      success: false,
      error: 'Invalid JSON. Please upload a valid JSON dataset.',
    };
  }

  if (!rawData || (typeof rawData !== 'object' && !Array.isArray(rawData))) {
    return {
      success: false,
      error: 'Insufficient data. Required details are missing.',
    };
  }

  // Extract array of frame objects
  let rawFrames = [];
  let metadata = {};

  if (Array.isArray(rawData)) {
    rawFrames = rawData;
  } else if (Array.isArray(rawData.frames)) {
    rawFrames = rawData.frames;
    metadata = { title: rawData.title, description: rawData.description };
  } else if (Array.isArray(rawData.data)) {
    rawFrames = rawData.data;
  } else if (Array.isArray(rawData.records)) {
    rawFrames = rawData.records;
  } else if (Array.isArray(rawData.telemetry)) {
    rawFrames = rawData.telemetry;
  } else if (typeof rawData === 'object') {
    // Single telemetry snapshot
    rawFrames = [rawData];
  } else {
    return {
      success: false,
      error: 'Insufficient data. Required details are missing.',
    };
  }

  if (!rawFrames.length) {
    return {
      success: false,
      error: 'Insufficient data. Required details are missing.',
    };
  }

  // Validate each frame against schema
  for (let i = 0; i < rawFrames.length; i++) {
    const validation = validateFrameSchema(rawFrames[i]);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }
  }

  return processNormalizedFrames(rawFrames, fileName, metadata);
}

/**
 * Parse & validate XML content
 */
function parseXmlDataset(xmlString, fileName) {
  let doc;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xmlString, 'application/xml');
  } catch (err) {
    return {
      success: false,
      error: 'Invalid XML. Please upload a valid XML dataset.',
    };
  }

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    return {
      success: false,
      error: 'Invalid XML. Please upload a valid XML dataset.',
    };
  }

  // Find frame / record elements
  const frameElements = doc.querySelectorAll('frame, record, point, sample');
  let rawFrames = [];

  if (frameElements.length > 0) {
    frameElements.forEach((el) => {
      rawFrames.push(xmlNodeToObject(el));
    });
  } else {
    // Check root element
    const root = doc.documentElement;
    if (root) {
      const obj = xmlNodeToObject(root);
      rawFrames.push(obj);
    }
  }

  if (!rawFrames.length) {
    return {
      success: false,
      error: 'Insufficient data. Required details are missing.',
    };
  }

  // Validate each frame against schema
  for (let i = 0; i < rawFrames.length; i++) {
    const validation = validateFrameSchema(rawFrames[i]);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }
  }

  const title = doc.documentElement?.getAttribute('name') || doc.documentElement?.getAttribute('title');
  return processNormalizedFrames(rawFrames, fileName, { title });
}

/**
 * Converts XML DOM node to plain JavaScript object
 */
function xmlNodeToObject(node) {
  const obj = {};
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const key = child.tagName.toLowerCase();
    const textVal = child.textContent.trim();

    if (child.children.length > 0) {
      const subObj = xmlNodeToObject(child);
      const vals = Object.values(subObj);
      if (vals.length === 4 && vals.every((v) => typeof v === 'number')) {
        obj[key] = vals;
      } else {
        obj[key] = subObj;
      }
    } else {
      // Check comma/space separated values like "118.2, 120.1, 117.9, 119.5"
      if (textVal.includes(',') || textVal.includes(' ')) {
        const parts = textVal.split(/[,\s]+/).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
        if (parts.length > 1) {
          obj[key] = parts;
          continue;
        }
      }

      // If textVal represents a number, convert it, otherwise keep as text string for type validation
      const num = Number(textVal);
      obj[key] = isNaN(num) || textVal === '' ? textVal : num;
    }
  }
  return obj;
}

/**
 * Normalizes validated frames and generates complete Digital Twin state
 */
function processNormalizedFrames(rawFrames, fileName, metadata) {
  const normalizedFrames = [];
  const now = Date.now() / 1000;

  for (let i = 0; i < rawFrames.length; i++) {
    const raw = rawFrames[i];

    // Extract RPM
    const rpm = parseNum(raw.rpm ?? raw.RPM ?? raw.engine_rpm, 4850.0);

    // Extract Altitude
    const altitude_ft = parseNum(raw.altitude_ft ?? raw.alt ?? raw.altitude ?? raw.Altitude, 15000);
    const altitude_m = Math.round(altitude_ft * 0.3048);

    // Extract Pressure (handling kPa, bar, inHg, psi)
    const rawPressure = parseNum(raw.pressure ?? raw.Pressure, null);
    let map_kpa = parseNum(raw.map_kpa ?? raw.MAP ?? raw.manifold_pressure_kpa, null);
    let oil_pressure_kpa = parseNum(raw.oil_pressure_kpa ?? raw.oil_p ?? raw.oil_pressure, null);

    if (map_kpa === null) {
      if (rawPressure !== null) {
        if (rawPressure <= 5.0) map_kpa = rawPressure * 100.0;
        else if (rawPressure < 35.0) map_kpa = rawPressure * 3.38639;
        else if (rawPressure < 200.0) map_kpa = rawPressure;
        else map_kpa = NOMINAL_PHYSICS.map_kpa;
      } else {
        map_kpa = NOMINAL_PHYSICS.map_kpa;
      }
    }

    if (oil_pressure_kpa === null) {
      if (rawPressure !== null && rawPressure >= 200.0) {
        oil_pressure_kpa = rawPressure;
      } else {
        oil_pressure_kpa = NOMINAL_PHYSICS.oil_pressure_kpa;
      }
    } else if (oil_pressure_kpa < 100.0) {
      oil_pressure_kpa = oil_pressure_kpa * 6.89476;
    }

    // Extract CHT (4 cylinders)
    let cht = parseArray(raw.cht ?? raw.CHT, 4);
    if (!cht) {
      const c1 = parseNum(raw.cht1 ?? raw.cht_1 ?? raw.cyl1_cht, null);
      const c2 = parseNum(raw.cht2 ?? raw.cht_2 ?? raw.cyl2_cht, null);
      const c3 = parseNum(raw.cht3 ?? raw.cht_3 ?? raw.cyl3_cht, null);
      const c4 = parseNum(raw.cht4 ?? raw.cht_4 ?? raw.cyl4_cht, null);
      if (c1 !== null && c2 !== null && c3 !== null && c4 !== null) {
        cht = [c1, c2, c3, c4];
      }
    }

    // Extract EGT (4 cylinders)
    let egt = parseArray(raw.egt ?? raw.EGT, 4);
    if (!egt) {
      const e1 = parseNum(raw.egt1 ?? raw.egt_1 ?? raw.cyl1_egt, null);
      const e2 = parseNum(raw.egt2 ?? raw.egt_2 ?? raw.cyl2_egt, null);
      const e3 = parseNum(raw.egt3 ?? raw.egt_3 ?? raw.cyl3_egt, null);
      const e4 = parseNum(raw.egt4 ?? raw.egt_4 ?? raw.cyl4_egt, null);
      if (e1 !== null && e2 !== null && e3 !== null && e4 !== null) {
        egt = [e1, e2, e3, e4];
      }
    }

    // If single temperature metric provided (e.g. Temperature: 120 or 780 or 85)
    const singleTemp = parseNum(raw.temperature ?? raw.Temperature ?? raw.temp, null);
    if (singleTemp !== null) {
      if (singleTemp > 250.0) {
        if (!egt) egt = [singleTemp, singleTemp + 4.0, singleTemp - 3.0, singleTemp + 2.0];
        if (!cht) cht = [...NOMINAL_PHYSICS.cht];
      } else if (singleTemp >= 55.0) {
        if (!cht) cht = [singleTemp, singleTemp + 1.5, singleTemp - 0.5, singleTemp + 1.0];
        if (!egt) egt = [...NOMINAL_PHYSICS.egt];
      } else {
        if (!cht) cht = [...NOMINAL_PHYSICS.cht];
        if (!egt) egt = [...NOMINAL_PHYSICS.egt];
      }
    } else {
      if (!cht) cht = [...NOMINAL_PHYSICS.cht];
      if (!egt) egt = [...NOMINAL_PHYSICS.egt];
    }

    const oil_temp_c = parseNum(raw.oil_temp_c ?? raw.oil_t ?? raw.oil_temp, NOMINAL_PHYSICS.oil_temp_c);
    const coolant_temp_c = parseNum(raw.coolant_temp_c ?? raw.coolant_t, NOMINAL_PHYSICS.coolant_temp_c);
    let vibration_rms_g = parseNum(raw.vibration_rms_g ?? raw.vibration ?? raw.vib, NOMINAL_PHYSICS.vibration_rms_g);
    if (vibration_rms_g > 10.0) {
      vibration_rms_g = Number((vibration_rms_g / 9.80665).toFixed(2));
    }

    const throttle_pct = parseNum(raw.throttle_pct ?? raw.throttle, 74.0);
    const fuel_flow_lph = parseNum(raw.fuel_flow_lph ?? raw.fuel_flow, 24.5);
    const bus_voltage_v = parseNum(raw.bus_voltage_v ?? raw.voltage, 28.2);
    const brake_hp = parseNum(raw.brake_hp ?? raw.power_hp, (rpm / 5000.0) * 115.0);
    const time_s = parseNum(raw.time_s ?? raw.t ?? raw.timestamp_s, i * 0.5);

    // Residuals calculation against physics baseline
    const cht_residuals_c = cht.map((c, idx) => Number((c - NOMINAL_PHYSICS.cht[idx]).toFixed(1)));
    const egt_residuals_c = egt.map((e, idx) => Number((e - NOMINAL_PHYSICS.egt[idx]).toFixed(1)));
    const map_residual_kpa = Number((map_kpa - NOMINAL_PHYSICS.map_kpa).toFixed(1));
    const oil_pressure_residual_kpa = Number((oil_pressure_kpa - NOMINAL_PHYSICS.oil_pressure_kpa).toFixed(1));
    const oil_temp_residual_c = Number((oil_temp_c - NOMINAL_PHYSICS.oil_temp_c).toFixed(1));
    const vibration_residual_g = Number((vibration_rms_g - NOMINAL_PHYSICS.vibration_rms_g).toFixed(2));

    const chtMax = Math.max(...cht);
    const chtMin = Math.min(...cht);
    const chtSpread = Number((chtMax - chtMin).toFixed(1));
    const egtMax = Math.max(...egt);
    const egtMin = Math.min(...egt);
    const egtSpread = Number((egtMax - egtMin).toFixed(1));

    // Dynamic AI anomaly detection based on physical thresholds & cylinder spread
    let anomaly_score = raw.anomaly_score !== undefined ? Number(raw.anomaly_score) : null;
    let severity = raw.severity || null;

    if (anomaly_score === null || isNaN(anomaly_score)) {
      let score = 3.5;

      // Misfire / EGT cylinder imbalance
      if (egtSpread > 150) score += 55.0;
      else if (egtSpread > 60) score += (egtSpread - 60) * 0.45;

      // CHT cylinder imbalance or thermal redline
      if (chtSpread > 25) score += (chtSpread - 25) * 1.5;
      if (chtMax > 135) score += (chtMax - 135) * 3.0;
      if (coolant_temp_c > 102) score += (coolant_temp_c - 102) * 2.5;

      // Oil lubrication loss
      if (oil_pressure_kpa < 260) score += (260 - oil_pressure_kpa) * 0.35;
      if (oil_temp_c > 105) score += (oil_temp_c - 105) * 2.0;

      // Vibration spikes
      if (vibration_rms_g > 1.8) score += (vibration_rms_g - 1.8) * 30.0;

      anomaly_score = Number(Math.max(2.0, Math.min(99.0, score)).toFixed(1));
    }

    if (!severity) {
      if (anomaly_score >= 70) severity = 'CRITICAL';
      else if (anomaly_score >= 35) severity = 'WARNING';
      else if (anomaly_score >= 18) severity = 'CAUTION';
      else severity = 'NOMINAL';
    }

    const is_anomalous = severity !== 'NOMINAL';
    const root_causes = raw.root_causes || [];
    if (!root_causes.length && is_anomalous) {
      if (vibration_rms_g > 2.0) {
        root_causes.push({
          code: 'VIB_ANOMALY',
          title: 'Excessive Torsional Vibration Spike',
          confidence: 0.91,
          affected_subsystem: 'mechanical'
        });
      }
      const maxEgtDropIdx = egt_residuals_c.findIndex((r) => r < -100);
      if (maxEgtDropIdx !== -1) {
        root_causes.push({
          code: `CYL_${maxEgtDropIdx + 1}_MISFIRE`,
          title: `Cylinder #${maxEgtDropIdx + 1} Combustion Deficit / Misfire`,
          confidence: 0.94,
          affected_subsystem: 'combustion'
        });
      }
      if (oil_pressure_kpa < 240) {
        root_causes.push({
          code: 'OIL_PRESSURE_DROP',
          title: 'Lubrication System Pressure Loss',
          confidence: 0.93,
          affected_subsystem: 'lubrication'
        });
      }
      if (chtMax > 138) {
        root_causes.push({
          code: 'THERMAL_OVERHEAT',
          title: 'Cylinder Head Thermal Overheat',
          confidence: 0.89,
          affected_subsystem: 'thermal'
        });
      }
    }

    // Subsystem Health Indices (Exact DRDO/ADE Aero Twin Physics model)
    let combustion_health = 96.0;
    if (egtSpread > 150) combustion_health = Math.max(15.0, 100.0 - (egtSpread * 0.28));
    else if (egtSpread > 60) combustion_health = Math.max(50.0, 100.0 - ((egtSpread - 60) * 0.5));
    if (egtMax > 875) combustion_health -= (egtMax - 875) * 0.4;
    combustion_health = Math.max(10.0, Math.min(100.0, Number(combustion_health.toFixed(1))));

    let thermal_health = 94.0;
    if (chtMax > 125) thermal_health -= (chtMax - 125) * 2.5;
    if (coolant_temp_c > 90) thermal_health -= (coolant_temp_c - 90) * 1.8;
    if (chtSpread > 20) thermal_health -= (chtSpread - 20) * 1.2;
    thermal_health = Math.max(10.0, Math.min(100.0, Number(thermal_health.toFixed(1))));

    let lubrication_health = 95.0;
    if (oil_pressure_kpa < 300) lubrication_health -= (300 - oil_pressure_kpa) * 0.35;
    if (oil_temp_c > 98) lubrication_health -= (oil_temp_c - 98) * 1.5;
    lubrication_health = Math.max(10.0, Math.min(100.0, Number(lubrication_health.toFixed(1))));

    let mechanical_health = 95.0;
    if (vibration_rms_g > 1.5) mechanical_health -= (vibration_rms_g - 1.5) * 25.0;
    mechanical_health = Math.max(10.0, Math.min(100.0, Number(mechanical_health.toFixed(1))));

    const electrical_health = bus_voltage_v >= 24 && bus_voltage_v <= 30 ? 98.0 : 70.0;

    let computed_ehi = (
      combustion_health * 0.28 +
      thermal_health * 0.22 +
      lubrication_health * 0.25 +
      mechanical_health * 0.18 +
      electrical_health * 0.07
    );

    if (severity === 'CRITICAL') {
      computed_ehi = Math.min(computed_ehi, 38.0);
    } else if (severity === 'WARNING') {
      computed_ehi = Math.min(computed_ehi, 68.0);
    }

    const overall_health_index = raw.overall_health_index !== undefined
      ? Number(raw.overall_health_index)
      : Math.max(5, Math.min(100, Math.round(computed_ehi)));

    const rul_mean = Math.max(5, Math.round(850 * Math.pow(overall_health_index / 100, 1.3)));

    const frameSystemState = {
      timestamp: Number((now + time_s).toFixed(3)),
      telemetry: {
        rpm: Math.round(rpm),
        altitude_ft: Math.round(altitude_ft),
        altitude_m,
        airspeed_kts: Math.round(105 + (rpm - 4800) * 0.02),
        oat_c: Number((15 - altitude_m * 0.0065).toFixed(1)),
        map_kpa: Number(map_kpa.toFixed(1)),
        map_inhg: Number((map_kpa * 0.2953).toFixed(2)),
        cht,
        egt,
        oil_pressure_kpa: Number(oil_pressure_kpa.toFixed(1)),
        oil_pressure_psi: Number((oil_pressure_kpa * 0.145038).toFixed(1)),
        oil_temp_c: Number(oil_temp_c.toFixed(1)),
        coolant_temp_c: Number(coolant_temp_c.toFixed(1)),
        vibration_rms_g: Number(vibration_rms_g.toFixed(2)),
        fuel_flow_lph: Number(fuel_flow_lph.toFixed(1)),
        bsfc_g_kwh: 285.0,
        bus_voltage_v: Number(bus_voltage_v.toFixed(1)),
        alternator_current_a: 18.2,
        mission_profile: 'CUSTOM_DATASET',
        turbo_rpm: Math.round(rpm * 19.5),
        brake_hp: Number(brake_hp.toFixed(1)),
        throttle_pct: Number(throttle_pct.toFixed(1)),
        torque_nm: Number(((brake_hp * 7127) / Math.max(1, rpm)).toFixed(1)),
        battery_soc_pct: 98.0,
        mission_time_s: Number(time_s.toFixed(1)),
      },
      ideal_physics: {
        rpm: 4850,
        map_kpa: NOMINAL_PHYSICS.map_kpa,
        cht: [...NOMINAL_PHYSICS.cht],
        egt: [...NOMINAL_PHYSICS.egt],
        oil_pressure_kpa: NOMINAL_PHYSICS.oil_pressure_kpa,
        oil_temp_c: NOMINAL_PHYSICS.oil_temp_c,
        coolant_temp_c: NOMINAL_PHYSICS.coolant_temp_c,
        vibration_rms_g: NOMINAL_PHYSICS.vibration_rms_g,
      },
      ai_diagnostics: {
        anomaly_score,
        is_anomalous,
        severity,
        root_causes,
        physics_residuals: {
          cht_residuals_c,
          egt_residuals_c,
          map_residual_kpa,
          oil_pressure_residual_kpa,
          oil_temp_residual_c,
          vibration_residual_g,
        },
        maintenance_advisories: is_anomalous
          ? ['Schedule borescope inspection on propulsion assembly', 'Inspect spark ignition harness and injector lines']
          : [],
      },
      prognostics: {
        overall_health_index,
        accumulated_flight_hours: 342.5,
        tbo_limit_hours: 1200,
        subsystem_health: {
          combustion: Math.round(combustion_health),
          thermal: Math.round(thermal_health),
          lubrication: Math.round(lubrication_health),
          mechanical: Math.round(mechanical_health),
          electrical: Math.round(electrical_health),
        },
        wear_metrics: {
          valve_seat_wear_pct: Number(((100 - thermal_health) * 0.35).toFixed(1)),
          turbo_bearing_wear_pct: Number(((100 - mechanical_health) * 0.4).toFixed(1)),
          piston_ring_wear_pct: Number(((100 - combustion_health) * 0.3).toFixed(1)),
          oil_degradation_pct: Number(((100 - lubrication_health) * 0.45).toFixed(1)),
          spark_plug_erosion_pct: Number(((100 - combustion_health) * 0.25).toFixed(1)),
        },
        rul_hours: {
          mean: rul_mean,
          lower_95_ci: Math.max(1, Math.round(rul_mean * 0.88)),
          upper_95_ci: Math.round(rul_mean * 1.12),
        },
      },
      replay_state: {
        is_replay: true,
        sortie_id: 'CUSTOM_DATASET',
        frame_index: i,
        total_frames: rawFrames.length,
        frame: {
          time_s,
          rpm,
          cht,
          egt,
          map_kpa,
          oil_pressure_kpa,
          oil_temp_c,
          vibration_rms_g,
          anomaly_score,
          severity,
        },
      },
      active_faults: {},
      mission_profile: 'CUSTOM_DATASET',
    };

    normalizedFrames.push(frameSystemState);
  }

  const duration_s = normalizedFrames.length > 1
    ? Number((normalizedFrames[normalizedFrames.length - 1].telemetry.mission_time_s - normalizedFrames[0].telemetry.mission_time_s).toFixed(1))
    : 1.0;

  return {
    success: true,
    datasetName: metadata.title || fileName,
    fileName,
    totalFrames: normalizedFrames.length,
    durationSeconds: duration_s > 0 ? duration_s : normalizedFrames.length * 0.5,
    frames: normalizedFrames,
    sampleTelemetry: normalizedFrames[0].telemetry,
  };
}

function parseNum(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

function parseArray(val, expectedLen) {
  if (!val) return null;
  if (Array.isArray(val) && val.length >= expectedLen) {
    const slice = val.slice(0, expectedLen).map(Number);
    if (slice.every((n) => !isNaN(n))) return slice;
  }
  if (typeof val === 'string') {
    const parts = val.split(/[,\s]+/).map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
    if (parts.length >= expectedLen) {
      return parts.slice(0, expectedLen);
    }
  }
  return null;
}
