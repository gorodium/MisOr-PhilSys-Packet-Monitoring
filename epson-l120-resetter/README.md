# EPSON L120 Waste Ink Pad Counter Resetter

A Python GUI tool to fix the **"A printer's ink pad is at the end of its service life"** error on the EPSON L120.

---

## How It Works

The EPSON L120 keeps a **waste-ink counter** in its internal EEPROM. When this counter reaches its limit, the printer locks itself and shows the **"Service Required"** error. This tool communicates directly with the printer over USB to write `0x00` back to those EEPROM addresses, effectively resetting the counter to zero.

---

## Requirements

| Requirement | Details |
|---|---|
| **Python** | 3.8 or later — [python.org](https://python.org) |
| **pyusb** | `pip install pyusb` |
| **libusb** | Installed via Zadig on Windows (see below) |
| **OS** | Windows 10/11 (64-bit recommended) |

---

## Quick Start

### Step 1 — Install dependencies
Double-click **`setup.bat`**. It will:
- Check your Python installation.
- Install `pyusb` automatically.
- Print instructions for the Zadig step.

### Step 2 — Install the WinUSB driver via Zadig (Windows-only, one-time)

> [!IMPORTANT]
> On Windows, Python cannot talk to USB printers without replacing the EPSON USB driver with **WinUSB**. This change is reversible.

1. Download **Zadig** from [https://zadig.akeo.ie/](https://zadig.akeo.ie/)
2. Run Zadig **as Administrator**.
3. Click **Options ▸ List All Devices**.
4. From the drop-down, select **"EPSON L120"** (or "USB Printing Support").
5. On the right side, set the driver to **WinUSB**.
6. Click **Replace Driver** and wait.

### Step 3 — Run the Resetter
Double-click **`run_resetter.bat`** (auto-elevates to Administrator).

---

## Step-by-Step Reset Procedure

```
1. Make sure the printer is ON and connected via USB.
2. Click  🔍 Detect Printer  — confirm it is found.
3. Click  ▶ Run Reset  — confirm the dialog.
4. Wait for the progress bar to reach 100 %.
5. Power OFF the printer.
6. Wait 30 seconds.
7. Power the printer back ON.
```

The **"Service Required"** error should be gone. ✅

---

## Reverting the Driver (Optional)

If you need to print normally from other applications after resetting:

1. Open **Device Manager** (`Win + X → Device Manager`).
2. Under **Universal Serial Bus devices**, find **EPSON L120 (WinUSB)**.
3. Right-click → **Uninstall device** (check "Delete the driver software").
4. Unplug and replug the printer — Windows will reinstall the original EPSON driver.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Printer not detected | Make sure USB is connected & printer is ON. Try a different USB port. |
| `[ERROR] Could not open USB interface` | Run `run_resetter.bat` **as Administrator**. Make sure Zadig WinUSB was applied. |
| `pyusb not installed` | Run `setup.bat` or manually: `pip install pyusb` |
| Reset seems to work but error persists | Try the reset a second time. Some units need 2 passes. |
| Need to print after resetting | Re-install the original EPSON driver via Device Manager (see above). |

---

## File Structure

```
epson-l120-resetter/
├── epson_l120_resetter.py   ← Main application (GUI + USB logic)
├── setup.bat                ← One-click dependency installer
├── run_resetter.bat         ← One-click launcher (auto Admin)
└── README.md                ← This file
```

---

> **Disclaimer:** This tool is provided as-is for educational purposes.
> Physically worn-out ink pads should still be replaced to prevent ink leakage.
> Resetting only resets the software counter — it does not restore the physical absorber pad.
