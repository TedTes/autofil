from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, Field, validator


class SourceRef(BaseModel):
    """Where the value came from in the original document."""
    page: Optional[int] = None
    row: Optional[int] = None
    col: Optional[int] = None
    text_block_index: Optional[int] = None
    bbox: Optional[list[float]] = None          # [x0, y0, x1, y1]
    table_id: Optional[str] = None
    extraction_rule: Optional[str] = None       # e.g. "label_value", "table_row"


class EntityValue(BaseModel):
    """One extracted value (may appear many times for the same field)."""
    value: Any
    confidence: float = Field(ge=0.0, le=1.0)
    source: Optional[SourceRef] = None
    tags: List[str] = Field(default_factory=list)   # e.g. ["primary", "dba"]


class SemanticField(BaseModel):
    """Field definition + values grouped under a semantic section."""
    id: str
    label: Optional[str] = None
    type: Optional[str] = None
    aliases: List[str] = Field(default_factory=list)
    values: List[EntityValue] = Field(default_factory=list)


class SemanticSection(BaseModel):
    """Logical grouping of related canonical fields."""
    key: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    priority: int = 0
    icon: Optional[str] = None
    fields: List[SemanticField] = Field(default_factory=list)


class Metadata(BaseModel):
    form_type_detected: Optional[str] = None      # ACORD_126, LOSS_RUN, …
    line_of_business: Optional[str] = None
    carrier: Optional[str] = None
    submission_type: Optional[str] = None         # New, Renewal, Endorsement
    schema_version: str = "1.0"


class SourceInfo(BaseModel):
    file_name: str
    file_type: Literal["pdf", "excel", "csv", "docx", "image", "email"]
    extraction_method: str
    extracted_at: datetime = Field(default_factory=datetime.utcnow)


class CanonicalOutput(BaseModel):
    """The only output format an extractor may return."""
    job_id: str
    source: SourceInfo
    semantic_sections: List[SemanticSection] = Field(default_factory=list)
    metadata: Metadata = Field(default_factory=Metadata)
    raw: Optional[Dict[str, Any]] = None

    def to_entity_map(self) -> Dict[str, List[EntityValue]]:
        """Flatten semantic sections into the legacy entity map shape."""
        mapping: Dict[str, List[EntityValue]] = {}
        for section in self.semantic_sections:
            for field in section.fields:
                mapping[field.id] = field.values
        return mapping

    def to_dict(self):
        """Make it compatible with all other extractors"""
        return self.model_dump(mode="json")
