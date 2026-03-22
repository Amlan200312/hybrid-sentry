"""
HYBRID SENTRY — Reports Generator
PDF (ReportLab, 7 pages) + CSV export
"""

import csv
import io
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from sqlalchemy.orm import Session
from database import DetectionEvent, GpsLocation, SystemLog, LoginHistory

try:
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        PageBreak, HRFlowable, Image as RLImage,
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    print("[REPORTS] reportlab not installed — PDF disabled")


# ─────────────────────────────────────────
# COLOR SCHEME
# ─────────────────────────────────────────
CLR_BG      = colors.HexColor("#0a0f0a")
CLR_SURFACE = colors.HexColor("#111911")
CLR_GREEN   = colors.HexColor("#39ff14")
CLR_TEXT    = colors.HexColor("#e8f5e8")
CLR_SEC     = colors.HexColor("#7aaa7a")
CLR_RED     = colors.HexColor("#ff2020")
CLR_YELLOW  = colors.HexColor("#ffd700")
CLR_BORDER  = colors.HexColor("#2a4a2a")


def _mil_ts() -> str:
    return datetime.now().strftime("%Y%m%d — %H:%M:%S UTC")


def _date_str(dt: Optional[datetime]) -> str:
    if not dt:
        return "—"
    return dt.strftime("%Y-%m-%d %H:%M:%S")


