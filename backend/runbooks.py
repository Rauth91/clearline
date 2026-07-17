"""
Runbooks — fix steps mapped to anomaly codes.
"""

from __future__ import annotations

from typing import Optional


RUNBOOKS: dict[str, dict] = {
    "NO_200_OK": {
        "title": "INVITE never answered",
        "steps": [
            "Confirm the destination extension/number is registered (check PBX registration status).",
            "Verify dialplan / routing rules forward the INVITE to the correct trunk or endpoint.",
            "Check for a 4xx/5xx earlier in the ladder that explains the failure.",
            "If the call rings forever, inspect far-end availability and NAT keepalives.",
        ],
    },
    "MISSING_ACK": {
        "title": "Missing ACK after 200 OK",
        "steps": [
            "Confirm Contact URI in the 200 OK is reachable from the UAC (NAT / public IP issues are common).",
            "Check firewall rules for SIP (UDP/TCP 5060) return path.",
            "Look for retransmitted 200 OKs — UAS will retry if ACK never arrives.",
            "If using a SIP ALG / SBC, verify Record-Route and Contact rewriting.",
        ],
    },
    "RETRANSMIT": {
        "title": "SIP retransmission",
        "steps": [
            "Check RTT and packet loss between endpoints (retransmits often mean lost responses).",
            "Run Speedtest (speedtest.net) for bandwidth, then Visualware VoIP Assessment (BCS) for jitter/loss/MOS.",
            "Verify the far end is processing requests (CPU / thread pool saturation).",
            "Confirm Timers (T1/T2) aren't abnormally short for this network path.",
            "Look for asymmetric routing or SIP ALG rewriting Via/branch.",
        ],
    },
    "BYE_NO_ACK": {
        "title": "BYE not acknowledged",
        "steps": [
            "Confirm both legs still have a valid dialog (From/To tags + Call-ID).",
            "Check whether one side already tore down the dialog (orphaned BYE).",
            "Inspect firewall idle timeouts that may have dropped the return path.",
            "Review SBC dialog state — dialog may have expired on one side only.",
        ],
    },
    "CANCELLED": {
        "title": "Call cancelled before answer",
        "steps": [
            "This is usually expected when the caller hangs up while ringing.",
            "If unexpected, check auto-cancel timers or CRM click-to-dial hangup logic.",
            "Confirm 487 Request Terminated follows CANCEL as expected.",
        ],
    },
    "SIP_401": {
        "title": "401 Unauthorized (digest challenge)",
        "steps": [
            "Expected on first INVITE/REGISTER when digest auth is required.",
            "Confirm the client resends with Authorization / Proxy-Authorization.",
            "If auth never succeeds, verify username, realm, and password on both sides.",
            "Check clock skew if using nonce with short lifetime.",
        ],
    },
    "SIP_407": {
        "title": "407 Proxy Authentication Required",
        "steps": [
            "Expected challenge from a proxy/SBC — client should retry with credentials.",
            "Verify trunk credentials and realm match the proxy configuration.",
            "Ensure Proxy-Authorization is present on the re-INVITE/REGISTER.",
        ],
    },
    "SIP_403": {
        "title": "403 Forbidden",
        "steps": [
            "Check allow-lists, geo restrictions, and dialed-number permissions.",
            "Verify the authenticated identity is authorized for this destination.",
            "Review SBC policy / fraud controls that may reject the call.",
        ],
    },
    "SIP_404": {
        "title": "404 Not Found",
        "steps": [
            "Confirm the dialed number/extension exists and is spelled correctly.",
            "Check DID mapping and translation rules on the PBX/SBC.",
            "Verify the request URI host matches the expected domain.",
        ],
    },
    "SIP_408": {
        "title": "408 Request Timeout",
        "steps": [
            "Far end did not respond in time — check reachability and firewall holes.",
            "Increase timer B / transaction timeout only after ruling out routing issues.",
            "Confirm DNS / SRV resolution for the Request-URI host.",
        ],
    },
    "SIP_480": {
        "title": "480 Temporarily Unavailable",
        "steps": [
            "Endpoint may be offline or not registered — check registration expiry.",
            "Verify NAT bindings and keep-alive (OPTIONS / CR-LF) are working.",
            "If using mobility / DND, confirm presence state isn't blocking the call.",
        ],
    },
    "SIP_486": {
        "title": "486 Busy Here",
        "steps": [
            "Callee is busy — confirm call-waiting / hunt-group behavior is intended.",
            "If unexpected, check for stuck calls holding the line.",
            "Review simultaneous-call limits on the trunk or user.",
        ],
    },
    "SIP_487": {
        "title": "487 Request Terminated",
        "steps": [
            "Normal after CANCEL — caller abandoned before answer.",
            "If not preceded by CANCEL, inspect proxy cancel forking behavior.",
        ],
    },
    "SIP_488": {
        "title": "488 Not Acceptable Here (codec / media)",
        "steps": [
            "Compare SDP offer/answer codecs — enable a shared codec (PCMU/PCMA are safest).",
            "Check if SRTP is required on one side only (RTP/SAVP vs RTP/AVP).",
            "Verify media IP/port in SDP are reachable (one-way audio often follows).",
            "Disable restrictive codec filters on SBC/PBX for testing.",
        ],
    },
    "SIP_500": {
        "title": "500 Server Internal Error",
        "steps": [
            "Check PBX/SBC logs around the timestamp of the 500.",
            "Look for crashed modules, DB failures, or misconfigured dialplan apps.",
            "Retry after restarting the affected service if the error is transient.",
        ],
    },
    "SIP_503": {
        "title": "503 Service Unavailable",
        "steps": [
            "Server overloaded or intentionally out of service — check capacity and maintenance mode.",
            "Inspect Retry-After header if present.",
            "Failover to a secondary trunk/proxy if available.",
        ],
    },
    "CODEC_MISMATCH": {
        "title": "SDP codec mismatch",
        "steps": [
            "Enable at least one common codec on both endpoints (start with G.711u/PCMU).",
            "Check transcoder availability if endpoints cannot share a codec.",
            "Inspect SBC codec allow-lists that may strip shared payload types.",
        ],
    },
    "ONE_WAY_MEDIA": {
        "title": "One-way / no media risk",
        "steps": [
            "Verify SDP connection IPs are public or correctly NAT-rewritten.",
            "Open RTP port ranges on firewalls (often 10000–20000 UDP).",
            "Confirm direction attributes (sendrecv/sendonly) are complementary.",
            "Correlate RTP streams to SDP media ports in the RTP Stats tab.",
            "Have the customer run Visualware VoIP Assessment (requires BCS) for jitter, loss, and MOS.",
        ],
    },
    "AUTH_FAILED": {
        "title": "Authentication did not succeed",
        "steps": [
            "Verify credentials for the challenged user/trunk.",
            "Confirm realm matches between challenge and client config.",
            "Check for stale nonce — client should retry with fresh Authorization.",
            "Inspect whether the second INVITE/REGISTER actually includes credentials.",
        ],
    },
}


def get_runbook(code: Optional[str]) -> Optional[dict]:
    if not code:
        return None
    rb = RUNBOOKS.get(code)
    if rb:
        return {"code": code, **rb}
    # Generic fallback for unmapped SIP_xxx codes
    if code.startswith("SIP_"):
        return {
            "code": code,
            "title": f"SIP response {code.replace('SIP_', '')}",
            "steps": [
                "Locate the flagged message in the ladder and read the reason phrase.",
                "Check adjacent messages for related failures (auth, routing, media).",
                "Compare against vendor SIP response documentation for this code.",
            ],
        }
    return None


def attach_runbooks(anomalies: list) -> list[dict]:
    """Return anomaly dicts enriched with runbook steps."""
    out = []
    for a in anomalies:
        code = getattr(a, "code", None) if not isinstance(a, dict) else a.get("code")
        rb = get_runbook(code)
        if isinstance(a, dict):
            item = dict(a)
        else:
            item = {
                "severity": a.severity,
                "message_index": a.message_index,
                "title": a.title,
                "detail": a.detail,
                "code": a.code,
            }
        item["runbook"] = rb
        out.append(item)
    return out
