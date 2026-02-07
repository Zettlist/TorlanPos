Set WshShell = CreateObject("WScript.Shell")
Set Shortcut = WshShell.CreateShortcut(WshShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\Desktop\Torlan POS - Antigravity.lnk")
Shortcut.TargetPath = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Antigravity\Antigravity.exe"
Shortcut.Arguments = """" & WshShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\Desktop\pos torlan"""
Shortcut.WorkingDirectory = WshShell.ExpandEnvironmentStrings("%USERPROFILE%") & "\Desktop\pos torlan"
Shortcut.IconLocation = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\Antigravity\Antigravity.exe,0"
Shortcut.Description = "Abrir Torlan POS en Antigravity"
Shortcut.Save
WScript.Echo "Acceso directo de Antigravity creado exitosamente!"
