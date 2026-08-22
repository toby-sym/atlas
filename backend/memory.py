import sqlite3
from datetime import datetime


class MemoryStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self._create_table()

    def _create_table(self):
        cursor = self.conn.cursor()
        cursor.execute(
            "CREATE TABLE IF NOT EXISTS conversations ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "timestamp TEXT,"
            "input TEXT,"
            "output TEXT"
            ")"
        )
        self.conn.commit()

    def save_conversation(self, input_text: str, output_text: str):
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT INTO conversations (timestamp, input, output) VALUES (?, ?, ?)",
            (datetime.now().isoformat(), input_text, output_text),
        )
        self.conn.commit()

    def get_conversations(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM conversations")
        return cursor.fetchall()
