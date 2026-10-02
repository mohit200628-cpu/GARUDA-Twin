"""
Mission Recorder & Replay Engine for Post-Flight Debriefing and Anomaly Investigation
"""
import time
import math
from typing import Dict, Any, List, Optional

class MissionReplayEngine:
    """
    Flight Data Recorder (FDR) and Mission Replay module.
    Enables forensic investigation of in-flight anomalies, playback scrubbing,
    and historical sortie comparisons.
    """

    def __init__(self, max_buffer_len: int = 1800):
        self.max_buffer_len = max_buffer_len
        self.live_buffer: List[Dict[str, Any]] = []
        
        # Playback state
        self.is_replaying = False
        self.replay_sortie_id = "NOMINAL_ISR"
        self.replay_index = 0
        self.playback_speed = 1.0  # 0.5x, 1x, 2x, 5x
        
        # Pre-generate sample historical sorties for instant demonstrator review
        self.historical_sorties = self._build_preset_sorties()

    def record_frame(self, frame: Dict[str, Any]):
        """Records a live telemetry snapshot into the circular memory buffer."""
        self.live_buffer.append(frame)
        if len(self.live_buffer) > self.max_buffer_len:
            self.live_buffer.pop(0)

    def _build_preset_sorties(self) -> Dict[str, Dict[str, Any]]:
        """Generates realistic pre-recorded UAV mission datasets for post-flight replay."""
        sorties = {}
        
        # Sortie A: Nominal ISR Surveillance Mission (200 frames)
        nominal_frames = []
        for i in range(200):
            t = i * 0.5
            rpm = 4850.0 + math.sin(t * 0.1) * 35.0
            nominal_frames.append({
                "time_s": round(t, 1),
                "altitude_ft": 15000 + int(math.sin(t * 0.05) * 80),
                "rpm": round(rpm, 1),
                "throttle_pct": 74.0,
                "map_kpa": 118.5,
                "cht": [118.2, 120.1, 117.9, 119.5],
                "egt": [785.0, 792.0, 781.0, 788.0],
                "oil_pressure_kpa": 382.0,
                "oil_temp_c": 92.4,
                "coolant_temp_c": 88.0,
                "vibration_rms_g": 1.25,
                "anomaly_score": 4.2,
                "severity": "NOMINAL"
            })
            
        sorties["SORTIE_TAPAS_07_NOMINAL"] = {
            "title": "TAPAS Sortie #104 - Nominal ISR Loiter (Pokhran Sector)",
            "duration_s": 100.0,
            "description": "Standard 200-second loiter profile displaying stable multi-cylinder thermal parity and nominal lubrication pressure.",
            "total_frames": len(nominal_frames),
            "anomaly_detected": False,
            "frames": nominal_frames
        }

        # Sortie B: Cylinder #3 In-Flight Misfire Incident (200 frames)
        misfire_frames = []
        for i in range(200):
            t = i * 0.5
            is_fault = (i >= 80)
            rpm = 4820.0 if not is_fault else 4280.0 + math.sin(t * 0.8) * 60.0
            egt3 = 782.0 if not is_fault else max(240.0, 782.0 - (i - 80) * 14.0)
            cht3 = 118.5 if not is_fault else max(75.0, 118.5 - (i - 80) * 1.1)
            vib = 1.28 if not is_fault else min(4.6, 1.28 + (i - 80) * 0.08)
            score = 5.0 if not is_fault else min(98.5, 25.0 + (i - 80) * 2.2)
            sev = "NOMINAL" if not is_fault else ("WARNING" if i < 110 else "CRITICAL")
            
            misfire_frames.append({
                "time_s": round(t, 1),
                "altitude_ft": 16200,
                "rpm": round(rpm, 1),
                "throttle_pct": 75.0,
                "map_kpa": 117.0,
                "cht": [118.2, 120.5, round(cht3, 1), 119.8],
                "egt": [784.0, 790.0, round(egt3, 1), 786.0],
                "oil_pressure_kpa": 375.0,
                "oil_temp_c": 94.0,
                "coolant_temp_c": 86.0 if not is_fault else round(max(70.0, 86.0 - (i - 80) * 0.1), 1),
                "vibration_rms_g": round(vib, 2),
                "anomaly_score": round(score, 1),
                "severity": sev
            })
            
        sorties["SORTIE_TAPAS_08_MISFIRE"] = {
            "title": "TAPAS Sortie #108 - Cyl #3 Ignition Drop & Rapid Misfire",
            "duration_s": 100.0,
            "description": "Critical in-flight ignition loss on Cylinder #3 at T+40s causing sudden EGT drop, asymmetric torque and severe torsional vibration.",
            "total_frames": len(misfire_frames),
            "anomaly_detected": True,
            "frames": misfire_frames
        }
        
        return sorties

    def get_sorties_list(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": k,
                "title": v["title"],
                "duration_s": v["duration_s"],
                "description": v["description"],
                "total_frames": v["total_frames"],
                "anomaly_detected": v["anomaly_detected"]
            }
            for k, v in self.historical_sorties.items()
        ]

    def start_replay(self, sortie_id: str):
        if sortie_id in self.historical_sorties:
            self.is_replaying = True
            self.replay_sortie_id = sortie_id
            self.replay_index = 0

    def pause_replay(self):
        self.is_replaying = False

    def resume_replay(self):
        self.is_replaying = True

    def seek_replay(self, index: int):
        if self.replay_sortie_id in self.historical_sorties:
            total = self.historical_sorties[self.replay_sortie_id]["total_frames"]
            self.replay_index = max(0, min(total - 1, index))

    def step_replay(self) -> Optional[Dict[str, Any]]:
        """Steps forward in replay and returns the frame."""
        if not self.is_replaying or self.replay_sortie_id not in self.historical_sorties:
            return None
            
        frames = self.historical_sorties[self.replay_sortie_id]["frames"]
        if self.replay_index >= len(frames):
            self.replay_index = 0  # Loop replay
            
        frame = frames[self.replay_index]
        self.replay_index = (self.replay_index + 1) % len(frames)
        return {
            "is_replay": True,
            "sortie_id": self.replay_sortie_id,
            "frame_index": self.replay_index,
            "total_frames": len(frames),
            "frame": frame
        }
