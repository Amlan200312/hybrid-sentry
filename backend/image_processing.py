"""
HYBRID SENTRY — Image Processing Pipeline
11 OpenCV functions: night_vision, noise_reduction, optical_flow,
background_subtraction, edge_detection, contrast_boost,
shadow_removal, sharpen, lighting_classify, digital_zoom, watermark
"""

import cv2
import numpy as np
from datetime import datetime
from typing import Optional, Tuple, List


# ─────────────────────────────────────────
# 1. NIGHT VISION
# ─────────────────────────────────────────
def night_vision(frame: np.ndarray) -> np.ndarray:
    """
    Software-only night vision: CLAHE on luminance + green tint.
    Grayscale → CLAHE(3.0, 8x8) → denoise → sharpen → green channel tint.
    NO hardware light required.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # CLAHE adaptive histogram equalization
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(enhanced, h=10, templateWindowSize=7, searchWindowSize=21)

    # Sharpen
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    sharpened = cv2.filter2D(denoised, -1, kernel)

    # Apply green channel tint: use green channel most, reduce red/blue
    output = np.zeros((frame.shape[0], frame.shape[1], 3), dtype=np.uint8)
    output[:, :, 0] = (sharpened * 0.2).astype(np.uint8)   # Blue: dim
    output[:, :, 1] = sharpened                              # Green: full
    output[:, :, 2] = (sharpened * 0.15).astype(np.uint8)  # Red: very dim

    return output


# ─────────────────────────────────────────
# 2. NOISE REDUCTION
# ─────────────────────────────────────────
def noise_reduction(frame: np.ndarray) -> np.ndarray:
    """
    Two-pass denoising: NlMeans for color noise + bilateral for edge preservation.
    """
    # Fast NL Means denoising (color)
    denoised = cv2.fastNlMeansDenoisingColored(
        frame,
        h=10,
        hColor=10,
        templateWindowSize=7,
        searchWindowSize=21,
    )
    # Bilateral filter preserves edges while smoothing
    filtered = cv2.bilateralFilter(denoised, d=9, sigmaColor=75, sigmaSpace=75)
    return filtered


# ─────────────────────────────────────────
# 3. OPTICAL FLOW
# ─────────────────────────────────────────
def optical_flow(prev_frame: np.ndarray, curr_frame: np.ndarray) -> np.ndarray:
    """
    Farneback dense optical flow with HSV arrow overlay.
    Returns: frame with flow vectors drawn as colored arrows.
    """
    prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
    curr_gray = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)

    flow = cv2.calcOpticalFlowFarneback(
        prev_gray, curr_gray,
        None,
        pyr_scale=0.5,
        levels=3,
        winsize=15,
        iterations=3,
        poly_n=5,
        poly_sigma=1.2,
        flags=0,
    )

    h, w = curr_gray.shape
    mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])

    # HSV visualization
    hsv = np.zeros_like(curr_frame)
    hsv[..., 0] = ang * 180 / np.pi / 2  # Hue = direction
    hsv[..., 1] = 255
    hsv[..., 2] = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX)
    flow_rgb = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    # Blend with original
    output = cv2.addWeighted(curr_frame, 0.6, flow_rgb, 0.4, 0)

    # Draw sparse arrows on grid
    step = 16
    for y in range(0, h, step):
        for x in range(0, w, step):
            dx, dy = flow[y, x]
            magnitude = np.sqrt(dx**2 + dy**2)
            if magnitude > 1.5:
                end_x = int(x + dx * 2)
                end_y = int(y + dy * 2)
                cv2.arrowedLine(
                    output,
                    (x, y),
                    (end_x, end_y),
                    (57, 255, 20),  # neon green
                    1,
                    tipLength=0.3,
                )

    return output


# ─────────────────────────────────────────
# 4. BACKGROUND SUBTRACTION
# ─────────────────────────────────────────
def background_subtraction(
    frame: np.ndarray,
    mog2: cv2.BackgroundSubtractorMOG2,
) -> Tuple[np.ndarray, List[Tuple[int, int, int, int]]]:
    """
    MOG2 background subtraction + morphological cleanup.
    Returns (mask_frame, list_of_motion_rects [(x, y, w, h), ...]).
    """
    fg_mask = mog2.apply(frame)

    # Morphological operations to remove noise
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel)
    fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel)
    fg_mask = cv2.dilate(fg_mask, kernel, iterations=2)

    # Find contours → motion regions
    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    motion_rects = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > 500:  # minimum area to filter tiny noise
            x, y, w, h = cv2.boundingRect(cnt)
            motion_rects.append((x, y, w, h))

    # Colorize mask (green for motion)
    mask_colored = np.zeros_like(frame)
    mask_colored[:, :, 1] = fg_mask  # Green channel

    return mask_colored, motion_rects


def create_mog2() -> cv2.BackgroundSubtractorMOG2:
    """Factory for MOG2 subtractor with tuned params for outdoor surveillance."""
    return cv2.createBackgroundSubtractorMOG2(
        history=500,
        varThreshold=50,
        detectShadows=True,
    )


# ─────────────────────────────────────────
# 5. EDGE DETECTION
# ─────────────────────────────────────────
def edge_detection(frame: np.ndarray) -> np.ndarray:
    """
    Gaussian blur + Canny edge detection with neon green overlay.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, threshold1=50, threshold2=150)

    # Create neon green edge overlay
    output = frame.copy()
    edge_mask = edges > 0
    output[edge_mask] = [20, 255, 57]  # BGR neon green

    return output


