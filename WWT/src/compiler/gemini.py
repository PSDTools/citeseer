"""Gemini API client for the Question Compiler."""

import os
import re
from typing import Any, Dict, Optional

import google.generativeai as genai

from ..toon import parse_toon, AnalyticalPlan
from ..ingestion.profiler import TableProfile, generate_schema_context
from .prompts import SYSTEM_PROMPT, OVERVIEW_PROMPT
from .validator import validate_plan, ValidationError
from ..orchestration.executor import QueryExecutor


class CompilationError(Exception):
    """Error during question compilation."""

    pass


class GeminiCompiler:
    """Question compiler using Google Gemini."""


    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = "gemini-2.0-flash",
        db_path: Optional[str] = None,
    ):
        """
        Initialize the Gemini compiler.

        Args:
            api_key: Gemini API key (defaults to GEMINI_API_KEY env var)
            model_name: Model to use
            db_path: Path to DuckDB database (required for tools)
        """
        api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set")

        genai.configure(api_key=api_key)
        
        # Tools
        self.db_path = db_path
        self._executor = QueryExecutor(db_path) if db_path else None
        
        tools = []
        if self._executor:
            tools = [self.check_sql]

        # Use updated tool configuration for Gemini 2.0
        self.model = genai.GenerativeModel(model_name, tools=tools)
        
        self._schema_context: Optional[str] = None
        self._table_profiles: Optional[Dict[str, TableProfile]] = None

    def check_sql(self, query: str) -> str:
        """
        Execute a read-only SQL query to peek at data values.
        Use this to check DISTINCT values or exact column spelling.
        Do NOT query for the final answer. Use simple SELECT ... LIMIT 5.
        """
        if not self._executor:
            return "Error: Database not connected."
            
        # Basic safety check (executor handles read-only val)
        try:
             result = self._executor.execute(query)
             if not result.success:
                 return f"Error: {result.error}"
             return str(result.data[:5]) # Return first 5 rows as string representation
        except Exception as e:
            return f"Error executing check: {e}"

    def set_schema(self, profiles: Dict[str, TableProfile]) -> None:
        """Set the available schema for query generation."""
        self._table_profiles = profiles
        self._schema_context = generate_schema_context(profiles)

    def _build_system_prompt(self) -> str:
        """Build the full system prompt with schema context."""
        if not self._schema_context:
            raise CompilationError("Schema not set. Call set_schema() first.")

        return SYSTEM_PROMPT.replace("{schema_context}", self._schema_context)

    async def compile_question(
        self,
        question: str,
        validate: bool = True,
        max_retries: int = 3,
    ) -> Dict[str, Any]:
        """
        Compile a natural language question into an analytical plan.

        Args:
            question: The user's question
            validate: Whether to validate the generated plan
            max_retries: Number of retries on validation failure

        Returns:
            Parsed analytical plan as a dictionary
        """
        system_prompt = self._build_system_prompt()
        messages = [system_prompt, f"Question: {question}"]
        
        last_error = None

        for attempt in range(max_retries + 1):
            if attempt > 0:
                print(f"Retry attempt {attempt} due to error: {last_error}")
                messages.append(f"Previous attempt failed with error: {last_error}. Please correct this and output a valid TOON plan.")

            # Generate response
            response = await self.model.generate_content_async(
                messages,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=2048,
                ),
            )

            # Extract text from response
            response_text = response.text.strip()
            
            # Keep history for context (optional, but good for retries)
            messages.append(response_text)

            # Find the TOON content
            toon_content = self._extract_toon(response_text)

            # Parse TOON
            try:
                plan = parse_toon(toon_content)
                
                # Check for SQL presence if not explicit in validator yet
                if not plan.get("sql") and not (plan.get("viz") and isinstance(plan.get("viz"), list) and plan.get("viz")[0].get("sql")):
                    raise ValidationError("Plan missing required 'sql' field.")

            except Exception as e:
                last_error = str(e)
                continue

            # Validate if requested
            if validate and self._table_profiles:
                try:
                    validate_plan(plan, self._table_profiles)
                    return plan  # Success!
                except ValidationError as e:
                    last_error = str(e)
                    # Add validation error to plan if we run out of retries
                    if attempt == max_retries:
                         plan["validation_error"] = str(e)
                         return plan
                    continue
            
            return plan

        # If we get here, valid parsing failed multiple times
        raise CompilationError(f"Failed to generate valid plan after {max_retries} retries. Last error: {last_error}")

    def compile_question_sync(
        self,
        question: str,
        validate: bool = True,
        max_retries: int = 3,
    ) -> Dict[str, Any]:
        """
        Synchronous version of compile_question.
        """
        system_prompt = self._build_system_prompt()
        messages = [system_prompt, f"Question: {question}"]
        
        last_error = None

        for attempt in range(max_retries + 1):
            if attempt > 0:
                print(f"Retry attempt {attempt} due to error: {last_error}")
                messages.append(f"Previous attempt failed with error: {last_error}. Please correct this and output a valid TOON plan.")

            # Generate response
            response = self.model.generate_content(
                messages,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=2048,
                ),
            )

            # Extract text from response
            response_text = response.text.strip()
            
            # Keep history
            messages.append(response_text)

            # Find the TOON content
            toon_content = self._extract_toon(response_text)

            # Parse TOON
            try:
                plan = parse_toon(toon_content)
                
                # Check for SQL presence manually
                sql = plan.get("sql")
                viz = plan.get("viz")
                has_sub_sql = False
                if isinstance(viz, list) and len(viz) > 0 and viz[0].get("sql"):
                    has_sub_sql = True
                
                # Enforce SQL presence
                if not sql and not has_sub_sql:
                     raise ValidationError("Plan missing required 'sql' field (or panel-level sql).")

            except Exception as e:
                last_error = str(e)
                continue

            # Validate if requested
            if validate and self._table_profiles:
                try:
                    validate_plan(plan, self._table_profiles)
                    return plan
                except ValidationError as e:
                    last_error = str(e)
                    if attempt == max_retries:
                         plan["validation_error"] = str(e)
                         return plan
                    continue
            
            return plan

        raise CompilationError(f"Failed to generate valid plan after {max_retries} retries. Last error: {last_error}")

    async def generate_overview(self) -> Dict[str, Any]:
        """
        Generate an overview dashboard for all available data.

        Returns:
            Dashboard specification as a dictionary
        """
        if not self._schema_context:
            raise CompilationError("Schema not set. Call set_schema() first.")

        prompt = OVERVIEW_PROMPT.format(schema_context=self._schema_context)

        response = await self.model.generate_content_async(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                max_output_tokens=4096,
            ),
        )

        response_text = response.text.strip()
        toon_content = self._extract_toon(response_text)

        try:
            return parse_toon(toon_content)
        except Exception as e:
            raise CompilationError(f"Failed to parse overview response: {e}")

    def generate_overview_sync(self) -> Dict[str, Any]:
        """Synchronous version of generate_overview."""
        if not self._schema_context:
            raise CompilationError("Schema not set. Call set_schema() first.")

        prompt = OVERVIEW_PROMPT.format(schema_context=self._schema_context)

        response = self.model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                max_output_tokens=4096,
            ),
        )

        response_text = response.text.strip()
        toon_content = self._extract_toon(response_text)

        try:
            return parse_toon(toon_content)
        except Exception as e:
            raise CompilationError(f"Failed to parse overview response: {e}")

    def _extract_toon(self, text: str) -> str:
        """Extract TOON content from response, handling markdown code blocks."""
        # Match ```toon ... ``` or ``` ... ```
        code_match = re.search(r"```(?:toon)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if code_match:
            return code_match.group(1).strip()

        # Look for @type{ pattern
        toon_match = re.search(r"(@\w+\{.*\})", text, re.DOTALL)
        if toon_match:
            return toon_match.group(1)

        # Return as-is
        return text
