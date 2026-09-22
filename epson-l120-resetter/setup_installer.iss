; ============================================================
;  EPSON L120 Waste Ink Pad Resetter — Inno Setup Script
;  Compile with: Inno Setup Compiler (free, https://jrsoftware.org/isinfo.php)
; ============================================================

#define MyAppName        "EPSON L120 Waste Ink Resetter"
#define MyAppVersion     "1.0"
#define MyAppPublisher   "EPSON L120 Resetter"
#define MyAppExeName     "EPSON_L120_Resetter.exe"
#define MyOutputName     "EPSON_L120_Resetter_Setup"

[Setup]
AppId={{A3F1B2C4-9D5E-4F6A-B7C8-D9E0F1A2B3C4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\EPSON L120 Resetter
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=installer_output
OutputBaseFilename={#MyOutputName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible

; Installer visual settings
WizardImageFile=assets\wizard_banner.bmp
WizardSmallImageFile=assets\wizard_small.bmp
WizardImageStretch=no
WizardSizePercent=120

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";    Description: "Create a &desktop shortcut";      GroupDescription: "Additional icons:"; Flags: unchecked
Name: "quicklaunchicon"; Description: "Create a &Quick Launch shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; Main application EXE (standalone — no Python needed)
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

; README / documentation
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu
Name: "{group}\{#MyAppName}";             Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}";   Filename: "{uninstallexe}"

; Desktop (optional)
Name: "{autodesktop}\{#MyAppName}";       Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Offer to launch the app after install
Filename: "{app}\{#MyAppExeName}";  \
    Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; \
    Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
// ── Pre-install check: warn if printer not connected ──────────────
function InitializeSetup(): Boolean;
begin
  Result := True;
  MsgBox(
    'Welcome to the EPSON L120 Waste Ink Pad Resetter Setup!' + #13#10 + #13#10 +
    'This installer will set up the resetter application.' + #13#10 + #13#10 +
    'IMPORTANT: After installation, you must:' + #13#10 +
    '  1. Click "Install WinUSB Driver" inside the app.' + #13#10 +
    '  2. Follow the Zadig instructions to replace the' + #13#10 +
    '     EPSON USB driver with WinUSB (one-time setup).' + #13#10 + #13#10 +
    'Click OK to continue.',
    mbInformation, MB_OK
  );
end;
