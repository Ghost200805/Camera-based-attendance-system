from fastapi import FastAPI

app = FastAPI(title="Campus CCTV Smart Attendance API")

@app.get("/")
def read_root():
    return {"status": "online", "module": "Attendance Backend Initialized"}