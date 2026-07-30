@echo off
echo Amending previous commit to remove accidentally staged secrets...
git add .
git commit --amend --no-edit
git push
echo.
echo Push complete! Vercel should now be building your updates.
pause
