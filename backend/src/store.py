"""File-backed state. Everything Crier knows lives under the data directory:

    data/
      templates/draft/<name>.html
      templates/published/<name>.html
      events.json          event type -> {template, subject, max_age_seconds, enabled}
      samples/<type>.json  example payload per event type
      config.json          SMTP + sender identity
      logs/                JSONL send log (owned by logstore)

Files are read on demand — they are tiny and this keeps external edits
(the folder is meant to be a git repo) visible without cache invalidation.
Writes go through a temp file + rename so a reader never sees a half-written
file.
"""

import json
import re
import shutil
import tempfile
from pathlib import Path

from config import settings

# Template names and event types become file names; keep them path-safe.
NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$")

DEFAULT_CONFIG = {
    "from_address": "",
    "from_name": "Crier",
    "smtp": {
        "host": "localhost",
        "port": 1025,
        "username": "",
        "password": "",
        # use_tls = implicit TLS (465); start_tls = upgrade after EHLO (587).
        "use_tls": False,
        "start_tls": False,
    },
}

DEMO_TEMPLATE = """\
<html>
  <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
    <h1>Hello {{ name }}</h1>
    <p>This is Crier's demo template. Events of type <b>demo.welcome</b>
    render this file — edit it, publish, and send a test event.</p>
  </body>
</html>
"""


def valid_name(name: str) -> bool:
    return bool(NAME_RE.match(name)) and ".." not in name


def _atomic_write(path: Path, content: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with open(fd, "w") as f:
            f.write(content)
        Path(tmp).replace(path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def _read_json(path: Path, default):
    if not path.is_file():
        return default
    return json.loads(path.read_text())


def _write_json(path: Path, value) -> None:
    _atomic_write(path, json.dumps(value, indent=2) + "\n")


class Store:
    def __init__(self, root: Path):
        self.root = root
        self.draft_dir = root / "templates" / "draft"
        self.published_dir = root / "templates" / "published"
        self.samples_dir = root / "samples"
        self.logs_dir = root / "logs"
        self.events_file = root / "events.json"
        self.config_file = root / "config.json"

        for d in (self.draft_dir, self.published_dir, self.samples_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)
        # A bind mount pre-creates the root, so "fresh install" is judged by
        # contents: no registry and no templates yet.
        if not self.events_file.is_file() and not any(self.draft_dir.iterdir()):
            self._seed_demo()

    def _seed_demo(self) -> None:
        _atomic_write(self.draft_dir / "welcome.html", DEMO_TEMPLATE)
        _atomic_write(self.published_dir / "welcome.html", DEMO_TEMPLATE)
        _write_json(
            self.events_file,
            {
                "demo.welcome": {
                    "template": "welcome",
                    "subject": "Hello {{ name }}",
                    "max_age_seconds": None,
                    "enabled": True,
                }
            },
        )
        _write_json(self.samples_dir / "demo.welcome.json", {"name": "Ada"})

    # -- config ------------------------------------------------------------

    def get_config(self) -> dict:
        cfg = _read_json(self.config_file, {})
        merged = json.loads(json.dumps(DEFAULT_CONFIG))
        merged.update({k: v for k, v in cfg.items() if k != "smtp"})
        merged["smtp"].update(cfg.get("smtp", {}))
        return merged

    def save_config(self, cfg: dict) -> None:
        _write_json(self.config_file, cfg)

    # -- event types -------------------------------------------------------

    def get_event_types(self) -> dict[str, dict]:
        return _read_json(self.events_file, {})

    def save_event_types(self, types: dict[str, dict]) -> None:
        _write_json(self.events_file, types)

    # -- samples -----------------------------------------------------------

    def get_sample(self, event_type: str) -> dict | None:
        return _read_json(self.samples_dir / f"{event_type}.json", None)

    def save_sample(self, event_type: str, payload: dict) -> None:
        _write_json(self.samples_dir / f"{event_type}.json", payload)

    def delete_sample(self, event_type: str) -> None:
        (self.samples_dir / f"{event_type}.json").unlink(missing_ok=True)

    # -- templates ---------------------------------------------------------

    def list_templates(self) -> list[dict]:
        names = {p.stem for p in self.draft_dir.glob("*.html")}
        names |= {p.stem for p in self.published_dir.glob("*.html")}
        return sorted(
            (
                {
                    "name": name,
                    "has_draft": (self.draft_dir / f"{name}.html").is_file(),
                    "has_published": (self.published_dir / f"{name}.html").is_file(),
                }
                for name in names
            ),
            key=lambda t: t["name"],
        )

    def read_template(self, name: str, stage: str) -> str | None:
        d = self.published_dir if stage == "published" else self.draft_dir
        path = d / f"{name}.html"
        return path.read_text() if path.is_file() else None

    def save_draft(self, name: str, html: str) -> None:
        _atomic_write(self.draft_dir / f"{name}.html", html)

    def publish(self, name: str) -> None:
        """Copy draft over published atomically — the consumer only ever
        reads published, so it sees either the old or the new version."""
        draft = self.draft_dir / f"{name}.html"
        fd, tmp = tempfile.mkstemp(dir=self.published_dir, prefix=f".{name}.")
        try:
            with open(fd, "w") as f:
                shutil.copyfileobj(draft.open(), f)
            Path(tmp).replace(self.published_dir / f"{name}.html")
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    def delete_template(self, name: str) -> None:
        (self.draft_dir / f"{name}.html").unlink(missing_ok=True)
        (self.published_dir / f"{name}.html").unlink(missing_ok=True)


store = Store(Path(settings.data_dir))
