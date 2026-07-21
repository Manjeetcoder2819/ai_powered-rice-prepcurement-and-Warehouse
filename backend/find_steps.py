import json

log_path = r"C:\Users\Manjeet Gupta\.gemini\antigravity\brain\584ef55f-f422-42fe-abef-183f080edc4d\.system_generated\logs\transcript_full.jsonl"

steps_found = []
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get("step_index")
            tool_calls = data.get("tool_calls", [])
            for call in tool_calls:
                name = call.get("name")
                args = call.get("args", {})
                if "QueuePage.js" in str(args) and name in ["replace_file_content", "multi_replace_file_content", "write_to_file"]:
                    desc = args.get("Description") or args.get("description") or ""
                    steps_found.append((step, name, desc))
        except Exception as e:
            pass

for step, name, desc in steps_found:
    print(f"Step {step}: tool={name}, description={desc}")
