from fastapi import FastAPI
import uvicorn

app = FastAPI(
    title="Nook",
    description="Local LLM Personal Assistant",
    version="0.1.0"
)

@app.post("/chat")
async def chat_endpoint(request: dict):
    """Main endpoint for chat interactions"""
    return {
        "status": "success",
        "message": "Chat endpoint is ready"
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
