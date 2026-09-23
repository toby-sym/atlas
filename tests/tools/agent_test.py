import asyncio
from backend.agent import ToolRegistry
from backend import agent


def test_tool_registry():
    """Test tool registry functionality"""
    registry = ToolRegistry()

    # Register a tool
    registry.register(
        name="test_tool",
        description="A test tool",
        parameters={"type": "object", "properties": {}},
        func=lambda: "test result",
    )

    # Verify tool is registered
    assert "test_tool" in registry._tools  # pylint: disable=protected-access
    assert registry.get_schemas()[0]["function"]["name"] == "test_tool"


def test_tool_execution():
    """Test tool execution functionality"""
    registry = ToolRegistry()

    # Register a tool
    registry.register(
        name="test_tool",
        description="A test tool",
        parameters={"type": "object", "properties": {}},
        func=lambda: "test result",
    )

    # Execute the tool with asyncio.run()
    result = asyncio.run(registry.execute("test_tool", {}))
    assert result == "test result"


def test_prune_messages_keeps_complete_tool_turns():
    messages = [{"role": "system", "content": "system"}]
    for index in range(4):
        messages.extend(
            [
                {"role": "user", "content": f"question {index}"},
                {"role": "assistant", "tool_calls": [{"id": f"call_{index}"}]},
                {"role": "tool", "tool_call_id": f"call_{index}", "content": "result"},
                {"role": "assistant", "content": "answer"},
            ]
        )
    pruned = agent.prune_messages(messages, max_history=7)
    assert pruned[0]["role"] == "system"
    calls = {
        message["tool_calls"][0]["id"]
        for message in pruned
        if message.get("tool_calls")
    }
    replies = {
        message["tool_call_id"] for message in pruned if message.get("role") == "tool"
    }
    assert calls == replies
    assert len([message for message in pruned if message.get("role") == "user"]) == 1


def test_agent_completes_after_last_tool_round(monkeypatch):
    class Response:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            self.calls = []

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def post(self, _url, json):
            self.calls.append(json)
            if len(self.calls) == 1:
                return Response(
                    {
                        "choices": [
                            {
                                "message": {
                                    "role": "assistant",
                                    "tool_calls": [
                                        {
                                            "id": "call_1",
                                            "function": {
                                                "name": "read_file",
                                                "arguments": "{}",
                                            },
                                        }
                                    ],
                                }
                            }
                        ]
                    }
                )
            assert "tools" not in json
            assert any(
                message.get("tool_call_id") == "call_1" for message in json["messages"]
            )
            return Response(
                {
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": "Tool result summarized.",
                            }
                        }
                    ]
                }
            )

    monkeypatch.setattr(agent.httpx, "AsyncClient", FakeClient)

    async def fake_execute(_name, _arguments):
        return "ok"

    monkeypatch.setattr(agent.registry, "execute", fake_execute)
    result = asyncio.run(
        agent.run_agent_loop(
            [{"role": "user", "content": "Use a tool"}],
            ollama_url="http://fake",
            max_steps=1,
        )
    )
    assert result["content"] == "Tool result summarized."


def test_agent_rejects_invalid_step_limit():
    try:
        asyncio.run(agent.run_agent_loop([], max_steps=0))
    except ValueError as exc:
        assert "between 1 and 10" in str(exc)
    else:
        raise AssertionError("invalid step limit should fail")


def test_research_preference_runs_search_before_model(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {"message": {"role": "assistant", "content": "Based on results."}}
                ]
            }

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def post(self, _url, json):
            system = json["messages"][0]["content"]
            assert "Test search evidence" in system
            return Response()

    searches = []
    monkeypatch.setattr(
        agent,
        "search_web",
        lambda query, max_results: (
            searches.append(query)
            or [{"url": "https://example.test", "title": "Test search evidence"}]
        ),
    )
    monkeypatch.setattr(agent.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(
        agent.run_agent_loop(
            [{"role": "user", "content": "Summarize this topic"}],
            ollama_url="http://fake",
            research=True,
        )
    )
    assert result["content"] == "Based on results."
    assert searches == ["Summarize this topic"]


def test_malformed_tool_arguments_are_reported_to_model(monkeypatch):
    class Response:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self.payload

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            self.calls = 0

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def post(self, _url, json):
            self.calls += 1
            if self.calls == 1:
                return Response(
                    {
                        "choices": [
                            {
                                "message": {
                                    "role": "assistant",
                                    "tool_calls": [
                                        {
                                            "id": "bad-call",
                                            "function": {
                                                "name": "read_file",
                                                "arguments": "[",
                                            },
                                        }
                                    ],
                                }
                            }
                        ]
                    }
                )
            assert any(
                "Invalid tool call" in message.get("content", "")
                for message in json["messages"]
            )
            return Response(
                {
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": "The tool request was invalid.",
                            }
                        }
                    ]
                }
            )

    monkeypatch.setattr(agent.httpx, "AsyncClient", FakeClient)
    result = asyncio.run(
        agent.run_agent_loop(
            [{"role": "user", "content": "Read a file"}],
            ollama_url="http://fake",
            max_steps=1,
        )
    )
    assert result["content"] == "The tool request was invalid."
