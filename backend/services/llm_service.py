import json
from typing import Any, Dict, List, Optional
from openai import OpenAI

class LLMService:
    def __init__(self, model: Optional[str] = None, temperature: float = 0.0, max_tokens: int = 1500):
        # OPENAI_API_KEY is read from env by the SDK
        self.client = OpenAI()
        self.model = model or "gpt-4.1-mini"
        self.temperature = temperature
        self.max_tokens = max_tokens

    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        """Generic chat wrapper, returns plain text content."""
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            **kwargs,
        )
        return resp.choices[0].message.content

    def json_qa(self, system_prompt: str, user_prompt: str) -> Dict[str, Any]:
        """
        Structured JSON answer using JSON mode.
        We still parse message.content ourselves because this SDK
        doesn't expose `message.parsed`.
        """
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        user_prompt
                        + "\n\nRespond with pure JSON only. No markdown. No explanations."
                    ),
                },
            ],
            response_format={"type": "json_object"},
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )

        content = resp.choices[0].message.content
        print("content")
        print(content)
        # In some SDK versions content can be a list of parts; normalize to str
        if isinstance(content, list):
            # Expect list of {"type": "text", "text": {...}} or similar
            parts = []
            for part in content:
                if isinstance(part, dict):
                    # Try common shapes
                    if "text" in part and isinstance(part["text"], str):
                        parts.append(part["text"])
                    elif "text" in part and isinstance(part["text"], dict) and "value" in part["text"]:
                        parts.append(str(part["text"]["value"]))
            content = "".join(parts)

        if not isinstance(content, str):
            raise ValueError(f"LLM did not return JSON string content, got {type(content)}")

        text = content.strip()
        # JSON mode should guarantee this parses cleanly
        return json.loads(text)
