"""Tests for SIP parser, anomaly detector, and SDP parser."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sip_parser import parse_sip_trace
from anomaly_detector import detect_anomalies
from sdp_parser import parse_sdp, analyze_media_negotiation


SAMPLE_OK = """2024-01-15 10:23:45.100 Source: 192.168.1.100:5060 --> 10.0.0.1:5060
INVITE sip:5001@10.0.0.1 SIP/2.0
Via: SIP/2.0/UDP 192.168.1.100:5060;branch=z9hG4bK776asdhds
From: <sip:1000@192.168.1.100>;tag=1928301774
To: <sip:5001@10.0.0.1>
Call-ID: a84b4c76e66710@192.168.1.100
CSeq: 314159 INVITE
Contact: <sip:1000@192.168.1.100>
Content-Type: application/sdp

v=0
o=alice 2890844526 2890844526 IN IP4 192.168.1.100
s=-
c=IN IP4 192.168.1.100
t=0 0
m=audio 10000 RTP/AVP 0 8
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=sendrecv

---

2024-01-15 10:23:45.200 Source: 10.0.0.1:5060 --> 192.168.1.100:5060
SIP/2.0 100 Trying
Via: SIP/2.0/UDP 192.168.1.100:5060;branch=z9hG4bK776asdhds
From: <sip:1000@192.168.1.100>;tag=1928301774
To: <sip:5001@10.0.0.1>
Call-ID: a84b4c76e66710@192.168.1.100
CSeq: 314159 INVITE

---

2024-01-15 10:23:52.000 Source: 10.0.0.1:5060 --> 192.168.1.100:5060
SIP/2.0 200 OK
Via: SIP/2.0/UDP 192.168.1.100:5060;branch=z9hG4bK776asdhds
From: <sip:1000@192.168.1.100>;tag=1928301774
To: <sip:5001@10.0.0.1>;tag=314159
Call-ID: a84b4c76e66710@192.168.1.100
CSeq: 314159 INVITE
Contact: <sip:5001@10.0.0.1>
Content-Type: application/sdp

v=0
o=bob 2890844527 2890844527 IN IP4 10.0.0.1
s=-
c=IN IP4 10.0.0.1
t=0 0
m=audio 20000 RTP/AVP 0
a=rtpmap:0 PCMU/8000
a=sendrecv

---

2024-01-15 10:23:52.050 Source: 192.168.1.100:5060 --> 10.0.0.1:5060
ACK sip:5001@10.0.0.1 SIP/2.0
Via: SIP/2.0/UDP 192.168.1.100:5060;branch=z9hG4bK776asdhds
From: <sip:1000@192.168.1.100>;tag=1928301774
To: <sip:5001@10.0.0.1>;tag=314159
Call-ID: a84b4c76e66710@192.168.1.100
CSeq: 314159 ACK
"""

SAMPLE_AUTH = """Source: 192.168.1.100:5060 --> 10.0.0.1:5060
INVITE sip:5001@10.0.0.1 SIP/2.0
From: <sip:1000@192.168.1.100>;tag=1
To: <sip:5001@10.0.0.1>
Call-ID: auth-call-1
CSeq: 1 INVITE

---

Source: 10.0.0.1:5060 --> 192.168.1.100:5060
SIP/2.0 401 Unauthorized
From: <sip:1000@192.168.1.100>;tag=1
To: <sip:5001@10.0.0.1>;tag=x
Call-ID: auth-call-1
CSeq: 1 INVITE
WWW-Authenticate: Digest realm="asterisk", nonce="abc"

---

Source: 192.168.1.100:5060 --> 10.0.0.1:5060
INVITE sip:5001@10.0.0.1 SIP/2.0
From: <sip:1000@192.168.1.100>;tag=1
To: <sip:5001@10.0.0.1>
Call-ID: auth-call-1
CSeq: 2 INVITE
Authorization: Digest username="1000", realm="asterisk", nonce="abc", response="xyz"

---

Source: 10.0.0.1:5060 --> 192.168.1.100:5060
SIP/2.0 200 OK
From: <sip:1000@192.168.1.100>;tag=1
To: <sip:5001@10.0.0.1>;tag=x
Call-ID: auth-call-1
CSeq: 2 INVITE
"""

SAMPLE_NO_200 = """Source: 192.168.1.100:5060 --> 10.0.0.1:5060
INVITE sip:5001@10.0.0.1 SIP/2.0
From: <sip:1000@192.168.1.100>;tag=1
To: <sip:5001@10.0.0.1>
Call-ID: fail-call
CSeq: 1 INVITE

---

Source: 10.0.0.1:5060 --> 192.168.1.100:5060
SIP/2.0 486 Busy Here
From: <sip:1000@192.168.1.100>;tag=1
To: <sip:5001@10.0.0.1>;tag=x
Call-ID: fail-call
CSeq: 1 INVITE
"""

SAMPLE_RETRANSMIT = """Source: 192.168.1.100:5060 --> 10.0.0.1:5060
INVITE sip:5001@10.0.0.1 SIP/2.0
From: <sip:1000@192.168.1.100>;tag=1
To: <sip:5001@10.0.0.1>
Call-ID: retx-call
CSeq: 1 INVITE

