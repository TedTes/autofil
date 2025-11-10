"""
Data model for extraction results.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional


"""
Data model for extraction results.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional


@dataclass
class ExtractionResult:
    """
    Result of document extraction process.
    
    Contains the extracted data along with metadata about
    the extraction quality and any issues encountered.
    """
    
    # PRIMARY DATA
    data: Dict[str, Any] = field(default_factory=dict)
    """Extracted data in canonical format (replaces 'json')"""
    
    # SUCCESS FLAG
    success: bool = True
    """Whether extraction succeeded"""
    
    # QUALITY METRICS
    confidence: float = 0.0
    """Overall confidence score (0.0 to 1.0)"""
    
    field_confidence: Dict[str, float] = field(default_factory=dict)
    """Confidence scores for individual fields"""
    
    # ISSUES
    warnings: List[str] = field(default_factory=list)
    """List of warning messages (non-fatal issues)"""
    
    errors: List[str] = field(default_factory=list)
    """List of error messages"""
    
    error: Optional[str] = None
    """Primary error message if extraction failed"""
    
    #  METADATA
    metadata: Dict[str, Any] = field(default_factory=dict)
    """Additional metadata about the extraction"""
    
    #  LEGACY SUPPORT (optional - for backwards compatibility)
    @property
    def json(self) -> Dict[str, Any]:
        """Legacy property - returns data"""
        return self.data
    
    def is_successful(self) -> bool:
        """Check if extraction was successful."""
        return self.success and (self.error is None) and len(self.data) > 0
    
    def has_warnings(self) -> bool:
        """Check if there are any warnings."""
        return len(self.warnings) > 0
    
    def get_low_confidence_fields(self, threshold: float = 0.7) -> List[tuple]:
        """
        Get fields below confidence threshold.
        
        Args:
            threshold: Minimum confidence (0.0 to 1.0)
            
        Returns:
            List of (field_path, confidence) tuples
        """
        return [
            (field_path, conf)
            for field_path, conf in self.field_confidence.items()
            if conf < threshold
        ]
    
    def get_field_confidence(self, field_path: str) -> Optional[float]:
        """Get confidence for a specific field."""
        return self.field_confidence.get(field_path)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'success': self.success,
            'data': self.data,
            'confidence': self.confidence,
            'warnings': self.warnings,
            'errors': self.errors,
            'error': self.error,
            'metadata': self.metadata,
            'field_confidence': self.field_confidence,
        }