# Campus CCTV Smart Attendance System

A role-based campus attendance and person-location tracking web application built with **FastAPI**, **MongoDB** (with `mongomock` in-memory support for testing), **OpenCV**, **InsightFace** (RetinaFace face detection + ArcFace 512-d face embeddings), **APScheduler**, and an optional **Google Gemini** multimodal arbiter for borderline matches[cite: 3, 10, 13, 19, 25]. It supports **RTSP camera streams**—including mobile phones running an RTSP camera app for testing—as well as local webcams and video files[cite: 22].

> **Development Status:** This project is currently in an active development and incremental upload phase—modules and workflows are being added and refined progressively as evaluation and testing continue[cite: 8, 12, 20].

---

## Key Features

* **Role-Based Access & Portals:** Supports `admin`, `staff`, and `student` accounts with JWT authentication and password updates[cite: 8, 12, 31]:
  * **Admin:** Overview dashboard, attendance logs & CSV export, student/staff enrollment, review queue resolution, person location lookup, timetable & camera management, and AI/account settings[cite: 8, 12, 28, 30, 34].
  * **Staff:** Staff overview, student attendance viewing and manual status updates (`Present` / `Absent`), and personal attendance history[cite: 8, 12, 29, 30].
  * **Student:** Personal attendance percentage, status summary (`Present`, `Absent`, `Review`), and attendance history.
* **Biometric Face Enrollment & Duplicate Protection:** Enrols students and staff with a clear ID photo to extract and store a 512-d normalized face embedding (source enrollment photos are not stored)[cite: 25, 26]. Checks face size, detection confidence, and single-person framing, and blocks duplicate IDs or similar already-enrolled faces (`409 Conflict`) unless **"Enrol anyway"** (`force=true`) is explicitly enabled[cite: 8, 26].
* **RTSP, Mobile Phone Camera & Video Stream Handling:** Uses a reference-counted background `StreamManager` (`CameraStream`) that reads RTSP URLs over TCP, webcam indices (e.g., `0`), or video files while retaining only the latest frame so slow AI inference does not create frame lag[cite: 22]. For testing, a mobile phone running an RTSP camera app on the same network can be connected via its RTSP URL[cite: 22].
* **Automated Timetable Scheduler & Manual Sessions:** APScheduler checks the timetable every `5` seconds in the configured timezone (`Asia/Kolkata` by default) to start sessions automatically during class windows, while admins can also start sessions manually via **Start Now** with a custom duration (`1–240` minutes)[cite: 11, 15, 20, 72].
* **Quality Filtering, Temporal Voting & Borderline Review:** Filters blurry frames/faces, minimum face pixel dimensions, and low detection scores[cite: 15, 18, 23]. Matches above `match_threshold` accumulate temporal votes across frames within `voting_window_seconds` until reaching `voting_frames` to mark the person **Present**[cite: 15, 16, 18]. Matches in the borderline band (`review_threshold` to `match_threshold`) can be evaluated by Gemini (when configured and enabled) or routed to the manual **Review Queue** with automatic fallback to manual review if Gemini is unset or unavailable[cite: 15, 17, 18, 19].
* **Session Completion & Absent Marking:** When a session finishes or is stopped, any enrolled person still unmarked is automatically recorded as **Absent** (`mark_absent_if_missing`)[cite: 16, 17].
* **Last-Seen Location Lookup & CSV Export:** Updates last-seen camera locations during recognition and lets admins search people by name or ID, filter attendance records, override statuses manually, and download CSV exports[cite: 16, 21, 30, 34].

---

## How It Works

1. **Enrollment & Embedding Matching:** Admins enrol users with a photo (or via `scripts/enroll_folder.py` using `<ID>__<Full Name>.jpg` filenames)[cite: 6, 26]. InsightFace extracts a 512-d normalized vector stored in `Users`, and `Matcher` loads normalized embeddings into memory for fast cosine similarity scoring[cite: 24, 25, 26].
2. **Stream Acquisition:** When a class session or hallway tracker starts, `StreamManager.acquire()` starts or reuses a `CameraStream` thread for that camera source (RTSP URL, webcam index, or video file) and keeps the most recent frame ready[cite: 16, 21, 22].
3. **Frame Analysis & Quality Gate:** At each sampling tick (`sample_interval_seconds`), `analyze_frame()` checks frame sharpness (`frame_blur_threshold`), extracts faces via RetinaFace + ArcFace, filters by `min_det_score`, `min_face_px`, and face sharpness (`face_blur_threshold`), and computes cosine similarity against enrolled embeddings[cite: 15, 18, 23].
4. **Attendance & Review Decisions:**
   * **High-confidence match (`>= match_threshold`):** Updates the person's last-seen location; if enrolled in the active class, adds a timestamped vote and marks **Present** once `voting_frames` are collected inside `voting_window_seconds`[cite: 15, 16, 18].
   * **Borderline match (`review_threshold` to `match_threshold`):** Respects `review_cooldown_seconds` per camera/candidate, optionally calls Gemini with scene and face crops, and either applies an approved/rejected verdict or places the item in `Review_Queue` (and marks attendance as `Review`) for admin resolution[cite: 15, 17, 18, 19, 33].
5. **Wrap-Up & Reporting:** When the session timer expires or an admin clicks **Stop**, remaining unmarked enrolled users are marked **Absent**, the session record is updated (`completed` or `stopped`), and records are visible in the UI or downloadable as CSV[cite: 8, 16, 17, 30].

---

## Setup & Installation

1. **Clone or extract the repository** and open a terminal inside the `attendance-system` folder[cite: 71].

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
