"""
SIP Trace Parser
Parses raw SIP trace text into structured message objects.
Handles various export formats from VoIP admin portals.
"""

import re
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


@dataclass
class SIPMessage:
    index: int
    timestamp: Optional[str]
    direction: str          # "sent" | "received" | "unknown"
    src_ip: Optional[str]
    dst_ip: Optional[str]
    src_port: Optional[str]
    dst_port: Optional[str]
    method: Optional[str]   # INVITE, BYE, ACK, etc.
    response_code: Optional[int]
    response_text: Optional[str]
    call_id: Optional[str]
    from_header: Optional[str]
    to_header: Optional[str]
    cseq: Optional[str]
    via: Optional[str]
    contact: Optional[str]
    content_type: Optional[str]
    sdp: Optional[str]
    raw: str
    is_request: bool = True
    label: str = ""         # human-readable label for ladder


# Common SIP methods
SIP_METHODS = [
    "INVITE", "ACK", "BYE", "CANCEL", "OPTIONS", "REGISTER",
    "PRACK", "UPDATE", "REFER", "NOTIFY", "INFO", "MESSAGE",
    "SUBSCRIBE", "PUBLISH", "RESPONSE"
]

# Regex patterns
RE_TIMESTAMP = re.compile(
    r'(\d{4}[-/]\d{2}[-/]\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?)'
)
RE_IP_PORT = re.compile(
    r'(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?'
)
RE_REQUEST_LINE = re.compile(
    r'^(INVITE|ACK|BYE|CANCEL|OPTIONS|REGISTER|PRACK|UPDATE|REFER|NOTIFY|INFO|MESSAGE|SUBSCRIBE|PUBLISH)\s+sip[s]?:',
    re.IGNORECASE
)
RE_RESPONSE_LINE = re.compile(
    r'^SIP/2\.0\s+(\d{3})\s+(.*)', re.IGNORECASE
)
RE_CALL_ID = re.compile(r'^Call-ID:\s*(.+)', re.IGNORECASE | re.MULTILINE)
RE_FROM = re.compile(r'^From:\s*(.+)', re.IGNORECASE | re.MULTILINE)
RE_TO = re.compile(r'^To:\s*(.+)', re.IGNORECASE | re.MULTILINE)
RE_CSEQ = re.compile(r'^CSeq:\s*(.+)', re.IGNORECASE | re.MULTILINE)
RE_VIA = re.compile(r'^Via:\s*(.+)', re.IGNORECASE | re.MULTILINE)
RE_CONTACT = re.compile(r'^Contact:\s*(.+)', re.IGNORECASE | re.MULTILINE)
RE_CONTENT_TYPE = re.compile(r'^Content-Type:\s*(.+)', re.IGNORECASE | re.MULTILINE)
RE_SDP_START = re.compile(r'^v=0', re.MULTILINE)

# Direction hints
RE_SENT = re.compile(r'\b(sent|send|tx|outgoing|out)\b', re.IGNORECASE)
RE_RECV = re.compile(r'\b(recv|received|rx|incoming|in)\b', re.IGNORECASE)
RE_ARROW_OUT = re.compile(r'--+>|={2,}>')
RE_ARROW_IN = re.compile(r'<--+|<={2,}')


def _extract_header(pattern: re.Pattern, text: str) -> Optional[str]:
    m = pattern.search(text)
    return m.group(1).strip() if m else None


def _split_into_blocks(raw_text: str) -> list[str]:
    """
    Split a raw SIP trace into individual message blocks.
    Handles multiple common formats.
    """
    # Normalize line endings
    text = raw_text.replace('\r\n', '\n').replace('\r', '\n')

    # Strategy 1: blocks separated by blank lines containing a SIP request/response line
    blocks = []
    current = []
    lines = text.split('\n')

    for line in lines:
        stripped = line.strip()
        is_sip_start = (
            RE_REQUEST_LINE.match(stripped) or
            RE_RESPONSE_LINE.match(stripped)
        )
        if is_sip_start and current:
            # Check if current block has SIP content
            block_text = '\n'.join(current)
            if any(RE_REQUEST_LINE.match(l.strip()) or RE_RESPONSE_LINE.match(l.strip())
                   for l in current):
                blocks.append(block_text)
            else:
                # Prepend to next block as header/context
                current.append(line)
                continue
            current = [line]
        else:
            current.append(line)

    if current:
        blocks.append('\n'.join(current))

    # Strategy 2: if strategy 1 produced only 1 block, try splitting on separators
    if len(blocks) <= 1:
        separators = re.split(r'-{10,}|={10,}|\*{10,}', text)
        blocks = [s.strip() for s in separators if s.strip()]

    return [b for b in blocks if b.strip()]


