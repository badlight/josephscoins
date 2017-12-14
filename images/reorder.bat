for /f %%f in ('dir /b %cd%') do (
	echo %%f
	move /y %%f %%~nf\
)
pause