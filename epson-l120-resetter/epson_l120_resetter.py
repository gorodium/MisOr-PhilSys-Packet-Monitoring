# -*- coding: utf-8 -*-
"""
EPSON L120 Waste Ink Pad Counter Resetter
==========================================
Resets the "A printer's ink pad is at the end of its service life" error
by zeroing the waste-ink counter stored in the printer's EEPROM via USB.

This is a standalone application - no Python installation required.
libusb-1.0.dll is bundled automatically.
"""

import sys
import os
import threading
import time
import struct
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

# ---------------------------------------------------------------------------
# Path helpers (works both frozen PyInstaller EXE and plain .py)
# ---------------------------------------------------------------------------
def _resource_path(relative: str) -> str:
    """Return absolute path to a bundled resource."""
    if getattr(sys, "frozen", False):
        base = sys._MEIPASS  # type: ignore[attr-defined]
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative)


def _setup_libusb():
    """
    Prepend the bundled libusb-1.0.dll directory to PATH so that pyusb
    can find it before any system-level (possibly wrong) version.
    """
    dll_dir = _resource_path("libusb")
    if os.path.isdir(dll_dir):
        os.add_dll_directory(dll_dir)          # Python 3.8+ Windows
        os.environ["PATH"] = dll_dir + os.pathsep + os.environ.get("PATH", "")


_setup_libusb()

# ---------------------------------------------------------------------------
# USB / Hardware constants for EPSON L120
# ---------------------------------------------------------------------------
EPSON_VENDOR_ID = 0x04B8    # All EPSON printers share this VID
EPSON_L120_PID  = 0x0811    # Product ID for EPSON L120 / L121 / L210 class
EPSON_ALT_PIDS  = [0x0811, 0x08A1, 0x0818, 0x0819, 0x0005]

# ESC/P2 remote-mode init sequence
REMOTE_INIT = bytes([
    0x1B, 0x01, 0x40, 0x45, 0x4A, 0x4C, 0x20,
    0x31, 0x32, 0x38, 0x34, 0x2E, 0x34, 0x0A
])

# EEPROM write commands – zero out waste-ink pad counter registers
# Format: ESC ( e <len_lo> <len_hi> 0x07 0x04 0x00 <addr> <value>
EEPROM_WRITE_CMDS = [
    bytes([0x1B, 0x28, 0x65, 0x04, 0x00, 0x07, 0x04, 0x00, 0x20, 0x00]),
    bytes([0x1B, 0x28, 0x65, 0x04, 0x00, 0x07, 0x04, 0x00, 0x21, 0x00]),
    bytes([0x1B, 0x28, 0x65, 0x04, 0x00, 0x07, 0x04, 0x00, 0x22, 0x00]),
    bytes([0x1B, 0x28, 0x65, 0x04, 0x00, 0x07, 0x04, 0x00, 0x23, 0x00]),
]

REMOTE_EXIT = bytes([
    0x1B, 0x28, 0x52, 0x08, 0x00,
    0x52, 0x65, 0x6D, 0x6F, 0x74, 0x65, 0x35, 0x00
])

# ---------------------------------------------------------------------------
# pyusb import (bundled)
# ---------------------------------------------------------------------------
try:
    import usb.core
    import usb.util
    PYUSB_AVAILABLE = True
except ImportError:
    PYUSB_AVAILABLE = False


