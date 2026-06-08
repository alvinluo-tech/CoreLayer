!macro NSIS_HOOK_PREINSTALL
  # Force kill any running instances of the app and daemon before installing new files
  nsExec::Exec 'taskkill /F /IM jarvis-app.exe'
  nsExec::Exec 'taskkill /F /IM Jarvis.exe'
  nsExec::Exec 'taskkill /F /IM jarvis-daemon.exe'
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  # Force kill any running instances of the app and daemon before uninstalling files
  nsExec::Exec 'taskkill /F /IM jarvis-app.exe'
  nsExec::Exec 'taskkill /F /IM Jarvis.exe'
  nsExec::Exec 'taskkill /F /IM jarvis-daemon.exe'
  Sleep 1000
!macroend
