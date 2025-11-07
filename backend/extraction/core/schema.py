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
    source: SourceRef
    tags: List[str] = Field(default_factory=list)   # e.g. ["primary", "dba"]


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
    entities: Dict[str, List[EntityValue]] = Field(default_factory=dict)
    metadata: Metadata = Field(default_factory=Metadata)
    raw: Optional[Dict[str, Any]] = None

    @validator("entities")
    def ensure_entityvalue_lists(cls, v):
        for field, vals in v.items():
            if vals and not all(isinstance(ev, EntityValue) for ev in vals):
                raise ValueError(
                    f"Field '{field}' must contain only EntityValue objects"
                )
        return v