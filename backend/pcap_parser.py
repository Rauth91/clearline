"""
PCAP Parser
Extracts SIP messages and RTP stats from Wireshark .pcap / .pcapng files.
Requires pyshark (wraps tshark). Prefer tshark JSON export when available.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from typing import Optional

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB


def check_upload_size(file_bytes: bytes) -> None:
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise RuntimeError(
            f"File too large ({len(file_bytes) // (1024 * 1024)} MB). "
            f"Maximum upload size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )


def _require_tshark() -> str:
    path = shutil.which("tshark")
    if not path:
        raise RuntimeError(
            "tshark is not installed or not on PATH. "
            "PCAP parsing requires Wireshark/tshark. "
            "Mac: brew install wireshark · Windows: install Wireshark and ensure tshark is on PATH."
        )
    return path


def parse_pcap(file_bytes: bytes, filename: str = "capture.pcap") -> str:
    """
    Accept raw bytes of a PCAP file, extract SIP messages, return as
    a raw SIP trace string that can be fed into sip_parser.parse_sip_trace().
    """
    check_upload_size(file_bytes)
    _require_tshark()

    suffix = ".pcapng" if filename.endswith(".pcapng") else ".pcap"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        # Prefer structured tshark JSON — more reliable than pyshark field heuristics
        text = _parse_via_tshark_json(tmp_path)
        if text.strip():
            return text
        return _parse_via_pyshark(tmp_path)
    finally:
        os.unlink(tmp_path)


def _parse_via_tshark_json(tmp_path: str) -> str:
    tshark = _require_tshark()
    try:
        proc = subprocess.run(
            [
                tshark, "-r", tmp_path,
                "-Y", "sip",
                "-T", "json",
                "-e", "frame.time",
                "-e", "ip.src", "-e", "ip.dst",
                "-e", "ipv6.src", "-e", "ipv6.dst",
                "-e", "udp.srcport", "-e", "udp.dstport",
                "-e", "tcp.srcport", "-e", "tcp.dstport",
                "-e", "sip.Request-Line",
                "-e", "sip.Status-Line",
                "-e", "sip.msg_hdr",
                "-e", "sip.msg_body",
                "-e", "sip.from", "-e", "sip.to",
                "-e", "sip.call_id", "-e", "sip.cseq",
                "-e", "sip.Via", "-e", "sip.contact",
                "-e", "sip.content_type",
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("tshark timed out while parsing PCAP (limit 120s). Try a smaller capture.")
    except FileNotFoundError:
        raise RuntimeError(
            "tshark is not installed or not on PATH. "
            "Mac: brew install wireshark"
        )

    if proc.returncode != 0 and not proc.stdout.strip():
        err = (proc.stderr or "").strip() or "unknown tshark error"
        raise RuntimeError(f"tshark failed: {err}")

    if not proc.stdout.strip():
        return ""

    try:
        packets = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return ""

    blocks = []
    for pkt in packets:
        layers = pkt.get("_source", {}).get("layers", {})
        block = _block_from_layers(layers)
        if block:
            blocks.append(block)

    return "\n\n---\n\n".join(blocks)


def _first(val) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, list):
        return str(val[0]) if val else None
    return str(val)


def _block_from_layers(layers: dict) -> Optional[str]:
    lines = []
    ts = _first(layers.get("frame.time"))
    if ts:
        lines.append(f"Timestamp: {ts}")

    src_ip = _first(layers.get("ip.src")) or _first(layers.get("ipv6.src"))
    dst_ip = _first(layers.get("ip.dst")) or _first(layers.get("ipv6.dst"))
    src_port = _first(layers.get("udp.srcport")) or _first(layers.get("tcp.srcport"))
    dst_port = _first(layers.get("udp.dstport")) or _first(layers.get("tcp.dstport"))
    if src_ip:
        lines.append(f"Source: {src_ip}:{src_port or '?'} --> {dst_ip}:{dst_port or '?'}")

    req = _first(layers.get("sip.Request-Line"))
    status = _first(layers.get("sip.Status-Line"))
    hdrs = layers.get("sip.msg_hdr")
    body = layers.get("sip.msg_body")

    if req:
        lines.append(req)
    elif status:
        lines.append(status)

    if hdrs:
        if isinstance(hdrs, list):
            lines.extend(str(h) for h in hdrs)
        else:
            lines.append(str(hdrs))
    else:
        # Reconstruct common headers if msg_hdr missing
        mapping = [
            ("From", "sip.from"),
            ("To", "sip.to"),
            ("Call-ID", "sip.call_id"),
            ("CSeq", "sip.cseq"),
            ("Via", "sip.Via"),
            ("Contact", "sip.contact"),
            ("Content-Type", "sip.content_type"),
        ]
        for name, key in mapping:
            val = _first(layers.get(key))
            if val:
                # Avoid double-prefix if tshark already includes header name
                if val.lower().startswith(name.lower()):
                    lines.append(val)
                else:
                    lines.append(f"{name}: {val}")

    if body:
        lines.append("")
        if isinstance(body, list):
            lines.extend(str(b) for b in body)
        else:
            lines.append(str(body))

    # Need at least a request/status line
    if not req and not status and len(lines) < 3:
        return None
    return "\n".join(lines)


def _parse_via_pyshark(tmp_path: str) -> str:
    try:
        import pyshark
    except ImportError:
        raise RuntimeError(
            "pyshark is not installed. Run: pip install pyshark\n"
            "Also requires Wireshark/tshark on the system."
        )

    cap = pyshark.FileCapture(tmp_path, display_filter="sip", keep_packets=False)
    sip_blocks = []
    try:
        for pkt in cap:
            try:
                block_lines = []
                ts = getattr(pkt, "sniff_time", None)
                if ts:
                    block_lines.append(f"Timestamp: {ts}")

                src_ip = dst_ip = src_port = dst_port = None
                if hasattr(pkt, "ip"):
                    src_ip, dst_ip = pkt.ip.src, pkt.ip.dst
                elif hasattr(pkt, "ipv6"):
                    src_ip, dst_ip = pkt.ipv6.src, pkt.ipv6.dst

                if hasattr(pkt, "udp"):
                    src_port, dst_port = pkt.udp.srcport, pkt.udp.dstport
                elif hasattr(pkt, "tcp"):
                    src_port, dst_port = pkt.tcp.srcport, pkt.tcp.dstport

                if src_ip:
                    block_lines.append(f"Source: {src_ip}:{src_port} --> {dst_ip}:{dst_port}")

                if not hasattr(pkt, "sip"):
                    continue

                sip = pkt.sip
                raw_sip = None

                # Best fields from modern tshark/pyshark
                for attr in ("msg_hdr", "raw_msg", "msg"):
                    val = getattr(sip, attr, None)
                    if val:
                        raw_sip = str(val)
                        break

                if not raw_sip and hasattr(sip, "_all_fields"):
                    for field_name, field_val in sip._all_fields.items():
                        lname = field_name.lower()
                        if "msg_hdr" in lname or lname.endswith(".msg"):
                            raw_sip = str(field_val)
                            break

                if not raw_sip:
                    parts = []
                    req = getattr(sip, "request_line", None) or getattr(sip, "Method", None)
                    status = getattr(sip, "status_line", None)
                    if req:
                        parts.append(str(req))
                    elif status:
                        parts.append(str(status))
                    for hdr, attr in [
                        ("From", "from"),
                        ("To", "to"),
                        ("Call-ID", "call_id"),
                        ("CSeq", "cseq"),
                        ("Via", "via"),
                        ("Contact", "contact"),
                        ("Content-Type", "content_type"),
                    ]:
                        val = getattr(sip, attr, None)
                        if val:
                            parts.append(f"{hdr}: {val}")
                    body = getattr(sip, "msg_body", None)
                    if body:
                        parts.append("")
                        parts.append(str(body))
                    raw_sip = "\n".join(parts)

                if raw_sip:
                    block_lines.append(raw_sip)
                    sip_blocks.append("\n".join(block_lines))
            except Exception:
                continue
    finally:
        cap.close()

    return "\n\n---\n\n".join(sip_blocks)


# ── RTP ────────────────────────────────────────────────────────────────────────

PAYLOAD_TYPE_NAMES = {
    "0": "PCMU",
    "3": "GSM",
    "4": "G723",
    "8": "PCMA",
    "9": "G722",
    "18": "G729",
}


def get_rtp_stats(
    file_bytes: bytes,
    filename: str = "capture.pcap",
    media_ports: Optional[list[int]] = None,
) -> dict:
    """
    Extract RTP stream quality statistics: loss, jitter (RFC 3550), and
    optional correlation to SDP media ports.
    """
    check_upload_size(file_bytes)
    try:
        _require_tshark()
    except RuntimeError as e:
        return {"streams": [], "total_rtp_packets": 0, "error": str(e)}

    try:
        import pyshark
    except ImportError:
        return {"streams": [], "total_rtp_packets": 0, "error": "pyshark not available"}

    suffix = ".pcapng" if filename.endswith(".pcapng") else ".pcap"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    stats = {
        "streams": [],
        "total_rtp_packets": 0,
        "error": None,
        "media_ports": media_ports or [],
    }

    try:
        cap = pyshark.FileCapture(tmp_path, display_filter="rtp", keep_packets=False)
        streams: dict = {}

        for pkt in cap:
            try:
                if not hasattr(pkt, "rtp"):
                    continue
                rtp = pkt.rtp
                ssrc = getattr(rtp, "ssrc", "unknown")
                seq = int(getattr(rtp, "seq", 0))
                rtp_ts = int(getattr(rtp, "timestamp", 0))
                payload_type = str(getattr(rtp, "p_type", "unknown"))
                arrival = float(pkt.sniff_timestamp)

                src_ip = dst_ip = src_port = dst_port = None
                if hasattr(pkt, "ip"):
                    src_ip, dst_ip = pkt.ip.src, pkt.ip.dst
                if hasattr(pkt, "udp"):
                    src_port = int(pkt.udp.srcport)
                    dst_port = int(pkt.udp.dstport)

                if ssrc not in streams:
                    streams[ssrc] = {
                        "ssrc": ssrc,
                        "payload_type": payload_type,
                        "codec": PAYLOAD_TYPE_NAMES.get(payload_type, f"PT{payload_type}"),
                        "packets": 0,
                        "seq_nums": [],
                        "src_ip": src_ip,
                        "dst_ip": dst_ip,
                        "src_port": src_port,
                        "dst_port": dst_port,
                        "jitter": 0.0,
                        "prev_arrival": None,
                        "prev_rtp_ts": None,
                        "clock_rate": 8000,
                    }

                s = streams[ssrc]
                s["packets"] += 1
                s["seq_nums"].append(seq)
                s["last_seq"] = seq
                if "first_seq" not in s:
                    s["first_seq"] = seq

                # RFC 3550 interarrival jitter (assume 8 kHz unless PT suggests otherwise)
                if payload_type in ("9",):  # G.722 uses 8k RTP clock despite 16k sample
                    clock = 8000
                else:
                    clock = 8000

                if s["prev_arrival"] is not None and s["prev_rtp_ts"] is not None:
                    transit = arrival - (rtp_ts / clock)
                    prev_transit = s["prev_arrival"] - (s["prev_rtp_ts"] / clock)
                    d = transit - prev_transit
                    s["jitter"] += (abs(d) - s["jitter"]) / 16.0

                s["prev_arrival"] = arrival
                s["prev_rtp_ts"] = rtp_ts
                stats["total_rtp_packets"] += 1
            except Exception:
                continue

        cap.close()

        port_set = set(media_ports or [])

        for ssrc, s in streams.items():
            seqs = _unwrap_seqs(s["seq_nums"])
            if seqs:
                expected = max(seqs) - min(seqs) + 1
                unique = len(set(seqs))
                received = s["packets"]
                lost = max(0, expected - unique)
                duplicates = max(0, received - unique)
            else:
                expected = received = lost = duplicates = 0

            loss_pct = round((lost / expected * 100), 2) if expected > 0 else 0.0
            jitter_ms = round(s["jitter"] * 1000, 2)

            matched_ports = []
            if s.get("dst_port") and s["dst_port"] in port_set:
                matched_ports.append(s["dst_port"])
            if s.get("src_port") and s["src_port"] in port_set:
                matched_ports.append(s["src_port"])

            stats["streams"].append({
                "ssrc": ssrc,
                "payload_type": s["payload_type"],
                "codec": s["codec"],
                "packets_received": s["packets"],
                "packets_expected": expected,
                "packets_lost": lost,
                "duplicates": duplicates,
                "loss_percent": loss_pct,
                "jitter_ms": jitter_ms,
                "src_ip": s.get("src_ip"),
                "dst_ip": s.get("dst_ip"),
                "src_port": s.get("src_port"),
                "dst_port": s.get("dst_port"),
                "matched_sdp_ports": matched_ports,
                "correlated": bool(matched_ports),
            })

        # One-way audio heuristic: 2+ streams expected for bidirectional audio
        if len(stats["streams"]) == 1 and stats["total_rtp_packets"] > 20:
            stats["streams"][0]["one_way_warning"] = True

    except Exception as e:
        stats["error"] = str(e)
    finally:
        os.unlink(tmp_path)

    return stats


def _unwrap_seqs(seq_nums: list[int]) -> list[int]:
    """Handle 16-bit RTP sequence wrap for gap/loss math."""
    if not seq_nums:
        return []
    out = [seq_nums[0]]
    cycles = 0
    for prev, cur in zip(seq_nums, seq_nums[1:]):
        if cur < prev - 30000:  # wrap forward
            cycles += 1
        elif prev < cur - 30000:  # wrap backward (reorder across boundary)
            cycles = max(0, cycles - 1)
        out.append(cur + cycles * 65536)
    return out
