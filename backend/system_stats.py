"""
HYBRID SENTRY — System Statistics
psutil-based monitoring: CPU, RAM, Temp, FPS, Storage, Network
"""

import time
import threading
from collections import deque
from typing import Optional, Dict, List

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    print("[STATS] psutil not installed")


class SystemStats:
    """
    Live system metrics via psutil.
    Updates every 3 seconds in background thread.
    """

    def __init__(self, update_interval: float = 3.0):
        self._interval = update_interval
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

        # Sparklines
        self._cpu_history: deque = deque(maxlen=30)
        self._fps_history: deque = deque(maxlen=30)

        self._stats: dict = self._zeroed_stats()

    def _zeroed_stats(self) -> dict:
        return {
            "cpu_percent": 0.0,
            "cpu_history": [],
            "ram_used_gb": 0.0,
            "ram_total_gb": 0.0,
            "ram_percent": 0.0,
            "temp_celsius": 0.0,
            "storage_used_gb": 0.0,
            "storage_total_gb": 0.0,
            "storage_percent": 0.0,
            "net_sent_mbps": 0.0,
            "net_recv_mbps": 0.0,
            "wifi_ssid": "",
            "wifi_dbm": 0,
            "ip_address": "",
            "uptime_seconds": 0,
        }

    def start(self):
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="SysStats")
        self._thread.start()

    def stop(self):
        self._stop.set()

    def _loop(self):
        net_prev = None
        net_time_prev = None

        while not self._stop.is_set():
            t0 = time.time()

            if not PSUTIL_AVAILABLE:
                time.sleep(self._interval)
                continue

            stats = {}

            # CPU
            try:
                cpu = psutil.cpu_percent(interval=None)
                stats["cpu_percent"] = cpu
                self._cpu_history.append(cpu)
                stats["cpu_history"] = list(self._cpu_history)
            except Exception:
                pass

            # RAM
            try:
                mem = psutil.virtual_memory()
                stats["ram_used_gb"] = round(mem.used / (1024**3), 2)
                stats["ram_total_gb"] = round(mem.total / (1024**3), 2)
                stats["ram_percent"] = mem.percent
            except Exception:
                pass

            # Temperature (RPi 5 / Linux)
            temp = 0.0
            try:
                temps = psutil.sensors_temperatures()
                if temps:
                    for name, entries in temps.items():
                        if entries:
                            temp = entries[0].current
                            break
            except (AttributeError, Exception):
                # Try RPi-specific path
                try:
                    with open("/sys/class/thermal/thermal_zone0/temp") as f:
                        temp = int(f.read().strip()) / 1000.0
                except Exception:
                    temp = 0.0
            stats["temp_celsius"] = round(temp, 1)

            # Storage
            try:
                disk = psutil.disk_usage("/")
                stats["storage_used_gb"] = round(disk.used / (1024**3), 2)
                stats["storage_total_gb"] = round(disk.total / (1024**3), 2)
                stats["storage_percent"] = disk.percent
            except Exception:
                pass

            # Network speed
            try:
                net_curr = psutil.net_io_counters()
            except Exception:
                net_curr = None

            t_curr = time.time()
            try:
                if net_curr is not None:
                    if net_prev is not None and net_time_prev is not None:
                        dt = t_curr - net_time_prev
                        if dt > 0:
                            sent_mbps = (net_curr.bytes_sent - net_prev.bytes_sent) * 8 / dt / 1e6
                            recv_mbps = (net_curr.bytes_recv - net_prev.bytes_recv) * 8 / dt / 1e6
                            stats["net_sent_mbps"] = round(max(0, sent_mbps), 3)
                            stats["net_recv_mbps"] = round(max(0, recv_mbps), 3)
                    net_prev = net_curr
                    net_time_prev = t_curr
            except Exception:
                pass

            # IP Address
            try:
                import socket
                hostname = socket.gethostname()
                ip = socket.gethostbyname(hostname)
                stats["ip_address"] = ip
            except Exception:
                stats["ip_address"] = "unknown"

            # Uptime
            try:
                boot_time = psutil.boot_time()
                stats["uptime_seconds"] = int(time.time() - boot_time)
            except Exception:
                stats["uptime_seconds"] = 0

            # WiFi (Linux only)
            try:
                import subprocess
                result = subprocess.run(
                    ["iwconfig", "wlan0"],
                    capture_output=True, text=True, timeout=2
                )
                output = result.stdout
                if "ESSID:" in output:
                    import re
                    ssid_match = re.search(r'ESSID:"([^"]*)"', output)
                    dbm_match = re.search(r'Signal level=(-?\d+)', output)
                    stats["wifi_ssid"] = ssid_match.group(1) if ssid_match else ""
                    stats["wifi_dbm"] = int(dbm_match.group(1)) if dbm_match else 0
            except Exception:
                stats["wifi_ssid"] = ""
                stats["wifi_dbm"] = 0

            with self._lock:
                self._stats.update(stats)

            elapsed = time.time() - t0
            sleep_t = max(0, self._interval - elapsed)
            time.sleep(sleep_t)

    def get(self) -> dict:
        with self._lock:
            return dict(self._stats)

    def update_fps(self, fps_value: float):
        """Called from multi_feed to track inference FPS."""
        self._fps_history.append(fps_value)
        with self._lock:
            self._stats["inference_fps"] = fps_value
            self._stats["fps_history"] = list(self._fps_history)


# Global instance
system_stats = SystemStats()