# ─────────────────────────────────────────
# PDF REPORT
# ─────────────────────────────────────────
def generate_pdf_report(db: Session) -> bytes:
    """
    Generate 7-page PDF surveillance report.
    Returns PDF as bytes.
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("reportlab not installed")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "SentryTitle",
        fontName="Helvetica-Bold",
        fontSize=24,
        textColor=CLR_GREEN,
        alignment=TA_CENTER,
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "SentrySubtitle",
        fontName="Helvetica",
        fontSize=10,
        textColor=CLR_SEC,
        alignment=TA_CENTER,
        spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        "SentryHeading",
        fontName="Helvetica-Bold",
        fontSize=14,
        textColor=CLR_GREEN,
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "SentryBody",
        fontName="Helvetica",
        fontSize=9,
        textColor=CLR_TEXT,
        spaceAfter=4,
    )
    classified_style = ParagraphStyle(
        "Classified",
        fontName="Helvetica-Bold",
        fontSize=16,
        textColor=CLR_RED,
        alignment=TA_CENTER,
        spaceAfter=8,
    )

    # --- Fetch DB data ---
    all_events = db.query(DetectionEvent).order_by(DetectionEvent.timestamp.desc()).all()
    confirmed = [e for e in all_events if e.status == "confirmed"]
    dismissed = [e for e in all_events if e.status == "dismissed"]
    pending   = [e for e in all_events if e.status == "pending"]
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    today_events = [e for e in all_events if e.timestamp and e.timestamp.strftime("%Y-%m-%d") == today_str]

    # Class breakdown
    class_counts: dict = {}
    for ev in confirmed:
        class_counts[ev.detected_class] = class_counts.get(ev.detected_class, 0) + 1

    story = []

    # ─── PAGE 1: COVER ───────────────────────────────────────
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("▣ HYBRID SENTRY v1.0", title_style))
    story.append(Paragraph("SURVEILLANCE SYSTEM — INTELLIGENCE REPORT", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=CLR_GREEN))
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph("⬛  ⬛  ⬛  CLASSIFIED  ⬛  ⬛  ⬛", classified_style))
    story.append(Spacer(1, 1*cm))

    cover_data = [
        ["GENERATED", _mil_ts()],
        ["CLASSIFICATION", "RESTRICTED — AUTHORIZED PERSONNEL ONLY"],
        ["SYSTEM", "HYBRID SENTRY — RPi5 + YOLOv8n + DeepSORT"],
        ["TOTAL EVENTS", str(len(all_events))],
        ["VERIFIED", str(len(confirmed))],
        ["DISMISSED", str(len(dismissed))],
        ["PENDING", str(len(pending))],
        ["TODAY'S EVENTS", str(len(today_events))],
    ]
    cover_table = Table(cover_data, colWidths=[5*cm, 12*cm])
    cover_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (0, -1), CLR_SURFACE),
        ("BACKGROUND",   (1, 0), (1, -1), CLR_BG),
        ("TEXTCOLOR",    (0, 0), (0, -1), CLR_GREEN),
        ("TEXTCOLOR",    (1, 0), (1, -1), CLR_TEXT),
        ("FONTNAME",     (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("GRID",         (0, 0), (-1, -1), 0.5, CLR_BORDER),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [CLR_BG, CLR_SURFACE]),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(cover_table)
    story.append(PageBreak())

    # ─── PAGE 2: EXECUTIVE SUMMARY ───────────────────────────
    story.append(Paragraph("SECTION 1 — EXECUTIVE SUMMARY", heading_style))
    story.append(HRFlowable(width="100%", thickness=1, color=CLR_BORDER))
    story.append(Spacer(1, 0.4*cm))

    avg_conf = sum(e.confidence for e in confirmed) / len(confirmed) if confirmed else 0
    avg_dist = sum(e.distance_m for e in confirmed if e.distance_m) / max(1, sum(1 for e in confirmed if e.distance_m))

    summary_text = (
        f"Reporting period covers ALL recorded events to date. "
        f"Total of <b>{len(confirmed)}</b> events were verified and confirmed by operators. "
        f"<b>{len(dismissed)}</b> events were dismissed as false alarms. "
        f"<b>{len(pending)}</b> events remain pending in the verification queue. "
        f"Average detection confidence: <b>{avg_conf:.1%}</b>. "
        f"Average estimated range: <b>{avg_dist:.1f}m</b>."
    )
    story.append(Paragraph(summary_text, body_style))
    story.append(Spacer(1, 0.6*cm))

    summary_table_data = [
        ["METRIC", "VALUE"],
        ["Total Events Logged", str(len(all_events))],
        ["Confirmed Detections", str(len(confirmed))],
        ["Dismissed (False Alarm)", str(len(dismissed))],
        ["Pending Verification", str(len(pending))],
        ["Events Today", str(len(today_events))],
        ["Avg. Confidence", f"{avg_conf:.1%}"],
        ["Avg. Distance", f"{avg_dist:.1f}m"],
    ]
    s_table = Table(summary_table_data, colWidths=[8*cm, 9*cm])
    s_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), CLR_GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), CLR_BG),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND",   (0, 1), (-1, -1), CLR_BG),
        ("TEXTCOLOR",    (0, 1), (-1, -1), CLR_TEXT),
        ("FONTNAME",     (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("GRID",         (0, 0), (-1, -1), 0.5, CLR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CLR_BG, CLR_SURFACE]),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(s_table)
    story.append(PageBreak())

    # ─── PAGE 3: CLASS BREAKDOWN ─────────────────────────────
    story.append(Paragraph("SECTION 2 — DETECTION CLASS BREAKDOWN", heading_style))
    story.append(HRFlowable(width="100%", thickness=1, color=CLR_BORDER))
    story.append(Spacer(1, 0.4*cm))

    class_data = [["CLASS", "COUNT", "% OF TOTAL"]]
    total_confirmed = max(len(confirmed), 1)
    for cls, cnt in sorted(class_counts.items(), key=lambda x: -x[1]):
        class_data.append([
            cls.replace("_", " ").title(),
            str(cnt),
            f"{cnt/total_confirmed:.1%}",
        ])

    if len(class_data) == 1:
        class_data.append(["No confirmed detections", "0", "—"])

    c_table = Table(class_data, colWidths=[10*cm, 4*cm, 4*cm])
    c_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), CLR_GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), CLR_BG),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND",   (0, 1), (-1, -1), CLR_BG),
        ("TEXTCOLOR",    (0, 1), (-1, -1), CLR_TEXT),
        ("FONTNAME",     (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("GRID",         (0, 0), (-1, -1), 0.5, CLR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CLR_BG, CLR_SURFACE]),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(c_table)
    story.append(PageBreak())

    # ─── PAGE 4: TOP 5 EVENTS ────────────────────────────────
    story.append(Paragraph("SECTION 3 — TOP 5 HIGH-PRIORITY EVENTS", heading_style))
    story.append(HRFlowable(width="100%", thickness=1, color=CLR_BORDER))
    story.append(Spacer(1, 0.4*cm))

    top_events = sorted(confirmed, key=lambda e: e.confidence, reverse=True)[:5]
    for i, ev in enumerate(top_events, 1):
        story.append(Paragraph(f"EVENT {i}: {ev.display_label}", heading_style))
        event_data = [
            ["Camera", ev.camera_id or "—"],
            ["Time", _date_str(ev.timestamp)],
            ["Confidence", f"{ev.confidence:.1%}"],
            ["Distance", f"{ev.distance_m}m" if ev.distance_m else "—"],
            ["Speed", f"{ev.speed_ms:.1f}m/s" if ev.speed_ms else "—"],
            ["Zone", ev.zone_name or "—"],
            ["Verified by", ev.verified_by or "—"],
            ["Verified at", _date_str(ev.verified_at)],
        ]
        ev_table = Table(event_data, colWidths=[4*cm, 13*cm])
        ev_table.setStyle(TableStyle([
            ("BACKGROUND",   (0, 0), (0, -1), CLR_SURFACE),
            ("TEXTCOLOR",    (0, 0), (0, -1), CLR_GREEN),
            ("TEXTCOLOR",    (1, 0), (1, -1), CLR_TEXT),
            ("FONTNAME",     (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE",     (0, 0), (-1, -1), 8),
            ("GRID",         (0, 0), (-1, -1), 0.5, CLR_BORDER),
            ("TOPPADDING",   (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ("LEFTPADDING",  (0, 0), (-1, -1), 6),
        ]))
        story.append(ev_table)
        story.append(Spacer(1, 0.3*cm))

    story.append(PageBreak())

    # ─── PAGE 5: PERFORMANCE TABLE ───────────────────────────
    story.append(Paragraph("SECTION 4 — CAMERA PERFORMANCE", heading_style))
    story.append(HRFlowable(width="100%", thickness=1, color=CLR_BORDER))
    story.append(Spacer(1, 0.4*cm))

    cam_stats: dict = {}
    for ev in all_events:
        cam = ev.camera_id or "unknown"
        s = cam_stats.setdefault(cam, {"total": 0, "confirmed": 0, "dismissed": 0})
        s["total"] += 1
        if ev.status == "confirmed":
            s["confirmed"] += 1
        elif ev.status == "dismissed":
            s["dismissed"] += 1

    perf_data = [["CAMERA", "TOTAL", "CONFIRMED", "DISMISSED", "ACCURACY"]]
    for cam, s in cam_stats.items():
        acc = s["confirmed"] / s["total"] if s["total"] > 0 else 0
        perf_data.append([cam, str(s["total"]), str(s["confirmed"]), str(s["dismissed"]), f"{acc:.0%}"])

    if len(perf_data) == 1:
        perf_data.append(["No camera data", "—", "—", "—", "—"])

    p_table = Table(perf_data, colWidths=[5*cm, 3*cm, 3*cm, 3*cm, 3*cm])
    p_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), CLR_GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), CLR_BG),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND",   (0, 1), (-1, -1), CLR_BG),
        ("TEXTCOLOR",    (0, 1), (-1, -1), CLR_TEXT),
        ("FONTNAME",     (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 0), (-1, -1), 9),
        ("GRID",         (0, 0), (-1, -1), 0.5, CLR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CLR_BG, CLR_SURFACE]),
        ("TOPPADDING",   (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6),
        ("LEFTPADDING",  (0, 0), (-1, -1), 8),
    ]))
    story.append(p_table)
    story.append(PageBreak())

    # ─── PAGE 6: GPS LOG ─────────────────────────────────────
    story.append(Paragraph("SECTION 5 — FIELD OPERATOR GPS LOG", heading_style))
    story.append(HRFlowable(width="100%", thickness=1, color=CLR_BORDER))
    story.append(Spacer(1, 0.4*cm))

    gps_rows = db.query(GpsLocation).order_by(GpsLocation.timestamp.desc()).limit(50).all()
    gps_data = [["RECORDER", "LAT", "LNG", "ACCURACY", "STREAMING", "TIMESTAMP"]]
    for row in gps_rows:
        gps_data.append([
            row.recorder_username,
            f"{row.latitude:.6f}" if row.latitude else "—",
            f"{row.longitude:.6f}" if row.longitude else "—",
            f"{row.accuracy:.1f}m" if row.accuracy else "—",
            "YES" if row.is_streaming else "NO",
            _date_str(row.timestamp),
        ])

    if len(gps_data) == 1:
        gps_data.append(["No GPS data", "—", "—", "—", "—", "—"])

    gps_table = Table(gps_data, colWidths=[3*cm, 3*cm, 3*cm, 2.5*cm, 2.5*cm, 3*cm])
    gps_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), CLR_GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), CLR_BG),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND",   (0, 1), (-1, -1), CLR_BG),
        ("TEXTCOLOR",    (0, 1), (-1, -1), CLR_TEXT),
        ("FONTNAME",     (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 0), (-1, -1), 7),
        ("GRID",         (0, 0), (-1, -1), 0.5, CLR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CLR_BG, CLR_SURFACE]),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 4),
    ]))
    story.append(gps_table)
    story.append(PageBreak())

    # ─── PAGE 7: SYSTEM HEALTH LOG ───────────────────────────
    story.append(Paragraph("SECTION 6 — SYSTEM HEALTH & AUDIT LOG", heading_style))
    story.append(HRFlowable(width="100%", thickness=1, color=CLR_BORDER))
    story.append(Spacer(1, 0.4*cm))

    sys_logs = db.query(SystemLog).order_by(SystemLog.timestamp.desc()).limit(30).all()
    sys_data = [["EVENT TYPE", "DESCRIPTION", "TIMESTAMP"]]
    for log in sys_logs:
        sys_data.append([
            log.event_type,
            log.description[:60] + "..." if len(log.description) > 60 else log.description,
            _date_str(log.timestamp),
        ])

    if len(sys_data) == 1:
        sys_data.append(["No system logs", "—", "—"])

    sys_table = Table(sys_data, colWidths=[4*cm, 11*cm, 4*cm])
    sys_table.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), CLR_GREEN),
        ("TEXTCOLOR",    (0, 0), (-1, 0), CLR_BG),
        ("FONTNAME",     (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND",   (0, 1), (-1, -1), CLR_BG),
        ("TEXTCOLOR",    (0, 1), (-1, -1), CLR_TEXT),
        ("FONTNAME",     (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",     (0, 0), (-1, -1), 8),
        ("GRID",         (0, 0), (-1, -1), 0.5, CLR_BORDER),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CLR_BG, CLR_SURFACE]),
        ("TOPPADDING",   (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    story.append(sys_table)
    story.append(Spacer(1, 1*cm))
    story.append(Paragraph("⬛  END OF REPORT — HYBRID SENTRY v1.0  ⬛", classified_style))

    # Build PDF
    doc.build(story)
    return buffer.getvalue()


# ─────────────────────────────────────────
# CSV EXPORT
# ─────────────────────────────────────────
def generate_csv_report(db: Session) -> str:
    """
    Generate CSV export of all detection events.
    Returns CSV as string.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "ID", "Track ID", "Class", "Display Label", "Confidence",
        "Distance (m)", "Speed (m/s)", "Posture", "Zone",
        "Camera", "GPS Lat", "GPS Lng",
        "Face Concealed", "Holding", "Clothing",
        "Screenshot", "Timestamp", "Status",
        "Verified By", "Verified At", "Acoustic",
    ])

    events = db.query(DetectionEvent).order_by(DetectionEvent.timestamp.desc()).all()
    for ev in events:
        writer.writerow([
            ev.id,
            ev.track_id or "",
            ev.detected_class,
            ev.display_label,
            f"{ev.confidence:.2%}",
            ev.distance_m or "",
            ev.speed_ms or "",
            ev.posture or "",
            ev.zone_name or "",
            ev.camera_id,
            ev.gps_lat or "",
            ev.gps_lng or "",
            "YES" if ev.face_concealed else "NO",
            ev.holding_object or "",
            ev.clothing_type or "",
            ev.screenshot_path or "",
            _date_str(ev.timestamp),
            ev.status,
            ev.verified_by or "",
            _date_str(ev.verified_at),
            "YES" if ev.acoustic_triggered else "NO",
        ])

    return output.getvalue()
