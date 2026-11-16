import os
import sys
import time
import cv2

# Force TCP transport for RTSP streams to prevent UDP packet loss/tearing
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"


def test_camera_stream(source=0):
    """
    Opens a webcam (0) or CCTV RTSP stream URL, configures a 1-frame buffer
    to eliminate lag, and displays live FPS + resolution diagnostics.
    """
    print(f"[INFO] Connecting to video source: {source}")
    cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG) if isinstance(source, str) else cv2.VideoCapture(source)

    # Keep only the latest frame in the buffer to prevent stream lag
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    if not cap.isOpened():
        print("[ERROR] Could not open video stream. Check camera index or RTSP URL.")
        sys.exit(1)

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[INFO] Stream active ({width}x{height}). Press 'q' to exit.")

    prev_time = time.time()

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[WARN] Failed to grab frame. Stream disconnected or ended.")
            break

        # Calculate real-time FPS
        curr_time = time.time()
        fps = 1.0 / (curr_time - prev_time) if (curr_time - prev_time) > 0 else 0.0
        prev_time = curr_time

        # Overlay diagnostic telemetry on the feed
        cv2.putText(
            frame,
            f"Resolution: {width}x{height} | FPS: {fps:.1f}",
            (15, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2,
        )

        cv2.imshow("Campus CCTV - Stream Capture Test", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            print("[INFO] Closing stream gracefully...")
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    # Default 0 uses laptop webcam; replace with "rtsp://user:pass@ip:554/stream" for CCTV
    test_camera_stream(0)