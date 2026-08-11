"""Template rendering and SMTP delivery."""

import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from jinja2 import DebugUndefined, Environment, StrictUndefined, meta

logger = logging.getLogger("crier.sender")

# StrictUndefined so a payload missing a variable is an error, not a blank
# spot in someone's email. Subjects get their own environment because
# autoescape would turn "&" into "&amp;" in a subject line. The lenient
# pair is for previews: an undefined variable renders as literal
# "{{ name }}" instead of failing, so the preview never goes blank.
_html_env = Environment(undefined=StrictUndefined, autoescape=True)
_text_env = Environment(undefined=StrictUndefined, autoescape=False)
_lenient_html_env = Environment(undefined=DebugUndefined, autoescape=True)
_lenient_text_env = Environment(undefined=DebugUndefined, autoescape=False)

# First try is immediate; later tries wait out transient SMTP failures.
RETRY_DELAYS = (0, 1, 5, 25)


def render_html(source: str, payload: dict, *, lenient: bool = False) -> str:
    env = _lenient_html_env if lenient else _html_env
    return env.from_string(source).render(**payload)


def render_subject(source: str, payload: dict, *, lenient: bool = False) -> str:
    env = _lenient_text_env if lenient else _text_env
    return env.from_string(source).render(**payload)


def template_variables(*sources: str) -> set[str]:
    """Every variable the given template sources reference."""
    found: set[str] = set()
    for source in sources:
        found |= meta.find_undeclared_variables(_text_env.parse(source))
    return found


def config_for(config: dict, spec: dict | None) -> dict:
    """The effective sender config: the event type's from override, when set,
    on top of the global settings."""
    if not spec:
        return config
    override = {
        key: spec[key] for key in ("from_address", "from_name") if spec.get(key)
    }
    return {**config, **override} if override else config


async def send_email(
    config: dict, *, to: str, cc: list[str], subject: str, html: str
) -> None:
    msg = MIMEMultipart("alternative")
    from_address = config["from_address"]
    from_name = config["from_name"]
    msg["From"] = f"{from_name} <{from_address}>" if from_name else from_address
    msg["To"] = to
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    smtp = config["smtp"]
    await aiosmtplib.send(
        msg,
        hostname=smtp["host"],
        port=smtp["port"],
        username=smtp["username"] or None,
        password=smtp["password"] or None,
        use_tls=smtp["use_tls"],
        start_tls=smtp["start_tls"] or None,
    )


async def send_with_retry(config: dict, **kwargs) -> None:
    last: Exception | None = None
    for attempt, delay in enumerate(RETRY_DELAYS, start=1):
        if delay:
            await asyncio.sleep(delay)
        try:
            await send_email(config, **kwargs)
            return
        except Exception as error:
            last = error
            logger.warning(
                "send to %s failed (attempt %d/%d): %s",
                kwargs.get("to"),
                attempt,
                len(RETRY_DELAYS),
                error,
            )
    raise last  # type: ignore[misc]


async def test_connection(config: dict) -> None:
    """Connect and, when credentials are set, authenticate. Raises on failure."""
    smtp = config["smtp"]
    client = aiosmtplib.SMTP(
        hostname=smtp["host"], port=smtp["port"], use_tls=smtp["use_tls"]
    )
    await client.connect()
    try:
        if smtp["start_tls"]:
            await client.starttls()
        if smtp["username"] and smtp["password"]:
            await client.login(smtp["username"], smtp["password"])
    finally:
        await client.quit()
