"""Interface for canonical-data fillers."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from filling.fillers.base_filler import FillReport


class IFiller(ABC):
    """
    Interface for generating output artifacts from canonical data.

    Implementations orchestrate the filling/export workflow:
    - canonical projection
    - template selection
    - output generation
    """

    @abstractmethod
    def fill(
        self,
        canonical_data: Dict[str, Any],
        output_path: str,
        template_id: Optional[str] = None,
        template_version: str = "latest",
        template_pdf_override: Optional[str] = None,
    ) -> "FillReport":
        """
        Generate an output artifact from canonical data.

        Args:
            canonical_data: Canonical extraction payload
            output_path: Path where the generated artifact should be saved
            template_id: Optional normalized template identifier
            template_version: Optional template version selector
            template_pdf_override: Optional explicit PDF/template path override

        Returns:
            FillReport describing artifact generation coverage and warnings.
        """
        raise NotImplementedError

    @abstractmethod
    def fill_from_canonical(
        self,
        canonical_data: Dict[str, Any],
        output_path: str,
        template_id: str,
        template_version: str = "latest",
        template_pdf_override: Optional[str] = None,
    ) -> "FillReport":
        """
        Generate an output artifact from canonical data with an explicit template.
        """
        raise NotImplementedError

    @abstractmethod
    def get_supported_form_type(self) -> str:
        """Return the normalized form type identifier this filler supports."""
        raise NotImplementedError
