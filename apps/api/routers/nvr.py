"""NVR discovery via ONVIF — find NVRs and return their camera channels."""
from __future__ import annotations

import base64
import hashlib
import os
import re
import socket
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.parse import parse_qs, quote as url_quote, urlparse, unquote
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape as xml_escape

import requests as _http
from requests.auth import HTTPBasicAuth, HTTPDigestAuth
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/nvr", tags=["nvr"])

_WS_DISCOVERY_ADDRESS = ("239.255.255.250", 3702)
_WS_DISCOVERY_NS = "http://schemas.xmlsoap.org/ws/2005/04/discovery"
_WS_ADDRESSING_NS = "http://schemas.xmlsoap.org/ws/2004/08/addressing"
_ONVIF_HTTP_TIMEOUT = 5


# ── ONVIF SOAP helpers ───────────────────────────────────────────────────────

def _wsse_header(username: str, password: str, mode: str = "digest") -> str:
    nonce_raw = os.urandom(16)
    nonce_b64 = base64.b64encode(nonce_raw).decode()
    created   = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    username_xml = xml_escape(username)
    password_xml_value = xml_escape(password)
    if mode == "text":
        password_xml = (
            '<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/'
            'oasis-200401-wss-username-token-profile-1.0#PasswordText">'
            f"{password_xml_value}</wsse:Password>"
        )
    else:
        digest = base64.b64encode(
            hashlib.sha1(nonce_raw + created.encode() + password.encode()).digest()
        ).decode()
        password_xml = (
            '<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/'
            'oasis-200401-wss-username-token-profile-1.0#PasswordDigest">'
            f"{digest}</wsse:Password>"
        )
    return (
        '<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
        "<wsse:UsernameToken>"
        f"<wsse:Username>{username_xml}</wsse:Username>"
        f"{password_xml}"
        f'<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">{nonce_b64}</wsse:Nonce>'
        f'<wsu:Created xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">{created}</wsu:Created>'
        "</wsse:UsernameToken>"
        "</wsse:Security>"
    )


def _build_envelope(username: str, password: str, body: str, auth_mode: str = "wsse-digest") -> bytes:
    wsse = ""
    if auth_mode == "wsse-digest":
        wsse = _wsse_header(username, password, "digest")
    elif auth_mode == "wsse-text":
        wsse = _wsse_header(username, password, "text")
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">'
        f"<s:Header>{wsse}</s:Header>"
        f"<s:Body>{body}</s:Body>"
        "</s:Envelope>"
    ).encode("utf-8")


def _soap_post(url: str, username: str, password: str, body: str) -> ET.Element:
    attempts = (
        ("wsse-digest", None),
        ("wsse-text", None),
        ("http-digest", HTTPDigestAuth(username, password)),
        ("http-basic", HTTPBasicAuth(username, password)),
    )
    last_permission_error: PermissionError | None = None
    last_connection_error: Exception | None = None

    for auth_mode, http_auth in attempts:
        payload = _build_envelope(username, password, body, auth_mode)
        try:
            resp = _http.post(
                url,
                data=payload,
                headers={"Content-Type": "application/soap+xml; charset=utf-8"},
                timeout=_ONVIF_HTTP_TIMEOUT,
                verify=False,
                auth=http_auth,
            )
            resp.raise_for_status()
            return ET.fromstring(resp.content)
        except _http.exceptions.HTTPError as exc:
            code = exc.response.status_code if exc.response is not None else "unknown"
            last_permission_error = PermissionError(
                f"NVR rejected ONVIF request ({code}) after trying standard ONVIF auth modes."
            )
            continue
        except (_http.exceptions.ConnectionError, _http.exceptions.Timeout) as exc:
            last_connection_error = exc
            break
        except ET.ParseError:
            raise

    if last_connection_error is not None:
        if isinstance(last_connection_error, _http.exceptions.Timeout):
            raise TimeoutError(f"NVR at {url} did not respond within {_ONVIF_HTTP_TIMEOUT} s")
        raise ConnectionError(f"Cannot reach NVR at {url}: {last_connection_error}") from last_connection_error
    if last_permission_error is not None:
        raise last_permission_error
    raise PermissionError("NVR rejected ONVIF request.")


# ── ONVIF LAN discovery ──────────────────────────────────────────────────────

