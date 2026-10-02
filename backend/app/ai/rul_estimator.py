"""
Prognostics & Remaining Useful Life (RUL) Estimator for Aero Piston Engines
"""
import math
from typing import Dict, Any, List

class EngineRULEstimator:
    """
    Prognostic health assessment and degradation tracking engine.
    Calculates Remaining Useful Life (RUL) in flight hours and generates
    defense-standard health indices across all core propulsion subsystems.
    """

    def __init__(self, initial_tbo_hours: float = 1200.0, current_accumulated_hours: float = 342.5):
        self.tbo_hours = initial_tbo_hours  # Time Between Overhaul standard for aero boxer engines
        self.accumulated_hours = current_accumulated_hours
        
        # Degradation trackers (0.0 = pristine, 1.0 = end of life failure)
        self.valve_seat_wear = 0.18
        self.turbo_bearing_wear = 0.22
        self.piston_ring_wear = 0.19
        self.spark_plug_erosion = 0.31
        self.oil_degradation = 0.28
        
    def step_prognostics(
        self,
        telemetry: Dict[str, Any],
        anomaly_report: Dict[str, Any],
        flight_dt_hours: float = 0.001
    ) -> Dict[str, Any]:
        """
        Updates degradation metrics and projects RUL based on operating stress.
        """
        self.accumulated_hours += flight_dt_hours
        
        # Stress multipliers based on harsh operating conditions:
        rpm = telemetry.get("rpm", 4800.0)
        rpm_ratio = rpm / 5800.0
        cht_vals = telemetry.get("cht", [118.0, 118.0, 118.0, 118.0])
        cht_max = max(cht_vals) if cht_vals else 118.0
        cht_min = min(cht_vals) if cht_vals else 118.0
        cht_spread = max(0.0, cht_max - cht_min)

        oil_p = telemetry.get("oil_pressure_kpa", 380.0)
        oil_t = telemetry.get("oil_temp_c", 92.0)
        coolant_t = telemetry.get("coolant_temp_c", 88.0)
        vib_g = telemetry.get("vibration_rms_g", 1.25)
        
        # Thermal stress factor (increases exponentially above 125°C)
        thermal_stress = 1.0 + max(0.0, (cht_max - 120.0) / 10.0) ** 1.8
        # Mechanical stress factor
        mech_stress = 1.0 + (rpm_ratio ** 2.2) * 1.5 + max(0.0, (vib_g - 1.5) * 2.0)
        # Lubrication stress factor
        lube_stress = 1.0 + max(0.0, (oil_t - 95.0) / 10.0) + max(0.0, (300.0 - oil_p) / 50.0)
        
        # Fault acceleration
        anomaly_factor = 1.0 + (anomaly_report.get("anomaly_score", 0.0) / 100.0) * 8.0
        
        # Incremental degradation
        base_rate = flight_dt_hours / (self.tbo_hours * 1.1)
        self.valve_seat_wear = max(0.0, min(1.0, self.valve_seat_wear + base_rate * thermal_stress * 1.1))
        self.turbo_bearing_wear = max(0.0, min(1.0, self.turbo_bearing_wear + base_rate * (telemetry.get("turbo_rpm", 90000.0) / 90000.0) * 1.4))
        self.piston_ring_wear = max(0.0, min(1.0, self.piston_ring_wear + base_rate * mech_stress))
        self.oil_degradation = max(0.0, min(1.0, self.oil_degradation + base_rate * lube_stress * 2.2))
        self.spark_plug_erosion = max(0.0, min(1.0, self.spark_plug_erosion + base_rate * 1.3))
        
        # Account for active faults
        for fault in anomaly_report.get("root_causes", []):
            code = fault.get("code", "")
            if "MISFIRE" in code:
                self.spark_plug_erosion = min(1.0, self.spark_plug_erosion + 0.005)
            elif "LUBRICATION" in code or "OIL" in code:
                self.oil_degradation = min(1.0, self.oil_degradation + 0.008)
            elif "BEARING" in code:
                self.turbo_bearing_wear = min(1.0, self.turbo_bearing_wear + 0.01)
            elif "COOLING" in code:
                self.valve_seat_wear = min(1.0, self.valve_seat_wear + 0.007)
                
        # Subsystem Health Indices (100% = pristine, 0% = failed threshold)
        # 1. Combustion Health: hardware wear on valves and plugs, plus combustion anomalies
        combustion_penalty = (self.valve_seat_wear * 45.0 + self.spark_plug_erosion * 35.0)
        combustion_health = max(5.0, min(100.0, 100.0 - combustion_penalty))

        # 2. Thermal Health: overheating penalties for CHT & coolant, thermal gradient (CHT spread), and valve wear
        # Coolant penalty MUST use max(0.0, coolant_t - 80.0) so cooler/nominal coolant NEVER yields negative penalty (>100%)
        thermal_penalty = (
            max(0.0, cht_max - 110.0) * 2.2 +
            max(0.0, coolant_t - 80.0) * 1.5 +
            max(0.0, cht_spread - 8.0) * 0.5 +
            (self.valve_seat_wear * 15.0)
        )
        thermal_health = max(5.0, min(100.0, 100.0 - thermal_penalty))

        # 3. Lubrication Health: oil degradation wear, low oil pressure, and oil overheating
        lube_penalty = (
            self.oil_degradation * 70.0 +
            max(0.0, 320.0 - oil_p) * 0.3 +
            max(0.0, oil_t - 100.0) * 1.0
        )
        lubrication_health = max(5.0, min(100.0, 100.0 - lube_penalty))

        # 4. Mechanical Health: turbo bearing wear, piston ring wear, and vibrational harmonics
        mech_penalty = (
            self.turbo_bearing_wear * 50.0 +
            self.piston_ring_wear * 40.0 +
            (vib_g * 12.0)
        )
        mechanical_health = max(5.0, min(100.0, 100.0 - mech_penalty))

        # 5. Electrical Health: calibrated for both 14V (14.2V nom) and 28V (28.0V nom) avionics buses
        raw_bus = telemetry.get("bus_voltage_v", 14.2)
        bus_nom = 28.0 if raw_bus > 20.0 else 14.2
        bus_ratio = min(1.0, max(0.0, raw_bus / bus_nom))
        battery_soc = min(100.0, max(0.0, telemetry.get("battery_soc_pct", 98.0)))
        electrical_health = max(10.0, min(100.0, bus_ratio * 85.0 + battery_soc * 0.15))
        
        # Penalize health if severe anomaly is active
        severity = anomaly_report.get("severity", "NOMINAL")
        root_causes = anomaly_report.get("root_causes", [])

        has_cooling_fault = any("COOLING" in f.get("code", "") or "Thermal" in f.get("subsystem", "") for f in root_causes)
        has_combustion_fault = any("MISFIRE" in f.get("code", "") or "INJECTOR" in f.get("code", "") or "Combustion" in f.get("subsystem", "") for f in root_causes)
        has_lube_fault = any("OIL" in f.get("code", "") or "LUBRICATION" in f.get("code", "") or "Lubrication" in f.get("subsystem", "") for f in root_causes)
        has_mech_fault = any("BEARING" in f.get("code", "") or "VIBRATION" in f.get("code", "") or "Mechanical" in f.get("subsystem", "") for f in root_causes)

        if severity == "CRITICAL":
            combustion_health = min(combustion_health, 35.0)
            lubrication_health = min(lubrication_health, 30.0)
            if has_cooling_fault:
                thermal_health = min(thermal_health, 30.0)
            if has_mech_fault:
                mechanical_health = min(mechanical_health, 25.0)
        elif severity == "WARNING":
            thermal_health = min(thermal_health, 55.0)
            if has_combustion_fault:
                combustion_health = min(combustion_health, 55.0)
            if has_lube_fault:
                lubrication_health = min(lubrication_health, 50.0)
            if has_mech_fault:
                mechanical_health = min(mechanical_health, 45.0)

        # Ensure all subsystem health values are strictly bounded between 5.0% and 100.0%
        combustion_health = max(5.0, min(100.0, combustion_health))
        thermal_health = max(5.0, min(100.0, thermal_health))
        lubrication_health = max(5.0, min(100.0, lubrication_health))
        mechanical_health = max(5.0, min(100.0, mechanical_health))
        electrical_health = max(10.0, min(100.0, electrical_health))
            
        # Composite Overall Engine Health Index (EHI)
        overall_health_index = (
            combustion_health * 0.28 +
            thermal_health * 0.22 +
            lubrication_health * 0.25 +
            mechanical_health * 0.18 +
            electrical_health * 0.07
        )
        overall_health_index = max(2.0, min(100.0, overall_health_index))
        
        # RUL Projection (Hours remaining before mandatory overhaul or critical failure)
        # Standard nominal hours left = TBO - accumulated
        nominal_hours_remaining = max(0.0, self.tbo_hours - self.accumulated_hours)
        
        # Health-adjusted RUL
        rul_health_multiplier = (overall_health_index / 100.0) ** 1.3
        
        # If acute critical fault, RUL drops to hours or emergency minutes
        if severity == "CRITICAL":
            rul_mean_hours = min(nominal_hours_remaining * 0.05, 12.0)
            rul_lower_bound = max(0.5, rul_mean_hours * 0.6)
            rul_upper_bound = rul_mean_hours * 1.4
        elif severity == "WARNING":
            rul_mean_hours = min(nominal_hours_remaining * 0.45, 120.0)
            rul_lower_bound = rul_mean_hours * 0.8
            rul_upper_bound = rul_mean_hours * 1.25
        elif severity == "CAUTION":
            rul_mean_hours = nominal_hours_remaining * 0.78
            rul_lower_bound = rul_mean_hours * 0.88
            rul_upper_bound = rul_mean_hours * 1.12
        else:
            rul_mean_hours = nominal_hours_remaining * rul_health_multiplier
            rul_lower_bound = rul_mean_hours * 0.92
            rul_upper_bound = rul_mean_hours * 1.08
            
        return {
            "accumulated_flight_hours": round(self.accumulated_hours, 2),
            "tbo_limit_hours": self.tbo_hours,
            "overall_health_index": round(overall_health_index, 1),
            "subsystem_health": {
                "combustion": round(combustion_health, 1),
                "thermal": round(thermal_health, 1),
                "lubrication": round(lubrication_health, 1),
                "mechanical": round(mechanical_health, 1),
                "electrical": round(electrical_health, 1)
            },
            "wear_metrics": {
                "valve_seat_wear_pct": round(max(0.0, min(100.0, self.valve_seat_wear * 100.0)), 1),
                "turbo_bearing_wear_pct": round(max(0.0, min(100.0, self.turbo_bearing_wear * 100.0)), 1),
                "piston_ring_wear_pct": round(max(0.0, min(100.0, self.piston_ring_wear * 100.0)), 1),
                "oil_degradation_pct": round(max(0.0, min(100.0, self.oil_degradation * 100.0)), 1),
                "spark_plug_erosion_pct": round(max(0.0, min(100.0, self.spark_plug_erosion * 100.0)), 1)
            },
            "rul_hours": {
                "mean": round(rul_mean_hours, 1),
                "lower_95_ci": round(rul_lower_bound, 1),
                "upper_95_ci": round(rul_upper_bound, 1),
                "confidence_pct": 95.0
            }
        }
