"""
HYBRID SENTRY — Sensor Controller
MG996R Servo x2 (Pan/Tilt) + KY-038 Sound Sensor
GPIO control via RPi.GPIO + pigpio
External 5V 2A for servos — common ground with RPi
"""

import time
import threading
from typing import Optional, Callable
from datetime import datetime

# GPIO imports — gracefully degrade if not on RPi
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    GPIO_AVAILABLE = False
    GPIO = None
    print("[SENSORS] RPi.GPIO not available — running in SIMULATION mode")

try:
    import pigpio
    PIGPIO_AVAILABLE = True
except ImportError:
    PIGPIO_AVAILABLE = False
    pigpio = None
    print("[SENSORS] pigpio not available — servo control via RPi.GPIO only")

# ─────────────────────────────────────────
# PINS
# ─────────────────────────────────────────
PIN_SERVO_PAN  = 17   # GPIO 17, MG996R Pan
PIN_SERVO_TILT = 18   # GPIO 18, MG996R Tilt
PIN_SOUND      = 27   # GPIO 27, KY-038 digital output

# Servo angle limits
PAN_MIN  = 0
PAN_MAX  = 180
PAN_HOME = 90

TILT_MIN  = 45
TILT_MAX  = 135
TILT_HOME = 90

DEADZONE_DEG = 2.0   # minimum angle change before moving

# Angle → PWM pulse width (pigpio microseconds)
def angle_to_pw(angle: float) -> int:
    """Convert servo angle (0-180) to pulse width in microseconds."""
    return int(500 + (angle / 180.0) * 2000)


# ─────────────────────────────────────────
# SOUND EVENT TYPES
# ─────────────────────────────────────────
SOUND_EVENTS = {
    "gunshot":   "POSSIBLE GUNSHOT 🔊",
    "explosion": "POSSIBLE EXPLOSION 🔊",
    "multi":     "MULTIPLE SOUNDS 🔊",
    "continuous": "CONTINUOUS NOISE 🔊",
}


class SoundClassifier:
    """
    Classifies sound events by spike duration pattern.
    Reads GPIO 27 digital output of KY-038.
    """

    def __init__(self):
        self._events: list = []     # list of (rise_time, fall_time)
        self._rise_time: Optional[float] = None
        self._recent: list = []     # timestamps of recent spikes (within 2s)
        self._last_event: Optional[dict] = None

    def on_rise(self, gpio, level, tick):
        """Called on rising edge (sound detected)."""
        self._rise_time = time.time()

    def on_fall(self, gpio, level, tick):
        """Called on falling edge — classify duration."""
        if self._rise_time is None:
            return
        now = time.time()
        duration_ms = (now - self._rise_time) * 1000
        self._rise_time = None

        # Track spike frequency
        self._recent = [t for t in self._recent if now - t < 2.0]
        self._recent.append(now)

        if duration_ms < 50:
            event_type = "gunshot"
        elif duration_ms < 500:
            event_type = "explosion"
        elif len(self._recent) >= 3:
            event_type = "multi"
        else:
            event_type = "continuous"

        self._last_event = {
            "type": event_type,
            "label": SOUND_EVENTS[event_type],
            "duration_ms": duration_ms,
            "timestamp": datetime.utcnow().isoformat(),
        }

    def get_last_event(self) -> Optional[dict]:
        ev = self._last_event
        self._last_event = None
        return ev


