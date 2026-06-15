"""NVR discovery via ONVIF — scan a connected NVR and return its camera channels."""
from __future__ import annotations

import base64
import hashlib
import os
import re
from datetime import datetime, timezone
from urllib.parse import quote as url_quote
import xml.etree.ElementTree as ET

import requests as _http
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/nvr", tags=["nvr"])


# ── ONVIF SOAP helpers ───────────────────────────────────────────────────────

def _wsse_header(username: str, password: str) -> str:
    nonce_raw = os.urandom(16)
    nonce_b64 = base64.b64encode(nonce_raw).decode()
    created   = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    digest    = base64.b64encode(
        hashlib.sha1(nonce_raw + created.encode() + password.encode()).digest()
    ).decode()
    return (
        '<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">'
        "<wsse:UsernameToken>"
        f"<wsse:Username>{username}</wsse:Username>"
        f'<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">{digest}</wsse:Password>'
        f'<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">{nonce_b64}</wsse:Nonce>'
        f'<wsu:Created xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">{created}</wsu:Created>'
        "</wsse:UsernameToken>"
        "</wsse:Security>"
    )


def _build_envelope(username: str, password: str, body: str) -> bytes:
    wsse = _wsse_header(username, password)
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">'
        f"<s:Header>{wsse}</s:Header>"
        f"<s:Body>{body}</s:Body>"
        "</s:Envelope>"
    ).encode("utf-8")


def _soap_post(url: str, username: str, password: str, body: str) -> ET.Element:
    payload = _build_envelope(username, password, body)
    try:
        resp = _http.post(
            url,
            data=payload,
            headers={"Content-Type": "application/soap+xml; charset=utf-8"},
            timeout=8,
            verify=False,
        )
        resp.raise_for_status()
        return ET.fromstring(resp.content)
    except _http.exceptions.ConnectionError as exc:
        raise ConnectionError(f"Cannot reach NVR at {url}: {exc}") from exc
    except _http.exceptions.HTTPError as exc:
        raise PermissionError(f"NVR rejected request ({exc.response.status_code}): wrong credentials?") from exc
    except _http.exceptions.Timeout:
        raise TimeoutError(f"NVR at {url} did not respond within 8 s")


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
    for p in root.findall(f"{{{_MEDIA_NS}}}Profiles"):
        token = p.get("token", "")
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


# ── Schemas ───────────────────────────────────────────────────────────────────

class NVRScanRequest(BaseModel):
    ip:       str
    port:     int = 80
    username: str
    password: str


class NVRChannel(BaseModel):
    name:     str
    rtsp_url: str
    token:    str


class NVRScanResult(BaseModel):
    channels: list[NVRChannel]


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/scan", response_model=NVRScanResult)
def scan_nvr(body: NVRScanRequest):
    device_url = f"http://{body.ip}:{body.port}/onvif/device_service"

    try:
        media_url = _get_media_service_url(device_url, body.username, body.password)
    except (ConnectionError, TimeoutError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Cannot connect to NVR: {exc}")

    try:
        profiles = _get_profiles(media_url, body.username, body.password)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Connected to NVR but failed to get camera list: {exc}")

    channels: list[NVRChannel] = []
    for p in profiles:
        try:
            raw_uri = _get_stream_uri(media_url, body.username, body.password, p["token"])
            rtsp    = _fix_rtsp_url(raw_uri, body.ip, body.username, body.password)
            channels.append(NVRChannel(name=p["name"], rtsp_url=rtsp, token=p["token"]))
        except Exception:
            continue  # skip profiles that have no stream URI

    if not channels:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="NVR connected but no camera channels found.")

    return NVRScanResult(channels=channels)
