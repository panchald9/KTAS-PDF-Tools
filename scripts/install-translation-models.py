"""Download open-source model assets once. Document processing never uses a remote service."""
import json
import os
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "artifacts/api-server/models"
root.mkdir(parents=True, exist_ok=True)
index = json.load(urllib.request.urlopen(
    "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json", timeout=30))
for target in ["es", "fr", "hi"]:
    dest = root / f"en-{target}"
    if (dest / "model/model.bin").exists():
        print(f"Already installed: English → {target}", flush=True)
        continue
    package = next(x for x in index if x.get("from_code") == "en" and x.get("to_code") == target)
    url = next(x for x in package["links"] if x.startswith("https://"))
    with tempfile.TemporaryDirectory(prefix="ktas-model-") as temporary:
        archive = Path(temporary) / "model.zip"
        print(f"Downloading open-source English → {target} model", flush=True)
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=120) as response, archive.open("wb") as output:
            shutil.copyfileobj(response, output)
        with zipfile.ZipFile(archive) as z:
            for member in z.infolist():
                if not Path(temporary, member.filename).resolve().is_relative_to(Path(temporary)):
                    raise RuntimeError("Unsafe model archive path")
            z.extractall(temporary)
        candidates = list(Path(temporary).glob("*/model/model.bin"))
        if len(candidates) != 1:
            raise RuntimeError("Unexpected model package structure")
        shutil.copytree(candidates[0].parent.parent, dest, dirs_exist_ok=True)
        (dest / "source.json").write_text(json.dumps({
            "source": url, "package": package.get("package_version"),
            "from": "en", "to": target,
            "note": "Open-source Argos model, executed locally with CTranslate2."
        }, indent=2))
        print(f"Installed: English → {target}", flush=True)