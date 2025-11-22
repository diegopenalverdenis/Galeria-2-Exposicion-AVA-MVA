@echo off
cd /d "C:\Users\diego\Documents\DESIGN\Museo de la Acuarela-Capsulas\MVA_EXPO-AVA\Capsula Expo AVA-Proyecto\Expo-AVA-Capsula-test1-11-19-25\Expo-AVA-Test 1\app-files"
start "" python -m http.server 8000
timeout /t 2 >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito --new-window "http://localhost:8000/index.html"
pause