---

Source: 192.168.1.100:5060 --> 10.0.0.1:5060
INVITE sip:5001@10.0.0.1 SIP/2.0
From: <sip:1000@192.168.1.100>;tag=1
To: <sip:5001@10.0.0.1>
Call-ID: retx-call
CSeq: 1 INVITE
"""

SAMPLE_MULTI_CALL = """INVITE sip:1@x SIP/2.0
From: <sip:a@x>;tag=1
To: <sip:1@x>
Call-ID: call-aaa
CSeq: 1 INVITE

---

INVITE sip:2@x SIP/2.0
From: <sip:b@x>;tag=2
To: <sip:2@x>
Call-ID: call-bbb
CSeq: 1 INVITE
"""


def test_parse_happy_path_indexes_sequential():
    msgs = parse_sip_trace(SAMPLE_OK)
    assert len(msgs) == 4
    assert [m.index for m in msgs] == [0, 1, 2, 3]
    assert msgs[0].method == "INVITE"
    assert msgs[2].response_code == 200
    assert msgs[0].has_sdp if hasattr(msgs[0], "has_sdp") else msgs[0].sdp
    assert msgs[0].sdp and msgs[0].sdp.startswith("v=0")


def test_parse_endpoints():
    msgs = parse_sip_trace(SAMPLE_OK)
    assert msgs[0].src_ip == "192.168.1.100"
    assert msgs[0].dst_ip == "10.0.0.1"


def test_anomalies_clean_call():
    msgs = parse_sip_trace(SAMPLE_OK)
    anoms = detect_anomalies(msgs)
    codes = [a.code for a in anoms]
    assert "NO_200_OK" not in codes
    assert "MISSING_ACK" not in codes


def test_auth_challenge_is_info_when_succeeded():
    msgs = parse_sip_trace(SAMPLE_AUTH)
    anoms = detect_anomalies(msgs)
    auth = [a for a in anoms if a.code == "SIP_401"]
    assert auth
    assert auth[0].severity == "info"
    assert not any(a.code == "AUTH_FAILED" for a in anoms)


def test_486_and_no_200():
    msgs = parse_sip_trace(SAMPLE_NO_200)
    anoms = detect_anomalies(msgs)
    codes = {a.code for a in anoms}
    assert "SIP_486" in codes
    assert "NO_200_OK" in codes


def test_retransmit():
    msgs = parse_sip_trace(SAMPLE_RETRANSMIT)
    anoms = detect_anomalies(msgs)
    assert any(a.code == "RETRANSMIT" for a in anoms)


def test_multi_call_ids():
    msgs = parse_sip_trace(SAMPLE_MULTI_CALL)
    ids = {m.call_id for m in msgs}
    assert ids == {"call-aaa", "call-bbb"}


def test_sdp_parse_codecs_and_ports():
    sdp = """v=0
o=- 1 1 IN IP4 1.2.3.4
s=-
c=IN IP4 1.2.3.4
t=0 0
m=audio 10000 RTP/AVP 0 8 101
a=rtpmap:0 PCMU/8000
a=rtpmap:8 PCMA/8000
a=rtpmap:101 telephone-event/8000
a=sendrecv
"""
    session = parse_sdp(sdp, message_index=0, role="offer")
    assert session is not None
    assert session.streams[0].port == 10000
    assert any("PCMU" in c for c in session.streams[0].codecs)
    assert session.media_ports == [10000]


def test_media_negotiation_on_sample():
    msgs = parse_sip_trace(SAMPLE_OK)
    media = analyze_media_negotiation(msgs)
    assert len(media.offers) >= 1
    assert len(media.answers) >= 1
    assert not media.codec_mismatch
    assert 10000 in media.media_ports
    assert 20000 in media.media_ports


def test_codec_mismatch_anomaly():
    offer_ans = """INVITE sip:x@y SIP/2.0
From: <sip:a@y>;tag=1
To: <sip:x@y>
Call-ID: codec-bad
CSeq: 1 INVITE
Content-Type: application/sdp

v=0
o=- 1 1 IN IP4 1.1.1.1
s=-
c=IN IP4 1.1.1.1
t=0 0
m=audio 10000 RTP/AVP 18
a=rtpmap:18 G729/8000

---

SIP/2.0 200 OK
From: <sip:a@y>;tag=1
To: <sip:x@y>;tag=2
Call-ID: codec-bad
CSeq: 1 INVITE
Content-Type: application/sdp

v=0
o=- 2 2 IN IP4 2.2.2.2
s=-
c=IN IP4 2.2.2.2
t=0 0
m=audio 20000 RTP/AVP 0
a=rtpmap:0 PCMU/8000
"""
    msgs = parse_sip_trace(offer_ans)
    anoms = detect_anomalies(msgs)
    assert any(a.code == "CODEC_MISMATCH" for a in anoms)
