@echo off
cd /d "%~dp0"
if "%~1"=="" (
 echo Close POS first. Drag your trusted .dump file onto Restore.cmd.
 echo Keep the matching .dump.json file beside the backup.
 pause
 exit /b 1
)
node scripts\shop\cli.mjs restore "%~1"
pause
