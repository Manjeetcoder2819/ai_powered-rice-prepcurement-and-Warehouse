import os

def get_dir_size(path, exclude_folder=None):
    total = 0
    for root, dirs, files in os.walk(path):
        if exclude_folder and exclude_folder in root:
            continue
        for f in files:
            fp = os.path.join(root, f)
            try:
                total += os.path.getsize(fp)
            except Exception:
                pass
    return round(total / (1024 * 1024), 2)

backend_path = "C:\\Users\\Manjeet Gupta\\AI_powered\\backend"
total_size = get_dir_size(backend_path)
source_size = get_dir_size(backend_path, exclude_folder="venv")

print(f"TOTAL_SIZE:{total_size}")
print(f"SOURCE_SIZE:{source_size}")