def _parse_direction(block: str, meta_line: str = "") -> tuple[str, Optional[str], Optional[str]]:
    """Returns (direction, src_ip, dst_ip)"""
    src_ip = dst_ip = None
    direction = "unknown"

    # Look for IP addresses
    ips = RE_IP_PORT.findall(block[:300])  # check first 300 chars for context

    # Check for arrow indicators
    if RE_ARROW_OUT.search(meta_line or block[:200]):
        direction = "sent"
        if len(ips) >= 2:
            src_ip, dst_ip = ips[0][0], ips[1][0]
    elif RE_ARROW_IN.search(meta_line or block[:200]):
        direction = "received"
        if len(ips) >= 2:
            src_ip, dst_ip = ips[0][0], ips[1][0]
    elif RE_SENT.search(meta_line or ""):
        direction = "sent"
    elif RE_RECV.search(meta_line or ""):
        direction = "received"

    if ips and not src_ip:
        src_ip = ips[0][0]
    if len(ips) > 1 and not dst_ip:
        dst_ip = ips[1][0]

    return direction, src_ip, dst_ip


def parse_sip_trace(raw_text: str) -> list[SIPMessage]:
    """
    Main entry point. Parse a raw SIP trace string into a list of SIPMessage objects.
    Message indexes are sequential (0..n-1) over successfully parsed messages only.
    """
    blocks = _split_into_blocks(raw_text)
    messages = []

    for block in blocks:
        lines = block.strip().split('\n')
        if not lines:
            continue

        # Find the SIP start line (request or response)
        sip_line_idx = None
        for i, line in enumerate(lines):
            s = line.strip()
            if RE_REQUEST_LINE.match(s) or RE_RESPONSE_LINE.match(s):
                sip_line_idx = i
                break

        if sip_line_idx is None:
            continue

        meta = '\n'.join(lines[:sip_line_idx])
        sip_content = '\n'.join(lines[sip_line_idx:])
        sip_line = lines[sip_line_idx].strip()

        # Timestamp
        ts_match = RE_TIMESTAMP.search(meta) or RE_TIMESTAMP.search(block)
        timestamp = ts_match.group(1) if ts_match else None

        # Direction + IPs
        direction, src_ip, dst_ip = _parse_direction(block, meta)

        # Request or response?
        is_request = True
        method = None
        response_code = None
        response_text = None

        resp_match = RE_RESPONSE_LINE.match(sip_line)
        req_match = RE_REQUEST_LINE.match(sip_line)

        if resp_match:
            is_request = False
            response_code = int(resp_match.group(1))
            response_text = resp_match.group(2).strip()
        elif req_match:
            method = req_match.group(1).upper()

        # Headers
        call_id = _extract_header(RE_CALL_ID, sip_content)
        from_hdr = _extract_header(RE_FROM, sip_content)
        to_hdr = _extract_header(RE_TO, sip_content)
        cseq = _extract_header(RE_CSEQ, sip_content)
        via = _extract_header(RE_VIA, sip_content)
        contact = _extract_header(RE_CONTACT, sip_content)
        content_type = _extract_header(RE_CONTENT_TYPE, sip_content)

        # SDP
        sdp = None
        sdp_match = RE_SDP_START.search(sip_content)
        if sdp_match:
            sdp = sip_content[sdp_match.start():]

        # Ports from Source: line or Via
        src_port = dst_port = None
        src_line = re.search(
            r'Source:\s*([\d.]+):(\d+)\s*-->\s*([\d.]+):(\d+)',
            meta or block[:400],
        )
        if src_line:
            src_ip = src_ip or src_line.group(1)
            src_port = src_line.group(2)
            dst_ip = dst_ip or src_line.group(3)
            dst_port = src_line.group(4)
        else:
            via_ips = RE_IP_PORT.findall(via or "")
            if via_ips:
                src_port = via_ips[0][1] or "5060"

        # Human-readable label
        if is_request:
            label = method or "UNKNOWN"
        else:
            label = f"{response_code} {response_text}"

        msg = SIPMessage(
            index=len(messages),  # sequential after successful parse
            timestamp=timestamp,
            direction=direction,
            src_ip=src_ip,
            dst_ip=dst_ip,
            src_port=src_port,
            dst_port=dst_port,
            method=method,
            response_code=response_code,
            response_text=response_text,
            call_id=call_id,
            from_header=from_hdr,
            to_header=to_hdr,
            cseq=cseq,
            via=via,
            contact=contact,
            content_type=content_type,
            sdp=sdp,
            raw=block,
            is_request=is_request,
            label=label,
        )
        messages.append(msg)

    return messages


def extract_endpoints(messages: list[SIPMessage]) -> list[str]:
    """
    Derive a de-duplicated ordered list of endpoints (IPs or labels)
    from the parsed messages, for rendering ladder columns.
    """
    seen = []
    for msg in messages:
        for ip in [msg.src_ip, msg.dst_ip]:
            if ip and ip not in seen:
                seen.append(ip)

    # If no IPs found, use generic labels
    if not seen:
        seen = ["UA / Phone", "PBX / Server"]

    return seen
