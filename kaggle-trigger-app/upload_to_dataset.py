import os
import sys
from huggingface_hub import HfApi
import re

def main():
    if len(sys.argv) < 3:
        print("Usage: python upload_to_dataset.py <file_path> <repo_id> [hf_token]")
        sys.exit(1)

    file_path = sys.argv[1]
    repo_id = sys.argv[2]
    
    hf_token = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("HF_TOKEN")
    
    if not hf_token and os.path.exists("tokens.txt"):
        try:
            with open("tokens.txt", "r") as f:
                content = f.read()
                match = re.search(r"Hugging Face Token:\s*([^\n\r]+)", content)
                if match:
                    hf_token = match.group(1).strip()
        except Exception:
            pass

    if not hf_token:
        print("Error: HF_TOKEN not provided")
        sys.exit(1)

    api = HfApi(token=hf_token)
    
    # Ensure dataset exists
    try:
        api.create_repo(repo_id=repo_id, repo_type="dataset", exist_ok=True)
    except Exception as e:
        print(f"Failed to create/check repo: {e}")
        # Proceed anyway, might exist

    filename = os.path.basename(file_path)
    
    try:
        api.upload_file(
            path_or_fileobj=file_path,
            path_in_repo=filename,
            repo_id=repo_id,
            repo_type="dataset"
        )
        download_url = f"https://huggingface.co/datasets/{repo_id}/resolve/main/{filename}"
        print(f"URL: {download_url}")
    except Exception as e:
        print(f"Upload failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
