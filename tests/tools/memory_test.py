from backend.tools.memory import save_memory, recall_memory


def test_save_memory():
    """Test memory saving functionality"""
    result = save_memory("user_preference", "dark_mode", "ui")
    assert "Successfully saved memory" in result


def test_recall_memory():
    """Test memory retrieval functionality"""
    result = save_memory("user_preference", "dark_mode", "ui")
    retrieved = recall_memory("dark")
    assert len(retrieved) >= 1
    assert "dark_mode" in retrieved[0]["value"]
    assert "Successfully saved memory" in result


def test_memory_search():
    """Test memory search functionality"""
    result = save_memory("user_preference", "dark_mode", "ui")
    results = recall_memory("preference")
    assert len(results) >= 1
    assert "dark_mode" in results[0]["value"]
    assert "Successfully saved memory" in result
