#!/usr/bin/env python3
"""Take the container down when one of the services gives up.

Supervisor keeps running even after a program has exhausted its retries: without
this listener a container whose backend cannot start would stay "up" forever,
answering nothing. Turning a FATAL program into a shutdown of supervisor makes
the container exit instead, so that `docker run --restart` and every
orchestrator above it can react.
"""

import os
import sys

from supervisor import childutils


def main() -> None:
    while True:
        headers, payload = childutils.listener.wait(sys.stdin, sys.stdout)

        if headers.get("eventname") != "PROCESS_STATE_FATAL":
            childutils.listener.ok(sys.stdout)
            continue

        process = childutils.get_headers(payload).get("processname", "unknown")
        sys.stderr.write(f"[quit-on-fatal] {process} could not be started, stopping the container\n")
        sys.stderr.flush()

        childutils.listener.ok(sys.stdout)

        try:
            childutils.getRPCInterface(os.environ).supervisor.shutdown()
        except Exception:  # supervisor is already going down, nothing left to do
            return


if __name__ == "__main__":
    main()