class SensorController:
    """
    Controls servos and reads sound sensor.
    Supports: AUTO (object tracking), MANUAL, SOUND TRIGGER modes.
    """

    MODE_AUTO   = "AUTO"
    MODE_MANUAL = "MANUAL"
    MODE_SOUND  = "SOUND"

    def __init__(self, event_callback: Optional[Callable] = None):
        """
        event_callback(event_dict): called on sound detection events.
        """
        self.mode = self.MODE_AUTO
        self.pan_angle  = float(PAN_HOME)
        self.tilt_angle = float(TILT_HOME)
        self.event_callback = event_callback
        self._sound_classifier = SoundClassifier()

        self._pi = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._sound_poll_thread: Optional[threading.Thread] = None

        self._init_gpio()
        self._start_sound_polling()

    def _init_gpio(self):
        if not GPIO_AVAILABLE:
            print("[SENSORS] Servo/Sound control in simulation mode")
            return

        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)

        # Sound sensor pin (input, pull-down)
        GPIO.setup(PIN_SOUND, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

        if PIGPIO_AVAILABLE:
            try:
                self._pi = pigpio.pi()
                if self._pi.connected:
                    # Initialize servos to home position
                    self._pi.set_mode(PIN_SERVO_PAN, pigpio.OUTPUT)
                    self._pi.set_mode(PIN_SERVO_TILT, pigpio.OUTPUT)
                    self._move_servo(PIN_SERVO_PAN, self.pan_angle)
                    self._move_servo(PIN_SERVO_TILT, self.tilt_angle)

                    # Register GPIO callbacks for sound sensor
                    self._pi.set_mode(PIN_SOUND, pigpio.INPUT)
                    self._pi.set_pull_up_down(PIN_SOUND, pigpio.PUD_DOWN)
                    self._pi.callback(PIN_SOUND, pigpio.RISING_EDGE, self._sound_classifier.on_rise)
                    self._pi.callback(PIN_SOUND, pigpio.FALLING_EDGE, self._sound_classifier.on_fall)
                    print("[SENSORS] pigpio initialized. Servos at home position.")
                else:
                    print("[SENSORS] pigpio daemon not running — start with: sudo pigpiod")
                    self._pi = None
            except Exception as e:
                print(f"[SENSORS] pigpio init error: {e}")
                self._pi = None

    def _move_servo(self, pin: int, angle: float):
        """Send PWM pulse to servo via pigpio."""
        if self._pi and self._pi.connected:
            pw = angle_to_pw(angle)
            self._pi.set_servo_pulsewidth(pin, pw)

    # ─── Sound Polling (fallback when pigpio unavailable) ──────
    def _start_sound_polling(self):
        if GPIO_AVAILABLE and not PIGPIO_AVAILABLE:
            self._sound_poll_thread = threading.Thread(
                target=self._poll_sound_gpio,
                daemon=True,
                name="SoundPoll",
            )
            self._sound_poll_thread.start()

    def _poll_sound_gpio(self):
        """GPIO edge detection via RPi.GPIO event detect (fallback)."""
        if not GPIO_AVAILABLE:
            return
        GPIO.add_event_detect(
            PIN_SOUND,
            GPIO.RISING,
            callback=self._on_sound_gpio,
            bouncetime=50,
        )
        while not self._stop_event.is_set():
            # Check sound classifier every 100ms
            ev = self._sound_classifier.get_last_event()
            if ev and self.event_callback:
                self.event_callback(ev)
                if self.mode == self.MODE_AUTO:
                    self._sound_trigger_pan()
            time.sleep(0.1)

    def _on_sound_gpio(self, channel):
        """RPi.GPIO callback on sound detection."""
        self._sound_classifier.on_rise(channel, 1, 0)
        time.sleep(0.01)
        self._sound_classifier.on_fall(channel, 0, 0)

    # ─── Servo Control ──────────────────────────────────────────
    def _set_pan(self, angle: float):
        angle = max(PAN_MIN, min(PAN_MAX, angle))
        if abs(angle - self.pan_angle) > DEADZONE_DEG:
            self.pan_angle = angle
            self._move_servo(PIN_SERVO_PAN, angle)

    def _set_tilt(self, angle: float):
        angle = max(TILT_MIN, min(TILT_MAX, angle))
        if abs(angle - self.tilt_angle) > DEADZONE_DEG:
            self.tilt_angle = angle
            self._move_servo(PIN_SERVO_TILT, angle)

    def home(self):
        """Return both servos to center position."""
        with self._lock:
            self._set_pan(PAN_HOME)
            self._set_tilt(TILT_HOME)

    def manual_step(self, direction: str, step: float = 5.0):
        """
        Move servo one step in direction.
        direction: 'left' | 'right' | 'up' | 'down'
        """
        with self._lock:
            if direction == "left":
                self._set_pan(self.pan_angle - step)
            elif direction == "right":
                self._set_pan(self.pan_angle + step)
            elif direction == "up":
                self._set_tilt(self.tilt_angle - step)
            elif direction == "down":
                self._set_tilt(self.tilt_angle + step)

    def auto_track(self, bbox_cx: int, bbox_cy: int, frame_cx: int = 320, frame_cy: int = 240):
        """
        Proportional control: move servo toward detected object.
        error_x = bbox_cx - frame_cx
        error_y = bbox_cy - frame_cy
        """
        if self.mode != self.MODE_AUTO:
            return
        with self._lock:
            error_x = bbox_cx - frame_cx
            error_y = bbox_cy - frame_cy
            new_pan  = self.pan_angle  + (error_x * 0.05)
            new_tilt = self.tilt_angle + (error_y * 0.05)
            self._set_pan(new_pan)
            self._set_tilt(new_tilt)

    def _sound_trigger_pan(self):
        """On sound event: sweep pan toward estimated source then hold 3 sec."""
        def _do():
            with self._lock:
                # Without directional audio, just pan to opposite of current
                # In real deployment: use stereo mic time-difference for angle
                target_pan = PAN_HOME if abs(self.pan_angle - PAN_HOME) > 30 else PAN_HOME + 45
                self._set_pan(target_pan)
            time.sleep(3.0)
            # Return to AUTO if still in SOUND mode
            if self.mode == self.MODE_SOUND:
                self.mode = self.MODE_AUTO

        self.mode = self.MODE_SOUND
        t = threading.Thread(target=_do, daemon=True)
        t.start()

    def set_mode(self, mode: str):
        """Change servo mode: AUTO | MANUAL | SOUND"""
        if mode in (self.MODE_AUTO, self.MODE_MANUAL, self.MODE_SOUND):
            self.mode = mode

    def get_status(self) -> dict:
        return {
            "pan_angle": round(self.pan_angle, 1),
            "tilt_angle": round(self.tilt_angle, 1),
            "mode": self.mode,
            "gpio_available": GPIO_AVAILABLE,
            "pigpio_connected": bool(self._pi and self._pi.connected),
        }

    def cleanup(self):
        """Release GPIO resources."""
        self._stop_event.set()
        if self._pi and self._pi.connected:
            self._pi.set_servo_pulsewidth(PIN_SERVO_PAN, 0)
            self._pi.set_servo_pulsewidth(PIN_SERVO_TILT, 0)
            self._pi.stop()
        if GPIO_AVAILABLE:
            GPIO.cleanup()


# Global singleton
sensor_controller: Optional[SensorController] = None


def init_sensors(event_callback: Optional[Callable] = None) -> SensorController:
    global sensor_controller
    sensor_controller = SensorController(event_callback=event_callback)
    return sensor_controller


def get_sensors() -> Optional[SensorController]:
    return sensor_controller
