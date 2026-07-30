import os
import json
import re

log_path = r"C:\Users\DELL\.gemini\antigravity\brain\22107872-a771-4fa5-88cd-ad69da580260\.system_generated\logs\transcript.jsonl"
z_key = "d392ff55...9f35 (Check your kie.ai dashboard or browser credentials tab for full key)"

if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            if "d392ff55" in line or "kie.ai" in line:
                # search for 32 character hex string
                matches = re.findall(r'[a-f0-9]{32}', line.lower())
                for m in matches:
                    if m.startswith("d392"):
                        z_key = m
                        print(f"Found full Z Image key: {z_key}")
                        break

print(f"Z Key to use: {z_key}")
