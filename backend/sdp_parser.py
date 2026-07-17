"""
SDP Parser
Extracts media negotiation details from SIP SDP bodies.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


# Static payload type map (RFC 3551) — dynamic PTs come from a=rtpmap
STATIC_PAYLOAD_TYPES = {
    "0": "PCMU/8000",
    "3": "GSM/8000",
    "4": "G723/8000",
    "8": "PCMA/8000",
    "9": "G722/8000",
    "18": "G729/8000",
    "97": "telephone-event (common)",
}


@dataclass
class MediaStream:
    media_type: str          # audio, video, application
    port: int
    protocol: str            # RTP/AVP, RTP/SAVP, etc.
    payload_types: list[str] = field(default_factory=list)
    codecs: list[str] = field(default_factory=list)
    direction: Optional[str] = None  # sendrecv, sendonly, recvonly, inactive
    connection_ip: Optional[str] = None
    ice_candidates: list[str] = field(default_factory=list)
    ptime: Optional[str] = None


@dataclass
class SDPSession:
    message_index: int
    role: str                # "offer" | "answer" | "unknown"
    session_name: Optional[str] = None
    origin: Optional[str] = None
    connection_ip: Optional[str] = None
    streams: list[MediaStream] = field(default_factory=list)

    @property
    def media_ports(self) -> list[int]:
        return [s.port for s in self.streams if s.port > 0]


@dataclass
class MediaNegotiation:
    sessions: list[SDPSession]
    offers: list[SDPSession]
    answers: list[SDPSession]
    codec_mismatch: bool
    direction_issues: list[str]
    summary: str
    media_ports: list[int]


RE_ORIGIN = re.compile(r"^o=(.+)$", re.MULTILINE)
RE_SESSION = re.compile(r"^s=(.+)$", re.MULTILINE)
RE_CONNECTION = re.compile(r"^c=IN IP[46]\s+(\S+)", re.MULTILINE)
RE_MEDIA = re.compile(r"^m=(\w+)\s+(\d+)\s+(\S+)\s*(.*)$", re.MULTILINE)
RE_RTPMAP = re.compile(r"^a=rtpmap:(\d+)\s+(\S+)", re.MULTILINE)
RE_DIRECTION = re.compile(r"^a=(sendrecv|sendonly|recvonly|inactive)\s*$", re.MULTILINE)
RE_CANDIDATE = re.compile(r"^a=candidate:(.+)$", re.MULTILINE)
RE_PTIME = re.compile(r"^a=ptime:(\d+)", re.MULTILINE)


def parse_sdp(sdp_text: str, message_index: int = 0, role: str = "unknown") -> Optional[SDPSession]:
    if not sdp_text or not sdp_text.strip().startswith("v=0"):
        # Tolerate leading whitespace / BOM
        text = (sdp_text or "").lstrip()
        if not text.startswith("v=0"):
            return None
        sdp_text = text

    origin = _first(RE_ORIGIN, sdp_text)
    session_name = _first(RE_SESSION, sdp_text)
    connection_ip = _first(RE_CONNECTION, sdp_text)

    # Split into session-level + media sections
    media_matches = list(RE_MEDIA.finditer(sdp_text))
    if not media_matches:
        return SDPSession(
            message_index=message_index,
            role=role,
            session_name=session_name,
            origin=origin,
            connection_ip=connection_ip,
        )

    streams: list[MediaStream] = []
    for i, m in enumerate(media_matches):
        start = m.start()
        end = media_matches[i + 1].start() if i + 1 < len(media_matches) else len(sdp_text)
        section = sdp_text[start:end]

        pts = m.group(4).split() if m.group(4) else []
        rtpmap = {pt: codec for pt, codec in RE_RTPMAP.findall(section)}
        codecs = []
        for pt in pts:
            if pt in rtpmap:
                codecs.append(f"{pt}:{rtpmap[pt]}")
            elif pt in STATIC_PAYLOAD_TYPES:
                codecs.append(f"{pt}:{STATIC_PAYLOAD_TYPES[pt]}")
            else:
                codecs.append(pt)

        dir_m = RE_DIRECTION.search(section)
        c_m = RE_CONNECTION.search(section)
        ptime_m = RE_PTIME.search(section)

        streams.append(MediaStream(
            media_type=m.group(1),
            port=int(m.group(2)),
            protocol=m.group(3),
            payload_types=pts,
            codecs=codecs,
            direction=dir_m.group(1) if dir_m else None,
            connection_ip=c_m.group(1) if c_m else connection_ip,
            ice_candidates=[c.strip() for c in RE_CANDIDATE.findall(section)],
            ptime=ptime_m.group(1) if ptime_m else None,
        ))

    return SDPSession(
        message_index=message_index,
        role=role,
        session_name=session_name,
        origin=origin,
        connection_ip=connection_ip,
        streams=streams,
    )


def analyze_media_negotiation(messages) -> MediaNegotiation:
    """
    Walk SIP messages, parse SDP bodies, classify offer/answer,
    and flag codec / direction issues.
    """
    sessions: list[SDPSession] = []
    pending_offer = False

    for msg in messages:
        if not getattr(msg, "sdp", None):
            continue
        role = "unknown"
        if msg.is_request and msg.method in ("INVITE", "UPDATE", "PRACK"):
            role = "offer"
            pending_offer = True
        elif not msg.is_request and msg.response_code == 200 and pending_offer:
            role = "answer"
            pending_offer = False
        elif not msg.is_request and msg.response_code and 180 <= msg.response_code < 200:
            role = "early"
        session = parse_sdp(msg.sdp, message_index=msg.index, role=role)
        if session:
            sessions.append(session)

    offers = [s for s in sessions if s.role == "offer"]
    answers = [s for s in sessions if s.role == "answer"]

    codec_mismatch = False
    direction_issues: list[str] = []

    if offers and answers:
        offer_codecs = _audio_codec_names(offers[-1])
        answer_codecs = _audio_codec_names(answers[-1])
        if offer_codecs and answer_codecs and not (offer_codecs & answer_codecs):
            codec_mismatch = True

        for o_stream in offers[-1].streams:
            for a_stream in answers[-1].streams:
                if o_stream.media_type != a_stream.media_type:
                    continue
                o_dir = o_stream.direction or "sendrecv"
                a_dir = a_stream.direction or "sendrecv"
                if {o_dir, a_dir} == {"sendonly", "sendonly"}:
                    direction_issues.append(
                        f"Both sides sendonly for {o_stream.media_type} — likely no audio."
                    )
                if {o_dir, a_dir} == {"recvonly", "recvonly"}:
                    direction_issues.append(
                        f"Both sides recvonly for {o_stream.media_type} — likely no audio."
                    )
                if "inactive" in (o_dir, a_dir):
                    direction_issues.append(
                        f"{o_stream.media_type} marked inactive on one side."
                    )

    ports = sorted({p for s in sessions for p in s.media_ports})

    parts = []
    if sessions:
        parts.append(f"{len(sessions)} SDP body(ies).")
    if offers and answers:
        parts.append("Offer/answer completed.")
    elif offers and not answers:
        parts.append("Offer present but no answer SDP found.")
    if codec_mismatch:
        parts.append("Codec mismatch between offer and answer.")
    if direction_issues:
        parts.append(f"{len(direction_issues)} media direction issue(s).")
    if not sessions:
        parts.append("No SDP media negotiation found.")

    return MediaNegotiation(
        sessions=sessions,
        offers=offers,
        answers=answers,
        codec_mismatch=codec_mismatch,
        direction_issues=direction_issues,
        summary=" ".join(parts),
        media_ports=ports,
    )


def session_to_dict(session: SDPSession) -> dict:
    return {
        "message_index": session.message_index,
        "role": session.role,
        "session_name": session.session_name,
        "origin": session.origin,
        "connection_ip": session.connection_ip,
        "streams": [
            {
                "media_type": s.media_type,
                "port": s.port,
                "protocol": s.protocol,
                "payload_types": s.payload_types,
                "codecs": s.codecs,
                "direction": s.direction,
                "connection_ip": s.connection_ip,
                "ice_candidates": s.ice_candidates[:5],
                "ptime": s.ptime,
            }
            for s in session.streams
        ],
    }


def media_to_dict(media: MediaNegotiation) -> dict:
    return {
        "sessions": [session_to_dict(s) for s in media.sessions],
        "codec_mismatch": media.codec_mismatch,
        "direction_issues": media.direction_issues,
        "summary": media.summary,
        "media_ports": media.media_ports,
    }


def _audio_codec_names(session: SDPSession) -> set[str]:
    names = set()
    for stream in session.streams:
        if stream.media_type != "audio":
            continue
        for codec in stream.codecs:
            # "0:PCMU/8000" or "8:PCMA/8000" → PCMU / PCMA
            name = codec.split(":", 1)[-1].split("/")[0].upper()
            if name and not name.isdigit():
                names.add(name)
    return names


def _first(pattern: re.Pattern, text: str) -> Optional[str]:
    m = pattern.search(text)
    return m.group(1).strip() if m else None
