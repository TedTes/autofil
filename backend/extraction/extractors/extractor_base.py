
from abc import ABC, abstractmethod
from ..core.schema import CanonicalOutput
from ..core.document import Document

class BaseExtractor(ABC):
    @abstractmethod
    def extract(self, doc: Document) -> CanonicalOutput:
        pass