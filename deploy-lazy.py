#!/usr/bin/env python3
"""Deploy the lazy-loading shim for apple-home-dashboard.

Same pattern as the other card repos' deploy.py: docker cp the bundle(s),
bump ?v=N on the lovelace resource, add a .gz sibling for HA's static
server to prefer. The tiny loader (loader/apple-home-dashboard-loader.js)
becomes the public /local/community/apple-home-dashboard/apple-home-dashboard.js
resource; the real ~700KB dist/apple-home-dashboard.js (built via `npm run
build`) is deployed alongside it as apple-home-dashboard-impl.js and only
fetched when a dashboard using this strategy is actually opened.

Run `npm run build` before this script if src/ changed.
"""
import asyncio
import gzip
import json
import os
import subprocess
import sys
import tempfile

import websockets

HA_CONTAINER = "homeassistant"
REMOTE_DIR = "/config/www/community/apple-home-dashboard"
RESOURCE_PATH = f"{REMOTE_DIR}/apple-home-dashboard.js"
RESOURCE_IMPL_PATH = f"{REMOTE_DIR}/apple-home-dashboard-impl.js"
LOCAL_LOADER = os.path.join(os.path.dirname(__file__), "loader", "apple-home-dashboard-loader.js")
LOCAL_IMPL_JS = os.path.join(os.path.dirname(__file__), "dist", "apple-home-dashboard.js")


def deploy_file_with_gzip(remote_path, content):
    with tempfile.NamedTemporaryFile(suffix=".js") as f_out:
        f_out.write(content)
        f_out.flush()
        subprocess.run(["docker", "cp", f_out.name, f"{HA_CONTAINER}:{remote_path}"], check=True)
    with tempfile.NamedTemporaryFile(suffix=".js.gz") as f_gz:
        f_gz.write(gzip.compress(content, compresslevel=9))
        f_gz.flush()
        subprocess.run(["docker", "cp", f_gz.name, f"{HA_CONTAINER}:{remote_path}.gz"], check=True)
    print(f"Copied {remote_path} (+ gzip sibling), {len(content)} bytes")


async def ws_call(ws, msg_id, payload):
    payload = {**payload, "id": msg_id}
    await ws.send(json.dumps(payload))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == msg_id:
            return resp


async def main():
    token = os.environ["HASS_TOKEN"]
    host = os.environ["HASS_SERVER"].replace("http://", "").replace("https://", "")
    uri = f"ws://{host}/api/websocket"

    async with websockets.connect(uri) as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "auth", "access_token": token}))
        auth = json.loads(await ws.recv())
        if auth.get("type") != "auth_ok":
            print("Auth failed:", auth)
            sys.exit(1)

        resources = await ws_call(ws, 1, {"type": "lovelace/resources"})
        existing = next(
            (r for r in resources["result"] if r["url"].startswith(f"/local/community/apple-home-dashboard/apple-home-dashboard.js")),
            None,
        )
        version = 1
        if existing:
            try:
                version = int(existing["url"].split("v=")[-1]) + 1
            except ValueError:
                version = 1

        with open(LOCAL_LOADER, "r") as f:
            loader_src = f.read().replace("__V__", str(version))
        deploy_file_with_gzip(RESOURCE_PATH, loader_src.encode("utf-8"))

        with open(LOCAL_IMPL_JS, "rb") as f:
            impl_bytes = f.read()
        deploy_file_with_gzip(RESOURCE_IMPL_PATH, impl_bytes)

        if existing:
            resp = await ws_call(
                ws, 2,
                {
                    "type": "lovelace/resources/update",
                    "resource_id": existing["id"],
                    "res_type": "module",
                    "url": f"/local/community/apple-home-dashboard/apple-home-dashboard.js?v={version}",
                },
            )
        else:
            resp = await ws_call(
                ws, 2,
                {
                    "type": "lovelace/resources/create",
                    "res_type": "module",
                    "url": f"/local/community/apple-home-dashboard/apple-home-dashboard.js?v={version}",
                },
            )
        print("Resource:", resp["success"], f"v={version}")


if __name__ == "__main__":
    asyncio.run(main())
