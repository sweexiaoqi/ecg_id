import os
import sys
import uvicorn
import webbrowser
import threading
import time

def open_browser():
    # Wait for the server to start
    time.sleep(1.5)
    url = "http://127.0.0.1:8000"
    print(f"\n[*] Launching browser at: {url}\n")
    webbrowser.open(url)

if __name__ == "__main__":
    # Create required empty __init__.py files if they are missing
    backend_dir = os.path.join(os.path.dirname(__file__), "backend")
    init_py = os.path.join(backend_dir, "__init__.py")
    if not os.path.exists(init_py):
        with open(init_py, "w") as f:
            pass
            
    # Start the browser open thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run the Uvicorn server
    print("[*] Starting ECG ID FastAPI Server...")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
