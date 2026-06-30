#define MyAppName "YANLC Print Agent"
#define MyAppVersion "1.0.0"
#ifndef SourceDir
  #error SourceDir is required
#endif
#ifndef OutputDir
  #error OutputDir is required
#endif

[Setup]
AppId={{7A7506FB-84E8-46F8-B8CB-F50DD0D03B60}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=YANLC
DefaultDirName={autopf}\YANLCPrintAgent
DefaultGroupName=YANLC Print Agent
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=YANLCPrintAgentSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\YANLCPrintAgent.exe

[Files]
Source: "{#SourceDir}\YANLCPrintAgent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\config.example.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\README.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\setup.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\start.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\test-print.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\list-printers.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\install-startup.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\uninstall-startup.cmd"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\install-mode.json"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\YANLCPrintAgent"
Name: "{commonappdata}\YANLCPrintAgent\logs"

[Icons]
Name: "{autodesktop}\YANLC 打印助手"; Filename: "{app}\YANLCPrintAgent.exe"; WorkingDir: "{app}"
Name: "{group}\YANLC 打印助手"; Filename: "{app}\YANLCPrintAgent.exe"; WorkingDir: "{app}"
Name: "{group}\YANLC 打印助手设置"; Filename: "{app}\YANLCPrintAgent.exe"; Parameters: "--setup-ui"; WorkingDir: "{app}"
Name: "{group}\YANLC 测试打印"; Filename: "{app}\YANLCPrintAgent.exe"; Parameters: "--test-print"; WorkingDir: "{app}"
Name: "{group}\YANLC 查看打印机"; Filename: "{app}\YANLCPrintAgent.exe"; Parameters: "--list-printers"; WorkingDir: "{app}"
Name: "{group}\取消开机自启"; Filename: "{app}\YANLCPrintAgent.exe"; Parameters: "--uninstall-startup"; WorkingDir: "{app}"

[Run]
Filename: "{app}\YANLCPrintAgent.exe"; Parameters: "--setup-ui"; Description: "运行配置向导"; Flags: postinstall skipifsilent nowait
Filename: "{app}\YANLCPrintAgent.exe"; Description: "启动打印助手"; Flags: postinstall skipifsilent nowait unchecked

[UninstallRun]
Filename: "{app}\YANLCPrintAgent.exe"; Parameters: "--uninstall-startup"; Flags: runhidden waituntilterminated
