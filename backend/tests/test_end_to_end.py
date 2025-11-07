"""
End-to-end integration test for ACORD 126 workflow.

Tests:
1. Extract data from filled PDF
2. Fill new PDF with extracted data
3. Verify output
"""

import os
import json
from extraction.extractors import ACORD126Extractor
from filling.fillers import Acord126Filler


def test_extract_and_fill():
    """
    Test complete workflow: PDF → Extract → Fill → PDF
    """
    print("\n" + "="*60)
    print("ACORD 126 End-to-End Test")
    print("="*60)
    
    # Paths
    input_pdf = "tests/fixtures/ACORD_126_filled.pdf"
    template_pdf = "templates/ACORD_126.pdf"
    output_pdf = "tests/output/refilled_acord_126.pdf"
    extracted_json_path = "tests/output/extracted_data.json"
    
    # Create output directory
    os.makedirs("tests/output", exist_ok=True)
    
    # ========================================
    # STEP 1: EXTRACTION
    # ========================================
    print("\n[STEP 1] Extracting data from filled PDF...")
    print(f"Input: {input_pdf}")
    
    extractor = ACORD126Extractor()
    extraction_result = extractor.extract(input_pdf)
    
    if not extraction_result.is_successful():
        print(f"❌ Extraction failed: {extraction_result.error}")
        return False
    
    print(f"✅ Extraction successful!")
    print(f"   Confidence: {extraction_result.confidence}")
    print(f"   Fields extracted: {extraction_result.metadata.get('total_fields_extracted', 0)}")
    
    if extraction_result.has_warnings():
        print(f"   Warnings: {len(extraction_result.warnings)}")
        for warning in extraction_result.warnings[:3]:  # Show first 3
            print(f"     - {warning}")
    
    # Save extracted JSON for inspection
    with open(extracted_json_path, "w") as f:
        json.dump(extraction_result.json, f, indent=2)
    print(f"   JSON saved to: {extracted_json_path}")
    
    # ========================================
    # STEP 2: FILLING
    # ========================================
    print("\n[STEP 2] Filling new PDF with extracted data...")
    print(f"Template: {template_pdf}")
    print(f"Output: {output_pdf}")
    
    filler = Acord126Filler()
    fill_report = filler.fill(
        template_path=template_pdf,
        data=extraction_result.json,
        output_path=output_pdf
    )
    
    print(f"✅ Filling complete!")
    print(f"   Fields written: {fill_report['written']}")
    print(f"   Fields skipped: {len(fill_report['skipped'])}")
    
    if fill_report['skipped']:
        print(f"   Skipped fields (first 5):")
        for json_key, reason in fill_report['skipped'][:5]:
            print(f"     - {json_key}: {reason}")
    
    if fill_report['unknown_pdf_fields']:
        print(f"   Unknown PDF fields: {len(fill_report['unknown_pdf_fields'])}")
    
    if fill_report['notes']:
        print(f"   Notes:")
        for note in fill_report['notes']:
            print(f"     - {note}")
    
    # ========================================
    # STEP 3: VERIFICATION
    # ========================================
    print("\n[STEP 3] Verification...")
    
    # Check output file exists
    if os.path.exists(output_pdf):
        file_size = os.path.getsize(output_pdf)
        print(f"✅ Output PDF created: {file_size:,} bytes")
    else:
        print(f"❌ Output PDF not found!")
        return False
    
    # Check some critical fields were extracted
    critical_fields = [
        "applicant.business_name",
        "limits.each_occurrence",
        "limits.general_aggregate"
    ]
    
    print(f"\n   Critical fields check:")
    all_present = True
    for field in critical_fields:
        from utils.json_navigator import JsonNavigator
        value = JsonNavigator.deep_get(extraction_result.json, field)
        if value:
            print(f"   ✅ {field}: {value}")
        else:
            print(f"   ❌ {field}: MISSING")
            all_present = False
    
    # ========================================
    # SUMMARY
    # ========================================
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Extraction: ✅ SUCCESS (confidence: {extraction_result.confidence})")
    print(f"Filling: ✅ SUCCESS ({fill_report['written']} fields written)")
    print(f"Output: ✅ {output_pdf}")
    print(f"Critical fields: {'✅ ALL PRESENT' if all_present else '⚠️  SOME MISSING'}")
    print("="*60 + "\n")
    
    return True


def test_sample_json_filling():
    """
    Test filling with the original sample JSON (regression test).
    """
    print("\n" + "="*60)
    print("ACORD 126 Sample JSON Test (Regression)")
    print("="*60)
    
    sample_json_path = "acord_samples/ACORD_126_sample.json"
    template_pdf = "templates/ACORD_126.pdf"
    output_pdf = "tests/output/from_sample_json.pdf"
    
    if not os.path.exists(sample_json_path):
        print(f"⚠️  Sample JSON not found: {sample_json_path}")
        return False
    
    # Load sample JSON
    with open(sample_json_path, "r") as f:
        sample_data = json.load(f)
    
    print(f"\n[TEST] Filling from sample JSON...")
    print(f"Input: {sample_json_path}")
    print(f"Output: {output_pdf}")
    
    # Fill
    filler = Acord126Filler()
    fill_report = filler.fill(
        template_path=template_pdf,
        data=sample_data,
        output_path=output_pdf
    )
    
    print(f"✅ Filling complete!")
    print(f"   Fields written: {fill_report['written']}")
    print(f"   Fields skipped: {len(fill_report['skipped'])}")
    
    if os.path.exists(output_pdf):
        print(f"✅ Output PDF created")
    else:
        print(f"❌ Output PDF not created!")
        return False
    
    print("="*60 + "\n")
    return True


if __name__ == "__main__":
    print("\n🚀 Running ACORD 126 Integration Tests...\n")
    
    # Test 1: Extract → Fill workflow
    success1 = test_extract_and_fill()
    
    # Test 2: Sample JSON filling (regression)
    success2 = test_sample_json_filling()
    
    # Summary
    print("\n" + "="*60)
    print("ALL TESTS SUMMARY")
    print("="*60)
    print(f"Extract → Fill: {'✅ PASS' if success1 else '❌ FAIL'}")
    print(f"Sample JSON: {'✅ PASS' if success2 else '❌ FAIL'}")
    print("="*60 + "\n")
    
    if success1 and success2:
        print("🎉 All tests passed!\n")
    else:
        print("❌ Some tests failed!\n")