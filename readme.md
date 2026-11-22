# Campus CCTV Smart Attendance System

A role-based campus attendance and person-location tracking web application built with **FastAPI**, **MongoDB** (with `mongomock` in-memory support for testing), **OpenCV**, **InsightFace** (RetinaFace face detection + ArcFace 512-d face embeddings), **APScheduler**, and an optional **Google Gemini** multimodal arbiter for borderline matches. It supports **RTSP camera streams**—including mobile phones running an RTSP camera app for testing—as well as local webcams and video files.

> **Development Status:** This project is currently in an active development and incremental upload phase—modules and workflows are being added and refined progressively as evaluation and testing continue.

---

## Key Features

* **Role-Based Access & Portals:** Supports `admin`, `staff`, and `student` accounts with JWT authentication and password updates:
  * **Admin:** Overview dashboard, attendance logs & CSV export, student/staff enrollment, review queue resolution, person location lookup, timetable & camera management, and AI/account settings.
  * **Staff:** Staff overview, student attendance viewing and manual status updates (`Present` / `Absent`), and personal attendance history.
  * **Student:** Personal attendance percentage, status summary (`Present`, `Absent`, `Review`), and attendance history.
* **Biometric Face Enrollment & Duplicate Protection:** Enrols students and staff with a clear ID photo to extract and store a 512-d normalized face embedding (source enrollment photos are not stored). Checks face size, detection confidence, and single-person framing, and blocks duplicate IDs or similar already-enrolled faces (`409 Conflict`) unless **"Enrol anyway"** (`force=true`) is explicitly enabled.
* **RTSP, Mobile Phone Camera & Video Stream Handling:** Uses a reference-counted background `StreamManager` (`CameraStream`) that reads RTSP URLs over TCP, webcam indices (e.g., `0`), or video files while retaining only the latest frame so slow AI inference does not create frame lag. For testing, a mobile phone running an RTSP camera app on the same network can be connected via its RTSP URL.
* **Automated Timetable Scheduler & Manual Sessions:** APScheduler checks the timetable every `5` seconds in the configured timezone (`Asia/Kolkata` by default) to start sessions automatically during class windows, while admins can also start sessions manually via **Start Now** with a custom duration (`1–240` minutes).
* **Quality Filtering, Temporal Voting & Borderline Review:** Filters blurry frames/faces, minimum face pixel dimensions, and low detection scores. Matches above `match_threshold` accumulate temporal votes across frames within `voting_window_seconds` until reaching `voting_frames` to mark the person **Present**. Matches in the borderline band (`review_threshold` to `match_threshold`) can be evaluated by Gemini (when configured and enabled) or routed to the manual **Review Queue** with automatic fallback to manual review if Gemini is unset or unavailable.
* **Session Completion & Absent Marking:** When a session finishes or is stopped, any enrolled person still unmarked is automatically recorded as **Absent** (`mark_absent_if_missing`).
* **Last-Seen Location Lookup & CSV Export:** Updates last-seen camera locations during recognition and lets admins search people by name or ID, filter attendance records, override statuses manually, and download CSV exports.

---

## How It Works

1. **Enrollment & Embedding Matching:** Admins enrol users with a photo (or via `scripts/enroll_folder.py` using `<ID>__<Full Name>.jpg` filenames). InsightFace extracts a 512-d normalized vector stored in `Users`, and `Matcher` loads normalized embeddings into memory for fast cosine similarity scoring.
2. **Stream Acquisition:** When a class session or hallway tracker starts, `StreamManager.acquire()` starts or reuses a `CameraStream` thread for that camera source (RTSP URL, webcam index, or video file) and keeps the most recent frame ready.
3. **Frame Analysis & Quality Gate:** At each sampling tick (`sample_interval_seconds`), `analyze_frame()` checks frame sharpness (`frame_blur_threshold`), extracts faces via RetinaFace + ArcFace, filters by `min_det_score`, `min_face_px`, and face sharpness (`face_blur_threshold`), and computes cosine similarity against enrolled embeddings.
4. **Attendance & Review Decisions:**
   * **High-confidence match (`>= match_threshold`):** Updates the person's last-seen location; if enrolled in the active class, adds a timestamped vote and marks **Present** once `voting_frames` are collected inside `voting_window_seconds`.
   * **Borderline match (`review_threshold` to `match_threshold`):** Respects `review_cooldown_seconds` per camera/candidate, optionally calls Gemini with scene and face crops, and either applies an approved/rejected verdict or places the item in `Review_Queue` (and marks attendance as `Review`) for admin resolution.
5. **Wrap-Up & Reporting:** When the session timer expires or an admin clicks **Stop**, remaining unmarked enrolled users are marked **Absent**, the session record is updated (`completed` or `stopped`), and records are visible in the UI or downloadable as CSV.

---

## Setup & Installation

1. **Clone or extract the repository** and open a terminal inside the `attendance-system` folder.

2. **Create and activate a virtual environment:**
   * **Windows (PowerShell):**
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   * **macOS / Linux:**
     ```bash
     python -m venv venv
     source venv/bin/activate
     ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