def _discovery_probe() -> bytes:
    message_id = uuid.uuid4()
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" '
        f'xmlns:w="{_WS_ADDRESSING_NS}" '
        f'xmlns:d="{_WS_DISCOVERY_NS}" '
        'xmlns:dn="http://www.onvif.org/ver10/network/wsdl">'
        "<e:Header>"
        f"<w:MessageID>uuid:{message_id}</w:MessageID>"
        "<w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>"
        "<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>"
        "</e:Header>"
        "<e:Body>"
        "<d:Probe>"
        "<d:Types>dn:NetworkVideoTransmitter</d:Types>"
        "</d:Probe>"
        "</e:Body>"
        "</e:Envelope>"
    ).encode("utf-8")


def _scope_label(scopes: str) -> str:
    for scope in scopes.split():
        value = scope.rstrip("/").rsplit("/", 1)[-1]
        if value and value.lower() not in {"onvif", "www.onvif.org"}:
            decoded = unquote(value).replace("_", " ").replace("-", " ").strip()
            if decoded and decoded.lower() not in {"networkvideotransmitter", "video"}:
                return decoded
    return "ONVIF device"


def _looks_like_nvr(scopes: str, types: str) -> bool:
    text = f"{scopes} {types}".lower()
    return any(marker in text for marker in ("nvr", "recorder", "networkvideorecorder", "video_recorder"))


def _parse_discovery_response(xml: bytes, source_ip: str) -> dict[str, object] | None:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None

    xaddrs_el = root.find(f".//{{{_WS_DISCOVERY_NS}}}XAddrs")
    if xaddrs_el is None or not xaddrs_el.text:
        return None

    xaddrs = [addr for addr in xaddrs_el.text.split() if addr.startswith(("http://", "https://"))]
    if not xaddrs:
        return None

    parsed = urlparse(xaddrs[0])
    ip = parsed.hostname or source_ip
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    scopes = root.findtext(f".//{{{_WS_DISCOVERY_NS}}}Scopes", default="")
    types = root.findtext(f".//{{{_WS_DISCOVERY_NS}}}Types", default="")

    return {
        "ip": ip,
        "port": port,
        "xaddr": xaddrs[0],
        "name": _scope_label(scopes),
        "is_nvr": _looks_like_nvr(scopes, types),
    }


def _local_ipv4_addresses() -> list[str]:
    candidates: set[str] = set()

    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET, socket.SOCK_DGRAM):
            ip = info[4][0]
            candidates.add(ip)
    except OSError:
        pass

    for target in ("8.8.8.8", "1.1.1.1"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe_sock:
                probe_sock.connect((target, 80))
                candidates.add(probe_sock.getsockname()[0])
        except OSError:
            continue

    return sorted(
        ip for ip in candidates
        if not ip.startswith(("127.", "169.254."))
    )


def _send_discovery_probe(sock: socket.socket, probe: bytes) -> None:
    try:
        sock.sendto(probe, _WS_DISCOVERY_ADDRESS)
    except OSError:
        pass

    for ip in _local_ipv4_addresses():
        try:
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(ip))
            sock.sendto(probe, _WS_DISCOVERY_ADDRESS)
        except OSError:
            continue


def _discover_onvif_devices(timeout: float = 7.0) -> list[dict[str, object]]:
    probe = _discovery_probe()
    devices: dict[tuple[str, int], dict[str, object]] = {}
    deadline = time.monotonic() + timeout

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.settimeout(0.5)

        # Some NVRs miss the first WS-Discovery multicast, especially on Windows
        # systems with more than one adapter. Repeat the probe on each adapter.
        for _ in range(3):
            _send_discovery_probe(sock, probe)
            time.sleep(0.35)

        while time.monotonic() < deadline:
            try:
                data, (source_ip, _) = sock.recvfrom(65535)
            except socket.timeout:
                continue
            except OSError:
                break

            device = _parse_discovery_response(data, source_ip)
            if not device:
                continue
            devices[(str(device["ip"]), int(device["port"]))] = device

    return sorted(devices.values(), key=lambda d: (not bool(d["is_nvr"]), str(d["ip"])))


# ── ONVIF operations ─────────────────────────────────────────────────────────

_ONVIF_SCHEMA = "http://www.onvif.org/ver10/schema"
_MEDIA_NS     = "http://www.onvif.org/ver10/media/wsdl"


