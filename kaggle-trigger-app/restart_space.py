import os
import re
from huggingface_hub import HfApi

print("Starting Hugging Face Space Reboot script...")
api = HfApi()

repo_id = "epic98/truecrime-video-generator"
print(f"Target Space: {repo_id}")

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
    print("Sending factory reboot command to HuggingFace...")
    # restart_space with factory_reboot=True forces the container to drop its cache
    # and rebuild from the latest git commit
    api.restart_space(
        repo_id=repo_id,
        token=hf_token,
        factory_reboot=True
    )
    print("Reboot initiated successfully!")
    print("The space will now pull the latest files and rebuild the Docker container.")
except Exception as e:
    print(f"Failed to initiate reboot: {e}")
