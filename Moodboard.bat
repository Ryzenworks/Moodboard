@echo off
title Moodboard Server
echo Starting Moodboard...
start "" "http://localhost:3333"
python -m http.server 3333 --directory "%~dp0"
