from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.store import store, valid_name

router = APIRouter(prefix="/api/events", tags=["events"])


def _check_type(event_type: str) -> None:
    if not valid_name(event_type):
        raise HTTPException(status_code=400, detail="Invalid event type")


@router.get("")
def list_event_types():
    templates = {t["name"]: t for t in store.list_templates()}
    return [
        {
            "type": etype,
            **spec,
            "has_sample": store.get_sample(etype) is not None,
            # Mapped but unpublished means the consumer will DLQ this type.
            "template_published": templates.get(spec.get("template", ""), {}).get(
                "has_published", False
            ),
        }
        for etype, spec in sorted(store.get_event_types().items())
    ]


class EventTypeBody(BaseModel):
    template: str
    subject: str = ""
    max_age_seconds: int | None = None
    enabled: bool = True
    # Empty = the global sender identity from Settings.
    from_address: str = ""
    from_name: str = ""


@router.put("/{event_type}")
def upsert_event_type(event_type: str, body: EventTypeBody):
    _check_type(event_type)
    if not valid_name(body.template):
        raise HTTPException(status_code=400, detail="Invalid template name")
    types = store.get_event_types()
    types[event_type] = body.model_dump()
    store.save_event_types(types)
    return {"ok": True}


@router.delete("/{event_type}")
def delete_event_type(event_type: str):
    _check_type(event_type)
    types = store.get_event_types()
    if types.pop(event_type, None) is None:
        raise HTTPException(status_code=404, detail="No such event type")
    store.save_event_types(types)
    store.delete_sample(event_type)
    return {"ok": True}


@router.get("/{event_type}/sample")
def get_sample(event_type: str):
    _check_type(event_type)
    sample = store.get_sample(event_type)
    if sample is None:
        raise HTTPException(status_code=404, detail="No sample payload")
    return sample


class SampleBody(BaseModel):
    payload: dict


@router.put("/{event_type}/sample")
def put_sample(event_type: str, body: SampleBody):
    _check_type(event_type)
    store.save_sample(event_type, body.payload)
    return {"ok": True}
