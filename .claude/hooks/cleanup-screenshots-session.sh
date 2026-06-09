#!/bin/bash
# Cleanup screenshots saved to the session subdirectory when the session ends.
# These live in /tmp/shots (outside the per-Bash hook's maxdepth-1 sweep) so
# they survive long enough to be read during the session, then get removed here.
rm -rf /tmp/shots 2>/dev/null
exit 0