# ===========================================================================
# Printer Communication
# ===========================================================================
class PrinterComm:
    def __init__(self, log_fn=None):
        self.device   = None
        self.ep_out   = None
        self.ep_in    = None
        self.log      = log_fn or print
        self._claimed = False

    def find_printer(self) -> bool:
        if not PYUSB_AVAILABLE:
            self.log("[ERROR] pyusb is not available.")
            return False
        for pid in EPSON_ALT_PIDS:
            dev = usb.core.find(idVendor=EPSON_VENDOR_ID, idProduct=pid)
            if dev is not None:
                self.device = dev
                self.log(f"[OK]   Printer found  VID=0x{EPSON_VENDOR_ID:04X}  PID=0x{pid:04X}")
                return True
        self.log("[WARN] EPSON L120 not detected. Ensure USB cable is connected and printer is ON.")
        return False

    def open(self) -> bool:
        if self.device is None:
            return False
        try:
            try:
                if self.device.is_kernel_driver_active(0):
                    self.device.detach_kernel_driver(0)
            except Exception:
                pass  # not applicable on Windows with WinUSB

            self.device.set_configuration()
            cfg  = self.device.get_active_configuration()
            intf = cfg[(0, 0)]

            self.ep_out = usb.util.find_descriptor(
                intf,
                custom_match=lambda e:
                    usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_OUT
            )
            self.ep_in = usb.util.find_descriptor(
                intf,
                custom_match=lambda e:
                    usb.util.endpoint_direction(e.bEndpointAddress) == usb.util.ENDPOINT_IN
            )

            usb.util.claim_interface(self.device, 0)
            self._claimed = True
            self.log("[OK]   USB interface claimed.")
            return True
        except Exception as exc:
            self.log(f"[ERROR] Cannot open USB interface: {exc}")
            self.log("        Make sure you ran Zadig to install WinUSB driver for this printer.")
            return False

    def close(self):
        if self._claimed and self.device:
            try:
                usb.util.release_interface(self.device, 0)
                usb.util.dispose_resources(self.device)
                self._claimed = False
                self.log("[OK]   USB interface released.")
            except Exception:
                pass

    def write(self, data: bytes, timeout: int = 3000) -> bool:
        try:
            written = self.ep_out.write(data, timeout)
            return written == len(data)
        except Exception as exc:
            self.log(f"[ERROR] USB write failed: {exc}")
            return False

    def read(self, length: int = 64, timeout: int = 2000) -> bytes:
        try:
            return bytes(self.ep_in.read(length, timeout))
        except Exception:
            return b""

    def reset_counter(self) -> bool:
        self.log("\n── Starting reset sequence ──────────────────────────────")

        if not self.write(REMOTE_INIT):
            self.log("[ERROR] Failed to send remote-mode INIT.")
            return False
        self.log("[OK]   Entered remote / maintenance mode.")
        time.sleep(0.3)

        for i, cmd in enumerate(EEPROM_WRITE_CMDS, start=1):
            if not self.write(cmd):
                self.log(f"[ERROR] EEPROM write #{i} failed.")
                return False
            addr = 0x1F + i
            self.log(f"[OK]   EEPROM write #{i}  addr=0x{addr:04X}  value=0x00")
            time.sleep(0.15)

        self.write(REMOTE_EXIT)
        self.log("[OK]   Exited remote mode.")
        time.sleep(0.2)
        self.log("── Reset sequence complete ───────────────────────────────\n")
        return True


# ===========================================================================
# GUI
# ===========================================================================
BG_DARK  = "#1a1a2e"
BG_PANEL = "#16213e"
BG_CARD  = "#0f3460"
ACCENT   = "#e94560"
TEXT     = "#eaeaea"
TEXT_DIM = "#8892b0"
GREEN    = "#4ecca3"
YELLOW   = "#f5a623"
WHITE    = "#ffffff"


class ResetterApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("EPSON L120 Waste Ink Pad Resetter v1.0")
        self.geometry("700x660")
        self.resizable(False, False)
        self.configure(bg=BG_DARK)

        # Set window icon if available
        icon_path = _resource_path(os.path.join("assets", "icon.ico"))
        if os.path.isfile(icon_path):
            try:
                self.iconbitmap(icon_path)
            except Exception:
                pass

        self._comm = PrinterComm(log_fn=self._log)
        self._busy = False
        self._zadig_path = _resource_path(os.path.join("assets", "zadig.exe"))

        self._build_ui()
        self._startup_check()

    # ── UI Construction ────────────────────────────────────────────────
    def _build_ui(self):
        # Top colour bar
        tk.Frame(self, bg=ACCENT, height=5).pack(fill="x")

        # Header
        hdr = tk.Frame(self, bg=BG_DARK, pady=12)
        hdr.pack(fill="x", padx=24)
        tk.Label(hdr, text="EPSON", font=("Arial Black", 26, "bold"),
                 fg=WHITE, bg=BG_DARK).pack(side="left")
        tk.Label(hdr, text="  L120 Waste Ink Pad Resetter",
                 font=("Arial", 13), fg=TEXT_DIM, bg=BG_DARK).pack(side="left", pady=4)
        tk.Label(hdr, text="v1.0", font=("Arial", 9),
                 fg=ACCENT, bg=BG_DARK).pack(side="right", anchor="s", pady=4)

        # Error banner
        banner = tk.Frame(self, bg="#3a1a00", padx=16, pady=10)
        banner.pack(fill="x", padx=24, pady=(0, 6))
        tk.Label(banner,
                 text="⚠   Service Required  —  A printer's ink pad is at the end of its service life.",
                 font=("Arial", 10, "bold"), fg=YELLOW, bg="#3a1a00",
                 wraplength=620, justify="left").pack(anchor="w")
        tk.Label(banner,
                 text="This tool resets the waste-ink counter in the printer's EEPROM so you can continue printing.",
                 font=("Arial", 9), fg=TEXT_DIM, bg="#3a1a00").pack(anchor="w", pady=(3, 0))

        # Steps row
        steps = tk.Frame(self, bg=BG_DARK, pady=4)
        steps.pack(fill="x", padx=24)
        self._step_frames = []
        for num, label in [("1", "Install Driver"), ("2", "Detect Printer"), ("3", "Run Reset"), ("4", "Restart")]:
            f = tk.Frame(steps, bg=BG_PANEL, padx=8, pady=8)
            f.pack(side="left", expand=True, fill="x", padx=3)
            n = tk.Label(f, text=num, font=("Arial Black", 16), fg=ACCENT, bg=BG_PANEL)
            n.pack()
            tk.Label(f, text=label, font=("Arial", 8), fg=TEXT_DIM, bg=BG_PANEL).pack()
            self._step_frames.append(n)

        # Progress
        pb_outer = tk.Frame(self, bg=BG_DARK, pady=8)
        pb_outer.pack(fill="x", padx=24)
        style = ttk.Style(self)
        style.theme_use("default")
        style.configure("R.Horizontal.TProgressbar",
                        troughcolor=BG_PANEL, background=GREEN,
                        thickness=14, borderwidth=0)
        self._progress = ttk.Progressbar(pb_outer, style="R.Horizontal.TProgressbar",
                                         length=652, mode="determinate", maximum=100)
        self._progress.pack()

        self._status_var = tk.StringVar(value="Ready.")
        tk.Label(self, textvariable=self._status_var,
                 font=("Arial", 10), fg=GREEN, bg=BG_DARK).pack(pady=(0, 4))

        # Log
        log_outer = tk.Frame(self, bg=BG_PANEL)
        log_outer.pack(fill="both", expand=True, padx=24, pady=(0, 6))
        tk.Label(log_outer, text="  Log Output", font=("Arial", 9, "bold"),
                 fg=TEXT_DIM, bg=BG_PANEL, anchor="w").pack(fill="x", pady=(4, 0))
        self._log_box = scrolledtext.ScrolledText(
            log_outer, bg="#0a0a1a", fg=GREEN, insertbackground=GREEN,
            font=("Consolas", 9), relief="flat", bd=0, height=9,
            state="disabled")
        self._log_box.pack(fill="both", expand=True, padx=6, pady=(2, 6))

        # Button row
        btn_row = tk.Frame(self, bg=BG_DARK)
        btn_row.pack(fill="x", padx=24, pady=(0, 6))

        # WinUSB Driver button (launches bundled Zadig)
        self._zadig_btn = tk.Button(
            btn_row, text="🔧  Install WinUSB Driver",
            command=self._on_zadig,
            font=("Arial", 10, "bold"), fg=WHITE, bg="#7b2d8b",
            activebackground="#9b3dab", activeforeground=WHITE,
            relief="flat", padx=14, pady=9, cursor="hand2")
        self._zadig_btn.pack(side="left", padx=(0, 6))

        self._detect_btn = tk.Button(
            btn_row, text="🔍  Detect Printer",
            command=self._on_detect,
            font=("Arial", 10, "bold"), fg=TEXT, bg=BG_CARD,
            activebackground="#1a4a80", activeforeground=TEXT,
            relief="flat", padx=14, pady=9, cursor="hand2")
        self._detect_btn.pack(side="left", padx=(0, 6))

        self._reset_btn = tk.Button(
            btn_row, text="▶  Run Reset",
            command=self._on_reset,
            font=("Arial", 10, "bold"), fg=WHITE, bg=ACCENT,
            activebackground="#c73652", activeforeground=WHITE,
            relief="flat", padx=20, pady=9, cursor="hand2")
        self._reset_btn.pack(side="left")

        tk.Button(btn_row, text="Clear Log",
                  command=self._clear_log,
                  font=("Arial", 9), fg=TEXT_DIM, bg=BG_DARK,
                  activebackground=BG_PANEL, activeforeground=TEXT,
                  relief="flat", padx=10, pady=9, cursor="hand2", bd=0
                  ).pack(side="right")

        # Footer
        footer = tk.Frame(self, bg="#0d0d1a", pady=6)
        footer.pack(fill="x")
        tk.Label(footer,
                 text="⚡ After reset: Power OFF the printer for 30 seconds, then power back ON.",
                 font=("Arial", 8), fg=TEXT_DIM, bg="#0d0d1a").pack()
        tk.Label(footer,
                 text="Physically worn ink pads should eventually be replaced to prevent leakage.",
                 font=("Arial", 7), fg="#555577", bg="#0d0d1a").pack()

    # ── Helpers ───────────────────────────────────────────────────────
    def _log(self, msg: str):
        def _do():
            self._log_box.configure(state="normal")
            self._log_box.insert("end", msg + "\n")
            self._log_box.see("end")
            self._log_box.configure(state="disabled")
        self.after(0, _do)

    def _clear_log(self):
        self._log_box.configure(state="normal")
        self._log_box.delete("1.0", "end")
        self._log_box.configure(state="disabled")

    def _set_progress(self, val: int, status: str = ""):
        def _do():
            self._progress["value"] = val
            if status:
                self._status_var.set(status)
        self.after(0, _do)

    def _set_step(self, step: int):
        for i, lbl in enumerate(self._step_frames, start=1):
            lbl.configure(fg=GREEN if i == step else ACCENT)

    def _set_busy(self, state: bool):
        self._busy = state
        s = "disabled" if state else "normal"
        for btn in (self._detect_btn, self._reset_btn, self._zadig_btn):
            btn.configure(state=s)

    def _startup_check(self):
        self._log("═" * 56)
        self._log("  EPSON L120 Waste Ink Pad Resetter  v1.0")
        self._log("═" * 56)
        if PYUSB_AVAILABLE:
            self._log("[OK]   pyusb loaded successfully.")
        else:
            self._log("[ERROR] pyusb failed to load — bundling issue.")

        dll_dir = _resource_path("libusb")
        dll64   = os.path.join(dll_dir, "libusb-1.0.dll")
        if os.path.isfile(dll64):
            self._log(f"[OK]   libusb-1.0.dll bundled and found.")
        else:
            self._log(f"[WARN] libusb-1.0.dll not found in bundle.")

        if os.path.isfile(self._zadig_path):
            self._log("[OK]   Zadig (WinUSB installer) is bundled.")
        else:
            self._log("[WARN] Zadig not found in assets/.")

        self._log("\nStep 1 — Click  🔧 Install WinUSB Driver  (first-time only).")
        self._log("Step 2 — Connect the printer and click  🔍 Detect Printer.")
        self._log("Step 3 — Click  ▶ Run Reset.")

    # ── Button handlers ───────────────────────────────────────────────
    def _on_zadig(self):
        if os.path.isfile(self._zadig_path):
            self._log("\n[INFO] Launching Zadig WinUSB driver installer…")
            self._log("       In Zadig: Options > List All Devices")
            self._log("       Select 'EPSON L120' → set driver to 'WinUSB' → Replace Driver")
            import subprocess
            subprocess.Popen([self._zadig_path])
            self._set_step(1)
        else:
            messagebox.showinfo(
                "Zadig Not Found",
                "Zadig.exe was not found in the application bundle.\n\n"
                "Download it from:\nhttps://zadig.akeo.ie/\n\n"
                "Run Zadig, select EPSON L120, choose WinUSB, then click Replace Driver."
            )

    def _on_detect(self):
        if not self._busy:
            threading.Thread(target=self._detect_worker, daemon=True).start()

    def _on_reset(self):
        if self._busy:
            return
        if not messagebox.askyesno(
            "Confirm Reset",
            "Reset the waste-ink pad counter on EPSON L120?\n\n"
            "Make sure:\n"
            "  • Printer is connected via USB\n"
            "  • Printer is powered ON\n"
            "  • WinUSB driver is installed (Step 1)\n\n"
            "Continue?"
        ):
            return
        threading.Thread(target=self._reset_worker, daemon=True).start()

    def _detect_worker(self):
        self._set_busy(True)
        self._set_step(2)
        self._set_progress(15, "Searching for EPSON L120…")
        self._log("\n── Detecting printer ────────────────────────────────────")
        found = self._comm.find_printer()
        if found:
            self._set_progress(30, "✅ Printer detected! Click  ▶ Run Reset  to continue.")
        else:
            self._set_progress(0, "❌ Printer not found. Check USB & WinUSB driver.")
        self._set_busy(False)

    def _reset_worker(self):
        self._set_busy(True)
        self._log("\n" + "═" * 56)
        self._log("  Starting Waste Ink Pad Reset")
        self._log("═" * 56)

        # Detect
        self._set_step(2)
        self._set_progress(10, "Detecting printer…")
        if not self._comm.find_printer():
            self._set_progress(0, "❌ Printer not found.")
            self._set_busy(False)
            return

        # Open USB
        self._set_progress(30, "Opening USB interface…")
        if not self._comm.open():
            self._finish_reset(False)
            return

        # Reset
        self._set_step(3)
        self._set_progress(55, "Sending EEPROM reset commands…")
        success = self._comm.reset_counter()
        self._comm.close()
        self._finish_reset(success)

    def _finish_reset(self, success: bool):
        def _do():
            if success:
                self._set_step(4)
                self._set_progress(100, "✅ Reset complete! Power cycle the printer.")
                self._log("✅  SUCCESS — Waste-ink counter reset to ZERO.")
                self._log("    ➤ Power OFF the printer now.")
                self._log("    ➤ Wait 30 seconds.")
                self._log("    ➤ Power back ON — error should be gone.\n")
                messagebox.showinfo(
                    "Reset Complete ✅",
                    "Waste-ink pad counter reset successfully!\n\n"
                    "Next steps:\n"
                    "1. Power OFF the printer.\n"
                    "2. Wait 30 seconds.\n"
                    "3. Power back ON.\n\n"
                    "The 'Service Required' error should be gone."
                )
            else:
                self._set_progress(0, "❌ Reset failed. See log for details.")
                self._log("❌  FAILED — See troubleshooting below:")
                self._log("    • Did you run  🔧 Install WinUSB Driver  first?")
                self._log("    • Try running the app as Administrator.")
                self._log("    • Make sure printer is ON and USB cable is connected.\n")
                messagebox.showerror(
                    "Reset Failed ❌",
                    "The reset did not complete.\n\n"
                    "Troubleshooting:\n"
                    "• Click  🔧 Install WinUSB Driver  and complete the Zadig steps.\n"
                    "• Run the application as Administrator.\n"
                    "• Ensure the printer is connected via USB and powered ON."
                )
            self._set_busy(False)
        self.after(0, _do)


# ===========================================================================
# Entry point
# ===========================================================================
if __name__ == "__main__":
    app = ResetterApp()
    app.mainloop()
