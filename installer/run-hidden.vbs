' Launches a single .bat file path as a fully hidden process - no console
' window at all, not even briefly. Used instead of
' `powershell.exe -WindowStyle Hidden` for backgrounding the server, Ollama,
' the tray helper, and the Ollama model pull (see start-adhdisplay.bat and
' adhdisplay.iss) because powershell.exe's own console host can still flash
' visible for a moment before the hidden style takes effect;
' WScript.Shell.Run's hidden window style (0) is honored at process creation,
' so it never shows anything at all.
'
' Deliberately takes only a plain file path, not an arbitrary command line
' with its own redirection/arguments - passing a compound command (e.g. one
' containing `>>`) through cmd.exe's own argv-construction for launching
' wscript.exe, then through WScript.Arguments' quote-stripping, then back out
' through WshShell.Run, is exactly the kind of multi-layer quoting that's
' fragile and easy to get subtly wrong. Callers that need a compound command
' (start the server, pull Ollama models, etc.) put it in its own tiny .bat
' file instead (see launch-server.bat, launch-ollama.bat, launch-tray.bat,
' pull-ollama-models.bat) and pass just that file's path here.
'
' Usage: wscript.exe //B run-hidden.vbs "<path to a .bat file>"
'
' Known future-migration note: Microsoft has been moving VBScript toward an
' opt-in/deprecated status in recent Windows releases. This script is the one
' place that dependency is load-bearing across the launcher; a small compiled
' .exe shim would be the eventual replacement if VBScript stops being
' available by default.

Set objShell = CreateObject("WScript.Shell")
objShell.Run Chr(34) & WScript.Arguments(0) & Chr(34), 0, False
