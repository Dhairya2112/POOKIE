# SETU: The Cross-Device Barrier Solver

This document captures the core vision for evolving SETU into the ultimate local-network bridge, designed to seamlessly dissolve the friction between mobile devices (iOS/Android) and desktop environments (Windows/Linux/Mac).

## Core Philosophy
SETU will transition from a standard voice assistant into an invisible, frictionless hub that merges your phone and your computer into a single, cohesive workspace. It operates entirely over the local network (Wi-Fi), ensuring zero latency, maximum privacy, and no reliance on third-party cloud servers.

## Key Planned Features

### 1. The Instant QR Handshake (Zero Friction)
* **Concept:** No accounts, no passwords, no cloud pairing. 
* **Mechanism:** The SETU desktop interface displays a dynamic QR code. Scanning it with a mobile device instantly establishes a secure WebSocket/WebRTC tunnel directly over the local network. 
* **Benefit:** Instant pairing that just works, completely bypassing ecosystem walls (like Apple AirDrop limitations).

### 2. Universal Teleport Clipboard
* **Concept:** A shared memory space between your phone and PC.
* **Mechanism:** SETU silently monitors the clipboard on both ends. Copying a block of code, a password, or a photo on your phone allows you to instantly press `Ctrl + V` on your computer to paste it. 
* **Benefit:** Eliminates the need to email yourself links or use bloated messaging apps just to transfer text.

### 3. Frictionless File "Throwing"
* **Concept:** Hyper-fast, local file transfer with a fluid UX.
* **Mechanism:** A desktop UI where you can drag a file (PDF, image, executable) and "throw" it toward the edge of your screen. The file is instantly transmitted via WebSocket and appears on your phone's screen, ready to save.
* **Benefit:** Bypasses Google Drive, Dropbox, and cable connections for rapid file sharing.

### 4. Sensor Passthrough (The Ultimate Peripherals)
* **Concept:** Utilizing the superior hardware of modern smartphones as PC inputs.
* **Mechanism:** SETU routes your phone's microphone, camera, or gyroscope directly into your PC using real-time UDP/WebSocket streaming. 
* **Benefit:** Walk around the room using your phone as a high-quality wireless microphone for the desktop SETU agent, or use it as a wireless webcam.

### 5. Cross-Device Execution Engine
* **Concept:** The phone acts as a macro-pad and remote control for the PC.
* **Mechanism:** The SETU mobile web interface provides actionable buttons to execute commands on the desktop.
* **Benefit:** Tap a button on your phone to lock your PC, adjust system volume, control media playback, or trigger heavy terminal scripts remotely. 

---
*Note: These ideas are saved for future discussion and implementation planning.*
