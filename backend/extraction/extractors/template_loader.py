import json
from pathlib import Path
from typing import Dict, Any


class TemplateLoader:
    @staticmethod
    def load(templates_dir: str, template_id: str) -> Dict[str, Any]:
        path = Path(templates_dir) / f"{template_id}.json"
        
        with path.open("r", encoding="utf-8") as f:
            tpl = json.load(f)
        print("result")
        print(tpl)
        # sanity check
        if tpl.get("template_id") != template_id:
            raise ValueError(f"Template {template_id} has mismatched template_id")
        return tpl
