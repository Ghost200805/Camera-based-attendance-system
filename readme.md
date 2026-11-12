# Campus CCTV Smart Attendance - Vision Module (Phase 1)

This repository holds the initial computer vision testing module for our Capstone project. It verifies camera stream access (Webcam/RTSP) and validates frame extraction before integrating with the heavy AI recognition models.

## Current Objective
- Establish a video capture pipeline using OpenCV.
- Extract frames consistently without memory leaks.
- Setup the foundation for the background threading stream manager.

## Setup Instructions
1. Clone the repository.
2. Create a virtual environment: `python -m venv venv`
3. Activate the environment (Windows: `venv\Scripts\activate` | Mac/Linux: `source venv/bin/activate`)
4. Install dependencies: `pip install -r requirements.txt`

## Running the Test
```bash
python src/camera_test.py