# ─────────────────────────────────────────
# 6. CONTRAST BOOST
# ─────────────────────────────────────────
def contrast_boost(frame: np.ndarray) -> np.ndarray:
    """
    LAB colorspace + CLAHE on L-channel only (avoids color distortion).
    """
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_boosted = clahe.apply(l_channel)

    lab_boosted = cv2.merge([l_boosted, a_channel, b_channel])
    return cv2.cvtColor(lab_boosted, cv2.COLOR_LAB2BGR)


# ─────────────────────────────────────────
# 7. SHADOW REMOVAL
# ─────────────────────────────────────────
def shadow_removal(frame: np.ndarray) -> np.ndarray:
    """
    Shadow removal for OUTDOOR deployment.
    Uses YCrCb normalization to reduce shadow artifacts.
    KEEP — required for outdoor surveillance accuracy.
    """
    ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
    channels = list(cv2.split(ycrcb))

    # Normalize Y channel to reduce shadow impact
    channels[0] = cv2.normalize(channels[0], None, 0, 255, cv2.NORM_MINMAX)

    # Slight histogram shift to lift shadow regions
    lut = np.array([
        min(255, int(i * 1.1)) for i in range(256)
    ], dtype=np.uint8)
    channels[0] = cv2.LUT(channels[0], lut)

    merged = cv2.merge(channels)
    return cv2.cvtColor(merged, cv2.COLOR_YCrCb2BGR)


# ─────────────────────────────────────────
# 8. SHARPEN
# ─────────────────────────────────────────
def sharpen(frame: np.ndarray) -> np.ndarray:
    """
    Standard unsharp mask using kernel [[0,-1,0],[-1,5,-1],[0,-1,0]].
    """
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    return cv2.filter2D(frame, -1, kernel)


