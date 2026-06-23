import os
from huggingface_hub import HfApi

import re

print("Starting Hugging Face upload script...")
api = HfApi()

repo_id = "epic98/truecrime-video-generator"
print(f"Uploading folder to Space: {repo_id}")

# Parse HF token from tokens.txt or environment variable
hf_token = os.environ.get("HF_TOKEN")
if not hf_token and os.path.exists("tokens.txt"):
    try:
        with open("tokens.txt", "r") as f:
            content = f.read()
            match = re.search(r"Hugging Face Token:\s*([^\n\r]+)", content)
            if match:
                hf_token = match.group(1).strip()
    except Exception as e:
        print(f"Could not read tokens.txt: {e}")

if not hf_token:
    print("Error: Hugging Face Token not found in environment or tokens.txt")
    exit(1)

try:
    api.upload_folder(
        folder_path=".",
        repo_id=repo_id,
        repo_type="space",
        token=hf_token,
        ignore_patterns=[
            "node_modules*",
            "temp_*",
            ".git*",
            "package-lock.json",
            "upload.py",
            "tokens.txt"
        ]
    )
    print("Upload completed successfully!")
except Exception as e:
    print(f"Upload failed: {e}")
