import json
import sys

def patch_notebook(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        nb = json.load(f)
        
    for cell in nb['cells']:
        if cell['cell_type'] == 'code':
            source = "".join(cell['source'])
            
            # 1. Add USE_Z_IMAGE to USER CONFIGURATION if not present
            if "USER CONFIGURATION" in source and "USE_Z_IMAGE" not in source:
                new_lines = []
                for line in cell['source']:
                    new_lines.append(line)
                    if 'CSV_DATA_URL   =' in line:
                        new_lines.append('USE_Z_IMAGE    = False\n')
                        new_lines.append('Z_IMAGE_KEY    = ""\n')
                cell['source'] = new_lines
                source = "".join(cell['source'])

            # 2. Add run_phase_1_z_image() definition if not present
            if "def run_phase_1_flux():" in source and "def run_phase_1_z_image():" not in source:
                z_image_code = """
# ============================================================
# PHASE 1B — Z Image API (kie.ai)
# ============================================================
def run_phase_1_z_image():
    import requests, time, urllib.request
    print("\\n" + "="*60)
    print("PHASE 1: Image Generation (Z Image API)")
    print("="*60)
    
    if not Z_IMAGE_KEY:
        raise ValueError("Z_IMAGE_KEY is missing but USE_Z_IMAGE is True.")

    headers = {
        "Authorization": f"Bearer {Z_IMAGE_KEY}",
        "Content-Type": "application/json"
    }
    
    serials = [str(r["Serial number"]) for _, r in df.iterrows()]
    if all_outputs_exist(IMAGES_DIR, serials, ".png"):
        print("--> All images already on disk. Skipping Z Image generation.")
        return

    for idx, row in tqdm(df.iterrows(), total=len(df), desc="Rendering via Z Image"):
        sn = str(row["Serial number"])
        img_path = os.path.join(IMAGES_DIR, f"{sn}.png")
        if os.path.exists(img_path):
            continue

        prompt = str(row["image prompt"])
        
        # 1. Create task
        create_payload = {
            "model": "z-image",
            "input": {
                "prompt": prompt,
                "aspect_ratio": ASPECT_RATIO,
                "nsfw_checker": False
            }
        }
        
        # Adding simple retry loop for API rate limits / generic errors
        max_retries = 3
        task_id = None
        for attempt in range(max_retries):
            try:
                resp = requests.post("https://api.kie.ai/api/v1/jobs/createTask", json=create_payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if data.get("code") == 200:
                    task_id = data.get("data", {}).get("taskId")
                    break
                else:
                    print(f"  [WARN] Attempt {attempt+1}: API Error: {data}")
            except Exception as e:
                print(f"  [WARN] Attempt {attempt+1}: Request failed: {e}")
            time.sleep(3)
            
        if not task_id:
            print(f"  [ERROR] Failed to create task for {sn}. Skipping.")
            continue
            
        # 2. Poll status
        success = False
        for _ in range(60): # Max 5 mins (60 * 5s)
            time.sleep(5)
            try:
                poll_resp = requests.get(f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={task_id}", headers=headers)
                poll_data = poll_resp.json()
                if poll_data.get("code") == 200:
                    state = poll_data.get("data", {}).get("state")
                    if state == "success":
                        res_json = json.loads(poll_data.get("data", {}).get("resultJson", "{}"))
                        urls = res_json.get("resultUrls", [])
                        if urls:
                            urllib.request.urlretrieve(urls[0], img_path)
                            print(f"  Saved {sn}.png")
                            success = True
                        break
                    elif state == "fail":
                        print(f"  [ERROR] Task failed for {sn}: {poll_data.get('data', {}).get('failMsg')}")
                        break
            except Exception as e:
                pass
                
        if not success:
            print(f"  [ERROR] Could not fetch image for {sn}.")

    # Zip output
    zip_path = os.path.join(OUTPUTS_DIR if 'OUTPUTS_DIR' in globals() else OUTPUT_DIR, "source_images.zip")
    with zipfile.ZipFile(zip_path, "w") as z:
        for f in os.listdir(IMAGES_DIR):
            z.write(os.path.join(IMAGES_DIR, f), arcname=f)
    print("--> Phase 1 Z Image complete.")

"""
                # Split into lines keeping \n
                z_lines = [line + '\n' for line in z_image_code.split('\n')][:-1]
                
                # Insert before "def run_phase_1_flux():"
                new_lines = []
                for line in cell['source']:
                    if 'def run_phase_1_flux():' in line:
                        new_lines.extend(z_lines)
                    new_lines.append(line)
                cell['source'] = new_lines
                source = "".join(cell['source'])

            # 3. Replace the execution call
            if "run_phase_1_flux()" in source and "if USE_Z_IMAGE:" not in source:
                new_lines = []
                for line in cell['source']:
                    if 'run_phase_1_flux()' in line and not line.strip().startswith('def '):
                        new_lines.append('if USE_Z_IMAGE:\n')
                        new_lines.append('    run_phase_1_z_image()\n')
                        new_lines.append('else:\n')
                        new_lines.append('    run_phase_1_flux()\n')
                    else:
                        new_lines.append(line)
                cell['source'] = new_lines

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(nb, f, indent=2)

if __name__ == "__main__":
    patch_notebook("kokoro-tts-automation.ipynb")
    print("Notebook patched successfully.")
