"""
Fusion strategy for combining data from multiple documents.

Handles multi-document submissions where data must be merged,
cross-validated, and reconciled across different sources.

Example use case:
- Insurance submission with 10 files:
  * ACORD 126 (application)
  * Loss Run (claims history)
  * SOV (property schedule)
  * Financial Statement
  * 3 Photos
  * 2 Driver Licenses
  * Certificate
"""

from typing import Dict, Any, List, Optional, Set, Tuple
from datetime import datetime
from dataclasses import dataclass
from ..core.document import Document, DocumentType
from ..models.extraction_result import ExtractionResult
from ..extractors.factory import ExtractorFactory
from ..utils.semantic_section_builder import SemanticSectionBuilder


@dataclass
class DocumentGroup:
    """
    Group of related documents in a submission.
    
    Represents a logical grouping of documents that should be
    processed together (e.g., one insurance submission).
    """
    group_id: str
    documents: List[Document]
    metadata: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
    
    def get_by_type(self, doc_type: DocumentType) -> List[Document]:
        """Get all documents of a specific type."""
        return [doc for doc in self.documents if doc.document_type == doc_type]
    
    def has_type(self, doc_type: DocumentType) -> bool:
        """Check if group contains document of specific type."""
        return any(doc.document_type == doc_type for doc in self.documents)
    
    def count_by_type(self) -> Dict[DocumentType, int]:
        """Count documents by type."""
        counts = {}
        for doc in self.documents:
            counts[doc.document_type] = counts.get(doc.document_type, 0) + 1
        return counts


