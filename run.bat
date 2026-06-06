@echo off
title RIFT World Flythrough
echo Starting RIFT World Flythrough...
echo.
echo Server: http://localhost:8000/flythrough.html
echo Press Ctrl+C to stop
echo.
start "" http://localhost:8000/flythrough.html
python -m http.server 8000 --bind 127.0.0.1
