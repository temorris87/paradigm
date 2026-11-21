#!/usr/bin/python3
"""Start Paradigm with no console window: double-click this file on Windows.

Windows runs .pyw files with pythonw.exe, which opens no window: only the browser tab
appears, and closing the last tab stops the server. Errors at startup show in a message
box and go to paradigm.log in the data folder. Use paradigm.py to see the console.
"""
import sys

from paradigm.app import main

if __name__ == "__main__":
    sys.exit(main(console=False))
