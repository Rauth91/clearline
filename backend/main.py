"""
ClearLine — FastAPI Backend (optional / troubleshooting tools)
Run with: uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sip_parser import parse_sip_trace, extract_endpoints, SIPMessage
from anomaly_detector import detect_anomalies, Anomaly
from pcap_parser import parse_pcap, get_rtp_stats, MAX_UPLOAD_BYTES
from sdp_parser import analyze_media_negotiation, media_to_dict
from runbooks import attach_runbooks

app = FastAPI(title="ClearLine", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────────────────────────

class SIPTextRequest(BaseModel):
    raw_text: str
    label: Optional[str] = None


class SIPMessage_Out(BaseModel):
    index: int
    timestamp: Optional[str]
    direction: str
    src_ip: Optional[str]
    dst_ip: Optional[str]
    method: Optional[str]
    response_code: Optional[int]
    response_text: Optional[str]
    call_id: Optional[str]
    from_header: Optional[str]
    to_header: Optional[str]
    cseq: Optional[str]
    label: str
    is_request: bool
    has_sdp: bool
    sdp: Optional[str] = None
    raw: str


class Anomaly_Out(BaseModel):
    severity: str
    message_index: int
    title: str
    detail: str
    code: Optional[str]
    runbook: Optional[dict] = None


class AnalysisResult(BaseModel):
    messages: list[SIPMessage_Out]
    anomalies: list[Anomaly_Out]
    endpoints: list[str]
    call_id: Optional[str]
    call_ids: list[str]
    summary: str
    label: Optional[str] = None
    media: Optional[dict] = None


class RTPStats(BaseModel):
    streams: list[dict]
    total_rtp_packets: int
    error: Optional[str]
    media_ports: list[int] = []


# ── Helpers ────────────────────────────────────────────────────────────────────

def msg_to_out(msg: SIPMessage) -> SIPMessage_Out:
    return SIPMessage_Out(
        index=msg.index,
        timestamp=msg.timestamp,
        direction=msg.direction,
        src_ip=msg.src_ip,
        dst_ip=msg.dst_ip,
        method=msg.method,
        response_code=msg.response_code,
        response_text=msg.response_text,
        call_id=msg.call_id,
        from_header=msg.from_header,
        to_header=msg.to_header,
        cseq=msg.cseq,
        label=msg.label,
        is_request=msg.is_request,
        has_sdp=msg.sdp is not None,
        sdp=msg.sdp,
        raw=msg.raw,
    )


def build_summary(messages: list[SIPMessage], anomalies: list[Anomaly], label: Optional[str] = None) -> str:
    if not messages:
        return "No SIP messages found."

    errors = [a for a in anomalies if a.severity == "error"]
    warnings = [a for a in anomalies if a.severity == "warning"]
    methods = [m.method for m in messages if m.is_request and m.method]
    codes = [m.response_code for m in messages if not m.is_request and m.response_code]
    call_ids = list(dict.fromkeys(m.call_id for m in messages if m.call_id))

    parts = []
    if label:
        parts.append(f"[{label}]")
    parts.append(f"{len(messages)} SIP messages parsed.")
    if len(call_ids) > 1:
        parts.append(f"{len(call_ids)} Call-IDs.")

    if "INVITE" in methods:
        has_200 = 200 in codes
        parts.append("Call established (200 OK)." if has_200 else "Call did NOT connect (no 200 OK).")

    if errors:
        parts.append(f"{len(errors)} error(s) detected.")
    if warnings:
        parts.append(f"{len(warnings)} warning(s).")
    if not errors and not warnings:
        parts.append("No anomalies detected.")

    return " ".join(parts)


def analyze_messages(messages: list[SIPMessage], label: Optional[str] = None) -> AnalysisResult:
    anomalies = detect_anomalies(messages)
    endpoints = extract_endpoints(messages)
    call_ids = list(dict.fromkeys(m.call_id for m in messages if m.call_id))
    call_id = call_ids[0] if call_ids else None
    media = media_to_dict(analyze_media_negotiation(messages))
    summary = build_summary(messages, anomalies, label)
    anomaly_out = [Anomaly_Out(**a) for a in attach_runbooks(anomalies)]

    return AnalysisResult(
        messages=[msg_to_out(m) for m in messages],
        anomalies=anomaly_out,
        endpoints=endpoints,
        call_id=call_id,
        call_ids=call_ids,
        summary=summary,
        label=label,
        media=media,
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.1.0"}


@app.post("/analyze/text", response_model=AnalysisResult)
def analyze_text(req: SIPTextRequest):
    if not req.raw_text.strip():
        raise HTTPException(status_code=400, detail="No SIP text provided.")

    messages = parse_sip_trace(req.raw_text)
    if not messages:
        raise HTTPException(
            status_code=422,
            detail="Could not parse any SIP messages. Check the format and try again.",
        )
    return analyze_messages(messages, label=req.label)


@app.post("/analyze/pcap", response_model=AnalysisResult)
async def analyze_pcap(
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
):
    if not file.filename or not file.filename.endswith((".pcap", ".pcapng")):
        raise HTTPException(status_code=400, detail="File must be .pcap or .pcapng")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    try:
        raw_sip_text = parse_pcap(contents, file.filename)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PCAP parsing failed: {e}")

    if not raw_sip_text.strip():
        raise HTTPException(
            status_code=422,
            detail="No SIP traffic found in PCAP. Make sure the capture contains SIP packets.",
        )

    messages = parse_sip_trace(raw_sip_text)
    if not messages:
        raise HTTPException(
            status_code=422,
            detail="SIP packets were found but could not be parsed into messages.",
        )
    return analyze_messages(messages, label=label)


@app.post("/analyze/pcap/rtp", response_model=RTPStats)
async def analyze_rtp(
    file: UploadFile = File(...),
    media_ports: Optional[str] = Form(None),  # comma-separated ports from prior SIP analysis
):
    if not file.filename or not file.filename.endswith((".pcap", ".pcapng")):
        raise HTTPException(status_code=400, detail="File must be .pcap or .pcapng")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    ports: list[int] = []
    if media_ports:
        for p in media_ports.split(","):
            p = p.strip()
            if p.isdigit():
                ports.append(int(p))

    try:
        stats = get_rtp_stats(contents, file.filename, media_ports=ports or None)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return RTPStats(**stats)
