from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src import sender
from src.logstore import sendlog
from src.store import store, valid_name

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _check_name(name: str) -> None:
    if not valid_name(name):
        raise HTTPException(status_code=400, detail="Invalid template name")


@router.get("")
def list_templates():
    return store.list_templates()


@router.get("/{name}")
def get_template(name: str):
    _check_name(name)
    draft = store.read_template(name, "draft")
    published = store.read_template(name, "published")
    if draft is None and published is None:
        raise HTTPException(status_code=404, detail="No such template")
    return {"name": name, "draft": draft, "published": published}


class DraftBody(BaseModel):
    html: str


@router.put("/{name}")
def save_draft(name: str, body: DraftBody):
    _check_name(name)
    store.save_draft(name, body.html)
    return {"ok": True}


@router.delete("/{name}")
def delete_template(name: str):
    _check_name(name)
    store.delete_template(name)
    return {"ok": True}


@router.post("/{name}/publish")
def publish(name: str):
    """Validate the draft against every linked event type's sample payload
    (StrictUndefined — an unknown variable fails the publish), then copy it
    into published/ atomically."""
    _check_name(name)
    draft = store.read_template(name, "draft")
    if draft is None:
        raise HTTPException(status_code=404, detail="No draft to publish")

    validated = []
    for etype, spec in store.get_event_types().items():
        if spec.get("template") != name:
            continue
        sample = store.get_sample(etype)
        if sample is None:
            continue
        try:
            sender.render_html(draft, sample)
            sender.render_subject(spec.get("subject", ""), sample)
        except Exception as error:
            raise HTTPException(
                status_code=400,
                detail=f"Render failed against sample of '{etype}': {error}",
            )
        validated.append(etype)

    store.publish(name)
    return {"ok": True, "validated_against": validated}


class RenderBody(BaseModel):
    stage: str = "draft"
    # Live preview sends the editor's current content; when absent the
    # saved stage is rendered instead.
    html: str | None = None
    # The subject template to render alongside; when absent the event
    # type's saved subject is used.
    subject: str | None = None
    # Explicit payload wins; otherwise the event type's sample is used.
    payload: dict | None = None
    event_type: str | None = None
    # Lenient = preview semantics: an undefined variable renders as literal
    # {{ name }} instead of failing. Sends stay strict.
    lenient: bool = False


@router.post("/{name}/render")
def render(name: str, body: RenderBody):
    """Rendered HTML + subject for the preview iframe, with variable
    analysis: which variables the sources use, which the payload is
    missing, and which payload keys go unused. Render errors come back as
    400 so the editor can show them inline."""
    _check_name(name)
    source = (
        body.html
        if body.html is not None
        else store.read_template(name, body.stage)
    )
    if source is None:
        raise HTTPException(status_code=404, detail=f"No {body.stage} version")

    payload = body.payload
    subject_source = body.subject
    if body.event_type:
        spec = store.get_event_types().get(body.event_type)
        if spec and subject_source is None:
            subject_source = spec.get("subject", "")
        if payload is None:
            payload = store.get_sample(body.event_type)
    payload = payload or {}
    subject_source = subject_source or ""

    try:
        used = sorted(sender.template_variables(source, subject_source))
        html = sender.render_html(source, payload, lenient=body.lenient)
        subject = sender.render_subject(
            subject_source, payload, lenient=body.lenient
        )
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Render failed: {error}")
    return {
        "html": html,
        "subject": subject,
        "used": used,
        "missing": [v for v in used if v not in payload],
        "unused": sorted(k for k in payload if k not in set(used)),
    }


class TestSendBody(BaseModel):
    to: str
    payload: dict | None = None
    event_type: str | None = None


@router.post("/{name}/test-send")
async def test_send(name: str, body: TestSendBody):
    """Send the DRAFT to a chosen address — no retry, immediate feedback."""
    _check_name(name)
    rendered = render(
        name,
        RenderBody(stage="draft", payload=body.payload, event_type=body.event_type),
    )
    spec = (
        store.get_event_types().get(body.event_type) if body.event_type else None
    )
    config = sender.config_for(store.get_config(), spec)
    if not config["from_address"]:
        raise HTTPException(status_code=400, detail="Set a from address first")
    subject = rendered["subject"] or f"[test] {name}"
    try:
        await sender.send_email(
            config, to=body.to, cc=[], subject=subject, html=rendered["html"]
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Send failed: {error}")
    sendlog.append(
        "test_sent", type=body.event_type, to=body.to, template=name, subject=subject
    )
    return {"ok": True}
