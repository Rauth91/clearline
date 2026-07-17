"""
Anomaly Detector
Analyzes parsed SIP messages and flags issues with severity levels.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sip_parser import SIPMessage
from sdp_parser import analyze_media_negotiation


@dataclass
class Anomaly:
    severity: str           # "error" | "warning" | "info"
    message_index: int      # which SIPMessage triggered this
    title: str
    detail: str
    code: Optional[str] = None   # e.g. "NO_200_OK", "RETRANSMIT"


def detect_anomalies(messages: list[SIPMessage]) -> list[Anomaly]:
    anomalies: list[Anomaly] = []

    if not messages:
        return anomalies

    invites = []
    byes = []
    acks = []
    cancels = []
    responses: dict[tuple, list[SIPMessage]] = {}  # (call_id, cseq) -> responses
    auth_challenges: list[SIPMessage] = []

    for msg in messages:
        cid = msg.call_id or "unknown"

        if msg.is_request and msg.method:
            if msg.method == "INVITE":
                invites.append(msg)
            elif msg.method == "BYE":
                byes.append(msg)
            elif msg.method == "ACK":
                acks.append(msg)
            elif msg.method == "CANCEL":
                cancels.append(msg)

        elif not msg.is_request and msg.response_code:
            key = (cid, msg.cseq or "")
            responses.setdefault(key, []).append(msg)

            code = msg.response_code

            # Auth challenges — expected in digest flows
            if code in (401, 407):
                auth_challenges.append(msg)
                title = (
                    "Unauthorized (Auth Required)"
                    if code == 401
                    else "Proxy Authentication Required"
                )
                anomalies.append(Anomaly(
                    severity="info",
                    message_index=msg.index,
                    title=title,
                    detail=(
                        f"Received {code} {msg.response_text}. "
                        "Digest challenge — client should retry with credentials."
                    ),
                    code=f"SIP_{code}",
                ))
                continue

            # Other 4xx Client Errors
            if 400 <= code < 500:
                titles = {
                    400: "Bad Request",
                    403: "Forbidden",
                    404: "Not Found — number or extension doesn't exist",
                    408: "Request Timeout",
                    480: "Temporarily Unavailable — endpoint not registered",
                    481: "Call/Transaction Does Not Exist",
                    486: "Busy Here",
                    487: "Request Terminated (CANCEL received)",
                    488: "Not Acceptable Here — codec mismatch likely",
                }
                # 487 after CANCEL is informational
                severity = "info" if code == 487 else "error"
                title = titles.get(code, f"{code} Client Error")
                anomalies.append(Anomaly(
                    severity=severity,
                    message_index=msg.index,
                    title=title,
                    detail=f"Received {code} {msg.response_text}. CSeq: {msg.cseq}",
                    code=f"SIP_{code}",
                ))

            elif 500 <= code < 600:
                titles = {
                    500: "Server Internal Error",
                    502: "Bad Gateway — upstream issue",
                    503: "Service Unavailable — server overloaded or down",
                    504: "Server Timeout — upstream not responding",
                }
                anomalies.append(Anomaly(
                    severity="error",
                    message_index=msg.index,
                    title=titles.get(code, f"{code} Server Error"),
                    detail=f"Received {code} {msg.response_text}. CSeq: {msg.cseq}",
                    code=f"SIP_{code}",
                ))

            elif 600 <= code < 700:
                anomalies.append(Anomaly(
                    severity="error",
                    message_index=msg.index,
                    title=f"Global Failure {code}",
                    detail=f"{code} {msg.response_text} — call failed globally",
                    code=f"SIP_{code}",
                ))

    # Auth challenge without a later success on same Call-ID → escalate
    for challenge in auth_challenges:
        cid = challenge.call_id or "unknown"
        method = (challenge.cseq or "").split()[-1] if challenge.cseq else ""
        later_ok = any(
            (not m.is_request)
            and m.response_code == 200
            and (m.call_id or "unknown") == cid
            and m.index > challenge.index
            and method
            and method.upper() in (m.cseq or "").upper()
            for m in messages
        )
        if not later_ok:
            # Replace the info entry's severity conceptually by adding a warning
            anomalies.append(Anomaly(
                severity="warning",
                message_index=challenge.index,
                title="Authentication Did Not Succeed",
                detail=(
                    f"{challenge.response_code} challenge was not followed by a "
                    f"successful authenticated {method or 'request'}."
                ),
                code="AUTH_FAILED",
            ))

    # INVITE without matching 200 OK (strict CSeq match only — no loose Call-ID match)
    for invite in invites:
        cid = invite.call_id or "unknown"
        cseq_num = (invite.cseq or "").split()[0] if invite.cseq else ""
        key = (cid, f"{cseq_num} INVITE")
        found_200 = any(r.response_code == 200 for r in responses.get(key, []))
        # Also accept 200 with same cseq number even if method formatting differs
        if not found_200 and cseq_num:
            found_200 = any(
                r.response_code == 200
                and (r.cseq or "").startswith(cseq_num)
                for k, rlist in responses.items()
                if k[0] == cid
                for r in rlist
            )

        if not found_200:
            cancelled = any(c.call_id == cid for c in cancels)
            # Skip NO_200_OK if auth is still in progress (only 401/407 so far)
            only_auth = any(
                r.response_code in (401, 407)
                for r in responses.get(key, [])
            ) and not any(
                r.response_code and r.response_code >= 200 and r.response_code not in (401, 407)
                for r in responses.get(key, [])
            )
            if cancelled:
                anomalies.append(Anomaly(
                    severity="info",
                    message_index=invite.index,
                    title="Call Cancelled",
                    detail="INVITE was cancelled before answer (487 expected). Call was abandoned.",
                    code="CANCELLED",
                ))
            elif only_auth:
                continue  # AUTH_FAILED covers this
            else:
                anomalies.append(Anomaly(
                    severity="error",
                    message_index=invite.index,
                    title="INVITE Never Answered",
                    detail="An INVITE was sent but no 200 OK was found for this CSeq. Call likely failed to connect.",
                    code="NO_200_OK",
                ))

    # BYE without response
    for bye in byes:
        cid = bye.call_id or "unknown"
        cseq_num = (bye.cseq or "").split()[0] if bye.cseq else ""
        key = (cid, f"{cseq_num} BYE")
        found_resp = bool(responses.get(key, []))
        if not found_resp and cseq_num:
            found_resp = any(
                (r.cseq or "").startswith(cseq_num)
                for k, rlist in responses.items()
                if k[0] == cid and "BYE" in (k[1] or "").upper()
                for r in rlist
            )
        if not found_resp:
            anomalies.append(Anomaly(
                severity="warning",
                message_index=bye.index,
                title="BYE Not Acknowledged",
                detail="A BYE was sent but no 200 OK response found. May indicate a one-sided hangup.",
                code="BYE_NO_ACK",
            ))

    # Retransmissions
    seen_keys: dict = {}
    for msg in messages:
        if msg.is_request:
            key = (msg.call_id, msg.method, msg.cseq)
            if key in seen_keys and all(k is not None for k in key):
                anomalies.append(Anomaly(
                    severity="warning",
                    message_index=msg.index,
                    title=f"Retransmission Detected — {msg.method}",
                    detail=f"Duplicate {msg.method} with same CSeq ({msg.cseq}). Likely a timeout retransmit.",
                    code="RETRANSMIT",
                ))
            else:
                seen_keys[key] = msg.index

    # Missing ACK after 200 OK to INVITE
    for key, resp_list in responses.items():
        cid = key[0]
        if "INVITE" not in (key[1] or "").upper():
            continue
        ok_msgs = [r for r in resp_list if r.response_code == 200]
        if not ok_msgs:
            continue
        has_ack = any(
            a.call_id == cid and a.index > ok_msgs[0].index
            for a in acks
        )
        if not has_ack:
            anomalies.append(Anomaly(
                severity="warning",
                message_index=ok_msgs[0].index,
                title="Missing ACK After 200 OK",
                detail="200 OK received for INVITE but no ACK found. Call may appear connected but RTP won't flow.",
                code="MISSING_ACK",
            ))

    # SDP / media negotiation issues
    media = analyze_media_negotiation(messages)
    if media.codec_mismatch:
        idx = media.answers[-1].message_index if media.answers else media.offers[-1].message_index
        anomalies.append(Anomaly(
            severity="error",
            message_index=idx,
            title="SDP Codec Mismatch",
            detail="Offer and answer share no common audio codecs — expect 488 or no media.",
            code="CODEC_MISMATCH",
        ))
    for issue in media.direction_issues:
        idx = media.answers[-1].message_index if media.answers else (
            media.offers[-1].message_index if media.offers else 0
        )
        anomalies.append(Anomaly(
            severity="warning",
            message_index=idx,
            title="Media Direction Issue",
            detail=issue,
            code="ONE_WAY_MEDIA",
        ))

    anomalies.sort(key=lambda a: a.message_index)
    return anomalies
