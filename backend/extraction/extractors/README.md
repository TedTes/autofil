# Document Extractors

## Available Extractors

| Extractor | Document Type | Description |
|-----------|---------------|-------------|
| ACORD126Extractor | ACORD_126 | Commercial General Liability forms |
| LossRunExtractor | LOSS_RUN | Insurance claim history |
| SovExtractor | SOV | Schedule of Values (property schedules) |
| FinancialStatementExtractor | FINANCIAL_STATEMENT | Balance sheets, income statements |
| SupplementalExtractor | SUPPLEMENTAL | Driver licenses, certificates, photos |
| GenericExtractor | GENERIC, UNKNOWN | Fallback for any document |

## Usage

### Simple Extraction (Recommended)
```python
from extraction.core import UniversalFileLoader
from extraction.extractors import extract_from_document

# Load document
loader = UniversalFileLoader()
document = loader.load('document.pdf')

# Extract (automatic extractor selection)
result = extract_from_document(document)

if result.success:
    print(result.data)
else:
    print(result.errors)
```

### Using ExtractorFactory
```python
from extraction.extractors import ExtractorFactory

# Extract with factory
result = ExtractorFactory.extract(document)

# Check if can extract
can_extract = ExtractorFactory.can_extract(document)

# Get available extractors
extractors = ExtractorFactory.get_available_extractors()
```

### Manual Extractor Selection
```python
from extraction.extractors import LossRunExtractor

# Create specific extractor
extractor = LossRunExtractor()

# Check if can extract
if extractor.can_extract(document):
    result = extractor.extract(document)
```

### Using Registry
```python
from extraction.extractors import extractor_registry
from extraction.core import DocumentType

# Get extractor by type
extractor = extractor_registry.get_extractor(DocumentType.LOSS_RUN)

# List available extractors
types = extractor_registry.list_extractors()

# Check if extractor exists
has_extractor = extractor_registry.has_extractor(DocumentType.SOV)
```

## Complete Pipeline Example
```python
from extraction.core import UniversalFileLoader
from extraction.classifiers import classifier_registry
from extraction.extractors import extract_from_document

# 1. Load file
loader = UniversalFileLoader()
document = loader.load('submission.pdf')

# 2. Classify document
classifier = classifier_registry.create_composite(
    classifier_names=['mime', 'keyword', 'table'],
    strategy='highest_confidence'
)
doc_type, confidence = classifier.classify(document)
document.set_document_type(doc_type, confidence)

# 3. Extract data
result = extract_from_document(document)

# 4. Use extracted data
if result.success:
    data = result.data
    print(f"Extracted {len(data)} fields")
    print(f"Confidence: {result.confidence}")
else:
    print(f"Extraction failed: {result.errors}")
```

## Custom Extractors

To create a custom extractor:
```python
from extraction.interfaces.extractor import IExtractor
from extraction.core import Document, DocumentType
from extraction.models import ExtractionResult

class MyCustomExtractor(IExtractor):
    def extract(self, document: Document) -> ExtractionResult:
        # Your extraction logic
        data = {}
        return ExtractionResult(success=True, data=data)
    
    def can_extract(self, document: Document) -> bool:
        return document.document_type == DocumentType.CUSTOM
    
    def get_supported_types(self):
        return [DocumentType.CUSTOM]

# Register custom extractor
from extraction.extractors import extractor_registry
extractor_registry.register(DocumentType.CUSTOM, MyCustomExtractor)
```