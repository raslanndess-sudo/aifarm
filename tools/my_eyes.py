#!/usr/bin/env python3
"""
My Eyes - Screen capture and control system for OpenClaw agent
Usage: python my_eyes.py [screen|click x y|type text|move x y]
"""
import sys
import time
import json
from pathlib import Path

def capture_screen(filename="current_screen.png"):
    """Capture full screen and save"""
    try:
        import mss
        import mss.tools
        
        with mss.mss() as sct:
            # Capture full screen
            monitor = sct.monitors[1]  # Primary monitor
            screenshot = sct.grab(monitor)
            
            # Save
            output_path = Path(filename)
            mss.tools.to_png(screenshot.rgb, screenshot.size, output=output_path)
            return str(output_path.absolute())
    except Exception as e:
        # Fallback to PIL
        from PIL import ImageGrab
        screenshot = ImageGrab.grab()
        screenshot.save(filename)
        return filename

def click(x, y):
    """Click at coordinates"""
    import pyautogui
    pyautogui.click(x, y)
    return f"Clicked at {x}, {y}"

def move(x, y):
    """Move mouse to coordinates"""
    import pyautogui
    pyautogui.moveTo(x, y)
    return f"Moved to {x}, {y}"

def type_text(text):
    """Type text"""
    import pyautogui
    pyautogui.typewrite(text, interval=0.01)
    return f"Typed: {text}"

def get_mouse_pos():
    """Get current mouse position"""
    import pyautogui
    x, y = pyautogui.position()
    return {"x": x, "y": y}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command specified"}))
        return
    
    command = sys.argv[1]
    
    if command == "screen":
        filename = sys.argv[2] if len(sys.argv) > 2 else "screen_capture.png"
        path = capture_screen(filename)
        print(json.dumps({"status": "ok", "file": path}))
        
    elif command == "click" and len(sys.argv) >= 4:
        x, y = int(sys.argv[2]), int(sys.argv[3])
        result = click(x, y)
        print(json.dumps({"status": "ok", "result": result}))
        
    elif command == "move" and len(sys.argv) >= 4:
        x, y = int(sys.argv[2]), int(sys.argv[3])
        result = move(x, y)
        print(json.dumps({"status": "ok", "result": result}))
        
    elif command == "type" and len(sys.argv) >= 3:
        text = " ".join(sys.argv[2:])
        result = type_text(text)
        print(json.dumps({"status": "ok", "result": result}))
        
    elif command == "mouse":
        pos = get_mouse_pos()
        print(json.dumps({"status": "ok", "position": pos}))
        
    else:
        print(json.dumps({"error": "Unknown command"}))

if __name__ == "__main__":
    main()