# ─────────────────────────────────────────
# 9. LIGHTING CLASSIFY
# ─────────────────────────────────────────
def lighting_classify(frame: np.ndarray) -> str:
    """
    Classify lighting condition from mean brightness.
    Returns: 'DAY' | 'DUSK' | 'NIGHT' | 'LOW-VIS'
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_brightness = np.mean(gray)

    if mean_brightness > 150:
        return "DAY"
    elif mean_brightness > 80:
        return "DUSK"
    elif mean_brightness > 30:
        return "NIGHT"
    else:
        return "LOW-VIS"


def should_auto_night_vision(frame: np.ndarray) -> bool:
    """Returns True if frame lighting requires auto night vision activation."""
    condition = lighting_classify(frame)
    return condition in ("NIGHT", "LOW-VIS")


# ─────────────────────────────────────────
# 10. DIGITAL ZOOM
# ─────────────────────────────────────────
def digital_zoom(
    frame: np.ndarray,
    bbox: Tuple[int, int, int, int],
    zoom: float = 1.5,
    corner_size: Tuple[int, int] = (200, 150),
) -> np.ndarray:
    """
    Crop a bounding box region and resize it as a corner overlay (zoom-in).
    bbox = (x, y, w, h)
    Returns frame with zoomed corner overlay (top-right corner).
    """
    x, y, w, h = bbox
    fh, fw = frame.shape[:2]

    # Expand crop with zoom factor
    cx, cy = x + w // 2, y + h // 2
    new_w = int(w * zoom)
    new_h = int(h * zoom)
    x1 = max(0, cx - new_w // 2)
    y1 = max(0, cy - new_h // 2)
    x2 = min(fw, cx + new_w // 2)
    y2 = min(fh, cy + new_h // 2)

    cropped = frame[y1:y2, x1:x2]
    if cropped.size == 0:
        return frame

    # Resize to corner overlay size
    overlay = cv2.resize(cropped, corner_size, interpolation=cv2.INTER_LINEAR)

    output = frame.copy()
    # Place in top-right corner
    ow, oh = corner_size
    ox = fw - ow - 10
    oy = 10

    # Add border to overlay
    overlay_bordered = cv2.copyMakeBorder(
        overlay, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=[57, 255, 20]
    )
    bh, bw = overlay_bordered.shape[:2]
    if oy + bh <= fh and ox + bw <= fw:
        output[oy:oy + bh, ox:ox + bw] = overlay_bordered

    return output


# ─────────────────────────────────────────
# 11. WATERMARK
# ─────────────────────────────────────────
def watermark(frame: np.ndarray, extra_text: str = "") -> np.ndarray:
    """
    Burn watermark text onto frame: 'HYBRID SENTRY | UNVERIFIED | [time]'
    Placed at bottom-left with semi-transparent background.
    """
    output = frame.copy()
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    text = f"HYBRID SENTRY | UNVERIFIED | {ts}"
    if extra_text:
        text = f"{text} | {extra_text}"

    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.45
    thickness = 1
    color = (57, 255, 20)       # neon green
    outline_color = (0, 0, 0)   # black outline

    h, w = frame.shape[:2]
    (text_w, text_h), baseline = cv2.getTextSize(text, font, font_scale, thickness)

    # Semi-transparent background bar
    bar_y1 = h - text_h - baseline - 8
    bar_y2 = h
    overlay = output.copy()
    cv2.rectangle(overlay, (0, bar_y1), (w, bar_y2), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, output, 0.5, 0, output)

    # Outline text
    pos = (6, h - baseline - 4)
    cv2.putText(output, text, pos, font, font_scale, outline_color, thickness + 2, cv2.LINE_AA)
    # Main text
    cv2.putText(output, text, pos, font, font_scale, color, thickness, cv2.LINE_AA)

    return output


# ─────────────────────────────────────────
# PIPELINE COORDINATOR
# ─────────────────────────────────────────
class ImagePipeline:
    """
    Stateful pipeline that applies enabled filters in sequence.
    Maintains MOG2 background subtractor state per camera.
    """

    def __init__(self):
        self.mog2 = create_mog2()
        self.prev_frame: Optional[np.ndarray] = None
        self._frame_count = 0

        # Toggle flags
        self.night_mode = False
        self.flow_mode = False
        self.edges_mode = False
        self.bgsub_mode = False
        self.sharpen_mode = False
        self.enhance_mode = False
        self.zoom_mode = False
        self.compare_mode = False
        self.freeze_mode = False
        self._frozen_frame: Optional[np.ndarray] = None

        self.auto_night = True
        self._auto_night_check_interval = 10   # every N frames

    @property
    def motion_regions(self) -> List[Tuple[int, int, int, int]]:
        return self._last_motion_rects

    def process(
        self,
        frame: np.ndarray,
        active_bbox: Optional[Tuple[int, int, int, int]] = None,
    ) -> Tuple[np.ndarray, List[Tuple[int, int, int, int]]]:
        """
        Apply enabled filters and return (processed_frame, motion_rects).
        Also updates internal motion state for YOLO thread decisions.
        """
        self._frame_count += 1
        self._last_motion_rects = []

        if self.freeze_mode and self._frozen_frame is not None:
            return self._frozen_frame.copy(), []

        orig = frame.copy()

        # Auto lighting check every N frames
        if self.auto_night and self._frame_count % self._auto_night_check_interval == 0:
            if should_auto_night_vision(frame):
                self.night_mode = True
            else:
                self.night_mode = False

        out = frame.copy()

        # Pipeline order
        if self.enhance_mode:
            out = contrast_boost(out)
        if self.sharpen_mode:
            out = sharpen(out)

        if self.bgsub_mode:
            _, self._last_motion_rects = background_subtraction(out, self.mog2)
        else:
            # Always run background subtraction internally for motion detection
            _, self._last_motion_rects = background_subtraction(out, self.mog2)

        if self.night_mode:
            out = night_vision(out)

        if self.flow_mode and self.prev_frame is not None:
            out = optical_flow(self.prev_frame, out)

        if self.edges_mode:
            out = edge_detection(out)

        if self.zoom_mode and active_bbox is not None:
            out = digital_zoom(out, active_bbox)

        self.prev_frame = frame.copy()

        if self.freeze_mode:
            self._frozen_frame = out.copy()

        out = watermark(out)

        if self.compare_mode:
            # Side-by-side compare: original left, processed right
            orig_w = watermark(orig)
            h = max(orig_w.shape[0], out.shape[0])
            w_orig = orig_w.shape[1]
            w_out = out.shape[1]
            compare = np.zeros((h, w_orig + w_out, 3), dtype=np.uint8)
            compare[:orig_w.shape[0], :w_orig] = orig_w
            compare[:out.shape[0], w_orig:] = out
            # Divider line
            cv2.line(compare, (w_orig, 0), (w_orig, h), (57, 255, 20), 2)
            return compare, self._last_motion_rects

        return out, self._last_motion_rects
