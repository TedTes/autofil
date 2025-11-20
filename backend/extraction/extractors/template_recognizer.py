from pathlib import Path
from typing import Dict, Any, Optional, Iterable

import yaml


class TemplateRecognizer:
    """
    Detects which template version a PDF likely matches by checking for signature fields.
    Signatures are defined inside each template YAML under the `signature_fields` key.
    """

    def __init__(self, templates_dir: str):
        self.templates_dir = Path(templates_dir)
        self.signatures = self._load_signatures()

    def recognize(self, raw_fields: Dict[str, Any], raw_text: str) -> Optional[str]:
        field_names = set(raw_fields.keys())

        for template_id, signature in self.signatures.items():
            if signature and signature.issubset(field_names):
                return template_id

        # Fallback: if we only know about one template, return it to preserve current behavior.
        if len(self.signatures) == 1:
            return next(iter(self.signatures), None)
        return None

    def _load_signatures(self) -> Dict[str, set]:
        signatures: Dict[str, set] = {}
        if not self.templates_dir.exists():
            return signatures

        for yaml_file in self.templates_dir.glob("*.yaml"):
            try:
                with open(yaml_file, "r") as f:
                    data = yaml.safe_load(f) or {}
                fields = data.get("signature_fields", [])
                if fields:
                    signatures[yaml_file.stem] = set(fields)
            except Exception:
                continue
        return signatures