class FusionStrategy:
    """
    Strategy for fusing data from multiple documents.
    
    Capabilities:
    - Extract from multiple documents
    - Merge related data (e.g., applicant info from ACORD + supplemental)
    - Cross-validate data across documents
    - Resolve conflicts intelligently
    - Build unified submission object
    
    Example:
        documents = [acord_doc, loss_run_doc, sov_doc, photo_doc]
        group = DocumentGroup(group_id='submission_123', documents=documents)
        
        strategy = FusionStrategy()
        result = strategy.fuse(group)
        
        # Result contains merged data from all documents
        print(result.data['applicant'])  # From ACORD
        print(result.data['claims'])     # From Loss Run
        print(result.data['properties']) # From SOV
        print(result.data['photos'])     # From Photos
    """
    
    def __init__(
        self,
        enable_cross_validation: bool = True,
        conflict_resolution: str = 'highest_confidence',
        include_source_tracking: bool = True
    ):
        """
        Initialize fusion strategy.
        
        Args:
            enable_cross_validation: Cross-validate data across documents
            conflict_resolution: How to resolve conflicts
                - 'highest_confidence': Use value with highest confidence
                - 'most_recent': Use value from most recent document
                - 'primary_source': Use value from primary document type
            include_source_tracking: Track which document each field came from
        """
        self.enable_cross_validation = enable_cross_validation
        self.conflict_resolution = conflict_resolution
        self.include_source_tracking = include_source_tracking
    
    def fuse(self, document_group: DocumentGroup) -> ExtractionResult:
        """
        Fuse data from multiple documents into unified result.
        
        Args:
            document_group: Group of documents to process
            
        Returns:
            ExtractionResult with fused data from all documents
        """
        try:
            # Step 1: Extract from each document
            individual_results = self._extract_all(document_group)
            
            if not individual_results:
                return ExtractionResult(
                    success=False,
                    data={},
                    errors=["No data extracted from any document"]
                )
            
            organized = self._organize_by_type(individual_results)
            fused_data = self._merge_canonical_results(individual_results, document_group)

            warnings = []
            if self.enable_cross_validation:
                warnings = self._cross_validate_canonical(individual_results)

            fused_data['fusion_metadata'] = self._build_fusion_metadata(
                document_group,
                individual_results,
                organized
            )
            
            # Calculate overall confidence
            confidence = self._calculate_fusion_confidence(individual_results)
            
            return ExtractionResult(
                success=True,
                data=fused_data,
                warnings=warnings,
                confidence=confidence
            )
        except Exception as e:
            return ExtractionResult(
                success=False,
                data={},
                errors=[f"Fusion failed: {str(e)}"]
            )

    def _merge_canonical_results(
        self,
        results: List[Tuple[Document, ExtractionResult]],
        document_group: DocumentGroup,
    ) -> Dict[str, Any]:
        merged_entities: Dict[str, List[Dict[str, Any]]] = {}
        documents: List[Dict[str, Any]] = []

        for document, result in results:
            if not result.success or not isinstance(result.data, dict):
                continue

            documents.append(
                {
                    'file_name': document.file_name,
                    'document_type': document.document_type.value,
                    'confidence': result.confidence,
                    'data': result.data,
                }
            )

            sections = result.data.get('semantic_sections') or result.data.get('semanticSections') or []
            entity_map = SemanticSectionBuilder.flatten(sections)

            for field_id, values in entity_map.items():
                for value in values:
                    if not isinstance(value, dict):
                        continue
                    annotated = {
                        **value,
                        '_document_type': document.document_type.value,
                        '_file_name': document.file_name,
                    }
                    merged_entities.setdefault(field_id, []).append(annotated)

        return {
            'submission_id': document_group.group_id,
            'submission_date': datetime.utcnow().isoformat(),
            'document_count': len(document_group.documents),
            'documents': documents,
            'merged_entities': merged_entities,
        }

    def _cross_validate_canonical(
        self,
        results: List[Tuple[Document, ExtractionResult]],
    ) -> List[str]:
        warnings: List[str] = []
        merged_entities: Dict[str, Set[str]] = {}

        for _, result in results:
            if not result.success or not isinstance(result.data, dict):
                continue
            sections = result.data.get('semantic_sections') or result.data.get('semanticSections') or []
            entity_map = SemanticSectionBuilder.flatten(sections)
            for field_id, values in entity_map.items():
                for value in values:
                    if not isinstance(value, dict):
                        continue
                    raw_value = value.get('value')
                    if raw_value in (None, '', [], {}):
                        continue
                    merged_entities.setdefault(field_id, set()).add(str(raw_value))

        for field_id, distinct_values in merged_entities.items():
            if len(distinct_values) > 1:
                warnings.append(
                    f"Conflicting values detected for {field_id}: {sorted(distinct_values)[:3]}"
                )

        return warnings
            
    def _extract_all(self, document_group: DocumentGroup) -> List[Tuple[Document, ExtractionResult]]:
        """Extract data from all documents in group."""
        results = []
        
        for document in document_group.documents:
            try:
                result = ExtractorFactory.extract(document)
                results.append((document, result))
            except Exception as e:
                # Log error but continue with other documents
                error_result = ExtractionResult(
                    success=False,
                    data={'file_name': document.file_name},
                    errors=[f"Extraction failed: {str(e)}"]
                )
                results.append((document, error_result))
        
        return results
    
    def _organize_by_type(
        self,
        results: List[Tuple[Document, ExtractionResult]]
    ) -> Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]:
        """Organize results by document type."""
        organized = {}
        
        for document, result in results:
            doc_type = document.document_type
            if doc_type not in organized:
                organized[doc_type] = []
            organized[doc_type].append((document, result))
        
        return organized
    
    def _merge_data(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]],
        document_group: DocumentGroup
    ) -> Dict[str, Any]:
        """
        Merge data from different document types into unified structure.
        
        Creates a comprehensive submission object with:
        - Applicant information (from ACORD)
        - Claims history (from Loss Run)
        - Property schedule (from SOV)
        - Financial data (from Financial Statement)
        - Supporting documents (photos, licenses, etc.)
        """
        fused = {
            'submission_id': document_group.group_id,
            'submission_date': datetime.utcnow().isoformat(),
            'document_count': len(document_group.documents),
        }
        
        # Merge ACORD forms (primary application data)
        acord_data = self._merge_acord_forms(organized)
        if acord_data:
            fused['application'] = acord_data
        
        # Merge Loss Runs (claims history)
        loss_run_data = self._merge_loss_runs(organized)
        if loss_run_data:
            fused['claims_history'] = loss_run_data
        
        # Merge SOVs (property schedule)
        sov_data = self._merge_sovs(organized)
        if sov_data:
            fused['property_schedule'] = sov_data
        
        # Merge Financial Statements
        financial_data = self._merge_financial_statements(organized)
        if financial_data:
            fused['financial_information'] = financial_data
        
        # Merge Supplemental Documents
        supplemental_data = self._merge_supplemental(organized)
        if supplemental_data:
            fused['supplemental_documents'] = supplemental_data
        
        # Cross-reference applicant information
        if self.enable_cross_validation:
            fused['applicant'] = self._merge_applicant_info(organized)
        
        return fused
    
    def _merge_acord_forms(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> Optional[Dict[str, Any]]:
        """Merge data from ACORD forms (126, 125, 130, 140)."""
        acord_types = [
            DocumentType.ACORD_126,
            DocumentType.ACORD_125,
            DocumentType.ACORD_130,
            DocumentType.ACORD_140
        ]
        
        merged = {}
        
        for acord_type in acord_types:
            if acord_type in organized:
                for document, result in organized[acord_type]:
                    if result.success:
                        form_key = acord_type.value.lower()
                        merged[form_key] = result.data
                        
                        if self.include_source_tracking:
                            merged[form_key]['_source'] = {
                                'file_name': document.file_name,
                                'document_type': acord_type.value,
                                'confidence': result.confidence
                            }
        
        return merged if merged else None
    
    def _merge_loss_runs(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> Optional[Dict[str, Any]]:
        """Merge data from loss run documents."""
        if DocumentType.LOSS_RUN not in organized:
            return None
        
        all_claims = []
        total_paid = 0.0
        total_incurred = 0.0
        sources = []
        
        for document, result in organized[DocumentType.LOSS_RUN]:
            if result.success:
                data = result.data
                claims = data.get('claims', [])
                all_claims.extend(claims)
                
                # Aggregate totals
                totals = data.get('totals', {})
                total_paid += totals.get('total_paid', 0.0)
                total_incurred += totals.get('total_incurred', 0.0)
                
                # Track source
                sources.append({
                    'file_name': document.file_name,
                    'claim_count': len(claims),
                    'confidence': result.confidence
                })
        
        # Remove duplicate claims (by claim number)
        unique_claims = self._deduplicate_claims(all_claims)
        
        merged = {
            'claims': unique_claims,
            'claim_count': len(unique_claims),
            'totals': {
                'total_paid': total_paid,
                'total_incurred': total_incurred,
            },
        }
        
        if self.include_source_tracking:
            merged['_sources'] = sources
        
        return merged
    
    def _merge_sovs(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> Optional[Dict[str, Any]]:
        """Merge data from SOV documents."""
        if DocumentType.SOV not in organized:
            return None
        
        all_properties = []
        total_value = 0.0
        sources = []
        
        for document, result in organized[DocumentType.SOV]:
            if result.success:
                data = result.data
                properties = data.get('properties', [])
                all_properties.extend(properties)
                
                # Aggregate totals
                totals = data.get('totals', {})
                total_value += totals.get('total_insured_value', 0.0)
                
                # Track source
                sources.append({
                    'file_name': document.file_name,
                    'property_count': len(properties),
                    'confidence': result.confidence
                })
        
        # Remove duplicate properties (by location)
        unique_properties = self._deduplicate_properties(all_properties)
        
        merged = {
            'properties': unique_properties,
            'property_count': len(unique_properties),
            'totals': {
                'total_insured_value': total_value,
            },
        }
        
        if self.include_source_tracking:
            merged['_sources'] = sources
        
        return merged
    
    def _merge_financial_statements(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> Optional[Dict[str, Any]]:
        """Merge data from financial statement documents."""
        if DocumentType.FINANCIAL_STATEMENT not in organized:
            return None
        
        # Usually only one financial statement per submission
        # If multiple, use most recent or highest confidence
        
        best_result = None
        best_confidence = 0.0
        
        for document, result in organized[DocumentType.FINANCIAL_STATEMENT]:
            if result.success and result.confidence > best_confidence:
                best_result = (document, result)
                best_confidence = result.confidence
        
        if best_result:
            document, result = best_result
            merged = result.data.copy()
            
            if self.include_source_tracking:
                merged['_source'] = {
                    'file_name': document.file_name,
                    'confidence': result.confidence
                }
            
            return merged
        
        return None
    
    def _merge_supplemental(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> Optional[List[Dict[str, Any]]]:
        """Merge supplemental documents (photos, licenses, etc.)."""
        if DocumentType.SUPPLEMENTAL not in organized:
            return None
        
        supplemental_docs = []
        
        for document, result in organized[DocumentType.SUPPLEMENTAL]:
            doc_info = {
                'file_name': document.file_name,
                'supplemental_type': result.data.get('supplemental_type', 'generic'),
                'extracted_data': result.data.get('data', {}),
            }
            
            if result.success:
                doc_info['status'] = 'processed'
                doc_info['confidence'] = result.confidence
            else:
                doc_info['status'] = 'failed'
                doc_info['errors'] = result.errors
            
            supplemental_docs.append(doc_info)
        
        return supplemental_docs
    
    def _merge_applicant_info(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> Dict[str, Any]:
        """
        Cross-reference and merge applicant information from multiple sources.
        
        Applicant info can come from:
        - ACORD forms
        - Driver licenses (supplemental)
        - Other documents
        """
        applicant = {}
        
        # Primary source: ACORD forms
        acord_types = [DocumentType.ACORD_126, DocumentType.ACORD_125]
        
        for acord_type in acord_types:
            if acord_type in organized:
                for document, result in organized[acord_type]:
                    if result.success:
                        data = result.data
                        
                        # Extract applicant info
                        if 'applicant_information' in data:
                            applicant_info = data['applicant_information']
                            applicant = self._merge_fields(
                                applicant,
                                applicant_info,
                                source=document.file_name
                            )
        
        # Secondary source: Supplemental (driver licenses)
        if DocumentType.SUPPLEMENTAL in organized:
            for document, result in organized[DocumentType.SUPPLEMENTAL]:
                if result.success:
                    supp_type = result.data.get('supplemental_type')
                    if supp_type == 'driver_license':
                        license_data = result.data.get('data', {})
                        # Cross-validate name, DOB, address
                        applicant = self._merge_fields(
                            applicant,
                            license_data,
                            source=document.file_name,
                            priority='low'  # Lower priority than ACORD
                        )
        
        return applicant
    
    def _merge_fields(
        self,
        target: Dict[str, Any],
        source: Dict[str, Any],
        source_name: str = 'unknown',
        priority: str = 'normal'
    ) -> Dict[str, Any]:
        """
        Merge fields from source into target.
        
        Handles conflicts based on conflict_resolution strategy.
        """
        for key, value in source.items():
            if not value:  # Skip empty values
                continue
            
            if key not in target or not target[key]:
                # No conflict - add new field
                target[key] = value
                
                if self.include_source_tracking:
                    if key + '_source' not in target:
                        target[key + '_source'] = source_name
            else:
                # Conflict - resolve based on strategy
                if priority == 'high' or self.conflict_resolution == 'primary_source':
                    # Override with new value
                    target[key] = value
                    if self.include_source_tracking:
                        target[key + '_source'] = source_name
                # Otherwise keep existing value
        
        return target
    
    def _deduplicate_claims(self, claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate claims by claim number."""
        seen_numbers = set()
        unique = []
        
        for claim in claims:
            claim_number = claim.get('claim_number')
            if claim_number and claim_number not in seen_numbers:
                seen_numbers.add(claim_number)
                unique.append(claim)
            elif not claim_number:
                # Keep claims without claim number
                unique.append(claim)
        
        return unique
    
    def _deduplicate_properties(self, properties: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate properties by location."""
        seen_locations = set()
        unique = []
        
        for prop in properties:
            location = prop.get('location_number') or prop.get('address')
            if location and location not in seen_locations:
                seen_locations.add(location)
                unique.append(prop)
            elif not location:
                # Keep properties without location identifier
                unique.append(prop)
        
        return unique
    
    def _cross_validate(
        self,
        fused_data: Dict[str, Any],
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> List[str]:
        """
        Cross-validate data across documents.
        
        Checks for:
        - Inconsistent applicant names
        - Date mismatches
        - Conflicting policy numbers
        - Suspicious data patterns
        """
        warnings = []
        
        # Validate applicant name consistency
        names = self._extract_all_names(organized)
        if len(set(names)) > 1:
            warnings.append(
                f"Applicant name inconsistency found: {', '.join(set(names))}"
            )
        
        # Validate policy numbers
        policy_numbers = self._extract_all_policy_numbers(organized)
        if len(set(policy_numbers)) > 1:
            warnings.append(
                f"Multiple policy numbers found: {', '.join(set(policy_numbers))}"
            )
        
        # Validate date ranges
        date_warnings = self._validate_dates(fused_data)
        warnings.extend(date_warnings)
        
        return warnings
    
    def _extract_all_names(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> List[str]:
        """Extract all applicant/insured names from documents."""
        names = []
        
        for doc_type, results in organized.items():
            for document, result in results:
                if result.success:
                    data = result.data
                    
                    # Check various name fields
                    name = (
                        data.get('applicant_information', {}).get('name') or
                        data.get('insured_name') or
                        data.get('policy_information', {}).get('insured_name')
                    )
                    
                    if name:
                        names.append(name.strip().lower())
        
        return names
    
    def _extract_all_policy_numbers(
        self,
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> List[str]:
        """Extract all policy numbers from documents."""
        policy_numbers = []
        
        for doc_type, results in organized.items():
            for document, result in results:
                if result.success:
                    data = result.data
                    
                    # Check various policy number fields
                    policy_no = (
                        data.get('policy_information', {}).get('policy_number') or
                        data.get('policy_number') or
                        data.get('prior_insurance', {}).get('prior_policy_number')
                    )
                    
                    if policy_no:
                        policy_numbers.append(policy_no.strip())
        
        return policy_numbers
    
    def _validate_dates(self, fused_data: Dict[str, Any]) -> List[str]:
        """Validate date consistency and logic."""
        warnings = []
        
        # Check if effective date is before expiration date
        application = fused_data.get('application', {})
        for form_key, form_data in application.items():
            if isinstance(form_data, dict):
                coverage = form_data.get('coverage_information', {})
                effective = coverage.get('effective_date')
                expiration = coverage.get('expiration_date')
                
                if effective and expiration:
                    # Basic date validation (can be enhanced)
                    if effective > expiration:
                        warnings.append(
                            f"{form_key}: Effective date is after expiration date"
                        )
        
        return warnings
    
    def _build_fusion_metadata(
        self,
        document_group: DocumentGroup,
        individual_results: List[Tuple[Document, ExtractionResult]],
        organized: Dict[DocumentType, List[Tuple[Document, ExtractionResult]]]
    ) -> Dict[str, Any]:
        """Build metadata about the fusion process."""
        return {
            'group_id': document_group.group_id,
            'total_documents': len(document_group.documents),
            'documents_by_type': {
                doc_type.value: len(results)
                for doc_type, results in organized.items()
            },
            'successful_extractions': sum(
                1 for _, result in individual_results if result.success
            ),
            'failed_extractions': sum(
                1 for _, result in individual_results if not result.success
            ),
            'fusion_timestamp': datetime.utcnow().isoformat(),
            'cross_validation_enabled': self.enable_cross_validation,
            'conflict_resolution_method': self.conflict_resolution,
        }
    
    def _calculate_fusion_confidence(
        self,
        individual_results: List[Tuple[Document, ExtractionResult]]
    ) -> float:
        """Calculate overall confidence for fused result."""
        if not individual_results:
            return 0.0
        
        # Average confidence of successful extractions
        successful = [
            result.confidence
            for _, result in individual_results
            if result.success
        ]
        
        if not successful:
            return 0.0
        
        avg_confidence = sum(successful) / len(successful)
        
        # Bonus for having multiple document types
        unique_types = len(set(
            doc.document_type
            for doc, result in individual_results
            if result.success
        ))
        
        bonus = min(0.1, unique_types * 0.02)
        
        return min(1.0, avg_confidence + bonus)
    
    def __repr__(self) -> str:
        return (
            f"FusionStrategy("
            f"cross_validation={self.enable_cross_validation}, "
            f"conflict_resolution='{self.conflict_resolution}')"
        )
