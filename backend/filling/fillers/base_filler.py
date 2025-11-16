from dataclasses import dataclass
from typing import List, Optional, Any


@dataclass
class FillReport:
    """Summary of how well a filler populated a PDF/form output."""
    success: bool
    coverage: float                # 0.0 → 1.0
    filled_fields: int
    unmapped_fields: List[str]
    warnings: List[str]
    errors: List[str]


class BaseFiller:
    """Base class for all PDF/DOCX/FORM fillers. Provides common utilities."""

    form_type: str = "GENERIC"

    def __init__(self):
        pass

    def fill_from_canonical(self, canonical_data: dict, output_path: str, template_id: str):
        """
        Child classes must implement this.
        """
        raise NotImplementedError(
            f"{self.__class__.__name__}.fill_from_canonical must be implemented by subclass."
        )

    def fill(self, canonical_data: dict, output_path: str, template_id: Optional[str] = None):
        """
        Public wrapper. In future, can add logging, metrics, tracing, etc.
        """
        return self.fill_from_canonical(
            canonical_data=canonical_data,
            output_path=output_path,
            template_id=template_id
        )

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} form_type={self.form_type}>"
