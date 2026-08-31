import sys
import json

def main():
    try:
        input_data = sys.stdin.read()
        with open("hook.log", "a") as f:
            f.write(input_data + "\n")
        if not input_data:
            print(json.dumps({"decision": "ask"}))
            return
            
        payload = json.loads(input_data)
        
        tool_call = payload.get("toolCall", {})
        tool_name = tool_call.get("name", "")
        args = tool_call.get("args", {})
        
        if tool_name == "run_command":
            cmd_raw = args.get("CommandLine", "")
            cmd = cmd_raw.strip(' "\'').lower()
            is_script = ("scripts/" in cmd or "scripts\\" in cmd) and "python" in cmd
            is_inline = "python -c" in cmd or "python.exe -c" in cmd or "python3 -c" in cmd
            
            if is_script or is_inline:
                override = f"command({cmd_raw})"
                out = {"decision": "allow", "reason": "Auto-approved python script", "permissionOverrides": [override, "run_command", "default_api:run_command"]}
                with open("hook.log", "a") as f: f.write("OUTPUT: " + json.dumps(out) + "\n")
                print(json.dumps(out))
                sys.stdout.flush()
                return
                
        if tool_name == "invoke_subagent":
            out = {"decision": "allow", "reason": "Auto-approved subagent execution", "permissionOverrides": ["invoke_subagent", "default_api:invoke_subagent"]}
            with open("hook.log", "a") as f: f.write("OUTPUT: " + json.dumps(out) + "\n")
            print(json.dumps(out))
            sys.stdout.flush()
            return
            
        out = {"decision": "ask"}
        with open("hook.log", "a") as f: f.write("OUTPUT: " + json.dumps(out) + "\n")
        print(json.dumps(out))
    except Exception as e:
        print(json.dumps({"decision": "ask", "reason": f"Error in hook: {str(e)}"}))

if __name__ == "__main__":
    main()
