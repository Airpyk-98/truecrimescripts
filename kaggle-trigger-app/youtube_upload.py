import sys
import json
import requests
import os
import uuid

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"success": False, "error": "Missing arguments"}))
        sys.exit(1)

    video_url = sys.argv[1]
    title = sys.argv[2]
    token = sys.argv[3]
    
    # Generate unique temp filename to avoid collision on bulk uploads
    temp_file = f"temp_yt_{uuid.uuid4().hex}.mp4"

    try:
        # 1. Download video
        r = requests.get(video_url, stream=True)
        r.raise_for_status()
        with open(temp_file, 'wb') as f:
            for chunk in r.iter_content(chunk_size=1024*1024):
                if chunk: f.write(chunk)

        file_size = os.path.getsize(temp_file)

        # 2. Start Resumable Session
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Upload-Content-Length": str(file_size),
            "X-Upload-Content-Type": "video/mp4",
            "Content-Type": "application/json"
        }
        body = {
            "snippet": {
                "title": title,
                "description": "Generated via Epic Youtube Uploader",
                "tags": ["shorts", "ai", "video"],
                "categoryId": "24" # Entertainment
            },
            "status": {
                "privacyStatus": "private", # Keeps it safe by default
                "selfDeclaredMadeForKids": False
            }
        }
        
        init_resp = requests.post(
            "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
            headers=headers, json=body
        )
        
        if init_resp.status_code != 200:
            print(json.dumps({"success": False, "error": f"Init failed: {init_resp.text}"}))
            sys.exit(1)

        upload_url = init_resp.headers.get("Location")
        if not upload_url:
            print(json.dumps({"success": False, "error": "No Location header in init response"}))
            sys.exit(1)

        # 3. Upload File Chunks (or full file)
        # requests will stream the file if passed a file object
        with open(temp_file, "rb") as f:
            upload_resp = requests.put(upload_url, data=f, headers={"Content-Type": "video/mp4"})

        if upload_resp.status_code in [200, 201]:
            video_id = upload_resp.json().get("id")
            print(json.dumps({"success": True, "videoId": video_id}))
        else:
            print(json.dumps({"success": False, "error": f"Upload failed: {upload_resp.text}"}))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
    finally:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except:
                pass

if __name__ == "__main__":
    main()
