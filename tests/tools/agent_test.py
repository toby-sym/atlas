import asyncio
from backend.agent import ToolRegistry


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