def _get_media_service_url(device_url: str, username: str, password: str) -> str:
    body = (
        '<tds:GetCapabilities xmlns:tds="http://www.onvif.org/ver10/device/wsdl">'
        "<tds:Category>Media</tds:Category>"
        "</tds:GetCapabilities>"
    )
    root = _soap_post(device_url, username, password, body)
    el = root.find(f".//{{{_ONVIF_SCHEMA}}}XAddr")
    if el is not None and el.text:
        return el.text.strip()
    raise ValueError("NVR did not return a Media service URL")


def _get_profiles(media_url: str, username: str, password: str) -> list[dict[str, str]]:
    body = f'<trt:GetProfiles xmlns:trt="{_MEDIA_NS}"/>'
    root = _soap_post(media_url, username, password, body)
    profiles: list[dict[str, str]] = []
    for p in root.findall(f".//{{{_MEDIA_NS}}}Profiles"):
        token = p.get("token", "")
        if not token:
            continue
        name_el = p.find(f"{{{_ONVIF_SCHEMA}}}Name")
        name = name_el.text.strip() if name_el is not None and name_el.text else token
        profiles.append({"token": token, "name": name})
    return profiles


def _get_stream_uri(media_url: str, username: str, password: str, token: str) -> str:
    body = (
        f'<trt:GetStreamUri xmlns:trt="{_MEDIA_NS}">'
        "<trt:StreamSetup>"
        f"<tt:Stream xmlns:tt=\"{_ONVIF_SCHEMA}\">RTP-Unicast</tt:Stream>"
        f"<tt:Transport xmlns:tt=\"{_ONVIF_SCHEMA}\"><tt:Protocol>RTSP</tt:Protocol></tt:Transport>"
        "</trt:StreamSetup>"
        f"<trt:ProfileToken>{token}</trt:ProfileToken>"
        "</trt:GetStreamUri>"
    )
    root = _soap_post(media_url, username, password, body)
    el = root.find(f".//{{{_ONVIF_SCHEMA}}}Uri")
    if el is not None and el.text:
        return el.text.strip()
    raise ValueError(f"No stream URI for profile {token!r}")


def _fix_rtsp_url(rtsp_url: str, nvr_ip: str, username: str, password: str) -> str:
    """Replace localhost/127.0.0.1 with NVR IP and embed credentials if absent."""
    url = rtsp_url.replace("localhost", nvr_ip).replace("127.0.0.1", nvr_ip)
    match = re.match(r"(rtsp://)([^@]+@)?(.+)", url, re.IGNORECASE)
    if match and not match.group(2):
        enc_u = url_quote(username, safe="")
        enc_p = url_quote(password, safe="")
        url = f"rtsp://{enc_u}:{enc_p}@{match.group(3)}"
    return url


def _stream_group_key(name: str, token: str, rtsp_url: str) -> str:
    parsed = urlparse(rtsp_url)
    query = parse_qs(parsed.query)
    channel = query.get("channel", [""])[0]
    if channel.isdigit():
        return f"channel-{int(channel)}"

    text = f"{name} {token} {rtsp_url}".lower()
    for pattern in (
        r"channel[_\s-]*(\d+)",
        r"\bch[_\s-]*(\d+)\b",
        r"/channels/(\d+)",
        r"/streaming/channels/(\d+)",
    ):
        match = re.search(pattern, text)
        if not match:
            continue
        value = int(match.group(1))
        if value >= 100 and value % 100:
            value = value // 100
        return f"channel-{value}"

    normalized = re.sub(r"(mainstream|main_stream|substream\d*|sub_stream\d*|stream\d+)$", "", text)
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")
    return normalized or token or name


def _stream_score(channel: "NVRChannel") -> int:
    text = f"{channel.name} {channel.token} {channel.rtsp_url}".lower()
    parsed = urlparse(channel.rtsp_url)
    query = parse_qs(parsed.query)
    score = 0
    if "mainstream" in text or "main_stream" in text:
        score += 120
    if re.search(r"\bmain\b", text):
        score += 80
    if query.get("subtype", [""])[0] == "0":
        score += 80
    if re.search(r"/(?:channels|streaming/channels)/\d*01\b", text):
        score += 70
    if "substream" in text or "sub_stream" in text:
        score -= 90
    if query.get("subtype", [""])[0] and query.get("subtype", [""])[0] != "0":
        score -= 70
    return score


