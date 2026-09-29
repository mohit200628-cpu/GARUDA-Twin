


"""
Physics-Informed & Machine Learning Anomaly Detector with Explainable Root Cause Analysis
"""
import numpy as np
from typing import Dict, Any, List, Optional
from sklearn.ensemble import IsolationForest
from app.physics.engine_model import AeroPistonEnginePhysics

class EngineAnomalyDetector:
    """
    Hybrid Anomaly Detection System:
    Combines First-Principles Physics Residuals with ML Isolation Forest & Expert Diagnostics.
    """

    def __init__(self):
        # Feature order for ML model:
        # [rpm, map_kpa, cht_mean, cht_spread, egt_mean, egt_spread, oil_p, oil_t, vib_rms, bsfc]
        self.feature_names = [
            "rpm", "map_kpa", "cht_mean", "cht_spread",
            "egt_mean", "egt_spread", "oil_p", "oil_t", "vib_rms", "bsfc"
        ]
        
        # Pre-train an Isolation Forest with synthetic baseline nominal envelope
        self.iso_forest = IsolationForest(n_estimators=60, contamination=0.01, random_state=42)
        self._bootstrap_model()
        
    def _bootstrap_model(self):
        """Pre-fits the baseline model with nominal operating data envelope from physics model."""
        np.random.seed(42)
        samples = []
        for throttle in [35.0, 50.0, 65.0, 75.0, 85.0, 95.0]:
            for alt in [500.0, 1500.0, 3000.0, 4500.0, 6000.0]:
                eng = AeroPistonEnginePhysics()
                for _ in range(8):
                    t = eng.step_thermodynamics(throttle, alt, dt=0.5)
                
                c_m = float(np.mean(t["cht"]))
                c_s = float(np.max(t["cht"]) - np.min(t["cht"]))
                e_m = float(np.mean(t["egt"]))
                e_s = float(np.max(t["egt"]) - np.min(t["egt"]))
                
                # Base sample
                samples.append([
                    t["rpm"], t["map_kpa"], c_m, c_s, e_m, e_s,
                    t["oil_pressure_kpa"], t["oil_temp_c"], t["vibration_rms_g"], t["bsfc_g_kwh"]
                ])
                # Perturbations
                for _ in range(12):
                    samples.append([
                        t["rpm"] + np.random.normal(0, 10.0),
                        t["map_kpa"] + np.random.normal(0, 0.4),
                        c_m + np.random.normal(0, 1.2),
                        c_s + np.random.normal(0, 0.3),
                        e_m + np.random.normal(0, 4.0),
                        e_s + np.random.normal(0, 1.5),
                        t["oil_pressure_kpa"] + np.random.normal(0, 4.0),
                        t["oil_temp_c"] + np.random.normal(0, 1.0),
                        t["vibration_rms_g"] + np.random.normal(0, 0.04),
                        t["bsfc_g_kwh"] + np.random.normal(0, 6.0)
                    ])
                    
        self.iso_forest.fit(np.array(samples))

    def evaluate(
        self,
        telemetry: Dict[str, Any],
        physics_nominal: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluates real-time telemetry against physics expectations and ML boundaries.
        Returns:
        - anomaly_score: 0 (Normal) to 100 (Severe Fault)
        - is_anomalous: Boolean
        - severity: 'NOMINAL', 'ADVISORY', 'CAUTION', 'WARNING', 'CRITICAL'
        - root_causes: List of diagnosed failure modes with confidence & details
        - physics_residuals: Discrepancies between theoretical physics and actual sensors
        - maintenance_advisories: Prescriptive actions for ground crews & pilots
        """
        # 1. Compute Physics Residuals
        cht_actual = telemetry["cht"]
        egt_actual = telemetry["egt"]
        cht_ideal = physics_nominal["cht"]
        egt_ideal = physics_nominal["egt"]
        
        cht_residuals = [round(a - b, 1) for a, b in zip(cht_actual, cht_ideal)]
        egt_residuals = [round(a - b, 1) for a, b in zip(egt_actual, egt_ideal)]
        map_residual = round(telemetry["map_kpa"] - physics_nominal["map_kpa"], 1)
        oil_p_residual = round(telemetry["oil_pressure_kpa"] - physics_nominal["oil_pressure_kpa"], 1)
        oil_t_residual = round(telemetry["oil_temp_c"] - physics_nominal["oil_temp_c"], 1)
        vib_residual = round(telemetry["vibration_rms_g"] - physics_nominal["vibration_rms_g"], 2)
        
        # 2. Extract statistical metrics
        cht_mean = float(np.mean(cht_actual))
        cht_spread = float(np.max(cht_actual) - np.min(cht_actual))
        egt_mean = float(np.mean(egt_actual))
        egt_spread = float(np.max(egt_actual) - np.min(egt_actual))
        
        # 3. ML Scoring (Isolation Forest Decision Function)
        X_curr = np.array([[
            telemetry["rpm"],
            telemetry["map_kpa"],
            cht_mean,
            cht_spread,
            egt_mean,
            egt_spread,
            telemetry["oil_pressure_kpa"],
            telemetry["oil_temp_c"],
            telemetry["vibration_rms_g"],
            telemetry["bsfc_g_kwh"]
        ]])
        
        # Raw score: positive is inliers, negative is outliers
        raw_score = self.iso_forest.decision_function(X_curr)[0]
        if raw_score >= 0.0:
            # Nominal inlier: smoothly scale between 2.0% and 14.0%
            ml_score = float(max(2.0, 14.0 - (raw_score / 0.15) * 12.0))
        else:
            # Outlier: scale from 25.0% to 100.0%
            ml_score = float(min(100.0, 25.0 + (abs(raw_score) / 0.25) * 75.0))
        
        # 4. Expert Diagnostics & Root Cause Analysis
        root_causes = []
        advisories = []
        severity = "NOMINAL"
        
        # Check Misfire
        # Characteristic: One cylinder EGT significantly below others (egt_spread > 200°C) + vib rise
        for i in range(4):
            if egt_actual[i] < 450.0 and telemetry["rpm"] > 2500.0:
                root_causes.append({
                    "code": f"MISFIRE_CYL_{i+1}",
                    "title": f"Cylinder #{i+1} Severe Combustion Misfire",
                    "subsystem": "Combustion",
                    "confidence": 96.5,
                    "evidence": f"Cylinder #{i+1} EGT dropped to {egt_actual[i]}°C with {telemetry['vibration_rms_g']}G torsional jitter."
                })
                advisories.append({
                    "priority": "CRITICAL",
                    "action": f"Immediate Sortie Abort. Inspect Spark Plug & Ignition Coil on Cyl #{i+1}.",
                    "downtime_est": "2.5 flight hrs"
                })
                severity = "CRITICAL"
                
        # Check Injector Abnormalities / Lean Spike
        for i in range(4):
            if egt_actual[i] > 875.0:
                root_causes.append({
                    "code": f"INJECTOR_LEAN_CYL_{i+1}",
                    "title": f"Cylinder #{i+1} Fuel Injector Restriction (Lean Spike)",
                    "subsystem": "Fuel Injection",
                    "confidence": 92.0,
                    "evidence": f"Cylinder #{i+1} EGT abnormally elevated at {egt_actual[i]}°C (> 875°C threshold)."
                })
                advisories.append({
                    "priority": "WARNING",
                    "action": f"Derate throttle to avoid piston crown detonation. Clean/replace Injector #{i+1} at post-flight.",
                    "downtime_est": "1.5 flight hrs"
                })
                if severity != "CRITICAL":
                    severity = "WARNING"
                    
        # Check Cooling Degradation
        if cht_mean > 138.0 or telemetry["coolant_temp_c"] > 108.0:
            root_causes.append({
                "code": "COOLING_SYSTEM_DEGRADATION",
                "title": "Cooling System Degradation / Radiator Core Restriction",
                "subsystem": "Thermal Management",
                "confidence": 88.5,
                "evidence": f"Mean CHT {cht_mean:.1f}°C and coolant temp {telemetry['coolant_temp_c']}°C exceed thermal redline limits."
            })
            advisories.append({
                "priority": "WARNING" if cht_mean < 145.0 else "CRITICAL",
                "action": "Increase UAV airspeed to maximize ram air cooling. Inspect coolant pump impeller & check radiator for FOD.",
                "downtime_est": "3.0 flight hrs"
            })
            if severity != "CRITICAL":
                severity = "WARNING" if cht_mean < 145.0 else "CRITICAL"

        # Check Lubrication Issues
        if telemetry["oil_pressure_kpa"] < 210.0 and telemetry["rpm"] > 3500.0:
            root_causes.append({
                "code": "OIL_PRESSURE_CRITICAL_LOW",
                "title": "Lubrication Oil Pressure Loss / Scavenge Pump Fault",
                "subsystem": "Lubrication",
                "confidence": 98.0,
                "evidence": f"Oil pressure at {telemetry['oil_pressure_kpa']} kPa is dangerously below 250 kPa nominal at {telemetry['rpm']:.0f} RPM."
            })
            advisories.append({
                "priority": "CRITICAL",
                "action": "Command Emergency UAV RTB (Return to Base). Engine seizure risk imminent within 15-20 minutes.",
                "downtime_est": "8.0 flight hrs"
            })
            severity = "CRITICAL"
        elif telemetry["oil_temp_c"] > 118.0:
            root_causes.append({
                "code": "OIL_OVERHEATING",
                "title": "Engine Oil Overheating / Oil Cooler Restriction",
                "subsystem": "Lubrication",
                "confidence": 85.0,
                "evidence": f"Oil temperature reached {telemetry['oil_temp_c']}°C (limit 115°C)."
            })
            advisories.append({
                "priority": "CAUTION",
                "action": "Reduce continuous power setting. Inspect oil cooler thermostat valve.",
                "downtime_est": "1.0 flight hr"
            })
            if severity == "NOMINAL":
                severity = "CAUTION"

        # Check Abnormal Vibration Patterns
        if telemetry["vibration_rms_g"] > 3.2:
            root_causes.append({
                "code": "BEARING_WEAR_VIBRATION",
                "title": "Severe Engine Vibration / Crankshaft Bearing Degradation",
                "subsystem": "Mechanical Power Section",
                "confidence": 91.0,
                "evidence": f"Vibration RMS reached {telemetry['vibration_rms_g']} G with harmonic excitation."
            })
            advisories.append({
                "priority": "WARNING",
                "action": "Conduct borescope inspection of crankshaft bearings and check propeller dynamic balance.",
                "downtime_est": "4.5 flight hrs"
            })
            if severity not in ["CRITICAL", "WARNING"]:
                severity = "WARNING"

        # Check Turbocharger / MAP Leak
        if map_residual < -20.0 and telemetry["throttle_pct"] > 75.0:
            root_causes.append({
                "code": "TURBO_BOOST_DEFICIT",
                "title": "Turbocharger Boost Deficit / Wastegate Actuator Leak",
                "subsystem": "Air Induction & Turbo",
                "confidence": 84.0,
                "evidence": f"Measured MAP is {abs(map_residual)} kPa below thermodynamic prediction for current throttle setting."
            })
            advisories.append({
                "priority": "CAUTION",
                "action": "Inspect turbocharger wastegate linkage and intercooler charge air piping for pneumatic leaks.",
                "downtime_est": "2.0 flight hrs"
            })
            if severity == "NOMINAL":
                severity = "CAUTION"

        # 5. Composite Anomaly Score Calculation
        if len(root_causes) > 0:
            # If explicit physical fault detected, boost score appropriately
            max_fault_weight = 85.0 if severity == "CRITICAL" else (65.0 if severity == "WARNING" else 40.0)
            final_score = max(ml_score, max_fault_weight)
        else:
            final_score = ml_score

        # If no faults, give standard healthy advisory
        if not advisories:
            advisories.append({
                "priority": "NORMAL",
                "action": "All engine propulsion subsystems operating within green airworthiness envelope.",
                "downtime_est": "Routine 50hr TBO check"
            })

        return {
            "anomaly_score": round(final_score, 1),
            "is_anomalous": final_score > 35.0,
            "severity": severity,
            "root_causes": root_causes,
            "physics_residuals": {
                "cht_residuals_c": cht_residuals,
                "egt_residuals_c": egt_residuals,
                "map_residual_kpa": map_residual,
                "oil_pressure_residual_kpa": oil_p_residual,
                "oil_temp_residual_c": oil_t_residual,
                "vibration_residual_g": vib_residual
            },
            "maintenance_advisories": advisories
        }
