# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['epson_l120_resetter.py'],
    pathex=[],
    binaries=[('assets\\libusb\\libusb-1.0.dll', 'libusb')],
    datas=[('assets\\icon.ico', 'assets'), ('assets\\wizard_banner.bmp', 'assets')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='EPSON_L120_Resetter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    version='file_version_info.txt',
    uac_admin=True,
    icon=['assets\\icon.ico'],
)