def _dedupe_channel_streams(channels: list["NVRChannel"]) -> list["NVRChannel"]:
    best_by_channel: dict[str, NVRChannel] = {}
    order: list[str] = []
    for channel in channels:
        key = _stream_group_key(channel.name, channel.token, channel.rtsp_url)
        if key not in best_by_channel:
            best_by_channel[key] = channel
            order.append(key)
            continue
        if _stream_score(channel) > _stream_score(best_by_channel[key]):
            best_by_channel[key] = channel
    return [best_by_channel[key] for key in order]


def _default_device_url(ip: str, port: int) -> str:
    scheme = "https" if int(port) == 443 else "http"
    return f"{scheme}://{ip}:{port}/onvif/device_service"


def _device_url_from_request(ip: str, port: int, xaddr: str | None = None) -> str:
    device_url = xaddr or _default_device_url(ip, port)
    parsed = urlparse(device_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Invalid ONVIF device service URL.")
    return device_url


def _scan_channels(ip: str, port: int, username: str, password: str, xaddr: str | None = None) -> list["NVRChannel"]:
    device_url = _device_url_from_request(ip, port, xaddr)
    media_url = _get_media_service_url(device_url, username, password)
    profiles = _get_profiles(media_url, username, password)

    channels: list[NVRChannel] = []
    for p in profiles:
        try:
            raw_uri = _get_stream_uri(media_url, username, password, p["token"])
            rtsp = _fix_rtsp_url(raw_uri, ip, username, password)
            channels.append(NVRChannel(name=p["name"], rtsp_url=rtsp, token=p["token"]))
        except Exception:
            continue
    return _dedupe_channel_streams(channels)


# ── Schemas ───────────────────────────────────────────────────────────────────

class NVRScanRequest(BaseModel):
    ip:       str
    port:     int = 80
    username: str
    password: str
    xaddr:    str | None = Field(default=None, description="Discovered ONVIF device service URL")


class NVRChannel(BaseModel):
    name:     str
    rtsp_url: str
    token:    str


class NVRScanResult(BaseModel):
    channels: list[NVRChannel]


class NVRDiscoverDevice(BaseModel):
    ip:     str
    port:   int
    xaddr:  str
    name:   str
    is_nvr: bool = False


class NVRDiscoverResult(BaseModel):
    devices: list[NVRDiscoverDevice]


class NVRFindRequest(BaseModel):
    username: str
    password: str


class NVRFindCandidate(NVRDiscoverDevice):
    channels: list[NVRChannel]


class NVRFindResult(BaseModel):
    candidates: list[NVRFindCandidate]
    tested:     int


# ── Route ─────────────────────────────────────────────────────────────────────

@router.get("/discover", response_model=NVRDiscoverResult)
def discover_nvrs():
    try:
        devices = _discover_onvif_devices()
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"LAN discovery failed: {exc}")
    return NVRDiscoverResult(devices=[NVRDiscoverDevice(**device) for device in devices])


@router.post("/find", response_model=NVRFindResult)
def find_nvrs(body: NVRFindRequest):
    try:
        devices = _discover_onvif_devices()
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"LAN discovery failed: {exc}")

    def probe(device: dict[str, object]) -> NVRFindCandidate | None:
        ip = str(device["ip"])
        port = int(device["port"])
        channels = _scan_channels(ip, port, body.username, body.password, str(device.get("xaddr") or ""))
        is_nvr = bool(device["is_nvr"]) or len(channels) > 1
        if not channels or not is_nvr:
            return None
        return NVRFindCandidate(
            ip=ip,
            port=port,
            xaddr=str(device["xaddr"]),
            name=str(device["name"]),
            is_nvr=is_nvr,
            channels=channels,
        )

    candidates: list[NVRFindCandidate] = []
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(devices)))) as executor:
        futures = [executor.submit(probe, device) for device in devices]
        for future in as_completed(futures):
            try:
                candidate = future.result()
            except Exception:
                continue
            if candidate is not None:
                candidates.append(candidate)

    candidates.sort(key=lambda c: (not c.is_nvr, -len(c.channels), c.ip))
    return NVRFindResult(candidates=candidates, tested=len(devices))


@router.post("/scan", response_model=NVRScanResult)
def scan_nvr(body: NVRScanRequest):
    try:
        channels = _scan_channels(body.ip, body.port, body.username, body.password, body.xaddr)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=str(exc))
    except (ConnectionError, TimeoutError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Cannot connect to NVR: {exc}")

    if not channels:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="ONVIF login worked, but this device did not return usable camera stream channels.")

    return NVRScanResult(channels=channels)
