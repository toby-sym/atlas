import inspect
import json
import logging
from collections.abc import Callable
from typing import Any

import httpx

logger = logging.getLogger("nook.agent")


# ToolRegistry manages the registration and execution of tools (functions) that can be called by the agent.
class ToolRegistry:
    # Initializes the empty ToolRegistry
    def __init__(self):
        self._tools: dict[str, Callable] = {}
        self._schemas: list[dict[str, Any]] = []

    # Registers a tool with its name, description, parameters, and the function itself.
    def register(
        self, name: str, description: str, parameters: dict[str, Any], func: Callable
    ):
        self._tools[name] = func
        self._schemas.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": description,
                    "parameters": parameters,
                },
            }
        )

    # Returns the list of registered tool schemas.
    def get_schemas(self) -> list[dict[str, Any]]:
        return self._schemas

    # Executes a registered tool by name with the provided arguments. Handles both synchronous and asynchronous functions.
    async def execute(self, name: str, arguments: dict[str, Any]) -> str:
        if name not in self._tools:
            return f"Error: Tool '{name}' is not registered."

        try:
            func = self._tools[name]
            if inspect.iscoroutinefunction(func):
                result = await func(**arguments)
            else:
                result = func(**arguments)

            if isinstance(result, (dict, list)):
                return json.dumps(result)
            return str(result)
        except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError) as e:
            logger.error(f"Execution error in tool '{name}': {e}", exc_info=True)
            return f"Error executing tool '{name}': {e!s}"


# Global registry instance
registry = ToolRegistry()


# Function decorator to register a tool with the global registry.
def register_tool(name: str, description: str, parameters: dict[str, Any]):
    def decorator(func: Callable):
        registry.register(name, description, parameters, func)
        return func

    return decorator


# Asynchronous function to run the agent loop, which interacts with the Ollama API and executes tool calls as needed.
async def run_agent_loop(
    messages: list[dict[str, Any]],
    ollama_url: str = "http://localhost:11434/v1/chat/completions",
    model: str = "qwen3:4b",
    max_steps: int = 5,
) -> dict[str, Any]:

    # Iterative tool-calling loop:
    # 1. Posts chat history + tool definitions to Ollama.
    # 2. If LLM responds with tool calls, executes them locally.
    # 3. Feeds results back into messages array as role='tool'.
    # 4. Loops until LLM returns a text response or max_steps is hit.

    # Step 1: Initialise HTTP client and step counter
    async with httpx.AsyncClient(timeout=60.0) as client:
        step = 0

        while step < max_steps:
            step += 1
            payload: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "stream": False,
            }

            schemas = registry.get_schemas()
            if schemas:
                payload["tools"] = schemas

            # Step 2: Send request to Ollama API and handle response
            try:
                response = await client.post(ollama_url, json=payload)
                response.raise_for_status()
            except httpx.HTTPError as e:
                logger.error(f"Ollama HTTP request failed: {e}")
                return {"role": "assistant", "content": f"Ollama connection error: {e}"}

            res_json = response.json()
            assistant_msg = res_json["choices"][0]["message"]

            # Step 3: Append model's response (tool call or final text)
            messages.append(assistant_msg)

            tool_calls = assistant_msg.get("tool_calls")
            if not tool_calls:
                # Execution complete, returning text answer
                return assistant_msg

            # Step 4: Execute each tool call returned by the model
            for tool_call in tool_calls:
                tool_id = tool_call.get("id", "call_0")
                fn = tool_call["function"]
                fn_name = fn["name"]

                raw_args = fn.get("arguments", "{}")
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args

                logger.info(
                    f"[Step {step}] Executing tool '{fn_name}' with args {args}"
                )
                output = await registry.execute(fn_name, args)

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "name": fn_name,
                        "content": output,
                    }
                )

        # If the loop exits without returning a final response, it means the maximum number of steps was reached without a conclusive answer.
        return {
            "role": "assistant",
            "content": "Agent reached maximum tool step limit without finalizing a response.",
        }
