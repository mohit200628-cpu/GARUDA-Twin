"""
FastAPI Backend Server & Real-Time WebSocket Telemetry Hub
"""
import asyncio
import time
import json
from typing import Dict, Any, Optional, List
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.physics.engine_model import AeroPistonEnginePhysics
from app.ai.anomaly_detector import EngineAnomalyDetector
from app.ai.rul_estimator import EngineRULEstimator
from app.simulation.telemetry_generator import MissionScenarioEngine
from app.simulation.mission_replay import MissionReplayEngine

app = FastAPI(
    title="DRDO/IDEX MALE UAV Aero Piston Engine Digital Twin Core",
    description="Real-Time Health Monitoring, Fault Prediction, and Mission Reliability System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core Instances
scenario_engine = MissionScenarioEngine()
anomaly_detector = EngineAnomalyDetector()
rul_estimator = EngineRULEstimator()
replay_engine = MissionReplayEngine()

# Connected WebSocket clients
connected_clients = set()
latest_system_state: Dict[str, Any] = {}

class ProfileRequest(BaseModel):
    profile_key: str

class FaultRequest(BaseModel):
    fault_name: str
    value: Any

class ReplayControlRequest(BaseModel):
    action: str  # "start", "pause", "resume", "seek"
    sortie_id: Optional[str] = None
    index: Optional[int] = None
    speed: Optional[float] = 1.0

class DatasetEvaluateRequest(BaseModel):
    frames: List[Dict[str, Any]]
    title: Optional[str] = "Uploaded Dataset"


@app.get("/api/status")
def get_system_status():
    return {
        "status": "ONLINE",
        "engine_model": "Aero Boxer 4-Cylinder Turbocharged (1352cc / 141 HP)",
        "aircraft_platform": "MALE UAV TAPAS-BH-201 / Archer-NG Class",
        "twin_sync_rate_hz": 10.0,
        "active_mission": scenario_engine.current_profile_key,
        "active_faults": {k: v for k, v in scenario_engine.active_faults.items() if v not in [None, 0.0, 1.0, False]},
        "is_replaying": replay_engine.is_replaying
    }


@app.get("/api/telemetry/latest")
def get_latest_telemetry():
    return latest_system_state


@app.post("/api/simulation/profile")
def set_mission_profile(req: ProfileRequest):
    scenario_engine.set_profile(req.profile_key)
    return {"status": "SUCCESS", "current_profile": req.profile_key}


@app.post("/api/simulation/fault")
def inject_fault(req: FaultRequest):
    scenario_engine.set_fault(req.fault_name, req.value)
    return {
        "status": "SUCCESS",
        "fault_name": req.fault_name,
        "value": req.value,
        "active_faults": scenario_engine.active_faults
    }


@app.post("/api/simulation/clear-faults")
def clear_all_faults():
    scenario_engine.clear_all_faults()
    return {"status": "SUCCESS", "message": "All injected faults cleared to nominal"}


@app.get("/api/replay/sorties")
def get_replay_sorties():
    return {"sorties": replay_engine.get_sorties_list()}


@app.post("/api/replay/control")
def control_replay(req: ReplayControlRequest):
    if req.action == "start" and req.sortie_id:
        replay_engine.start_replay(req.sortie_id)
    elif req.action == "pause":
        replay_engine.pause_replay()
    elif req.action == "resume":
        replay_engine.resume_replay()
    elif req.action == "seek" and req.index is not None:
        replay_engine.seek_replay(req.index)
    elif req.action == "stop":
        replay_engine.pause_replay()
        replay_engine.is_replaying = False

    return {
        "status": "SUCCESS",
        "is_replaying": replay_engine.is_replaying,
        "replay_sortie_id": replay_engine.replay_sortie_id,
        "replay_index": replay_engine.replay_index
    }


@app.post("/api/dataset/evaluate")
def evaluate_custom_dataset(req: DatasetEvaluateRequest):
    """
    Evaluates uploaded dataset frames using the Garuda Twin AI diagnostic core:
    Physics Residual Engine, Isolation Forest ML Anomaly Detector, and RUL Estimator.
    """
    evaluated_frames = []
    local_rul_estimator = EngineRULEstimator()

    base_ideal = {
        "rpm": 4850.0,
        "map_kpa": 118.0,
        "cht": [118.5, 120.0, 118.0, 119.5],
        "egt": [785.0, 790.0, 782.0, 787.0],
        "oil_pressure_kpa": 380.0,
        "oil_temp_c": 92.0,
        "coolant_temp_c": 88.0,
        "vibration_rms_g": 1.25,
    }

    total = len(req.frames)
    for i, frame in enumerate(req.frames):
        raw = frame.get("telemetry", frame)

        rpm = float(raw.get("rpm", raw.get("RPM", 4850.0)))
        alt_ft = float(raw.get("altitude_ft", raw.get("alt", raw.get("altitude", 15000.0))))
        alt_m = round(alt_ft * 0.3048)

        # Pressure resolution
        pressure_raw = raw.get("pressure", raw.get("Pressure", None))
        map_kpa = raw.get("map_kpa", raw.get("MAP", None))
        if map_kpa is None:
            if pressure_raw is not None:
                p_val = float(pressure_raw)
                if p_val <= 5.0:
                    map_kpa = p_val * 100.0
                elif 5.0 < p_val < 35.0:
                    map_kpa = p_val * 3.38639
                else:
                    map_kpa = p_val
            else:
                map_kpa = base_ideal["map_kpa"]
        else:
            map_kpa = float(map_kpa)

        oil_p = raw.get("oil_pressure_kpa", raw.get("oil_p", raw.get("oil_pressure", None)))
        if oil_p is None:
            if pressure_raw is not None and float(pressure_raw) >= 200.0:
                oil_p = float(pressure_raw)
            else:
                oil_p = base_ideal["oil_pressure_kpa"]
        else:
            oil_p = float(oil_p)
            if oil_p < 100.0:
                oil_p = oil_p * 6.89476

        # Temperature resolution
        raw_cht = raw.get("cht", raw.get("CHT", None))
        raw_egt = raw.get("egt", raw.get("EGT", None))
        temp_raw = raw.get("temperature", raw.get("Temperature", raw.get("temp", None)))

        if raw_cht and isinstance(raw_cht, list) and len(raw_cht) >= 4:
            cht = [float(x) for x in raw_cht[:4]]
        elif temp_raw is not None:
            t_val = float(temp_raw)
            if 55.0 <= t_val <= 200.0:
                cht = [t_val, t_val + 1.5, t_val - 0.5, t_val + 1.0]
            else:
                cht = list(base_ideal["cht"])
        else:
            cht = list(base_ideal["cht"])

        if raw_egt and isinstance(raw_egt, list) and len(raw_egt) >= 4:
            egt = [float(x) for x in raw_egt[:4]]
        elif temp_raw is not None and float(temp_raw) > 250.0:
            t_val = float(temp_raw)
            egt = [t_val, t_val + 4.0, t_val - 3.0, t_val + 2.0]
        else:
            egt = list(base_ideal["egt"])

        oil_t = float(raw.get("oil_temp_c", raw.get("oil_t", base_ideal["oil_temp_c"])))
        coolant_t = float(raw.get("coolant_temp_c", raw.get("coolant_t", base_ideal["coolant_temp_c"])))
        vib = float(raw.get("vibration_rms_g", raw.get("vibration", raw.get("vib", base_ideal["vibration_rms_g"]))))
        if vib > 10.0:
            vib = vib / 9.80665

        fuel_flow = float(raw.get("fuel_flow_lph", raw.get("fuel_flow", 24.5)))
        bus_v = float(raw.get("bus_voltage_v", raw.get("voltage", 28.2)))
        throttle = float(raw.get("throttle_pct", raw.get("throttle", 74.0)))
        brake_hp = float(raw.get("brake_hp", raw.get("power_hp", (rpm / 5000.0) * 115.0)))
        time_s = float(raw.get("time_s", raw.get("t", i * 0.5)))

        telemetry = {
            "rpm": round(rpm),
            "altitude_ft": round(alt_ft),
            "altitude_m": alt_m,
            "airspeed_kts": round(105 + (rpm - 4800) * 0.02),
            "oat_c": round(15.0 - alt_m * 0.0065, 1),
            "map_kpa": round(map_kpa, 1),
            "map_inhg": round(map_kpa * 0.2953, 2),
            "cht": [round(c, 1) for c in cht],
            "egt": [round(e, 1) for e in egt],
            "oil_pressure_kpa": round(oil_p, 1),
            "oil_pressure_psi": round(oil_p * 0.145038, 1),
            "oil_temp_c": round(oil_t, 1),
            "coolant_temp_c": round(coolant_t, 1),
            "vibration_rms_g": round(vib, 2),
            "fuel_flow_lph": round(fuel_flow, 1),
            "bsfc_g_kwh": 285.0,
            "bus_voltage_v": round(bus_v, 1),
            "alternator_current_a": 18.2,
            "mission_profile": "CUSTOM_DATASET",
            "turbo_rpm": round(rpm * 19.5),
            "brake_hp": round(brake_hp, 1),
            "throttle_pct": round(throttle, 1),
            "torque_nm": round((brake_hp * 7127.0) / max(1.0, rpm), 1),
            "battery_soc_pct": 98.0,
            "mission_time_s": round(time_s, 1),
        }

        # Run AI evaluation with physics & ML Isolation Forest
        anomaly_report = anomaly_detector.evaluate(telemetry, base_ideal)
        prognostics_report = local_rul_estimator.step_prognostics(telemetry, anomaly_report, flight_dt_hours=0.0005)

        evaluated_frame = {
            "timestamp": round(time.time() + time_s, 3),
            "telemetry": telemetry,
            "ideal_physics": base_ideal,
            "ai_diagnostics": anomaly_report,
            "prognostics": prognostics_report,
            "replay_state": {
                "is_replay": True,
                "sortie_id": "CUSTOM_DATASET",
                "frame_index": i,
                "total_frames": total,
                "frame": {"time_s": time_s, "progress_pct": round((i / max(1, total - 1)) * 100, 1)}
            }
        }
        evaluated_frames.append(evaluated_frame)

    return {
        "status": "SUCCESS",
        "title": req.title,
        "frames": evaluated_frames
    }


@app.get("/api/report/generate")
def generate_health_report():
    """Generates a formal DRDO/IDEX Airworthiness & Engine Health Certificate."""
    state = latest_system_state
    telemetry = state.get("telemetry", {})
    ai = state.get("ai_diagnostics", {})
    prognostics = state.get("prognostics", {})

    # Sanitize and clamp all subsystem health percentages strictly within [0.0, 100.0]
    subsystem_health = {}
    for sub, val in prognostics.get("subsystem_health", {}).items():
        try:
            subsystem_health[sub] = round(max(0.0, min(100.0, float(val))), 1)
        except (ValueError, TypeError):
            subsystem_health[sub] = 95.0

    # Sanitize and clamp all hardware degradation percentages strictly within [0.0, 100.0]
    component_wear = {}
    for comp, val in prognostics.get("wear_metrics", {}).items():
        try:
            component_wear[comp] = round(max(0.0, min(100.0, float(val))), 1)
        except (ValueError, TypeError):
            component_wear[comp] = 20.0

    # Sanitize diagnosed anomalies confidence percentages
    diagnosed_anomalies = []
    for anom in ai.get("root_causes", []):
        anom_copy = dict(anom)
        if "confidence" in anom_copy:
            try:
                anom_copy["confidence"] = round(max(0.0, min(100.0, float(anom_copy["confidence"]))), 1)
            except (ValueError, TypeError):
                pass
        diagnosed_anomalies.append(anom_copy)

    overall_health = round(max(0.0, min(100.0, float(prognostics.get("overall_health_index", 95.0)))), 1)
    anomaly_score = round(max(0.0, min(100.0, float(ai.get("anomaly_score", 4.0)))), 1)

    report = {
        "report_id": f"DRDO-EHI-{int(time.time())}",
        "timestamp_utc": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "organization": "DRDO / Aeronautical Development Establishment (ADE)",
        "department": "Department of Defence Production / IDEX",
        "aircraft_tail_no": "UAV-TAPAS-07",
        "engine_serial": "GTRE-AP-4C-0941",
        "mission_name": telemetry.get("mission_name", "Surveillance Sortie"),
        "accumulated_engine_hours": prognostics.get("accumulated_flight_hours", 342.5),
        "overall_health_index": overall_health,
        "anomaly_severity": ai.get("severity", "NOMINAL"),
        "anomaly_score": anomaly_score,
        "rul_projection_hours": prognostics.get("rul_hours", {}).get("mean", 850.0),
        "subsystem_health_audit": subsystem_health,
        "component_wear_audit": component_wear,
        "diagnosed_anomalies": diagnosed_anomalies,
        "airworthiness_prescriptions": ai.get("maintenance_advisories", []),
        "operating_summary": {
            "max_rpm_recorded": telemetry.get("rpm", 4800),
            "max_cht_recorded": max(telemetry.get("cht", [120])),
            "max_egt_recorded": max(telemetry.get("egt", [790])),
            "min_oil_pressure_kpa": telemetry.get("oil_pressure_kpa", 380),
            "max_vibration_g": telemetry.get("vibration_rms_g", 1.2)
        },
        "certification_status": "GO FOR SORTIE" if ai.get("severity") in ["NOMINAL", "ADVISORY"] else "MAINTENANCE MANDATORY / GROUNDED"
    }
    return report


@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            # Keep receiving any client messages or pings
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        connected_clients.remove(websocket)
    except Exception:
        if websocket in connected_clients:
            connected_clients.remove(websocket)


async def telemetry_simulation_loop():
    """
    Continuous 10Hz background loop that steps physics, runs AI/ML diagnostics,
    computes RUL, and streams synchronized digital twin state to all connected clients.
    """
    global latest_system_state
    dt = 0.1  # 100 ms per step (10 Hz)
    
    while True:
        try:
            # 1. Step simulation
            actual_telemetry, ideal_twin, can_frames = scenario_engine.step(dt=dt)
            
            # 2. Evaluate AI/ML Anomaly Detection & Explainable Root Cause
            anomaly_report = anomaly_detector.evaluate(actual_telemetry, ideal_twin)
            
            # 3. Update Prognostics & RUL
            prognostics_report = rul_estimator.step_prognostics(
                actual_telemetry,
                anomaly_report,
                flight_dt_hours=(dt / 3600.0)
            )
            
            # 4. Check if replay is active
            replay_data = None
            if replay_engine.is_replaying:
                replay_data = replay_engine.step_replay()
                
            # 5. Record frame to memory buffer
            replay_engine.record_frame(actual_telemetry)
            
            # 6. Assemble complete digital twin package
            system_state = {
                "timestamp": round(time.time(), 3),
                "telemetry": actual_telemetry,
                "ideal_physics": ideal_twin,
                "ai_diagnostics": anomaly_report,
                "prognostics": prognostics_report,
                "can_bus": can_frames,
                "replay_state": replay_data,
                "active_faults": scenario_engine.active_faults,
                "mission_profile": scenario_engine.current_profile_key
            }
            
            latest_system_state = system_state
            
            # Broadcast to WebSockets
            if connected_clients:
                state_json = json.dumps(system_state)
                dead_clients = []
                for ws in connected_clients:
                    try:
                        await ws.send_text(state_json)
                    except Exception:
                        dead_clients.append(ws)
                for ws in dead_clients:
                    if ws in connected_clients:
                        connected_clients.remove(ws)
                        
        except Exception as e:
            print(f"Error in telemetry loop: {e}")
            
        await asyncio.sleep(dt)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(telemetry_simulation_loop())

# Serve production-built React frontend if present
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

