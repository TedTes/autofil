# Extraction Module

Complete document extraction system for insurance documents.

## Quick Start

### Simple Extraction (One Line)
```python
from extraction import extract_from_file

result = extract_from_file('document.pdf')

if result.success:
    print(result.data)
else:
    print(result.errors)
```

### Pipeline with Configuration
```python
from extraction import ExtractionPipelineBuilder

pipeline = (ExtractionPipelineBuilder()
    .with_classification(strategy='voting')
    .with_min_confidence(0.7)
    .build())

result = pipeline.process('document.pdf')
```

### Batch Processing
```python
from extraction import SimplePipeline

files = ['file1.pdf', 'file2.pdf', 'file3.pdf']
results = SimplePipeline.extract_batch(files)

for result in results:
    if result.success:
        print(f"Extracted {len(result.data)} fields")
```

## Architecture
```
File → Load → Classify → Extract → Result
       ↓       ↓          ↓
    Document  Type     Data
```

### Components

1. **File Loaders** (`core/`)
   - Load files into Document objects
   - Support PDF, Excel, Images, Word

2. **Classifiers** (`classifiers/`)
   - Detect document type from content
   - MIME, Keyword, Table, ML classifiers

3. **Extractors** (`extractors/`)
   - Extract structured data
   - ACORD, Loss Run, SOV, Financial, Generic

4. **Parsers** (`parsers/`)
   - Parse raw content
   - PDF fields, OCR, Tables, Excel

5. **Pipeline** (`pipeline.py`)
   - Orchestrate complete workflow
   - Handle errors and metadata

## Supported Documents

| Document Type | Extractor | Confidence |
|---------------|-----------|------------|
| ACORD 126 | ACORD126Extractor | High (0.8-0.95) |
| Loss Run | LossRunExtractor | High (0.75-0.9) |
| SOV | SovExtractor | High (0.75-0.9) |
| Financial Statement | FinancialStatementExtractor | Medium (0.7-0.85) |
| Supplemental | SupplementalExtractor | Medium (0.6-0.8) |
| Generic/Unknown | GenericExtractor | Low (0.5-0.7) |

## Examples

### Basic Usage
```python
from extraction import extract_from_file

# Extract from file
result = extract_from_file('acord_126.pdf')

# Check success
if result.success:
    # Access data
    data = result.data
    
    # Check confidence
    print(f"Confidence: {result.confidence}")
    
    # Check warnings
    if result.warnings:
        print(f"Warnings: {result.warnings}")
else:
    print(f"Errors: {result.errors}")
```

### Advanced Pipeline
```python
from extraction import ExtractionPipeline

# Create custom pipeline
pipeline = ExtractionPipeline(
    use_classification=True,
    classification_strategy='weighted_average',
    min_classification_confidence=0.6
)

# Process file
result = pipeline.process('document.pdf')

# Get pipeline info
info = pipeline.get_pipeline_info()
print(info)
```

### Manual Control
```python
from extraction.core import UniversalFileLoader
from extraction.classifiers import classifier_registry
from extraction.extractors import ExtractorFactory

# 1. Load file
loader = UniversalFileLoader()
document = loader.load('document.pdf')

# 2. Classify (optional)
classifier = classifier_registry.create_composite()
doc_type, confidence = classifier.classify(document)
document.set_document_type(doc_type, confidence)

# 3. Extract
result = ExtractorFactory.extract(document)

# 4. Use data
print(result.data)
```

### Batch Processing with Progress
```python
from extraction import ExtractionPipeline

pipeline = ExtractionPipeline()
files = ['file1.pdf', 'file2.pdf', 'file3.pdf']

results = []
for i, file_path in enumerate(files):
    print(f"Processing {i+1}/{len(files)}: {file_path}")
    result = pipeline.process(file_path)
    results.append(result)
    
    if result.success:
        print(f"  ✓ Extracted {len(result.data)} fields")
    else:
        print(f"  ✗ Failed: {result.errors[0]}")

# Summary
successful = sum(1 for r in results if r.success)
print(f"\nProcessed {len(files)} files: {successful} successful")
```

## Error Handling
```python
from extraction import extract_from_file

result = extract_from_file('document.pdf')

if not result.success:
    # Check errors
    for error in result.errors:
        print(f"Error: {error}")
    
    # Check if partial data available
    if result.data:
        print("Partial data available:")
        print(result.data)

# Always check warnings
if result.warnings:
    for warning in result.warnings:
        print(f"Warning: {warning}")
```

## Configuration

### Classification Strategies

- `highest_confidence`: Use classifier with highest confidence
- `voting`: Majority vote (confidence as tiebreaker)
- `weighted_average`: Average confidence per type

### Minimum Confidence

Set threshold for accepting classification:
```python
pipeline = ExtractionPipeline(min_classification_confidence=0.7)
```

Documents below threshold are marked as UNKNOWN.

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Load PDF | 50-200ms | Depends on size |
| Classify | 100-500ms | Multiple classifiers |
| Extract ACORD | 200-800ms | Fillable fields |
| Extract Loss Run | 500-2000ms | Table parsing |
| Complete Pipeline | 1-3s | Average document |

## Testing
```python
from extraction import extract_from_file

# Test with sample document
result = extract_from_file('test_documents/acord_126_sample.pdf')

assert result.success
assert result.data['document_type'] == 'acord_126'
assert result.confidence > 0.7
```