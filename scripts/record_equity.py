#!/usr/bin/env python3
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(os.path.join(ROOT, "scripts"))
import nyse

def main():
    log_path = os.path.join(ROOT, "data", "private", "advice-log.json")
    hist_path = os.path.join(ROOT, "data", "private", "equity-history.json")
    
    if not os.path.exists(log_path):
        return

    try:
        with open(log_path) as f:
            data = json.load(f)
    except json.JSONDecodeError:
        return
    
    realized = 0.0
    open_pl = 0.0
    
    for e in data.get("entries", []):
        for lot in e.get("lots", []):
            closed = lot.get("soldAt") is not None
            exit_price = lot.get("soldAt") if closed else lot.get("lastPrice", 0)
            open_price = lot.get("openRate", 0)
            units = lot.get("units", 0)
            
            if open_price == 0:
                continue
                
            pl_dollar = (exit_price - open_price) * units
            if closed:
                realized += pl_dollar
            else:
                open_pl += pl_dollar
                
    total = realized + open_pl
    
    now = nyse.nyse_now().isoformat("T", "minutes")
    snapshot = {
        "timestamp": now,
        "realized": round(realized, 2),
        "open": round(open_pl, 2),
        "total": round(total, 2)
    }
    
    history = []
    if os.path.exists(hist_path):
        with open(hist_path) as f:
            try:
                history = json.load(f)
            except json.JSONDecodeError:
                pass
    
    if history and history[-1]["timestamp"] == now:
        return

    history.append(snapshot)
    
    with open(hist_path, "w") as f:
        json.dump(history, f)

if __name__ == "__main__":
    main()
