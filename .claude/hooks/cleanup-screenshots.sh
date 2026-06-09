#!/bin/bash
# Cleanup debug screenshots from /tmp after every Bash command
find /tmp -maxdepth 1 -name "*.png" -delete 2>/dev/null
exit 0