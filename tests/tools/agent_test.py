import asyncio
import json as json_lib

# pylint: disable=protected-access

import httpx
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


def test_explicit_memory_recall_runs_before_model_without_chip(monkeypatch):
    recalled = []
    monkeypatch.setattr(
        agent,
        "recall_memory",
        lambda: recalled.append(True) or [{"key": "project", "value": "Atlas"}],
    )

    async def prepare():
        return await agent._prepare_history(
            [{"role": "user", "content": "Recall my memories."}],
            research=False,
            recall=False,
            attachment_context="",
            web_enabled=False,
            memory_enabled=True,
            filesystem_enabled=False,
        )

    history, _tools = asyncio.run(prepare())
    assert recalled == [True]
    assert "Atlas" in history[0]["content"]


def test_project_instructions_are_added_to_the_system_context():
    history, _tools = asyncio.run(
        agent._prepare_history(
            [{"role": "user", "content": "Draft a note."}],
            research=False,
            recall=False,
            attachment_context="",
            web_enabled=False,
            memory_enabled=False,
            filesystem_enabled=False,
            project_instructions="Use short paragraphs.",
            project_id="project-id",
        )
    )
    assert history[0]["role"] == "system"
    assert (
        "Instructions for the current project, set by the user:"
        in history[0]["content"]
    )
    assert "Use short paragraphs." in history[0]["content"]


def test_memory_recall_receives_the_active_project_id(monkeypatch):
    recalled_projects = []

    def fake_recall(_query="", project_id="general"):
        recalled_projects.append(project_id)
        return []

    monkeypatch.setattr(agent, "recall_memory", fake_recall)
    asyncio.run(
        agent._prepare_history(
            [{"role": "user", "content": "Tell me what you remember."}],
            research=False,
            recall=True,
            attachment_context="",
            web_enabled=False,
            memory_enabled=True,
            filesystem_enabled=False,
            project_id="garden-id",
        )
    )
    assert recalled_projects == ["garden-id"]


def test_streaming_memory_tool_receives_project_and_source_conversation(monkeypatch):
    conversation_id = "660a15e9-8cb2-46d0-b75e-36b6eaa08601"
    captured = {}
    model_calls = 0

    async def fake_deltas(_client, _url, payload):
        nonlocal model_calls
        model_calls += 1
        if payload.get("tools"):
            yield {
                "tool_calls": [
                    {
                        "index": 0,
                        "id": "call_save",
                        "function": {
                            "name": "save_memory",
                            "arguments": json_lib.dumps(
                                {
                                    "key": "preferred format",
                                    "value": "Plain text",
                                    "scope": "project",
                                }
                            ),
                        },
                    }
                ]
            }
        else:
            yield {"content": "Saved."}

    async def fake_execute(name, arguments):
        captured["name"] = name
        captured.update(arguments)
        return "Saved."

    monkeypatch.setattr(agent, "_stream_model_deltas", fake_deltas)
    monkeypatch.setattr(agent.registry, "execute", fake_execute)

    async def collect_events():
        return [
            event
            async for event in agent.stream_agent_loop(
                [{"role": "user", "content": "Hello."}],
                max_steps=1,
                memory_enabled=True,
                filesystem_enabled=False,
                web_enabled=False,
                project_id="garden-id",
                conversation_id=conversation_id,
            )
        ]

    events = asyncio.run(collect_events())
    assert model_calls == 2
    assert captured == {
        "name": "save_memory",
        "key": "preferred format",
        "value": "Plain text",
        "project_id": "garden-id",
        "source_conversation_id": conversation_id,
    }
    assert events[-1] == {
        "type": "done",
        "message": {"role": "assistant", "content": "Saved."},
    }


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


def test_stream_decoder_reads_model_tokens():
    body = (
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'
        'data: {"choices":[{"delta":{"content":"Atlas"}}]}\n\n'
        "data: [DONE]\n\n"
    ).encode()

    async def collect():
        transport = httpx.MockTransport(
            lambda _request: httpx.Response(200, content=body)
        )
        async with httpx.AsyncClient(transport=transport) as client:
            return [
                delta
                async for delta in agent._stream_model_deltas(
                    client, "http://ollama.test", {"stream": True}
                )
            ]

    assert asyncio.run(collect()) == [{"content": "Hello "}, {"content": "Atlas"}]


def test_stream_agent_emits_tool_activity_and_final_answer(monkeypatch):
    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

    rounds = []

    async def fake_deltas(_client, _url, payload):
        rounds.append(payload)
        if len(rounds) == 1:
            yield {
                "tool_calls": [
                    {
                        "index": 0,
                        "id": "call-1",
                        "function": {
                            "name": "read_file",
                            "arguments": json_lib.dumps({"path": "note.txt"}),
                        },
                    }
                ]
            }
        else:
            yield {"content": "Here is the note."}

    async def fake_execute(_name, _arguments):
        return "Note content"

    monkeypatch.setattr(agent.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(agent, "_stream_model_deltas", fake_deltas)
    monkeypatch.setattr(agent.registry, "execute", fake_execute)

    async def collect():
        return [
            event
            async for event in agent.stream_agent_loop(
                [{"role": "user", "content": "Read the note"}], max_steps=1
            )
        ]

    events = asyncio.run(collect())
    assert [event["type"] for event in events] == ["tool", "tool", "token", "done"]
    assert events[-1]["message"]["content"] == "Here is the note."
    assert "tools" not in rounds[-1]


def test_stream_rejects_malformed_tool_delta():
    calls = []
    try:
        agent._merge_tool_delta(calls, {"index": 0, "function": ["bad"]})
    except agent.AgentServiceError as exc:
        assert "invalid tool call" in str(exc)
    else:
        raise AssertionError("Malformed tool delta should produce a service error")


def test_generic_find_request_does_not_trigger_web_search(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [{"message": {"role": "assistant", "content": "Found it."}}]
            }

    class FakeClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def post(self, _url, json):
            assert all(
                schema["function"]["name"] != "search_web"
                for schema in json.get("tools", [])
            )
            return Response()

    monkeypatch.setattr(agent.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(agent, "search_web", lambda **_kwargs: 1 / 0)
    result = asyncio.run(
        agent.run_agent_loop(
            [{"role": "user", "content": "Find the bug in this code"}],
        )
    )
    assert result["content"] == "Found it."
